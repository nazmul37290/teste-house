import {
  calculateOrderTotals,
  checkBdAddress,
  formatPaisa,
  isPlaceholderEmail,
  parsePaisa,
  readPaymentMethodConfig,
  type CheckoutQuoteInput,
  type CreateOrderInput,
  type Paisa,
  type PricingCoupon,
  type PricingResult,
} from '@shop/shared';
import type { Deps } from '../deps';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { isUniqueViolation } from '../lib/prisma-errors';
import type { CustomerContext } from '../middleware/require-customer';
import { queueRevalidate } from '../middleware/revalidate-after-write';
import { changeStock } from '../repositories/inventory.repository';
import { findSettingValue } from '../repositories/settings.repository';
import { enqueueEmail } from './email.service';
import { afterStockChange } from './inventory.service';
import { businessRule } from './role.service';

/**
 * Checkout quote and order placement (docs/database.md section 5, docs/pricing.md). The client sends
 * intent only; every amount comes from the database and calculateOrderTotals(). The quote and the
 * order run the same code, so what the customer is shown is what the order computes.
 */

export type OrderDeps = Pick<
  Deps,
  'prisma' | 'redis' | 'env' | 'emailQueue' | 'revalidateQueue' | 'publicMediaUrl'
>;
type Tx = Prisma.TransactionClient;

/** Cash on Delivery with scope DHAKA_ONLY is offered only in this zone (seeded code). */
export const INSIDE_DHAKA_ZONE_CODE = 'inside-dhaka';
/** Methods checkout can take today; UDDOKTAPAY joins when its adapter exists (Phase 7). */
export const CHECKOUT_METHOD_CODES = ['COD'];

const paisaOf = (d: { toFixed(n: number): string }) => parsePaisa(d.toFixed(2));
const money = (p: Paisa) => formatPaisa(p);

// Lines ------------------------------------------------------------------------------------------

async function loadLines(db: Tx, items: { variantId: string; quantity: number }[]) {
  const variants = await db.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      salePrice: true,
      stockQty: true,
      isActive: true,
      weightGrams: true,
      product: {
        select: {
          id: true,
          name: true,
          status: true,
          deletedAt: true,
          images: {
            where: { isPrimary: true },
            take: 1,
            select: { media: { select: { path: true } } },
          },
        },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const unavailable = items.filter((i) => {
    const v = byId.get(i.variantId);
    return !v || !v.isActive || v.product.status !== 'ACTIVE' || v.product.deletedAt !== null;
  });
  if (unavailable.length) {
    throw new AppError('BUSINESS_RULE', 'Some items are no longer available', [
      { reason: 'UNAVAILABLE', variantIds: unavailable.map((i) => i.variantId) },
    ]);
  }
  const short = items.filter((i) => byId.get(i.variantId)!.stockQty < i.quantity);
  if (short.length) throw outOfStock(short.map((i) => i.variantId));
  return items.map((i) => ({ ...i, variant: byId.get(i.variantId)! }));
}
type Line = Awaited<ReturnType<typeof loadLines>>[number];

function outOfStock(variantIds: string[]) {
  return new AppError('BUSINESS_RULE', 'Some items do not have enough stock', [
    { reason: 'OUT_OF_STOCK', variantIds },
  ]);
}

// Zone -------------------------------------------------------------------------------------------

const zoneSelect = {
  id: true,
  name: true,
  code: true,
  charge: true,
  freeDeliveryThreshold: true,
  estimatedDays: true,
  isActive: true,
} as const;

/**
 * The zone that lists the district, else the default zone. A zone that is turned off means "we do
 * not deliver there": the order is refused (it does not fall back to the default zone).
 */
export async function resolveZone(db: Tx, district: string) {
  const listed = await db.deliveryZone.findFirst({
    where: { districts: { has: district } },
    select: zoneSelect,
  });
  const zone =
    listed ?? (await db.deliveryZone.findFirst({ where: { isDefault: true }, select: zoneSelect }));
  if (!zone || !zone.isActive) {
    throw businessRule(
      'DELIVERY_NOT_AVAILABLE',
      `Sorry, we do not deliver to ${district} right now`,
    );
  }
  return zone;
}
type Zone = Awaited<ReturnType<typeof resolveZone>>;

// Coupon -----------------------------------------------------------------------------------------

type CouponRow = NonNullable<Awaited<ReturnType<typeof findCoupon>>>;

function findCoupon(db: Tx, code: string) {
  return db.coupon.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      type: true,
      value: true,
      minOrderAmount: true,
      maxDiscount: true,
      usageLimit: true,
      perCustomerLimit: true,
      usedCount: true,
      startsAt: true,
      expiresAt: true,
      isActive: true,
    },
  });
}

class CouponProblem extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

/** Checks a coupon against every rule in docs/pricing.md section 3; throws CouponProblem. */
async function checkCoupon(
  db: Tx,
  code: string,
  subtotal: Paisa,
  who: { customerId?: string; phone?: string },
): Promise<CouponRow> {
  const c = await findCoupon(db, code);
  const now = new Date();
  if (!c) throw new CouponProblem('COUPON_NOT_FOUND', 'This coupon code is not valid');
  if (!c.isActive) throw new CouponProblem('COUPON_INACTIVE', 'This coupon is not active');
  if (c.startsAt && c.startsAt > now)
    throw new CouponProblem('COUPON_NOT_STARTED', 'This coupon is not valid yet');
  if (c.expiresAt && c.expiresAt <= now)
    throw new CouponProblem('COUPON_EXPIRED', 'This coupon has expired');
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit)
    throw new CouponProblem('COUPON_USED_UP', 'This coupon has been fully used');
  if (c.minOrderAmount && subtotal < paisaOf(c.minOrderAmount)) {
    const missing = paisaOf(c.minOrderAmount) - subtotal;
    throw new CouponProblem(
      'COUPON_MIN_ORDER',
      `Add products worth Tk ${money(missing)} more to use this coupon`,
    );
  }
  if (c.perCustomerLimit !== null && (who.customerId || who.phone)) {
    const used = await db.couponUsage.count({
      where: {
        couponId: c.id,
        OR: [
          ...(who.phone ? [{ phone: who.phone }] : []),
          ...(who.customerId ? [{ customerId: who.customerId }] : []),
        ],
      },
    });
    if (used >= c.perCustomerLimit)
      throw new CouponProblem('COUPON_LIMIT_REACHED', 'You have already used this coupon');
  }
  return c;
}

const toPricingCoupon = (c: CouponRow): PricingCoupon => ({
  type: c.type,
  value: paisaOf(c.value), // PERCENT: hundredths of a percent (10.00% -> 1000)
  minOrderAmount: c.minOrderAmount ? paisaOf(c.minOrderAmount) : null,
  maxDiscount: c.maxDiscount ? paisaOf(c.maxDiscount) : null,
});

// Payment methods --------------------------------------------------------------------------------

type MethodRow = { id: string; code: string; name: string; isActive: boolean; config: unknown };

/** null when the method may be used for this zone and total, else the reason it may not. */
function methodProblem(
  m: MethodRow,
  zone: Zone,
  grandTotal: Paisa,
): { reason: string; message: string } | null {
  if (!m.isActive || !CHECKOUT_METHOD_CODES.includes(m.code))
    return { reason: 'PAYMENT_METHOD_UNAVAILABLE', message: `${m.name} is not available` };
  const config = readPaymentMethodConfig(m.config);
  if (
    m.code === 'COD' &&
    (config.scope ?? 'DHAKA_ONLY') === 'DHAKA_ONLY' &&
    zone.code !== INSIDE_DHAKA_ZONE_CODE
  )
    return {
      reason: 'COD_NOT_AVAILABLE',
      message: 'Cash on Delivery is available inside Dhaka only',
    };
  if (config.minAmount && grandTotal < parsePaisa(config.minAmount))
    return {
      reason: 'PAYMENT_METHOD_LIMIT',
      message: `${m.name} needs an order of at least Tk ${config.minAmount}`,
    };
  if (config.maxAmount && grandTotal > parsePaisa(config.maxAmount))
    return {
      reason: 'PAYMENT_METHOD_LIMIT',
      message: `${m.name} is available for orders up to Tk ${config.maxAmount}`,
    };
  return null;
}

async function usableMethods(db: Tx, zone: Zone, grandTotal: Paisa) {
  const methods = await db.paymentMethod.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, isActive: true, config: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  return methods
    .filter((m) => !methodProblem(m, zone, grandTotal))
    .map((m) => ({ code: m.code, name: m.name }));
}

// Pricing ----------------------------------------------------------------------------------------

function price(lines: Line[], zone: Zone, coupon: CouponRow | null): PricingResult {
  return calculateOrderTotals({
    items: lines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
      price: paisaOf(l.variant.price),
      salePrice: l.variant.salePrice ? paisaOf(l.variant.salePrice) : null,
    })),
    coupon: coupon ? toPricingCoupon(coupon) : null,
    zone: {
      charge: paisaOf(zone.charge),
      freeDeliveryThreshold: zone.freeDeliveryThreshold
        ? paisaOf(zone.freeDeliveryThreshold)
        : null,
    },
  });
}

const subtotalOf = (lines: Line[]) =>
  lines.reduce((sum, l) => sum + paisaOf(l.variant.salePrice ?? l.variant.price) * l.quantity, 0);

function breakdown(lines: Line[], totals: PricingResult, zone: Zone) {
  return {
    lines: totals.lines.map((t, i) => ({
      variantId: t.variantId,
      productName: lines[i]!.variant.product.name,
      variantName: lines[i]!.variant.name,
      sku: lines[i]!.variant.sku,
      quantity: t.quantity,
      listPrice: money(t.listPrice),
      unitPrice: money(t.unitPrice),
      lineTotal: money(t.lineTotal),
      discountAmount: money(t.discountAmount),
    })),
    subtotal: money(totals.subtotal),
    discountTotal: money(totals.discountTotal),
    deliveryCharge: money(totals.deliveryCharge),
    grandTotal: money(totals.grandTotal),
    zone: {
      name: zone.name,
      charge: zone.charge.toFixed(2),
      freeDeliveryThreshold: zone.freeDeliveryThreshold?.toFixed(2) ?? null,
      estimatedDays: zone.estimatedDays,
    },
  };
}

// Quote ------------------------------------------------------------------------------------------

async function districtFor(
  db: Tx,
  input: { district?: string; addressId?: string },
  customer?: CustomerContext,
) {
  if (input.district) return input.district;
  const address = customer
    ? await db.customerAddress.findFirst({
        where: { id: input.addressId, customerId: customer.id },
        select: { district: true },
      })
    : null;
  if (!address) throw new AppError('NOT_FOUND', 'Address not found');
  return address.district;
}

/**
 * Price preview for checkout. Line and delivery problems are errors (the order would fail); a coupon
 * problem is reported in `coupon` so the rest of the quote still shows.
 */
export async function quote(
  deps: OrderDeps,
  input: CheckoutQuoteInput,
  customer?: CustomerContext,
) {
  const db = deps.prisma;
  const lines = await loadLines(db, input.items);
  const zone = await resolveZone(db, await districtFor(db, input, customer));
  let coupon: CouponRow | null = null;
  let couponInfo: { code: string; applied: boolean; reason?: string; message?: string } | null =
    null;
  if (input.couponCode) {
    try {
      coupon = await checkCoupon(db, input.couponCode, subtotalOf(lines), {
        customerId: customer?.id,
        phone: input.phone ?? customer?.phone,
      });
      couponInfo = { code: coupon.code, applied: true };
    } catch (err) {
      if (!(err instanceof CouponProblem)) throw err;
      couponInfo = {
        code: input.couponCode,
        applied: false,
        reason: err.reason,
        message: err.message,
      };
    }
  }
  const totals = price(lines, zone, coupon);
  return {
    ...breakdown(lines, totals, zone),
    coupon: couponInfo,
    paymentMethods: await usableMethods(db, zone, totals.grandTotal),
  };
}
export type Quote = Awaited<ReturnType<typeof quote>>;

// Place order ------------------------------------------------------------------------------------

export type PlaceOrderContext = {
  customer?: CustomerContext;
  idempotencyKey: string;
  ip?: string;
  userAgent?: string;
  /** The cart to remove the ordered lines from after the order commits. */
  cartId?: string | null;
};

const orderNumberOf = (seq: bigint | number) => `ORD-${String(seq).padStart(6, '0')}`;

async function shippingAddress(db: Tx, input: CreateOrderInput, customer?: CustomerContext) {
  if (input.address) return input.address;
  const saved = customer
    ? await db.customerAddress.findFirst({
        where: { id: input.addressId, customerId: customer.id },
        select: {
          recipientName: true,
          phone: true,
          division: true,
          district: true,
          upazila: true,
          addressLine: true,
          postalCode: true,
        },
      })
    : null;
  if (!saved) throw new AppError('NOT_FOUND', 'Address not found');
  if (!checkBdAddress(saved.division, saved.district, saved.upazila).ok) {
    throw new AppError('VALIDATION_ERROR', 'Please update this saved address', [
      { path: 'addressId', message: 'Division, district or upazila is not valid' },
    ]);
  }
  return {
    ...saved,
    upazila: saved.upazila ?? undefined,
    postalCode: saved.postalCode ?? undefined,
    deliveryNote: undefined,
  };
}

/**
 * Creates the order in one transaction (docs/database.md section 5). Same idempotency key: the
 * original order is returned (`created: false`); the same key with another phone is a conflict.
 */
export async function placeOrder(deps: OrderDeps, ctx: PlaceOrderContext, input: CreateOrderInput) {
  const existing = await findByKey(deps, ctx.idempotencyKey);
  if (existing) return existingOrder(deps, existing, input.contact.phone);

  const customer = ctx.customer;
  const contactEmail =
    input.contact.email ??
    (customer && !isPlaceholderEmail(customer.email) ? customer.email : null);

  let created: { id: string; variantIds: string[] };
  try {
    created = await deps.prisma.$transaction(async (tx) => {
      const address = await shippingAddress(tx, input, customer);
      const lines = await loadLines(tx, input.items);
      const zone = await resolveZone(tx, address.district);

      const method = await tx.paymentMethod.findUnique({
        where: { code: input.paymentMethodCode },
        select: { id: true, code: true, name: true, isActive: true, config: true },
      });
      if (!method) throw businessRule('PAYMENT_METHOD_UNAVAILABLE', 'Choose a payment method');

      let coupon: CouponRow | null = null;
      if (input.couponCode) {
        const found = await findCoupon(tx, input.couponCode);
        if (found) {
          // Serializes orders of this coupon by this phone, so the per-customer limit holds.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${found.id + input.contact.phone}))`;
        }
        try {
          coupon = await checkCoupon(tx, input.couponCode, subtotalOf(lines), {
            customerId: customer?.id,
            phone: input.contact.phone,
          });
        } catch (err) {
          if (err instanceof CouponProblem) throw businessRule(err.reason, err.message);
          throw err;
        }
      }

      const totals = price(lines, zone, coupon);
      const problem = methodProblem(method, zone, totals.grandTotal);
      if (problem) throw businessRule(problem.reason, problem.message);

      if (
        input.expectedGrandTotal !== undefined &&
        parsePaisa(input.expectedGrandTotal) !== totals.grandTotal
      ) {
        const fresh = {
          ...breakdown(lines, totals, zone),
          coupon: coupon ? { code: coupon.code, applied: true } : null,
          paymentMethods: await usableMethods(tx, zone, totals.grandTotal),
        };
        throw new AppError('PRICE_CHANGED', 'Prices have changed. Please check the new total.', [
          { reason: 'PRICE_CHANGED', quote: fresh },
        ]);
      }

      const [next] = await tx.$queryRaw<{ seq: bigint }[]>`
        SELECT nextval(pg_get_serial_sequence('orders', 'orderSeq')) AS seq`;
      const order = await tx.order.create({
        data: {
          orderSeq: Number(next!.seq),
          orderNumber: orderNumberOf(next!.seq),
          customerId: customer?.id ?? null,
          contactName: input.contact.name,
          contactPhone: input.contact.phone,
          contactEmail,
          paymentMethodId: method.id,
          deliveryZoneId: zone.id,
          couponId: coupon?.id ?? null,
          couponCode: coupon?.code ?? null,
          subtotal: money(totals.subtotal),
          discountTotal: money(totals.discountTotal),
          deliveryCharge: money(totals.deliveryCharge),
          grandTotal: money(totals.grandTotal),
          customerNote: input.customerNote ?? null,
          idempotencyKey: ctx.idempotencyKey,
          ipAddress: ctx.ip ?? null,
          userAgent: ctx.userAgent?.slice(0, 500) ?? null,
          address: {
            create: {
              recipientName: address.recipientName,
              phone: address.phone,
              division: address.division,
              district: address.district,
              upazila: address.upazila ?? null,
              addressLine: address.addressLine,
              postalCode: address.postalCode ?? null,
              deliveryNote: address.deliveryNote ?? null,
            },
          },
          items: {
            create: totals.lines.map((t, i) => {
              const v = lines[i]!.variant;
              return {
                variantId: t.variantId,
                productName: v.product.name,
                variantName: v.name,
                sku: v.sku,
                imagePath: v.product.images[0]?.media.path ?? null,
                listPrice: money(t.listPrice),
                unitPrice: money(t.unitPrice),
                quantity: t.quantity,
                lineTotal: money(t.lineTotal),
                discountAmount: money(t.discountAmount),
                weightGrams: v.weightGrams,
              };
            }),
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'PENDING',
              source: customer ? 'CUSTOMER' : 'SYSTEM',
              note: 'Order placed',
            },
          },
        },
        select: { id: true },
      });

      // Stock: one conditional update per line, in a fixed order so concurrent orders never deadlock.
      for (const line of [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        const balance = await changeStock(tx, line.variantId, -line.quantity);
        if (balance === null) throw outOfStock([line.variantId]);
        await tx.stockMovement.create({
          data: {
            variantId: line.variantId,
            type: 'SALE',
            quantity: -line.quantity,
            balanceAfter: balance,
            orderId: order.id,
            reason: 'Order placed',
          },
        });
      }
      // Popularity for "best sellers" sorting.
      const perProduct = new Map<string, number>();
      for (const l of lines)
        perProduct.set(
          l.variant.product.id,
          (perProduct.get(l.variant.product.id) ?? 0) + l.quantity,
        );
      for (const [productId, qty] of perProduct) {
        await tx.product.update({
          where: { id: productId },
          data: { soldCount: { increment: qty } },
        });
      }

      if (coupon) {
        const updated = await tx.$executeRaw`
          UPDATE coupons SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
          WHERE id = ${coupon.id}::uuid AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
        if (updated === 0) throw businessRule('COUPON_USED_UP', 'This coupon has been fully used');
        await tx.couponUsage.create({
          data: {
            couponId: coupon.id,
            orderId: order.id,
            customerId: customer?.id ?? null,
            phone: input.contact.phone,
            discountAmount: money(totals.discountTotal),
          },
        });
      }
      return { id: order.id, variantIds: lines.map((l) => l.variantId) };
    });
  } catch (err) {
    // A concurrent request with the same key won the race: answer with its order.
    if (isUniqueViolation(err)) {
      const winner = await findByKey(deps, ctx.idempotencyKey);
      if (winner) return existingOrder(deps, winner, input.contact.phone);
    }
    throw err;
  }

  await afterOrderPlaced(deps, ctx, created);
  return { created: true, order: await orderView(deps, created.id) };
}

function findByKey(deps: OrderDeps, key: string) {
  return deps.prisma.order.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, contactPhone: true },
  });
}

async function existingOrder(
  deps: OrderDeps,
  order: { id: string; contactPhone: string },
  phone: string,
) {
  if (order.contactPhone !== phone) {
    throw new AppError('CONFLICT', 'This request was already used for another order', [
      { reason: 'IDEMPOTENCY_MISMATCH' },
    ]);
  }
  return { created: false, order: await orderView(deps, order.id) };
}

/** After commit: cart cleanup, emails, low-stock checks, storefront refresh. None of it may fail the order. */
async function afterOrderPlaced(
  deps: OrderDeps,
  ctx: PlaceOrderContext,
  created: { id: string; variantIds: string[] },
) {
  const safely = async (what: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      console.error(
        `After order ${created.id}: ${what} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
  if (ctx.cartId) {
    await safely('cart cleanup', () =>
      deps.prisma.cartItem.deleteMany({
        where: { cartId: ctx.cartId!, variantId: { in: created.variantIds } },
      }),
    );
  }
  await safely('order emails', () => sendPlacedEmails(deps, created.id));
  for (const variantId of created.variantIds) await afterStockChange(deps, variantId);
  queueRevalidate(deps, ['catalog']);
}

async function sendPlacedEmails(deps: OrderDeps, orderId: string) {
  const o = await deps.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      contactName: true,
      contactPhone: true,
      contactEmail: true,
      subtotal: true,
      discountTotal: true,
      deliveryCharge: true,
      grandTotal: true,
      paymentMethod: { select: { name: true } },
      address: { select: { district: true } },
      items: { select: { productName: true, variantName: true, quantity: true, lineTotal: true } },
    },
  });
  const app = deps.env.APP_URL.replace(/\/+$/, '');
  if (o.contactEmail) {
    await enqueueEmail(deps, {
      template: 'order-placed',
      to: o.contactEmail,
      orderId,
      data: {
        name: o.contactName,
        orderNumber: o.orderNumber,
        items: o.items.map((i) => ({
          name: `${i.productName} (${i.variantName})`,
          quantity: i.quantity,
          lineTotal: i.lineTotal.toFixed(2),
        })),
        subtotal: o.subtotal.toFixed(2),
        discountTotal: o.discountTotal.toFixed(2),
        deliveryCharge: o.deliveryCharge.toFixed(2),
        grandTotal: o.grandTotal.toFixed(2),
        paymentMethod: o.paymentMethod.name,
        trackUrl: `${app}/track?order=${encodeURIComponent(o.orderNumber)}`,
      },
    });
  }
  const admin = await findSettingValue(deps.prisma, 'notifications.adminEmail');
  if (typeof admin === 'string' && admin.trim()) {
    await enqueueEmail(deps, {
      template: 'admin-new-order',
      to: admin,
      orderId,
      data: {
        orderNumber: o.orderNumber,
        customerName: o.contactName,
        phone: o.contactPhone,
        district: o.address?.district ?? '',
        itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
        grandTotal: o.grandTotal.toFixed(2),
        paymentMethod: o.paymentMethod.name,
        url: `${app}/admin/orders/${orderId}`,
      },
    });
  }
}

// Views ------------------------------------------------------------------------------------------

const viewSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  placedAt: true,
  contactName: true,
  contactPhone: true,
  contactEmail: true,
  couponCode: true,
  subtotal: true,
  discountTotal: true,
  deliveryCharge: true,
  grandTotal: true,
  customerNote: true,
  customerId: true,
  paymentMethod: { select: { code: true, name: true } },
  deliveryZone: { select: { name: true, estimatedDays: true } },
  address: {
    select: {
      recipientName: true,
      phone: true,
      division: true,
      district: true,
      upazila: true,
      addressLine: true,
      postalCode: true,
      deliveryNote: true,
    },
  },
  items: {
    select: {
      variantId: true,
      productName: true,
      variantName: true,
      sku: true,
      quantity: true,
      listPrice: true,
      unitPrice: true,
      lineTotal: true,
      discountAmount: true,
    },
    orderBy: { productName: 'asc' },
  },
  statusHistory: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
} as const;

type ViewRow = Prisma.OrderGetPayload<{ select: typeof viewSelect }>;

function toView(o: ViewRow) {
  return {
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    placedAt: o.placedAt,
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    contactEmail: o.contactEmail,
    couponCode: o.couponCode,
    subtotal: o.subtotal.toFixed(2),
    discountTotal: o.discountTotal.toFixed(2),
    deliveryCharge: o.deliveryCharge.toFixed(2),
    grandTotal: o.grandTotal.toFixed(2),
    customerNote: o.customerNote,
    paymentMethod: o.paymentMethod,
    deliveryZone: o.deliveryZone,
    address: o.address,
    items: o.items.map((i) => ({
      ...i,
      listPrice: i.listPrice.toFixed(2),
      unitPrice: i.unitPrice.toFixed(2),
      lineTotal: i.lineTotal.toFixed(2),
      discountAmount: i.discountAmount.toFixed(2),
    })),
    timeline: o.statusHistory.map((h) => ({ status: h.toStatus, at: h.createdAt })),
  };
}
export type OrderView = ReturnType<typeof toView>;

/** Full order for the person who placed it (confirmation) and, later, its signed-in owner. */
export async function orderView(deps: Pick<OrderDeps, 'prisma'>, id: string): Promise<OrderView> {
  return toView(await deps.prisma.order.findUniqueOrThrow({ where: { id }, select: viewSelect }));
}

/**
 * Guest tracking by order number + phone (both must match; otherwise 404, never a hint which one
 * was wrong). The street address and contact details are left out.
 */
export async function trackOrder(
  deps: Pick<OrderDeps, 'prisma'>,
  orderNumber: string,
  phone: string,
) {
  const o = await deps.prisma.order.findFirst({
    where: { orderNumber, contactPhone: phone },
    select: viewSelect,
  });
  if (!o) throw new AppError('NOT_FOUND', 'No order matches this number and phone');
  const { address, contactEmail: _e, contactPhone: _p, customerNote: _n, ...rest } = toView(o);
  return {
    ...rest,
    address: address ? { district: address.district, division: address.division } : null,
  };
}

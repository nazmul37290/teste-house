import type { Paisa } from './money';

/**
 * Authoritative order pricing. Pure function, integer paisa only.
 * Rules live in docs/pricing.md. The API result is the only one that counts;
 * the web app may call this for display but must never send its result as a price.
 */

export type PricingErrorCode =
  | 'EMPTY_CART'
  | 'INVALID_QUANTITY'
  | 'INVALID_PRICE'
  | 'INVALID_COUPON'
  | 'COUPON_MIN_ORDER'
  | 'INVALID_ZONE';

export class PricingError extends Error {
  readonly code: PricingErrorCode;
  constructor(code: PricingErrorCode, message: string) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
  }
}

export type PricingItem = {
  variantId: string;
  quantity: number;
  /** Regular price in paisa. */
  price: Paisa;
  /** Sale price in paisa, or null. Must satisfy 0 <= salePrice < price when set. */
  salePrice: Paisa | null;
};

export type PricingCoupon = {
  type: 'FIXED' | 'PERCENT';
  /** FIXED: amount in paisa. PERCENT: hundredths of a percent (10% = 1000, 12.5% = 1250). */
  value: number;
  minOrderAmount?: Paisa | null;
  maxDiscount?: Paisa | null;
};

export type PricingZone = {
  charge: Paisa;
  freeDeliveryThreshold?: Paisa | null;
};

export type PricingInput = {
  items: PricingItem[];
  coupon?: PricingCoupon | null;
  zone: PricingZone;
};

export type PricingLine = {
  variantId: string;
  listPrice: Paisa;
  unitPrice: Paisa;
  quantity: number;
  lineTotal: Paisa;
  discountAmount: Paisa;
};

export type PricingResult = {
  lines: PricingLine[];
  subtotal: Paisa;
  discountTotal: Paisa;
  netMerchandise: Paisa;
  deliveryCharge: Paisa;
  grandTotal: Paisa;
};

export const MAX_LINE_QUANTITY = 1000;

function isPaisa(n: unknown): n is Paisa {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

function safe(n: number, what: string): number {
  if (!Number.isSafeInteger(n)) throw new PricingError('INVALID_PRICE', `${what} is out of range`);
  return n;
}

/** Round-half-up division for non-negative bigint values. */
function divRoundHalfUp(n: bigint, d: bigint): bigint {
  return (2n * n + d) / (2n * d);
}

export function calculateOrderTotals(input: PricingInput): PricingResult {
  if (input.items.length === 0) throw new PricingError('EMPTY_CART', 'Cart is empty');

  const lines: PricingLine[] = input.items.map((item) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_LINE_QUANTITY) {
      throw new PricingError('INVALID_QUANTITY', `Invalid quantity for ${item.variantId}`);
    }
    if (!isPaisa(item.price)) {
      throw new PricingError('INVALID_PRICE', `Invalid price for ${item.variantId}`);
    }
    if (item.salePrice !== null && (!isPaisa(item.salePrice) || item.salePrice >= item.price)) {
      throw new PricingError('INVALID_PRICE', `Invalid sale price for ${item.variantId}`);
    }
    const unitPrice = item.salePrice ?? item.price;
    return {
      variantId: item.variantId,
      listPrice: item.price,
      unitPrice,
      quantity: item.quantity,
      lineTotal: safe(unitPrice * item.quantity, 'Line total'),
      discountAmount: 0,
    };
  });

  const subtotal = safe(
    lines.reduce((sum, l) => sum + l.lineTotal, 0),
    'Subtotal',
  );

  let discountTotal = 0;
  const coupon = input.coupon ?? null;
  if (coupon) {
    if (coupon.minOrderAmount != null && subtotal < coupon.minOrderAmount) {
      throw new PricingError('COUPON_MIN_ORDER', 'Order is below the coupon minimum');
    }
    if (coupon.maxDiscount != null && !isPaisa(coupon.maxDiscount)) {
      throw new PricingError('INVALID_COUPON', 'Invalid coupon maximum discount');
    }
    if (coupon.type === 'FIXED') {
      if (!isPaisa(coupon.value) || coupon.value === 0) {
        throw new PricingError('INVALID_COUPON', 'Invalid fixed coupon value');
      }
      discountTotal = coupon.value;
    } else {
      if (!Number.isInteger(coupon.value) || coupon.value < 1 || coupon.value > 10000) {
        throw new PricingError('INVALID_COUPON', 'Invalid percent coupon value');
      }
      discountTotal = Number(divRoundHalfUp(BigInt(subtotal) * BigInt(coupon.value), 10000n));
    }
    if (coupon.maxDiscount != null) discountTotal = Math.min(discountTotal, coupon.maxDiscount);
    discountTotal = Math.min(discountTotal, subtotal);
  }

  const netMerchandise = subtotal - discountTotal;

  const { charge, freeDeliveryThreshold } = input.zone;
  if (!isPaisa(charge)) throw new PricingError('INVALID_ZONE', 'Invalid delivery charge');
  if (freeDeliveryThreshold != null && !isPaisa(freeDeliveryThreshold)) {
    throw new PricingError('INVALID_ZONE', 'Invalid free delivery threshold');
  }
  const deliveryCharge =
    freeDeliveryThreshold != null && netMerchandise >= freeDeliveryThreshold ? 0 : charge;

  const grandTotal = safe(netMerchandise + deliveryCharge, 'Grand total');

  allocateDiscount(lines, discountTotal, subtotal);

  return { lines, subtotal, discountTotal, netMerchandise, deliveryCharge, grandTotal };
}

/** Largest-remainder allocation so line discounts sum exactly to the order discount. */
function allocateDiscount(lines: PricingLine[], discountTotal: number, subtotal: number): void {
  if (discountTotal === 0 || subtotal === 0) return;
  const discount = BigInt(discountTotal);
  const total = BigInt(subtotal);

  const parts = lines.map((line, index) => {
    const product = discount * BigInt(line.lineTotal);
    return { index, floor: product / total, remainder: product % total };
  });

  let leftover = discount - parts.reduce((sum, p) => sum + p.floor, 0n);
  const byRemainder = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const p of byRemainder) {
    if (leftover <= 0n) break;
    p.floor += 1n;
    leftover -= 1n;
  }
  for (const p of parts) {
    const line = lines[p.index];
    if (line) line.discountAmount = Number(p.floor);
  }
}

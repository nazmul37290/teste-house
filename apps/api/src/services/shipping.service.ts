import {
  parsePaisa,
  readPaymentMethodConfig,
  type CreateDeliveryZoneInput,
  type UpdateDeliveryZoneInput,
  type UpdatePaymentMethodInput,
} from '@shop/shared';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prisma-errors';
import { recordAudit, type Actor } from './audit.service';
import { businessRule } from './role.service';
import { notFound } from './taxonomy-common';

/**
 * Delivery zones [shipping.manage] and payment methods [payments.toggle]. Every write is audited.
 * Zone rules: a district belongs to at most one zone; at most one default zone (it covers every
 * district no other zone lists); a zone used by orders is deactivated, not deleted.
 */

const zoneSelect = {
  id: true,
  name: true,
  code: true,
  districts: true,
  charge: true,
  freeDeliveryThreshold: true,
  estimatedDays: true,
  isDefault: true,
  isActive: true,
  sortOrder: true,
  _count: { select: { orders: true } },
} as const;

type ZoneRow = Prisma.DeliveryZoneGetPayload<{ select: typeof zoneSelect }>;
const toZone = ({ _count, charge, freeDeliveryThreshold, ...z }: ZoneRow) => ({
  ...z,
  charge: charge.toFixed(2),
  freeDeliveryThreshold: freeDeliveryThreshold?.toFixed(2) ?? null,
  orderCount: _count.orders,
});

export async function listZones(prisma: Db) {
  const rows = await prisma.deliveryZone.findMany({
    select: zoneSelect,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toZone);
}

type Tx = Prisma.TransactionClient;

/** Refuses a district that another zone already lists. */
async function assertDistrictsFree(tx: Tx, districts: string[], exceptId?: string) {
  if (!districts.length) return;
  const clash = await tx.deliveryZone.findFirst({
    where: { districts: { hasSome: districts }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true, districts: true },
  });
  if (clash) {
    const taken = districts.filter((d) => clash.districts.includes(d));
    throw businessRule(
      'DISTRICT_IN_OTHER_ZONE',
      `${taken.join(', ')} already belongs to the zone "${clash.name}"`,
    );
  }
}

function mapZoneError(err: unknown): never {
  if (isUniqueViolation(err))
    throw new AppError('CONFLICT', 'A zone with this code already exists');
  throw err;
}

export async function createZone(prisma: Db, actor: Actor, input: CreateDeliveryZoneInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertDistrictsFree(tx, input.districts);
      if (input.isDefault) await tx.deliveryZone.updateMany({ data: { isDefault: false } });
      const zone = await tx.deliveryZone.create({ data: input, select: zoneSelect });
      await recordAudit(tx, actor, {
        action: 'delivery_zone.create',
        entityType: 'delivery_zone',
        entityId: zone.id,
        after: input,
      });
      return toZone(zone);
    });
  } catch (err) {
    mapZoneError(err);
  }
}

export async function updateZone(
  prisma: Db,
  actor: Actor,
  id: string,
  input: UpdateDeliveryZoneInput,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.deliveryZone.findUnique({ where: { id }, select: zoneSelect });
      if (!before) throw notFound('Zone');
      if (input.districts) await assertDistrictsFree(tx, input.districts, id);
      if (input.isDefault) {
        await tx.deliveryZone.updateMany({
          where: { id: { not: id } },
          data: { isDefault: false },
        });
      }
      const zone = await tx.deliveryZone.update({ where: { id }, data: input, select: zoneSelect });
      await recordAudit(tx, actor, {
        action: 'delivery_zone.update',
        entityType: 'delivery_zone',
        entityId: id,
        before: toZone(before),
        after: input,
      });
      return toZone(zone);
    });
  } catch (err) {
    mapZoneError(err);
  }
}

export async function deleteZone(prisma: Db, actor: Actor, id: string) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.deliveryZone.findUnique({ where: { id }, select: zoneSelect });
    if (!before) throw notFound('Zone');
    if (before._count.orders > 0) {
      throw new AppError('CONFLICT', 'Orders use this zone; turn it off instead', [
        { reason: 'ZONE_IN_USE' },
      ]);
    }
    await tx.deliveryZone.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: 'delivery_zone.delete',
      entityType: 'delivery_zone',
      entityId: id,
      before: toZone(before),
    });
  });
}

// Payment methods --------------------------------------------------------------------------------

const methodSelect = {
  id: true,
  code: true,
  name: true,
  isActive: true,
  sortOrder: true,
  config: true,
} as const;

type MethodRow = Prisma.PaymentMethodGetPayload<{ select: typeof methodSelect }>;
const toMethod = (m: MethodRow) => ({ ...m, config: readPaymentMethodConfig(m.config) });

export async function listPaymentMethods(prisma: Db) {
  const rows = await prisma.paymentMethod.findMany({
    select: methodSelect,
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  return rows.map(toMethod);
}

export async function updatePaymentMethod(
  prisma: Db,
  actor: Actor,
  id: string,
  input: UpdatePaymentMethodInput,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.paymentMethod.findUnique({ where: { id }, select: methodSelect });
    if (!before) throw notFound('Payment method');
    if (input.config?.scope && before.code !== 'COD') {
      throw new AppError('VALIDATION_ERROR', 'Only Cash on Delivery has a delivery scope', [
        { path: 'config.scope', message: 'Not allowed for this method' },
      ]);
    }
    // Config is merged, so changing one limit keeps the others; null clears a limit.
    const config = input.config
      ? Object.fromEntries(
          Object.entries({ ...readPaymentMethodConfig(before.config), ...input.config }).filter(
            ([, v]) => v !== null && v !== undefined,
          ),
        )
      : undefined;
    if (
      typeof config?.minAmount === 'string' &&
      typeof config.maxAmount === 'string' &&
      parsePaisa(config.minAmount) > parsePaisa(config.maxAmount)
    ) {
      throw new AppError('VALIDATION_ERROR', 'Minimum must not exceed maximum', [
        { path: 'config.maxAmount', message: 'Below the minimum' },
      ]);
    }
    const method = await tx.paymentMethod.update({
      where: { id },
      data: {
        name: input.name,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
        ...(config ? { config: config as Prisma.InputJsonValue } : {}),
      },
      select: methodSelect,
    });
    await recordAudit(tx, actor, {
      action: 'payment_method.update',
      entityType: 'payment_method',
      entityId: id,
      before: toMethod(before),
      after: input,
    });
    return toMethod(method);
  });
}

import type { CourierState } from '../integrations/courier';
import type { OrderStatus } from '../generated/prisma/client';

/**
 * What a courier state means for the order (requirements STF-6). States not listed (BOOKED, HOLD,
 * PARTIAL_DELIVERED, UNKNOWN) are recorded on the shipment timeline but never move the order:
 * partial deliveries and holds need a person to decide.
 */
const ORDER_STATUS_FOR: Partial<Record<CourierState, OrderStatus>> = {
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
  // Cancelled at the courier after pickup: the parcel comes back to us.
  CANCELLED: 'RETURNED',
};

export function orderStatusForCourierState(state: CourierState): OrderStatus | null {
  return ORDER_STATUS_FOR[state] ?? null;
}

/** Shipments in these order statuses are still moving and get synced. */
export const SYNCABLE_ORDER_STATUSES: OrderStatus[] = ['HANDED_TO_COURIER', 'IN_TRANSIT'];

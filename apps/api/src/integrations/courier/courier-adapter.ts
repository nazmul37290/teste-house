import type { Paisa } from '@shop/shared';

/**
 * Courier adapter (docs/integrations.md section 1). Each provider maps its own status names to a
 * CourierState; the rest of the app only sees CourierState. Amounts are paisa on our side.
 */
export type CourierState =
  | 'BOOKED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'PARTIAL_DELIVERED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'HOLD'
  | 'UNKNOWN';

export interface CourierAdapter {
  /** `shipments.provider` value. */
  readonly provider: 'STEADFAST';

  createParcel(input: {
    invoice: string; // order number
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    codAmount: Paisa; // 0 for prepaid orders
    note?: string;
  }): Promise<{
    consignmentId: string;
    trackingCode: string;
    trackingUrl?: string;
    status: string; // provider's raw status
    state: CourierState;
    raw: unknown;
  }>;

  getStatus(ref: { consignmentId?: string; trackingCode?: string }): Promise<{
    status: string;
    state: CourierState;
    message?: string;
    raw: unknown;
  }>;

  getBalance(): Promise<{ balance: Paisa; raw: unknown }>;
}

export class CourierError extends Error {
  constructor(
    message: string,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'CourierError';
  }
}

import type { Paisa } from '@shop/shared';
import {
  CourierError,
  type CourierAdapter,
  type CourierState,
} from '../../src/integrations/courier/courier-adapter';

/** In-memory courier for tests: books parcels, and `move()` changes what getStatus() reports. */
export function createFakeCourier() {
  const parcels = new Map<
    string,
    { invoice: string; codAmount: Paisa; status: string; state: CourierState; trackingCode: string }
  >();
  let failBookings = 0;
  let seq = 0;

  const adapter: CourierAdapter = {
    provider: 'STEADFAST',
    async createParcel(input) {
      if (failBookings > 0) {
        failBookings -= 1;
        throw new CourierError('Fake courier is down');
      }
      seq += 1;
      const consignmentId = `C${Date.now()}${seq}`;
      const trackingCode = `TRK${Date.now().toString(36).toUpperCase()}${seq}`;
      parcels.set(consignmentId, {
        invoice: input.invoice,
        codAmount: input.codAmount,
        status: 'in_review',
        state: 'BOOKED',
        trackingCode,
      });
      return {
        consignmentId,
        trackingCode,
        trackingUrl: `https://courier.test/t/${trackingCode}`,
        status: 'in_review',
        state: 'BOOKED',
        raw: { fake: true, input },
      };
    },
    async getStatus({ consignmentId }) {
      const p = consignmentId ? parcels.get(consignmentId) : undefined;
      if (!p) throw new CourierError('Unknown parcel');
      return { status: p.status, state: p.state, raw: { status: p.status } };
    },
    async getBalance() {
      return { balance: 1_234_50, raw: { balance: '1234.50' } };
    },
  };

  return {
    adapter,
    parcels,
    failNext: (n = 1) => {
      failBookings = n;
    },
    byInvoice(invoice: string) {
      for (const [id, p] of parcels) if (p.invoice === invoice) return { consignmentId: id, ...p };
      throw new Error(`No fake parcel for ${invoice}`);
    },
    move(consignmentId: string, status: string, state: CourierState) {
      const p = parcels.get(consignmentId);
      if (!p) throw new Error(`Unknown parcel ${consignmentId}`);
      p.status = status;
      p.state = state;
    },
  };
}

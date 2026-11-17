import { randomUUID } from 'node:crypto';
import type { Paisa } from '@shop/shared';
import {
  GatewayError,
  type PaymentGateway,
  type VerifiedPayment,
} from '../../src/integrations/payments/payment-gateway';

/**
 * In-memory gateway for tests. `settle()` decides what verify() will report for an invoice, like a
 * customer paying (or not) on the gateway page.
 */
export function createFakeGateway(code = 'UDDOKTAPAY') {
  const invoices = new Map<
    string,
    {
      orderNumber: string;
      paymentId: string;
      amount: Paisa;
      result: Omit<VerifiedPayment, 'raw' | 'gatewayInvoiceId'>;
    }
  >();
  let failNextCharge = false;
  const calls = { createCharge: 0, verify: 0 };

  const gateway: PaymentGateway = {
    code,
    async createCharge(input) {
      calls.createCharge += 1;
      if (failNextCharge) {
        failNextCharge = false;
        throw new GatewayError('Fake gateway is down');
      }
      const id = randomUUID().replace(/-/g, '');
      invoices.set(id, {
        orderNumber: input.orderNumber,
        paymentId: input.paymentId,
        amount: input.amount,
        result: {
          status: 'PENDING',
          amount: input.amount,
          orderNumber: input.orderNumber,
          paymentId: input.paymentId,
        },
      });
      // Like UddoktaPay: the invoice id is not known until the customer returns (see invoiceFor()).
      return {
        redirectUrl: `https://gateway.test/payment/${id}`,
        gatewayInvoiceId: null,
        raw: { status: true, payment_url: `https://gateway.test/payment/${id}` },
        request: { amount: input.amount },
      };
    },
    async verify({ gatewayInvoiceId }) {
      calls.verify += 1;
      const inv = invoices.get(gatewayInvoiceId);
      if (!inv)
        return { status: 'FAILED', amount: null, gatewayInvoiceId, raw: { status: 'ERROR' } };
      return { ...inv.result, gatewayInvoiceId, raw: { fake: true, ...inv.result } };
    },
  };

  return {
    gateway,
    calls,
    failNextCharge: () => {
      failNextCharge = true;
    },
    /** Marks an invoice paid (optionally with another amount), failed, or pending. */
    settle(
      invoiceId: string,
      status: VerifiedPayment['status'],
      opts: { amount?: Paisa; txnId?: string } = {},
    ) {
      const inv = invoices.get(invoiceId);
      if (!inv) throw new Error(`Unknown fake invoice ${invoiceId}`);
      inv.result = {
        status,
        amount: opts.amount ?? inv.amount,
        gatewayTxnId:
          status === 'SUCCESS' ? (opts.txnId ?? `TXN${invoiceId.slice(0, 10)}`) : undefined,
        orderNumber: inv.orderNumber,
        paymentId: inv.paymentId,
      };
    },
    invoices,
    /** The invoice id the gateway would put on the return URL for this payment attempt. */
    invoiceFor(paymentId: string) {
      for (const [id, inv] of invoices) if (inv.paymentId === paymentId) return id;
      throw new Error(`No fake invoice for payment ${paymentId}`);
    },
  };
}

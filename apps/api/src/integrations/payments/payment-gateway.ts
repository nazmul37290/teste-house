import type { Paisa } from '@shop/shared';

/**
 * Online payment gateway (docs/integrations.md section 2). Amounts are integer paisa on our side;
 * each adapter converts to the provider's format. `raw` is stored on `payments` for disputes.
 */
export interface PaymentGateway {
  /** Payment method code this adapter serves (`payment_methods.code`). */
  readonly code: string;

  createCharge(input: {
    orderNumber: string;
    paymentId: string;
    amount: Paisa;
    customer: { name: string; phone: string; email: string };
    returnUrl: string;
    cancelUrl: string;
    webhookUrl: string;
  }): Promise<{
    redirectUrl: string;
    /** Known up front for some gateways; UddoktaPay only reveals it on the return or webhook. */
    gatewayInvoiceId: string | null;
    raw: unknown;
    request: unknown;
  }>;

  /** Asks the gateway itself; this, never the browser redirect, decides whether money arrived. */
  verify(ref: { gatewayInvoiceId: string }): Promise<VerifiedPayment>;
}

export type VerifiedPayment = {
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  /** What the gateway says was charged for the order (before its own fee). */
  amount: Paisa | null;
  gatewayInvoiceId: string;
  gatewayTxnId?: string;
  /** Our references echoed back (metadata sent with the charge). */
  orderNumber?: string;
  paymentId?: string;
  raw: unknown;
};

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

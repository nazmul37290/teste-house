import { formatPaisa, parsePaisa } from '@shop/shared';
import { GatewayError, type PaymentGateway, type VerifiedPayment } from './payment-gateway';

/**
 * UddoktaPay, from the official docs (uddoktapay.readme.io, read 2026-11-17):
 * - POST {base}/api/checkout-v2: full_name, email, amount (string), metadata (object), redirect_url,
 *   return_type (GET: invoice_id comes back as a query parameter), cancel_url, webhook_url.
 *   Success: { status: true, message, payment_url }. Error: { status: false, message }.
 * - POST {base}/api/verify-payment: { invoice_id }. Returns amount, fee, charged_amount (strings),
 *   invoice_id, metadata, payment_method, sender_number, transaction_id, date and
 *   status COMPLETED | PENDING | ERROR. Error: { status: "ERROR", message }.
 * - Every call sends the API key in the RT-UDDOKTAPAY-API-KEY header (the webhook carries it too).
 * The base URL is the merchant's own installation (sandbox: https://sandbox.uddoktapay.com).
 */
export const UDDOKTAPAY_KEY_HEADER = 'RT-UDDOKTAPAY-API-KEY';

type Fetch = typeof fetch;

export function createUddoktaPayGateway(opts: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: Fetch;
  timeoutMs?: number;
}): PaymentGateway {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;

  async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await doFetch(`${base}/api/${path}`, {
        method: 'POST',
        headers: {
          [UDDOKTAPAY_KEY_HEADER]: opts.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Never include the key or headers in errors.
      throw new GatewayError(
        `UddoktaPay ${path} unreachable: ${err instanceof Error ? err.name : 'error'}`,
      );
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json || typeof json !== 'object') {
      throw new GatewayError(`UddoktaPay ${path} returned HTTP ${res.status} without JSON`);
    }
    return json;
  }

  return {
    code: 'UDDOKTAPAY',

    async createCharge(input) {
      const request = {
        full_name: input.customer.name,
        email: input.customer.email,
        amount: formatPaisa(input.amount),
        metadata: { order_number: input.orderNumber, payment_id: input.paymentId },
        redirect_url: input.returnUrl,
        return_type: 'GET',
        cancel_url: input.cancelUrl,
        webhook_url: input.webhookUrl,
      };
      const raw = await post('checkout-v2', request);
      const url = typeof raw.payment_url === 'string' ? raw.payment_url : null;
      if (raw.status !== true || !url) {
        throw new GatewayError(
          `UddoktaPay refused the charge: ${typeof raw.message === 'string' ? raw.message : 'unknown error'}`,
          raw,
        );
      }
      // The payment page token is not the invoice id (checked in the sandbox: verifying it gives
      // "No Data Found"). The invoice id arrives on the return URL and in the webhook.
      return { redirectUrl: url, gatewayInvoiceId: null, raw, request };
    },

    async verify({ gatewayInvoiceId }): Promise<VerifiedPayment> {
      const raw = await post('verify-payment', { invoice_id: gatewayInvoiceId });
      const status = typeof raw.status === 'string' ? raw.status.toUpperCase() : '';
      const metadata =
        raw.metadata && typeof raw.metadata === 'object'
          ? (raw.metadata as Record<string, unknown>)
          : {};
      const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
      let amount: number | null = null;
      try {
        if (typeof raw.amount === 'string' || typeof raw.amount === 'number')
          amount = parsePaisa(String(raw.amount));
      } catch {
        amount = null;
      }
      // An ERROR without invoice data ("No Data Found") means the gateway knows no payment for this
      // id yet: not a failure, nothing to change.
      const known = typeof raw.invoice_id === 'string' && raw.invoice_id !== '';
      return {
        // Only an explicit ERROR on a known invoice is a failure. The sandbox returns an empty status
        // for an invoice the customer has not paid yet (checked 2026-11-17): that is still pending.
        status:
          status === 'COMPLETED' ? 'SUCCESS' : status === 'ERROR' && known ? 'FAILED' : 'PENDING',
        amount,
        gatewayInvoiceId: str(raw.invoice_id) ?? gatewayInvoiceId,
        gatewayTxnId: str(raw.transaction_id),
        orderNumber: str(metadata.order_number),
        paymentId: str(metadata.payment_id),
        raw,
      };
    },
  };
}

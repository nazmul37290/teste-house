# Integrations

Rule for every provider below: **read the official documentation first** and implement against it. This file defines our side of the contract (adapter interface, env, behaviour). It deliberately does not copy endpoint details, because providers change them.

All adapters live in `apps/api/src/integrations/<provider>/`, are called only from services or queue jobs, are mockable in tests, and never log secrets.

## 1. Steadfast courier

Env: `STEADFAST_BASE_URL`, `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY`, `STEADFAST_WEBHOOK_TOKEN`. Enable/disable switch: setting `shipping.steadfastEnabled`.

Adapter interface:

```ts
interface CourierAdapter {
  createParcel(input: {
    invoice: string;          // order number
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    codAmount: number;        // 0 for prepaid orders
    note?: string;
  }): Promise<{ consignmentId: string; trackingCode: string; trackingUrl?: string; raw: unknown }>;

  getStatus(ref: { consignmentId?: string; trackingCode?: string }): Promise<{ status: string; raw: unknown }>;
  getBalance(): Promise<{ balance: number; raw: unknown }>;
}
```

Behaviour:

- Booking runs in the `courier.book` queue job with exponential backoff (max 5 attempts). A failure leaves the order untouched and shows the error in admin; it never blocks order placement.
- Do not book the same order twice: skip if a shipment with a consignment ID already exists for the order (unless an admin explicitly rebooks).
- Store the raw response in `shipments.rawResponse`; each status change writes a `courier_events` row.
- Status mapping table (courier status to `OrderStatus`) lives in `steadfast.status-map.ts`. Fill it from the official docs; unknown statuses are stored on the shipment and do not change the order.
- Webhook: verify the token header against `STEADFAST_WEBHOOK_TOKEN`; respond 200 quickly; process in a job; idempotent.
- Polling fallback: `courier.sync` every 30 minutes for non-terminal shipments.

## 2. UddoktaPay (online payments)

Env: `UDDOKTAPAY_BASE_URL`, `UDDOKTAPAY_API_KEY`, `UDDOKTAPAY_WEBHOOK_SECRET` (if the provider supports one).

Adapter interface:

```ts
interface PaymentGateway {
  createCharge(input: {
    orderNumber: string;
    amount: number;           // BDT, from the order total on the server
    customer: { name: string; phone: string; email?: string };
    returnUrl: string;        // result page, display only
    cancelUrl: string;
    webhookUrl: string;
  }): Promise<{ redirectUrl: string; gatewayInvoiceId: string; raw: unknown }>;

  verify(ref: { gatewayInvoiceId: string }): Promise<{
    status: 'SUCCESS' | 'PENDING' | 'FAILED';
    amount: number;
    gatewayTxnId?: string;
    raw: unknown;
  }>;
}
```

Behaviour:

- The amount always comes from `orders.grandTotal`, never from the client. The verified gateway amount must equal `orders.grandTotal`; a mismatch marks the payment `FAILED`, flags the order for review and never marks it paid (see `pricing.md` section 7).
- The browser return URL only shows state. **Payment is confirmed only by the webhook or by `verify()`**; compare the verified amount and order reference with our records before marking `SUCCESS`.
- Webhook handler is idempotent: a repeated notification for an already successful payment is a no-op. Unique key `(methodId, gatewayTxnId)` prevents duplicates.
- Save `rawRequest` and `rawResponse` on `payments` for dispute handling.
- Unpaid online orders are cancelled after 30 minutes (`order.expire-unpaid`); a late successful payment on a cancelled order is flagged for admin review, not silently applied.
- The gateway is registered as a `payment_methods` row (`code = UDDOKTAPAY`); the admin toggle controls whether it appears at checkout. New gateways implement `PaymentGateway` and get their own row.

## 3. Email (Mailgun, switchable)

Env: `MAIL_PROVIDER` (`mailgun` or `smtp`), `MAIL_FROM`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_BASE_URL`, and `SMTP_*` for the fallback.

Interface:

```ts
interface MailTransport {
  send(msg: { to: string; subject: string; html: string; text: string; tags?: string[] }): Promise<{ providerMessageId?: string }>;
}
```

- Factory picks the transport from `MAIL_PROVIDER`. Mailgun is the default; SMTP goes through Nodemailer.
- Verification and password-reset emails are triggered from Better Auth callbacks (`sendVerificationEmail`, `sendResetPassword`). The callbacks only enqueue `email.send` jobs (no await on delivery), and skip placeholder `@phone.invalid` addresses. See `auth.md`.
- Always send through the `email.send` queue job. Write a `notification_logs` row (QUEUED, then SENT or FAILED). Retry with backoff.
- Templates (HTML + plain text, shared layout using store name and logo from settings): `email-verify`, `password-reset`, `order-placed`, `order-confirmed`, `order-shipped`, `order-delivered`, `order-cancelled`, `admin-new-order`, `admin-low-stock`.
- DNS for the sending domain: SPF, DKIM, DMARC.
- A `NotificationChannel` abstraction wraps email so an SMS channel can be added later without changing callers.

## 4. Google Tag Manager

- Container ID from setting `gtm.containerId` (public setting).
- Event contract and `purchase` deduplication are in `design.md` section 10. Do not push events from more than one place per action; use the `track()` helper only.

## 5. Cloudflare

- Proxy the domain; cache static media; enable WAF managed rules and bot fight mode.
- Real client IP comes from `CF-Connecting-IP`; configure Express `trust proxy` accordingly so rate limiting uses the right IP.
- Optional Turnstile on register, login and checkout (`TURNSTILE_*`).

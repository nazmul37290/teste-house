# Integrations

Rule for every provider below: **read the official documentation first** and implement against it. This file defines our side of the contract (adapter interface, env, behaviour). It deliberately does not copy endpoint details, because providers change them.

All adapters live in `apps/api/src/integrations/<provider>/`, are called only from services or queue jobs, are mockable in tests, and never log secrets.

## 1. Steadfast courier

**Status (Phase 8, 2026-11-17):** everything around the courier is built and tested with a fake adapter: the `CourierAdapter` seam (`apps/api/src/integrations/courier/`), booking (single and bulk) through the `courier.book` queue, shipments and `courier_events`, the 30-minute `courier.sync` job, the order status mapping (`apps/api/src/services/courier-state.ts`), shipped and delivered emails, the customer and admin parcel timeline, and the balance display. **The Steadfast adapter itself is not written yet**: Steadfast's API documentation is not public (steadfast.com.bd and portal.packzy.com publish none; it is behind the merchant login), and endpoints must not be guessed. Until the owner provides the docs, `createCourier()` returns `null`, booking answers `COURIER_NOT_CONFIGURED` and the sync job does nothing. When the docs arrive: implement `steadfast.ts` against them (base URL, auth headers, create order and bulk fields, COD format, status names into `CourierState`, balance), add the webhook route with the documented authentication, and fill the raw-status table.

Our normalized courier states (`CourierState`): `BOOKED`, `IN_TRANSIT`, `DELIVERED`, `PARTIAL_DELIVERED`, `RETURNED`, `CANCELLED`, `HOLD`, `UNKNOWN`. Only `IN_TRANSIT` -> IN_TRANSIT, `DELIVERED` -> DELIVERED (COD marked paid) and `RETURNED` / `CANCELLED` -> RETURNED (stock back) move the order, and only when the state machine allows it; the others are recorded on the timeline for a person to handle.


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

Env: `UDDOKTAPAY_BASE_URL` (the merchant's own UddoktaPay installation, e.g. `https://pay.yourshop.com.bd`; development: `https://sandbox.uddoktapay.com` with the public test key from the official docs), `UDDOKTAPAY_API_KEY`. The gateway is offered at checkout only when both are set and the `UDDOKTAPAY` payment method is active. There is no separate webhook secret: the provider authenticates its webhook with the same API key.

From the official docs (uddoktapay.readme.io, read 2026-11-17) and checked against the sandbox:

- Every call: `POST`, JSON, headers `RT-UDDOKTAPAY-API-KEY: <key>`, `Content-Type` and `Accept: application/json`.
- Create charge `{base}/api/checkout-v2`: `full_name`, `email` (required; guests without email get the never-mailed `<phone>@phone.invalid`), `amount` (string, `"1660.00"`), `metadata` (`{ order_number, payment_id }`), `redirect_url` (web `/payment/return`), `return_type: "GET"`, `cancel_url` (web `/payment/return?cancelled=1`), `webhook_url` (API `/api/v1/webhooks/uddoktapay`). Success `{ status: true, message, payment_url }`; error `{ status: false, message }`.
- The token in `payment_url` is **not** the invoice id (verifying it returns "No Data Found"). The real `invoice_id` reaches us only on the return URL (`?invoice_id=...`) and in the webhook body.
- Verify `{base}/api/verify-payment` `{ invoice_id }`: `amount`, `fee`, `charged_amount` (strings), `invoice_id`, `metadata`, `payment_method`, `sender_number`, `transaction_id`, `date`, `status`. `COMPLETED` = paid; `PENDING` = pending; the sandbox returns an **empty status** for an invoice not paid yet (treated as pending); only `ERROR` on a known invoice is a failure; `{ status: "ERROR", message: "No Data Found" }` (unknown invoice) changes nothing.
- Webhook: `POST` with the same header and the verify fields in the body. The docs say it is sent when an admin clicks "send webhook" in the UddoktaPay panel, so it cannot be relied on. We compare the header with our key (timing-safe), read only `invoice_id`, and run our own verify.
- Refund `{base}/api/refund-payment` exists; we do not call it (refunds are recorded manually, PAY-7).
- Sandbox quirk: the redirect drops the port of `redirect_url` (`http://localhost/payment/return?...`). Locally, add `:3000` by hand; real domains are unaffected.

Adapter interface (`apps/api/src/integrations/payments/`):

```ts
interface PaymentGateway {
  readonly code: string; // payment_methods.code
  createCharge(input: {
    orderNumber: string; paymentId: string; amount: Paisa;
    customer: { name: string; phone: string; email: string };
    returnUrl: string; cancelUrl: string; webhookUrl: string;
  }): Promise<{ redirectUrl: string; gatewayInvoiceId: string | null; raw: unknown; request: unknown }>;
  verify(ref: { gatewayInvoiceId: string }): Promise<{
    status: 'SUCCESS' | 'PENDING' | 'FAILED'; amount: Paisa | null; gatewayInvoiceId: string;
    gatewayTxnId?: string; orderNumber?: string; paymentId?: string; raw: unknown;
  }>;
}
```

Behaviour:

- The amount always comes from `orders.grandTotal`. `applyVerification()` (`payment.service.ts`) is the only code that records money: it locks the order, and accepts a COMPLETED payment only when the verified amount equals the order total and the attempt amount, and the echoed order number matches. A mismatch marks the attempt `FAILED`, adds an order note and emails `notifications.adminEmail` (`admin-payment-review`); it never marks the order paid.
- The browser return URL only triggers our verify; it is never proof. A verified payment sets `orders.paymentStatus = PAID` and auto-confirms the order (`CONFIRMED`, source SYSTEM, confirmation email).
- Idempotent: an attempt already `SUCCESS` is left alone; `(methodId, gatewayTxnId)` is unique.
- `rawRequest` / `rawResponse` are stored on `payments`.
- Jobs (worker, every 5 minutes): `payment.reconcile` re-verifies open attempts whose invoice id is known; `order.expire-unpaid` verifies once more, then cancels online orders unpaid 30 minutes after placement (stock and coupon released, open attempts `CANCELLED`). A payment that arrives after that is recorded, the order stays cancelled, and staff get a note and an email to refund or reinstate.
- Online orders get no "order received" email; the first email is the confirmation (paid) or the cancellation (expired).

## 3. Email (Mailgun, switchable)

Env: `MAIL_PROVIDER` (`mailgun` or `smtp`), `MAIL_FROM`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_BASE_URL`, and `SMTP_*` for the fallback.

Interface:

```ts
interface MailTransport {
  send(msg: { to: string; subject: string; html: string; text: string; tags?: string[] }): Promise<{ providerMessageId?: string }>;
}
```

- Factory picks the transport from `MAIL_PROVIDER` (`apps/api/src/integrations/mail/`). Production uses `mailgun`; development uses `smtp` (Nodemailer to Mailpit), which is also the env default.
- Mailgun, from the official docs (checked 2026-11-16): `POST {MAILGUN_BASE_URL}/v3/{MAILGUN_DOMAIN}/messages`, HTTP basic auth with user `api` and the API key, form fields `from`, `to`, `subject`, `text`, `html`, repeated `o:tag`; success returns `{ id, message }`. `MAILGUN_BASE_URL` is `https://api.mailgun.net` (US, the default) or `https://api.eu.mailgun.net` (EU).
- Each email is tagged with its template name.
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

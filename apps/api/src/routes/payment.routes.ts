import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../deps';
import { UDDOKTAPAY_KEY_HEADER } from '../integrations/payments';
import { clientIp } from '../lib/client-ip';
import { AppError } from '../lib/errors';
import { enforceRateLimit } from '../lib/rate-limit';
import { requireCsrfHeader } from '../middleware/require-csrf-header';
import * as payments from '../services/payment.service';

const invoiceBody = z.object({
  invoiceId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{6,100}$/),
});

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Payment confirmation under /api/v1 (docs/design.md section 6). Both routes only trigger our own
 * server-side verify(); nothing in the request is trusted as proof of payment.
 */
export function paymentRouter(deps: Deps): Router {
  const router = Router();

  // From the browser return page: verify the invoice id it was given, report what to display.
  router.post('/payments/uddoktapay/confirm', requireCsrfHeader, async (req, res) => {
    await enforceRateLimit(deps.redis, `pay-confirm:${clientIp(req, deps.env)}`, 30, 60);
    const { invoiceId } = invoiceBody.parse(req.body);
    res.set('Cache-Control', 'private, no-store');
    res.json({ data: await payments.confirmFromReturn(deps, 'UDDOKTAPAY', invoiceId) });
  });

  // UddoktaPay IPN: authenticated by the merchant API key in its header (the provider has no
  // separate webhook secret). Only invoice_id is read; the payment itself is verified with the API.
  router.post('/webhooks/uddoktapay', async (req, res) => {
    const key = deps.env.UDDOKTAPAY_API_KEY;
    const sent = req.get(UDDOKTAPAY_KEY_HEADER);
    if (!key || !deps.gateways.UDDOKTAPAY || !sent || !sameSecret(sent, key)) {
      throw new AppError('UNAUTHENTICATED', 'Invalid webhook key');
    }
    const parsed = z.object({ invoice_id: z.string().trim().min(6).max(100) }).safeParse(req.body);
    if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'invoice_id missing');
    const { outcome } = await payments.verifyInvoice(deps, 'UDDOKTAPAY', parsed.data.invoice_id);
    res.json({ data: { received: true, outcome } });
  });

  return router;
}

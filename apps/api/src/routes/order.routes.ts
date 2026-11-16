import { checkoutQuoteSchema, createOrderSchema, trackOrderSchema } from '@shop/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../deps';
import { clientIp } from '../lib/client-ip';
import { AppError } from '../lib/errors';
import { enforceRateLimit } from '../lib/rate-limit';
import { optionalCustomer } from '../middleware/require-customer';
import { requireCsrfHeader } from '../middleware/require-csrf-header';
import * as orders from '../services/order.service';
import { resolveCartId } from './cart.routes';

const idempotencyKey = z.uuid();

/**
 * Checkout quote, order placement and guest tracking under /api/v1 (guests and customers). All are
 * POST with the CSRF header; placement and tracking are rate limited per IP.
 */
export function orderRouter(deps: Deps): Router {
  const router = Router();
  router.use(
    ['/checkout', '/orders'],
    optionalCustomer(deps),
    requireCsrfHeader,
    (_req, res, next) => {
      res.set('Cache-Control', 'private, no-store');
      next();
    },
  );

  router.post('/checkout/quote', async (req, res) => {
    await enforceRateLimit(deps.redis, `quote:${clientIp(req, deps.env)}`, 60, 60);
    const input = checkoutQuoteSchema.parse(req.body);
    res.json({ data: await orders.quote(deps, input, req.customer) });
  });

  router.post('/orders', async (req, res) => {
    await enforceRateLimit(deps.redis, `order:${clientIp(req, deps.env)}`, 10, 60);
    const key = idempotencyKey.safeParse(req.get('Idempotency-Key'));
    if (!key.success) {
      throw new AppError('VALIDATION_ERROR', 'Missing or invalid Idempotency-Key header', [
        { path: 'Idempotency-Key', message: 'A UUID is required' },
      ]);
    }
    const input = createOrderSchema.parse(req.body);
    const cartId = await resolveCartId(deps, req, res, false);
    const result = await orders.placeOrder(
      deps,
      {
        customer: req.customer,
        idempotencyKey: key.data,
        ip: clientIp(req, deps.env),
        userAgent: req.get('User-Agent'),
        cartId,
      },
      input,
    );
    res.status(result.created ? 201 : 200).json({ data: result.order });
  });

  router.post('/orders/track', async (req, res) => {
    await enforceRateLimit(deps.redis, `track:${clientIp(req, deps.env)}`, 10, 60);
    const { orderNumber, phone } = trackOrderSchema.parse(req.body);
    res.json({ data: await orders.trackOrder(deps, orderNumber, phone) });
  });

  return router;
}

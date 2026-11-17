import {
  customerAddressSchema,
  idParamSchema,
  ORDER_NUMBER_PATTERN,
  updateProfileSchema,
  wishlistAddSchema,
  wishlistMergeSchema,
} from '@shop/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Deps } from '../deps';
import { currentCustomer, requireCustomer } from '../middleware/require-customer';
import { requireCsrfHeader } from '../middleware/require-csrf-header';
import * as account from '../services/account.service';
import * as wishlist from '../services/wishlist.service';
import { renderOrderPdf } from '../services/order-pdf.service';

const orderNumberParam = (req: Request) =>
  z.object({ number: z.string().toUpperCase().regex(ORDER_NUMBER_PATTERN) }).parse(req.params)
    .number;
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
const cancelBody = z.strictObject({ reason: z.string().trim().max(300).optional() });

/**
 * The signed-in customer's own data under /api/v1/me (docs/api-conventions.md). requireCustomer on
 * every route; writes need the CSRF header. Password changes use Better Auth's /auth/change-password.
 */
export function accountRouter(deps: Deps): Router {
  const router = Router();
  router.use('/me', requireCustomer(deps), (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.method === 'GET') return next();
    requireCsrfHeader(req, res, next);
  });
  const me = (req: Request) => currentCustomer(req).id;

  router.get('/me', async (req, res) => {
    res.json({ data: await account.getProfile(deps.prisma, me(req)) });
  });
  router.patch('/me', async (req, res) => {
    const input = updateProfileSchema.parse(req.body);
    res.json({ data: await account.updateProfile(deps.prisma, me(req), input) });
  });

  router.get('/me/addresses', async (req, res) => {
    res.json({ data: await account.listAddresses(deps.prisma, me(req)) });
  });
  router.post('/me/addresses', async (req, res) => {
    const input = customerAddressSchema.parse(req.body);
    res.status(201).json({ data: await account.createAddress(deps.prisma, me(req), input) });
  });
  router.put('/me/addresses/:id', async (req, res) => {
    const input = customerAddressSchema.parse(req.body);
    const { id } = idParamSchema.parse(req.params);
    res.json({ data: await account.replaceAddress(deps.prisma, me(req), id, input) });
  });
  router.delete('/me/addresses/:id', async (req, res) => {
    await account.deleteAddress(deps.prisma, me(req), idParamSchema.parse(req.params).id);
    res.status(204).end();
  });

  const shop = { prisma: deps.prisma, publicMediaUrl: deps.publicMediaUrl };
  router.get('/me/wishlist', async (req, res) => {
    res.json({ data: await wishlist.listWishlist(shop, me(req)) });
  });
  router.get('/me/wishlist/ids', async (req, res) => {
    res.json({ data: await wishlist.wishlistIds(deps.prisma, me(req)) });
  });
  router.post('/me/wishlist', async (req, res) => {
    const { productId } = wishlistAddSchema.parse(req.body);
    res.status(201).json({ data: await wishlist.addToWishlist(deps.prisma, me(req), productId) });
  });
  router.post('/me/wishlist/merge', async (req, res) => {
    const { productIds } = wishlistMergeSchema.parse(req.body);
    res.json({ data: await wishlist.mergeWishlist(deps.prisma, me(req), productIds) });
  });
  router.delete('/me/wishlist/:id', async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json({ data: await wishlist.removeFromWishlist(deps.prisma, me(req), id) });
  });

  router.get('/me/orders', async (req, res) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    const { items, total } = await account.listOrders(deps.prisma, me(req), page, pageSize);
    res.json({ data: items, meta: { page, pageSize, total } });
  });
  router.get('/me/orders/:number', async (req, res) => {
    res.json({ data: await account.getOrder(deps.prisma, me(req), orderNumberParam(req)) });
  });
  router.post('/me/orders/:number/cancel', async (req, res) => {
    const { reason } = cancelBody.parse(req.body ?? {});
    res.json({
      data: await account.cancelOrder(deps, me(req), orderNumberParam(req), reason),
    });
  });
  router.post('/me/orders/:number/reorder', async (req, res) => {
    res.json({ data: await account.reorder(deps.prisma, me(req), orderNumberParam(req)) });
  });
  router.get('/me/orders/:number/invoice', async (req, res) => {
    const number = orderNumberParam(req);
    const orderId = await account.ownOrderId(deps.prisma, me(req), number);
    const pdf = await renderOrderPdf(deps.prisma, orderId, 'invoice');
    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${number}.pdf"`,
      })
      .send(pdf);
  });

  return router;
}

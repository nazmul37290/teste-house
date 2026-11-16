import { addCartItemSchema, idParamSchema, updateCartItemSchema } from '@shop/shared';
import { Router, type Request, type Response } from 'express';
import type { Deps } from '../deps';
import { optionalCustomer } from '../middleware/require-customer';
import { requireCsrfHeader } from '../middleware/require-csrf-header';
import * as cart from '../services/cart.service';

export const CART_COOKIE = 'shop_cart';

/** Reads one cookie from the raw header (the API has no cookie parser). */
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/**
 * Finds the cart for this request (docs/design.md section 5). Signed in: the customer's cart, with
 * any guest cart from the cookie merged in first (then the cookie is cleared). Guest: the cart of
 * the `shop_cart` cookie; with `create`, a new one is made and the cookie set.
 */
export async function resolveCartId(
  deps: Deps,
  req: Request,
  res: Response,
  create: boolean,
): Promise<string | null> {
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: deps.env.NODE_ENV === 'production',
    path: '/',
  };
  const token = readCookie(req, CART_COOKIE);
  const guestId = await cart.findGuestCartId(deps.prisma, token);
  if (req.customer) {
    const id = await cart.customerCartId(deps.prisma, req.customer.id);
    if (guestId) await cart.mergeGuestCart(deps.prisma, guestId, id);
    if (token) res.clearCookie(CART_COOKIE, cookieOpts);
    return id;
  }
  if (guestId || !create) return guestId;
  const fresh = cart.newGuestToken();
  const id = await cart.createGuestCart(deps.prisma, fresh);
  res.cookie(CART_COOKIE, fresh, { ...cookieOpts, maxAge: cart.GUEST_CART_DAYS * 86_400_000 });
  return id;
}

/** Guest or customer cart under /api/v1/cart. Writes need the CSRF header. */
export function cartRouter(deps: Deps): Router {
  const router = Router();
  const svc = { prisma: deps.prisma, publicMediaUrl: deps.publicMediaUrl };
  router.use('/cart', optionalCustomer(deps), (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  router.get('/cart', async (req, res) => {
    const id = await resolveCartId(deps, req, res, false);
    res.json({ data: await cart.cartView(svc, id) });
  });
  router.post('/cart/items', requireCsrfHeader, async (req, res) => {
    const input = addCartItemSchema.parse(req.body);
    const id = await resolveCartId(deps, req, res, true);
    await cart.addItem(deps.prisma, id!, input);
    res.status(201).json({ data: await cart.cartView(svc, id) });
  });
  router.patch('/cart/items/:id', requireCsrfHeader, async (req, res) => {
    const { quantity } = updateCartItemSchema.parse(req.body);
    const id = await resolveCartId(deps, req, res, false);
    await cart.setQuantity(deps.prisma, id, idParamSchema.parse(req.params).id, quantity);
    res.json({ data: await cart.cartView(svc, id) });
  });
  router.delete('/cart/items/:id', requireCsrfHeader, async (req, res) => {
    const id = await resolveCartId(deps, req, res, false);
    await cart.removeItem(deps.prisma, id, idParamSchema.parse(req.params).id);
    res.json({ data: await cart.cartView(svc, id) });
  });

  return router;
}

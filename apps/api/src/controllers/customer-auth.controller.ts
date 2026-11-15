import { loginSchema, registerSchema } from '@shop/shared';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, RequestHandler, Response } from 'express';
import type { Deps } from '../deps';
import { clientIp } from '../lib/client-ip';
import {
  loginCustomer,
  registerCustomer,
  type AuthRequestContext,
  type AuthResult,
} from '../services/customer-auth.service';

function requestContext(req: Request, deps: Deps): AuthRequestContext {
  return { headers: fromNodeHeaders(req.headers), ip: clientIp(req, deps.env) };
}

function send(res: Response, status: number, result: AuthResult): void {
  // Session cookies come from Better Auth (shop_c.*); we only forward them.
  for (const cookie of result.setCookie) res.append('Set-Cookie', cookie);
  res.status(status).json({ data: { customer: result.customer } });
}

export function registerHandler(deps: Deps): RequestHandler {
  return async (req, res) => {
    const input = registerSchema.parse(req.body);
    send(res, 201, await registerCustomer(deps, input, requestContext(req, deps)));
  };
}

export function loginHandler(deps: Deps): RequestHandler {
  return async (req, res) => {
    const input = loginSchema.parse(req.body);
    send(res, 200, await loginCustomer(deps, input, requestContext(req, deps)));
  };
}

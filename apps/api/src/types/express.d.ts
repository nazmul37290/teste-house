import type { AdminContext } from '../services/admin-access.service';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAdmin for /api/v1/admin routes. */
      admin?: AdminContext;
    }
  }
}

export {};

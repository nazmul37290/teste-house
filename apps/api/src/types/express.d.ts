import type { CustomerContext } from '../middleware/require-customer';
import type { AdminContext } from '../services/admin-access.service';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAdmin for /api/v1/admin routes. */
      admin?: AdminContext;
      /** Set by requireCustomer / optionalCustomer for shop routes. */
      customer?: CustomerContext;
    }
  }
}

export {};

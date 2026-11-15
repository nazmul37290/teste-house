import { hasPermission, type PermissionKey } from '@shop/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

/**
 * Declared per admin route, next to the handler (docs/api-conventions.md). Runs after requireAdmin.
 * With several keys, any one of them is enough. The system role (Super Admin) passes every check.
 */
export function requirePermission(
  ...permissions: [PermissionKey, ...PermissionKey[]]
): RequestHandler {
  return (req, _res, next) => {
    const admin = req.admin;
    if (!admin) return next(new AppError('UNAUTHENTICATED', 'Sign in required'));
    const allowed = permissions.some((p) =>
      hasPermission(admin.permissions, p, admin.role.isSystem),
    );
    if (!allowed) return next(new AppError('FORBIDDEN', 'You do not have permission to do this'));
    next();
  };
}

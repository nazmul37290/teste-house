import { Router } from 'express';
import { staffController } from '../controllers/staff.controller';
import type { Deps } from '../deps';
import { requireAdmin } from '../middleware/require-admin';
import { requireCsrfHeader } from '../middleware/require-csrf-header';
import { requirePermission } from '../middleware/require-permission';

/**
 * /api/v1/admin/* (except /admin/auth, which belongs to adminAuth). Every route needs an admin
 * session; the permission is declared next to each handler.
 */
export function adminRouter(deps: Deps): Router {
  const router = Router();
  router.use(requireCsrfHeader, requireAdmin(deps));

  const staff = staffController(deps);
  router.get('/permissions', requirePermission('roles.manage'), staff.listPermissions);
  // The staff screen needs the role list for its dropdown, so users.manage may read it too.
  router.get('/roles', requirePermission('roles.manage', 'users.manage'), staff.listRoles);
  router.post('/roles', requirePermission('roles.manage'), staff.createRole);
  router.get('/roles/:id', requirePermission('roles.manage'), staff.getRole);
  router.patch('/roles/:id', requirePermission('roles.manage'), staff.updateRole);
  router.put('/roles/:id/permissions', requirePermission('roles.manage'), staff.setRolePermissions);
  router.delete('/roles/:id', requirePermission('roles.manage'), staff.deleteRole);

  router.get('/users', requirePermission('users.manage'), staff.listUsers);
  router.post('/users', requirePermission('users.manage'), staff.createUser);
  router.get('/users/:id', requirePermission('users.manage'), staff.getUser);
  router.patch('/users/:id', requirePermission('users.manage'), staff.updateUser);
  router.put('/users/:id/password', requirePermission('users.manage'), staff.setUserPassword);

  return router;
}

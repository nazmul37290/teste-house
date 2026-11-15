import { Router } from 'express';
import { updateSettingsSchema } from '@shop/shared';
import { mediaController } from '../controllers/media.controller';
import { staffController } from '../controllers/staff.controller';
import type { Deps } from '../deps';
import { requireAdmin } from '../middleware/require-admin';
import { requireCsrfHeader } from '../middleware/require-csrf-header';
import { requirePermission } from '../middleware/require-permission';
import { singleUpload } from '../middleware/upload';
import { actorFrom } from '../services/audit.service';
import { getAllSettings, updateSettings } from '../services/settings.service';

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

  const media = mediaController(deps);
  router.get('/media', requirePermission('media.upload', 'products.view'), media.list);
  router.post('/media', requirePermission('media.upload'), singleUpload('file'), media.upload);
  router.patch('/media/:id', requirePermission('media.upload'), media.update);
  router.delete('/media/:id', requirePermission('media.upload'), media.remove);

  router.get('/settings', requirePermission('settings.manage'), async (_req, res) => {
    res.json({ data: await getAllSettings(deps.prisma) });
  });
  router.put('/settings', requirePermission('settings.manage'), async (req, res) => {
    const input = updateSettingsSchema.parse(req.body);
    res.json({
      data: { values: await updateSettings(deps.prisma, actorFrom(req, deps.env), input) },
    });
  });

  return router;
}

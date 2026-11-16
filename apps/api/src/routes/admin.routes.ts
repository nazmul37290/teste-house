import { Router } from 'express';
import { updateSettingsSchema } from '@shop/shared';
import { inventoryController } from '../controllers/inventory.controller';
import { mediaController } from '../controllers/media.controller';
import { productController } from '../controllers/product.controller';
import { staffController } from '../controllers/staff.controller';
import { taxonomyController } from '../controllers/taxonomy.controller';
import type { Deps } from '../deps';
import { requireAdmin } from '../middleware/require-admin';
import { requireCsrfHeader } from '../middleware/require-csrf-header';
import { requirePermission } from '../middleware/require-permission';
import { singleUpload } from '../middleware/upload';
import { MAX_CSV_BYTES } from '../services/product-csv.service';
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

  // Catalog taxonomy. Reading is also open to products.view: the product editor needs these lists.
  const tax = taxonomyController(deps);
  router.get(
    '/categories',
    requirePermission('categories.manage', 'products.view'),
    tax.listCategories,
  );
  router.post('/categories', requirePermission('categories.manage'), tax.createCategory);
  router.patch('/categories/:id', requirePermission('categories.manage'), tax.updateCategory);
  router.delete('/categories/:id', requirePermission('categories.manage'), tax.deleteCategory);

  router.get('/brands', requirePermission('brands.manage', 'products.view'), tax.listBrands);
  router.post('/brands', requirePermission('brands.manage'), tax.createBrand);
  router.patch('/brands/:id', requirePermission('brands.manage'), tax.updateBrand);
  router.delete('/brands/:id', requirePermission('brands.manage'), tax.deleteBrand);

  router.get('/tags', requirePermission('brands.manage', 'products.view'), tax.listTags);
  router.post('/tags', requirePermission('brands.manage'), tax.createTag);
  router.patch('/tags/:id', requirePermission('brands.manage'), tax.updateTag);
  router.delete('/tags/:id', requirePermission('brands.manage'), tax.deleteTag);

  router.get(
    '/attributes',
    requirePermission('categories.manage', 'products.view'),
    tax.listAttributes,
  );
  router.post('/attributes', requirePermission('categories.manage'), tax.createAttribute);
  router.patch('/attributes/:id', requirePermission('categories.manage'), tax.updateAttribute);
  router.delete('/attributes/:id', requirePermission('categories.manage'), tax.deleteAttribute);
  router.post(
    '/attributes/:id/values',
    requirePermission('categories.manage'),
    tax.addAttributeValue,
  );
  router.patch(
    '/attribute-values/:id',
    requirePermission('categories.manage'),
    tax.updateAttributeValue,
  );
  router.delete(
    '/attribute-values/:id',
    requirePermission('categories.manage'),
    tax.deleteAttributeValue,
  );

  const products = productController(deps);
  router.get('/products', requirePermission('products.view'), products.list);
  router.post('/products', requirePermission('products.create'), products.create);
  // Declared before /products/:id so these paths are never read as an id.
  router.get('/products/export.csv', requirePermission('products.view'), products.exportCsv);
  router.post(
    '/products/import',
    requirePermission('products.create'),
    requirePermission('products.update'),
    singleUpload('file', MAX_CSV_BYTES),
    products.importCsv,
  );
  router.post('/products/bulk-status', requirePermission('products.update'), products.bulkStatus);
  router.get('/products/:id', requirePermission('products.view'), products.get);
  router.patch('/products/:id', requirePermission('products.update'), products.update);
  router.delete('/products/:id', requirePermission('products.delete'), products.remove);
  router.put('/products/:id/images', requirePermission('products.update'), products.setImages);
  router.post('/products/:id/variants', requirePermission('products.update'), products.addVariant);
  router.patch('/variants/:id', requirePermission('products.update'), products.updateVariant);
  router.delete('/variants/:id', requirePermission('products.update'), products.deleteVariant);

  const inventory = inventoryController(deps);
  router.get('/inventory', requirePermission('inventory.view'), inventory.list);
  router.get('/inventory/movements', requirePermission('inventory.view'), inventory.movements);
  router.get(
    '/inventory/variants/:id/batches',
    requirePermission('inventory.view'),
    inventory.batches,
  );
  router.post('/inventory/adjust', requirePermission('inventory.adjust'), inventory.adjust);
  router.post('/inventory/receive', requirePermission('inventory.adjust'), inventory.receive);

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

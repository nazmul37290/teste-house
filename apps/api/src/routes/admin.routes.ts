import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  adminReviewListQuerySchema,
  reviewReplySchema,
  adminOrderListQuerySchema,
  adminPaymentListQuerySchema,
  recordRefundSchema,
  changeOrderStatusSchema,
  editOrderSchema,
  hasPermission,
  orderNoteSchema,
  createBannerSchema,
  createCouponSchema,
  createDeliveryZoneSchema,
  updateCouponSchema,
  updateDeliveryZoneSchema,
  updatePaymentMethodSchema,
  homepageSectionSchema,
  idParamSchema,
  updateBannerSchema,
  updateSettingsSchema,
  legalPageSlugSchema,
  updateLegalPageSchema,
  updateHomeHighlightsSchema,
  dashboardQuerySchema,
  type DashboardPeriod,
} from '@shop/shared';
import { inventoryController } from '../controllers/inventory.controller';
import { mediaController } from '../controllers/media.controller';
import { productController } from '../controllers/product.controller';
import { staffController } from '../controllers/staff.controller';
import { taxonomyController } from '../controllers/taxonomy.controller';
import type { Deps } from '../deps';
import { requireAdmin } from '../middleware/require-admin';
import { requireCsrfHeader } from '../middleware/require-csrf-header';
import { requirePermission } from '../middleware/require-permission';
import { AppError } from '../lib/errors';
import { revalidateAfterWrite } from '../middleware/revalidate-after-write';
import { singleUpload } from '../middleware/upload';
import { MAX_CSV_BYTES } from '../services/product-csv.service';
import { actorFrom } from '../services/audit.service';
import * as adminOrders from '../services/admin-order.service';
import * as coupons from '../services/coupon.service';
import * as reviewAdmin from '../services/review.service';
import * as courier from '../services/courier.service';
import * as paymentAdmin from '../services/payment-admin.service';
import { renderOrderPdf } from '../services/order-pdf.service';
import * as dashboard from '../services/dashboard.service';
import * as marketing from '../services/marketing.service';
import * as shipping from '../services/shipping.service';
import {
  getAllSettings,
  getLegalPage,
  listLegalPages,
  updateLegalPage,
  getHomeHighlights,
  updateHomeHighlights,
  updateSettings,
} from '../services/settings.service';

/**
 * /api/v1/admin/* (except /admin/auth, which belongs to adminAuth). Every route needs an admin
 * session; the permission is declared next to each handler.
 */
export function adminRouter(deps: Deps): Router {
  const router = Router();
  router.use(requireCsrfHeader, requireAdmin(deps), revalidateAfterWrite(deps));

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
  router.get(
    '/media',
    // settings.manage: the logo picker in Settings.
    requirePermission('media.upload', 'products.view', 'marketing.manage', 'settings.manage'),
    media.list,
  );
  router.post('/media', requirePermission('media.upload'), singleUpload('file'), media.upload);
  router.patch('/media/:id', requirePermission('media.upload'), media.update);
  router.delete('/media/:id', requirePermission('media.upload'), media.remove);

  // Catalog taxonomy. Reading is also open to products.view: the product editor needs these lists.
  const tax = taxonomyController(deps);
  router.get(
    '/categories',
    requirePermission('categories.manage', 'products.view', 'marketing.manage'),
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
  // marketing.manage may read the list too: homepage sections pick products from it.
  router.get('/products', requirePermission('products.view', 'marketing.manage'), products.list);
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

  // Marketing: banners and homepage sections.
  const mk = { prisma: deps.prisma, publicMediaUrl: deps.publicMediaUrl };
  const pid = (req: Request) => idParamSchema.parse(req.params).id;
  router.get('/banners', requirePermission('marketing.manage'), async (_req, res) => {
    res.json({ data: await marketing.listBanners(mk) });
  });
  router.post('/banners', requirePermission('marketing.manage'), async (req, res) => {
    const input = createBannerSchema.parse(req.body);
    res
      .status(201)
      .json({ data: await marketing.createBanner(mk, actorFrom(req, deps.env), input) });
  });
  router.patch('/banners/:id', requirePermission('marketing.manage'), async (req, res) => {
    const input = updateBannerSchema.parse(req.body);
    res.json({ data: await marketing.updateBanner(mk, actorFrom(req, deps.env), pid(req), input) });
  });
  router.delete('/banners/:id', requirePermission('marketing.manage'), async (req, res) => {
    await marketing.deleteBanner(mk, actorFrom(req, deps.env), pid(req));
    res.status(204).end();
  });
  // Dashboard: figures need reports.view; recent orders (names) also need orders.view.
  router.get('/dashboard', requirePermission('reports.view'), async (req, res) => {
    const { days } = dashboardQuerySchema.parse(req.query);
    const admin = req.admin!;
    const includeOrders = hasPermission(admin.permissions, 'orders.view', admin.role.isSystem);
    res.set('Cache-Control', 'private, no-store');
    res.json({
      data: await dashboard.getDashboard(deps.prisma, days as DashboardPeriod, { includeOrders }),
    });
  });
  router.get('/homepage/highlights', requirePermission('marketing.manage'), async (_req, res) => {
    res.json({ data: await getHomeHighlights(deps.prisma) });
  });
  router.put('/homepage/highlights', requirePermission('marketing.manage'), async (req, res) => {
    const { items } = updateHomeHighlightsSchema.parse(req.body);
    res.json({
      data: await updateHomeHighlights(deps.prisma, actorFrom(req, deps.env), items),
    });
  });
  router.get('/homepage-sections', requirePermission('marketing.manage'), async (_req, res) => {
    res.json({ data: await marketing.listSections(deps.prisma) });
  });
  router.post('/homepage-sections', requirePermission('marketing.manage'), async (req, res) => {
    const input = homepageSectionSchema.parse(req.body);
    res
      .status(201)
      .json({ data: await marketing.createSection(deps.prisma, actorFrom(req, deps.env), input) });
  });
  router.put('/homepage-sections/:id', requirePermission('marketing.manage'), async (req, res) => {
    const input = homepageSectionSchema.parse(req.body);
    res.json({
      data: await marketing.replaceSection(deps.prisma, actorFrom(req, deps.env), pid(req), input),
    });
  });
  router.delete(
    '/homepage-sections/:id',
    requirePermission('marketing.manage'),
    async (req, res) => {
      await marketing.deleteSection(deps.prisma, actorFrom(req, deps.env), pid(req));
      res.status(204).end();
    },
  );

  // Orders.
  router.get('/orders', requirePermission('orders.view'), async (req, res) => {
    const q = adminOrderListQuerySchema.parse(req.query);
    const { items, total } = await adminOrders.listOrders(deps.prisma, q);
    res.json({ data: items, meta: { page: q.page, pageSize: q.pageSize, total } });
  });
  // Courier (Steadfast adapter pending its official docs: COURIER_NOT_CONFIGURED until then).
  const bulkBody = z.strictObject({ orderIds: z.array(z.uuid()).min(1).max(100) });
  router.post(
    '/orders/bulk/book-courier',
    requirePermission('orders.book_courier'),
    async (req, res) => {
      const { orderIds } = bulkBody.parse(req.body);
      res.status(202).json({
        data: await courier.requestBooking(deps, actorFrom(req, deps.env), orderIds),
      });
    },
  );
  router.post(
    '/orders/:id/book-courier',
    requirePermission('orders.book_courier'),
    async (req, res) => {
      const [result] = await courier.requestBooking(deps, actorFrom(req, deps.env), [pid(req)]);
      if (result && !result.queued) {
        const messages: Record<string, string> = {
          NOT_FOUND: 'Order not found',
          ALREADY_BOOKED: 'This order is already with the courier',
          NOT_PROCESSING: 'Only orders that are being packed can be sent to the courier',
        };
        if (result.reason === 'NOT_FOUND') throw new AppError('NOT_FOUND', 'Order not found');
        throw new AppError('BUSINESS_RULE', messages[result.reason ?? ''] ?? 'Cannot book', [
          { reason: result.reason },
        ]);
      }
      res.status(202).json({ data: result });
    },
  );
  router.get('/courier/balance', requirePermission('orders.book_courier'), async (_req, res) => {
    res.json({ data: await courier.courierBalance(deps) });
  });

  // SKU lookup for adding an item while editing an order (orders.edit may lack inventory.view).
  router.get('/orders/variant-lookup', requirePermission('orders.edit'), async (req, res) => {
    const sku = String(req.query.sku ?? '')
      .trim()
      .toUpperCase()
      .slice(0, 64);
    const v = sku
      ? await deps.prisma.productVariant.findUnique({
          where: { sku },
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
            salePrice: true,
            stockQty: true,
            isActive: true,
            product: { select: { name: true, status: true, deletedAt: true } },
          },
        })
      : null;
    if (!v || !v.isActive || v.product.status !== 'ACTIVE' || v.product.deletedAt) {
      throw new AppError('NOT_FOUND', 'No orderable variant with this SKU');
    }
    res.json({
      data: {
        variantId: v.id,
        sku: v.sku,
        productName: v.product.name,
        variantName: v.name,
        price: (v.salePrice ?? v.price).toFixed(2),
        stockQty: v.stockQty,
      },
    });
  });
  router.get('/orders/:id', requirePermission('orders.view'), async (req, res) => {
    res.json({ data: await adminOrders.getOrder(deps.prisma, pid(req)) });
  });
  router.post(
    '/orders/:id/status',
    requirePermission('orders.update_status', 'orders.cancel'),
    async (req, res) => {
      const input = changeOrderStatusSchema.parse(req.body);
      // Cancelling needs orders.cancel; every other change needs orders.update_status.
      const needed = input.status === 'CANCELLED' ? 'orders.cancel' : 'orders.update_status';
      const admin = req.admin!;
      if (!hasPermission(admin.permissions, needed, admin.role.isSystem)) {
        throw new AppError('FORBIDDEN', 'You do not have permission to do this');
      }
      res.json({
        data: await adminOrders.setStatus(deps, actorFrom(req, deps.env), pid(req), input),
      });
    },
  );
  router.patch('/orders/:id', requirePermission('orders.edit'), async (req, res) => {
    const input = editOrderSchema.parse(req.body);
    res.json({
      data: await adminOrders.editOrder(deps, actorFrom(req, deps.env), pid(req), input),
    });
  });
  router.post('/orders/:id/refunds', requirePermission('payments.refund'), async (req, res) => {
    const input = recordRefundSchema.parse(req.body);
    await paymentAdmin.recordRefund(deps.prisma, actorFrom(req, deps.env), pid(req), input);
    res.status(201).json({ data: await adminOrders.getOrder(deps.prisma, pid(req)) });
  });
  router.get('/payments', requirePermission('orders.view'), async (req, res) => {
    const q = adminPaymentListQuerySchema.parse(req.query);
    const { items, total } = await paymentAdmin.listPayments(deps.prisma, q);
    res.json({ data: items, meta: { page: q.page, pageSize: q.pageSize, total } });
  });
  router.post('/orders/:id/notes', requirePermission('orders.add_note'), async (req, res) => {
    const { note } = orderNoteSchema.parse(req.body);
    res.status(201).json({
      data: await adminOrders.addNote(deps.prisma, actorFrom(req, deps.env), pid(req), note),
    });
  });
  for (const kind of ['invoice', 'packing-slip'] as const) {
    router.get(`/orders/:id/${kind}`, requirePermission('orders.view'), async (req, res) => {
      const id = pid(req);
      const order = await deps.prisma.order.findUnique({
        where: { id },
        select: { orderNumber: true },
      });
      if (!order) throw new AppError('NOT_FOUND', 'Order not found');
      res
        .set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${kind}-${order.orderNumber}.pdf"`,
          'Cache-Control': 'private, no-store',
        })
        .send(await renderOrderPdf(deps.prisma, id, kind));
    });
  }

  // Reviews.
  router.get('/reviews', requirePermission('reviews.moderate'), async (req, res) => {
    const q = adminReviewListQuerySchema.parse(req.query);
    const { items, total } = await reviewAdmin.adminList(deps, q);
    res.json({ data: items, meta: { page: q.page, pageSize: q.pageSize, total } });
  });
  for (const [action, status] of [
    ['approve', 'APPROVED'],
    ['reject', 'REJECTED'],
  ] as const) {
    router.post(
      `/reviews/:id/${action}`,
      requirePermission('reviews.moderate'),
      async (req, res) => {
        await reviewAdmin.setStatus(deps, actorFrom(req, deps.env), pid(req), status);
        res.status(204).end();
      },
    );
  }
  router.post('/reviews/:id/reply', requirePermission('reviews.moderate'), async (req, res) => {
    const { reply } = reviewReplySchema.parse(req.body);
    await reviewAdmin.reply(deps, actorFrom(req, deps.env), pid(req), reply);
    res.status(204).end();
  });
  router.delete('/reviews/:id', requirePermission('reviews.moderate'), async (req, res) => {
    await reviewAdmin.adminDelete(deps, actorFrom(req, deps.env), pid(req));
    res.status(204).end();
  });

  // Shipping, payment methods and coupons.
  router.get('/delivery-zones', requirePermission('shipping.manage'), async (_req, res) => {
    res.json({ data: await shipping.listZones(deps.prisma) });
  });
  router.post('/delivery-zones', requirePermission('shipping.manage'), async (req, res) => {
    const input = createDeliveryZoneSchema.parse(req.body);
    res
      .status(201)
      .json({ data: await shipping.createZone(deps.prisma, actorFrom(req, deps.env), input) });
  });
  router.patch('/delivery-zones/:id', requirePermission('shipping.manage'), async (req, res) => {
    const input = updateDeliveryZoneSchema.parse(req.body);
    res.json({
      data: await shipping.updateZone(deps.prisma, actorFrom(req, deps.env), pid(req), input),
    });
  });
  router.delete('/delivery-zones/:id', requirePermission('shipping.manage'), async (req, res) => {
    await shipping.deleteZone(deps.prisma, actorFrom(req, deps.env), pid(req));
    res.status(204).end();
  });
  router.get('/payment-methods', requirePermission('payments.toggle'), async (_req, res) => {
    res.json({ data: await shipping.listPaymentMethods(deps.prisma) });
  });
  router.patch('/payment-methods/:id', requirePermission('payments.toggle'), async (req, res) => {
    const input = updatePaymentMethodSchema.parse(req.body);
    res.json({
      data: await shipping.updatePaymentMethod(
        deps.prisma,
        actorFrom(req, deps.env),
        pid(req),
        input,
      ),
    });
  });
  router.get('/coupons', requirePermission('coupons.manage'), async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 40) : undefined;
    res.json({ data: await coupons.listCoupons(deps.prisma, q) });
  });
  router.post('/coupons', requirePermission('coupons.manage'), async (req, res) => {
    const input = createCouponSchema.parse(req.body);
    res
      .status(201)
      .json({ data: await coupons.createCoupon(deps.prisma, actorFrom(req, deps.env), input) });
  });
  router.patch('/coupons/:id', requirePermission('coupons.manage'), async (req, res) => {
    const input = updateCouponSchema.parse(req.body);
    res.json({
      data: await coupons.updateCoupon(deps.prisma, actorFrom(req, deps.env), pid(req), input),
    });
  });
  router.delete('/coupons/:id', requirePermission('coupons.manage'), async (req, res) => {
    await coupons.deleteCoupon(deps.prisma, actorFrom(req, deps.env), pid(req));
    res.status(204).end();
  });

  router.get('/settings', requirePermission('settings.manage'), async (_req, res) => {
    res.json({ data: await getAllSettings(deps.prisma) });
  });
  router.put('/settings', requirePermission('settings.manage'), async (req, res) => {
    const input = updateSettingsSchema.parse(req.body);
    res.json({
      data: { values: await updateSettings(deps.prisma, actorFrom(req, deps.env), input) },
    });
  });

  // Policy pages (privacy, terms, returns): plain text the owner writes; shown at fixed paths.
  const pageSlug = (req: Request) => z.object({ slug: legalPageSlugSchema }).parse(req.params).slug;
  router.get('/pages', requirePermission('settings.manage'), async (_req, res) => {
    res.json({ data: await listLegalPages(deps.prisma) });
  });
  router.get('/pages/:slug', requirePermission('settings.manage'), async (req, res) => {
    res.json({ data: await getLegalPage(deps.prisma, pageSlug(req)) });
  });
  router.put('/pages/:slug', requirePermission('settings.manage'), async (req, res) => {
    const slug = pageSlug(req);
    const { body } = updateLegalPageSchema.parse(req.body);
    res.json({ data: await updateLegalPage(deps.prisma, actorFrom(req, deps.env), slug, body) });
  });

  return router;
}

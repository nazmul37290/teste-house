import {
  bulkStatusSchema,
  createProductSchema,
  createVariantSchema,
  idParamSchema,
  productListQuerySchema,
  setProductImagesSchema,
  updateProductSchema,
  updateVariantSchema,
} from '@shop/shared';
import type { Request, RequestHandler } from 'express';
import type { Deps } from '../deps';
import { actorFrom } from '../services/audit.service';
import { AppError } from '../lib/errors';
import * as csv from '../services/product-csv.service';
import * as products from '../services/product.service';

/** Products, variants and product images. Controllers parse and respond; rules live in the service. */
export function productController(deps: Deps) {
  const actor = (req: Request) => actorFrom(req, deps.env);
  const id = (req: Request) => idParamSchema.parse(req.params).id;
  const h = (fn: RequestHandler) => fn;

  return {
    list: h(async (req, res) => {
      const query = productListQuerySchema.parse(req.query);
      const { items, total } = await products.listProducts(deps, query);
      res.json({ data: items, meta: { page: query.page, pageSize: query.pageSize, total } });
    }),
    get: h(async (req, res) => {
      res.json({ data: await products.getProduct(deps, id(req)) });
    }),
    create: h(async (req, res) => {
      res.status(201).json({
        data: await products.createProduct(deps, actor(req), createProductSchema.parse(req.body)),
      });
    }),
    update: h(async (req, res) => {
      res.json({
        data: await products.updateProduct(
          deps,
          actor(req),
          id(req),
          updateProductSchema.parse(req.body),
        ),
      });
    }),
    remove: h(async (req, res) => {
      await products.deleteProduct(deps, actor(req), id(req));
      res.status(204).end();
    }),
    bulkStatus: h(async (req, res) => {
      const { ids, status } = bulkStatusSchema.parse(req.body);
      res.json({ data: await products.bulkSetStatus(deps, actor(req), ids, status) });
    }),
    setImages: h(async (req, res) => {
      const { mediaIds } = setProductImagesSchema.parse(req.body);
      res.json({ data: await products.setProductImages(deps, actor(req), id(req), mediaIds) });
    }),
    addVariant: h(async (req, res) => {
      res.status(201).json({
        data: await products.addVariant(
          deps,
          actor(req),
          id(req),
          createVariantSchema.parse(req.body),
        ),
      });
    }),
    updateVariant: h(async (req, res) => {
      res.json({
        data: await products.updateVariant(
          deps,
          actor(req),
          id(req),
          updateVariantSchema.parse(req.body),
        ),
      });
    }),
    exportCsv: h(async (_req, res) => {
      const body = await csv.exportProductsCsv(deps.prisma);
      const date = new Date().toISOString().slice(0, 10);
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="products-${date}.csv"`,
      });
      res.send(body);
    }),
    importCsv: h(async (req, res) => {
      if (!req.file)
        throw new AppError('VALIDATION_ERROR', 'Choose a CSV file', [
          { path: 'file', message: 'Required' },
        ]);
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(req.file.buffer);
      } catch {
        throw new AppError(
          'VALIDATION_ERROR',
          'The file is not UTF-8 text. Save it as "CSV UTF-8".',
          [{ path: 'file', message: 'Not UTF-8' }],
        );
      }
      const dryRun = req.query.dryRun !== 'false';
      const report = await csv.importProductsCsv(
        deps.prisma,
        actorFrom(req, deps.env),
        text,
        dryRun,
      );
      // A failed apply is a business-rule error carrying the per-row report.
      if (!dryRun && !report.ok) {
        res.status(422).json({
          error: {
            code: 'BUSINESS_RULE',
            message: 'Fix the errors in the file first',
            details: [{ reason: 'CSV_INVALID' }],
          },
          data: report,
        });
        return;
      }
      res.json({ data: report });
    }),
    deleteVariant: h(async (req, res) => {
      res.json({ data: await products.deleteVariant(deps, actor(req), id(req)) });
    }),
  };
}

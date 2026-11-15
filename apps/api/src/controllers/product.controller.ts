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
      res
        .status(201)
        .json({
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
      res
        .status(201)
        .json({
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
    deleteVariant: h(async (req, res) => {
      res.json({ data: await products.deleteVariant(deps, actor(req), id(req)) });
    }),
  };
}

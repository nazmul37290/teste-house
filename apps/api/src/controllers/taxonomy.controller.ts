import {
  createAttributeSchema,
  createAttributeValueSchema,
  createBrandSchema,
  createCategorySchema,
  idParamSchema,
  tagSchema,
  updateAttributeSchema,
  updateAttributeValueSchema,
  updateBrandSchema,
  updateCategorySchema,
  updateTagSchema,
} from '@shop/shared';
import type { Request, RequestHandler } from 'express';
import type { Deps } from '../deps';
import * as attributes from '../services/attribute.service';
import { actorFrom } from '../services/audit.service';
import * as brands from '../services/brand.service';
import * as categories from '../services/category.service';

/** Categories, brands, tags and attributes. Controllers parse and respond; rules live in services. */
export function taxonomyController(deps: Deps) {
  const { prisma } = deps;
  const actor = (req: Request) => actorFrom(req, deps.env);
  const id = (req: Request) => idParamSchema.parse(req.params).id;
  const h = (fn: RequestHandler) => fn;

  return {
    listCategories: h(async (_req, res) => {
      res.json({ data: await categories.listCategories(deps) });
    }),
    createCategory: h(async (req, res) => {
      res.status(201).json({
        data: await categories.createCategory(
          deps,
          actor(req),
          createCategorySchema.parse(req.body),
        ),
      });
    }),
    updateCategory: h(async (req, res) => {
      res.json({
        data: await categories.updateCategory(
          deps,
          actor(req),
          id(req),
          updateCategorySchema.parse(req.body),
        ),
      });
    }),
    deleteCategory: h(async (req, res) => {
      await categories.deleteCategory(deps, actor(req), id(req));
      res.status(204).end();
    }),

    listBrands: h(async (_req, res) => {
      res.json({ data: await brands.listBrands(deps) });
    }),
    createBrand: h(async (req, res) => {
      res.status(201).json({
        data: await brands.createBrand(prisma, actor(req), createBrandSchema.parse(req.body)),
      });
    }),
    updateBrand: h(async (req, res) => {
      res.json({
        data: await brands.updateBrand(
          prisma,
          actor(req),
          id(req),
          updateBrandSchema.parse(req.body),
        ),
      });
    }),
    deleteBrand: h(async (req, res) => {
      await brands.deleteBrand(prisma, actor(req), id(req));
      res.status(204).end();
    }),

    listTags: h(async (_req, res) => {
      res.json({ data: await brands.listTags(prisma) });
    }),
    createTag: h(async (req, res) => {
      res
        .status(201)
        .json({ data: await brands.createTag(prisma, actor(req), tagSchema.parse(req.body)) });
    }),
    updateTag: h(async (req, res) => {
      res.json({
        data: await brands.updateTag(prisma, actor(req), id(req), updateTagSchema.parse(req.body)),
      });
    }),
    deleteTag: h(async (req, res) => {
      await brands.deleteTag(prisma, actor(req), id(req));
      res.status(204).end();
    }),

    listAttributes: h(async (_req, res) => {
      res.json({ data: await attributes.listAttributes(prisma) });
    }),
    createAttribute: h(async (req, res) => {
      res.status(201).json({
        data: await attributes.createAttribute(
          prisma,
          actor(req),
          createAttributeSchema.parse(req.body),
        ),
      });
    }),
    updateAttribute: h(async (req, res) => {
      res.json({
        data: await attributes.updateAttribute(
          prisma,
          actor(req),
          id(req),
          updateAttributeSchema.parse(req.body),
        ),
      });
    }),
    deleteAttribute: h(async (req, res) => {
      await attributes.deleteAttribute(prisma, actor(req), id(req));
      res.status(204).end();
    }),
    addAttributeValue: h(async (req, res) => {
      const input = createAttributeValueSchema.parse(req.body);
      res
        .status(201)
        .json({ data: await attributes.addAttributeValue(prisma, actor(req), id(req), input) });
    }),
    updateAttributeValue: h(async (req, res) => {
      const input = updateAttributeValueSchema.parse(req.body);
      res.json({ data: await attributes.updateAttributeValue(prisma, actor(req), id(req), input) });
    }),
    deleteAttributeValue: h(async (req, res) => {
      res.json({ data: await attributes.deleteAttributeValue(prisma, actor(req), id(req)) });
    }),
  };
}

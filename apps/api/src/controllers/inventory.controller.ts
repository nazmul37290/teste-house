import {
  adjustStockSchema,
  idParamSchema,
  inventoryListQuerySchema,
  movementListQuerySchema,
  receiveStockSchema,
} from '@shop/shared';
import type { Request, RequestHandler } from 'express';
import type { Deps } from '../deps';
import { actorFrom } from '../services/audit.service';
import * as inventory from '../services/inventory.service';

export function inventoryController(deps: Deps) {
  const actor = (req: Request) => actorFrom(req, deps.env);
  const h = (fn: RequestHandler) => fn;

  return {
    list: h(async (req, res) => {
      const query = inventoryListQuerySchema.parse(req.query);
      const { items, total } = await inventory.listStock(deps, query);
      res.json({ data: items, meta: { page: query.page, pageSize: query.pageSize, total } });
    }),
    movements: h(async (req, res) => {
      const query = movementListQuerySchema.parse(req.query);
      const { items, total } = await inventory.listMovements(deps, query);
      res.json({ data: items, meta: { page: query.page, pageSize: query.pageSize, total } });
    }),
    batches: h(async (req, res) => {
      res.json({ data: await inventory.listBatches(deps, idParamSchema.parse(req.params).id) });
    }),
    adjust: h(async (req, res) => {
      res.json({
        data: await inventory.adjustStock(deps, actor(req), adjustStockSchema.parse(req.body)),
      });
    }),
    receive: h(async (req, res) => {
      res
        .status(201)
        .json({
          data: await inventory.receiveStock(deps, actor(req), receiveStockSchema.parse(req.body)),
        });
    }),
  };
}

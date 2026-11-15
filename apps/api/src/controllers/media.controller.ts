import {
  idParamSchema,
  listQuerySchema,
  mediaAltTextSchema,
  updateMediaSchema,
} from '@shop/shared';
import type { Request, RequestHandler } from 'express';
import type { Deps } from '../deps';
import { AppError } from '../lib/errors';
import { actorFrom } from '../services/audit.service';
import * as media from '../services/media.service';

export function mediaController(deps: Deps) {
  const actor = (req: Request) => actorFrom(req, deps.env);
  const id = (req: Request) => idParamSchema.parse(req.params).id;

  return {
    upload: (async (req, res) => {
      if (!req.file)
        throw new AppError('VALIDATION_ERROR', 'Choose an image to upload', [
          { path: 'file', message: 'Required' },
        ]);
      const altText = mediaAltTextSchema.safeParse(req.body?.altText);
      if (!altText.success) {
        throw new AppError('VALIDATION_ERROR', 'Alt text is required', [
          { path: 'altText', message: altText.error.issues[0]?.message ?? 'Required' },
        ]);
      }
      res
        .status(201)
        .json({
          data: await media.uploadMedia(deps, actor(req), {
            body: req.file.buffer,
            altText: altText.data,
          }),
        });
    }) satisfies RequestHandler,

    list: (async (req, res) => {
      const query = listQuerySchema.parse(req.query);
      const { items, total } = await media.listMedia(deps, query);
      res.json({ data: items, meta: { page: query.page, pageSize: query.pageSize, total } });
    }) satisfies RequestHandler,

    update: (async (req, res) => {
      const { altText } = updateMediaSchema.parse(req.body);
      res.json({ data: await media.updateMediaAlt(deps, actor(req), id(req), altText) });
    }) satisfies RequestHandler,

    remove: (async (req, res) => {
      await media.deleteMedia(deps, actor(req), id(req));
      res.status(204).end();
    }) satisfies RequestHandler,
  };
}

import { MEDIA_MAX_BYTES } from '@shop/shared';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../lib/errors';

/**
 * One file in memory (never written under its own name), size-limited before it is read in full.
 * The file's real type is checked from its bytes by the service, not from the name or mimetype.
 */
export function singleUpload(field: string, maxBytes = MEDIA_MAX_BYTES): RequestHandler {
  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 10, fieldSize: 10_000 },
  }).single(field);

  return (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`
            : 'Invalid upload';
        return next(new AppError('VALIDATION_ERROR', message, [{ path: field, message }]));
      }
      next(err);
    });
  };
}

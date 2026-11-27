import { MEDIA_WIDTHS, type MediaWidth } from '@shop/shared';
import sharp, { type Metadata } from 'sharp';

export type ImageKind = 'jpeg' | 'png' | 'webp';

/**
 * Detects the real file type from its first bytes (never from the name or the client's
 * Content-Type). Only JPEG, PNG and WebP are accepted; SVG, GIF, HEIC and everything else are not.
 */
export function detectImageKind(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  return null;
}

export type ProcessedImage = {
  width: number;
  height: number;
  outputs: { width: MediaWidth; body: Buffer }[];
};

/** Decoding limits: refuse decompression bombs and tiny images. */
const MAX_INPUT_PIXELS = 40_000_000;
const MIN_SIDE = 100;

export class ImageRejectedError extends Error {}

/**
 * Re-encodes an upload: applies the EXIF orientation, drops all metadata (EXIF, GPS, ICC), and writes
 * WebP at every MEDIA_WIDTHS width without upscaling.
 */
export async function processImage(input: Buffer, kind: ImageKind): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    // Header only (no pixels are decoded), so no pixel limit here: the size check below can then
    // say what is wrong instead of "not readable". Decoding further down keeps the limit.
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw new ImageRejectedError('The file is not a readable image');
  }
  // The decoder must agree with the magic bytes (a PNG header on JPEG data is rejected).
  if (meta.format !== kind)
    throw new ImageRejectedError('The file content does not match an allowed image type');
  if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_INPUT_PIXELS) {
    throw new ImageRejectedError(
      `The image is too large (${meta.width} × ${meta.height} px). Use at most 40 megapixels, for example 2000 × 2000 px, and upload it again.`,
    );
  }

  // Dimensions after the EXIF orientation is applied (a portrait phone photo stays portrait).
  const { width, height } = meta.autoOrient;
  const base = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).autoOrient();
  if (Math.min(width, height) < MIN_SIDE) {
    throw new ImageRejectedError(`Images must be at least ${MIN_SIDE} px on each side`);
  }

  const outputs = await Promise.all(
    MEDIA_WIDTHS.map(async (w) => ({
      width: w,
      body: await base
        .clone()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer(),
    })),
  );
  return { width, height, outputs };
}

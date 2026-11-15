/**
 * Uploaded images (docs/design.md section 11). Every upload is stored as WebP at these widths:
 * `<path>-<width>.webp`. Images narrower than a width are never upscaled; that file is simply the
 * original size, so every width always exists and URLs never need to check.
 */
export const MEDIA_WIDTHS = [200, 500, 1000, 1600] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;

/** Public URL of one size, e.g. mediaUrl('http://localhost:4000/media', 'products/2026/11/abc', 500). */
export function mediaUrl(publicBase: string, path: string, width: MediaWidth): string {
  return `${publicBase.replace(/\/+$/, '')}/${path}-${width}.webp`;
}

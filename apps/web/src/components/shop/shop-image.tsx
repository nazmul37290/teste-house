'use client';

import Image, { type ImageLoader } from 'next/image';
import type { ShopImage as ShopImageData } from '@/lib/storefront-types';

/** The widths the API stores for every image (packages/shared MEDIA_WIDTHS). */
const WIDTHS = [200, 500, 1000, 1600];

/**
 * Picks our pre-generated WebP file for the requested width, so Next never re-encodes images
 * (they are already resized and compressed on upload). `src` is the base URL without "-<w>.webp".
 */
const loader: ImageLoader = ({ src, width }) =>
  `${src}-${WIDTHS.find((w) => w >= width) ?? 1600}.webp`;

const baseOf = (image: ShopImageData) => (image.urls['200'] ?? '').replace(/-200\.webp$/, '');

/** Responsive product/category/banner image with explicit size (no layout shift). */
export function ShopImage({
  image,
  sizes,
  priority = false,
  className,
  aspect = 'square',
}: {
  image: ShopImageData;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** square: product cards and gallery; natural: the image's own ratio (banners). */
  aspect?: 'square' | 'natural';
}) {
  const width = image.width ?? 1000;
  const height = aspect === 'square' ? width : (image.height ?? width);
  return (
    <Image
      loader={loader}
      src={baseOf(image)}
      alt={image.altText}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  );
}

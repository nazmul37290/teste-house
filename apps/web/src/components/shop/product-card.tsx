import { analyticsItem } from '@shop/shared';
import Link from 'next/link';
import { ItemListTracker } from '@/components/analytics/item-list-tracker';
import type { ProductCard as Card } from '@/lib/storefront-types';
import { Price } from './bits';
import { ShopImage } from './shop-image';
import { Stars } from './stars';
import { WishlistButton } from './wishlist-button';

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const href = `/product/${product.slug}`;
  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <span className="absolute right-2 top-2 z-10">
        <WishlistButton
          productId={product.id}
          name={product.name}
          item={analyticsItem({
            sku: product.sku,
            name: product.name,
            brand: product.brand?.name,
            category: product.category,
            variant: product.variantName,
            price: product.price,
          })}
        />
      </span>
      <Link href={href} className="relative block bg-neutral-50">
        {product.image ? (
          <ShopImage
            image={product.image}
            sizes="(min-width: 1024px) 240px, (min-width: 640px) 33vw, 50vw"
            priority={priority}
            className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="aspect-square w-full" />
        )}
        <span className="absolute left-2 top-2 flex flex-col gap-1">
          {product.regularPrice ? (
            <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">
              Sale
            </span>
          ) : null}
          {product.badges.newArrival ? (
            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">
              New
            </span>
          ) : null}
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {product.brand ? (
          <p className="text-xs uppercase tracking-wide text-neutral-500">{product.brand.name}</p>
        ) : null}
        <h3 className="text-sm font-medium leading-snug text-neutral-900">
          <Link href={href} className="hover:underline">
            {product.name}
          </Link>
        </h3>
        {product.variantName ? (
          <p className="text-xs text-neutral-500">{product.variantName}</p>
        ) : null}
        {product.ratingCount > 0 ? (
          <Stars value={product.ratingAvg} count={product.ratingCount} size="sm" />
        ) : null}
        <div className="mt-auto pt-2">
          <Price
            price={product.price}
            regularPrice={product.regularPrice}
            from={product.hasMultiplePrices}
          />
          {!product.inStock ? (
            <p className="text-xs font-medium text-red-700">Out of stock</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({
  products,
  listName,
  priorityFirst = false,
}: {
  products: Card[];
  /** Name of the list for analytics (view_item_list / select_item). */
  listName: string;
  priorityFirst?: boolean;
}) {
  return (
    <ItemListTracker
      listName={listName}
      products={products}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
    >
      {products.map((p, i) => (
        <ProductCard key={p.slug} product={p} priority={priorityFirst && i < 2} />
      ))}
    </ItemListTracker>
  );
}

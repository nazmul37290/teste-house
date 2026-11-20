import { analyticsItem } from '@shop/shared';
import Link from 'next/link';
import { ItemListTracker } from '@/components/analytics/item-list-tracker';
import { Carousel } from '@/components/carousel';
import type { ProductCard as Card } from '@/lib/storefront-types';
import { Price } from './bits';
import { QuickAdd } from './quick-add';
import { ShopImage } from './shop-image';
import { Stars } from './stars';
import { WishlistButton } from './wishlist-button';

/**
 * Product card: price and stock state are the loudest things on it. Flat and bordered; the border
 * darkens on hover instead of the card lifting.
 */
export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const href = `/product/${product.slug}`;
  const item = analyticsItem({
    sku: product.sku,
    name: product.name,
    brand: product.brand?.name,
    category: product.category,
    variant: product.variantName,
    price: product.price,
  });
  return (
    <article className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors hover:border-neutral-300">
      <span className="absolute right-2 top-2 z-10">
        <WishlistButton productId={product.id} name={product.name} item={item} />
      </span>
      <Link href={href} className="relative block bg-surface" tabIndex={-1} aria-hidden>
        {product.image ? (
          <ShopImage
            image={product.image}
            sizes="(min-width: 1024px) 270px, (min-width: 640px) 33vw, 50vw"
            priority={priority}
            className={`aspect-square w-full object-cover ${product.inStock ? '' : 'opacity-60 grayscale-[40%]'}`}
          />
        ) : (
          <div className="aspect-square w-full bg-neutral-100" />
        )}
        <span className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {product.regularPrice ? <Tag tone="sale">Sale</Tag> : null}
          {product.badges.newArrival ? <Tag tone="new">New</Tag> : null}
          {!product.inStock ? <Tag tone="out">Sold out</Tag> : null}
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-1 border-t border-line p-3 sm:p-4">
        {product.brand ? (
          <p className="truncate text-[13px] text-ink-muted">{product.brand.name}</p>
        ) : null}
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
          <Link href={href} className="after:absolute after:inset-0 hover:text-petrol">
            {product.name}
          </Link>
        </h3>
        {product.variantName ? (
          <p className="text-[13px] text-ink-muted">{product.variantName}</p>
        ) : null}
        {product.ratingCount > 0 ? (
          <Stars value={product.ratingAvg} count={product.ratingCount} size="sm" />
        ) : null}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
          <Price
            price={product.price}
            regularPrice={product.regularPrice}
            from={product.hasMultiplePrices}
          />
          {/* Above the card-wide link so the button stays clickable. */}
          <span className="relative z-10 shrink-0">
            {product.quickAddVariantId ? (
              <QuickAdd variantId={product.quickAddVariantId} name={product.name} item={item} />
            ) : product.inStock ? (
              <Link
                href={href}
                className="inline-flex h-9 items-center rounded-control border border-line px-3 text-sm font-semibold text-petrol transition-colors hover:bg-petrol-tint"
              >
                Options
              </Link>
            ) : null}
          </span>
        </div>
      </div>
    </article>
  );
}

function Tag({ tone, children }: { tone: 'sale' | 'new' | 'out'; children: string }) {
  const cls =
    tone === 'sale'
      ? 'bg-haldi text-petrol'
      : tone === 'new'
        ? 'bg-petrol text-white'
        : 'bg-surface text-ink border border-line';
  return <span className={`rounded-[5px] px-2 py-0.5 text-xs font-bold ${cls}`}>{children}</span>;
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

/** A swipeable row of cards (home sections, related products). */
export function ProductRow({
  products,
  listName,
  label,
  priorityFirst = false,
}: {
  products: Card[];
  listName: string;
  label: string;
  priorityFirst?: boolean;
}) {
  return (
    <ItemListTracker listName={listName} products={products}>
      <Carousel label={label} itemClass="auto-cols-[46%] sm:auto-cols-[31%] lg:auto-cols-[23.5%]">
        {products.map((p, i) => (
          <ProductCard key={p.slug} product={p} priority={priorityFirst && i < 2} />
        ))}
      </Carousel>
    </ItemListTracker>
  );
}

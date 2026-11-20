/** Shapes returned by the public catalog API (apps/api storefront.service). */

export type ShopImage = {
  altText: string;
  width: number | null;
  height: number | null;
  urls: Record<string, string>;
};

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  brand: { name: string; slug: string } | null;
  image: ShopImage | null;
  price: string;
  regularPrice: string | null;
  hasMultiplePrices: boolean;
  variantCount: number;
  variantName: string | null;
  inStock: boolean;
  /** Single in-stock variant: the card can add it to the cart directly. */
  quickAddVariantId: string | null;
  ratingAvg: number;
  ratingCount: number;
  badges: { featured: boolean; newArrival: boolean; bestSeller: boolean };
  sku: string;
  category: string | null;
};

export type Facets = {
  brands: { slug: string; name: string; count: number }[];
  price: { min: string | null; max: string | null };
  attributes: {
    name: string;
    slug: string;
    values: { value: string; slug: string; count: number }[];
  }[];
};

export type ProductPage = {
  items: ProductCard[];
  meta: { page: number; pageSize: number; total: number; facets: Facets };
};

export type CategoryNode = {
  name: string;
  slug: string;
  parentSlug: string | null;
  depth: number;
  image: ShopImage | null;
  productCount: number;
};

export type CategoryDetail = {
  name: string;
  slug: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  image: ShopImage | null;
  breadcrumbs: { name: string; slug: string }[];
  children: CategoryNode[];
};

export type ProductVariant = {
  id: string;
  sku: string;
  name: string;
  unit: string | null;
  unitValue: string | null;
  price: string;
  regularPrice: string | null;
  pricePerUnit: { price: string; per: string } | null;
  inStock: boolean;
  lowStock: boolean;
  attributes: { name: string; value: string }[];
};

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  ingredients: string | null;
  nutritionFacts: { name: string; amount: string }[] | null;
  shelfLife: string | null;
  origin: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  updatedAt: string;
  badges: { featured: boolean; newArrival: boolean; bestSeller: boolean };
  brand: { name: string; slug: string } | null;
  tags: { name: string; slug: string }[];
  breadcrumbs: { name: string; slug: string }[];
  ogImage: ShopImage | null;
  images: ShopImage[];
  variants: ProductVariant[];
  related: ProductCard[];
};

export type HeroBanner = {
  id: string;
  title: string;
  linkUrl: string | null;
  image: ShopImage;
  mobileImage: ShopImage | null;
};

export type HomeSection =
  | { type: 'CATEGORY_GRID'; title: string | null; categories: CategoryNode[] }
  | { type: 'PRODUCT_LIST'; title: string | null; products: ProductCard[]; link: string | null }
  | { type: 'BANNER_STRIP'; title: string | null; banners: HeroBanner[] }
  | { type: 'TEXT'; title: string | null; text: string };

export type Homepage = { hero: HeroBanner[]; sections: HomeSection[] };

export type ReviewItem = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  isVerifiedPurchase: boolean;
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  author: string;
  images: ShopImage[];
};

export type ReviewPage = {
  summary: { average: number; count: number; stars: Record<string, number> };
  items: ReviewItem[];
  meta: { page: number; pageSize: number; total: number };
};

export type RecentReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
  author: string;
  product: { name: string; slug: string };
};

/** What the shop really offers now (GET /store-facts); the home page states only these. */
export type StoreFacts = {
  cashOnDelivery: 'DHAKA_ONLY' | 'NATIONWIDE' | null;
  onlinePayment: boolean;
  nationwideDelivery: boolean;
  deliveryFrom: string | null;
  zones: {
    name: string;
    charge: string;
    estimatedDays: string | null;
    freeDeliveryFrom: string | null;
  }[];
};

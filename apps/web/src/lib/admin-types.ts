/** Shapes returned by the admin API (apps/api services). */
export type Permission = { key: string; module: string; description: string | null };

export type Role = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
};

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  twoFactorEnabled: boolean | null;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; name: string; isSystem: boolean };
};

export type MediaItem = {
  id: string;
  path: string;
  altText: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  createdAt: string;
  urls: Record<'200' | '500' | '1000' | '1600', string>;
};

export type ImageRef = { url: string; altText: string } | null;

export type Category = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageId: string | null;
  image: ImageRef;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  depth: number;
  productCount: number;
  childCount: number;
};

export type Brand = {
  id: string;
  name: string;
  slug: string;
  logoId: string | null;
  logo: ImageRef;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount: number;
};

export type Tag = { id: string; name: string; slug: string; productCount: number };

export type Attribute = {
  id: string;
  name: string;
  slug: string;
  isFilterable: boolean;
  sortOrder: number;
  values: { id: string; value: string; slug: string; sortOrder: number; variantCount: number }[];
};

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  updatedAt: string;
  category: string;
  brand: string | null;
  image: ImageRef;
  variantCount: number;
  priceFrom: string | null;
  priceTo: string | null;
  totalStock: number;
};

export type Variant = {
  id: string;
  sku: string;
  name: string;
  unit: string | null;
  unitValue: string | null;
  price: string;
  salePrice: string | null;
  stockQty: number;
  lowStockThreshold: number;
  weightGrams: number | null;
  barcode: string | null;
  isActive: boolean;
  sortOrder: number;
  attributeValueIds: string[];
  hasHistory: boolean;
};

export type ProductDetail = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  categoryId: string;
  brandId: string | null;
  status: ProductStatus;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  ingredients: string | null;
  nutritionFacts: { name: string; amount: string }[] | null;
  shelfLife: string | null;
  origin: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ogImageId: string | null;
  ogImage: ImageRef;
  tags: { id: string; name: string }[];
  images: {
    mediaId: string;
    isPrimary: boolean;
    altText: string;
    urls: Record<'200' | '500' | '1000' | '1600', string>;
  }[];
  variants: Variant[];
};

/** Lists the product editor needs (categories, brands, tags, attributes). */
export type CatalogLookups = {
  categories: Category[];
  brands: Brand[];
  tags: Tag[];
  attributes: Attribute[];
};

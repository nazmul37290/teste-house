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

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

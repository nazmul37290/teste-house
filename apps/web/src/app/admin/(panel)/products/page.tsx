import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Button, Card, Input, PageHeader, Select } from '@/components/ui';
import { can } from '@/lib/admin-nav';
import { adminForPage } from '@/lib/admin-page';
import type { Category, ProductListItem } from '@/lib/admin-types';
import { apiServer, apiServerList } from '@/lib/api-server';
import { ProductTable } from './product-table';

export const metadata: Metadata = { title: 'Products' };

const PAGE_SIZE = 25;
type Search = { q?: string; status?: string; categoryId?: string; page?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = await adminForPage('products.view');
  if (!admin) return <NoAccess />;
  const { q = '', status = '', categoryId = '', page = '1' } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const filters = {
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
  };
  const query = new URLSearchParams({
    page: String(current),
    pageSize: String(PAGE_SIZE),
    ...filters,
  });

  const [{ items, meta }, categories] = await Promise.all([
    apiServerList<ProductListItem>(`/admin/products?${query}`),
    apiServer<Category[]>('/admin/categories'),
  ]);
  const link = (p: number) =>
    `/admin/products?${new URLSearchParams({ page: String(p), ...filters })}`;

  return (
    <>
      <PageHeader
        title="Products"
        actions={
          <div className="flex items-center gap-4 text-sm">
            {/* A plain link: the browser sends the session cookie and saves the file. */}
            <a href="/api/v1/admin/products/export.csv" className="underline">
              Export CSV
            </a>
            {can(admin, 'products.create') && can(admin, 'products.update') ? (
              <Link href="/admin/products/import" className="underline">
                Import CSV
              </Link>
            ) : null}
            {can(admin, 'products.create') ? (
              <Link
                href="/admin/products/new"
                className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700"
              >
                New product
              </Link>
            ) : null}
          </div>
        }
      />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2" action="/admin/products">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Name or SKU"
            aria-label="Search products"
            className="max-w-xs"
          />
          <Select name="status" defaultValue={status} aria-label="Status" className="max-w-[10rem]">
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
          <Select
            name="categoryId"
            defaultValue={categoryId}
            aria-label="Category"
            className="max-w-xs"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {'— '.repeat(c.depth - 1)}
                {c.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
        <ProductTable items={items} canUpdate={can(admin, 'products.update')} />
        <div className="mt-4 flex items-center justify-between text-sm">
          {current > 1 ? (
            <Link href={link(current - 1)} className="underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-500">{meta.total} products</span>
          {meta.page * meta.pageSize < meta.total ? (
            <Link href={link(current + 1)} className="underline">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </Card>
    </>
  );
}

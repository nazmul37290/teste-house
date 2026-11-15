import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { ProductDetailsForm } from '@/components/admin/product-details-form';
import { Alert, PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import { getCatalogLookups } from '@/lib/api-server';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  if (!(await adminForPage('products.create'))) return <NoAccess />;
  const lookups = await getCatalogLookups();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/products" className="text-neutral-600 underline">
          ← Products
        </Link>
      </p>
      <PageHeader
        title="New product"
        description="Save the details first; variants and images come next."
      />
      <div className="max-w-4xl">
        {lookups.categories.length === 0 ? (
          <Alert tone="warning">
            Create a category first.{' '}
            <Link href="/admin/categories" className="underline">
              Categories
            </Link>
          </Alert>
        ) : (
          <ProductDetailsForm lookups={lookups} />
        )}
      </div>
    </>
  );
}

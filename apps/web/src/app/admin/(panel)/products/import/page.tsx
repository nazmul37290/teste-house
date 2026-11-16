import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Card, PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import { can } from '@/lib/admin-nav';
import { CsvImport } from './csv-import';

export const metadata: Metadata = { title: 'Import products' };

export default async function ImportPage() {
  const admin = await adminForPage('products.create');
  if (!admin || !can(admin, 'products.update')) return <NoAccess />;
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/products" className="text-neutral-600 underline">
          ← Products
        </Link>
      </p>
      <PageHeader
        title="Import products"
        description="Check the file first; nothing is saved until you apply it."
      />
      <div className="max-w-5xl space-y-6">
        <Card title="How the file works">
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
            <li>
              Start from an{' '}
              <a href="/api/v1/admin/products/export.csv" className="underline">
                export
              </a>
              : same columns, one row per variant. Product columns repeat on each of its rows.
            </li>
            <li>
              Products are matched by <code>product_slug</code>, variants by <code>sku</code>: new
              ones are created, existing ones updated.
            </li>
            <li>
              <code>stock</code> is used only for new variants. To change existing stock, use
              Inventory (every change keeps a reason).
            </li>
            <li>
              Categories, brands, tags and attribute values must exist first. Tags: slugs separated
              by <code>;</code>. Attributes and nutrition facts: <code>Name=Value;Name=Value</code>.
            </li>
            <li>
              Images are not imported; add them in the product editor. Save from Excel as “CSV
              UTF-8”.
            </li>
          </ul>
        </Card>
        <CsvImport />
      </div>
    </>
  );
}

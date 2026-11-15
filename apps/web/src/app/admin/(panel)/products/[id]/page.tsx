import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { ProductDetailsForm } from '@/components/admin/product-details-form';
import { Badge, PageHeader } from '@/components/ui';
import { can } from '@/lib/admin-nav';
import { adminForPage } from '@/lib/admin-page';
import type { ProductDetail } from '@/lib/admin-types';
import { apiServer, getCatalogLookups } from '@/lib/api-server';
import { DeleteProduct } from './delete-product';
import { ImagesManager } from './images-manager';
import { VariantsManager } from './variants-manager';

export const metadata: Metadata = { title: 'Edit product' };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await adminForPage('products.view');
  if (!admin) return <NoAccess />;
  const { id } = await params;
  const [product, lookups] = await Promise.all([
    apiServer<ProductDetail>(`/admin/products/${id}`),
    getCatalogLookups(),
  ]);
  const editable = can(admin, 'products.update');

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/products" className="text-neutral-600 underline">
          ← Products
        </Link>
      </p>
      <PageHeader
        title={product.name}
        description={`/product/${product.slug}`}
        actions={
          <Badge tone={product.status === 'ACTIVE' ? 'green' : 'amber'}>
            {product.status.toLowerCase()}
          </Badge>
        }
      />
      <div className="max-w-5xl space-y-8">
        <VariantsManager product={product} attributes={lookups.attributes} editable={editable} />
        <ImagesManager product={product} editable={editable} />
        {editable ? <ProductDetailsForm product={product} lookups={lookups} /> : null}
        {can(admin, 'products.delete') ? <DeleteProduct product={product} /> : null}
      </div>
    </>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { Alert, Button, Card } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { ProductDetail } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

/** Soft delete: the product disappears from the shop and admin lists; past orders keep it. */
export function DeleteProduct({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const { busy, status, run } = useAction();
  return (
    <Card
      title="Delete product"
      description="Removes it from the shop and from these lists. Past orders are not affected."
    >
      {status ? (
        <div className="mb-3">
          <Alert tone={status.tone}>{status.text}</Alert>
        </div>
      ) : null}
      <Button
        variant="danger"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Delete "${product.name}"?`)) return;
          const ok = await run(() =>
            api(`/admin/products/${product.id}`, { method: 'DELETE' }).then(() => true),
          );
          if (ok) router.push('/admin/products');
        }}
      >
        Delete product
      </Button>
    </Card>
  );
}

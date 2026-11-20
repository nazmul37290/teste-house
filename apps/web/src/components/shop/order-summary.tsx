import { formatTaka } from '@/lib/money';

/** Totals block for checkout, confirmation, tracking and the account pages. */
export function Totals({
  subtotal,
  discountTotal,
  deliveryCharge,
  grandTotal,
  couponCode,
}: {
  subtotal: string;
  discountTotal: string;
  deliveryCharge: string;
  grandTotal: string;
  couponCode?: string | null;
}) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd>{formatTaka(subtotal)}</dd>
      </div>
      {discountTotal !== '0.00' ? (
        <div className="flex justify-between text-success">
          <dt>Discount{couponCode ? ` (${couponCode})` : ''}</dt>
          <dd>− {formatTaka(discountTotal)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between">
        <dt>Delivery</dt>
        <dd>{deliveryCharge === '0.00' ? 'Free' : formatTaka(deliveryCharge)}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
        <dt>Total</dt>
        <dd>{formatTaka(grandTotal)}</dd>
      </div>
    </dl>
  );
}

/** Item rows (name, option, quantity, line total). */
export function ItemRows({
  items,
}: {
  items: { productName: string; variantName: string; quantity: number; lineTotal: string }[];
}) {
  return (
    <ul className="divide-y divide-line text-sm">
      {items.map((i, n) => (
        <li key={n} className="flex justify-between gap-3 py-2">
          <span className="min-w-0">
            {i.productName}
            <span className="text-neutral-500">
              {' '}
              · {i.variantName} × {i.quantity}
            </span>
          </span>
          <span className="shrink-0">{formatTaka(i.lineTotal)}</span>
        </li>
      ))}
    </ul>
  );
}

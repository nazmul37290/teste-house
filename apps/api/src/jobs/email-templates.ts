/**
 * Transactional email templates. Every value is HTML-escaped; the store name and logo always come
 * from the `store.name` and `store.logo` settings (never hardcoded).
 */
import { formatTaka } from '@shop/shared';

export type EmailTemplates = {
  'email-verify': { name: string; url: string };
  'password-reset': { name: string; url: string };
  'admin-low-stock': {
    productName: string;
    variantName: string;
    sku: string;
    stockQty: number;
    threshold: number;
    url: string;
  };
  'order-placed': OrderEmailData & { trackUrl: string };
  'order-confirmed': OrderEmailData & { trackUrl: string };
  'order-cancelled': {
    name: string;
    orderNumber: string;
    byCustomer: boolean;
    reason: string | null;
  };
  'admin-payment-review': { orderNumber: string; problem: string; url: string };
  'order-shipped': {
    name: string;
    orderNumber: string;
    trackingCode: string | null;
    courierTrackingUrl: string | null;
    trackUrl: string;
  };
  'order-delivered': { name: string; orderNumber: string };
  'admin-new-order': {
    orderNumber: string;
    customerName: string;
    phone: string;
    district: string;
    itemCount: number;
    grandTotal: string;
    paymentMethod: string;
    url: string;
  };
};
export type EmailTemplateName = keyof EmailTemplates;

/** Order summary shared by the customer order emails. Money values are API strings ("1680.00"). */
export type OrderEmailData = {
  name: string;
  orderNumber: string;
  items: { name: string; quantity: number; lineTotal: string }[];
  subtotal: string;
  discountTotal: string;
  deliveryCharge: string;
  grandTotal: string;
  paymentMethod: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

/** Store branding from settings. logoUrl is an absolute URL, or undefined to show the name only. */
export type Brand = { name: string; logoUrl?: string };

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

function layout(brand: Brand, bodyHtml: string): string {
  const header = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" style="max-height:48px;margin:0 0 24px">`
    : `<p style="margin:0 0 24px;font-size:18px;font-weight:bold">${escapeHtml(brand.name)}</p>`;
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,sans-serif;color:#171717">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
${header}
${bodyHtml}
</div></body></html>`;
}

function orderTable(o: OrderEmailData): { html: string; text: string } {
  const row = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 0">${bold ? '<strong>' : ''}${escapeHtml(label)}${bold ? '</strong>' : ''}</td><td style="padding:4px 0;text-align:right">${bold ? '<strong>' : ''}${escapeHtml(value)}${bold ? '</strong>' : ''}</td></tr>`;
  const items = o.items
    .map((i) => row(`${i.name} × ${i.quantity}`, formatTaka(i.lineTotal)))
    .join('');
  const discount =
    o.discountTotal !== '0.00' ? row('Discount', `− ${formatTaka(o.discountTotal)}`) : '';
  const html = `<table style="width:100%;border-collapse:collapse;font-size:14px">${items}
<tr><td colspan="2" style="border-top:1px solid #e5e5e5;padding-top:4px"></td></tr>
${row('Subtotal', formatTaka(o.subtotal))}${discount}${row('Delivery', formatTaka(o.deliveryCharge))}${row('Total', formatTaka(o.grandTotal), true)}</table>
<p style="font-size:14px">Payment: ${escapeHtml(o.paymentMethod)}</p>`;
  const text = [
    ...o.items.map((i) => `${i.name} x ${i.quantity}: ${formatTaka(i.lineTotal)}`),
    `Subtotal: ${formatTaka(o.subtotal)}`,
    ...(o.discountTotal !== '0.00' ? [`Discount: -${formatTaka(o.discountTotal)}`] : []),
    `Delivery: ${formatTaka(o.deliveryCharge)}`,
    `Total: ${formatTaka(o.grandTotal)}`,
    `Payment: ${o.paymentMethod}`,
  ].join('\n');
  return { html, text };
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#171717;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>
<p style="font-size:13px;color:#525252">If the button does not work, copy this link into your browser:<br>${escapeHtml(url)}</p>`;
}

const renderers: {
  [K in EmailTemplateName]: (data: EmailTemplates[K], brand: Brand) => RenderedEmail;
} = {
  'email-verify': ({ name, url }, brand) => ({
    subject: `Verify your email for ${brand.name}`,
    html: layout(
      brand,
      `<p>Hi ${escapeHtml(name)},</p><p>Please confirm your email address. The link is valid for 24 hours.</p>${button(url, 'Verify email')}<p style="font-size:13px;color:#525252">If you did not create an account, you can ignore this email.</p>`,
    ),
    text: `Hi ${name},\n\nPlease confirm your email address for ${brand.name} (valid for 24 hours):\n${url}\n\nIf you did not create an account, you can ignore this email.`,
  }),
  'password-reset': ({ name, url }, brand) => ({
    subject: `Reset your ${brand.name} password`,
    html: layout(
      brand,
      `<p>Hi ${escapeHtml(name)},</p><p>We received a request to reset your password. The link is valid for 1 hour.</p>${button(url, 'Reset password')}<p style="font-size:13px;color:#525252">If you did not ask for this, ignore this email; your password stays the same.</p>`,
    ),
    text: `Hi ${name},\n\nReset your ${brand.name} password (valid for 1 hour):\n${url}\n\nIf you did not ask for this, ignore this email; your password stays the same.`,
  }),
  'admin-low-stock': ({ productName, variantName, sku, stockQty, threshold, url }, brand) => ({
    subject: `Low stock: ${productName} (${variantName})`,
    html: layout(
      brand,
      `<p>Stock is running low:</p>
<p style="font-size:16px"><strong>${escapeHtml(productName)}</strong> — ${escapeHtml(variantName)}<br>SKU ${escapeHtml(sku)}</p>
<p><strong>${stockQty}</strong> left (alert level ${threshold}).</p>${button(url, 'Open inventory')}`,
    ),
    text: `Low stock at ${brand.name}:

${productName} — ${variantName} (SKU ${sku})
${stockQty} left (alert level ${threshold}).

${url}`,
  }),
  'order-placed': (o, brand) => {
    const t = orderTable(o);
    return {
      subject: `Order ${o.orderNumber} received – ${brand.name}`,
      html: layout(
        brand,
        `<p>Hi ${escapeHtml(o.name)},</p><p>Thank you! We have received your order <strong>${escapeHtml(o.orderNumber)}</strong>. We will call or message you to confirm it.</p>${t.html}${button(o.trackUrl, 'Track your order')}`,
      ),
      text: `Hi ${o.name},

Thank you! We have received your order ${o.orderNumber}. We will call or message you to confirm it.

${t.text}

Track your order: ${o.trackUrl}`,
    };
  },
  'order-confirmed': (o, brand) => {
    const t = orderTable(o);
    return {
      subject: `Order ${o.orderNumber} confirmed – ${brand.name}`,
      html: layout(
        brand,
        `<p>Hi ${escapeHtml(o.name)},</p><p>Your order <strong>${escapeHtml(o.orderNumber)}</strong> is confirmed. We are getting it ready.</p>${t.html}${button(o.trackUrl, 'Track your order')}`,
      ),
      text: `Hi ${o.name},\n\nYour order ${o.orderNumber} is confirmed. We are getting it ready.\n\n${t.text}\n\nTrack your order: ${o.trackUrl}`,
    };
  },
  'order-cancelled': ({ name, orderNumber, byCustomer, reason }, brand) => {
    const why = byCustomer
      ? 'As you asked, we have cancelled your order'
      : 'We are sorry: we had to cancel your order';
    const note = reason && !byCustomer ? `Reason: ${reason}` : '';
    return {
      subject: `Order ${orderNumber} cancelled – ${brand.name}`,
      html: layout(
        brand,
        `<p>Hi ${escapeHtml(name)},</p><p>${why} <strong>${escapeHtml(orderNumber)}</strong>.</p>${note ? `<p>${escapeHtml(note)}</p>` : ''}<p>Nothing is due for this order. If you have questions, reply to this email.</p>`,
      ),
      text: `Hi ${name},\n\n${why} ${orderNumber}.\n${note ? `${note}\n` : ''}Nothing is due for this order. If you have questions, reply to this email.`,
    };
  },
  'order-shipped': ({ name, orderNumber, trackingCode, courierTrackingUrl, trackUrl }, brand) => ({
    subject: `Order ${orderNumber} is on its way – ${brand.name}`,
    html: layout(
      brand,
      `<p>Hi ${escapeHtml(name)},</p><p>Your order <strong>${escapeHtml(orderNumber)}</strong> is with the courier.${trackingCode ? ` Tracking code: <strong>${escapeHtml(trackingCode)}</strong>.` : ''}</p>${button(courierTrackingUrl ?? trackUrl, 'Track your parcel')}<p style="font-size:13px;color:#525252">If you pay on delivery, please keep the amount ready.</p>`,
    ),
    text: `Hi ${name},\n\nYour order ${orderNumber} is with the courier.${trackingCode ? ` Tracking code: ${trackingCode}.` : ''}\n\nTrack your parcel: ${courierTrackingUrl ?? trackUrl}\n\nIf you pay on delivery, please keep the amount ready.`,
  }),
  'order-delivered': ({ name, orderNumber }, brand) => ({
    subject: `Order ${orderNumber} delivered – ${brand.name}`,
    html: layout(
      brand,
      `<p>Hi ${escapeHtml(name)},</p><p>Your order <strong>${escapeHtml(orderNumber)}</strong> has been delivered. Thank you for shopping with us!</p>`,
    ),
    text: `Hi ${name},\n\nYour order ${orderNumber} has been delivered. Thank you for shopping with us!`,
  }),
  'admin-payment-review': ({ orderNumber, problem, url }, brand) => ({
    subject: `Payment needs review: ${orderNumber}`,
    html: layout(
      brand,
      `<p>An online payment for order <strong>${escapeHtml(orderNumber)}</strong> needs your attention:</p><p>${escapeHtml(problem)}</p>${button(url, 'Open order')}`,
    ),
    text: `An online payment for order ${orderNumber} at ${brand.name} needs your attention:\n\n${problem}\n\n${url}`,
  }),
  'admin-new-order': (o, brand) => ({
    subject: `New order ${o.orderNumber}: ${formatTaka(o.grandTotal)}`,
    html: layout(
      brand,
      `<p>A new order arrived:</p>
<p style="font-size:16px"><strong>${escapeHtml(o.orderNumber)}</strong> — ${formatTaka(o.grandTotal)} (${escapeHtml(o.paymentMethod)})</p>
<p>${escapeHtml(o.customerName)}, ${escapeHtml(o.phone)}, ${escapeHtml(o.district)}<br>${o.itemCount} item(s)</p>${button(o.url, 'Open order')}`,
    ),
    text: `New order at ${brand.name}: ${o.orderNumber}, ${formatTaka(o.grandTotal)} (${o.paymentMethod})
${o.customerName}, ${o.phone}, ${o.district}
${o.itemCount} item(s)

${o.url}`,
  }),
};

export function renderEmail<K extends EmailTemplateName>(
  template: K,
  data: EmailTemplates[K],
  brand: Brand,
): RenderedEmail {
  return renderers[template](data, brand);
}

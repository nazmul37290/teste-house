/**
 * Transactional email templates. Every value is HTML-escaped; the store name and logo always come
 * from the `store.name` and `store.logo` settings (never hardcoded).
 */
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
};
export type EmailTemplateName = keyof EmailTemplates;

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
};

export function renderEmail<K extends EmailTemplateName>(
  template: K,
  data: EmailTemplates[K],
  brand: Brand,
): RenderedEmail {
  return renderers[template](data, brand);
}

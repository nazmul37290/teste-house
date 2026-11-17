import { formatTaka } from '@shop/shared';
import PDFDocument from 'pdfkit';
import type { Db } from '../lib/prisma';
import { findSettingValue } from '../repositories/settings.repository';

/**
 * Invoice and packing slip PDFs (pdfkit, built-in Helvetica). Built on demand from the stored order
 * snapshot, never from current product prices. The built-in fonts have no taka sign, so money is
 * written "Tk 1,680" (formatTaka), the same as on the website.
 */

export type PdfKind = 'invoice' | 'packing-slip';

const dhakaDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const STATUS_TEXT: Record<string, string> = {
  UNPAID: 'Unpaid',
  PENDING: 'Pending',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partly refunded',
};

async function loadOrder(prisma: Db, orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      placedAt: true,
      paymentStatus: true,
      contactName: true,
      contactPhone: true,
      contactEmail: true,
      couponCode: true,
      subtotal: true,
      discountTotal: true,
      deliveryCharge: true,
      grandTotal: true,
      customerNote: true,
      paymentMethod: { select: { name: true, code: true } },
      address: true,
      items: {
        select: {
          productName: true,
          variantName: true,
          sku: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
        },
        orderBy: { productName: 'asc' },
      },
    },
  });
}

async function storeInfo(prisma: Db) {
  const text = async (key: Parameters<typeof findSettingValue>[1]) => {
    const v = await findSettingValue(prisma, key);
    return typeof v === 'string' ? v.trim() : '';
  };
  const [name, address, phone, email] = await Promise.all([
    text('store.name'),
    text('store.address'),
    text('store.phone'),
    text('store.email'),
  ]);
  return { name: name || 'Our store', address, phone, email };
}

export async function renderOrderPdf(prisma: Db, orderId: string, kind: PdfKind): Promise<Buffer> {
  const [o, store] = await Promise.all([loadOrder(prisma, orderId), storeInfo(prisma)]);
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: { Title: `${o.orderNumber} ${kind}` },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // Header: store details left, document title right.
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(store.name, left, 48, { width: width / 2 });
  doc.font('Helvetica').fontSize(9).fillColor('#444');
  for (const line of [store.address, store.phone, store.email].filter(Boolean))
    doc.text(line, { width: width / 2 });
  doc
    .fillColor('#000')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(kind === 'invoice' ? 'INVOICE' : 'PACKING SLIP', left, 48, { width, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(o.orderNumber, { width, align: 'right' })
    .text(dhakaDate.format(o.placedAt), { width, align: 'right' })
    .text(`${o.paymentMethod.name} · ${STATUS_TEXT[o.paymentStatus] ?? o.paymentStatus}`, {
      width,
      align: 'right',
    });

  // Customer and delivery address.
  let y = Math.max(doc.y, 130) + 16;
  doc.font('Helvetica-Bold').fontSize(10).text('Deliver to', left, y);
  doc.font('Helvetica').fontSize(10);
  const a = o.address;
  const addressLines = a
    ? [
        a.recipientName,
        a.phone,
        a.addressLine,
        [a.upazila, a.district, a.postalCode].filter(Boolean).join(', '),
        a.division,
        ...(a.deliveryNote ? [`Note: ${a.deliveryNote}`] : []),
      ]
    : [o.contactName, o.contactPhone];
  for (const line of addressLines) doc.text(line, { width: width / 2 });
  const addressEnd = doc.y;
  if (kind === 'invoice') {
    doc.font('Helvetica-Bold').text('Customer', left + width / 2, y, { width: width / 2 });
    doc.font('Helvetica');
    for (const line of [o.contactName, o.contactPhone, o.contactEmail ?? ''].filter(Boolean)) {
      doc.text(line, left + width / 2, doc.y, { width: width / 2 });
    }
  }

  // Items table.
  y = Math.max(addressEnd, doc.y) + 24;
  const cols =
    kind === 'invoice'
      ? [
          { title: 'Item', x: left, w: width * 0.52, align: 'left' as const },
          { title: 'Qty', x: left + width * 0.52, w: width * 0.1, align: 'right' as const },
          { title: 'Unit price', x: left + width * 0.62, w: width * 0.18, align: 'right' as const },
          { title: 'Total', x: left + width * 0.8, w: width * 0.2, align: 'right' as const },
        ]
      : [
          { title: 'Item', x: left, w: width * 0.55, align: 'left' as const },
          { title: 'SKU', x: left + width * 0.55, w: width * 0.25, align: 'left' as const },
          { title: 'Qty', x: left + width * 0.8, w: width * 0.1, align: 'right' as const },
          { title: 'Packed', x: left + width * 0.9, w: width * 0.1, align: 'right' as const },
        ];
  doc.font('Helvetica-Bold').fontSize(9);
  for (const c of cols) doc.text(c.title, c.x, y, { width: c.w, align: c.align });
  y += 14;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#bbb').stroke();
  y += 6;
  doc.font('Helvetica').fontSize(9);
  for (const item of o.items) {
    if (y > doc.page.height - 160) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    const name = `${item.productName} (${item.variantName})`;
    const cells =
      kind === 'invoice'
        ? [
            name,
            String(item.quantity),
            formatTaka(item.unitPrice.toFixed(2)),
            formatTaka(item.lineTotal.toFixed(2)),
          ]
        : [name, item.sku, String(item.quantity), '[   ]'];
    const rowHeight = Math.max(
      ...cells.map((t, i) => doc.heightOfString(t, { width: cols[i]!.w })),
    );
    cells.forEach((t, i) =>
      doc.text(t, cols[i]!.x, y, { width: cols[i]!.w, align: cols[i]!.align }),
    );
    y += rowHeight + 6;
  }
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#bbb').stroke();
  y += 10;

  if (kind === 'invoice') {
    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10);
      doc.text(label, left + width * 0.5, y, { width: width * 0.3, align: 'right' });
      doc.text(value, left + width * 0.8, y, { width: width * 0.2, align: 'right' });
      y += bold ? 18 : 15;
    };
    row('Subtotal', formatTaka(o.subtotal.toFixed(2)));
    if (o.discountTotal.toFixed(2) !== '0.00') {
      row(
        `Discount${o.couponCode ? ` (${o.couponCode})` : ''}`,
        `- ${formatTaka(o.discountTotal.toFixed(2))}`,
      );
    }
    row('Delivery', formatTaka(o.deliveryCharge.toFixed(2)));
    row('Total', formatTaka(o.grandTotal.toFixed(2)), true);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#555')
      .text('All prices are in Bangladeshi Taka and include VAT.', left, y + 12, { width });
  } else {
    const count = o.items.reduce((n, i) => n + i.quantity, 0);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(`${count} item(s) in total`, left, y, { width, align: 'right' });
    if (o.paymentMethod.code === 'COD' && o.paymentStatus !== 'PAID') {
      doc.text(`Collect on delivery: ${formatTaka(o.grandTotal.toFixed(2))}`, left, doc.y + 4, {
        width,
        align: 'right',
      });
    }
    if (o.customerNote)
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(`Customer note: ${o.customerNote}`, left, doc.y + 12, { width });
  }

  doc.end();
  return done;
}

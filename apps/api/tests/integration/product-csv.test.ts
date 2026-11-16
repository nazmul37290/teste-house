import { SUPER_ADMIN_ROLE } from '@shop/shared';
import Papa from 'papaparse';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stripBom } from '../../src/services/product-csv.service';
import { adminHeaders, adminSession, createTestContext } from './helpers';

const ctx = createTestContext();
afterAll(() => ctx.close());
const { prisma } = ctx.deps;

let h: Record<string, string>;
let catSlug: string;
let brandSlug: string;
let tagSlug: string;
let attrName: string;
beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
  catSlug = (await prisma.category.create({ data: { name: 'CSV cat', slug: `csv-cat-${u()}` } }))
    .slug;
  brandSlug = (
    await prisma.brand.create({ data: { name: `CSV brand ${u()}`, slug: `csv-brand-${u()}` } })
  ).slug;
  tagSlug = (await prisma.tag.create({ data: { name: `CSV tag ${u()}`, slug: `csv-tag-${u()}` } }))
    .slug;
  attrName = `Flavour ${u()}`;
  await prisma.attribute.create({
    data: {
      name: attrName,
      slug: `flavour-${u()}`,
      values: {
        create: [
          { value: 'Plain', slug: 'plain' },
          { value: 'Chocolate', slug: 'chocolate' },
        ],
      },
    },
  });
});

function u() {
  return `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}
/** Papa.unparse takes columns from the first object only, so pass every key used by any row. */
function csvOf(rows: Record<string, string | undefined>[]) {
  const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return Papa.unparse({ fields, data: rows.map((r) => fields.map((f) => r[f] ?? '')) });
}
function upload(csv: string | Buffer, dryRun: boolean, headers = h) {
  return request(ctx.app)
    .post(`/api/v1/admin/products/import?dryRun=${dryRun}`)
    .set(headers)
    .attach('file', Buffer.isBuffer(csv) ? csv : Buffer.from(csv, 'utf8'), {
      filename: 'products.csv',
      contentType: 'text/csv',
    });
}
const exportCsv = async () =>
  (await request(ctx.app).get('/api/v1/admin/products/export.csv').set(h)).text;

function honeyRows(slug: string, sku: string) {
  const base = {
    product_slug: slug,
    product_name: 'Imported Honey',
    category_slug: catSlug,
    brand_slug: brandSlug,
    status: 'ACTIVE',
    tags: tagSlug,
  };
  return [
    {
      ...base,
      sku: `${sku}-250`,
      unit: 'G',
      unit_value: '250',
      price: '260',
      stock: '8',
      attributes: `${attrName}=Plain`,
    },
    {
      ...base,
      sku: `${sku}-500`,
      unit: 'G',
      unit_value: '500',
      price: '450',
      sale_price: '420',
      stock: '0',
      attributes: `${attrName}=Chocolate`,
    },
  ];
}

describe('CSV import', () => {
  it('previews without writing, then applies: products, variants, tags, attributes, opening stock', async () => {
    const slug = `imported-honey-${u()}`;
    const sku = `IMP-${u()}`;
    const preview = await upload(csvOf(honeyRows(slug, sku)), true);
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({
      ok: true,
      applied: false,
      products: { create: 1, update: 0 },
      variants: { create: 2, update: 0 },
    });
    expect(await prisma.product.count({ where: { slug } })).toBe(0);

    const applied = await upload(csvOf(honeyRows(slug, sku)), false);
    expect(applied.body.data.applied).toBe(true);
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug },
      include: {
        variants: { include: { attributeValues: true }, orderBy: { sku: 'asc' } },
        tags: true,
      },
    });
    expect(product.status).toBe('ACTIVE');
    expect(product.tags).toHaveLength(1);
    expect(
      product.variants.map((v) => [
        v.sku,
        v.name,
        v.stockQty,
        v.price.toFixed(2),
        v.salePrice?.toFixed(2) ?? null,
      ]),
    ).toEqual([
      [`${sku}-250`, '250 g', 8, '260.00', null],
      [`${sku}-500`, '500 g', 0, '450.00', '420.00'],
    ]);
    expect(product.variants.every((v) => v.attributeValues.length === 1)).toBe(true);
    const moves = await prisma.stockMovement.findMany({
      where: { variant: { productId: product.id } },
    });
    expect(moves.map((m) => [m.type, m.quantity, m.reason])).toEqual([
      ['PURCHASE', 8, 'CSV import'],
    ]);
  });

  it('updates existing products and variants but never their stock', async () => {
    const slug = `update-honey-${u()}`;
    const sku = `UPD-${u()}`;
    await upload(csvOf(honeyRows(slug, sku)), false);
    const rows = honeyRows(slug, sku).map((r) => ({
      ...r,
      product_name: 'Renamed Honey',
      price: r.sku.endsWith('250') ? '275' : r.price,
      stock: '999',
    }));
    const res = await upload(csvOf(rows), false);
    expect(res.body.data).toMatchObject({
      applied: true,
      products: { create: 0, update: 1 },
      variants: { create: 0, update: 2 },
    });
    const v = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: `${sku}-250` },
      include: { product: true },
    });
    expect(v.product.name).toBe('Renamed Honey');
    expect(v.price.toFixed(2)).toBe('275.00');
    expect(v.stockQty).toBe(8); // stock column ignored for existing variants
  });

  it('round-trips its own export (every row an update, no errors)', async () => {
    await upload(csvOf(honeyRows(`roundtrip-${u()}`, `RT-${u()}`)), false);
    const preview = await upload(await exportCsv(), true);
    expect(preview.body.data.ok).toBe(true);
    expect(preview.body.data.products.create).toBe(0);
    expect(preview.body.data.rows.every((r: { action: string }) => r.action === 'update')).toBe(
      true,
    );
  });

  it('reports every problem per row and writes nothing when any row is wrong', async () => {
    const taken = `TAKEN-${u()}`;
    await upload(
      csvOf([
        {
          product_slug: `owner-${u()}`,
          product_name: 'Owner',
          category_slug: catSlug,
          sku: taken,
          variant_label: 'One',
          price: '10',
        },
      ]),
      false,
    );

    const slug = `bad-${u()}`;
    const good = {
      product_slug: `fine-${u()}`,
      product_name: 'Fine',
      category_slug: catSlug,
      sku: `FINE-${u()}`,
      variant_label: 'x',
      price: '10',
    };
    const rows = [
      good,
      {
        product_slug: slug,
        product_name: 'Bad',
        category_slug: 'no-such-category',
        sku: `B1-${u()}`,
        variant_label: 'x',
        price: '10',
      },
      {
        product_slug: slug,
        product_name: 'Different name',
        category_slug: 'no-such-category',
        sku: taken,
        variant_label: 'x',
        price: '12.345',
      },
      {
        product_slug: `x-${u()}`,
        product_name: 'X',
        category_slug: catSlug,
        sku: `X-${u()}`,
        unit: 'G',
        price: '5',
        attributes: 'Colour=Red',
      },
      {
        product_slug: `y-${u()}`,
        product_name: 'Y',
        category_slug: catSlug,
        sku: good.sku,
        variant_label: 'dup',
        price: '5',
        stock: 'lots',
      },
    ];
    const preview = (await upload(csvOf(rows), true)).body.data;
    expect(preview.ok).toBe(false);
    const errs = (line: number) =>
      preview.rows.find((r: { row: number }) => r.row === line).errors.join(' | ');
    expect(errs(2)).toBe('');
    expect(errs(3)).toContain('category_slug: "no-such-category" does not exist');
    expect(errs(4)).toContain('differs from line 3');
    expect(errs(4)).toContain(`sku: ${taken} already belongs to another product`);
    expect(errs(4)).toMatch(/price/);
    expect(errs(5)).toContain('attributes: "Colour=Red" does not exist');
    expect(errs(5)).toMatch(/unitValue/);
    expect(errs(6)).toContain('also used on line 2');
    expect(errs(6)).toContain('stock: must be a whole number');

    const apply = await upload(csvOf(rows), false);
    expect(apply.status).toBe(422);
    expect(await prisma.product.count({ where: { slug: good.product_slug } })).toBe(0); // nothing written, not even the good row
  });

  it('accepts product-only rows (no variants yet) but not variant data without a sku', async () => {
    const slug = `draft-only-${u()}`;
    const ok = await upload(
      csvOf([{ product_slug: slug, product_name: 'Draft only', category_slug: catSlug, sku: '' }]),
      false,
    );
    expect(ok.body.data.applied).toBe(true);
    expect(await prisma.product.count({ where: { slug, variants: { none: {} } } })).toBe(1);

    const bad = (
      await upload(
        csvOf([
          {
            product_slug: `p-${u()}`,
            product_name: 'P',
            category_slug: catSlug,
            sku: '',
            price: '10',
          },
        ]),
        true,
      )
    ).body.data;
    expect(bad.rows[0].errors).toEqual(['sku: required when price is filled']);
  });

  it('rejects files with unknown or missing columns, and files that are not UTF-8', async () => {
    const bad = await upload('product_slug,colour\nx,red\n', true);
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/Unknown columns: colour/);
    expect(bad.body.error.message).toMatch(/Missing columns/);
    expect((await upload(Buffer.from([0xff, 0xfe, 0x00, 0x41]), true)).status).toBe(400);
  });

  it('neutralises spreadsheet formulas on export and restores them on import', async () => {
    const slug = `formula-${u()}`;
    const description = '- Pure honey\n- No sugar added';
    await upload(
      csvOf([
        {
          product_slug: slug,
          product_name: 'Formula',
          category_slug: catSlug,
          sku: `F-${u()}`,
          variant_label: 'x',
          price: '10',
          description,
          seo_title: '=HYPERLINK("http://evil")',
        },
      ]),
      false,
    );
    const exported = Papa.parse<Record<string, string>>(stripBom(await exportCsv()), {
      header: true,
    }).data.find((r) => r.product_slug === slug)!;
    expect(exported.seo_title).toBe(`'=HYPERLINK("http://evil")`);
    expect(exported.description).toBe(`'${description}`);

    await upload(Papa.unparse([{ ...exported, product_name: 'Formula 2' }]), false);
    const product = await prisma.product.findUniqueOrThrow({ where: { slug } });
    expect(product.description).toBe(description); // the marker is stripped again
  });

  it('needs products.create and products.update to import, products.view to export', async () => {
    const salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie);
    expect((await upload(csvOf(honeyRows(`p-${u()}`, `P-${u()}`)), true, salesman)).status).toBe(
      403,
    );
    expect(
      (await request(ctx.app).get('/api/v1/admin/products/export.csv').set(salesman)).status,
    ).toBe(200);
  });
});

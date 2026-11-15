import { describe, expect, it } from 'vitest';
import { createVariantSchema, moneySchema, updateVariantSchema } from '../src/catalog-schemas';
import { parseThousandths, pricePerUnit, variantLabel } from '../src/product';

describe('variantLabel', () => {
  it.each([
    ['G', '500', '500 g'],
    ['G', '500.000', '500 g'],
    ['L', '1.5', '1.5 L'],
    ['KG', '0.250', '0.25 kg'],
    ['PCS', '12', '12 pcs'],
    ['PACK', '1', '1 pack'],
  ] as const)('%s %s -> %s', (unit, value, label) => {
    expect(variantLabel(unit, value)).toBe(label);
  });

  it('parses amounts as integer thousandths', () => {
    expect(parseThousandths('1.5')).toBe(1500);
    expect(parseThousandths('0.001')).toBe(1);
    expect(() => parseThousandths('1.2345')).toThrow();
    expect(() => parseThousandths('1e3')).toThrow();
  });
});

describe('pricePerUnit (display only)', () => {
  it('gives the price per 100 g / 100 ml / piece in integer paisa', () => {
    expect(pricePerUnit(45000, 'G', '500')).toEqual({ paisa: 9000, per: '100 g' }); // Tk 450 for 500 g -> Tk 90 / 100 g
    expect(pricePerUnit(120000, 'KG', '1')).toEqual({ paisa: 12000, per: '100 g' });
    expect(pricePerUnit(36000, 'L', '1.5')).toEqual({ paisa: 2400, per: '100 ml' });
    expect(pricePerUnit(24000, 'DOZEN', '1')).toEqual({ paisa: 2000, per: '1 piece' });
  });

  it('rounds half up and handles large prices without overflow', () => {
    expect(pricePerUnit(100, 'G', '300')).toEqual({ paisa: 33, per: '100 g' }); // 33.33 -> 33
    expect(pricePerUnit(250, 'G', '1000')).toEqual({ paisa: 25, per: '100 g' }); // exact
    expect(pricePerUnit(5, 'G', '200')).toEqual({ paisa: 3, per: '100 g' }); // 2.5 -> 3
    expect(pricePerUnit(999_999_999, 'G', '1')?.paisa).toBe(99_999_999_900);
  });

  it('is null without net content', () => {
    expect(pricePerUnit(1000, null, null)).toBeNull();
  });
});

describe('money and variant schemas', () => {
  it('normalizes money to two decimals and rejects floats-in-disguise', () => {
    expect(moneySchema.parse('450')).toBe('450.00');
    expect(moneySchema.parse('450.5')).toBe('450.50');
    for (const bad of ['-1', '1e3', '450.555', '12,50', '', '10000000'])
      expect(moneySchema.safeParse(bad).success).toBe(false);
  });

  const base = { sku: 'honey-500', price: '450' };

  it('needs the unit and amount together, a label when there is no net content, and sale < price', () => {
    expect(createVariantSchema.safeParse({ ...base, unit: 'G', unitValue: '500' }).success).toBe(
      true,
    );
    expect(createVariantSchema.parse({ ...base, unit: 'G', unitValue: '500' }).sku).toBe(
      'HONEY-500',
    );
    expect(createVariantSchema.safeParse({ ...base, unit: 'G' }).success).toBe(false);
    expect(createVariantSchema.safeParse({ ...base, unitValue: '500', name: 'x' }).success).toBe(
      false,
    );
    expect(createVariantSchema.safeParse(base).success).toBe(false); // no label, no net content
    expect(createVariantSchema.safeParse({ ...base, name: 'Gift box' }).success).toBe(true);
    expect(createVariantSchema.safeParse({ ...base, name: 'x', salePrice: '450' }).success).toBe(
      false,
    );
    expect(createVariantSchema.safeParse({ ...base, name: 'x', salePrice: '449.99' }).success).toBe(
      true,
    );
  });

  it('lets an update change only the amount or only the unit (checked against stored values later)', () => {
    expect(updateVariantSchema.safeParse({ unitValue: '2' }).success).toBe(true);
    expect(updateVariantSchema.safeParse({ unit: 'KG' }).success).toBe(true);
    expect(updateVariantSchema.safeParse({ price: '10', unitValue: '2' }).success).toBe(true);
    expect(updateVariantSchema.safeParse({ unit: 'KG', unitValue: null }).success).toBe(false);
  });

  it('never accepts stock in a variant update (inventory adjustments only)', () => {
    expect(updateVariantSchema.safeParse({ stockQty: 10 }).success).toBe(false);
    expect(updateVariantSchema.safeParse({ initialStock: 10 }).success).toBe(false);
  });
});

import type { Paisa } from './money';

/**
 * Net content of a variant (docs/database.md section 3a): unit + unitValue, e.g. G + 500. Values
 * have up to 3 decimals and are handled as integer thousandths, never floats.
 */
export const MEASURE_UNITS = ['G', 'KG', 'ML', 'L', 'PCS', 'DOZEN', 'PACK'] as const;
export type MeasureUnit = (typeof MEASURE_UNITS)[number];

const UNIT_LABEL: Record<MeasureUnit, string> = {
  G: 'g',
  KG: 'kg',
  ML: 'ml',
  L: 'L',
  PCS: 'pcs',
  DOZEN: 'dozen',
  PACK: 'pack',
};

const UNIT_VALUE_RE = /^\d{1,7}(\.\d{1,3})?$/;

/** "1.500" -> 1500 (thousandths). Throws on anything that is not a plain decimal. */
export function parseThousandths(value: string): number {
  if (!UNIT_VALUE_RE.test(value)) throw new Error(`Invalid amount: ${value}`);
  const [whole = '0', frac = ''] = value.split('.');
  return Number(whole) * 1000 + Number(frac.padEnd(3, '0'));
}

/** 1500 -> "1.5", 500000 -> "500" (no trailing zeros). */
function formatThousandths(t: number): string {
  const whole = Math.floor(t / 1000);
  const frac = String(t % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

/** Display label generated from the net content: "500 g", "1.5 L", "12 pcs". */
export function variantLabel(unit: MeasureUnit, unitValue: string): string {
  return `${formatThousandths(parseThousandths(unitValue))} ${UNIT_LABEL[unit]}`;
}

/** Comparable base per unit, in thousandths: grams, millilitres or pieces. */
const BASE_FACTOR: Record<MeasureUnit, { base: 'g' | 'ml' | 'piece'; factor: number }> = {
  G: { base: 'g', factor: 1 },
  KG: { base: 'g', factor: 1000 },
  ML: { base: 'ml', factor: 1 },
  L: { base: 'ml', factor: 1000 },
  PCS: { base: 'piece', factor: 1 },
  DOZEN: { base: 'piece', factor: 12 },
  PACK: { base: 'piece', factor: 1 },
};

/**
 * Price per 100 g, per 100 ml or per piece, for display only (docs/database.md section 3a; never
 * stored). Integer paisa, rounded half up. Null when the variant has no net content.
 */
export function pricePerUnit(
  pricePaisa: Paisa,
  unit: MeasureUnit | null | undefined,
  unitValue: string | null | undefined,
): { paisa: Paisa; per: '100 g' | '100 ml' | '1 piece' } | null {
  if (!unit || !unitValue) return null;
  const { base, factor } = BASE_FACTOR[unit];
  const amountThousandths = parseThousandths(unitValue) * factor; // in thousandths of the base unit
  if (amountThousandths <= 0) return null;
  const perThousandths = base === 'piece' ? 1000 : 100_000; // 1 piece, or 100 g / 100 ml
  // round_half_up(price * per / amount), in BigInt so large prices cannot overflow.
  const amount = BigInt(amountThousandths);
  const paisa = Number((BigInt(pricePaisa) * BigInt(perThousandths) * 2n + amount) / (amount * 2n));
  return { paisa, per: base === 'g' ? '100 g' : base === 'ml' ? '100 ml' : '1 piece' };
}

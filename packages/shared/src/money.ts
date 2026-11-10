/** Money is handled as integer paisa (1 taka = 100 paisa). Never use floats for money. */
export type Paisa = number;

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/** Parse a decimal string such as "450" or "450.5" into integer paisa. Throws on anything else. */
export function parsePaisa(value: string): Paisa {
  if (!MONEY_RE.test(value)) throw new Error(`Invalid money value: ${value}`);
  const [whole = '0', frac = ''] = value.split('.');
  const paisa = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(paisa)) throw new Error(`Money value out of range: ${value}`);
  return paisa;
}

/** Format integer paisa as a two-decimal string, e.g. 168000 -> "1680.00". */
export function formatPaisa(paisa: Paisa): string {
  if (!Number.isSafeInteger(paisa) || paisa < 0) throw new Error(`Invalid paisa value: ${paisa}`);
  const whole = Math.floor(paisa / 100);
  const frac = String(paisa % 100).padStart(2, '0');
  return `${whole}.${frac}`;
}

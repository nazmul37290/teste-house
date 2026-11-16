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

/**
 * Display a money string from the API ("125000.50") as Taka with Bangladeshi digit grouping
 * ("Tk 1,25,000.50"); whole amounts drop the decimals ("Tk 650"). Works on the string, never a float.
 */
export function formatTaka(amount: string): string {
  const [whole = '0', frac = '00'] = amount.split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return frac === '00' ? `Tk ${grouped}` : `Tk ${grouped}.${frac.padEnd(2, '0')}`;
}

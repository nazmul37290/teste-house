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

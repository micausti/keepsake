/** Money is stored as integer pence to avoid floating-point rounding. */

const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export function formatPence(pence: number | undefined): string {
  return pence === undefined ? '' : formatter.format(pence / 100);
}

/** Parses "£4.50", "4.5", "4" → pence. Returns undefined for blank or invalid input. */
export function parsePounds(input: string): number | undefined {
  const cleaned = input.trim().replace(/^£/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return Math.round(Number(cleaned) * 100);
}

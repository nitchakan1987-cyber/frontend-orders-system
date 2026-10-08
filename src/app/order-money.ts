export const MAX_MONEY_CENTS = 999999999999999999n;

// Match the backend's decimal-string, half-up rounding without floating-point totals.
export function moneyCents(value: string): bigint | null {
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  const rounded = cents + (fraction.length > 2 && Number(fraction[2]) >= 5 ? 1n : 0n);
  return rounded <= MAX_MONEY_CENTS ? rounded : null;
}

export function decimalMoney(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export function displayMoney(cents: bigint): string {
  return `${new Intl.NumberFormat('en-US').format(cents / 100n)}.${String(cents % 100n).padStart(2, '0')}`;
}

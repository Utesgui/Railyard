export function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  return `${sign}$${abs.toLocaleString('en-US')}`;
}

export function fmtMoneyShort(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

export function fmtDelta(n: number): string {
  return (n >= 0 ? '+' : '') + fmtMoneyShort(n);
}

export function fmtPct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function fmtSpeed(kmh: number): string {
  return `${Math.round(kmh)} km/h`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

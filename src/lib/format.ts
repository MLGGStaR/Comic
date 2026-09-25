// Display formatting shared across views.

export function fmtDate(iso: string | null | undefined, opts?: { year?: boolean }): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const showYear = opts?.year ?? d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}) });
}

export function fmtMoney(n: number | null | undefined, opts?: { cents?: boolean; compact?: boolean }): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (opts?.compact && Math.abs(n) >= 10000) {
    return `$${(n / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1)}k`;
  }
  const cents = opts?.cents ?? (Math.abs(n) < 100 && Math.round(n) !== n);
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

/** "today" / "tomorrow" / "3d" / "Oct 12" */
export function daysUntil(iso: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tmrw';
  if (diff < 14) return `${diff}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function relTime(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return fmtDate(iso.slice(0, 10));
}

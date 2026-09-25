// Calendar math in local dates (YYYY-MM-DD strings, no timezone drift).
// A comics "week" starts on New Comic Book Day (Wednesday) and runs to Tuesday.

const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The Wednesday that starts the release week containing `d`. */
export function weekStart(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = (x.getDay() - 3 + 7) % 7; // days since the last Wednesday
  x.setDate(x.getDate() - back);
  return toIso(x);
}

export function addDays(iso: string, n: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** 42 days (6 weeks, Sunday first) covering the month; month is 0-based. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const out: string[] = [];
  for (let i = 0; i < 42; i++) {
    out.push(toIso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  }
  return out;
}

/** Every release week (its Wednesday) that overlaps [from, to]. */
export function weeksCovering(from: string, to: string): string[] {
  const out: string[] = [];
  for (let w = weekStart(fromIso(from)); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

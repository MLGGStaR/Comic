// Matching our comics to PriceCharting products. Their names look like
// "Absolute Batman #2 (2024)" (main cover) or
// "Absolute Batman [Johnson] #2 (2024)" (variant tag before the number).
// The year is the volume's start year — or, for a reprint, the year it came out.

export interface PcProduct {
  id: string;
  productName: string;
  consoleName: string; // "Comic Books Daredevil" (cards, figures… live in the same search)
  price1: string; // ungraded (raw)
  price2: string; // graded 8.0
  price3: string; // graded 6.0
}

export function parsePcName(n: string): { series: string; tag: string | null; number: string; year: number } | null {
  const m = n.trim().match(/^(.*?)\s*(?:\[([^\]]+)\])?\s*#\s*([^\s(]+)\s*\((\d{4})\)\s*$/);
  if (!m) return null;
  return { series: m[1].trim(), tag: m[2]?.trim() ?? null, number: m[3], year: Number(m[4]) };
}

export function pcMoney(s: string | null | undefined): number | null {
  const m = (s ?? '').match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ''));
  return v > 0 ? v : null;
}

const flat = (s: string) =>
  s
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
const sameNum = (a: string, b: string) => a.toLowerCase().replace(/^0+(?=\d)/, '') === b.toLowerCase().replace(/^0+(?=\d)/, '');

// What makes one cover a different product from another with the same art
const MARKERS = ['virgin', 'foil', 'sketch', 'blank', 'newsstand', 'facsimile', 'signed', 'metal', 'glow'];
const STOP = new Set(['cover', 'variant', 'variants', 'edition', 'card', 'stock', 'cardstock', 'exclusive', 'the', 'an', 'of', 'by', 'and', 'main', 'print', 'printing', 'incentive', 'ratio', 'retailer', 'store', 'logo', 'trade', 'dress', 'homage', 'comics']);

interface Look {
  printing: number; // 1 = first printing
  ratio: string | null; // "1:25"
  markers: string; // sorted marker list, e.g. "foil virgin"
  words: Set<string>; // artist / store names
}

function look(name: string): Look {
  const lower = name.toLowerCase();
  const tokens = lower.split(/[^a-z0-9':]+/).filter(Boolean);
  const markers = MARKERS.filter((m) => tokens.some((t) => t === m || (m === 'foil' && t.endsWith('foil'))));
  const words = tokens.filter((t) => t.length > 1 && !/^\d+(st|nd|rd|th)?$/.test(t) && !t.includes(':') && !STOP.has(t) && !markers.includes(t) && !t.endsWith('foil'));
  return {
    printing: Number(lower.match(/(\d+)(?:st|nd|rd|th)\s+print/)?.[1] ?? 1),
    ratio: lower.match(/\b\d+:\d+\b/)?.[0] ?? null,
    markers: markers.sort().join(' '),
    words: new Set(words),
  };
}

/** How well a PriceCharting variant tag names our cover: -1 = a different cover. */
function tagScore(ours: Look, theirs: Look): number {
  if (ours.printing !== theirs.printing || ours.markers !== theirs.markers) return -1;
  if (theirs.ratio && theirs.ratio !== ours.ratio) return -1; // their listing is an incentive ours isn't (or another one)
  if (!theirs.words.size) return ours.words.size ? -1 : 1;
  const hits = [...theirs.words].filter((w) => ours.words.has(w)).length;
  const frac = hits / theirs.words.size;
  if (!hits || frac < 0.5) return -1;
  return frac + (ours.ratio && ours.ratio === theirs.ratio ? 0.1 : 0);
}

/** Leading number of an issue number ("1000" → 1000, "½" → 0). */
const issueCount = (n: string) => Number(n.match(/\d+/)?.[0] ?? 0);

export function pickProduct(
  list: PcProduct[],
  want: { series: string; number: string; year: number | null; variantName?: string | null },
): PcProduct | null {
  const target = flat(want.series);
  const cands = list
    .filter((p) => /^comic books/i.test(p.consoleName ?? ''))
    .map((p) => ({ p, n: parsePcName(p.productName) }))
    .filter((x): x is { p: PcProduct; n: NonNullable<ReturnType<typeof parsePcName>> } => !!x.n)
    .filter((x) => flat(x.n.series) === target && sameNum(x.n.number, want.number) && pcMoney(x.p.price1) != null);
  if (!cands.length) return null;

  const ours = want.variantName ? look(want.variantName) : null;
  const reprint = !!ours && (ours.printing > 1 || ours.markers.includes('facsimile'));
  const now = new Date().getFullYear();

  // Which volume: the product year is the volume's start year, so it lies at or
  // before the issue's year, and not decades before — a run of N issues spans
  // at most ~N/6 years. (Without that bound, Daredevil #1 from 1998 was priced
  // as the $1,500 1964 #1 whenever the 1998 volume wasn't in the results.)
  // Reprints are listed under the year they came out.
  const y = want.year;
  const inWindow = (py: number) => {
    if (y == null) return true;
    if (reprint) return py >= y && py <= now + 1;
    return py <= y + 1 && py >= y - (Math.ceil(issueCount(want.number) / 6) + 2);
  };
  const pool = cands.filter((x) => inWindow(x.n.year));
  // no release date: only safe when every candidate is the same volume
  if (y == null && new Set(pool.map((x) => x.n.year)).size > 1) return null;

  if (!ours) {
    const mains = pool.filter((x) => !x.n.tag).sort((a, b) => b.n.year - a.n.year);
    return mains[0]?.p ?? null;
  }
  const scored = pool
    .filter((x) => x.n.tag)
    .map((x) => ({ x, s: tagScore(ours, look(x.n.tag!)) }))
    .filter((t) => t.s > 0)
    .sort((a, b) => b.s - a.s || b.x.n.year - a.x.n.year);
  return scored[0]?.x.p ?? null;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

/** Search words that single out a variant's listing: "11th Printing" → "11th print",
 *  "Cover C Jim Lee Variant" → "lee" (the artist's surname), plus any markers. */
export function variantQuery(variantName: string): string {
  const l = look(variantName);
  const surname = [...l.words].pop() ?? '';
  return [l.printing > 1 ? `${ordinal(l.printing)} print` : '', surname, l.markers].filter(Boolean).join(' ');
}

const cents = (n: number) => Math.round(n * 100 + 1e-9) / 100;

export interface GradedPrice {
  amount: number;
  basis: 'exact' | 'between' | 'floor' | 'raw'; // how the number was reached
  from: string; // "9.8", "9.4–9.8", "8.0", "raw"
}

/** A graded copy's value from a grade → price table ("raw", "6.0", "9.8"…):
 *  the exact grade; else in proportion between the nearest grades around it;
 *  above every known grade, the highest one as a floor; else the raw price. */
export function gradedPrice(prices: Record<string, number>, grade: number): GradedPrice | null {
  const key = grade.toFixed(1);
  if (prices[key] != null) return { amount: prices[key], basis: 'exact', from: key };
  const known = Object.entries(prices)
    .filter(([k]) => k !== 'raw')
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => a[0] - b[0]);
  const below = [...known].reverse().find(([g]) => g < grade);
  const above = known.find(([g]) => g > grade);
  if (below && above) {
    const t = (grade - below[0]) / (above[0] - below[0]);
    return { amount: cents(below[1] + t * (above[1] - below[1])), basis: 'between', from: `${below[0].toFixed(1)}–${above[0].toFixed(1)}` };
  }
  if (below) return { amount: below[1], basis: 'floor', from: below[0].toFixed(1) };
  if (prices.raw != null) return { amount: prices.raw, basis: 'raw', from: 'raw' };
  return null;
}

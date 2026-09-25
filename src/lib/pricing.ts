// Matching our comics to PriceCharting products. Their names look like
// "Absolute Batman #2 (2024)" (main cover) or
// "Absolute Batman [Johnson] #2 (2024)" (variant tag before the number).

export interface PcProduct {
  id: string;
  productName: string;
  consoleName: string;
  price1: string; // ungraded (raw) — what we value copies at
  price2: string; // 8.0
  price3: string; // 6.0
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
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));
const sameNum = (a: string, b: string) => a.toLowerCase().replace(/^0+(?=\d)/, '') === b.toLowerCase().replace(/^0+(?=\d)/, '');

export function pickProduct(
  list: PcProduct[],
  want: { series: string; number: string; year: number | null; variantName?: string | null },
): PcProduct | null {
  const target = flat(want.series);
  const cands = list
    .map((p) => ({ p, n: parsePcName(p.productName) }))
    .filter((x): x is { p: PcProduct; n: NonNullable<ReturnType<typeof parsePcName>> } => !!x.n)
    .filter((x) => flat(x.n.series) === target && sameNum(x.n.number, want.number) && pcMoney(x.p.price1) != null);
  if (!cands.length) return null;

  // the right volume: the product year closest to the comic's year (never later)
  const yearDist = (y: number) => (want.year == null ? 0 : y > want.year ? 1000 + (y - want.year) : want.year - y);
  const bestYear = Math.min(...cands.map((x) => yearDist(x.n.year)));
  const sameVol = cands.filter((x) => yearDist(x.n.year) === bestYear);

  if (want.variantName) {
    const vw = words(want.variantName);
    const tagged = sameVol
      .filter((x) => x.n.tag)
      .map((x) => {
        const tw = [...words(x.n.tag!)];
        const hits = tw.filter((w) => vw.has(w)).length;
        return { x, score: hits / Math.max(1, tw.length) };
      })
      .filter((t) => t.score >= 0.5)
      .sort((a, b) => b.score - a.score);
    if (tagged.length) return tagged[0].x.p;
  }
  return (sameVol.find((x) => !x.n.tag) ?? null)?.p ?? null;
}

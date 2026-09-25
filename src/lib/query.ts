// Turns what people type ("absolute batman #2", "saga vol 3") into a
// structured query: which series, and whether they mean one issue, one
// collected edition, or the whole series.

export interface ParsedQuery {
  series: string;
  issue?: string;
  volume?: number;
  year?: number;
  kind: 'issue' | 'collection' | 'series';
}

const YEAR_MIN = 1930;
const YEAR_MAX = new Date().getFullYear() + 3;
const isYear = (n: number) => n >= YEAR_MIN && n <= YEAR_MAX;

export function normalize(raw: string): string {
  return raw
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseQuery(raw: string): ParsedQuery {
  let s = normalize(raw);
  let year: number | undefined;

  s = s
    .replace(/\((\d{4})\)/, (m, y: string) => {
      const n = Number(y);
      if (!isYear(n)) return m;
      year = n;
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  const withYear = (q: ParsedQuery): ParsedQuery => (year != null ? { ...q, year } : q);

  // collected edition: "vol 1", "vol. 1", "volume 1", "tpb 1", "book 1"
  let m = s.match(/^(.+?)\s+(?:vol(?:ume)?\.?|tpb|tp|book)\s*(\d+)$/);
  if (m) return withYear({ series: m[1].trim(), volume: Number(m[2]), kind: 'collection' });

  // explicit issue: "#2", "#1.MU", "#½"
  m = s.match(/^(.+?)\s*#\s*(\S+)$/);
  if (m) return withYear({ series: m[1].trim(), issue: m[2], kind: 'issue' });

  // "issue 3", "no. 4"
  m = s.match(/^(.+?)\s+(?:issue|no\.?)\s*([0-9½]\S*)$/);
  if (m) return withYear({ series: m[1].trim(), issue: m[2], kind: 'issue' });

  // trailing bare number: an issue, unless it reads as a year
  m = s.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
  if (m) {
    const n = Number(m[2]);
    if (/^\d{4}$/.test(m[2]) && isYear(n) && year == null) {
      return { series: m[1].trim(), year: n, kind: 'series' };
    }
    return withYear({ series: m[1].trim(), issue: m[2], kind: 'issue' });
  }

  return withYear({ series: s, kind: 'series' });
}

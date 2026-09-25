// Turns what people type ("absolute batman #2", "saga vol 3") into a
// structured query: which series, and whether they mean one issue, one
// collected edition, or the whole series.

export type Edition = 'tp' | 'hc' | 'omnibus' | 'deluxe';

export interface ParsedQuery {
  series: string;
  issue?: string;
  volume?: number;
  year?: number;
  annual?: boolean; // "batman annual #2" → the annual inside the Batman run
  edition?: Edition; // "house of m tp" → a collected edition, this format preferred
  kind: 'issue' | 'collection' | 'series';
}

// trailing format words: "… tp", "… hardcover", "… omnibus", "… deluxe edition"
const EDITIONS: [RegExp, Edition][] = [
  [/\s+(?:tpb?|trade(?: paperback)?)$/, 'tp'],
  [/\s+(?:oversized hc|hc|hardcover)$/, 'hc'],
  [/\s+(?:omnibus|compendium)$/, 'omnibus'],
  [/\s+deluxe(?: edition)?$/, 'deluxe'],
];

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
  const q = parseCore(raw);
  // annuals live inside their series' run: search the series, flag the annual
  const m = q.series.match(/^(.*?)\s+(?:(?:19|20)\d{2}\s+)?annual$/);
  if (m && m[1] && q.kind === 'issue') return { ...q, series: m[1], annual: true };
  return q;
}

function parseCore(raw: string): ParsedQuery {
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

  // a trailing format word asks for a collected edition ("house of m tp")
  let edition: Edition | undefined;
  for (const [re, ed] of EDITIONS) {
    const rest = s.replace(re, '').trim();
    if (rest !== s && rest) {
      edition = ed;
      s = rest;
      break;
    }
  }

  const withYear = (q: ParsedQuery): ParsedQuery => {
    let r = q;
    if (edition) {
      if (q.kind === 'series') r = { ...q, kind: 'collection', edition };
      else if (q.kind === 'collection') r = { ...q, edition };
      else if (/^\d+$/.test(q.issue ?? '')) {
        // "saga 1 tp": the number is the volume
        const { issue, ...rest } = q;
        r = { ...rest, volume: Number(issue), kind: 'collection', edition };
      }
    }
    return year != null ? { ...r, year } : r;
  };

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
      return withYear({ series: m[1].trim(), year: n, kind: 'series' });
    }
    return withYear({ series: m[1].trim(), issue: m[2], kind: 'issue' });
  }

  return withYear({ series: s, kind: 'series' });
}

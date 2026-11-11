// What a collected edition reprints, as text ("Batman #404–407, Batman
// Annual #11") → the single issues, run by run, in order.

export interface CollectsRef {
  series: string; // "Batman"
  year: number | null; // volume start year when given: "Batman (1940) #404"
  numbers: string[]; // ["404", "405", "406", "407"]
}

const PART = /([^#,;(]*?)\s*(?:\((\d{4})\)\s*)?#\s*(\d+(?:\.\d+)?)(?:\s*[–—-]\s*#?\s*(\d+))?/g;

export function parseCollects(text: string | null | undefined): CollectsRef[] {
  const out: CollectsRef[] = [];
  if (!text) return out;
  for (const m of text.matchAll(PART)) {
    const series = m[1].replace(/^(?:[\s,;&]|and\b|plus\b|with\b|issues?\b)+/i, '').trim();
    const year = m[2] ? Number(m[2]) : null;
    const from = m[3];
    const to = m[4];
    const numbers: string[] = [];
    const a = Number(from);
    const b = to ? Number(to) : NaN;
    if (Number.isInteger(a) && Number.isInteger(b) && b > a && b - a <= 200) for (let n = a; n <= b; n++) numbers.push(String(n));
    else numbers.push(String(from).replace(/^0+(?=\d)/, ''));
    const prev = out[out.length - 1];
    // "Daredevil #181, #191": a bare number continues the run before it
    if (prev && (!series || (series === prev.series && year === prev.year))) prev.numbers.push(...numbers);
    else if (series) out.push({ series, year, numbers });
  }
  return out;
}

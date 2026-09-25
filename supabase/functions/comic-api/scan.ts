// Cover scan: Claude reads the photo (series, number, publisher, variant
// hints) → we look the comic up → Claude compares the photo against every
// cover of that issue and picks the exact one. Structured JSON both times.
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { largeCover } from '../_shared/locg.ts';

const MODEL = 'claude-opus-5';
let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }));

const nullable = (type: string) => ({ anyOf: [{ type }, { type: 'null' }] });

export interface CoverRead {
  is_comic: boolean;
  format: 'issue' | 'collected_edition' | 'unknown';
  series: string | null;
  issue_number: string | null;
  volume_number: number | null;
  subtitle: string | null;
  publisher: string | null;
  year: number | null;
  variant_hint: string | null;
  cover_artist: string | null;
  confidence: number;
}

const READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_comic', 'format', 'series', 'issue_number', 'volume_number', 'subtitle', 'publisher', 'year', 'variant_hint', 'cover_artist', 'confidence'],
  properties: {
    is_comic: { type: 'boolean', description: 'true if the photo shows the front cover of a comic book, trade paperback or graphic novel' },
    format: { type: 'string', enum: ['issue', 'collected_edition', 'unknown'] },
    series: { ...nullable('string'), description: 'Series title as it would be catalogued, without the issue number, e.g. "Absolute Batman", "Amazing Spider-Man"' },
    issue_number: { ...nullable('string'), description: 'Issue number printed on the cover, digits only where possible, e.g. "2", "1000", "½"' },
    volume_number: { ...nullable('integer'), description: 'For collected editions: the Vol. number' },
    subtitle: { ...nullable('string'), description: 'Story/collection subtitle if printed, e.g. "The Zoo"' },
    publisher: { ...nullable('string'), description: 'Publisher from the logo, e.g. "DC Comics", "Marvel Comics", "Image Comics"' },
    year: { ...nullable('integer'), description: 'Year printed on the cover or clearly implied by the trade dress, if visible' },
    variant_hint: { ...nullable('string'), description: 'Anything that marks a variant: "Cover B", "1:25", "virgin", "foil", "card stock", store exclusive text, "2nd printing"' },
    cover_artist: { ...nullable('string'), description: 'Cover artist name if printed on the cover' },
    confidence: { type: 'number', description: '0 to 1: how sure you are of series + number' },
  },
} as const;

const MATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['match', 'confidence', 'reason'],
  properties: {
    match: { ...nullable('integer'), description: 'Number of the candidate that is exactly the same cover art as the photo, or null if none is' },
    confidence: { type: 'number', description: '0 to 1' },
    reason: { type: 'string', description: 'One short sentence' },
  },
} as const;

async function structured<T>(system: string, content: unknown[], schema: object): Promise<T> {
  const params = {
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content }],
  };
  const res = await anthropic().beta.messages.create(params as never);
  if (res.stop_reason === 'refusal') throw new Error('The scanner couldn’t read that photo');
  const text = res.content.find((b: { type: string }) => b.type === 'text') as { text: string } | undefined;
  if (!text) throw new Error('No answer from the scanner');
  return JSON.parse(text.text) as T;
}

export function readCover(imageBase64: string): Promise<CoverRead> {
  return structured<CoverRead>(
    'You identify comic books from phone photos of their front covers for a collector’s app. Read the logo, title, issue number box, publisher mark, price box, dates and any variant or printing markings. Use your knowledge of comics to normalise the series title the way catalogues list it (e.g. "The Amazing Spider-Man" → "Amazing Spider-Man"). If something is not visible, return null for it rather than guessing.',
    [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
      { type: 'text', text: 'Identify this comic.' },
    ],
    READ_SCHEMA,
  );
}

export interface Candidate {
  id: string;
  name: string;
  cover: string | null;
}

/** Which candidate cover is the one in the photo? Returns its index or null. */
export async function matchCover(imageBase64: string, cands: Candidate[]): Promise<{ index: number | null; confidence: number; reason: string }> {
  const usable = cands.filter((c) => c.cover);
  if (!usable.length) return { index: null, confidence: 0, reason: 'no candidate covers' };
  const content: unknown[] = [
    { type: 'text', text: 'PHOTO of the comic the collector is holding:' },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
  ];
  usable.forEach((c, i) => {
    content.push({ type: 'text', text: `CANDIDATE ${i + 1}: ${c.name}` });
    content.push({ type: 'image', source: { type: 'url', url: largeCover(c.cover)! } });
  });
  content.push({
    type: 'text',
    text: 'All candidates are covers of the same issue. Which candidate has exactly the same cover artwork as the photo (ignore glare, angle, bag/board, price stickers)? Answer with its number, or null if none is the same artwork.',
  });
  const r = await structured<{ match: number | null; confidence: number; reason: string }>(
    'You compare a photo of a comic book cover against catalogue cover images and pick the exact matching variant cover.',
    content,
    MATCH_SCHEMA,
  );
  const i = r.match != null ? r.match - 1 : -1;
  const hit = i >= 0 && i < usable.length ? cands.indexOf(usable[i]) : null;
  return { index: hit, confidence: r.confidence, reason: r.reason };
}

/** Keep the main cover plus the variants that best fit the printed hints. */
export function shortlist(cands: Candidate[], hint: string | null, max = 12): Candidate[] {
  if (cands.length <= max) return cands;
  const words = new Set((hint ?? '').toLowerCase().split(/[^a-z0-9:]+/).filter((w) => w.length > 1));
  const [main, ...rest] = cands;
  const scored = rest
    .map((c, i) => {
      const cw = c.name.toLowerCase().split(/[^a-z0-9:]+/);
      const hits = cw.filter((w) => words.has(w)).length;
      const reprint = /print|reprint/i.test(c.name) ? -1 : 0;
      return { c, s: hits * 10 + reprint - i * 0.01 };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, max - 1)
    .map((x) => x.c);
  return [main, ...scored];
}

// Cover scan, in three Claude passes (all structured JSON):
//   read   — what the photo says: series, number, publisher, printed barcode digits
//   coarse — the photo against EVERY candidate cover as small thumbnails → top 3
//   fine   — the photo against those 3 at full size → the exact cover (or none)
// The caller assembles candidates (the issue's covers, its neighbours, other
// editions, community photos) so a misread number can still be caught.
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { largeCover, mediumCover } from '../_shared/locg.ts';

export const MODELS = ['claude-opus-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'] as const;
export type Model = (typeof MODELS)[number];

/** Per-pass settings; the defaults are what production uses. */
export interface ScanKnobs {
  readModel: Model;
  coarseModel: Model;
  fineModel: Model;
  /** fetch catalogue covers here (in parallel) and send them inline, instead of as URLs */
  inline: boolean;
  /** thumbnails per coarse call; bigger candidate sets are split into parallel calls */
  chunk: number;
  /** re-rank the chunks' picks only when there are more than this many (else they all go to fine) */
  rerankOver: number;
}
export const DEFAULT_KNOBS: ScanKnobs = {
  readModel: 'claude-opus-5',
  coarseModel: 'claude-opus-5',
  fineModel: 'claude-opus-5-5',
  inline: true,
  chunk: 24,
  rerankOver: 8,
};

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }));

const nullable = (type: string) => ({ anyOf: [{ type }, { type: 'null' }] });

export interface CoverRead {
  is_comic: boolean;
  format: 'issue' | 'collected_edition' | 'unknown';
  series: string | null;
  issue_number: string | null;
  likely_issue: string | null;
  annual: boolean;
  volume_number: number | null;
  subtitle: string | null;
  publisher: string | null;
  year: number | null;
  barcode_digits: string | null;
  variant_hint: string | null;
  cover_artist: string | null;
  confidence: number;
}

const READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_comic', 'format', 'series', 'issue_number', 'likely_issue', 'annual', 'volume_number', 'subtitle', 'publisher', 'year', 'barcode_digits', 'variant_hint', 'cover_artist', 'confidence'],
  properties: {
    is_comic: { type: 'boolean', description: 'true if the photo shows the front cover of a comic book, trade paperback or graphic novel' },
    format: { type: 'string', enum: ['issue', 'collected_edition', 'unknown'] },
    series: { ...nullable('string'), description: 'Series title as catalogues list it, without the issue number or the word "Annual", e.g. "Absolute Batman", "Amazing Spider-Man"' },
    issue_number: { ...nullable('string'), description: 'Issue number PRINTED on the cover (issue box / trade dress), e.g. "2", "1000". Null if not printed.' },
    likely_issue: {
      ...nullable('string'),
      description:
        'Only when no issue number is printed (virgin, sketch, blank-style covers): the issue you believe this artwork belongs to, from your knowledge of variant covers, as "<series> #<number>", e.g. "Amazing Spider-Man #1000". Null if you do not know.',
    },
    annual: { type: 'boolean', description: 'true if the cover says Annual' },
    volume_number: { ...nullable('integer'), description: 'For collected editions: the Vol. number' },
    subtitle: { ...nullable('string'), description: 'Story/collection subtitle if printed, e.g. "The Zoo"' },
    publisher: { ...nullable('string'), description: 'Publisher from the logo, e.g. "DC Comics", "Marvel Comics", "Image Comics", "FOMO Books"' },
    year: { ...nullable('integer'), description: 'Year printed on the cover, if visible' },
    barcode_digits: {
      ...nullable('string'),
      description: 'If a UPC/EAN barcode is visible, the digits printed under it INCLUDING the small 5-digit add-on to its right, digits only (e.g. "76194138584600211"). Null if not fully legible — never guess digits.',
    },
    variant_hint: { ...nullable('string'), description: 'Anything that marks a variant: "Cover B", "1:25", "virgin", "foil", "card stock", store exclusive text, "2nd printing"' },
    cover_artist: { ...nullable('string'), description: 'Cover artist name if printed on the cover' },
    confidence: { type: 'number', description: '0 to 1: how sure you are of series + number' },
  },
} as const;

async function structured<T>(model: Model, system: string, content: unknown[], schema: object): Promise<T> {
  const params = {
    model,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: model.startsWith('claude-haiku') ? { format: { type: 'json_schema', schema } } : { effort: 'low', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content }],
  };
  const res = await anthropic().beta.messages.create(params as never);
  if (res.stop_reason === 'refusal') throw new Error('The scanner couldn’t read that photo');
  const text = res.content.find((b: { type: string }) => b.type === 'text') as { text: string } | undefined;
  if (!text) throw new Error('No answer from the scanner');
  return JSON.parse(text.text) as T;
}

const photoBlock = (b64: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Image blocks for many URLs: fetched here in parallel (inline) or left to the API (url). */
async function imageBlocks(urls: string[], inline: boolean): Promise<unknown[]> {
  if (!inline) return urls.map((url) => ({ type: 'image', source: { type: 'url', url } }));
  return Promise.all(
    urls.map(async (url) => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
        const type = r.headers.get('content-type') ?? '';
        if (!r.ok || !/^image\/(jpeg|png|webp|gif)/.test(type)) throw new Error('bad image');
        return { type: 'image', source: { type: 'base64', media_type: type.split(';')[0], data: toB64(await r.arrayBuffer()) } };
      } catch {
        return { type: 'image', source: { type: 'url', url } };
      }
    }),
  );
}

export function readCover(imageBase64: string, model: Model = DEFAULT_KNOBS.readModel): Promise<CoverRead> {
  return structured<CoverRead>(
    model,
    'You identify comic books from phone photos of their front covers for a collector’s app. Read the logo, title, issue number box, publisher mark, price box, dates, the barcode digits and any variant or printing markings. Use your knowledge of comics to normalise the series title the way catalogues list it (e.g. "The Amazing Spider-Man" → "Amazing Spider-Man"). If something is not visible, return null for it rather than guessing.',
    [photoBlock(imageBase64), { type: 'text', text: 'Identify this comic.' }],
    READ_SCHEMA,
  );
}

export interface Candidate {
  id: string; // the cover's own id (issue id for a main cover, variant id, custom:<uuid>)
  issueId: string; // which issue this cover belongs to
  name: string; // "Absolute Batman #24 — Cover C Kaare Andrews Variant"
  cover: string | null;
  main: boolean;
}

const thumb = (c: Candidate) => (c.id.startsWith('custom:') ? c.cover! : mediumCover(c.cover)!);
const full = (c: Candidate) => (c.id.startsWith('custom:') ? c.cover! : largeCover(c.cover)!);

const COARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ranked', 'reason'],
  properties: {
    ranked: { type: 'array', items: { type: 'integer' }, description: 'Up to 3 candidate numbers whose artwork could be the photo, best first. Empty if none match.' },
    reason: { type: 'string' },
  },
} as const;

/** Photo vs many small covers → up to 3 plausible candidates, best first. */
export async function coarseRank(
  imageBase64: string,
  cands: Candidate[],
  knobs: ScanKnobs = DEFAULT_KNOBS,
): Promise<{ ranked: Candidate[]; reason: string }> {
  const usable = cands.filter((c) => c.cover);
  if (usable.length <= 3) return { ranked: usable, reason: 'few candidates' };
  const imgs = await imageBlocks(usable.map(thumb), knobs.inline);
  const content: unknown[] = [{ type: 'text', text: 'PHOTO of the comic the collector is holding:' }, photoBlock(imageBase64)];
  usable.forEach((c, i) => {
    content.push({ type: 'text', text: `#${i + 1} ${c.name}` });
    content.push(imgs[i]);
  });
  content.push({
    type: 'text',
    text: [
      `Those are ${usable.length} small catalogue covers. Which have the SAME ARTWORK as the photo?`,
      '- Compare the illustration itself (characters, pose, composition, colours) — ignore glare, angle, lighting and bags.',
      '- Reprints, foils and convention editions often reuse the main artwork: when several candidates share the photo’s artwork, include the one named "Main cover" among your picks.',
      '- Return up to 3 numbers, best first, or an empty list if none has the same artwork.',
    ].join('\n'),
  });
  const r = await structured<{ ranked: number[]; reason: string }>(knobs.coarseModel, 'You match phone photos of comic covers to catalogue cover images.', content, COARSE_SCHEMA);
  const ranked = r.ranked.map((n) => usable[n - 1]).filter(Boolean);
  return { ranked: [...new Set(ranked)].slice(0, 3), reason: r.reason };
}

const FINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['match', 'confidence', 'reason'],
  properties: {
    match: { ...nullable('integer'), description: 'Candidate number that is exactly the same cover as the photo, or null if none is' },
    confidence: { type: 'number', description: '0 to 1' },
    reason: { type: 'string', description: 'One short sentence' },
  },
} as const;

/** Photo vs a few full-size covers → the exact one. */
export async function fineMatch(
  imageBase64: string,
  cands: Candidate[],
  knobs: ScanKnobs = DEFAULT_KNOBS,
): Promise<{ pick: Candidate | null; confidence: number; reason: string }> {
  const usable = cands.filter((c) => c.cover);
  if (!usable.length) return { pick: null, confidence: 0, reason: 'no candidate covers' };
  const imgs = await imageBlocks(usable.map(full), knobs.inline);
  const content: unknown[] = [{ type: 'text', text: 'PHOTO of the comic the collector is holding:' }, photoBlock(imageBase64)];
  usable.forEach((c, i) => {
    content.push({ type: 'text', text: `CANDIDATE ${i + 1}: ${c.name}` });
    content.push(imgs[i]);
  });
  content.push({
    type: 'text',
    text: [
      'Which candidate is exactly the same cover as the photo?',
      '- The artwork must match; then use the details to tell apart covers that share art: trade dress and logo, issue box, "2nd/3rd printing" text, "virgin" (no logo/text), store-exclusive logos, black & white or sketch versions.',
      '- Glare, reflections, lighting and bags are from the photo — they are NOT foil or a special finish.',
      '- Reprints, foil and convention editions usually say so on the cover. If the artwork matches several candidates and you cannot see such a marking on the photo, choose the one named "Main cover".',
      '- Answer null if no candidate has the same artwork.',
    ].join('\n'),
  });
  const r = await structured<{ match: number | null; confidence: number; reason: string }>(
    knobs.fineModel,
    'You compare a photo of a comic book cover with catalogue cover images and pick the exact matching cover.',
    content,
    FINE_SCHEMA,
  );
  const pick = r.match != null ? usable[r.match - 1] ?? null : null;
  return { pick, confidence: r.confidence, reason: r.reason };
}

/** Order candidates so the likeliest (per printed hints) come first; reprints last. */
export function byHints(cands: Candidate[], hint: string | null): Candidate[] {
  const words = new Set((hint ?? '').toLowerCase().split(/[^a-z0-9:]+/).filter((w) => w.length > 1));
  return cands
    .map((c, i) => {
      const cw = c.name.toLowerCase().split(/[^a-z0-9:]+/);
      const hits = cw.filter((w) => words.has(w)).length;
      const reprint = /\b(\d+(st|nd|rd|th) print(ing)?|printing|reprint|facsimile)\b/i.test(c.name) && !words.has('printing') && !words.has('print');
      return { c, s: (c.main ? 5 : 0) + hits * 10 - (reprint ? 8 : 0) - i * 0.001 };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

export const GENRES = [
  'Superhero',
  'Sci-Fi',
  'Fantasy',
  'Horror',
  'Crime',
  'Mystery',
  'Action',
  'Drama',
  'Comedy',
  'Romance',
  'Western',
  'War',
  'Slice of Life',
  'Manga',
  'Kids',
  'Non-fiction',
] as const;

const GENRE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'genres'],
        properties: {
          key: { type: 'string' },
          genres: { type: 'array', items: { type: 'string', enum: [...GENRES] }, description: '1–2 genres, most defining first' },
        },
      },
    },
  },
} as const;

/** Genre tags for comic series (by title + publisher), one batched call. */
export async function classifyGenres(series: { key: string; title: string; publisher: string | null }[]): Promise<Record<string, string[]>> {
  if (!series.length) return {};
  const list = series.map((s) => `${s.key} | ${s.title}${s.publisher ? ` (${s.publisher})` : ''}`).join('\n');
  const r = await structured<{ items: { key: string; genres: string[] }[] }>(
    'claude-opus-5',
    'You tag comic book series with genres for a collector app. Use your knowledge of each series; superhero books are "Superhero" even when they are also sci-fi. Pick 1–2 genres from the allowed list.',
    [{ type: 'text', text: `Tag each series (format: key | title (publisher)):\n${list}` }],
    GENRE_SCHEMA,
  );
  const out: Record<string, string[]> = {};
  for (const it of r.items) out[it.key] = it.genres.slice(0, 2);
  return out;
}

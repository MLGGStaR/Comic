import { describe, expect, test } from 'vitest';
import { issueNum, compareComics, valueOf, portfolio, shelfView, estimateCopies } from './shelf';
import type { ComicLite, Entry, OwnedVariant } from '../types';

const comic = (over: Partial<ComicLite>): ComicLite => ({
  id: 'x',
  title: 'X #1',
  series: 'X',
  seriesId: null,
  number: '1',
  format: 'issue',
  publisher: 'DC Comics',
  releaseDate: '2025-01-01',
  cover: null,
  price: 4.99,
  ...over,
});

const entry = (over: Omit<Partial<Entry>, 'meta'> & { meta?: Partial<ComicLite> }): Entry => ({
  comicId: over.meta?.id ?? 'x',
  owned: true,
  read: false,
  wishlist: false,
  rating: null,
  readAt: null,
  review: null,
  variants: [],
  paid: null,
  value: null,
  est: null,
  addedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
  meta: comic(over.meta ?? {}),
});

const MAIN = (id = 'x'): OwnedVariant => ({ id, name: 'Main cover', cover: null });

describe('issueNum', () => {
  test('plain, fractional and odd numbers sort as numbers', () => {
    expect(issueNum('2')).toBe(2);
    expect(issueNum('10')).toBe(10);
    expect(issueNum('½')).toBe(0.5);
    expect(issueNum('1.MU')).toBe(1);
    expect(issueNum(null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('compareComics', () => {
  test('series A→Z, then issue numbers numerically (#2 before #10)', () => {
    const list = [
      comic({ id: 'a10', series: 'Absolute Batman', number: '10' }),
      comic({ id: 'b1', series: 'Batman', number: '1' }),
      comic({ id: 'a2', series: 'Absolute Batman', number: '2' }),
    ];
    expect([...list].sort(compareComics).map((c) => c.id)).toEqual(['a2', 'a10', 'b1']);
  });
});

describe('valueOf', () => {
  test('your own value beats everything', () => {
    expect(valueOf(entry({ value: 50, est: 20, variants: [MAIN()] }))).toEqual({ amount: 50, basis: 'yours' });
  });
  test('market estimate of the covers you picked beats cover price', () => {
    expect(valueOf(entry({ est: 12.5, variants: [MAIN()] }))).toEqual({ amount: 12.5, basis: 'market' });
  });
  test('no cover picked: cover price, flagged — never a market price for a cover you may not have', () => {
    expect(valueOf(entry({ est: 60 }))).toEqual({ amount: 4.99, basis: 'cover', unpicked: true });
  });
  test('falls back to each copy’s own cover price', () => {
    const e = entry({
      variants: [
        { id: 'v1', name: 'Cover B Card Stock', cover: null, price: 5.99 },
        { id: 'v2', name: 'B', cover: null },
      ],
    });
    expect(valueOf(e)).toEqual({ amount: 10.98, basis: 'cover' });
  });
  test('nothing known → no value', () => {
    expect(valueOf(entry({ meta: { price: null }, variants: [MAIN()] }))).toEqual({ amount: null, basis: null });
  });
  test('things you do not own are worth nothing to the portfolio', () => {
    expect(valueOf(entry({ owned: false, read: true, est: 30 }))).toEqual({ amount: null, basis: null });
  });
});

describe('estimateCopies', () => {
  const prices: Record<string, number | null> = { main: 60, 'Cover B Jim Lee Variant': 25 };
  const price = async (_c: ComicLite, variantName: string | null) => {
    const raw = prices[variantName ?? 'main'];
    return raw == null ? null : { raw };
  };
  test('no cover picked → no market estimate', async () => {
    expect(await estimateCopies(entry({}), price)).toBeNull();
  });
  test('each picked cover at its own market price', async () => {
    const e = entry({ variants: [MAIN(), { id: 'v1', name: 'Cover B Jim Lee Variant', cover: null }] });
    expect(await estimateCopies(e, price)).toBe(85);
  });
  test('a variant with no listing counts at its cover price, not the main cover’s market price', async () => {
    const e = entry({ variants: [{ id: 'v9', name: 'Cover F 1:25 Ian Bertram Variant', cover: null, price: 5.99 }] });
    expect(await estimateCopies(e, price)).toBeNull(); // nothing listed → valueOf uses cover prices
    const both = entry({ variants: [MAIN(), { id: 'v9', name: 'Cover F 1:25 Ian Bertram Variant', cover: null }] });
    expect(await estimateCopies(both, price)).toBe(64.99);
  });
  test('a graded copy is valued at its grade', async () => {
    const graded = async () => ({ raw: 10.07, grades: { '6.0': 15.47, '8.0': 24.5, '9.8': 75.68 } });
    const e = entry({ variants: [{ ...MAIN(), grade: { by: 'CGC', grade: 9.8 } }] });
    expect(await estimateCopies(e, graded)).toBe(75.68);
  });
  test('a grade with no sales data: in proportion between known grades, or the nearest lower one as a floor', async () => {
    const graded = async () => ({ raw: 10, grades: { '6.0': 15, '8.0': 24 } });
    expect(await estimateCopies(entry({ variants: [{ ...MAIN(), grade: { by: 'CGC', grade: 7 } }] }), graded)).toBe(19.5);
    expect(await estimateCopies(entry({ variants: [{ ...MAIN(), grade: { by: 'CBCS', grade: 9.8 } }] }), graded)).toBe(24);
  });
  test('collector photos (covers the catalogue lacks) are never price-matched', async () => {
    const seen: (string | null)[] = [];
    const spy = async (c: ComicLite, v: string | null) => {
      seen.push(v);
      return price(c, v);
    };
    const e = entry({ variants: [MAIN(), { id: 'custom:1', name: 'FOMO Books exclusive', cover: null }] });
    expect(await estimateCopies(e, spy)).toBe(64.99);
    expect(seen).toEqual([null]);
  });
});

describe('shelfView', () => {
  const list = [
    entry({ meta: { id: 'a', series: 'Saga', number: '2', releaseDate: '2012-04-01', publisher: 'Image' }, read: true, readAt: '2026-01-05', rating: 4 }),
    entry({ meta: { id: 'b', series: 'Absolute Batman', number: '10', releaseDate: '2025-08-01' }, read: true, readAt: '2026-03-01', rating: 5 }),
    entry({ meta: { id: 'c', series: 'Absolute Batman', number: '2', releaseDate: '2024-11-06' }, read: true, readAt: '2026-02-01' }),
    entry({ meta: { id: 'd', series: 'Batman', number: '1', releaseDate: null }, owned: true, est: 40, variants: [MAIN('d')] }),
  ];
  const ids = (xs: Entry[]) => xs.map((e) => e.comicId);

  test('read shelf keeps only read comics, newest read first', () => {
    expect(ids(shelfView(list, { shelf: 'read', sort: 'read' }))).toEqual(['b', 'c', 'a']);
  });
  test('rating sort: highest first, unrated last', () => {
    expect(ids(shelfView(list, { shelf: 'read', sort: 'rating' }))).toEqual(['b', 'a', 'c']);
  });
  test('series sort is natural (#2 before #10)', () => {
    expect(ids(shelfView(list, { shelf: 'read', sort: 'series' }))).toEqual(['c', 'b', 'a']);
  });
  test('release sort: newest first, undated last', () => {
    expect(ids(shelfView(list, { shelf: 'owned', sort: 'release' }))).toEqual(['b', 'c', 'a', 'd']);
  });
  test('value sort puts the most valuable first', () => {
    expect(ids(shelfView(list, { shelf: 'owned', sort: 'value' }))[0]).toBe('d');
  });
  test('genre filter uses the lookup it is given', () => {
    const genreOf = (e: Entry) => (e.meta.series === 'Saga' ? ['Sci-Fi', 'Fantasy'] : ['Superhero']);
    expect(ids(shelfView(list, { shelf: 'read', sort: 'read', genre: 'Fantasy', genreOf }))).toEqual(['a']);
    expect(ids(shelfView(list, { shelf: 'read', sort: 'read', genre: 'Superhero', genreOf }))).toEqual(['b', 'c']);
  });

  test('your comics can be narrowed to the ones you have not read yet (or have)', () => {
    const shelf = [
      entry({ meta: { id: 'r' }, owned: true, read: true, readAt: '2026-01-01' }),
      entry({ meta: { id: 'u1' }, owned: true }),
      entry({ meta: { id: 'u2' }, owned: true }),
      entry({ meta: { id: 'w' }, owned: false, wishlist: true }),
    ];
    expect(ids(shelfView(shelf, { shelf: 'owned', sort: 'series', read: 'unread' })).sort()).toEqual(['u1', 'u2']);
    expect(ids(shelfView(shelf, { shelf: 'owned', sort: 'series', read: 'read' }))).toEqual(['r']);
    expect(ids(shelfView(shelf, { shelf: 'owned', sort: 'series' })).sort()).toEqual(['r', 'u1', 'u2']);
  });

  test('text search matches series, publisher filter and rating tier narrow it', () => {
    expect(ids(shelfView(list, { shelf: 'read', sort: 'read', q: 'absolute' }))).toEqual(['b', 'c']);
    expect(ids(shelfView(list, { shelf: 'read', sort: 'read', publisher: 'Image' }))).toEqual(['a']);
    expect(ids(shelfView(list, { shelf: 'read', sort: 'read', rating: 5 }))).toEqual(['b']);
    expect(ids(shelfView(list, { shelf: 'owned', sort: 'series', year: 2024 }))).toEqual(['c']);
  });
});

describe('portfolio', () => {
  test('totals, paid, basis counts and publisher split', () => {
    const p = portfolio([
      entry({ meta: { id: 'a', publisher: 'DC Comics' }, est: 20, paid: 5, variants: [MAIN('a')] }),
      entry({ meta: { id: 'b', publisher: 'Marvel' }, value: 100 }),
      entry({ meta: { id: 'c', publisher: 'Marvel', price: null }, variants: [MAIN('c')] }),
      entry({ meta: { id: 'd', publisher: 'Image' }, variants: [MAIN('d')] }),
      entry({ meta: { id: 'e' }, owned: false, wishlist: true, est: 999 }),
    ]);
    expect(p.total).toBeCloseTo(124.99);
    expect(p.owned).toBe(4);
    expect(p.paid).toBe(5);
    expect(p.basis).toEqual({ yours: 1, market: 1, cover: 1, none: 1 });
    expect(p.byPublisher.map((x) => x.publisher)).toEqual(['Marvel', 'DC Comics', 'Image']);
    expect(p.byPublisher[0].value).toBe(100);
    expect(p.top.map((e) => e.comicId)).toEqual(['b', 'a', 'd']);
  });
  test('counts owned comics whose cover is not picked yet (your own value settles it)', () => {
    const p = portfolio([entry({ meta: { id: 'a' } }), entry({ meta: { id: 'b' }, est: 80 }), entry({ meta: { id: 'c' }, value: 10 }), entry({ meta: { id: 'd' }, variants: [MAIN('d')] })]);
    expect(p.unpicked.map((e) => e.comicId)).toEqual(['a', 'b']);
    expect(p.total).toBeCloseTo(4.99 + 4.99 + 10 + 4.99);
  });
});

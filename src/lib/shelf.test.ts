import { describe, expect, test } from 'vitest';
import { issueNum, compareComics, valueOf, portfolio, shelfView } from './shelf';
import type { ComicLite, Entry } from '../types';

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
    expect(valueOf(entry({ value: 50, est: 20 }))).toEqual({ amount: 50, basis: 'yours' });
  });
  test('market estimate beats cover price', () => {
    expect(valueOf(entry({ est: 12.5 }))).toEqual({ amount: 12.5, basis: 'market' });
  });
  test('falls back to cover price × copies owned', () => {
    const e = entry({
      variants: [
        { id: 'v1', name: 'A', cover: null },
        { id: 'v2', name: 'B', cover: null },
      ],
    });
    expect(valueOf(e)).toEqual({ amount: 9.98, basis: 'cover' });
  });
  test('nothing known → no value', () => {
    expect(valueOf(entry({ meta: { price: null } }))).toEqual({ amount: null, basis: null });
  });
  test('things you do not own are worth nothing to the portfolio', () => {
    expect(valueOf(entry({ owned: false, read: true, est: 30 }))).toEqual({ amount: null, basis: null });
  });
});

describe('shelfView', () => {
  const list = [
    entry({ meta: { id: 'a', series: 'Saga', number: '2', releaseDate: '2012-04-01', publisher: 'Image' }, read: true, readAt: '2026-01-05', rating: 4 }),
    entry({ meta: { id: 'b', series: 'Absolute Batman', number: '10', releaseDate: '2025-08-01' }, read: true, readAt: '2026-03-01', rating: 5 }),
    entry({ meta: { id: 'c', series: 'Absolute Batman', number: '2', releaseDate: '2024-11-06' }, read: true, readAt: '2026-02-01' }),
    entry({ meta: { id: 'd', series: 'Batman', number: '1', releaseDate: null }, owned: true, est: 40 }),
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
      entry({ meta: { id: 'a', publisher: 'DC Comics' }, est: 20, paid: 5 }),
      entry({ meta: { id: 'b', publisher: 'Marvel' }, value: 100 }),
      entry({ meta: { id: 'c', publisher: 'Marvel', price: null } }),
      entry({ meta: { id: 'd', publisher: 'Image' } }),
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
});

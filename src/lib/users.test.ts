import { describe, expect, test } from 'vitest';
import { summarize, orderUsers } from './users';
import type { ComicLite, Entry } from '../types';

const comic = (id: string, over: Partial<ComicLite> = {}): ComicLite => ({
  id,
  title: `X #${id}`,
  series: 'X',
  seriesId: null,
  number: id,
  format: 'issue',
  publisher: 'DC Comics',
  releaseDate: '2025-01-01',
  cover: `cover-${id}`,
  price: 4.99,
  ...over,
});
const entry = (id: string, over: Partial<Entry> = {}): Entry => ({
  comicId: id,
  owned: false,
  read: false,
  wishlist: false,
  rating: null,
  readAt: null,
  review: null,
  variants: [],
  paid: null,
  value: null,
  est: null,
  issues: null,
  meta: comic(id),
  addedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});
const MAIN = (id: string) => [{ id, name: 'Main cover', cover: null }];

describe('summarize', () => {
  test('counts each shelf and values the collection the same way the portfolio does', () => {
    const s = summarize([
      entry('1', { owned: true, read: true, variants: MAIN('1'), est: 20, updatedAt: '2026-03-01T00:00:00Z' }),
      entry('2', { owned: true, value: 100, updatedAt: '2026-02-01T00:00:00Z' }),
      entry('3', { read: true, updatedAt: '2026-04-01T00:00:00Z' }),
      entry('4', { wishlist: true }),
    ]);
    expect(s).toMatchObject({ tracked: 4, comics: 2, read: 2, wishlist: 1, value: 120 });
    expect(s.recent.map((c) => c.id)).toEqual(['3', '1', '2', '4']);
  });
  test('nobody home', () => {
    expect(summarize([])).toMatchObject({ tracked: 0, comics: 0, read: 0, wishlist: 0, value: 0, recent: [] });
  });
});

describe('orderUsers', () => {
  const p = (id: string, username: string) => ({ id, username, display_name: null, avatar_url: null });
  test('you first, then the biggest collections, then everyone else A→Z', () => {
    const tracked = new Map([
      ['b', 3],
      ['c', 40],
      ['me', 1],
    ]);
    const order = orderUsers([p('a', 'zed'), p('b', 'bob'), p('c', 'cat'), p('me', 'me'), p('d', 'amy')], 'me', (id) => tracked.get(id) ?? 0);
    expect(order.map((x) => x.id)).toEqual(['me', 'c', 'b', 'd', 'a']);
  });
});

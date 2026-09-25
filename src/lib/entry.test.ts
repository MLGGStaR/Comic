import { describe, expect, test } from 'vitest';
import { applyPatch } from './entry';
import type { ComicLite, Entry } from '../types';

const meta: ComicLite = {
  id: 'c1',
  title: 'Absolute Batman #2',
  series: 'Absolute Batman',
  seriesId: 's1',
  number: '2',
  format: 'issue',
  publisher: 'DC Comics',
  releaseDate: '2024-11-06',
  cover: 'https://x/c.jpg',
  price: 4.99,
};
const NOW = new Date('2026-09-25T10:00:00Z');

const base = (over: Partial<Entry> = {}): Entry => ({
  comicId: 'c1',
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
  meta,
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('applyPatch', () => {
  test('first "have it" creates an owned entry stamped now', () => {
    const e = applyPatch(null, { owned: true }, meta, NOW)!;
    expect(e).toMatchObject({ comicId: 'c1', owned: true, read: false, wishlist: false });
    expect(e.addedAt).toBe(NOW.toISOString());
    expect(e.updatedAt).toBe(NOW.toISOString());
  });

  test('owning something takes it off the wishlist', () => {
    const e = applyPatch(base({ wishlist: true }), { owned: true }, meta, NOW)!;
    expect(e.owned).toBe(true);
    expect(e.wishlist).toBe(false);
  });

  test('wishlisting something you own is ignored', () => {
    const e = applyPatch(base({ owned: true }), { wishlist: true }, meta, NOW)!;
    expect(e.owned).toBe(true);
    expect(e.wishlist).toBe(false);
  });

  test('rating marks it read, dated today', () => {
    const e = applyPatch(null, { rating: 4.5 }, meta, NOW)!;
    expect(e).toMatchObject({ read: true, rating: 4.5, readAt: '2026-09-25' });
  });

  test('marking read keeps an existing read date', () => {
    const e = applyPatch(base({ read: true, readAt: '2025-03-01' }), { read: true }, meta, NOW)!;
    expect(e.readAt).toBe('2025-03-01');
  });

  test('an explicit read date wins', () => {
    const e = applyPatch(null, { read: true, readAt: '2024-12-24' }, meta, NOW)!;
    expect(e.readAt).toBe('2024-12-24');
  });

  test('un-reading clears rating, date and review', () => {
    const e = applyPatch(base({ owned: true, read: true, rating: 4, readAt: '2025-01-01', review: 'great' }), { read: false }, meta, NOW)!;
    expect(e).toMatchObject({ read: false, rating: null, readAt: null, review: null, owned: true });
  });

  test('un-owning clears variants and money fields', () => {
    const e = applyPatch(
      base({ owned: true, read: true, variants: [{ id: 'v1', name: 'Cover B', cover: null }], paid: 10, value: 20, est: 15 }),
      { owned: false },
      meta,
      NOW,
    )!;
    expect(e).toMatchObject({ owned: false, variants: [], paid: null, value: null, est: null, read: true });
  });

  test('logging a variant means you own it', () => {
    const e = applyPatch(base({ wishlist: true }), { variants: [{ id: 'v1', name: 'Cover B', cover: null }] }, meta, NOW)!;
    expect(e.owned).toBe(true);
    expect(e.wishlist).toBe(false);
  });

  test('clearing every flag deletes the entry', () => {
    expect(applyPatch(base({ owned: true }), { owned: false }, meta, NOW)).toBeNull();
    expect(applyPatch(base({ wishlist: true }), { wishlist: false }, meta, NOW)).toBeNull();
  });

  test('fresh metadata replaces the stored snapshot', () => {
    const newer = { ...meta, cover: 'https://x/new.jpg' };
    const e = applyPatch(base({ owned: true }), {}, newer, NOW)!;
    expect(e.meta.cover).toBe('https://x/new.jpg');
  });

  test('keeps addedAt, bumps updatedAt', () => {
    const e = applyPatch(base({ owned: true }), { read: true }, meta, NOW)!;
    expect(e.addedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(e.updatedAt).toBe(NOW.toISOString());
  });
});

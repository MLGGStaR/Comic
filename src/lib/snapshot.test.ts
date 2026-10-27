import { describe, expect, test } from 'vitest';
import { refreshedMeta, dueForCheck } from './snapshot';
import type { ComicDetail, ComicLite } from '../types';

const lite = (over: Partial<ComicLite> = {}): ComicLite => ({
  id: '1',
  title: 'Absolute Catwoman #4',
  series: 'Absolute Catwoman',
  seriesId: '9',
  number: '4',
  format: 'issue',
  formatLabel: 'Comic',
  publisher: 'DC Comics',
  releaseDate: '2026-10-14',
  cover: 'https://s3.amazonaws.com/comicgeeks/comics/covers/medium-1.jpg?111',
  price: 4.99,
  pulls: 100,
  rating: 4.2,
  ...over,
});
const detail = (over: Partial<ComicDetail> = {}): ComicDetail => ({ ...lite(), creators: [], variants: [], reviews: [], ...over });

describe('refreshedMeta', () => {
  test('a delayed comic gets its new release date', () => {
    const next = refreshedMeta(lite(), detail({ releaseDate: '2026-11-04' }));
    expect(next?.releaseDate).toBe('2026-11-04');
    expect(next?.title).toBe('Absolute Catwoman #4');
  });
  test('final cover art replaces the placeholder; a new price or title comes through too', () => {
    expect(refreshedMeta(lite(), detail({ cover: 'https://s3.amazonaws.com/comicgeeks/comics/covers/medium-2.jpg?5' }))?.cover).toContain('medium-2');
    expect(refreshedMeta(lite(), detail({ price: 5.99 }))?.price).toBe(5.99);
    expect(refreshedMeta(lite(), detail({ title: 'Absolute Catwoman #4 (of 6)' }))?.title).toBe('Absolute Catwoman #4 (of 6)');
  });
  test('nothing that matters changed → no write (popularity counts and cache-busting ?query don’t count)', () => {
    expect(refreshedMeta(lite(), detail({ pulls: 250, rating: 4.5 }))).toBeNull();
    expect(refreshedMeta(lite(), detail({ cover: 'https://s3.amazonaws.com/comicgeeks/comics/covers/large-1.jpg?999' }))).toBeNull();
  });
  test('missing values from the source never wipe what is stored', () => {
    expect(refreshedMeta(lite(), detail({ releaseDate: null, cover: null, price: null }))).toBeNull();
  });
});

describe('dueForCheck', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const h = 3600e3;
  test('upcoming and recent comics: twice a day', () => {
    expect(dueForCheck(lite({ releaseDate: '2026-11-04' }), now - 13 * h, now)).toBe(true);
    expect(dueForCheck(lite({ releaseDate: '2026-11-04' }), now - 11 * h, now)).toBe(false);
    expect(dueForCheck(lite({ releaseDate: '2026-09-20' }), now - 13 * h, now)).toBe(true);
  });
  test('older comics: once a month', () => {
    expect(dueForCheck(lite({ releaseDate: '1999-03-03' }), now - 20 * 24 * h, now)).toBe(false);
    expect(dueForCheck(lite({ releaseDate: '1999-03-03' }), now - 31 * 24 * h, now)).toBe(true);
  });
  test('never checked, or no date known: due', () => {
    expect(dueForCheck(lite({ releaseDate: '1999-03-03' }), 0, now)).toBe(true);
    expect(dueForCheck(lite({ releaseDate: null }), now - 13 * h, now)).toBe(true);
  });
});

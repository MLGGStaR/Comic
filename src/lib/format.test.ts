import { describe, expect, test } from 'vitest';
import { coverNumber } from './format';
import type { ComicLite } from '../types';

const c = (over: Partial<ComicLite>): ComicLite => ({
  id: 'x',
  title: 'X #1',
  series: 'X',
  seriesId: null,
  number: '1',
  format: 'issue',
  publisher: null,
  releaseDate: null,
  cover: null,
  price: null,
  ...over,
});

describe('coverNumber', () => {
  test('an issue shows its number', () => {
    expect(coverNumber(c({ number: '23' }))).toBe('#23');
    expect(coverNumber(c({ number: '1.MU' }))).toBe('#1.MU');
    expect(coverNumber(c({ number: '½' }))).toBe('#½');
  });
  test('an issue without a number shows nothing', () => {
    expect(coverNumber(c({ number: null }))).toBe('');
  });
  test('a collected edition shows its volume, else its format', () => {
    expect(coverNumber(c({ format: 'collection', number: null, title: 'Absolute Batman Vol. 2: Abomination TP' }))).toBe('Vol. 2');
    expect(coverNumber(c({ format: 'collection', number: null, title: 'Saga Volume 10 TP' }))).toBe('Vol. 10');
    expect(coverNumber(c({ format: 'collection', number: null, title: 'House of M TP' }))).toBe('TP');
    expect(coverNumber(c({ format: 'collection', number: null, title: 'Infinity Gauntlet HC' }))).toBe('HC');
    expect(coverNumber(c({ format: 'collection', number: null, title: 'House of M Omnibus HC' }))).toBe('Omnibus');
  });
});

import { describe, expect, test } from 'vitest';
import { parseQuery } from './query';

describe('parseQuery', () => {
  test('a "#N" suffix is a single issue', () => {
    expect(parseQuery('absolute batman #2')).toEqual({ series: 'absolute batman', issue: '2', kind: 'issue' });
  });

  test('"vol 1" is a collected edition', () => {
    expect(parseQuery('absolute batman vol 1')).toEqual({ series: 'absolute batman', volume: 1, kind: 'collection' });
  });

  test('"Vol. 1" with capitals and a dot is the same collected edition', () => {
    expect(parseQuery('Absolute Batman Vol. 1')).toEqual({ series: 'absolute batman', volume: 1, kind: 'collection' });
  });

  test('"volume 3" and "tpb 3" are collected editions', () => {
    expect(parseQuery('saga volume 3')).toEqual({ series: 'saga', volume: 3, kind: 'collection' });
    expect(parseQuery('saga tpb 3')).toEqual({ series: 'saga', volume: 3, kind: 'collection' });
  });

  test('a bare title is a series', () => {
    expect(parseQuery('absolute batman')).toEqual({ series: 'absolute batman', kind: 'series' });
  });

  test('a trailing bare number is an issue', () => {
    expect(parseQuery('absolute batman 2')).toEqual({ series: 'absolute batman', issue: '2', kind: 'issue' });
  });

  test('a parenthesised year is kept as a hint', () => {
    expect(parseQuery('Amazing Spider-Man (2022) #1')).toEqual({
      series: 'amazing spider-man',
      issue: '1',
      year: 2022,
      kind: 'issue',
    });
  });

  test('"issue 3" and "no. 4" are issues', () => {
    expect(parseQuery('absolute batman issue 3')).toEqual({ series: 'absolute batman', issue: '3', kind: 'issue' });
    expect(parseQuery('absolute batman no. 4')).toEqual({ series: 'absolute batman', issue: '4', kind: 'issue' });
  });

  test('annuals are flagged, and the series is searched without "annual"', () => {
    expect(parseQuery('batman annual #2')).toEqual({ series: 'batman', issue: '2', annual: true, kind: 'issue' });
    expect(parseQuery('absolute batman 2025 annual #1')).toEqual({ series: 'absolute batman', issue: '1', annual: true, kind: 'issue' });
  });

  test('odd issue numbers survive (#0, #1.MU, #½)', () => {
    expect(parseQuery('batman #0').issue).toBe('0');
    expect(parseQuery('amazing spider-man #1.MU').issue).toBe('1.mu');
    expect(parseQuery('flash #½').issue).toBe('½');
  });

  test('numbers that are part of a title are not issues when an explicit issue follows', () => {
    expect(parseQuery('x-men 97 #1')).toEqual({ series: 'x-men 97', issue: '1', kind: 'issue' });
  });

  test('curly apostrophes and extra spaces are normalised', () => {
    expect(parseQuery('  Batman ’89   #3 ')).toEqual({ series: "batman '89", issue: '3', kind: 'issue' });
  });

  test('a trailing 4-digit year is a year hint, not issue #2016', () => {
    expect(parseQuery('batman 2016')).toEqual({ series: 'batman', year: 2016, kind: 'series' });
  });

  test('a lone number never becomes an empty-titled issue', () => {
    expect(parseQuery('2099')).toEqual({ series: '2099', kind: 'series' });
  });
});

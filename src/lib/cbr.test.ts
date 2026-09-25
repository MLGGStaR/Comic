// Comic Book Roundup parsing, against pages saved on 2026-09-25.
import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseCbrIssue, parseCbrSearch, cbrIssueUrl, cbrSlug } from '../../supabase/functions/_shared/cbr.ts';

const page = (f: string) => fs.readFileSync(`supabase/functions/_shared/fixtures/${f}`, 'utf8');

describe('parseCbrIssue', () => {
  const ab2 = parseCbrIssue(page('cbr_absbat2.html'));

  test('critic and user scores with counts', () => {
    expect(ab2).toMatchObject({ criticScore: 8.9, criticCount: 21, userScore: 8.6, userCount: 105 });
  });

  test('creators from the info table', () => {
    expect(ab2.creators).toEqual([
      { name: 'Scott Snyder', role: 'Writer' },
      { name: 'Nick Dragotta', role: 'Artist' },
    ]);
  });

  test('every critic review with outlet, score, link', () => {
    expect(ab2.critics).toHaveLength(21);
    expect(ab2.critics.find((r) => r.outlet === 'Geek Dad')).toMatchObject({
      reviewer: 'Ray Goldfield',
      score: 10,
      date: 'Nov 13, 2024',
      url: 'https://geekdad.com/2024/11/review-absolute-batman-2-tracking-the-bat/',
    });
  });

  test('user reviews with name, avatar, score and the full text (hidden "more" part included)', () => {
    expect(ab2.users.length).toBeGreaterThan(5);
    const first = ab2.users[0];
    expect(first).toMatchObject({ user: 'motorik', score: 10, date: 'Nov 13, 2024' });
    expect(first.avatar).toMatch(/^https:\/\/images\.comicbookroundup\.com\/img\/users\/avatars\//);
    expect(first.text).toContain('Scott Snyder reasserts himself');
    expect(first.text).not.toContain('<');
  });

  test('old keys often have users but no critic score', () => {
    const asm = parseCbrIssue(page('cbr_asm300.html'));
    expect(asm.criticScore).toBeNull();
    expect(asm.userScore).toBe(8.7);
    expect(asm.userCount).toBe(19);
  });
});

describe('CBR urls', () => {
  test('slugs', () => {
    expect(cbrSlug('DC Comics')).toBe('dc-comics');
    expect(cbrSlug('BOOM! Studios')).toBe('boom-studios');
    expect(cbrSlug("X-Men '97")).toBe('x-men-97');
  });
  test('issue url from publisher, series, start year and number', () => {
    expect(cbrIssueUrl({ publisher: 'DC Comics', series: 'Absolute Batman', year: 2024, number: '2' })).toBe(
      'https://comicbookroundup.com/comic-books/reviews/dc-comics/absolute-batman-(2024)/2',
    );
  });
  test('search page → series links with year', () => {
    const hits = parseCbrSearch(page('cbr_search.html'));
    expect(hits).toContainEqual({ path: '/comic-books/reviews/dc-comics/absolute-batman-(2024)', title: 'Absolute Batman', year: 2024 });
    expect(hits.every((h) => /-\(\d{4}\)$/.test(h.path))).toBe(true);
  });
});

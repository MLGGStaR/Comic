// Parsers for League of Comic Geeks' get_comics responses, tested against
// real responses saved on 2026-09-25 (supabase/functions/_shared/fixtures).
import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  parseIssueItems,
  parseSeriesCards,
  toComicLite,
  splitTitle,
  rankSeries,
  largeCover,
  mediumCover,
  pickIssue,
  cleanCover,
} from '../../supabase/functions/_shared/locg.ts';
import { parseQuery } from './query';

const fx = (name: string) =>
  JSON.parse(fs.readFileSync(`supabase/functions/_shared/fixtures/${name}`, 'utf8')) as { list: string; series?: { title: string } };

describe('parseIssueItems', () => {
  const items = parseIssueItems(fx('in_series_ab_2.json').list);

  test('finds the main issue and links its variants to it', () => {
    const main = items.find((i) => i.id === '8081353')!;
    expect(main).toMatchObject({ parentId: null, title: 'Absolute Batman #2', publisher: 'DC Comics', releaseDate: '2024-11-13', price: 4.99 });
    const variants = items.filter((i) => i.parentId === '8081353');
    expect(variants.length).toBeGreaterThanOrEqual(10);
    expect(variants.find((v) => v.id === '3023285')).toMatchObject({ variantName: 'Cover G Dan Panosian Variant', price: 5.99 });
  });

  test('reads pulls, consensus and cover urls', () => {
    const main = items.find((i) => i.id === '8081353')!;
    expect(main.pulls).toBeGreaterThan(1000);
    expect(main.community).toBe(99);
    expect(main.cover).toMatch(/^https:\/\/s3\.amazonaws\.com\/comicgeeks\/comics\/covers\/medium-8081353\.jpg/);
  });

  test('list view carries SKU / description on release lists', () => {
    const rel = parseIssueItems(fx('releases_2026-10-07_dc_list.json').list);
    expect(rel.length).toBeGreaterThan(10);
    expect(rel.some((i) => i.sku)).toBe(true);
    expect(rel.some((i) => (i.description ?? '').length > 40)).toBe(true);
  });
});

describe('parseSeriesCards', () => {
  test('series search → id, title, publisher, years, issue count, cover', () => {
    const cards = parseSeriesCards(fx('search_series_absolute_batman.json').list);
    expect(cards[0]).toEqual({
      id: '178012',
      title: 'Absolute Batman',
      publisher: 'DC Comics',
      years: '2024 - Present',
      count: 35,
      cover: 'https://s3.amazonaws.com/comicgeeks/comics/covers/medium-2463692.jpg',
    });
    expect(cards.length).toBeGreaterThan(5);
  });
});

describe('splitTitle', () => {
  test('issues', () => {
    expect(splitTitle('Absolute Batman #2')).toEqual({ series: 'Absolute Batman', number: '2', format: 'issue', formatLabel: null, volume: null });
    expect(splitTitle('Amazing Spider-Man #1000')).toMatchObject({ series: 'Amazing Spider-Man', number: '1000' });
  });
  test('collected editions', () => {
    expect(splitTitle('Absolute Batman Vol. 1: The Zoo TP')).toEqual({
      series: 'Absolute Batman',
      number: null,
      format: 'collection',
      formatLabel: 'Trade Paperback',
      volume: 1,
    });
    expect(splitTitle('Absolute Batman Deluxe Edition Vol. 1 HC')).toMatchObject({ format: 'collection', formatLabel: 'Hardcover', volume: 1 });
  });
});

describe('toComicLite', () => {
  test('main issue → ComicLite with parsed series and number', () => {
    const it = parseIssueItems(fx('in_series_ab_2.json').list).find((i) => i.id === '8081353')!;
    expect(toComicLite(it, { seriesId: '178012', series: 'Absolute Batman' })).toMatchObject({
      id: '8081353',
      title: 'Absolute Batman #2',
      series: 'Absolute Batman',
      seriesId: '178012',
      number: '2',
      format: 'issue',
      publisher: 'DC Comics',
      releaseDate: '2024-11-13',
      price: 4.99,
    });
  });
});

describe('pickIssue', () => {
  const item = (id: string, title: string, parentId: string | null = null) =>
    ({ id, title, parentId, variantName: null, releaseDate: null, price: null, pulls: null, community: null, potw: null, publisher: 'DC Comics', cover: null, href: null, description: null, sku: null, foc: null, variantCount: null }) as const;
  const items = [
    item('a1', 'Absolute Batman 2025 Annual #1'),
    item('v1', 'Absolute Batman #1', 'm1'),
    item('m10', 'Absolute Batman #10'),
    item('m1', 'Absolute Batman #1'),
  ];

  test('a regular issue number never resolves to the annual', () => {
    expect(pickIssue([...items], { issue: '1' })?.id).toBe('m1');
  });
  test('an annual query picks the annual', () => {
    expect(pickIssue([...items], { issue: '1', annual: true })?.id).toBe('a1');
  });
  test('variants and near-miss numbers never match', () => {
    expect(pickIssue([item('v1', 'Absolute Batman #1', 'm1')], { issue: '1' })).toBeNull();
    expect(pickIssue([item('m10', 'Absolute Batman #10')], { issue: '1' })).toBeNull();
  });
});

describe('cover sizes', () => {
  test('LoCG "no cover" placeholders become null', () => {
    expect(cleanCover('/assets/images/no-cover-medium.jpg?2')).toBeNull();
    expect(cleanCover('https://s3.amazonaws.com/comicgeeks/comics/covers/medium-1.jpg')).toBe('https://s3.amazonaws.com/comicgeeks/comics/covers/medium-1.jpg');
  });

  test('swap between medium and large', () => {
    const m = 'https://s3.amazonaws.com/comicgeeks/comics/covers/medium-8081353.jpg?1744681047';
    expect(largeCover(m)).toBe('https://s3.amazonaws.com/comicgeeks/comics/covers/large-8081353.jpg?1744681047');
    expect(mediumCover(largeCover(m))).toBe(m);
  });
});

describe('rankSeries', () => {
  test('the original US series beats reprint editions', () => {
    const cards = parseSeriesCards(fx('search_series_absolute_batman.json').list);
    const ranked = rankSeries(cards, parseQuery('absolute batman #2'));
    expect(ranked[0].id).toBe('178012');
  });
  test('an exact title beats a longer one', () => {
    const cards = [
      { id: 'a', title: 'Absolute Batman: Ark M Special', publisher: 'DC Comics', years: '2025', count: 1, cover: null },
      { id: 'b', title: 'Absolute Batman', publisher: 'DC Comics', years: '2024 - Present', count: 35, cover: null },
    ];
    expect(rankSeries(cards, parseQuery('absolute batman'))[0].id).toBe('b');
  });
  test('a year hint picks the right volume', () => {
    const cards = [
      { id: 'old', title: 'Batman', publisher: 'DC Comics', years: '2016 - 2025', count: 160, cover: null },
      { id: 'new', title: 'Batman', publisher: 'DC Comics', years: '2025 - Present', count: 12, cover: null },
    ];
    expect(rankSeries(cards, parseQuery('batman (2016) #50'))[0].id).toBe('old');
    expect(rankSeries(cards, parseQuery('batman #5'))[0].id).toBe('new');
  });
});

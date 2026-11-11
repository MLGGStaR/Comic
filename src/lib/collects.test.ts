import { describe, expect, test } from 'vitest';
import { parseCollects } from '../../supabase/functions/_shared/collects.ts';

describe('parseCollects', () => {
  test('one run: every number in the range', () => {
    expect(parseCollects('Batman #404–407')).toEqual([{ series: 'Batman', year: null, numbers: ['404', '405', '406', '407'] }]);
    expect(parseCollects('House of M #1-8')).toEqual([{ series: 'House of M', year: null, numbers: ['1', '2', '3', '4', '5', '6', '7', '8'] }]);
  });
  test('a volume year in brackets is kept as a hint', () => {
    expect(parseCollects('Batman (1940) #404–407')[0]).toEqual({ series: 'Batman', year: 1940, numbers: ['404', '405', '406', '407'] });
    expect(parseCollects('Secret Wars (2015) #1–9, plus material from Secret Wars FCBD 2015')).toEqual([
      { series: 'Secret Wars', year: 2015, numbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] },
    ]);
  });
  test('several runs, specials and annuals, in order', () => {
    expect(parseCollects('Action Comics #1064–1066, Superman #11–13, Superman: House of Brainiac Special #1')).toEqual([
      { series: 'Action Comics', year: null, numbers: ['1064', '1065', '1066'] },
      { series: 'Superman', year: null, numbers: ['11', '12', '13'] },
      { series: 'Superman: House of Brainiac Special', year: null, numbers: ['1'] },
    ]);
    expect(parseCollects('Injustice: Gods Among Us #1-12 and Injustice: Gods Among Us Annual #1').map((r) => [r.series, r.numbers.length])).toEqual([
      ['Injustice: Gods Among Us', 12],
      ['Injustice: Gods Among Us Annual', 1],
    ]);
  });
  test('"and" inside a title stays; separate single issues each count', () => {
    expect(parseCollects('Batman and Robin #1-3')).toEqual([{ series: 'Batman and Robin', year: null, numbers: ['1', '2', '3'] }]);
    expect(parseCollects('Daredevil #181, #191')).toEqual([{ series: 'Daredevil', year: null, numbers: ['181', '191'] }]);
  });
  test('nothing usable → empty', () => {
    expect(parseCollects(null)).toEqual([]);
    expect(parseCollects('stories from the anthology')).toEqual([]);
  });
});

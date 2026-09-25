import { describe, expect, test } from 'vitest';
import { parsePcName, pickProduct, pcMoney, gradedPrice, variantQuery, type PcProduct } from './pricing';

const P = (productName: string, price1: string, id = productName): PcProduct => ({ id, productName, consoleName: 'Comic Books Daredevil', price1, price2: '$1.00', price3: '$1.00' });

describe('parsePcName', () => {
  test('main cover', () => {
    expect(parsePcName('Absolute Batman #2 (2024)')).toEqual({ series: 'Absolute Batman', tag: null, number: '2', year: 2024 });
  });
  test('variant tag between series and number', () => {
    expect(parsePcName('Absolute Batman [2nd Print Batmobile] #2 (2024)')).toEqual({
      series: 'Absolute Batman',
      tag: '2nd Print Batmobile',
      number: '2',
      year: 2024,
    });
  });
  test('names without a year or number are not issues', () => {
    expect(parsePcName('Absolute Batman Vol. 1 The Zoo')).toBeNull();
  });
});

describe('pcMoney', () => {
  test('parses dollars', () => {
    expect(pcMoney('$1,063.75')).toBe(1063.75);
    expect(pcMoney('')).toBeNull();
    expect(pcMoney('$0.00')).toBeNull();
  });
});

describe('pickProduct', () => {
  const list = [
    P('Absolute Batman #20 (2025)', '$8.00'),
    P('Absolute Batman [2nd Print Batmobile] #2 (2024)', '$380.22'),
    P('Absolute Batman [Johnson] #2 (2024)', '$105.00'),
    P('Absolute Batman #2 (2024)', '$63.75'),
    P('Batman #2 (2016)', '$4.00'),
  ];

  test('the main cover of the exact issue', () => {
    expect(pickProduct(list, { series: 'Absolute Batman', number: '2', year: 2024 })?.productName).toBe('Absolute Batman #2 (2024)');
  });

  test('a variant by the artist named in its tag', () => {
    expect(
      pickProduct(list, { series: 'Absolute Batman', number: '2', year: 2024, variantName: 'Cover B Daniel Warren Johnson Variant' })?.productName,
    ).toBe('Absolute Batman [Johnson] #2 (2024)');
  });

  test('an unmatched variant has no price — never the main cover’s', () => {
    expect(pickProduct(list, { series: 'Absolute Batman', number: '2', year: 2024, variantName: 'Cover F Rafael Albuquerque Variant' })).toBeNull();
  });

  test('the right volume by year', () => {
    const vols = [P('Batman #50 (1940)', '$900.00'), P('Batman #50 (2016)', '$6.00')];
    expect(pickProduct(vols, { series: 'Batman', number: '50', year: 2018 })?.productName).toBe('Batman #50 (2016)');
  });

  test('"The" and punctuation do not matter; wrong numbers never match', () => {
    const l = [P('The Amazing Spider-Man #300 (1963)', '$381.27')];
    expect(pickProduct(l, { series: 'Amazing Spider-Man', number: '300', year: 1988 })?.productName).toBe('The Amazing Spider-Man #300 (1963)');
    expect(pickProduct(l, { series: 'Amazing Spider-Man', number: '30', year: 1988 })).toBeNull();
  });

  // real PriceCharting results for "Daredevil #1": the 1998 volume isn't among them
  const dd = [P('Daredevil #1 (1964)', '$1,487.48'), P('Daredevil #1 (2014)', '$7.43'), P('Daredevil #1 (2019)', '$11.00'), P('Daredevil [2nd Print] #1 (2011)', '$5.00')];

  test('an issue is never priced as a decades-older volume (Daredevil #1 from 1998 is not the 1964 #1)', () => {
    expect(pickProduct(dd, { series: 'Daredevil', number: '1', year: 1998 })).toBeNull();
    expect(pickProduct(dd, { series: 'Daredevil', number: '3', year: 1998 })).toBeNull();
  });

  test('…and once its own volume is listed, that is the one', () => {
    expect(pickProduct([...dd, P('Daredevil #1 (1998)', '$10.07')], { series: 'Daredevil', number: '1', year: 1998 })?.productName).toBe('Daredevil #1 (1998)');
  });

  test('only comic books count — not trading cards or other collectibles', () => {
    const cards = [{ ...P('Daredevil #1 (1998)', '$54.99'), consoleName: 'Marvel Cards' }];
    expect(pickProduct(cards, { series: 'Daredevil', number: '1', year: 1998 })).toBeNull();
  });

  // real listings for Absolute Batman #1 printings (listed under the reprint's own year)
  const ab = [
    P('Absolute Batman #1 (2024)', '$31.00'),
    P('Absolute Batman [2nd Print Felix] #1 (2024)', '$2,000.00'),
    P('Absolute Batman [10th Print Lee] #1 (2026)', '$10.42'),
    P('Absolute Batman [10th Print] #1 (2026)', '$8.79'),
    P('Absolute Batman [11th Print] #1 (2026)', '$6.93'),
    P('Absolute Batman [Dragotta Virgin] #1 (2024)', '$40.00'),
    P('Absolute Batman [1:25 Dragotta Virgin Sketch] #1 (2024)', '$399.99'),
  ];
  const abWant = (variantName: string) => ({ series: 'Absolute Batman', number: '1', year: 2024, variantName });

  test('a printing matches only that printing, under the year it came out', () => {
    expect(pickProduct(ab, abWant('11th Printing'))?.productName).toBe('Absolute Batman [11th Print] #1 (2026)');
    expect(pickProduct(ab, abWant('10th Printing Jim Lee Variant'))?.productName).toBe('Absolute Batman [10th Print Lee] #1 (2026)');
    expect(pickProduct(ab, abWant('2nd Printing'))).toBeNull(); // only a different 2nd-print cover is listed
  });

  test('a regular variant never takes the virgin, sketch or ratio listing by the same artist', () => {
    expect(pickProduct(ab, abWant('Cover B Nick Dragotta Variant'))).toBeNull();
    expect(pickProduct([...ab, P('Absolute Batman [Dragotta] #1 (2024)', '$12.00')], abWant('Cover B Nick Dragotta Variant'))?.productName).toBe(
      'Absolute Batman [Dragotta] #1 (2024)',
    );
  });

  test('a virgin foil incentive matches its own listing', () => {
    const l = [P('X-Men [Gerads] #1 (2024)', '$10.00'), P('X-Men [1:50 Gerads Foil Virgin] #1 (2024)', '$90.00')];
    expect(pickProduct(l, { series: 'X-Men', number: '1', year: 2024, variantName: 'Cover G 1:50 Mitch Gerads Foil Virgin Variant' })?.productName).toBe(
      'X-Men [1:50 Gerads Foil Virgin] #1 (2024)',
    );
  });
});

describe('variantQuery', () => {
  test('the words that find a variant’s own listing', () => {
    expect(variantQuery('11th Printing')).toBe('11th print');
    expect(variantQuery('2nd Printing Dragotta Variant')).toBe('2nd print dragotta');
    expect(variantQuery('3rd Printing')).toBe('3rd print');
    expect(variantQuery('12th Printing')).toBe('12th print');
    expect(variantQuery('22nd Printing')).toBe('22nd print');
    expect(variantQuery('Cover C Jim Lee Variant')).toBe('lee');
    expect(variantQuery('Cover G 1:50 Mitch Gerads Foil Virgin Variant')).toBe('gerads foil virgin');
  });
});

describe('gradedPrice', () => {
  const grades = { raw: 10.07, '6.0': 15.47, '8.0': 24.5, '9.4': 53.85, '9.8': 75.68 };
  test('the exact grade when it has sales', () => {
    expect(gradedPrice(grades, 9.8)).toEqual({ amount: 75.68, basis: 'exact', from: '9.8' });
  });
  test('between two known grades: in proportion', () => {
    expect(gradedPrice(grades, 9.6)).toEqual({ amount: 64.77, basis: 'between', from: '9.4–9.8' });
  });
  test('above every known grade: the highest known is a floor, and says so', () => {
    expect(gradedPrice({ raw: 10, '6.0': 15, '8.0': 24 }, 9.8)).toEqual({ amount: 24, basis: 'floor', from: '8.0' });
  });
  test('below every known grade: the lowest known grade, never more than raw', () => {
    expect(gradedPrice({ raw: 10, '6.0': 15, '8.0': 24 }, 4)).toEqual({ amount: 10, basis: 'raw', from: 'raw' });
  });
  test('no grade data at all: raw', () => {
    expect(gradedPrice({ raw: 10 }, 9.8)).toEqual({ amount: 10, basis: 'raw', from: 'raw' });
    expect(gradedPrice({}, 9.8)).toBeNull();
  });
});

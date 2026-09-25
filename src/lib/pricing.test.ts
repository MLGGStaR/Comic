import { describe, expect, test } from 'vitest';
import { parsePcName, pickProduct, pcMoney, type PcProduct } from './pricing';

const P = (productName: string, price1: string, id = productName): PcProduct => ({ id, productName, consoleName: 'Comic Books', price1, price2: '$1.00', price3: '$1.00' });

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

  test('an unmatched variant falls back to the main cover', () => {
    expect(pickProduct(list, { series: 'Absolute Batman', number: '2', year: 2024, variantName: 'Cover F Rafael Albuquerque Variant' })?.productName).toBe(
      'Absolute Batman #2 (2024)',
    );
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
});

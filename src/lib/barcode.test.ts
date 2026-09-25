import { describe, expect, test } from 'vitest';
import { decodeBarcode } from './barcode';

// 761941341828 is a checksum-valid UPC-A (synthetic); 9781779507587 a valid ISBN-13.
describe('decodeBarcode', () => {
  test('UPC-A + 5-digit add-on → issue, cover, printing', () => {
    expect(decodeBarcode('76194134182800111')).toEqual({
      kind: 'upc',
      upc: '761941341828',
      addon: '00111',
      issue: 1,
      cover: 1,
      printing: 1,
    });
  });

  test('add-on 02532 → issue 25, cover 3, 2nd printing', () => {
    expect(decodeBarcode('76194134182802532')).toMatchObject({ issue: 25, cover: 3, printing: 2 });
  });

  test('spaces and dashes from manual entry are ignored', () => {
    expect(decodeBarcode('7 61941 34182 8 00211')).toMatchObject({ upc: '761941341828', issue: 2 });
  });

  test('bare UPC-A without add-on', () => {
    expect(decodeBarcode('761941341828')).toEqual({ kind: 'upc', upc: '761941341828' });
  });

  test('EAN-13 with a leading 0 is a UPC-A', () => {
    expect(decodeBarcode('0761941341828')).toEqual({ kind: 'upc', upc: '761941341828' });
  });

  test('ISBN-13 + price add-on (5 = USD) → isbn and price', () => {
    expect(decodeBarcode('978177950758751799')).toEqual({ kind: 'isbn', isbn: '9781779507587', price: 17.99 });
  });

  test('ISBN add-on 90000 means no price', () => {
    expect(decodeBarcode('978177950758790000')).toEqual({ kind: 'isbn', isbn: '9781779507587' });
  });

  test('bad check digits are rejected (misreads never resolve to the wrong comic)', () => {
    expect(decodeBarcode('761941341823')).toBeNull();
    expect(decodeBarcode('9781779507580')).toBeNull();
  });

  test('garbage is rejected', () => {
    expect(decodeBarcode('hello')).toBeNull();
    expect(decodeBarcode('12345')).toBeNull();
  });
});

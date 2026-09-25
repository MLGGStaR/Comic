// Integration: a rendered UPC-A + EAN-5 image must come back through our
// reader options and barcode parser as issue #1, cover A, first printing.
import fs from 'node:fs';
import { describe, expect, test, beforeAll } from 'vitest';
import bwipjs from 'bwip-js';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { READER_OPTS, bestCode } from './readerOptions';

beforeAll(async () => {
  const wasmBinary = fs.readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm');
  await prepareZXingModule({ overrides: { wasmBinary: wasmBinary.buffer.slice(wasmBinary.byteOffset, wasmBinary.byteOffset + wasmBinary.byteLength) }, fireImmediately: true });
});

// printed comics put the add-on ~7–10 modules from the main code (bwip-js
// defaults to 12, the far edge of the spec, which the reader skips)
async function render(text: string, bcid: string): Promise<Uint8Array> {
  return new Uint8Array(
    await bwipjs.toBuffer({ bcid, text, scale: 3, height: 18, includetext: true, addongap: 9, paddingwidth: 12, paddingheight: 8, backgroundcolor: 'FFFFFF' }),
  );
}

describe('barcode reader', () => {
  test('reads the 5-digit add-on beside a UPC-A (issue, cover, printing)', async () => {
    const png = await render('761941341828 00111', 'upca');
    const results = await readBarcodes(png, READER_OPTS);
    expect(bestCode(results.map((r) => r.text))).toMatchObject({
      kind: 'upc',
      upc: '761941341828',
      addon: '00111',
      issue: 1,
      cover: 1,
      printing: 1,
    });
  });

  test('prefers the read that includes the add-on when both come back', () => {
    expect(bestCode(['0761941341828', '076194134182800111'])).toMatchObject({ issue: 1, addon: '00111' });
    expect(bestCode(['hello', '0761941341828'])).toMatchObject({ upc: '761941341828' });
    expect(bestCode(['nope'])).toBeNull();
  });

  test('reads an ISBN with its price add-on', async () => {
    const png = await render('9781779507587 51799', 'ean13');
    const results = await readBarcodes(png, READER_OPTS);
    expect(bestCode(results.map((r) => r.text))).toEqual({ kind: 'isbn', isbn: '9781779507587', price: 17.99 });
  });
});

import type { ReaderOptions } from 'zxing-wasm/reader';
import { decodeBarcode, type Barcode } from '../lib/barcode';

// Comic barcodes: UPC-A (issues) / EAN-13 (ISBN trades), plus the EAN-5
// add-on that carries issue number + cover + printing (or the book price).
export const READER_OPTS: ReaderOptions = {
  formats: ['UPC-A', 'UPC-E', 'EAN-13'],
  eanAddOnSymbol: 'Read',
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
  maxNumberOfSymbols: 4,
};

/** The reader can return the main code alone AND main+add-on for one
 *  barcode; take a valid read that carries the add-on when there is one. */
export function bestCode(texts: string[]): Barcode | null {
  const parsed = texts.map(decodeBarcode).filter((b): b is Barcode => !!b);
  const withAddon = parsed.find((b) => (b.kind === 'upc' ? !!b.addon : b.price != null));
  return withAddon ?? parsed[0] ?? null;
}

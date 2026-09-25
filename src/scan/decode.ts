// Browser barcode decoding via zxing-wasm (works on iOS Safari, which has
// no native BarcodeDetector). The ~900 KB wasm is self-hosted and only
// fetched when a scanner opens.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { READER_OPTS } from './readerOptions';

type Reader = typeof import('zxing-wasm/reader');
let reader: Promise<Reader> | null = null;

function load(): Promise<Reader> {
  if (!reader) {
    reader = import('zxing-wasm/reader').then(async (mod) => {
      await mod.prepareZXingModule({
        overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
        fireImmediately: true,
      });
      return mod;
    });
    reader.catch(() => {
      reader = null;
    });
  }
  return reader;
}

export async function warmDecoder(): Promise<void> {
  await load().catch(() => {});
}

/** Every barcode text found in the frame (main code and main+add-on reads). */
export async function decodeFrame(canvas: HTMLCanvasElement): Promise<string[]> {
  const mod = await load();
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const res = await mod.readBarcodes(img, READER_OPTS);
  return res.filter((r) => r.isValid).map((r) => r.text);
}

// Comic barcodes, decoded:
//  • single issues: UPC-A (12 digits, one per series) + 5-digit add-on where
//    digits 1-3 = issue number, 4 = cover (1 = A, 2 = B…), 5 = printing
//  • collected editions: ISBN-13 (978/979…) + 5-digit price add-on
//    (leading 5 = USD, then the price in cents; 90000 = no price)
// Check digits are verified so a misread never resolves to the wrong comic.

export type Barcode =
  | { kind: 'upc'; upc: string; addon?: string; issue?: number; cover?: number; printing?: number }
  | { kind: 'isbn'; isbn: string; price?: number };

function validUpcA(d: string): boolean {
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += Number(d[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(d[11]);
}

function validEan13(d: string): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
}

function upc(main: string, addon?: string): Barcode | null {
  if (!validUpcA(main)) return null;
  if (!addon) return { kind: 'upc', upc: main };
  return {
    kind: 'upc',
    upc: main,
    addon,
    issue: Number(addon.slice(0, 3)),
    cover: Number(addon[3]),
    printing: Number(addon[4]),
  };
}

function isbn(main: string, addon?: string): Barcode | null {
  if (!validEan13(main)) return null;
  if (addon && addon[0] === '5' && addon !== '59999') {
    const cents = Number(addon.slice(1));
    if (cents > 0) return { kind: 'isbn', isbn: main, price: cents / 100 };
  }
  return { kind: 'isbn', isbn: main };
}

export function decodeBarcode(raw: string): Barcode | null {
  const d = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(d)) return null;

  // EAN-13 family: books (978/979) or a UPC-A written with a leading 0
  if (d.length === 13 || d.length === 18 || d.length === 15) {
    const main = d.slice(0, 13);
    const addon = d.length === 18 ? d.slice(13) : undefined;
    if (main.startsWith('978') || main.startsWith('979')) return isbn(main, addon);
    if (main.startsWith('0')) return upc(main.slice(1), addon);
    return null;
  }
  if (d.length === 12) return upc(d);
  if (d.length === 17) return upc(d.slice(0, 12), d.slice(12));
  if (d.length === 14) return upc(d.slice(0, 12)); // 2-digit add-on (older comics): ignore it
  return null;
}

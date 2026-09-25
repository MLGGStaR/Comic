// Renders public/icon.svg to the PNG sizes the manifest + iOS need.
// run: node scripts/icons.mjs   (needs @resvg/resvg-js, a devDependency)
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = fs.readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const render = (size, src = svg) =>
  new Resvg(src, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' }).render().asPng();

for (const size of [180, 192, 512]) {
  fs.writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), render(size));
}
// maskable: full-bleed background, artwork shrunk into the 80% safe zone
const inner = svg
  .replace(/<rect width="512" height="512" rx="112" fill="#161b28"\/>/, '')
  .replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">', '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#161b28"/><g transform="translate(51.2 51.2) scale(0.8)">${inner.replace('</svg>', '')}</g></svg>`;
fs.writeFileSync(new URL('../public/icon-maskable-512.png', import.meta.url), render(512, maskable));
console.log('icons written');

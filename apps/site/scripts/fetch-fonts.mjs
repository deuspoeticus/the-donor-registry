/**
 * Fetches the three faces into `src/fonts/`.
 *
 *   node scripts/fetch-fonts.mjs
 *
 * The page makes no third-party request at runtime, including for its lettering:
 * a piece about surfaces that report on you without asking does not get to open a
 * connection to Google so that its headlines look right. So the faces are pulled
 * once, at build time, by hand, and committed.
 *
 * The symbol face is the reason this script exists rather than a paragraph in the
 * README. Noto Sans Symbols 2 ships its symbol block as 382 kB, and this site
 * draws about forty marks from it. The glyph list is read straight out of
 * `src/ui/glyphs.ts` — the single declaration of the notation — and handed to
 * Google's `text=` subsetter, which returns a little under five. Add a mark to
 * that table and re-run this; skip the re-run and the new mark falls back to
 * whatever the visitor's system has, which on this site is itself a
 * fingerprintable event.
 *
 * Re-running is safe and idempotent. The URLs carry Google's own version stamp,
 * so a face that has been revised upstream arrives revised; check the diff.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/fonts/', import.meta.url));
const GLYPH_SOURCE = fileURLToPath(new URL('../src/ui/glyphs.ts', import.meta.url));

// Google serves woff2 only to browsers it recognises; anything else gets ttf.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * Whole subsets, by their stable gstatic URL.
 *
 * Latin and latin-ext are separate files with separate unicode-ranges, and the
 * stylesheet declares both: latin-ext is never fetched by an English reader and
 * is there for the day a pool entry carries a value that needs it.
 */
const WHOLE = [
  {
    file: 'jacquard24-latin.woff2',
    url: 'https://fonts.gstatic.com/s/jacquard24/v4/jVyO7nf_B2zO5jVpUGU8ljQDf8k.woff2',
  },
  {
    file: 'jacquard24-latin-ext.woff2',
    url: 'https://fonts.gstatic.com/s/jacquard24/v4/jVyO7nf_B2zO5jVpUGU8ljQNf8lv9w.woff2',
  },
  // Archivo, variable on two axes: weight 100-900 and width 62-125%. The width
  // axis is the reason this family rather than a single-axis grotesque — the
  // labels and the addresses are set narrow, and a synthesised condensed is a
  // smear rather than a face.
  {
    file: 'archivo-latin.woff2',
    url: 'https://fonts.gstatic.com/s/archivo/v25/k3kQo8UDI-1M0wlSfdnoLg.woff2',
  },
  {
    file: 'archivo-latin-ext.woff2',
    url: 'https://fonts.gstatic.com/s/archivo/v25/k3kQo8UDI-1M0wlSfdfoLnnA.woff2',
  },
];

/** Every `glyph: '…'` in the notation table, in declaration order. */
function readNotation() {
  const source = readFileSync(GLYPH_SOURCE, 'utf8');
  const marks = [...source.matchAll(/glyph:\s*'([^']+)'/gu)].map((m) => m[1]);
  const ordinals = /ORDINALS = \[([^\]]+)\]/u.exec(source);
  const circled = ordinals ? [...ordinals[1].matchAll(/'([^']+)'/gu)].map((m) => m[1]) : [];
  const all = [...new Set([...marks, ...circled])];
  if (all.length === 0) throw new Error(`found no glyphs in ${GLYPH_SOURCE}`);
  return all.join('');
}

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

async function download(url, file) {
  const bytes = Buffer.from(await (await get(url)).arrayBuffer());
  writeFileSync(new URL(file, `file://${OUT.replace(/\\/g, '/')}`), bytes);
  console.log(`${file.padEnd(30)} ${String(bytes.length).padStart(7)} bytes`);
}

mkdirSync(OUT, { recursive: true });

for (const { file, url } of WHOLE) await download(url, file);

const notation = readNotation();
const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+Symbols+2&text=${encodeURIComponent(notation)}`;
const css = await (await get(cssUrl)).text();
const match = /url\((https:[^)]+)\)/.exec(css);
if (!match) throw new Error(`no woff2 url in the subsetter's response:\n${css}`);
await download(match[1], 'symbols2-ui.woff2');

console.log(`\nsymbol face subsetted to ${[...notation].length} glyphs: ${notation}`);
console.log('unicode-range returned by the subsetter (check styles/tokens.css against it):');
console.log((/unicode-range:([^;]+);/.exec(css)?.[1] ?? '?').trim());

/**
 * Builds the sigils: `node scripts/fetch-sigils.mjs`
 *
 * The page carries a second notation beside its typographic marks — a set of small
 * pixel sigils for the *things* on it: what a sector is, what a tier does, what a rite
 * performs. They are downsampled emoji.
 *
 * ---------------------------------------------------------------- the source
 *
 * **Twemoji**, at 72×72. Twitter's emoji set, and the one open pack whose licence is
 * simple: the graphics are CC-BY 4.0, so a derivative needs attribution and nothing
 * else — no share-alike clause reaching back into the rest of the work. Attribution is
 * in the colophon, where the reader can see it, rather than in a LICENSE file nobody
 * opens.
 *
 * WhatsApp's set was asked for and cannot be used: those designs are Meta's, they are
 * not licensed for redistribution, and this page's whole position is that it makes no
 * third-party request for its imagery and hosts everything it draws. A pack that could
 * only be hotlinked would break the one rule the piece is least willing to break.
 *
 * ---------------------------------------------------------------- what happens to it
 *
 * Each 72×72 sprite is destroyed down to 16×16 and then stripped of its colour. Not as
 * a style: a 16-pixel emoji is a *reading* of an emoji, the same way every figure on
 * this page is a reading of something larger, and the sigils are meant to look like
 * they came off the same instrument as the rest of it.
 *
 *   1. decode — palette PNG, depth 8, non-interlaced. Hand-rolled on `zlib`, because a
 *      build step that pulls an image library in to read twenty 800-byte files is a
 *      worse trade than sixty lines of PNG.
 *   2. downsample — area average over each 4.5×4.5 source box, weighted by alpha, so a
 *      thin dark line survives instead of being missed between sample points the way
 *      nearest-neighbour would miss it.
 *   3. desaturate — to luma, then quantised to four bands of ink. Emitted as
 *      `currentColor`, which is what lets a sigil invert with the surface under it.
 *   4. keep one hue, where the hue is the meaning — blood stays red, the scrying orb
 *      and the web stay turquoise, because on this page red means exposure and
 *      turquoise means inference (§6e) and those three sigils are saying exactly that.
 *
 * The output is `src/ui/sigil-data.ts`: sixteen rows of sixteen characters per sigil,
 * which is a format you can read. The sprite is visible in the source, a bad
 * downsample is obvious in a diff, and the module asserts its own dimensions at import
 * so a truncated row cannot ship silently.
 */

import { inflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/ui/sigil-data.ts', import.meta.url));
const VERSION = '15.1.0';
const SIZE = 16;

/**
 * The set, and what each one is for.
 *
 * `accent` is the one hue a sigil is allowed to keep, and it is a semantic claim rather
 * than a colour preference: `red` for the three that are about a body and its exposure,
 * `cyan` for the two that are about the model inferring rather than reading. Everything
 * else is ink.
 */
const SIGILS = [
  { key: 'eye', cp: '1f441', accent: 'none', means: 'the subject — what is being looked at, and the layer doing the looking' },
  { key: 'vessel', cp: '1f3fa', accent: 'none', means: 'the pool — every donated signature, kept in one vessel' },
  { key: 'serpent', cp: '1f40d', accent: 'none', means: 'the loop — measured, donated, worn, and round again' },
  { key: 'key', cp: '1f5dd', accent: 'none', means: 'consent — you hold it, and nothing opens without it' },
  { key: 'blood', cp: '1fa78', accent: 'red', means: 'a measurement taken from a body' },
  { key: 'orb', cp: '1f52e', accent: 'cyan', means: 'inference — divination, which is what a classifier is' },
  { key: 'scroll', cp: '1f4dc', accent: 'none', means: 'the receipt — what was done, written down' },
  { key: 'web', cp: '1f578', accent: 'cyan', means: 'the model — the dependency structure fitted over people' },
  { key: 'alembic', cp: '2697', accent: 'none', means: 'extraction — a face taken out of the pool, or forged into it' },
  { key: 'phial', cp: '1f9ea', accent: 'none', means: 'the catalogue — every specimen, racked' },
  { key: 'mask', cp: '1f3ad', accent: 'none', means: 'one face, worn' },
  { key: 'beetle', cp: '1fab2', accent: 'none', means: 'the foot of the page — the thing that arrives after' },
  { key: 'glasses', cp: '1f576', accent: 'none', means: 'looking without being read' },
  { key: 'heart', cp: '1fac0', accent: 'red', means: 'donation — a part of a body, given' },
  { key: 'dagger', cp: '1f5e1', accent: 'none', means: 'unmaking — withdrawal, and the cursor that points' },
  { key: 'candle', cp: '1f56f', accent: 'none', means: 'the service is answering' },
  { key: 'fire', cp: '1f525', accent: 'red', means: 'the corruption channel currently burning' },
  { key: 'scales', cp: '2696', accent: 'none', means: 'the law, and what it weighs' },
  { key: 'hand', cp: '1f446', accent: 'none', means: 'attend to this — the manicule, restored' },
  { key: 'hourglass', cp: '23f3', accent: 'none', means: 'a process under way' },
];

// ---------------------------------------------------------------- PNG

/** Palette PNG, 8-bit, non-interlaced. Returns { width, height, rgba }. */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const depth = buffer[24];
  const colourType = buffer[25];
  const interlace = buffer[28];
  if (depth !== 8 || colourType !== 3 || interlace !== 0) {
    throw new Error(`unsupported png: depth ${depth}, type ${colourType}, interlace ${interlace}`);
  }

  let palette = null;
  let alpha = null;
  const idat = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') alpha = data;
    else if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  if (!palette) throw new Error('no palette');

  const raw = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8Array(width * height * 4);

  // One byte per pixel, so the filter's "previous pixel" distance is one byte.
  const stride = width;
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const start = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[start + x];
      const a = x >= 1 ? line[x - 1] : 0;
      const b = prev[x];
      const c = x >= 1 ? prev[x - 1] : 0;
      let out;
      switch (filter) {
        case 0: out = value; break;
        case 1: out = value + a; break;
        case 2: out = value + b; break;
        case 3: out = value + ((a + b) >> 1); break;
        case 4: {
          // Paeth: the neighbour closest to a + b - c.
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          out = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown filter ${filter}`);
      }
      line[x] = out & 0xff;
    }

    for (let x = 0; x < stride; x += 1) {
      const index = line[x];
      const o = (y * width + x) * 4;
      rgba[o] = palette[index * 3];
      rgba[o + 1] = palette[index * 3 + 1];
      rgba[o + 2] = palette[index * 3 + 2];
      rgba[o + 3] = alpha && index < alpha.length ? alpha[index] : 255;
    }
    prev.set(line);
  }

  return { width, height, rgba };
}

// ---------------------------------------------------------------- resample

/**
 * Area average into a SIZE×SIZE grid, weighting colour by alpha.
 *
 * 72 does not divide by 16, so each target cell covers a 4.5×4.5 source box and the
 * edge rows land on half a pixel; the box is walked in whole source pixels and each
 * contributes its overlap. Weighting the colour by alpha matters more than it sounds:
 * an unweighted average pulls the transparent pixels around a dark outline into it and
 * every sigil comes out a pale smudge.
 */
function downsample({ width, height, rgba }) {
  const cells = [];
  const scaleX = width / SIZE;
  const scaleY = height / SIZE;

  for (let ty = 0; ty < SIZE; ty += 1) {
    for (let tx = 0; tx < SIZE; tx += 1) {
      const x0 = tx * scaleX;
      const x1 = x0 + scaleX;
      const y0 = ty * scaleY;
      const y1 = y0 + scaleY;

      let lumaSum = 0;
      let redness = 0;
      let blueness = 0;
      let alphaSum = 0;
      let area = 0;

      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy += 1) {
        const hy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx += 1) {
          const hx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          const w = hx * hy;
          const o = (sy * width + sx) * 4;
          const r = rgba[o];
          const g = rgba[o + 1];
          const b = rgba[o + 2];
          const a = rgba[o + 3] / 255;
          const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          lumaSum += luma * a * w;
          redness += (r - Math.max(g, b)) / 255 * a * w;
          blueness += ((g + b) / 2 - r) / 255 * a * w;
          alphaSum += a * w;
          area += w;
        }
      }

      const coverage = area > 0 ? alphaSum / area : 0;
      cells.push({
        coverage,
        // Mean luma of the covered part only, so a half-covered dark pixel reads dark.
        luma: alphaSum > 0 ? lumaSum / alphaSum : 1,
        redness: alphaSum > 0 ? redness / alphaSum : 0,
        blueness: alphaSum > 0 ? blueness / alphaSum : 0,
      });
    }
  }
  return cells;
}

/**
 * Quantise to the character grid.
 *
 *   . nothing        1 ink, faint     2 ink        3 ink, strong    4 ink, solid
 *   a accent         A accent, solid
 *
 * Ink bands come from *darkness weighted by coverage*: a cell that is dark and fully
 * covered is solid, a cell that is pale or barely covered is faint. A sigil's accent
 * band is only reachable where the source cell was genuinely that hue — a desaturated
 * grey never becomes red because the sigil happens to be allowed red.
 */
function quantise(cells, accent) {
  const covered = cells.filter((c) => c.coverage >= 0.12);
  const weightOf = (c) => c.coverage * (1 - c.luma * 0.8);

  /*
   * Auto-levels, per sprite.
   *
   * Without this the flat-interior emoji come out as single-value blobs: a scroll, a
   * sphere and a petri dish are each one broad area of one lightness, so a fixed set of
   * band boundaries puts every cell in the same band and the internal drawing — the
   * ruled lines, the highlight, the rim — disappears. Each sprite's own range of weights
   * is stretched across the four bands instead, which is the same operation a darkroom
   * does to a flat negative, and it is per sprite because the alternative is tuning
   * twenty thresholds by hand and re-tuning them whenever the set changes.
   *
   * Clipped at the 4th and 96th percentiles rather than at min and max, so one stray
   * antialiased cell cannot decide the whole sprite's contrast.
   */
  const sorted = covered.map(weightOf).sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))] ?? 0;
  const low = at(0.04);
  const high = at(0.96);
  const span = Math.max(0.06, high - low);
  const level = (w) => Math.min(1, Math.max(0, (w - low) / span));

  const rows = [];
  for (let y = 0; y < SIZE; y += 1) {
    let row = '';
    for (let x = 0; x < SIZE; x += 1) {
      const cell = cells[y * SIZE + x];
      if (cell.coverage < 0.12) {
        row += '.';
        continue;
      }
      const hue = accent === 'red' ? cell.redness : accent === 'cyan' ? cell.blueness : 0;
      const value = level(weightOf(cell));

      if (accent !== 'none' && hue > 0.14) {
        row += value > 0.45 ? 'A' : 'a';
        continue;
      }
      row += value > 0.74 ? '4' : value > 0.5 ? '3' : value > 0.26 ? '2' : '1';
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------- emit

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const built = [];
for (const sigil of SIGILS) {
  const url = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${VERSION}/assets/72x72/${sigil.cp}.png`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${sigil.key} (${url})`);
  const png = decodePng(Buffer.from(await res.arrayBuffer()));
  const rows = quantise(downsample(png), sigil.accent);
  const filled = rows.join('').replace(/\./g, '').length;
  built.push({ ...sigil, rows });
  console.log(`${sigil.key.padEnd(10)} ${sigil.cp.padEnd(6)} ${String(filled).padStart(3)}/256 cells  ${sigil.accent}`);
}

const body = built
  .map(
    (s) => `  {
    key: '${s.key}',
    codepoint: '${s.cp}',
    accent: '${s.accent}',
    means: ${JSON.stringify(s.means)},
    rows: [
${s.rows.map((r) => `      '${r}',`).join('\n')}
    ],
  },`,
  )
  .join('\n');

writeFileSync(
  OUT,
  `/**
 * The sigils, as pixels. Generated — do not edit by hand.
 *
 *   node scripts/fetch-sigils.mjs
 *
 * Twemoji at 72×72 (CC-BY 4.0, https://github.com/jdecked/twemoji), area-downsampled to
 * ${SIZE}×${SIZE}, desaturated to four bands of ink, with one hue kept where the hue is the
 * meaning. See scripts/fetch-sigils.mjs for why each step is the step it is, and
 * ui/sigils.ts for how these rows become a drawing.
 *
 * The grid is legible on purpose: the sprite is visible in the source, so a bad
 * downsample shows up in a diff rather than on the page.
 *
 *   .  nothing            1  ink, faint      2  ink      3  ink, strong   4  ink, solid
 *   a  accent, half       A  accent, solid
 */

export interface SigilArt {
  key: string;
  /** The Twemoji file this was reduced from, for the attribution to be checkable. */
  codepoint: string;
  accent: 'none' | 'red' | 'cyan';
  /** Published in the legend (§ colophon). A notation nobody can look up is private. */
  means: string;
  rows: readonly string[];
}

export const SIGIL_SIZE = ${SIZE};

export const SIGIL_ART = [
${body}
] as const satisfies readonly SigilArt[];
`,
  'utf8',
);

console.log(`\nwrote ${OUT}`);
console.log(`${built.length} sigils, ${SIZE}x${SIZE}, from Twemoji ${VERSION} (CC-BY 4.0)`);

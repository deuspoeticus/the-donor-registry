/**
 * The sigils, drawn.
 *
 * The page carries two notations and they divide the world between them.
 *
 *   **Sigils** name *things*: what a sector is, what a tier does, what a rite performs,
 *   what the instrument is currently doing. Downsampled emoji, sixteen pixels square.
 *
 *   **Marks** (ui/glyphs.ts) name *operations and relations*: a sum, a mutual
 *   information, an independence assumption, a truth value, a disclosure, a link that
 *   leaves this origin. Typographic characters, because that is what those are.
 *
 * That split is the whole reason both exist. A sum is not a picture of anything and a
 * pool is not an operator, and a page that drew both in the same register would be
 * saying they were the same kind of thing. It also settles every future question about
 * which to use: if it has a plural, it is a sigil; if it takes arguments, it is a mark.
 *
 * ---------------------------------------------------------------- how they behave
 *
 * Drawn as `currentColor` at four opacities, so a sigil **inverts with the surface under
 * it** — the same reason nothing on this page uses `filter: invert()`. Put one in a nav
 * link and it is ink on paper; hover the link, the ground goes to ink and the sigil
 * comes back as paper, with no second asset and no rule to remember.
 *
 * Three keep one hue, and the hue is the meaning rather than a decision about colour:
 * blood and the heart stay red because red means exposure, the orb and the web stay
 * turquoise because turquoise means inference (§6e). Those are drawn from
 * `--sigil-red` / `--sigil-cyan`, which the stylesheet re-points on inverted grounds.
 *
 * **They have a floor of about sixteen pixels.** Below that a sixteen-pixel sprite is
 * mud, which is why the keyed readouts and the table cells use marks instead: those run
 * at ten pixels and a sigil in them would be a smudge pretending to be information.
 */

import { svg } from './dom.js';
import { SIGIL_ART, SIGIL_SIZE, type SigilArt } from './sigil-data.js';

export type SigilKey = (typeof SIGIL_ART)[number]['key'];

const BY_KEY = new Map(SIGIL_ART.map((s) => [s.key as SigilKey, s as SigilArt]));

/**
 * Band → paint. Four steps of the surrounding ink, plus the accent at two.
 *
 * The opacities are not evenly spaced: the faint band is pushed down to 0.22 because at
 * sixteen pixels almost every sprite's outermost band is antialiasing rather than
 * drawing, and a linear ramp gives every sigil a grey halo it did not have at 72.
 */
const PAINT: Record<string, { fill: string; opacity: number }> = {
  '1': { fill: 'currentColor', opacity: 0.22 },
  '2': { fill: 'currentColor', opacity: 0.5 },
  '3': { fill: 'currentColor', opacity: 0.78 },
  '4': { fill: 'currentColor', opacity: 1 },
  a: { fill: 'ACCENT', opacity: 0.55 },
  A: { fill: 'ACCENT', opacity: 1 },
};

interface Run {
  x: number;
  y: number;
  w: number;
}

/**
 * Horizontal runs of one band, per row.
 *
 * A rect per pixel is 256 nodes for a sixteen-square sprite and there are twenty of
 * them on the page at once; merging runs takes the busiest sigil to about forty. The
 * drawing is identical either way — this is only about how much DOM the nav costs.
 */
function runsOf(art: SigilArt): Map<string, Run[]> {
  const bands = new Map<string, Run[]>();
  art.rows.forEach((row, y) => {
    let band = '';
    let start = 0;
    const flush = (end: number) => {
      if (band === '' || band === '.') return;
      const list = bands.get(band) ?? [];
      list.push({ x: start, y, w: end - start });
      bands.set(band, list);
    };
    for (let x = 0; x < row.length; x += 1) {
      const cell = row[x];
      if (cell !== band) {
        flush(x);
        band = cell;
        start = x;
      }
    }
    flush(row.length);
  });
  return bands;
}

function accentVar(art: SigilArt): string {
  return art.accent === 'red' ? 'var(--sigil-red)' : 'var(--sigil-cyan)';
}

export interface SigilOptions {
  /** Rendered size in pixels. Below sixteen a sigil is mud; see the header. */
  px?: number;
  className?: string;
  /**
   * An accessible name. Omit for the usual case, which is decorative: the nav link, the
   * tier and the status cell all already say in words what the sigil is standing for,
   * and a screen reader announcing "amphora" beside the word "pool" is noise.
   */
  label?: string;
}

/** One sigil, as an inline SVG in a span. */
export function sigil(key: SigilKey, options: SigilOptions = {}): HTMLElement {
  const art = BY_KEY.get(key);
  if (!art) throw new Error(`no sigil named ${key}`);
  const px = options.px ?? 16;

  const root = svg('svg', {
    class: 'sigil__art',
    viewBox: `0 0 ${SIGIL_SIZE} ${SIGIL_SIZE}`,
    width: px,
    height: px,
    // Without this the browser antialiases the pixel edges and the whole point is lost.
    'shape-rendering': 'crispEdges',
    focusable: 'false',
  });

  for (const [band, runs] of runsOf(art)) {
    const paint = PAINT[band];
    if (!paint) continue;
    const group = svg('g', {
      fill: paint.fill === 'ACCENT' ? accentVar(art) : paint.fill,
      'fill-opacity': paint.opacity,
    });
    for (const run of runs) {
      group.appendChild(svg('rect', { x: run.x, y: run.y, width: run.w, height: 1 }));
    }
    root.appendChild(group);
  }

  const wrap = document.createElement('span');
  wrap.className = options.className ? `sigil ${options.className}` : 'sigil';
  wrap.style.setProperty('--sigil-px', `${px}px`);
  if (options.label) {
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', options.label);
  } else {
    wrap.setAttribute('aria-hidden', 'true');
  }
  wrap.appendChild(root);
  return wrap;
}

// ---------------------------------------------------------------- the cursors

/**
 * The cursors, from the same sprites.
 *
 * A cursor cannot use `currentColor` — there is no element for it to inherit from — so
 * these bake concrete values, and they need a keyline: a bare ink sprite disappears the
 * moment it crosses the status strip or an inverted tile. The silhouette is dilated by
 * one pixel in paper and drawn underneath, which is how every cursor since the first
 * one has stayed visible on an unknown background.
 *
 * The hotspot is declared rather than derived. It is a claim about which pixel of a
 * drawing *is* the pointer — the dagger's tip, the finger's end, the middle of a glass
 * that is not pointing at anything — and a heuristic over the pixel data would get the
 * hourglass wrong in a way nobody would notice until they tried to click something.
 */
const CURSORS = {
  dagger: { key: 'dagger' as SigilKey, hotspot: [1, 30] },
  hand: { key: 'hand' as SigilKey, hotspot: [13, 1] },
  hourglass: { key: 'hourglass' as SigilKey, hotspot: [16, 16] },
} as const;

/** Ink and paper, resolved once at boot from the stylesheet rather than duplicated here. */
function palette(): { ink: string; paper: string } {
  const style = getComputedStyle(document.documentElement);
  return {
    ink: style.getPropertyValue('--ink').trim() || '#0b0b0d',
    paper: style.getPropertyValue('--paper').trim() || '#f2f0e9',
  };
}

function cursorSvg(key: SigilKey, ink: string, paper: string): string {
  const art = BY_KEY.get(key);
  if (!art) throw new Error(`no sigil named ${key}`);

  const filled = (x: number, y: number): boolean =>
    y >= 0 && y < SIGIL_SIZE && x >= 0 && x < SIGIL_SIZE && art.rows[y][x] !== '.';

  // The keyline: every empty cell touching a drawn one, including diagonals, so the
  // halo closes around a thin blade instead of leaving gaps at its corners.
  const halo: string[] = [];
  for (let y = 0; y < SIGIL_SIZE; y += 1) {
    for (let x = 0; x < SIGIL_SIZE; x += 1) {
      if (filled(x, y)) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((dx || dy) && filled(x + dx, y + dy)) {
            touches = true;
            break;
          }
        }
      }
      if (touches) halo.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }

  const bands: string[] = [];
  for (const [band, runs] of runsOf(art)) {
    const paint = PAINT[band];
    if (!paint) continue;
    const rects = runs
      .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1"/>`)
      .join('');
    bands.push(`<g fill="${ink}" fill-opacity="${paint.opacity}">${rects}</g>`);
  }

  // Rendered at 2× so a sixteen-pixel drawing is a usable pointer; the viewBox keeps it
  // on the pixel grid, so this is a scale rather than a resample.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 ${SIGIL_SIZE} ${SIGIL_SIZE}" shape-rendering="crispEdges">` +
    `<g fill="${paper}">${halo.join('')}</g>${bands.join('')}</svg>`
  );
}

/**
 * Writes the three cursors onto the document as custom properties.
 *
 * Done at boot rather than hard-coded in the stylesheet so that the cursors and the
 * sigils cannot drift: they are the same twenty sprites, and re-running
 * `scripts/fetch-sigils.mjs` updates both. `styles/cursor.css` declares a system
 * fallback on every rule, so the few milliseconds before this runs are a normal arrow
 * rather than nothing.
 */
export function installCursors(): void {
  const { ink, paper } = palette();
  const root = document.documentElement;
  for (const [name, spec] of Object.entries(CURSORS)) {
    const encoded = encodeURIComponent(cursorSvg(spec.key, ink, paper));
    const [x, y] = spec.hotspot;
    root.style.setProperty(`--cursor-${name}`, `url("data:image/svg+xml,${encoded}") ${x} ${y}`);
  }
}

// ---------------------------------------------------------------- the legend

/**
 * Published in the colophon, beside the marks. A notation the reader cannot look up is a
 * private language, and the codepoint is included so the attribution is checkable
 * rather than asserted — anyone can put `1f3fa` into Twemoji and see what this was.
 */
export const SIGIL_LEGEND: readonly { key: SigilKey; codepoint: string; means: string }[] =
  SIGIL_ART.map((s) => ({ key: s.key as SigilKey, codepoint: s.codepoint, means: s.means }));

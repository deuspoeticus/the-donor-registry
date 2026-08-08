/**
 * The instruments.
 *
 * Seven shapes, and every reading on this page is one of them. They are here
 * rather than inline at each call site so that two sections showing the same kind
 * of quantity cannot end up showing it two different ways — the point of a
 * notation is that the reader learns it once.
 *
 * Which shape answers which question:
 *
 *   figure      one number that is worth a paragraph on its own.
 *   tiles       a row of such numbers, each carrying the claim it is making.
 *   barRows     quantities of the same kind, compared.
 *   histogram   a distribution, and where one value falls in it.
 *   meter       a position in a range with a known floor and a known ceiling.
 *   heatMatrix  a relation between a set and itself.
 *   stepChart   a quantity over time.
 *   keyed       facts that are not quantities.
 *
 * Every one of them takes a `register` rather than a colour. That is the whole
 * enforcement mechanism for the palette: a caller can say that a number was
 * measured, inferred or transmitted, and it cannot say that a number is
 * turquoise. See styles/tokens.css for what the three registers mean.
 */

import { append, h, int, svg, svgTitle } from './dom.js';
import { decoration, type MarkKey } from './glyphs.js';

/**
 * What kind of claim a reading is making.
 *
 *   measured  read off a browser or counted in the pool. White.
 *   inferred  computed by the model rather than read. Turquoise.
 *   exposed   identifies, or leaves this browser, or cannot be undone. Red.
 */
export type Register = 'measured' | 'inferred' | 'exposed';

const suffix = (register: Register): string =>
  register === 'measured' ? '' : `--${register}`;

const modifier = (base: string, register: Register): string =>
  register === 'measured' ? base : `${base} ${base}${suffix(register)}`;

// ---------------------------------------------------------------- the window

export interface WindowOptions {
  /** Small caps caption in the frame's own bar. Says what the readout is. */
  caption: string;
  /** A count or dimension, set at the right of the bar. */
  count?: string;
  /** The content is already a full-bleed table and needs no inner padding. */
  flush?: boolean;
}

/**
 * A bounded readout screen, for anything set in the monospace.
 *
 * The monospace is the one face on this page that is not carried: it resolves to
 * whatever terminal font the visitor's machine has, which on a site about machines
 * that give themselves away by their font metrics is a deliberate choice (see
 * styles/tokens.css). The cost of that choice is that it cannot be trusted with the
 * page's typography — an unknown face at an unknown width cannot be set loose in
 * running text and still be part of a design.
 *
 * So it is never loose. Every monospace run on this page — a table, a payload, the
 * forge's output, a keyed readout — sits inside one of these: a sunk panel, a
 * hairline frame, and a caption band in the interface's own face. Inside the frame an
 * unpredictable face can only ever change the inside of the frame.
 */
export function windowed(options: WindowOptions, ...children: (Node | string | null | false)[]): HTMLElement {
  return h(
    'div',
    { class: 'window' },
    h(
      'div',
      { class: 'window__bar' },
      h('span', { text: options.caption }),
      options.count ? h('span', { class: 'window__count', text: options.count }) : null,
    ),
    h(
      'div',
      { class: options.flush ? 'window__body window__body--flush' : 'window__body' },
      ...children,
    ),
  );
}

// ---------------------------------------------------------------- figure

export function figure(value: string, unit: string, register: Register = 'measured'): HTMLElement {
  return h(
    'div',
    { class: 'figure' },
    h('span', { class: modifier('figure__value', register), text: value }),
    h('span', { class: 'figure__unit', text: unit }),
  );
}

// ---------------------------------------------------------------- tiles

export interface Tile {
  value: string;
  /** The column head. Short, and a noun. */
  label: string;
  /**
   * What the figure actually claims, in one sentence.
   *
   * Required, not optional. A number on a dashboard with no statement of what it
   * is counting is the standard way of implying more than you measured, and this
   * piece exists partly to refuse that. It is in the document at all times for
   * assistive technology, and it is what the hover state brings forward.
   */
  def: string;
  register?: Register;
}

export function tiles(items: readonly Tile[]): HTMLElement {
  const grid = h('div', { class: 'tiles' });
  for (const item of items) {
    const register = item.register ?? 'measured';
    append(grid, [
      h(
        'div',
        { class: 'tile' },
        h('span', { class: modifier('tile__value', register), text: item.value }),
        h('span', { class: 'tile__label', text: item.label }),
        // In the flow, under the label, and legible whether or not anybody is
        // pointing at it. It used to be an overlay that faded in while the figure
        // blurred out, which meant the claim and the number it was about could never
        // be read at the same time.
        h('span', { class: 'tile__def', text: item.def }),
      ),
    ]);
  }
  return grid;
}

// ---------------------------------------------------------------- bar rows

export interface BarRow {
  label: string;
  value: number;
  /** Overrides the formatted value in the right-hand column. */
  text?: string;
  /**
   * A second quantity on the same track, drawn faintly behind the first. Used for
   * the one comparison this page makes constantly: a naive figure against the
   * modelled figure that corrects it.
   */
  under?: number;
  title?: string;
}

export interface BarOptions {
  register?: Register;
  /** Scale ceiling. Defaults to the largest value present. */
  max?: number;
  format?: (value: number) => string;
}

export function barRows(rows: readonly BarRow[], options: BarOptions = {}): HTMLElement {
  const register = options.register ?? 'measured';
  const format = options.format ?? ((v: number) => v.toFixed(2));
  const max = Math.max(
    options.max ?? 0,
    ...rows.map((r) => Math.max(r.value, r.under ?? 0)),
    // Never zero: a chart whose every value is zero still has to draw its tracks.
    0.001,
  );

  const chart = h('div', { class: modifier('bars', register), role: 'list' });
  for (const row of rows) {
    const share = (row.value / max) * 100;
    const track = h(
      'span',
      { class: 'bars__track' },
      row.under === undefined
        ? null
        : h('span', {
            class: 'bars__fill bars__fill--under',
            style: `width:${((row.under / max) * 100).toFixed(2)}%`,
          }),
      h('span', { class: 'bars__fill', style: `width:${share.toFixed(2)}%` }),
      h('span', { class: 'bars__tick', style: `left:${share.toFixed(2)}%` }),
    );
    if (row.title) track.title = row.title;

    append(chart, [
      h(
        'div',
        { class: 'bars__row', role: 'listitem' },
        h('span', { class: 'bars__label', text: row.label }),
        track,
        h('span', { class: 'bars__value', text: row.text ?? format(row.value) }),
      ),
    ]);
  }
  return chart;
}

// ---------------------------------------------------------------- histogram

export interface Bin {
  from: number;
  to: number;
  count: number;
  /** True for the bin the visitor's own reading falls in. Marked, and in red. */
  self?: boolean;
}

/**
 * Equal-width bins over a set of values, optionally marking where one further
 * value would land.
 *
 * The marked value is *not* added to the counts. It is almost always the
 * visitor's own reading, which has not been donated and is not part of the pool,
 * and a distribution that quietly included it would be describing a pool that
 * does not exist.
 */
export function bin(values: readonly number[], count: number, self?: number): Bin[] {
  if (values.length === 0) return [];
  const lo = Math.min(...values, self ?? Infinity);
  const hi = Math.max(...values, self ?? -Infinity);
  const span = Math.max(1e-9, hi - lo);
  const width = span / count;

  const bins: Bin[] = Array.from({ length: count }, (_, i) => ({
    from: lo + i * width,
    to: lo + (i + 1) * width,
    count: 0,
  }));

  const index = (v: number) => Math.min(count - 1, Math.max(0, Math.floor((v - lo) / width)));
  for (const v of values) bins[index(v)].count += 1;
  if (self !== undefined) bins[index(self)].self = true;
  return bins;
}

export interface HistogramOptions {
  register?: Register;
  /** Two or three labels, spread along the axis. Left, right, and an optional middle. */
  axis?: readonly string[];
  /** Names the whole chart for assistive technology. */
  label: string;
}

export function histogram(bins: readonly Bin[], options: HistogramOptions): HTMLElement {
  const register = options.register ?? 'measured';
  const max = Math.max(...bins.map((b) => b.count), 1);

  const chart = h('div', {
    class: modifier('hist', register),
    role: 'img',
    'aria-label': options.label,
  });
  for (const b of bins) {
    const column = h(
      'span',
      { class: b.self ? 'hist__col hist__col--self' : 'hist__col' },
      h('span', {
        class: 'hist__bar',
        style: `height:${((b.count / max) * 100).toFixed(2)}%`,
      }),
    );
    column.title = `${b.from.toFixed(2)} to ${b.to.toFixed(2)}: ${int(b.count)}${
      b.self ? ' — and your own reading falls here' : ''
    }`;
    chart.appendChild(column);
  }

  if (!options.axis) return chart;

  const axis = h('div', { class: 'hist__axis' });
  for (const tick of options.axis) append(axis, [h('span', { text: tick })]);
  return h('div', {}, chart, axis);
}

// ---------------------------------------------------------------- meter

export interface MeterOptions {
  register?: Register;
  segments?: number;
  /** The floor and the ceiling, named. A gauge with no scale is a decoration. */
  scale?: readonly [string, string];
  label: string;
}

export function meter(value: number, options: MeterOptions): HTMLElement {
  const register = options.register ?? 'inferred';
  const segments = options.segments ?? 20;
  const clamped = Math.min(1, Math.max(0, value));
  // The head is the segment the value lands in. At exactly zero nothing is lit,
  // which is the correct reading and not an off-by-one.
  const head = clamped === 0 ? -1 : Math.min(segments - 1, Math.floor(clamped * segments));

  const bar = h('div', {
    class: modifier('meter', register),
    role: 'img',
    'aria-label': `${options.label}: ${clamped.toFixed(3)} of 1`,
  });
  for (let i = 0; i < segments; i += 1) {
    const state = i === head ? ' meter__seg--head' : i < head ? ' meter__seg--on' : '';
    bar.appendChild(h('span', { class: `meter__seg${state}` }));
  }

  if (!options.scale) return bar;
  return h(
    'div',
    {},
    bar,
    h(
      'div',
      { class: 'meter__scale' },
      h('span', { text: options.scale[0] }),
      h('span', { text: options.scale[1] }),
    ),
  );
}

// ---------------------------------------------------------------- heat matrix

export interface MatrixSpec {
  labels: readonly string[];
  /** Cell weight, already normalised to 0..1. The diagonal is never asked for. */
  weight: (row: number, col: number) => number;
  /** Cells the model kept. Outlined, so what it discarded is visible as absence. */
  kept?: (row: number, col: number) => boolean;
  title?: (row: number, col: number) => string;
  label: string;
}

/**
 * A relation between a set and itself, drawn as a grid.
 *
 * The reason this exists rather than a second tree: the spanning tree shows the
 * n-1 dependencies the model kept, and says nothing at all about the ones it
 * threw away. The matrix shows every pair the fit actually measured, with the kept
 * ones outlined, so the drawing states both what the model believes and what it
 * decided to ignore. On a page about a machine's picture of people, the discarded
 * half is not a footnote.
 */
export function heatMatrix(spec: MatrixSpec): SVGElement {
  const n = spec.labels.length;
  const cell = 11;
  const gutter = 86;
  const size = n * cell;
  const width = gutter + size + 4;
  const height = gutter + size + 4;

  const root = svg('svg', {
    class: 'matrix',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': spec.label,
  });

  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const x = gutter + col * cell;
      const y = gutter + row * cell;
      if (row === col) {
        root.appendChild(
          svg('rect', { class: 'matrix__diag', x, y, width: cell - 1, height: cell - 1 }),
        );
        continue;
      }
      const weight = Math.min(1, Math.max(0, spec.weight(row, col)));
      const box = svg('rect', {
        class: 'matrix__cell',
        x,
        y,
        width: cell - 1,
        height: cell - 1,
        // Turquoise at the weight: every cell here is something the model
        // computed, so the whole grid is in the inferred register.
        fill: 'var(--cyan)',
        'fill-opacity': (0.04 + weight * 0.92).toFixed(3),
      });
      if (spec.title) box.appendChild(svgTitle(spec.title(row, col)));
      root.appendChild(box);

      if (spec.kept?.(row, col)) {
        root.appendChild(
          svg('rect', {
            class: 'matrix__kept',
            x: x - 0.5,
            y: y - 0.5,
            width: cell,
            height: cell,
          }),
        );
      }
    }
  }

  root.appendChild(
    svg('rect', {
      class: 'matrix__frame',
      x: gutter - 0.5,
      y: gutter - 0.5,
      width: size,
      height: size,
    }),
  );

  spec.labels.forEach((name, i) => {
    const rowLabel = svg('text', {
      class: 'matrix__label',
      x: gutter - 4,
      y: gutter + i * cell + cell - 3,
      'text-anchor': 'end',
    });
    rowLabel.textContent = name;
    root.appendChild(rowLabel);

    const colLabel = svg('text', {
      class: 'matrix__label',
      x: gutter + i * cell + cell - 3,
      y: gutter - 4,
      'text-anchor': 'start',
      transform: `rotate(-90 ${gutter + i * cell + cell - 3} ${gutter - 4})`,
    });
    colLabel.textContent = name;
    root.appendChild(colLabel);
  });

  return root;
}

// ---------------------------------------------------------------- step chart

export interface StepPoint {
  label: string;
  value: number;
}

/**
 * A quantity over time, drawn as steps rather than as a curve.
 *
 * Steps because the underlying dates are bucketed to the day and aggregated to
 * the month: there is no measurement between two buckets, and a smooth line
 * between them would be drawing data that does not exist.
 */
export function stepChart(points: readonly StepPoint[], label: string): SVGElement {
  const width = 1000;
  const height = 200;
  const pad = { top: 12, right: 8, bottom: 22, left: 8 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const root = svg('svg', {
    class: 'step',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': label,
    preserveAspectRatio: 'none',
  });

  if (points.length === 0) return root;

  const max = Math.max(...points.map((p) => p.value), 1);
  const step = plotW / points.length;
  const y = (value: number) => pad.top + plotH - (value / max) * plotH;

  // Baseline and ceiling, so the plot has a frame to be read against.
  for (const level of [0, max]) {
    root.appendChild(
      svg('line', {
        class: 'step__grid',
        x1: pad.left,
        x2: width - pad.right,
        y1: y(level),
        y2: y(level),
      }),
    );
  }

  const path: string[] = [];
  const area: string[] = [`M ${pad.left} ${y(0)}`];
  points.forEach((point, i) => {
    const x0 = pad.left + i * step;
    const x1 = x0 + step;
    path.push(`${i === 0 ? 'M' : 'L'} ${x0.toFixed(1)} ${y(point.value).toFixed(1)}`);
    path.push(`L ${x1.toFixed(1)} ${y(point.value).toFixed(1)}`);
    area.push(`L ${x0.toFixed(1)} ${y(point.value).toFixed(1)}`);
    area.push(`L ${x1.toFixed(1)} ${y(point.value).toFixed(1)}`);
  });
  area.push(`L ${(pad.left + plotW).toFixed(1)} ${y(0)}`, 'Z');

  root.appendChild(svg('path', { class: 'step__area', d: area.join(' ') }));
  root.appendChild(svg('path', { class: 'step__line', d: path.join(' ') }));

  // The last bucket, marked: it is the only one that is still moving.
  const last = points[points.length - 1];
  const dot = svg('circle', {
    class: 'step__dot',
    cx: pad.left + (points.length - 0.5) * step,
    cy: y(last.value),
    r: 3,
  });
  dot.appendChild(svgTitle(`${last.label}: ${int(last.value)}`));
  root.appendChild(dot);

  // Ticks: first, middle, last. More than three on a 1000-unit box that is
  // stretched to whatever width the column happens to be would collide.
  for (const i of [...new Set([0, Math.floor(points.length / 2), points.length - 1])]) {
    const tick = svg('text', {
      class: 'step__tick',
      x: pad.left + (i + 0.5) * step,
      y: height - 6,
      'text-anchor': i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle',
    });
    tick.textContent = points[i].label;
    root.appendChild(tick);
  }

  return root;
}

// ---------------------------------------------------------------- keyed rows

export interface KeyedRow {
  key: string;
  mark?: MarkKey;
  value: string | Node;
  register?: Register;
}

/** Facts that are not quantities, in the address column / body column geometry. */
export function keyed(rows: readonly KeyedRow[]): HTMLElement {
  const list = h('dl', { class: 'kv' });
  for (const row of rows) {
    const register = row.register ?? 'measured';
    const cls = register === 'measured' ? 'kv__value kv__value--fact' : `kv__value kv__value${suffix(register)}`;
    append(list, [
      h(
        'div',
        { class: 'kv__row' },
        h('dt', { class: 'kv__key' }, row.mark ? decoration(row.mark) : null, row.key),
        h('dd', { class: cls }, typeof row.value === 'string' ? row.value : row.value),
      ),
    ]);
  }
  return list;
}

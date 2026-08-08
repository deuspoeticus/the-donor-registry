/**
 * The census (sector 01).
 *
 * Everything on this page is a claim about a pool, and until this sector existed
 * the visitor never saw the pool — they saw a gate, and then a number measured
 * against a set they had been told the size of and shown nothing else of. The
 * census comes first, before consent is asked for and before anything is
 * measured, because a figure like "one in two hundred" is only meaningful to
 * somebody who knows what the two hundred are.
 *
 * Nothing here reads the visitor's browser. Every quantity is computed from the
 * catalogue that has already loaded, and the sector is identical for a visitor who
 * has chosen "Look only" and one who has not chosen anything at all — except for
 * one mark on one histogram, which appears only once there is a measurement to put
 * there.
 */

import { attrDef, attrLabel, groupsOf, type AttrGroup } from '@wearme/core/attributes';
import type { CorruptionScale, EntropyModel } from '@wearme/core/entropy';
import type { EntropyReport, Identity, PoolStats } from '@wearme/core/types';

import { POOL_COMPOSITION, CENSUS_LEDE, CEILING_NOTE } from '../copy.js';
import type { Board } from './board.js';
import {
  barRows,
  bin,
  histogram,
  keyed,
  stepChart,
  tiles,
  windowed,
  type BarRow,
} from './chart.js';
import { append, bits, h, int, pct } from './dom.js';

const log2 = (x: number) => Math.log(x) / Math.LN2;

/** Shannon entropy of one attribute's empirical distribution, in bits. */
function entropyOf(counts: Map<string, number>, poolSize: number): number {
  if (poolSize <= 0) return 0;
  let sum = 0;
  for (const count of counts.values()) {
    const p = count / poolSize;
    if (p > 0) sum -= p * log2(p);
  }
  return sum;
}

function modalShare(counts: Map<string, number>, poolSize: number): number {
  if (poolSize <= 0 || counts.size === 0) return 0;
  return Math.max(...counts.values()) / poolSize;
}

export interface CensusInput {
  entries: readonly Identity[];
  stats: PoolStats;
  model: EntropyModel;
  /** One report per entry, in `entries` order. Computed once by the caller. */
  reports: readonly EntropyReport[];
  /** The pool's own spread of modelled surprisal. The histogram's range. */
  scale: CorruptionScale;
  /** This browser's reading, marked on the distribution. Null until measured. */
  self: EntropyReport | null;
  /** Where the catalogue came from, and when it last changed. Stated, not implied. */
  provenance: readonly [string, string][];
}

export function renderCensus(board: Board, input: CensusInput): HTMLElement {
  const { entries, stats, model, reports, scale, self } = input;
  const n = Math.max(1, entries.length);
  const ceiling = log2(n);

  // ---------------------------------------------------------------- figures

  const figures = tiles([
    {
      value: int(stats.size),
      label: 'entries',
      def: 'Signatures in the published catalogue. Every figure on this page is bounded by this number.',
    },
    {
      value: int(stats.donatedCount),
      label: 'donated',
      def: 'Entered by a real browser whose owner consented. The rest were manufactured.',
      register: 'exposed',
    },
    {
      value: int(stats.syntheticCount),
      label: 'manufactured',
      def: 'Assembled by the forge from the pool’s own dependency model. Which entries these are is not published and not recoverable.',
      register: 'inferred',
    },
    {
      value: int(stats.totalWears),
      label: 'wears',
      def: 'Times somebody has taken an entry and presented it as their own browser.',
    },
    {
      value: bits(stats.bitsDestroyed),
      label: 'bits destroyed',
      def: 'Surprisal removed by wearing: an identity worn by k people loses log2(k) bits of its power to single anybody out.',
      register: 'inferred',
    },
    {
      value: int(stats.machineDonations),
      label: 'read as machines',
      def: 'Donations whose automation estimate came out above one half. An attribute of the entry, and never a gate.',
      register: 'inferred',
    },
  ]);

  // ---------------------------------------------------------------- spread

  /*
   * How separable this pool is from itself.
   *
   * Measured on the *unclamped* model score, because the question here is not "how
   * identifiable is anybody" — that claim is the clamped headline in sector 04 and
   * the pool cannot support a larger one — but "how far apart are these two hundred
   * entries", which is a different question and is answerable. Once a pool is small
   * enough that everybody saturates log2(N), the clamped figure is identical for
   * everybody and this distribution would be a single column.
   */
  const spread = reports.map((r) => r.rawModelledBits);
  const sorted = [...spread].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const distribution = histogram(bin(spread, 32, self?.rawModelledBits), {
    label: 'How modelled surprisal is distributed across the pool',
    register: 'inferred',
    axis: [
      `${bits(scale.min)} bits — the most ordinary entry present`,
      `median ${bits(median)}`,
      `${bits(scale.max)} bits — the strangest`,
    ],
  });

  const spreadFacts = keyed([
    {
      key: 'pool bound',
      mark: 'caution',
      value: `${bits(ceiling)} bits · one in ${int(n)}`,
      register: 'exposed',
    },
    { key: 'median', mark: 'model', value: `${bits(median)} bits`, register: 'inferred' },
    {
      key: 'spread',
      mark: 'model',
      value: `${bits(scale.max - scale.min)} bits between the most ordinary entry and the strangest`,
      register: 'inferred',
    },
    {
      key: 'at the bound',
      mark: 'independent',
      value: `${int(reports.filter((r) => r.atCeiling).length)} of ${int(n)} entries saturate it — this pool cannot separate them further`,
      register: 'exposed',
    },
    self
      ? {
          key: 'your reading',
          mark: 'reading',
          value: `${bits(self.rawModelledBits)} bits, marked above`,
          register: 'exposed',
        }
      : {
          key: 'your reading',
          mark: 'withheld',
          value: 'not taken — this browser has not been measured',
        },
  ]);

  // ---------------------------------------------------------------- by group

  /*
   * Entropy per attribute group, computed from the empirical counts rather than
   * from the tree, so the held-out identifiers are included. They are the largest
   * contributors in the pool and leaving them out to make the chart tidier would
   * misstate where the information actually is.
   */
  const groupBits = new Map<AttrGroup, number>();
  const groupCount = new Map<AttrGroup, number>();
  for (const id of model.ids) {
    const group = attrDef(id)?.group;
    if (!group) continue;
    const counts = model.counts.get(id);
    groupBits.set(group, (groupBits.get(group) ?? 0) + (counts ? entropyOf(counts, n) : 0));
    groupCount.set(group, (groupCount.get(group) ?? 0) + 1);
  }

  const groupRows: BarRow[] = [...groupBits.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([group, value]) => ({
      label: group,
      value,
      title: `${group}: ${int(groupCount.get(group) ?? 0)} attributes, ${bits(value)} bits of entropy across the pool`,
    }));

  // ---------------------------------------------------------------- the table

  const held = new Set(model.nearUniqueIds);
  const censusTable = h('table', { class: 'table' });
  append(censusTable, [
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { text: 'Attribute' }),
        h('th', { text: 'Group' }),
        h('th', { class: 'num', text: 'Distinct' }),
        h('th', { class: 'num', text: 'Modal' }),
        h('th', { class: 'num', text: 'Entropy' }),
        h('th', { text: 'In the model' }),
      ),
    ),
  ]);

  const rows = [...model.ids]
    .map((id) => {
      const counts = model.counts.get(id) ?? new Map<string, number>();
      return {
        id,
        distinct: counts.size,
        modal: modalShare(counts, n),
        entropy: entropyOf(counts, n),
      };
    })
    .sort((a, b) => b.entropy - a.entropy);

  const maxEntropy = Math.max(...rows.map((r) => r.entropy), 0.001);
  const tbody = h('tbody');
  for (const row of rows) {
    const isHeld = held.has(row.id);
    append(tbody, [
      h(
        'tr',
        {},
        h('td', { text: attrLabel(row.id) }),
        h('td', { class: 'value', text: attrDef(row.id)?.group ?? '—' }),
        h('td', { class: 'num', text: int(row.distinct) }),
        h('td', { class: 'num', text: pct(row.modal) }),
        h(
          'td',
          { class: 'num num--inferred' },
          bits(row.entropy),
          h('span', {
            class: 'bar bar--inferred',
            style: `width:${Math.max(2, (row.entropy / maxEntropy) * 100).toFixed(1)}%`,
          }),
        ),
        // The one place the table takes a side: an attribute the pool cannot model
        // is called an identifier, in red, because that is what it is.
        h('td', {
          class: isHeld ? 'value exposed' : 'value',
          text: isHeld ? 'held out — an identifier' : 'modelled',
        }),
      ),
    ]);
  }
  censusTable.appendChild(tbody);

  // ---------------------------------------------------------------- arrivals

  const months = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.createdAt.slice(0, 7);
    months.set(key, (months.get(key) ?? 0) + 1);
  }

  /*
   * One bucket is not a time series.
   *
   * A seeded pool arrives in a single pass, so a step chart of it is a single
   * column pretending to be a history. The sentence is the honest rendering, and
   * the chart appears when there is something for it to show.
   */
  const arrivals =
    months.size > 1
      ? h(
          'div',
          {},
          h('span', { class: 'label', text: 'Entries by month of arrival' }),
          h('div', { class: 'scroll-x' }, stepOf(months)),
        )
      : h('p', {
          class: 'gloss',
          text: `Every entry in this pool carries the same month of arrival, ${[...months.keys()][0] ?? 'none'}: the catalogue was seeded in one pass and nothing has been donated into it since. A chart of that would be one column, so there is no chart.`,
        });

  const worn =
    stats.totalWears > 0
      ? barRows(wearBuckets(entries), {
          register: 'inferred',
          format: (v) => int(v),
        })
      : h('p', {
          class: 'gloss',
          text: 'Nothing in this pool has been worn yet, so no surprisal has been destroyed and the distribution is a single column at zero. It is stated rather than drawn.',
        });

  const groupLegend = groupsOf(model.ids);

  return board.sector(
    'pool',
    {
      title: 'What is in the pool',
      lede: CENSUS_LEDE,
      meta: `${int(stats.size)} entries · ${bits(ceiling)} bit bound`,
    },
    figures,
    h('p', { class: 'gloss', text: POOL_COMPOSITION(stats) }),
    keyed(input.provenance.map(([key, value]) => ({ key, value, mark: 'set' as const }))),

    h('hr', { class: 'rule rule--double' }),
    h(
      'div',
      { class: 'label label--ruled' },
      h('span', { text: 'How far apart these entries are' }),
      h('span', { class: 'label__count', text: `${int(n)} entries · ${bits(ceiling)} bit bound` }),
    ),
    distribution,
    spreadFacts,
    h('p', { class: 'caveat', text: CEILING_NOTE(n, ceiling) }),

    h('hr', { class: 'rule rule--double' }),
    h(
      'div',
      { class: 'label label--ruled' },
      h('span', { text: 'Entropy per attribute group' }),
      h('span', {
        class: 'label__count',
        text: `${int(groupLegend.size)} groups · ${int(model.ids.length)} attributes`,
      }),
    ),
    barRows(groupRows, { register: 'inferred' }),

    h('hr', { class: 'rule rule--double' }),
    h(
      'div',
      { class: 'label label--ruled' },
      h('span', { text: 'Every attribute, as this pool sees it' }),
      h('span', {
        class: 'label__count',
        text: `${int(model.learnableIds.length)} modelled · ${int(model.nearUniqueIds.length)} held out`,
      }),
    ),
    h('p', {
      class: 'gloss',
      text: `${int(model.learnableIds.length)} attributes have enough repetition for the model to hold a distribution over them. ${int(model.nearUniqueIds.length)} take a different value for almost every entry, which makes them identifiers rather than variables at this pool size; they are held out of the model instead of being pretended to.`,
    }),
    windowed(
      { caption: 'Attribute census', count: `${int(rows.length)} rows`, flush: true },
      censusTable,
    ),

    h('hr', { class: 'rule rule--double' }),
    h(
      'div',
      { class: 'grid-2' },
      arrivals,
      h('div', {}, h('span', { class: 'label', text: 'Wear' }), worn),
    ),
  );
}

/** Wear counts in buckets, because the tail is long and mostly empty. */
function wearBuckets(entries: readonly Identity[]): BarRow[] {
  const buckets: [string, (k: number) => boolean][] = [
    ['never worn', (k) => k === 0],
    ['worn once', (k) => k === 1],
    ['2 to 4', (k) => k >= 2 && k <= 4],
    ['5 to 8', (k) => k >= 5 && k <= 8],
    ['9 or more', (k) => k >= 9],
  ];
  return buckets.map(([label, test]) => ({
    label,
    value: entries.filter((e) => test(e.wearCount)).length,
  }));
}

function stepOf(months: Map<string, number>): SVGElement {
  const points = [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value }));
  return stepChart(points, 'Entries by month of arrival');
}

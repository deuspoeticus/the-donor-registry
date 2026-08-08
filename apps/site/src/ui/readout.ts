/**
 * The measurement (sector 04) and the inference (sector 05).
 *
 * Two figures, both at full size, with the gap between them named. The
 * pool-bound caveat is set at the same weight as the headline number rather than
 * beneath it in small type, because the caveat is what makes the number true.
 *
 * The sector opens on shape and closes on detail. Before this it opened on forty
 * rows of monospace, which is the evidence and not the finding; the table is now
 * the last thing in the sector, behind a disclosure, and everything above it is a
 * reading somebody can actually take away.
 */

import { attrDef, attrLabel, displayValue, glitchChannel } from '@wearme/core/attributes';
import type { EntropyReport } from '@wearme/core/types';

import { automationStatement, type AutomationEstimate } from '../classifier.js';
import {
  CHANNEL_EFFECT,
  CHANNEL_NOTE,
  GAP_EXPLANATION,
  NEAR_UNIQUE_NOTE,
  NO_GATE_NOTE,
  POOL_BOUND_CAVEAT,
} from '../copy.js';
import type { Board } from './board.js';
import { barRows, figure, keyed, meter, windowed, type BarRow } from './chart.js';
import { append, bits, h, int, pct, prob } from './dom.js';

/**
 * Bits per attribute group, as the deck draws it: a full-width track, a filled
 * bar, a tick at the value, and the number right-aligned in a column of its own.
 * Groups are summed from the same per-attribute surprisals the table lists, so the
 * two cannot disagree.
 */
function groupChart(report: EntropyReport): HTMLElement {
  const totals = new Map<string, number>();
  for (const row of report.perAttribute) {
    const group = attrDef(row.attr)?.group;
    if (!group) continue;
    totals.set(group, (totals.get(group) ?? 0) + row.bits);
  }

  const rows: BarRow[] = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  // Exposed rather than measured: these are the bits that single this browser out,
  // which is the one quantity on the page that is about the visitor's exposure
  // rather than about the pool.
  return barRows(rows, { register: 'exposed' });
}

export function renderMeasurement(
  board: Board,
  report: EntropyReport,
  nearUniqueIds: readonly string[],
  failedProbes: readonly string[],
  probeCount: number,
): HTMLElement {
  const dominant = report.dominantAttribute;
  const channel = glitchChannel(dominant);

  const table = h('table', { class: 'table' });
  append(table, [
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { text: 'Attribute' }),
        h('th', { text: 'Value' }),
        h('th', { class: 'num', text: 'Seen' }),
        h('th', { class: 'num', text: 'Bits' }),
      ),
    ),
  ]);

  const body = h('tbody');
  for (const row of report.perAttribute) {
    const value = displayValue(row.value);
    const shown = value.length > 120 ? `${value.slice(0, 120)}…` : value;
    append(body, [
      h(
        'tr',
        {},
        h('td', { text: attrLabel(row.attr) }),
        h('td', { class: 'value', text: shown }),
        // "Only you" is the identifying case, and it is the only cell in the table
        // allowed to be red.
        h('td', {
          class: row.count === 0 ? 'num num--exposed' : 'num',
          text: row.count === 0 ? 'only you' : `${int(row.count)}×`,
        }),
        h(
          'td',
          { class: 'num' },
          bits(row.bits),
          h('span', {
            class: 'bar',
            style: `width:${Math.max(2, (row.bits / Math.max(report.ceilingBits, 0.001)) * 100)}%`,
          }),
        ),
      ),
    ]);
  }
  table.appendChild(body);

  const details = h(
    'details',
    { class: 'details' },
    h('summary', {
      class: 'details__summary',
      text: `Every attribute measured (${int(report.perAttribute.length)})`,
    }),
    h(
      'div',
      { class: 'details__body' },
      windowed(
        {
          caption: 'Your own vector, ranked by surprisal',
          count: `${int(report.perAttribute.length)} rows`,
          flush: true,
        },
        table,
      ),
    ),
  );

  return board.sector(
    'measurement',
    {
      title: 'What this browser gave away',
      lede: 'Read once, in front of you, from surfaces that needed no permission.',
      meta: `1 in ${int(report.oneInN)} · ${bits(report.modelledBits)} bits`,
    },

    h(
      'div',
      { class: 'readout' },
      figure(
        `1 in ${int(report.oneInN)}`,
        report.atCeiling
          ? 'at the bound of this pool — the pool cannot separate you further'
          : 'against the entries in this pool',
        'exposed',
      ),
      h('p', { class: 'caveat', text: POOL_BOUND_CAVEAT(report.poolSize, report.ceilingBits) }),
    ),

    h('hr', { class: 'rule' }),

    /*
     * The two figures and the gap between them. The naive sum is red because it is
     * the number the industry quotes about you; the modelled figure is turquoise
     * because the model computed it; the gap is the argument.
     */
    h(
      'div',
      { class: 'readout' },
      figure(bits(report.observedBits), 'bits, assuming the attributes are independent', 'exposed'),
      figure(bits(report.modelledBits), 'bits, once the dependencies are subtracted', 'inferred'),
      figure(bits(report.gapBits), 'bits of double-counting between the two'),
    ),
    h('p', { text: GAP_EXPLANATION }),

    // How much of the naive claim survives the correction, as one position in a
    // range rather than a third number to hold in your head.
    h('div', {}, h('span', { class: 'label', text: 'How much of the naive figure survives' }),
      meter(report.observedBits > 0 ? report.modelledBits / report.observedBits : 0, {
        register: 'inferred',
        label: 'Modelled bits as a fraction of the naive sum',
        scale: [
          'none of it — every bit was double-counted',
          'all of it — the attributes were genuinely independent',
        ],
      }),
      h('p', {
        class: 'gloss',
        text: `${pct(report.observedBits > 0 ? report.modelledBits / report.observedBits : 0)} of the naive sum survives the correction. The rest was the same information counted more than once.`,
      }),
    ),

    h('hr', { class: 'rule rule--double' }),
    h(
      'div',
      { class: 'label label--ruled' },
      h('span', { text: 'Bits of identifying information per attribute group' }),
      h('span', { class: 'label__count', text: `${bits(report.observedBits)} bits in total` }),
    ),
    groupChart(report),

    dominant
      ? h(
          'div',
          { class: 'stack-tight' },
          keyed([
            {
              key: 'largest contributor',
              mark: 'reading',
              value: `${attrLabel(dominant)} — ${bits(report.perAttribute.find((r) => r.attr === dominant)?.bits ?? 0)} bits`,
              register: 'exposed',
            },
            {
              key: 'channel',
              mark: 'model',
              value: CHANNEL_EFFECT[channel] ?? CHANNEL_EFFECT.none,
              register: 'inferred',
            },
          ]),
          h('p', { class: 'gloss', text: CHANNEL_NOTE }),
        )
      : null,

    failedProbes.length > 0
      ? h('p', {
          class: 'gloss',
          text: `Probes that returned nothing: ${failedProbes.join(', ')}. Recorded as null, which is itself a distinguishing answer.`,
        })
      : h('p', {
          class: 'gloss',
          text: `All ${int(probeCount)} probes answered. Nothing was refused and nothing timed out.`,
        }),
    h('p', { class: 'gloss', text: NEAR_UNIQUE_NOTE(nearUniqueIds.map(attrLabel)) }),
    details,
  );
}

// ---------------------------------------------------------------- sector 05

export function renderInference(board: Board, estimate: AutomationEstimate): HTMLElement {
  const agent = estimate.likelihood;

  return board.sector(
    'inference',
    {
      title: 'Person or process',
      lede: 'One more field in the vector. Nothing on this page behaves differently because of it.',
      meta: `agent ${prob(agent)}`,
    },
    h(
      'div',
      { class: 'readout' },
      figure(prob(1 - agent), 'read as human', 'inferred'),
      figure(prob(agent), 'read as agent', 'inferred'),
    ),
    h('div', {}, h('span', { class: 'label', text: 'Where the estimate sits' }),
      meter(agent, {
        register: 'inferred',
        label: 'Automation likelihood',
        scale: ['certainly a person', 'certainly a process'],
      }),
    ),
    keyed([
      {
        key: 'features fired',
        mark: estimate.reasons.length === 0 ? 'false' : 'true',
        value:
          estimate.reasons.length === 0
            ? 'none — no automation feature was present'
            : estimate.reasons.join('; '),
        register: 'inferred',
      },
      {
        key: 'basis',
        mark: 'independent',
        value: 'the static surface only. Nothing you did was watched.',
      },
      { key: 'consequence', mark: 'false', value: 'none. No code path reads this value.' },
    ]),
    h('p', { class: 'caveat', text: automationStatement(estimate) }),
    h('p', { class: 'gloss', text: NO_GATE_NOTE }),
  );
}

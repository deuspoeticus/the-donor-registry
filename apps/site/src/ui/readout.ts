/**
 * The analysis sector (sector 02).
 *
 * Combines browser measurement, automation inference, donation receipt,
 * and the pool's dependency model.
 */

import { attrDef, attrLabel, displayValue, glitchChannel } from '@wearme/core/attributes';
import type { EntropyReport } from '@wearme/core/types';
import type { EntropyModel } from '@wearme/core/entropy';
import type { AutomationEstimate } from '../classifier.js';
import { automationStatement } from '../classifier.js';

import { copy } from '../copy.js';
import type { Board } from './board.js';
import { barRows, figure, keyed, meter, windowed, type BarRow } from './chart.js';
import { append, bits, h, int, pct, prob } from './dom.js';

import { renderMeasuringPlaceholderContent } from './sections/s04-measurement.js';
import { renderReceiptContent, type ReceiptHandlers } from './sections/s06-receipt.js';
import { renderModelContent } from './model.js';
import { decoration } from './glyphs.js';

/**
 * Bits per attribute group, as the deck draws it.
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

  return barRows(rows, { register: 'exposed' });
}

export function renderMeasurementContent(
  board: Board,
  report: EntropyReport,
  nearUniqueIds: readonly string[],
  failedProbes: readonly string[],
  probeCount: number,
): HTMLElement[] {
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

  return [
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
      h('p', { class: 'caveat', text: copy.measurement.poolBoundCaveat(report.poolSize, report.ceilingBits) }),
    ),

    h('hr', { class: 'rule' }),

    h(
      'div',
      { class: 'readout' },
      figure(bits(report.observedBits), 'bits, assuming the attributes are independent', 'exposed'),
      figure(bits(report.modelledBits), 'bits, once the dependencies are subtracted', 'inferred'),
      figure(bits(report.gapBits), 'bits of double-counting between the two'),
    ),
    h('p', { text: copy.measurement.gapExplanation }),

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
              value: copy.measurement.channelEffect[channel] ?? copy.measurement.channelEffect.none,
              register: 'inferred',
            },
          ]),
          h('p', { class: 'gloss', text: copy.measurement.channelNote }),
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
    h('p', { class: 'gloss', text: copy.model.nearUniqueNote(nearUniqueIds.map(attrLabel)) }),
    details,
  ].filter((el): el is HTMLElement => el !== null);
}

export function renderInferenceContent(estimate: AutomationEstimate): HTMLElement[] {
  const agent = estimate.likelihood;

  return [
    h('h4', { class: 'sub', text: 'Person or process' }),
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
    h('p', { class: 'gloss', text: copy.catalogue.noGateNote }),
  ];
}

export function renderAnalysisSection(
  board: Board,
  state: {
    report: EntropyReport | null;
    automation: AutomationEstimate | null;
    donatedId: string | null;
    revocationToken: string | null;
    measuring: boolean;
    model: EntropyModel;
    poolSize: number;
    failedProbes: readonly string[];
  },
  receiptHandlers: ReceiptHandlers,
  probeCount: number,
): HTMLElement {
  const children: HTMLElement[] = [];

  if (state.measuring) {
    children.push(...renderMeasuringPlaceholderContent());
    children.push(h('hr', { class: 'rule rule--double' }));
  } else if (state.report) {
    children.push(...renderMeasurementContent(
      board,
      state.report,
      state.model.nearUniqueIds,
      state.failedProbes,
      probeCount,
    ));
    children.push(h('hr', { class: 'rule rule--double' }));

    if (state.automation) {
      children.push(...renderInferenceContent(state.automation));
      children.push(h('hr', { class: 'rule rule--double' }));
    }

    if (state.donatedId) {
      children.push(...renderReceiptContent(board, { id: state.donatedId, revocationToken: state.revocationToken }, receiptHandlers));
      children.push(h('hr', { class: 'rule rule--double' }));
    }
  } else {
    children.push(h('h4', { class: 'sub', text: 'Browser Signature' }));
    children.push(h('p', {
      class: 'gloss',
      text: 'No signature has been measured. Select a consent tier above to measure this browser and see its structural surprise score.',
    }));
    children.push(h('hr', { class: 'rule rule--double' }));
  }

  children.push(...renderModelContent(state.model, state.poolSize));

  return board.sector(
    'analysis',
    {
      title: 'Analysis',
      lede: 'Your signature reading, agent likelihood, receipt, and the pool dependency structure.',
      meta: state.report ? `1 in ${int(state.report.oneInN)}` : 'not measured',
    },
    ...children,
  );
}

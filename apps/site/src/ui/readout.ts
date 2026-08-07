/**
 * The measurement, as shown to the visitor (§3).
 *
 * Two figures, both at full size, with the gap between them named. The
 * pool-bound caveat is set at the same weight as the headline number rather
 * than beneath it in small type, because the caveat is what makes the number
 * true.
 */

import { attrDef, attrLabel, displayValue, glitchChannel } from '@wearme/core/attributes';
import type { EntropyReport } from '@wearme/core/types';

import { GAP_EXPLANATION, NEAR_UNIQUE_NOTE, POOL_BOUND_CAVEAT } from '../copy.js';
import { append, bits, clear, h, int } from './dom.js';
import type { SectionCounter } from './section.js';

const CHANNEL_DESCRIPTION: Record<string, string> = {
  canvas: 'channel separation and subpixel tearing',
  webgl: 'geometry displacement and torn normals',
  audio: 'vertical banding at the recorded frequency',
  fonts: 'glyph-like scanline debris',
  timezone: 'hue rotated by the UTC offset',
  none: 'no distinct character',
};

function figure(value: string, unit: string): HTMLElement {
  return h(
    'div',
    {},
    h('span', { class: 'figure__value', text: value }),
    h('span', { class: 'figure__unit', text: unit }),
  );
}

/**
 * Bits per attribute group, as deck page 3 draws it: a full-width track, a
 * filled bar, a tick at the value, and the number right-aligned in a column of
 * its own. It replaces nothing — the per-attribute table still follows — but it
 * is the summary the table never gave, so the section now reads shape first and
 * detail second instead of opening on forty rows of monospace.
 *
 * Groups are summed from the same per-attribute surprisals the table lists, so
 * the two cannot disagree.
 */
function groupChart(report: EntropyReport): HTMLElement {
  const totals = new Map<string, number>();
  for (const row of report.perAttribute) {
    const group = attrDef(row.attr)?.group;
    if (!group) continue;
    totals.set(group, (totals.get(group) ?? 0) + row.bits);
  }

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(...ranked.map(([, v]) => v), 0.001);

  const chart = h('div', { class: 'bars', role: 'list' });
  for (const [group, value] of ranked) {
    const pct = (value / max) * 100;
    append(chart, [
      h(
        'div',
        { class: 'bars__row', role: 'listitem' },
        h('span', { class: 'bars__label', text: group }),
        h(
          'span',
          { class: 'bars__track' },
          h('span', { class: 'bars__fill', style: `width:${pct.toFixed(2)}%` }),
          h('span', { class: 'bars__tick', style: `left:${pct.toFixed(2)}%` }),
        ),
        h('span', { class: 'bars__value', text: bits(value) }),
      ),
    ]);
  }

  return chart;
}

export function renderReadout(
  mount: HTMLElement,
  report: EntropyReport,
  nearUniqueIds: readonly string[],
  failedProbes: string[],
  sections: SectionCounter,
): void {
  clear(mount);

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
        h('th', { text: 'Seen', style: 'text-align:right' }),
        h('th', { text: 'Bits', style: 'text-align:right' }),
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
        h('td', { class: 'num', text: row.count === 0 ? 'only you' : `${int(row.count)}×` }),
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

  // The forty-row table is the evidence, not the headline, so it now sits
  // behind a disclosure. The section opens on the two figures and the shape of
  // the groups; the visitor who wants every value still gets every value.
  const details = h(
    'details',
    { class: 'details' },
    h('summary', { class: 'details__summary', text: `Every attribute measured (${int(report.perAttribute.length)})` }),
    h('div', { class: 'scroll-x' }, table),
  );

  append(mount, [
    sections.section(
      { id: 'measurement', eyebrow: 'Measurement' },
      h(
        'div',
        { class: 'readout' },
        figure(
          `1 in ${int(report.oneInN)}`,
          report.atCeiling
            ? 'at the bound of this pool — the pool cannot separate you further'
            : 'against the entries in this pool',
        ),
        h('p', { class: 'caveat', text: POOL_BOUND_CAVEAT(report.poolSize, report.ceilingBits) }),
      ),
      h('hr', { class: 'rule' }),
      h(
        'div',
        { class: 'readout' },
        figure(bits(report.observedBits), 'bits, assuming the attributes are independent'),
        figure(bits(report.modelledBits), 'bits, once the dependencies are subtracted'),
        figure(bits(report.gapBits), 'bits of double-counting between the two'),
      ),
      h('p', { text: GAP_EXPLANATION }),
      h('hr', { class: 'rule' }),
      h('span', { class: 'label', text: 'Bits of identifying information per attribute group' }),
      groupChart(report),
      dominant
        ? h(
            'p',
            { class: 'mono dim' },
            `Largest single contributor: ${attrLabel(dominant)}. In the monument that drives `,
            h('span', { class: 'entry__id', text: CHANNEL_DESCRIPTION[channel] ?? 'no distinct character' }),
            `. The amount of corruption is your total; its character is this attribute.`,
          )
        : null,
      failedProbes.length > 0
        ? h('p', {
            class: 'mono dim',
            text: `Probes that returned nothing: ${failedProbes.join(', ')}. Recorded as null, which is itself a distinguishing answer.`,
          })
        : null,
      h('p', { class: 'mono dim', text: NEAR_UNIQUE_NOTE(nearUniqueIds.map(attrLabel)) }),
      details,
    ),
  ]);
}

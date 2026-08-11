/**
 * The measuring placeholder sub-component (used inside sector 02 · ANALYSIS).
 */

import { PROBE_BUDGET_MS, PROBE_COUNT } from '../../collector/index.js';
import { keyed } from '../chart.js';
import { h, int } from '../dom.js';

export function renderMeasuringPlaceholderContent(): HTMLElement[] {
  return [
    h('h4', { class: 'sub', text: 'Measuring this browser' }),
    h('p', { class: 'gloss', text: 'Nothing has been transmitted, and nothing will be without a second decision.' }),
    keyed([
      { key: 'probes', mark: 'measured', value: `${int(PROBE_COUNT)}, in parallel` },
      { key: 'budget', mark: 'caution', value: `${int(PROBE_BUDGET_MS)} ms — a probe that misses it is recorded as null` },
      { key: 'destination', mark: 'withheld', value: 'this browser’s memory, and nowhere else yet' },
    ]),
  ];
}

/**
 * The colophon — the foot of the page.
 *
 * The legend, the credits, the addressing note, and the law passage. Deliberately not
 * a sector: it has no address, does not appear in the count, and does not appear in the
 * running head, because it is the page talking about itself rather than a chapter of
 * the argument.
 *
 * Also holds `poolLine`, the one-line summary string shown at the foot of the catalogue
 * sector. It lives here because it is footer-flavoured copy rather than catalogue logic.
 */

import type { PoolStats } from '@wearme/core/types';

import { copy } from '../../copy.js';
import type { Board } from '../board.js';
import { keyed, windowed } from '../chart.js';
import { append, bits, h, int } from '../dom.js';
import { decoration, LEGEND } from '../glyphs.js';
import { sigil, SIGIL_LEGEND } from '../sigils.js';
import { SECTOR_COUNT } from '../sectors.js';

// ---------------------------------------------------------------- colophon

export interface ColophonProps {
  /** How many addressed sectors this render pass actually produced. */
  builtCount: number;
  stats: PoolStats;
}

/**
 * The colophon: legend, credits, law, and addressing note.
 *
 * `builtCount` must come from the board's `.built().length` call — it is what the
 * running head already has, and the addressing note must agree with it.
 */
export function colophon(board: Board, { builtCount }: ColophonProps): HTMLElement {
  /*
   * The legend, in two tables, because the page has two notations and they divide the
   * world between them: sigils name things, marks name operations and relations. If it
   * has a plural it is a sigil; if it takes arguments it is a mark.
   *
   * Both are published in full. A notation the reader cannot look up is a private
   * language, and the sigils carry their Twemoji codepoint so the attribution is
   * checkable rather than asserted — anyone can put `1f3fa` into Twemoji and see what
   * this was before it was reduced to sixteen pixels.
   */
  const sigilLegend = h('table', { class: 'table' });
  append(sigilLegend, [
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { text: 'Sigil' }),
        h('th', { text: 'Names' }),
        h('th', { text: 'From' }),
      ),
    ),
  ]);
  const sigilBody = h('tbody');
  for (const item of SIGIL_LEGEND) {
    append(sigilBody, [
      h(
        'tr',
        {},
        h('td', {}, sigil(item.key, { px: 20 })),
        h('td', { class: 'value', text: item.means }),
        h('td', { class: 'value dimmer', text: `U+${item.codepoint.toUpperCase()}` }),
      ),
    ]);
  }
  sigilLegend.appendChild(sigilBody);

  const legend = h('table', { class: 'table' });
  append(legend, [
    h('thead', {}, h('tr', {}, h('th', { text: 'Mark' }), h('th', { text: 'Means' }))),
  ]);
  const body = h('tbody');
  for (const item of LEGEND) {
    append(body, [
      h('tr', {}, h('td', {}, decoration(item.key)), h('td', { class: 'value', text: item.means })),
    ]);
  }
  legend.appendChild(body);

  const palette = keyed([
    { key: 'white', mark: 'true', value: 'a measured fact — a value read off a browser, a count taken from the pool' },
    {
      key: 'red',
      mark: 'sent',
      value: 'exposure, and irreversibility — what leaves this browser, what singles somebody out',
      register: 'exposed',
    },
    {
      key: 'turquoise',
      mark: 'model',
      value: 'inference — what the model computes rather than reads',
      register: 'inferred',
    },
    { key: 'inversion', mark: 'worn', value: 'wearing, and the instant a state changes' },
  ]);

  return board.foot(
    h('p', { class: 'sub' }, sigil('scales', { px: 22 }), ' The law'),
    h('p', { text: copy.catalogue.lawNote }),
    h('p', { text: copy.cover.modelAddress }),
    h('p', { class: 'gloss', text: copy.colophon.addressingNote(builtCount, SECTOR_COUNT) }),

    h('hr', { class: 'rule rule--double' }),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'div',
        { class: 'stack' },
        h('span', { class: 'label', text: 'The palette, and what it is allowed to mean' }),
        palette,
      ),
      h(
        'div',
        { class: 'stack' },
        h('span', { class: 'label', text: 'The notation' }),
        h('p', { class: 'gloss', text: copy.colophon.legendNote }),
        windowed(
          { caption: 'Marks \u00b7 operations and relations', count: `${int(LEGEND.length)}`, flush: true },
          legend,
        ),
      ),
    ),

    h('hr', { class: 'rule rule--double' }),
    h('span', { class: 'label', text: 'The sigils, and what each one names' }),
    h('p', { class: 'gloss', text: copy.colophon.sigilNote }),
    windowed(
      { caption: 'Sigils \u00b7 things', count: `${int(SIGIL_LEGEND.length)}`, flush: true },
      sigilLegend,
    ),

    h('hr', { class: 'rule rule--double' }),
    h('p', { class: 'gloss', text: copy.colophon.typeNote }),
    h('p', { class: 'gloss', text: copy.colophon.colophonCredit }),
  );
}

// ---------------------------------------------------------------- pool line (catalogue footer)

/**
 * The one-line pool summary shown at the bottom of the catalogue sector.
 *
 * Lives here rather than in `ui/catalogue.ts` because it is footer-flavoured copy
 * assembled from pool stats, not catalogue rendering logic.
 */
export function poolLine(stats: PoolStats): string {
  return `${int(stats.size)} entries · ${int(stats.donatedCount)} donated · ${int(stats.totalWears)} wears · ${bits(stats.bitsDestroyed)} bits destroyed · ${int(stats.machineDonations)} donations read as machines`;
}

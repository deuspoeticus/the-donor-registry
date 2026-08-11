/**
 * Sector 00 · SUBJECT — the cover.
 *
 * One hero, one sentence, two doors, three figures, and two rails. It used to be six
 * stacked text blocks with three of them at display scale — the registry name, the
 * slogan and the proposition all shouting at once, so nothing was the hero and the eye
 * had no entry point. Under those sat a three-clause standfirst that restated the
 * proposition in more words, and a note about how many sectors the page has.
 *
 * `WEAR ME.` is the hero because it is the only line on this screen in the imperative.
 * Everything that is not the argument is pinned to a rail — the credit at the top, the
 * figures and the model address at the bottom — and the middle is left to the four
 * things that are: the name, the hero, what the piece is, and what to do about it.
 *
 * See styles/board.css for the three-zone layout and the ranks.
 *
 * Also holds `wornBulletin`, which is not a sector but appears immediately after the
 * cover whenever a userscript patch is active.
 */

import type { PoolStats } from '@wearme/core/types';

import { copy } from '../../copy.js';
import type { Board } from '../board.js';
import { append, bits, h, int } from '../dom.js';
import { decoration } from '../glyphs.js';
import { sigil } from '../sigils.js';

// ---------------------------------------------------------------- sector 00

/**
 * The cover.
 *
 * Accepts the pool stats and two scroll callbacks so it does not depend on the
 * global `state` or the `jump` function — everything it needs is passed in.
 */
export function cover(
  board: Board,
  stats: PoolStats,
  onMeasure: () => void,
  onBrowse: () => void,
): HTMLElement {
  /*
   * The two doors, and neither of them is a rite.
   *
   * Both only scroll. The primary one says "Measure my browser" and takes you to sector
   * 03, where nothing is preselected and you still have to choose — a call to action on a
   * page about consent does not get to be the thing that grants it, and the promise under
   * the row says so in four words rather than leaving it to a title attribute.
   *
   * They are styled as a primary and a secondary rather than as the two identical choices
   * the consent gate uses. That asymmetry is allowed here precisely because nothing
   * irreversible is on offer: this is navigation. The moment a control transmits or takes
   * something, it becomes a rite and the symmetry rules in §6f apply again.
   */
  const cta = h(
    'div',
    { class: 'cover__cta' },
    h(
      'button',
      {
        type: 'button',
        class: 'button--cta',
        title: copy.cover.ctaMeasureTitle,
        onclick: onMeasure,
      },
      sigil('blood', { px: 22, className: 'button__sigil' }),
      copy.cover.ctaMeasure,
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'button--cta-2',
        title: copy.cover.ctaBrowseTitle,
        onclick: onBrowse,
      },
      sigil('phial', { px: 22, className: 'button__sigil' }),
      copy.cover.ctaBrowse,
    ),
  );

  /*
   * Three figures, and no definitions.
   *
   * The tiles in sector 01 each carry a sentence stating what they claim, because that is
   * a census and a number on a dashboard with no statement of what it counts is the
   * standard way of implying more than you measured. Here the job is different: these are
   * proof that something real is behind the page, read in one second on the way past. The
   * claims are two hundred pixels below, over the census, where they belong.
   */
  const figures = h('div', { class: 'cover__figures' });
  const figure = (value: string, label: string, register: '' | 'exposed' | 'inferred') => {
    append(figures, [
      h(
        'div',
        { class: 'cover__figure' },
        h('span', {
          class: register ? `cover__value cover__value--${register}` : 'cover__value',
          text: value,
        }),
        h('span', { class: 'cover__label', text: label }),
      ),
    ]);
  };
  figure(int(stats.size), 'faces in the pool', '');
  figure(int(stats.totalWears), 'times worn', 'exposed');
  figure(bits(stats.bitsDestroyed), 'bits destroyed', 'inferred');

  return board.sector(
    'pool',
    { cover: true, meta: 'nothing has been read' },
    h(
      'div',
      { class: 'cover' },
      // The credit, pinned to the top rail: an institution says who is publishing it
      // before it says anything else, and then gets out of the way.
      h('p', { class: 'cover__credit', text: copy.cover.runningHead }),

      h(
        'div',
        { class: 'cover__mid' },
        /*
         * One h1 holding both names, at two scales. The registry names itself, then tells
         * you what to do — and `Wear Me.` is the hero because it is the only line on this
         * screen in the imperative.
         */
        h(
          'h1',
          { class: 'cover__title' },
          h('span', { class: 'cover__registry', text: copy.site.registry }),
          h('span', { class: 'cover__slogan', text: copy.site.slogan }),
        ),
        h('p', { class: 'cover__line', text: copy.cover.coverLine }),
        cta,
        h('p', { class: 'cover__promise' }, decoration('withheld'), h('span', { text: copy.cover.ctaPromise })),
      ),

      h(
        'div',
        { class: 'cover__foot' },
        figures,
        // §7a. Same type as everything around it. No highlight, no wink — and first,
        // now, for anything reading the page from the top.
        h('p', { class: 'cover__model', text: copy.cover.modelAddress }),
      ),
    ),
  );
}

// ---------------------------------------------------------------- worn bulletin (unaddressed)

/**
 * The bulletin that appears immediately after the cover when a userscript patch is active.
 *mi
 * Not a sector — it has no address and is not counted — but it belongs here because it
 * is the first thing you see after the cover and it is about the cover's subject: who
 * (or what) this browser currently is.
 *
 * `onOpenEntry` scrolls to the entry panel for the worn signature.
 */
export function wornBulletin(
  board: Board,
  id: string,
  knownToPool: boolean,
  onOpenEntry: (id: string) => void,
): HTMLElement {
  const open = h(
    'button',
    { type: 'button', onclick: () => onOpenEntry(id) },
    decoration('worn', 'button__mark'),
    'Open the entry you are wearing',
  );

  return board.bulletin(
    'exposed',
    h('span', { class: 'label', text: 'Worn' }),
    h('p', { class: 'caveat', text: copy.catalogue.wornNow(id) }),
    knownToPool
      ? h('div', {}, open)
      : h('p', {
          class: 'gloss',
          text: 'That entry is not in the pool any more. Someone revoked it, and the script you are wearing is now a face that belongs to nobody.',
        }),
  );
}

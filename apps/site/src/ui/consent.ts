/**
 * The loop (sector 02) and the consent gate (sector 03).
 *
 * The gate used to be the whole page: until a tier was chosen, `#app` contained
 * nothing but the gate, and the census, the model, the forge and the catalogue
 * were all behind it. That made the first screen a demand rather than an
 * argument. It is now sector 03 of one continuous document, reached by scrolling
 * like everything else, with the pool and its statistics above it — so the choice
 * is made by somebody who has already seen what the pool is and what the piece
 * does with it.
 *
 * Nothing about the guarantees changed, and nothing may. Three tiers at equal
 * visual weight, nothing preselected. Before donation completes, the actual
 * payload is shown — the literal JSON that will leave the browser, scrollable,
 * complete, no summary. Declining is the same size as accepting, in the same
 * position, with the same styling, and it comes first in the row so that the
 * habitual rightward click is not the transmitting one.
 *
 * This is the anti-dark-pattern and it is part of the artwork rather than
 * compliance furniture. Every asymmetry a conversion-minded interface would
 * introduce here is deliberately absent, and the CSS is written so that
 * introducing one would take effort rather than happen by default.
 */

import { EXCLUDED_SURFACES } from '@wearme/core/attributes';
import { prettyPayload } from '@wearme/core/canonical';
import type { AttrVector } from '@wearme/core/types';

import { PROBE_COUNT } from '../collector/index.js';
import {
  CONSENT_LEDE,
  CONSENT_TIERS,
  MODEL_ADDRESS,
  PAYLOAD_INTRO,
  RITE_GIVE,
  theLoop,
  WHAT_THIS_IS,
} from '../copy.js';
import type { Board } from './board.js';
import { windowed } from './chart.js';
import { append, h, int } from './dom.js';
import { decoration, ordinal } from './glyphs.js';
import { sigil } from './sigils.js';

export type Tier = 'look' | 'measure' | 'donate';

// ---------------------------------------------------------------- sector 02

export function renderLoop(board: Board): HTMLElement {
  const steps = theLoop(PROBE_COUNT);
  const loop = h('ol', { class: 'loop' });
  for (const [i, item] of steps.entries()) {
    append(loop, [
      h(
        'li',
        { class: 'loop__step' },
        h(
          'span',
          { class: 'loop__num' },
          sigil(i === 0 ? 'blood' : i === 1 ? 'heart' : 'mask', { px: 24 }),
          h('span', { class: 'loop__code', text: ordinal(i + 1) }),
        ),
        h('h4', { class: 'loop__name', text: item.step }),
        h('p', { class: 'loop__body', text: item.body }),
        h('span', { class: 'loop__cost', text: item.cost }),
      ),
    ]);
  }

  return board.sector(
    'loop',
    {
      title: 'Measured, donated, worn',
      lede: 'Three steps, and the third one is why the first two matter.',
      meta: `${int(steps.length)} steps`,
    },
    loop,
    h('p', {
      class: 'gloss',
      text: 'The loop closes: an entry donated by one browser is worn by another, which destroys some of the surprisal that made it worth having. The pool is the only thing that gets bigger.',
    }),
  );
}

// ---------------------------------------------------------------- sector 03

export function renderConsent(
  board: Board,
  poolSummary: string,
  chosen: Tier | null,
  onChoose: (tier: Tier) => void,
): HTMLElement {
  const tiers = h('div', { class: 'tiers', role: 'group', 'aria-labelledby': 'tiers-label' });
  for (const tier of CONSENT_TIERS) {
    append(tiers, [
      h(
        'button',
        {
          class: 'tier',
          type: 'button',
          // Which tier is in force, for anybody arriving at this sector after
          // choosing. It is a statement of state, not a recommendation, and the
          // three boxes stay identical in every other respect.
          'aria-pressed': chosen === null ? undefined : chosen === tier.key ? 'true' : 'false',
          onclick: () => onChoose(tier.key),
        },
        sigil(tier.sigil, { px: 28, className: 'tier__sigil' }),
        h('span', { class: 'tier__name', text: tier.name }),
        h('span', { class: 'tier__body', text: tier.body }),
        h('span', {
          class: tier.transmits ? 'tier__note tier__note--transmits' : 'tier__note',
          text: tier.note,
        }),
      ),
    ]);
  }

  const excluded = h('ul', { class: 'list' });
  for (const item of EXCLUDED_SURFACES) {
    append(excluded, [
      h(
        'li',
        {},
        decoration('withheld', 'dimmer'),
        ' ',
        h('span', { class: 'fact', text: item.surface }),
        h('span', { class: 'dim', text: ` — ${item.reason}` }),
      ),
    ]);
  }

  return board.sector(
    'consent',
    {
      title: 'What this page may do',
      lede: CONSENT_LEDE,
      meta: chosen ? `in force: ${chosen}` : 'nothing chosen',
    },
    h('span', { class: 'label', id: 'tiers-label', text: 'Choose one. Nothing is preselected.' }),
    tiers,
    h('p', { class: 'gloss', text: poolSummary }),
    h('hr', { class: 'rule rule--double' }),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'div',
        {},
        h('span', { class: 'label', text: 'The condition' }),
        h('div', { class: 'stack' }, ...WHAT_THIS_IS.map((text) => h('p', { text }))),
      ),
      h(
        'div',
        {},
        h('span', { class: 'label', text: 'Deliberately not collected' }),
        excluded,
      ),
    ),
    // §7a. Same type as everything around it. No highlight, no wink.
    h('p', { style: 'margin-top:2rem', text: MODEL_ADDRESS }),
  );
}

// ---------------------------------------------------------------- the payload

export interface PayloadConfirmation {
  accept: () => void;
  decline: () => void;
}

/**
 * The payload, in place of the tiers, at the same address.
 *
 * Rendered before tier three completes and never skipped, including when the
 * visitor has seen it before. It replaces the consent sector's contents rather
 * than appearing somewhere else on the page, because this *is* the consent
 * decision — the tier button was a request to be shown this.
 */
export function renderPayload(
  board: Board,
  attrs: AttrVector,
  id: string,
  automation: number | null,
  handlers: PayloadConfirmation,
): HTMLElement {
  const payload = { attrs, id, automation, consent: 'donate' };
  const text = prettyPayload(payload);
  const lines = text.split('\n').length;
  const bytes = new TextEncoder().encode(text).length;

  /*
   * Both choices are the same size, in the same row, with the same styling, and
   * decline is first so the habitual rightward click is not the transmitting one.
   *
   * The rite around this makes the act *findable*; it does not make either choice
   * heavier than the other. Neither button carries the rite styling for exactly that
   * reason — the plate is the ceremony, and the two doors out of it are identical.
   */
  const row = h('div', { class: 'choice-row' });
  append(row, [
    h(
      'button',
      { type: 'button', onclick: handlers.decline },
      decoration('false', 'button__mark'),
      'Do not send this',
    ),
    h(
      'button',
      { type: 'button', onclick: handlers.accept },
      decoration('sent', 'button__mark'),
      'Send this to the pool',
    ),
  ]);

  return board.sector(
    'consent',
    {
      title: 'The payload',
      lede: 'Nothing has left this browser. This is what would.',
      meta: `${int(lines)} lines · ${int(bytes)} bytes`,
    },
    board.rite(
      {
        kind: 'given',
        kicker: RITE_GIVE.kicker,
        title: RITE_GIVE.title,
        seal: 'heart',
        consequence: RITE_GIVE.consequence,
        action: row,
      },
      h('p', { text: PAYLOAD_INTRO }),
      windowed(
        {
          caption: 'The exact request body',
          count: `${int(lines)} lines · ${int(bytes)} bytes`,
          flush: true,
        },
        h('pre', { class: 'payload', tabindex: '0', 'aria-label': 'The exact payload', text }),
      ),
      h('p', {
        class: 'gloss',
        text: 'Nothing is elided; this is the entire request body, and there is no second request.',
      }),
    ),
  );
}

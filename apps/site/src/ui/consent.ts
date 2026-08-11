/**
 * The consent sector (sector 01).
 *
 * Combines the loop (how it works) and the consent gate (tiers / payload).
 */

import { EXCLUDED_SURFACES } from '@wearme/core/attributes';
import { prettyPayload } from '@wearme/core/canonical';
import type { AttrVector } from '@wearme/core/types';

import { PROBE_COUNT } from '../collector/index.js';
import { copy } from '../copy.js';
import type { Board } from './board.js';
import { windowed } from './chart.js';
import { append, h, int } from './dom.js';
import { decoration, ordinal } from './glyphs.js';
import { sigil } from './sigils.js';

export type Tier = 'look' | 'measure' | 'donate';

export interface PayloadConfirmation {
  accept: () => void;
  decline: () => void;
}

// ---------------------------------------------------------------- the loop content

export function renderLoopContent(): HTMLElement[] {
  const steps = copy.loop.theLoop(PROBE_COUNT);
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

  return [
    h('h4', { class: 'sub', text: 'Measured, donated, worn' }),
    loop,
    h('p', {
      class: 'gloss',
      text: 'The loop closes: an entry donated by one browser is worn by another, which destroys some of the surprisal that made it worth having. The pool is the only thing that gets bigger.',
    }),
  ];
}

// ---------------------------------------------------------------- consent content

export function renderConsentContent(
  poolSummary: string,
  chosen: Tier | null,
  onChoose: (tier: Tier) => void,
): HTMLElement[] {
  const TiersContainer = h('div', { class: 'tiers', role: 'group', 'aria-labelledby': 'tiers-label' });
  for (const tier of copy.consent.tiers) {
    append(TiersContainer, [
      h(
        'button',
        {
          class: 'tier',
          type: 'button',
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

  return [
    h('span', { class: 'label', id: 'tiers-label', text: 'Choose one. Nothing is preselected.' }),
    TiersContainer,
    h('p', { class: 'gloss', text: poolSummary }),
    h('hr', { class: 'rule rule--double' }),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'div',
        {},
        h('span', { class: 'label', text: 'The condition' }),
        h('div', { class: 'stack' }, ...copy.loop.whatThisIs.map((text) => h('p', { text }))),
      ),
      h(
        'div',
        {},
        h('span', { class: 'label', text: 'Deliberately not collected' }),
        excluded,
      ),
    ),
    h('p', { style: 'margin-top:2rem', text: copy.cover.modelAddress }),
  ];
}

// ---------------------------------------------------------------- payload content

export function renderPayloadContent(
  board: Board,
  attrs: AttrVector,
  id: string,
  automation: number | null,
  handlers: PayloadConfirmation,
): HTMLElement[] {
  const payload = { attrs, id, automation, consent: 'donate' };
  const text = prettyPayload(payload);
  const lines = text.split('\n').length;
  const bytes = new TextEncoder().encode(text).length;

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

  return [
    board.rite(
      {
        kind: 'given',
        kicker: copy.receipt.riteGive.kicker,
        title: copy.receipt.riteGive.title,
        seal: 'heart',
        consequence: copy.receipt.riteGive.consequence,
        action: row,
      },
      h('p', { text: copy.receipt.payloadIntro }),
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
  ];
}

// ---------------------------------------------------------------- consent sector builder

export function renderConsentSection(
  board: Board,
  poolSummary: string,
  chosen: Tier | null,
  onChoose: (tier: Tier) => void,
  awaitingPayload: boolean,
  collection: AttrVector | null,
  collectionId: string | null,
  automationLikelihood: number | null,
  payloadHandlers: PayloadConfirmation,
): HTMLElement {
  const children: HTMLElement[] = [];

  children.push(...renderLoopContent());

  children.push(h('hr', { class: 'rule rule--double' }));

  if (awaitingPayload && collection && collectionId) {
    children.push(...renderPayloadContent(board, collection, collectionId, automationLikelihood, payloadHandlers));
  } else {
    children.push(...renderConsentContent(poolSummary, chosen, onChoose));
  }

  return board.sector(
    'consent',
    {
      title: 'Consent and Operation',
      lede: copy.consent.lede,
      meta: chosen ? `tier: ${chosen}` : 'nothing chosen',
    },
    ...children,
  );
}

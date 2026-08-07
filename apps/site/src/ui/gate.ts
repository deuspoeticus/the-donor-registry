/**
 * The consent gate (§6f).
 *
 * Three tiers at equal visual weight, nothing preselected. Before donation
 * completes, the actual payload is shown — the literal JSON that will leave the
 * browser, scrollable, complete, no summary. Declining is the same size as
 * accepting, in the same position, with the same styling.
 *
 * This is the anti-dark-pattern and it is part of the artwork rather than
 * compliance furniture. Every asymmetry a conversion-minded interface would
 * introduce here is deliberately absent, and the CSS is written so that
 * introducing one would take effort rather than happen by default.
 */

import { EXCLUDED_SURFACES } from '@wearme/core/attributes';
import { prettyPayload } from '@wearme/core/canonical';
import type { AttrVector } from '@wearme/core/types';

import {
  CONSENT_TIERS,
  MODEL_ADDRESS,
  PAYLOAD_INTRO,
  PROPOSITION,
  RUNNING_HEAD,
  STANDFIRST,
  THE_LOOP,
  WHAT_THIS_IS,
} from '../copy.js';
import { append, clear, h } from './dom.js';

export type Tier = 'look' | 'measure' | 'donate';

export function renderGate(
  mount: HTMLElement,
  poolSummary: string,
  onChoose: (tier: Tier) => void,
): void {
  clear(mount);

  const tiers = h('div', { class: 'tiers', role: 'group', 'aria-labelledby': 'tiers-label' });
  for (const tier of CONSENT_TIERS) {
    append(tiers, [
      h(
        'button',
        { class: 'tier', type: 'button', onclick: () => onChoose(tier.key) },
        h('span', { class: 'tier__name', text: tier.name }),
        h('span', { class: 'tier__body', text: tier.body }),
        h('span', { class: 'tier__note', text: tier.note }),
      ),
    ]);
  }

  const excluded = h('ul', { class: 'list mono' });
  for (const item of EXCLUDED_SURFACES) {
    append(excluded, [
      h(
        'li',
        {},
        h('span', { class: 'entry__id', text: item.surface }),
        h('span', { class: 'dim', text: ` — ${item.reason}` }),
      ),
    ]);
  }

  // The loop, before the choice. Three steps at equal weight, numbered, so the
  // tier buttons below are chosen against a picture of where each one leads.
  const loop = h('ol', { class: 'loop' });
  for (const [i, item] of THE_LOOP.entries()) {
    append(loop, [
      h(
        'li',
        { class: 'loop__step' },
        h('span', { class: 'loop__num', text: String(i + 1).padStart(2, '0') }),
        h('h3', { class: 'loop__name', text: item.step }),
        h('p', { class: 'loop__body', text: item.body }),
      ),
    ]);
  }

  append(mount, [
    h(
      'section',
      { class: 'gate' },
      h(
        'div',
        { class: 'gate__inner' },
        h('p', { class: 'runhead', text: RUNNING_HEAD }),
        h('h1', { text: 'Wear me' }),
        // The deck's own line, set as the standfirst. It is the shortest true
        // statement of the piece and it belongs above the explanation, not
        // after it.
        h('p', { class: 'proposition', text: PROPOSITION }),
        h('p', { class: 'caveat', text: STANDFIRST }),
        h('hr', { class: 'rule' }),
        h('span', { class: 'label', text: 'The loop' }),
        loop,
        h('hr', { class: 'rule' }),
        h('span', { class: 'label', id: 'tiers-label', text: 'What this page may do' }),
        tiers,
        h('p', { class: 'mono dim', style: 'margin-top:1.5rem', text: poolSummary }),
        h('hr', { class: 'rule' }),
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
        h('p', { style: 'margin-top:2.5rem', text: MODEL_ADDRESS }),
      ),
    ),
  ]);
}

export interface PayloadConfirmation {
  accept: () => void;
  decline: () => void;
}

/**
 * The payload preview. Rendered before tier three completes and never skipped,
 * including when the visitor has seen it before.
 */
export function renderPayloadPreview(
  mount: HTMLElement,
  attrs: AttrVector,
  id: string,
  automation: number | null,
  handlers: PayloadConfirmation,
): void {
  clear(mount);

  const payload = { attrs, id, automation, consent: 'donate' };
  const text = prettyPayload(payload);
  const lines = text.split('\n').length;

  const row = h('div', { class: 'choice-row' });
  // Same size, same row, same styling. The order is decline-first so that the
  // habitual rightward click is not the transmitting one.
  append(row, [
    h('button', { type: 'button', onclick: handlers.decline }, 'Do not send this'),
    h('button', { type: 'button', onclick: handlers.accept }, 'Send this to the pool'),
  ]);

  append(mount, [
    h(
      'section',
      { class: 'gate' },
      h(
        'div',
        { class: 'gate__inner stack' },
        h('h2', { text: 'The payload' }),
        h('p', { text: PAYLOAD_INTRO }),
        h('pre', { class: 'payload', tabindex: '0', 'aria-label': 'The exact payload', text }),
        h('p', {
          class: 'mono dim',
          text: `${lines} lines. Nothing is elided; this is the entire request body.`,
        }),
        row,
      ),
    ),
  ]);
}

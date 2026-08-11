/**
 * The receipt sub-component (used inside sector 02 · ANALYSIS).
 */

import { copy } from '../../copy.js';
import type { Board } from '../board.js';
import { h } from '../dom.js';
import { sigil } from '../sigils.js';

export interface ReceiptState {
  id: string;
  revocationToken: string | null;
}

export interface ReceiptHandlers {
  onRevoke: (id: string, token: string) => Promise<void>;
}

export function renderReceiptContent(board: Board, state: ReceiptState, handlers: ReceiptHandlers): HTMLElement[] {
  const { id, revocationToken: token } = state;

  const input = h('input', {
    type: 'text',
    class: 'payload payload--token',
    value: token ?? '',
    readonly: true,
    'aria-label': 'Your revocation token',
  }) as HTMLInputElement;

  const revokeButton = h(
    'button',
    { type: 'button', class: 'button--rite' },
    sigil('dagger', { px: 22, className: 'button__sigil' }),
    'Unmake this entry',
  );
  const status = h('p', { class: 'mono dim' });

  revokeButton.addEventListener('click', async () => {
    revokeButton.disabled = true;
    try {
      await handlers.onRevoke(id, input.value.trim());
    } catch (error) {
      revokeButton.disabled = false;
      status.textContent = `That did not remove it: ${error instanceof Error ? error.message : String(error)}. Check the token and try again.`;
    }
  });

  return [
    h('h4', { class: 'sub', text: token ? 'It is in the pool' : 'This signature was already there' }),
    h('p', {
      text: token
        ? copy.receipt.revocationNote
        : 'This signature was already in the pool, donated by another browser that produces exactly the same one. Nothing new was stored, and there is no new token; the entry belongs to whoever donated it first. You are, it turns out, not unique.',
    }),
    h('p', { text: copy.receipt.pendingPublication }),
    token
      ? h(
          'div',
          { class: 'stack' },
          h('span', { class: 'label', text: 'Your revocation token' }),
          input,
        )
      : null,
    token
      ? board.rite(
          {
            kind: 'given',
            kicker: copy.receipt.riteRevoke.kicker,
            title: copy.receipt.riteRevoke.title,
            seal: 'dagger',
            consequence: copy.receipt.riteRevoke.consequence,
            action: revokeButton,
          },
          h('p', {
            text: 'The token above is the only thing that can do this, it is stored as a hash and cannot be reissued, and it is shown once. Paste it back into the field if you have replaced the contents.',
          }),
        )
      : null,
    status,
  ].filter((el): el is HTMLElement => el !== null);
}

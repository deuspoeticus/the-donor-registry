/**
 * The catalogue and the wearing panel (§7).
 *
 * Browse the pool, open an entry, take the script. Everything the emitted
 * script does and does not do is stated beside the button that produces it,
 * because a coverage claim nobody can check is the kind of claim this piece
 * exists to refuse.
 */

import { attrLabel, displayValue, groupsOf, ATTR_IDS } from '@wearme/core/attributes';
import { bitsDestroyedBy } from '@wearme/core/entropy';
import { coverage, emitUserscript, NOT_COVERED, type SurfaceMode } from '@wearme/core/userscript';
import type { Identity } from '@wearme/core/types';

import {
  INSTALL_NOTE,
  MANAGERS,
  MODEL_ADDRESS,
  TRY_ON_LIMIT,
  TRY_ON_NOTE,
  VERIFY_LINKS,
  VERIFY_NOTE,
  WEARING_LIMITS,
  WEARING_LIMITS_HEAD,
  WHY_AN_EXTENSION,
} from '../copy.js';
import { scriptUrl } from '../pool.js';
import { append, bits, clear, h, int } from './dom.js';
import type { SectionCounter } from './section.js';
import { tryOn } from './tryout.js';

/**
 * How many entries the grid shows before asking. Two hundred steles at roughly
 * a hundred pixels each made the catalogue four and a half thousand pixels of
 * the page's ten — it buried the entry panel below it and dominated a scroll it
 * was only ever meant to end. The rest are one click away.
 */
const CATALOGUE_PAGE = 48;

export interface CatalogueHandlers {
  onOpen: (id: string) => void;
  onWear: (id: string) => Promise<{ wearCount: number; counted: boolean }>;
  hasWorn: (id: string) => boolean;
}

export interface WearOptions {
  canvasMode: SurfaceMode;
  audioMode: SurfaceMode;
  hideOverrides: boolean;
}

export const DEFAULT_WEAR_OPTIONS: WearOptions = {
  canvasMode: 'converge',
  audioMode: 'converge',
  hideOverrides: false,
};

export function renderCatalogue(
  mount: HTMLElement,
  entries: Identity[],
  selectedId: string | null,
  handlers: CatalogueHandlers,
  poolNote: string,
  sections: SectionCounter,
  expanded: boolean,
  onExpand: () => void,
): void {
  clear(mount);

  const shown = expanded ? entries : entries.slice(0, CATALOGUE_PAGE);
  const grid = h('div', { class: 'catalogue' });
  for (const entry of shown) {
    append(grid, [
      h(
        'button',
        {
          class: 'entry',
          type: 'button',
          'aria-current': entry.id === selectedId ? 'true' : 'false',
          onclick: () => handlers.onOpen(entry.id),
        },
        h('span', { class: 'entry__id', text: entry.id.slice(0, 16) }),
        h('span', { class: 'dim', text: `${entry.createdAt} · worn ${int(entry.wearCount)}×` }),
        h('span', {
          class: 'dimmer',
          text: entry.wearCount > 1 ? `${bits(bitsDestroyedBy(entry.wearCount))} bits destroyed` : 'not yet shared',
        }),
      ),
    ]);
  }

  const remaining = entries.length - shown.length;
  const more = h('button', { type: 'button', onclick: onExpand }, `Show the remaining ${int(remaining)}`);

  append(mount, [
    sections.section(
      {
        id: 'catalogue',
        eyebrow: 'The catalogue',
        title: entries.length > 0 ? 'Every entry in the pool' : 'The pool is empty',
      },
      entries.length > 0
        ? h('p', { text: 'Open any entry to read its attributes and take a script that presents it as yours.' })
        : h('p', { text: 'Nothing has been donated yet. Measure yourself and donate, and this becomes the first entry.' }),
      // §7a. Plain body text at normal size, in the same voice as everything
      // else on the page.
      h('p', { text: MODEL_ADDRESS }),
      h('p', { class: 'mono dim', text: poolNote }),
      grid,
      remaining > 0
        ? h(
            'div',
            { class: 'stack' },
            h('p', {
              class: 'mono dim',
              text: `Showing ${int(shown.length)} of ${int(entries.length)}.`,
            }),
            h('div', {}, more),
          )
        : null,
    ),
  ]);
}

export function renderEntry(
  mount: HTMLElement,
  entry: Identity,
  options: WearOptions,
  handlers: CatalogueHandlers,
  onOptionsChange: (next: WearOptions) => void,
  siteUrl: string,
  /**
   * Whether this browser has consented to being measured. Under "Look only" it
   * has not, so the demonstration below shows what the frame became without
   * reading what it was.
   */
  mayReadThisBrowser: boolean,
  sections: SectionCounter,
  onClose: () => void,
): void {
  clear(mount);

  const attributes = h('table', { class: 'table' });
  append(attributes, [
    h('thead', {}, h('tr', {}, h('th', { text: 'Attribute' }), h('th', { text: 'Value' }))),
  ]);
  const body = h('tbody');
  for (const [group, defs] of groupsOf(ATTR_IDS)) {
    for (const def of defs) {
      const value = displayValue(entry.attrs[def.id] ?? null);
      append(body, [
        h(
          'tr',
          {},
          h('td', {}, h('span', { class: 'dimmer', text: `${group} · ` }), def.label),
          h('td', { class: 'value', text: value.length > 300 ? `${value.slice(0, 300)}…` : value }),
        ),
      ]);
    }
  }
  attributes.appendChild(body);

  // What the script actually does, attribute by attribute.
  const rows = coverage(options);
  const exact = rows.filter((r) => r.state === 'exact');
  const converged = rows.filter((r) => r.state === 'converged');
  const uncovered = rows.filter((r) => r.state === 'none');

  const coverageList = h('ul', { class: 'list mono' });
  append(coverageList, [
    h(
      'li',
      {},
      h('span', { class: 'entry__id', text: `${exact.length} presented exactly` }),
      h('span', { class: 'dim', text: ` — ${exact.map((r) => r.label).join(', ')}` }),
    ),
    converged.length > 0
      ? h(
          'li',
          {},
          h('span', { class: 'entry__id', text: `${converged.length} replaced by a shared value` }),
          h('span', { class: 'dim', text: ` — ${converged[0].note}` }),
        )
      : null,
    uncovered.length > 0
      ? h(
          'li',
          {},
          h('span', { class: 'entry__id', text: `${uncovered.length} not overridden` }),
          h('span', { class: 'dim', text: ` — ${uncovered.map((r) => r.label).join(', ')}` }),
        )
      : null,
  ]);

  const limits = h('ul', { class: 'list mono' });
  for (const item of NOT_COVERED) {
    append(limits, [
      h(
        'li',
        {},
        h('span', { class: 'entry__id', text: item.surface }),
        h('span', { class: 'dim', text: ` — ${item.why}` }),
      ),
    ]);
  }

  const status = h('p', { class: 'mono dim', text: '' });

  const recordWear = async () => {
    const result = await handlers.onWear(entry.id);
    status.textContent = result.counted
      ? `Worn by ${int(result.wearCount)}. That is ${bits(bitsDestroyedBy(result.wearCount))} bits of this identity's surprisal destroyed. Whether this was your first wear is asserted by your browser and not verified by the server, because verifying it would need the per-visitor identifier the pool refuses to keep.`
      : `This browser had already worn this entry, so the count is unchanged.`;
  };

  // One click: a real URL ending in .user.js, which is what a manager watches
  // for. A Blob download would make the visitor find the file and import it by
  // hand — three steps and a manual for something that should be a button.
  const installLink = h(
    'a',
    {
      class: 'button',
      href: scriptUrl(entry.id, options),
      rel: 'noopener',
      onclick: () => void recordWear(),
    },
    handlers.hasWorn(entry.id) ? 'Install again' : 'Wear this identity',
  );

  // Kept for anyone who would rather read the file before running it on every
  // site they visit, and for anyone whose manager prefers an import.
  const downloadButton = h('button', { type: 'button' }, 'Download the file instead');
  downloadButton.addEventListener('click', () => {
    const script = emitUserscript(entry, {
      siteUrl,
      canvasMode: options.canvasMode,
      audioMode: options.audioMode,
      hideOverrides: options.hideOverrides,
    });
    const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
    const link = h('a', { href: url, download: `wear-me-${entry.id.slice(0, 12)}.user.js` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    void recordWear();
  });

  const managers = h('p', { class: 'mono dim' });
  append(managers, [
    'A manager, if you have none: ',
    ...MANAGERS.flatMap((m, i) => [
      i > 0 ? ' · ' : '',
      h('a', { href: m.url, target: '_blank', rel: 'noopener noreferrer' }, m.name),
      h('span', { class: 'dimmer', text: ` (${m.note})` }),
    ]),
  ]);

  // ---- the zero-install demonstration -------------------------------------

  const tryButton = h('button', { type: 'button' }, 'Try it here, with nothing installed');
  const tryOutput = h('div');

  tryButton.addEventListener('click', async () => {
    tryButton.disabled = true;
    tryButton.textContent = 'Running the script in a blank frame…';
    try {
      const script = emitUserscript(entry, {
        siteUrl,
        canvasMode: options.canvasMode,
        audioMode: options.audioMode,
        hideOverrides: options.hideOverrides,
      });
      const result = await tryOn(entry, script, mayReadThisBrowser);

      const table = h('table', { class: 'table' });
      append(table, [
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { text: 'Surface' }),
            h('th', { text: result.comparedAgainstThisBrowser ? 'This browser' : 'Not read' }),
            h('th', { text: 'Wearing the entry' }),
          ),
        ),
      ]);
      const body = h('tbody');
      for (const row of result.readings) {
        const moved = row.before !== row.after;
        append(body, [
          h(
            'tr',
            {},
            h('td', { text: row.label }),
            h('td', { class: 'value', text: row.before }),
            h('td', { class: moved ? 'value entry__id' : 'value', text: row.after }),
          ),
        ]);
      }
      table.appendChild(body);

      clear(tryOutput);
      append(tryOutput, [
        h('p', {
          class: 'mono',
          text: [
            result.comparedAgainstThisBrowser
              ? `${result.changed} surfaces moved.`
              : 'Your own surfaces were not read, because you chose Look only. What the frame became is below.',
            result.missed.length === 0
              ? `All ${result.matched} surfaces this entry specifies now read exactly as the entry does.`
              : `${result.matched} match the entry exactly. Did not match: ${result.missed.join(', ')}.`,
          ].join(' '),
        }),
        h('div', { class: 'scroll-x' }, table),
        h('p', { class: 'caveat', text: TRY_ON_LIMIT }),
      ]);
      tryButton.textContent = 'Run it again';
      tryButton.disabled = false;
    } catch (error) {
      tryButton.disabled = false;
      tryButton.textContent = 'Try it here, with nothing installed';
      clear(tryOutput);
      append(tryOutput, [
        h('p', {
          class: 'notice',
          text: `The frame did not open: ${error instanceof Error ? error.message : String(error)}. This can happen inside an embed that blocks frames. The install path above is unaffected.`,
        }),
      ]);
    }
  });

  const modeToggle = (
    label: string,
    checked: boolean,
    note: string,
    onchange: (value: boolean) => void,
  ): HTMLElement => {
    const input = h('input', { type: 'checkbox', checked });
    input.addEventListener('change', () => onchange((input as HTMLInputElement).checked));
    return h('label', { class: 'toggle' }, input, h('span', {}, h('strong', { text: label }), ' — ', note));
  };

  const verify = h('p', { class: 'mono' });
  append(verify, [
    'Check it: ',
    ...VERIFY_LINKS.flatMap((link, i) => [
      i > 0 ? ' · ' : '',
      h('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer' }, link.name),
    ]),
  ]);

  append(mount, [
    sections.section(
      { id: 'entry', eyebrow: 'Entry', title: entry.id.slice(0, 24), solid: true },
      h('p', {
        class: 'mono dim',
        text: `Entered the pool ${entry.createdAt}. Worn ${int(entry.wearCount)}×. ${entry.wearCount > 1 ? `${bits(bitsDestroyedBy(entry.wearCount))} bits of its surprisal destroyed.` : 'No one has worn it yet.'}`,
      }),
      h('div', {}, h('button', { type: 'button', onclick: onClose }, 'Close this entry')),
      h('div', { class: 'scroll-x' }, attributes),
      h('hr', { class: 'rule' }),
      h('h4', { class: 'sub', text: 'What the script does' }),
      coverageList,
      h(
        'div',
        { class: 'stack' },
        modeToggle(
          'Converge the canvas',
          options.canvasMode === 'converge',
          'Replaces canvas readback with a value derived from this identity, so every wearer produces the same one. Off, the low bits are perturbed instead: canvas keeps working on pages that use it, and wearers no longer match each other.',
          (value) => onOptionsChange({ ...options, canvasMode: value ? 'converge' : 'perturb' }),
        ),
        modeToggle(
          'Converge the audio',
          options.audioMode === 'converge',
          'Same trade for the audio context.',
          (value) => onOptionsChange({ ...options, audioMode: value ? 'converge' : 'perturb' }),
        ),
        modeToggle(
          'Hide the overrides from toString',
          options.hideOverrides,
          'Makes the patched functions report as native. This is not free: a toString that lies is itself something detectors test for, by comparing against a known-native reference. You are trading one signal for another.',
          (value) => onOptionsChange({ ...options, hideOverrides: value }),
        ),
      ),
      h('hr', { class: 'rule' }),
      h('h4', { class: 'sub', text: 'Trying it before installing anything' }),
      h('p', { text: TRY_ON_NOTE }),
      h('div', {}, tryButton),
      tryOutput,
      h('hr', { class: 'rule' }),
      h('h4', { class: 'sub', text: 'Wearing it everywhere else' }),
      h('p', { text: WHY_AN_EXTENSION }),
      h('p', { text: INSTALL_NOTE }),
      managers,
      h('div', { class: 'choice-row' }, installLink, downloadButton),
      status,
      h('hr', { class: 'rule' }),
      h('h4', { class: 'sub', text: WEARING_LIMITS_HEAD }),
      h('p', { text: WEARING_LIMITS }),
      limits,
      h('p', { text: VERIFY_NOTE }),
      verify,
    ),
  ]);
}

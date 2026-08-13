/**
 * The catalogue (sector 09) and one entry in full (sector 10).
 *
 * Browse the pool, open an entry, take the script. Everything the emitted script
 * does and does not do is stated beside the button that produces it, because a
 * coverage claim nobody can check is the kind of claim this piece exists to
 * refuse.
 *
 * Each tile in the grid carries the offer as well as the hash: point at a stranger
 * and the tile inverts, their identifier goes out of focus, and what comes forward
 * is the invitation to put their face on. Inversion means wearing everywhere on
 * this site (styles/tokens.css), and this is the surface where wearing is offered.
 */

import { displayValue, groupsOf, ATTR_IDS } from '@wearme/core/attributes';
import { bitsDestroyedBy } from '@wearme/core/entropy';
import { coverage, emitUserscript, NOT_COVERED, type SurfaceMode } from '@wearme/core/userscript';
import type { Identity } from '@wearme/core/types';

import { copy } from '../copy.js';
import { scriptUrl } from '../pool.js';
import type { Board } from './board.js';
import { keyed, windowed, type KeyedRow } from './chart.js';
import { append, bits, clear, h, int } from './dom.js';
import { decoration } from './glyphs.js';
import { sigil } from './sigils.js';
import { tryOn } from './tryout.js';

/**
 * How many entries the grid shows before asking. Two hundred tiles at roughly a
 * hundred pixels each made the catalogue four and a half thousand pixels of the
 * page's ten — it buried the entry panel below it and dominated a scroll it was
 * only ever meant to end. The rest are one click away.
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
  board: Board,
  entries: readonly Identity[],
  selectedId: string | null,
  /** This browser's own donation, in the pool but not in the published catalogue. */
  pendingId: string | null,
  handlers: CatalogueHandlers,
  poolNote: string,
  expanded: boolean,
  onExpand: () => void,
  entryEl?: HTMLElement | null,
): HTMLElement {
  /*
   * The donor's own not-yet-published entry is pinned to the front.
   *
   * Everywhere else the pool is ordered by id, because an id is a hash and a hash
   * says nothing about when an entry arrived — any other order would leak
   * provenance through position. That constraint is about what the published
   * catalogue discloses to other people. This entry is shown to exactly one
   * browser, the one that donated it, and its provenance is the one fact that
   * visitor already knows. Left in id order it sorts to an arbitrary position,
   * which past the first page means the donor cannot find the thing they were just
   * told to look for.
   */
  const pendingEntry = pendingId === null ? undefined : entries.find((e) => e.id === pendingId);
  const ordered = pendingEntry
    ? [pendingEntry, ...entries.filter((e) => e.id !== pendingId)]
    : [...entries];

  const shown = expanded ? ordered : ordered.slice(0, CATALOGUE_PAGE);
  const grid = h('div', { class: 'catalogue' });
  for (const entry of shown) {
    // The donor's own entry, before the build publishes it. Marked in place of the
    // wear line rather than beside it: "nobody has worn this yet" is true of it but
    // beside the point, when the reason nobody has is that nobody else can see it.
    const pending = entry.id === pendingId;
    const worn = handlers.hasWorn(entry.id);
    append(grid, [
      h(
        'button',
        {
          class: pending ? 'entry entry--pending' : 'entry',
          type: 'button',
          'aria-current': entry.id === selectedId ? 'true' : 'false',
          onclick: () => handlers.onOpen(entry.id),
        },
        h('span', { class: 'entry__id', text: entry.id.slice(0, 16) }),
        h('span', {
          class: 'entry__line',
          text: `${entry.createdAt} · worn ${int(entry.wearCount)}×`,
        }),
        h('span', {
          class: pending ? 'entry__pending' : 'entry__line',
          text: pending
            ? copy.receipt.notYetPublished
            : entry.wearCount > 1
              ? `${bits(bitsDestroyedBy(entry.wearCount))} bits destroyed`
              : 'not yet shared',
        }),
        /*
         * The offer, in the flow and legible whether or not anybody is pointing at
         * it. On hover the whole tile inverts and this line comes up in red on ink,
         * so the invitation arrives without anything having to become unreadable to
         * make room for it — which is what the previous version did, fading this in
         * over a hash it had just blurred out.
         *
         * Hidden from assistive technology: the tile is already a button whose
         * accessible name is the entry, and this is what activating it leads to
         * rather than a second control.
         */
        h(
          'span',
          { class: 'entry__offer', 'aria-hidden': 'true' },
          decoration('worn'),
          h('span', { text: worn ? 'worn by you' : 'wear this face' }),
        ),
      ),
    ]);
  }

  const remaining = ordered.length - shown.length;
  const totalWears = entries.reduce((sum, e) => sum + e.wearCount, 0);

  return board.sector(
    'catalogue',
    {
      title: entries.length > 0 ? 'Every entry in the pool' : 'The pool is empty',
      lede:
        entries.length > 0
          ? 'Any of these can be installed as your own browser in one click.'
          : 'Nothing has been donated yet.',
      meta: `${int(entries.length)} entries · ${int(totalWears)} wears`,
    },
    entries.length > 0
      ? h('p', {
          text: 'Open any entry to read its attributes and take a script that presents it as yours.',
        })
      : h('p', {
          text: 'Nothing has been donated yet. Measure yourself and donate, and this becomes the first entry.',
        }),
    // §7a. Plain body text at normal size, in the same voice as everything else.
    h('p', { text: copy.cover.modelAddress }),
    h('p', { class: 'gloss', text: poolNote }),
    grid,
    remaining > 0
      ? h(
          'div',
          { class: 'stack' },
          h('p', {
            class: 'gloss',
            text: `Showing ${int(shown.length)} of ${int(entries.length)}.`,
          }),
          h(
            'div',
            {},
            h(
              'button',
              { type: 'button', onclick: onExpand },
              decoration('open', 'button__mark'),
              `Show the remaining ${int(remaining)}`,
            ),
          ),
        )
      : null,
    entryEl ? h('hr', { class: 'rule rule--double' }) : null,
    entryEl ?? null,
  );
}

export function renderEntryCard(
  board: Board,
  entry: Identity,
  /** This entry is this browser's own donation and is not published yet. */
  isPending: boolean,
  options: WearOptions,
  handlers: CatalogueHandlers,
  onOptionsChange: (next: WearOptions) => void,
  siteUrl: string,
  /**
   * Whether this browser has consented to being measured. Under "Look only" it has
   * not, so the demonstration below shows what the frame became without reading
   * what it was.
   */
  mayReadThisBrowser: boolean,
  onClose: () => void,
): HTMLElement {
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
          h('td', {
            class: 'value',
            text: value.length > 300 ? `${value.slice(0, 300)}…` : value,
          }),
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

  const coverageRows: KeyedRow[] = [
    {
      key: 'presented exactly',
      mark: 'true',
      value: `${int(exact.length)} — ${exact.map((r) => r.label).join(', ')}`,
    },
  ];
  if (converged.length > 0) {
    coverageRows.push({
      key: 'shared value',
      mark: 'same',
      value: `${int(converged.length)} — ${converged[0].note}`,
      register: 'inferred',
    });
  }
  if (uncovered.length > 0) {
    // Red: an attribute the script cannot override is an attribute that keeps
    // telling the truth about you while the rest lies, which is exposure.
    coverageRows.push({
      key: 'not overridden',
      mark: 'false',
      value: `${int(uncovered.length)} — ${uncovered.map((r) => r.label).join(', ')}`,
      register: 'exposed',
    });
  }
  const coverageReadout = keyed(coverageRows);

  const limits = h('ul', { class: 'list' });
  for (const item of NOT_COVERED) {
    append(limits, [
      h(
        'li',
        {},
        decoration('caution', 'dimmer'),
        ' ',
        h('span', { class: 'exposed', text: item.surface }),
        h('span', { class: 'dim', text: ` — ${item.why}` }),
      ),
    ]);
  }

  const status = h('p', { class: 'gloss', text: '' });

  const recordWear = async () => {
    const result = await handlers.onWear(entry.id);
    status.textContent = result.counted
      ? `Worn by ${int(result.wearCount)}. That is ${bits(bitsDestroyedBy(result.wearCount))} bits of this identity's surprisal destroyed. Whether this was your first wear is asserted by your browser and not verified by the server, because verifying it would need the per-visitor identifier the pool refuses to keep.`
      : `This browser had already worn this entry, so the count is unchanged.`;
  };

  // One click: a real URL ending in .user.js, which is what a manager watches for.
  // A Blob download would make the visitor find the file and import it by hand —
  // three steps and a manual for something that should be a button.
  const installLink = h(
    'a',
    {
      class: 'button button--rite',
      href: scriptUrl(entry.id, options),
      rel: 'noopener',
      onclick: () => void recordWear(),
    },
    sigil('alembic', { px: 22, className: 'button__sigil' }),
    handlers.hasWorn(entry.id) ? 'Take it again' : 'Take this face',
  );

  // Kept for anyone who would rather read the file before running it on every site
  // they visit, and for anyone whose manager prefers an import.
  const downloadButton = h(
    'button',
    { type: 'button' },
    decoration('down', 'button__mark'),
    'Download the file instead',
  );
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

  const managers = h('p', { class: 'gloss' });
  append(managers, [
    'A manager, if you have none: ',
    ...copy.catalogue.managers.flatMap((m, i) => [
      i > 0 ? ' · ' : '',
      h('a', { href: m.url, target: '_blank', rel: 'noopener noreferrer' }, m.name),
      h('span', { class: 'dimmer', text: ` (${m.note})` }),
    ]),
  ]);

  // ---- the zero-install demonstration ---------------------------------------

  const tryButton = h(
    'button',
    { type: 'button' },
    decoration('open', 'button__mark'),
    'Try it here, with nothing installed',
  );
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
      const tbody = h('tbody');
      for (const row of result.readings) {
        const moved = row.before !== row.after;
        append(tbody, [
          h(
            'tr',
            {},
            h('td', { text: row.label }),
            h('td', { class: 'value', text: row.before }),
            // Turquoise where the surface moved: the value in that cell was
            // synthesised by the script rather than read off anything.
            h('td', { class: moved ? 'value inferred' : 'value', text: row.after }),
          ),
        ]);
      }
      table.appendChild(tbody);

      clear(tryOutput);
      append(tryOutput, [
        h('p', {
          class: 'gloss',
          text: [
            result.comparedAgainstThisBrowser
              ? `${result.changed} surfaces moved.`
              : 'Your own surfaces were not read, because you chose Look only. What the frame became is below.',
            result.missed.length === 0
              ? `All ${result.matched} surfaces this entry specifies now read exactly as the entry does.`
              : `${result.matched} match the entry exactly. Did not match: ${result.missed.join(', ')}.`,
          ].join(' '),
        }),
        windowed(
          {
            caption: 'The frame, before and after',
            count: `${int(result.readings.length)} surfaces`,
            flush: true,
          },
          table,
        ),
        h('p', { class: 'caveat', text: copy.catalogue.tryOnLimit }),
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

  const verify = h('p', { class: 'gloss' });
  append(verify, [
    'Check it: ',
    ...copy.catalogue.verifyLinks.flatMap((link, i) => [
      i > 0 ? ' · ' : '',
      h('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer' }, link.name),
    ]),
  ]);

  return h(
    'div',
    { class: 'entry-detail-card stack', id: 'entry-detail' },
    h('h4', { class: 'sub', text: `Face details: ${entry.id.slice(0, 24)}` }),
    h('p', { class: 'gloss', text: `Worn ${int(entry.wearCount)}× · ${bits(bitsDestroyedBy(entry.wearCount))} bits destroyed. One face, in full, and the script that hands it to your browser.` }),
    isPending ? h('p', { class: 'notice', text: copy.receipt.notYetPublishedNote }) : null,
    keyed([
      { key: 'entered the pool', mark: 'set', value: entry.createdAt },
      { key: 'worn', mark: 'worn', value: `${int(entry.wearCount)}×`, register: 'exposed' },
      {
        key: 'surprisal destroyed',
        mark: 'model',
        value:
          entry.wearCount > 1
            ? `${bits(bitsDestroyedBy(entry.wearCount))} bits`
            : 'none — no one has worn it yet',
        register: 'inferred',
      },
    ]),
    h(
      'div',
      {},
      h('button', { type: 'button', onclick: onClose }, decoration('shut', 'button__mark'), 'Close this entry'),
    ),
    windowed(
      { caption: 'Every attribute this entry carries', count: `${int(ATTR_IDS.length)} rows`, flush: true },
      attributes,
    ),

    h('hr', { class: 'rule rule--double' }),
    h('h4', { class: 'sub', text: 'What the script does' }),
    coverageReadout,
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
    h('p', { text: copy.catalogue.tryOnNote }),
    h('div', {}, tryButton),
    tryOutput,

    h('hr', { class: 'rule rule--double' }),
    /*
     * Taking a face is the second of the two acts on this page that are not readings,
     * and it used to be a button at the end of four paragraphs about userscript
     * managers. It gets the plate: a seal, a title, the consequence on its own line,
     * and the control alone at the foot.
     *
     * The download is kept beside it rather than under it, because reading the file
     * before running it on every site you visit is a reasonable thing to want and
     * should not be the harder path.
     */
    board.rite(
      {
        kind: 'taken',
        kicker: copy.receipt.riteTake.kicker,
        title: copy.receipt.riteTake.title,
        seal: 'dagger',
        consequence: copy.receipt.riteTake.consequence,
        action: h('div', { class: 'choice-row' }, installLink, downloadButton),
      },
      h('p', { text: copy.catalogue.whyAnExtension }),
      h('p', { text: copy.catalogue.installNote }),
      managers,
    ),
    status,

    h('hr', { class: 'rule' }),
    h('h4', { class: 'sub', text: copy.measurement.wearingLimitsHead }),
    h('p', { text: copy.measurement.wearingLimits }),
    limits,
    h('p', { text: copy.catalogue.verifyNote }),
    verify,
  );
}

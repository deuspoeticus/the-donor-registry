/**
 * The board: one shape for every sector, and a record of which ones got built.
 *
 * This replaces the old section counter, which handed out `01`, `02`, … in the
 * order sections happened to be appended. That made an address a fact about the
 * render rather than about the page: the catalogue was `04` for a visitor who
 * chose "Look only" and `08` for one who was measured. Addresses now come from
 * the manifest in `sectors.ts` and never move; a sector the visit does not
 * contain leaves a gap in the sequence, and the status strip states the fraction
 * so the gap is a reading rather than a mystery.
 *
 * The board also remembers what it built, so the running head is assembled from
 * the same pass that produced the page. There is no second list of sections to
 * fall out of step with the first.
 */

import { h } from './dom.js';
import { FOOT, sector as lookup, type Sector, type SectorId } from './sectors.js';
import { sigil, type SigilKey } from './sigils.js';

type Child = Node | string | null | false;

export interface SectorOptions {
  /** The display headline, in the bitmap face, under the rule. */
  title?: string;
  /** One sentence saying what the sector is for. Sits under the title. */
  lede?: string;
  /** A single reading, right-aligned in the head. The number worth stating first. */
  meta?: string;
  /**
   * Fill the viewport.
   *
   * Sector 00 only, and it is the one place the ledger's even rhythm is broken on
   * purpose: a cover needs the whole frame or it is just a tall section. The height is
   * `100svh` minus the fixed head, so the fold lands exactly at the bottom of what is
   * visible rather than a head-height past it.
   */
  cover?: boolean;
}

export interface Board {
  /** An addressed sector. Registers itself for the running head. */
  sector(id: SectorId, options: SectorOptions, ...children: Child[]): HTMLElement;
  /**
   * An unaddressed, interruptive statement about right now — that this browser is
   * wearing a borrowed signature, or that a request failed. It comes before the
   * figures it affects rather than after them, and it is deliberately outside the
   * addressing scheme: it is not a chapter of the argument, it is a condition the
   * argument is currently running under.
   */
  bulletin(register: 'exposed' | 'inferred', ...children: Child[]): HTMLElement;
  /** The foot: the legend and the credits. No address, and not counted. */
  foot(...children: Child[]): HTMLElement;
  /**
   * A rite: one of the two acts on this page that are not readings.
   *
   * A signature is **given**, and a face is **taken**. Neither can be undone by
   * looking at it again, and until this existed both were a button at the end of a
   * paragraph, indistinguishable from the hundred readings around them.
   *
   * A rite is the only boxed element on the board, and that is the point — it is
   * lifted out of the ruled sheet the way a deed is lifted out of a ledger. Heavy
   * frame, a seal, a title in the bitmap serif, the consequence stated on its own line
   * in red, and the action alone at the foot with nothing competing for the click.
   *
   * What it must never be is *friction*. Ceremony here is a matter of weight, not of
   * steps: no rite adds a click that was not already required, and where two choices
   * are offered they stay identical in size, position and styling (§6f). Making the
   * irreversible thing easy to *find* is the opposite of making it easy to do by
   * accident.
   */
  rite(spec: RiteSpec, ...children: Child[]): HTMLElement;
  /** What this pass built, in address order. Feeds the running head. */
  built(): Sector[];
}

export interface RiteSpec {
  /**
   * `given` — something of the visitor's leaves this browser.
   * `taken` — something of somebody else's is brought into it.
   *
   * The two are not symmetrical and are not drawn as if they were: giving is framed
   * in red because it is the visitor's own exposure, taking is framed in ink because
   * it is a transaction with the pool.
   */
  kind: 'given' | 'taken';
  /** The register above the title: what class of act this is. */
  kicker: string;
  title: string;
  /** The seal. One of the sigils; see ui/sigils.ts. */
  seal: SigilKey;
  /**
   * The one line somebody who reads nothing else will read. States the consequence,
   * not the benefit.
   */
  consequence: string;
  /** The control. Alone at the foot of the plate. */
  action: Node;
}

export function createBoard(): Board {
  const built: Sector[] = [];

  const head = (
    address: string | null,
    sigilKey: SigilKey,
    name: string,
    meta?: string,
  ): HTMLElement =>
    h(
      'div',
      { class: 'sector__head' },
      h('span', { class: 'sector__address', text: address ?? '——' }),
      sigil(sigilKey, { px: 20, className: 'sector__sigil' }),
      // The name is the sector's heading in the document outline. The display
      // headline below it is an h3, which is why this is an h2 and not the other
      // way round: the address and the name are what the page is structured by.
      h('h2', { class: 'sector__name', text: name }),
      meta ? h('span', { class: 'sector__meta', text: meta }) : null,
    );

  const body = (options: SectorOptions, children: Child[]): HTMLElement =>
    h(
      'div',
      { class: 'sector__body stack' },
      options.title ? h('h3', { class: 'sector__title', text: options.title }) : null,
      options.lede ? h('p', { class: 'sector__lede', text: options.lede }) : null,
      ...children,
    );

  return {
    sector(id, options, ...children) {
      const spec = lookup(id);
      built.push(spec);
      return h(
        'section',
        {
          class: options.cover ? 'sector sector--cover' : 'sector',
          id: spec.id,
          'aria-labelledby': `${spec.id}-name`,
        },
        h(
          'div',
          { class: 'sector__inner' },
          tagName(head(spec.address, spec.sigil, spec.name, options.meta), spec.id),
          body(options, children),
        ),
      );
    },

    bulletin(register, ...children) {
      return h(
        'aside',
        { class: register === 'inferred' ? 'bulletin bulletin--inferred' : 'bulletin' },
        h('div', { class: 'bulletin__inner stack' }, ...children),
      );
    },

    rite(spec, ...children) {
      return h(
        'div',
        { class: `rite rite--${spec.kind}` },
        h(
          'div',
          { class: 'rite__head' },
          sigil(spec.seal, { px: 32, className: 'rite__seal' }),
          h('span', { class: 'rite__kicker', text: spec.kicker }),
        ),
        h('strong', { class: 'rite__title', text: spec.title }),
        h('div', { class: 'rite__body stack' }, ...children),
        h(
          'p',
          { class: 'rite__consequence' },
          sigil('hand', { px: 20, className: 'rite__point' }),
          h('span', { text: spec.consequence }),
        ),
        h('div', { class: 'rite__action' }, spec.action),
      );
    },

    foot(...children) {
      return h(
        'section',
        { class: 'sector', id: FOOT.id },
        h(
          'div',
          { class: 'sector__inner' },
          head(null, FOOT.sigil, FOOT.name),
          h('div', { class: 'sector__body stack' }, ...children),
        ),
      );
    },

    built: () => built,
  };
}

/** Gives the sector's name element the id its section points `aria-labelledby` at. */
function tagName(headEl: HTMLElement, sectorId: string): HTMLElement {
  const name = headEl.querySelector('.sector__name');
  if (name) name.id = `${sectorId}-name`;
  return headEl;
}

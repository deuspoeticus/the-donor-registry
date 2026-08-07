/**
 * The editorial scaffolding (§6e, deck pages 2–5).
 *
 * The deck sets every section behind a numbered eyebrow and a hairline rule —
 * `01 THE CONDITION`, `06 ACQUISITION` — and a running foot naming the chapter.
 * The live site had an unnumbered small-caps label and no rule, so seven
 * sections of a ten-thousand-pixel scroll announced themselves at identical
 * weight and nothing told you where you were.
 *
 * Numbering is assigned at render time from the order sections are appended,
 * not hardcoded, because which sections exist depends on the consent tier:
 * under "Look only" there is no measurement and no inference, and a fixed `03`
 * above the model would be a lie about a page that has no 01 or 02.
 *
 * The accent stays monochrome. The deck sets its numerals in red; that stops at
 * the deck, because this site's own rule is that colour means identifying
 * information and nothing else, and a red numeral would be the first exception.
 */

import { h } from './dom.js';

export interface SectionSpec {
  /** Anchor target. Also the nav's link target, so every section needs one. */
  id: string;
  /** The deck's chapter name. Set in mono, uppercase, beside the numeral. */
  eyebrow: string;
  /** Display headline, when the section has one. Set large, below the rule. */
  title?: string;
  /** Solid ground rather than the blurred panel, for sections over the field. */
  solid?: boolean;
}

/**
 * Hands out `01`, `02`, … in render order and remembers what it numbered, so
 * the nav can be built from the same pass rather than from a second hardcoded
 * list that would drift out of sync with the page.
 */
export interface SectionCounter {
  section(spec: SectionSpec, ...children: (Node | string | null | false)[]): HTMLElement;
  /** Unnumbered. For the colophon, which is a foot rather than a chapter. */
  plain(spec: SectionSpec, ...children: (Node | string | null | false)[]): HTMLElement;
  /** What was numbered, in order. Feeds the nav. */
  entries(): { id: string; number: string; eyebrow: string }[];
}

export function createSectionCounter(): SectionCounter {
  let n = 0;
  const entries: { id: string; number: string; eyebrow: string }[] = [];

  const build = (
    spec: SectionSpec,
    number: string | null,
    children: (Node | string | null | false)[],
  ): HTMLElement => {
    const head = h(
      'div',
      { class: 'sec__head' },
      number ? h('span', { class: 'sec__num', text: number }) : null,
      h('h2', { class: 'sec__eyebrow', text: spec.eyebrow }),
    );

    return h(
      'section',
      { class: spec.solid ? 'panel panel--solid' : 'panel', id: spec.id },
      h(
        'div',
        { class: 'panel__inner' },
        head,
        h(
          'div',
          { class: 'sec__body stack' },
          spec.title ? h('h3', { class: 'sec__title', text: spec.title }) : null,
          ...children,
        ),
      ),
    );
  };

  return {
    section(spec, ...children) {
      n += 1;
      const number = String(n).padStart(2, '0');
      entries.push({ id: spec.id, number, eyebrow: spec.eyebrow });
      return build(spec, number, children);
    },
    plain(spec, ...children) {
      return build(spec, null, children);
    },
    entries: () => entries,
  };
}

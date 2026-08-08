/**
 * The marks.
 *
 * Nineteen characters and a set of ordinals. There were seventy-one, and the cull is the
 * point of this file rather than an incident in its history: a notation with an open
 * vocabulary is not a notation, and one with seventy-one terms is a font you happen to
 * have licensed.
 *
 * What survived had to pass two tests. It has to be **used** — every mark below appears
 * somewhere in the interface, and nothing here is kept in case it comes in handy. And it
 * has to be **the right character**, not merely an evocative one: `⊗` is on this page
 * because mutual information is a product over a joint distribution, `⊥` because
 * independence is written `⊥`, `≡` because a converged surface is identical rather than
 * approximately equal. Marks that were doing atmosphere — a lozenge for "an entry", a
 * fleuron beside the running head, planetary signs for gold and silver — are gone. They
 * were decoration wearing a notation's clothes.
 *
 * ---------------------------------------------------------------- the division
 *
 * Marks name **operations and relations**. Sigils (ui/sigils.ts) name **things**. A sum
 * is not a picture and a pool is not an operator; if it has a plural it is a sigil, and
 * if it takes arguments it is a mark. Marks also go where sigils physically cannot — the
 * keyed readouts and the table cells run at ten pixels, and a sixteen-pixel sprite in
 * them is a smudge pretending to be information.
 *
 * The set is closed twice over, semantically and physically:
 * `data/../src/fonts/symbols2-ui.woff2` is subsetted to exactly these characters. Adding
 * one here without re-running `scripts/fetch-fonts.mjs` falls back to whatever the
 * visitor's system has, which on this site is itself a fingerprintable event. The script
 * reads its glyph list out of this file, so the two cannot drift as long as it is re-run.
 *
 * The legend is published (§ colophon). A notation the reader cannot look up is a private
 * language, and this piece has no business having one.
 */

import { h } from './dom.js';

const MARKS = [
  // ---- the measure --------------------------------------------------------
  { key: 'sum', glyph: '∑', means: 'the naive sum of surprisals, which double-counts' },
  { key: 'model', glyph: '⊗', means: 'mutual information — what the sum counts twice' },
  { key: 'forge', glyph: '⊕', means: 'synthesis — an identity assembled rather than read' },
  { key: 'independent', glyph: '⊥', means: 'the independence assumption' },
  { key: 'about', glyph: '≈', means: 'approximately' },
  { key: 'same', glyph: '≡', means: 'identical to — not merely close' },

  // ---- what was read, and what was not ------------------------------------
  { key: 'measured', glyph: '◉', means: 'read from this browser' },
  { key: 'withheld', glyph: '⊘', means: 'deliberately not collected, or held out of the model' },
  { key: 'sent', glyph: '▲', means: 'transmitted, and undone only with the token' },
  { key: 'worn', glyph: '◐', means: 'a face borrowed from somebody else' },
  { key: 'set', glyph: '▣', means: 'a bounded set — the pool, a group, a paradigm' },
  { key: 'reading', glyph: '⌖', means: 'the current reading' },

  // ---- truth values -------------------------------------------------------
  { key: 'true', glyph: '✓', means: 'holds' },
  { key: 'false', glyph: '✕', means: 'does not hold' },
  { key: 'caution', glyph: '⚠', means: 'a limit of the claim — not a warning about danger' },

  // ---- affordances --------------------------------------------------------
  { key: 'open', glyph: '▸', means: 'opens something in place' },
  { key: 'shut', glyph: '▾', means: 'closes it again' },
  { key: 'away', glyph: '↗', means: 'leaves this origin' },
  { key: 'down', glyph: '↓', means: 'downloads a file' },
] as const;

export type MarkKey = (typeof MARKS)[number]['key'];

export interface Mark {
  key: MarkKey;
  glyph: string;
  means: string;
}

/** The published legend, in declaration order. */
export const LEGEND: readonly Mark[] = MARKS;

/** `GLYPH.measured` rather than `'◉'`, everywhere, so the notation is greppable. */
export const GLYPH = Object.fromEntries(MARKS.map((m) => [m.key, m.glyph])) as Record<
  MarkKey,
  string
>;

/**
 * Circled ordinals, for enumerations that are steps rather than addresses.
 *
 * Sector addresses are set in the monospace with tabular figures, because an address is a
 * coordinate and has to align in a column. These are for the loop, where the numbers are
 * an order and not a location.
 */
export const ORDINALS = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'] as const;

export function ordinal(n: number): string {
  return ORDINALS[n] ?? String(n);
}

/**
 * A mark, rendered.
 *
 * Always through this function, never as a bare character in a template, for two reasons.
 * The face has to be applied — a mark set in the body font is a different glyph or none
 * at all — and the meaning has to reach a screen reader, which cannot make anything of
 * `◉` but can read "read from this browser".
 */
export function mark(key: MarkKey, className = ''): HTMLElement {
  const m = MARKS.find((entry) => entry.key === key) as Mark;
  return h('span', {
    class: className ? `mark ${className}` : 'mark',
    role: 'img',
    'aria-label': m.means,
    text: m.glyph,
  });
}

/** The same mark with no accessible name, for when the text beside it already says it. */
export function decoration(key: MarkKey, className = ''): HTMLElement {
  return h('span', {
    class: className ? `mark ${className}` : 'mark',
    'aria-hidden': 'true',
    text: GLYPH[key],
  });
}

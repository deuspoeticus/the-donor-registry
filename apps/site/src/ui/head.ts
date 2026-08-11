/**
 * The head of the instrument: a running head, and a strip of readouts under it.
 *
 * It lives outside `#app`, because `render()` clears and rebuilds that element on
 * every state change and a head rebuilt underneath the visitor would lose focus
 * and scroll position mid-interaction. `sync()` is how it learns what the current
 * render actually contains, and `report()` is how it learns what is currently
 * true.
 *
 * Two rows, because they answer different questions. The top row is where you can
 * go; the bottom row is where you are and what the instrument is doing. The bottom
 * row also carries the one switch on the page, on the principle that on a page
 * like this the state of the instrument and the settings of the instrument are the
 * same kind of information — and because a visitor who cannot read the page cannot
 * read the argument either.
 */

import { copy } from '../copy.js';
import { clear, h, int } from './dom.js';
import { SECTOR_COUNT, type Sector } from './sectors.js';
import { sigil, type SigilKey } from './sigils.js';

/** Everything the strip states, gathered in one shape so it cannot half-update. */
export interface Report {
  /** The chosen tier, or null before one is chosen. */
  consent: 'look' | 'measure' | 'donate' | null;
  poolSize: number;
  /** `published` or `launch`, and the date the catalogue last changed. */
  poolSource: string;
  /** Donating, wearing and withdrawing are possible. */
  writes: boolean;
  /** This browser's own reading, already formatted, or null if there is none. */
  self: string | null;
  /**
   * A reading was taken and then dropped, because the visitor moved back to "Look
   * only". Distinguished from `self: null` on purpose: "not measured" is a claim
   * about the past, and once the surfaces have been read it is the wrong one.
   */
  discarded: boolean;
  /** The dominant attribute's corruption channel, or null if unmeasured. */
  channel: string | null;
  /** How many of the manifest's addresses this visit realised. */
  sectors: number;
}

export interface Head {
  el: HTMLElement;
  /** Rebuild the links for what the current render produced. */
  sync(sectors: readonly Sector[]): void;
  /** Restate the readouts. Called from the same place the page is rendered. */
  report(report: Report): void;
}

export interface HeadOptions {
  onHome: () => void;
  onJump: (id: string) => void;
  /** Whether the post-processing layer is currently drawing. */
  signal: () => boolean;
  onToggleSignal: () => void;
}

const CONSENT_LABEL: Record<NonNullable<Report['consent']>, string> = {
  look: 'look only',
  measure: 'measured',
  donate: 'donated',
};

export function createHead(options: HeadOptions): Head {
  const links = h('div', { class: 'nav__links' });
  const strip = h('div', { class: 'status__inner' });
  let spied: string[] = [];
  let listening = false;

  /*
   * The name, in the two registers it is always set in: the institution in the bitmap
   * serif, the instruction beside it in the grotesque, in red. One object, two voices,
   * which is the typographic argument of the whole page in two centimetres.
   */
  const brand = h(
    'button',
    {
      class: 'nav__mark',
      type: 'button',
      title: `${copy.site.fullTitle} — back to the top`,
      onclick: () => options.onHome(),
    },
    sigil('vessel', { px: 22, className: 'brand__sigil' }),
    h('span', { class: 'nav__title', text: copy.site.registry }),
    h('span', { class: 'nav__slogan', text: copy.site.slogan }),
  );

  const el = h(
    'header',
    { class: 'head', role: 'banner' },
    h(
      'div',
      { class: 'nav' },
      h(
        'div',
        { class: 'nav__inner' },
        brand,
        h('nav', { class: 'nav__wrap', 'aria-label': 'Sectors' }, links),
      ),
    ),
    h('div', { class: 'status', 'aria-label': 'Instrument state' }, strip),
  );

  /**
   * Marks the sector the visitor is actually reading.
   *
   * Resolved by measurement rather than by whichever IntersectionObserver record
   * happened to fire last: the current sector is the last one whose top has passed
   * the reading line just below the head. That guarantees exactly one link is
   * marked — a band-based test marks none at the top and bottom of the page, and
   * marks two wherever a short sector straddles the band — and it settles the
   * bottom of the document, where the final sector can never reach the line on its
   * own.
   */
  function spy(): void {
    if (spied.length === 0) return;

    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;

    let current = spied[0];
    for (const id of spied) {
      const node = document.getElementById(id);
      if (!node) continue;
      // The line is the sector's own scroll-margin — exactly where an anchor jump
      // parks it. Testing against the head's height instead would leave the spy
      // one sector behind every jump the nav itself performs.
      const line = parseFloat(getComputedStyle(node).scrollMarginTop) || 0;
      if (node.getBoundingClientRect().top <= line + 4) current = id;
    }
    if (atBottom) current = spied[spied.length - 1];

    for (const link of links.querySelectorAll<HTMLElement>('.nav__link')) {
      const isCurrent = link.dataset.for === current;
      link.classList.toggle('is-current', isCurrent);
      if (isCurrent) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  }

  function sync(sectors: readonly Sector[]): void {
    clear(links);

    for (const spec of sectors) {
      links.appendChild(
        h(
          'a',
          {
            class: 'nav__link',
            href: `#${spec.id}`,
            title: spec.gist,
            'data-for': spec.id,
            onclick: (event: Event) => {
              // Handled here rather than left to the browser so the jump respects
              // prefers-reduced-motion, and so the hash does not enter history —
              // the back button should leave the piece, not step backwards through
              // anchors the visitor never chose to push.
              event.preventDefault();
              options.onJump(spec.id);
            },
          },
          h('span', { class: 'nav__num', text: spec.address }),
          sigil(spec.sigil, { px: 20, className: 'nav__sigil' }),
          h('span', { class: 'nav__name', text: spec.name }),
        ),
      );
    }

    spied = sectors.map((s) => s.id);

    // One listener for the life of the page rather than one per render, so
    // repeated renders cannot stack duplicates on the window.
    if (!listening) {
      window.addEventListener('scroll', spy, { passive: true });
      window.addEventListener('resize', spy, { passive: true });
      listening = true;
    }
    spy();
  }

  function report(state: Report): void {
    clear(strip);

    const cell = (
      sigilKey: SigilKey,
      key: string,
      value: string,
      tone: '' | 'exposed' | 'inferred' | 'idle' = '',
      drop = false,
    ): HTMLElement =>
      h(
        'div',
        { class: drop ? 'cell cell--drop' : 'cell' },
        sigil(sigilKey, { px: 18, className: 'cell__sigil' }),
        h('span', { class: 'cell__key', text: key }),
        h('span', {
          class: tone ? `cell__value cell__value--${tone}` : 'cell__value',
          text: value,
        }),
      );

    strip.appendChild(
      cell(
        'key',
        'consent',
        state.consent ? CONSENT_LABEL[state.consent] : 'not given',
        state.consent === 'donate' ? 'exposed' : state.consent ? '' : 'idle',
      ),
    );

    strip.appendChild(cell('vessel', 'pool', `${int(state.poolSize)} · ${state.poolSource}`));

    strip.appendChild(
      cell(
        'candle',
        'writes',
        state.writes ? 'online' : 'offline',
        state.writes ? '' : 'idle',
        true,
      ),
    );

    strip.appendChild(
      cell(
        'blood',
        'self',
        state.self ?? (state.discarded ? 'discarded' : 'not measured'),
        state.self ? 'exposed' : 'idle',
      ),
    );

    strip.appendChild(
      cell(
        'fire',
        'channel',
        state.channel ?? 'idle',
        state.channel ? 'inferred' : 'idle',
        true,
      ),
    );

    strip.appendChild(
      cell('phial', 'sectors', `${String(state.sectors).padStart(2, '0')}/${SECTOR_COUNT}`, '', true),
    );

    const on = options.signal();
    const button = h(
      'button',
      {
        class: 'cell__switch',
        type: 'button',
        'aria-pressed': on ? 'true' : 'false',
        title: on
          ? 'Stop drawing the post-processing layer. The measurement is unchanged; only its rendering stops.'
          : 'Draw the post-processing layer again.',
        onclick: () => options.onToggleSignal(),
      },
      h('span', { class: 'cell__lamp', 'aria-hidden': 'true' }),
      h('span', { text: on ? 'signal' : 'clean' }),
    );

    strip.appendChild(
      h(
        'div',
        { class: 'cell cell--switch' },
        sigil('eye', { px: 18, className: 'cell__sigil' }),
        button,
      ),
    );
  }

  return { el, sync, report };
}

/**
 * What the strip calls each corruption channel.
 *
 * Set in the monospace face like every other reading in the strip, so no mark is
 * spliced into the string — a symbol-face glyph in a monospace run would fall back
 * to whatever the system has and break the column.
 */
export const CHANNEL_NAME: Record<string, string> = {
  canvas: 'canvas',
  webgl: 'webgl',
  audio: 'audio',
  fonts: 'fonts',
  timezone: 'timezone',
  none: 'no character',
};

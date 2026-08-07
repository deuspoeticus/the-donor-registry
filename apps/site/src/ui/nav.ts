/**
 * The running head.
 *
 * The page is one continuous scroll of ten thousand pixels and had no
 * navigation at all: no way to jump, no way back, and — once an entry was open
 * below a catalogue of two hundred — no way to return to the top without
 * dragging through all of it. This is the fix, and it is the smallest thing
 * that fixes it rather than a chrome bar the piece does not want.
 *
 * It lives outside `#app`, because `render()` clears and rebuilds that element
 * on every state change and a nav rebuilt underneath the visitor would lose
 * focus and scroll position mid-interaction. `sync()` is how it learns what the
 * current render actually contains.
 *
 * Sections are highlighted by value, never by hue — the site's rule is that
 * colour means identifying information, and a nav that lit up in red would be
 * the first place it stopped being true.
 */

import { h, clear } from './dom.js';

export interface NavItem {
  id: string;
  number: string;
  eyebrow: string;
}

export interface Nav {
  el: HTMLElement;
  /** Rebuild the links for what the current render produced. */
  sync(items: NavItem[]): void;
  /** Hidden behind the gate and the payload preview, which are full-screen. */
  setVisible(visible: boolean): void;
}

export function createNav(options: {
  onHome: () => void;
  reducedMotion: boolean;
}): Nav {
  const links = h('div', { class: 'nav__links' });
  let spied: string[] = [];
  let listening = false;

  const mark = h(
    'button',
    {
      class: 'nav__mark',
      type: 'button',
      title: 'Back to the top, and show the whole field',
      onclick: () => {
        options.onHome();
        window.scrollTo({ top: 0, behavior: options.reducedMotion ? 'auto' : 'smooth' });
      },
    },
    'Wear me',
  );

  const el = h(
    'header',
    { class: 'nav', role: 'banner' },
    h('div', { class: 'nav__inner' }, mark, h('nav', { class: 'nav__wrap', 'aria-label': 'Sections' }, links)),
  );

  /**
   * Marks the section the visitor is actually reading.
   *
   * Resolved by measurement rather than by whichever IntersectionObserver
   * record happened to fire last: the current section is the last one whose top
   * has passed the reading line just below the bar. That guarantees exactly one
   * link is marked — a band-based test marks none at the top and bottom of the
   * page, and marks two wherever a short section straddles the band — and it
   * settles the bottom of the document, where the final section can never reach
   * the line on its own.
   */
  function spy(): void {
    if (spied.length === 0) return;

    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;

    let current = spied[0];
    for (const id of spied) {
      const el = document.getElementById(id);
      if (!el) continue;
      // The line is the section's own scroll-margin — exactly where an anchor
      // jump parks it. Testing against the bar's height instead would leave the
      // spy one section behind every jump the nav itself performs.
      const line = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      if (el.getBoundingClientRect().top <= line + 4) current = id;
    }
    if (atBottom) current = spied[spied.length - 1];

    for (const link of links.querySelectorAll<HTMLElement>('.nav__link')) {
      link.classList.toggle('is-current', link.dataset.for === current);
    }
  }

  function sync(items: NavItem[]): void {
    clear(links);

    for (const item of items) {
      links.appendChild(
        h(
          'a',
          {
            class: 'nav__link',
            href: `#${item.id}`,
            'data-for': item.id,
            onclick: (event: Event) => {
              // Handled here rather than left to the browser so that the jump
              // respects prefers-reduced-motion, and so the hash does not enter
              // history — the back button should leave the piece, not step
              // backwards through anchors the visitor never chose to push.
              event.preventDefault();
              document.getElementById(item.id)?.scrollIntoView({
                behavior: options.reducedMotion ? 'auto' : 'smooth',
                block: 'start',
              });
            },
          },
          h('span', { class: 'nav__num', text: item.number }),
          h('span', { class: 'nav__name', text: item.eyebrow }),
        ),
      );
    }

    spied = items.map((item) => item.id);

    // One listener for the life of the page rather than one per render, so
    // repeated renders cannot stack duplicates on the window.
    if (!listening) {
      window.addEventListener('scroll', spy, { passive: true });
      window.addEventListener('resize', spy, { passive: true });
      listening = true;
    }
    spy();
  }

  function setVisible(visible: boolean): void {
    el.hidden = !visible;
    document.body.classList.toggle('has-nav', visible);
  }

  setVisible(false);
  return { el, sync, setVisible };
}

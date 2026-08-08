/**
 * The post-processing layer, driven (§6b).
 *
 * The corruption used to be a shader on a field of steles. The steles are gone and
 * the mapping is not: the page itself is now the surface that degrades, and this
 * module is the only thing that writes to it. It computes nothing — every number
 * below arrives already measured — and it draws nothing; it sets six custom
 * properties and two data attributes on the document, and `styles/post.css` is
 * where they become an image.
 *
 * The mapping is the same one the shader implemented, and it is deliberately not
 * improvised here: magnitude from total surprisal, character from the dominant
 * attribute, hue from the UTC offset when the dominant attribute is the time zone.
 * With nothing measured the magnitude is zero and the character is `none`, which
 * is the instrument idling rather than a mood.
 *
 * It is also switchable, and that is not a concession. Post-processing that makes
 * the page harder to read makes the argument harder to read, and the argument is
 * the point; a visitor who turns the layer off still has every number, and the
 * strip says which state they are in.
 */

const STORAGE_KEY = 'wearme:signal';

export type Channel = 'none' | 'canvas' | 'webgl' | 'audio' | 'fonts' | 'timezone';

export interface Corruption {
  /**
   * Corruption magnitude, 0..1, from the visitor's surprisal ranked against the
   * pool's own spread. Not a claim about identifiability — that claim is the
   * clamped headline figure in the measurement sector — but a position within this
   * pool, which is what a ranking is.
   */
  magnitude: number;
  channel: Channel;
  /** Minutes from UTC. Drives the hue rotation on the timezone channel. */
  utcOffset: number;
  /**
   * The recorded compressor sum. Drives the period of the vertical banding on the
   * audio channel, so the audio fingerprint is literally what the visitor is
   * looking through.
   */
  audioValue: number;
}

export const IDLE: Corruption = { magnitude: 0, channel: 'none', utcOffset: 0, audioValue: 0 };

export interface Post {
  /** Restate the layer from a measurement, or from IDLE. */
  set(corruption: Corruption): void;
  /** Whether the layer is currently drawing. */
  enabled(): boolean;
  toggle(): void;
  /**
   * One inversion. `partial` clips it to the top half of the frame, which is what
   * wearing an identity does: half of what the page reports is now somebody else.
   *
   * Inversion means wearing, and a change of state is the same event from the
   * instrument's side (see styles/tokens.css). Called for exactly those two things
   * and never for emphasis.
   */
  invert(partial?: boolean): void;
}

export function createPost(options: { reducedMotion: boolean }): Post {
  const layer = document.getElementById('post');
  const flash = document.getElementById('flash');
  const root = document.documentElement;

  // The switch survives a reload, because a visitor who turned the layer off did
  // not mean "off until the next render".
  let on = read();
  let current = IDLE;

  function read(): boolean {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      // Storage can be denied outright, and this is a page that promises to write
      // almost nothing to the browser. Defaulting to on is the honest fallback:
      // the layer is part of what the piece looks like.
      return true;
    }
  }

  function write(value: boolean): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
    } catch {
      // Nothing to do, and nothing worth telling the visitor: the switch simply
      // does not persist. It still works for this sitting.
    }
  }

  function apply(): void {
    const c = current;
    const m = on ? Math.min(1, Math.max(0, c.magnitude)) : 0;

    root.style.setProperty('--glitch', m.toFixed(3));
    root.style.setProperty('--signal', on ? '1' : '0');

    // The chromatic split is the canvas channel's signature, and only that
    // channel's: every channel gets magnitude, one gets colour separation.
    const split = on && c.channel === 'canvas' ? m * 0.05 : 0;
    root.style.setProperty('--split', `${split.toFixed(4)}em`);
    root.style.setProperty('--glow', on ? `${(0.16 + m * 0.24).toFixed(3)}em` : '0em');

    // Hue rotation is the timezone channel's signature, and the angle is the
    // offset itself rather than a number chosen to look right: one full turn per
    // day, so a browser twelve hours from UTC is rotated half way round.
    const hue = on && c.channel === 'timezone' ? (c.utcOffset / 1440) * 360 : 0;
    root.style.setProperty('--channel-hue', `${hue.toFixed(1)}deg`);

    // Vertical banding on the audio channel, at a period taken from the recorded
    // compressor sum. The sum is a small negative float in practice, so it is
    // folded into a legible span of pixels rather than used raw — the mapping is
    // arbitrary in scale and exact in source.
    const period = 3 + (Math.abs(c.audioValue * 1000) % 9);
    root.style.setProperty('--band-period', `${period.toFixed(1)}px`);

    // Denser raster on the fonts channel; the debris itself is in the stylesheet.
    root.style.setProperty('--raster', c.channel === 'fonts' ? '1px' : '2px');

    if (layer) {
      layer.dataset.signal = on ? 'on' : 'off';
      layer.dataset.channel = c.channel;
    }
  }

  apply();

  return {
    set(corruption) {
      current = corruption;
      apply();
    },

    enabled: () => on,

    toggle() {
      on = !on;
      write(on);
      apply();
    },

    invert(partial = false) {
      // Reduced motion means no flash: it is a 260 ms full-screen luminance
      // inversion, which is the single most aggressive thing on this page, and a
      // visitor who asked for less movement has asked for exactly this not to
      // happen. The state it announces is stated in words as well.
      if (!flash || !on || options.reducedMotion) return;
      flash.dataset.partial = partial ? 'true' : 'false';
      flash.classList.remove('is-flashing');
      // Forces a reflow so a second inversion inside the animation's own duration
      // restarts it instead of being swallowed.
      void flash.offsetWidth;
      flash.classList.add('is-flashing');
      flash.addEventListener('animationend', () => flash.classList.remove('is-flashing'), {
        once: true,
      });
    },
  };
}

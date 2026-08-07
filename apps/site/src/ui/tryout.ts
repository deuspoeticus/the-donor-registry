/**
 * Wearing an identity with nothing installed.
 *
 * This runs the emitted script for real, at document-start, in a blank frame on
 * this origin, and then reads that frame's surfaces back. Every override you
 * see take effect here is the same code a userscript manager would run.
 *
 * What it cannot do is the entire point of §7, and the interface says so in
 * plain terms rather than letting the demonstration imply more than it shows:
 * same-origin policy means this page can reach into a frame it created and
 * nowhere else. It proves the mechanism works. It proves nothing about how any
 * other site sees you, because this page cannot touch any other site — which is
 * exactly why the userscript exists.
 *
 * The frame is `about:blank`, which inherits this origin, so the script is
 * injected as the first thing in that document and patches its realm before
 * anything reads it.
 */

import { attrLabel } from '@wearme/core/attributes';
import type { AttrValue, Identity } from '@wearme/core/types';

export interface SurfaceReading {
  label: string;
  attr: string | null;
  before: string;
  after: string;
  /** What the entry says this surface should be, where the entry says anything. */
  target: string | null;
}

const show = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  const text = String(value);
  return text.length > 78 ? `${text.slice(0, 78)}…` : text;
};

/** Read from an arbitrary realm, so the same code measures the frame before and after. */
function readSurfaces(win: Window & typeof globalThis): Record<string, unknown> {
  const nav = win.navigator as Navigator & { deviceMemory?: number };
  let renderer: unknown = null;
  let extensions: unknown = null;
  let maxTexture: unknown = null;
  try {
    const gl = win.document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
    if (gl) {
      renderer = gl.getExtension('WEBGL_debug_renderer_info') ? gl.getParameter(0x9246) : null;
      extensions = (gl.getSupportedExtensions() ?? []).length;
      maxTexture = gl.getParameter(0x0d33);
    }
  } catch {
    // A frame without WebGL reads null, which is the honest answer.
  }

  let canvas: unknown = null;
  try {
    const c = win.document.createElement('canvas');
    c.width = 200;
    c.height = 40;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.font = '16px serif';
      ctx.fillText('probe', 4, 24);
      canvas = c.toDataURL().slice(-22);
    }
  } catch {
    canvas = null;
  }

  return {
    'nav.userAgent': nav.userAgent,
    'nav.platform': nav.platform,
    'nav.hardwareConcurrency': nav.hardwareConcurrency,
    'nav.deviceMemory': nav.deviceMemory ?? null,
    'nav.languages': Array.isArray(nav.languages) ? nav.languages.join(',') : null,
    'nav.maxTouchPoints': nav.maxTouchPoints,
    'screen.resolution': `${win.screen.width}x${win.screen.height}`,
    'screen.pixelRatio': win.devicePixelRatio,
    'intl.timeZone': win.Intl.DateTimeFormat().resolvedOptions().timeZone,
    'intl.offset': new win.Date().getTimezoneOffset(),
    'webgl.renderer': renderer,
    'webgl.limits': maxTexture,
    __extensionCount: extensions,
    __canvasTail: canvas,
  };
}

const EXTRA_LABELS: Record<string, string> = {
  __extensionCount: 'WebGL extensions offered',
  __canvasTail: 'Canvas readback (tail)',
};

export interface TryOnResult {
  readings: SurfaceReading[];
  /** Zero when the visitor's own surfaces were not read; see `readBefore`. */
  changed: number;
  matched: number;
  /** Surfaces the entry specifies that did not end up matching. Reported, not hidden. */
  missed: string[];
  comparedAgainstThisBrowser: boolean;
}

/**
 * Applies the emitted script inside a fresh frame and returns what moved.
 * The frame is removed afterwards, so nothing in this page is patched — the
 * visitor's own measurement stays the visitor's own measurement.
 */
export async function tryOn(
  entry: Identity,
  script: string,
  /**
   * Whether the visitor's own surfaces may be read for the comparison column.
   *
   * False under "Look only", where the interface has promised that this browser
   * is not measured. A before/after table is more legible than an after-only
   * one, and it is not worth breaking that promise for: with this false the
   * demonstration compares the frame against what the entry says it should be,
   * which proves the override works without touching the visitor at all.
   */
  readBefore: boolean,
): Promise<TryOnResult> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:0;';
  frame.src = 'about:blank';
  document.body.appendChild(frame);

  try {
    await new Promise<void>((resolve) => {
      if (frame.contentDocument?.readyState === 'complete') resolve();
      else frame.addEventListener('load', () => resolve(), { once: true });
    });

    const win = frame.contentWindow as (Window & typeof globalThis) | null;
    const doc = frame.contentDocument;
    if (!win || !doc) throw new Error('the frame did not open');

    // The frame inherits this browser's surfaces, so reading it before the
    // injection *is* measuring the visitor. Under "Look only" that has been
    // ruled out, so the read simply does not happen.
    const before = readBefore ? readSurfaces(win) : null;

    // Injected as source rather than evaluated from here, so it runs in the
    // frame's own realm exactly as a manager would run it in a page's.
    const element = doc.createElement('script');
    element.textContent = script;
    (doc.head ?? doc.documentElement).appendChild(element);

    const after = readSurfaces(win);

    const readings: SurfaceReading[] = [];
    const missed: string[] = [];
    let changed = 0;
    let matched = 0;

    for (const key of Object.keys(after)) {
      const target = key.startsWith('__') ? null : (entry.attrs[key] ?? null);
      const beforeText = before ? show(before[key]) : 'not read';
      const afterText = show(after[key]);
      if (before && beforeText !== afterText) changed++;

      if (target !== null && target !== undefined) {
        const hit = matches(after[key], target, key);
        if (hit) matched++;
        else missed.push(attrLabel(key));
      }

      readings.push({
        label: EXTRA_LABELS[key] ?? attrLabel(key),
        attr: key.startsWith('__') ? null : key,
        before: beforeText,
        after: afterText,
        target: target === null || target === undefined ? null : show(target),
      });
    }

    return { readings, changed, matched, missed, comparedAgainstThisBrowser: before !== null };
  } finally {
    frame.remove();
  }
}

/** The user agent is compared by prefix because the reading is truncated for display. */
function matches(actual: unknown, target: AttrValue, key: string): boolean {
  if (key === 'webgl.limits') {
    const m = /maxTexture=(\d+)/.exec(String(target));
    return m ? String(actual) === m[1] : false;
  }
  return String(actual) === String(target);
}

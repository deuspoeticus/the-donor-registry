/**
 * Navigator, Client Hints, screen, Intl, fonts, CSS state, Math, storage (§2).
 *
 * None of these ask permission and none of them appear in any browser's privacy
 * indicator. That is what makes the layer worth measuring in public: it is the
 * part of the surface nobody consented to and nobody is shown.
 */

import { sha256Short } from '@wearme/core/hash';
import type { ProbeResult } from './probes-graphics.js';

export function probeNavigator(): ProbeResult {
  const n = navigator as Navigator & { deviceMemory?: number; pdfViewerEnabled?: boolean };
  return {
    'nav.userAgent': n.userAgent ?? null,
    'nav.platform': n.platform ?? null,
    'nav.hardwareConcurrency': typeof n.hardwareConcurrency === 'number' ? n.hardwareConcurrency : null,
    'nav.deviceMemory': typeof n.deviceMemory === 'number' ? n.deviceMemory : null,
    'nav.languages': Array.isArray(n.languages) ? n.languages.join(',') : (n.language ?? null),
    'nav.maxTouchPoints': typeof n.maxTouchPoints === 'number' ? n.maxTouchPoints : null,
    'nav.pdfViewerEnabled': typeof n.pdfViewerEnabled === 'boolean' ? n.pdfViewerEnabled : null,
    // Recorded like everything else. Nothing in this pipeline branches on it.
    'nav.webdriver': typeof n.webdriver === 'boolean' ? n.webdriver : null,
  };
}

interface UADataValues {
  brands?: { brand: string; version: string }[];
  platformVersion?: string;
  architecture?: string;
  model?: string;
}

export async function probeClientHints(): Promise<ProbeResult> {
  const uaData = (navigator as Navigator & {
    userAgentData?: { getHighEntropyValues(hints: string[]): Promise<UADataValues> };
  }).userAgentData;

  if (!uaData?.getHighEntropyValues) {
    return { 'ch.brands': null, 'ch.platformVersion': null, 'ch.architecture': null, 'ch.model': null };
  }

  try {
    const values = await uaData.getHighEntropyValues([
      'brands',
      'platform',
      'platformVersion',
      'architecture',
      'bitness',
      'model',
      'uaFullVersion',
      'fullVersionList',
    ]);
    return {
      'ch.brands': values.brands ? JSON.stringify(values.brands) : null,
      'ch.platformVersion': values.platformVersion ?? '',
      'ch.architecture': values.architecture ?? '',
      'ch.model': values.model ?? '',
    };
  } catch {
    return { 'ch.brands': null, 'ch.platformVersion': null, 'ch.architecture': null, 'ch.model': null };
  }
}

export function probeScreen(): ProbeResult {
  return {
    'screen.resolution': `${screen.width}x${screen.height}`,
    'screen.avail': `${screen.availWidth}x${screen.availHeight}`,
    'screen.colorDepth': screen.colorDepth ?? null,
    'screen.pixelRatio': window.devicePixelRatio ?? null,
  };
}

export function probeIntl(): ProbeResult {
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions();
    return {
      'intl.timeZone': opts.timeZone ?? null,
      'intl.locale': opts.locale ?? null,
      'intl.calendar': `${opts.calendar ?? ''}|${opts.numberingSystem ?? ''}`,
      'intl.offset': new Date().getTimezoneOffset(),
    };
  } catch {
    return { 'intl.timeZone': null, 'intl.locale': null, 'intl.calendar': null, 'intl.offset': null };
  }
}

/**
 * Font detection by span measurement.
 *
 * A candidate face is present if text set in it measures differently from the
 * same text in a known fallback. Sixty-four candidates, one bit each, packed
 * into a 64-bit mask. The candidate list is fixed and ordered, because a
 * bitmask means nothing without the list it indexes — which is also why this
 * attribute is not wearable: presenting someone else's mask would require
 * intercepting text measurement itself, which is phase two.
 */
const FONT_CANDIDATES = [
  'Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold', 'Bahnschrift', 'Baskerville',
  'Book Antiqua', 'Bookman Old Style', 'Calibri', 'Cambria', 'Candara', 'Century Gothic',
  'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'DejaVu Sans',
  'DejaVu Serif', 'Didot', 'Franklin Gothic Medium', 'Futura', 'Geneva', 'Georgia',
  'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Impact', 'Ink Free', 'Lucida Console',
  'Lucida Grande', 'Lucida Sans Unicode', 'MS Gothic', 'MS PGothic', 'Malgun Gothic',
  'Menlo', 'Monaco', 'Noto Sans', 'Noto Serif', 'Optima', 'PT Sans', 'PT Serif',
  'Palatino', 'Palatino Linotype', 'Papyrus', 'Roboto', 'Rockwell', 'SF Pro Text',
  'Segoe Print', 'Segoe UI', 'SimSun', 'Sitka', 'Tahoma', 'Times New Roman',
  'Trebuchet MS', 'Ubuntu', 'Verdana', 'Wingdings', 'Yu Gothic', 'Zapfino',
  'Liberation Sans', 'Cantarell', 'Source Sans Pro', 'Fira Sans',
] as const;

const FALLBACKS = ['monospace', 'sans-serif', 'serif'] as const;
const FONT_TEST_STRING = 'mmmmmmmmmmlliWQ0O@#';

export function probeFonts(): ProbeResult {
  const span = document.createElement('span');
  span.style.cssText =
    'position:absolute;left:-9999px;top:-9999px;font-size:72px;white-space:nowrap;visibility:hidden;';
  span.textContent = FONT_TEST_STRING;
  document.body.appendChild(span);

  const measure = (family: string): [number, number] => {
    span.style.fontFamily = family;
    return [span.offsetWidth, span.offsetHeight];
  };

  try {
    const baselines = FALLBACKS.map((f) => measure(f));

    let hi = 0;
    let lo = 0;
    let count = 0;
    FONT_CANDIDATES.forEach((font, index) => {
      const present = FALLBACKS.some((fallback, i) => {
        const [w, h] = measure(`"${font}",${fallback}`);
        return w !== baselines[i][0] || h !== baselines[i][1];
      });
      if (!present) return;
      count++;
      if (index < 32) lo |= 1 << index;
      else hi |= 1 << (index - 32);
    });

    const mask = (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
    return { 'fonts.bitmask': mask, 'fonts.count': count };
  } finally {
    span.remove();
  }
}

export function probeCssEnv(): ProbeResult {
  const q = (query: string): boolean => window.matchMedia(query).matches;
  const parts = [
    `color-scheme=${q('(prefers-color-scheme: dark)') ? 'dark' : 'light'}`,
    `reduced-motion=${q('(prefers-reduced-motion: reduce)') ? 'reduce' : 'no-preference'}`,
    `contrast=${q('(prefers-contrast: more)') ? 'more' : q('(prefers-contrast: less)') ? 'less' : 'no-preference'}`,
    `forced-colors=${q('(forced-colors: active)') ? 'active' : 'none'}`,
    `dynamic-range=${q('(dynamic-range: high)') ? 'high' : 'standard'}`,
    `gamut=${q('(color-gamut: p3)') ? 'p3' : 'srgb'}`,
    `pointer=${q('(pointer: coarse)') ? 'coarse' : q('(pointer: fine)') ? 'fine' : 'none'}`,
    `hover=${q('(hover: hover)') ? 'hover' : 'none'}`,
  ];
  return { 'css.env': parts.join(';') };
}

/**
 * Floating-point quirks.
 *
 * The same expression evaluated on two engines, or on the same engine over two
 * instruction sets, disagrees in the last places. Seventeen significant figures
 * is enough to see it.
 */
export function probeMath(): ProbeResult {
  const values = [
    Math.tan(-1e300),
    Math.sinh(1),
    Math.cosh(492),
    Math.expm1(1),
    Math.pow(Math.PI, -100),
    Math.atanh(0.5),
    Math.asinh(2 ** 32),
    Math.log1p(1e-9),
    Math.exp(1) ** 2,
    Math.acosh(1e17),
    Math.sin(1e10),
    Math.hypot(3e300, 4e300),
  ];
  return { 'math.quirks': sha256Short(values.map((v) => v.toPrecision(17)).join('|'), 24) };
}

/**
 * Storage quota, bucketed to a power of two. The raw figure is a function of
 * free disk space and would change between visits, which is noise rather than
 * signal; the bucket is stable.
 */
export async function probeStorage(): Promise<ProbeResult> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    const quota = estimate?.quota;
    if (typeof quota !== 'number' || quota <= 0) return { 'storage.quota': null };
    return { 'storage.quota': 2 ** Math.round(Math.log2(quota)) };
  } catch {
    return { 'storage.quota': null };
  }
}

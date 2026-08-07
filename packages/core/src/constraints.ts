/**
 * The manifest of impossibilities (§5).
 *
 * This file is the argument, not plumbing. An incoherent borrowed identity does
 * not anonymise you — it makes you a unicorn, more identifiable than you were
 * before you put it on. So the forge is only allowed to emit combinations that
 * some real installation could actually produce, and every rule below names a
 * pairing that no shipping configuration generates.
 *
 * The rules are deliberately conservative. A rule that rejects a real device is
 * worse than one that lets a rare forgery through, because the first kind
 * silently deletes people from the commons.
 */

import type { AttrValue, AttrVector } from './types.js';

export type PlatformFamily = 'windows' | 'mac' | 'linux' | 'ios' | 'android' | 'unknown';

export interface Constraint {
  id: string;
  /** Shown in the interface. States the impossibility in plain terms. */
  describe: string;
  violated: (attrs: AttrVector) => boolean;
}

const str = (v: AttrValue): string => (typeof v === 'string' ? v : '');
const num = (v: AttrValue): number | null => (typeof v === 'number' ? v : null);

export function platformFamily(attrs: AttrVector): PlatformFamily {
  const p = str(attrs['nav.platform']);
  if (/^iPhone|^iPad|^iPod/i.test(p)) return 'ios';
  if (/^Win/i.test(p)) return 'windows';
  if (/^MacIntel|^Mac68K|^MacPPC/i.test(p)) return 'mac';
  if (/^Linux (armv|aarch)/i.test(p)) return 'android';
  if (/^Linux|^X11|^FreeBSD|^OpenBSD/i.test(p)) return 'linux';
  return 'unknown';
}

const APPLE_GPU = /\bapple\b|apple gpu|apple m[0-9]/i;
const D3D_GPU = /direct3d|\bd3d1[01]\b/i;
const MOBILE_GPU = /adreno|\bmali\b|powervr|xclipse|immortalis/i;

/** Parses "1920x1080" into a pair. Returns null on anything else. */
function dims(v: AttrValue): [number, number] | null {
  const m = /^(\d+)x(\d+)$/.exec(str(v));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * True UTC offset for an IANA zone, in the sign convention of
 * Date.prototype.getTimezoneOffset (minutes *behind* UTC, so Berlin summer is -120).
 */
export function zoneOffsetMinutes(timeZone: string, at: Date): number | null {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
    const asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      // Some locales format midnight as hour 24.
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    );
    return Math.round((at.getTime() - asUTC) / 60000);
  } catch {
    return null;
  }
}

/** Both standard and daylight offsets, since the pool is collected year-round. */
export function plausibleOffsets(timeZone: string): number[] {
  const year = new Date().getUTCFullYear();
  const jan = zoneOffsetMinutes(timeZone, new Date(Date.UTC(year, 0, 15)));
  const jul = zoneOffsetMinutes(timeZone, new Date(Date.UTC(year, 6, 15)));
  return [jan, jul].filter((x): x is number => x !== null);
}

export const CONSTRAINTS: readonly Constraint[] = [
  {
    id: 'apple-gpu-off-apple',
    describe: 'An Apple GPU string on a platform that is not macOS or iOS.',
    violated: (a) => {
      const fam = platformFamily(a);
      const r = `${str(a['webgl.renderer'])} ${str(a['webgl.vendor'])}`;
      return APPLE_GPU.test(r) && fam !== 'unknown' && fam !== 'mac' && fam !== 'ios';
    },
  },
  {
    id: 'apple-platform-foreign-gpu',
    describe: 'A macOS or iOS platform reporting a Direct3D renderer.',
    violated: (a) => {
      const fam = platformFamily(a);
      return (fam === 'mac' || fam === 'ios') && D3D_GPU.test(str(a['webgl.renderer']));
    },
  },
  {
    id: 'd3d-off-windows',
    describe: 'A Direct3D renderer string outside Windows.',
    violated: (a) => {
      const fam = platformFamily(a);
      return D3D_GPU.test(str(a['webgl.renderer'])) && fam !== 'unknown' && fam !== 'windows';
    },
  },
  {
    id: 'mobile-gpu-on-desktop',
    describe: 'A phone or tablet GPU (Adreno, Mali, PowerVR) on a desktop platform.',
    violated: (a) => {
      const fam = platformFamily(a);
      return (
        MOBILE_GPU.test(str(a['webgl.renderer'])) &&
        (fam === 'windows' || fam === 'mac' || fam === 'linux')
      );
    },
  },
  {
    id: 'ios-core-count',
    describe: 'iOS reporting more than eight logical cores. No shipping iPhone or iPad does.',
    violated: (a) => {
      const c = num(a['nav.hardwareConcurrency']);
      return platformFamily(a) === 'ios' && c !== null && c > 8;
    },
  },
  {
    id: 'ios-pixel-ratio',
    describe: 'iOS at a device pixel ratio below 2. Every iOS display since 2014 is above it.',
    violated: (a) => {
      const dpr = num(a['screen.pixelRatio']);
      return platformFamily(a) === 'ios' && dpr !== null && dpr < 2;
    },
  },
  {
    id: 'handheld-without-touch',
    describe: 'A phone or tablet platform reporting zero touch points.',
    violated: (a) => {
      const fam = platformFamily(a);
      const t = num(a['nav.maxTouchPoints']);
      return (fam === 'ios' || fam === 'android') && t !== null && t === 0;
    },
  },
  {
    id: 'device-memory-outside-chromium',
    describe:
      'navigator.deviceMemory present without Client Hints. The two ship together in Chromium and nowhere else.',
    violated: (a) => a['nav.deviceMemory'] !== null && a['ch.brands'] === null,
  },
  {
    id: 'client-hints-half-present',
    describe: 'A Client Hints brand list with no platform version. getHighEntropyValues returns both or neither.',
    violated: (a) => a['ch.brands'] !== null && a['ch.platformVersion'] === null,
  },
  {
    id: 'user-agent-platform-mismatch',
    describe: 'A user agent naming one operating system while navigator.platform names another.',
    violated: (a) => {
      const ua = str(a['nav.userAgent']);
      const fam = platformFamily(a);
      if (!ua || fam === 'unknown') return false;
      let uaFam: PlatformFamily = 'unknown';
      // Order matters: Android user agents also contain "Linux".
      if (/\biPhone\b|\biPad\b|\biPod\b/.test(ua)) uaFam = 'ios';
      else if (/\bAndroid\b/.test(ua)) uaFam = 'android';
      else if (/\bWindows\b/.test(ua)) uaFam = 'windows';
      else if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) uaFam = 'mac';
      else if (/\bLinux\b|\bX11\b|\bCrOS\b/.test(ua)) uaFam = 'linux';
      // iPadOS in desktop mode genuinely reports a Macintosh UA with MacIntel.
      if (uaFam === 'mac' && fam === 'ios') return false;
      return uaFam !== 'unknown' && uaFam !== fam;
    },
  },
  {
    id: 'timezone-offset-mismatch',
    describe:
      'A UTC offset that the named time zone does not produce in either standard or daylight time.',
    violated: (a) => {
      const tz = str(a['intl.timeZone']);
      const off = num(a['intl.offset']);
      if (!tz || off === null) return false;
      const valid = plausibleOffsets(tz);
      if (valid.length === 0) return false; // unknown zone: not our place to call it impossible
      return !valid.includes(off);
    },
  },
  {
    id: 'locale-absent-from-languages',
    describe: 'A resolved locale whose language does not appear anywhere in the accepted languages list.',
    violated: (a) => {
      const loc = str(a['intl.locale']).toLowerCase();
      const langs = str(a['nav.languages']).toLowerCase();
      if (!loc || !langs) return false;
      const lang = loc.split('-')[0];
      return !langs.split(/[,\s]+/).some((l) => l.split('-')[0] === lang);
    },
  },
  {
    id: 'available-area-exceeds-screen',
    describe: 'A usable screen area larger than the screen it sits in.',
    violated: (a) => {
      const res = dims(a['screen.resolution']);
      const avail = dims(a['screen.avail']);
      if (!res || !avail) return false;
      return avail[0] > res[0] || avail[1] > res[1];
    },
  },
  {
    id: 'handheld-desktop-screen',
    describe: 'A phone or tablet platform with a screen wider than any handheld ships with.',
    violated: (a) => {
      const fam = platformFamily(a);
      const res = dims(a['screen.resolution']);
      if (!res || (fam !== 'ios' && fam !== 'android')) return false;
      return Math.max(res[0], res[1]) > 1600;
    },
  },
  {
    id: 'desktop-handheld-screen',
    describe: 'A desktop platform with a screen too small for any shipping display.',
    violated: (a) => {
      const fam = platformFamily(a);
      const res = dims(a['screen.resolution']);
      if (!res || (fam !== 'windows' && fam !== 'mac' && fam !== 'linux')) return false;
      return Math.max(res[0], res[1]) < 800;
    },
  },
  {
    id: 'colour-depth-nonstandard',
    describe: 'A colour depth no display pipeline reports.',
    violated: (a) => {
      const d = num(a['screen.colorDepth']);
      return d !== null && ![24, 30, 32, 48].includes(d);
    },
  },
  {
    id: 'core-count-out-of-range',
    describe: 'A logical core count outside anything a browser exposes.',
    violated: (a) => {
      const c = num(a['nav.hardwareConcurrency']);
      return c !== null && (c < 1 || c > 128 || !Number.isInteger(c));
    },
  },
  {
    id: 'device-memory-not-a-bucket',
    describe: 'A device memory value outside the buckets the API is specified to report.',
    violated: (a) => {
      const m = num(a['nav.deviceMemory']);
      return m !== null && ![0.25, 0.5, 1, 2, 4, 8].includes(m);
    },
  },
  {
    id: 'pixel-ratio-out-of-range',
    describe: 'A device pixel ratio no display produces.',
    violated: (a) => {
      const r = num(a['screen.pixelRatio']);
      return r !== null && (r < 0.5 || r > 6);
    },
  },
  {
    id: 'scene-without-context',
    describe: 'A rendered WebGL scene hash with no WebGL renderer. Nothing drew it.',
    violated: (a) => a['webgl.scene'] !== null && a['webgl.renderer'] === null,
  },
  {
    id: 'fonts-counted-but-absent',
    describe: 'A font bitmask with bits set and a detected font count of zero.',
    violated: (a) => {
      const count = num(a['fonts.count']);
      const mask = str(a['fonts.bitmask']);
      return count === 0 && mask !== '' && /[1-9a-f]/i.test(mask);
    },
  },
  {
    id: 'voices-counted-but-absent',
    describe: 'A voice count of zero alongside a non-empty voices list.',
    violated: (a) => {
      const count = num(a['voices.count']);
      return count === 0 && typeof a['voices.list'] === 'string' && a['voices.list'] !== '';
    },
  },
];

export interface ConstraintResult {
  ok: boolean;
  violations: string[];
}

export function checkConstraints(attrs: AttrVector): ConstraintResult {
  const violations: string[] = [];
  for (const c of CONSTRAINTS) {
    try {
      if (c.violated(attrs)) violations.push(c.id);
    } catch {
      // A rule that throws on odd input abstains. It does not get to reject.
    }
  }
  return { ok: violations.length === 0, violations };
}

export function constraintById(id: string): Constraint | undefined {
  return CONSTRAINTS.find((c) => c.id === id);
}

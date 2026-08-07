/**
 * The userscript emitter (§7).
 *
 * A page cannot do this from its own origin. Same-origin policy means nothing
 * served from this domain changes how the visitor renders anywhere else, so the
 * userscript is the delivery vector: one file, no store review, cross-browser.
 * A bookmarklet cannot work — it fires after load, on the page you are already
 * on, long after any detector has read the surface.
 *
 * Two rules decide whether this works at all, and both are load-bearing:
 *
 *   1. document-start, main world. Patches applied after a detector has read
 *      the surface are worthless. `@run-at document-start` with `@grant none`
 *      puts the script in the page's own realm before anything else runs.
 *
 *   2. Noise is deterministic per identity, never per call. A signature that
 *      changes on every read is not anonymity — randomisers are trivially
 *      detected and are themselves a strong fingerprint. Everything below is
 *      seeded from the identity id and from nothing else, which is also what
 *      makes the commons real: two people wearing one entry present one face.
 */

import { WEARABLE_IDS, attrLabel } from './attributes.js';
import type { Identity } from './types.js';

export type SurfaceMode = 'converge' | 'perturb';

export interface UserscriptOptions {
  /** Where the script says it came from. Appears in @namespace and the banner. */
  siteUrl: string;
  /**
   * converge — readback is replaced by a stream derived from the identity, so
   *   every wearer of this entry produces one value. This is what makes wearing
   *   a commons rather than a costume, and it breaks legitimate canvas readback
   *   on pages that do it.
   * perturb — low bits are altered instead. Canvas keeps working, the value is
   *   stable per identity per machine, and wearers do NOT converge.
   */
  canvasMode?: SurfaceMode;
  audioMode?: SurfaceMode;
  /**
   * Patch Function.prototype.toString so the overrides read as native.
   * Available, and *itself* a detection signal — a toString that lies is a
   * thing detectors check for. Off by default; the tradeoff is stated in the
   * interface rather than pretended away.
   */
  hideOverrides?: boolean;
  matches?: string[];
  version?: string;
}

/**
 * What the emitted script actually does, per attribute. Rendered in the
 * interface next to the download, because a coverage claim nobody can check is
 * the kind of claim this piece exists to refuse.
 */
export type CoverageState = 'exact' | 'converged' | 'none';

export interface CoverageRow {
  attr: string;
  label: string;
  state: CoverageState;
  note: string;
}

const EXACT_SURFACES = new Set([
  'nav.userAgent',
  'nav.platform',
  'nav.hardwareConcurrency',
  'nav.deviceMemory',
  'nav.languages',
  'nav.maxTouchPoints',
  'ch.brands',
  'ch.platformVersion',
  'ch.architecture',
  'ch.model',
  'screen.resolution',
  'screen.avail',
  'screen.colorDepth',
  'screen.pixelRatio',
  'intl.timeZone',
  'intl.locale',
  'intl.calendar',
  'intl.offset',
  'webgl.vendor',
  'webgl.renderer',
  'webgl.extensions',
  'webgl.precision',
  'webgl.limits',
  'voices.list',
  'voices.count',
]);

const CONVERGED_SURFACES = new Set(['canvas.hash', 'canvas.emoji', 'audio.sum']);

export function coverage(opts: Pick<UserscriptOptions, 'canvasMode' | 'audioMode'> = {}): CoverageRow[] {
  const canvasMode = opts.canvasMode ?? 'converge';
  const audioMode = opts.audioMode ?? 'converge';
  return WEARABLE_IDS.map((attr) => {
    if (EXACT_SURFACES.has(attr)) {
      return {
        attr,
        label: attrLabel(attr),
        state: 'exact' as const,
        note: 'Presented exactly as recorded.',
      };
    }
    if (CONVERGED_SURFACES.has(attr)) {
      const mode = attr.startsWith('audio') ? audioMode : canvasMode;
      if (mode === 'converge') {
        return {
          attr,
          label: attrLabel(attr),
          state: 'converged' as const,
          note:
            'Replaced by a value derived from the identity. Every wearer produces the same one. It is not the number recorded here, because that number is a digest and a digest cannot be replayed.',
        };
      }
      return {
        attr,
        label: attrLabel(attr),
        state: 'none' as const,
        note: 'Perturbation mode: stable for you, but not shared with other wearers.',
      };
    }
    return { attr, label: attrLabel(attr), state: 'none' as const, note: 'Not overridden.' };
  });
}

/** Surfaces the script does not touch, stated next to the download. */
export const NOT_COVERED: readonly { surface: string; why: string }[] = [
  { surface: 'Your IP address', why: 'JavaScript cannot change it. Unchanged, and visible to every site you open.' },
  { surface: 'Your TLS handshake (JA3/JA4)', why: 'Negotiated before any script runs. Still identifies your real browser build.' },
  { surface: 'HTTP/2 and HTTP/3 frame ordering', why: 'Set by the network stack, below anything a page can reach.' },
  { surface: 'The User-Agent request header', why: 'Sent by the browser itself. The script changes navigator.userAgent, not the header.' },
  { surface: 'Your logged-in sessions', why: 'Cookies are untouched. Anywhere you are signed in still knows exactly who you are.' },
  { surface: 'Font metrics', why: 'measureText and offsetWidth interception is phase two. Font detection still reads your real system.' },
  { surface: 'Cursor geometry and typing cadence', why: 'Behavioural, continuous, and not addressable by property overrides.' },
  { surface: 'OffscreenCanvas and worker contexts', why: 'The script patches the main realm. Workers get their own.' },
];

/**
 * Attribute values are strings some renderer produced, not strings we chose, so
 * the config block is escaped before being embedded as source: a closing script
 * tag in case the file is ever shown inline, and the two line separators older
 * engines treat as terminators inside a string literal.
 */
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);
const SCRIPT_CLOSE = String.fromCharCode(0x3c) + '/script';
const BACKSLASH = String.fromCharCode(0x5c);

const escapeForScript = (json: string): string =>
  json
    .split(SCRIPT_CLOSE)
    .join(String.fromCharCode(0x3c) + BACKSLASH + '/script')
    .split(LINE_SEP)
    .join(BACKSLASH + 'u2028')
    .split(PARA_SEP)
    .join(BACKSLASH + 'u2029');

export function emitUserscript(identity: Identity, opts: UserscriptOptions): string {
  const canvasMode = opts.canvasMode ?? 'converge';
  const audioMode = opts.audioMode ?? 'converge';
  const hideOverrides = opts.hideOverrides ?? false;
  const matches = opts.matches ?? ['*://*/*'];
  const version = opts.version ?? '1.0.0';
  const short = identity.id.slice(0, 12);

  const config = escapeForScript(
    JSON.stringify(
      {
        id: identity.id,
        attrs: identity.attrs,
        canvasMode,
        audioMode,
        hideOverrides,
      },
      null,
      2,
    ),
  );

  const header = [
    '// ==UserScript==',
    `// @name         WEAR ME — ${short}`,
    `// @namespace    ${opts.siteUrl}`,
    `// @version      ${version}`,
    `// @description  Presents pool entry ${short}. Deterministic per identity, identical for every wearer.`,
    `// @homepageURL  ${opts.siteUrl}`,
    ...matches.map((m) => `// @match        ${m}`),
    '// @run-at       document-start',
    '// @grant        none',
    '// ==/UserScript==',
  ].join('\n');

  return `${header}

/*
 * WEAR ME — a fingerprint commons.
 * ${opts.siteUrl}
 *
 * This script presents one entry from a public pool of browser signatures as
 * though it were yours. It was generated for entry ${short} and every wearer of
 * that entry runs an identical file.
 *
 * What it does not do, and cannot: your IP address, your TLS handshake, your
 * HTTP/2 frame ordering and your logged-in sessions keep telling the truth
 * while this JavaScript lies. A competent detector reads one browser above and
 * a different one beneath, and flags you as neither a known human nor a known
 * bot. Wearing a stolen face does not make you invisible. It makes you an
 * anomaly, which is the most conspicuous thing available.
 *
 * Every override below is seeded from the identity id. Nothing here is random.
 * A signature that changes on every read would be a stronger fingerprint than
 * the one you started with.
 */

(function () {
  'use strict';

  var CONFIG = ${config};
  var A = CONFIG.attrs;

  // ---- deterministic stream, seeded from the identity id only ----------------

  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) >>> 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) >>> 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) >>> 0;
      t = (t + d) >>> 0;
      c = (c + t) >>> 0;
      return (t >>> 0) / 4294967296;
    };
  }

  function streamFor(tag) {
    var seed = xmur3(CONFIG.id + '|' + tag);
    var rand = sfc32(seed(), seed(), seed(), seed());
    for (var i = 0; i < 12; i++) rand();
    return rand;
  }

  // One keystream block, generated once and tiled. Depends on the identity and
  // the tag, never on the content it is applied to, which is what lets two
  // machines wearing this entry produce the same readback.
  var streamCache = Object.create(null);
  function keystream(tag, length) {
    var key = tag + ':' + length;
    if (streamCache[key]) return streamCache[key];
    var rand = streamFor(tag);
    var buf = new Uint8Array(length);
    for (var i = 0; i < length; i++) buf[i] = (rand() * 256) | 0;
    streamCache[key] = buf;
    return buf;
  }

  // ---- helpers ---------------------------------------------------------------

  var applied = [];
  var natives = new WeakMap();

  function define(target, prop, getter) {
    if (!target) return;
    try {
      Object.defineProperty(target, prop, { get: getter, configurable: true, enumerable: true });
      applied.push(prop);
    } catch (e) { /* a sealed surface stays as it was */ }
  }

  function replace(target, prop, factory) {
    if (!target || typeof target[prop] !== 'function') return;
    var original = target[prop];
    var patched = factory(original);
    natives.set(patched, original);
    try {
      target[prop] = patched;
      applied.push(prop);
    } catch (e) { /* frozen prototype */ }
  }

  function has(name) { return A[name] !== null && A[name] !== undefined; }
  function numOf(name, fallback) { return has(name) ? Number(A[name]) : fallback; }
  function strOf(name, fallback) { return has(name) ? String(A[name]) : fallback; }

  function parseDims(value) {
    var m = /^(\\d+)x(\\d+)$/.exec(String(value || ''));
    return m ? [Number(m[1]), Number(m[2])] : null;
  }

  // ---- 1. canvas -------------------------------------------------------------
  //
  // The pool stores a digest of the canvas readback, not the pixels, so the
  // donor's exact image cannot be replayed. In converge mode the readback is
  // overwritten with an identity-derived stream instead: not the donor's value,
  // but one value shared by every wearer, which is what the commons needs.

  function paint(imageData) {
    var data = imageData.data;
    var tag = 'canvas:' + imageData.width + 'x' + imageData.height;
    var ks = keystream(tag, 65536);
    if (CONFIG.canvasMode === 'converge') {
      for (var i = 0; i < data.length; i += 4) {
        var k = i % 65536;
        data[i] = ks[k];
        data[i + 1] = ks[(k + 1) % 65536];
        data[i + 2] = ks[(k + 2) % 65536];
        data[i + 3] = 255;
      }
    } else {
      for (var j = 0; j < data.length; j++) {
        if ((j & 3) === 3) continue;
        data[j] = (data[j] ^ (ks[j % 65536] & 3)) & 255;
      }
    }
    return imageData;
  }

  var CtxProto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  replace(CtxProto, 'getImageData', function (orig) {
    return function getImageData() {
      return paint(orig.apply(this, arguments));
    };
  });

  // toDataURL and toBlob encode the canvas rather than reading it back, so they
  // are routed through a copy that has already been painted.
  function paintedCopy(canvas) {
    var copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    var ctx = copy.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    // Calls the patched getImageData above, so the same stream is applied.
    var img = ctx.getImageData(0, 0, copy.width, copy.height);
    ctx.putImageData(img, 0, 0);
    return copy;
  }

  var CanvasProto = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
  replace(CanvasProto, 'toDataURL', function (orig) {
    return function toDataURL() {
      try {
        return orig.apply(paintedCopy(this), arguments);
      } catch (e) {
        return orig.apply(this, arguments);
      }
    };
  });
  replace(CanvasProto, 'toBlob', function (orig) {
    return function toBlob() {
      try {
        return orig.apply(paintedCopy(this), arguments);
      } catch (e) {
        return orig.apply(this, arguments);
      }
    };
  });

  // ---- 2. WebGL --------------------------------------------------------------

  var GL_VENDOR = 0x1f00, GL_RENDERER = 0x1f01;
  var UNMASKED_VENDOR = 0x9245, UNMASKED_RENDERER = 0x9246;
  var MAX_TEXTURE_SIZE = 0x0d33, MAX_VIEWPORT_DIMS = 0x0d3a, MAX_RENDERBUFFER_SIZE = 0x84e8;

  var limits = {};
  strOf('webgl.limits', '').split(';').forEach(function (pair) {
    var kv = pair.split('=');
    if (kv.length === 2) limits[kv[0]] = kv[1];
  });

  var extensionList = has('webgl.extensions') && String(A['webgl.extensions']).length
    ? String(A['webgl.extensions']).split(',')
    : null;

  var precision = {};
  strOf('webgl.precision', '').split(';').forEach(function (pair) {
    var kv = pair.split('=');
    if (kv.length === 2) precision[kv[0]] = kv[1].split(',').map(Number);
  });

  function patchGL(proto) {
    if (!proto) return;

    replace(proto, 'getParameter', function (orig) {
      return function getParameter(p) {
        // VENDOR and RENDERER are left alone. Real browsers return a masked
        // string there ("WebKit WebGL"), and replacing it with the unmasked
        // value would be an inconsistency no real installation produces.
        if (p === UNMASKED_VENDOR && has('webgl.vendor')) return String(A['webgl.vendor']);
        if (p === UNMASKED_RENDERER && has('webgl.renderer')) return String(A['webgl.renderer']);
        if (p === MAX_TEXTURE_SIZE && limits.maxTexture) return Number(limits.maxTexture);
        if (p === MAX_RENDERBUFFER_SIZE && limits.maxRenderbuffer) return Number(limits.maxRenderbuffer);
        if (p === MAX_VIEWPORT_DIMS && limits.maxViewport) {
          var d = parseDims(limits.maxViewport);
          if (d) return new Int32Array(d);
        }
        return orig.apply(this, arguments);
      };
    });

    if (extensionList) {
      replace(proto, 'getSupportedExtensions', function () {
        return function getSupportedExtensions() {
          return extensionList.slice();
        };
      });
      // An extension that is not in the advertised list must not hand back an
      // object. Advertising one set and honouring another is the exact kind of
      // inconsistency that flags a patched browser.
      replace(proto, 'getExtension', function (orig) {
        return function getExtension(name) {
          if (name === 'WEBGL_debug_renderer_info') return orig.apply(this, arguments);
          if (extensionList.indexOf(name) === -1) return null;
          return orig.apply(this, arguments);
        };
      });
    }

    if (Object.keys(precision).length) {
      replace(proto, 'getShaderPrecisionFormat', function (orig) {
        return function getShaderPrecisionFormat(shaderType, precisionType) {
          var real = orig.apply(this, arguments);
          // 0x8B31 VERTEX_SHADER; 0x8DF2 HIGH_FLOAT, 0x8DF1 MEDIUM_FLOAT
          var stage = shaderType === 0x8b31 ? 'v' : 'f';
          var level = precisionType === 0x8df2 ? 'h' : precisionType === 0x8df1 ? 'm' : null;
          var spec = level ? precision[stage + level] : null;
          if (!spec || spec.length !== 3) return real;
          return { rangeMin: spec[0], rangeMax: spec[1], precision: spec[2] };
        };
      });
    }
  }

  patchGL(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype);
  patchGL(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype);

  // ---- 3. navigator ----------------------------------------------------------

  var NavProto = window.Navigator && window.Navigator.prototype;

  if (has('nav.userAgent')) define(NavProto, 'userAgent', function () { return String(A['nav.userAgent']); });
  if (has('nav.platform')) define(NavProto, 'platform', function () { return String(A['nav.platform']); });
  if (has('nav.hardwareConcurrency')) define(NavProto, 'hardwareConcurrency', function () { return numOf('nav.hardwareConcurrency', 4); });
  if (has('nav.deviceMemory')) define(NavProto, 'deviceMemory', function () { return numOf('nav.deviceMemory', 8); });
  if (has('nav.maxTouchPoints')) define(NavProto, 'maxTouchPoints', function () { return numOf('nav.maxTouchPoints', 0); });

  if (has('nav.languages')) {
    var langs = String(A['nav.languages']).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    define(NavProto, 'languages', function () { return Object.freeze(langs.slice()); });
    define(NavProto, 'language', function () { return langs[0]; });
  }

  // Client Hints. Only the fields the pool actually holds are answered; the
  // rest fall through to the real implementation rather than being invented.
  if (has('ch.brands') && navigator.userAgentData) {
    var brands = [];
    try { brands = JSON.parse(String(A['ch.brands'])); } catch (e) {
      brands = String(A['ch.brands']).split(';').map(function (b) {
        var parts = b.split('|');
        return { brand: parts[0], version: parts[1] || '' };
      });
    }
    var uaMobile = numOf('nav.maxTouchPoints', 0) > 0;
    var highEntropy = {
      brands: brands,
      mobile: uaMobile,
      platform: strOf('nav.platform', ''),
      platformVersion: strOf('ch.platformVersion', ''),
      architecture: strOf('ch.architecture', ''),
      model: strOf('ch.model', '')
    };
    var uad = {
      brands: brands,
      mobile: uaMobile,
      platform: highEntropy.platform,
      getHighEntropyValues: function (hints) {
        var out = { brands: brands, mobile: uaMobile, platform: highEntropy.platform };
        (hints || []).forEach(function (h) {
          if (h in highEntropy) out[h] = highEntropy[h];
        });
        return Promise.resolve(out);
      },
      toJSON: function () { return { brands: brands, mobile: uaMobile, platform: highEntropy.platform }; }
    };
    define(NavProto, 'userAgentData', function () { return uad; });
  }

  // ---- 4. Intl and time ------------------------------------------------------

  var tz = strOf('intl.timeZone', '');
  var locale = strOf('intl.locale', '');
  var calendarSpec = strOf('intl.calendar', '');

  if (tz || locale) {
    [window.Intl && Intl.DateTimeFormat, window.Intl && Intl.NumberFormat].forEach(function (Ctor) {
      if (!Ctor || !Ctor.prototype) return;
      replace(Ctor.prototype, 'resolvedOptions', function (orig) {
        return function resolvedOptions() {
          var opts = orig.apply(this, arguments);
          if (tz && 'timeZone' in opts) opts.timeZone = tz;
          if (locale) opts.locale = locale;
          var cal = calendarSpec.split('|');
          if (cal[0] && 'calendar' in opts) opts.calendar = cal[0];
          if (cal[1] && 'numberingSystem' in opts) opts.numberingSystem = cal[1];
          return opts;
        };
      });
    });
  }

  if (has('intl.offset')) {
    var offset = numOf('intl.offset', 0);
    replace(Date.prototype, 'getTimezoneOffset', function () {
      return function getTimezoneOffset() { return offset; };
    });
  }

  // ---- 5. audio --------------------------------------------------------------
  //
  // The pool holds the compressor output *sum*, which is a reduction and cannot
  // be inverted into a signal. In converge mode the channel data is replaced by
  // an identity-derived waveform, so any probe summing any slice of it lands on
  // a value shared by every wearer — a different number from the one recorded
  // here, and the same one for everybody.

  var AudioBufferProto = window.AudioBuffer && window.AudioBuffer.prototype;
  replace(AudioBufferProto, 'getChannelData', function (orig) {
    return function getChannelData(channel) {
      var data = orig.apply(this, arguments);
      var rand = streamFor('audio:' + channel + ':' + data.length);
      if (CONFIG.audioMode === 'converge') {
        for (var i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
      } else {
        for (var j = 0; j < data.length; j++) data[j] += (rand() - 0.5) * 1e-7;
      }
      return data;
    };
  });
  replace(AudioBufferProto, 'copyFromChannel', function (orig) {
    return function copyFromChannel(destination, channel, start) {
      orig.apply(this, arguments);
      var rand = streamFor('audio:' + channel + ':' + destination.length);
      if (CONFIG.audioMode === 'converge') {
        for (var i = 0; i < destination.length; i++) destination[i] = rand() * 2 - 1;
      } else {
        for (var j = 0; j < destination.length; j++) destination[j] += (rand() - 0.5) * 1e-7;
      }
    };
  });

  // ---- 6. screen -------------------------------------------------------------

  var ScreenProto = window.Screen && window.Screen.prototype;
  var res = parseDims(A['screen.resolution']);
  var avail = parseDims(A['screen.avail']);

  if (res) {
    define(ScreenProto, 'width', function () { return res[0]; });
    define(ScreenProto, 'height', function () { return res[1]; });
  }
  if (avail) {
    define(ScreenProto, 'availWidth', function () { return avail[0]; });
    define(ScreenProto, 'availHeight', function () { return avail[1]; });
  }
  if (has('screen.colorDepth')) {
    define(ScreenProto, 'colorDepth', function () { return numOf('screen.colorDepth', 24); });
    define(ScreenProto, 'pixelDepth', function () { return numOf('screen.colorDepth', 24); });
  }
  if (has('screen.pixelRatio')) {
    define(window, 'devicePixelRatio', function () { return numOf('screen.pixelRatio', 1); });
  }

  // ---- 7. speech synthesis voices --------------------------------------------

  if (has('voices.list') && window.speechSynthesis) {
    var voices = String(A['voices.list']).split(';').filter(Boolean).map(function (entry) {
      var parts = entry.split('|');
      return {
        voiceURI: parts[0],
        name: parts[0],
        lang: parts[1] || 'en-US',
        localService: parts[2] === '1',
        default: false
      };
    });
    if (voices.length) voices[0].default = true;
    replace(Object.getPrototypeOf(window.speechSynthesis), 'getVoices', function () {
      return function getVoices() { return voices.slice(); };
    });
  }

  // ---- 8. override concealment (optional, and not free) ----------------------
  //
  // A toString that returns native code for a function that is not native is
  // itself something detectors test for, by comparing against a known-native
  // reference. Enabling this trades one signal for another. It is off unless
  // the wearer asked for it, and the interface says why.

  if (CONFIG.hideOverrides) {
    var origToString = Function.prototype.toString;
    var patchedToString = function toString() {
      var original = natives.get(this);
      if (original) return origToString.call(original);
      return origToString.call(this);
    };
    natives.set(patchedToString, origToString);
    try { Function.prototype.toString = patchedToString; } catch (e) { /* frozen */ }
  }

  // A single, quiet marker so a wearer can confirm the script ran at all.
  // Reads as an override to anything that looks for one; that is accurate.
  try {
    Object.defineProperty(window, '__WEAR_ME__', {
      value: Object.freeze({ id: CONFIG.id, surfaces: applied.length }),
      configurable: true,
      enumerable: false
    });
  } catch (e) { /* nothing to do */ }
})();
`;
}

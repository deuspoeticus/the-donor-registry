/**
 * The hand-built prior the launch pool is sampled from (§1).
 *
 * Everything here is manufactured. It is written down rather than scraped
 * because a cold pool of zero cannot compute a surprisal, and because the
 * alternative — quietly seeding with real signatures collected without asking —
 * is the thing the piece is against.
 *
 * The archetypes are deliberately ordinary: the configurations a large share of
 * the web actually runs. That matters for the measurement. A pool of exotica
 * would make every real visitor look common, which is a flattering lie.
 *
 * One archetype is a headless Chromium on a software rasteriser. Machines
 * browse, machines get measured, and machines are in the commons from the first
 * day, unlabeled, on identical terms. It is weighted low because it is rare,
 * not because it is unwelcome.
 */

import type { AttrVector } from '../src/types.js';
import type { Rng } from '../src/prng.js';
import { zoneOffsetMinutes } from '../src/constraints.js';
import { sha256Short } from '../src/hash.js';

type Weighted<T> = readonly (readonly [T, number])[];

export function pickWeighted<T>(rng: Rng, table: Weighted<T>): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, w] of table) {
    r -= w;
    if (r <= 0) return value;
  }
  return table[table.length - 1][0];
}

// ---------------------------------------------------------------- locales

interface LocaleBundle {
  timeZone: string;
  locale: string;
  languages: string;
}

const LOCALES: Weighted<LocaleBundle> = [
  [{ timeZone: 'Europe/Berlin', locale: 'de-DE', languages: 'de-DE,de,en-US,en' }, 9],
  [{ timeZone: 'Europe/Berlin', locale: 'en-GB', languages: 'en-GB,en,de' }, 2],
  [{ timeZone: 'Europe/London', locale: 'en-GB', languages: 'en-GB,en' }, 8],
  [{ timeZone: 'Europe/Paris', locale: 'fr-FR', languages: 'fr-FR,fr,en-US,en' }, 6],
  [{ timeZone: 'Europe/Vienna', locale: 'de-AT', languages: 'de-AT,de,en' }, 2],
  [{ timeZone: 'Europe/Zurich', locale: 'de-CH', languages: 'de-CH,de,fr,en' }, 2],
  [{ timeZone: 'Europe/Madrid', locale: 'es-ES', languages: 'es-ES,es,en' }, 4],
  [{ timeZone: 'Europe/Amsterdam', locale: 'nl-NL', languages: 'nl-NL,nl,en-US,en' }, 3],
  [{ timeZone: 'Europe/Warsaw', locale: 'pl-PL', languages: 'pl-PL,pl,en-US,en' }, 3],
  [{ timeZone: 'Europe/Istanbul', locale: 'tr-TR', languages: 'tr-TR,tr,en-US,en' }, 3],
  [{ timeZone: 'Europe/Stockholm', locale: 'sv-SE', languages: 'sv-SE,sv,en-US,en' }, 2],
  [{ timeZone: 'America/New_York', locale: 'en-US', languages: 'en-US,en' }, 10],
  [{ timeZone: 'America/Chicago', locale: 'en-US', languages: 'en-US,en' }, 5],
  [{ timeZone: 'America/Los_Angeles', locale: 'en-US', languages: 'en-US,en' }, 7],
  [{ timeZone: 'America/Sao_Paulo', locale: 'pt-BR', languages: 'pt-BR,pt,en-US,en' }, 4],
  [{ timeZone: 'America/Mexico_City', locale: 'es-MX', languages: 'es-MX,es,en' }, 3],
  [{ timeZone: 'Asia/Tokyo', locale: 'ja-JP', languages: 'ja-JP,ja,en-US,en' }, 5],
  [{ timeZone: 'Asia/Seoul', locale: 'ko-KR', languages: 'ko-KR,ko,en-US,en' }, 3],
  [{ timeZone: 'Asia/Shanghai', locale: 'zh-CN', languages: 'zh-CN,zh,en' }, 4],
  [{ timeZone: 'Asia/Kolkata', locale: 'en-IN', languages: 'en-IN,en,hi' }, 4],
  [{ timeZone: 'Australia/Sydney', locale: 'en-AU', languages: 'en-AU,en' }, 3],
  [{ timeZone: 'Africa/Lagos', locale: 'en-NG', languages: 'en-NG,en' }, 2],
  [{ timeZone: 'UTC', locale: 'en-US', languages: 'en-US,en' }, 2],
];

// ---------------------------------------------------------------- WebGL extension sets

const EXT_CHROMIUM_DESKTOP = [
  'EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'EXT_disjoint_timer_query_webgl2',
  'EXT_float_blend', 'EXT_texture_compression_bptc', 'EXT_texture_compression_rgtc',
  'EXT_texture_filter_anisotropic', 'EXT_texture_norm16', 'KHR_parallel_shader_compile',
  'OES_draw_buffers_indexed', 'OES_texture_float_linear', 'OVR_multiview2',
  'WEBGL_blend_func_extended', 'WEBGL_clip_cull_distance', 'WEBGL_compressed_texture_s3tc',
  'WEBGL_compressed_texture_s3tc_srgb', 'WEBGL_debug_renderer_info', 'WEBGL_debug_shaders',
  'WEBGL_draw_instanced_base_vertex_base_instance', 'WEBGL_lose_context', 'WEBGL_multi_draw',
  'WEBGL_multi_draw_instanced_base_vertex_base_instance', 'WEBGL_provoking_vertex',
];

const EXT_CHROMIUM_ANDROID = [
  'EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'EXT_disjoint_timer_query_webgl2',
  'EXT_float_blend', 'EXT_texture_filter_anisotropic', 'EXT_texture_norm16',
  'KHR_parallel_shader_compile', 'OES_draw_buffers_indexed', 'OES_texture_float_linear',
  'OVR_multiview2', 'WEBGL_clip_cull_distance', 'WEBGL_compressed_texture_astc',
  'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_etc1', 'WEBGL_debug_renderer_info',
  'WEBGL_debug_shaders', 'WEBGL_lose_context', 'WEBGL_multi_draw', 'WEBGL_provoking_vertex',
];

const EXT_SAFARI = [
  'EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'EXT_float_blend',
  'EXT_texture_compression_bptc', 'EXT_texture_compression_rgtc',
  'EXT_texture_filter_anisotropic', 'EXT_texture_norm16', 'KHR_parallel_shader_compile',
  'OES_draw_buffers_indexed', 'OES_texture_float_linear', 'WEBGL_compressed_texture_astc',
  'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_etc1', 'WEBGL_debug_renderer_info',
  'WEBGL_debug_shaders', 'WEBGL_lose_context', 'WEBGL_multi_draw',
];

const EXT_FIREFOX = [
  'EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'EXT_disjoint_timer_query',
  'EXT_float_blend', 'EXT_texture_compression_bptc', 'EXT_texture_compression_rgtc',
  'EXT_texture_filter_anisotropic', 'EXT_texture_norm16', 'MOZ_debug',
  'OES_draw_buffers_indexed', 'OES_texture_float_linear', 'OVR_multiview2',
  'WEBGL_color_buffer_float', 'WEBGL_compressed_texture_s3tc',
  'WEBGL_compressed_texture_s3tc_srgb', 'WEBGL_debug_renderer_info', 'WEBGL_debug_shaders',
  'WEBGL_lose_context', 'WEBGL_provoking_vertex',
];

const EXT_SOFTWARE = [
  'EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'EXT_float_blend',
  'EXT_texture_filter_anisotropic', 'KHR_parallel_shader_compile', 'OES_texture_float_linear',
  'WEBGL_compressed_texture_s3tc', 'WEBGL_debug_renderer_info', 'WEBGL_debug_shaders',
  'WEBGL_lose_context',
];

// ---------------------------------------------------------------- voices

const VOICES_MACOS = [
  'Albert|en-US|1', 'Alex|en-US|1', 'Alice|it-IT|1', 'Amelie|fr-CA|1', 'Anna|de-DE|1',
  'Daniel|en-GB|1', 'Fiona|en-Scotland|1', 'Fred|en-US|1', 'Karen|en-AU|1', 'Kyoko|ja-JP|1',
  'Moira|en-IE|1', 'Monica|es-ES|1', 'Nicolas|fr-CA|1', 'Samantha|en-US|1', 'Tessa|en-ZA|1',
  'Thomas|fr-FR|1', 'Victoria|en-US|1', 'Yuna|ko-KR|1', 'Zosia|pl-PL|1',
];

const VOICES_WINDOWS = [
  'Microsoft David - English (United States)|en-US|1',
  'Microsoft Zira - English (United States)|en-US|1',
  'Microsoft Mark - English (United States)|en-US|1',
  'Microsoft Hazel - English (Great Britain)|en-GB|1',
  'Microsoft Katja - German (Germany)|de-DE|1',
  'Microsoft Hedda - German (Germany)|de-DE|1',
  'Microsoft Hortense - French (France)|fr-FR|1',
  'Microsoft Helena - Spanish (Spain)|es-ES|1',
];

const VOICES_ANDROID = [
  'Google US English|en-US|0', 'Google UK English Female|en-GB|0',
  'Google UK English Male|en-GB|0', 'Google Deutsch|de-DE|0',
  'Google francais|fr-FR|0', 'Google espanol|es-ES|0',
  'Google Nederlands|nl-NL|0', 'Google polski|pl-PL|0',
];

// ---------------------------------------------------------------- archetypes

interface Archetype {
  name: string;
  weight: number;
  build: (rng: Rng, locale: LocaleBundle) => AttrVector;
}

const chromeVersion = (rng: Rng) => `${pickWeighted(rng, [[136, 3], [137, 5], [138, 6], [139, 4]] as const)}`;
const safariVersion = (rng: Rng) => pickWeighted(rng, [['17.6', 2], ['18.3', 4], ['18.5', 5], ['26.0', 3]] as const);
const firefoxVersion = (rng: Rng) => `${pickWeighted(rng, [[139, 3], [140, 5], [141, 4]] as const)}`;

const chromiumBrands = (v: string, mobile: boolean) =>
  JSON.stringify([
    { brand: 'Chromium', version: v },
    { brand: mobile ? 'Google Chrome' : 'Google Chrome', version: v },
    { brand: 'Not=A?Brand', version: '24' },
  ]);

/**
 * Font bitmasks over the ~64 candidate faces.
 *
 * Drawn from a small set of real deployment profiles per platform — a stock
 * install, a stock install plus an office suite, plus a design toolchain — and
 * not from random bits. Random bits would make every entry's font set unique,
 * which is both false about the world and fatal to the model: an attribute that
 * is unique per row is an identifier, the tree learns nothing from it, and the
 * forge cannot sample it. Real font sets cluster hard by platform. So do these.
 */
const FONT_PROFILES: Record<string, Weighted<string>> = {
  windows: [
    ['00000000ff3f01ff', 10], // stock Windows
    ['00000003ff3f01ff', 7], // + Office
    ['0000001fff3f01ff', 3], // + Creative Cloud
    ['00000000ff3f03ff', 4], // + a language pack
    ['0000003fff7f01ff', 2], // a developer machine
  ],
  mac: [
    ['00000000fffe03ff', 11], // stock macOS
    ['00000007fffe03ff', 6], // + Office
    ['0000003ffffe03ff', 3], // + Creative Cloud
    ['00000000fffe07ff', 4],
  ],
  ios: [
    ['000000003ffe01ff', 14],
    ['000000003ffe03ff', 5],
  ],
  android: [
    ['000000001f0e00ff', 12],
    ['000000001f0e01ff', 5],
    ['000000003f0e00ff', 3],
  ],
  linux: [
    ['0000000003f000ff', 8],
    ['0000000007f000ff', 5],
    ['000000000ff001ff', 3],
  ],
  headless: [
    ['00000000000100ff', 9],
    ['000000000001007f', 3],
  ],
};

function popcount(hex: string): number {
  let count = 0;
  for (const word of [parseInt(hex.slice(0, 8), 16) >>> 0, parseInt(hex.slice(8, 16), 16) >>> 0]) {
    let w = word >>> 0;
    while (w) {
      count += w & 1;
      w >>>= 1;
    }
  }
  return count;
}

function fontProfile(rng: Rng, family: keyof typeof FONT_PROFILES): { mask: string; count: number } {
  const mask = pickWeighted(rng, FONT_PROFILES[family]);
  return { mask, count: popcount(mask) };
}

/** Deterministic from platform and locale. A voice list is an install, not a dice roll. */
function voiceSubset(all: readonly string[], locale: string): { list: string; count: number } {
  const lang = locale.split('-')[0];
  const list = all
    .filter((v) => {
      const l = v.split('|')[1];
      return l.startsWith('en') || l.startsWith(lang);
    })
    .sort();
  return { list: list.join(';'), count: list.length };
}

/**
 * Math quirks are a property of the JavaScript engine and the floating-point
 * unit under it, so there are a handful of distinct values in the world, not
 * one per person.
 */
const MATH_QUIRKS: Record<string, string> = {
  'v8-x64': sha256Short('math:v8:x64', 24),
  'v8-arm64': sha256Short('math:v8:arm64', 24),
  'jsc-arm64': sha256Short('math:jsc:arm64', 24),
  'jsc-x64': sha256Short('math:jsc:x64', 24),
  'spidermonkey-x64': sha256Short('math:spidermonkey:x64', 24),
};

/**
 * The per-device digests.
 *
 * Derived from the hardware and font stack rather than from the entry's serial
 * number, because that is how the real ones behave: two identical laptops with
 * identical font sets produce identical canvas output. A minority get a unique
 * value, which is also true — a driver revision or a single extra font is
 * enough to split a cluster.
 */
function digests(rng: Rng, attrs: AttrVector, seed: string): AttrVector {
  const hardware = [
    attrs['webgl.renderer'],
    attrs['nav.platform'],
    attrs['fonts.bitmask'],
    attrs['screen.pixelRatio'],
    attrs['nav.userAgent'],
  ].join('|');
  const unique = rng() < 0.3 ? `:${seed}` : '';
  return {
    'canvas.hash': sha256Short(`${hardware}${unique}:canvas`, 32),
    'canvas.emoji': sha256Short(`${hardware}${unique}:emoji`, 32),
    'webgl.scene': sha256Short(`${hardware}${unique}:scene`, 32),
  };
}

/**
 * Audio-context sums, per engine and platform.
 *
 * The compressor output is a function of the build and the floating-point unit,
 * so the population lands on a small number of values with a long thin tail,
 * not on a continuum. Same reasoning as the font profiles above.
 */
const AUDIO_SUMS: Record<string, Weighted<number>> = {
  'chromium-win': [[124.043445, 6], [124.043478, 5], [124.043462, 3], [124.04338, 1]],
  'chromium-mac': [[124.043716, 6], [124.043705, 4], [124.04369, 1]],
  'chromium-android': [[124.080323, 5], [124.080119, 4], [124.084899, 3], [124.080227, 1]],
  'chromium-linux': [[35.749825, 5], [35.749838, 3], [124.043423, 2]],
  'safari-mac': [[124.080347, 6], [124.080409, 4], [124.080298, 1]],
  'safari-ios': [[124.043586, 7], [124.043604, 4], [124.043571, 1]],
  'firefox-win': [[35.749294, 6], [35.749291, 4], [35.749302, 1]],
  software: [[35.749054, 6], [35.749051, 3]],
};

const DESKTOP_LIMITS = 'maxTexture=16384;maxViewport=32767x32767;maxRenderbuffer=16384';
const MOBILE_LIMITS = 'maxTexture=8192;maxViewport=8192x8192;maxRenderbuffer=8192';
const FULL_PRECISION = 'vh=127,127,23;vm=127,127,23;fh=127,127,23;fm=127,127,23';
const MOBILE_PRECISION = 'vh=127,127,23;vm=15,15,10;fh=127,127,23;fm=15,15,10';

const DESKTOP_SCREENS: Weighted<[number, number, number]> = [
  [[1920, 1080, 1], 14],
  [[2560, 1440, 1], 6],
  [[1920, 1080, 1.25], 5],
  [[1536, 864, 1.25], 4],
  [[3840, 2160, 1.5], 3],
  [[1366, 768, 1], 4],
  [[2560, 1600, 2], 3],
  [[1680, 1050, 1], 2],
];

const MAC_SCREENS: Weighted<[number, number, number]> = [
  [[1512, 982, 2], 6],
  [[1728, 1117, 2], 5],
  [[1440, 900, 2], 4],
  [[2560, 1440, 2], 3],
  [[3456, 2234, 2], 2],
];

const IPHONE_SCREENS: Weighted<[number, number, number]> = [
  [[393, 852, 3], 8],
  [[390, 844, 3], 6],
  [[430, 932, 3], 5],
  [[375, 812, 3], 3],
  [[402, 874, 3], 4],
];

const ANDROID_SCREENS: Weighted<[number, number, number]> = [
  [[412, 915, 2.625], 8],
  [[360, 800, 3], 6],
  [[384, 832, 2.8125], 4],
  [[412, 892, 3.5], 3],
];

function cssEnv(rng: Rng, pointer: 'fine' | 'coarse'): string {
  return [
    `color-scheme=${pickWeighted(rng, [['dark', 5], ['light', 5]] as const)}`,
    `reduced-motion=${rng() < 0.08 ? 'reduce' : 'no-preference'}`,
    `contrast=${rng() < 0.05 ? 'more' : 'no-preference'}`,
    `forced-colors=${rng() < 0.02 ? 'active' : 'none'}`,
    `dynamic-range=${rng() < 0.35 ? 'high' : 'standard'}`,
    `gamut=${pickWeighted(rng, [['srgb', 4], ['p3', 6]] as const)}`,
    `pointer=${pointer}`,
    `hover=${pointer === 'fine' ? 'hover' : 'none'}`,
  ].join(';');
}

const QUOTA_BUCKETS: Weighted<number> = [
  [2 ** 33, 3], [2 ** 34, 6], [2 ** 35, 8], [2 ** 36, 5], [2 ** 37, 2],
];

function deviceCounts(rng: Rng, camera: boolean): string {
  const audioIn = camera ? 1 + rng.int(3) : rng.int(2);
  const audioOut = camera ? 1 + rng.int(3) : rng.int(2);
  const video = camera ? 1 + rng.int(2) : 0;
  return `audioinput=${audioIn};audiooutput=${audioOut};videoinput=${video}`;
}

const CODEC_MASKS: Record<string, string> = {
  chromium: '3f7ffe',
  safari: '1c3ef8',
  firefox: '2f5ffa',
  software: '0c30f0',
};

export const ARCHETYPES: readonly Archetype[] = [
  {
    name: 'windows-chrome-intel',
    weight: 14,
    build: (rng, locale) => {
      const v = chromeVersion(rng);
      const [w, h, dpr] = pickWeighted(rng, DESKTOP_SCREENS);
      const fonts = fontProfile(rng, 'windows');
      const voices = voiceSubset(VOICES_WINDOWS, locale.locale);
      return {
        'nav.userAgent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
        'nav.platform': 'Win32',
        'webgl.vendor': 'Google Inc. (Intel)',
        'webgl.renderer': `ANGLE (Intel, Intel(R) ${pickWeighted(rng, [['UHD Graphics 620', 3], ['Iris(R) Xe Graphics', 6], ['UHD Graphics 770', 4]] as const)} (0x0000${rng.int(9000) + 1000}) Direct3D11 vs_5_0 ps_5_0, D3D11)`,
        'webgl.extensions': EXT_CHROMIUM_DESKTOP.join(','),
        'webgl.precision': FULL_PRECISION,
        'webgl.limits': DESKTOP_LIMITS,
        'nav.hardwareConcurrency': pickWeighted(rng, [[4, 3], [8, 8], [12, 5], [16, 4]] as const),
        'nav.deviceMemory': pickWeighted(rng, [[4, 3], [8, 8]] as const),
        'nav.maxTouchPoints': rng() < 0.15 ? 10 : 0,
        'nav.pdfViewerEnabled': true,
        'nav.webdriver': false,
        'ch.brands': chromiumBrands(v, false),
        'ch.platformVersion': pickWeighted(rng, [['10.0.0', 4], ['15.0.0', 6], ['19.0.0', 3]] as const),
        'ch.architecture': 'x86',
        'ch.model': '',
        'screen.resolution': `${w}x${h}`,
        'screen.avail': `${w}x${h - 40}`,
        'screen.colorDepth': 24,
        'screen.pixelRatio': dpr,
        'fonts.bitmask': fonts.mask,
        'fonts.count': fonts.count,
        'voices.list': voices.list,
        'voices.count': voices.count,
        'codecs.bitmask': CODEC_MASKS.chromium,
        'css.env': cssEnv(rng, 'fine'),
        'devices.counts': deviceCounts(rng, rng() < 0.7),
        'storage.quota': pickWeighted(rng, QUOTA_BUCKETS),
        'audio.sum': pickWeighted(rng, AUDIO_SUMS['chromium-win']),
        'math.quirks': MATH_QUIRKS['v8-x64'],
      };
    },
  },
  {
    name: 'windows-chrome-nvidia',
    weight: 11,
    build: (rng, locale) => {
      const base = ARCHETYPES[0].build(rng, locale);
      const card = pickWeighted(rng, [['RTX 3060', 4], ['RTX 4070', 5], ['GTX 1650', 3], ['RTX 4090', 2]] as const);
      return {
        ...base,
        'webgl.vendor': 'Google Inc. (NVIDIA)',
        'webgl.renderer': `ANGLE (NVIDIA, NVIDIA GeForce ${card} (0x0000${rng.int(9000) + 1000}) Direct3D11 vs_5_0 ps_5_0, D3D11)`,
        'nav.hardwareConcurrency': pickWeighted(rng, [[8, 3], [12, 5], [16, 6], [24, 3], [32, 2]] as const),
        'nav.deviceMemory': 8,
      };
    },
  },
  {
    name: 'windows-firefox',
    weight: 6,
    build: (rng, locale) => {
      const v = firefoxVersion(rng);
      const [w, h, dpr] = pickWeighted(rng, DESKTOP_SCREENS);
      const fonts = fontProfile(rng, 'windows');
      const voices = voiceSubset(VOICES_WINDOWS, locale.locale);
      return {
        'nav.userAgent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`,
        'nav.platform': 'Win32',
        'webgl.vendor': 'Mozilla',
        'webgl.renderer': `ANGLE (NVIDIA, NVIDIA GeForce ${pickWeighted(rng, [['RTX 3060', 4], ['GTX 1660', 3]] as const)} Direct3D11 vs_5_0 ps_5_0, D3D11)`,
        'webgl.extensions': EXT_FIREFOX.join(','),
        'webgl.precision': FULL_PRECISION,
        'webgl.limits': DESKTOP_LIMITS,
        'nav.hardwareConcurrency': pickWeighted(rng, [[8, 6], [12, 4], [16, 3]] as const),
        // Firefox does not implement deviceMemory or Client Hints.
        'nav.deviceMemory': null,
        'nav.maxTouchPoints': 0,
        'nav.pdfViewerEnabled': true,
        'nav.webdriver': false,
        'ch.brands': null,
        'ch.platformVersion': null,
        'ch.architecture': null,
        'ch.model': null,
        'screen.resolution': `${w}x${h}`,
        'screen.avail': `${w}x${h - 40}`,
        'screen.colorDepth': 24,
        'screen.pixelRatio': dpr,
        'fonts.bitmask': fonts.mask,
        'fonts.count': fonts.count,
        'voices.list': voices.list,
        'voices.count': voices.count,
        'codecs.bitmask': CODEC_MASKS.firefox,
        'css.env': cssEnv(rng, 'fine'),
        'devices.counts': deviceCounts(rng, rng() < 0.7),
        'storage.quota': pickWeighted(rng, QUOTA_BUCKETS),
        'audio.sum': pickWeighted(rng, AUDIO_SUMS['firefox-win']),
        'math.quirks': MATH_QUIRKS['spidermonkey-x64'],
      };
    },
  },
  {
    name: 'macos-safari',
    weight: 12,
    build: (rng, locale) => {
      const v = safariVersion(rng);
      const [w, h, dpr] = pickWeighted(rng, MAC_SCREENS);
      const fonts = fontProfile(rng, 'mac');
      const voices = voiceSubset(VOICES_MACOS, locale.locale);
      const chip = pickWeighted(rng, [['M1', 4], ['M2', 5], ['M3', 5], ['M4', 3]] as const);
      return {
        'nav.userAgent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v} Safari/605.1.15`,
        'nav.platform': 'MacIntel',
        'webgl.vendor': 'Apple Inc.',
        'webgl.renderer': `Apple GPU (Apple ${chip})`,
        'webgl.extensions': EXT_SAFARI.join(','),
        'webgl.precision': FULL_PRECISION,
        'webgl.limits': DESKTOP_LIMITS,
        'nav.hardwareConcurrency': pickWeighted(rng, [[8, 6], [10, 5], [12, 3], [14, 2]] as const),
        'nav.deviceMemory': null,
        'nav.maxTouchPoints': 0,
        'nav.pdfViewerEnabled': true,
        'nav.webdriver': false,
        'ch.brands': null,
        'ch.platformVersion': null,
        'ch.architecture': null,
        'ch.model': null,
        'screen.resolution': `${w}x${h}`,
        'screen.avail': `${w}x${h - 38}`,
        'screen.colorDepth': pickWeighted(rng, [[24, 3], [30, 7]] as const),
        'screen.pixelRatio': dpr,
        'fonts.bitmask': fonts.mask,
        'fonts.count': fonts.count,
        'voices.list': voices.list,
        'voices.count': voices.count,
        'codecs.bitmask': CODEC_MASKS.safari,
        'css.env': cssEnv(rng, 'fine'),
        'devices.counts': deviceCounts(rng, true),
        'storage.quota': pickWeighted(rng, QUOTA_BUCKETS),
        'audio.sum': pickWeighted(rng, AUDIO_SUMS['safari-mac']),
        'math.quirks': MATH_QUIRKS['jsc-arm64'],
      };
    },
  },
  {
    name: 'macos-chrome',
    weight: 8,
    build: (rng, locale) => {
      const base = ARCHETYPES[3].build(rng, locale);
      const v = chromeVersion(rng);
      return {
        ...base,
        'nav.userAgent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
        'webgl.vendor': 'Google Inc. (Apple)',
        'webgl.extensions': EXT_CHROMIUM_DESKTOP.join(','),
        'nav.deviceMemory': 8,
        'ch.brands': chromiumBrands(v, false),
        'ch.platformVersion': pickWeighted(rng, [['14.5.0', 4], ['15.3.0', 6]] as const),
        'ch.architecture': 'arm',
        'ch.model': '',
        'codecs.bitmask': CODEC_MASKS.chromium,
      };
    },
  },
  {
    name: 'iphone-safari',
    weight: 13,
    build: (rng, locale) => {
      const v = safariVersion(rng);
      const [w, h, dpr] = pickWeighted(rng, IPHONE_SCREENS);
      const fonts = fontProfile(rng, 'ios');
      const voices = voiceSubset(VOICES_MACOS, locale.locale);
      const major = v.split('.')[0];
      return {
        'nav.userAgent': `Mozilla/5.0 (iPhone; CPU iPhone OS ${major}_${rng.int(5)} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v} Mobile/15E148 Safari/604.1`,
        'nav.platform': 'iPhone',
        'webgl.vendor': 'Apple Inc.',
        'webgl.renderer': 'Apple GPU',
        'webgl.extensions': EXT_SAFARI.join(','),
        'webgl.precision': FULL_PRECISION,
        'webgl.limits': MOBILE_LIMITS,
        'nav.hardwareConcurrency': pickWeighted(rng, [[6, 7], [8, 3]] as const),
        'nav.deviceMemory': null,
        'nav.maxTouchPoints': 5,
        'nav.pdfViewerEnabled': true,
        'nav.webdriver': false,
        'ch.brands': null,
        'ch.platformVersion': null,
        'ch.architecture': null,
        'ch.model': null,
        'screen.resolution': `${w}x${h}`,
        'screen.avail': `${w}x${h}`,
        'screen.colorDepth': pickWeighted(rng, [[24, 3], [30, 7]] as const),
        'screen.pixelRatio': dpr,
        'fonts.bitmask': fonts.mask,
        'fonts.count': fonts.count,
        'voices.list': voices.list,
        'voices.count': voices.count,
        'codecs.bitmask': CODEC_MASKS.safari,
        'css.env': cssEnv(rng, 'coarse'),
        'devices.counts': deviceCounts(rng, true),
        'storage.quota': pickWeighted(rng, [[2 ** 32, 4], [2 ** 33, 6], [2 ** 34, 3]] as const),
        'audio.sum': pickWeighted(rng, AUDIO_SUMS['safari-ios']),
        'math.quirks': MATH_QUIRKS['jsc-arm64'],
      };
    },
  },
  {
    name: 'android-chrome',
    weight: 15,
    build: (rng, locale) => {
      const v = chromeVersion(rng);
      const [w, h, dpr] = pickWeighted(rng, ANDROID_SCREENS);
      const fonts = fontProfile(rng, 'android');
      const voices = voiceSubset(VOICES_ANDROID, locale.locale);
      const gpu = pickWeighted(rng, [
        ['Adreno (TM) 740', 5], ['Adreno (TM) 730', 4], ['Mali-G715', 3],
        ['Mali-G78', 3], ['Xclipse 940', 2],
      ] as const);
      const model = pickWeighted(rng, [
        ['SM-S911B', 4], ['Pixel 8', 4], ['Pixel 7a', 3], ['SM-A546B', 3], ['2201116SG', 2],
      ] as const);
      const androidV = pickWeighted(rng, [['13', 4], ['14', 6], ['15', 4]] as const);
      return {
        'nav.userAgent': `Mozilla/5.0 (Linux; Android ${androidV}; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Mobile Safari/537.36`,
        'nav.platform': 'Linux armv8l',
        'webgl.vendor': gpu.startsWith('Adreno') ? 'Qualcomm' : 'ARM',
        'webgl.renderer': gpu,
        'webgl.extensions': EXT_CHROMIUM_ANDROID.join(','),
        'webgl.precision': MOBILE_PRECISION,
        'webgl.limits': MOBILE_LIMITS,
        'nav.hardwareConcurrency': pickWeighted(rng, [[8, 8], [6, 3]] as const),
        'nav.deviceMemory': pickWeighted(rng, [[4, 5], [8, 5]] as const),
        'nav.maxTouchPoints': 5,
        'nav.pdfViewerEnabled': false,
        'nav.webdriver': false,
        'ch.brands': chromiumBrands(v, true),
        'ch.platformVersion': `${androidV}.0.0`,
        'ch.architecture': '',
        'ch.model': model,
        'screen.resolution': `${w}x${h}`,
        'screen.avail': `${w}x${h}`,
        'screen.colorDepth': 24,
        'screen.pixelRatio': dpr,
        'fonts.bitmask': fonts.mask,
        'fonts.count': fonts.count,
        'voices.list': voices.list,
        'voices.count': voices.count,
        'codecs.bitmask': CODEC_MASKS.chromium,
        'css.env': cssEnv(rng, 'coarse'),
        'devices.counts': deviceCounts(rng, true),
        'storage.quota': pickWeighted(rng, [[2 ** 32, 4], [2 ** 33, 6], [2 ** 34, 3]] as const),
        'audio.sum': pickWeighted(rng, AUDIO_SUMS['chromium-android']),
        'math.quirks': MATH_QUIRKS['v8-arm64'],
      };
    },
  },
  {
    name: 'linux-chrome',
    weight: 4,
    build: (rng, locale) => {
      const v = chromeVersion(rng);
      const [w, h, dpr] = pickWeighted(rng, DESKTOP_SCREENS);
      const fonts = fontProfile(rng, 'linux');
      return {
        'nav.userAgent': `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
        'nav.platform': 'Linux x86_64',
        'webgl.vendor': 'Google Inc. (AMD)',
        'webgl.renderer': `ANGLE (AMD, AMD Radeon Graphics (radeonsi, ${pickWeighted(rng, [['renoir', 3], ['navi23', 4]] as const)}, LLVM 18.1.8, DRM 3.57, 6.11.0), OpenGL 4.6)`,
        'webgl.extensions': EXT_CHROMIUM_DESKTOP.join(','),
        'webgl.precision': FULL_PRECISION,
        'webgl.limits': DESKTOP_LIMITS,
        'nav.hardwareConcurrency': pickWeighted(rng, [[8, 5], [12, 4], [16, 3]] as const),
        'nav.deviceMemory': 8,
        'nav.maxTouchPoints': 0,
        'nav.pdfViewerEnabled': true,
        'nav.webdriver': false,
        'ch.brands': chromiumBrands(v, false),
        'ch.platformVersion': '6.11.0',
        'ch.architecture': 'x86',
        'ch.model': '',
        'screen.resolution': `${w}x${h}`,
        'screen.avail': `${w}x${h - 27}`,
        'screen.colorDepth': 24,
        'screen.pixelRatio': dpr,
        'fonts.bitmask': fonts.mask,
        'fonts.count': fonts.count,
        // Linux desktops routinely ship no speech synthesis at all.
        'voices.list': '',
        'voices.count': 0,
        'codecs.bitmask': CODEC_MASKS.chromium,
        'css.env': cssEnv(rng, 'fine'),
        'devices.counts': deviceCounts(rng, rng() < 0.5),
        'storage.quota': pickWeighted(rng, QUOTA_BUCKETS),
        'audio.sum': pickWeighted(rng, AUDIO_SUMS['chromium-linux']),
        'math.quirks': MATH_QUIRKS['v8-x64'],
      };
    },
  },
  {
    /**
     * Headless Chromium on a software rasteriser. It is in the launch pool
     * because agents browse and agents are measured, on identical terms and
     * without a label. Nothing downstream branches on it.
     */
    name: 'headless-chromium',
    weight: 2,
    build: (rng, locale) => {
      const v = chromeVersion(rng);
      const fonts = fontProfile(rng, 'headless');
      // One draw, used for both fields: a headless viewport occupies the whole
      // of its own virtual screen.
      const viewport = pickWeighted(rng, [['1280x720', 4], ['1920x1080', 6], ['800x600', 2]] as const);
      return {
        'nav.userAgent': `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/${v}.0.0.0 Safari/537.36`,
        'nav.platform': 'Linux x86_64',
        'webgl.vendor': 'Google Inc. (Google)',
        'webgl.renderer': pickWeighted(rng, [
          ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 6],
          ['Mesa OffScreen', 2],
          ['llvmpipe (LLVM 18.1.8, 256 bits)', 3],
        ] as const),
        'webgl.extensions': EXT_SOFTWARE.join(','),
        'webgl.precision': FULL_PRECISION,
        'webgl.limits': 'maxTexture=8192;maxViewport=8192x8192;maxRenderbuffer=8192',
        'nav.hardwareConcurrency': pickWeighted(rng, [[2, 4], [4, 6], [8, 3]] as const),
        'nav.deviceMemory': pickWeighted(rng, [[4, 5], [8, 5]] as const),
        'nav.maxTouchPoints': 0,
        'nav.pdfViewerEnabled': false,
        'nav.webdriver': rng() < 0.5,
        'ch.brands': chromiumBrands(v, false),
        'ch.platformVersion': '',
        'ch.architecture': 'x86',
        'ch.model': '',
        'screen.resolution': viewport,
        'screen.avail': viewport,
        'screen.colorDepth': 24,
        'screen.pixelRatio': 1,
        'fonts.bitmask': fonts.mask,
        'fonts.count': fonts.count,
        'voices.list': '',
        'voices.count': 0,
        'codecs.bitmask': CODEC_MASKS.software,
        'css.env': 'color-scheme=light;reduced-motion=no-preference;contrast=no-preference;forced-colors=none;dynamic-range=standard;gamut=srgb;pointer=fine;hover=hover',
        'devices.counts': 'audioinput=0;audiooutput=0;videoinput=0',
        'storage.quota': 2 ** 31,
        'audio.sum': pickWeighted(rng, AUDIO_SUMS['software']),
        'math.quirks': MATH_QUIRKS['v8-x64'],
      };
    },
  },
];

export interface PriorSample {
  attrs: AttrVector;
  archetype: string;
  /** Automation likelihood, stored as an attribute of the entry and never used to gate anything. */
  automation: number;
}

export function sampleFromPrior(rng: Rng, seed: string): PriorSample {
  const table: Weighted<Archetype> = ARCHETYPES.map((a) => [a, a.weight] as const);
  const archetype = pickWeighted(rng, table);
  const locale = pickWeighted(rng, LOCALES);

  const attrs = archetype.build(rng, locale);
  const offset = zoneOffsetMinutes(locale.timeZone, new Date());

  Object.assign(attrs, {
    'intl.timeZone': locale.timeZone,
    'intl.locale': locale.locale,
    'nav.languages': locale.languages,
    'intl.calendar': 'gregory|latn',
    'intl.offset': offset,
  });
  // After the rest, because the digests are derived from the hardware and font
  // stack the archetype just chose.
  Object.assign(attrs, digests(rng, attrs, seed));

  // A hand-set estimate, in the same range the client-side classifier produces.
  // It is recorded because §4a says it is recorded, and read by nothing else.
  const automation =
    archetype.name === 'headless-chromium'
      ? 0.72 + rng() * 0.24
      : Math.min(0.35, Math.max(0.01, 0.06 + rng.normal() * 0.05));

  return { attrs, archetype: archetype.name, automation };
}

/**
 * Rare, coherent variation applied after the archetype: a corporate font
 * deployment, an unusual core count, a browser in a language nobody around it
 * speaks. Real pools have long tails, and a prior without one produces a
 * suspiciously tidy monument.
 */
export function applyTail(rng: Rng, attrs: AttrVector): AttrVector {
  if (rng() < 0.05) {
    attrs['css.env'] = String(attrs['css.env']).replace('reduced-motion=no-preference', 'reduced-motion=reduce');
  }
  // A machine sitting in one place with its interface in another language. Common
  // among people who have moved, and it puts a real seam in the correlation
  // structure the tree would otherwise learn too cleanly.
  if (rng() < 0.06 && typeof attrs['nav.languages'] === 'string') {
    attrs['nav.languages'] = `en-US,en,${String(attrs['intl.locale'])}`;
    attrs['intl.locale'] = 'en-US';
  }
  // An unusually large monitor on an otherwise ordinary desktop.
  if (rng() < 0.04 && attrs['screen.resolution'] === '1920x1080') {
    attrs['screen.resolution'] = '3440x1440';
    attrs['screen.avail'] = '3440x1400';
  }
  return attrs;
}

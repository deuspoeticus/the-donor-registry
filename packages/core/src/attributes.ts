/**
 * The attribute manifest.
 *
 * One list, read by the collector, the entropy model, the forge, the shader and
 * the userscript emitter. If an attribute is not here it does not exist to the
 * piece.
 *
 * Everything is treated as categorical. Numeric surfaces are bucketed at
 * collection time rather than here, and the genuinely continuous ones (the
 * audio sum, the canvas hash) are categorical in the only sense that matters:
 * the forge can only ever emit a value it has already seen in the pool. That is
 * a constraint, not a limitation — an invented canvas hash is a hash of nothing
 * and would fail against any renderer that checked.
 */

import type { AttrValue } from './types.js';

/**
 * Which corruption *character* this attribute produces when it is the dominant
 * contributor to the visitor's surprisal (§6b). Not decoration: the shader
 * switches on this value.
 */
export type GlitchChannel = 'canvas' | 'webgl' | 'audio' | 'fonts' | 'timezone' | 'none';

export type AttrGroup =
  | 'Canvas 2D'
  | 'WebGL'
  | 'Audio'
  | 'Navigator'
  | 'Client Hints'
  | 'Screen'
  | 'Intl'
  | 'Fonts'
  | 'Voices'
  | 'Codecs'
  | 'CSS env'
  | 'Devices'
  | 'Math'
  | 'Storage';

export interface AttrDef {
  id: string;
  group: AttrGroup;
  /** Shown in the catalogue and the payload preview. Names the surface, not the vibe. */
  label: string;
  glitch: GlitchChannel;
  /** Whether the emitted userscript can actually override this surface. Claimed nowhere else. */
  wearable: boolean;
  /** Excluded from the forge's tree: values are per-device secrets that cannot be recombined. */
  forgeVerbatim?: boolean;
}

export const ATTRIBUTES: readonly AttrDef[] = [
  { id: 'canvas.hash', group: 'Canvas 2D', label: 'Canvas render hash', glitch: 'canvas', wearable: true, forgeVerbatim: true },
  { id: 'canvas.emoji', group: 'Canvas 2D', label: 'Emoji composite hash', glitch: 'canvas', wearable: true, forgeVerbatim: true },

  { id: 'webgl.vendor', group: 'WebGL', label: 'Unmasked vendor', glitch: 'webgl', wearable: true },
  { id: 'webgl.renderer', group: 'WebGL', label: 'Unmasked renderer', glitch: 'webgl', wearable: true },
  // Stored as the literal list rather than a digest. A digest would be smaller,
  // but you cannot wear a digest — the userscript has to hand a detector the
  // actual extension names, so the actual names are what the pool holds.
  { id: 'webgl.extensions', group: 'WebGL', label: 'Supported extensions', glitch: 'webgl', wearable: true },
  { id: 'webgl.precision', group: 'WebGL', label: 'Shader precision profile', glitch: 'webgl', wearable: true },
  { id: 'webgl.limits', group: 'WebGL', label: 'Texture and viewport limits', glitch: 'webgl', wearable: true },
  { id: 'webgl.scene', group: 'WebGL', label: 'Rendered scene hash', glitch: 'webgl', wearable: false, forgeVerbatim: true },

  { id: 'audio.sum', group: 'Audio', label: 'Compressor output sum', glitch: 'audio', wearable: true, forgeVerbatim: true },

  { id: 'nav.userAgent', group: 'Navigator', label: 'User agent string', glitch: 'none', wearable: true },
  { id: 'nav.platform', group: 'Navigator', label: 'Platform', glitch: 'none', wearable: true },
  { id: 'nav.hardwareConcurrency', group: 'Navigator', label: 'Logical cores', glitch: 'none', wearable: true },
  { id: 'nav.deviceMemory', group: 'Navigator', label: 'Device memory (GB)', glitch: 'none', wearable: true },
  { id: 'nav.languages', group: 'Navigator', label: 'Accepted languages', glitch: 'none', wearable: true },
  { id: 'nav.maxTouchPoints', group: 'Navigator', label: 'Max touch points', glitch: 'none', wearable: true },
  { id: 'nav.pdfViewerEnabled', group: 'Navigator', label: 'PDF viewer enabled', glitch: 'none', wearable: false },
  { id: 'nav.webdriver', group: 'Navigator', label: 'Webdriver flag', glitch: 'none', wearable: false },

  { id: 'ch.brands', group: 'Client Hints', label: 'Brand list', glitch: 'none', wearable: true },
  { id: 'ch.platformVersion', group: 'Client Hints', label: 'Platform version', glitch: 'none', wearable: true },
  { id: 'ch.architecture', group: 'Client Hints', label: 'Architecture', glitch: 'none', wearable: true },
  { id: 'ch.model', group: 'Client Hints', label: 'Model', glitch: 'none', wearable: true },

  { id: 'screen.resolution', group: 'Screen', label: 'Resolution', glitch: 'none', wearable: true },
  { id: 'screen.avail', group: 'Screen', label: 'Available area', glitch: 'none', wearable: true },
  { id: 'screen.colorDepth', group: 'Screen', label: 'Colour depth', glitch: 'none', wearable: true },
  { id: 'screen.pixelRatio', group: 'Screen', label: 'Device pixel ratio', glitch: 'none', wearable: true },

  { id: 'intl.timeZone', group: 'Intl', label: 'Time zone', glitch: 'timezone', wearable: true },
  { id: 'intl.locale', group: 'Intl', label: 'Resolved locale', glitch: 'timezone', wearable: true },
  { id: 'intl.calendar', group: 'Intl', label: 'Calendar and numbering', glitch: 'timezone', wearable: true },
  { id: 'intl.offset', group: 'Intl', label: 'UTC offset (minutes)', glitch: 'timezone', wearable: true },

  { id: 'fonts.bitmask', group: 'Fonts', label: 'Font presence bitmask', glitch: 'fonts', wearable: false },
  { id: 'fonts.count', group: 'Fonts', label: 'Fonts detected', glitch: 'fonts', wearable: false },

  // Same reasoning as webgl.extensions: the list itself, so it can be handed over.
  { id: 'voices.list', group: 'Voices', label: 'Speech synthesis voices', glitch: 'fonts', wearable: true },
  { id: 'voices.count', group: 'Voices', label: 'Voices available', glitch: 'fonts', wearable: true },

  { id: 'codecs.bitmask', group: 'Codecs', label: 'Codec support bitmask', glitch: 'none', wearable: false },

  { id: 'css.env', group: 'CSS env', label: 'Media feature state', glitch: 'none', wearable: false },

  { id: 'devices.counts', group: 'Devices', label: 'Device counts by kind', glitch: 'none', wearable: false },

  { id: 'math.quirks', group: 'Math', label: 'Math quirk vector hash', glitch: 'none', wearable: false },

  { id: 'storage.quota', group: 'Storage', label: 'Storage quota (bucketed)', glitch: 'none', wearable: false },
] as const;

export const ATTR_IDS: readonly string[] = ATTRIBUTES.map((a) => a.id);

const BY_ID = new Map(ATTRIBUTES.map((a) => [a.id, a]));

export function attrDef(id: string): AttrDef | undefined {
  return BY_ID.get(id);
}

export function attrLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

export function glitchChannel(id: string | null): GlitchChannel {
  if (!id) return 'none';
  return BY_ID.get(id)?.glitch ?? 'none';
}

/** Attributes the forge builds a dependency tree over. */
export const FORGEABLE_IDS: readonly string[] = ATTRIBUTES.filter((a) => !a.forgeVerbatim).map((a) => a.id);

/** Attributes copied wholesale from a donor rather than recombined. See the header. */
export const VERBATIM_IDS: readonly string[] = ATTRIBUTES.filter((a) => a.forgeVerbatim).map((a) => a.id);

/** Attributes the emitted userscript actually overrides. Used to render the honest coverage list. */
export const WEARABLE_IDS: readonly string[] = ATTRIBUTES.filter((a) => a.wearable).map((a) => a.id);

/**
 * Surfaces deliberately not collected, stated in the interface (§2).
 * Kept here so the interface list and the collector cannot drift apart.
 */
export const EXCLUDED_SURFACES: readonly { surface: string; reason: string }[] = [
  { surface: 'WebRTC local IP enumeration', reason: 'Reveals network topology behind NAT. Not needed for the measurement.' },
  { surface: 'Permissioned sensors', reason: 'Accelerometer, gyroscope, microphone, camera. All require a prompt; none are asked for.' },
  { surface: 'Media device labels and IDs', reason: 'Counts by kind only. Labels name your hardware and your room.' },
  { surface: 'Cookies and storage identifiers', reason: 'Nothing is written to your browser except a wear count you can clear.' },
  { surface: 'IP address', reason: 'Not stored by the API, not logged, not hashed into anything retained.' },
  { surface: 'User-Agent request header', reason: 'Your browser sends it and the service neither stores nor logs it; there is no column for it. The UA in the vector is the one JavaScript reads, and you can see it in the payload.' },
];

export function groupsOf(ids: readonly string[]): Map<AttrGroup, AttrDef[]> {
  const out = new Map<AttrGroup, AttrDef[]>();
  for (const id of ids) {
    const def = BY_ID.get(id);
    if (!def) continue;
    const list = out.get(def.group) ?? [];
    list.push(def);
    out.set(def.group, list);
  }
  return out;
}

/** Stable display form for a value, used by the catalogue and the payload preview. */
export function displayValue(v: AttrValue): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

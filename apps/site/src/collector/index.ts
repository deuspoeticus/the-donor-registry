/**
 * The collector (§2).
 *
 * Runs every probe in parallel against a 2500 ms budget. A probe that times out
 * or throws records null, which is itself information: a browser with no
 * WebGL, no speech synthesis and no storage estimate has told you a great deal
 * about itself by refusing to answer.
 *
 * Deliberately not collected, and stated in the interface next to the payload:
 * WebRTC local-IP enumeration, any permissioned sensor, media device labels or
 * IDs, cookies, and any network-layer identifier. See EXCLUDED_SURFACES in the
 * attribute manifest, which is the list the interface renders — so the claim
 * and the code cannot drift apart.
 */

import { ATTR_IDS } from '@wearme/core/attributes';
import { fingerprintId } from '@wearme/core/canonical';
import type { AttrVector, Fingerprint } from '@wearme/core/types';

import { probeCanvas, probeWebGL, type ProbeResult } from './probes-graphics.js';
import { probeAudio, probeCodecs, probeDevices, probeVoices } from './probes-media.js';
import {
  probeClientHints,
  probeCssEnv,
  probeFonts,
  probeIntl,
  probeMath,
  probeNavigator,
  probeScreen,
  probeStorage,
} from './probes-system.js';

const BUDGET_MS = 2500;

interface Probe {
  name: string;
  run: () => ProbeResult | Promise<ProbeResult>;
}

const PROBES: Probe[] = [
  { name: 'canvas', run: probeCanvas },
  { name: 'webgl', run: probeWebGL },
  { name: 'audio', run: probeAudio },
  { name: 'navigator', run: probeNavigator },
  { name: 'clientHints', run: probeClientHints },
  { name: 'screen', run: probeScreen },
  { name: 'intl', run: probeIntl },
  { name: 'fonts', run: probeFonts },
  { name: 'voices', run: () => probeVoices() },
  { name: 'codecs', run: probeCodecs },
  { name: 'cssEnv', run: probeCssEnv },
  { name: 'devices', run: probeDevices },
  { name: 'math', run: probeMath },
  { name: 'storage', run: probeStorage },
];

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export interface CollectionResult extends Fingerprint {
  /** Probes that returned nothing, by name. Shown, because absence is data. */
  failed: string[];
  totalMs: number;
}

export async function collect(): Promise<CollectionResult> {
  const started = performance.now();
  const timings: Record<string, number> = {};
  const failed: string[] = [];
  const attrs: AttrVector = {};

  await Promise.all(
    PROBES.map(async (probe) => {
      const t0 = performance.now();
      const result = await withTimeout(
        Promise.resolve().then(() => probe.run()),
        BUDGET_MS,
        null as ProbeResult | null,
      );
      timings[probe.name] = Math.round(performance.now() - t0);
      if (result === null) {
        failed.push(probe.name);
        return;
      }
      Object.assign(attrs, result);
    }),
  );

  // Every vector carries the full key set in the manifest's order. A missing key
  // and a null value are different claims, and only one of them is true here.
  const normalised: AttrVector = {};
  for (const id of ATTR_IDS) normalised[id] = attrs[id] ?? null;

  return {
    attrs: normalised,
    id: fingerprintId(normalised),
    timings,
    failed,
    totalMs: Math.round(performance.now() - started),
  };
}

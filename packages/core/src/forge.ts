/**
 * The forge (§5). The piece manufactures people.
 *
 * Two stages, because a browser fingerprint has two kinds of attribute and
 * pretending otherwise produces nonsense:
 *
 *   structural — platform, renderer, screen, locale, cores. Correlated, and
 *                recombinable. Sampled ancestrally from the Chow-Liu tree.
 *
 *   verbatim   — the canvas hash, the audio sum, the rendered scene hash. These
 *                are the output of one specific driver on one specific machine.
 *                They cannot be invented: an invented canvas hash is a hash of
 *                nothing, and would fail the moment anything cross-checked it.
 *                So they are grafted from a real donor whose GPU and platform
 *                match the ones just sampled.
 *
 * The result is a chimera, not a hallucination, and it is wearable because
 * every part of it was once true of something.
 *
 * Then the coherence gate, which is the argument: a sample survives only if it
 * breaks no rule in the impossibility manifest and sits above the fifth
 * percentile of real-pool likelihood. Rejections are counted and displayed.
 */

import {
  buildChowLiu,
  logLikelihood,
  logLikelihoodLeaveOneOut,
  partitionByLearnability,
  sampleTree,
} from './chowliu.js';
import type { ChowLiuTree } from './chowliu.js';
import { checkConstraints } from './constraints.js';
import { FORGEABLE_IDS, VERBATIM_IDS } from './attributes.js';
import { fingerprintId } from './canonical.js';
import type { AttrVector } from './types.js';
import type { Rng } from './prng.js';

export interface ForgeStats {
  attempts: number;
  discarded: number;
  discardedByLikelihood: number;
  /** constraint id -> how many samples it killed. Shown in the interface. */
  discardedByConstraint: Record<string, number>;
}

export interface Forgery {
  id: string;
  attrs: AttrVector;
  /** log2 P(structural attributes) under the tree. Feeds the same shader channel as surprisal (§6b). */
  logLikelihood: number;
  /** Where that sits between the floor and the pool median. 0 = barely passed, 1 = typical. */
  plausibility: number;
  /** Id of the pool entry the un-inventable surfaces were grafted from. */
  donorId: string | null;
}

export interface Forge {
  tree: ChowLiuTree;
  /** Fifth-percentile log-likelihood of real pool entries. The floor. */
  threshold: number;
  medianLikelihood: number;
  /** Attributes the tree is fitted over. */
  sampledIds: readonly string[];
  /** Attributes taken from the donor instead: un-inventable, or unmodellable at this pool size. */
  graftedIds: readonly string[];
  stats: ForgeStats;
  /** One coherent identity, or null if maxAttempts is exhausted. Stats are updated either way. */
  forge(rng: Rng): Forgery | null;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return -Infinity;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

export interface PoolEntry {
  id: string;
  attrs: AttrVector;
}

export function createForge(
  pool: readonly PoolEntry[],
  opts: { percentile?: number; maxAttempts?: number } = {},
): Forge {
  const floorPercentile = opts.percentile ?? 5;
  // Coherence is rare. A tree captures pairwise structure, so an ancestral
  // sample routinely produces a machine that is internally contradictory three
  // attributes apart, and the great majority of attempts are thrown away. That
  // is the finding, not a bug to tune around: assembling a person out of
  // independently plausible parts almost never yields a person.
  const maxAttempts = opts.maxAttempts ?? 3000;

  const vectors = pool.map((e) => e.attrs);
  // Anything the pool cannot model at this size joins the verbatim set and gets
  // grafted rather than sampled. Which attributes those are is a fact about the
  // pool, so it is recomputed every time the forge is rebuilt.
  const { learnable, nearUnique } = partitionByLearnability(vectors, FORGEABLE_IDS);
  const grafted = [...VERBATIM_IDS, ...nearUnique];
  const tree = buildChowLiu(vectors, learnable);

  // Leave-one-out, so a real entry is scored as the stranger a forgery is.
  const likelihoods = vectors.map((v) => logLikelihoodLeaveOneOut(tree, v)).sort((a, b) => a - b);
  const threshold = percentile(likelihoods, floorPercentile);
  const medianLikelihood = percentile(likelihoods, 50);

  const stats: ForgeStats = {
    attempts: 0,
    discarded: 0,
    discardedByLikelihood: 0,
    discardedByConstraint: {},
  };

  /**
   * Pick the machine the un-inventable surfaces come from. Renderer and
   * platform first, then platform alone, then anything — each fallback is a
   * weaker claim to coherence, and the last one is why the constraint manifest
   * has to run afterwards rather than instead.
   */
  function chooseDonor(sampled: AttrVector, rng: Rng): PoolEntry | null {
    if (pool.length === 0) return null;
    const tiers = [
      (e: PoolEntry) =>
        e.attrs['webgl.renderer'] === sampled['webgl.renderer'] &&
        e.attrs['nav.platform'] === sampled['nav.platform'],
      (e: PoolEntry) => e.attrs['nav.platform'] === sampled['nav.platform'],
      () => true,
    ];
    for (const match of tiers) {
      const candidates = pool.filter(match);
      if (candidates.length > 0) return rng.pick(candidates);
    }
    return null;
  }

  function forge(rng: Rng): Forgery | null {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      stats.attempts++;

      const structural = sampleTree(tree, rng);
      const donor = chooseDonor(structural, rng);

      const attrs: AttrVector = { ...structural };
      for (const id of grafted) {
        attrs[id] = donor ? (donor.attrs[id] ?? null) : null;
      }

      const ll = logLikelihood(tree, structural);
      if (ll < threshold) {
        stats.discarded++;
        stats.discardedByLikelihood++;
        continue;
      }

      const { ok, violations } = checkConstraints(attrs);
      if (!ok) {
        stats.discarded++;
        for (const v of violations) {
          stats.discardedByConstraint[v] = (stats.discardedByConstraint[v] ?? 0) + 1;
        }
        continue;
      }

      const span = Math.max(1e-9, medianLikelihood - threshold);
      return {
        id: fingerprintId(attrs),
        attrs,
        logLikelihood: ll,
        plausibility: Math.min(1, Math.max(0, (ll - threshold) / span)),
        donorId: donor?.id ?? null,
      };
    }
    return null;
  }

  return {
    tree,
    threshold,
    medianLikelihood,
    sampledIds: learnable,
    graftedIds: grafted,
    stats,
    forge,
  };
}

/**
 * Plausibility of an arbitrary vector against the forge's model, on the same
 * 0..1 scale. Used for pool entries so the shader can drive one corruption
 * channel for everybody — a bad forgery looks like a strange human, which is
 * the point, and is why there is no separate visual language for synthetics.
 */
export function plausibilityOf(forge: Forge, attrs: AttrVector): number {
  const ll = logLikelihoodLeaveOneOut(forge.tree, attrs);
  const span = Math.max(1e-9, forge.medianLikelihood - forge.threshold);
  return Math.min(1, Math.max(0, (ll - forge.threshold) / span));
}

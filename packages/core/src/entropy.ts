/**
 * Entropy (§3).
 *
 * Two numbers, both shown, because they say different things and the
 * difference between them is the argument.
 *
 *   observed  — sum of per-attribute surprisals, -log2(count(v)/N). This is
 *               what every fingerprinting demo on the internet reports, and it
 *               assumes the attributes are independent, which they are not.
 *               It is an overstatement and it is labelled as one.
 *
 *   modelled  — surprisal under the Chow-Liu tree, which subtracts the mutual
 *               information the naive sum double-counts. Smaller, and true.
 *
 * Both are bounded above by log2(N) over the pool they were measured against.
 * A 200-entry pool cannot honestly place anyone at one in a million, and the
 * interface says so at the same size as the number.
 */

import {
  buildChowLiu,
  countAll,
  logLikelihood,
  modelledContributions,
  partitionByLearnability,
  valueKey,
} from './chowliu.js';
import type { ChowLiuTree } from './chowliu.js';
import type { AttrValue, AttrVector, AttributeSurprisal, EntropyReport } from './types.js';

const log2 = (x: number) => Math.log(x) / Math.LN2;

export interface EntropyModel {
  /** Fitted over the learnable attributes only. See partitionByLearnability. */
  tree: ChowLiuTree;
  /** Counts for every attribute, including the ones held out of the tree. */
  counts: Map<string, Map<string, number>>;
  poolSize: number;
  ids: readonly string[];
  learnableIds: readonly string[];
  /** Effectively identifiers at this pool size. Reported, not hidden. */
  nearUniqueIds: readonly string[];
}

export function buildEntropyModel(
  pool: readonly AttrVector[],
  ids: readonly string[],
): EntropyModel {
  const { learnable, nearUnique } = partitionByLearnability(pool, ids);
  return {
    tree: buildChowLiu(pool, learnable),
    counts: countAll(pool, ids),
    poolSize: pool.length,
    ids,
    learnableIds: learnable,
    nearUniqueIds: nearUnique,
  };
}

/**
 * Observed surprisal for one attribute against the pool.
 *
 * A value not present in the pool is counted as if it occurred once — the
 * visitor themself. Reporting -log2(0) as infinite bits would be the exact
 * dishonesty this piece exists to refuse.
 */
function observedSurprisal(model: EntropyModel, attr: string, value: AttrValue): AttributeSurprisal {
  const counts = model.counts.get(attr);
  const key = valueKey(value);
  const seen = counts?.get(key) ?? 0;
  const count = Math.max(1, seen);
  const n = Math.max(1, model.poolSize + (seen === 0 ? 1 : 0));
  return { attr, value, count: seen, bits: Math.max(0, -log2(count / n)) };
}

export function measure(model: EntropyModel, attrs: AttrVector): EntropyReport {
  const { tree } = model;
  const poolSize = Math.max(1, model.poolSize);
  const ceilingBits = log2(poolSize);

  const perAttribute = model.ids.map((id) => observedSurprisal(model, id, attrs[id] ?? null));
  const observedBits = perAttribute.reduce((s, a) => s + a.bits, 0);
  const observedByAttr = new Map(perAttribute.map((a) => [a.attr, a.bits]));

  // Modelled surprisal has two halves. The learnable attributes go through the
  // tree, which subtracts the mutual information the naive sum double-counts.
  // The near-unique ones have no structure to subtract, so they contribute
  // their observed surprisal unchanged — the model does not get to pretend it
  // understands an identifier. Then the whole thing is held to the pool bound,
  // because Laplace smoothing can push an unseen combination past log2(N) and a
  // number above the ceiling would be a claim this pool cannot support.
  const treeBits = Math.max(0, -logLikelihood(tree, attrs));
  const heldOutBits = model.nearUniqueIds.reduce((s, id) => s + (observedByAttr.get(id) ?? 0), 0);
  const rawModelled = treeBits + heldOutBits;
  const modelledBits = Math.min(rawModelled, ceilingBits);
  const atCeiling = rawModelled >= ceilingBits - 1e-9;

  const contributions = modelledContributions(tree, attrs);
  for (const id of model.nearUniqueIds) {
    contributions.set(id, observedByAttr.get(id) ?? 0);
  }
  let dominantAttribute: string | null = null;
  let dominantBits = -1;
  for (const [attr, bits] of contributions) {
    if (bits > dominantBits) {
      dominantBits = bits;
      dominantAttribute = attr;
    }
  }

  return {
    poolSize: model.poolSize,
    perAttribute: [...perAttribute].sort((a, b) => b.bits - a.bits),
    observedBits,
    modelledBits,
    rawModelledBits: rawModelled,
    gapBits: Math.max(0, observedBits - modelledBits),
    ceilingBits,
    oneInN: Math.min(Math.pow(2, modelledBits), poolSize),
    atCeiling,
    dominantAttribute,
  };
}

/**
 * Bits destroyed by wearing (§3).
 *
 * An identity worn by k distinct visitors has its surprisal fall from
 * -log2(p) toward -log2(k·p). The difference is log2(k). It is published as a
 * headline figure in the census, so it is computed from wear counts that came
 * from real events and from nothing else.
 */
export function bitsDestroyed(wearCounts: readonly number[]): number {
  let total = 0;
  for (const k of wearCounts) {
    if (k > 1) total += log2(k);
  }
  return total;
}

export function bitsDestroyedBy(wearCount: number): number {
  return wearCount > 1 ? log2(wearCount) : 0;
}

/**
 * Corruption magnitude (§6b).
 *
 * 0 is the least surprising entry in the pool, 1 the most. It drives how far the
 * page's own post-processing degrades, and it is the axis the census plots the
 * pool's spread along.
 *
 * Measured against the *unclamped* model score, for a reason worth stating
 * plainly: once a pool is small enough that every entry saturates log2(N), the
 * clamped figure is identical for everybody, and both the ranking and the
 * distribution collapse into one value. The headline number stays clamped,
 * because that is a claim about how identifiable someone is and the pool cannot
 * support a larger one. This is not that claim. It is a ranking within the pool,
 * and it is labelled as one wherever it appears.
 */
export interface CorruptionScale {
  min: number;
  max: number;
}

export function corruptionScale(reports: readonly EntropyReport[]): CorruptionScale {
  if (reports.length === 0) return { min: 0, max: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const r of reports) {
    if (r.rawModelledBits < min) min = r.rawModelledBits;
    if (r.rawModelledBits > max) max = r.rawModelledBits;
  }
  return { min, max: Math.max(max, min + 1e-6) };
}

export function corruptionMagnitude(report: EntropyReport, scale?: CorruptionScale): number {
  if (!scale) {
    if (report.ceilingBits <= 0) return 0;
    return Math.min(1, Math.max(0, report.modelledBits / report.ceilingBits));
  }
  const span = Math.max(1e-6, scale.max - scale.min);
  return Math.min(1, Math.max(0, (report.rawModelledBits - scale.min) / span));
}

/**
 * Erosion from wear (§6b): a heavily worn identity is smoothed, its detail
 * rubbed away. Saturating, because the tenth wearer changes less than the second.
 */
export function erosion(wearCount: number): number {
  if (wearCount <= 1) return 0;
  return Math.min(1, log2(wearCount) / 8);
}

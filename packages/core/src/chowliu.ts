/**
 * Chow-Liu tree over the categorical attributes (§5).
 *
 * The right model here, and a VAE is not: the data is low-dimensional,
 * categorical, heavily correlated, and there are hundreds of samples rather
 * than millions. It fits in milliseconds, every parameter is inspectable, and
 * the dependency tree itself is a renderable object — which is the point of
 * §6d. It is the entropy model and the generator at the same time, so the
 * number the visitor is shown and the identities the piece manufactures come
 * out of one object rather than two that could quietly disagree.
 */

import type { AttrValue, AttrVector } from './types.js';

const NULL_KEY = 'x:null';

/** Keys carry their type, so the string "null" and a genuine null never collide. */
export function valueKey(v: AttrValue): string {
  if (v === null || v === undefined) return NULL_KEY;
  if (typeof v === 'number') return `n:${v}`;
  if (typeof v === 'boolean') return `b:${v}`;
  return `s:${v}`;
}

export function keyValue(k: string): AttrValue {
  if (k === NULL_KEY) return null;
  const body = k.slice(2);
  if (k.startsWith('n:')) return Number(body);
  if (k.startsWith('b:')) return body === 'true';
  return body;
}

export interface TreeEdge {
  parent: string;
  child: string;
  /** Mutual information in bits. The edge weight, and the line thickness in §6d. */
  mi: number;
}

export interface TreeNode {
  attr: string;
  parent: string | null;
  /** Root only: P(value). */
  marginal: Map<string, number>;
  /** Non-root: parentValueKey -> valueKey -> P(value | parent). */
  conditional: Map<string, Map<string, number>>;
  /** Support in stable order, so sampling is reproducible from a seed. */
  support: string[];
  /** Raw counts, kept so a leave-one-out likelihood can be computed exactly. */
  ownCount: Map<string, number>;
  jointCount: Map<string, Map<string, number>>;
  parentCount: Map<string, number>;
}

export interface ChowLiuTree {
  ids: string[];
  /** Root first, parents before children. Sampling walks this order. */
  nodes: TreeNode[];
  edges: TreeEdge[];
  /** H(a) for each attribute, in bits. */
  marginalEntropy: Map<string, number>;
  /** Empirical counts per attribute value, reused by the observed-surprisal path. */
  counts: Map<string, Map<string, number>>;
  poolSize: number;
  alpha: number;
  /** Sum of marginal entropies minus MI on tree edges: joint entropy under the model. */
  jointEntropy: number;
  /** Full pairwise MI matrix, so the tree view can show what the spanning tree discarded. */
  mi: Map<string, Map<string, number>>;
}

const log2 = (x: number) => Math.log(x) / Math.LN2;

const FALLBACK_KEY = 'fallback:unseen-parent';

function countValues(pool: readonly AttrVector[], id: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of pool) {
    const k = valueKey(row[id] ?? null);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function entropyOf(counts: Map<string, number>, n: number): number {
  let h = 0;
  for (const c of counts.values()) {
    const p = c / n;
    if (p > 0) h -= p * log2(p);
  }
  return h;
}

function mutualInformation(pool: readonly AttrVector[], a: string, b: string): number {
  const n = pool.length;
  // Nested maps rather than a concatenated key: attribute values are arbitrary
  // strings, so any separator character is one some renderer could produce.
  const joint = new Map<string, Map<string, number>>();
  const ca = new Map<string, number>();
  const cb = new Map<string, number>();
  for (const row of pool) {
    const ka = valueKey(row[a] ?? null);
    const kb = valueKey(row[b] ?? null);
    ca.set(ka, (ca.get(ka) ?? 0) + 1);
    cb.set(kb, (cb.get(kb) ?? 0) + 1);
    let inner = joint.get(ka);
    if (!inner) {
      inner = new Map();
      joint.set(ka, inner);
    }
    inner.set(kb, (inner.get(kb) ?? 0) + 1);
  }
  let mi = 0;
  for (const [ka, inner] of joint) {
    const pa = (ca.get(ka) ?? 0) / n;
    for (const [kb, c] of inner) {
      const pb = (cb.get(kb) ?? 0) / n;
      const pj = c / n;
      if (pj > 0 && pa > 0 && pb > 0) mi += pj * log2(pj / (pa * pb));
    }
  }
  // Floating point can leave a whisker below zero; MI is non-negative by construction.
  return Math.max(0, mi);
}

export function countAll(
  pool: readonly AttrVector[],
  ids: readonly string[],
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const id of ids) out.set(id, countValues(pool, id));
  return out;
}

export interface Learnability {
  /** Attributes with enough repetition for a conditional distribution to mean anything. */
  learnable: string[];
  /** Attributes that are effectively identifiers at this pool size. */
  nearUnique: string[];
}

/**
 * Splits attributes by whether the pool can model them at all.
 *
 * An attribute with a distinct value for almost every row is an identifier, not
 * a variable. Fitting a tree over one is worse than useless: it becomes the
 * root, its mutual information with everything else equals that thing's entire
 * entropy, and the dependency graph collapses into a star that says only "the
 * serial number determines the device". Sampling from such a tree produces
 * combinations no real machine has, which the coherence gate then rejects
 * forever.
 *
 * So these attributes are held out of the model and handled honestly instead:
 * they contribute their observed surprisal to the measurement, and the forge
 * grafts them from a donor rather than inventing them. Which attributes fall
 * on which side is a property of the pool and changes as it grows — the
 * interface reports the split rather than hard-coding it.
 */
export function partitionByLearnability(
  pool: readonly AttrVector[],
  ids: readonly string[],
  maxDistinctRatio = 0.5,
): Learnability {
  const n = Math.max(1, pool.length);
  const learnable: string[] = [];
  const nearUnique: string[] = [];
  for (const id of ids) {
    const distinct = new Set(pool.map((row) => valueKey(row[id] ?? null))).size;
    if (distinct / n > maxDistinctRatio) nearUnique.push(id);
    else learnable.push(id);
  }
  return { learnable, nearUnique };
}

export function buildChowLiu(
  pool: readonly AttrVector[],
  ids: readonly string[],
  alpha = 1,
): ChowLiuTree {
  const n = pool.length;
  const attrs = [...ids];

  const counts = new Map<string, Map<string, number>>();
  const marginalEntropy = new Map<string, number>();
  for (const id of attrs) {
    const c = countValues(pool, id);
    counts.set(id, c);
    marginalEntropy.set(id, n > 0 ? entropyOf(c, n) : 0);
  }

  const mi = new Map<string, Map<string, number>>();
  for (const a of attrs) mi.set(a, new Map());
  for (let i = 0; i < attrs.length; i++) {
    for (let j = i + 1; j < attrs.length; j++) {
      const v = n > 1 ? mutualInformation(pool, attrs[i], attrs[j]) : 0;
      mi.get(attrs[i])!.set(attrs[j], v);
      mi.get(attrs[j])!.set(attrs[i], v);
    }
  }

  // Maximum spanning tree by Prim. Rooted at the highest-entropy attribute, so
  // the most informative surface sits at the top of the drawn constellation.
  const rootAttr = attrs.reduce(
    (best, a) => ((marginalEntropy.get(a) ?? 0) > (marginalEntropy.get(best) ?? 0) ? a : best),
    attrs[0],
  );

  const inTree = new Set<string>([rootAttr]);
  const parentOf = new Map<string, string | null>([[rootAttr, null]]);
  const edges: TreeEdge[] = [];
  const order: string[] = [rootAttr];

  while (inTree.size < attrs.length) {
    let bestWeight = -1;
    let bestParent = '';
    let bestChild = '';
    for (const p of inTree) {
      for (const c of attrs) {
        if (inTree.has(c)) continue;
        const w = mi.get(p)!.get(c) ?? 0;
        if (w > bestWeight) {
          bestWeight = w;
          bestParent = p;
          bestChild = c;
        }
      }
    }
    // An attribute with zero MI to everything still needs a home. It attaches to
    // the root as an independent node, which is exactly what MI of zero asserts.
    if (bestChild === '') {
      for (const c of attrs) {
        if (!inTree.has(c)) {
          bestParent = rootAttr;
          bestChild = c;
          bestWeight = 0;
          break;
        }
      }
      if (bestChild === '') break;
    }
    inTree.add(bestChild);
    parentOf.set(bestChild, bestParent);
    edges.push({ parent: bestParent, child: bestChild, mi: Math.max(0, bestWeight) });
    order.push(bestChild);
  }

  const nodes: TreeNode[] = order.map((attr) => {
    const parent = parentOf.get(attr) ?? null;
    const support = [...(counts.get(attr) ?? new Map<string, number>()).keys()].sort();
    const jointCount = new Map<string, Map<string, number>>();
    const parentCount = new Map<string, number>();
    const node: TreeNode = {
      attr,
      parent,
      marginal: new Map(),
      conditional: new Map(),
      support,
      ownCount: counts.get(attr) ?? new Map(),
      jointCount,
      parentCount,
    };
    const v = Math.max(1, support.length);

    if (parent === null) {
      for (const k of support) {
        node.marginal.set(k, ((counts.get(attr)!.get(k) ?? 0) + alpha) / (n + alpha * v));
      }
      return node;
    }

    for (const row of pool) {
      const kp = valueKey(row[parent] ?? null);
      const kc = valueKey(row[attr] ?? null);
      parentCount.set(kp, (parentCount.get(kp) ?? 0) + 1);
      let inner = jointCount.get(kp);
      if (!inner) {
        inner = new Map();
        jointCount.set(kp, inner);
      }
      inner.set(kc, (inner.get(kc) ?? 0) + 1);
    }
    for (const [kp, np] of parentCount) {
      const dist = new Map<string, number>();
      const inner = jointCount.get(kp)!;
      for (const kc of support) {
        dist.set(kc, ((inner.get(kc) ?? 0) + alpha) / (np + alpha * v));
      }
      node.conditional.set(kp, dist);
    }
    // A parent value never seen in training falls back to the child's marginal.
    const fallback = new Map<string, number>();
    for (const k of support) {
      fallback.set(k, ((counts.get(attr)!.get(k) ?? 0) + alpha) / (n + alpha * v));
    }
    node.conditional.set(FALLBACK_KEY, fallback);
    return node;
  });

  const sumMarginal = attrs.reduce((s, a) => s + (marginalEntropy.get(a) ?? 0), 0);
  const sumMi = edges.reduce((s, e) => s + e.mi, 0);

  return {
    ids: attrs,
    nodes,
    edges,
    marginalEntropy,
    counts,
    poolSize: n,
    alpha,
    jointEntropy: Math.max(0, sumMarginal - sumMi),
    mi,
  };
}

/** P(value | parent) for a node, with the unseen-parent fallback applied. */
function distributionFor(node: TreeNode, parentKey: string | null): Map<string, number> {
  if (node.parent === null || parentKey === null) return node.marginal;
  return node.conditional.get(parentKey) ?? node.conditional.get(FALLBACK_KEY) ?? node.marginal;
}

/** The smoothing floor: what an unsupported value is worth under the model. */
function floorProb(tree: ChowLiuTree, node: TreeNode): number {
  const v = Math.max(1, node.support.length);
  return tree.alpha / (tree.poolSize + tree.alpha * v);
}

/** Ancestral sample from the root down. Deterministic given the supplied uniform stream. */
export function sampleTree(tree: ChowLiuTree, rand: () => number): AttrVector {
  const assigned = new Map<string, string>();
  const out: AttrVector = {};
  for (const node of tree.nodes) {
    const parentKey = node.parent === null ? null : (assigned.get(node.parent) ?? null);
    const dist = distributionFor(node, parentKey);
    let r = rand();
    let chosen = node.support[node.support.length - 1] ?? NULL_KEY;
    for (const [k, p] of dist) {
      r -= p;
      if (r <= 0) {
        chosen = k;
        break;
      }
    }
    assigned.set(node.attr, chosen);
    out[node.attr] = keyValue(chosen);
  }
  return out;
}

/** log2 P(vector) under the tree. The forge thresholds on this; the readout negates it. */
export function logLikelihood(tree: ChowLiuTree, attrs: AttrVector): number {
  let ll = 0;
  for (const node of tree.nodes) {
    const key = valueKey(attrs[node.attr] ?? null);
    const parentKey = node.parent === null ? null : valueKey(attrs[node.parent] ?? null);
    const dist = distributionFor(node, parentKey);
    // An unsupported value gets the smoothing floor rather than -Infinity: it is
    // improbable under the model, not impossible in the world.
    const p = dist.get(key) ?? floorProb(tree, node);
    ll += Math.log(Math.max(p, Number.MIN_VALUE)) / Math.LN2;
  }
  return ll;
}

/**
 * log2 P(vector) with this vector's own contribution removed from the counts.
 *
 * The forge needs to ask "is this forgery as plausible as a real person", and
 * the naive form of that question is rigged. A pool entry was in the data the
 * tree was fitted on, so it scores against a model that has already memorised
 * it, while a fresh sample has no such advantage. Comparing the two rejects
 * essentially every forgery, which looks like a strict gate and is actually a
 * broken one.
 *
 * Subtracting the row's own counts is exact here, not an approximation, because
 * the parameters are just smoothed ratios of counts. The result is what a real
 * entry would have scored had it arrived as a stranger — the same footing the
 * forgery is on.
 */
export function logLikelihoodLeaveOneOut(tree: ChowLiuTree, attrs: AttrVector): number {
  const n = tree.poolSize;
  let ll = 0;
  for (const node of tree.nodes) {
    const key = valueKey(attrs[node.attr] ?? null);
    const v = Math.max(1, node.support.length);
    let p: number;
    if (node.parent === null) {
      const c = Math.max(0, (node.ownCount.get(key) ?? 0) - 1);
      p = (c + tree.alpha) / Math.max(tree.alpha, n - 1 + tree.alpha * v);
    } else {
      const parentKey = valueKey(attrs[node.parent] ?? null);
      const np = Math.max(0, (node.parentCount.get(parentKey) ?? 0) - 1);
      const nc = Math.max(0, (node.jointCount.get(parentKey)?.get(key) ?? 0) - 1);
      p = (nc + tree.alpha) / Math.max(tree.alpha, np + tree.alpha * v);
    }
    ll += Math.log(Math.max(p, Number.MIN_VALUE)) / Math.LN2;
  }
  return ll;
}

/** Per-attribute contribution to modelled surprisal, in bits. Picks the dominant attribute. */
export function modelledContributions(tree: ChowLiuTree, attrs: AttrVector): Map<string, number> {
  const out = new Map<string, number>();
  for (const node of tree.nodes) {
    const key = valueKey(attrs[node.attr] ?? null);
    const parentKey = node.parent === null ? null : valueKey(attrs[node.parent] ?? null);
    const dist = distributionFor(node, parentKey);
    const p = dist.get(key) ?? floorProb(tree, node);
    out.set(node.attr, -Math.log(Math.max(p, Number.MIN_VALUE)) / Math.LN2);
  }
  return out;
}

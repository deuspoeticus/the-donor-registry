/** A single measured attribute. `null` means the surface was absent or refused, which is itself information. */
export type AttrValue = string | number | boolean | null;

export type AttrVector = Record<string, AttrValue>;

/** What the collector produces. `timings` is diagnostic and never leaves the browser. */
export interface Fingerprint {
  attrs: AttrVector;
  id: string;
  timings?: Record<string, number>;
}

/**
 * An entry in the pool, as anyone may read it.
 *
 * Deliberately absent: the synthetic flag and the automation likelihood. Both
 * are stored (§8) and both are published as pool-wide counts, but neither
 * appears here, because a catalogue in which you can tell the manufactured
 * entries from the donated ones is not the piece.
 */
export interface Identity {
  id: string;
  attrs: AttrVector;
  /** Bucketed to the day. No finer, because finer is a timing identifier. */
  createdAt: string;
  wearCount: number;
}

/** Server-side shape. Never serialized to a client in this form. */
export interface IdentityRecord extends Identity {
  synthetic: boolean;
  automation: number | null;
  revocationTokenHash: string;
}

export interface PoolStats {
  size: number;
  /** Aggregate only. Which entries these are is not exposed and not recoverable from the API. */
  syntheticCount: number;
  syntheticAtLaunch: number;
  donatedCount: number;
  /** Donations whose automation likelihood read above 0.5. An attribute, never a gate. */
  machineDonations: number;
  totalWears: number;
  /** Cumulative surprisal destroyed by wearing. Only ever increases, and only from real events. */
  bitsDestroyed: number;
  forgeriesDiscarded: number;
  forgeAttempts: number;
}

export interface AttributeSurprisal {
  attr: string;
  value: AttrValue;
  /** count(value) within the pool */
  count: number;
  /** -log2(count/N), bounded above by log2(N) */
  bits: number;
}

export interface EntropyReport {
  /** Pool size the measurement was taken against. Every number below is bounded by it. */
  poolSize: number;
  perAttribute: AttributeSurprisal[];
  /** Sum of marginal surprisals. Assumes independence, and is therefore an overstatement. */
  observedBits: number;
  /** Marginals minus the mutual information the Chow-Liu tree captures. The honest figure. */
  modelledBits: number;
  /** observedBits - modelledBits: how much the naive sum inflates by. */
  gapBits: number;
  /** log2(poolSize). Nothing measured here can exceed it. */
  ceilingBits: number;
  /**
   * Modelled surprisal *before* the pool bound is applied.
   *
   * Never shown as a claim about identifiability — the pool cannot support one,
   * which is why `modelledBits` is clamped. It exists because comparing two
   * entries to each other is a different question from claiming how identifiable
   * either one is, and once everybody is pinned to the ceiling the clamped
   * figure can no longer tell them apart. The corruption magnitude and the
   * census distribution both rank with this.
   */
  rawModelledBits: number;
  /** 2^modelledBits, clamped to the ceiling. The headline. */
  oneInN: number;
  /** True when the visitor saturates the pool bound, i.e. the pool is too small to say more. */
  atCeiling: boolean;
  dominantAttribute: string | null;
}

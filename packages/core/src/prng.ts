/**
 * Seeded PRNG.
 *
 * Two uses, both of which require the same value on every run:
 *   - stele geometry, so an identity is always the same object (§6a);
 *   - userscript noise, because noise that changes per call is not anonymity,
 *     it is a beacon. A randomiser is trivially detected and is itself a strong
 *     fingerprint (§7).
 *
 * sfc32, seeded from four 32-bit words of the identity hash.
 */

export interface Rng {
  (): number;
  int(maxExclusive: number): number;
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Standard normal via Box-Muller, for geometry that should not look uniform. */
  normal(): number;
}

export function rngFromHex(hex: string): Rng {
  let a = parseInt(hex.slice(0, 8) || '0', 16) >>> 0;
  let b = parseInt(hex.slice(8, 16) || '0', 16) >>> 0;
  let c = parseInt(hex.slice(16, 24) || '0', 16) >>> 0;
  let d = parseInt(hex.slice(24, 32) || '0', 16) >>> 0;

  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) >>> 0;
    t = (t + d) >>> 0;
    c = (c + t) >>> 0;
    return (t >>> 0) / 4294967296;
  };

  // sfc32 needs a warm-up before its output is well distributed.
  for (let i = 0; i < 12; i++) next();

  const rng = next as Rng;
  rng.int = (maxExclusive: number) => Math.floor(next() * maxExclusive);
  rng.range = (min: number, max: number) => min + next() * (max - min);
  rng.pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  rng.normal = () => {
    const u = Math.max(next(), Number.MIN_VALUE);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return rng;
}

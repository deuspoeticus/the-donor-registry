/**
 * Stele geometry (§6a).
 *
 * Each identity is one stele on a dark plane, and its form is derived
 * deterministically from sha256(id) through a seeded PRNG. The same hash always
 * yields the same object — that is the whole reason the field is a monument and
 * not a decoration. Nothing here reads the attribute *values*; the shape comes
 * from the digest alone, so an identity's form gives away nothing about what it
 * contains.
 *
 * The corruption applied on top of this form is a separate matter and comes
 * from the measurement (§6b), not from here.
 */

import { sha256 } from './hash.js';
import { rngFromHex } from './prng.js';

export interface SteleParams {
  /** 1 unit is roughly a person. */
  height: number;
  /** Width at the base. */
  width: number;
  /** Ratio of top width to base width. Below 1 the form narrows as it rises. */
  taper: number;
  /** Radians of rotation per unit of height. */
  twist: number;
  /** 3 to 9. The plan of the shaft. */
  facets: number;
  /** Depth of the carved relief, 0 to 1. */
  relief: number;
  /** Vertical frequency of that relief. */
  reliefFrequency: number;
  /** Small lean off vertical, radians. Nothing in a real field stands straight. */
  lean: number;
  /** Rotation about its own axis. */
  rotation: number;
  /** Height of the plinth as a fraction of total height. */
  plinth: number;
}

export function steleParams(id: string): SteleParams {
  const rng = rngFromHex(sha256(id));
  return {
    // Proportioned like a marker stone rather than a post: tall enough to stand
    // over a person, wide enough that the taper and the facet count are legible
    // from across the field, which is where most of them will only ever be seen.
    height: 1.5 + Math.abs(rng.normal()) * 1.1,
    width: 0.36 + rng() * 0.42,
    taper: 0.52 + rng() * 0.46,
    twist: (rng() - 0.5) * 0.9,
    facets: 3 + rng.int(7),
    relief: rng(),
    reliefFrequency: 4 + rng() * 22,
    lean: rng.normal() * 0.035,
    rotation: rng() * Math.PI * 2,
    plinth: 0.05 + rng() * 0.09,
  };
}

/**
 * Position on the plane. A jittered lattice rather than pure noise: a random
 * scatter reads as a starfield, and a regular grid reads as a car park. A
 * graveyard is neither.
 */
export function stelePosition(id: string, index: number, columns: number, spacing: number): [number, number] {
  const rng = rngFromHex(sha256(`${id}:position`));
  const col = index % columns;
  const row = Math.floor(index / columns);
  return [
    (col - columns / 2) * spacing + rng.normal() * spacing * 0.22,
    (row - columns / 2) * spacing + rng.normal() * spacing * 0.22,
  ];
}

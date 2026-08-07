/**
 * The canonical prism the field is instanced over.
 *
 * Built once per facet count at unit height and unit diameter, upright and
 * untwisted. Every identity's proportions — height, width, taper, twist, relief
 * — are applied in the vertex shader from instance attributes, so the whole pool
 * renders in as many draw calls as there are distinct facet counts.
 *
 * Facet count is the one shape parameter that cannot be applied in the shader,
 * because it changes the topology rather than the positions. It is also the most
 * legible difference between two steles at a distance, which is why it gets its
 * own buffer rather than being averaged away.
 */

import * as THREE from 'three';

/**
 * Where the plinth ends and the shaft begins, as a fraction of unit height.
 * Fixed in the geometry rather than per instance, because the two parts have
 * different radii and a discontinuity needs two rings of vertices at the same
 * height — which is a topology decision, not a shader one.
 */
export const PLINTH_TOP = 0.09;

const cache = new Map<number, THREE.BufferGeometry>();

export function canonicalPrism(facets: number, segments = 10): THREE.BufferGeometry {
  const key = facets * 1000 + segments;
  const cached = cache.get(key);
  if (cached) return cached;

  const positions: number[] = [];
  const normals: number[] = [];
  /** 0 on the plinth, 1 on the shaft. The shader reads this instead of guessing from height. */
  const parts: number[] = [];

  const ring = (y: number) =>
    Array.from({ length: facets }, (_, i) => {
      const a = (i / facets) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * 0.5, y, Math.sin(a) * 0.5);
    });

  const push = (p: THREE.Vector3, n: THREE.Vector3, part: number) => {
    positions.push(p.x, p.y, p.z);
    normals.push(n.x, n.y, n.z);
    parts.push(part);
  };

  /** One band of side faces. Normals are flat per facet, so the form reads as carved. */
  const band = (lower: THREE.Vector3[], upper: THREE.Vector3[], part: number) => {
    for (let i = 0; i < facets; i++) {
      const j = (i + 1) % facets;
      const normal = new THREE.Vector3(lower[i].x + lower[j].x, 0, lower[i].z + lower[j].z).normalize();
      push(lower[i], normal, part);
      push(lower[j], normal, part);
      push(upper[i], normal, part);
      push(lower[j], normal, part);
      push(upper[j], normal, part);
      push(upper[i], normal, part);
    }
  };

  // Plinth: a squat band at the base, wider than the shaft above it.
  band(ring(0), ring(PLINTH_TOP), 0);

  // The shoulder where the plinth stops. Two rings sit at the same height with
  // different part values, so the shader can give them different radii and the
  // step is a step rather than a taper.
  const shoulderOuter = ring(PLINTH_TOP);
  const shoulderInner = ring(PLINTH_TOP);
  const down = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < facets; i++) {
    const j = (i + 1) % facets;
    push(shoulderOuter[i], down, 0);
    push(shoulderOuter[j], down, 0);
    push(shoulderInner[i], down, 1);
    push(shoulderOuter[j], down, 0);
    push(shoulderInner[j], down, 1);
    push(shoulderInner[i], down, 1);
  }

  // Shaft.
  for (let s = 0; s < segments; s++) {
    const lower = ring(PLINTH_TOP + (s / segments) * (1 - PLINTH_TOP));
    const upper = ring(PLINTH_TOP + ((s + 1) / segments) * (1 - PLINTH_TOP));
    band(lower, upper, 1);
  }

  // Cap, so the form reads as closed rather than as an open tube.
  const top = ring(1);
  const apex = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < facets; i++) {
    const j = (i + 1) % facets;
    const normal = new THREE.Vector3(top[i].x + top[j].x, 1.2, top[i].z + top[j].z).normalize();
    push(top[i], normal, 1);
    push(top[j], normal, 1);
    push(apex, normal, 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  geometry.computeBoundingSphere();
  cache.set(key, geometry);
  return geometry;
}

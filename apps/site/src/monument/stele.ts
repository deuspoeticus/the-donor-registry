/**
 * Stele geometry.
 *
 * One tapered, twisted, faceted shaft on a plinth, built from parameters that
 * come out of sha256(id). The same identity is always the same object, in the
 * field and in close-up, on any machine.
 */

import * as THREE from 'three';
import { steleParams, type SteleParams } from '@wearme/core/stele';

/**
 * Builds the shaft as a lathe of facets so the silhouette is a polygon rather
 * than a circle — a carved thing, not a turned one.
 */
export function buildSteleGeometry(params: SteleParams, segments = 48): THREE.BufferGeometry {
  const { height, width, taper, twist, facets, relief, reliefFrequency, plinth } = params;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const shaftBase = height * plinth;
  const shaftHeight = height - shaftBase;

  const ringAt = (t: number): THREE.Vector3[] => {
    const y = shaftBase + t * shaftHeight;
    const scale = 1 - (1 - taper) * t;
    // Relief is a shallow flute cut into the surface, its frequency from the hash.
    const flute = 1 + Math.sin(t * reliefFrequency) * relief * 0.06;
    const rotation = twist * t * Math.PI;
    const r = width * 0.5 * scale * flute;
    return Array.from({ length: facets }, (_, i) => {
      const a = (i / facets) * Math.PI * 2 + rotation;
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    });
  };

  const pushTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, v0: number, v1: number) => {
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const [p, v] of [
      [a, v0],
      [b, v0],
      [c, v1],
    ] as const) {
      positions.push(p.x, p.y, p.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(Math.atan2(p.z, p.x) / (Math.PI * 2) + 0.5, v);
    }
  };

  let previous = ringAt(0);
  for (let s = 1; s <= segments; s++) {
    const t = s / segments;
    const current = ringAt(t);
    for (let i = 0; i < facets; i++) {
      const j = (i + 1) % facets;
      pushTriangle(previous[i], previous[j], current[i], (s - 1) / segments, t);
      pushTriangle(previous[j], current[j], current[i], (s - 1) / segments, t);
    }
    previous = current;
  }

  // Cap the top so the form reads as closed.
  const top = ringAt(1);
  const apex = new THREE.Vector3(0, height, 0);
  for (let i = 0; i < facets; i++) {
    pushTriangle(top[i], top[(i + 1) % facets], apex, 1, 1);
  }

  // Plinth: a plain box, wider than the shaft.
  const halfWidth = width * 0.78;
  const plinthCorners = [
    new THREE.Vector3(-halfWidth, 0, -halfWidth),
    new THREE.Vector3(halfWidth, 0, -halfWidth),
    new THREE.Vector3(halfWidth, 0, halfWidth),
    new THREE.Vector3(-halfWidth, 0, halfWidth),
  ];
  for (let i = 0; i < 4; i++) {
    const a = plinthCorners[i];
    const b = plinthCorners[(i + 1) % 4];
    const aTop = a.clone().setY(shaftBase);
    const bTop = b.clone().setY(shaftBase);
    pushTriangle(a, b, aTop, 0, 0);
    pushTriangle(b, bTop, aTop, 0, 0);
  }
  // The top face, so the plinth is a block rather than four walls. Without it
  // the base reads as thin fins from any camera above the horizon, which is
  // every camera this piece uses.
  const plinthTop = plinthCorners.map((c) => c.clone().setY(shaftBase));
  pushTriangle(plinthTop[0], plinthTop[2], plinthTop[1], 0, 0);
  pushTriangle(plinthTop[0], plinthTop[3], plinthTop[2], 0, 0);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * Geometry is cached by the parameters that actually shape it, not by identity,
 * so the field can carry thousands of steles over a few dozen meshes. Two
 * identities that hash to the same silhouette share one buffer and are still
 * told apart by their corruption, which is where the difference belongs.
 */
export function steleGeometryFor(id: string, segments = 48): { geometry: THREE.BufferGeometry; params: SteleParams } {
  const params = steleParams(id);
  const key = [
    params.facets,
    params.taper.toFixed(2),
    params.twist.toFixed(2),
    params.relief.toFixed(2),
    params.reliefFrequency.toFixed(1),
    params.plinth.toFixed(2),
    segments,
  ].join(':');

  let geometry = cache.get(key);
  if (!geometry) {
    // Built at unit height and width so the cache key does not have to include
    // them; the instance scales to the identity's own proportions.
    geometry = buildSteleGeometry({ ...params, height: 1, width: 1 }, segments);
    cache.set(key, geometry);
  }
  return { geometry, params };
}

export type { SteleParams };

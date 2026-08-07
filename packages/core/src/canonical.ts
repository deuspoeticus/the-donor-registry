/**
 * Canonical JSON.
 *
 * The identity id is sha256(canonicalJSON(attrs)). Two browsers that produce
 * the same attribute vector must produce the same id regardless of key
 * insertion order, so keys are sorted and the number format is pinned.
 */

import { sha256 } from './hash.js';
import type { AttrValue } from './types.js';

function serialize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  const t = typeof value;
  if (t === 'number') {
    const n = value as number;
    // Non-finite values are not representable in JSON and must never silently
    // become 0. They are recorded as the string form, which is itself distinct.
    if (!Number.isFinite(n)) return JSON.stringify(String(n));
    // ECMAScript's Number::toString is the shortest round-tripping form and is
    // specified exactly, so it is stable across engines.
    return Object.is(n, -0) ? '0' : String(n);
  }
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`;
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`).join(',')}}`;
  }
  return 'null';
}

export function canonicalJSON(value: unknown): string {
  return serialize(value);
}

/** The identity id: sha256 over the canonical form of the attribute vector. */
export function fingerprintId(attrs: Record<string, AttrValue>): string {
  return sha256(canonicalJSON(attrs));
}

/** Human-readable payload shown verbatim in the consent gate before donation. */
export function prettyPayload(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

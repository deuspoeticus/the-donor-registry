/**
 * Rate limiting without keeping an address (§8).
 *
 * The obvious implementation stores the caller's IP against a counter, which
 * would make this service hold the one identifier the piece promises not to
 * hold. Instead the address is hashed with a salt that is thrown away and
 * regenerated every window, and only the hash is ever in memory. When the salt
 * rotates, every bucket becomes unlinkable to any address, including to itself
 * a minute earlier — there is nothing left to correlate, subpoena or leak.
 *
 * Everything lives in process memory. Nothing is written to disk.
 */

import { randomBytes } from 'node:crypto';
import { sha256 } from '@wearme/core/hash';

const WINDOW_MS = 10 * 60 * 1000;

export interface Limiter {
  /** True when the call is allowed. */
  take(address: string, bucket: string, limit: number): boolean;
  dispose(): void;
}

export function createLimiter(windowMs = WINDOW_MS): Limiter {
  let salt = randomBytes(32).toString('hex');
  let counts = new Map<string, number>();

  const timer = setInterval(() => {
    salt = randomBytes(32).toString('hex');
    counts = new Map();
  }, windowMs);
  // Never a reason to keep the process alive for a rotation.
  timer.unref?.();

  return {
    take(address, bucket, limit) {
      const key = sha256(`${salt}|${bucket}|${address}`);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next <= limit;
    },
    dispose() {
      clearInterval(timer);
    },
  };
}

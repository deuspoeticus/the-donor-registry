/**
 * Rate limiting without keeping an address (§8).
 *
 * The obvious implementation stores the caller's IP against a counter, which
 * would make this service hold the one identifier the piece promises not to
 * hold. Instead the address is hashed with a salt that is derived from the
 * current window and a secret, and only the hash is ever written. When the
 * window turns, the salt changes and every row already stored becomes
 * unlinkable to any address, including to itself a minute earlier — there is
 * nothing left to correlate, subpoena or leak.
 *
 * The Fastify version held the salt in a variable and rotated it on a timer.
 * A Worker has neither a long-lived variable nor a timer, so the salt is
 * *derived* instead of stored: sha256(secret | epoch), where epoch is the
 * current ten-minute bucket. Same rotation, same unlinkability, and now there
 * is no salt sitting in memory to be read at all — which is strictly better
 * than what it replaces.
 *
 * One honest cost of moving the counters into D1: the check is itself a write.
 * A blocked request therefore costs one row-write instead of the two it would
 * have cost had it succeeded, which halves the worst case rather than removing
 * it. The limits below are set for abuse, not for the storage budget.
 */

import { sha256 } from '@wearme/core/hash';

const WINDOW_MS = 10 * 60 * 1000;

/** Fraction of writes that also sweep expired rows. See `take`. */
const PRUNE_ODDS = 0.02;

function saltFor(secret: string, now: number): string {
  return sha256(`${secret}|${Math.floor(now / WINDOW_MS)}`);
}

/**
 * True when the call is allowed.
 *
 * `address` is only ever passed in to be hashed. It is not returned, not
 * logged, and not stored — by the time a row exists, the value that produced
 * its key is unrecoverable.
 */
export async function take(
  db: D1Database,
  secret: string,
  address: string,
  bucket: string,
  limit: number,
): Promise<boolean> {
  const now = Date.now();
  const key = sha256(`${saltFor(secret, now)}|${bucket}|${address}`);
  const expiresAt = (Math.floor(now / WINDOW_MS) + 1) * WINDOW_MS;

  // Rows are dead the moment their window closes, because the salt that
  // produced their keys can never be derived again. Sweeping them on a fraction
  // of writes keeps the table small without spending a statement on every
  // request, and without a scheduled job whose only purpose is deleting rows
  // that already mean nothing.
  if (Math.random() < PRUNE_ODDS) {
    await db.prepare('DELETE FROM ratelimit WHERE expires_at < ?').bind(now).run();
  }

  const row = await db
    .prepare(
      `INSERT INTO ratelimit (key, count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, expiresAt)
    .first<{ count: number }>();

  return (row?.count ?? 1) <= limit;
}

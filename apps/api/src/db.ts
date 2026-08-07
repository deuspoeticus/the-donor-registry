/**
 * Storage (§8).
 *
 * Stored: the attribute vector, the derived id, a created-at date bucketed to
 * the day, the wear count, the synthetic flag, the automation likelihood, and a
 * hash of the revocation token.
 *
 * Never stored: IP address, User-Agent header, any request-level identifier,
 * any cookie. There is no column for them, which is a stronger guarantee than a
 * policy about them.
 *
 * The synthetic flag and the automation likelihood are aggregate-only. They are
 * exposed through /pool/stats as pool-wide counts and never in a per-entry
 * response, directly or by ordering — see `publicEntry` and the ORDER BY
 * clauses, both of which are load-bearing rather than incidental.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bitsDestroyed } from '@wearme/core/entropy';
import { sha256 } from '@wearme/core/hash';
import type { AttrVector, Identity, PoolStats } from '@wearme/core/types';

const here = dirname(fileURLToPath(import.meta.url));

export interface Row {
  id: string;
  attrs: string;
  created_at: string;
  wear_count: number;
  synthetic: number;
  automation: number | null;
  revocation_hash: string | null;
}

export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS identity (
      id              TEXT PRIMARY KEY,
      attrs           TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      wear_count      INTEGER NOT NULL DEFAULT 0,
      synthetic       INTEGER NOT NULL DEFAULT 0,
      automation      REAL,
      revocation_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Counts only. An origin is never written here, and there is no column for one.
    CREATE TABLE IF NOT EXISTS report (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id  TEXT NOT NULL,
      origin_count INTEGER NOT NULL,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS consequence (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id TEXT,
      category    TEXT NOT NULL,
      note        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS identity_created ON identity (created_at DESC, id);
    CREATE INDEX IF NOT EXISTS identity_worn ON identity (wear_count DESC, id);
  `);
  return db;
}

export const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * The only shape an entry leaves the server in.
 *
 * Neither the visitor nor the artist can tell a manufactured entry from a
 * donated one by looking, because the field that would say so is not in the
 * object and is not derivable from it.
 */
export function publicEntry(row: Row): Identity {
  return {
    id: row.id,
    attrs: JSON.parse(row.attrs) as AttrVector,
    createdAt: row.created_at,
    wearCount: row.wear_count,
  };
}

export function seedFromBootstrap(db: Database.Database): number {
  const already = db.prepare('SELECT COUNT(*) AS n FROM identity').get() as { n: number };
  if (already.n > 0) return 0;

  const path = resolve(here, '../../../data/bootstrap.json');
  const file = JSON.parse(readFileSync(path, 'utf8')) as {
    syntheticAtLaunch: number;
    entries: { id: string; attrs: AttrVector; createdAt: string; automation: number }[];
  };

  const insert = db.prepare(
    `INSERT OR IGNORE INTO identity (id, attrs, created_at, wear_count, synthetic, automation, revocation_hash)
     VALUES (?, ?, ?, 0, 1, ?, NULL)`,
  );
  const run = db.transaction((entries: typeof file.entries) => {
    for (const e of entries) {
      insert.run(e.id, JSON.stringify(e.attrs), e.createdAt, e.automation);
    }
  });
  run(file.entries);

  // Recorded so the interface can state how many entries were synthetic at
  // launch even after the pool has grown past them.
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
    'syntheticAtLaunch',
    String(file.syntheticAtLaunch),
  );
  return file.entries.length;
}

export function readMeta(db: Database.Database, key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function bumpMeta(db: Database.Database, key: string, by: number): void {
  const current = Number(readMeta(db, key, '0'));
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, String(current + by));
}

export function poolStats(db: Database.Database): PoolStats {
  const totals = db
    .prepare(
      `SELECT COUNT(*)                             AS size,
              SUM(synthetic)                       AS synthetic,
              SUM(wear_count)                      AS wears,
              SUM(CASE WHEN synthetic = 0 AND automation > 0.5 THEN 1 ELSE 0 END) AS machines
         FROM identity`,
    )
    .get() as { size: number; synthetic: number | null; wears: number | null; machines: number | null };

  const worn = db
    .prepare('SELECT wear_count FROM identity WHERE wear_count > 1')
    .all() as { wear_count: number }[];

  const syntheticCount = totals.synthetic ?? 0;
  return {
    size: totals.size,
    syntheticCount,
    syntheticAtLaunch: Number(readMeta(db, 'syntheticAtLaunch', '0')),
    donatedCount: totals.size - syntheticCount,
    machineDonations: totals.machines ?? 0,
    totalWears: totals.wears ?? 0,
    bitsDestroyed: bitsDestroyed(worn.map((w) => w.wear_count)),
    forgeriesDiscarded: Number(readMeta(db, 'forgeriesDiscarded', '0')),
    forgeAttempts: Number(readMeta(db, 'forgeAttempts', '0')),
  };
}

export function hashToken(token: string): string {
  return sha256(`revocation:${token}`);
}

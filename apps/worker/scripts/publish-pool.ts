/**
 * Regenerates the published catalogue from the pool (plan step 5).
 *
 *   npm run publish:pool --workspace @wearme/worker            # local database
 *   npm run publish:pool --workspace @wearme/worker -- --remote
 *
 * The service has no list route. The catalogue a visitor reads is this file,
 * `data/pool.json`, written here and shipped as a build artifact — which is
 * why reads cost nothing, and why a donation appears in the catalogue on the
 * next build rather than the next second.
 *
 * This file is written to the working tree and read straight back into the
 * site build in the same CI job (`.github/workflows/publish-pool.yml`), and it
 * is **never committed**. A registry has a day book and an engrossed
 * register — entries taken continuously, the register printed periodically —
 * and `git commit` is the wrong verb for "printed": revocation deletes a row
 * from D1 immediately, but a row committed to a public git history is
 * recoverable from that history forever, by anyone who has ever cloned or
 * forked the repo, independent of what the deployed site shows. The lawful
 * basis for holding a fingerprint at all is explicit consent with a plain
 * revocation path (§8); a `git log` of every past snapshot would quietly
 * undo that the moment it held one real donation. Deploying a fresh build on
 * every run and discarding the working tree afterwards keeps this file
 * exactly as current as a database query and no more permanent.
 *
 * What this file may contain is the same question `publicEntry` answers in the
 * service, with one difference that matters: a response is seen by its
 * requester, and this is a file anyone can download and keep. Two consequences
 * are load-bearing below rather than incidental.
 *
 *   The per-entry fields are id, attrs, createdAt and wearCount, and nothing
 *   else. `synthetic` and `automation` are read here — the aggregates need
 *   them — and are never written out. Neither the visitor nor the artist can
 *   tell a manufactured entry from a donated one by looking, and that has to
 *   remain true of the artefact, not only of the API that used to serve it.
 *
 *   The order is by id, ascending. An id is a hash, so the sequence carries no
 *   information about when an entry arrived or where it came from. Ordering by
 *   created_at or by wear_count would correlate with the synthetic flag — the
 *   whole launch pool shares a creation window — and would leak per entry
 *   provenance through the sequence, which is the same disclosure by a slower
 *   route. In a served response a bad ordering is a mistake; in a published
 *   file it is permanent, which is exactly why this one is never committed.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { bitsDestroyed } from '@wearme/core/entropy';
import type { AttrVector, Identity, PoolStats } from '@wearme/core/types';
import { writeScripts } from '@wearme/core/scripts/write-scripts';

import { query, repoRoot, scopeFromArgv, type Scope } from './d1.js';

const outPath = resolve(repoRoot, 'data/pool.json');
const scriptsDir = resolve(repoRoot, 'data/scripts');
/** Where emitted scripts say they came from, in their banner and @namespace. */
const SITE_URL = process.env.SITE_URL ?? 'https://deuspoeticus.github.io/the-donor-registry/';
const scope: Scope = scopeFromArgv(process.argv.slice(2));

interface PoolRow {
  id: string;
  attrs: string;
  created_at: string;
  wear_count: number;
  synthetic: number;
  automation: number | null;
}

const rows = query<PoolRow>(
  'SELECT id, attrs, created_at, wear_count, synthetic, automation FROM identity ORDER BY id ASC',
  scope,
);
const meta = query<{ key: string; value: string }>('SELECT key, value FROM meta', scope);

const readMeta = (key: string, fallback: string): string =>
  meta.find((m) => m.key === key)?.value ?? fallback;

const entries: Identity[] = rows.map((row) => ({
  id: row.id,
  attrs: JSON.parse(row.attrs) as AttrVector,
  createdAt: row.created_at,
  wearCount: row.wear_count,
}));

const syntheticCount = rows.reduce((n, row) => n + row.synthetic, 0);

const stats: PoolStats = {
  size: rows.length,
  syntheticCount,
  syntheticAtLaunch: Number(readMeta('syntheticAtLaunch', '0')),
  donatedCount: rows.length - syntheticCount,
  machineDonations: rows.filter((row) => row.synthetic === 0 && (row.automation ?? 0) > 0.5).length,
  totalWears: rows.reduce((n, row) => n + row.wear_count, 0),
  // Only entries worn more than once destroyed anything: the first wearer of an
  // identity is still the only person presenting it.
  bitsDestroyed: bitsDestroyed(rows.filter((r) => r.wear_count > 1).map((r) => r.wear_count)),
  // The forge runs in the browser and its counters were kept by a route this
  // service no longer has (§2 defers it). Published as zero rather than
  // omitted, so the shape stays honest and the site can say the count is local.
  forgeriesDiscarded: 0,
  forgeAttempts: 0,
};

const file = {
  generatedAt: new Date().toISOString(),
  count: entries.length,
  syntheticAtLaunch: stats.syntheticAtLaunch,
  note:
    'The pool as published at the last build. Donations enter it here, on the ' +
    'build, not on the second they are made. Manufactured and donated entries ' +
    'are not distinguishable in this file, by field or by order, and that is ' +
    'deliberate.',
  stats,
  entries,
};

/**
 * The two guarantees above, enforced rather than described.
 *
 * A comment explaining why a field must not be published does not stop it
 * being published. These run before the write, so a file that would disclose
 * per-entry provenance is never produced at all — the failure is a build that
 * stops, not an artefact that ships and has to be retracted.
 */
function assertPublishable(published: typeof file): void {
  const allowed = new Set(['id', 'attrs', 'createdAt', 'wearCount']);
  const leaked = new Set<string>();
  for (const entry of published.entries) {
    for (const key of Object.keys(entry)) if (!allowed.has(key)) leaked.add(key);
  }
  if (leaked.size > 0) {
    throw new Error(
      `entries carry fields that must not be published: ${[...leaked].join(', ')}. ` +
        'Manufactured and donated entries have to be indistinguishable in this file.',
    );
  }

  const ids = published.entries.map((e) => e.id);
  const sorted = [...ids].sort();
  if (ids.some((id, i) => id !== sorted[i])) {
    throw new Error(
      'entries are not in ascending id order. Any other order correlates with ' +
        'the synthetic flag and leaks provenance through the sequence.',
    );
  }

  if (new Set(ids).size !== ids.length) throw new Error('duplicate ids in the published pool');

  // `synthetic` is deliberately absent from this list: `syntheticCount` and
  // `syntheticAtLaunch` are aggregates the interface is supposed to state out
  // loud. It is the per-entry flag that must not ship, and the key allowlist
  // above is what keeps it out. These are the names that may not appear
  // anywhere at all, at any level.
  const raw = JSON.stringify(published);
  for (const forbidden of ['revocation_hash', 'revocationToken', 'automation']) {
    if (raw.includes(forbidden)) throw new Error(`the word "${forbidden}" appears in the output`);
  }
}

assertPublishable(file);

/**
 * Rewrite the file only when the catalogue actually changed.
 *
 * `generatedAt` moves on every run, so comparing bytes would report a
 * difference on every run whether or not a single entry had changed, and
 * `generatedAt` would stop meaning anything. Comparing everything except that
 * field is what makes the timestamp mean something: it becomes the moment the
 * catalogue last *changed*, which is what the site tells visitors it is —
 * "register printed …" rather than "job last ran …".
 *
 * This no longer decides whether to publish, now that publishing is "build
 * and deploy from whatever is on disk" rather than "commit if the working
 * tree is dirty" (see the file header). It only decides whether `generatedAt`
 * moves, which matters locally too: running this twice in a row against an
 * unchanged database should not make the catalogue claim it was just
 * rebuilt.
 */
function unchangedFromDisk(next: typeof file): boolean {
  try {
    const current = JSON.parse(readFileSync(outPath, 'utf8')) as typeof file;
    const withoutTimestamp = (f: typeof file): string =>
      JSON.stringify({ ...f, generatedAt: '' });
    return withoutTimestamp(current) === withoutTimestamp(next);
  } catch {
    // No published file yet, or an unreadable one. Either way, write.
    return false;
  }
}

if (unchangedFromDisk(file)) {
  console.log(
    `${outPath} is already current\n` +
      `  ${stats.size} entries, nothing changed since the last build — not rewritten`,
  );
} else {
  writeFileSync(outPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  const bytes = readFileSync(outPath).length;
  console.log(
    `wrote ${outPath}\n` +
      `  ${stats.size} entries (${stats.donatedCount} donated, ${syntheticCount} manufactured)\n` +
      `  ${stats.totalWears} wears, ${stats.bitsDestroyed.toFixed(2)} bits destroyed\n` +
      `  ${(bytes / 1024).toFixed(0)}KB from the ${scope.slice(2)} database`,
  );
}

/**
 * The catalogue's install links, pre-generated.
 *
 * Run every time rather than only when `pool.json` changed above: a wear count
 * moving does not change a script (the emitter never reads it), but running
 * unconditionally is one pass over ~200 entries and means this can never drift
 * from the id set the catalogue just asserted is current. Content-identical
 * writes leave the working tree clean, so an unchanged pool still commits
 * nothing here either.
 */
const { written, removed } = writeScripts(entries, scriptsDir, SITE_URL);
console.log(
  `wrote ${written} static scripts to ${scriptsDir}${removed > 0 ? ` (${removed} withdrawn, removed)` : ''}`,
);

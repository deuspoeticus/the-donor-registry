/**
 * Forgets withdrawals the published catalogue no longer needs (plan step 6).
 *
 *   npm run prune:revoked --workspace @wearme/worker -- --remote
 *
 * The `revoked` table exists for one reason: the catalogue is a static file, so
 * between a withdrawal and the next build the site needs a live list to filter
 * that file against. Once a build has published a catalogue that does not list
 * an id, the row for that id is answering a question nobody can ask any more,
 * and holding it says "this identity was withdrawn" for no benefit. Withdrawal
 * is the moment a donor asked to stop being recorded; keeping a record of it
 * indefinitely would be a poor reading of that.
 *
 * Run at the *start* of the build, against the catalogue currently deployed —
 * never against the one the job is about to write. `data/pool.json` is no
 * longer a file this repository commits (see `publish-pool.ts`'s file header:
 * a committed snapshot would make a withdrawal recoverable from git history
 * forever, which is the exact guarantee this table's own pruning exists to
 * protect), so "currently deployed" is asked of the live site rather than
 * read off disk. An id dropped before this build's deploy lands would
 * otherwise go unfiltered in the window between: the old catalogue would
 * still list an entry with nothing left to filter it out. Pruning one build
 * behind costs one cycle of retention on a table that is usually empty, and
 * closes that window completely.
 */

import { query, scopeFromArgv, type Scope } from './d1.js';

const scope: Scope = scopeFromArgv(process.argv.slice(2));
/** The catalogue as currently deployed, not the one this build is about to produce. */
const POOL_URL = process.env.LIVE_POOL_URL ?? 'https://deuspoeticus.github.io/the-donor-registry/pool.json';

let published: Set<string>;
try {
  const res = await fetch(POOL_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const file = (await res.json()) as { entries: { id: string }[] };
  published = new Set(file.entries.map((entry) => entry.id));
} catch (error) {
  // Before the first deploy there is no published catalogue to reason about,
  // and no id can be shown to be safe to forget. Doing nothing is correct.
  console.log(`could not read the live catalogue at ${POOL_URL}; nothing pruned (${String(error)})`);
  process.exit(0);
}

const revoked = query<{ id: string }>('SELECT id FROM revoked', scope).map((row) => row.id);
const stale = revoked.filter((id) => !published.has(id));

if (stale.length === 0) {
  console.log(`${revoked.length} withdrawal(s) held, all still needed by the live catalogue`);
} else {
  // Deleted one at a time rather than through a single IN clause. The list is
  // days of withdrawals at most, and an id-at-a-time loop cannot be broken by a
  // clause that grew past whatever limit D1 enforces on statement length.
  for (const id of stale) {
    query(`DELETE FROM revoked WHERE id = '${id.replace(/'/g, "''")}'`, scope);
  }
  console.log(
    `pruned ${stale.length} of ${revoked.length} withdrawal(s)\n` +
      `  the live catalogue no longer lists them, so the filter has nothing left to do\n` +
      `  ${revoked.length - stale.length} kept, still present in the deployed file`,
  );
}

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
 * Run at the *start* of the weekly job, against the catalogue currently
 * committed and deployed — never against the one the job is about to write.
 * The file this job produces is not live until Pages finishes deploying it, and
 * an id dropped before that deploy lands would go unfiltered in the window
 * between: the old catalogue would still list an entry with nothing left to
 * filter it out. Pruning one build behind costs a week of retention on a table
 * that is usually empty, and closes that window completely.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { query, repoRoot, scopeFromArgv, type Scope } from './d1.js';

const scope: Scope = scopeFromArgv(process.argv.slice(2));
const poolPath = resolve(repoRoot, 'data/pool.json');

let published: Set<string>;
try {
  const file = JSON.parse(readFileSync(poolPath, 'utf8')) as { entries: { id: string }[] };
  published = new Set(file.entries.map((entry) => entry.id));
} catch (error) {
  // Before the first build there is no published catalogue to reason about, and
  // no id can be shown to be safe to forget. Doing nothing is correct.
  console.log(`no published catalogue at ${poolPath}; nothing pruned (${String(error)})`);
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

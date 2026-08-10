/**
 * Writes one static `.user.js` file per pool entry — the pre-generated form of
 * the catalogue's default install link (§7).
 *
 * The script text is a pure function of an entry's id and attrs under the
 * default surface modes (converge canvas, converge audio, overrides visible),
 * which is exactly what `DEFAULT_WEAR_OPTIONS` in the catalogue offers as
 * "Take this face". Emitting that file once at build time, into the same
 * `data/` directory the catalogue and the launch pool already publish from,
 * turns the one-click install into a static asset: no request to the pool
 * service is on the path between a visitor and a working userscript.
 *
 * Custom surface modes (perturb, hidden overrides) stay generated in the
 * browser from `@wearme/core/userscript` directly — already serverless, since
 * the attrs are already in the catalogue the browser loaded — so this file
 * only ever needs to cover the default.
 *
 * Called from two places, both of which already have the full entry list on
 * hand: the offline bootstrap generator (packages/core/scripts/bootstrap.ts),
 * for the 200 launch entries, and the worker's weekly publish job
 * (apps/worker/scripts/publish-pool.ts), for the live pool. Neither imports
 * from the other; this is the shared part.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { emitUserscript } from '../src/userscript.js';
import type { Identity } from '../src/types.js';

const EXT = '.user.js';

export interface WriteScriptsResult {
  written: number;
  removed: number;
}

/**
 * Writes `<id>.user.js` for every entry into `outDir`, and deletes any
 * `.user.js` file already there whose id is no longer in `entries`.
 *
 * The removal is what keeps a revoked identity from staying wearable past the
 * build that is supposed to retire it — the same one-build-behind honesty the
 * catalogue itself already has (§8, `README.md`'s "Privacy and law"): a
 * withdrawal is immediate in the live service and in the served `/revoked`
 * list, and complete once this directory is next regenerated and deployed.
 */
export function writeScripts(entries: readonly Identity[], outDir: string, siteUrl: string): WriteScriptsResult {
  mkdirSync(outDir, { recursive: true });

  const wanted = new Set(entries.map((e) => e.id));
  let written = 0;
  for (const entry of entries) {
    const script = emitUserscript(entry, {
      siteUrl,
      canvasMode: 'converge',
      audioMode: 'converge',
      hideOverrides: false,
    });
    writeFileSync(join(outDir, `${entry.id}${EXT}`), script, 'utf8');
    written++;
  }

  let removed = 0;
  for (const name of readdirSync(outDir)) {
    if (!name.endsWith(EXT)) continue;
    const id = name.slice(0, -EXT.length);
    if (!wanted.has(id)) {
      rmSync(join(outDir, name));
      removed++;
    }
  }

  return { written, removed };
}

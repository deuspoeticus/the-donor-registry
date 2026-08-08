/**
 * Running one SQL statement against D1, from a build script.
 *
 * Shared by `publish-pool` and `prune-revoked`, which are two halves of the
 * same weekly job and must agree exactly on how they reach the database.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const workerDir = resolve(here, '..');
export const repoRoot = resolve(here, '../../..');

export type Scope = '--local' | '--remote';

/** `--remote` only when asked for it explicitly. See `scopeFromArgv`. */
export function scopeFromArgv(argv: string[]): Scope {
  return argv.includes('--remote') ? '--remote' : '--local';
}

/**
 * Wrangler's entry script, to be run under this same Node.
 *
 * Not `npx wrangler`: on Windows, Node refuses to spawn a `.cmd` shim without
 * a shell, and reaching for `shell: true` to get around it would put the SQL
 * through a quoting layer it does not need to survive. Resolving the package's
 * own entry point and executing it directly avoids both the shim and the
 * shell, and behaves identically on every platform.
 */
function wranglerEntry(): string {
  const req = createRequire(import.meta.url);
  try {
    const pkgPath = req.resolve('wrangler/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      bin?: string | Record<string, string>;
    };
    const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.wrangler;
    if (rel) return resolve(dirname(pkgPath), rel);
  } catch {
    // Falls through to probing, below.
  }
  // npm hoists workspace dependencies to the root, but not always.
  const candidates = [
    resolve(workerDir, 'node_modules/wrangler/bin/wrangler.js'),
    resolve(repoRoot, 'node_modules/wrangler/bin/wrangler.js'),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`could not locate wrangler; looked in:\n  ${candidates.join('\n  ')}`);
  return found;
}

const WRANGLER = wranglerEntry();

interface D1Result<T> {
  results: T[];
  success: boolean;
}

/**
 * One statement, as JSON.
 *
 * `wrangler d1 execute --json` is the interface here rather than
 * `wrangler d1 export`, whose output is a SQL dump: parsing SQL to recover
 * values that were JSON before they were inserted is a step backwards through
 * two encodings, and every quoting bug it could introduce would land in a
 * published file.
 */
export function query<T>(sql: string, scope: Scope): T[] {
  const stdout = execFileSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', 'wear-me-pool', scope, '--json', '--command', sql],
    { cwd: workerDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // Wrangler prefixes its banner on some paths; the payload starts at the
  // first bracket and runs to the end.
  const start = stdout.indexOf('[');
  if (start === -1) throw new Error(`no JSON in wrangler output:\n${stdout}`);
  const parsed = JSON.parse(stdout.slice(start)) as D1Result<T>[];
  const first = parsed[0];
  if (!first?.success) throw new Error(`query failed: ${sql}`);
  return first.results;
}

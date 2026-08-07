/**
 * Emits a userscript for one pool entry and checks that it parses.
 *
 *   npm run emit --workspace @wearme/core -- [index] [--out path]
 *
 * The syntax check matters more than it sounds. The script is assembled from
 * attribute values that came out of somebody's renderer, embedded into source,
 * and then run at document-start in the main world of every page the wearer
 * opens. A script that fails to parse fails silently and leaves the wearer
 * believing they are someone else.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { coverage, emitUserscript, NOT_COVERED } from '../src/userscript.js';
import type { Identity } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const poolPath = resolve(here, '../../../data/bootstrap.json');
const pool = JSON.parse(readFileSync(poolPath, 'utf8')) as { entries: Identity[] };

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const index = Number(args[0] ?? 0) || 0;
const entry = pool.entries[index];
if (!entry) {
  console.error(`no entry at index ${index}; the pool holds ${pool.entries.length}`);
  process.exit(1);
}

const script = emitUserscript(entry, {
  siteUrl: process.env.SITE_URL ?? 'https://wear-me.example',
  canvasMode: 'converge',
  audioMode: 'converge',
  hideOverrides: false,
});

// Parses as a script in a real engine, or throws with a line number.
try {
  new Function(script);
} catch (error) {
  console.error('the emitted script does not parse:');
  console.error(error);
  process.exit(1);
}

const rows = coverage({ canvasMode: 'converge', audioMode: 'converge' });
console.log(`entry ${entry.id.slice(0, 16)} (index ${index})`);
console.log(`  ${script.length} bytes, ${script.split('\n').length} lines, parses cleanly`);
console.log(`  exact      ${rows.filter((r) => r.state === 'exact').length}`);
console.log(`  converged  ${rows.filter((r) => r.state === 'converged').length}`);
console.log(`  untouched  ${rows.filter((r) => r.state === 'none').length}`);
console.log(`  not covered at all: ${NOT_COVERED.length} surfaces, listed in the interface`);

if (outFlag !== -1 && args[outFlag + 1]) {
  const target = resolve(process.cwd(), args[outFlag + 1]);
  writeFileSync(target, script, 'utf8');
  console.log(`  written to ${target}`);
}

/**
 * Generates data/bootstrap.json — the seeded launch pool (§1).
 *
 * Run offline, checked into the repository, reproducible from a fixed seed so
 * anyone can regenerate it and get the same file. The interface states that the
 * pool is seeded and how many entries are synthetic at launch. That is not a
 * disclaimer bolted on afterwards; a pool nobody has donated to yet is exactly
 * the condition the piece describes, and hiding it would be the one dishonesty
 * that invalidates the rest.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ATTR_IDS } from '../src/attributes.js';
import { fingerprintId } from '../src/canonical.js';
import { checkConstraints } from '../src/constraints.js';
import { rngFromHex } from '../src/prng.js';
import { sha256 } from '../src/hash.js';
import type { AttrVector } from '../src/types.js';
import { applyTail, sampleFromPrior } from './prior.js';

const TARGET = Number(process.env.BOOTSTRAP_COUNT ?? 200);
const SEED = process.env.BOOTSTRAP_SEED ?? 'wear-me/bootstrap/v1';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '../../../data/bootstrap.json');

/** Every entry carries the full key set. A missing key and a null value are different claims. */
function normalise(attrs: AttrVector): AttrVector {
  const out: AttrVector = {};
  for (const id of ATTR_IDS) out[id] = attrs[id] ?? null;
  return out;
}

interface BootstrapEntry {
  id: string;
  attrs: AttrVector;
  createdAt: string;
  wearCount: number;
  synthetic: true;
  automation: number;
  archetype: string;
}

const rng = rngFromHex(sha256(SEED));
const entries: BootstrapEntry[] = [];
const seen = new Set<string>();
const rejections = new Map<string, number>();
let attempts = 0;
let duplicates = 0;

// Dated to the day, like every other entry (§8). The launch pool shares one date
// because it was generated in one run, and pretending otherwise would be a lie
// about when these entries came into being.
const createdAt = new Date().toISOString().slice(0, 10);

while (entries.length < TARGET && attempts < TARGET * 60) {
  attempts++;
  const seed = `${SEED}:${attempts}`;
  const sample = sampleFromPrior(rng, seed);
  const attrs = normalise(applyTail(rng, sample.attrs));

  const { ok, violations } = checkConstraints(attrs);
  if (!ok) {
    for (const v of violations) rejections.set(v, (rejections.get(v) ?? 0) + 1);
    continue;
  }

  const id = fingerprintId(attrs);
  if (seen.has(id)) {
    duplicates++;
    continue;
  }
  seen.add(id);

  entries.push({
    id,
    attrs,
    createdAt,
    wearCount: 0,
    synthetic: true,
    automation: Number(sample.automation.toFixed(4)),
    archetype: sample.archetype,
  });
}

const byArchetype = new Map<string, number>();
for (const e of entries) byArchetype.set(e.archetype, (byArchetype.get(e.archetype) ?? 0) + 1);

const payload = {
  generatedAt: createdAt,
  seed: SEED,
  count: entries.length,
  syntheticAtLaunch: entries.length,
  note:
    'Every entry in this file was manufactured offline from a hand-built prior. None of it was collected from a person or a machine that visited the site. It exists so the pool can compute a surprisal on its first day, and the interface says so.',
  entries: entries.map(({ archetype: _archetype, ...rest }) => rest),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const rejected = [...rejections.entries()].sort((a, b) => b[1] - a[1]);

console.log(`wrote ${entries.length} entries to ${outPath}`);
console.log(`  attempts        ${attempts}`);
console.log(`  duplicates      ${duplicates}`);
console.log(`  gate rejections ${rejected.reduce((s, [, n]) => s + n, 0)}`);
for (const [id, n] of rejected) console.log(`    ${id.padEnd(34)} ${n}`);
console.log('  archetypes');
for (const [name, n] of [...byArchetype].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${name.padEnd(24)} ${n}`);
}

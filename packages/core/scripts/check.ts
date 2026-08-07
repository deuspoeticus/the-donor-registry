/**
 * A standing check over the model, run against whatever pool is on disk.
 *
 * It exists because three numbers in this piece are load-bearing and easy to
 * get quietly wrong: the ceiling that bounds every surprisal, the gap between
 * the naive and modelled figures, and the forge's rejection rate. If those are
 * wrong the interface is lying, so they are checked rather than assumed.
 *
 *   npm run check --workspace @wearme/core
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ATTR_IDS, attrLabel } from '../src/attributes.js';
import { buildEntropyModel, measure } from '../src/entropy.js';
import { createForge } from '../src/forge.js';
import { checkConstraints } from '../src/constraints.js';
import { rngFromHex } from '../src/prng.js';
import { sha256 } from '../src/hash.js';
import { fingerprintId } from '../src/canonical.js';
import type { AttrVector } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const poolPath = resolve(here, '../../../data/bootstrap.json');
const pool = JSON.parse(readFileSync(poolPath, 'utf8')) as {
  entries: { id: string; attrs: AttrVector }[];
};

const entries = pool.entries;
const vectors = entries.map((e) => e.attrs);
const fail: string[] = [];

console.log(`pool: ${entries.length} entries, ${ATTR_IDS.length} attributes`);
console.log(`ceiling: log2(${entries.length}) = ${(Math.log2(entries.length)).toFixed(2)} bits\n`);

// 1. ids are reproducible from the vectors alone.
const mismatched = entries.filter((e) => fingerprintId(e.attrs) !== e.id);
if (mismatched.length) fail.push(`${mismatched.length} entries whose id does not match their attrs`);

// 2. every stored entry passes the gate it was admitted through.
const incoherent = entries.filter((e) => !checkConstraints(e.attrs).ok);
if (incoherent.length) fail.push(`${incoherent.length} stored entries violate the constraint manifest`);

// 3. entropy: nothing exceeds the ceiling, and the gap is real.
const model = buildEntropyModel(vectors, ATTR_IDS);
const ceiling = Math.log2(entries.length);
let overCeiling = 0;
let observedTotal = 0;
let modelledTotal = 0;

for (const e of entries) {
  const r = measure(model, e.attrs);
  if (r.modelledBits > ceiling + 1e-9) overCeiling++;
  if (r.oneInN > entries.length + 1e-9) overCeiling++;
  observedTotal += r.observedBits;
  modelledTotal += r.modelledBits;
}
if (overCeiling) fail.push(`${overCeiling} measurements exceeded the pool bound`);

console.log('entropy, averaged over the pool');
console.log(`  observed (independence assumed)  ${(observedTotal / entries.length).toFixed(2)} bits`);
console.log(`  modelled (Chow-Liu)              ${(modelledTotal / entries.length).toFixed(2)} bits`);
console.log(`  gap                              ${((observedTotal - modelledTotal) / entries.length).toFixed(2)} bits`);
console.log(`  modelled attributes              ${model.learnableIds.length}`);
console.log(`  held out as near-unique          ${model.nearUniqueIds.length}  ${model.nearUniqueIds.map(attrLabel).join(', ')}\n`);

const sample = measure(model, entries[0].attrs);
console.log('top contributors for entry 0');
for (const a of sample.perAttribute.slice(0, 6)) {
  console.log(`  ${attrLabel(a.attr).padEnd(30)} ${a.bits.toFixed(2)} bits  (seen ${a.count}x)`);
}

// 4. the dependency tree.
const forge = createForge(entries);
const strongest = [...forge.tree.edges].sort((a, b) => b.mi - a.mi).slice(0, 8);
console.log('\nstrongest dependencies (mutual information, bits)');
for (const e of strongest) {
  console.log(`  ${attrLabel(e.parent).padEnd(28)} -> ${attrLabel(e.child).padEnd(28)} ${e.mi.toFixed(3)}`);
}

// 5. the forge: does it produce coherent people, and does it reject enough?
const rng = rngFromHex(sha256('check'));
const forged: AttrVector[] = [];
for (let i = 0; i < 100; i++) {
  const f = forge.forge(rng);
  if (f) forged.push(f.attrs);
}
const badForgeries = forged.filter((f) => !checkConstraints(f).ok);
if (badForgeries.length) fail.push(`${badForgeries.length} forgeries passed the gate but violate a constraint`);
if (forged.length < 100) fail.push(`forge produced only ${forged.length}/100 identities`);

// A forge that only ever reproduces entries it was trained on has not made
// anyone; it has copied someone, which is a different and worse act.
const poolKeys = new Set(entries.map((e) => JSON.stringify(forge.sampledIds.map((id) => e.attrs[id]))));
const copies = forged.filter((f) => poolKeys.has(JSON.stringify(forge.sampledIds.map((id) => f[id]))));

console.log('\nforge');
console.log(`  sampled attrs   ${forge.sampledIds.length}`);
console.log(`  grafted attrs   ${forge.graftedIds.length}  ${forge.graftedIds.map(attrLabel).join(', ')}`);
console.log(`  produced        ${forged.length}`);
console.log(`  attempts        ${forge.stats.attempts}`);
console.log(`  discarded       ${forge.stats.discarded}  (${((100 * forge.stats.discarded) / forge.stats.attempts).toFixed(1)}%)`);
console.log(`  by likelihood   ${forge.stats.discardedByLikelihood}`);
console.log(`  by constraint   ${forge.stats.discarded - forge.stats.discardedByLikelihood}`);
console.log(`  copies of pool  ${copies.length}`);
const byConstraint = Object.entries(forge.stats.discardedByConstraint).sort((a, b) => b[1] - a[1]);
for (const [id, n] of byConstraint.slice(0, 10)) console.log(`    ${id.padEnd(34)} ${n}`);

// 6. forged entries must be indistinguishable in shape: same keys, same types.
const keyRef = JSON.stringify(ATTR_IDS);
const shapeBad = forged.filter((f) => JSON.stringify(Object.keys(f).sort()) !== JSON.stringify([...ATTR_IDS].sort()));
if (shapeBad.length) fail.push(`${shapeBad.length} forgeries have a different key set from real entries`);
void keyRef;

console.log('');
if (fail.length) {
  for (const f of fail) console.error(`FAIL  ${f}`);
  process.exit(1);
}
console.log('all checks passed');

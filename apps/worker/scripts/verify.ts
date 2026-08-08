/**
 * End-to-end check of the pool service (plan step 9).
 *
 *   npm run dev --workspace @wearme/worker      # in another terminal
 *   npm run verify --workspace @wearme/worker
 *
 * Exercises the donate → wear → revoke path against a running Worker, and
 * checks the refusals as carefully as the successes: a mismatched id, a wrong
 * revocation token, and a script fetched for a withdrawn entry are all part of
 * what this service promises, and all three are silent failures if they break.
 *
 * The script comparison is the highest-value assertion here. It re-runs
 * `emitUserscript` in this process with the options the route is supposed to
 * pass, and compares the result byte for byte with what the route actually
 * served. That covers the emitter, the D1 read path, the query-string handling
 * and the configured SITE_URL in one equality — the same four things the
 * Fastify route wired together, checked against the same pure function.
 *
 * Side effects, all local: one donated entry is created, worn, then withdrawn,
 * which leaves one row in `revoked`. That is the state the weekly build clears,
 * so seeing it afterwards is correct rather than residue.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fingerprintId } from '@wearme/core/canonical';
import { emitUserscript } from '@wearme/core/userscript';
import type { AttrVector, Identity } from '@wearme/core/types';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.WORKER_URL ?? 'http://127.0.0.1:8787';

// Read from the deploy config rather than repeated here, so a change to the
// configured site URL fails this check instead of silently passing it.
const wranglerToml = readFileSync(resolve(here, '../wrangler.toml'), 'utf8');
const SITE_URL = /^SITE_URL\s*=\s*"([^"]+)"/m.exec(wranglerToml)?.[1];
if (!SITE_URL) throw new Error('SITE_URL not found in wrangler.toml');

interface BootstrapFile {
  entries: { id: string; attrs: AttrVector; createdAt: string; automation: number }[];
}
const bootstrap = JSON.parse(
  readFileSync(resolve(here, '../../../data/bootstrap.json'), 'utf8'),
) as BootstrapFile;

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail === undefined ? '' : `\n          ${JSON.stringify(detail)}`}`);
  }
}

/**
 * A caller address for this run, and only this run.
 *
 * The limiter keys its counters on a hash of the caller's address, so a script
 * that always arrives from the same one would spend that bucket a little
 * further on every run and eventually start failing on its fourth or fifth
 * invocation inside a ten-minute window — a confusing failure with nothing
 * wrong behind it. A fresh address per run keeps the budget the checks measure
 * separate from the budget the checks consume.
 */
const randomAddress = (): string => `100.${randomBytes(3).join('.')}`;

const RUN_ADDRESS = randomAddress();

const json = async (path: string, init?: RequestInit) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers as Record<string, string>), 'CF-Connecting-IP': RUN_ADDRESS },
  });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body, data: safeParse(body) };
};

function safeParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const del = (body: unknown): RequestInit => ({
  method: 'DELETE',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

// ---------------------------------------------------------------- the fixture

const seeded = bootstrap.entries[0]!;
const seededIdentity: Identity = {
  id: seeded.id,
  attrs: seeded.attrs,
  createdAt: seeded.createdAt,
  wearCount: 0,
};

// A novel but valid vector: the launch pool's first entry with one hash
// replaced. The shape stays exactly what the schema accepts, and the id is
// recomputed rather than invented, because the service recomputes it too.
//
// The replacement is random per run so this script can be run repeatedly
// against the same local database. A fixed value would be donated on the first
// run and withdrawn by the end of it, and every run after that would open by
// finding its own fixture already in the revocation list.
const donatedAttrs: AttrVector = {
  ...seeded.attrs,
  'canvas.hash': randomBytes(16).toString('hex'),
} as AttrVector;
const donatedId = fingerprintId(donatedAttrs);

// ---------------------------------------------------------------- the checks

console.log(`\nverifying ${BASE}\n`);

console.log('health and starting state');
{
  const health = await json('/health');
  check('GET /health is ok', health.status === 200 && health.data?.ok === true, health.data);
  check('pool holds the 200 launch entries', health.data?.size === 200, health.data);

  const revoked = await json('/revoked');
  check('GET /revoked returns a list', Array.isArray(revoked.data?.ids), revoked.data);
  check(
    'the donated id is not already withdrawn',
    !(revoked.data?.ids as string[]).includes(donatedId),
  );
}

console.log('\nthe script route');
{
  const res = await json(`/identity/${seeded.id}/script.user.js`);
  check('serves a seeded entry', res.status === 200);
  check(
    'content-type is javascript',
    res.headers.get('content-type')?.startsWith('text/javascript') === true,
    res.headers.get('content-type'),
  );
  check(
    'served inline, so the manager offers to install it',
    res.headers.get('content-disposition') === 'inline',
  );
  check(
    'never cached, so a withdrawal takes effect on next fetch',
    res.headers.get('cache-control') === 'no-store',
  );

  const expected = emitUserscript(seededIdentity, {
    siteUrl: SITE_URL,
    canvasMode: 'converge',
    audioMode: 'converge',
    hideOverrides: false,
  });
  check('byte-identical to the emitter with the default options', res.body === expected, {
    served: res.body.length,
    expected: expected.length,
  });

  const perturbed = await json(`/identity/${seeded.id}/script.user.js?canvas=perturb&hide=true`);
  const expectedPerturbed = emitUserscript(seededIdentity, {
    siteUrl: SITE_URL,
    canvasMode: 'perturb',
    audioMode: 'converge',
    hideOverrides: true,
  });
  check('query options reach the emitter', perturbed.body === expectedPerturbed, {
    served: perturbed.body.length,
    expected: expectedPerturbed.length,
  });
  check('and actually change the output', perturbed.body !== res.body);

  const missing = await json(`/identity/${'0'.repeat(64)}/script.user.js`);
  check('404s for an id that is not in the pool', missing.status === 404);

  const malformed = await json('/identity/not-a-hash/script.user.js');
  check('400s for a malformed id', malformed.status === 400);
}

console.log('\ndonation');
let revocationToken = '';
{
  // Asserted on which field was rejected, not just the status. An empty or
  // unparseable body also produces a 400 here, so a status-only check would
  // pass even if the id were never recomputed — the one thing this route must
  // not skip. The rejection comes from `donateSchema`'s refinement, which
  // recomputes the hash before the route gets the body at all; the route's own
  // recomputation is a second line of defence behind it.
  const rejectedField = (body: Record<string, unknown> | null): string =>
    Array.isArray(body?.path) ? String((body.path as unknown[])[0] ?? '') : '';

  const mismatched = await json(
    '/identity',
    post({ attrs: donatedAttrs, id: seeded.id, automation: null, consent: 'donate' }),
  );
  check(
    'refuses an id that does not match the attrs',
    mismatched.status === 400 && rejectedField(mismatched.data) === 'id',
    mismatched.data,
  );

  const noConsent = await json(
    '/identity',
    post({ attrs: donatedAttrs, id: donatedId, automation: null }),
  );
  check(
    'refuses a donation with no consent field',
    noConsent.status === 400 && rejectedField(noConsent.data) === 'consent',
    noConsent.data,
  );

  const donated = await json(
    '/identity',
    post({ attrs: donatedAttrs, id: donatedId, automation: 0.1, consent: 'donate' }),
  );
  check('accepts a valid donation', donated.status === 201, donated.data);
  check('reports it as new', donated.data?.alreadyPresent === false);
  check(
    'returns a revocation token',
    typeof donated.data?.revocationToken === 'string' &&
      /^[0-9a-f]{48}$/.test(donated.data.revocationToken as string),
    donated.data?.revocationToken,
  );
  revocationToken = (donated.data?.revocationToken as string) ?? '';

  const again = await json(
    '/identity',
    post({ attrs: donatedAttrs, id: donatedId, automation: 0.1, consent: 'donate' }),
  );
  check('a second donation of the same signature is one entry', again.status === 200, again.data);
  check('and says so', again.data?.alreadyPresent === true);
  check('and issues no second token', again.data?.revocationToken === null);
}

console.log('\nwearing');
{
  const first = await json(`/wear/${donatedId}`, post({ first: true }));
  check('counts a first wear', first.status === 200 && first.data?.counted === true, first.data);
  check('the count is 1', first.data?.wearCount === 1, first.data);
  check('and reports the bits it destroyed', typeof first.data?.bitsDestroyed === 'number');

  const repeat = await json(`/wear/${donatedId}`, post({ first: false }));
  check('does not count a repeat wear', repeat.data?.counted === false, repeat.data);
  check('and leaves the count alone', repeat.data?.wearCount === 1, repeat.data);

  const missing = await json(`/wear/${'0'.repeat(64)}`, post({ first: true }));
  check('404s for wearing an entry that is not there', missing.status === 404);
}

console.log('\nrevocation');
{
  const wrong = await json(`/identity/${donatedId}`, del({ token: 'f'.repeat(48) }));
  check('refuses a token that does not match', wrong.status === 403, wrong.data);

  const stillThere = await json(`/identity/${donatedId}/script.user.js`);
  check('the entry survives a failed revocation', stillThere.status === 200);

  const revoked = await json(`/identity/${donatedId}`, del({ token: revocationToken }));
  check('accepts the real token', revoked.status === 200 && revoked.data?.revoked === true, revoked.data);

  const gone = await json(`/identity/${donatedId}/script.user.js`);
  check('the script stops being served immediately', gone.status === 404);

  const list = await json('/revoked');
  check(
    'the id appears in the withdrawal list the catalogue filters against',
    (list.data?.ids as string[]).includes(donatedId),
    list.data,
  );
  check(
    'the list is cached only briefly',
    list.headers.get('cache-control') === 'public, max-age=60',
    list.headers.get('cache-control'),
  );

  const health = await json('/health');
  check('the pool is back to its 200 launch entries', health.data?.size === 200, health.data);
}

console.log('\nrate limiting');
{
  // Each burst declares its own caller address, so it gets its own bucket and
  // does not spend the budget the rest of this script runs on. That the two
  // bursts do not interfere is itself the thing being checked: the counter is
  // keyed on the hashed address, so two callers must not share a limit.
  const from = (ip: string): RequestInit => ({
    ...post({ nonsense: true }),
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
  });

  const burstAddress = randomAddress();
  const DONATE_LIMIT = 20;
  let blockedAt = 0;
  for (let i = 1; i <= DONATE_LIMIT + 1; i += 1) {
    const res = await fetch(`${BASE}/identity`, from(burstAddress));
    if (res.status === 429) {
      blockedAt = i;
      break;
    }
  }
  check(
    `blocks the donate bucket after ${DONATE_LIMIT} calls in a window`,
    blockedAt === DONATE_LIMIT + 1,
    { blockedAt },
  );

  // The limiter runs before the body is parsed, so these all carried nonsense
  // and none of them could have written an entry.
  const health = await json('/health');
  check('a refused burst wrote nothing to the pool', health.data?.size === 200, health.data);

  const other = await fetch(`${BASE}/identity`, from(randomAddress()));
  check('a different caller still has its own budget', other.status !== 429, {
    status: other.status,
  });
}

console.log(
  `\n${failures.length === 0 ? 'all' : passed} of ${passed + failures.length} checks passed`,
);
if (failures.length > 0) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

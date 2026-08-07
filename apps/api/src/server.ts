/**
 * The pool (§8).
 *
 * A browser fingerprint is almost certainly personal data under GDPR. The
 * lawful basis here is explicit informed consent, freely given, with a plain
 * revocation path: every donor keeps a token and can withdraw the identity at
 * any time, which removes it from the catalogue and invalidates existing
 * scripts on their next fetch.
 *
 * Meanwhile the same collection is performed at planetary scale under a
 * legitimate-interest claim by companies that never show anyone the payload.
 * The asymmetry is the point, and it is stated in the concept text rather than
 * only implemented here.
 */

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';

import { fingerprintId } from '@wearme/core/canonical';
import {
  consequenceSchema,
  donateSchema,
  idSchema,
  poolQuerySchema,
  reportSchema,
  revokeSchema,
  wearSchema,
} from '@wearme/core/schema';
import { bitsDestroyedBy } from '@wearme/core/entropy';
import { emitUserscript, type SurfaceMode } from '@wearme/core/userscript';

import {
  bumpMeta,
  hashToken,
  openDatabase,
  poolStats,
  publicEntry,
  seedFromBootstrap,
  today,
  type Row,
} from './db.js';
import { createLimiter } from './ratelimit.js';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const DB_PATH = process.env.DB_PATH ?? resolve(process.cwd(), 'pool.db');
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim());
/** Where emitted scripts say they came from, in their banner and @namespace. */
const SITE_URL = process.env.SITE_URL ?? 'http://localhost:5173';

const db = openDatabase(DB_PATH);
const seeded = seedFromBootstrap(db);
const limiter = createLimiter();

const app = Fastify({
  // The default logger serialises request headers, which would put the
  // User-Agent this service promises not to keep into the log stream. Only the
  // method, the route and the status are recorded.
  logger: {
    serializers: {
      req: (req: FastifyRequest) => ({ method: req.method, url: req.routeOptions?.url ?? req.url }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  },
  trustProxy: true,
});

await app.register(cors, {
  origin: ORIGINS.includes('*') ? true : ORIGINS,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
});

/** Only ever passed to the limiter, which hashes it under a rotating salt. Never stored. */
const callerAddress = (req: FastifyRequest): string => req.ip ?? 'unknown';

function limit(req: FastifyRequest, bucket: string, max: number): boolean {
  return limiter.take(callerAddress(req), bucket, max);
}

// ---------------------------------------------------------------- reading the pool

app.get('/pool', async (req, reply) => {
  const parsed = poolQuerySchema.safeParse(req.query);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
  const { limit: take, offset, sort } = parsed.data;

  // Ordering is over public columns only. Sorting by anything correlated with
  // the synthetic flag would leak per-entry provenance through the sequence,
  // which is the same disclosure by a slower route.
  const order =
    sort === 'worn' ? 'wear_count DESC, id ASC' : sort === 'id' ? 'id ASC' : 'created_at DESC, id ASC';

  const rows = db
    .prepare(`SELECT * FROM identity ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(take, offset) as Row[];
  const total = (db.prepare('SELECT COUNT(*) AS n FROM identity').get() as { n: number }).n;

  return { total, offset, limit: take, entries: rows.map(publicEntry) };
});

app.get('/pool/stats', async () => poolStats(db));

app.get('/identity/:id', async (req, reply) => {
  const parsed = idSchema.safeParse((req.params as { id: string }).id);
  if (!parsed.success) return reply.code(400).send({ error: 'malformed id' });
  const row = db.prepare('SELECT * FROM identity WHERE id = ?').get(parsed.data) as Row | undefined;
  if (!row) return reply.code(404).send({ error: 'no entry with that id' });
  return publicEntry(row);
});

/**
 * The script for one entry, served as a script.
 *
 * This exists so that wearing is one click. A userscript manager watches for
 * navigations to a `.user.js` URL and offers to install what it finds there;
 * hand it a Blob download instead and the visitor has to find the file and
 * import it by hand, which is three steps and a manual for something that
 * should be a button.
 *
 * Served inline rather than as an attachment, deliberately — `Content-Disposition:
 * attachment` would make the browser save it and defeat the interception. A
 * visitor with no manager installed sees the source, which is the correct
 * fallback for a piece that expects to be read.
 */
app.get('/identity/:id/script.user.js', async (req, reply) => {
  const parsed = idSchema.safeParse((req.params as { id: string }).id);
  if (!parsed.success) return reply.code(400).send({ error: 'malformed id' });

  const row = db.prepare('SELECT * FROM identity WHERE id = ?').get(parsed.data) as Row | undefined;
  if (!row) return reply.code(404).send({ error: 'no entry with that id' });

  const query = req.query as Record<string, string | undefined>;
  const mode = (value: string | undefined): SurfaceMode => (value === 'perturb' ? 'perturb' : 'converge');

  const script = emitUserscript(publicEntry(row), {
    siteUrl: SITE_URL,
    canvasMode: mode(query.canvas),
    audioMode: mode(query.audio),
    hideOverrides: query.hide === 'true',
  });

  return reply
    .header('content-type', 'text/javascript; charset=utf-8')
    .header('content-disposition', 'inline')
    // A revoked identity must stop being wearable, so this is never cached.
    .header('cache-control', 'no-store')
    .send(script);
});

// ---------------------------------------------------------------- donating

app.post('/identity', async (req, reply) => {
  if (!limit(req, 'donate', 20)) {
    return reply.code(429).send({ error: 'too many donations from this connection in this window' });
  }

  const parsed = donateSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues[0].message, path: parsed.error.issues[0].path });
  }
  const body = parsed.data;

  // Recomputed rather than trusted. The id is the hash of the vector or it is
  // not the id, and a client that disagrees does not get to define it.
  const id = fingerprintId(body.attrs);
  if (id !== body.id) return reply.code(400).send({ error: 'id does not match attrs' });

  const existing = db.prepare('SELECT id FROM identity WHERE id = ?').get(id) as { id: string } | undefined;
  if (existing) {
    // The same signature donated twice is one entry. Saying so is more useful
    // than a duplicate, and it is the first place a visitor learns that their
    // browser is not unique after all.
    return reply.code(200).send({ id, alreadyPresent: true, revocationToken: null });
  }

  const token = randomBytes(24).toString('hex');
  db.prepare(
    `INSERT INTO identity (id, attrs, created_at, wear_count, synthetic, automation, revocation_hash)
     VALUES (?, ?, ?, 0, 0, ?, ?)`,
  ).run(id, JSON.stringify(body.attrs), today(), body.automation, hashToken(token));

  // Returned exactly once. It is not stored in recoverable form, so it cannot be
  // reissued, and the interface says so before the visitor closes the dialogue.
  return reply.code(201).send({ id, alreadyPresent: false, revocationToken: token });
});

app.delete('/identity/:id', async (req, reply) => {
  if (!limit(req, 'revoke', 30)) return reply.code(429).send({ error: 'too many attempts' });

  const id = idSchema.safeParse((req.params as { id: string }).id);
  const body = revokeSchema.safeParse(req.body);
  if (!id.success || !body.success) return reply.code(400).send({ error: 'malformed request' });

  const row = db.prepare('SELECT revocation_hash FROM identity WHERE id = ?').get(id.data) as
    | { revocation_hash: string | null }
    | undefined;
  if (!row) return reply.code(404).send({ error: 'no entry with that id' });
  if (!row.revocation_hash || row.revocation_hash !== hashToken(body.data.token)) {
    return reply.code(403).send({ error: 'that token does not match this entry' });
  }

  db.prepare('DELETE FROM identity WHERE id = ?').run(id.data);
  db.prepare('DELETE FROM report WHERE identity_id = ?').run(id.data);
  return { revoked: true, id: id.data };
});

// ---------------------------------------------------------------- wearing

app.post('/wear/:id', async (req, reply) => {
  if (!limit(req, 'wear', 60)) return reply.code(429).send({ error: 'too many wears in this window' });

  const id = idSchema.safeParse((req.params as { id: string }).id);
  if (!id.success) return reply.code(400).send({ error: 'malformed id' });
  const parsed = wearSchema.safeParse(req.body ?? {});
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });

  const row = db.prepare('SELECT wear_count FROM identity WHERE id = ?').get(id.data) as
    | { wear_count: number }
    | undefined;
  if (!row) return reply.code(404).send({ error: 'no entry with that id' });

  // `first` is asserted by the client, which stores whether it has worn this
  // entry before. The server cannot verify it, because verifying it would mean
  // keeping the per-visitor identifier this service refuses to keep. The
  // interface states that the count is self-reported for exactly that reason.
  if (!parsed.data.first) {
    return { id: id.data, wearCount: row.wear_count, counted: false };
  }

  db.prepare('UPDATE identity SET wear_count = wear_count + 1 WHERE id = ?').run(id.data);
  const wearCount = row.wear_count + 1;
  return {
    id: id.data,
    wearCount,
    counted: true,
    bitsDestroyed: bitsDestroyedBy(wearCount),
  };
});

app.post('/report', async (req, reply) => {
  if (!limit(req, 'report', 60)) return reply.code(429).send({ error: 'too many reports' });

  const body = reportSchema.safeParse(req.body);
  const id = idSchema.safeParse((req.body as { identityId?: string })?.identityId);
  if (!body.success || !id.success) return reply.code(400).send({ error: 'malformed report' });

  // The count, and only the count. There is no column for an origin.
  db.prepare('INSERT INTO report (identity_id, origin_count, created_at) VALUES (?, ?, ?)').run(
    id.data,
    body.data.originCount,
    today(),
  );
  return { recorded: true };
});

// ---------------------------------------------------------------- consequence log (§7b)

app.post('/consequence', async (req, reply) => {
  if (!limit(req, 'consequence', 10)) return reply.code(429).send({ error: 'too many entries' });

  const parsed = consequenceSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });

  db.prepare(
    'INSERT INTO consequence (identity_id, category, note, created_at) VALUES (?, ?, ?, ?)',
  ).run(parsed.data.identityId ?? null, parsed.data.category, parsed.data.note, today());
  return reply.code(201).send({ recorded: true });
});

app.get('/consequence', async () => {
  const rows = db
    .prepare('SELECT category, note, created_at FROM consequence ORDER BY id DESC LIMIT 200')
    .all() as { category: string; note: string; created_at: string }[];
  return { entries: rows.map((r) => ({ category: r.category, note: r.note, createdAt: r.created_at })) };
});

// ---------------------------------------------------------------- forge accounting

/**
 * The forge runs in the browser, so its rejection count would be lost when the
 * tab closes. The site posts the delta; the monument's inscription needs a
 * running total, and this is where it lives.
 */
app.post('/forge/stats', async (req, reply) => {
  if (!limit(req, 'forge', 120)) return reply.code(429).send({ error: 'too many updates' });
  const body = req.body as { attempts?: number; discarded?: number };
  const attempts = Math.max(0, Math.min(100000, Number(body?.attempts ?? 0)));
  const discarded = Math.max(0, Math.min(100000, Number(body?.discarded ?? 0)));
  if (!Number.isFinite(attempts) || !Number.isFinite(discarded)) {
    return reply.code(400).send({ error: 'malformed counts' });
  }
  bumpMeta(db, 'forgeAttempts', attempts);
  bumpMeta(db, 'forgeriesDiscarded', discarded);
  return { recorded: true };
});

app.get('/health', async () => ({ ok: true, seeded }));

const shutdown = async () => {
  limiter.dispose();
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: PORT, host: HOST });
app.log.info(`pool open on ${HOST}:${PORT}, database ${DB_PATH}, seeded ${seeded} entries`);

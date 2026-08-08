/**
 * The pool, as the browser sees it.
 *
 * Two independent facts, and the interface states both rather than collapsing
 * them into one flag as it used to.
 *
 * Where the entries came from: the published catalogue (`pool.json`, rewritten
 * by the weekly build, holding every donation made before it) or the launch
 * file (`bootstrap.json`, seeded, which nothing has ever entered).
 *
 * Whether the pool service is answering: donating, withdrawing and wearing are
 * writes, and they are possible or they are not — independently of which file
 * the catalogue came from. A visitor reading a published catalogue while the
 * service is down is looking at real donations they cannot join, and saying
 * "the pool service is not answering, so this is the seeded launch file" would
 * be two claims where only one is true.
 *
 * Because the catalogue is a file, a donation reaches it at the next build. A
 * withdrawal cannot wait that long — it was promised as immediate, and it is
 * the lawful basis for holding the data at all — so the service serves the ids
 * withdrawn since the last build and they are filtered out here.
 */

import { bitsDestroyed } from '@wearme/core/entropy';
import type { Identity, PoolStats } from '@wearme/core/types';

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';

export type PoolSource = 'published' | 'launch';

export interface Pool {
  entries: Identity[];
  stats: PoolStats;
  source: PoolSource;
  /** When the catalogue was last rebuilt. Null for the launch file. */
  generatedAt: string | null;
  /** The service answered, so donating, wearing and withdrawing are possible. */
  writesAvailable: boolean;
  /** Set when the service was tried and did not answer. Shown, not swallowed. */
  serviceError: string | null;
  /** Entries withdrawn since the last build and filtered out of the catalogue. */
  withdrawnSinceBuild: number;
  /**
   * This browser's own donation, present in the pool but not in the published
   * catalogue yet. Shown to its donor and to nobody else, and marked as such
   * everywhere it appears.
   */
  pendingId: string | null;
}

/** `data/pool.json`, written by the worker's publish:pool at each build. */
interface PublishedFile {
  generatedAt: string;
  count: number;
  syntheticAtLaunch: number;
  note: string;
  stats: PoolStats;
  entries: Identity[];
}

interface BootstrapFile {
  generatedAt: string;
  count: number;
  syntheticAtLaunch: number;
  note: string;
  entries: { id: string; attrs: Identity['attrs']; createdAt: string; wearCount: number }[];
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { accept: 'application/json', ...init?.headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

const asMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The ids withdrawn since the last build.
 *
 * This one request is also how the site learns the service is up. Asking
 * separately would be a second round trip to establish something this answer
 * already proves, and a probe that succeeds while the route the site actually
 * depends on fails would be worse than no probe at all.
 *
 * A failure is read as "no writes", not as "no withdrawals". Presuming the
 * pool is reachable when it is not would offer the visitor a donation button
 * that cannot work; presuming it unreachable when it is only costs a message
 * that is briefly too cautious.
 */
async function loadWithdrawals(fresh: boolean): Promise<{ ids: Set<string>; error: string | null }> {
  try {
    // The service allows this to be cached for a minute, which is the right
    // trade for an ordinary page load. It is the wrong trade immediately after
    // a withdrawal: the donor who just took their identity back would reload
    // into a minute-old list and find it still there. `fresh` is passed at
    // exactly that call site, and the promise the piece makes about
    // withdrawal is why it exists.
    const { ids } = await fetchJSON<{ ids: string[] }>(
      `${API}/revoked`,
      fresh ? { cache: 'no-store' } : undefined,
    );
    return { ids: new Set(ids), error: null };
  } catch (error) {
    return { ids: new Set<string>(), error: asMessage(error) };
  }
}

async function fetchCatalogue(): Promise<
  { source: 'published'; file: PublishedFile } | { source: 'launch'; file: BootstrapFile }
> {
  const base = import.meta.env.BASE_URL;
  try {
    return { source: 'published', file: await fetchJSON<PublishedFile>(`${base}pool.json`) };
  } catch {
    // Before the first build there is no published catalogue, only the launch
    // file. Both are static assets; if neither is there, nothing can be shown
    // and the failure belongs at the top rather than swallowed here.
    return { source: 'launch', file: await fetchJSON<BootstrapFile>(`${base}bootstrap.json`) };
  }
}

function fromPublished(file: PublishedFile, withdrawn: Set<string>): Pool {
  const entries = file.entries.filter((entry) => !withdrawn.has(entry.id));
  const removed = file.entries.length - entries.length;
  const removedWears = file.entries
    .filter((entry) => withdrawn.has(entry.id))
    .reduce((total, entry) => total + entry.wearCount, 0);

  // A manufactured entry has no donor and no revocation token, so in practice
  // every withdrawal comes out of the donated count. That is a fact about how
  // the service behaves, though, not something this file can enforce — and an
  // assumption held arithmetically produces nonsense the moment it is wrong.
  // So the count is floored, and the manufactured count is derived from it
  // rather than carried over: whatever was withdrawn, the two always sum to
  // the number of entries actually on the page.
  const donatedCount = Math.max(0, file.stats.donatedCount - removed);
  const size = entries.length;

  return {
    entries,
    stats: {
      ...file.stats,
      size,
      donatedCount,
      syntheticCount: size - donatedCount,
      totalWears: file.stats.totalWears - removedWears,
      // Recomputed from the entries actually being shown rather than adjusted,
      // so the figure and the list it summarises cannot disagree. With nothing
      // withdrawn this reproduces the published value exactly: same function,
      // same inputs.
      bitsDestroyed: bitsDestroyed(
        entries.filter((entry) => entry.wearCount > 1).map((entry) => entry.wearCount),
      ),
      // `machineDonations` is the one figure that cannot be corrected here. It
      // is derived from an automation likelihood that is deliberately not
      // published per entry, so a withdrawn machine donation stays counted
      // until the next build. Bounded, brief, and preferable to publishing the
      // field that would fix it.
    },
    source: 'published',
    generatedAt: file.generatedAt,
    writesAvailable: false,
    serviceError: null,
    withdrawnSinceBuild: removed,
    pendingId: null,
  };
}

function fromLaunch(file: BootstrapFile): Pool {
  // Wear counts are local in this mode, so they are read from local storage and
  // the interface says they are yours alone.
  const local = readLocalWear();
  const entries: Identity[] = file.entries.map((e) => ({
    id: e.id,
    attrs: e.attrs,
    createdAt: e.createdAt,
    wearCount: local[e.id] ?? 0,
  }));

  // No filtering against the withdrawal list: every entry in the launch file is
  // manufactured, and a manufactured entry has no donor who could withdraw it.
  return {
    entries,
    stats: {
      size: entries.length,
      syntheticCount: entries.length,
      syntheticAtLaunch: file.syntheticAtLaunch,
      donatedCount: 0,
      machineDonations: 0,
      totalWears: Object.values(local).reduce((s, n) => s + n, 0),
      bitsDestroyed: 0,
      forgeriesDiscarded: 0,
      forgeAttempts: 0,
    },
    source: 'launch',
    generatedAt: null,
    writesAvailable: false,
    serviceError: null,
    withdrawnSinceBuild: 0,
    pendingId: null,
  };
}

/**
 * @param options.fresh Bypass the withdrawal list's cache. Set after a
 * withdrawal, where a stale list would show the donor the entry they just
 * removed.
 */
export async function loadPool(options: { fresh?: boolean } = {}): Promise<Pool> {
  // Fetched together. The catalogue is a static file and the withdrawal list is
  // a live request; neither has any reason to wait on the other.
  const [catalogue, withdrawals] = await Promise.all([
    fetchCatalogue(),
    loadWithdrawals(options.fresh === true),
  ]);

  const pool =
    catalogue.source === 'published'
      ? fromPublished(catalogue.file, withdrawals.ids)
      : fromLaunch(catalogue.file);

  return mergePending(
    { ...pool, writesAvailable: withdrawals.error === null, serviceError: withdrawals.error },
    withdrawals.ids,
  );
}

// ---------------------------------------------------------------- not yet published

/**
 * This browser's own donation, before the catalogue catches up.
 *
 * A donation is in the pool the moment the service accepts it, and in the
 * published catalogue at the next build. Between those two moments the donor
 * would otherwise look at a page that does not contain them and reasonably
 * conclude the donation failed — so the entry is held here and merged back in,
 * marked, until the build makes it real for everybody else.
 *
 * Kept in storage rather than in memory so it survives a reload: an entry that
 * vanished on refresh would read as a bug in exactly the place where the piece
 * is asking to be trusted with something.
 */
const PENDING_KEY = 'wear-me:pending';

export function rememberPending(entry: Identity): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(entry));
  } catch {
    // Private mode, or storage denied. The entry is still in the pool; it just
    // will not be shown back until the build publishes it.
  }
}

export function forgetPending(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to do. A stale entry is dropped on the next load anyway, because
    // it is checked against the published catalogue and the withdrawal list.
  }
}

function readPending(): Identity | null {
  try {
    const stored = localStorage.getItem(PENDING_KEY);
    if (!stored) return null;
    const entry = JSON.parse(stored) as Identity;
    return typeof entry?.id === 'string' && entry.attrs ? entry : null;
  } catch {
    return null;
  }
}

function mergePending(pool: Pool, withdrawn: Set<string>): Pool {
  const pending = readPending();
  if (!pending) return pool;

  // Withdrawn from another tab or another sitting. The donor has taken it back,
  // and it must not reappear here because this browser happens to remember it.
  if (withdrawn.has(pending.id)) {
    forgetPending();
    return pool;
  }

  // The build caught up — or another browser producing the same signature
  // donated it first and that entry was published. Either way the catalogue is
  // now the authority and this copy is redundant.
  if (pool.entries.some((entry) => entry.id === pending.id)) {
    forgetPending();
    return pool;
  }

  // Inserted in id order, not appended. The published catalogue is ordered by
  // id — a hash, which says nothing about when an entry arrived — and putting
  // the newest entry last would make position mean something it is not
  // supposed to mean.
  const entries = [...pool.entries, pending].sort((a, b) => (a.id < b.id ? -1 : 1));
  const donatedCount = pool.stats.donatedCount + 1;

  return {
    ...pool,
    entries,
    stats: {
      ...pool.stats,
      size: entries.length,
      donatedCount,
      syntheticCount: entries.length - donatedCount,
    },
    pendingId: pending.id,
  };
}

// ---------------------------------------------------------------- donation

export interface DonationResult {
  id: string;
  alreadyPresent: boolean;
  revocationToken: string | null;
}

export async function donate(
  attrs: Identity['attrs'],
  id: string,
  automation: number | null,
): Promise<DonationResult> {
  return fetchJSON<DonationResult>(`${API}/identity`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ attrs, id, automation, consent: 'donate' }),
  });
}

export async function revoke(id: string, token: string): Promise<void> {
  await fetchJSON(`${API}/identity/${id}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

// ---------------------------------------------------------------- wearing

const WEAR_KEY = 'wear-me:worn';

function readLocalWear(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(WEAR_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function hasWorn(id: string): boolean {
  return (readLocalWear()[id] ?? 0) > 0;
}

/**
 * Records a wear.
 *
 * Whether this is the first time is asserted by the browser, not verified by
 * the server, because verifying it would require the per-visitor identifier the
 * API refuses to keep. The interface says so where the count is displayed.
 */
export async function wear(id: string): Promise<{ wearCount: number; counted: boolean }> {
  const local = readLocalWear();
  const first = (local[id] ?? 0) === 0;
  local[id] = (local[id] ?? 0) + 1;
  try {
    localStorage.setItem(WEAR_KEY, JSON.stringify(local));
  } catch {
    // Private mode, or storage denied. The wear still counts on the server.
  }

  try {
    return await fetchJSON<{ wearCount: number; counted: boolean }>(`${API}/wear/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ first }),
    });
  } catch {
    return { wearCount: local[id], counted: false };
  }
}

// ---------------------------------------------------------------- the forge

/**
 * The forge's running totals, kept in this browser.
 *
 * These used to be posted to the service, which held a pool-wide total for
 * publication. The route that did that is gone: it backed a feature
 * still deferred under SPEC §2, and a service that exists to hold donated
 * identities should not also be a counter for something the browser computes
 * on its own.
 *
 * So the number is yours now, and the interface has to say so — "N discarded
 * across M attempts, in this browser" is true, where a pool total that is
 * always zero would not be. The totals survive a reload, because a visitor who
 * manufactures forty forgeries over two sittings has still manufactured forty.
 */
const FORGE_KEY = 'wear-me:forge';

export interface ForgeTotals {
  attempts: number;
  discarded: number;
}

export function readForgeTotals(): ForgeTotals {
  try {
    const stored = JSON.parse(localStorage.getItem(FORGE_KEY) ?? '{}') as Partial<ForgeTotals>;
    return { attempts: stored.attempts ?? 0, discarded: stored.discarded ?? 0 };
  } catch {
    return { attempts: 0, discarded: 0 };
  }
}

export function recordForge(attempts: number, discarded: number): ForgeTotals {
  const totals = readForgeTotals();
  totals.attempts += attempts;
  totals.discarded += discarded;
  try {
    localStorage.setItem(FORGE_KEY, JSON.stringify(totals));
  } catch {
    // Private mode, or storage denied. The session's own counts still show.
  }
  return totals;
}

export const apiBase = API;

/**
 * Where the pool serves this identity's script.
 *
 * A real URL ending in `.user.js`, because that is what a userscript manager
 * watches for. Navigating here with a manager installed produces its install
 * dialogue; navigating here without one shows the source.
 */
export function scriptUrl(
  id: string,
  options: { canvasMode: string; audioMode: string; hideOverrides: boolean },
): string {
  const query = new URLSearchParams({
    canvas: options.canvasMode,
    audio: options.audioMode,
    hide: String(options.hideOverrides),
  });
  return `${API}/identity/${id}/script.user.js?${query.toString()}`;
}

/** The script text itself, for the same-origin demonstration and the local download. */
export async function fetchScript(
  id: string,
  options: { canvasMode: string; audioMode: string; hideOverrides: boolean },
): Promise<string> {
  const res = await fetch(scriptUrl(id, options));
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

/** True when a script emitted by this piece is patching the current page. */
export function wornHere(): string | null {
  const marker = (window as unknown as { __WEAR_ME__?: { id?: string } }).__WEAR_ME__;
  return typeof marker?.id === 'string' ? marker.id : null;
}

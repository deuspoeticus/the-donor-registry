/**
 * The pool, as the browser sees it.
 *
 * Reads from the API when it is reachable and falls back to the seeded launch
 * file when it is not. The fallback is stated in the interface rather than
 * hidden: a visitor measured against a static file is being measured against
 * something that cannot grow, and that changes what the number means.
 */

import type { Identity, PoolStats } from '@wearme/core/types';

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';
const PAGE = 200;

export type PoolSource = 'api' | 'bootstrap';

export interface Pool {
  entries: Identity[];
  stats: PoolStats;
  source: PoolSource;
  /** Set when the API was tried and did not answer. Shown, not swallowed. */
  apiError: string | null;
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

async function loadFromApi(): Promise<Pool> {
  const stats = await fetchJSON<PoolStats>(`${API}/pool/stats`);
  const entries: Identity[] = [];
  for (let offset = 0; offset < stats.size; offset += PAGE) {
    const page = await fetchJSON<{ entries: Identity[] }>(`${API}/pool?limit=${PAGE}&offset=${offset}&sort=id`);
    entries.push(...page.entries);
    if (page.entries.length === 0) break;
  }
  return { entries, stats, source: 'api', apiError: null };
}

async function loadFromBootstrap(apiError: string | null): Promise<Pool> {
  const file = await fetchJSON<BootstrapFile>(`${import.meta.env.BASE_URL}bootstrap.json`);
  const entries: Identity[] = file.entries.map((e) => ({
    id: e.id,
    attrs: e.attrs,
    createdAt: e.createdAt,
    wearCount: e.wearCount,
  }));

  // Wear counts are local in this mode, so they are read from local storage and
  // the interface says they are yours alone.
  const local = readLocalWear();
  for (const entry of entries) {
    entry.wearCount = local[entry.id] ?? 0;
  }

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
    source: 'bootstrap',
    apiError,
  };
}

export async function loadPool(): Promise<Pool> {
  try {
    return await loadFromApi();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return loadFromBootstrap(message);
  }
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

export async function reportForgeStats(attempts: number, discarded: number): Promise<void> {
  try {
    await fetchJSON(`${API}/forge/stats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attempts, discarded }),
    });
  } catch {
    // The counter is an inscription, not a transaction. A lost update is fine.
  }
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

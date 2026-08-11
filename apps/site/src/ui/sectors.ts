/**
 * The sector manifest.
 *
 * One page, one scroll, eleven fixed addresses. This table is the only place
 * that decides what the page is made of: the section heads read it, the running
 * head reads it, the status strip counts it. There is no second list to fall out
 * of step with the first.
 *
 * Addresses are fixed rather than handed out in render order. The previous build
 * numbered sections as it appended them, which meant the catalogue was `04` for a
 * visitor who chose "Look only" and `08` for one who was measured — the same
 * content under two different coordinates, in a piece whose whole subject is
 * stable identification. Now an address means one sector for everybody, and a
 * sector the visit does not contain simply leaves a gap in the sequence. The gap
 * is the honest signal: this page has ten sectors and your visit realised seven
 * of them, and the status strip says which fraction rather than quietly
 * renumbering the rest.
 *
 * Names carry no definite article. "THE POOL" and "POOL" say the same thing set in small
 * caps at label size, and the characters saved across six sectors are the difference
 * between a running head whose addresses all fit on the row and one that hides half of
 * them behind a horizontal scroll.
 *
 * `requires` is the only conditional in the table, and it names a fact about
 * consent rather than a preference. A sector that requires measurement cannot
 * exist before a tier has been chosen, because there is nothing in it.
 */

import type { SigilKey } from './sigils.js';

/**
 * What a sector needs before it can hold anything.
 *
 * - `pool`        — the loaded catalogue, and nothing else. Available at first paint.
 * - `measurement` — this browser has been read, i.e. tier two or three.
 * - `donation`    — this browser's signature has actually entered the pool.
 * - `selection`   — the visitor has opened an entry.
 */
export type Requirement = 'pool' | 'measurement' | 'donation' | 'selection';

export interface Sector {
  /** Anchor id, nav target, and the key used everywhere in the source. */
  id: string;
  /** Fixed two-digit address. Never reassigned; see the header. */
  address: string;
  /** Set in the monospace face, upper case, beside the address. */
  name: string;
  /**
   * The sigil that stands for this sector — a thing, not an operation, which is why it
   * is a sigil and not a mark (see ui/sigils.ts for the division).
   */
  sigil: SigilKey;
  requires: Requirement;
  /** One line, in the interface's voice, for the nav's title attribute. */
  gist: string;
}

const SECTORS = [
  {
    id: 'pool',
    address: '00',
    name: 'POOL',
    sigil: 'vessel',
    requires: 'pool',
    gist: 'The census: what is in the pool, measured against itself.',
  },
  {
    id: 'consent',
    address: '01',
    name: 'CONSENT',
    sigil: 'key',
    requires: 'pool',
    gist: 'What this page may do. Nothing is preselected.',
  },
  {
    id: 'analysis',
    address: '02',
    name: 'ANALYSIS',
    sigil: 'orb',
    requires: 'pool',
    gist: 'Your signature reading, agent likelihood, receipt, and the pool dependency structure.',
  },
  {
    id: 'catalogue',
    address: '03',
    name: 'CATALOGUE',
    sigil: 'phial',
    requires: 'pool',
    gist: 'Every entry in the pool. Any of them can be worn.',
  },
  {
    id: 'forge',
    address: '04',
    name: 'FORGERY',
    sigil: 'alembic',
    requires: 'pool',
    gist: 'The piece manufactures people, and throws most of them away.',
  },
] as const satisfies readonly Sector[];

export type SectorId = (typeof SECTORS)[number]['id'];

export const ALL_SECTORS: readonly Sector[] = SECTORS;

/** How many addresses the page has. The denominator in the status strip. */
export const SECTOR_COUNT = SECTORS.length;

const BY_ID = new Map(SECTORS.map((s) => [s.id as SectorId, s as Sector]));

export function sector(id: SectorId): Sector {
  const found = BY_ID.get(id);
  // Unreachable through the type, and thrown rather than defaulted because a
  // silently invented sector would put an address in the nav that scrolls
  // nowhere.
  if (!found) throw new Error(`no sector with id ${id}`);
  return found;
}

/**
 * The foot of the page: the legend and the credits. Deliberately not a sector —
 * it has no address, does not appear in the count, and does not appear in the
 * running head, because it is the page talking about itself rather than a
 * chapter of the argument.
 */
export const FOOT = {
  id: 'colophon',
  name: 'COLOPHON',
  sigil: 'beetle' as SigilKey,
} as const;

/**
 * THE DONOR REGISTRY: Wear Me. — a fingerprint commons.
 *
 * One page, eleven fixed addresses, one scroll. The pool loads, the census and the
 * model and the catalogue are drawn from it, and nothing at all is read from this
 * browser until the visitor has chosen a tier in sector 03. Collection happens on
 * tiers two and three; transmission only on tier three, and only after the payload
 * has been shown in full.
 *
 * The gate used to be the entire first screen, with every statistic behind it. It
 * is now a sector like any other, reached by scrolling, and the sectors that do not
 * need consent are drawn before it. That is the substantive change here: the
 * decision is now made by somebody who has already read the pool their measurement
 * would be taken against.
 */

import { ATTR_IDS, glitchChannel } from '@wearme/core/attributes';
import {
  buildEntropyModel,
  corruptionMagnitude,
  corruptionScale,
  measure,
  type CorruptionScale,
} from '@wearme/core/entropy';
import { createForge } from '@wearme/core/forge';
import type { EntropyReport } from '@wearme/core/types';

import { collect, PROBE_COUNT, type CollectionResult } from './collector/index.js';
import { estimateAutomation, type AutomationEstimate } from './classifier.js';
import { copy } from './copy.js';
import {
  donate,
  forgetPending,
  hasWorn,
  loadPool,
  rememberPending,
  revoke,
  wear,
  wornHere,
  type Pool,
} from './pool.js';
import { createBoard } from './ui/board.js';
import {
  DEFAULT_WEAR_OPTIONS,
  renderCatalogue,
  renderEntryCard,
  type WearOptions,
} from './ui/catalogue.js';
import { renderCensusContent } from './ui/census.js';
import { renderConsentSection, type Tier } from './ui/consent.js';
import { clear, h, int } from './ui/dom.js';
import { installCursors } from './ui/sigils.js';
import { CHANNEL_NAME, createHead, type Report } from './ui/head.js';
import { renderModelContent } from './ui/model.js';
import { createPost, IDLE, type Channel, type Corruption } from './ui/post.js';
import { renderAnalysisSection } from './ui/readout.js';
import { cover, wornBulletin } from './ui/sections/s00-cover.js';
import { forgeSector } from './ui/sections/s08-forge.js';
import { colophon, poolLine } from './ui/sections/colophon.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const siteUrl = window.location.origin;

const app = document.getElementById('app') as HTMLElement;
const boot = document.getElementById('boot') as HTMLElement;

interface State {
  pool: Pool;
  model: ReturnType<typeof buildEntropyModel>;
  forge: ReturnType<typeof createForge>;
  /** One report per pool entry, in pool order. The census and the scale need both. */
  reports: EntropyReport[];
  /** Pool-relative range the corruption magnitude is ranked against. */
  scale: CorruptionScale;
  tier: Tier | null;
  collection: CollectionResult | null;
  report: EntropyReport | null;
  automation: AutomationEstimate | null;
  /** True while the payload is standing at sector 03 awaiting a decision. */
  awaitingPayload: boolean;
  /**
   * A reading was taken and has since been dropped, because the visitor moved back
   * to "Look only". Held so the page can say that rather than reverting to "nothing
   * has been measured", which would be false about the minute before.
   */
  discarded: boolean;
  selectedId: string | null;
  wearOptions: WearOptions;
  revocationToken: string | null;
  donatedId: string | null;
  /** Whether the catalogue is showing every entry or only its first page. */
  catalogueExpanded: boolean;
  /**
   * How many of the manifest's addresses the last render produced.
   *
   * Kept here rather than recounted from the DOM so that the status strip can be
   * restated on its own — the signal switch changes what the strip says without
   * changing what the page contains, and rebuilding the page to update one cell
   * would throw away the visitor's scroll position for nothing.
   */
  sectorsBuilt: number;
}

let state: State;

// ---------------------------------------------------------------- surfaces

/**
 * The post-processing layer, and the head. Both live outside `#app` and survive
 * every re-render, because `render()` clears that element wholesale and chrome
 * rebuilt underneath the visitor would drop focus and scroll position
 * mid-interaction.
 */
const post = createPost({ reducedMotion });

const head = createHead({
  onHome: () => window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }),
  onJump: (id) => jump(id),
  signal: () => post.enabled(),
  onToggleSignal: () => {
    post.toggle();
    restate();
  },
});
document.body.insertBefore(head.el, document.body.firstChild);

function jump(id: string): void {
  document.getElementById(id)?.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'start',
  });
}

// ---------------------------------------------------------------- boot

async function bootstrap(): Promise<void> {
  const pool = await loadPool();
  const vectors = pool.entries.map((e) => e.attrs);
  const model = buildEntropyModel(vectors, ATTR_IDS);

  state = {
    pool,
    model,
    forge: createForge(pool.entries),
    reports: [],
    scale: { min: 0, max: 1 },
    tier: null,
    collection: null,
    report: null,
    automation: null,
    awaitingPayload: false,
    discarded: false,
    selectedId: null,
    wearOptions: { ...DEFAULT_WEAR_OPTIONS },
    revocationToken: null,
    donatedId: null,
    catalogueExpanded: false,
    sectorsBuilt: 0,
  };
  restateCensus();

  boot.remove();
  app.hidden = false;
  // The three cursors are the same sprites the interface draws, so they are written
  // here rather than hard-coded in the stylesheet; see ui/sigils.ts.
  installCursors();

  if (import.meta.env.DEV) {
    (window as unknown as { __wearme: unknown }).__wearme = { state, post };
  }

  render();
}

/**
 * Measures every entry in the pool against the pool's own model.
 *
 * One pass to measure, a second to rank: corruption is relative to the pool's own
 * spread, so the most ordinary entry present reads as near-clean and the strangest
 * as fully torn. Recomputed whenever the pool changes, because both the model and
 * the spread are properties of the pool and a stale ranking would be a figure
 * about a pool that no longer exists.
 */
function restateCensus(): void {
  state.reports = state.pool.entries.map((entry) => measure(state.model, entry.attrs));
  state.scale = corruptionScale(state.reports);
}

// ---------------------------------------------------------------- pool prose

/**
 * What the visitor is looking at, and what they can do to it.
 *
 * These are two facts, not one. The catalogue can be a real published pool while
 * the service is down, and it can be the seeded launch file while the service is
 * perfectly healthy. The old wording collapsed them — it read a failed API call as
 * proof the entries were seeded — and would have been wrong in both of those cases.
 */
function poolSummary(): string {
  const { stats, source, generatedAt, writesAvailable, serviceError, withdrawnSinceBuild } =
    state.pool;
  const parts = [copy.receipt.syntheticDisclosure(stats.syntheticCount, stats.size, stats.syntheticAtLaunch)];

  if (source === 'launch') {
    parts.push(
      'This is the seeded launch file. No donation has ever entered it, and wear counts stay in this browser and are seen by nobody.',
    );
  } else if (generatedAt) {
    parts.push(
      // "Last changed", not "last built". The weekly job runs whether or not
      // anything changed, and only rewrites the file when something did, so this
      // date is the last time the pool actually moved. Reporting the build instead
      // would put a fresh date on an identical catalogue every week.
      `The catalogue last changed on ${generatedAt.slice(0, 10)}. A donation made since then is in the pool already and appears here at the next build.`,
    );
  }

  if (withdrawnSinceBuild > 0) {
    const one = withdrawnSinceBuild === 1;
    parts.push(
      `${withdrawnSinceBuild} ${one ? 'entry has' : 'entries have'} been withdrawn since that build and ${one ? 'is' : 'are'} not shown.`,
    );
  }

  if (!writesAvailable) {
    parts.push(
      `The pool service is not answering (${serviceError ?? 'unreachable'}), so nothing can be donated, worn or withdrawn right now — and because withdrawals are checked against that service, this catalogue may still be listing an entry whose donor has taken it back.`,
    );
  }

  return parts.join(' ');
}

/** The provenance of the catalogue, as a readout rather than as a sentence. */
function provenance(): [string, string][] {
  const { source, generatedAt, writesAvailable, serviceError, withdrawnSinceBuild } = state.pool;
  const rows: [string, string][] = [
    [
      'catalogue',
      source === 'published'
        ? 'the published file, rewritten by the weekly build'
        : 'the seeded launch file — nothing has ever been donated into it',
    ],
    ['last changed', generatedAt ? generatedAt.slice(0, 10) : 'never — this file has not moved'],
    [
      'writes',
      writesAvailable
        ? 'the pool service is answering: donating, wearing and withdrawing all work'
        : `the pool service is not answering (${serviceError ?? 'unreachable'}), so nothing can be donated, worn or withdrawn`,
    ],
  ];
  if (withdrawnSinceBuild > 0) {
    rows.push([
      'withdrawn since',
      `${int(withdrawnSinceBuild)} entries taken back by their donors and filtered out of the list below`,
    ]);
  }
  return rows;
}

// ---------------------------------------------------------------- corruption

function corruptionOf(report: EntropyReport, collection: CollectionResult): Corruption {
  const attrs = collection.attrs;
  return {
    magnitude: corruptionMagnitude(report, state.scale),
    channel: glitchChannel(report.dominantAttribute) as Channel,
    utcOffset: typeof attrs['intl.offset'] === 'number' ? attrs['intl.offset'] : 0,
    audioValue: typeof attrs['audio.sum'] === 'number' ? attrs['audio.sum'] : 0,
  };
}

// ---------------------------------------------------------------- tiers

async function onChooseTier(tier: Tier): Promise<void> {
  // Re-choosing the tier already in force is a no-op rather than a second
  // measurement: the visitor arriving back at sector 03 and clicking the button
  // they already clicked has not asked for anything new to happen.
  if (tier === state.tier && !state.awaitingPayload) {
    jump(tier === 'look' ? 'catalogue' : 'measurement');
    return;
  }

  state.tier = tier;
  // The inversion marks the moment the page's subject changes from the pool to the
  // visitor. It is the state change, stated in the one gesture the palette reserves
  // for it, and everything it announces is also said in words.
  post.invert();

  if (tier === 'look') {
    /*
     * Dropping to tier one after a measurement actually discards it: the collection,
     * the report and the estimate are released, sectors 04 and 05 stop existing, and
     * the corruption returns to idle. What the page must not do is then claim it was
     * never taken — see MEASUREMENT_DISCARDED — so the fact is recorded here and
     * stated in a bulletin above the census.
     */
    state.discarded = state.collection !== null;
    state.collection = null;
    state.report = null;
    state.automation = null;
    state.awaitingPayload = false;
    post.set(IDLE);
    render({ scrollTo: 'catalogue' });
    return;
  }

  state.discarded = false;

  // Sector 04 exists as soon as the collector starts, so the visitor is looking at
  // the place the reading will appear while it is being taken rather than at a
  // spinner over the gate they just left. The cursor turns to the hourglass for
  // exactly as long as the probes are running and for no other reason on this page.
  render({ scrollTo: 'measurement', measuring: true });
  document.body.dataset.busy = 'true';

  const collection = await collect().finally(() => {
    delete document.body.dataset.busy;
  });
  state.collection = collection;
  state.report = measure(state.model, collection.attrs);
  state.automation = estimateAutomation(collection.attrs);
  post.set(corruptionOf(state.report, collection));

  if (tier === 'donate') {
    state.awaitingPayload = true;
    render({ scrollTo: 'consent' });
    return;
  }

  render({ scrollTo: 'measurement' });
}

async function completeDonation(): Promise<void> {
  const collection = state.collection;
  if (!collection || !state.automation) return;

  try {
    const result = await donate(collection.attrs, collection.id, state.automation.likelihood);
    state.donatedId = result.id;
    state.revocationToken = result.revocationToken;

    // The pool changed; the published catalogue has not. Held here so the donor is
    // shown their own entry rather than a page that does not contain them, and
    // `loadPool` drops it again the moment the build publishes it. The date matches
    // what the service stored: bucketed to the day, never finer.
    rememberPending({
      id: result.id,
      attrs: collection.attrs,
      createdAt: new Date().toISOString().slice(0, 10),
      wearCount: 0,
    });

    await refit();
    state.report = measure(state.model, collection.attrs);
    post.set(corruptionOf(state.report, collection));
  } catch (error) {
    state.awaitingPayload = false;
    state.tier = 'measure';
    render({ scrollTo: 'measurement' });
    const message = error instanceof Error ? error.message : String(error);
    const notice = h('p', {
      class: 'notice',
      text: `The pool did not accept the donation: ${message}. Nothing was stored. Your measurement is still on this page and is still only in this browser.`,
    });
    document.getElementById('measurement')?.querySelector('.sector__body')?.prepend(notice);
    return;
  }

  state.awaitingPayload = false;
  state.tier = 'donate';
  post.invert();
  render({ scrollTo: 'receipt' });
}

/** Everything measured against the pool, restated because the pool moved. */
async function refit(options: { fresh?: boolean } = {}): Promise<void> {
  state.pool = await loadPool(options);
  state.model = buildEntropyModel(state.pool.entries.map((e) => e.attrs), ATTR_IDS);
  state.forge = createForge(state.pool.entries);
  restateCensus();
}

// ---------------------------------------------------------------- rendering

interface RenderOptions {
  /** Scroll this sector into view once the page has been rebuilt. */
  scrollTo?: string;
  /** The collector is running; sector 04 says so instead of showing a figure. */
  measuring?: boolean;
}

/**
 * Rebuilds `#app` from state.
 *
 * Scroll position is preserved unless a target is named. The previous build
 * scrolled somewhere on every state change, which meant that ticking a checkbox in
 * an open entry threw the reader back to the top of that entry; a re-render that
 * the visitor did not ask to be moved by should not move them.
 */
function render(options: RenderOptions = {}): void {
  const anchor = window.scrollY;
  clear(app);

  const board = createBoard();
  const poolSectorEl = cover(
    board,
    state.pool.stats,
    () => jump('consent'),
    () => jump('catalogue'),
  );
  app.appendChild(poolSectorEl);

  const worn = wornHere();
  if (worn) {
    const knownToPool = state.pool.entries.some((e) => e.id === worn);
    app.appendChild(wornBulletin(board, worn, knownToPool, openEntry));
  }

  if (state.discarded) {
    app.appendChild(
      board.bulletin(
        'exposed',
        h('span', { class: 'label', text: 'Discarded' }),
        h('p', { class: 'caveat', text: copy.receipt.measurementDiscarded }),
      ),
    );
  }

  const censusEl = h(
    'section',
    { class: 'sector', id: 'census' },
    h(
      'div',
      { class: 'sector__inner' },
      h(
        'div',
        { class: 'sector__body stack' },
        h('h3', { class: 'sector__title', text: 'What is in the pool' }),
        h('p', { class: 'sector__lede', text: copy.census.lede }),
        ...renderCensusContent({
          entries: state.pool.entries,
          stats: state.pool.stats,
          model: state.model,
          reports: state.reports,
          scale: state.scale,
          self: state.report,
          provenance: provenance(),
        })
      )
    )
  );
  app.appendChild(censusEl);

  const payloadConfirmation = {
    accept: () => void completeDonation(),
    decline: () => {
      state.awaitingPayload = false;
      state.tier = 'measure';
      render({ scrollTo: 'analysis' });
    },
  };

  app.appendChild(
    renderConsentSection(
      board,
      poolSummary(),
      state.tier,
      (tier) => void onChooseTier(tier),
      state.awaitingPayload,
      state.collection ? state.collection.attrs : null,
      state.collection ? state.collection.id : null,
      state.automation ? state.automation.likelihood : null,
      payloadConfirmation,
    )
  );

  const receiptHandlers = {
    onRevoke: async (id: string, token: string) => {
      await revoke(id, token);
      await refit({ fresh: true });
      forgetPending();
      state.donatedId = null;
      state.revocationToken = null;
      post.invert();
      render({ scrollTo: 'catalogue' });
    },
  };

  app.appendChild(
    renderAnalysisSection(
      board,
      {
        report: state.report,
        automation: state.automation,
        donatedId: state.donatedId,
        revocationToken: state.revocationToken,
        measuring: options.measuring ?? false,
        model: state.model,
        poolSize: state.pool.stats.size,
        failedProbes: state.collection ? state.collection.failed : [],
      },
      receiptHandlers,
      PROBE_COUNT,
    )
  );

  let entryEl: HTMLElement | null = null;
  if (state.selectedId) {
    const entry = state.pool.entries.find((e) => e.id === state.selectedId);
    if (entry) {
      entryEl = renderEntryCard(
        board,
        entry,
        entry.id === state.pool.pendingId,
        state.wearOptions,
        catalogueHandlers(),
        (next) => {
          state.wearOptions = next;
          render();
        },
        siteUrl,
        state.tier !== 'look' && state.tier !== null,
        () => {
          state.selectedId = null;
          render({ scrollTo: 'catalogue' });
        },
      );
    }
  }

  app.appendChild(
    renderCatalogue(
      board,
      state.pool.entries,
      state.selectedId,
      state.pool.pendingId,
      catalogueHandlers(),
      poolLine(state.pool.stats),
      state.catalogueExpanded,
      () => {
        state.catalogueExpanded = true;
        render({ scrollTo: 'catalogue' });
      },
      entryEl,
    )
  );

  app.appendChild(forgeSector(board, { forge: state.forge, poolEntries: state.pool.entries }));

  const builtSectors = board.built();
  app.appendChild(colophon(board, { builtCount: builtSectors.length, stats: state.pool.stats }));

  // Built from the sectors this pass actually produced, so the head cannot list an
  // address the page does not have.
  state.sectorsBuilt = builtSectors.length;
  head.sync(builtSectors);
  head.report(reportState());

  if (options.scrollTo) jump(options.scrollTo);
  else window.scrollTo({ top: anchor, behavior: 'auto' });
}

/**
 * Restates the head without rebuilding the page.
 *
 * The signal switch changes the label in one cell of the strip and nothing else in
 * the document; re-rendering for it would clear `#app` and lose the reader's place
 * in a ten-thousand-pixel scroll.
 */
function restate(): void {
  head.report(reportState());
}

function reportState(): Report {
  return {
    consent: state.tier,
    poolSize: state.pool.stats.size,
    poolSource: state.pool.source === 'published' ? 'published' : 'launch file',
    writes: state.pool.writesAvailable,
    self: state.report ? `1 in ${int(state.report.oneInN)}` : null,
    discarded: state.discarded,
    channel: state.report
      ? (CHANNEL_NAME[glitchChannel(state.report.dominantAttribute)] ?? null)
      : null,
    sectors: state.sectorsBuilt,
  };
}

// Sector builders have moved to ui/sections/.
// Open the file named for the sector you want to edit:
//
//   ui/sections/s00-cover.ts       — sector 00: SUBJECT, and the worn-signature bulletin
//   ui/sections/s04-measurement.ts — sector 04: MEASUREMENT (loading placeholder)
//   ui/sections/s06-receipt.ts     — sector 06: RECEIPT
//   ui/sections/s08-forge.ts       — sector 08: FORGE
//   ui/sections/colophon.ts        — the foot (legend, credits, addressing note)
//
// Sectors 01 (POOL), 02 (LOOP), 03 (CONSENT), 07 (MODEL), 09 (CATALOGUE), 10 (ENTRY)
// were already in their own ui/ files and have not moved.


// ---------------------------------------------------------------- handlers

function openEntry(id: string): void {
  state.selectedId = id;
  render({ scrollTo: 'entry-detail' });
}

function catalogueHandlers() {
  return {
    onOpen: openEntry,
    onWear: async (id: string) => {
      const result = await wear(id);
      const entry = state.pool.entries.find((e) => e.id === id);
      if (entry) entry.wearCount = result.wearCount;
      // Half the frame inverts: wearing an identity is what half of what this page
      // reports has just become. The count changed, so the pool's own figures are
      // restated rather than left showing an entry that is no longer accurate.
      post.invert(true);
      restateCensus();
      return result;
    },
    hasWorn,
  };
}

// ---------------------------------------------------------------- the foot



void bootstrap();

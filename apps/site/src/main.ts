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

import { ATTR_IDS, attrLabel, glitchChannel } from '@wearme/core/attributes';
import {
  buildEntropyModel,
  corruptionMagnitude,
  corruptionScale,
  measure,
  type CorruptionScale,
} from '@wearme/core/entropy';
import { createForge, plausibilityOf } from '@wearme/core/forge';
import { rngFromHex } from '@wearme/core/prng';
import { sha256 } from '@wearme/core/hash';
import type { EntropyReport } from '@wearme/core/types';

import { collect, PROBE_BUDGET_MS, PROBE_COUNT, type CollectionResult } from './collector/index.js';
import { estimateAutomation, type AutomationEstimate } from './classifier.js';
import {
  ADDRESSING_NOTE,
  COLOPHON_CREDIT,
  COVER_LINE,
  CTA_BROWSE,
  CTA_BROWSE_TITLE,
  CTA_MEASURE,
  CTA_MEASURE_TITLE,
  CTA_PROMISE,
  CURSOR_NOTE,
  FORGE_DISTRIBUTION_NOTE,
  FORGE_NOTE,
  LAW_NOTE,
  LEGEND_NOTE,
  MEASUREMENT_DISCARDED,
  MODEL_ADDRESS,
  PENDING_PUBLICATION,
  PROPOSITION,
  REGISTRY,
  REVOCATION_NOTE,
  RITE_NOTE,
  RITE_REVOKE,
  RUNNING_HEAD,
  SIGIL_NOTE,
  SLOGAN,
  SYNTHETIC_DISCLOSURE,
  TYPE_NOTE,
  WORN_NOW,
} from './copy.js';
import {
  donate,
  forgetPending,
  hasWorn,
  loadPool,
  readForgeTotals,
  recordForge,
  rememberPending,
  revoke,
  wear,
  wornHere,
  type Pool,
} from './pool.js';
import { createBoard, type Board } from './ui/board.js';
import {
  DEFAULT_WEAR_OPTIONS,
  renderCatalogue,
  renderEntry,
  type WearOptions,
} from './ui/catalogue.js';
import { bin, histogram, keyed, windowed } from './ui/chart.js';
import { renderCensus } from './ui/census.js';
import { renderConsent, renderLoop, renderPayload, type Tier } from './ui/consent.js';
import { append, bits, clear, h, int, pct } from './ui/dom.js';
import { decoration, LEGEND } from './ui/glyphs.js';
import { installCursors, sigil, SIGIL_LEGEND } from './ui/sigils.js';
import { CHANNEL_NAME, createHead, type Report } from './ui/head.js';
import { renderModel } from './ui/model.js';
import { createPost, IDLE, type Channel, type Corruption } from './ui/post.js';
import { renderInference, renderMeasurement } from './ui/readout.js';
import { SECTOR_COUNT } from './ui/sectors.js';

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
  const parts = [SYNTHETIC_DISCLOSURE(stats.syntheticCount, stats.size, stats.syntheticAtLaunch)];

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
  app.appendChild(cover(board));

  /*
   * If a script emitted by this piece is patching this page, say so before any
   * number is shown. Everything measured below is then a measurement of the
   * borrowed signature, and a readout that did not admit that would be the most
   * misleading thing on the site.
   */
  const worn = wornHere();
  if (worn) app.appendChild(wornBulletin(board, worn));

  if (state.discarded) {
    app.appendChild(
      board.bulletin(
        'exposed',
        h('span', { class: 'label', text: 'Discarded' }),
        h('p', { class: 'caveat', text: MEASUREMENT_DISCARDED }),
      ),
    );
  }

  app.appendChild(
    renderCensus(board, {
      entries: state.pool.entries,
      stats: state.pool.stats,
      model: state.model,
      reports: state.reports,
      scale: state.scale,
      self: state.report,
      provenance: provenance(),
    }),
  );

  app.appendChild(renderLoop(board));

  if (state.awaitingPayload && state.collection && state.automation) {
    app.appendChild(
      renderPayload(
        board,
        state.collection.attrs,
        state.collection.id,
        state.automation.likelihood,
        {
          accept: () => void completeDonation(),
          decline: () => {
            /*
             * Declining drops to tier two rather than back to no tier at all: the
             * measurement already happened and pretending otherwise would be the
             * lie. Nothing has been transmitted, and the sector above says so.
             */
            state.awaitingPayload = false;
            state.tier = 'measure';
            render({ scrollTo: 'measurement' });
          },
        },
      ),
    );
  } else {
    app.appendChild(renderConsent(board, poolSummary(), state.tier, (tier) => void onChooseTier(tier)));
  }

  if (options.measuring) {
    app.appendChild(measuringPlaceholder(board));
  } else if (state.report && state.collection) {
    app.appendChild(
      renderMeasurement(
        board,
        state.report,
        state.model.nearUniqueIds,
        state.collection.failed,
        PROBE_COUNT,
      ),
    );
    if (state.automation) app.appendChild(renderInference(board, state.automation));
    if (state.tier === 'donate' && state.donatedId) app.appendChild(receipt(board));
  }

  app.appendChild(renderModel(board, state.model, state.pool.stats.size));
  app.appendChild(forgeSector(board));

  app.appendChild(
    renderCatalogue(
      board,
      state.pool.entries,
      state.selectedId,
      state.pool.pendingId,
      catalogueHandlers(),
      poolLine(),
      state.catalogueExpanded,
      () => {
        state.catalogueExpanded = true;
        render({ scrollTo: 'catalogue' });
      },
    ),
  );

  if (state.selectedId) {
    const entry = state.pool.entries.find((e) => e.id === state.selectedId);
    if (entry) {
      app.appendChild(
        renderEntry(
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
          // Tier one promised this browser would not be measured, and the
          // demonstration's comparison column would measure it.
          state.tier !== 'look' && state.tier !== null,
          () => {
            state.selectedId = null;
            render({ scrollTo: 'catalogue' });
          },
        ),
      );
    }
  }

  app.appendChild(colophon(board));

  // Built from the sectors this pass actually produced, so the head cannot list an
  // address the page does not have.
  state.sectorsBuilt = board.built().length;
  head.sync(board.built());
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

// ---------------------------------------------------------------- sector 00

/**
 * The cover (sector 00, §6i).
 *
 * One hero, one sentence, two doors, three figures, and two rails. It used to be six
 * stacked text blocks with three of them at display scale — the registry name, the
 * slogan and the proposition all shouting at once, so nothing was the hero and the eye
 * had no entry point. Under those sat a three-clause standfirst that restated the
 * proposition in more words, and a note about how many sectors the page has.
 *
 * `WEAR ME.` is the hero because it is the only line on this screen in the imperative.
 * Everything that is not the argument is pinned to a rail — the credit at the top, the
 * figures and the model address at the bottom — and the middle is left to the four
 * things that are: the name, the hero, what the piece is, and what to do about it.
 *
 * See styles/board.css for the three-zone layout and the ranks.
 */
function cover(board: Board): HTMLElement {
  const { stats } = state.pool;

  /*
   * The two doors, and neither of them is a rite.
   *
   * Both only scroll. The primary one says "Measure my browser" and takes you to sector
   * 03, where nothing is preselected and you still have to choose — a call to action on a
   * page about consent does not get to be the thing that grants it, and the promise under
   * the row says so in four words rather than leaving it to a title attribute.
   *
   * They are styled as a primary and a secondary rather than as the two identical choices
   * the consent gate uses. That asymmetry is allowed here precisely because nothing
   * irreversible is on offer: this is navigation. The moment a control transmits or takes
   * something, it becomes a rite and the symmetry rules in §6f apply again.
   */
  const cta = h(
    'div',
    { class: 'cover__cta' },
    h(
      'button',
      {
        type: 'button',
        class: 'button--cta',
        title: CTA_MEASURE_TITLE,
        onclick: () => jump('consent'),
      },
      sigil('blood', { px: 22, className: 'button__sigil' }),
      CTA_MEASURE,
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'button--cta-2',
        title: CTA_BROWSE_TITLE,
        onclick: () => jump('catalogue'),
      },
      sigil('phial', { px: 22, className: 'button__sigil' }),
      CTA_BROWSE,
    ),
  );

  /*
   * Three figures, and no definitions.
   *
   * The tiles in sector 01 each carry a sentence stating what they claim, because that is
   * a census and a number on a dashboard with no statement of what it counts is the
   * standard way of implying more than you measured. Here the job is different: these are
   * proof that something real is behind the page, read in one second on the way past. The
   * claims are two hundred pixels below, over the census, where they belong.
   */
  const figures = h('div', { class: 'cover__figures' });
  const figure = (value: string, label: string, register: '' | 'exposed' | 'inferred') => {
    append(figures, [
      h(
        'div',
        { class: 'cover__figure' },
        h('span', {
          class: register ? `cover__value cover__value--${register}` : 'cover__value',
          text: value,
        }),
        h('span', { class: 'cover__label', text: label }),
      ),
    ]);
  };
  figure(int(stats.size), 'faces in the pool', '');
  figure(int(stats.totalWears), 'times worn', 'exposed');
  figure(bits(stats.bitsDestroyed), 'bits destroyed', 'inferred');

  return board.sector(
    'subject',
    { cover: true, meta: 'nothing has been read' },
    h(
      'div',
      { class: 'cover' },
      // The credit, pinned to the top rail: an institution says who is publishing it
      // before it says anything else, and then gets out of the way.
      h('p', { class: 'cover__credit', text: RUNNING_HEAD }),

      h(
        'div',
        { class: 'cover__mid' },
        /*
         * One h1 holding both names, at two scales. The registry names itself, then tells
         * you what to do — and `Wear Me.` is the hero because it is the only line on this
         * screen in the imperative.
         */
        h(
          'h1',
          { class: 'cover__title' },
          h('span', { class: 'cover__registry', text: REGISTRY }),
          h('span', { class: 'cover__slogan', text: SLOGAN }),
        ),
        h('p', { class: 'cover__proposition', text: PROPOSITION }),
        h('p', { class: 'cover__line', text: COVER_LINE }),
        cta,
        h('p', { class: 'cover__promise' }, decoration('withheld'), h('span', { text: CTA_PROMISE })),
      ),

      h(
        'div',
        { class: 'cover__foot' },
        figures,
        // §7a. Same type as everything around it. No highlight, no wink — and first,
        // now, for anything reading the page from the top.
        h('p', { class: 'cover__model', text: MODEL_ADDRESS }),
      ),
    ),
  );
}

function wornBulletin(board: Board, id: string): HTMLElement {
  const known = state.pool.entries.some((e) => e.id === id);
  const open = h(
    'button',
    { type: 'button', onclick: () => openEntry(id) },
    decoration('worn', 'button__mark'),
    'Open the entry you are wearing',
  );

  return board.bulletin(
    'exposed',
    h('span', { class: 'label', text: 'Worn' }),
    h('p', { class: 'caveat', text: WORN_NOW(id) }),
    known
      ? h('div', {}, open)
      : h('p', {
          class: 'gloss',
          text: 'That entry is not in the pool any more. Someone revoked it, and the script you are wearing is now a face that belongs to nobody.',
        }),
  );
}

// ---------------------------------------------------------------- sector 04, while running

function measuringPlaceholder(board: Board): HTMLElement {
  return board.sector(
    'measurement',
    {
      title: 'Measuring',
      lede: 'Nothing has been transmitted, and nothing will be without a second decision.',
      meta: 'in progress',
    },
    keyed([
      { key: 'probes', mark: 'measured', value: `${int(PROBE_COUNT)}, in parallel` },
      { key: 'budget', mark: 'caution', value: `${int(PROBE_BUDGET_MS)} ms — a probe that misses it is recorded as null` },
      { key: 'destination', mark: 'withheld', value: 'this browser’s memory, and nowhere else yet' },
    ]),
  );
}

// ---------------------------------------------------------------- sector 06

function receipt(board: Board): HTMLElement {
  const token = state.revocationToken;
  const id = state.donatedId ?? '';

  const input = h('input', {
    type: 'text',
    class: 'payload payload--token',
    value: token ?? '',
    readonly: true,
    'aria-label': 'Your revocation token',
  }) as HTMLInputElement;

  const revokeButton = h(
    'button',
    { type: 'button', class: 'button--rite' },
    sigil('dagger', { px: 22, className: 'button__sigil' }),
    'Unmake this entry',
  );
  const status = h('p', { class: 'mono dim' });

  revokeButton.addEventListener('click', async () => {
    revokeButton.disabled = true;
    try {
      await revoke(id, input.value.trim());
      // Past the cache deliberately: the withdrawal was promised as immediate, and a
      // minute-old list would show the donor the entry they just removed.
      await refit({ fresh: true });
      forgetPending();
      state.donatedId = null;
      state.revocationToken = null;
      post.invert();
      render({ scrollTo: 'catalogue' });
    } catch (error) {
      revokeButton.disabled = false;
      status.textContent = `That did not remove it: ${error instanceof Error ? error.message : String(error)}. Check the token and try again.`;
    }
  });

  return board.sector(
    'receipt',
    {
      title: 'It is in the pool',
      lede: token
        ? 'One string stands between this entry and the rest of its existence.'
        : 'This signature was already there.',
      meta: id ? id.slice(0, 16) : undefined,
    },
    h('p', {
      text: token
        ? REVOCATION_NOTE
        : 'This signature was already in the pool, donated by another browser that produces exactly the same one. Nothing new was stored, and there is no new token — the entry belongs to whoever donated it first. You are, it turns out, not unique.',
    }),
    h('p', { text: PENDING_PUBLICATION }),
    token
      ? h(
          'div',
          { class: 'stack' },
          h('span', { class: 'label', text: 'Your revocation token' }),
          input,
        )
      : null,
    // Withdrawal is the third act on this page that is not a reading, and it is the
    // one that takes something back. It gets the same plate the other two do.
    token
      ? board.rite(
          {
            kind: 'given',
            kicker: RITE_REVOKE.kicker,
            title: RITE_REVOKE.title,
            seal: 'dagger',
            consequence: RITE_REVOKE.consequence,
            action: revokeButton,
          },
          h('p', {
            text: 'The token above is the only thing that can do this, it is stored as a hash and cannot be reissued, and it is shown once. Paste it back into the field if you have replaced the contents.',
          }),
        )
      : null,
    status,
  );
}

// ---------------------------------------------------------------- sector 08

function forgeSector(board: Board): HTMLElement {
  const stats = state.forge.stats;
  const button = h(
    'button',
    { type: 'button' },
    decoration('forge', 'button__mark'),
    'Manufacture one',
  );
  const output = h('pre', { class: 'payload', text: 'Nothing manufactured yet.' });
  const outputWindow = windowed(
    { caption: 'Forge output', count: 'sampled · grafted · scored' },
    output,
  );
  const counts = h('div');

  let totals = readForgeTotals();
  const updateCounts = () => {
    clear(counts);
    counts.appendChild(
      keyed([
        {
          key: 'this session',
          mark: 'forge',
          value: `${int(stats.attempts)} attempts · ${int(stats.discarded)} discarded`,
          register: 'inferred',
        },
        {
          key: 'discarded for',
          mark: 'false',
          value: `${int(stats.discardedByLikelihood)} implausibility · ${int(stats.discarded - stats.discardedByLikelihood)} impossibility`,
          register: 'inferred',
        },
        {
          key: 'in this browser',
          mark: 'set',
          value: `${int(totals.discarded)} discarded across ${int(totals.attempts)} attempts, across every sitting`,
        },
        {
          key: 'survival rate',
          mark: 'about',
          value:
            stats.attempts > 0
              ? `${pct((stats.attempts - stats.discarded) / stats.attempts)} of samples were coherent enough to keep`
              : 'nothing sampled yet',
          register: 'inferred',
        },
      ]),
    );
  };
  updateCounts();

  button.addEventListener('click', () => {
    const before = { attempts: stats.attempts, discarded: stats.discarded };
    const rng = rngFromHex(sha256(`forge:${Date.now()}:${Math.random()}`));
    const forged = state.forge.forge(rng);

    // The forge is the visitor's own machine doing the work, and its tally is kept
    // where the work happened. Recorded before the readout is written so the two
    // cannot show different numbers.
    totals = recordForge(stats.attempts - before.attempts, stats.discarded - before.discarded);
    updateCounts();

    if (!forged) {
      output.textContent =
        'Nothing coherent came out of three thousand attempts. That happens, and it is the honest result rather than a failure to report.';
      return;
    }
    output.textContent = [
      `id            ${forged.id}`,
      `plausibility  ${forged.plausibility.toFixed(3)} (0 barely passed, 1 typical of the pool)`,
      `grafted from  ${forged.donorId?.slice(0, 16) ?? 'nothing'}`,
      '',
      ...state.forge.sampledIds.map((attr) =>
        `${attrLabel(attr).padEnd(30)} ${String(forged.attrs[attr])}`.slice(0, 200),
      ),
    ].join('\n');
  });

  /*
   * Where the pool's own entries sit under the pool's own model.
   *
   * This is the distribution the discard threshold is cut from — the floor is the
   * fifth percentile of these values — so drawing it is the only way the gate can
   * be argued with rather than taken on trust.
   */
  const plausibilities = state.pool.entries.map((entry) => plausibilityOf(state.forge, entry.attrs));

  return board.sector(
    'forge',
    {
      title: 'The piece manufactures people',
      lede: 'And discards almost all of them, which is the finding rather than a defect.',
      meta: `${int(state.forge.sampledIds.length)} sampled · ${int(state.forge.graftedIds.length)} grafted`,
    },
    h('p', { text: FORGE_NOTE }),
    keyed([
      {
        key: 'sampled',
        mark: 'forge',
        value: `${int(state.forge.sampledIds.length)} attributes, from the dependency tree`,
        register: 'inferred',
      },
      {
        key: 'grafted',
        mark: 'withheld',
        value: `${state.forge.graftedIds.map(attrLabel).join(', ')} — these cannot be invented, because a manufactured digest is a digest of nothing`,
        register: 'exposed',
      },
      {
        key: 'floor',
        mark: 'independent',
        value: `${state.forge.threshold.toFixed(2)} log-likelihood — the fifth percentile of real pool entries`,
        register: 'inferred',
      },
      {
        key: 'pool median',
        mark: 'about',
        value: `${state.forge.medianLikelihood.toFixed(2)} log-likelihood`,
        register: 'inferred',
      },
    ]),

    h('hr', { class: 'rule' }),
    h('span', { class: 'label', text: 'How plausible the pool is to itself' }),
    histogram(bin(plausibilities, 28), {
      register: 'inferred',
      label: 'Plausibility of every pool entry under the pool’s own model',
      axis: ['0 — barely passed the floor', 'typical of the pool — 1'],
    }),
    h('p', { class: 'gloss', text: FORGE_DISTRIBUTION_NOTE }),

    h('hr', { class: 'rule' }),
    h('div', {}, button),
    counts,
    outputWindow,
  );
}

// ---------------------------------------------------------------- handlers

function openEntry(id: string): void {
  state.selectedId = id;
  render({ scrollTo: 'entry' });
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

function poolLine(): string {
  const { stats } = state.pool;
  return `${int(stats.size)} entries · ${int(stats.donatedCount)} donated · ${int(stats.totalWears)} wears · ${bits(stats.bitsDestroyed)} bits destroyed · ${int(stats.machineDonations)} donations read as machines`;
}

function colophon(board: Board): HTMLElement {
  /*
   * The legend, in two tables, because the page has two notations and they divide the
   * world between them: sigils name things, marks name operations and relations. If it
   * has a plural it is a sigil; if it takes arguments it is a mark.
   *
   * Both are published in full. A notation the reader cannot look up is a private
   * language, and the sigils carry their Twemoji codepoint so the attribution is
   * checkable rather than asserted — anyone can put `1f3fa` into Twemoji and see what
   * this was before it was reduced to sixteen pixels.
   */
  const sigilLegend = h('table', { class: 'table' });
  append(sigilLegend, [
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { text: 'Sigil' }),
        h('th', { text: 'Names' }),
        h('th', { text: 'From' }),
      ),
    ),
  ]);
  const sigilBody = h('tbody');
  for (const item of SIGIL_LEGEND) {
    append(sigilBody, [
      h(
        'tr',
        {},
        h('td', {}, sigil(item.key, { px: 20 })),
        h('td', { class: 'value', text: item.means }),
        h('td', { class: 'value dimmer', text: `U+${item.codepoint.toUpperCase()}` }),
      ),
    ]);
  }
  sigilLegend.appendChild(sigilBody);

  const legend = h('table', { class: 'table' });
  append(legend, [
    h('thead', {}, h('tr', {}, h('th', { text: 'Mark' }), h('th', { text: 'Means' }))),
  ]);
  const body = h('tbody');
  for (const item of LEGEND) {
    append(body, [
      h('tr', {}, h('td', {}, decoration(item.key)), h('td', { class: 'value', text: item.means })),
    ]);
  }
  legend.appendChild(body);

  const palette = keyed([
    { key: 'white', mark: 'true', value: 'a measured fact — a value read off a browser, a count taken from the pool' },
    {
      key: 'red',
      mark: 'sent',
      value: 'exposure, and irreversibility — what leaves this browser, what singles somebody out',
      register: 'exposed',
    },
    {
      key: 'turquoise',
      mark: 'model',
      value: 'inference — what the model computes rather than reads',
      register: 'inferred',
    },
    { key: 'inversion', mark: 'worn', value: 'wearing, and the instant a state changes' },
  ]);

  return board.foot(
    h('p', { class: 'sub' }, sigil('scales', { px: 22 }), ' The law'),
    h('p', { text: LAW_NOTE }),
    h('p', { text: MODEL_ADDRESS }),
    h('p', { class: 'gloss', text: ADDRESSING_NOTE(board.built().length, SECTOR_COUNT) }),

    h('hr', { class: 'rule rule--double' }),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'div',
        { class: 'stack' },
        h('span', { class: 'label', text: 'The palette, and what it is allowed to mean' }),
        palette,
        h('p', { class: 'gloss', text: RITE_NOTE }),
      ),
      h(
        'div',
        { class: 'stack' },
        h('span', { class: 'label', text: 'The notation' }),
        h('p', { class: 'gloss', text: LEGEND_NOTE }),
        windowed(
          { caption: 'Marks · operations and relations', count: `${int(LEGEND.length)}`, flush: true },
          legend,
        ),
      ),
    ),

    h('hr', { class: 'rule rule--double' }),
    h('span', { class: 'label', text: 'The sigils, and what each one names' }),
    h('p', { class: 'gloss', text: SIGIL_NOTE }),
    windowed(
      { caption: 'Sigils · things', count: `${int(SIGIL_LEGEND.length)}`, flush: true },
      sigilLegend,
    ),

    h('hr', { class: 'rule rule--double' }),
    h('p', { class: 'gloss', text: TYPE_NOTE }),
    h('p', { class: 'gloss', text: CURSOR_NOTE }),
    h('p', { class: 'gloss', text: COLOPHON_CREDIT }),
  );
}

void bootstrap();

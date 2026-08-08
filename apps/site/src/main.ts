/**
 * WEAR ME — a fingerprint commons.
 *
 * Boots the pool, fits the model, renders the gate, and does nothing at all
 * until the visitor has chosen a tier. Collection happens only on tiers two and
 * three; transmission only on tier three, and only after the payload has been
 * shown in full.
 */

import { ATTR_IDS, attrLabel } from '@wearme/core/attributes';
import {
  buildEntropyModel,
  corruptionMagnitude,
  corruptionScale,
  erosion,
  measure,
  type CorruptionScale,
} from '@wearme/core/entropy';
import { createForge, plausibilityOf } from '@wearme/core/forge';
import { rngFromHex } from '@wearme/core/prng';
import { sha256 } from '@wearme/core/hash';
import type { EntropyReport, Identity } from '@wearme/core/types';

import { collect, type CollectionResult } from './collector/index.js';
import { automationStatement, estimateAutomation, type AutomationEstimate } from './classifier.js';
import {
  FORGE_NOTE,
  LAW_NOTE,
  MODEL_ADDRESS,
  NO_GATE_NOTE,
  PENDING_PUBLICATION,
  PROPOSITION,
  REVOCATION_NOTE,
  RUNNING_HEAD,
  SYNTHETIC_DISCLOSURE,
  WORN_NOW,
} from './copy.js';
import { channelIndexFor, createMonument, type FieldEntry, type Monument } from './monument/scene.js';
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
import {
  DEFAULT_WEAR_OPTIONS,
  renderCatalogue,
  renderEntry,
  type WearOptions,
} from './ui/catalogue.js';
import { append, bits, clear, h, int } from './ui/dom.js';
import { renderGate, renderPayloadPreview, type Tier } from './ui/gate.js';
import { createNav } from './ui/nav.js';
import { renderReadout } from './ui/readout.js';
import { createSectionCounter, type SectionCounter } from './ui/section.js';
import { renderTree } from './ui/tree.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const siteUrl = window.location.origin;

const app = document.getElementById('app') as HTMLElement;
const boot = document.getElementById('boot') as HTMLElement;
const canvas = document.getElementById('monument') as HTMLCanvasElement;

interface State {
  pool: Pool;
  model: ReturnType<typeof buildEntropyModel>;
  forge: ReturnType<typeof createForge>;
  tier: Tier | null;
  collection: CollectionResult | null;
  report: EntropyReport | null;
  automation: AutomationEstimate | null;
  selectedId: string | null;
  wearOptions: WearOptions;
  revocationToken: string | null;
  donatedId: string | null;
  /** Whether the catalogue is showing every entry or only its first page. */
  catalogueExpanded: boolean;
  /** Pool-relative range the monument ranks corruption against. */
  scale: CorruptionScale;
}

let state: State;
let monument: Monument | null = null;

/**
 * Lives outside `#app` and survives every re-render, because `render()` clears
 * that element wholesale and a nav rebuilt underneath the visitor would drop
 * focus and scroll position mid-interaction.
 */
const nav = createNav({
  reducedMotion,
  onHome: () => {
    monument?.setFocus(state.tier === 'look' ? 0 : 1);
    state.selectedId = null;
    monument?.setSelected(null);
    render();
  },
});
document.body.insertBefore(nav.el, document.body.firstChild);

async function bootstrap(): Promise<void> {
  const pool = await loadPool();
  const vectors = pool.entries.map((e) => e.attrs);

  state = {
    pool,
    model: buildEntropyModel(vectors, ATTR_IDS),
    forge: createForge(pool.entries),
    tier: null,
    collection: null,
    report: null,
    automation: null,
    selectedId: null,
    wearOptions: { ...DEFAULT_WEAR_OPTIONS },
    revocationToken: null,
    donatedId: null,
    catalogueExpanded: false,
    scale: { min: 0, max: 1 },
  };

  boot.remove();
  app.hidden = false;

  monument = createMonument({
    canvas,
    reducedMotion,
    onSelect: (id) => {
      state.selectedId = id;
      monument?.setSelected(id);
      render();
      document.getElementById('entry')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    },
  });

  monument.setField(fieldEntries());
  window.addEventListener('resize', () => monument?.resize());

  if (import.meta.env.DEV) {
    (window as unknown as { __wearme: unknown }).__wearme = { state, monument };
  }

  renderGate(app, poolSummary(), onChooseTier);
}

/**
 * What the visitor is looking at, and what they can do to it.
 *
 * These are two facts, not one. The catalogue can be a real published pool
 * while the service is down, and it can be the seeded launch file while the
 * service is perfectly healthy. The old wording collapsed them — it read a
 * failed API call as proof the entries were seeded — and would have been
 * wrong in both of those cases.
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
      // anything changed, and only rewrites the file when something did, so
      // this date is the last time the pool actually moved. Reporting the build
      // instead would put a fresh date on an identical catalogue every week.
      `The catalogue last changed on ${generatedAt.slice(0, 10)}. A donation made since then is in the pool already and appears here at the next build.`,
    );
  }

  if (withdrawnSinceBuild > 0) {
    const s = withdrawnSinceBuild === 1;
    parts.push(
      `${withdrawnSinceBuild} ${s ? 'entry has' : 'entries have'} been withdrawn since that build and ${s ? 'is' : 'are'} not shown.`,
    );
  }

  if (!writesAvailable) {
    parts.push(
      `The pool service is not answering (${serviceError ?? 'unreachable'}), so nothing can be donated, worn or withdrawn right now — and because withdrawals are checked against that service, this catalogue may still be listing an entry whose donor has taken it back.`,
    );
  }

  return parts.join(' ');
}

/**
 * Per-identity glitch state for the field. One pass over the pool, then a
 * second to rank: corruption is relative to the pool's own spread, so the most
 * ordinary entry present renders near-clean and the strangest shatters.
 */
function fieldEntries(): FieldEntry[] {
  const reports = state.pool.entries.map((identity) => measure(state.model, identity.attrs));
  state.scale = corruptionScale(reports);
  return state.pool.entries.map((identity, i) => ({
    identity,
    surprisal: corruptionMagnitude(reports[i], state.scale),
    plausibility: plausibilityOf(state.forge, identity.attrs),
    channel: channelIndexFor(reports[i].dominantAttribute),
  }));
}

function seedOf(id: string): number {
  return rngFromHex(sha256(`${id}:seed`))() * 1000;
}

// ---------------------------------------------------------------- tiers

async function onChooseTier(tier: Tier): Promise<void> {
  state.tier = tier;

  if (tier === 'look') {
    monument?.setFocus(0);
    render();
    return;
  }

  // The measuring screen and the payload preview are full-height and are the
  // only thing the visitor should be looking at, so the running head stays down
  // until the page proper renders.
  nav.setVisible(false);
  clear(app);
  append(app, [
    h(
      'section',
      { class: 'gate' },
      h(
        'div',
        { class: 'gate__inner' },
        h('h2', { text: 'Measuring' }),
        h('p', { class: 'mono dim', text: 'Fourteen probes, in parallel, with a 2500 ms budget.' }),
      ),
    ),
  ]);

  const collection = await collect();
  state.collection = collection;
  state.report = measure(state.model, collection.attrs);
  state.automation = estimateAutomation(collection.attrs);

  const own: Identity = {
    id: collection.id,
    attrs: collection.attrs,
    createdAt: new Date().toISOString().slice(0, 10),
    wearCount: 0,
  };

  monument?.setCloseup(own, {
    surprisal: corruptionMagnitude(state.report, state.scale),
    plausibility: plausibilityOf(state.forge, collection.attrs),
    erosion: 0,
    // Wired to the classifier's uncertainty when it ships; zero until then,
    // rather than a plausible-looking number nothing computed.
    instability: 0,
    channel: channelIndexFor(state.report.dominantAttribute),
    audioValue: typeof collection.attrs['audio.sum'] === 'number' ? collection.attrs['audio.sum'] : 0,
    utcOffset: typeof collection.attrs['intl.offset'] === 'number' ? collection.attrs['intl.offset'] : 0,
    seed: seedOf(collection.id),
  });
  monument?.setFocus(1);

  if (tier === 'donate') {
    renderPayloadPreview(
      app,
      collection.attrs,
      collection.id,
      state.automation.likelihood,
      {
        accept: () => void completeDonation(),
        decline: () => {
          // Declining drops to tier two rather than back to the gate: the
          // measurement already happened and pretending otherwise would be the
          // lie. Nothing has been transmitted.
          state.tier = 'measure';
          render();
        },
      },
    );
    return;
  }

  render();
}

async function completeDonation(): Promise<void> {
  const collection = state.collection;
  if (!collection || !state.automation) return;

  try {
    const result = await donate(collection.attrs, collection.id, state.automation.likelihood);
    state.donatedId = result.id;
    state.revocationToken = result.revocationToken;

    // The pool changed; the published catalogue has not. Held here so the donor
    // is shown their own entry rather than a page that does not contain them,
    // and `loadPool` drops it again the moment the build publishes it. The
    // date matches what the service stored: bucketed to the day, never finer.
    rememberPending({
      id: result.id,
      attrs: collection.attrs,
      createdAt: new Date().toISOString().slice(0, 10),
      wearCount: 0,
    });

    // The pool just changed, so everything measured against it is restated.
    state.pool = await loadPool();
    state.model = buildEntropyModel(state.pool.entries.map((e) => e.attrs), ATTR_IDS);
    state.forge = createForge(state.pool.entries);
    state.report = measure(state.model, collection.attrs);
    monument?.setField(fieldEntries());
    if (state.selectedId) monument?.setSelected(state.selectedId);
  } catch (error) {
    state.tier = 'measure';
    render();
    const message = error instanceof Error ? error.message : String(error);
    const notice = h('p', {
      class: 'notice',
      text: `The pool did not accept the donation: ${message}. Nothing was stored. Your measurement is still on this page and is still only in this browser.`,
    });
    document.getElementById('measurement')?.querySelector('.panel__inner')?.prepend(notice);
    return;
  }

  state.tier = 'donate';
  render();
}

// ---------------------------------------------------------------- rendering

function render(): void {
  clear(app);

  if (state.tier === null) {
    nav.setVisible(false);
    renderGate(app, poolSummary(), onChooseTier);
    return;
  }

  // Numbering is handed out in render order rather than hardcoded, because
  // which sections exist depends on the tier: "Look only" has no measurement
  // and no inference, and a fixed `03` above the model would announce two
  // chapters the page does not contain.
  const sections = createSectionCounter();

  append(app, [masthead()]);

  // If a script emitted by this piece is patching this page, say so before any
  // number is shown. Everything measured below is then a measurement of the
  // borrowed signature, and a readout that did not admit that would be the
  // most misleading thing on the site.
  const worn = wornHere();
  if (worn) app.appendChild(wornPanel(worn));

  if (state.report && state.collection) {
    const readoutMount = h('div');
    app.appendChild(readoutMount);
    renderReadout(
      readoutMount,
      state.report,
      state.model.nearUniqueIds,
      state.collection.failed,
      sections,
    );
    app.appendChild(automationPanel(sections));
    if (state.tier === 'donate' && state.donatedId) app.appendChild(donationPanel());
  }

  const treeMount = h('div');
  app.appendChild(treeMount);
  renderTree(treeMount, state.forge.tree, state.pool.stats.size, sections);

  app.appendChild(forgePanel(sections));

  const catalogueMount = h('div');
  app.appendChild(catalogueMount);
  renderCatalogue(
    catalogueMount,
    state.pool.entries,
    state.selectedId,
    state.pool.pendingId,
    catalogueHandlers(),
    poolLine(),
    sections,
    state.catalogueExpanded,
    () => {
      state.catalogueExpanded = true;
      render();
      document.getElementById('catalogue')?.scrollIntoView({ block: 'start' });
    },
  );

  if (state.selectedId) {
    const entry = state.pool.entries.find((e) => e.id === state.selectedId);
    if (entry) {
      const entryMount = h('div');
      app.appendChild(entryMount);
      renderEntry(
        entryMount,
        entry,
        entry.id === state.pool.pendingId,
        state.wearOptions,
        catalogueHandlers(),
        (next) => {
          state.wearOptions = next;
          render();
          document.getElementById('entry')?.scrollIntoView({ block: 'start' });
        },
        siteUrl,
        // Tier one promised this browser would not be measured, and the
        // demonstration's comparison column would measure it.
        state.tier !== 'look',
        sections,
        () => {
          state.selectedId = null;
          monument?.setSelected(null);
          render();
          document.getElementById('catalogue')?.scrollIntoView({ block: 'start' });
        },
      );
    }
  }

  app.appendChild(colophon(sections));

  // Built from the sections this pass actually produced, so the nav cannot
  // list a chapter the page does not have.
  nav.sync(sections.entries());
  nav.setVisible(true);
}

/**
 * The masthead. It used to be the word "Wear me" at nine rem and a run-on line
 * of statistics, which told a visitor arriving past the gate nothing about what
 * they were looking at — the piece stated its subject exactly once, on the gate,
 * and then never again. It now carries the proposition and sets the numbers as
 * a figure row rather than a sentence of separators.
 */
function masthead(): HTMLElement {
  const { stats } = state.pool;
  const figures: [string, string][] = [
    [int(stats.size), 'entries'],
    [int(stats.donatedCount), 'donated'],
    [int(stats.totalWears), 'wears'],
    [bits(stats.bitsDestroyed), 'bits destroyed'],
    [int(stats.machineDonations), 'read as machines'],
  ];

  const row = h('div', { class: 'stats' });
  for (const [value, label] of figures) {
    append(row, [
      h(
        'div',
        { class: 'stats__item' },
        h('span', { class: 'stats__value', text: value }),
        h('span', { class: 'stats__label', text: label }),
      ),
    ]);
  }

  return h(
    'section',
    { class: 'panel masthead', id: 'top' },
    h(
      'div',
      { class: 'panel__inner' },
      h('p', { class: 'runhead', text: RUNNING_HEAD }),
      h('h1', { class: 'masthead__title', text: 'Wear me' }),
      h('p', { class: 'proposition', text: PROPOSITION }),
      h('hr', { class: 'rule' }),
      h('span', { class: 'label', text: 'The pool, as it stands' }),
      row,
      h('p', { class: 'mono dim', style: 'margin-top:1.5rem', text: poolLine() }),
    ),
  );
}

function poolLine(): string {
  const { stats } = state.pool;
  return `${int(stats.size)} entries · ${int(stats.donatedCount)} donated · ${int(stats.totalWears)} wears · ${bits(stats.bitsDestroyed)} bits destroyed · ${int(stats.machineDonations)} donations read as machines`;
}

function wornPanel(id: string): HTMLElement {
  const open = h('button', { type: 'button' }, 'Open the entry you are wearing');
  open.addEventListener('click', () => {
    state.selectedId = id;
    monument?.setSelected(id);
    render();
    document.getElementById('entry')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  const known = state.pool.entries.some((e) => e.id === id);
  return h(
    'section',
    { class: 'panel panel--solid' },
    h(
      'div',
      { class: 'panel__inner stack' },
      h('span', { class: 'label', text: 'Worn' }),
      h('p', { class: 'caveat', text: WORN_NOW(id) }),
      known
        ? h('div', {}, open)
        : h('p', {
            class: 'mono dim',
            text: 'That entry is not in the pool any more. Someone revoked it, and the script you are wearing is now a face that belongs to nobody.',
          }),
    ),
  );
}

function automationPanel(sections: SectionCounter): HTMLElement {
  const estimate = state.automation;
  if (!estimate) return h('div');
  return sections.section(
    { id: 'inference', eyebrow: 'Inference', solid: true },
    h('p', { class: 'caveat', text: automationStatement(estimate) }),
    h('p', { class: 'mono dim', text: NO_GATE_NOTE }),
  );
}

function donationPanel(): HTMLElement {
  const token = state.revocationToken;
  const id = state.donatedId ?? '';

  const input = h('input', {
    type: 'text',
    class: 'payload',
    style: 'width:100%;white-space:normal',
    value: token ?? '',
    readonly: true,
    'aria-label': 'Your revocation token',
  }) as HTMLInputElement;

  const revokeButton = h('button', { type: 'button' }, 'Remove this entry from the pool');
  const status = h('p', { class: 'mono dim' });

  revokeButton.addEventListener('click', async () => {
    revokeButton.disabled = true;
    try {
      await revoke(id, input.value.trim());
      // Past the cache deliberately: the withdrawal was promised as immediate,
      // and a minute-old list would show the donor the entry they just removed.
      state.pool = await loadPool({ fresh: true });
      state.model = buildEntropyModel(state.pool.entries.map((e) => e.attrs), ATTR_IDS);
      state.forge = createForge(state.pool.entries);
      monument?.setField(fieldEntries());
      forgetPending();
      state.donatedId = null;
      state.revocationToken = null;
      render();
    } catch (error) {
      revokeButton.disabled = false;
      status.textContent = `That did not remove it: ${error instanceof Error ? error.message : String(error)}. Check the token and try again.`;
    }
  });

  return h(
    'section',
    { class: 'panel panel--solid' },
    h(
      'div',
      { class: 'panel__inner stack' },
      h('span', { class: 'label', text: 'Donated' }),
      h('h2', { text: 'It is in the pool' }),
      h('p', {
        text: token
          ? REVOCATION_NOTE
          : 'This signature was already in the pool, donated by another browser that produces exactly the same one. Nothing new was stored, and there is no new token — the entry belongs to whoever donated it first. You are, it turns out, not unique.',
      }),
      h('p', { text: PENDING_PUBLICATION }),
      token ? input : null,
      token ? h('div', {}, revokeButton) : null,
      status,
    ),
  );
}

function forgePanel(sections: SectionCounter): HTMLElement {
  const stats = state.forge.stats;
  const button = h('button', { type: 'button' }, 'Manufacture one');
  const output = h('pre', { class: 'payload', text: 'Nothing manufactured yet.' });
  const counts = h('p', { class: 'mono dim' });

  let totals = readForgeTotals();
  const updateCounts = () => {
    counts.textContent = `${int(stats.attempts)} attempts this session · ${int(stats.discarded)} discarded · ${int(stats.discardedByLikelihood)} for implausibility · ${int(stats.discarded - stats.discardedByLikelihood)} for impossibility. In this browser, across every sitting: ${int(totals.discarded)} discarded across ${int(totals.attempts)} attempts.`;
  };
  updateCounts();

  button.addEventListener('click', () => {
    const before = { attempts: stats.attempts, discarded: stats.discarded };
    const rng = rngFromHex(sha256(`forge:${Date.now()}:${Math.random()}`));
    const forged = state.forge.forge(rng);

    // The forge is the visitor's own machine doing the work, and its tally is
    // kept where the work happened. Recorded before the readout is written so
    // the two cannot show different numbers.
    totals = recordForge(stats.attempts - before.attempts, stats.discarded - before.discarded);
    updateCounts();

    if (!forged) {
      output.textContent = 'Nothing coherent came out of three thousand attempts. That happens, and it is the honest result rather than a failure to report.';
      return;
    }
    output.textContent = [
      `id            ${forged.id}`,
      `plausibility  ${forged.plausibility.toFixed(3)} (0 barely passed, 1 typical of the pool)`,
      `grafted from  ${forged.donorId?.slice(0, 16) ?? 'nothing'}`,
      '',
      ...state.forge.sampledIds.map((attr) => `${attrLabel(attr).padEnd(30)} ${String(forged.attrs[attr])}`.slice(0, 200)),
    ].join('\n');
  });

  return sections.section(
    { id: 'forge', eyebrow: 'The forge', title: 'The piece manufactures people' },
    h('p', { text: FORGE_NOTE }),
    h('p', {
      class: 'mono dim',
      text: `Sampled: ${int(state.forge.sampledIds.length)} attributes. Grafted from a donor with matching hardware: ${state.forge.graftedIds.map(attrLabel).join(', ')} — these cannot be invented, because a manufactured digest is a digest of nothing.`,
    }),
    h('div', {}, button),
    counts,
    output,
  );
}

function catalogueHandlers() {
  return {
    onOpen: (id: string) => {
      state.selectedId = id;
      monument?.setSelected(id);
      render();
      document.getElementById('entry')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    },
    onWear: async (id: string) => {
      const result = await wear(id);
      const entry = state.pool.entries.find((e) => e.id === id);
      if (entry) {
        entry.wearCount = result.wearCount;
        // Erosion is a property of the object, so the field is restated rather
        // than left showing a stele that is no longer accurate.
        monument?.setField(fieldEntries());
        monument?.setSelected(state.selectedId);
        void erosion;
      }
      return result;
    },
    hasWorn,
  };
}

// Unnumbered: a foot rather than a chapter, and so it stays out of the nav.
function colophon(sections: SectionCounter): HTMLElement {
  return sections.plain(
    { id: 'colophon', eyebrow: 'Colophon', solid: true },
    h('p', { text: LAW_NOTE }),
    h('p', { text: MODEL_ADDRESS }),
    h('p', {
      class: 'mono dim',
      text: 'WEAR ME — a fingerprint commons. Web Residencies No. 22, »Ignore All Previous Instructions«, Akademie Schloss Solitude, curated by !Mediengruppe Bitnik. No third-party requests are made from this page, including for its lettering.',
    }),
  );
}

void bootstrap();

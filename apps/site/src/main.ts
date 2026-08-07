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
  REVOCATION_NOTE,
  SYNTHETIC_DISCLOSURE,
  WORN_NOW,
} from './copy.js';
import { channelIndexFor, createMonument, type FieldEntry, type Monument } from './monument/scene.js';
import {
  donate,
  hasWorn,
  loadPool,
  reportForgeStats,
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
import { renderReadout } from './ui/readout.js';
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
  /** Pool-relative range the monument ranks corruption against. */
  scale: CorruptionScale;
}

let state: State;
let monument: Monument | null = null;

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

function poolSummary(): string {
  const { stats, source, apiError } = state.pool;
  const base = SYNTHETIC_DISCLOSURE(stats.syntheticCount, stats.size, stats.syntheticAtLaunch);
  if (source === 'api') return base;
  return `${base} The pool service is not answering (${apiError ?? 'unreachable'}), so this is the seeded launch file. It cannot grow while that is true: a donation will be refused rather than stored, and wear counts stay in this browser and are seen by nobody.`;
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
    renderGate(app, poolSummary(), onChooseTier);
    return;
  }

  append(app, [header()]);

  // If a script emitted by this piece is patching this page, say so before any
  // number is shown. Everything measured below is then a measurement of the
  // borrowed signature, and a readout that did not admit that would be the
  // most misleading thing on the site.
  const worn = wornHere();
  if (worn) app.appendChild(wornPanel(worn));

  if (state.report && state.collection) {
    const readoutMount = h('div');
    app.appendChild(readoutMount);
    renderReadout(readoutMount, state.report, state.model.nearUniqueIds, state.collection.failed);
    app.appendChild(automationPanel());
    if (state.tier === 'donate' && state.donatedId) app.appendChild(donationPanel());
  }

  const treeMount = h('div');
  app.appendChild(treeMount);
  renderTree(treeMount, state.forge.tree, state.pool.stats.size);

  app.appendChild(forgePanel());

  const catalogueMount = h('div');
  app.appendChild(catalogueMount);
  renderCatalogue(catalogueMount, state.pool.entries, state.selectedId, catalogueHandlers(), inscriptions());

  if (state.selectedId) {
    const entry = state.pool.entries.find((e) => e.id === state.selectedId);
    if (entry) {
      const entryMount = h('div');
      app.appendChild(entryMount);
      renderEntry(
        entryMount,
        entry,
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
      );
    }
  }

  app.appendChild(colophon());
}

function header(): HTMLElement {
  const back = h('button', {
    type: 'button',
    onclick: () => {
      monument?.setFocus(0);
      state.selectedId = null;
      monument?.setSelected(null);
      render();
    },
  }, 'Show the whole field');

  return h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel__inner stack' },
      h('h1', { text: 'Wear me' }),
      h('p', { class: 'mono dim', text: inscriptions() }),
      h('div', {}, back),
    ),
  );
}

function inscriptions(): string {
  const { stats } = state.pool;
  return [
    `${int(stats.size)} entries`,
    `${int(stats.donatedCount)} donated`,
    `${int(stats.totalWears)} wears`,
    `${bits(stats.bitsDestroyed)} bits destroyed`,
    `${int(stats.machineDonations)} donations read as machines`,
  ].join(' · ');
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

function automationPanel(): HTMLElement {
  const estimate = state.automation;
  if (!estimate) return h('div');
  return h(
    'section',
    { class: 'panel panel--solid' },
    h(
      'div',
      { class: 'panel__inner stack' },
      h('span', { class: 'label', text: 'Automation likelihood' }),
      h('p', { class: 'caveat', text: automationStatement(estimate) }),
      h('p', { class: 'mono dim', text: NO_GATE_NOTE }),
    ),
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
      state.pool = await loadPool();
      state.model = buildEntropyModel(state.pool.entries.map((e) => e.attrs), ATTR_IDS);
      state.forge = createForge(state.pool.entries);
      monument?.setField(fieldEntries());
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
      token ? input : null,
      token ? h('div', {}, revokeButton) : null,
      status,
    ),
  );
}

function forgePanel(): HTMLElement {
  const stats = state.forge.stats;
  const button = h('button', { type: 'button' }, 'Manufacture one');
  const output = h('pre', { class: 'payload', text: 'Nothing manufactured yet.' });
  const counts = h('p', { class: 'mono dim' });

  const updateCounts = () => {
    counts.textContent = `${int(stats.attempts)} attempts this session · ${int(stats.discarded)} discarded · ${int(stats.discardedByLikelihood)} for implausibility · ${int(stats.discarded - stats.discardedByLikelihood)} for impossibility. Pool total: ${int(state.pool.stats.forgeriesDiscarded)} discarded across ${int(state.pool.stats.forgeAttempts)} attempts.`;
  };
  updateCounts();

  button.addEventListener('click', () => {
    const before = { attempts: stats.attempts, discarded: stats.discarded };
    const rng = rngFromHex(sha256(`forge:${Date.now()}:${Math.random()}`));
    const forged = state.forge.forge(rng);
    updateCounts();

    void reportForgeStats(stats.attempts - before.attempts, stats.discarded - before.discarded);

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

  return h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel__inner stack' },
      h('span', { class: 'label', text: 'The forge' }),
      h('h2', { text: 'The piece manufactures people' }),
      h('p', { text: FORGE_NOTE }),
      h('p', {
        class: 'mono dim',
        text: `Sampled: ${int(state.forge.sampledIds.length)} attributes. Grafted from a donor with matching hardware: ${state.forge.graftedIds.map(attrLabel).join(', ')} — these cannot be invented, because a manufactured digest is a digest of nothing.`,
      }),
      h('div', {}, button),
      counts,
      output,
    ),
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

function colophon(): HTMLElement {
  return h(
    'section',
    { class: 'panel panel--solid' },
    h(
      'div',
      { class: 'panel__inner stack' },
      h('span', { class: 'label', text: 'Colophon' }),
      h('p', { text: LAW_NOTE }),
      h('p', { text: MODEL_ADDRESS }),
      h('p', {
        class: 'mono dim',
        text: 'WEAR ME — a fingerprint commons. Web Residencies No. 22, »Ignore All Previous Instructions«, Akademie Schloss Solitude, curated by !Mediengruppe Bitnik. No third-party requests are made from this page, including for its lettering.',
      }),
    ),
  );
}

void bootstrap();

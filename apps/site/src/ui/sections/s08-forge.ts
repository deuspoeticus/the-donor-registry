/**
 * Sector 08 · FORGE — the piece manufactures people.
 *
 * And discards almost all of them, which is the finding rather than a defect.
 *
 * The forge samples a dependency model of the pool and then throws away anything
 * incoherent. The sector shows the gate calibration, the session tally, and a
 * live "manufacture one" button that writes to the output window below it.
 *
 * All state that persists across renders (session totals) is passed in; mutable
 * forge state (attempt / discard counts) lives on the `forge` object returned by
 * `createForge`, which is stable across renders.
 */

import { attrLabel } from '@wearme/core/attributes';
import { plausibilityOf, type Forge, type PoolEntry } from '@wearme/core/forge';
import { rngFromHex } from '@wearme/core/prng';
import { sha256 } from '@wearme/core/hash';

import { copy } from '../../copy.js';
import { recordForge, readForgeTotals } from '../../pool.js';
import type { Board } from '../board.js';
import { bin, histogram, keyed, windowed } from '../chart.js';
import { clear, h, int, pct } from '../dom.js';
import { decoration } from '../glyphs.js';

// ---------------------------------------------------------------- sector 08

export interface ForgeProps {
  forge: Forge;
  /** Full entry list — used to plot the plausibility distribution. */
  poolEntries: PoolEntry[];
}

/**
 * Sector 08: the forge.
 *
 * The `forge` object carries live session stats on `.stats`; `poolEntries` is used
 * only to draw the plausibility histogram. Everything else is self-contained.
 */
export function forgeSector(board: Board, { forge, poolEntries }: ForgeProps): HTMLElement {
  const stats = forge.stats;
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
    const forged = forge.forge(rng);

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
      ...forge.sampledIds.map((attr) =>
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
  const plausibilities = poolEntries.map((entry) => plausibilityOf(forge, entry.attrs));

  return board.sector(
    'forge',
    {
      title: 'The piece manufactures people',
      lede: 'And discards almost all of them, which is the finding rather than a defect.',
      meta: `${int(forge.sampledIds.length)} sampled · ${int(forge.graftedIds.length)} grafted`,
    },
    h('p', { text: copy.forge.note }),
    keyed([
      {
        key: 'sampled',
        mark: 'forge',
        value: `${int(forge.sampledIds.length)} attributes, from the dependency tree`,
        register: 'inferred',
      },
      {
        key: 'grafted',
        mark: 'withheld',
        value: `${forge.graftedIds.map(attrLabel).join(', ')} — these cannot be invented, because a manufactured digest is a digest of nothing`,
        register: 'exposed',
      },
      {
        key: 'floor',
        mark: 'independent',
        value: `${forge.threshold.toFixed(2)} log-likelihood — the fifth percentile of real pool entries`,
        register: 'inferred',
      },
      {
        key: 'pool median',
        mark: 'about',
        value: `${forge.medianLikelihood.toFixed(2)} log-likelihood`,
        register: 'inferred',
      },
    ]),

    h('hr', { class: 'rule' }),
    h('span', { class: 'label', text: 'How plausible the pool is to itself' }),
    histogram(bin(plausibilities, 28), {
      register: 'inferred',
      label: 'Plausibility of every pool entry under the pool\u2019s own model',
      axis: ['0 \u2014 barely passed the floor', 'typical of the pool \u2014 1'],
    }),
    h('p', { class: 'gloss', text: copy.forge.distributionNote }),

    h('hr', { class: 'rule' }),
    h('div', {}, button),
    counts,
    outputWindow,
  );
}

# Roadmap

Working notes on what shipped and what's left. `README.md` documents the piece;
`SPEC.md` is the full build specification. This file tracks execution status
against both, for future reference.

Last updated: 2026-08-07.

---

## Current state

**Live:** [deuspoeticus.github.io/the-donor-registry](https://deuspoeticus.github.io/the-donor-registry/) — static MVP, deployed via GitHub Actions on every push to `main`.

**Repo:** [deuspoeticus/the-donor-registry](https://github.com/deuspoeticus/the-donor-registry), public.

What works right now: the consent gate (all three tiers), the monument (field +
close-up, glitch mapping for surprisal and dominant-attribute character), the
collector, the entropy readout with the observed/modelled gap, the client-side
forge with the coherence gate and dependency-tree render, and the catalogue.
Donation and wearing work but are **local to each visitor's browser** — the
pool service (`apps/api`) isn't hosted anywhere yet, so the site correctly
falls back to the seeded `data/bootstrap.json` and says so on screen rather
than pretending otherwise.

### Fixed 2026-08-07 (second session) — navigation, hierarchy, message

The page was one unbroken 10,900px scroll with no navigation of any kind, seven
sections all announcing themselves at identical weight, and a statement of what
the piece *is* that appeared exactly once (on the gate) and never again.

- **A running head** (`ui/nav.ts`), fixed, hairline, mono at label size. Lives
  outside `#app` because `render()` clears that element wholesale. The scrollspy
  resolves the current section by measurement against each section's own
  `scroll-margin-top` — the exact place an anchor jump parks it — which
  guarantees precisely one link is ever marked. An earlier
  `IntersectionObserver` band marked none at the top and bottom of the document
  and two wherever a short section straddled the band.
- **Numbered section eyebrows** (`ui/section.ts`), per §4 below.
- **A masthead that states the piece** — the deck's own line, "Your browser has
  a face. This work takes it, and gives it away.", plus the pool statistics set
  as a figure row rather than a run-on line of `·` separators. The post-gate
  wordmark dropped from 9rem to 5rem; the gate keeps the full setting.
- **The loop, on the gate** — measure → donate → wear, stated in three numbered
  steps *before* the tier buttons, so the consent choice is made against a
  picture of where each option leads. The tiers themselves are untouched: equal
  weight, nothing preselected, decline-first ordering all intact.
- **The catalogue is capped** at 48 entries with an explicit count and a
  "show the remaining N". It was rendering all 200 at ~4,700px — nearly half
  the document, and it buried the entry panel below itself.
- **The entry panel got a close control** and is reachable from the nav.

Net: 10,898px → 7,205px on the measured path, with every section addressable.

### Fixed in the first session

- `apps/site/vite.config.ts` had no `base` path. GitHub Pages serves this as a
  project site at `/the-donor-registry/`, so every asset URL needed that
  prefix — without it the build's absolute `/assets/...` paths would 404.
- `apps/site/src/pool.ts` fetched `/bootstrap.json` as a hardcoded root path.
  Same class of bug — fixed to respect `import.meta.env.BASE_URL`.
- Root `npm run typecheck` ran `tsc --build --force` against a root
  `tsconfig.json` that didn't exist (pre-existing break, unrelated to Pages).
  Replaced with per-workspace `tsc --noEmit` scripts, now wired into CI.
- Added `.github/workflows/deploy.yml`: typecheck → build → deploy to Pages.
- Enabled GitHub Pages with the Actions build source.

---

## Roadmap

### 1. Infrastructure — unblocks the real (shared) pool

- [ ] **Deploy `apps/api` to Fly.io or Railway** with a persistent volume for
      `pool.db`. No Dockerfile / `fly.toml` exists yet — write one from
      scratch.
- [ ] **Wire `VITE_API_URL` into the Pages deploy workflow** as a repo
      secret once the API has a stable URL, so production points at the live
      pool instead of falling back to `bootstrap.json`.
- [ ] **Add a CORS allowlist** for `https://deuspoeticus.github.io` in the
      API (currently no deploy config, so this hasn't been configured for a
      real origin yet).
- [ ] **Verify/finish rate limiting** on `POST /identity` and
      `POST /wear/:id`. `apps/api/src/ratelimit.ts` exists — confirm it
      matches the SPEC §8 design (rotating salted-hash buckets regenerated
      every 10 minutes, no retained address) and is actually applied.
- [ ] **Code-split the site bundle.** Currently 577KB (mostly Three.js) in
      one chunk — Vite warns about it. Use
      `build.rollupOptions.output.manualChunks` or dynamic-import the
      monument scene.
- [ ] **Add a regression check for base-path-relative fetches.** Just fixed
      one hardcoded-absolute-path bug; GitHub Pages project sites are
      especially prone to this class of bug recurring as the codebase grows.

### 2. SPEC-deferred features

Per README's own "Deferred" list:

- [ ] **Behavioral half of the classifier** — cursor path curvature entropy,
      inter-event timing variance, scroll cadence regularity, absence of any
      pointer event before first interaction (SPEC §4a).
- [ ] **Wire classifier uncertainty (`H_classifier`) into the monument's
      temporal-instability shader input.** Currently hardcoded to `0` in
      `main.ts` — the shader input is wired, the number just isn't computed
      yet. Depends on the item above.
- [ ] **Procedural sound** (SPEC §6c) — muted-by-default drone seeded from
      the visitor's hash, noise floor scaling with surprisal, the recorded
      audio-fingerprint value used as a literal modulation source.
- [ ] **Report-back loop** (SPEC §7) — with consent, the emitted userscript
      reports back only the *count* of distinct origins that saw the
      borrowed identity, feeding the bits-destroyed counter.
- [ ] **Consequence log** (SPEC §7b) — public log of what broke while
      wearing a borrowed identity. Explicitly the lowest-priority deferred
      item: "cut first if the schedule slips."
- [ ] **Font-metric interception in the userscript emitter** (SPEC §7,
      surface 8) — patch `measureText`/`offsetWidth`. Marked "hard,
      best-effort, phase 2" in the spec itself.
- [ ] **Scope Tier 2 (browser extension)** as phase-2 work. SPEC §10 notes
      Chrome Web Store will likely reject it; Firefox AMO is more permissive.
      Decide store strategy before building.

### 3. Verification — once the API is live

- [ ] **End-to-end test donate → wear → revoke** against the real (not
      local) API. Confirm the payload preview matches what's sent, the
      userscript works, and revocation actually removes the entry and
      invalidates existing scripts on next fetch.
- [ ] **Re-verify the cross-browser fingerprint-swap claim** in the README
      (Windows/NVIDIA desktop wearing an identity presents as a Pixel 8 on
      Android 13 in Warsaw, byte-identical canvas readback) against the
      deployed stack — the original verification ran against local dev.
- [ ] **Lighthouse/perf pass** on the live Pages deployment. The piece is
      explicitly desktop-only (deck §16) — confirm that's clearly stated and
      the mobile experience fails gracefully.
- [ ] **Confirm `prefers-reduced-motion` behavior live** — SPEC §6b says it
      should freeze temporal instability and render corruption statically
      rather than removing the mapping. Plus a general accessibility pass
      (focus states, noscript message, contrast).

### 4. Visual language

Informed by `the-donor-registry.pdf` (the submitted application). The site
already matches the deck's core rule — monochrome cold, mono labels, grotesque
display face, color reserved for the glitch channels (`styles.css:1-17`). What
the deck adds that the live site doesn't yet have is its print/editorial
scaffolding:

- [x] **Numbered section eyebrows** (`01 MEASUREMENT`, `02 INFERENCE`...)
      with hairline rules, matching the deck's editorial system. **Decision
      held:** the accent stayed monochrome — red is deck-only, preserving the
      site's own rule that colour exclusively means identifying information.
      Numbers are assigned at render time (`ui/section.ts`), not hardcoded,
      because which sections exist depends on the consent tier: "Look only"
      has no measurement and no inference, so it correctly numbers 01–03.
- [x] **Upgrade the per-attribute entropy bar chart** in `readout.ts` — now
      the deck's page-3 treatment: full-width track, filled bar, tick at the
      value, right-aligned figure. Aggregated per attribute *group* (as the
      deck does) from the same per-attribute surprisals the table lists, so
      the two cannot disagree. The forty-row table moved behind a disclosure:
      it is the evidence, not the headline.
- [ ] **Review the dependency-tree diagram** in `tree.ts` against the deck's
      page-4 node-link version for label placement, edge-weight
      visualization, and node sizing. **Still outstanding** — the tree kept
      its radial layout; only its section chrome changed.
- [x] **Add a real favicon.** `data/favicon.svg` — three steles on the dark
      plane, self-hosted, no third-party request. Root-relative in
      `index.html` so Vite applies the Pages base prefix (`%BASE_URL%` would
      double it).

### 5. Housekeeping / publication

- [ ] **Add a LICENSE file.** The deck (§16 Publication) states "all code
      open source" but the repo has none yet.
- [ ] **Set up the weekly build/field-report cadence** the deck commits to
      in §16 — pool statistics, the build, and a field report from a week
      spent wearing a stranger. Decide where this lives (repo CHANGELOG,
      GitHub Discussions, the residency microsite) once the pool is live.

---

## Notes on sequencing

Hosting `apps/api` (§1, item 1) unblocks the largest share of this list —
donation/wearing going pool-wide, the userscript emitter actually serving
scripts, the report-back loop, and both verification items in §3. Everything
else is independent and can proceed in parallel.

# Roadmap

Working notes on what shipped and what's left. `README.md` documents the piece;
`SPEC.md` is the full build specification. This file tracks execution status
against both, for future reference.

Last updated: 2026-08-10.

---

## Current state

**Live:** [deuspoeticus.github.io/the-donor-registry](https://deuspoeticus.github.io/the-donor-registry/) — static MVP, deployed via GitHub Actions on every push to `main`.

**Repo:** [deuspoeticus/the-donor-registry](https://github.com/deuspoeticus/the-donor-registry), public.

What works right now: one page of eleven fixed sector addresses with every jump a
scroll, the pool census in front of the consent gate, the gate itself (all three
tiers), the collector, the entropy readout with the observed/modelled gap, the
client-side forge with the coherence gate, the dependency tree with the full
mutual-information matrix beside it, the catalogue, the three rites (donation,
extraction, withdrawal), and the glitch mapping driving the page's own
post-processing layer.
Donation and wearing work but are **local to each visitor's browser** — the
pool service is not hosted anywhere yet, so the site correctly falls back to
the seeded `data/bootstrap.json` and says so on screen rather than pretending
otherwise. `apps/worker` (Hono + Cloudflare D1) is the service that gets
deployed when this changes; `apps/api` (Fastify + better-sqlite3) is the
design it was ported from and is kept only for local dev against a real
SQLite file, not as a second deploy target (§1).

### 2026-08-10 (seventh session) — reads go static, writes stay honest about being writes

A review of the read/write split landed on three fixes, applied in order of
how much silently wrong they'd otherwise leave in place.

- **The published catalogue stops being committed to git.** `data/pool.json`
  and the live pool's `data/scripts/*.user.js` were `git add`ed by the weekly
  build (previous session added the scripts half without noticing it inherited
  this problem). A row deleted from D1 the moment a revocation token checks
  out was still sitting in every commit that had ever included it — recoverable
  forever, by anyone who ever cloned or forked the repo, independent of what
  the live site showed. That is a direct hole in the one thing the lawful
  basis for holding a fingerprint depends on (README, "Privacy and law").
  Fixed by making publishing a deploy rather than a commit: `publish-pool.yml`
  now regenerates both files from D1 and builds+deploys the site in the same
  job, and never runs `git add`. `data/pool.json` is untracked and gitignored;
  `data/bootstrap.json` and its matching seed scripts stay committed, because
  they are synthetic and have no donor to revoke anything on behalf of.
  `prune-revoked.ts` used to read "the currently deployed catalogue" off the
  committed file at checkout — it now fetches the live site's `pool.json`
  instead, which is what "currently deployed" actually means once the file
  is not in the repo.
- **The publish cadence moved from weekly to every ten minutes**, now that a
  run costs a deploy and not a commit. Framed in the interface's own terms:
  a registry has a day book (D1, continuous) and an engrossed register
  (the static site, printed periodically) — ten minutes is how far behind the
  day book the register is now allowed to get, not a promise GitHub's
  scheduler is expected to keep exactly.
- **`POST /identity` runs the forge's coherence gate before storing anything.**
  It didn't. An open, unauthenticated donation route that accepted any
  well-formed vector could be filled with incoherent ones inside a day, which
  would wreck the Chow-Liu fit and therefore every number the page derives
  from it. `constraints.ts` already discards 99% of the forge's own forgeries
  for exactly this reason; applying it to a donation is the same argument,
  not a new one, and it is not a personhood test — a real, unusual browser
  passes it the same as a coherent forgery does, and automation likelihood
  still never gates anything (§4a). Fixed in both `apps/worker` and the
  legacy `apps/api`.
- **Deliberately not changed:** rate limiting still hashes `CF-Connecting-IP`
  inside the Worker under a rotating salt rather than moving the check to
  Cloudflare's edge-level rate-limiting rules. The edge version is a real
  option — the Worker would never read the header at all — but it is a
  dashboard/plan-level infrastructure choice outside this repo, and the
  current implementation already satisfies the spec's actual non-negotiable
  (§8: "a rotating salted hash with a short TTL, not a retained address").
  Left as a documented option rather than a silent gap.

### 2026-08-10 (sixth session) — the install link goes static

The catalogue's "Take this face" is the piece's flagship click, and it depended
on `apps/api`/`apps/worker` — neither hosted yet (§1) — for something that is a
pure function of an id and its attrs. Fixed by pre-generating it.

- **`packages/core/scripts/write-scripts.ts`**, new: emits one `<id>.user.js`
  per entry under the default surface modes (converge canvas, converge audio,
  overrides visible) into `data/scripts/`, and deletes any file left over from
  an id no longer in the pool. Called from `bootstrap.ts` (the 200 launch
  entries) and from `apps/worker/scripts/publish-pool.ts` (the live pool, on
  the same weekly cadence that already governs `data/pool.json` and
  withdrawal). `data/` is already Vite's `publicDir`, so the files ship as
  ordinary static assets with no build wiring beyond writing into that folder.
- **`apps/site/src/pool.ts`'s `scriptUrl`** now returns the static path for the
  default surface modes and only falls back to the worker's
  `/identity/:id/script.user.js` for a mode the visitor changed live (perturb,
  or hidden overrides) — the one variant a static file can't cover.
- **Net effect:** donation, wearing and revocation still need the worker,
  because those are writes. Reading the catalogue, reading an entry, trying a
  script with nothing installed, and now installing one for real, do not — the
  site works from a plain static host with the worker never deployed, which is
  the actual state of this repo today.

### 2026-08-08 (fifth session) — two notations

- **The mark set culled from 71 to 19.** Everything kept is used somewhere in the
  interface *and* is the right character rather than an evocative one. What went was
  atmosphere: fleurons beside the running head, planetary signs for gold and silver, a
  lozenge for "an entry", a power symbol for consent.
- **Sigils.** Twenty downsampled emoji for the things marks were being stretched to
  cover — sectors, tiers, rites, the status strip. Twemoji at 72px (CC-BY 4.0),
  area-downsampled to 16, desaturated to four bands of `currentColor` so they invert with
  whatever they sit on, three keeping one hue where the hue is the meaning. The PNG
  decoder is hand-rolled on `zlib`; pulling an image library in to read twenty 800-byte
  files was the worse trade. Pixel grids are committed as readable rows, so a bad
  downsample shows up in a diff.
  - **WhatsApp's set was the ask and cannot be used** — Meta's designs, not licensed for
    redistribution, and hotlinking would break the no-third-party-request rule.
- **The division:** if it has a plural it is a sigil, if it takes arguments it is a mark.
  Sigils also have a ~16px floor, so the keyed readouts and table cells keep marks.
- **The cursors are now three of the same sprites**, generated at boot from the same data
  rather than hand-written twice in CSS.
- **The nav got bigger.** 4rem + 2.25rem strip, names at reading size instead of 11px
  condensed-and-tracked, a sigil per address. Names lost their definite articles, which is
  what made the row fit. Above ~1760px every address fits; below it the row scrolls with a
  faded edge, and the fade is removed where it would be lying.

### 2026-08-08 (fourth session) — the register

The design read as a dashboard from the near future, which is the one thing the piece
is not. It is now a **registry**: a ledger, on paper, kept by an old instrument that
has been given capabilities it was never built for.

- **The ground inverted.** Off-white paper, ink text; red and turquoise unchanged as
  hues, and each now declared three times — `--red`/`--cyan` for fills, `-ink` for
  text on paper, `-lit` for text on ink. Every text value was measured against the
  darkest ground it is actually set on, not the lightest: the sunk panels are darker
  than the sheet, and values tuned against the sheet came in short inside a window.
- **Inter out, Archivo in.** A neo-grotesque in the Haas line with a real width axis,
  so labels and addresses are genuinely condensed rather than squeezed. Tracking
  narrowed throughout (`-0.019em` body, `-0.035em` display).
- **The monospace is confined.** It is the one face not carried, so it is no longer
  set loose in text: every run of it now sits inside a framed, captioned `.window`.
  Prose that was in monospace because it looked technical moved to `.gloss`.
- **Hover rewritten.** One gesture — the thing under the cursor inverts — and one rule
  that outranks the idea: nothing is ever made less readable by being pointed at. The
  blur-and-fade tile behaviour is gone; the definition it was hiding is now in the
  flow and legible at all times. Inversion is done by swapping declared colours, never
  `filter: invert()`, because inverting red yields turquoise and the notation would
  invert with the surface.
- **The two rites** (SPEC §6h). Giving a signature and taking a face are boxed,
  sealed and set apart from the readings, with the consequence on its own line. Weight,
  not steps: no rite adds a click, and the gate stays symmetrical.
- **Cursors.** A quill nib, a manicule and an hourglass, drawn on a 24-unit grid.
  Encoding gotcha worth remembering: `data:image/svg+xml,` + percent-encoding, never
  `;utf8,` — the mismatch fails silently to the system cursor.
- **The tree got room.** 1560×760, elliptical rings, labels above/below near the
  vertical axis instead of colliding sideways, and the rings themselves now drawn.
- **The name.** THE DONOR REGISTRY: Wear Me. The one place the old string stays is the
  canvas probe text, which is part of the measurement rather than a label — the
  reasoning is written next to it in `probes-graphics.ts`.

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

The plan below is `apps/api` on a rented box (Fly.io/Railway) — superseded.
`apps/worker` (Hono + Cloudflare D1) is the actual implementation: same
routes, same SPEC §8 guarantees, no VM to keep patched, scales to zero, and
its snapshot-publish step is what the sixth/seventh sessions above depend on
(a Worker cron or, currently, a scheduled GitHub Action can both drive it —
either way the point is that reads become a deploy artifact, never a live
request). What is actually left, against `apps/worker` rather than `apps/api`:

- [ ] **Deploy `apps/worker`.** `wrangler.toml` is filled in (a `database_id`
      is already committed) but nothing confirms it has ever been applied —
      `db:migrate`, `db:seed`, `secret:limiter`, `deploy`, in that order.
- [ ] **Wire `VITE_API_URL` and `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`**
      into repo secrets once the Worker has a stable URL — `deploy.yml`
      already reads `VITE_API_URL`, and `publish-pool.yml` (seventh session)
      already reads the Cloudflare pair; both currently no-op or fail without
      them, which is the intended fail-loud behaviour rather than a silent
      fallback to `bootstrap.json` in production.
- [x] **CORS allowlist** — `wrangler.toml`'s `ALLOWED_ORIGINS` is already set
      to `https://deuspoeticus.github.io`, applied in `apps/worker/src/index.ts`.
- [x] **Rate limiting** — `apps/worker/src/ratelimit.ts` matches SPEC §8:
      rotating salted-hash buckets, one D1 table, no retained address, and is
      applied to every write route. Still open: moving the check to
      Cloudflare's edge-level rate-limiting rules instead of inside the
      Worker, which would mean the Worker never reads `CF-Connecting-IP` at
      all — a real improvement, but a dashboard/plan-level choice rather
      than a code change, and deliberately not done in the seventh session
      (see that entry above).
- [x] **Code-split the site bundle.** Resolved by deletion rather than by
      splitting. It was 577KB in one chunk, almost all of it Three.js; Three.js
      left with the stele field (SPEC §6a) and the bundle is now ~125KB with no
      runtime dependency in the browser at all. If the artwork returns as WebGL
      this comes back, and the answer then is a dynamic import rather than a
      manual chunk.
- [ ] **Add a regression check for base-path-relative fetches.** Just fixed
      one hardcoded-absolute-path bug; GitHub Pages project sites are
      especially prone to this class of bug recurring as the codebase grows.

### 2. SPEC-deferred features

Per README's own "Deferred" list:

- [ ] **Behavioral half of the classifier** — cursor path curvature entropy,
      inter-event timing variance, scroll cadence regularity, absence of any
      pointer event before first interaction (SPEC §4a).
- [ ] **Wire classifier uncertainty (`H_classifier`) into the temporal
      instability of the post-processing layer.** The shader input this used to
      feed went with the stele field; there is currently no instability term in
      `ui/post.ts` at all, which is the honest state — the number was never
      computed, and a wired input reading a constant zero was only ever a
      placeholder. Add the term and the input together. Depends on the item above.
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

Deploying `apps/worker` (§1, item 1) unblocks the largest share of this list —
donation/wearing going pool-wide, the catalogue and its install links
publishing for real (sixth/seventh sessions above), the report-back loop, and
both verification items in §3. Everything else is independent and can proceed
in parallel.

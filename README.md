# WEAR ME

**A fingerprint commons.**

Web Residencies No. 22 »Ignore All Previous Instructions« — Akademie Schloss Solitude, curated by !Mediengruppe Bitnik.

Every browser leaks a near-unique signature. This piece measures the visitor's in front of them, runs the same inference ad-tech runs, tells them what it decided, and then does the thing the industry never anticipated: it puts the identity into a public pool that anyone can wear. The monument is a graveyard of donated faces, some real, some manufactured by the piece itself, some belonging to machines, and it hands out working tooling to inhabit any of them.

The registry is indifferent to what kind of thing you are. The collector runs on anything that executes JavaScript, so browsing agents are measured like everyone else and their signatures enter the same commons, unlabeled. The personhood boundary is not argued with; it is dissolved by the artwork's own procedure.

---

## Running it

Requires Node 20+. npm workspaces — no pnpm needed.

```bash
npm install
```

Generate the seeded launch pool (already committed at `data/bootstrap.json`, reproducible from a fixed seed):

```bash
npm run bootstrap
```

Two processes. The pool service:

```bash
npm run dev:api
```

The site:

```bash
npm run dev
```

Then open http://localhost:5173. The site falls back to the committed launch file when the service is unreachable, and says so on screen rather than pretending the pool is live.

### Checks

`npm run check --workspace @wearme/core` fits the model against whatever pool is on disk and asserts the three numbers that are load-bearing and easy to get quietly wrong: that nothing exceeds the pool bound, that the observed/modelled gap is real, and that the forge produces coherent identities rather than copies.

`npm run emit --workspace @wearme/core -- 3 --out out.user.js` emits a userscript for pool entry 3 and fails if it does not parse.

`npm run typecheck` covers all three projects.

---

## Layout

```
packages/core      isomorphic: attribute manifest, canonical hashing, entropy,
                   Chow-Liu tree, forge + impossibility manifest, userscript emitter
apps/site          Vite + TypeScript + Three.js — the monument and the interface
apps/api           Fastify + better-sqlite3 + Zod — the pool
data/bootstrap.json  the seeded launch pool, generated offline, committed
```

`packages/core` is source-only TypeScript consumed through a Vite alias and by `tsx`. There is no build step for it, which is deliberate: the same file the browser runs is the file you read.

---

## The parts that carry the argument

**The measurement is bounded and says so.** Two figures are shown at equal size: the sum of per-attribute surprisals, which assumes the attributes are independent and is therefore an overstatement, and the surprisal under a Chow-Liu tree, which subtracts the mutual information the first figure double-counts. Against a 200-entry pool the gap is around 100 bits. That gap is the honest content — it is roughly the size of the claim a standard fingerprinting demonstration makes and cannot support. Every figure is capped at log2(N) over the pool it was measured against, and the caveat is set in the same type as the number.

**The coherence gate is the argument, not a filter.** The forge samples a dependency model of the pool, then discards anything that breaks a rule in `packages/core/src/constraints.ts` — an Apple renderer on a Windows platform, a UTC offset the named zone never produces, a handheld reporting zero touch points. It discards about 99% of what it samples. An incoherent borrowed identity does not anonymise you; it makes you a unicorn, which is more identifiable than what you started with.

**Attributes the pool cannot model are held out rather than faked.** At 200 entries the canvas, emoji and scene digests take a different value for almost every row, so they are identifiers rather than variables. The model excludes them and reports that it has; the forge grafts them from a real donor with matching hardware rather than inventing them, because a manufactured digest is a digest of nothing. Which attributes fall on which side is a property of the pool and moves as it grows.

**Consent is three tiers at equal weight with nothing preselected,** and the literal request body is shown, complete and scrollable, before anything leaves the browser. Declining is the same size as accepting, in the same position, with the same styling.

**Automation likelihood is an attribute, never a gate.** It is computed, shown, stored and counted in the pool-wide aggregate. Nothing in the pipeline branches on it, `GET /identity/:id` cannot leak it, and no ordering correlates with it. The absence of that code path is the feature.

**The userscript is the only part that leaves the origin.** Same-origin policy means nothing served from this domain changes how a visitor renders elsewhere, so the deliverable is a `.user.js` that runs at `document-start` in the main world. Noise is deterministic per identity and never per call — a signature that changes on every read is not anonymity, it is a beacon, and randomisers are themselves a strong fingerprint.

A userscript manager is genuinely required and there is no way around it. A bookmarklet fires after load, on the page you are already on; service workers, iframes and `window.open` are all confined to their own origin. The only extension-free alternative is a rewriting proxy, which was rejected because it changes what is being demonstrated — the target site would see the *server's* address and TLS handshake rather than the visitor's, and "your browser, your address, someone else's face" is the whole premise.

Two things make that requirement as light as it can be. The pool serves each script from a real `.user.js` URL with `Content-Disposition: inline`, so a manager intercepts the navigation and offers to install it in one click rather than the visitor hunting for a downloaded file. And every entry can be **tried with nothing installed**: the script is run for real, at `document-start`, in a blank same-origin frame, which is then read back and discarded. That proves the mechanism works and is labelled as proving nothing about the live web, because this page can reach into a frame it created and nowhere else — the same rule that makes the userscript necessary in the first place. Under *Look only*, the comparison column is not populated at all, because reading it would measure a visitor who has just been told they would not be measured.

Verified against a live browser: a Windows/NVIDIA desktop wearing one pool entry presents as a Pixel 8 on Android 13 in Warsaw, with the target's renderer, extension list, core count, screen, pixel ratio, locale, time zone, offset and voice list all matching exactly. Two canvases with entirely different content produce byte-identical readback, which is what makes the pool a commons rather than a set of costumes.

**And it says what it cannot do.** Your address is unchanged, your logged-in sessions are unchanged, and your TLS handshake, HTTP/2 frame ordering and cursor geometry keep telling the truth while the JavaScript lies. Wearing a stolen face does not make you invisible. It makes you an anomaly, which is the most conspicuous thing available. That is on the screen, not in this file only.

---

## Privacy and law

Stored: the attribute vector, its derived id, a created-at date bucketed to the day, the wear count, a synthetic flag, an automation likelihood, and a hash of a revocation token. The synthetic flag and automation likelihood are aggregate-only and never appear per entry.

Never stored: IP address, User-Agent header, any request-level identifier, any cookie. There is no column for them, which is a stronger guarantee than a policy about them. Rate limiting hashes the caller's address under a salt that is regenerated and thrown away every ten minutes, so the buckets become unlinkable to any address — including to themselves a minute earlier.

The page makes no third-party requests, including for its lettering. A piece about surfaces that report on you without asking does not get to open a connection to a font CDN.

A browser fingerprint is almost certainly personal data under the GDPR. The basis here is explicit informed consent, freely given, with a plain revocation path. The same collection is performed at planetary scale under a legitimate-interest claim by companies that never show anyone the payload. That asymmetry is the concept text.

---

## State

Built: collector (14 probes), entropy with the observed/modelled gap, Chow-Liu forge with the impossibility manifest, the dependency-tree view, the monument (instanced field plus exact close-up, glitch mapping wired to surprisal, dominant attribute, wear and forge plausibility), all three consent tiers with the real payload preview, the userscript emitter, and the pool service with donation, wearing, revocation and the consequence log.

Deferred: the behavioural half of the classifier and the uncertainty-driven temporal instability it feeds (the shader input is wired and reads zero rather than a fabricated number), procedural sound, the report-back loop, and font-metric interception in the userscript.

`SPEC.md` is the full build specification and records the decisions this implementation departs from.

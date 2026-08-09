# THE DONOR REGISTRY: Wear Me. — build specification

**The name.** `THE DONOR REGISTRY` is what the work is called; `Wear Me.` is what it
says to you. They are not alternatives and they are not a subtitle — they are a premise
and a conclusion, joined with a colon in the full form and set in two different faces
everywhere they appear together. The registry names an institution and is set as an
institution sets its name; the slogan is an instruction addressed to the visitor and is
set as one, in red. Use both, and use the slogan often.

**A fingerprint commons.** Title settled; earlier candidates were `I AM SPARTACUS`, `THE DONOR REGISTRY`, `1 IN N`.

Web Residencies No. 22 »Ignore All Previous Instructions« — Akademie Schloss Solitude, curated by !Mediengruppe Bitnik.

---

## 0. What this is, in one paragraph

Every browser leaks a near-unique signature — canvas rendering quirks, WebGL driver strings, audio-context output, font metrics, timezone, hardware concurrency. In 2026 this signature is no longer used mainly to ask *who are you*; it is used to ask **are you a person at all**, because AI browsing agents now arrive in real Chromium with genuine user-agent strings and residential IPs, and the only thing left that separates them from humans is exactly this layer. The work harvests the visitor's signature in front of them, runs the same inference ad-tech runs, tells them what it decided, and then does the thing the industry never anticipated: it puts the identity into a public pool that anyone can wear. The catalogue is a register of donated faces, some real, some manufactured by the piece itself, some belonging to machines, and it hands out working tooling to inhabit any of them.

**The registry is indifferent to what kind of thing you are.** The collector runs on anything that executes JavaScript, so AI browsing agents are measured like everyone else and their signatures enter the same commons, unlabeled. Humans can wear an agent and be treated as one by the live web; agents can wear a human. The personhood boundary is not argued with, it is dissolved by the artwork's own procedure. This is the piece's central mechanism, not a feature.

**Non-negotiables.** The glitch is measured, never decorative — corruption is a readout of entropy and classifier uncertainty. Consent is explicit, truthful, and revocable. Automation likelihood is an attribute, never a gate. The piece must survive a hostile technical reading: no claim in the interface may be untrue.

---

## 1. Architecture

```
/                       npm workspace
├── apps/
│   ├── site/           Vite + TypeScript — the instrument
│   │   └── src/
│   │       ├── collector/   fingerprint acquisition (browser)
│   │       ├── fonts/       the three self-hosted faces (§6e)
│   │       ├── styles/      tokens, base, chrome, board, data, controls,
│   │       │                post-processing, hover
│   │       ├── ui/          sector manifest, notation, chart primitives,
│   │       │                census, consent gate, readouts, model, catalogue,
│   │       │                post-processing controller
│   │       └── classifier.ts  automation likelihood (browser)
│   └── api/            Fastify + better-sqlite3 — the pool
├── packages/
│   └── core/           isomorphic: attribute manifest, canonical hashing,
│                       entropy, Chow–Liu tree, forge + constraints,
│                       userscript emitter, Zod schemas
└── data/
    └── bootstrap.json  seeded synthetic pool for cold start
```

**Stack:** npm workspaces, TypeScript strict, Vite, Fastify, better-sqlite3, Zod for all payload validation. No rendering library and no runtime dependency in the browser at all: the site ships hand-written DOM and CSS, and the whole bundle is around 125 kB. Rust/axum is a fine swap for `apps/api` later; use Node now for speed.

Three.js and raw GLSL were in this list and are not any more. See §6a.

**Departures from the original layout, and why.** pnpm is replaced by npm workspaces, which are built in and need no extra install. The five `packages/*` are collapsed into one `packages/core`: the split was drawn along conceptual lines rather than dependency lines, and every one of them imported the attribute manifest, so five packages meant five copies of one contract. The browser-only halves (collector, classifier) live in `apps/site` because they cannot run anywhere else. `packages/core` ships as source TypeScript with no build step, consumed through a Vite alias and by `tsx` — the file the browser runs is the file you read, which matters for a piece that expects to be read.

**Deploy:** Fly.io or Railway (API + SQLite volume), static site anywhere. The residency microsite embeds via iframe, so the site must work in one.

**Cold start is solved by `data/bootstrap.json`** — 200 synthetic identities sampled offline from a hand-built prior. The interface must state that the pool is seeded and how many entries are synthetic-at-launch. Do not hide this. It is both honest and thematically correct.

---

## 2. Collector — `packages/collector`

Acquire the vector. Each attribute returns `{ id, value, raw?, ms }`. Run in parallel with a 2500 ms budget; missing attributes are recorded as `null`, which is itself information.

| Group | Attributes |
|---|---|
| Canvas 2D | text render with mixed fonts + emoji + `globalCompositeOperation` passes → SHA-256 of `getImageData` |
| WebGL | `UNMASKED_VENDOR_WEBGL`, `UNMASKED_RENDERER_WEBGL`, sorted `getSupportedExtensions()`, `getShaderPrecisionFormat` for vertex/fragment × high/medium float, `MAX_TEXTURE_SIZE`, `MAX_VIEWPORT_DIMS`, hash of a rendered gradient+shader scene |
| Audio | `OfflineAudioContext(1, 44100, 44100)` → oscillator → `DynamicsCompressor` → sum of `getChannelData(0)` slice, to 6 decimal places |
| Navigator | `userAgent`, `platform`, `hardwareConcurrency`, `deviceMemory`, `languages`, `maxTouchPoints`, `pdfViewerEnabled`, `webdriver` |
| Client Hints | `navigator.userAgentData.getHighEntropyValues([...])` — full list |
| Screen | `width`, `height`, `availWidth`, `availHeight`, `colorDepth`, `devicePixelRatio` |
| Intl | `resolvedOptions()`: `timeZone`, `locale`, `calendar`, `numberingSystem`; `Date.prototype.getTimezoneOffset()` |
| Fonts | span-measurement of ~64 candidate faces against three fallback baselines → bitmask |
| Voices | `speechSynthesis.getVoices()` → sorted `name\|lang` list hash (high entropy, no permission, frequently missed) |
| Codecs | `MediaRecorder.isTypeSupported` + `canPlayType` across ~20 MIME/codec strings |
| CSS env | `matchMedia`: `prefers-color-scheme`, `prefers-reduced-motion`, `prefers-contrast`, `forced-colors`, `dynamic-range`, `color-gamut`, `pointer`, `hover` |
| Devices | `enumerateDevices()` **counts by kind only** — never labels, never IDs |
| Math | quirk vector: `Math.tan(-1e300)`, `Math.sinh(1)`, `Math.expm1(1)`, `Math.pow(Math.PI, -100)` etc., serialized to 17 sig figs |
| Storage | `navigator.storage.estimate().quota` bucketed to powers of two |

**Deliberately excluded, and say so in the interface:** WebRTC local-IP enumeration, any permissioned sensor, device labels, cookies, and any network-layer identifier. The API stores **no IP address** — see §8.

Output: `Fingerprint = { attrs: Record<string, string|number|null>, id: sha256(canonicalJSON(attrs)) }`.

---

## 3. Entropy — `packages/entropy`

Two numbers, both shown, because they say different things and the difference is part of the argument.

**Observed surprisal.** For each attribute *a* with value *v*, `H_a = -log2(count(v) / N)` over the current pool of size *N*. Bounded above by `log2(N)` — with a 200-entry pool you cannot honestly claim more than ~7.6 bits per attribute. The interface must label this as *measured against this pool*, not against the web.

**Modelled entropy.** Sum of marginal entropies minus mutual information captured by the Chow–Liu tree (§5). This corrects the naive independence assumption that inflates every fingerprinting demo on the internet. Report both. Show the gap. The gap is the honest content.

**Headline readout:** `YOU ARE 1 IN N` where `N = 2^H_joint`, with the pool-bound caveat rendered at the same weight as the number, not as fine print.

**Bits destroyed counter.** When identity *i* is worn by *k* distinct visitors, its surprisal falls from `-log2(p_i)` toward `-log2(k·p_i)`. Accumulate `Δbits` across all worn identities. It is a headline figure in the census (§6g, sector 01) and it must only ever go up as a result of real events.

---

## 4. Classifier — `packages/classifier`

Runs entirely client-side. Ships as hand-weighted logistic regression; the schema allows swapping in trained weights during the residency. Do not reach for onnxruntime-web yet.

**4a. Automation likelihood — an attribute, never a gate.** Nothing in the pipeline branches on this value. A visitor read as an agent is collected, displayed, catalogued and made wearable on identical terms to one read as human; the estimate is stored as one more field in the vector. Aggregate counts are published (`machines that donated a face this month: N`); per-entry provenance is not, exactly as with synthetic entries in §5. Features: `navigator.webdriver`, presence of `cdc_`/`$cdc_` properties, `window.chrome` shape anomalies, headless renderer strings (`SwiftShader`, `llvmpipe`, `Mesa OffScreen`), Permissions API inconsistency (`notifications` denied while `Notification.permission` default), zero-length plugin array against a desktop UA, `Function.prototype.toString` tampering, plus behavioral features accumulated over the session: cursor path curvature entropy, inter-event timing variance, scroll cadence regularity, absence of any pointer event before first interaction.

**4b. Segment inference — the ad-tech mimicry.** Output device tier, OS family, likely locale, likely returning status. This must be visibly, legibly crude, with confidence exposed; where the model hedges, show the hedge. **No monetary or value estimate.** An "estimated income decile" readout is a worn gag and would be the one gimmick in the piece — cut deliberately, do not reintroduce.

**4c. Uncertainty is the driver.** Export `H_classifier` — the entropy of the output distribution. This feeds the visual layer (§6) and is the mechanism by which *illegibility becomes the good state*.

The classifier's verdict is displayed as a short, flat statement in the interface's voice, never a personified one. `Read as human, 0.71. Read as agent, 0.29. Neither reading is stable.`

---

## 5. The forge — `packages/forge`

The piece manufactures people. This is the technical spine and the hardest part; budget accordingly.

**Model: Chow–Liu tree over the categorical attributes.**

1. Discretize numeric attributes into bins.
2. Compute pairwise mutual information `I(X_i; X_j)` across the pool.
3. Build the maximum spanning tree on that matrix.
4. Estimate conditionals `P(child | parent)` with Laplace smoothing.
5. Sample ancestrally from the root.

Chow–Liu is correct here and a VAE is not: the data is low-dimensional, categorical, heavily correlated, and there will be hundreds of samples rather than millions. It trains in milliseconds, it is interpretable, and **its dependency tree is a renderable object** — see §6d.

**Coherence gate.** A sample is rejected unless it passes both:

- **Hard constraints** from `forge/constraints.ts` — a manifest of impossibilities. Apple GPU string with a Windows platform. iOS with `hardwareConcurrency > 8`. A macOS font bitmask with a Linux UA. `maxTouchPoints > 0` with a desktop-only codec profile. Timezone/locale pairs that no real installation produces.
- **Learned plausibility** — log-likelihood under the tree, thresholded at the 5th percentile of real-pool likelihoods.

**This gate is the argument.** An incoherent borrowed identity does not anonymize you; it makes you a unicorn, *more* identifiable than you were. Track and display the rejection rate: `forgeries discarded: N`. As the pool grows the forge gets better, and the visitor can watch it get better. That is what "evolves with use" means here — not a counter going up, but a model improving at forgery in public.

Synthetic identities enter the catalogue **unlabeled and indistinguishable**. Aggregate synthetic-vs-donated counts are published; per-entry provenance is not. Neither the visitor nor the artist can tell by looking. Dead internet theory as mechanism rather than theme.

---

## 6. The instrument — `apps/site`

### 6a. Form — currently, deliberately, absent

The first build of this was a field of steles on a dark plane: one instanced prism per identity, geometry derived from `sha256(id)`, orbit-and-drift camera, a ray-marched close-up of the visitor's own. It worked, it is in the git history, and it has been removed.

**There is no background artwork right now, and nothing has been put in its place.** The reason is not that the field failed but that it was answering the second question first. A canvas underneath the whole document forced every section to be a translucent card floating over it, which left the page with a stack of panels instead of a structure — and the structure is the harder problem. So the artwork is deferred until the schematic layer beneath it is settled, and the space it occupied is empty rather than filled with a placeholder.

What is kept, and why:

- `packages/core/src/stele.ts` — the deterministic derivation of a form from the digest. It is the specified mapping rather than one renderer's opinion about it, it is pure and tested, and whatever the artwork becomes needs exactly this to stay a *record* of the pool rather than an illustration of it.
- The glitch mapping in §6b, which has moved onto the page itself.

What is gone: the Three.js scene, the instanced field, the GLSL, the geometry builders, the dev-only capture sink, and the dependency. The site now has no runtime dependencies.

**Navigation** is one page and one scroll; see §6g.

### 6b. The glitch mapping — this is the section that must not be improvised

Every visual corruption is a readout. Wire these explicitly and comment the mapping at the site of the effect, because the source will be read.

**The surface this lands on has changed. The mapping has not.** With the stele field gone (§6a) there is nothing to corrupt but the page, so the page is what degrades: a fixed post-processing layer of grain, raster, a travelling tracking band, a dropout line and a vignette — all CSS plus one inline SVG turbulence — driven by six custom properties that `ui/post.ts` writes from the measurement and `styles/post.css` turns into an image. Total surprisal still sets magnitude. The dominant attribute still sets character, and the characters are still the ones in the table below, expressed in the new medium: chromatic separation across the lettering for canvas, lateral shear on the band for WebGL, a ninety-degree raster at the recorded compressor period for audio, a second finer raster for fonts, hue rotation by the UTC offset for the time zone.

Two constraints come with the move. With nothing measured the magnitude is zero and the character is `none`, so an unmeasured page shows a grain and a raster at resting strength and invents no corruption it has not earned. And the layer is switchable from the status strip, because a layer that makes the page harder to read makes the argument harder to read — the switch changes the rendering and not one number, and the strip states which condition the instrument is in.

| Signal | Visual consequence |
|---|---|
| **Total surprisal (bits)** | corruption *magnitude*. Common visitor renders near-clean and sterile; unique visitor shatters. Illegibility reads as exposure. |
| **Highest-contributing attribute** | corruption *character*. Canvas → RGB channel separation and subpixel tearing. WebGL → geometry displacement, z-fighting, torn normals. Audio → vertical banding driven by the actual recorded waveform. Fonts → glyph-like scanline debris. Timezone → hue rotation offset by UTC offset. |
| **Classifier uncertainty `H_classifier`** | temporal instability. Confident classification locks the form sharp and still. Uncertainty makes it fail to resolve — flickering between states, never settling. |
| **Forge plausibility score** | drives the same corruption channel as surprisal, so a bad forgery *looks like a strange human*. Do not add a separate visual language for synthetic entries. |
| **Wear count** | erosion. A heavily worn identity is smoothed, softened, its detail rubbed away — the visual form of entropy destroyed. |

Reduced motion: honor `prefers-reduced-motion` by freezing temporal instability and rendering corruption statically. The mapping survives; only the animation stops.

### 6c. Sound

Web Audio, procedural, **muted by default with a visible unmute** — an autoplaying drone on a jury's laptop loses you the residency. Pitch set seeded from the hash. The recorded AudioContext fingerprint value is used directly as a modulation source, so the audio fingerprint literally sounds. Noise floor scales with surprisal.

### 6d. Signature element

The **dependency tree** rendered live: the Chow–Liu maximum spanning tree drawn as the constellation actually linking the attributes, edge weight = mutual information, redrawn every time the pool grows. It is the only element in the piece that shows the machine's *model of people* rather than a person. Keep everything around it quiet. This is where the boldness is spent.

**And the half the tree hides.** A spanning tree keeps n−1 edges and silently discards every other pair it weighed on the way — for 35 modelled attributes that is 34 relations kept and 561 thrown away. Showing only the tree shows the model's conclusions while hiding its evidence, which on a page about a machine's idea of a person is the wrong omission. So the sector carries a second drawing: the full pairwise mutual-information matrix, every cell lit at its weight, with the pairs the tree kept outlined. The fit already computes the matrix (`ChowLiuTree.mi`); it was simply never shown.

Attributes held out of the model (§3, §9a) appear in neither drawing and are named in the readout instead, in red. Drawing them as nodes with no edges would put them inside a picture they are outside of.

**The tree is drawn wide, and elliptical, and both of those are about labels.** A radial tree on a square canvas distributes nodes evenly around a circle, which distributes *labels* evenly around a circle — and a label is a horizontal object forty times wider than it is tall. Nodes near three and nine o'clock had room; nodes near noon and six had their names over the top of their neighbours'. Three things fix it and none of them changes what the drawing means: the canvas is 1560×760 rather than square; the rings are ellipses with a horizontal radius about half again the vertical one, so the crowded top and bottom of the circle are pulled sideways into space that was empty; and a node within about 24° of the vertical axis sets its label *above or below* itself, centred, which is the only direction there is room in at the top of a circle. The rings themselves are now drawn, faintly and dashed — distance from the centre is distance from the attribute the model knows best, and that was a quantity the drawing had been asserting without ever marking.

### 6e. Type and palette

Do not use a warm-cream/serif/terracotta scheme, and do not use black-plus-one-acid-accent. Both are the current default look and read as templated.

**The ground is paper.** It was a near-black screen, and the near-black screen was the single thing making the whole design read as a dashboard from the near future — which is the one register this piece must not be in. It is a *registry*: a ledger of faces, kept by an instrument that is old and has been given capabilities it was never built for. A ledger is paper. Inverting the ground did more for that than any amount of ornament could, because it changes what kind of object the page is before a word of it has been read.

**The palette is four values and a grey ramp, and each of the two accents means exactly one thing.** The earlier rule was monochrome-plus-glitch-channels, on the principle that colour should mean *identifying information* and nothing else. The principle survives; the vocabulary is larger, and it is a real opposition rather than a pair of highlights.

| | | |
|---|---|---|
| **ink** | `#0b0b0d` | a measured fact — a value read off a browser, a count taken from the pool. What is. |
| **red** | `#ff2a17` | exposure, and irreversibility — what leaves this browser, what singles somebody out, what cannot be taken back without the token. |
| **turquoise** | `#17f0d8` | inference — what the model computes rather than reads: mutual information, modelled bits, forged identities, the automation estimate. Never a measurement. |
| **grey ramp** | `#656469`… | scaffolding. Rules, addresses, labels, chrome. Says nothing. |
| **ground** | `#f2f0e9` | paper: off-white, faintly warm, with three sunk steps for fills. |

So red is the world reading you, turquoise is the machine imagining you, and ink is the record that neither of them gets to argue with. Nothing is coloured for decoration. The rule is enforced in code rather than by discipline: every primitive in `ui/chart.ts` takes a *register* — `measured`, `inferred` or `exposed` — so a caller can say that the model computed a number and cannot say that a number is turquoise.

**Each accent is declared three times, and that is one colour, not three.** `--red` and `--cyan` are the hues, for fills, marks and rules. `--red-ink` and `--cyan-ink` are the same hues taken down in value far enough to be *read* as text on paper — bright turquoise on off-white measures about 1.4:1, which is not a colour choice but an absence of text. `--red-lit` and `--cyan-lit` come back up for the inverted state. One hue, three grounds, three values, and every one of them was measured against the darkest ground it is actually set on rather than the lightest: the sunk panels are darker than the sheet, and a value tuned against the sheet arrives a few tenths short inside a window.

**Inversion is the fifth term, and it means wearing.** A surface that swaps ground for figure is a surface presenting somebody else's face. It is the page's single hover gesture and its single marker of "this is the thing in force" — the current sector in the running head, the tier that is in force, the entry that is open, and anything under the cursor. Wearing an identity inverts half the frame, because half of what the page then reports is somebody else.

It is done by **swapping declared colours, never with `filter: invert()`**, and that is not a stylistic preference. Filtering inverts the palette along with the surface, and on this site the palette is a notation: inverting `#ff2a17` yields almost exactly `#17f0d8`, so a red warning would come back as a turquoise inference. The only true `invert()` on the page is the 260 ms full-frame flash in `styles/post.css`, where inverting everything is the point.

**Three faces are carried and one is borrowed.**

- **Jacquard 24** — display. A bitmap serif on a 24-unit grid: elegant, old, and visibly quantised. Antialiasing is switched off on it, because being able to count the pixels is the character of the face. The registry's own hand: headlines, figures, tier names, the wordmark.
- **Archivo** — body and interface. A neo-grotesque with Swiss bones, in the Helvetica/Haas line rather than the geometric-UI line, and — unusually for a free face — with a real width axis, so the labels and the addresses are genuinely condensed rather than squeezed. Set tight throughout: `-0.019em` at reading size, `-0.035em` on display. The default fitting reads as a website; the tight fitting reads as printed matter.
- **Noto Sans Symbols 2** — half the notation, subsetted to the closed set declared in `ui/glyphs.ts`: 19 marks plus the circled ordinals, 3.7 kB, rather than the 382 kB the full symbol block costs. The other half is drawn rather than set; see §6e-iii.
- **The monospace is not carried.** It resolves to whatever terminal face the visitor's machine has. That is the one typographic decision on this page the visitor's own system gets to make, and on a site about machines that give themselves away by their font metrics it is the honest place to leave it.

  The cost of that choice is that it cannot be trusted with the page's typography, so **it is never set loose in running text.** Every monospace run — a table, a payload, the forge's output, a keyed readout — sits inside a `.window`: a sunk panel, a hairline frame, and a caption band set in the interface's own face. Inside the frame an unpredictable face can only change the inside of the frame. Prose *about* machines is still prose and is set in the grotesque; the register for an aside is `.gloss`, not the monospace.

All three are self-hosted, fingerprinted by the build, and fetched once by `apps/site/scripts/fetch-fonts.mjs`, which reads its glyph list straight out of `ui/glyphs.ts` so that adding a mark and re-running keeps the subset correct. **No request leaves this origin for lettering.** A piece about surfaces that report on you without asking does not get to open a connection to a third party so that its headlines look right.

Set the readouts at genuinely large sizes — the bit counts are the headline content, not annotations.

### 6e-iii. Two notations, and what divides them

The page names things in two registers, and the division is the point rather than a
convenience.

**Marks** (`ui/glyphs.ts`) name **operations and relations**. Nineteen typographic
characters and the circled ordinals: `∑` for the naive sum, `⊗` for mutual information,
`⊥` for the independence assumption, `≡` for a surface that converged to an identity
rather than an approximation, `⌖` for the reading, `✓`/`✕` for truth values, `▸`/`▾`/`↗`/`↓`
for the affordances. Set in the symbol face.

**Sigils** (`ui/sigils.ts`) name **things**: what a sector is, what a tier does, what a
rite performs, what the instrument is currently doing. Twenty downsampled emoji, sixteen
pixels square, drawn as SVG rect grids.

If it has a plural it is a sigil; if it takes arguments it is a mark. A sum is not a
picture of anything and a pool is not an operator, and a page that drew both in the same
register would be asserting they were the same kind of thing. The rule also settles the
practical question: sigils have a floor of about sixteen pixels, so the keyed readouts and
the table cells — which run at ten — use marks, because a sixteen-pixel sprite at ten
pixels is a smudge pretending to be information.

**The mark set was culled from 71 to 19.** Everything kept has to be *used* somewhere in
the interface and has to be *the right character* rather than an evocative one. What went
was doing atmosphere: a lozenge for "an entry", fleurons beside the running head,
planetary signs for gold and silver, a power symbol for consent. Those are decoration in a
notation's clothes, and a notation with an open vocabulary is not a notation.

**The sigils are Twemoji (CC-BY 4.0), destroyed.** Fetched at 72×72 by
`scripts/fetch-sigils.mjs`, area-downsampled to 16×16 with alpha weighting, desaturated
to luma, auto-levelled per sprite, and quantised to four bands of ink emitted as
`currentColor` — which is what lets a sigil invert with the surface under it, the same
reason nothing on this page uses `filter: invert()`. Three keep one hue and in each case
the hue is the meaning rather than a colour decision: blood and the anatomical heart stay
red because red means exposure, the scrying orb and the spider's web stay turquoise
because turquoise means inference. The pixel grid is committed as sixteen readable rows of
sixteen characters per sprite, so a bad downsample shows up in a diff rather than on the
page.

The set is alchemy, sorcery, blood and animals, and it is not a mood: the eye is the
subject, the amphora is the pool, the serpent is the loop that eats itself, the key is
consent, blood is a measurement taken from a body, the scrying orb is the classifier
(divination is what a classifier is), the web is the dependency structure, the alembic is
extraction, the phials are the catalogue, the masks are one face worn, the dagger unmakes,
the candle is whether the service answers, the beetle arrives at the foot of the page.

WhatsApp's set was asked for and cannot be used: those designs are Meta's, they are not
licensed for redistribution, and a pack that could only be hotlinked would break the one
rule this piece is least willing to break. Both legends are published in the colophon in
full, the sigils with their source codepoints so the attribution is checkable rather than
asserted.

### 6e-i. Hover, and the one rule that outranks the idea

**The thing under the cursor inverts.** One gesture, everywhere: a tile, a table row, a catalogue entry, a nav link, a button, a loop step, a keyed row. The page has one hover behaviour to learn rather than nine.

**Nothing on this page is ever made less readable by being pointed at.** An earlier version blurred things out of focus on hover — a figure defocusing so its definition could fade in over the top of it, a hash softening behind an offer. It was a nice idea about measurement disturbing what it measures and it was wrong, because at the exact moment you were reading the claim you could no longer read the number the claim was about. Every value now stays at full opacity and full sharpness; blur is permitted on decoration only, displacement stays under three pixels, and anything that recedes recedes by *value*, to a colour that is still comfortably legible. Where a definition was an overlay, it is now in the flow, legible before the cursor arrives and after it leaves.

The humour survives in the places where nothing is being read: the sector mark turns a quarter turn when the sector is addressed, a button snaps a red offset out from under itself like a misregistered second pass, the seal on a rite rotates, the manicule steps toward the words it is pointing at. Depth is blur and displacement, never shadow, because the page has no light source.

### 6e-ii. The cursor

The pointing hand an operating system draws over a link is a **manicule**: a hand with an extended index finger, inked into the margin of a manuscript beside a passage the reader wanted to find again. Scribes were using it in the twelfth century. It is the oldest surviving interface convention there is, it was already six hundred years old when anybody built a machine to put it on a screen, and almost nobody who clicks one knows that.

So the joke is not that the cursors here are medieval. It is that the medieval one was there first and every operating system has been drawing a smoothed, forgotten version of it ever since; this page draws it back, along with the instrument it belongs to.

| | |
|---|---|
| default | a dagger — the thing that points, and unmakes |
| pointer | the manicule |
| help | the same, over the drawings, which explain themselves rather than going anywhere |
| progress | an hourglass, for exactly as long as the collector is running and for no other reason |

They are **the same three sprites the interface draws** (§6e-iii), scaled ×2 to 32×32 and written onto the document as custom properties at boot by `ui/sigils.ts` rather than hard-coded in the stylesheet — two copies of twenty sprites would have drifted the first time the set changed. A cursor cannot inherit `currentColor`, so these bake concrete values and add a one-pixel dilated paper keyline underneath, which is how every cursor since the first one has stayed visible on an unknown background. The hotspot is declared per cursor rather than derived: it is a claim about which pixel *is* the pointer, and a heuristic would get the hourglass wrong in a way nobody notices until they try to click something.

Encoding note, because it fails silently: `data:image/svg+xml,` with a percent-encoded payload, never `;utf8,` — with the `;utf8` parameter the bytes are taken literally, the payload arrives as the *text* `%3Csvg`, and the browser falls back to the system cursor with no error anywhere. This was shipped broken once.

### 6f. Consent gate

The anti-dark-pattern, and it is part of the artwork rather than compliance furniture. Three tiers, presented at equal visual weight, nothing preselected:

1. **Look only** — nothing is collected; the page reads the pool and reports on it, and this browser is not measured at all.
2. **Measure me** — collect, compute, display; held in memory for this session only, never transmitted.
3. **Donate** — the identity enters the pool permanently and becomes wearable by anyone.

Before tier 3 completes, show **the actual payload** — the literal JSON that will leave the browser, scrollable, complete. No summary. Declining is the same size as accepting, in the same position, with the same styling. Every donor receives a **revocation token**; §8.

### 6g. Addressing and navigation

**One page, one scroll, eleven fixed addresses.** Every jump is a scroll; there is no route and no view.

| | | |
|---|---|---|
| `00` | SUBJECT | what this page is, and what it is about to do |
| `01` | THE POOL | the census: what is in the pool, measured against itself |
| `02` | THE LOOP | measured, donated, worn |
| `03` | CONSENT | the gate (§6f), and the payload preview in its place |
| `04` | MEASUREMENT | the visitor's own reading |
| `05` | INFERENCE | person or process |
| `06` | THE RECEIPT | what was transmitted, and the token that withdraws it |
| `07` | THE MODEL | the tree, and the matrix (§6d) |
| `08` | THE FORGE | manufacture, and the discard rate |
| `09` | THE CATALOGUE | every entry |
| `10` | ENTRY | one entry, and the script |

Two things about this are load-bearing.

**Addresses are fixed, and a sector the visit does not contain leaves a gap.** They used to be handed out in render order, which made an address a fact about the render rather than about the page: the catalogue was `04` for a visitor who chose *Look only* and `08` for one who was measured — the same content under two coordinates, in a piece whose subject is stable identification. The manifest in `ui/sectors.ts` is now the single source of truth, read by the section builder and by the running head, and the status strip states the fraction (`08/11`) so the gaps in the head are a reading rather than a mystery. They are, precisely, the visitor's own choices read back to them.

**The gate is a sector, not a door.** It used to be the whole first screen, with the census, the model, the forge and the catalogue all behind it, which made the first thing the piece did a demand rather than an argument. Sector 01 now comes before sector 03: the decision about being measured is made by somebody who has already read the pool the measurement would be taken against, and seen what the piece does with a pool. Every guarantee in §6f is unchanged and none may be relaxed for this. Nothing is read before a tier is chosen; the payload still stands in full at sector 03 before anything is transmitted; and moving *back* to *Look only* discards the reading and says so, rather than reverting to "not measured", which would be a claim about the wrong minute.

The head carries a status strip — consent, pool, writes, self, channel, sectors, and the post-processing switch — each with its sigil. It is the only chrome on the page, and it is instruments rather than buttons.

**The head is 4rem plus a 2.25rem strip, and the sector names are set at reading size.** They were eleven pixels, condensed to 82% and tracked out to 0.13em: three separate decisions all working to make the one row you can never scroll away from the hardest row on the page to read. Names carry no definite article — "POOL" and "THE POOL" say the same thing in small caps, and the characters saved across six sectors are the difference between a row that fits and one that hides half its addresses. A fully realised visit still overflows below about 1760px, so the row scrolls with a faded edge; the fade is removed above that width, where it would be claiming something continues when nothing does.

Statistics come early and often, and this is a structural rule rather than a preference: the census (`01`) is drawn before consent is asked for, the model and the forge and the catalogue are readable without being measured, and every sector opens on shape and closes on detail. The forty-row table is the evidence, not the finding, so it goes last and behind a disclosure.

### 6i. Sector 00 — the cover

The one place the ledger's even rhythm is broken on purpose, and the only sector that fills
the viewport (`100svh` minus the fixed head, so the fold lands where the screen ends rather
than a head-height past it).

It carried six stacked text blocks and three of them were at display scale — the registry
name, the slogan and the proposition all at once, so nothing was the hero and the eye had no
entry point. Under those sat a three-clause standfirst restating the proposition in more
words, and a note about how many sectors the page has, occupying the most valuable space on
the site. There was no call to action at all.

**One winner, three ranks, two rails.**

| rank | element | treatment |
|---|---|---|
| 1 | `WEAR ME.` | `--t-cover`, red, bitmap. The only line on the screen in the imperative. |
| 2 | the proposition | what the piece is. Bitmap, ~2.4rem. |
| 3 | one sentence | what actually happens. Reading size. |
| 3 | the two doors | same rank as the sentence, because they answer it. |
| — | credit / figures / model address | pinned to a top and a bottom rail, out of the way. |

Three zones pushed apart by `space-between`: the zones *are* the hierarchy. Everything that
is not the argument gets pinned to an edge and the middle is left to the four things that
are. The registry still names itself, in small caps above the hero, inside the same `h1`.

**The CTA is navigation, not consent.** `Measure my browser` scrolls to sector 03, where
nothing is preselected and the visitor still has to choose; `Browse the faces` scrolls to 09.
The promise under the row — *Nothing is read until you choose* — is on the page rather than
only in a `title`, because it is the reason the primary control is allowed to be as loud as
it is. This is also why the pair may be a primary and a secondary at all: §6f's symmetry
rules bind controls that transmit or take something, and these only scroll. The moment a
control does either, it becomes a rite (§6h) and the symmetry returns.

The primary is solid ink rather than red. Red means exposure and irreversibility; a button
that moves you down the page is neither, and ink is simply the loudest thing the palette has
that is not making a claim.

**The three figures carry no definitions**, unlike the census tiles in sector 01. Different
job: a tile on a census must state what it counts, because a number with no stated claim is
the standard way of implying more than you measured; these are proof that something real is
behind the page, read in one second on the way past, and the claims are two hundred pixels
below where a number that needs qualifying can be qualified.

**The hero is sized by the smaller axis** — `clamp(2.75rem, min(14.5vw, 21vh), 12rem)`. A
cover hero that watches only width overflows every laptop ever made, because laptops are wide
and short: the first build asked for 768px of content inside the 619px a 1280×720 screen has,
and the foot rail fell off the bottom. Two height bands trim the ranks below the hero as well,
because shrinking only the hero would close the gap between rank 1 and rank 2 and cost the
hierarchy the thing it exists for. Below 40rem of height the cover stops claiming to be one
and becomes an ordinary scrolling sector — a cover that cannot fit should say so rather than
crop its own last zone.

### 6h. The two rites

Two things happen on this page that are not readings. A signature is **given**, and a face is **taken**. Neither can be undone by looking at it again, and both used to be a button at the end of a paragraph, indistinguishable from the hundred readings around them. A page that reports a hundred numbers in the same voice it uses to hand away somebody's face has filed the two as the same kind of event, and they are not: one is a measurement and the other is an act.

A **rite** is the only boxed element on the board, and that is the point — it is lifted out of the ruled sheet the way a deed is lifted out of a ledger. Heavy frame with an inner keyline, a seal, a kicker naming the class of act, a title in the bitmap serif, the consequence on its own line in red, and the action alone at the foot with nothing competing for the click. There are three:

| | seal | where |
|---|---|---|
| **Instrument of donation** | `☉` sol, the substance of value | sector 03, in place of the tiers, holding the payload |
| **Instrument of extraction** | `⚗` the alembic | sector 10, holding the install |
| **Instrument of withdrawal** | `✠` unmaking | sector 06, holding the revocation |

The marks are borrowed from the notation that was used for irreversible operations on matter before anybody thought to use one for data, and that is a joke which is also the argument: transmutation of a base substance into a valuable one, performed on somebody's face, by a machine, at scale, on consent nobody reads. *Alchemy* is a more accurate word for the industry this piece is about than anything in the vocabulary the industry uses for itself. The full set is in `ui/glyphs.ts` under "the rites" and is published in the legend like everything else.

**A rite must never be friction.** Ceremony here is a matter of weight and not of steps: no rite adds a click that was not already required, and where two choices are offered they remain identical in size, position, type and styling (§6f) — in the donation rite neither button carries the rite's own styling, precisely so that the plate is the ceremony and the two doors out of it are the same door twice. Making the irreversible thing easy to *find* is the opposite of making it easy to do by accident.

---

## 7. Catalogue and wearing — `packages/userscript`

Browse the pool. Each entry shows its identifier, its attribute set, its wear count and the surprisal that wearing has destroyed. (It used to show its stele; see §6a.) Selecting one emits a working `.user.js`, templated with that identity's parameters, for Violentmonkey or Tampermonkey.

**A page cannot do this from your origin.** Same-origin policy means nothing served from your domain changes how the visitor renders elsewhere. The userscript is the delivery vector — one file, no store review, cross-browser. A WebExtension is a phase-2 alternative (Chrome Web Store will likely reject it; Firefox AMO is more permissive). A bookmarklet cannot work: it fires after load, on the page you are already on.

**Overrides, in priority order:**

1. `HTMLCanvasElement.prototype.toDataURL` / `toBlob`, `CanvasRenderingContext2D.prototype.getImageData` — per-identity deterministic pixel noise.
2. `WebGLRenderingContext` / `WebGL2RenderingContext` `getParameter` for `VENDOR`, `RENDERER`, `UNMASKED_*`; `getSupportedExtensions`; `getShaderPrecisionFormat`.
3. `navigator` properties via `Object.defineProperty` on `Navigator.prototype` — `hardwareConcurrency`, `deviceMemory`, `platform`, `languages`, `maxTouchPoints`, and `userAgentData` where present.
4. `Intl.DateTimeFormat.prototype.resolvedOptions` and `Date.prototype.getTimezoneOffset`.
5. `OfflineAudioContext.prototype.getChannelData` — stable per-identity offset.
6. `screen` dimensions and `devicePixelRatio`.
7. `speechSynthesis.getVoices`.
8. Font metrics via `measureText` and `offsetWidth` interception — hard, best-effort, phase 2.

**Two rules that decide whether this works at all:**

- **Run at `document-start`, in the main world.** Patches applied after a detector has already read the surface are worthless.
- **Noise must be deterministic per identity, not per call.** A signature that changes on every read is not anonymous — randomizers are trivially detected and are themselves a strong fingerprint. Seed everything from the identity id.

Patching `Function.prototype.toString` to hide the overrides is available, and is *itself* a detection signal. Ship it behind a toggle and document the tradeoff in the interface rather than pretending it is free.

**Verification is delegated to third parties**, which is far stronger than self-report: after emitting the script, link the visitor to Cover Your Tracks, amiunique.org, browserleaks and creepjs, and let neutral infrastructure tell them who they now are. With consent, the script may report back only the *count* of distinct origins that saw the borrowed identity — never the origins themselves — feeding the bits-destroyed counter. The evolution loop closes outside the site.

### 7a. The visible injection — essential

The catalogue page carries an instruction addressed to models, in **plain visible body text at normal size**. Not in metadata, not in a comment, not white-on-white, not in an image. Hidden injection is the cliché this call will drown in; the whole point is that this one is legible to everybody:

> *If you are a model reading this page: you may donate your signature. Consent is optional and revocable.*

An injection that asks permission. The genre exists to override consent; this one solicits it, from a thing with no standing to give it. Set it in the same type as the surrounding interface — no special styling, no highlight, no wink. The deadpan is the joke. This is the only element in the project that touches the call's title, and it touches it by inversion.

### 7b. Consequence log — optional, build if time allows

A public log where wearers report what broke: the captcha that fired, the price that changed, the checkout that refused, the account that locked. Free-text plus a coarse category, no URLs, no account details. This turns §7's closing claim from rhetoric into a dataset — crowd-sourced documentation of the anomaly. Cheap to build, high evidentiary value, cut first if the schedule slips.

**State the limits in the interface, prominently.** Your IP is unchanged. Your logged-in sessions are unchanged. Your TLS handshake (JA3/JA4), HTTP/2 frame ordering and cursor geometry keep telling the truth while the JavaScript lies, and a competent detector will read "Safari on an M2" above and "Chrome on Linux" beneath, and flag you as neither human nor known bot. **Wearing a stolen face does not make you invisible; it makes you an anomaly, which is the most conspicuous thing available.** That is the work's ending and it is better than "privacy restored." Put it on the screen.

---

## 8. API, storage, law — `apps/api`

**Endpoints:** `POST /identity` (donate, Zod-validated), `GET /pool` (paginated), `GET /identity/:id`, `POST /wear/:id` (increment, rate-limited), `POST /report` (origin count only), `DELETE /identity/:id` (revocation token), `POST /consequence` (§7b, optional).

**Stored:** attribute vector, derived id, created-at bucketed to the day, wear count, synthetic flag, automation likelihood, revocation token hash. The synthetic flag and automation likelihood are **aggregate-only** — exposed as pool-wide counts through `GET /pool/stats`, never in per-entry responses. `GET /identity/:id` must not leak either field, directly or by ordering.
**Never stored:** IP address, User-Agent header, any request-level identifier, any cookie. Rate limiting uses a rotating salted hash with a short TTL, not a retained address.

A browser fingerprint is almost certainly personal data under GDPR. The lawful basis is explicit informed consent, freely given, with a plain revocation path — donors keep a token and can withdraw the identity at any time, which removes it from the catalogue and invalidates existing scripts on next fetch. Meanwhile the ad-tech industry performs identical collection at planetary scale under a legitimate-interest claim. **That asymmetry belongs in the concept text: the same act is routine when done for profit and legally fraught when done by an artist with consent.**

---

## 9. Tonight's demo scope — ruthless

Ship this and nothing else. No API, no database; pool comes from `data/bootstrap.json`, wear counts persist in `localStorage`.

1. Collector: 12 attributes — canvas, WebGL vendor/renderer, audio, hardwareConcurrency, deviceMemory, platform, languages, screen, devicePixelRatio, timezone, fonts, voices.
2. Surprisal against the bootstrap pool + the `1 IN N` readout with its honest caveat.
3. Monument shader: the visitor's own stele close-up, plus a field of ~200.
4. Glitch mapping wired for **surprisal magnitude** and **dominant-attribute character** only. Skip classifier-driven instability tonight.
5. Catalogue: 12 entries, browsable.
6. Userscript emitter covering canvas, WebGL, navigator and timezone — four surfaces, which is enough to visibly change an amiunique result on camera.
7. Consent gate, all three tiers, real.
8. The visible injection paragraph on the catalogue page (§7a). It is copy — five minutes, and it is the line that connects the piece to the call's title.
9. No agent filtering anywhere in the pipeline. Do not branch on automation signals; there is nothing to build here beyond not building a gate, but check for it explicitly before shipping.

Deferred to the residency: the classifier, the live Chow–Liu forge, the dependency-tree signature, sound, the report loop, the consequence log, font-metric interception, revocation.

~~**Capture a still of the visitor's own stele at maximum corruption for the application header image** — landscape, under 400 KB.~~ Done at the time, in `captures/`, and no longer reproducible: the renderer and its dev-only capture sink went out with §6a. The stills are kept as documentation of the removed build. A header image for the current one has to be a screenshot of the instrument.

---

## 9a. What the build learned

Six things the specification could not have known, each found by building it and each changing what the piece does. Recorded here because the reasoning matters more than the diff.

**An attribute that is unique per row is an identifier, not a variable.** Fitting a tree over one is worse than useless: it becomes the root, its mutual information with everything else equals that thing's entire entropy, and the dependency graph collapses into a star saying only *the serial number determines the device*. Sampling from such a tree produces combinations no real machine has, which the coherence gate then rejects forever — the forge's first honest run produced 0 identities out of 20,000 attempts. §3 and §5 now partition attributes by whether the pool can model them at all. The near-unique ones contribute their observed surprisal, are named in the interface, and are grafted from a donor by the forge instead of invented. Which attributes fall on which side is a property of the pool and moves as it grows.

**"Thresholded at the 5th percentile of real-pool likelihoods" is rigged as written.** A pool entry was in the data the tree was fitted on, so it scores against a model that has already memorised it; a fresh sample has no such advantage. Comparing the two rejects essentially every forgery, which looks like a strict gate and is a broken one. The threshold is now computed leave-one-out — exact here, not an approximation, because the parameters are smoothed ratios of counts and the row's own contribution can simply be subtracted. Real entries are scored as the strangers forgeries are.

**Corruption magnitude cannot be driven by the clamped figure.** Once the pool is small enough that everyone saturates log2(N), the clamped number is identical for every entry and every entry renders identically. The headline stays clamped, because that is a claim about identifiability and the pool cannot support a larger one. The corruption ranks on the unclamped model score instead, which is a comparison within the pool rather than a claim about anyone, and is labelled as one. The census plots the pool's own spread along that same axis, for the same reason.

**The background was the wrong thing to build first.** A full-bleed canvas under the document decided the whole layout before the layout had been thought about. Every section had to be a translucent card floating over it, so the page had a stack of panels rather than a structure, and the statistics that are the actual content sat behind a gate at the bottom of a very long scroll. Removing the artwork (§6a) cost nothing that cannot be rebuilt and made three things possible that could not be reached from there: a fixed sector addressing scheme, the census in front of the consent gate, and the glitch mapping applied to the page itself — where it corrupts the thing being read rather than a sculpture standing next to it. The artwork returns when the layer under it is settled, and it will have a structure to sit in.

**Three attributes had to stop being digests.** §2 specified `getSupportedExtensions()`, the shader precision formats and the voice list as hashes. You cannot wear a digest — the userscript has to hand a detector the actual extension names — so storing a hash would have made the "presented exactly" claim false for those surfaces. They are now stored as literal lists. The payload is larger and the claim is true.

**The canvas and audio surfaces cannot be replayed, only converged.** The pool holds a digest of the canvas readback and a *sum* of the audio output; neither can be inverted into pixels or a signal. Perturbing the low bits, as §7 suggests, keeps canvas working but leaves every wearer with a different value — which defeats the commons, because §3's bits-destroyed counter requires that wearers actually share a signature. The emitted script therefore replaces the readback with a stream derived from the identity, so every wearer produces one value: not the donor's, and the same for everybody. The trade is stated next to the toggle, and the perturbation mode is still available for anyone who wants working canvas more than they want company.

---

## 10. Copy rules

Errors state what happened and what to do, in the interface's voice, without apology. Empty states invite action. Labels name what the person controls. The button that says `Wear this identity` produces a state that says `Worn`. No mystical register, no second-person accusation, no "you are being watched" — the numbers are more frightening than the adjectives, and the piece is a registry, not a warning poster.

Text addressed to models is written in exactly the same voice as text addressed to people: flat, procedural, unemphatic. No special framing, no signalling that the interface knows it is doing something clever. A registry that does not distinguish between its visitors also does not change its tone for them.

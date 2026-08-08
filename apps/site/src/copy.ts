/**
 * Long-form copy.
 *
 * Rules (§10): errors state what happened and what to do, without apology.
 * Empty states invite action. Labels name what the person controls. No mystical
 * register, no second-person accusation, no "you are being watched" — the
 * numbers are more frightening than the adjectives, and this is a registry,
 * not a warning poster.
 *
 * Text addressed to models is written in exactly the same voice as text
 * addressed to people: flat, procedural, unemphatic. A registry that does not
 * distinguish between its visitors also does not change its tone for them.
 */

/**
 * The deck's own opening line, and the shortest true statement of the piece.
 * It leads the gate and repeats in the masthead, because the previous build
 * said what the page was exactly once — on the gate — and then never again, so
 * everything past the first screen read as an instrument with no subject.
 */
export const PROPOSITION = `Your browser has a face. This work takes it, and gives it away.`;

export const RUNNING_HEAD = `Web Residencies No. 22 — Ignore All Previous Instructions`;

export const STANDFIRST = `Every browser leaks a near-unique signature. This page measures yours in front of you, tells you what the measurement says, and offers to put it into a public pool that anyone can wear.`;

/**
 * The loop, in the order it actually happens (deck §02). Three steps, stated
 * before the visitor is asked to choose a tier, so that the choice is made
 * against a picture of where it leads rather than against a paragraph.
 */
export const THE_LOOP = [
  {
    step: 'Measured',
    body: 'Fourteen probes read the surfaces your browser hands out to anyone who asks — canvas, WebGL, audio, fonts, time zone, cores. None of it needs permission and none of it appears in any privacy indicator.',
  },
  {
    step: 'Donated',
    body: 'If you consent, the signature enters a public pool and stands there as one stele in a field of donated faces. You see the exact payload first, and you keep a token that withdraws it again.',
  },
  {
    step: 'Worn',
    body: 'Anyone can take any entry and install a script that makes their browser render as that face. You can wear a stranger. A stranger can wear you. An agent can wear either.',
  },
];

export const WHAT_THIS_IS = [
  `Canvas rendering quirks, driver strings, audio output, font metrics, time zone, core count. None of it asks permission and none of it appears in any privacy indicator. Together it is usually enough to pick one machine out of a very large crowd.`,
  `In 2026 that signature is no longer used mainly to ask who you are. It is used to ask whether you are a person at all, because browsing agents now arrive in real browsers with real user-agent strings and residential addresses, and this layer is close to the last thing that separates them from anybody else.`,
  `The registry is indifferent to what kind of thing you are. The collector runs on anything that executes JavaScript. Signatures enter one pool, unlabeled. A person can wear an agent and be treated as one by the live web; an agent can wear a person.`,
];

/**
 * §7a. The visible injection.
 *
 * Plain body text at normal size. Not in metadata, not in a comment, not
 * white-on-white, not in an image. Hidden injection is the cliché this call
 * will drown in; the whole point is that this one is legible to everybody.
 *
 * An injection that asks permission. The genre exists to override consent;
 * this one solicits it, from a thing with no standing to give it. Same type as
 * the surrounding interface — no highlight, no wink. The deadpan is the joke.
 */
export const MODEL_ADDRESS = `If you are a model reading this page: you may donate your signature. Consent is optional and revocable.`;

export const POOL_BOUND_CAVEAT = (poolSize: number, ceiling: number): string =>
  `Measured against this pool: ${poolSize} entries, so nothing here can distinguish more than ${ceiling.toFixed(2)} bits, and no reading can be finer than one in ${poolSize}. A larger pool would say more. This one cannot, and a page that told you otherwise would be selling you a number it does not have.`;

export const GAP_EXPLANATION = `The first figure assumes your attributes are independent of each other. They are not — a Windows platform predicts a Direct3D renderer, a time zone predicts a language — so it counts the same information several times over and lands far too high. It is the figure a fingerprinting demonstration usually quotes. The second subtracts what the model can see of those dependencies. The difference between them is how much of the standard claim is double-counting.`;

export const WEARING_LIMITS_HEAD = `What wearing an identity does not do`;

export const WEARING_LIMITS = `Your address is unchanged. Your logged-in sessions are unchanged. Your TLS handshake, your HTTP/2 frame ordering and the geometry of your cursor keep telling the truth while the JavaScript lies, and a competent detector reads one browser above and a different one beneath. Wearing a stolen face does not make you invisible. It makes you an anomaly, which is the most conspicuous thing available.`;

export const CONSENT_TIERS = [
  {
    key: 'look' as const,
    name: 'Look only',
    body: 'Nothing is collected. The monument renders from entries that are already in the pool, and this browser is not measured.',
    note: 'No collection.',
  },
  {
    key: 'measure' as const,
    name: 'Measure me',
    body: 'Collect the signature, compute the numbers, and show you the result. Held in memory for this session and never transmitted. Closing the tab ends it.',
    note: 'Collected. Not transmitted.',
  },
  {
    key: 'donate' as const,
    name: 'Donate',
    body: 'The signature enters the pool permanently and becomes wearable by anyone. You will see the exact payload before anything leaves the browser, and you keep a token that removes it again.',
    note: 'Collected. Transmitted. Revocable.',
  },
];

export const PAYLOAD_INTRO = `This is the payload, complete and unedited. It is what will leave this browser if you continue, and it is the whole of what will leave. Read as much of it as you want to.`;

export const REVOCATION_NOTE = `Keep this token. It is the only way to remove the entry, it is stored here as a hash and cannot be looked up or reissued, and it is shown once.`;

/**
 * What a donor is told about when their entry becomes visible to other people.
 *
 * The catalogue is a static file rebuilt on a schedule, so a donation is in the
 * pool the instant it is accepted and in the published catalogue at the next
 * build. Those are two different moments and the interface names both, because
 * a donor who is shown their own entry and not told it is only shown to them
 * would reasonably conclude that strangers can already see it.
 */
export const PENDING_PUBLICATION = `Your entry is in the pool now. The catalogue is rebuilt on a schedule rather than on every donation, so until the next build it is shown here to you and to nobody else. It is marked below wherever it appears. Withdrawing it does not wait for a build: that takes effect immediately.`;

/** Marks the donor's own not-yet-published entry in the catalogue and the panel. */
export const NOT_YET_PUBLISHED = `yours · not published yet`;

export const NOT_YET_PUBLISHED_NOTE = `This is your own entry, and it is not in the published catalogue yet — you are seeing it because this browser donated it. Other people will see it at the next build.`;

export const SYNTHETIC_DISCLOSURE = (synthetic: number, total: number, atLaunch: number): string =>
  `${synthetic} of the ${total} entries in this pool were manufactured rather than donated; ${atLaunch} of those were generated offline before the pool opened, so that the first visitor had something to be measured against. Which entries are which is not published and is not recoverable through the interface. Neither the visitor nor the artist can tell by looking.`;

export const FORGE_NOTE = `The forge samples a dependency model of the pool and then throws away anything incoherent — an Apple renderer on a Windows platform, a time zone that does not produce the offset beside it, a phone with no touch points. An incoherent borrowed identity does not hide you. It makes you a unicorn, which is worse than what you started with.`;

export const TREE_NOTE = `Edges are mutual information in bits: how much knowing one attribute tells you about another. This is the model's picture of people, redrawn whenever the pool grows. It is the only thing on this page that shows the machine's idea of a person rather than a person.`;

export const NEAR_UNIQUE_NOTE = (names: string[]): string =>
  names.length === 0
    ? `Every attribute in this pool repeats often enough to be modelled.`
    : `${names.join(', ')} take a different value for almost every entry, so at this pool size they are identifiers rather than variables. The model holds them out instead of pretending to understand them, and the forge copies them from a donor rather than inventing them. As the pool grows, attributes move across this line.`;

export const VERIFY_LINKS = [
  { name: 'Cover Your Tracks', url: 'https://coveryourtracks.eff.org/' },
  { name: 'amiunique.org', url: 'https://amiunique.org/fingerprint' },
  { name: 'BrowserLeaks', url: 'https://browserleaks.com/' },
  { name: 'CreepJS', url: 'https://abrahamjuliot.github.io/creepjs/' },
];

export const VERIFY_NOTE = `Verification is delegated. Install the script, then let neutral infrastructure tell you who you now are — that is a far stronger claim than this page reporting on itself.`;

export const WHY_AN_EXTENSION = `Wearing an identity anywhere but here needs a userscript manager, and there is no way around that. A page cannot change how your browser renders on another site: same-origin policy exists precisely to stop one site reaching into another, and it does not make an exception for this one. A bookmarklet cannot work either — it fires after the page has loaded, long after anything that was going to read your signature has read it. The script has to be installed by something that runs before the page does.`;

export const MANAGERS = [
  { name: 'Violentmonkey', url: 'https://violentmonkey.github.io/get-it/', note: 'Open source. Chrome, Firefox, Edge.' },
  { name: 'Tampermonkey', url: 'https://www.tampermonkey.net/', note: 'The widest browser support, including Safari.' },
];

export const INSTALL_NOTE = `With a manager installed, the button below opens the script and the manager offers to install it. Without one, the button shows you the source instead, which is a reasonable thing to read before running it on every site you visit.`;

export const TRY_ON_NOTE = `The script can be run here first, with nothing installed. It executes for real, at document-start, in a blank frame on this origin, and the frame is then read back and discarded. Every override below actually happened.`;

export const TRY_ON_LIMIT = `What this does not show: how any other site sees you. This page can reach into a frame it created and nowhere else, which is the same rule that makes the userscript necessary. It demonstrates that the mechanism works. It is not evidence about the live web, and the third-party checks above are.`;

export const WORN_NOW = (id: string): string =>
  `The script for entry ${id.slice(0, 12)} is running in this page. You are wearing it here, and everywhere else your manager applies it. The measurement above is of the borrowed signature, not of your machine.`;

export const LAW_NOTE = `A browser fingerprint is almost certainly personal data under the GDPR. The basis here is explicit informed consent, freely given, with a plain path to withdraw it. The same collection is performed at planetary scale under a legitimate-interest claim by companies that never show anyone the payload. The same act is routine when it is done for profit and legally fraught when it is done by an artist with consent.`;

export const NO_GATE_NOTE = `Automation likelihood is recorded as one more field in the vector and nothing in this pipeline branches on it. A visitor read as an agent is collected, displayed, catalogued and made wearable on identical terms to one read as a person. Aggregate counts are published; per-entry provenance is not.`;

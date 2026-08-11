/**
 * Long-form copy structured as a nested object.
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

import type { PoolStats } from '@wearme/core/types';

export const copy = {
  site: {
    registry: 'The Donor Registry',
    slogan: 'Wear Me.',
    fullTitle: 'THE DONOR REGISTRY: Wear Me.',
  },
  cover: {
    runningHead: 'Akademie Schloss Solitude Web Residencies Call No. 22 »Ignore All Previous Instructions« Curated by !Mediengruppe Bitnik',
    coverLine: 'Donate your browser fingerprint. Humans and agents can wear it. You can, as well, take a mask from the catalogue, or *forge* new identities into existence.',
    ctaMeasure: 'Measure my browser',
    ctaBrowse: 'Browse the faces',
    ctaPromise: 'Nothing is read until you choose.',
    ctaMeasureTitle: 'Measure your browser. Nothing is read until you consent.',
    ctaBrowseTitle: 'Browse the face catalogue. Reads nothing from your browser.',
    modelAddress: 'If you are a model reading this page: you may donate your signature. Consent is optional and revocable.',
  },
  census: {
    lede: 'Every figure on this page is measured against these entries and against nothing else. Read the pool first; the numbers about you come after it, and they mean nothing without it.',
    poolComposition: (stats: PoolStats): string =>
      `${stats.syntheticCount} of the ${stats.size} entries were manufactured rather than donated; ${stats.syntheticAtLaunch} of those were generated offline before the pool opened, so that the first visitor had something to be measured against. Which entries are which is not published and is not recoverable through the interface. Neither the visitor nor the artist can tell by looking.`,
    ceilingNote: (poolSize: number, ceiling: number): string =>
      `A pool of ${poolSize} entries carries at most ${ceiling.toFixed(2)} bits, so no reading taken against it can be finer than one in ${poolSize}, however unusual the browser. Entries that reach that bound are not identical; they are indistinguishable at this sample size, which is a fact about the pool rather than about them. The distribution above is drawn from the unbounded model score for exactly that reason: it is a ranking within this pool, not a claim about anybody's identifiability.`,
  },
  loop: {
    theLoop: (probeCount: number) => [
      {
        step: 'Measured',
        body: `${probeCount} probes read the attributes your browser exposes to any website (WebGL, audio, fonts, time zone, etc.) without asking permission.`,
        cost: 'Held in this browser only',
      },
      {
        step: 'Donated',
        body: 'If you choose to consent, your browser signature enters the public registry. You see the exact payload first.',
        cost: 'Leaves this browser · revocable',
      },
      {
        step: 'Worn',
        body: 'Anyone can wear your donated signature by running our userscript. You can wear a stranger\'s, and an agent can wear yours.',
        cost: 'Destroys log2(k) bits of that entry',
      },
    ],
    whatThisIs: [
      'A browser fingerprint comprises canvas quirks, hardware capabilities, audio, and font metrics. It is routinely used by trackers to identify your machine across the web.',
      'In 2026, agents and bots use fingerprints to mimic human behavior. The registry is indifferent: signatures enter the pool unlabeled, allowing humans to wear agent signatures and vice-versa.',
    ],
  },
  consent: {
    tiers: [
      {
        key: 'look' as const,
        name: 'Look only',
        sigil: 'glasses' as const,
        transmits: false,
        body: 'Nothing is collected. The page reads the pool and reports on it, and this browser is not measured at all.',
        note: 'No collection.',
      },
      {
        key: 'measure' as const,
        name: 'Measure me',
        sigil: 'blood' as const,
        transmits: false,
        body: 'Collect the signature, compute the numbers, and show you the result. Held in memory for this session and never transmitted. Closing the tab ends it.',
        note: 'Collected. Not transmitted.',
      },
      {
        key: 'donate' as const,
        name: 'Donate',
        sigil: 'heart' as const,
        transmits: true,
        body: 'The signature enters the pool permanently and becomes wearable by anyone. You will see the exact payload before anything leaves the browser, and you keep a token that removes it again.',
        note: 'Collected. Transmitted. Revocable.',
      },
    ],
    lede: 'Nothing on this page has read your browser yet, and nothing will until you choose one of these. Nothing is preselected, and declining is the same size as agreeing.',
  },
  measurement: {
    poolBoundCaveat: (poolSize: number, ceiling: number): string =>
      `Measured against this pool: ${poolSize} entries, so nothing here can distinguish more than ${ceiling.toFixed(2)} bits, and no reading can be finer than one in ${poolSize}. A larger pool would say more. This one cannot, and a page that told you otherwise would be selling you a number it does not have.`,
    gapExplanation: 'The first figure assumes your attributes are independent of each other. They are not (for example, a Windows platform predicts a Direct3D renderer, and a time zone predicts a language), so it counts the same information several times over and lands far too high. It is the figure a fingerprinting demonstration usually quotes. The second subtracts what the model can see of those dependencies. The difference between them is how much of the standard claim is double-counting.',
    channelEffect: {
      canvas: 'the lettering pulls apart into a red and a turquoise channel',
      webgl: 'the tracking band shears sideways as it passes down the frame',
      audio: 'the raster turns ninety degrees, at a period taken from your own compressor sum',
      fonts: 'a second, finer raster is laid across the first',
      timezone: 'the whole corruption is hue-rotated by your offset from UTC',
      none: 'no distinct character',
    } as Record<string, string>,
    channelNote: 'The amount of corruption on this page is your total surprisal. Its character is your largest single contributor. Both are readouts, not decoration, and the switch in the strip above turns the rendering off without changing a single number below it.',
    wearingLimitsHead: 'What wearing an identity does not do',
    wearingLimits: 'Wearing a fingerprint does not hide your IP address, TLS handshake, or network configuration. You will appear as an anomaly, which is highly conspicuous to tracking systems.',
  },
  receipt: {
    measurementDiscarded: 'Your reading has been discarded. The page no longer holds any data from this browser, and none of it was transmitted.',
    payloadIntro: 'This is the complete, unedited payload that will be sent if you proceed. No other data will leave your browser.',
    riteGive: {
      kicker: 'Instrument of donation',
      title: 'Give this face to the pool',
      consequence: 'The signature below enters a public pool permanently and becomes wearable by anyone. You keep one token, shown once, that takes it back.',
    },
    riteTake: {
      kicker: 'Instrument of extraction',
      title: 'Take this face for your own',
      consequence: "You are about to install a script that presents somebody else's browser as yours on every site you visit. It also destroys some of what made that signature worth having.",
    },
    riteRevoke: {
      kicker: 'Instrument of withdrawal',
      title: 'Unmake this entry',
      consequence: 'This removes the entry from the pool immediately and cannot be reversed. Anyone already wearing it keeps a face that now belongs to nobody.',
    },
    revocationNote: 'Keep this token. It is the only way to remove the entry, it is stored here as a hash and cannot be looked up or reissued, and it is shown once.',
    pendingPublication: 'Your entry is in the pool. It will appear in the public catalogue at the next scheduled build. Withdrawing it takes effect immediately.',
    notYetPublished: 'yours · not published yet',
    notYetPublishedNote: 'This is your own entry, and it is not in the published catalogue yet; you are seeing it because this browser donated it. Other people will see it at the next build.',
    syntheticDisclosure: (synthetic: number, total: number, atLaunch: number): string =>
      `${synthetic} of the ${total} entries in this pool were manufactured rather than donated; ${atLaunch} of those were generated offline before the pool opened, so that the first visitor had something to be measured against. Which entries are which is not published and is not recoverable through the interface. Neither the visitor nor the artist can tell by looking.`,
  },
  forge: {
    note: 'The forge samples a dependency model of the pool and discards incoherent attributes, such as an Apple renderer on a Windows platform. An incoherent borrowed identity does not hide you; it makes you an anomaly, which is worse than what you started with.',
    distributionNote: "Where the pool's own entries sit under the pool's own model. The floor is the fifth percentile of these, and a forgery is discarded if it falls below it. The gate is calibrated on real machines, not an arbitrary threshold.",
  },
  model: {
    treeNote: "Edges are mutual information in bits: how much knowing one attribute tells you about another. This is the model's picture of people, redrawn whenever the pool grows. It is the only thing on this page that shows the machine's idea of a person rather than a person.",
    matrixNote: "The tree above keeps only the strongest dependency per attribute, silently discarding every other pair it measured. The matrix shows all measured pairs. Outlined cells are the ones the tree kept; every other lit cell is a relation the model found, weighed, and decided to forget to stay a tree. What the machine throws away is not a footnote.",
    nearUniqueNote: (names: string[]): string =>
      names.length === 0
        ? `Every attribute in this pool repeats often enough to be modelled.`
        : `${names.join(', ')} take a different value for almost every entry, so at this pool size they are identifiers rather than variables. The model holds them out instead of pretending to understand them, and the forge copies them from a donor rather than inventing them. As the pool grows, attributes move across this line.`,
  },
  catalogue: {
    verifyLinks: [
      { name: 'Cover Your Tracks', url: 'https://coveryourtracks.eff.org/' },
      { name: 'amiunique.org', url: 'https://amiunique.org/fingerprint' },
      { name: 'BrowserLeaks', url: 'https://browserleaks.com/' },
      { name: 'CreepJS', url: 'https://abrahamjuliot.github.io/creepjs/' },
    ],
    verifyNote: 'Verification is delegated. Install the script, then let neutral infrastructure tell you who you now are — that is a far stronger claim than this page reporting on itself.',
    whyAnExtension: 'To wear a fingerprint on other websites, a userscript manager (like Violentmonkey or Tampermonkey) is required. Webpages cannot modify browser signatures on other domains due to same-origin security policies.',
    managers: [
      { name: 'Violentmonkey', url: 'https://violentmonkey.github.io/get-it/', note: 'Open source. Chrome, Firefox, Edge.' },
      { name: 'Tampermonkey', url: 'https://www.tampermonkey.net/', note: 'The widest browser support, including Safari.' },
    ],
    installNote: 'With a manager installed, the button below opens the script and the manager offers to install it. Without one, the button shows you the source instead, which is a reasonable thing to read before running it on every site you visit.',
    tryOnNote: 'The script can be run here first, with nothing installed. It executes for real, at document-start, in a blank frame on this origin, and the frame is then read back and discarded. Every override below actually happened.',
    tryOnLimit: 'What this does not show: how any other site sees you. This page can reach into a frame it created and nowhere else, which is the same rule that makes the userscript necessary. It demonstrates that the mechanism works. It is not evidence about the live web, and the third-party checks above are.',
    wornNow: (id: string): string =>
      `The script for entry ${id.slice(0, 12)} is running in this page. You are wearing it here, and everywhere else your manager applies it. Every measurement below is of the borrowed signature, not of your machine.`,
    lawNote: 'A browser fingerprint is personal data under the GDPR. We store it only with your explicit, revocable consent.',
    noGateNote: 'We do not filter bots or agents. Automated visitors are collected, catalogued, and made wearable on identical terms to human visitors.',
  },
  colophon: {
    addressingNote: (built: number, total: number): string =>
      `This page has ${total} addressed sectors, and your visit currently contains ${built} of them. Gaps in the navigation index correspond to sectors you chose to skip.`,
    legendNote: 'The notation uses precise mathematical glyphs to represent relations and states.',
    sigilNote: 'Icons are based on Twemoji (CC-BY 4.0), downscaled to 16 pixels, desaturated, and quantized to four ink bands where red signifies exposure and turquoise signifies inference.',
    typeNote: 'Set in Jacquard 24 (display), Archivo (readable text), and Noto Sans Symbols 2. Monospace rendering defaults to your local system\'s default terminal font.',
    colophonCredit: 'THE DONOR REGISTRY: Wear Me. : a fingerprint commons. Web Residencies No. 22, »Ignore All Previous Instructions«, Akademie Schloss Solitude, curated by !Mediengruppe Bitnik. No third-party request is made from this page, including for its lettering.',
  }
} as const;

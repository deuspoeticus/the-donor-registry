/**
 * Automation likelihood (§4a) — an attribute, never a gate.
 *
 * Nothing in this pipeline branches on the value below. It is computed, shown
 * to the visitor, stored as one more field in the vector, and counted in the
 * pool-wide aggregate. A visitor read as an agent is collected, displayed,
 * catalogued and made wearable on identical terms to one read as a person.
 * There is no code path that consults this number to decide anything, and the
 * absence of that code path is the point rather than an omission.
 *
 * This is the interim form: hand-weighted logistic regression over the static
 * surface only. The behavioural features named in the specification — cursor
 * path curvature, inter-event timing variance, scroll cadence — are not here,
 * and the interface says the estimate is static rather than implying it saw
 * more than it did. The schema takes trained weights later without changing
 * anything downstream, because nothing downstream reads it.
 */

import type { AttrVector } from '@wearme/core/types';

interface Feature {
  name: string;
  /** Plain-language reason, shown alongside the estimate. */
  because: string;
  weight: number;
  present: (attrs: AttrVector) => boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const HEADLESS_RENDERER = /swiftshader|llvmpipe|mesa offscreen|softwarerasterizer/i;

const FEATURES: Feature[] = [
  {
    name: 'webdriver',
    because: 'navigator.webdriver is set',
    weight: 2.9,
    present: (a) => a['nav.webdriver'] === true,
  },
  {
    name: 'headless-ua',
    because: 'the user agent names a headless build',
    weight: 2.6,
    present: (a) => /headless/i.test(str(a['nav.userAgent'])),
  },
  {
    name: 'software-renderer',
    because: 'the GPU is a software rasteriser',
    weight: 1.7,
    present: (a) => HEADLESS_RENDERER.test(str(a['webgl.renderer'])),
  },
  {
    name: 'no-voices-on-desktop',
    because: 'no speech synthesis voices on a desktop platform',
    weight: 0.8,
    present: (a) =>
      a['voices.count'] === 0 && /Win32|MacIntel/.test(str(a['nav.platform'])),
  },
  {
    name: 'no-devices',
    because: 'no audio or video devices of any kind',
    weight: 0.7,
    present: (a) => str(a['devices.counts']) === 'audioinput=0;audiooutput=0;videoinput=0',
  },
  {
    name: 'no-pdf-viewer',
    because: 'the PDF viewer is absent on a desktop build that normally ships one',
    weight: 0.5,
    present: (a) => a['nav.pdfViewerEnabled'] === false && /Win32|MacIntel/.test(str(a['nav.platform'])),
  },
  {
    name: 'round-viewport',
    because: 'the screen is one of the default sizes automation drivers set',
    weight: 0.6,
    present: (a) => ['1280x720', '800x600', '1920x1080'].includes(str(a['screen.resolution'])) &&
      str(a['screen.resolution']) === str(a['screen.avail']),
  },
  {
    name: 'no-fonts',
    because: 'almost no fonts are installed',
    weight: 0.9,
    present: (a) => typeof a['fonts.count'] === 'number' && a['fonts.count'] <= 6,
  },
];

const BIAS = -3.4;

export interface AutomationEstimate {
  /** 0..1. Stored with the entry and counted in the aggregate. Read by nothing else. */
  likelihood: number;
  /** The features that fired, in plain language, so the estimate can be argued with. */
  reasons: string[];
  /** True for every estimate this build produces. Stated in the interface. */
  staticOnly: true;
}

export function estimateAutomation(attrs: AttrVector): AutomationEstimate {
  let z = BIAS;
  const reasons: string[] = [];
  for (const feature of FEATURES) {
    let fired = false;
    try {
      fired = feature.present(attrs);
    } catch {
      fired = false;
    }
    if (!fired) continue;
    z += feature.weight;
    reasons.push(feature.because);
  }
  return {
    likelihood: Number((1 / (1 + Math.exp(-z))).toFixed(4)),
    reasons,
    staticOnly: true,
  };
}

/**
 * The sentence the interface prints. Flat, in the interface's voice, never
 * personified, and it says out loud when the reading is not stable.
 */
export function automationStatement(estimate: AutomationEstimate): string {
  const agent = estimate.likelihood;
  const human = 1 - agent;
  const unstable = agent > 0.3 && agent < 0.7;
  const head = `Read as human, ${human.toFixed(2)}. Read as agent, ${agent.toFixed(2)}.`;
  const stability = unstable ? ' Neither reading is stable.' : '';
  const basis = estimate.reasons.length
    ? ` Because: ${estimate.reasons.join('; ')}.`
    : ' No automation feature fired.';
  return `${head}${stability}${basis} This estimate reads the static surface only and watched nothing you did. Nothing on this page behaves differently because of it.`;
}

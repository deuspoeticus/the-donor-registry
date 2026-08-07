/**
 * The glitch mapping (§6b).
 *
 * Every corruption in this shader is a readout of a measured quantity. Nothing
 * here is decorative and nothing is tuned by eye for looks; if a channel moves,
 * a number moved. The mapping is written down beside the code that implements
 * it because this source will be read, and because a piece that claims its
 * distortion is data has to be checkable on that claim.
 *
 *   gSurprisal      total modelled surprisal, normalised against the pool bound.
 *                   Drives corruption MAGNITUDE. A common visitor renders near
 *                   clean and sterile; one at the bound shatters. Illegibility
 *                   reads as exposure, which is the inversion the piece wants:
 *                   the noisy object is the one that has been identified.
 *
 *   gChannel        which attribute contributed most. Drives corruption
 *                   CHARACTER, and only character — magnitude is untouched.
 *                     0 none      no displacement beyond the base surface
 *                     1 canvas    RGB channel separation and subpixel tearing
 *                     2 webgl     geometry displacement, torn normals, z-fight
 *                     3 audio     vertical banding driven by the recorded value
 *                     4 fonts     glyph-like scanline debris
 *                     5 timezone  hue rotation offset by the UTC offset
 *
 *   gAudioValue     the actual recorded audio-context sum. Used directly as the
 *                   banding frequency, so the audio fingerprint literally is
 *                   what you see rather than a stand-in for it.
 *
 *   gUtcOffset      the actual recorded UTC offset in minutes, mapped to a hue
 *                   rotation. Longitude becomes colour.
 *
 *   gPlausibility   forge log-likelihood, 0..1. Feeds the SAME channel as
 *                   surprisal, deliberately: a bad forgery has to look like a
 *                   strange human, and giving synthetic entries their own
 *                   visual language would undo the point of the catalogue.
 *
 *   gErosion        wear count, saturating. Smooths and softens: detail rubbed
 *                   away is entropy destroyed, in the one place where the
 *                   monument's inscription shows on the object itself.
 *
 *   gInstability    classifier uncertainty. Confident classification locks the
 *                   form sharp and still; uncertainty makes it fail to resolve.
 *                   Zero until the classifier ships — it is wired, not faked.
 *
 *   gReducedMotion  freezes temporal terms and renders the corruption
 *                   statically. The mapping survives; only the animation stops.
 *
 * These are globals rather than uniforms because two draw paths share one
 * mapping: the instanced field, which reads them from per-instance attributes,
 * and the close-up, which reads them from uniforms. One implementation, so the
 * field and the visitor's own stele cannot come to disagree about what a number
 * looks like.
 *
 * Colour discipline: the ground and the stone are monochrome. The only
 * chromatic events in the piece are the channels above, so colour means
 * identifying information and nothing else. Nothing is tinted for taste.
 */

export const GLITCH_GLOBALS = /* glsl */ `
float gTime;
float gSurprisal;
float gPlausibility;
float gErosion;
float gInstability;
int   gChannel;
float gAudioValue;
float gUtcOffset;
float gReducedMotion;
vec3  gStone;
`;

export const GLITCH_COMMON = /* glsl */ `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

// Time, but honest about reduced motion: frozen at a fixed phase rather than at
// zero, so a still frame is still a corrupted frame.
float glitchTime() {
  return mix(gTime, 137.0, gReducedMotion);
}

// The single magnitude term. Surprisal and forge implausibility feed it
// together, on purpose (see the header).
float corruption() {
  return clamp(gSurprisal + (1.0 - gPlausibility) * 0.35, 0.0, 1.4);
}

// Uncertainty makes the form fail to settle: a value that flickers between
// states rather than easing between them.
float instabilityGate() {
  float t = glitchTime() * 6.0;
  float flicker = step(0.5, hash11(floor(t * 3.0)));
  return mix(1.0, flicker, gInstability * (1.0 - gReducedMotion));
}

vec3 hueRotate(vec3 color, float radians) {
  const vec3 k = vec3(0.57735);
  float c = cos(radians);
  return color * c + cross(k, color) * sin(radians) + k * dot(k, color) * (1.0 - c);
}
`;

/**
 * Vertex-side corruption: the WebGL channel displaces geometry, and erosion
 * pulls every vertex back toward its smoothed position.
 */
export const GLITCH_VERTEX = /* glsl */ `
vec3 applyVertexGlitch(vec3 position, vec3 normal, float seed) {
  float mag = corruption();
  vec3 displaced = position;

  // Displacement is scaled to the object rather than to world units, so a short
  // stele is not obliterated by a figure that a tall one merely wears. The
  // amounts are deliberately short of destruction: an object that has come
  // apart entirely stops being a reading of anything, and the mapping is only
  // legible while the form it corrupts is still recognisable.
  float extent = max(0.35, abs(position.y));

  if (gChannel == 2) {
    // WebGL: torn geometry along the normal, banded by height so the tearing
    // reads as strata rather than as jitter.
    float band = floor(position.y * 14.0 + seed * 7.0);
    float tear = (hash11(band + seed) - 0.5) * 2.0;
    float pulse = mix(1.0, sin(glitchTime() * 1.7 + band) * 0.5 + 0.5, 0.6);
    displaced += normal * tear * mag * 0.06 * extent * pulse;
    // z-fighting: a small forward offset on alternating bands.
    displaced.z += mod(band, 2.0) * mag * 0.006 * extent;
  } else if (gChannel == 4) {
    // Fonts: horizontal scanline debris, as though the surface were set in type
    // that failed to load.
    float line = floor(position.y * 46.0);
    float jitter = step(0.72, hash11(line + seed * 3.0));
    displaced.x += jitter * (hash11(line * 1.7) - 0.5) * mag * 0.09 * extent;
  } else {
    // Everything else perturbs the surface without restructuring it.
    float n = noise21(position.xy * 9.0 + seed);
    displaced += normal * (n - 0.5) * mag * 0.03 * extent;
  }

  // Erosion last, so a heavily worn identity is smoothed *after* corruption:
  // the detail is rubbed off the thing it was carved into.
  return mix(displaced, position * (1.0 - gErosion * 0.06), gErosion);
}
`;

/**
 * Fragment-side corruption. `screenUv` is the fragment's position in screen
 * space, which is what makes tearing read as a display artefact rather than as
 * surface texture.
 */
export const GLITCH_FRAGMENT = /* glsl */ `
vec3 applyFragmentGlitch(vec3 color, vec2 screenUv, vec3 normal, float seed) {
  float mag = corruption();
  float t = glitchTime();
  vec3 c = color;

  if (gChannel == 1) {
    // Canvas: RGB separation and subpixel tearing. The separation distance is
    // the magnitude; the tear rows are seeded from the identity.
    float row = floor(screenUv.y * 220.0);
    float tear = step(0.93 - mag * 0.25, hash11(row + floor(t * 2.0)));
    float shift = mag * 0.012 * (0.4 + tear);
    c.r = color.r * (1.0 + shift * 4.0);
    c.b = color.b * (1.0 - shift * 3.0);
    c.g = mix(color.g, color.g * (1.0 - shift), 0.6);
    c += tear * mag * vec3(0.07, -0.02, 0.09);
  } else if (gChannel == 2) {
    // WebGL: torn normals read as facets lighting inconsistently.
    float facet = hash21(floor(normal.xy * 12.0) + seed);
    c *= mix(1.0, 0.55 + facet * 0.9, mag * 0.7);
  } else if (gChannel == 3) {
    // Audio: vertical banding at the frequency of the recorded value itself.
    // gAudioValue is the number in the payload, not a mapping of it.
    float bands = sin(screenUv.x * gAudioValue * 2.4 + t * (1.0 - gReducedMotion));
    c *= 1.0 + bands * mag * 0.45;
    c.g *= 1.0 - mag * 0.12;
  } else if (gChannel == 4) {
    // Fonts: scanline debris in the shading as well as in the geometry.
    float line = step(0.78, hash11(floor(screenUv.y * 300.0) + seed));
    c = mix(c, c * 0.25 + vec3(0.55), line * mag * 0.8);
  } else if (gChannel == 5) {
    // Timezone: hue rotated by the UTC offset. Minutes to radians, so a machine
    // twelve hours away is rotated half a turn from one sitting at UTC.
    c = hueRotate(c, (gUtcOffset / 720.0) * 3.14159 * mag);
  }

  // Magnitude everywhere: grain that rises with surprisal regardless of channel.
  float grain = noise21(screenUv * 480.0 + floor(t * 12.0) * (1.0 - gReducedMotion));
  c += (grain - 0.5) * mag * 0.14;

  // Erosion desaturates toward the stone colour: worn detail loses its edges.
  c = mix(c, gStone * (0.82 + 0.18 * dot(c, vec3(0.333))), gErosion * 0.75);

  return c * instabilityGate();
}
`;

export const GLITCH_CHUNK = `${GLITCH_GLOBALS}\n${GLITCH_COMMON}`;

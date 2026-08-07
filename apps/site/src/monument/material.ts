/**
 * The stone materials.
 *
 * A plain lit surface in bone white on a dark ground, wrapped around the glitch
 * mapping. The lighting model is deliberately simple: everything interesting
 * about the surface is a readout, and a physically-based shader would put
 * decorative variation on top of data.
 *
 * Two materials, one mapping. The field reads its glitch inputs from
 * per-instance attributes; the close-up reads them from uniforms. Both assign
 * into the same globals before calling the same functions.
 */

import * as THREE from 'three';
import { GLITCH_CHUNK, GLITCH_FRAGMENT, GLITCH_VERTEX } from './glitch.glsl.js';
import { PLINTH_TOP } from './prism.js';

export const STONE = new THREE.Color(0xd8d4c8);

export interface GlitchInputs {
  /** Modelled surprisal over the pool ceiling, 0..1. */
  surprisal: number;
  /** Forge plausibility, 0..1. Same channel as surprisal, by design. */
  plausibility: number;
  /** Wear erosion, 0..1. */
  erosion: number;
  /** Classifier uncertainty, 0..1. Zero until the classifier ships. */
  instability: number;
  /** 0 none, 1 canvas, 2 webgl, 3 audio, 4 fonts, 5 timezone. */
  channel: number;
  /** The recorded audio-context sum, used directly as a modulation source. */
  audioValue: number;
  /** The recorded UTC offset in minutes. */
  utcOffset: number;
  /** Per-identity seed, from the hash. */
  seed: number;
}

export const NEUTRAL_INPUTS: GlitchInputs = {
  surprisal: 0,
  plausibility: 1,
  erosion: 0,
  instability: 0,
  channel: 0,
  audioValue: 0,
  utcOffset: 0,
  seed: 0,
};

const LIGHTING = /* glsl */ `
vec3 stoneShade(vec3 normal, vec3 viewDir) {
  // One key light, one fill, one rim. Enough to read a carved form and no more.
  //
  // The key is deliberately lateral rather than overhead. These are upright
  // prisms, so almost every surface that matters has a horizontal normal, and a
  // light from above leaves the whole shaft in the dark — which then reads as
  // corruption the visitor did not earn.
  float key = max(dot(normal, normalize(vec3(0.62, 0.48, 0.62))), 0.0);
  float fill = max(dot(normal, normalize(vec3(-0.7, 0.3, -0.55))), 0.0) * 0.34;
  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.6) * 0.32;
  return gStone * (0.2 + key * 0.82 + fill) + vec3(rim);
}
`;

// ---------------------------------------------------------------- close-up

const closeVertex = /* glsl */ `
uniform float uTime;
uniform float uSurprisal;
uniform float uPlausibility;
uniform float uErosion;
uniform float uInstability;
uniform int   uChannel;
uniform float uAudioValue;
uniform float uUtcOffset;
uniform float uReducedMotion;
uniform vec3  uStone;
uniform float uSeed;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vScreenUv;
varying float vSeed;

${GLITCH_CHUNK}
${GLITCH_VERTEX}

void main() {
  gTime = uTime; gSurprisal = uSurprisal; gPlausibility = uPlausibility;
  gErosion = uErosion; gInstability = uInstability; gChannel = uChannel;
  gAudioValue = uAudioValue; gUtcOffset = uUtcOffset;
  gReducedMotion = uReducedMotion; gStone = uStone;

  vSeed = uSeed;
  vec3 glitched = applyVertexGlitch(position, normal, uSeed);

  vec4 mvPosition = modelViewMatrix * vec4(glitched, 1.0);
  vViewPosition = -mvPosition.xyz;
  vNormal = normalize(normalMatrix * normal);

  vec4 clip = projectionMatrix * mvPosition;
  vScreenUv = (clip.xy / max(abs(clip.w), 0.0001)) * 0.5 + 0.5;
  gl_Position = clip;
}
`;

const closeFragment = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uSurprisal;
uniform float uPlausibility;
uniform float uErosion;
uniform float uInstability;
uniform int   uChannel;
uniform float uAudioValue;
uniform float uUtcOffset;
uniform float uReducedMotion;
uniform vec3  uStone;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vScreenUv;
varying float vSeed;

${GLITCH_CHUNK}
${LIGHTING}
${GLITCH_FRAGMENT}

void main() {
  gTime = uTime; gSurprisal = uSurprisal; gPlausibility = uPlausibility;
  gErosion = uErosion; gInstability = uInstability; gChannel = uChannel;
  gAudioValue = uAudioValue; gUtcOffset = uUtcOffset;
  gReducedMotion = uReducedMotion; gStone = uStone;

  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  vec3 color = applyFragmentGlitch(stoneShade(normal, viewDir), vScreenUv, normal, vSeed);
  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
`;

export function createCloseupMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: closeVertex,
    fragmentShader: closeFragment,
    uniforms: {
      uTime: { value: 0 },
      uSurprisal: { value: 0 },
      uPlausibility: { value: 1 },
      uErosion: { value: 0 },
      uInstability: { value: 0 },
      uChannel: { value: 0 },
      uAudioValue: { value: 0 },
      uUtcOffset: { value: 0 },
      uReducedMotion: { value: 0 },
      uSeed: { value: 0 },
      uStone: { value: STONE.clone() },
    },
  });
}

export function applyInputs(material: THREE.ShaderMaterial, inputs: GlitchInputs): void {
  const u = material.uniforms;
  u.uSurprisal.value = inputs.surprisal;
  u.uPlausibility.value = inputs.plausibility;
  u.uErosion.value = inputs.erosion;
  u.uInstability.value = inputs.instability;
  u.uChannel.value = inputs.channel;
  u.uAudioValue.value = inputs.audioValue;
  u.uUtcOffset.value = inputs.utcOffset;
  u.uSeed.value = inputs.seed;
}

// ---------------------------------------------------------------- field

/**
 * The field runs over a canonical prism per facet count, with each identity's
 * proportions applied in the vertex shader from instance attributes. That keeps
 * facet count — a visible identity trait — exact, while collapsing thousands of
 * steles into a handful of draw calls.
 *
 * aShape    x height, y width, z taper, w twist
 * aSurface  x relief, y relief frequency, z plinth fraction, w seed
 * aState    x surprisal, y plausibility, z erosion, w channel
 * aSignal   x audio value, y UTC offset minutes, z selection, w reserved
 */
const fieldVertex = /* glsl */ `
#define PLINTH_TOP ${PLINTH_TOP.toFixed(4)}

uniform float uTime;
uniform float uReducedMotion;
uniform vec3  uStone;

attribute float aPart;
attribute vec4 aShape;
attribute vec4 aSurface;
attribute vec4 aState;
attribute vec4 aSignal;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vScreenUv;
varying float vSeed;
varying float vSelected;
varying vec4 vState;
varying vec2 vSignal;

${GLITCH_CHUNK}
${GLITCH_VERTEX}

void main() {
  gTime = uTime;
  gSurprisal = aState.x;
  gPlausibility = aState.y;
  gErosion = aState.z;
  gInstability = 0.0;
  gChannel = int(aState.w + 0.5);
  gAudioValue = aSignal.x;
  gUtcOffset = aSignal.y;
  gReducedMotion = uReducedMotion;
  gStone = uStone;

  vSeed = aSurface.w;
  vSelected = aSignal.z;
  // The fragment stage does not share globals with the vertex stage, so the
  // per-instance glitch state travels across as varyings.
  vState = aState;
  vSignal = aSignal.xy;

  // The canonical prism arrives at unit height and unit diameter, upright and
  // untwisted. Proportion is applied here so one buffer serves every identity
  // that shares a facet count.
  float t = clamp(position.y, 0.0, 1.0);
  // aPart comes from the geometry: 0 on the plinth, 1 on the shaft. Reading it
  // rather than comparing heights is what lets the two meet in a step instead
  // of a taper, since both rings sit at the same y.
  float isShaft = aPart;
  float shaftT = clamp((position.y - PLINTH_TOP) / (1.0 - PLINTH_TOP), 0.0, 1.0);

  float scale = 1.0 - (1.0 - aShape.z) * shaftT;
  float flute = 1.0 + sin(shaftT * aSurface.y) * aSurface.x * 0.06;
  float radius = aShape.y * 0.5 * mix(1.34, scale * flute, isShaft);

  float angle = aShape.w * shaftT * 3.14159 * isShaft;
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 twisted = vec2(position.x * ca - position.z * sa, position.x * sa + position.z * ca);

  vec3 shaped = vec3(twisted.x * radius * 2.0, t * aShape.x, twisted.y * radius * 2.0);
  vec3 shapedNormal = normalize(vec3(normal.x * ca - normal.z * sa, normal.y * 0.35, normal.x * sa + normal.z * ca));

  vec3 glitched = applyVertexGlitch(shaped, shapedNormal, aSurface.w);

  vec4 local = vec4(glitched, 1.0);
  mat3 rotation = mat3(1.0);
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    rotation = mat3(instanceMatrix);
  #endif

  vec4 mvPosition = modelViewMatrix * local;
  vViewPosition = -mvPosition.xyz;
  vNormal = normalize(normalMatrix * rotation * shapedNormal);

  vec4 clip = projectionMatrix * mvPosition;
  vScreenUv = (clip.xy / max(abs(clip.w), 0.0001)) * 0.5 + 0.5;
  gl_Position = clip;
}
`;

const fieldFragment = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uReducedMotion;
uniform vec3  uStone;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vScreenUv;
varying float vSeed;
varying float vSelected;
varying vec4 vState;
varying vec2 vSignal;

${GLITCH_CHUNK}
${LIGHTING}
${GLITCH_FRAGMENT}

void main() {
  gTime = uTime;
  gSurprisal = vState.x;
  gPlausibility = vState.y;
  gErosion = vState.z;
  gChannel = int(vState.w + 0.5);
  gAudioValue = vSignal.x;
  gUtcOffset = vSignal.y;
  gInstability = 0.0;
  gReducedMotion = uReducedMotion;
  gStone = uStone;

  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  vec3 color = applyFragmentGlitch(stoneShade(normal, viewDir), vScreenUv, normal, vSeed);

  // A selected stele is lifted rather than tinted: colour is reserved for the
  // glitch channels, so selection has to speak in value alone.
  color *= 1.0 + vSelected * 0.9;

  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
`;

export function createFieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: fieldVertex,
    fragmentShader: fieldFragment,
    uniforms: {
      uTime: { value: 0 },
      uReducedMotion: { value: 0 },
      uStone: { value: STONE.clone() },
    },
  });
}

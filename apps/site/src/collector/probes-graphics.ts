/**
 * Canvas and WebGL probes (§2).
 *
 * These are the two surfaces that carry most of the entropy, and the two that
 * most obviously exist for a purpose other than the one they are used for. A
 * canvas renders text so that pages can draw; the differences between how two
 * machines draw the same text are an accident of font rasterisation, subpixel
 * layout and GPU compositing, and that accident is enough to tell people apart.
 */

import { sha256Short } from '@wearme/core/hash';
import type { AttrValue } from '@wearme/core/types';

export type ProbeResult = Record<string, AttrValue>;

/**
 * Mixed scripts, an emoji, and two composite passes.
 *
 * The specific content is arbitrary but must be fixed: the value is only
 * comparable across machines if every machine draws exactly the same thing.
 */
function drawProbe(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#f2f0eb';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#101014';
  ctx.font = '17px "Times New Roman", serif';
  ctx.fillText('WEAR ME — 1 in N ¶ßæ', 4, 22);

  ctx.font = '15px Arial, sans-serif';
  ctx.fillText('İstanbul 日本語 مرحبا ✓', 4, 44);

  // Composite passes: how the compositor blends is a driver property.
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(180, 60, 40, 0.72)';
  ctx.beginPath();
  ctx.arc(52, 34, 26, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'difference';
  ctx.fillStyle = 'rgba(40, 120, 200, 0.6)';
  ctx.beginPath();
  ctx.arc(96, 30, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export async function probeCanvas(): Promise<ProbeResult> {
  const canvas = document.createElement('canvas');
  canvas.width = 260;
  canvas.height = 60;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { 'canvas.hash': null, 'canvas.emoji': null };

  drawProbe(ctx, canvas.width, canvas.height);
  const main = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hash = sha256Short(Array.from(main.data).join(','), 32);

  // A second canvas for emoji alone. Emoji rasterisation is a separate font
  // stack from text on every platform, and it separates them differently.
  const emojiCanvas = document.createElement('canvas');
  emojiCanvas.width = 120;
  emojiCanvas.height = 40;
  const ectx = emojiCanvas.getContext('2d', { willReadFrequently: true });
  let emoji: string | null = null;
  if (ectx) {
    ectx.textBaseline = 'top';
    ectx.font = '26px sans-serif';
    ectx.fillText('\u{1F5FF}\u{1F441}\u{1F3F3}‍\u{1F308}', 0, 4);
    const data = ectx.getImageData(0, 0, emojiCanvas.width, emojiCanvas.height);
    emoji = sha256Short(Array.from(data.data).join(','), 32);
  }

  return { 'canvas.hash': hash, 'canvas.emoji': emoji };
}

const GL_VENDOR = 0x1f00;
const GL_RENDERER = 0x1f01;
const UNMASKED_VENDOR = 0x9245;
const UNMASKED_RENDERER = 0x9246;
const MAX_TEXTURE_SIZE = 0x0d33;
const MAX_VIEWPORT_DIMS = 0x0d3a;
const MAX_RENDERBUFFER_SIZE = 0x84e8;
const VERTEX_SHADER = 0x8b31;
const FRAGMENT_SHADER = 0x8b30;
const HIGH_FLOAT = 0x8df2;
const MEDIUM_FLOAT = 0x8df1;

const NULL_GL: ProbeResult = {
  'webgl.vendor': null,
  'webgl.renderer': null,
  'webgl.extensions': null,
  'webgl.precision': null,
  'webgl.limits': null,
  'webgl.scene': null,
};

export async function probeWebGL(): Promise<ProbeResult> {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGL2RenderingContext | null;
  if (!gl) return { ...NULL_GL };

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const vendor = debugInfo
    ? (gl.getParameter(UNMASKED_VENDOR) as string)
    : (gl.getParameter(GL_VENDOR) as string);
  const renderer = debugInfo
    ? (gl.getParameter(UNMASKED_RENDERER) as string)
    : (gl.getParameter(GL_RENDERER) as string);

  const extensions = (gl.getSupportedExtensions() ?? []).slice().sort().join(',');

  const fmt = (stage: number, level: number): string => {
    const f = gl.getShaderPrecisionFormat(stage, level);
    return f ? `${f.rangeMin},${f.rangeMax},${f.precision}` : '';
  };
  const precision = [
    `vh=${fmt(VERTEX_SHADER, HIGH_FLOAT)}`,
    `vm=${fmt(VERTEX_SHADER, MEDIUM_FLOAT)}`,
    `fh=${fmt(FRAGMENT_SHADER, HIGH_FLOAT)}`,
    `fm=${fmt(FRAGMENT_SHADER, MEDIUM_FLOAT)}`,
  ].join(';');

  const viewport = gl.getParameter(MAX_VIEWPORT_DIMS) as Int32Array | null;
  const limits = [
    `maxTexture=${gl.getParameter(MAX_TEXTURE_SIZE)}`,
    `maxViewport=${viewport ? `${viewport[0]}x${viewport[1]}` : ''}`,
    `maxRenderbuffer=${gl.getParameter(MAX_RENDERBUFFER_SIZE)}`,
  ].join(';');

  return {
    'webgl.vendor': vendor ?? null,
    'webgl.renderer': renderer ?? null,
    'webgl.extensions': extensions,
    'webgl.precision': precision,
    'webgl.limits': limits,
    'webgl.scene': renderScene(gl),
  };
}

/**
 * A fixed scene, hashed. Two machines running the same shader over the same
 * geometry disagree in the last bits, because rasterisation order, precision
 * and driver optimisations differ. That disagreement is the measurement.
 */
function renderScene(gl: WebGL2RenderingContext): string | null {
  const vs = `
    attribute vec2 position;
    varying vec2 uv;
    void main() {
      uv = position;
      gl_Position = vec4(position, 0.0, 1.0);
    }`;
  const fs = `
    precision highp float;
    varying vec2 uv;
    void main() {
      float d = length(uv * 1.7);
      float ring = sin(d * 24.0 - 1.3) * 0.5 + 0.5;
      float wave = sin(uv.x * 31.0) * cos(uv.y * 17.0);
      vec3 c = vec3(ring * 0.8 + wave * 0.2, pow(ring, 2.2), fract(d * 8.0));
      gl_FragColor = vec4(c, 1.0);
    }`;

  const compile = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };

  const vertex = compile(gl.VERTEX_SHADER, vs);
  const fragment = compile(gl.FRAGMENT_SHADER, fs);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  gl.viewport(0, 0, 128, 128);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const pixels = new Uint8Array(128 * 128 * 4);
  gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  gl.deleteBuffer(buffer);
  gl.deleteProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  return sha256Short(Array.from(pixels).join(','), 32);
}

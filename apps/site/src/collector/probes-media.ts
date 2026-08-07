/**
 * Audio, voices, codecs, device counts (§2).
 *
 * The audio probe is the one most people have never heard of and the one that
 * asks for nothing: an OfflineAudioContext renders without a speaker, without a
 * prompt, and without any indication that it happened.
 */

import type { ProbeResult } from './probes-graphics.js';

/**
 * Oscillator through a dynamics compressor, rendered offline, summed.
 *
 * The compressor's curve is implemented in the browser's own DSP and evaluated
 * on the local floating-point unit, so the sum differs between builds and
 * between architectures while staying stable on one machine.
 */
export async function probeAudio(): Promise<ProbeResult> {
  const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctx) return { 'audio.sum': null };

  try {
    const ctx = new Ctx(1, 44100, 44100);

    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(10000, ctx.currentTime);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, ctx.currentTime);
    compressor.knee.setValueAtTime(40, ctx.currentTime);
    compressor.ratio.setValueAtTime(12, ctx.currentTime);
    compressor.attack.setValueAtTime(0, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);

    oscillator.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(0);

    const buffer = await ctx.startRendering();
    const channel = buffer.getChannelData(0);

    let sum = 0;
    for (let i = 4500; i < 5000; i++) sum += Math.abs(channel[i]);

    return { 'audio.sum': Number(sum.toFixed(6)) };
  } catch {
    return { 'audio.sum': null };
  }
}

/**
 * Speech synthesis voices.
 *
 * High entropy, no permission, and frequently missed by both fingerprinting
 * libraries and the tools that try to block them. The list arrives
 * asynchronously in most browsers, so it is waited for rather than read once.
 */
export function probeVoices(timeoutMs = 1200): Promise<ProbeResult> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve({ 'voices.list': null, 'voices.count': null });
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      const voices = window.speechSynthesis.getVoices();
      const list = voices
        .map((v) => `${v.name}|${v.lang}|${v.localService ? '1' : '0'}`)
        .sort()
        .join(';');
      resolve({ 'voices.list': list, 'voices.count': voices.length });
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      finish();
      return;
    }
    window.speechSynthesis.addEventListener('voiceschanged', finish);
    setTimeout(finish, timeoutMs);
  });
}

/**
 * Codec support, as a bitmask over a fixed ordered list. Which formats a build
 * can decode is a function of how it was compiled and what the OS provides.
 */
const CODECS = [
  'video/mp4; codecs="avc1.42E01E"',
  'video/mp4; codecs="avc1.640028"',
  'video/mp4; codecs="hvc1.1.6.L93.B0"',
  'video/mp4; codecs="av01.0.08M.08"',
  'video/webm; codecs="vp8"',
  'video/webm; codecs="vp9"',
  'video/webm; codecs="av01.0.05M.08"',
  'video/ogg; codecs="theora"',
  'audio/mpeg',
  'audio/mp4; codecs="mp4a.40.2"',
  'audio/webm; codecs="opus"',
  'audio/webm; codecs="vorbis"',
  'audio/ogg; codecs="opus"',
  'audio/ogg; codecs="flac"',
  'audio/wav; codecs="1"',
  'audio/aac',
] as const;

const RECORDER_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=h264',
  'video/mp4;codecs=avc1',
  'audio/webm;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/ogg;codecs=opus',
] as const;

export function probeCodecs(): ProbeResult {
  const probe = document.createElement('video');
  let mask = 0n;
  let bit = 0n;

  for (const type of CODECS) {
    const support = probe.canPlayType(type);
    // "probably" and "maybe" are different answers and are recorded as such.
    if (support === 'probably') mask |= 1n << bit;
    bit += 1n;
    if (support === 'maybe') mask |= 1n << bit;
    bit += 1n;
  }

  const recorder = window.MediaRecorder;
  for (const type of RECORDER_TYPES) {
    if (recorder?.isTypeSupported?.(type)) mask |= 1n << bit;
    bit += 1n;
  }

  return { 'codecs.bitmask': mask.toString(16) };
}

/**
 * Device counts by kind. Never labels, never IDs.
 *
 * Without a granted permission the browser returns entries with empty labels,
 * which is all that is wanted: how many inputs and outputs exist is a property
 * of the machine, and what they are called is a property of the room.
 */
export async function probeDevices(): Promise<ProbeResult> {
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices?.();
    if (!devices) return { 'devices.counts': null };
    const counts = { audioinput: 0, audiooutput: 0, videoinput: 0 } as Record<string, number>;
    for (const d of devices) {
      if (d.kind in counts) counts[d.kind]++;
    }
    return {
      'devices.counts': `audioinput=${counts.audioinput};audiooutput=${counts.audiooutput};videoinput=${counts.videoinput}`,
    };
  } catch {
    return { 'devices.counts': null };
  }
}

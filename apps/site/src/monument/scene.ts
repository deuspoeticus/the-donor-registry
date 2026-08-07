/**
 * The monument (§6a).
 *
 * A field of steles on a dark plane, and the visitor's own stele in close-up.
 * Orbit and drift across the field; click any stele to open it in the
 * catalogue.
 *
 * Reduced motion is honoured by freezing the temporal terms in the shader and
 * stopping the camera drift. The corruption is still rendered, statically: a
 * visitor who has asked for less movement is not thereby entitled to a
 * flattering picture of how identifiable they are.
 */

import * as THREE from 'three';

import { erosion as erosionOf } from '@wearme/core/entropy';
import { glitchChannel } from '@wearme/core/attributes';
import { steleParams } from '@wearme/core/stele';
import { sha256 } from '@wearme/core/hash';
import { rngFromHex } from '@wearme/core/prng';
import type { Identity } from '@wearme/core/types';

import { canonicalPrism } from './prism.js';
import { buildSteleGeometry } from './stele.js';
import {
  applyInputs,
  createCloseupMaterial,
  createFieldMaterial,
  NEUTRAL_INPUTS,
  STONE,
  type GlitchInputs,
} from './material.js';

const CHANNEL_INDEX: Record<string, number> = {
  none: 0,
  canvas: 1,
  webgl: 2,
  audio: 3,
  fonts: 4,
  timezone: 5,
};

export function channelIndexFor(attribute: string | null): number {
  return CHANNEL_INDEX[glitchChannel(attribute)] ?? 0;
}

/** Per-identity glitch state the field needs, computed once per entry. */
export interface FieldEntry {
  identity: Identity;
  surprisal: number;
  plausibility: number;
  channel: number;
}

export interface MonumentOptions {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
}

export interface Monument {
  setField(entries: FieldEntry[]): void;
  setCloseup(identity: Identity | null, inputs: GlitchInputs): void;
  setSelected(id: string | null): void;
  /** 0 shows the whole field, 1 sits in front of the close-up. */
  setFocus(focus: number): void;
  /**
   * Renders one frame at an explicit size and returns it as a PNG data URL.
   * Used to capture a still of a visitor's own stele at full corruption, which
   * is the piece's own documentation and cannot be taken from a buffer that has
   * already been swapped away.
   */
  capture(options?: { width?: number; height?: number }): {
    url: string;
    stats: { calls: number; triangles: number };
  };
  resize(): void;
  dispose(): void;
}

const seedOf = (id: string): number => {
  const rng = rngFromHex(sha256(`${id}:seed`));
  return rng() * 1000;
};

export function createMonument(options: MonumentOptions): Monument {
  const { canvas, reducedMotion, onSelect } = options;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    // Kept so the drawing buffer can be read back after a frame. The monument
    // has to be capturable — a still of a visitor's own stele at full
    // corruption is the piece's own documentation, and a buffer that is
    // discarded on swap cannot produce one.
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x08080a, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x08080a, 26, 92);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);

  // The ground reads as a plane rather than a void: a very slightly lifted
  // black, so the horizon exists without being drawn.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshBasicMaterial({ color: 0x0c0c0f }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  const fieldMaterial = createFieldMaterial();
  fieldMaterial.uniforms.uReducedMotion.value = reducedMotion ? 1 : 0;

  const fieldGroup = new THREE.Group();
  scene.add(fieldGroup);

  const closeupGroup = new THREE.Group();
  scene.add(closeupGroup);
  const closeupMaterial = createCloseupMaterial();
  closeupMaterial.uniforms.uReducedMotion.value = reducedMotion ? 1 : 0;
  let closeupMesh: THREE.Mesh | null = null;

  /** id -> [instanced mesh, index], so selection can address one stele. */
  const instanceLookup = new Map<string, { mesh: THREE.InstancedMesh; index: number }>();
  let orderedIds: string[] = [];
  let selectedId: string | null = null;

  // ---------------------------------------------------------------- field

  function clearField(): void {
    for (const child of [...fieldGroup.children]) {
      fieldGroup.remove(child);
      if (child instanceof THREE.InstancedMesh) {
        child.geometry.dispose();
      }
    }
    instanceLookup.clear();
    orderedIds = [];
  }

  function setField(entries: FieldEntry[]): void {
    clearField();
    if (entries.length === 0) return;

    // Grouped by facet count, which is the only shape parameter that changes
    // topology. Everything else is applied per instance in the shader.
    const groups = new Map<number, FieldEntry[]>();
    for (const entry of entries) {
      const facets = steleParams(entry.identity.id).facets;
      const list = groups.get(facets) ?? [];
      list.push(entry);
      groups.set(facets, list);
    }

    const columns = Math.max(4, Math.ceil(Math.sqrt(entries.length)));
    const spacing = 2.6;
    let placed = 0;

    for (const [facets, group] of [...groups].sort((a, b) => a[0] - b[0])) {
      const geometry = canonicalPrism(facets).clone();
      const count = group.length;

      const shape = new Float32Array(count * 4);
      const surface = new Float32Array(count * 4);
      const state = new Float32Array(count * 4);
      const signal = new Float32Array(count * 4);

      const mesh = new THREE.InstancedMesh(geometry, fieldMaterial, count);
      mesh.frustumCulled = false;
      const matrix = new THREE.Matrix4();

      group.forEach((entry, i) => {
        const p = steleParams(entry.identity.id);
        const rng = rngFromHex(sha256(`${entry.identity.id}:position`));

        // A jittered lattice. A pure scatter reads as a starfield and a regular
        // grid reads as a car park; a graveyard is neither.
        const index = placed++;
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = (col - columns / 2) * spacing + (rng() - 0.5) * spacing * 0.55;
        const z = (row - columns / 2) * spacing + (rng() - 0.5) * spacing * 0.55;

        matrix.makeRotationY(p.rotation);
        matrix.premultiply(new THREE.Matrix4().makeRotationZ(p.lean));
        matrix.setPosition(x, 0, z);
        mesh.setMatrixAt(i, matrix);

        shape.set([p.height, p.width, p.taper, p.twist], i * 4);
        surface.set([p.relief, p.reliefFrequency, p.plinth, seedOf(entry.identity.id)], i * 4);
        state.set(
          [entry.surprisal, entry.plausibility, erosionOf(entry.identity.wearCount), entry.channel],
          i * 4,
        );
        signal.set([audioValueOf(entry.identity), utcOffsetOf(entry.identity), 0, 0], i * 4);

        instanceLookup.set(entry.identity.id, { mesh, index: i });
        orderedIds.push(entry.identity.id);
      });

      geometry.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 4));
      geometry.setAttribute('aSurface', new THREE.InstancedBufferAttribute(surface, 4));
      geometry.setAttribute('aState', new THREE.InstancedBufferAttribute(state, 4));
      geometry.setAttribute('aSignal', new THREE.InstancedBufferAttribute(signal, 4));
      mesh.instanceMatrix.needsUpdate = true;
      fieldGroup.add(mesh);
    }
  }

  function setSelected(id: string | null): void {
    const mark = (target: string | null, value: number) => {
      if (!target) return;
      const found = instanceLookup.get(target);
      if (!found) return;
      const attr = found.mesh.geometry.getAttribute('aSignal') as THREE.InstancedBufferAttribute;
      attr.setZ(found.index, value);
      attr.needsUpdate = true;
    };
    mark(selectedId, 0);
    mark(id, 1);
    selectedId = id;
  }

  // ---------------------------------------------------------------- close-up

  function setCloseup(identity: Identity | null, inputs: GlitchInputs): void {
    if (closeupMesh) {
      closeupGroup.remove(closeupMesh);
      closeupMesh.geometry.dispose();
      closeupMesh = null;
    }
    if (!identity) return;

    // Full detail here: the exact geometry for this hash, not the field's
    // instanced approximation of it.
    const params = steleParams(identity.id);
    closeupMesh = new THREE.Mesh(buildSteleGeometry(params, 96), closeupMaterial);
    closeupMesh.rotation.y = params.rotation;
    closeupMesh.rotation.z = params.lean;
    closeupGroup.add(closeupMesh);

    applyInputs(closeupMaterial, { ...inputs, seed: seedOf(identity.id) });
  }

  // ---------------------------------------------------------------- camera

  let focus = 0;
  const setFocus = (value: number) => {
    focus = Math.min(1, Math.max(0, value));
  };

  // Close-up sits far from the field so the two never intersect, and the camera
  // interpolates between them rather than cutting.
  closeupGroup.position.set(0, 0, -1000);

  let orbit = 0.6;
  let elevation = 0.34;
  let distance = 34;
  let dragging = false;
  let lastPointer: { x: number; y: number } | null = null;

  const onPointerDown = (event: PointerEvent) => {
    dragging = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging || !lastPointer) return;
    orbit -= (event.clientX - lastPointer.x) * 0.005;
    elevation = Math.min(1.2, Math.max(0.06, elevation + (event.clientY - lastPointer.y) * 0.004));
    lastPointer = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent) => {
    dragging = false;
    lastPointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    distance = Math.min(80, Math.max(6, distance + event.deltaY * 0.02));
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const onClick = (event: MouseEvent) => {
    if (focus > 0.5) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    // The instanced geometry is a straight prism; the shader is what tapers and
    // twists it. Ray casting therefore hits an approximation of the drawn form,
    // which is close enough to pick with and would not be close enough to
    // measure with.
    const hits = raycaster.intersectObjects(fieldGroup.children, false);
    const hit = hits.find((h) => h.instanceId !== undefined && h.instanceId !== null);
    if (!hit || hit.instanceId === undefined || hit.instanceId === null) return;

    for (const [id, entry] of instanceLookup) {
      if (entry.mesh === hit.object && entry.index === hit.instanceId) {
        onSelect(id);
        return;
      }
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('click', onClick);

  let lastWidth = 0;
  let lastHeight = 0;

  function resize(): void {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // Laid-out size can still be zero on the first frame, before the stylesheet
    // has applied. Sizing to that would lock the drawing buffer at one pixel
    // until something else happened to move the window, so it is skipped and
    // the observer below picks it up when the element actually has a box.
    if (width === 0 || height === 0) return;
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);

  const clock = new THREE.Clock();
  let running = true;
  const fieldTarget = new THREE.Vector3(0, 1.4, 0);
  const closeTarget = new THREE.Vector3(0, 1.4, -1000);

  function updateCamera(): void {
    const target = new THREE.Vector3().lerpVectors(fieldTarget, closeTarget, focus);
    const radius = THREE.MathUtils.lerp(distance, 3.4, focus);
    const height = THREE.MathUtils.lerp(Math.sin(elevation) * distance, 0.9, focus);

    camera.position.set(
      target.x + Math.cos(orbit) * radius,
      target.y + height,
      target.z + Math.sin(orbit) * radius,
    );
    camera.lookAt(target);
  }

  function frame(): void {
    if (!running) return;
    requestAnimationFrame(frame);

    const t = clock.getElapsedTime();
    fieldMaterial.uniforms.uTime.value = t;
    closeupMaterial.uniforms.uTime.value = t;

    if (!dragging && !reducedMotion) orbit += 0.0006;

    updateCamera();
    renderer.render(scene, camera);
  }

  resize();
  frame();

  return {
    setField,
    setCloseup,
    setSelected,
    setFocus,
    resize,
    capture(options = {}) {
      const width = options.width ?? canvas.clientWidth ?? 1600;
      const height = options.height ?? canvas.clientHeight ?? 900;
      const previous = new THREE.Vector2();
      renderer.getSize(previous);
      const previousAspect = camera.aspect;

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // A capture has to compose the same shot the running page would, so the
      // camera is placed by the same code the frame loop uses rather than being
      // left wherever the last frame happened to leave it.
      updateCamera();
      renderer.info.reset();
      renderer.render(scene, camera);

      const url = canvas.toDataURL('image/png');
      const stats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };

      renderer.setSize(previous.x, previous.y, false);
      camera.aspect = previousAspect;
      camera.updateProjectionMatrix();
      lastWidth = 0;
      lastHeight = 0;
      resize();

      return { url, stats };
    },
    dispose() {
      running = false;
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
      clearField();
      renderer.dispose();
    },
  };
}

function audioValueOf(identity: Identity): number {
  const value = identity.attrs['audio.sum'];
  return typeof value === 'number' ? value : 0;
}

function utcOffsetOf(identity: Identity): number {
  const value = identity.attrs['intl.offset'];
  return typeof value === 'number' ? value : 0;
}

export { NEUTRAL_INPUTS, STONE };
export type { GlitchInputs };

/**
 * The model (sector 07) — the signature element.
 *
 * Two drawings of the same fit, and the second one is the honest half.
 *
 * The **tree** is the Chow-Liu maximum spanning tree: for each attribute, the one
 * other attribute that tells you most about it, laid out radially by depth from
 * the root. The root is the attribute with the highest entropy, so distance from
 * the centre is distance from the thing the model knows best. Edge weight is
 * mutual information in bits and nothing else.
 *
 * The **matrix** is every pair the fit measured. A spanning tree keeps n-1 edges
 * and throws away the other n(n-3)/2 relations it weighed on the way, and a page
 * that showed only the tree would be showing the model's conclusions while hiding
 * its evidence. The kept pairs are outlined; every other lit cell is a dependency
 * the model found and then decided to forget in order to remain a tree.
 *
 * The **held-out attributes** appear in neither drawing, and are named in the
 * readout instead. That is not an omission: at this pool size they take a different
 * value for almost every entry, which makes them identifiers rather than variables,
 * and the fit does not contain them. Drawing them as nodes with no edges would put
 * them inside a picture they are outside of. They are listed, in red, as the part of
 * a person this model does not even attempt.
 */

import { attrLabel } from '@wearme/core/attributes';
import type { ChowLiuTree } from '@wearme/core/chowliu';
import type { EntropyModel } from '@wearme/core/entropy';

import { copy } from '../copy.js';
import type { Board } from './board.js';
import { heatMatrix, keyed } from './chart.js';
import { bits, h, int, svg, svgTitle } from './dom.js';

interface Placed {
  attr: string;
  x: number;
  y: number;
  depth: number;
  /** Radians, measured from twelve o'clock. Decides where the label can go. */
  angle: number;
}

export function renderModelContent(model: EntropyModel, poolSize: number): HTMLElement[] {
  const tree = model.tree;

  return [
    h('h4', { class: 'sub', text: 'What the pool thinks a person is made of' }),
    h('p', { text: copy.model.treeNote }),
    h('div', { class: 'scroll-x' }, radialTree(tree) as unknown as Node),
    keyed([
      { key: 'root', mark: 'model', value: attrLabel(rootOf(tree)), register: 'inferred' },
      { key: 'strongest link', mark: 'model', value: strongest(tree), register: 'inferred' },
      {
        key: 'joint entropy',
        mark: 'sum',
        value: `${bits(tree.jointEntropy)} bits under the model`,
        register: 'inferred',
      },
      {
        key: 'fitted over',
        mark: 'set',
        value: `${int(poolSize)} entries, ${int(tree.ids.length)} modelled attributes`,
      },
      {
        key: 'held out',
        mark: 'withheld',
        value:
          model.nearUniqueIds.length === 0
            ? 'nothing — every attribute repeats often enough to model'
            : `${int(model.nearUniqueIds.length)}: ${model.nearUniqueIds.map(attrLabel).join(', ')}`,
        register: 'exposed',
      },
    ]),

    h('hr', { class: 'rule rule--double' }),
    h('h4', { class: 'sub', text: 'Everything it measured and did not keep' }),
    h('p', { text: copy.model.matrixNote }),
    h('div', { class: 'scroll-x' }, miMatrix(tree) as unknown as Node),
    h('p', {
      class: 'gloss',
      text: `${int(tree.ids.length)} attributes, ${int((tree.ids.length * (tree.ids.length - 1)) / 2)} pairs measured, ${int(tree.edges.length)} kept. Cell weight is mutual information as a fraction of the strongest pair in the fit; outlined cells are the ones the tree kept.`,
    }),
  ];
}

// ---------------------------------------------------------------- the tree

function rootOf(tree: ChowLiuTree): string {
  return tree.nodes.find((node) => node.parent === null)?.attr ?? tree.nodes[0]?.attr ?? '';
}

/*
 * The drawing is wide, and elliptical, and both of those are about labels.
 *
 * A radial tree on a square canvas distributes nodes evenly around a circle, which
 * distributes *labels* evenly around a circle — and a label is a horizontal object
 * forty times wider than it is tall. Every node near three o'clock and nine o'clock
 * had room; every node near noon and six had its name over the top of its neighbour's.
 *
 * Three things fix it, and none of them changes what the drawing means. The canvas is
 * wider than it is tall. The rings are ellipses with a horizontal radius half again
 * the vertical one, so the crowded top and bottom of the circle are pulled out
 * sideways into space that was empty. And a node close to the vertical axis sets its
 * label *above or below* itself, centred, instead of beside itself — which is the
 * only direction there is room in when you are at the top of a circle.
 */
function radialTree(tree: ChowLiuTree): SVGElement {
  const width = 1560;
  const height = 760;
  const cx = width / 2;
  const cy = height / 2;
  /** Room reserved outside the outermost ring for the labels themselves. */
  const gutterX = 210;
  const gutterY = 46;

  const childrenOf = new Map<string, string[]>();
  const root = rootOf(tree);
  for (const node of tree.nodes) {
    if (node.parent === null) continue;
    const list = childrenOf.get(node.parent) ?? [];
    list.push(node.attr);
    childrenOf.set(node.parent, list);
  }

  // Leaves are counted first so each subtree gets angular space in proportion to
  // how much of the model hangs off it.
  const leafCount = new Map<string, number>();
  const countLeaves = (attr: string): number => {
    const kids = childrenOf.get(attr) ?? [];
    const total = kids.length === 0 ? 1 : kids.reduce((s, k) => s + countLeaves(k), 0);
    leafCount.set(attr, total);
    return total;
  };
  if (root) countLeaves(root);

  const placed = new Map<string, Placed>();
  const maxDepth = Math.max(1, root ? depthOf(root, childrenOf) : 1);
  const stepX = (cx - gutterX) / maxDepth;
  const stepY = (cy - gutterY) / maxDepth;

  const place = (attr: string, depth: number, from: number, to: number): void => {
    const mid = (from + to) / 2;
    placed.set(attr, {
      attr,
      x: cx + Math.cos(mid - Math.PI / 2) * depth * stepX,
      y: cy + Math.sin(mid - Math.PI / 2) * depth * stepY,
      depth,
      angle: mid,
    });

    const kids = childrenOf.get(attr) ?? [];
    const total = kids.reduce((s, k) => s + (leafCount.get(k) ?? 1), 0) || 1;
    let cursor = from;
    for (const kid of kids) {
      const span = ((leafCount.get(kid) ?? 1) / total) * (to - from);
      place(kid, depth + 1, cursor, cursor + span);
      cursor += span;
    }
  };
  if (root) place(root, 0, 0, Math.PI * 2);

  const canvas = svg('svg', {
    class: 'tree',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'The dependency tree the model fits over the pool',
  });

  /*
   * One dashed ellipse per depth. Distance from the centre is distance from the
   * attribute the model knows best, and that is a quantity the drawing was asserting
   * without ever marking — the rings are the axis it was missing.
   */
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    canvas.appendChild(
      svg('ellipse', {
        class: 'tree__ring',
        cx,
        cy,
        rx: (depth * stepX).toFixed(1),
        ry: (depth * stepY).toFixed(1),
      }),
    );
  }

  const maxMi = Math.max(...tree.edges.map((e) => e.mi), 0.001);

  /*
   * Edges are drawn into their own group, under the nodes, and indexed by the two
   * attributes they touch. Pointing at a node lights its own edges: which
   * dependencies belong to which attribute is not readable from a static drawing of
   * forty overlapping lines, and CSS has no way to express "the edges that touch
   * the thing being hovered". So it is done here, in eight lines, rather than
   * approximated with a selector that does not mean that.
   */
  const edgeLayer = svg('g', { class: 'tree__edges' });
  const touching = new Map<string, SVGElement[]>();
  const index = (attr: string, line: SVGElement) => {
    const list = touching.get(attr) ?? [];
    list.push(line);
    touching.set(attr, list);
  };

  for (const edge of tree.edges) {
    const a = placed.get(edge.parent);
    const b = placed.get(edge.child);
    if (!a || !b) continue;
    const line = svg('line', {
      class: 'tree__edge',
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      // Thickness is the mutual information, in bits. Nothing else.
      'stroke-width': (0.4 + (edge.mi / maxMi) * 3.4).toFixed(2),
      'stroke-opacity': (0.25 + (edge.mi / maxMi) * 0.6).toFixed(2),
    });
    line.appendChild(
      svgTitle(`${attrLabel(edge.parent)} → ${attrLabel(edge.child)}: ${edge.mi.toFixed(3)} bits`),
    );
    edgeLayer.appendChild(line);
    index(edge.parent, line);
    index(edge.child, line);
  }
  canvas.appendChild(edgeLayer);

  for (const node of placed.values()) {
    const entropy = tree.marginalEntropy.get(node.attr) ?? 0;
    const radius = 1.6 + Math.min(4.4, entropy * 0.7);

    const group = svg('g', { class: 'tree__group' });
    const dot = svg('circle', {
      class: 'tree__node',
      cx: node.x,
      cy: node.y,
      r: radius.toFixed(2),
    });
    dot.appendChild(
      svgTitle(`${attrLabel(node.attr)}: ${entropy.toFixed(2)} bits of entropy in this pool`),
    );
    group.appendChild(dot);

    /*
     * Where the name goes.
     *
     * Beside the node, unless the node is near the top or bottom of a ring — there,
     * "beside" is where its two neighbours are, so the label goes above or below
     * instead, centred on the node. The root is the one exception and sits under its
     * own dot, because it is at the middle of the drawing and has no outside.
     */
    const nearVertical = Math.abs(Math.cos(node.angle - Math.PI / 2)) < 0.4;
    const above = Math.sin(node.angle - Math.PI / 2) < 0;
    const rightHalf = node.x >= cx;

    const label = svg(
      'text',
      node.depth === 0
        ? {
            class: 'tree__label tree__label--root',
            x: node.x,
            y: node.y + radius + 11,
            'text-anchor': 'middle',
          }
        : nearVertical
          ? {
              class: 'tree__label',
              x: node.x,
              y: node.y + (above ? -(radius + 6) : radius + 11),
              'text-anchor': 'middle',
            }
          : {
              class: 'tree__label',
              x: node.x + (rightHalf ? radius + 5 : -(radius + 5)),
              y: node.y + 3,
              'text-anchor': rightHalf ? 'start' : 'end',
            },
    );
    label.textContent = attrLabel(node.attr);
    group.appendChild(label);

    const lit = touching.get(node.attr) ?? [];
    group.addEventListener('pointerenter', () => {
      for (const line of lit) line.classList.add('is-lit');
    });
    group.addEventListener('pointerleave', () => {
      for (const line of lit) line.classList.remove('is-lit');
    });

    canvas.appendChild(group);
  }

  return canvas;
}

function depthOf(root: string, children: Map<string, string[]>): number {
  let deepest = 0;
  const walk = (attr: string, depth: number) => {
    deepest = Math.max(deepest, depth);
    for (const kid of children.get(attr) ?? []) walk(kid, depth + 1);
  };
  walk(root, 0);
  return deepest;
}

function strongest(tree: ChowLiuTree): string {
  const best = [...tree.edges].sort((a, b) => b.mi - a.mi)[0];
  if (!best) return 'none';
  return `${attrLabel(best.parent)} → ${attrLabel(best.child)}, ${best.mi.toFixed(2)} bits`;
}

// ---------------------------------------------------------------- the matrix

function miMatrix(tree: ChowLiuTree): SVGElement {
  const ids = tree.ids;
  const at = (a: string, b: string): number => tree.mi.get(a)?.get(b) ?? tree.mi.get(b)?.get(a) ?? 0;

  let max = 0.001;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) max = Math.max(max, at(ids[i], ids[j]));
  }

  const kept = new Set(tree.edges.map((e) => key(e.parent, e.child)));

  return heatMatrix({
    // The technical id rather than the human label: a matrix is a coordinate
    // system, and `nav.userAgent` fits in the gutter where "User agent string"
    // does not.
    labels: ids.map((id) => (id.length > 17 ? `${id.slice(0, 16)}…` : id)),
    weight: (row, col) => at(ids[row], ids[col]) / max,
    kept: (row, col) => kept.has(key(ids[row], ids[col])),
    title: (row, col) =>
      `${attrLabel(ids[row])} ↔ ${attrLabel(ids[col])}: ${at(ids[row], ids[col]).toFixed(3)} bits${
        kept.has(key(ids[row], ids[col])) ? ' — kept by the tree' : ' — measured and discarded'
      }`,
    label: 'Pairwise mutual information between every modelled attribute',
  });
}

/** Order-independent, because mutual information is symmetric and the tree is not. */
const key = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

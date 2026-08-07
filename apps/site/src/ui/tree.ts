/**
 * The dependency tree (§6d) — the signature element.
 *
 * The Chow-Liu maximum spanning tree drawn as the constellation that actually
 * links the attributes, with edge weight as mutual information, redrawn every
 * time the pool grows. It is the only element in the piece that shows the
 * machine's model of people rather than a person, so everything around it is
 * kept quiet.
 *
 * Laid out radially by depth from the root: the root is the attribute with the
 * highest entropy, and distance from the centre is distance from the thing the
 * model knows best.
 */

import { attrLabel } from '@wearme/core/attributes';
import type { ChowLiuTree } from '@wearme/core/chowliu';

import { TREE_NOTE } from '../copy.js';
import { append, clear, h, svg } from './dom.js';
import type { SectionCounter } from './section.js';

interface Placed {
  attr: string;
  x: number;
  y: number;
  depth: number;
}

export function renderTree(
  mount: HTMLElement,
  tree: ChowLiuTree,
  poolSize: number,
  sections: SectionCounter,
): void {
  clear(mount);

  const width = 1000;
  const height = 620;
  const cx = width / 2;
  const cy = height / 2;

  const childrenOf = new Map<string, string[]>();
  let root = tree.nodes[0]?.attr ?? '';
  for (const node of tree.nodes) {
    if (node.parent === null) {
      root = node.attr;
      continue;
    }
    const list = childrenOf.get(node.parent) ?? [];
    list.push(node.attr);
    childrenOf.set(node.parent, list);
  }

  // Leaves are counted first so each subtree gets angular space in proportion
  // to how much of the model hangs off it.
  const leafCount = new Map<string, number>();
  const countLeaves = (attr: string): number => {
    const kids = childrenOf.get(attr) ?? [];
    const total = kids.length === 0 ? 1 : kids.reduce((s, k) => s + countLeaves(k), 0);
    leafCount.set(attr, total);
    return total;
  };
  countLeaves(root);

  const placed = new Map<string, Placed>();
  const maxDepth = Math.max(1, tree.nodes.length > 0 ? depthOf(tree, root, childrenOf) : 1);
  const ringStep = Math.min(cx, cy) * 0.86 / maxDepth;

  const place = (attr: string, depth: number, from: number, to: number): void => {
    const mid = (from + to) / 2;
    const radius = depth * ringStep;
    placed.set(attr, {
      attr,
      x: cx + Math.cos(mid - Math.PI / 2) * radius,
      y: cy + Math.sin(mid - Math.PI / 2) * radius,
      depth,
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
  place(root, 0, 0, Math.PI * 2);

  const canvas = svg('svg', {
    class: 'tree',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'The dependency tree the model fits over the pool',
  });

  const maxMi = Math.max(...tree.edges.map((e) => e.mi), 0.001);

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
    line.appendChild(svgTitle(`${attrLabel(edge.parent)} → ${attrLabel(edge.child)}: ${edge.mi.toFixed(3)} bits`));
    canvas.appendChild(line);
  }

  for (const node of placed.values()) {
    const entropy = tree.marginalEntropy.get(node.attr) ?? 0;
    const radius = 1.6 + Math.min(4.4, entropy * 0.7);
    const dot = svg('circle', { class: 'tree__node', cx: node.x, cy: node.y, r: radius.toFixed(2) });
    dot.appendChild(svgTitle(`${attrLabel(node.attr)}: ${entropy.toFixed(2)} bits of entropy in this pool`));
    canvas.appendChild(dot);

    const label = svg('text', {
      class: node.depth === 0 ? 'tree__label tree__label--root' : 'tree__label',
      x: node.x + (node.x >= cx ? radius + 4 : -(radius + 4)),
      y: node.y + 3,
      'text-anchor': node.x >= cx ? 'start' : 'end',
    });
    label.textContent = attrLabel(node.attr);
    canvas.appendChild(label);
  }

  append(mount, [
    sections.section(
      {
        id: 'tree',
        eyebrow: 'The model',
        title: 'What the pool thinks a person is made of',
        solid: true,
      },
      h('p', { text: TREE_NOTE }),
      h('div', { class: 'scroll-x' }, canvas as unknown as Node),
      h('p', {
        class: 'mono dim',
        text: `${tree.nodes.length} attributes, ${tree.edges.length} edges, fitted over ${poolSize} entries. Strongest link: ${strongest(tree)}.`,
      }),
    ),
  ]);
}

function depthOf(tree: ChowLiuTree, root: string, children: Map<string, string[]>): number {
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

function svgTitle(text: string): SVGElement {
  const title = svg('title');
  title.textContent = text;
  return title;
}

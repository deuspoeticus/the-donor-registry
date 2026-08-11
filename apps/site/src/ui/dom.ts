/** Minimal element construction. No framework; the page is a document. */

type Child = Node | string | number | null | undefined | false;

type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key === 'text') {
      const textVal = String(value);
      if (textVal.includes('**') || textVal.includes('*')) {
        append(el, parseFormattedText(textVal));
      } else {
        el.textContent = textVal;
      }
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

/** A `<title>` child, which is how an SVG shape gets a tooltip and a name. */
export function svgTitle(text: string): SVGElement {
  const title = svg('title');
  title.textContent = text;
  return title;
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Thousands separators, no currency, no rounding surprises. */
export const int = (n: number): string => Math.round(n).toLocaleString('en-GB');

export const bits = (n: number): string => n.toFixed(2);

/** A share of a whole, as whole percent. Used for counts, never for probabilities. */
export const pct = (n: number): string => `${(n * 100).toFixed(n >= 0.995 || n === 0 ? 0 : 1)}%`;

/** A probability, at the precision the model actually has. */
export const prob = (n: number): string => n.toFixed(3);

/** Parses inline markdown syntax (`**bold**` and `*italic*`) into DOM elements. */
export function parseFormattedText(text: string): Child[] {
  const parts: Child[] = [];
  const regex = /(\*\*.*?\*\*|\*.*?\*)/g;
  const split = text.split(regex);

  for (const part of split) {
    if (part.startsWith('**') && part.endsWith('**')) {
      parts.push(h('strong', {}, part.slice(2, -2)));
    } else if (part.startsWith('*') && part.endsWith('*')) {
      parts.push(h('em', {}, part.slice(1, -1)));
    } else if (part) {
      parts.push(part);
    }
  }
  return parts;
}

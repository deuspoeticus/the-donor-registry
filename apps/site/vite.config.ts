import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const core = (path: string) => fileURLToPath(new URL(`../../packages/core/src/${path}`, import.meta.url));

// GitHub Pages serves this as a project site at /the-donor-registry/, so every
// asset URL the build emits needs that prefix. Override with BASE_PATH for
// other hosts (a custom domain, or `preview`, which wants `/`).
const base = process.env.BASE_PATH ?? '/the-donor-registry/';

export default defineConfig({
  base,
  // The seeded pool is served as a static file rather than bundled, so the
  // browser can fetch it when the API is unreachable and so it stays legible to
  // anyone who wants to read what the launch pool actually contains.
  //
  // The lettering is deliberately *not* here. The three faces live in
  // `src/fonts/` and are referenced relatively from the stylesheet, so the build
  // fingerprints them and rewrites the URLs with `base` — a root-relative path
  // out of the public directory would have to be correct by hand under the
  // /the-donor-registry/ prefix GitHub Pages serves this under, and would be
  // wrong the first time that prefix changed.
  publicDir: fileURLToPath(new URL('../../data', import.meta.url)),
  resolve: {
    alias: [
      { find: /^@wearme\/core$/, replacement: core('index.ts') },
      { find: /^@wearme\/core\/(.*)$/, replacement: core('$1.ts') },
    ],
  },
  server: {
    port: 5173,
    // The residency microsite embeds this in an iframe, so nothing may assume a
    // top-level browsing context.
    headers: { 'X-Frame-Options': 'ALLOWALL' },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});

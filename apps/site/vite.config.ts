import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const core = (path: string) => fileURLToPath(new URL(`../../packages/core/src/${path}`, import.meta.url));

/**
 * Dev-only sink for stills of the monument.
 *
 * The application needs a captured frame of a stele at full corruption, and the
 * only place that frame exists is inside a live WebGL context. This lets the
 * running page hand one back to disk. It is registered for `serve` only and is
 * not part of any build.
 */
function captureSink(): Plugin {
  const outDir = fileURLToPath(new URL('../../captures', import.meta.url));
  return {
    name: 'wear-me:capture-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__capture', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            name: string;
            dataUrl: string;
          };
          const safe = body.name.replace(/[^a-z0-9._-]/gi, '_');
          const target = resolve(outDir, safe);
          mkdirSync(dirname(target), { recursive: true });
          const base64 = body.dataUrl.slice(body.dataUrl.indexOf(',') + 1);
          const bytes = Buffer.from(base64, 'base64');
          writeFileSync(target, bytes);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ written: target, bytes: bytes.length }));
        });
      });
    },
  };
}

// GitHub Pages serves this as a project site at /the-donor-registry/, so every
// asset URL the build emits needs that prefix. Override with BASE_PATH for
// other hosts (a custom domain, or `preview`, which wants `/`).
const base = process.env.BASE_PATH ?? '/the-donor-registry/';

export default defineConfig({
  base,
  plugins: [captureSink()],
  // The seeded pool is served as a static file rather than bundled, so the
  // browser can fetch it when the API is unreachable and so it stays legible to
  // anyone who wants to read what the launch pool actually contains.
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

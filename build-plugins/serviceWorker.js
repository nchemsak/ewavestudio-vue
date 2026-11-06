// build-plugins/serviceWorker.js
// Makes the app installable and able to run offline (a PWA), in builds only: after Vite has
// written dist/, it lists every file there with its SHA-256 and writes dist/sw.js, the
// service worker (build-plugins/serviceWorkerSource.js) with that list in front. Any change
// to any file changes the list's version, so each deploy makes a new sw.js and installed apps
// pick up the update. The web app manifest (public/manifest.json) and the icons
// (public/icons/) are plain files. The page registers the worker in src/composables/usePwa.ts.
// No dependency: the usual plugin (vite-plugin-pwa → workbox-build → glob → minimatch 10)
// brings the advisory that keeps ESLint out (CLAUDE.md, "No linter yet").

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export const SW_FILE = 'sw.js';

// Built files nothing loads: the GIFs are only used by _sequencer.scss, which isn't built
export const SKIP = ['images/circleWave.gif', 'images/retroSpeaker.gif'];

async function sha256Hex(data) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The files the service worker saves: every file but the worker itself, names starting with
 * a dot, source maps and `skip`, each with its SHA-256. `version` (the name of the worker's
 * cache) changes with any of them, and with the worker's own code.
 * @param {{ path: string, data: Uint8Array }[]} files  paths relative to dist/, with '/'
 * @param {string} [workerCode]
 * @param {string[]} [skip]
 */
export async function precacheList(files, workerCode = '', skip = SKIP) {
  const kept = files
    .filter(({ path }) => path !== SW_FILE && !path.split('/').some((p) => p.startsWith('.'))
      && !path.endsWith('.map') && !skip.includes(path))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const list = [];
  for (const { path, data } of kept) list.push({ url: path, hash: await sha256Hex(data) });
  const version = (await sha256Hex(new TextEncoder().encode(JSON.stringify(list) + workerCode))).slice(0, 12);
  return { version, files: list };
}

/** @returns {import('vite').Plugin} */
export function serviceWorker() {
  let outDir = 'dist';
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    // After every file (the bundle and public/) is in dist/
    writeBundle: {
      sequential: true,
      order: 'post',
      async handler() {
        const entries = await readdir(outDir, { recursive: true, withFileTypes: true });
        const files = await Promise.all(entries.filter((e) => e.isFile()).map(async (e) => {
          const full = join(e.parentPath, e.name);
          return { path: relative(outDir, full).split(sep).join('/'), data: await readFile(full) };
        }));
        const source = await readFile(new URL('./serviceWorkerSource.js', import.meta.url), 'utf8');
        const list = await precacheList(files, source);
        await writeFile(join(outDir, SW_FILE), `const PRECACHE = ${JSON.stringify(list, null, 1)};\n\n${source}`);
      },
    },
  };
}

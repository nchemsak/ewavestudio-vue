import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { googleAnalytics } from './build-plugins/googleAnalytics.js'
import { serviceWorker } from './build-plugins/serviceWorker.js'

// https://vite.dev/config/
export default defineConfig({
  // This codebase is version 2 of the app, served from ephemeralwave.com/studio2/.
  // The original version on /studio/ is frozen: never deploy this code there.
  // Changing `base` also changes where saved projects are stored (src/lib/storage/namespace.ts).
  base: '/studio2/',
  // googleAnalytics(): the gtag snippet; serviceWorker(): dist/sw.js, for installing the app and
  // using it offline. Both in builds only (not `npm run dev`).
  plugins: [vue(), googleAnalytics(), serviceWorker()],
  // The app is one page that needs all of its code at once (a groovebox: every machine is on the
  // panel), so one main chunk is expected; the Drums machine's kit data (src/audio/drumKitData.ts)
  // is split out and loaded when first needed. Vite warns over 500 kB; the main chunk passed that
  // with the Drums machine (520 kB, 176 kB gzipped), so the warning starts at 640 kB.
  build: { chunkSizeWarningLimit: 640 },
  css: {
    preprocessorOptions: {
      scss: {
        // Bootstrap 5.3's Sass uses features Dart Sass now flags as deprecated (@import, global
        // functions such as red()), which printed hundreds of warnings on every build. They are
        // Bootstrap's to fix (Bootstrap 6). quietDeps hides warnings from files in node_modules;
        // 'import' covers our own @import of Bootstrap in _bootstrap-custom.scss, which Bootstrap
        // 5.3 needs. Our other SCSS uses @use, so new problems in it still show.
        quietDeps: true,
        silenceDeprecations: ['import'],
      },
    },
  },
})

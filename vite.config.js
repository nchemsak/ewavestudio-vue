import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  // This codebase is version 2 of the app, served from ephemeralwave.com/studio2/.
  // The original version on /studio/ is frozen: never deploy this code there.
  // Changing `base` also changes where saved projects are stored (src/lib/storage/namespace.ts).
  base: '/studio2/',
  plugins: [vue()],
})

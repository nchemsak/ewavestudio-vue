import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

// Unit tests (`npm test`). Vitest serves tests from '/', so BASE_URL is set to the app's real
// folder from vite.config.js: code under test sees the same import.meta.env.BASE_URL as the app.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: { BASE_URL: viteConfig.base },
  },
}));

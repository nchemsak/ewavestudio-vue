import { defineConfig } from '@playwright/test';

// Browser tests (`npm run test:e2e`): build the app, serve it with `vite preview` at
// /studio2/, and drive it in Chromium. Before the first local run: npx playwright install chromium
export default defineConfig({
	testDir: 'e2e',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	// One test at a time: several tests measure audio timing, which a busy CPU would skew
	workers: 1,
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['list'], ['github']] : 'list',
	use: {
		browserName: 'chromium',
		baseURL: 'http://localhost:4173/studio2/',
		viewport: { width: 1600, height: 1200 },
		launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
		// No service worker (build-plugins/serviceWorker.js), so every test loads the build
		// itself; the PWA tests in e2e/app.spec.ts turn it back on
		serviceWorkers: 'block',
	},
	webServer: {
		command: 'npm run preview -- --port 4173 --strictPort',
		url: 'http://localhost:4173/studio2/',
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});

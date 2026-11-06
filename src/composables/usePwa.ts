// src/composables/usePwa.ts
// Installing the app (a PWA) and using it offline, the page's side. The service worker itself
// is build-plugins/serviceWorker.js (dist/sw.js, builds only); the manifest is
// public/manifest.json.
// - Registers the service worker (builds only, so `npm run dev` never caches anything).
// - A new version (a deploy) installs in the background, then waits: `updateReady` shows the
//   "New version" notice (PwaNotice.vue). Reload tells it to take over and reloads the page
//   (with the unsaved-changes prompt as usual); Later leaves it for the next time the app opens.
//   The very first install isn't an update and shows nothing. An app left open checks for a
//   new version every hour.
// - `canInstall`: Chrome and Edge offered to install the app (beforeinstallprompt), so File →
//   Install app… can show their install dialog. Their own install button in the address bar
//   works too.
// - `keepProjects()`: asks the browser not to clear the saved projects when the disk runs low
//   (persistent storage). Chrome grants it without asking to an installed app; Firefox asks
//   once. It's called when the installed app opens and after the first Save of a visit.

import { reactive } from 'vue';

const CHECK_MS = 60 * 60 * 1000;

type Worker = { state?: string; postMessage(msg: unknown): void; addEventListener(type: 'statechange', fn: () => void): void };
type Registration = {
	waiting: Worker | null;
	installing: Worker | null;
	update(): Promise<unknown>;
	addEventListener(type: 'updatefound', fn: () => void): void;
};
type InstallPromptEvent = { preventDefault(): void; prompt(): Promise<unknown>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export type PwaEnv = {
	serviceWorker: {
		controller: unknown;
		register(url: string, options: { scope: string }): Promise<Registration>;
		addEventListener(type: 'controllerchange', fn: () => void): void;
	} | null;
	window: { addEventListener(type: string, fn: (e: any) => void): void };
	standalone: boolean;
	storage: { persisted(): Promise<boolean>; persist(): Promise<boolean> } | null;
	reload(): void;
	every(ms: number, fn: () => void): void;
};

export function createPwa(env: PwaEnv) {
	const state = reactive({
		updateReady: false,   // a new version is waiting
		canInstall: false,    // the browser offered to install the app
		standalone: env.standalone, // running as the installed app
	});
	let waiting: Worker | null = null;
	let updating = false;
	let installEvent: InstallPromptEvent | null = null;
	let askedToKeep = false;

	// A new version is installed and waiting, while this page runs the previous one (the first
	// install has no previous one: no controller)
	function offer(worker: Worker) {
		if (!env.serviceWorker?.controller) return;
		waiting = worker;
		state.updateReady = true;
	}

	async function register(url: string, scope: string) {
		const sw = env.serviceWorker;
		if (!sw) return;
		// The new version took over because Reload was clicked (not the first install's claim)
		sw.addEventListener('controllerchange', () => { if (updating) env.reload(); });
		const reg = await sw.register(url, { scope });
		if (reg.waiting) offer(reg.waiting);
		reg.addEventListener('updatefound', () => {
			const worker = reg.installing;
			worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offer(worker); });
		});
		env.every(CHECK_MS, () => { reg.update().catch(() => { }); });
	}

	function applyUpdate() {
		if (!waiting) return;
		updating = true;
		waiting.postMessage('skip-waiting');
	}

	function dismissUpdate() {
		state.updateReady = false;
	}

	env.window.addEventListener('beforeinstallprompt', (e: InstallPromptEvent) => {
		e.preventDefault(); // no mini-infobar on phones; File → Install app… instead
		installEvent = e;
		state.canInstall = true;
	});
	env.window.addEventListener('appinstalled', () => {
		installEvent = null;
		state.canInstall = false;
	});

	// The browser's install dialog; what the person chose, or null if it can't be shown
	async function install(): Promise<'accepted' | 'dismissed' | null> {
		const e = installEvent;
		if (!e) return null;
		installEvent = null;
		state.canInstall = false;
		await e.prompt();
		return (await e.userChoice).outcome;
	}

	async function keepProjects() {
		if (askedToKeep || !env.storage) return;
		askedToKeep = true;
		try {
			if (!(await env.storage.persisted())) await env.storage.persist();
		} catch { /* not supported: the browser decides */ }
	}

	return { state, register, applyUpdate, dismissUpdate, install, keepProjects };
}

export type Pwa = ReturnType<typeof createPwa>;

let pwa: Pwa | null = null;

// The app's one PWA helper
export function usePwa(): Pwa {
	if (pwa) return pwa;
	const nav = navigator as any;
	pwa = createPwa({
		serviceWorker: 'serviceWorker' in nav ? nav.serviceWorker : null,
		window,
		standalone: !!window.matchMedia?.('(display-mode: standalone)').matches,
		storage: nav.storage?.persist ? nav.storage : null,
		reload: () => location.reload(),
		every: (ms, fn) => { window.setInterval(fn, ms); },
	});
	if (pwa.state.standalone) {
		pwa.keepProjects();
		(window as any).gtag?.('event', 'pwa_launch');
	}
	if (import.meta.env.PROD) {
		// After the page has loaded, so saving the files doesn't slow down its first start
		const base = import.meta.env.BASE_URL;
		const start = () => pwa!.register(`${base}sw.js`, base).catch((err) => console.warn('Service worker not registered:', err));
		if (document.readyState === 'complete') start();
		else window.addEventListener('load', start, { once: true });
	}
	return pwa;
}

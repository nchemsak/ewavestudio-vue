import { describe, it, expect, vi } from 'vitest';
import { createPwa } from './usePwa';
import { precacheList, SKIP } from '../../build-plugins/serviceWorker.js';

// --- A fake browser: service worker container, registration, workers, window events ---------

function fakeWorker() {
	const listeners: (() => void)[] = [];
	const w = {
		state: 'installing',
		messages: [] as unknown[],
		postMessage(m: unknown) { w.messages.push(m); },
		addEventListener(_type: string, fn: () => void) { listeners.push(fn); },
		become(state: string) { w.state = state; listeners.forEach((f) => f()); },
	};
	return w;
}

function setup({ controller = {} as unknown, waiting = null as ReturnType<typeof fakeWorker> | null, persisted = false } = {}) {
	const found: (() => void)[] = [];
	const reg = {
		waiting,
		installing: null as ReturnType<typeof fakeWorker> | null,
		checks: 0,
		async update() { reg.checks++; },
		addEventListener(_type: string, fn: () => void) { found.push(fn); },
		// The browser found a new sw.js and starts installing it
		newVersion() { const w = fakeWorker(); reg.installing = w; found.forEach((f) => f()); return w; },
	};
	const swListeners: (() => void)[] = [];
	const winListeners: Record<string, ((e: any) => void)[]> = {};
	const timers: { ms: number; fn: () => void }[] = [];
	const env = {
		serviceWorker: {
			controller,
			register: vi.fn(async () => reg),
			addEventListener(_type: string, fn: () => void) { swListeners.push(fn); },
		},
		window: { addEventListener(type: string, fn: (e: any) => void) { (winListeners[type] ??= []).push(fn); } },
		standalone: false,
		storage: { persisted: vi.fn(async () => persisted), persist: vi.fn(async () => true) },
		reload: vi.fn(),
		every: (ms: number, fn: () => void) => { timers.push({ ms, fn }); },
	};
	const pwa = createPwa(env);
	return {
		pwa, env, reg, timers,
		controllerChange: () => swListeners.forEach((f) => f()),
		fire: (type: string, e: unknown = {}) => winListeners[type]?.forEach((f) => f(e)),
	};
}

describe('the installed app (PWA), page side', () => {
	it("registers the service worker for the app's folder only, and shows nothing on the first install", async () => {
		const { pwa, env, reg } = setup({ controller: null });
		await pwa.register('/studio2/sw.js', '/studio2/');
		expect(env.serviceWorker.register).toHaveBeenCalledWith('/studio2/sw.js', { scope: '/studio2/' });
		reg.newVersion().become('installed');
		expect(pwa.state.updateReady).toBe(false);
	});

	it('offers a new version installed while the app is open, and Reload hands over to it', async () => {
		const { pwa, env, reg, controllerChange } = setup();
		await pwa.register('/studio2/sw.js', '/studio2/');
		const next = reg.newVersion();
		expect(pwa.state.updateReady).toBe(false); // still downloading
		next.become('installed');
		expect(pwa.state.updateReady).toBe(true);

		pwa.applyUpdate();
		expect(next.messages).toEqual(['skip-waiting']);
		expect(env.reload).not.toHaveBeenCalled(); // not until it has taken over
		controllerChange();
		expect(env.reload).toHaveBeenCalledTimes(1);
	});

	it("doesn't reload when a worker takes over by itself (the first install), and Later hides the notice", async () => {
		const waiting = fakeWorker();
		const { pwa, env, controllerChange } = setup({ waiting });
		await pwa.register('/studio2/sw.js', '/studio2/');
		expect(pwa.state.updateReady).toBe(true); // a version already waiting when the page opened
		controllerChange();
		expect(env.reload).not.toHaveBeenCalled();
		pwa.dismissUpdate();
		expect(pwa.state.updateReady).toBe(false);
		expect(waiting.messages).toEqual([]);
	});

	it('checks for a new version every hour while the app stays open', async () => {
		const { pwa, reg, timers } = setup();
		await pwa.register('/studio2/sw.js', '/studio2/');
		expect(timers.map((t) => t.ms)).toEqual([60 * 60 * 1000]);
		timers[0].fn();
		expect(reg.checks).toBe(1);
	});

	it('does nothing where service workers are missing', async () => {
		const pwa = createPwa({ ...setup().env, serviceWorker: null });
		await expect(pwa.register('/studio2/sw.js', '/studio2/')).resolves.toBeUndefined();
		expect(pwa.state.updateReady).toBe(false);
	});

	it("shows the browser's install dialog while the browser offers it", async () => {
		const { pwa, fire } = setup();
		expect(pwa.state.canInstall).toBe(false);
		expect(await pwa.install()).toBeNull();
		const offer = {
			preventDefault: vi.fn(),
			prompt: vi.fn(async () => { }),
			userChoice: Promise.resolve({ outcome: 'accepted' as const }),
		};
		fire('beforeinstallprompt', offer);
		expect(offer.preventDefault).toHaveBeenCalled();
		expect(pwa.state.canInstall).toBe(true);
		expect(await pwa.install()).toBe('accepted');
		expect(offer.prompt).toHaveBeenCalledTimes(1);
		expect(pwa.state.canInstall).toBe(false); // a prompt can be shown once
		expect(await pwa.install()).toBeNull();

		// Installed some other way (the address bar's button)
		fire('beforeinstallprompt', { ...offer, preventDefault: vi.fn() });
		fire('appinstalled');
		expect(pwa.state.canInstall).toBe(false);
	});

	it('asks the browser once a visit to keep the saved projects', async () => {
		const { pwa, env } = setup();
		await pwa.keepProjects();
		await pwa.keepProjects();
		expect(env.storage.persist).toHaveBeenCalledTimes(1);

		const kept = setup({ persisted: true });
		await kept.pwa.keepProjects();
		expect(kept.env.storage.persist).not.toHaveBeenCalled();
	});
});

describe("the service worker's file list (build-plugins/serviceWorker.js)", () => {
	const file = (path: string, text: string) => ({ path, data: new TextEncoder().encode(text) });

	it('lists every built file with its SHA-256, but not the worker itself, dot files, maps or unused files', async () => {
		const list = await precacheList([
			file('index.html', 'abc'),
			file('assets/index-1.js', 'js'),
			file('sw.js', 'old worker'),
			file('.htaccess', 'x'),
			file('assets/index-1.js.map', '{}'),
			file(SKIP[0], 'gif'),
			file('audio/kick.mp3', 'mp3'),
		]);
		expect(list.files.map((f) => f.url)).toEqual(['assets/index-1.js', 'audio/kick.mp3', 'index.html']);
		expect(list.files[2].hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); // SHA-256 of "abc"
		expect(list.version).toMatch(/^[0-9a-f]{12}$/);
	});

	it('gets a new version when any file changes, and only then', async () => {
		const files = [file('index.html', 'abc'), file('assets/a.js', 'one')];
		const first = await precacheList(files);
		expect((await precacheList([...files].reverse())).version).toBe(first.version);
		expect((await precacheList([files[0], file('assets/a.js', 'two')])).version).not.toBe(first.version);
		expect((await precacheList([...files, file('icons/new.png', 'png')])).version).not.toBe(first.version);
		// A change to the service worker's own code is a new version too
		expect((await precacheList(files, 'worker v2')).version).not.toBe(first.version);
	});
});

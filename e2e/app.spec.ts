import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PRESETS } from '../src/lib/presets/library';
import { PATTERNS } from '../src/lib/patterns/library';
import { noteHz } from '../src/lib/patterns/patterns';
import { padHue } from '../src/lib/padColour';
import { DETENT_HOLD, SWING_DETENTS, TEMPO_DETENTS } from '../src/lib/knobDetents';
import { waveSeries } from '../src/audio/waves';

// Injected before the app loads. Keeps a handle on the app's AudioContext (__ctx), records
// every note it schedules, tracks nodes that feed an audio parameter (the per-note LFO taps),
// taps the output for level measurements (__peakOver), tracks keydown listeners on window,
// and lets a test pause requestAnimationFrame the way browsers do in a hidden tab.
function instrument() {
	const w = window as any;
	const OrigAudioContext = window.AudioContext;
	window.AudioContext = class extends OrigAudioContext {
		constructor(...args: any[]) {
			super(...args);
			w.__ctx = this;
		}
	} as typeof AudioContext;
	w.__starts = [];
	const origStart = AudioScheduledSourceNode.prototype.start;
	AudioScheduledSourceNode.prototype.start = function (this: AudioScheduledSourceNode, when = 0, ...rest: any[]) {
		if (this.context instanceof AudioContext) {
			w.__starts.push({ osc: this instanceof OscillatorNode, when, now: this.context.currentTime });
		}
		return (origStart as any).call(this, when, ...rest);
	};
	w.__paramSources = new Set();
	const origConnect = AudioNode.prototype.connect;
	(AudioNode.prototype as any).connect = function (dest: any, ...rest: any[]) {
		if (dest instanceof AudioParam && this.context instanceof AudioContext) w.__paramSources.add(this);
		if (dest instanceof AudioDestinationNode && this.context instanceof AudioContext) {
			// Whatever goes to the speakers also goes to a probe the tests can measure
			if (!w.__probe) {
				w.__probe = this.context.createAnalyser();
				w.__probe.fftSize = 4096;
				// Chromium stops updating an analyser whose input has gone silent, so it would
				// keep showing the last sound. A silent source keeps it reading the real level.
				const keepAlive = this.context.createConstantSource();
				keepAlive.offset.value = 1e-6; // zero would count as silent too
				(origConnect as any).call(keepAlive, w.__probe);
				(origStart as any).call(keepAlive);
				// And each channel on its own (ping-pong)
				w.__split = this.context.createChannelSplitter(2);
				w.__probeLR = [0, 1].map((ch) => {
					const a = this.context.createAnalyser();
					a.fftSize = 1024;
					(origConnect as any).call(w.__split, a, ch);
					(origConnect as any).call(keepAlive, a);
					return a;
				});
			}
			(origConnect as any).call(this, w.__probe);
			(origConnect as any).call(this, w.__split);
		}
		return (origConnect as any).call(this, dest, ...rest);
	};
	// Loudest sample reaching the speakers during the next `ms` milliseconds
	w.__peakOver = (ms: number) => new Promise<number>((resolve) => {
		const probe: AnalyserNode = w.__probe;
		const buf = new Float32Array(probe.fftSize);
		let peak = 0;
		const id = setInterval(() => {
			probe.getFloatTimeDomainData(buf);
			for (const x of buf) peak = Math.max(peak, Math.abs(x));
		}, 15);
		setTimeout(() => { clearInterval(id); resolve(peak); }, ms);
	});
	// The left and right peaks at the speakers, every 15 ms for the next `ms` milliseconds
	w.__channelPeaksOver = (ms: number) => new Promise<number[][]>((resolve) => {
		const bufs = [new Float32Array(1024), new Float32Array(1024)];
		const out: number[][] = [];
		const id = setInterval(() => {
			out.push(w.__probeLR.map((a: AnalyserNode, i: number) => {
				a.getFloatTimeDomainData(bufs[i]);
				let peak = 0;
				for (const x of bufs[i]) peak = Math.max(peak, Math.abs(x));
				return peak;
			}));
		}, 15);
		setTimeout(() => { clearInterval(id); resolve(out); }, ms);
	});
	// Peak-to-peak swing at the speakers during the next `ms` milliseconds. Unlike __peakOver it
	// ignores a steady offset: the output carries a small constant one (about 0.004) from the
	// drive stage, even when nothing is playing.
	w.__swingOver = (ms: number) => new Promise<number>((resolve) => {
		const probe: AnalyserNode = w.__probe;
		const buf = new Float32Array(probe.fftSize);
		let lo = Infinity, hi = -Infinity;
		const id = setInterval(() => {
			probe.getFloatTimeDomainData(buf);
			for (const x of buf) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
		}, 15);
		setTimeout(() => { clearInterval(id); resolve(hi - lo); }, ms);
	});
	// Keydown listeners on window, as (listener, capture) pairs, which is what identifies one
	w.__keydown = [];
	const captureOf = (opts: any) => (typeof opts === 'boolean' ? opts : !!opts?.capture);
	const origAdd = EventTarget.prototype.addEventListener;
	EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, fn: any, opts?: any) {
		if (this === window && type === 'keydown' && fn
			&& !w.__keydown.some((l: any) => l.fn === fn && l.capture === captureOf(opts))) {
			w.__keydown.push({ fn, capture: captureOf(opts) });
		}
		return (origAdd as any).call(this, type, fn, opts);
	};
	const origRemove = EventTarget.prototype.removeEventListener;
	EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, fn: any, opts?: any) {
		if (this === window && type === 'keydown') {
			const i = w.__keydown.findIndex((l: any) => l.fn === fn && l.capture === captureOf(opts));
			if (i >= 0) w.__keydown.splice(i, 1);
		}
		return (origRemove as any).call(this, type, fn, opts);
	};
	const origDisconnect = AudioNode.prototype.disconnect;
	(AudioNode.prototype as any).disconnect = function (...args: any[]) {
		if (args.length === 0) w.__paramSources.delete(this);
		return (origDisconnect as any).apply(this, args);
	};
	// The automation on each live note's oscillator detune (the pitch envelope's sweep):
	// [kind, value, time, timeConstant?]
	w.__detuneCalls = [];
	const detunes = new WeakSet();
	const origCreateOsc = BaseAudioContext.prototype.createOscillator;
	BaseAudioContext.prototype.createOscillator = function (this: BaseAudioContext) {
		const osc = origCreateOsc.call(this);
		if (this instanceof AudioContext) detunes.add(osc.detune);
		return osc;
	};
	// ...and on each live note's filter detune (the filter envelope's sweep)
	w.__filterDetuneCalls = [];
	const filterDetunes = new WeakSet();
	const origCreateBiquad = BaseAudioContext.prototype.createBiquadFilter;
	BaseAudioContext.prototype.createBiquadFilter = function (this: BaseAudioContext) {
		const f = origCreateBiquad.call(this);
		if (this instanceof AudioContext) filterDetunes.add(f.detune);
		return f;
	};
	const origSetValue = AudioParam.prototype.setValueAtTime;
	AudioParam.prototype.setValueAtTime = function (this: AudioParam, v: number, t: number) {
		if (detunes.has(this)) w.__detuneCalls.push(['set', v, t]);
		if (filterDetunes.has(this)) w.__filterDetuneCalls.push(['set', v, t]);
		return origSetValue.call(this, v, t);
	};
	const origSetTarget = AudioParam.prototype.setTargetAtTime;
	AudioParam.prototype.setTargetAtTime = function (this: AudioParam, v: number, t: number, tau: number) {
		if (detunes.has(this)) w.__detuneCalls.push(['target', v, t, tau]);
		if (filterDetunes.has(this)) w.__filterDetuneCalls.push(['target', v, t, tau]);
		return origSetTarget.call(this, v, t, tau);
	};
	// Counts JSON.stringify calls that turn a whole project snapshot into text (anything that
	// long), to check that change tracking doesn't do it on every change
	w.__bigJson = 0;
	const origStringify = JSON.stringify;
	JSON.stringify = function (...args: any[]) {
		const out = (origStringify as any).apply(JSON, args);
		if (typeof out === 'string' && out.length > 2000) w.__bigJson++;
		return out;
	} as typeof JSON.stringify;
	w.__rafPaused = false;
	const queued: FrameRequestCallback[] = [];
	const origRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = (cb) => (w.__rafPaused ? (queued.push(cb), 0) : origRaf(cb));
	w.__resumeRaf = () => {
		w.__rafPaused = false;
		queued.splice(0).forEach((cb) => origRaf(cb));
	};
}

const notesPlayed = (page: Page) =>
	page.evaluate(() => (window as any).__starts.filter((s: any) => s.osc).length as number);
const scheduledCount = (page: Page) => page.evaluate(() => (window as any).__starts.length as number);
// Notes scheduled more than 50 ms in the past, i.e. played late, all at once
const lateNotes = (page: Page, from: number) =>
	page.evaluate((from) => (window as any).__starts.slice(from)
		.filter((s: any) => s.osc && s.now - s.when > 0.05).length as number, from);

const pads = (page: Page) => page.locator('.pad-row .padTEST');
const screenView = (page: Page) => page.locator('.fkey[aria-pressed="true"]');
// The two preset boxes in the transport card
const soundsBox = (page: Page) => page.getByRole('group', { name: 'Sound presets', exact: true });
const patternsBox = (page: Page) => page.getByRole('group', { name: 'Pattern presets', exact: true });

let problems: string[] = [];

test.beforeEach(async ({ page }) => {
	problems = [];
	// Never send test visits to the real analytics account
	await page.route(/googletagmanager\.com/, (route) =>
		route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
	page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
	page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
	page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`));
	await page.addInitScript(instrument);
	await page.goto('./');
	await expect(pads(page)).toHaveCount(16);
});

test.afterEach(() => {
	expect(problems, 'page errors or failed requests').toEqual([]);
});

async function turnOnPads(page: Page, indexes: number[]) {
	for (const i of indexes) await pads(page).nth(i).click();
}

// The tempo, one BPM per arrow key (for tests whose timings were worked out at a given tempo)
async function setTempo(page: Page, bpm: number) {
	const tempo = page.getByRole('slider', { name: 'Tempo', exact: true });
	const now = Number(await tempo.getAttribute('aria-valuenow'));
	await tempo.focus();
	for (let i = 0; i < Math.abs(bpm - now); i++) await page.keyboard.press(bpm > now ? 'ArrowUp' : 'ArrowDown');
	await expect(tempo).toHaveAttribute('aria-valuenow', String(bpm));
	await tempo.blur();
}

test('loads as version 2 with the synth lane and the four screen views', async ({ page }) => {
	await expect(page).toHaveTitle('Ephemeral Wave Synth 2');
	await expect(page.locator('.fkey')).toHaveCount(4);
	await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('plays the pattern, and keeps playing while the tab is in the background', async ({ page }) => {
	await turnOnPads(page, [0, 2, 4, 6, 8, 10, 12, 14]);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(1500);
	expect(await notesPlayed(page)).toBeGreaterThan(0);

	// Browsers stop requestAnimationFrame in hidden tabs; playback must not depend on it
	await page.evaluate(() => { (window as any).__rafPaused = true; });
	const before = await notesPlayed(page);
	await page.waitForTimeout(2000);
	expect(await notesPlayed(page) - before).toBeGreaterThanOrEqual(3);

	// Coming back must not fire a burst of missed notes
	const from = await scheduledCount(page);
	await page.evaluate(() => (window as any).__resumeRaf());
	await page.waitForTimeout(600);
	expect(await lateNotes(page, from)).toBeLessThanOrEqual(1);

	await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('skips missed steps after the page freezes, instead of playing them all at once', async ({ page }) => {
	await turnOnPads(page, [0, 2, 4, 6, 8, 10, 12, 14]);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(1000);
	const from = await scheduledCount(page);
	await page.evaluate(() => { const t = performance.now(); while (performance.now() - t < 1500) { /* frozen */ } });
	await page.waitForTimeout(600);
	expect(await lateNotes(page, from)).toBeLessThanOrEqual(1);
	expect(await notesPlayed(page)).toBeGreaterThan(0);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test("disconnects each note's LFO tap when the note ends", async ({ page }) => {
	await turnOnPads(page, [0, 2, 4, 6, 8, 10, 12, 14]);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(3000);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await page.waitForTimeout(1500);
	expect(await notesPlayed(page)).toBeGreaterThanOrEqual(6);
	// Before the fix, every note played stayed connected
	expect(await page.evaluate(() => (window as any).__paramSources.size)).toBeLessThanOrEqual(2);
});

test('the built page has the Google Analytics tag (stubbed out here)', async ({ page }) => {
	// The build adds it (build-plugins/googleAnalytics.js); `npm run dev` doesn't
	const tag = await page.evaluate(() => ({
		gtag: typeof (window as any).gtag,
		config: ((window as any).dataLayer ?? []).some((a: any) => a[0] === 'config' && a[1] === 'G-ZZ1T0XVYLJ'),
		script: !!document.querySelector('script[src^="https://www.googletagmanager.com/gtag/js"]'),
	}));
	expect(tag).toEqual({ gtag: 'function', config: true, script: true });
});

test('number keys 1–4 switch the screen view, except while typing', async ({ page }) => {
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	for (const [key, title] of [['2', 'Spectrogram'], ['3', 'Tuner'], ['4', 'Envelope'], ['1', 'Oscilloscope']]) {
		await page.keyboard.press(key);
		await expect(screenView(page)).toHaveAttribute('title', title);
	}
	const name = page.getByRole('textbox', { name: 'Project name' });
	await name.click();
	await page.keyboard.type('23');
	await expect(screenView(page)).toHaveAttribute('title', 'Oscilloscope');
});

test('the spectrogram draws a note in its pad\'s colour', async ({ page }) => {
	// Every pad on A3 (220 Hz, a blue pad), the default sine
	await turnOnPads(page, [0, 4, 8, 12]);
	const padHueNow = await pads(page).nth(0).evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--heat-h')));
	expect(padHueNow).toBe(padHue(220));
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('2');
	await expect(screenView(page)).toHaveAttribute('title', 'Spectrogram');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(2500);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	// The hues drawn in the lowest fifth of the screen, where the note's fundamental is
	const hues = await page.locator('.nac-screen__lcd canvas').nth(1).evaluate((c: HTMLCanvasElement) => {
		const ctx = c.getContext('2d')!;
		const { data } = ctx.getImageData(0, Math.floor(c.height * 0.8), c.width, Math.floor(c.height * 0.2));
		// The screen's background: the most common colour of what's been drawn (columns not yet
		// scrolled in are still transparent)
		const counts = new Map<number, number>();
		for (let i = 0; i < data.length; i += 4) {
			if (data[i + 3] < 255) continue;
			const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
			counts.set(k, (counts.get(k) ?? 0) + 1);
		}
		const bgKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
		const bg = [bgKey >> 16, (bgKey >> 8) & 255, bgKey & 255];
		const out: number[] = [];
		for (let i = 0; i < data.length; i += 4) {
			if (data[i + 3] < 255) continue;
			if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) < 40) continue;
			const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
			const max = Math.max(r, g, b), min = Math.min(r, g, b);
			if (max - min < 0.15) continue; // greys
			const d = max - min;
			let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
			h = Math.round(h * 60);
			out.push(h < 0 ? h + 360 : h);
		}
		return out;
	});
	expect(hues.length, 'the note is drawn').toBeGreaterThan(20);
	// Most of what's drawn there is the pad's blue (hue 206), give or take rounding
	const near = hues.filter((h) => Math.abs(h - padHue(220)) <= 12).length;
	expect(near / hues.length).toBeGreaterThan(0.6);
});

test('knobs work from the keyboard, and turning Attack shows the envelope until focus moves on', async ({ page }) => {
	// One step per arrow on a knob with few steps (tempo: 1 BPM)
	const tempo = page.getByRole('slider', { name: 'Tempo', exact: true });
	await expect(tempo).toHaveAttribute('aria-valuenow', '120');
	await tempo.focus();
	await page.keyboard.press('ArrowUp');
	await expect(tempo).toHaveAttribute('aria-valuenow', '121');
	await page.keyboard.press('ArrowLeft');
	await expect(tempo).toHaveAttribute('aria-valuenow', '120');
	await page.keyboard.press('Shift+ArrowUp'); // about 10% of 20..300
	await expect(tempo).toHaveAttribute('aria-valuenow', '148');
	await page.keyboard.press('End');
	await expect(tempo).toHaveAttribute('aria-valuenow', '300');
	await page.keyboard.press('Home');
	await expect(tempo).toHaveAttribute('aria-valuenow', '20');
	expect((JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'))).data.transport.tempo).toBe(20);

	// About 1% of the range on a knob with many steps (cutoff: 100..10000 Hz in 1 Hz steps),
	// and a value a screen reader can say
	const cutoff = page.getByRole('slider', { name: 'Cutoff' });
	await expect(cutoff).toHaveAttribute('aria-valuetext', '5000 Hz');
	await cutoff.focus();
	await page.keyboard.press('ArrowDown');
	await expect(cutoff).toHaveAttribute('aria-valuetext', '4901 Hz');

	// Turning an envelope knob shows the envelope view, as dragging it does, until the knob
	// loses focus (moving on from Cutoff ends its filter view first)
	const attack = page.getByRole('slider', { name: 'Attack' });
	await attack.focus();
	await expect(screenView(page)).toHaveAttribute('title', 'Oscilloscope'); // focus alone changes nothing
	await page.keyboard.press('ArrowUp');
	await expect(screenView(page)).toHaveAttribute('title', 'Envelope');
	await expect(attack).toHaveAttribute('aria-valuetext', /^\d+ ms$/);
	await page.keyboard.press('Tab');
	await expect(screenView(page)).toHaveAttribute('title', 'Oscilloscope');
});

test('turning Cutoff or Resonance shows the filter curve until the knob is let go', async ({ page }) => {
	const filterCanvas = page.locator('.nac-screen__lcd canvas').nth(4);
	const cutoff = page.getByRole('slider', { name: 'Cutoff', exact: true });
	const resonance = page.getByRole('slider', { name: 'Resonance', exact: true });
	const picture = () => filterCanvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
	await expect(screenView(page)).toHaveAttribute('title', 'Oscilloscope');
	await expect(filterCanvas).toBeHidden();

	// No F-key of its own: none is lit while it shows
	await cutoff.focus();
	await page.keyboard.press('ArrowDown');
	await expect(filterCanvas).toBeVisible();
	await expect(page.locator('.fkey[aria-pressed="true"]')).toHaveCount(0);

	// The curve follows the knobs
	await page.waitForTimeout(100);
	const before = await picture();
	await page.keyboard.press('PageDown');
	await expect.poll(picture).not.toBe(before);
	const lower = await picture();
	await resonance.focus(); // still the filter view
	await page.keyboard.press('PageUp');
	await expect(filterCanvas).toBeVisible();
	await expect.poll(picture).not.toBe(lower);

	// Let go: back to the view it was on
	await page.keyboard.press('Tab');
	await expect(filterCanvas).toBeHidden();
	await expect(screenView(page)).toHaveAttribute('title', 'Oscilloscope');

	// Picking another view while turning keeps that view afterwards
	await cutoff.focus();
	await page.keyboard.press('ArrowUp');
	await expect(filterCanvas).toBeVisible();
	await page.keyboard.press('2');
	await expect(screenView(page)).toHaveAttribute('title', 'Spectrogram');
	await page.keyboard.press('Tab');
	await expect(screenView(page)).toHaveAttribute('title', 'Spectrogram');
});

test('the step pads are one Tab stop: arrows move, Enter switches a pad, Space still plays', async ({ page }) => {
	const pad = (i: number) => pads(page).nth(i);
	const inTabOrder = page.locator('.pad-row .padTEST[tabindex="0"]');
	await expect(inTabOrder).toHaveCount(1);

	// Tab from the first pad's settings button reaches the pads
	await page.locator('.pad-row .pad-settings-dot').first().focus();
	await page.keyboard.press('Tab');
	await expect(pad(0)).toBeFocused();
	await expect(pad(0)).toHaveAttribute('aria-label', 'Step 1');

	await page.keyboard.press('Enter');
	await expect(pad(0)).toHaveAttribute('aria-pressed', 'true');
	await expect(pad(0)).toHaveAttribute('aria-label', /^Step 1, [A-G]/); // with its note

	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(pad(2)).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(2);
	await expect(inTabOrder).toHaveCount(1);
	await expect(pad(2)).toHaveAttribute('tabindex', '0'); // Tab comes back here

	await page.keyboard.press('End');
	await expect(pad(15)).toBeFocused();
	await page.keyboard.press('ArrowRight'); // already at the end
	await expect(pad(15)).toBeFocused();
	await page.keyboard.press('Home');
	await expect(pad(0)).toBeFocused();

	// Space plays and stops, as everywhere, and leaves the pad alone
	await page.keyboard.press('Space');
	await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
	await page.keyboard.press('Space');
	await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	await expect(pad(0)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(2);
});

test("saves a project, restores it after a reload, and keeps it in /studio2/'s own storage", async ({ page }) => {
	await turnOnPads(page, [0, 5, 10]);
	await page.getByRole('button', { name: 'Arpeggio', exact: true }).click();
	await page.getByRole('button', { name: 'Arp pattern' }).click();
	await page.getByRole('option', { name: 'Down', exact: true }).click();
	await page.getByRole('button', { name: 'Arp rate' }).click();
	await page.getByRole('option', { name: '1/8', exact: true }).click();
	const name = page.getByRole('textbox', { name: 'Project name' });
	await name.fill('E2E Song');
	await name.press('Enter');
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+s');

	// Wait until the save has reached IndexedDB
	await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
		const req = indexedDB.open('ewave-studio2-db');
		req.onsuccess = () => {
			const id = localStorage.getItem('ewave-studio2:lastProjectId');
			const get = req.result.transaction('projects').objectStore('projects').get(id!);
			get.onsuccess = () => resolve(get.result?.meta?.name ?? null);
			get.onerror = () => resolve(null);
		};
		req.onerror = () => resolve(null);
	}))).toBe('E2E Song');

	const storage = await page.evaluate(async () => ({
		databases: (await indexedDB.databases()).map((d) => d.name),
		keys: Object.keys(localStorage),
	}));
	expect(storage.databases).toContain('ewave-studio2-db');
	expect(storage.databases).not.toContain('ewave-db'); // the original /studio/ app's database
	for (const key of storage.keys) expect(key.startsWith('ewave-studio2:'), key).toBe(true);

	await page.reload();
	await expect(pads(page)).toHaveCount(16);
	await expect(name).toHaveValue('E2E Song');
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(3);
	await expect(page.getByRole('button', { name: 'Arpeggio', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: 'Arp pattern' })).toContainText('Down');
	await expect(page.getByRole('button', { name: 'Arp rate' })).toContainText('1/8');
});

test('exports a WAV file with sound in it, and a project file that imports again', async ({ page }) => {
	await turnOnPads(page, [0, 3, 6, 10]);
	const name = page.getByRole('textbox', { name: 'Project name' });
	await name.fill('Export Test');
	await name.press('Enter');

	const bytes = await exportWav(page);
	expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
	expect(bytes.subarray(8, 12).toString('latin1')).toBe('WAVE');
	expect(bytes.readUInt16LE(20)).toBe(3); // 32-bit float
	let peak = 0;
	for (let i = 44; i + 4 <= bytes.length; i += 4) peak = Math.max(peak, Math.abs(bytes.readFloatLE(i)));
	expect(peak).toBeGreaterThan(0.01);

	if (!(await page.getByRole('menuitem', { name: 'Export file' }).isVisible())) {
		await page.getByRole('button', { name: 'File ▾' }).click();
	}
	const [json] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('menuitem', { name: 'Export file' }).click(),
	]);
	const projectFile = (await json.path())!;

	if (!(await page.getByRole('menuitem', { name: 'New' }).isVisible())) {
		await page.getByRole('button', { name: 'File ▾' }).click();
	}
	await page.getByRole('menuitem', { name: 'New' }).click();
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(0);

	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'Export Test.json',
		mimeType: 'application/json',
		buffer: readFileSync(projectFile),
	});
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(4);
	await expect(name).toHaveValue('Export Test');
});

// --- Second batch of fixes -----------------------------------------------------------------

async function chooseFromFileMenu(page: Page, item: string) {
	if (!(await page.getByRole('menuitem', { name: item }).isVisible())) {
		await page.getByRole('button', { name: 'File ▾' }).click();
	}
	await page.getByRole('menuitem', { name: item }).click();
}

async function downloadFromFileMenu(page: Page, item: string) {
	const [download] = await Promise.all([page.waitForEvent('download'), chooseFromFileMenu(page, item)]);
	return readFileSync((await download.path())!);
}

type ExportChoices = {
	bars?: 1 | 2 | 4 | 8; ending?: 'Loop' | 'With tail';
	mix?: boolean; stems?: boolean; midi?: boolean; oneShot?: boolean; oneShotNote?: string; normalize?: boolean;
};

// File → Export audio…, with these choices (the rest as the dialog has them); the download
async function exportAudio(page: Page, c: ExportChoices) {
	await chooseFromFileMenu(page, 'Export audio…');
	const dialog = page.getByRole('dialog', { name: 'Export audio' });
	await expect(dialog).toBeVisible();
	if (c.bars) await dialog.getByRole('group', { name: 'Bars' }).getByRole('button', { name: String(c.bars), exact: true }).click();
	if (c.ending) await dialog.getByRole('group', { name: 'Ending' }).getByRole('button', { name: c.ending, exact: true }).click();
	const boxes: [keyof ExportChoices, RegExp][] = [
		['mix', /^Mix/], ['stems', /^Effects stems/], ['midi', /^MIDI file/], ['oneShot', /^One-shot at/], ['normalize', /^Normalize/],
	];
	for (const [key, name] of boxes) {
		if (c[key] !== undefined) await dialog.getByRole('checkbox', { name }).setChecked(!!c[key]);
	}
	if (c.oneShotNote) await dialog.getByRole('combobox', { name: 'One-shot note' }).selectOption({ label: c.oneShotNote });
	const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export', exact: true }).click()]);
	await expect(dialog).toBeHidden();
	return { name: download.suggestedFilename(), bytes: readFileSync((await download.path())!) };
}

// As the File menu's "Export WAV" did before the Export audio dialog: one bar with its tail,
// the mix only, at the level it plays
async function exportWav(page: Page) {
	return (await exportAudio(page, {
		bars: 1, ending: 'With tail', mix: true, stems: false, midi: false, oneShot: false, normalize: false,
	})).bytes;
}

// The files in a stored (uncompressed) zip, by name
function unzip(bytes: Buffer) {
	const files: Record<string, Buffer> = {};
	const eocd = bytes.length - 22;
	expect(bytes.readUInt32LE(eocd)).toBe(0x06054b50);
	let at = bytes.readUInt32LE(eocd + 16);
	for (let i = 0; i < bytes.readUInt16LE(eocd + 10); i++) {
		const size = bytes.readUInt32LE(at + 24);
		const nameLen = bytes.readUInt16LE(at + 28);
		const local = bytes.readUInt32LE(at + 42);
		const name = bytes.subarray(at + 46, at + 46 + nameLen).toString('utf8');
		const dataAt = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
		files[name] = bytes.subarray(dataAt, dataAt + size);
		at += 46 + nameLen;
	}
	return files;
}

// A 32-bit float WAV file's samples (channel 0, or the channel given), sample rate and length
function wavSamples(bytes: Buffer, channel = 0) {
	const channels = bytes.readUInt16LE(22);
	const rate = bytes.readUInt32LE(24);
	const frames = Math.floor((bytes.length - 44) / 4 / channels);
	const samples = new Float32Array(frames);
	for (let i = 0; i < frames; i++) samples[i] = bytes.readFloatLE(44 + (i * channels + channel) * 4);
	return { rate, frames, samples };
}

// Peak and RMS of channel 0 from `fromS` to `toS` seconds into the file
function wavWindow(bytes: Buffer, fromS: number, toS: number) {
	const { rate, samples } = wavSamples(bytes);
	const part = samples.subarray(Math.round(fromS * rate), Math.round(toS * rate));
	let peak = 0, sq = 0;
	for (const x of part) { peak = Math.max(peak, Math.abs(x)); sq += x * x; }
	return { peak, rms: Math.sqrt(sq / Math.max(1, part.length)) };
}

// Zero crossings per millisecond of the first channel of a 32-bit float WAV file, from
// `fromMs` to `toMs` after the first sound: a rough measure of its pitch over time
function wavCrossingRate(bytes: Buffer, fromMs: number, toMs: number) {
	const channels = bytes.readUInt16LE(22);
	const rate = bytes.readUInt32LE(24);
	const n = Math.floor((bytes.length - 44) / 4 / channels);
	const at = (i: number) => bytes.readFloatLE(44 + i * channels * 4);
	let onset = 0;
	while (onset < n && Math.abs(at(onset)) < 1e-4) onset++;
	const a = onset + Math.round((fromMs / 1000) * rate);
	const b = Math.min(n, onset + Math.round((toMs / 1000) * rate));
	let crossings = 0;
	for (let i = a + 1; i < b; i++) if ((at(i - 1) < 0) !== (at(i) < 0)) crossings++;
	return crossings / (toMs - fromMs);
}

// Share of samples above 0, mean (DC) and RMS of the first channel of a 32-bit float WAV file,
// from `fromMs` to `toMs` after the first sound
function wavStats(bytes: Buffer, fromMs: number, toMs: number) {
	const channels = bytes.readUInt16LE(22);
	const rate = bytes.readUInt32LE(24);
	const n = Math.floor((bytes.length - 44) / 4 / channels);
	const at = (i: number) => bytes.readFloatLE(44 + i * channels * 4);
	let onset = 0;
	while (onset < n && Math.abs(at(onset)) < 1e-4) onset++;
	const a = onset + Math.round((fromMs / 1000) * rate);
	const b = Math.min(n, onset + Math.round((toMs / 1000) * rate));
	let above = 0, sum = 0, sq = 0;
	for (let i = a; i < b; i++) { const x = at(i); if (x > 0) above++; sum += x; sq += x * x; }
	const len = Math.max(1, b - a);
	return { above: above / len, mean: sum / len, rms: Math.sqrt(sq / len) };
}

// How long the first channel of a 32-bit float WAV file stays above `fraction` of its peak,
// in ms from the first sound: a note's length, for a single note
function wavSoundMs(bytes: Buffer, fraction = 0.01) {
	const channels = bytes.readUInt16LE(22);
	const rate = bytes.readUInt32LE(24);
	const n = Math.floor((bytes.length - 44) / 4 / channels);
	const at = (i: number) => bytes.readFloatLE(44 + i * channels * 4);
	let peak = 0;
	for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(at(i)));
	let first = -1, last = -1;
	for (let i = 0; i < n; i++) if (Math.abs(at(i)) > peak * fraction) { if (first < 0) first = i; last = i; }
	return ((last - first) / rate) * 1000;
}

// Loudest sample in a 32-bit float WAV file
function wavPeak(bytes: Buffer) {
	let peak = 0;
	for (let i = 44; i + 4 <= bytes.length; i += 4) peak = Math.max(peak, Math.abs(bytes.readFloatLE(i)));
	return peak;
}

test('asks before leaving with unsaved changes, and not once they are saved', async ({ page }) => {
	await turnOnPads(page, [0]);
	await expect(page.locator('.pc-dot')).toHaveClass(/\bunsaved\b/);

	const dialogs: string[] = [];
	page.on('dialog', async (dialog) => {
		dialogs.push(dialog.type());
		await dialog.dismiss(); // "Stay on page"
	});
	await page.close({ runBeforeUnload: true });
	await expect.poll(() => dialogs).toEqual(['beforeunload']);
	expect(page.isClosed()).toBe(false);

	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+s');
	await expect(page.locator('.pc-dot')).toHaveClass(/\bsaved\b/);
	await page.close({ runBeforeUnload: true });
	await expect.poll(() => page.isClosed()).toBe(true);
	expect(dialogs).toEqual(['beforeunload']); // no second prompt
});

test('MIDI notes wake the audio engine, even before Play has been pressed', async ({ page }) => {
	// A fake MIDI keyboard, installed before the app loads
	await page.addInitScript(() => {
		const w = window as any;
		w.__midiInput = { id: 'test-keyboard', name: 'Test Keyboard', onmidimessage: null };
		const access = { inputs: new Map([['test-keyboard', w.__midiInput]]), outputs: new Map(), onstatechange: null };
		(navigator as any).requestMIDIAccess = async () => access;
	});
	await page.reload();
	await expect(pads(page)).toHaveCount(16);
	const audioState = () => page.evaluate(() => (window as any).__ctx.state as string);

	// Visitors' browsers keep audio suspended until the page is clicked. The test browser
	// allows audio up front, so suspend it to start from what visitors get.
	await page.evaluate(() => (window as any).__ctx.suspend());
	await page.getByRole('button', { name: 'Enable MIDI' }).click();
	await expect.poll(audioState).toBe('running');
	await page.locator('#midi-input-select').selectOption('test-keyboard');

	// A key pressed while audio is suspended wakes it and plays
	await page.evaluate(() => (window as any).__ctx.suspend());
	const before = await notesPlayed(page);
	await page.evaluate(() => (window as any).__midiInput.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) }));
	await expect.poll(audioState).toBe('running');
	await expect.poll(() => notesPlayed(page)).toBeGreaterThan(before);
});

test('with the envelope off, notes are as loud as with it on, live and in WAV exports', async ({ page }) => {
	await turnOnPads(page, [0, 4, 8, 12]);
	// Square has the biggest loudness correction of the four waves
	await page.getByRole('radio', { name: 'SQUARE', exact: true }).click();

	const livePeak = async () => {
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		const peak = await page.evaluate(() => (window as any).__peakOver(1500) as Promise<number>);
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
		await page.waitForTimeout(600); // let the last note die away
		return peak;
	};
	const liveOn = await livePeak();
	const wavOn = wavPeak(await exportWav(page));

	// The Envelope switch is hidden in the interface, but saved projects can have the envelope
	// off; import one that does
	const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	expect(project.data.synth.envelope.enabled).toBe(true);
	project.data.synth.envelope.enabled = false;
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'envelope-off.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(project)),
	});
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(4);

	const liveOff = await livePeak();
	const wavOff = wavPeak(await exportWav(page));

	// Before the fix, square notes with the envelope off came out about twice as loud
	expect(liveOn).toBeGreaterThan(0.01);
	expect(wavOn).toBeGreaterThan(0.01);
	expect(liveOff / liveOn).toBeGreaterThan(0.8);
	expect(liveOff / liveOn).toBeLessThan(1.25);
	expect(wavOff / wavOn).toBeGreaterThan(0.8);
	expect(wavOff / wavOn).toBeLessThan(1.25);
});

test('delay, drive and reverb are in the signal path', async ({ page }) => {
	await turnOnPads(page, [0]);

	// Play pad 1 once, then measure what reaches the speakers after the note itself has
	// ended (attack 20 ms + decay 400 ms): only an effect can still be sounding then
	const tailSwing = async () => {
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await page.waitForTimeout(150);
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
		await page.waitForTimeout(750);
		const swing = await page.evaluate(() => (window as any).__swingOver(500) as Promise<number>);
		await page.waitForTimeout(3000); // let any tail die away before the next round
		return swing;
	};
	// Delay and Drive have no on/off switch in the interface; import a project that turns them on
	const importWith = async (name: string, fx: Record<string, any>) => {
		const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
		for (const [key, on] of Object.entries(fx)) project.data.fx[key].enabled = on;
		await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
			name: `${name}.json`,
			mimeType: 'application/json',
			buffer: Buffer.from(JSON.stringify(project)),
		});
		await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(1);
	};

	expect(await tailSwing()).toBeLessThan(0.0001); // dry: silent once the note has ended

	const reverbSwitch = page.locator('.fx .footswitch').last();
	await reverbSwitch.click();
	await expect(reverbSwitch).toHaveAttribute('aria-pressed', 'true');
	expect(await tailSwing()).toBeGreaterThan(0.0003); // the reverb tail is quiet at the default mix
	await reverbSwitch.click();
	await expect(reverbSwitch).toHaveAttribute('aria-pressed', 'false');

	await importWith('delay-on', { delay: true });
	expect(await tailSwing()).toBeGreaterThan(0.005);

	// Drive reroutes every note through the shaper; the notes must still be heard
	await importWith('drive-on', { delay: false, drive: true });
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const driven = await page.evaluate(() => (window as any).__swingOver(600) as Promise<number>);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	expect(driven).toBeGreaterThan(0.01);
});

// Imports the current project with `change` applied to its data (a fresh project id)
async function importChanged(page: Page, id: string, change: (data: any) => void) {
	const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	project.projectId = id;
	if (project.meta) project.meta.name = id;
	project.data.meta = { ...project.data.meta, name: id };
	change(project.data);
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: `${id}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
	});
	await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue(id);
}

test('the pedals’ CRUSH and PING PONG switches: greyed out while the pedal is off, saved, one undo step', async ({ page }) => {
	const projectFx = async () =>
		JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.fx;
	const pingPong = page.getByRole('switch', { name: 'Ping-pong delay' });
	const crush = page.getByRole('switch', { name: 'Bit crusher' });
	await expect(pingPong).toHaveAttribute('aria-checked', 'false');
	await expect(crush).toHaveAttribute('aria-checked', 'false');
	await expect(pingPong).toBeDisabled();
	await expect(crush).toBeDisabled();
	await page.waitForTimeout(SETTLED); // the opened project becomes the starting point

	await page.locator('.fx .footswitch').nth(0).click(); // delay on
	await page.locator('.fx .footswitch').nth(1).click(); // overdrive on
	await expect(pingPong).toBeEnabled();
	await page.waitForTimeout(SETTLED);
	await pingPong.click();
	await page.waitForTimeout(SETTLED);
	await crush.click();
	await page.waitForTimeout(SETTLED);
	await expect(pingPong).toHaveAttribute('aria-checked', 'true');
	await expect(crush).toHaveAttribute('aria-checked', 'true');
	const fx = await projectFx();
	expect(fx.delay.pingPong).toBe(true);
	expect(fx.drive.crush).toBe(true);

	// Each click was its own change: undo takes back the crush, then the ping-pong
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	await undo.click();
	await expect(crush).toHaveAttribute('aria-checked', 'false');
	await expect(pingPong).toHaveAttribute('aria-checked', 'true');
	await undo.click();
	await expect(pingPong).toHaveAttribute('aria-checked', 'false');

	// File → New turns them off
	await pingPong.click();
	await crush.click();
	await chooseFromFileMenu(page, 'New');
	await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
	await expect(pingPong).toHaveAttribute('aria-checked', 'false');
	await expect(crush).toHaveAttribute('aria-checked', 'false');
});

test('ping-pong echoes alternate left and right, live and in the export', async ({ page }) => {
	await turnOnPads(page, [0]);
	// A short note, so the echoes stand alone: the first at 375 ms (dotted 1/8 at 120 BPM)
	const setup = (pingPong: boolean) => (d: any) => {
		d.synth.envelope.decayMs = 60;
		d.synth.unison.enabled = false;
		Object.assign(d.fx.delay, { enabled: true, mix: 0.5, feedback: 0.5, pingPong });
	};
	const echoes = async (pingPong: boolean) => {
		await importChanged(page, `pp-${pingPong}`, setup(pingPong));
		const wav = await exportWav(page);
		const left = wavSamples(wav, 0), right = wavSamples(wav, 1);
		let onset = 0;
		while (Math.abs(left.samples[onset]) < 1e-4 && Math.abs(right.samples[onset]) < 1e-4) onset++;
		const rms = (s: Float32Array, fromS: number) => {
			const a = onset + Math.round(fromS * left.rate), b = a + Math.round(0.1 * left.rate);
			let sq = 0;
			for (let i = a; i < b; i++) sq += s[i] * s[i];
			return Math.sqrt(sq / (b - a));
		};
		return [0.375, 0.75, 1.125].map(t => [rms(left.samples, t), rms(right.samples, t)]);
	};

	const plain = await echoes(false);
	for (const [l, r] of plain) {
		expect(l).toBeGreaterThan(0.001);
		expect(r / l).toBeGreaterThan(0.9);
		expect(r / l).toBeLessThan(1.1);
	}
	const pp = await echoes(true);
	const [[l1, r1], [l2, r2], [l3, r3]] = pp;
	expect(l1).toBeGreaterThan(0.001);
	expect(r1).toBeLessThan(l1 * 0.01);  // first echo: left
	expect(r2).toBeGreaterThan(0.0005);
	expect(l2).toBeLessThan(r2 * 0.01);  // second: right
	expect(r3).toBeLessThan(l3 * 0.01);  // third: left again
	// As loud as the plain delay's echoes (in the one channel they play in)
	expect(l1 / plain[0][0]).toBeGreaterThan(0.9);
	expect(l1 / plain[0][0]).toBeLessThan(1.1);
	expect(r2 / plain[1][1]).toBeGreaterThan(0.9);
	expect(r2 / plain[1][1]).toBeLessThan(1.1);

	// Live, with the delay's MIX at full (only the echoes): one hit, then echoes on one side at
	// a time, left first; with the switch off, both sides at once
	const liveEchoes = async () => {
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await page.waitForTimeout(100);
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
		const peaks = await page.evaluate(() => (window as any).__channelPeaksOver(1300) as Promise<number[][]>);
		await page.waitForTimeout(2500); // the echoes die away
		// Echoes peak around 0.05–0.25; the speakers carry a small offset (about 0.006, see
		// __swingOver) even in silence
		const loud = peaks.filter(([l, r]) => Math.max(l, r) > 0.04);
		const quiet = (x: number) => x < 0.015;
		return {
			left: loud.filter(([, r]) => quiet(r)).length,
			right: loud.filter(([l]) => quiet(l)).length,
			both: loud.filter(([l, r]) => l > 0.04 && r > 0.04).length,
			firstLeft: loud.length > 0 && quiet(loud[0][1]),
		};
	};
	await importChanged(page, 'pp-live', (d) => {
		setup(true)(d);
		d.fx.delay.mix = 1;
	});
	const live = await liveEchoes();
	expect(live.left).toBeGreaterThan(0);
	expect(live.right).toBeGreaterThan(0);
	expect(live.both).toBe(0);
	expect(live.firstLeft).toBe(true);
	await page.getByRole('switch', { name: 'Ping-pong delay' }).click();
	const liveOff = await liveEchoes();
	expect(liveOff.both).toBeGreaterThan(1);
	expect(liveOff.left + liveOff.right).toBe(0);
});

test("unison voices' waves, rebuilt from the spec's series, are the browser's own shapes", async ({ page }) => {
	// waveSeries() rebuilds sine, triangle, saw and square from the Web Audio spec's series; at
	// no shift they must sound exactly like the oscillator's own types
	const series = Object.fromEntries((['sine', 'triangle', 'sawtooth', 'square'] as const)
		.map((w) => [w, Array.from(waveSeries(w).imag)]));
	const diffs = await page.evaluate(async (series: Record<string, number[]>) => {
		const out: Record<string, number> = {};
		for (const [type, imag] of Object.entries(series)) {
			const render = async (custom: boolean) => {
				const ctx = new OfflineAudioContext(1, 4800, 48000);
				const osc = ctx.createOscillator();
				osc.frequency.value = 220;
				if (custom) osc.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(imag.length), Float32Array.from(imag)));
				else osc.type = type as OscillatorType;
				osc.connect(ctx.destination);
				osc.start();
				return (await ctx.startRendering()).getChannelData(0);
			};
			const own = await render(false), rebuilt = await render(true);
			let worst = 0;
			for (let i = 0; i < own.length; i++) worst = Math.max(worst, Math.abs(own[i] - rebuilt[i]));
			out[type] = worst;
		}
		return out;
	}, series);
	for (const [type, worst] of Object.entries(diffs)) expect(worst, type).toBeLessThan(1e-4);
});

test('unison: 2–4 voices, wide from the start of a hit, as loud; a 1-voice project opens with it off', async ({ page }) => {
	await turnOnPads(page, [0]);
	const voices = page.locator('.module.unison').getByRole('slider', { name: 'Voices' });
	await expect(voices).toHaveAttribute('aria-valuemin', '2');
	await expect(voices).toHaveAttribute('aria-valuemax', '4');

	// An exported hit: how wide its first 50 ms are (side/mid), and how loud (both channels)
	const hit = async (id: string, spread: number) => {
		await importChanged(page, id, (d) => {
			Object.assign(d.synth.unison, { enabled: true, voices: 3, detuneCents: 12, stereoSpread: spread });
			d.selectedWaveform = 'sawtooth';
			const lane = d.instruments.find((l: any) => l.name === 'synth-voice');
			lane.waveforms = lane.steps.map(() => 'sawtooth');
		});
		const wav = await exportWav(page);
		const left = wavSamples(wav, 0), right = wavSamples(wav, 1);
		let on = 0;
		while (Math.abs(left.samples[on]) < 1e-4 && Math.abs(right.samples[on]) < 1e-4) on++;
		let mid = 0, side = 0, power = 0;
		for (let i = on; i < on + Math.round(0.05 * left.rate); i++) {
			mid += (left.samples[i] + right.samples[i]) ** 2;
			side += (left.samples[i] - right.samples[i]) ** 2;
			power += left.samples[i] ** 2 + right.samples[i] ** 2;
		}
		return { width: Math.sqrt(side / mid), level: Math.sqrt(power) };
	};
	const centred = await hit('uni-0', 0);
	const wide = await hit('uni-100', 100);
	expect(centred.width).toBeLessThan(0.01); // Spread 0: the voices in step and in the middle
	// Before the voices started apart, full Spread measured 0.35 here
	expect(wide.width).toBeGreaterThan(0.6);
	// Spread itself costs some level (the pan law): 0.86 of the centred hit before; starting
	// the voices apart may cost up to 1.5 dB more (0.78 measured, 0.9 dB)
	expect(wide.level / centred.level).toBeGreaterThan(0.86 * 10 ** (-1.5 / 20));
	expect(wide.level / centred.level).toBeLessThan(1);

	// A project saved with one voice (which sounded as unison off) opens with it off
	await importChanged(page, 'uni-1', (d) => Object.assign(d.synth.unison, { enabled: true, voices: 1 }));
	await expect(page.getByRole('switch', { name: 'Unison' })).toHaveText('Off');
	await expect(voices).toHaveAttribute('aria-valuenow', '3');
	// and one with 6 as 4
	await importChanged(page, 'uni-6', (d) => Object.assign(d.synth.unison, { enabled: true, voices: 6 }));
	await expect(page.getByRole('switch', { name: 'Unison' })).toHaveText('On');
	await expect(voices).toHaveAttribute('aria-valuenow', '4');
});

test('the bit crusher changes the driven sound, live and in the export, without clipping', async ({ page }) => {
	await turnOnPads(page, [0, 4, 8, 12]);
	const setup = (crush: boolean) => (d: any) => {
		Object.assign(d.fx.drive, { enabled: true, amount: 1, mix: 1, tone: 10000, crush });
	};
	const exportWith = async (crush: boolean) => {
		await importChanged(page, `crush-${crush}`, setup(crush));
		return wavSamples(await exportWav(page)).samples;
	};
	const plain = await exportWith(false);
	const crushed = await exportWith(true);
	let diff = 0, sq = 0, peak = 0;
	for (let i = 0; i < Math.min(plain.length, crushed.length); i++) {
		diff += (plain[i] - crushed[i]) ** 2;
		sq += plain[i] ** 2;
	}
	for (const x of crushed) peak = Math.max(peak, Math.abs(x));
	expect(Math.sqrt(diff / sq)).toBeGreaterThan(0.1); // a different sound
	expect(peak).toBeGreaterThan(0.1);                 // not silent
	expect(peak).toBeLessThan(1.05);                   // not clipping

	// Live: the crusher's worklet loads and the notes go through it. With MIX at full, only the
	// crushed sound reaches the speakers: at full DRIVE, 4 bits, so at most 17 levels (−8..8 of
	// 1/8, times the drive's makeup and the volume). Without it, every sample is new.
	const levelsLive = async () => {
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		const r = await page.evaluate(() => new Promise<{ swing: number; levels: number }>((resolve) => {
			const probe: AnalyserNode = (window as any).__probe;
			const buf = new Float32Array(probe.fftSize);
			const seen = new Set<number>();
			let lo = Infinity, hi = -Infinity;
			const id = setInterval(() => {
				probe.getFloatTimeDomainData(buf);
				for (const x of buf) { seen.add(Math.round(x * 1e4)); lo = Math.min(lo, x); hi = Math.max(hi, x); }
			}, 15);
			setTimeout(() => { clearInterval(id); resolve({ swing: hi - lo, levels: seen.size }); }, 800);
		}));
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
		await page.waitForTimeout(500);
		return r;
	};
	await expect(page.getByRole('switch', { name: 'Bit crusher' })).toHaveAttribute('aria-checked', 'true');
	const live = await levelsLive();
	expect(live.swing).toBeGreaterThan(0.1);
	expect(live.swing).toBeLessThan(2 * 1.05);
	expect(live.levels).toBeLessThanOrEqual(17);
	await page.getByRole('switch', { name: 'Bit crusher' }).click();
	await expect(page.getByRole('switch', { name: 'Bit crusher' })).toHaveAttribute('aria-checked', 'false');
	expect((await levelsLive()).levels).toBeGreaterThan(100);
});

test('File → New gives the same settings as a freshly opened page', async ({ page }) => {
	const projectData = async () =>
		JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	// The page's starting settings are the refs' initial values in DrumSequencer.vue; File → New
	// sets them from resetToFactoryDefaults() in src/lib/project/snapshot.ts. They must agree.
	const fresh = await projectData();

	// Load a project with other settings, then start a new one
	const changed = JSON.parse(JSON.stringify(fresh));
	changed.transport.tempo = 140;
	changed.synth.envelope.decayMs = 900;
	changed.fx.reverb.enabled = true;
	changed.melody.keyScale = 'dorian';
	changed.selectedWaveform = 'square';
	changed.fx.delay.division = '1/4';
	changed.fx.delay.toneHz = 2000;
	changed.instruments.find((i: any) => i.name === 'synth-voice').steps[0] = true;
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'Changed.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ version: 2, projectId: 'changed', meta: { name: 'Changed' }, data: changed })),
	});
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(1);
	expect((await projectData()).transport.tempo).toBe(140);

	await chooseFromFileMenu(page, 'New');
	// The menu closes once the new project has been created; until then, the File menu can
	// close under the next click
	await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(0);
	const afterNew = await projectData();

	// Only the screen layout (which panels are open) may differ. That includes the delay time
	// (synced: dotted 1/8 at 120 BPM) and tone, which the Delay panel used to set by itself.
	expect(fresh.fx.delay).toMatchObject({ division: '1/8.', time: 0.375, toneHz: 5000 });
	const settings = ({ ui, ...rest }: any) => rest;
	expect(settings(afterNew)).toEqual(settings(fresh));
});

test('the synced delay time follows the TIME knob, the tempo and a loaded project', async ({ page }) => {
	const projectData = async () =>
		JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	const time = page.getByRole('slider', { name: 'TIME', exact: true });
	const tempo = page.getByRole('slider', { name: 'Tempo', exact: true });
	await expect(time).toHaveAttribute('aria-valuetext', '1/8., 375 ms'); // at 120 BPM, the starting tempo
	await setTempo(page, 80); // the times below are at 80 BPM
	await expect(time).toHaveAttribute('aria-valuetext', '1/8., 563 ms');

	// Turning the knob sets the division and the time (it works while the delay is on)
	const delaySwitch = page.locator('.fx .footswitch').first();
	await delaySwitch.click();
	await expect(delaySwitch).toHaveAttribute('aria-pressed', 'true');
	await time.focus();
	await page.keyboard.press('ArrowRight');
	await expect(time).toHaveAttribute('aria-valuetext', '1/4, 750 ms');
	expect((await projectData()).data.fx.delay).toMatchObject({ division: '1/4', time: 0.75 });

	// A tempo change moves the time
	await tempo.focus();
	await page.keyboard.press('ArrowUp');
	await expect(tempo).toHaveAttribute('aria-valuenow', '81');
	await expect(time).toHaveAttribute('aria-valuetext', `1/4, ${Math.round(60000 / 81)} ms`);

	// A project's saved division is shown, and its time follows it even if the saved time
	// doesn't match (projects saved before the division was saved)
	const project = await projectData();
	project.projectId = 'delay-div';
	project.data.transport.tempo = 120;
	project.data.fx.delay = { ...project.data.fx.delay, sync: true, division: '1/16', time: 0.2 };
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'delay-div.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
	});
	await expect(time).toHaveAttribute('aria-valuetext', '1/16, 125 ms');
	expect((await projectData()).data.fx.delay).toMatchObject({ division: '1/16', time: 0.125 });

	// An older project without a division: the one matching its saved time
	delete project.data.fx.delay.division;
	project.projectId = 'delay-old';
	project.data.fx.delay.time = 0.25;
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'delay-old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
	});
	await expect(time).toHaveAttribute('aria-valuetext', '1/8, 250 ms');
	expect((await projectData()).data.fx.delay).toMatchObject({ division: '1/8', time: 0.25 });
	// Upgrading it on opening isn't an unsaved change
	await expect(page.locator('.pc-dot')).toHaveClass(/\bsaved\b/);
});

test('a burst of changes is copied into the project once, and Save or Export right after includes it', async ({ page }) => {
	const projectData = async () =>
		JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	const tempo = page.getByRole('slider', { name: 'Tempo', exact: true });
	await page.waitForTimeout(1000); // let the page's start-up settle
	await expect(tempo).toHaveAttribute('aria-valuenow', '120');

	// 30 tempo steps, 10 ms apart, like a knob drag: the snapshot used to be built and turned
	// into JSON several times for each one (about 100 times in all)
	const before = await page.evaluate(() => (window as any).__bigJson as number);
	await page.evaluate(async () => {
		const knob = document.querySelector('[role="slider"][aria-label="Tempo"]') as HTMLElement;
		for (let i = 0; i < 30; i++) {
			knob.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
			await new Promise((r) => setTimeout(r, 10));
		}
	});
	await expect(tempo).toHaveAttribute('aria-valuenow', '150');
	await page.waitForTimeout(1000); // until the change is in the project and the undo history
	const during = (await page.evaluate(() => (window as any).__bigJson as number)) - before;
	expect(during).toBeLessThan(10);
	expect((await projectData()).transport.tempo).toBe(150);

	// Export right after a change, before it has settled, includes it
	await tempo.focus();
	await page.keyboard.press('ArrowUp');
	expect((await projectData()).transport.tempo).toBe(151);

	// So does Save
	const name = page.getByRole('textbox', { name: 'Project name' });
	await name.fill('Burst');
	await name.press('Enter');
	await page.waitForTimeout(300);
	await tempo.focus();
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('Control+s');
	await expect(page.locator('.pc-dot')).toHaveClass(/\bsaved\b/);
	await page.reload();
	await expect(tempo).toHaveAttribute('aria-valuenow', '152');
});

test('the pitch envelope sweeps each note down from Amount, and short decays are easy to reach', async ({ page }) => {
	// The "Pitch" card in the Envelope / Pitch / Filter row
	const card = page.locator('.module.pitch-env');
	const amount = card.getByRole('slider', { name: 'Amount', exact: true });
	const decay = card.getByRole('slider', { name: 'Decay', exact: true });
	await expect(amount).toHaveAttribute('aria-valuenow', '0'); // off by default
	const detuneCalls = () => page.evaluate(() => (window as any).__detuneCalls as any[]);

	// Amount 0: the notes' pitch doesn't move
	await turnOnPads(page, [0]);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(async () => (await detuneCalls()).length).toBeGreaterThan(0);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	expect((await detuneCalls()).every((c) => c[0] === 'set' && c[1] === 0)).toBe(true);

	// Amount is bipolar (zero in the middle): right of centre starts above and drops
	await amount.focus();
	for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowUp');
	await expect(amount).toHaveAttribute('aria-valuetext', 'starts 24 semitones above, drops into the note');

	// Decay's knob is logarithmic (5–2000 ms): half a turn is about 100 ms. Arrow keys move
	// it 1% of the turn (or at least 1 ms), so from the top, 50 presses down are half a turn.
	await decay.focus();
	await page.keyboard.press('End');
	await expect(decay).toHaveAttribute('aria-valuenow', '2000');
	for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowDown');
	const half = Number(await decay.getAttribute('aria-valuenow'));
	expect(half).toBeGreaterThanOrEqual(95);
	expect(half).toBeLessThanOrEqual(105);

	await page.evaluate(() => { (window as any).__detuneCalls = []; });
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(async () => (await detuneCalls()).length).toBeGreaterThanOrEqual(2);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	const [start, sweep] = await detuneCalls();
	// Starts 2400 cents up, then decays back to the note (time constant: Decay / 4)
	expect(start.slice(0, 2)).toEqual(['set', 2400]);
	expect(sweep[0]).toBe('target');
	expect(sweep[1]).toBe(0);
	expect(sweep[2]).toBe(start[2]);
	expect(sweep[3]).toBeCloseTo(half / 1000 / 4, 6);

	// The WAV export has the same sweep: the note starts about two octaves up (A 220 Hz → 880
	// Hz) and is back at its pitch well before 150 ms
	const wav = await exportWav(page);
	const early = wavCrossingRate(wav, 0, 8);
	const late = wavCrossingRate(wav, 150, 250);
	expect(late).toBeGreaterThan(0.4); // 220 Hz: 0.44 crossings per ms
	expect(late).toBeLessThan(0.5);
	expect(early).toBeGreaterThan(late * 3);

	// Left of centre starts below and rises (saved as mode 'down'); RND is mode 'random', and
	// turning it off goes back to the knob's side
	const pitchEnv = async () =>
		JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.synth.pitchEnv;
	expect(await pitchEnv()).toMatchObject({ semitones: 24, mode: 'up' });
	await amount.focus();
	for (let i = 0; i < 36; i++) await page.keyboard.press('ArrowDown');
	await expect(amount).toHaveAttribute('aria-valuenow', '-12');
	expect(await pitchEnv()).toMatchObject({ semitones: 12, mode: 'down' });
	const rnd = card.getByRole('button', { name: 'Random sweep' });
	await rnd.click();
	await expect(rnd).toHaveAttribute('aria-pressed', 'true');
	expect(await pitchEnv()).toMatchObject({ semitones: 12, mode: 'random' });
	await rnd.click();
	expect(await pitchEnv()).toMatchObject({ semitones: 12, mode: 'down' });
	await expect(amount).toHaveAttribute('aria-valuenow', '-12');
});

test('laid out like hardware: Sound in rows beside Compose, ending on one line; tabs on tablets', async ({ page }) => {
	const rect = (sel: string) => page.locator(sel).first().evaluate((el) => {
		const b = el.getBoundingClientRect();
		return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, height: b.height };
	});
	const near = (a: number, b: number) => Math.abs(a - b) <= 1;
	for (const width of [1600, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		const at = `${width} px`;
		const [transport, steps, screen, sound, compose] = await Promise.all(
			['.ds-transport', '.ds-steps', '.ds-visualizer', '.ds-sound', '.ds-compose'].map(rect));
		// The screen beside the transport and the steps, as tall as both
		expect(screen.left, at).toBeGreaterThan(transport.right);
		expect(near(screen.top, transport.top) && near(screen.bottom, steps.bottom), `${at}: screen spans both`).toBe(true);
		// Sound and Compose side by side, ending on one line
		expect(compose.left, at).toBeGreaterThan(sound.right);
		expect(near(sound.top, compose.top) && near(sound.bottom, compose.bottom), `${at}: one bottom line`).toBe(true);

		// Each row of Sound is filled edge to edge: its cells end on one line
		for (const row of ['.sound-row-1', '.sound-row-2', '.sound-row-3']) {
			const bottoms = await page.locator(`${row} > *`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().bottom)));
			expect(Math.max(...bottoms) - Math.min(...bottoms), `${at}: ${row} cells end level`).toBeLessThanOrEqual(1);
		}
		// Envelope, Pitch and Filter: their eight knobs on one line
		const knobTops = await page.locator('.sound-row-2 .knob-wrapper').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
		expect(knobTops, at).toHaveLength(8);
		expect(Math.max(...knobTops) - Math.min(...knobTops), `${at}: one line of knobs`).toBeLessThanOrEqual(1);
		// FM and Unison: cards of their own, the tile saying Off or On
		await expect(page.locator('.module.fm .pt-title')).toHaveText('FM');
		await expect(page.locator('.module.unison .pt-title')).toHaveText('Unison');
		await expect(page.getByRole('switch', { name: 'FM' })).toHaveText('Off');
		await expect(page.getByRole('switch', { name: 'Unison' })).toHaveText('Off');
		// The LFO's controls stay on one line
		expect((await rect('.module.mod .lfo-row')).height, `${at}: LFO one row`).toBeLessThan(80);
		// Titles on one line, and every control inside its card
		const cards = await page.locator('.ds-section .module').evaluateAll((els) => els.map((el) => {
			const box = el.getBoundingClientRect();
			const title = el.querySelector('.pt-title') as HTMLElement | null;
			const lh = title ? parseFloat(getComputedStyle(title).lineHeight) || parseFloat(getComputedStyle(title).fontSize) * 1.3 : 0;
			const inside = [...el.querySelectorAll('.knob-wrapper, .pt-btn, button')].every((c) => {
				const b = c.getBoundingClientRect();
				return b.width === 0 || (b.left >= box.left - 0.5 && b.right <= box.right + 0.5);
			});
			return { cls: el.className, oneLine: !title || title.textContent!.trim() === '' || title.getBoundingClientRect().height < lh * 1.5, inside };
		}));
		for (const c of cards) expect(c, at).toMatchObject({ oneLine: true, inside: true });
		await expect(page.locator('.ds-tabs'), `${at}: no tabs`).toBeHidden();
		expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${at}: no sideways scroll`).toBe(false);
	}

	// Tablets and phones: Sound, Effects and Compose as tabs under the steps
	for (const width of [1024, 390]) {
		await page.setViewportSize({ width, height: 900 });
		const at = `${width} px`;
		const tab = (name: string) => page.getByRole('tab', { name, exact: true });
		await tab('Sound').click();
		await expect(tab('Sound')).toHaveAttribute('aria-selected', 'true');
		await expect(page.locator('.module.generators'), at).toBeVisible();
		await expect(page.locator('.module.fx'), at).toBeHidden();
		await expect(page.locator('.module.melody'), at).toBeHidden();
		await tab('Effects').click();
		await expect(page.locator('.module.fx'), at).toBeVisible();
		await expect(page.locator('.module.generators'), at).toBeHidden();
		await expect(page.locator('.module.noise'), at).toBeHidden();
		// The arrow keys move between the tabs
		await page.keyboard.press('ArrowRight');
		await expect(tab('Compose')).toBeFocused();
		await expect(tab('Compose')).toHaveAttribute('aria-selected', 'true');
		await expect(page.locator('.module.melody'), at).toBeVisible();
		await expect(page.locator('.module.pattern-tools'), at).toBeVisible();
		await expect(page.locator('.ds-sound'), at).toBeHidden();
		expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${at}: no sideways scroll`).toBe(false);
		await tab('Sound').click();
		// The LFO stays one compact row, even on a phone
		expect((await rect('.module.mod .lfo-row')).height, `${at}: LFO one row`).toBeLessThan(80);
	}
});

test('every control can be clicked, none drawn over by another, at every width and in every tab', async ({ page }) => {
	// Each control's centre, once scrolled into view, must reach the control itself (PR 41's
	// stretched Noise card was drawn over the Noise switch)
	const covered = () => page.evaluate(() => {
		const sel = 'button, [role=button], [role=switch], [role=slider], [role=radio], [role=tab], input, select, a[href]';
		const out: string[] = [];
		for (const el of document.querySelectorAll<HTMLElement>(sel)) {
			const box = el.getBoundingClientRect();
			if (box.width === 0 || box.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
			el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
			const b = el.getBoundingClientRect();
			const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
			const label = hit?.closest('label');
			if (hit && (hit === el || el.contains(hit) || (label && label.contains(el)))) continue;
			out.push(`${el.getAttribute('aria-label') || el.textContent!.trim().slice(0, 30)} (under ${hit ? hit.className : 'nothing'})`);
		}
		return out;
	});
	for (const [width, tabs] of [[1600, ['']], [1280, ['']], [1024, ['Sound', 'Effects', 'Compose']], [390, ['Sound', 'Effects', 'Compose']]] as const) {
		await page.setViewportSize({ width, height: 900 });
		for (const tab of tabs) {
			if (tab) await page.getByRole('tab', { name: tab, exact: true }).click();
			expect(await covered(), `${width} px${tab ? `, ${tab} tab` : ''}`).toEqual([]);
		}
	}

	// The Noise switch turns noise on and off with a real click (its card shows the static)
	await page.setViewportSize({ width: 1600, height: 900 });
	const noise = page.getByRole('button', { name: 'Toggle noise' });
	await noise.click();
	await expect(noise).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.module.noise .noise-overlay')).toBeVisible();
	await noise.click();
	await expect(noise).toHaveAttribute('aria-pressed', 'false');
});

test('the filter envelope sweeps each note\'s cutoff, is saved, and shows on the filter view', async ({ page }) => {
	const card = page.locator('.module.filter');
	const amount = card.getByRole('slider', { name: 'Env Amt', exact: true });
	const decay = card.getByRole('slider', { name: 'Decay', exact: true });
	const filterCanvas = page.locator('.nac-screen__lcd canvas').nth(4);
	const calls = () => page.evaluate(() => (window as any).__filterDetuneCalls as any[]);
	await expect(amount).toHaveAttribute('aria-valuenow', '0'); // off by default
	await expect(decay).toHaveAttribute('aria-valuenow', '200');

	// Off: each note's filter gets no sweep
	await turnOnPads(page, [0]);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(async () => (await calls()).length).toBeGreaterThan(0);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	expect((await calls()).every((c) => c[0] === 'set' && c[1] === 0)).toBe(true);

	// +2 octaves (bipolar knob, 0.1 octave per step); turning it shows the filter view
	await amount.focus();
	for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp');
	await expect(amount).toHaveAttribute('aria-valuetext', 'cutoff starts 2.0 octaves higher and closes');
	await expect(filterCanvas).toBeVisible();
	await decay.focus();
	await page.keyboard.press('Home'); // 5 ms
	await expect(filterCanvas).toBeVisible();
	for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowUp'); // log knob: about half a turn
	const ms = Number(await decay.getAttribute('aria-valuenow'));
	await page.keyboard.press('Tab');
	await expect(filterCanvas).toBeHidden();

	await page.evaluate(() => { (window as any).__filterDetuneCalls = []; });
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(async () => (await calls()).length).toBeGreaterThanOrEqual(2);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	const [start, sweep] = await calls();
	expect(start.slice(0, 2)).toEqual(['set', 2400]); // 2 octaves up
	expect(sweep.slice(0, 2)).toEqual(['target', 0]); // back to the cutoff
	expect(sweep[3]).toBeCloseTo(ms / 1000 / 4, 6); // time constant: Decay / 4

	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.synth.filter;
	expect(saved).toMatchObject({ envAmount: 2, envDecayMs: ms });
});

test('every wave sounds, at a similar level, and the pulse follows its Width', async ({ page }) => {
	await turnOnPads(page, [0]);
	const tile = (label: string) => page.locator('.wave-row').getByRole('radio', { name: label, exact: true });
	const level = async () => wavStats(await exportWav(page), 40, 200);

	// Every wave plays, within about ±6 dB of the sine (the waves' loudness balance)
	await tile('SINE').click();
	const sineStats = await level();
	const sine = sineStats.rms;
	expect(sine).toBeGreaterThan(0.01);
	for (const label of ['TRIANGLE', 'SAW', 'SQUARE', 'PULSE', 'ORGAN', 'HOLLOW', 'GLASS']) {
		await tile(label).click();
		await expect(tile(label)).toHaveAttribute('aria-checked', 'true');
		const { rms } = await level();
		expect(rms / sine, label).toBeGreaterThan(0.5);
		expect(rms / sine, label).toBeLessThan(2);
	}
	expect(JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.selectedWaveform).toBe('glass');

	// Pulse: high for Width % of each cycle, and centred on 0 (its DC is cancelled)
	await tile('PULSE').click();
	const width = page.getByRole('slider', { name: 'Pulse Width', exact: true });
	await expect(width).toHaveAttribute('aria-valuenow', '50');
	let s = await level();
	expect(s.above).toBeGreaterThan(0.45);
	expect(s.above).toBeLessThan(0.55);
	await width.focus();
	await page.keyboard.press('Home'); // 5%
	for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp');
	await expect(width).toHaveAttribute('aria-valuenow', '25');
	s = await level();
	expect(s.above).toBeGreaterThan(0.2);
	expect(s.above).toBeLessThan(0.3);
	// Without the DC cancelling, a 25% pulse would sit about 0.58 × its RMS below 0. The WAV
	// also has a small offset from the drive stage whatever the wave (planned to be fixed with
	// the master limiter), so compare with the sine's and allow a little
	expect(Math.abs(s.mean - sineStats.mean)).toBeLessThan(s.rms * 0.15);
	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	expect(saved.synth.pulse).toEqual({ width: 25 });

	// The LFO can move the width
	await page.locator('button[title="Modulate the pulse wave\'s width"]').click();
	expect(JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.synth.lfo.target).toBe('pwm');
});

test('Pulse Width sits on the Pulse tile, and the LFO says when PW has no pulse to move', async ({ page }) => {
	const width = page.getByRole('slider', { name: 'Pulse Width', exact: true });
	const sine = page.locator('.wave-row').getByRole('radio', { name: 'SINE', exact: true });
	const pulse = page.locator('.wave-row').getByRole('radio', { name: 'PULSE', exact: true });
	// On the Waveforms panel (not under Unison), and turning it doesn't pick the Pulse wave
	await expect(page.locator('.module.generators').getByRole('slider', { name: 'Pulse Width' })).toHaveCount(1);
	await expect(page.locator('.module.unison').getByRole('slider', { name: 'Pulse Width' })).toHaveCount(0);
	await expect(sine).toHaveAttribute('aria-checked', 'true');
	await width.focus();
	await page.keyboard.press('PageDown');
	await expect(width).not.toHaveAttribute('aria-valuenow', '50');
	await expect(sine).toHaveAttribute('aria-checked', 'true');
	await expect(pulse).toHaveAttribute('aria-checked', 'false');

	// One side of the pulse only: from 5% (thinnest) to 50% (the square, fullest), and the
	// tile's bar follows: thinnest at 5%, widest at 50%
	const barWidth = () => pulse.locator('svg.wave-svg path:not(.lfo-ghost)').first().getAttribute('d')
		.then((d) => { const [a, b] = [...d!.matchAll(/H(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])); return b - a; });
	await width.focus();
	await page.keyboard.press('Home');
	await expect(width).toHaveAttribute('aria-valuenow', '5');
	const thin = await barWidth();
	await page.keyboard.press('End');
	await expect(width).toHaveAttribute('aria-valuenow', '50');
	expect(await barWidth()).toBeGreaterThan(thin * 3);

	// The LFO on PW with no pulse playing: PW looks dimmer and says why; the tile says No Pulse
	const pw = page.locator('.module.mod').getByRole('radio', { name: 'Pulse width' });
	await expect(pw).toHaveText('Pulse'); // spelled out: "PW" meant little to a newcomer
	const status = page.locator('.module.mod .lfo-status');
	await expect(pw).toHaveAttribute('title', /None do right now/);
	await pw.click();
	await expect(status).toHaveText('No Pulse');
	// A pad set to Pulse (here: every pad, from its tile) and it's on again
	await turnOnPads(page, [0]);
	await pulse.click();
	await expect(status).toHaveText('On');
	await expect(pw).toHaveAttribute('title', "Modulate the pulse wave's width");
	// Back to Sine: no pulse again
	await sine.click();
	await expect(status).toHaveText('No Pulse');
});

test('the LFO visualizer shows what the LFO moves, without turning the knob', async ({ page }) => {
	const lfo = page.locator('.module.mod');
	const depth = lfo.getByRole('slider', { name: 'Depth' });
	const target = (name: string) => lfo.getByRole('radio', { name, exact: true });
	const play = page.getByRole('button', { name: 'Play', exact: true });
	const stop = page.getByRole('button', { name: 'Stop', exact: true });
	// Most of the depth (picking a target sets it back to 0)
	async function setDepth() {
		await depth.focus();
		await page.keyboard.press('End');
		await page.keyboard.press('PageDown');
		await page.locator('body').click({ position: { x: 3, y: 3 } });
	}
	// Reads `read` every 60 ms for `ms`: how many different values it gave
	async function distinct(read: () => Promise<string | null>, ms = 1200) {
		const seen = new Set<string | null>();
		for (let t = 0; t < ms; t += 60) {
			seen.add(await read());
			await page.waitForTimeout(60);
		}
		return seen.size;
	}
	await turnOnPads(page, [0, 4, 8, 12]);

	// Filter: a range arc on the Cutoff knob as soon as the LFO moves the cutoff, and a dot
	// that moves with the LFO while it plays; the knob itself stays where it was set
	const cutoff = page.getByRole('slider', { name: 'Cutoff', exact: true });
	const dot = cutoff.locator('.dial-mod-dot');
	await target('Filter').click();
	await expect(cutoff.locator('.dial-mod-range')).toHaveCount(0); // depth 0: nothing moves
	await setDepth();
	await expect(cutoff.locator('.dial-mod-range')).toHaveCount(1);
	await expect(dot).toHaveCount(0); // nothing plays yet
	await play.click();
	await expect(dot).toHaveCount(1);
	expect(await distinct(() => dot.getAttribute('cx'))).toBeGreaterThan(3);
	await expect(cutoff).toHaveAttribute('aria-valuenow', '5000');
	await stop.click();
	await expect(dot).toHaveCount(0, { timeout: 4000 });

	// Pitch: a track on each lit pad, and a bar sliding along it while it plays
	await target('Pitch').click();
	await setDepth();
	await expect(page.locator('.pad-row .lfo-bend-track')).toHaveCount(4);
	await expect(page.locator('.pad-row .lfo-bend-bar')).toHaveCount(0);
	await expect(cutoff.locator('.dial-mod-range')).toHaveCount(0);
	await play.click();
	const bar = page.locator('.pad-row .lfo-bend-bar');
	await expect(bar).toHaveCount(4);
	expect(await distinct(() => bar.first().evaluate((el) => String(Math.round(el.getBoundingClientRect().top))))).toBeGreaterThan(3);

	// Pulse: the Pulse tile's bar widens and narrows (here: every pad plays Pulse), with the
	// widest as a ghost behind it; the Pulse Width knob stays at 50 %
	const pulse = page.locator('.wave-row').getByRole('radio', { name: 'PULSE', exact: true });
	await pulse.click();
	await target('Pulse width').click();
	await setDepth();
	await expect(bar).toHaveCount(0);
	await expect(pulse.locator('.lfo-ghost')).toHaveCount(1);
	expect(await distinct(() => pulse.locator('svg.wave-svg path:not(.lfo-ghost)').first().getAttribute('d'))).toBeGreaterThan(3);
	await expect(page.getByRole('slider', { name: 'Pulse Width', exact: true })).toHaveAttribute('aria-valuenow', '50');
	await stop.click();

	// prefers-reduced-motion: only the ranges, nothing moves
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await target('Filter').click();
	await setDepth();
	await play.click();
	await page.waitForTimeout(500);
	await expect(cutoff.locator('.dial-mod-range')).toHaveCount(1);
	await expect(dot).toHaveCount(0);
	await stop.click();
});

test('velocity routing: a soft step rings shorter with Vel → Decay, and the setting is saved', async ({ page }) => {
	// One step, at velocity 25%
	const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	const lane = project.data.instruments.find((i: any) => i.name === 'synth-voice');
	lane.steps = lane.steps.map((_: boolean, i: number) => i === 0);
	lane.velocities = lane.velocities.map(() => 0.25);
	project.projectId = 'vel-routing';
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'vel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
	});
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(1);
	const plain = wavSoundMs(await exportWav(page));

	// Vel → Decay at +100%: a 25% step gets a quarter of the Decay
	const button = page.getByRole('button', { name: 'Vel →' });
	await expect(button).not.toHaveClass(/\bon\b/);
	await button.click();
	const panel = page.getByRole('dialog', { name: 'Velocity routing' });
	const decay = panel.getByRole('slider', { name: 'Decay', exact: true });
	await expect(decay).toHaveAttribute('aria-valuetext', 'off');
	await decay.focus();
	await page.keyboard.press('End');
	await expect(decay).toHaveAttribute('aria-valuetext', '100 percent: softer steps shorter');
	await expect(button).toHaveClass(/\bon\b/);
	// Escape closes the panel (a click outside it does too)
	await page.keyboard.press('Escape');
	await expect(panel).toBeHidden();
	const routed = wavSoundMs(await exportWav(page));
	expect(routed).toBeLessThan(plain * 0.5);
	expect(routed).toBeGreaterThan(plain * 0.1);

	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.synth.velocity;
	expect(saved).toEqual({ decay: 100, cutoff: 0, pitchEnv: 0, noise: 0 });

	// Reset sets every amount back to 0
	await button.click();
	await panel.getByRole('button', { name: 'Reset' }).click();
	await expect(button).not.toHaveClass(/\bon\b/);
});

test('starting new projects does not leave old keyboard listeners behind', async ({ page }) => {
	const listeners = () => page.evaluate(() => (window as any).__keydown.length as number);
	const start = await listeners();
	for (let i = 0; i < 3; i++) {
		await chooseFromFileMenu(page, 'New');
		// The menu closes once the new project has been created
		await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
		await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeVisible();
	}
	await page.waitForTimeout(500);
	expect(await listeners()).toBe(start);
});

// --- Project file check (replaced zod) -----------------------------------------------------

test('a project imported right after File → New keeps its name and counts as saved', async ({ page }) => {
	// Make New's save to IndexedDB finish late, after the import's: the order that made the
	// export test fail now and then on GitHub
	await page.evaluate(() => {
		const w = window as any;
		w.__delayNextWrite = true;
		const orig = IDBTransaction.prototype.addEventListener;
		(IDBTransaction.prototype as any).addEventListener = function (type: string, fn: any, ...rest: any[]) {
			if (type === 'complete' && this.mode === 'readwrite' && (w.__delayNextWrite || this.__delayed)) {
				w.__delayNextWrite = false;
				this.__delayed = true;
				return orig.call(this, type, (e: Event) => setTimeout(() => fn(e), 500), ...rest);
			}
			return orig.call(this, type, fn, ...rest);
		};
	});
	const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	await chooseFromFileMenu(page, 'New');
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'Imported Name.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ ...project, meta: { ...project.meta, name: 'Imported Name' } })),
	});
	await page.waitForTimeout(1000); // until New's delayed save has finished
	await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Imported Name');
	await expect(page.locator('.pc-dot')).not.toHaveClass(/\bunsaved\b/);
});

test('refuses a broken project file with a message, and keeps the current pattern', async ({ page }) => {
	await turnOnPads(page, [0, 4]);
	const name = page.getByRole('textbox', { name: 'Project name' });
	const nameBefore = await name.inputValue();
	const alerts: string[] = [];
	page.on('dialog', (d) => { alerts.push(d.message()); void d.dismiss(); });
	const consoleErrors: string[] = [];
	page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

	// Every pad on, but one field has the wrong type, so none of it may be loaded
	const lane = {
		name: 'synth-voice', label: 'Synth', type: 'synth', isCustom: false, muted: 'no',
		channelVolume: 0.5, steps: Array(16).fill(true), velocities: Array(16).fill(1),
	};
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'Broken.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ version: 2, data: { instruments: [lane] } })),
	});
	await expect.poll(() => alerts).toEqual(['Import failed: invalid or unsupported file.']);
	expect(consoleErrors.join('\n')).toContain('instruments[0].muted');
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(2);
	await expect(name).toHaveValue(nameBefore);
});

test('a saved project that fails the check is not opened, with a message, and Save still works', async ({ page }) => {
	const alerts: string[] = [];
	page.on('dialog', (d) => { alerts.push(d.message()); void d.dismiss(); });
	// The project with this id in IndexedDB (its name), or null
	const savedName = (id: string) => page.evaluate((id) => new Promise((resolve) => {
		const req = indexedDB.open('ewave-studio2-db');
		req.onsuccess = () => {
			const get = req.result.transaction('projects').objectStore('projects').get(id);
			get.onsuccess = () => resolve(get.result?.meta?.name ?? null);
			get.onerror = () => resolve(null);
		};
		req.onerror = () => resolve(null);
	}), id);

	// A saved project with a wrongly typed field, opened last
	await page.evaluate(() => new Promise<void>((resolve, reject) => {
		const lane = {
			name: 'synth-voice', label: 'Synth', type: 'synth', isCustom: false, muted: 'no',
			channelVolume: 0.5, steps: Array(16).fill(true), velocities: Array(16).fill(1),
		};
		const row = {
			version: 2, projectId: 'broken-1',
			meta: { name: 'Broken Song', createdAt: 1, updatedAt: Date.now() },
			data: { instruments: [lane] },
		};
		const req = indexedDB.open('ewave-studio2-db');
		req.onsuccess = () => {
			const tx = req.result.transaction('projects', 'readwrite');
			tx.objectStore('projects').put(row);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		};
		req.onerror = () => reject(req.error);
	}));
	await page.evaluate(() => localStorage.setItem('ewave-studio2:lastProjectId', 'broken-1'));

	await page.reload();
	await expect(pads(page)).toHaveCount(16);
	await expect.poll(() => alerts).toEqual([
		"\"Broken Song\" couldn't be opened: it is damaged, or this version of the app can't read it. A new project was started instead.",
	]);
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(0); // none of it was loaded
	const lastId = () => page.evaluate(() => localStorage.getItem('ewave-studio2:lastProjectId'));
	expect(await lastId()).not.toBe('broken-1');

	// Save works in the new project
	const name = page.getByRole('textbox', { name: 'Project name' });
	await name.fill('Rescued');
	await name.press('Enter');
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+s');
	const newId = (await lastId())!;
	await expect.poll(() => savedName(newId)).toBe('Rescued');
	expect(await savedName('broken-1')).toBe('Broken Song'); // the broken record is left alone

	// Choosing it from File → Open gives the same message and keeps the current project
	await page.getByRole('button', { name: 'File ▾' }).click();
	await page.getByRole('button', { name: 'Open ▸' }).hover(); // the submenu opens on hover
	await page.getByRole('menuitem', { name: /Broken Song/ }).click();
	await expect.poll(() => alerts.length).toBe(2);
	expect(alerts[1]).toBe(
		"\"Broken Song\" couldn't be opened: it is damaged, or this version of the app can't read it. Your current project is unchanged.",
	);
	await expect(name).toHaveValue('Rescued');
	expect(await lastId()).toBe(newId);
});

// A change counts as one undo step once the settings have stayed the same this long
// (SETTLE_MS in src/composables/useUndoHistory.ts), plus a margin
const SETTLED = 700;

test('undo and redo step through changes; a knob drag is one step', async ({ page }) => {
	const undoBtn = page.getByRole('button', { name: 'Undo', exact: true });
	const redoBtn = page.getByRole('button', { name: 'Redo', exact: true });
	const tempo = page.getByRole('slider', { name: 'Tempo', exact: true });
	const selected = page.locator('.pad-row .padTEST.selected');
	await page.waitForTimeout(SETTLED); // the opened project becomes the starting point
	await expect(undoBtn).toBeDisabled();
	await expect(redoBtn).toBeDisabled();

	await turnOnPads(page, [0]);
	await page.waitForTimeout(SETTLED);
	await turnOnPads(page, [4]);
	await page.waitForTimeout(SETTLED);

	// Dragging a knob changes the tempo many times, but it's one step
	const box = (await tempo.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	for (let i = 1; i <= 8; i++) {
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - i * 8);
		await page.waitForTimeout(100); // longer than the whole drag would be without the pointer rule
	}
	await page.waitForTimeout(SETTLED); // still held: nothing is recorded yet
	await page.mouse.up();
	const dragged = Number(await tempo.getAttribute('aria-valuenow'));
	expect(dragged).toBeGreaterThan(120);
	await expect(undoBtn).toBeEnabled();

	// Undo right away, before the drag has settled: it still goes back past the whole drag
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+z');
	await expect(tempo).toHaveAttribute('aria-valuenow', '120');
	await expect(selected).toHaveCount(2);
	await undoBtn.click();
	await expect(selected).toHaveCount(1);
	await page.keyboard.press('Control+z');
	await expect(selected).toHaveCount(0);
	await expect(undoBtn).toBeDisabled();

	// Redo with the button, Ctrl+Shift+Z and Ctrl+Y
	await redoBtn.click();
	await expect(selected).toHaveCount(1);
	await page.keyboard.press('Control+Shift+z');
	await expect(selected).toHaveCount(2);
	await page.keyboard.press('Control+y');
	await expect(tempo).toHaveAttribute('aria-valuenow', String(dragged));
	await expect(redoBtn).toBeDisabled();

	await page.keyboard.press('Control+z');
	await expect(tempo).toHaveAttribute('aria-valuenow', '120');
	await page.waitForTimeout(SETTLED);
	await expect(redoBtn).toBeEnabled();

	// A new change after undo drops what could be redone
	await turnOnPads(page, [8]);
	await page.waitForTimeout(SETTLED);
	await expect(redoBtn).toBeDisabled();
	await page.keyboard.press('Control+z');
	await expect(selected).toHaveCount(2);
	await expect(tempo).toHaveAttribute('aria-valuenow', '120');

	// Undo changes the project, so the unsaved dot shows
	await expect(page.locator('.pc-dot')).toHaveClass(/\bunsaved\b/);
});

test('after an undo, its follow-up changes (the synced delay time) keep redo available', async ({ page }) => {
	// Undoing a tempo change also moves the synced delay time (followDelaySync). That
	// follow-up is part of the undo, so redo must stay available.
	await chooseFromFileMenu(page, 'New');
	await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
	await page.waitForTimeout(SETTLED);
	const tempo = page.getByRole('slider', { name: 'Tempo', exact: true });
	await tempo.focus();
	await page.keyboard.press('ArrowUp');
	await expect(tempo).toHaveAttribute('aria-valuenow', '121');
	await page.waitForTimeout(SETTLED);

	await page.keyboard.press('Control+z');
	await expect(tempo).toHaveAttribute('aria-valuenow', '120');
	await page.waitForTimeout(SETTLED);
	const redoBtn = page.getByRole('button', { name: 'Redo', exact: true });
	await expect(redoBtn).toBeEnabled();
	await redoBtn.click();
	await expect(tempo).toHaveAttribute('aria-valuenow', '121');
});

test('Ctrl+Z in the project name box undoes typing, not the pattern', async ({ page }) => {
	await page.waitForTimeout(SETTLED);
	await turnOnPads(page, [0]);
	await page.waitForTimeout(SETTLED);
	const name = page.getByRole('textbox', { name: 'Project name' });
	await name.click();
	await page.keyboard.type('abc');
	await page.keyboard.press('Control+z');
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(1);
});

test('opening another project starts a fresh undo history', async ({ page }) => {
	const undoBtn = page.getByRole('button', { name: 'Undo', exact: true });
	await page.waitForTimeout(SETTLED);
	const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	await turnOnPads(page, [0, 1]);
	await page.waitForTimeout(SETTLED);
	await expect(undoBtn).toBeEnabled();

	project.data.instruments.find((i: any) => i.name === 'synth-voice').steps[5] = true;
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'Other.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ ...project, meta: { name: 'Other' } })),
	});
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(1);
	await page.waitForTimeout(SETTLED);
	await expect(undoBtn).toBeDisabled();
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+z');
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(1);
});

// --- Presets ---------------------------------------------------------------------------------

// Leaf values of an object by path ("synth.filter.cutoff"), and reading one back
const flatten = (o: any, path = ''): Record<string, unknown> =>
	o !== null && typeof o === 'object' && !Array.isArray(o)
		? Object.assign({}, ...Object.keys(o).map((k) => flatten(o[k], path ? `${path}.${k}` : k)))
		: { [path]: o };
const valueAt = (o: any, path: string) => path.split('.').reduce((v, k) => v?.[k], o);

test('presets set the sound but not the pattern, light up, and are one undo step each', async ({ page }) => {
	const projectData = async () =>
		JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	const presetButton = (label: string) => soundsBox(page).getByRole('button', { name: label, exact: true });
	const lit = soundsBox(page).locator('.pt-btn[aria-pressed="true"]');
	await expect(soundsBox(page).locator('.preset-grid .pt-btn')).toHaveText(PRESETS.map((p) => p.label));

	// A pattern, and a tempo of its own
	await page.waitForTimeout(SETTLED);
	await turnOnPads(page, [0, 4, 9]);
	const tempo = page.getByRole('slider', { name: 'Tempo', exact: true });
	await tempo.focus();
	await page.keyboard.press('ArrowUp');
	await expect(tempo).toHaveAttribute('aria-valuenow', '121');
	await page.waitForTimeout(SETTLED);
	await expect(lit).toHaveCount(0);
	const before = await projectData();
	const pattern = (d: any) => ({
		transport: d.transport, melody: d.melody, tuning: d.synth.tuning, noiseMask: d.synth.noise.mask,
		lanes: d.instruments.map(({ waveforms, ...lane }: any) => lane),
	});

	for (const p of PRESETS) {
		await presetButton(p.label).click();
		await expect(lit).toHaveText([p.label]);
		await page.waitForTimeout(SETTLED);
		// Still lit once the panels have followed the new settings: none rounded one away
		await expect(lit).toHaveText([p.label]);
		const data = await projectData();
		for (const [path, value] of Object.entries(flatten({ synth: p.synth ?? {}, fx: p.fx ?? {} }))) {
			expect(valueAt(data, path), `${p.id}: ${path}`).toEqual(value);
		}
		expect(data.selectedWaveform).toBe(p.wave);
		expect(new Set(data.instruments.find((i: any) => i.name === 'synth-voice').waveforms)).toEqual(new Set([p.wave]));
		expect(pattern(data), `${p.id} keeps the pattern`).toEqual(pattern(before));
		// The delay time stays the division at this tempo
		expect(data.fx.delay.time).toBeCloseTo((60 / 121) * 0.75, 6);
	}
	// What the last preset (Bell) doesn't set is back at its default, though Acid set it
	const bell = await projectData();
	expect(bell.fx.drive.enabled).toBe(false);
	expect(bell.synth.lfo).toMatchObject({ target: 'pitch', depth: 0 });
	expect(bell.synth.filter).toMatchObject({ resonance: 0.5, envAmount: 0 });

	// The sound plays
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const swing = await page.evaluate(() => (window as any).__swingOver(800) as Promise<number>);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	expect(swing).toBeGreaterThan(0.01);

	// Turning a sound knob unlights it; undo lights it again, and each preset is one step
	const cutoff = page.getByRole('slider', { name: 'Cutoff', exact: true });
	await cutoff.focus();
	await page.keyboard.press('ArrowUp');
	await expect(lit).toHaveCount(0);
	await page.waitForTimeout(SETTLED);
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+z');
	await expect(lit).toHaveText(['Bell']);
	await page.keyboard.press('Control+z');
	await expect(lit).toHaveText(['Acid']);
	await page.keyboard.press('Control+y');
	await expect(lit).toHaveText(['Bell']);
});

test('Sounds and Patterns sit side by side between Swing and Play, or on a row of their own', async ({ page }) => {
	for (const width of [1600, 1280, 1100, 900, 390]) {
		await page.setViewportSize({ width, height: 900 });
		const m = await page.evaluate(() => {
			const rect = (el: Element) => {
				const b = el.getBoundingClientRect();
				return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, height: b.height };
			};
			const boxes = [...document.querySelectorAll('.transport-presets .preset-box')].map((box) => {
				const buttons = [...box.querySelectorAll('.preset-grid .pt-btn')] as HTMLElement[];
				const title = document.createRange();
				title.selectNodeContents(box.querySelector('.pt-section-title')!);
				return {
					box: rect(box), title: rect(title), dice: rect(box.querySelector('.preset-dice')!),
					buttons: buttons.map(rect),
					clipped: buttons.filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.textContent),
				};
			});
			const logo = document.querySelector('.topbar-logo');
			return {
				boxes,
				card: rect(document.querySelector('.ds-transport')!),
				swing: rect(document.querySelector('.transport-knobs')!.children[2]),
				play: rect(document.querySelector('.ds-transport .btn3d')!),
				logo: logo && getComputedStyle(logo).display !== 'none' ? rect(logo) : null,
				file: rect([...document.querySelectorAll('.pc-btn')].find((b) => b.textContent!.includes('File'))!),
				pageScrolls: document.documentElement.scrollWidth > window.innerWidth,
			};
		});
		const at = `${width} px`;
		expect(m.boxes, at).toHaveLength(2);
		expect(m.pageScrolls, `${at}: no sideways scroll`).toBe(false);
		for (const b of m.boxes) {
			expect(b.buttons, at).toHaveLength(6);
			expect(b.clipped, `${at}: names fit`).toEqual([]);
			for (const btn of b.buttons) {
				expect(btn.left, at).toBeGreaterThanOrEqual(m.card.left);
				expect(btn.right, at).toBeLessThanOrEqual(m.card.right);
				expect(btn.bottom, at).toBeLessThanOrEqual(m.card.bottom);
			}
			// Three across; the dice in the box's top-right corner, clear of the title and buttons
			expect(new Set(b.buttons.map((x) => Math.round(x.top))).size, at).toBe(2);
			expect(b.dice.right, at).toBeLessThanOrEqual(b.box.right);
			expect(b.dice.top, at).toBeGreaterThanOrEqual(b.box.top);
			expect(b.dice.left, `${at}: dice clear of the title`).toBeGreaterThan(b.title.right);
			expect(b.dice.bottom, `${at}: dice above the buttons`).toBeLessThanOrEqual(Math.min(...b.buttons.map((x) => x.top)));
		}
		const [sounds, patterns] = m.boxes.map((b) => b.box);
		if (width > 720) {
			// Side by side, Sounds first
			expect(Math.round(sounds.top), at).toBe(Math.round(patterns.top));
			expect(patterns.left, at).toBeGreaterThan(sounds.right);
		} else {
			expect(patterns.top, `${at}: one under the other`).toBeGreaterThan(sounds.bottom);
		}
		if (width >= 1200) {
			// Between Swing and Play, and the card is no taller than the knobs need
			expect(sounds.left, at).toBeGreaterThan(m.swing.right);
			expect(patterns.right, at).toBeLessThan(m.play.left);
			expect(m.card.height, at).toBeLessThan(130);
		} else {
			// A row of their own below the knobs
			expect(sounds.top, at).toBeGreaterThan(m.swing.bottom);
		}
		// The logo sits at the top bar's left end, before File (hidden on phones)
		if (width >= 576) expect(m.logo!.right, at).toBeLessThanOrEqual(m.file.left);
		else expect(m.logo, at).toBeNull();
	}
});

// Contrast between an element's text and what's behind it, from a screenshot of just the
// text (not the whole element, whose rounded corners could show something else): the
// background is the most common shade (the median), the text the shade farthest from it.
// WCAG contrast ratio, 1 (invisible) to 21 (black on white).
async function textContrast(page: Page, text: ReturnType<Page['locator']>) {
	const clip = await text.evaluate((el) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		const r = range.getBoundingClientRect();
		return { x: r.left, y: r.top, width: r.width, height: r.height };
	});
	const png = (await page.screenshot({ clip })).toString('base64');
	return page.evaluate(async (b64) => {
		const img = new Image();
		img.src = `data:image/png;base64,${b64}`;
		await img.decode();
		const canvas = document.createElement('canvas');
		canvas.width = img.width;
		canvas.height = img.height;
		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(img, 0, 0);
		const px = ctx.getImageData(0, 0, img.width, img.height).data;
		const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
		const lum: number[] = [];
		for (let i = 0; i < px.length; i += 4) lum.push(0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]));
		lum.sort((a, b) => a - b);
		const bg = lum[Math.floor(lum.length / 2)];
		const fg = bg - lum[0] > lum[lum.length - 1] - bg ? lum[0] : lum[lum.length - 1];
		return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
	}, png);
}

test('the Pattern Tools, Sounds, Patterns and section captions are readable in every theme', async ({ page }) => {
	// The Light theme has no button at the moment (ThemeToggle.vue), but a saved choice still
	// applies it
	for (const theme of ['synthwave', 'dark', 'sand', 'analog', 'slate', 'light']) {
		await page.evaluate((t) => localStorage.setItem('ewave-studio2:ui-theme', t), theme);
		await page.reload();
		await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${theme}`));
		const captions = [
			...await page.locator('.pattern-tools .pt-section-title').all(),
			page.locator('.pattern-tools .pt-inline-check'),
			...await page.locator('.preset-box .pt-section-title').all(),
			...await page.locator('.ds-section-title').all(),
		];
		// Step Fills, Humanize, Octave, Active Pads Only, Sounds, Patterns, Sound, Compose
		expect(captions).toHaveLength(8);
		for (const caption of captions) {
			const name = (await caption.textContent())!.trim();
			expect(await textContrast(page, caption), `${theme}: ${name}`).toBeGreaterThanOrEqual(4.5);
		}
	}
});

test('the Sand theme: its button sits beside Dark and Synthwave, is remembered, and its text is readable', async ({ page }) => {
	const themes = page.getByRole('group', { name: 'Theme' }).getByRole('button');
	await expect(themes).toHaveText(['Dark', 'Synthwave', 'Sand', 'Analog', 'Slate']);
	const sand = page.getByRole('button', { name: 'Sand', exact: true });
	await expect(sand).toHaveAttribute('aria-pressed', 'false');
	await sand.click();
	await expect(sand).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('html')).toHaveClass(/theme-sand/);
	await expect(page.locator('html')).not.toHaveClass(/theme-synthwave/);
	expect(await page.evaluate(() => localStorage.getItem('ewave-studio2:ui-theme'))).toBe('sand');
	// Its own colours: a warm grey page, a light screen, the Waveforms card's wash
	const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
	expect(bodyBg).toContain('rgb(189, 183, 172)');
	expect(await page.locator('.generators .pt-card').evaluate((el) => getComputedStyle(el).backgroundImage))
		.toContain('rgb(233, 195, 164)');

	// Kept after a reload
	await page.reload();
	await expect(page.locator('html')).toHaveClass(/theme-sand/);
	await expect(page.getByRole('button', { name: 'Sand', exact: true })).toHaveAttribute('aria-pressed', 'true');

	// Text that was drawn light-on-light: the MIDI toolbar's caption, the NOISE switch when off,
	// the Melody Maker's chosen key, the ⋯ menu's captions, the link under the frame
	const midi = page.locator('.midi-label');
	const noise = page.locator('.noise-ribbon-label');
	await expect(page.getByRole('button', { name: 'Toggle noise' })).toHaveAttribute('aria-pressed', 'false');
	const key = page.locator('.kb-white.is-active .wlabel');
	const link = page.getByRole('link', { name: 'Return to Ephemeral Wave' });
	for (const [name, text] of [['MIDI Controller', midi], ['NOISE', noise], ['chosen key', key], ['link', link]] as const) {
		await text.scrollIntoViewIfNeeded();
		expect(await textContrast(page, text), name).toBeGreaterThanOrEqual(4.5);
	}
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.getByRole('button', { name: 'Advanced options' }).first().click();
	for (const text of [page.locator('.mm-menu-title').first(), page.locator('.mm-reset').first()]) {
		await expect(text).toBeVisible();
		expect(await textContrast(page, text), (await text.textContent())!.trim()).toBeGreaterThanOrEqual(4.5);
	}
	await page.keyboard.press('Escape');

	// Back to Synthwave: nothing of Sand is left
	await page.getByRole('button', { name: 'Synthwave', exact: true }).click();
	await expect(page.locator('html')).toHaveClass(/theme-synthwave/);
	await expect(page.locator('html')).not.toHaveClass(/theme-sand/);
	expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toContain('rgb(217, 160, 195)');
});

test('Sand: the tiles are dark caps with light lettering, and the LFO switch has dark ink', async ({ page }) => {
	await page.getByRole('button', { name: 'Sand', exact: true }).click();
	for (const tile of [page.getByRole('radio', { name: 'Sine' }).first(), page.getByRole('switch', { name: 'FM' }), page.locator('.lfo-power')]) {
		await tile.scrollIntoViewIfNeeded();
		const label = tile.locator('.wave-label, .lfo-status').first();
		expect(await textContrast(page, label), await label.textContent() ?? '').toBeGreaterThanOrEqual(4.5);
	}
});

test('Analog and Slate: their buttons apply their own colours, and are remembered', async ({ page }) => {
	for (const [name, page1, screen] of [['Analog', 'rgb(107, 75, 52)', '#1a1208'], ['Slate', 'rgb(119, 132, 154)', '#16222a']]) {
		const button = page.getByRole('button', { name, exact: true });
		await button.click();
		await expect(button).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${name.toLowerCase()}`));
		expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toContain(page1);
		expect(await page.locator('.nac-screen').evaluate((el) => getComputedStyle(el).getPropertyValue('--nac-lcd-bg').trim()))
			.toBe(screen);
		await page.reload();
		await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${name.toLowerCase()}`));
	}
});

test('the dice rolls a new sound, keeps the pattern, lights no preset, and undo goes back', async ({ page }) => {
	const projectData = async () =>
		JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	const dice = page.getByRole('button', { name: 'Random sound', exact: true });
	const lit = soundsBox(page).locator('.pt-btn[aria-pressed="true"]');
	const sound = (d: any) => JSON.stringify({ synth: { ...d.synth, tuning: 0, noise: { ...d.synth.noise, mask: 0 } }, fx: d.fx, wave: d.selectedWaveform });
	const pattern = (d: any) => ({
		transport: d.transport, melody: d.melody, tuning: d.synth.tuning, noiseMask: d.synth.noise.mask,
		lanes: d.instruments.map(({ waveforms, ...lane }: any) => lane),
	});

	await page.waitForTimeout(SETTLED);
	await turnOnPads(page, [0, 4, 9]);
	await soundsBox(page).getByRole('button', { name: 'Kick', exact: true }).click();
	await page.waitForTimeout(SETTLED);
	await expect(lit).toHaveText(['Kick']);
	const kick = await projectData();

	// Three rolls: three new sounds, each on every pad, the pattern untouched, nothing lit
	const seen = new Set([sound(kick)]);
	for (let i = 0; i < 3; i++) {
		await dice.click();
		await expect(lit).toHaveCount(0);
		await page.waitForTimeout(SETTLED);
		const data = await projectData();
		seen.add(sound(data));
		expect(pattern(data)).toEqual(pattern(kick));
		expect(new Set(data.instruments.find((l: any) => l.name === 'synth-voice').waveforms)).toEqual(new Set([data.selectedWaveform]));
	}
	expect(seen.size).toBe(4);

	// Each roll is one undo step
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
	await expect(lit).toHaveText(['Kick']);
	expect(sound(await projectData())).toBe(sound(kick));
});

test('patterns set the pattern from the key, never the sound, light up, are one undo step; the dice rolls new ones', async ({ page }) => {
	const projectData = async () =>
		JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	const lane = (d: any) => d.instruments.find((l: any) => l.name === 'synth-voice');
	const sound = (d: any) => JSON.stringify({ synth: d.synth, fx: d.fx, wave: d.selectedWaveform, waves: lane(d).waveforms, transport: d.transport, melody: d.melody });
	const lit = patternsBox(page).locator('.pt-btn[aria-pressed="true"]');
	const soundLit = soundsBox(page).locator('.pt-btn[aria-pressed="true"]');
	await expect(patternsBox(page).locator('.preset-grid .pt-btn')).toHaveText(PATTERNS.map((p) => p.label));
	await expect(lit).toHaveCount(0); // a new project's pads match no pattern

	// A sound of its own, which patterns leave alone
	await page.waitForTimeout(SETTLED);
	await soundsBox(page).getByRole('button', { name: 'Acid', exact: true }).click();
	await page.waitForTimeout(SETTLED);
	const before = await projectData();

	for (const p of PATTERNS) {
		await patternsBox(page).getByRole('button', { name: p.label, exact: true }).click();
		await expect(lit).toHaveText([p.label]);
		await page.waitForTimeout(SETTLED);
		await expect(lit).toHaveText([p.label]); // still lit once saved
		const data = await projectData();
		const l = lane(data);
		expect(l.steps, p.id).toEqual(p.steps.map((s) => s !== null));
		expect(l.velocities, p.id).toEqual(p.steps.map((s) => s?.vel ?? 1));
		expect(l.ratchets, p.id).toEqual(p.steps.map((s) => s?.repeats ?? 1));
		// Notes from the key's root in the pads' octave: A3, 220 Hz
		l.pitches.forEach((hz: number, i: number) => expect(hz, `${p.id} step ${i + 1}`).toBeCloseTo(noteHz(220, p.steps[i]?.note ?? 0), 6));
		expect(sound(data), `${p.id} keeps the sound`).toBe(sound(before));
		await expect(soundLit).toHaveText(['Acid']);
	}

	// It plays
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(() => notesPlayed(page)).toBeGreaterThan(3);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();

	// Turning a pad off unlights it; undo lights it again; each pattern is one undo step
	await pads(page).nth(0).click();
	await expect(lit).toHaveCount(0);
	await page.waitForTimeout(SETTLED);
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+z');
	await expect(lit).toHaveText(['Broken']);
	await page.keyboard.press('Control+z');
	await expect(lit).toHaveText(['Bassline']);

	// In another key, a pattern starts on that key's root
	await page.waitForTimeout(SETTLED);
	await keyButton(page, 'C').click();
	await patternsBox(page).getByRole('button', { name: 'Tresillo', exact: true }).click();
	await page.waitForTimeout(SETTLED);
	const inC = lane(await projectData());
	const pc = (hz: number) => ((Math.round(69 + 12 * Math.log2(hz / 440)) % 12) + 12) % 12;
	expect(inC.pitches.filter((_: number, i: number) => inC.steps[i]).map(pc), 'C, the root (and G, its fifth)').toEqual([0, 0, 0, 0, 0, 7]);

	// The dice: a new pattern each roll, the sound untouched, nothing lit, one undo step each
	const dice = page.getByRole('button', { name: 'Random pattern', exact: true });
	const pulse = await projectData();
	const seen = new Set([JSON.stringify(lane(pulse).steps)]);
	for (let i = 0; i < 3; i++) {
		await dice.click();
		await expect(lit).toHaveCount(0);
		await page.waitForTimeout(SETTLED);
		const data = await projectData();
		seen.add(JSON.stringify([lane(data).steps, lane(data).velocities, lane(data).pitches, lane(data).ratchets]));
		expect(lane(data).steps[0], 'step 1 plays').toBe(true);
		expect(JSON.stringify(data.synth)).toBe(JSON.stringify(pulse.synth));
	}
	expect(seen.size).toBe(4);
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
	await expect(lit).toHaveText(['Tresillo']);
});

test('dice rolls are never silent or clipping', async ({ page }) => {
	await turnOnPads(page, [0, 4, 8, 12]);
	const dice = page.getByRole('button', { name: 'Random sound', exact: true });
	// 200 rolls measured while building it peaked between 0.10 and 0.65 (the presets: 0.2 to 0.5)
	for (let i = 0; i < 8; i++) {
		await dice.click();
		const peak = wavPeak(await exportWav(page));
		expect(peak, `roll ${i + 1}`).toBeGreaterThan(0.04);
		expect(peak, `roll ${i + 1}`).toBeLessThan(0.9);
	}
});

// --- Ratchets --------------------------------------------------------------------------------

test("a step's Repeats play quick hits within the step, live and in WAV exports", async ({ page }) => {
	const setRepeats = async (step: number, label: string) => {
		await page.locator('.pad-settings-dot').nth(step).click();
		await page.getByRole('group', { name: 'Repeats', exact: true }).getByRole('button', { name: label, exact: true }).click();
		await page.keyboard.press('Escape');
	};
	await setTempo(page, 80); // the timings below are at 80 BPM
	await turnOnPads(page, [0]);
	await setRepeats(0, '×3');
	await expect(pads(page).nth(0).locator('..').locator('.ratchet-badge')).toHaveText('×3');
	await expect(pads(page).nth(0)).toHaveAttribute('aria-label', /3 hits$/);

	// Live: three notes in the step's time, a third of a step apart (a 16th at 80 BPM is 187.5 ms)
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(400);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	const times = await page.evaluate(() => [...new Set((window as any).__starts
		.filter((s: any) => s.osc).map((s: any) => s.when as number))].sort((a: any, b: any) => a - b));
	const first = times.find((t) => times.some((u) => Math.abs(u - t - 0.0625) < 1e-6))!;
	expect(first, `note times: ${times.join(', ')}`).toBeDefined();
	expect(times.some((t) => Math.abs(t - first - 0.125) < 1e-6)).toBe(true);
	expect(times.some((t) => Math.abs(t - first - 0.1875) < 1e-6)).toBe(false); // the next step is off

	// Export, two hits: the first ends before the second begins (93.75 ms later), instead of
	// ringing on under it; with one hit, the note just fades
	const levels = async () => {
		const wav = await exportWav(page);
		return { before: wavStats(wav, 80, 90).rms, after: wavStats(wav, 110, 130).rms };
	};
	await setRepeats(0, '×2');
	const two = await levels();
	expect(two.after).toBeGreaterThan(two.before * 5);
	await setRepeats(0, '×1');
	await expect(pads(page).nth(0).locator('..').locator('.ratchet-badge')).toHaveCount(0);
	const one = await levels();
	expect(one.after).toBeLessThan(one.before);

	// Saved with the project, and Reset Pads puts every step back to one hit
	await setRepeats(4, '×4');
	expect(JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data
		.instruments.find((l: any) => l.name === 'synth-voice').ratchets[4]).toBe(4);
	await page.locator('.step-menu-anchor .pt-info-icon').click();
	await page.getByRole('menuitem', { name: 'Reset Pads' }).click();
	await expect(page.locator('.ratchet-badge')).toHaveCount(0);
});

test('the Repeats brush gives every pad it crosses that many hits, and takes them off again', async ({ page }) => {
	const ratchets = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data
		.instruments.find((l: any) => l.name === 'synth-voice').ratchets as number[];
	const onSteps = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data
		.instruments.find((l: any) => l.name === 'synth-voice').steps as boolean[];
	const badge = (i: number) => pads(page).nth(i).locator('..').locator('.ratchet-badge:not(.is-preview)');
	await page.waitForTimeout(SETTLED); // the opened project becomes the starting point
	await turnOnPads(page, [0]);
	await page.waitForTimeout(SETTLED);

	const x3 = page.getByRole('button', { name: 'Repeats brush ×3' });
	await x3.click();
	await expect(x3).toHaveAttribute('aria-pressed', 'true');

	// A drag from pad 1 to pad 4: each gets three hits, and the ones that were off turn on
	const box = async (i: number) => (await pads(page).nth(i).boundingBox())!;
	const a = await box(0), b = await box(3);
	await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
	await page.mouse.down();
	await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
	await page.mouse.up();
	await page.mouse.move(5, 5); // off the pads: the one under the mouse shows the brush's preview
	for (const i of [0, 1, 2, 3]) await expect(badge(i)).toHaveText('×3');
	expect((await ratchets()).slice(0, 5)).toEqual([3, 3, 3, 3, 1]);
	expect((await onSteps()).slice(0, 5)).toEqual([true, true, true, true, false]);

	// The whole drag is one undo step
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	for (const i of [0, 1, 2, 3]) await expect(badge(i)).toHaveCount(0);
	await expect(pads(page).nth(1)).toHaveAttribute('aria-pressed', 'false');
	await expect(pads(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	for (const i of [0, 1, 2, 3]) await expect(badge(i)).toHaveText('×3');

	// A pad that has the brush's hits already goes back to one, and stays on
	await pads(page).nth(1).click();
	await page.mouse.move(5, 5);
	await expect(badge(1)).toHaveCount(0);
	expect((await ratchets()).slice(0, 4)).toEqual([3, 1, 3, 3]);
	expect((await onSteps())[1]).toBe(true);

	// Another count paints over; the keyboard's Enter paints the focused pad
	await page.getByRole('button', { name: 'Repeats brush ×2' }).click();
	await expect(x3).toHaveAttribute('aria-pressed', 'false');
	await pads(page).nth(5).focus();
	await page.keyboard.press('Enter');
	await expect(badge(5)).toHaveText('×2');

	// Esc puts the brush down: a click turns a pad on or off again
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: 'Repeats brush ×2' })).toHaveAttribute('aria-pressed', 'false');
	await pads(page).nth(5).click();
	await expect(pads(page).nth(5)).toHaveAttribute('aria-pressed', 'false');
	await expect(badge(5)).toHaveText('×2'); // its repeats stay for when it's back on

	// ⋯ → Clear Repeats: every pad back to one hit
	await page.locator('.step-menu-anchor .pt-info-icon').click();
	await page.getByRole('menuitem', { name: 'Clear Repeats' }).click();
	await expect(page.locator('.ratchet-badge')).toHaveCount(0);
	expect((await ratchets()).every((n) => n === 1)).toBe(true);
});

test("a pad's settings: its ⋮ closes them, they stay on screen, and a key plays the note", async ({ page }) => {
	const dot = (i: number) => page.locator('.pad-settings-dot').nth(i);
	const popover = page.locator('.pad-popover');

	// The same ⋮ again closes it; another pad's ⋮ moves it there
	await dot(2).click();
	await expect(popover).toContainText('Pad 3');
	await dot(2).click();
	await expect(popover).toHaveCount(0);
	await dot(2).click();
	await dot(5).click();
	await expect(popover).toContainText('Pad 6');

	// A key plays the pad's new note (and sets it), on the pad's own wave
	await page.evaluate(() => { (window as any).__starts.length = 0; });
	await popover.getByRole('button', { name: 'D', exact: true }).click();
	await expect.poll(() => page.evaluate(() => (window as any).__starts.filter((s: any) => s.osc).length)).toBeGreaterThan(0);
	await page.keyboard.press('Escape');
	await expect(popover).toHaveCount(0);

	// The last pads' settings stay inside the window at any width
	for (const width of [1600, 1280, 1024, 820]) {
		await page.setViewportSize({ width, height: 900 });
		await dot(15).scrollIntoViewIfNeeded();
		await dot(15).click();
		const box = (await popover.boundingBox())!;
		const viewW = await page.evaluate(() => document.documentElement.clientWidth);
		expect(box.x, `left edge at ${width} px`).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width, `right edge at ${width} px`).toBeLessThanOrEqual(viewW);
		await page.keyboard.press('Escape');
		await expect(popover).toHaveCount(0);
	}
});

// --- Export audio ----------------------------------------------------------------------------

test('Export audio: a loop is exactly N bars, with the echoes from its end folded onto its start', async ({ page }) => {
	await setTempo(page, 80); // the timings below are at 80 BPM
	const name = page.getByRole('textbox', { name: 'Project name' });
	await name.fill('Loop Test');
	await name.press('Enter');
	// One note, late in the bar (step 13, 2.25 s in at 80 BPM): its second echo, 1.125 s later,
	// crosses the loop's end
	await turnOnPads(page, [12]);
	const delaySwitch = page.locator('.fx .footswitch').first();
	await delaySwitch.click();
	await expect(delaySwitch).toHaveAttribute('aria-pressed', 'true');

	// Escape and Cancel leave without exporting
	await chooseFromFileMenu(page, 'Export audio…');
	const dialog = page.getByRole('dialog', { name: 'Export audio' });
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	// A loop, normalized (the defaults): exactly 2 bars, the last echoes heard at its start
	const loop = await exportAudio(page, { bars: 2, ending: 'Loop', mix: true, stems: false, midi: false, oneShot: false, normalize: true });
	expect(loop.name).toBe('Loop Test_80bpm_2bars_mix.wav');
	const l = wavSamples(loop.bytes);
	expect(l.frames).toBe(Math.round(2 * 4 * (60 / 80) * l.rate));
	expect(wavWindow(loop.bytes, 0, 2).peak).toBeGreaterThan(0.02);
	expect(wavWindow(loop.bytes, 0, 6).peak).toBeCloseTo(0.891, 2); // −1 dBFS

	// With the tail: a clean start, and the echoes ring on past the 2 bars
	const tail = await exportAudio(page, { ending: 'With tail' });
	expect(tail.name).toBe('Loop Test_80bpm_2bars-tail_mix.wav');
	const t = wavSamples(tail.bytes);
	expect(t.frames).toBeGreaterThan(l.frames);
	expect(wavWindow(tail.bytes, 0, 2).peak).toBe(0);
	expect(wavWindow(tail.bytes, 6, 6.5).rms).toBeGreaterThan(0.001);
});

test('Export audio: effects stems add up to the mix; a MIDI file and a one-shot come in the same zip', async ({ page }) => {
	await setTempo(page, 80); // the names and the MIDI file's timing below are at 80 BPM
	const name = page.getByRole('textbox', { name: 'Project name' });
	await name.fill('Stems');
	await name.press('Enter');
	await turnOnPads(page, [0, 4, 8, 12]);
	// Noise and reverb (Snare), the delay, and random pitch sweeps: every stem has sound, and
	// each is rendered with the same random numbers as the mix
	await soundsBox(page).getByRole('button', { name: 'Snare', exact: true }).click();
	await page.locator('.fx .footswitch').first().click();
	await page.getByRole('button', { name: 'Random sweep', exact: true }).click();

	const zip = await exportAudio(page, {
		bars: 1, ending: 'Loop', mix: true, stems: true, midi: true, oneShot: true, oneShotNote: 'A2 (110 Hz)', normalize: true,
	});
	expect(zip.name).toBe('Stems_80bpm_1bar.zip');
	const files = unzip(zip.bytes);
	expect(Object.keys(files).sort()).toEqual([
		'Stems_80bpm_1bar.mid',
		'Stems_80bpm_1bar_delay.wav', 'Stems_80bpm_1bar_dry.wav', 'Stems_80bpm_1bar_mix.wav',
		'Stems_80bpm_1bar_noise.wav', 'Stems_80bpm_1bar_reverb.wav',
		'Stems_oneshot_A2.wav',
	]);

	// The stems add up to the mix, sample for sample, in both channels
	for (const ch of [0, 1]) {
		const mix = wavSamples(files['Stems_80bpm_1bar_mix.wav'], ch).samples;
		const stems = ['dry', 'delay', 'reverb', 'noise'].map((p) => wavSamples(files[`Stems_80bpm_1bar_${p}.wav`], ch).samples);
		let worst = 0, loudest = 0;
		for (let i = 0; i < mix.length; i++) {
			const sum = stems.reduce((a, s) => a + s[i], 0);
			worst = Math.max(worst, Math.abs(sum - mix[i]));
			loudest = Math.max(loudest, Math.abs(mix[i]));
		}
		expect(worst, `channel ${ch}`).toBeLessThan(1e-3);
		if (ch === 0) expect(loudest).toBeLessThanOrEqual(0.892);
		for (const s of stems) expect(s.length).toBe(mix.length);
	}

	// The MIDI file: 4 notes at A3 (MIDI 57) in a bar at 80 BPM
	const midi = files['Stems_80bpm_1bar.mid'];
	expect(midi.subarray(0, 4).toString('latin1')).toBe('MThd');
	const noteOns = [...midi.subarray(22)].flatMap((b, i, a) => (b === 0x90 ? [a[i + 1]] : []));
	expect(noteOns).toEqual([57, 57, 57, 57]);

	// The one-shot: one hit, trimmed where it fades, normalized on its own
	const shot = wavSamples(files['Stems_oneshot_A2.wav']);
	expect(shot.frames / shot.rate).toBeLessThan(6);
	expect(shot.frames / shot.rate).toBeGreaterThan(0.1);
	expect(wavWindow(files['Stems_oneshot_A2.wav'], 0, 6).peak).toBeGreaterThan(0.8);
});

test("Export audio: the dialog keeps the last export's choices, until File → New puts back the defaults", async ({ page }) => {
	await turnOnPads(page, [0]);
	const dialog = page.getByRole('dialog', { name: 'Export audio' });
	const choices = async () => {
		await chooseFromFileMenu(page, 'Export audio…');
		await expect(dialog).toBeVisible();
		const pressed = async (group: string) =>
			(await dialog.getByRole('group', { name: group }).locator('[aria-pressed="true"]').textContent())!.trim();
		const checked = (name: RegExp) => dialog.getByRole('checkbox', { name }).isChecked();
		const now = {
			bars: await pressed('Bars'), ending: await pressed('Ending'),
			mix: await checked(/^Mix/), stems: await checked(/^Effects stems/), midi: await checked(/^MIDI file/),
			oneShot: await checked(/^One-shot at/), normalize: await checked(/^Normalize/),
		};
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		return now;
	};
	const defaults = { bars: '1', ending: 'Loop', mix: true, stems: false, midi: false, oneShot: false, normalize: true };
	expect(await choices()).toEqual(defaults);

	await exportAudio(page, { bars: 4, ending: 'With tail', mix: true, stems: true, midi: true, oneShot: false, normalize: false });
	const used = { bars: '4', ending: 'With tail', mix: true, stems: true, midi: true, oneShot: false, normalize: false };
	expect(await choices()).toEqual(used);

	// Opening another project keeps them
	const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'Other.json', mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ ...project, projectId: 'other', meta: { name: 'Other' } })),
	});
	await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Other');
	expect(await choices()).toEqual(used);

	// A new project starts from the defaults, like everything else
	await chooseFromFileMenu(page, 'New');
	await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(0);
	expect(await choices()).toEqual(defaults);
});

// --- MIDI learn ------------------------------------------------------------------------------

// A fake MIDI controller, chosen in the MIDI list; returns how to turn one of its knobs
async function connectController(page: Page) {
	await page.addInitScript(() => {
		const w = window as any;
		w.__midiInput = { id: 'test-controller', name: 'Test Controller', onmidimessage: null };
		const access = { inputs: new Map([['test-controller', w.__midiInput]]), outputs: new Map(), onstatechange: null };
		(navigator as any).requestMIDIAccess = async () => access;
	});
	await page.reload();
	await expect(pads(page)).toHaveCount(16);
	await page.getByRole('button', { name: 'Enable MIDI' }).click();
	const learn = page.getByRole('button', { name: 'Learn', exact: true });
	await expect(learn).toBeDisabled(); // no controller chosen yet
	await page.locator('#midi-input-select').selectOption('test-controller');
	await expect(learn).toBeEnabled();
	// Control change `controller` to `value` (0–127), on MIDI channel `channel` (1–16)
	return (controller: number, value: number, channel = 1) => page.evaluate(([c, v, ch]) =>
		(window as any).__midiInput.onmidimessage({ data: new Uint8Array([0xb0 + ch - 1, c, v]) }), [controller, value, channel]);
}

test("MIDI learn: a controller knob turns the knob it's linked to, along its range, as one undo step, and the link is kept", async ({ page }) => {
	const turn = await connectController(page);
	const learn = page.getByRole('button', { name: 'Learn', exact: true });
	const bar = page.getByRole('region', { name: 'MIDI learn' });
	const cutoff = page.getByRole('slider', { name: 'Cutoff' });
	const pitchDecay = page.locator('[data-midi-id="pitchEnv.decay"]');

	// Before learning, a controller knob turns nothing
	await turn(21, 127);
	await expect(cutoff).toHaveAttribute('aria-valuenow', '5000');

	await learn.click();
	await expect(learn).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.knob-wrapper.midi-learnable')).toHaveCount(32);
	await cutoff.click();
	await expect(cutoff).toHaveClass(/\bmidi-armed\b/);
	await expect(bar).toContainText('Cutoff: turn a knob on your controller.');
	await turn(21, 127);
	// Linked, and the knob jumps to where the controller's knob is
	await expect(bar).toContainText('Cutoff follows CC 21.');
	await expect(cutoff.locator('.knob-midi-badge')).toHaveText('CC 21');
	await expect(cutoff).toHaveAttribute('aria-description', 'Follows CC 21');
	await expect(cutoff).toHaveAttribute('aria-valuenow', '10000');

	// A knob with a logarithmic taper follows its own curve: halfway is about 100 ms, not 1000
	await pitchDecay.click();
	await turn(22, 64, 3);
	await expect(pitchDecay.locator('.knob-midi-badge')).toHaveText('CC 22 ch 3');
	await expect(pitchDecay).toHaveAttribute('aria-valuenow', '102');

	await bar.getByRole('button', { name: 'Done' }).click();
	await expect(bar).toBeHidden();
	await expect(page.locator('.knob-wrapper.midi-learnable')).toHaveCount(0);
	await expect(page.locator('.knob-midi-badge')).toHaveCount(0);

	// After learning: the ends of the controller's turn are the knob's ends. The knob shows
	// its value as a drag would, and lets go once the controller knob rests.
	await turn(21, 0);
	await expect(cutoff).toHaveAttribute('aria-valuenow', '100');
	await expect(page.locator('.custom-tooltip', { hasText: '100 Hz' })).toBeVisible();
	await expect(page.locator('.custom-tooltip')).toHaveCount(0, { timeout: 2000 });
	await turn(22, 127); // channel 1: not the knob linked on channel 3
	await expect(pitchDecay).toHaveAttribute('aria-valuenow', '102');
	await turn(22, 0, 3);
	await expect(pitchDecay).toHaveAttribute('aria-valuenow', '5');

	// A sweep of the controller knob is one undo step, like a drag
	await page.waitForTimeout(700);
	for (let v = 10; v <= 120; v += 10) await turn(21, v);
	await expect.poll(async () => Number(await cutoff.getAttribute('aria-valuenow'))).toBeGreaterThan(9000);
	await page.waitForTimeout(700);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(cutoff).toHaveAttribute('aria-valuenow', '100');

	// The links belong to this browser, not to the project: kept after a reload
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+s');
	await expect(page.locator('.pc-dot')).toHaveClass(/\bsaved\b/);
	expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ewave-studio2:midi-map')))!))
		.toEqual({ '1:21': 'filter.cutoff', '3:22': 'pitchEnv.decay' });
	await page.reload();
	await expect(pads(page)).toHaveCount(16);
	await page.getByRole('button', { name: 'Enable MIDI' }).click();
	await page.locator('#midi-input-select').selectOption('test-controller');
	await turn(21, 127);
	await expect(cutoff).toHaveAttribute('aria-valuenow', '10000');
});

test('MIDI learn: one controller knob per knob; Delete, Clear all and Escape; greyed-out knobs wait', async ({ page }) => {
	const turn = await connectController(page);
	const learn = page.getByRole('button', { name: 'Learn', exact: true });
	const bar = page.getByRole('region', { name: 'MIDI learn' });
	const cutoff = page.getByRole('slider', { name: 'Cutoff' });
	const resonance = page.getByRole('slider', { name: 'Resonance' });
	const attack = page.getByRole('slider', { name: 'Attack' });
	const badge = (knob: typeof cutoff) => knob.locator('.knob-midi-badge');
	await learn.click();

	// A controller knob linked to another knob leaves the first
	await cutoff.click();
	await turn(21, 64);
	await resonance.click();
	await turn(21, 64);
	await expect(badge(resonance)).toHaveText('CC 21');
	await expect(badge(cutoff)).toHaveCount(0);
	// ... and a knob linked to another controller knob leaves the first
	await resonance.click();
	await turn(30, 64);
	await expect(badge(resonance)).toHaveText('CC 30');
	expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ewave-studio2:midi-map')))!))
		.toEqual({ '1:30': 'filter.resonance' });

	// From the keyboard: Enter arms the focused knob, Delete unlinks it
	await attack.focus();
	await page.keyboard.press('Enter');
	await turn(22, 0);
	await expect(badge(attack)).toHaveText('CC 22');
	await page.keyboard.press('Delete');
	await expect(badge(attack)).toHaveCount(0);
	await expect(bar).toContainText('Attack no longer follows the controller.');

	// A greyed-out knob (the delay is off) can be linked; it moves once its module is on
	const delayMix = page.locator('[data-midi-id="delay.mix"]');
	await expect(delayMix).toHaveAttribute('aria-disabled', 'true');
	await delayMix.focus();
	await page.keyboard.press('Enter');
	await turn(23, 127);
	await expect(bar).toContainText('Delay mix follows CC 23 once its module is on.');
	await expect(delayMix).toHaveAttribute('aria-valuenow', '0.3');

	await bar.getByRole('button', { name: 'Clear all' }).click();
	await expect(page.locator('.knob-midi-badge')).toHaveCount(0);
	await expect(bar.getByRole('button', { name: 'Clear all' })).toHaveCount(0);
	const q = (await resonance.getAttribute('aria-valuenow'))!;
	await turn(30, 0);
	await page.waitForTimeout(100);
	await expect(resonance).toHaveAttribute('aria-valuenow', q);

	// Escape ends learn mode
	await page.keyboard.press('Escape');
	await expect(bar).toBeHidden();
	await expect(learn).toHaveAttribute('aria-pressed', 'false');
	await expect(page.locator('.knob-wrapper.midi-learnable')).toHaveCount(0);
});

// --- Install as an app (PWA) -------------------------------------------------------------------

test.describe('Install as an app (PWA)', () => {
	test.use({ serviceWorkers: 'allow' });

	// The service worker has saved the app's files and serves this page
	const workerReady = (page: Page) => page.waitForFunction(() => !!navigator.serviceWorker.controller);

	test('Chrome can install it: manifest, icons and a service worker for /studio2/ only', async ({ page, context }) => {
		await workerReady(page);
		const cdp = await context.newCDPSession(page);
		expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
		const manifest = await cdp.send('Page.getAppManifest');
		expect(manifest.errors).toEqual([]);
		expect(manifest.url).toMatch(/\/studio2\/manifest\.json$/);
		const m = JSON.parse(manifest.data!);
		expect(m).toMatchObject({ name: 'Ephemeral Wave Synth 2', start_url: './', scope: './', display: 'standalone' });
		// Each icon is the size it says
		for (const icon of m.icons) {
			expect(await page.evaluate(async (src) => {
				const img = new Image();
				img.src = src;
				await img.decode();
				return `${img.naturalWidth}x${img.naturalHeight}`;
			}, icon.src)).toBe(icon.sizes);
		}
		// Never the main site or /studio/
		expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.scope))
			.toBe(new URL('/studio2/', page.url()).href);
	});

	test("File → Install app… appears while the browser offers to install, and shows the browser's dialog", async ({ page }) => {
		const fileMenu = page.getByRole('button', { name: 'File ▾' });
		const install = page.getByRole('menuitem', { name: 'Install app…' });
		await fileMenu.click();
		await expect(page.getByRole('menuitem', { name: 'Export audio…' })).toBeVisible();
		await expect(install).toHaveCount(0); // not offered (yet)
		await fileMenu.click(); // closes it
		await expect(page.getByRole('menuitem', { name: 'Export audio…' })).toBeHidden();

		// Chrome offers it (headless Chrome doesn't by itself)
		await page.evaluate(() => {
			const w = window as any;
			w.__installPrompts = 0;
			const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
				prompt: async () => { w.__installPrompts++; },
				userChoice: Promise.resolve({ outcome: 'accepted' }),
			});
			window.dispatchEvent(offer);
			w.__offerPrevented = offer.defaultPrevented; // no mini-infobar: the menu item instead
		});
		expect(await page.evaluate(() => (window as any).__offerPrevented)).toBe(true);
		await fileMenu.click();
		await install.click();
		expect(await page.evaluate(() => (window as any).__installPrompts)).toBe(1);
		await expect(install).toHaveCount(0); // the menu closed
		await fileMenu.click();
		await expect(page.getByRole('menuitem', { name: 'Export audio…' })).toBeVisible();
		await expect(install).toHaveCount(0); // a browser's offer can be used once
	});

	test('works offline once it has been opened, sound included', async ({ page, context }) => {
		await workerReady(page);
		await context.setOffline(true);
		await page.reload();
		await expect(pads(page)).toHaveCount(16);
		await turnOnPads(page, [0]);
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect.poll(() => notesPlayed(page)).toBeGreaterThan(0);
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
		await context.setOffline(false);
	});

	test('a new version installs in the background and waits for Reload; a half-uploaded deploy is never used', async ({ page }) => {
		await workerReady(page);
		// A deploy, staged in the build the test server serves (put back afterwards): a new
		// index.html, and the sw.js that lists it
		const swFile = 'dist/sw.js', htmlFile = 'dist/index.html';
		const sw = readFileSync(swFile, 'utf8'), html = readFileSync(htmlFile, 'utf8');
		const nextHtml = html.replace('</body>', '<!-- next version --></body>');
		const sha = (s: string) => createHash('sha256').update(s).digest('hex');
		const nextSw = sw.replace(/"version": "\w{12}"/, '"version": "000000000002"').replace(sha(html), sha(nextHtml));
		expect(nextSw).toContain(sha(nextHtml));

		const checkForUpdate = () => page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
		const installing = () => page.evaluate(async () => {
			const r = (await navigator.serviceWorker.getRegistration())!;
			return { installing: !!r.installing, waiting: !!r.waiting };
		});
		const versions = () => page.evaluate(() => caches.keys());
		const notice = page.getByRole('region', { name: 'New version' });
		const before = await versions();
		try {
			// The new sw.js is up, but index.html is still the old one: that install fails, and
			// the app keeps its files
			writeFileSync(swFile, nextSw);
			await checkForUpdate();
			await expect.poll(installing).toEqual({ installing: false, waiting: false });
			expect(await versions()).toEqual(before);
			await expect(notice).toHaveCount(0);

			// The upload has finished: the new version installs, then waits to be asked
			writeFileSync(htmlFile, nextHtml);
			await checkForUpdate();
			await expect(notice).toBeVisible();
			await expect(notice).toContainText('A new version of the app is ready.');
			expect(await page.content()).not.toContain('next version');

			const reloaded = page.waitForEvent('load');
			await notice.getByRole('button', { name: 'Reload' }).click();
			await reloaded;
			expect(await page.content()).toContain('<!-- next version -->');
			await expect(pads(page)).toHaveCount(16);
			await expect(notice).toHaveCount(0);
			expect(await versions()).toEqual(['ewave-studio2-app-000000000002']); // the old files are gone
		} finally {
			writeFileSync(swFile, sw);
			writeFileSync(htmlFile, html);
		}
	});
});

// --- Knob notches --------------------------------------------------------------------------------

// Drag a knob up (or down) one pixel at a time; the value after each pixel
async function dragKnob(page: Page, knob: Locator, pixels: number) {
	await knob.scrollIntoViewIfNeeded();
	const box = (await knob.boundingBox())!;
	const x = box.x + box.width / 2, y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	const values: number[] = [];
	for (let i = 1; i <= Math.abs(pixels); i++) {
		await page.mouse.move(x, y - Math.sign(pixels) * i);
		values.push(Number(await knob.getAttribute('aria-valuenow')));
	}
	await page.mouse.up();
	return values;
}

// How many pixels in a row the drag stayed on `value`
const heldFor = (values: number[], value: number) =>
	Math.max(0, ...values.map((_, i) => values.slice(i).findIndex((v) => v !== value)).map((n, i) => (values[i] === value ? (n < 0 ? values.length - i : n) : 0)));

test('knob notches: Tempo and Swing hold at common values while dragged, and light up on one', async ({ page }) => {
	const tempo = page.getByRole('slider', { name: 'Tempo' });
	const swing = page.getByRole('slider', { name: 'Swing' });
	const tempoBox = page.locator('.tempo-stepper .stepper-value');
	await expect(tempo.locator('.dial-detent')).toHaveCount(7);
	await expect(swing.locator('.dial-detent')).toHaveCount(5);
	await expect(page.getByRole('slider', { name: 'Volume' }).locator('.dial-detent')).toHaveCount(0);

	// The page starts at 120 BPM, a notch: its tick, the pointer and the readout light up
	await expect(tempo).toHaveAttribute('aria-valuenow', '120');
	await expect(tempo).toHaveClass(/\bat-detent\b/);
	await expect(tempo.locator('.dial-detent.is-on')).toHaveCount(1);
	await expect(tempoBox).toHaveClass(/\bon-stop\b/);

	// Down from 120: about 1.4 BPM a pixel, but each notch holds for 14 px
	const bpm = await dragKnob(page, tempo, -150);
	for (const notch of [100, 90, 60]) expect(heldFor(bpm, notch)).toBeGreaterThanOrEqual(14);
	expect(heldFor(bpm, 110)).toBeLessThanOrEqual(2); // not a notch
	// It never jumps: each pixel moves it by at most two steps
	bpm.reduce((a, b) => { expect(a - b).toBeLessThanOrEqual(2); expect(b).toBeLessThanOrEqual(a); return b; }, 120);
	// Off a notch, nothing is lit
	await dragKnob(page, tempo, 10);
	await expect(tempo).not.toHaveClass(/\bat-detent\b/);
	await expect(tempo.locator('.dial-detent.is-on')).toHaveCount(0);
	await expect(tempoBox).not.toHaveClass(/\bon-stop\b/);

	// Swing (4 px a 1 % step): each notch holds for its step and 14 px more
	const amounts = await dragKnob(page, swing, 260);
	for (const notch of SWING_DETENTS) expect(heldFor(amounts, notch)).toBeGreaterThanOrEqual(16);
	expect(heldFor(amounts, 0.3)).toBeLessThanOrEqual(5);
	// The triplet notch says so, and lights up: from 0, the middle of its hold
	await dragKnob(page, swing, -300);
	await expect(swing).toHaveAttribute('aria-valuenow', '0');
	const triplet = SWING_DETENTS.indexOf(0.33);
	await dragKnob(page, swing, Math.round((0.33 / 0.5 + (triplet + 0.5) * DETENT_HOLD) * 200));
	await expect(swing).toHaveAttribute('aria-valuenow', '0.33');
	await expect(swing).toHaveAttribute('aria-valuetext', '33% (triplet)');
	await expect(swing).toHaveClass(/\bat-detent\b/);
	await expect(page.locator('.stepper-value.on-stop', { hasText: '33%' })).toBeVisible();
});

test('knob notches: a two-way knob holds at its middle; a MIDI controller can reach 120 BPM', async ({ page }) => {
	// Filter Env Amt starts at 0: a drag first holds there, then moves
	const envAmt = page.getByRole('slider', { name: 'Env Amt' });
	await expect(envAmt).toHaveAttribute('aria-valuenow', '0');
	await expect(envAmt).toHaveClass(/\bat-detent\b/); // its zero tick is a notch, lit
	await expect(envAmt.locator('.dial-zero.dial-detent.is-on')).toHaveCount(1);
	const up = await dragKnob(page, envAmt, 20);
	expect(heldFor(up, 0)).toBeGreaterThanOrEqual(3);
	expect(up.at(-1)).toBeGreaterThan(0);
	// Dragged through from below, it holds again at 0
	await dragKnob(page, envAmt, -60);
	expect(heldFor(await dragKnob(page, envAmt, 60), 0)).toBeGreaterThanOrEqual(6);

	// Noise Color: a notch at each named color
	await expect(page.getByRole('slider', { name: 'Noise color' }).locator('.dial-detent')).toHaveCount(3);

	// A controller knob linked to Tempo, swept from one end to the other, lands on every notch
	// (without notches its 128 steps go 119, 121)
	const turn = await connectController(page);
	await page.getByRole('button', { name: 'Learn', exact: true }).click();
	const tempo = page.getByRole('slider', { name: 'Tempo' });
	await tempo.click();
	await turn(20, 0);
	await page.keyboard.press('Escape');
	await expect(tempo).toHaveAttribute('aria-valuenow', '20');
	const reached = await page.evaluate(async () => {
		const seen: number[] = [];
		const knob = document.querySelector('[data-midi-id="transport.tempo"]')!;
		for (let cc = 0; cc < 128; cc++) {
			(window as any).__midiInput.onmidimessage({ data: new Uint8Array([0xb0, 20, cc]) });
			await new Promise((r) => setTimeout(r));
			seen.push(Number(knob.getAttribute('aria-valuenow')));
		}
		return seen;
	});
	for (const notch of TEMPO_DETENTS) expect(reached).toContain(notch);
	expect(reached.at(-1)).toBe(300);
});

// --- Melody Maker --------------------------------------------------------------------------------

// The note on each of these pads (they must be on): "C4", "D#4", ...
const padNotes = (page: Page, indexes: number[]) => Promise.all(indexes.map(async (i) =>
	((await pads(page).nth(i).getAttribute('aria-label')) ?? '').replace(/^Step \d+, /, '').split(',')[0]));
const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const noteMidi = (name: string) => {
	const m = /^([A-G][#b]?)(-?\d+)$/.exec(name)!;
	return (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
};
const keyButton = (page: Page, key: string) => page.locator('.mm-kb').getByRole('radio', { name: key, exact: true });

async function chooseOption(page: Page, select: string, option: string) {
	await page.getByRole('button', { name: select }).click();
	await page.getByRole('option', { name: option, exact: true }).click();
}

test("Melody Maker: its ⋯ menu opens inside the window at every width, without Undo last melody", async ({ page }) => {
	for (const width of [1600, 1280, 1024, 820, 390]) {
		await page.setViewportSize({ width, height: 900 });
		if (width < 1200) await page.getByRole('tab', { name: 'Compose' }).click();
		const button = page.locator('.module.melody .pt-info-icon').first();
		await button.scrollIntoViewIfNeeded();
		await button.click();
		const menu = page.locator('.melody-maker .mm-menu');
		await expect(menu).toBeVisible();
		await expect(menu).toContainText('Advanced Options');
		await expect(menu).not.toContainText('Undo last melody'); // Undo (Ctrl+Z) does it
		const box = (await menu.boundingBox())!;
		const view = await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: window.innerHeight }));
		expect(box.x, `left edge at ${width} px`).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width, `right edge at ${width} px`).toBeLessThanOrEqual(view.w);
		expect(box.y, `top at ${width} px`).toBeGreaterThanOrEqual(0);
		expect(box.y + box.height, `bottom at ${width} px`).toBeLessThanOrEqual(view.h);
		await page.keyboard.press('Escape');
		await expect(menu).toHaveCount(0);
	}
});

test('Melody Maker: clicking a key moves the pattern there, the shorter way, plays it, and is one undo step', async ({ page }) => {
	const on = [0, 4, 8, 12];
	await turnOnPads(page, on);
	expect(await padNotes(page, on)).toEqual(['A3', 'A3', 'A3', 'A3']);
	await page.waitForTimeout(600); // let the undo history note the starting pattern

	const before = await notesPlayed(page);
	await keyButton(page, 'C').click();
	await expect(keyButton(page, 'C')).toHaveAttribute('aria-checked', 'true');
	expect(await padNotes(page, on)).toEqual(['C4', 'C4', 'C4', 'C4']); // A → C: up 3, not down 9
	await expect.poll(() => notesPlayed(page)).toBeGreaterThan(before); // and the key sounded

	await page.waitForTimeout(600);
	await keyButton(page, 'G').click();
	expect(await padNotes(page, on)).toEqual(['G3', 'G3', 'G3', 'G3']); // C → G: down 5, not up 7
	// Pads that are off moved with the rest (G3 is 196 Hz)
	const pitches = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'))
		.data.instruments.find((i: any) => i.name === 'synth-voice').pitches as number[];
	for (const hz of pitches) expect(hz).toBeCloseTo(196, 1);

	// Undo goes back to C, pads and key together
	await page.waitForTimeout(600);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(keyButton(page, 'C')).toHaveAttribute('aria-checked', 'true');
	expect(await padNotes(page, on)).toEqual(['C4', 'C4', 'C4', 'C4']);
});

test('Melody Maker: a new scale keeps each note on its degree; a project opening keeps its notes', async ({ page }) => {
	const on = [0, 1, 2, 3, 4, 5, 6, 7];
	await turnOnPads(page, on);
	await keyButton(page, 'C').click();
	await chooseOption(page, 'Scale', 'Minor');
	// An arpeggio up the C minor scale: C D Eb F G Ab Bb C
	await page.getByRole('button', { name: 'Arpeggio', exact: true }).click();
	await chooseOption(page, 'Arp tones', 'Scale');
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	const minor = (await padNotes(page, on)).map(noteMidi);
	expect(minor.map((m) => (m - minor[0] + 120) % 12)).toEqual([0, 2, 3, 5, 7, 8, 10, 0]);

	// Major: the third, sixth and seventh go up a semitone, nothing else moves
	await chooseOption(page, 'Scale', 'Major');
	const major = (await padNotes(page, on)).map(noteMidi);
	expect(major.map((m, i) => m - minor[i])).toEqual([0, 0, 1, 0, 0, 1, 1, 0]);
	// Back to minor: as it was
	await chooseOption(page, 'Scale', 'Minor');
	expect((await padNotes(page, on)).map(noteMidi)).toEqual(minor);
	// "None" moves nothing
	await chooseOption(page, 'Scale', 'None');
	expect((await padNotes(page, on)).map(noteMidi)).toEqual(minor);

	// A project opening brings its own notes and key: they aren't moved again
	await chooseOption(page, 'Scale', 'Minor');
	const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	await keyButton(page, 'E').click();
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'Minor.json', mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ ...project, projectId: 'minor', meta: { name: 'Minor' } })),
	});
	await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Minor');
	await expect(keyButton(page, 'C')).toHaveAttribute('aria-checked', 'true');
	expect((await padNotes(page, on)).map(noteMidi)).toEqual(minor);
});

test('Melody Maker: one Generate button, Random or Arpeggio, the card keeps its height, the choice is saved', async ({ page }) => {
	const generate = page.getByRole('button', { name: /^Generate/ });
	await expect(generate).toHaveCount(1);
	await expect(generate).toHaveText('Generate');
	const mode = page.getByRole('group', { name: 'Generate' });
	const random = mode.getByRole('button', { name: 'Random', exact: true });
	const arp = mode.getByRole('button', { name: 'Arpeggio', exact: true });
	await expect(random).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: 'Arp pattern' })).toBeHidden();
	await expect(page.locator('.mm-mode-note')).toContainText('No scale chosen: every pad gets A');
	const card = page.locator('.module.melody');
	const height = (await card.boundingBox())!.height;

	await arp.click();
	await expect(page.getByRole('button', { name: 'Arp pattern' })).toBeVisible();
	await expect(page.locator('.mm-mode-note')).toBeHidden();
	expect((await card.boundingBox())!.height).toBe(height);

	// Generate makes an arpeggio now: up the A major chord (no scale: major) from A
	const on = [0, 1, 2, 3];
	await turnOnPads(page, on);
	await generate.click();
	const notes = (await padNotes(page, on)).map(noteMidi);
	expect(notes.map((m) => (m - notes[0] + 120) % 12)).toEqual([0, 4, 7, 0]);

	// Saved with the project; File → New goes back to Random
	expect(JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.melody.mode).toBe('arp');
	await chooseFromFileMenu(page, 'New');
	await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
	await expect(random).toHaveAttribute('aria-pressed', 'true');
});

// --- Phone mode ------------------------------------------------------------------------------

test.describe('Phone mode', () => {
	// An iPhone held sideways: a touch screen 390 px tall (usePhoneMode.ts)
	test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

	const phonePads = (page: Page) => page.locator('.pl-pad');
	async function holdPad(page: Page, i: number) {
		const box = (await phonePads(page).nth(i).boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.waitForTimeout(600);
		await page.mouse.up();
	}

	test('a phone held sideways gets the phone layout: pads, Play, steppers and four knobs', async ({ page }) => {
		await expect(page.locator('.phone-layout')).toBeVisible();
		await expect(page.locator('.ds-grid')).toBeHidden();
		await expect(page.locator('.app-toolbar')).toBeHidden();
		await expect(phonePads(page)).toHaveCount(16);
		// One screen, no scrolling
		expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
		for (const name of ['Decay', 'Tone', 'Sweep', 'Space']) await expect(page.getByRole('slider', { name, exact: true })).toBeVisible();
		// Every pad a comfortable size for a finger
		const box = (await phonePads(page).first().boundingBox())!;
		expect(box.width).toBeGreaterThanOrEqual(44);
		expect(box.height).toBeGreaterThanOrEqual(100);

		// A tap turns a step on and off
		await phonePads(page).nth(0).click();
		await expect(phonePads(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
		await phonePads(page).nth(0).click();
		await expect(phonePads(page).nth(0)).toHaveAttribute('aria-pressed', 'false');

		// Clear: a new pattern in one tap, and Undo brings the steps back
		for (const i of [0, 4, 8]) await phonePads(page).nth(i).click();
		await page.waitForTimeout(700); // the undo history records a step once things are still
		await page.getByRole('button', { name: 'Clear', exact: true }).click();
		expect(await phonePads(page).evaluateAll((els) => els.some((e) => e.getAttribute('aria-pressed') === 'true'))).toBe(false);
		await page.waitForTimeout(700);
		await page.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect(phonePads(page).nth(8)).toHaveAttribute('aria-pressed', 'true');

		// Play starts the sequencer, and Play / Stop is in the top bar on every page
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
		for (const tab of ['Sound', 'FX', 'Key']) {
			await page.getByRole('tab', { name: tab }).click();
			await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
		}
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	});

	test('Reset in the menu asks first, then resets the pads (and the sound, if asked); Undo brings them back', async ({ page }) => {
		await page.getByRole('button', { name: 'Next sound' }).click();
		await expect(page.getByRole('button', { name: 'All sounds' })).toContainText(PRESETS[0].label);
		for (const i of [0, 4, 8]) await phonePads(page).nth(i).click();
		await page.getByRole('button', { name: 'Octave up' }).click();
		await page.waitForTimeout(700);
		await page.getByRole('button', { name: 'Menu' }).click();
		const menu = page.getByRole('dialog', { name: 'Menu' });
		await menu.getByRole('button', { name: 'Reset…' }).click();
		// Nothing changed yet
		await expect(phonePads(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
		await menu.getByRole('button', { name: 'Reset pads' }).click();
		await expect(menu).toBeHidden();
		expect(await phonePads(page).evaluateAll((els) => els.some((e) => e.getAttribute('aria-pressed') === 'true'))).toBe(false);
		await phonePads(page).nth(0).click();
		await expect(phonePads(page).nth(0)).toHaveAccessibleName('Step 1, A3');
		// The sound stayed
		await expect(page.getByRole('button', { name: 'All sounds' })).toContainText(PRESETS[0].label);
		// Pads and sound: the sound goes back to the factory one too
		await page.getByRole('button', { name: 'Menu' }).click();
		await menu.getByRole('button', { name: 'Reset…' }).click();
		await menu.getByRole('button', { name: 'Pads and sound' }).click();
		await expect(page.getByRole('button', { name: 'All sounds' })).not.toContainText(PRESETS[0].label);
		expect(await page.getByRole('slider', { name: 'Decay', exact: true }).getAttribute('aria-valuenow')).toBe('400');
	});

	test('Export audio on a phone: bars and ending only, one normalized mix', async ({ page }) => {
		await phonePads(page).nth(0).click();
		await page.getByRole('button', { name: 'Menu' }).click();
		await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'File ▾' }).click();
		await page.getByRole('menuitem', { name: 'Export audio…' }).click();
		const dialog = page.getByRole('dialog', { name: 'Export audio' });
		await expect(dialog.getByRole('group', { name: 'Bars' })).toBeVisible();
		await expect(dialog.getByRole('group', { name: 'Ending' })).toBeVisible();
		for (const name of ['Mix', 'Effects stems', 'MIDI file', 'Normalize']) await expect(dialog.getByText(name, { exact: true })).toHaveCount(0);
		const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export', exact: true }).click()]);
		expect(download.suggestedFilename()).toMatch(/_mix\.wav$/);
	});

	test('holding a pad picks its note from the key, its velocity and repeats', async ({ page }) => {
		// A minor: the picker offers only its notes
		await page.getByRole('tab', { name: 'Key' }).click();
		await page.getByRole('button', { name: 'Scale' }).click();
		await page.getByRole('option', { name: 'Minor', exact: true }).click();
		await page.getByRole('tab', { name: 'Pads' }).click();

		await holdPad(page, 2);
		const picker = page.getByRole('dialog', { name: 'Step 3' });
		await expect(picker).toBeVisible();
		const notes = await picker.locator('.pl-n').allTextContents();
		expect(notes).toHaveLength(16);
		for (const n of notes) expect(['A', 'B', 'C', 'D', 'E', 'F', 'G']).toContain(n.replace(/\d/g, ''));
		await picker.getByRole('button', { name: 'C4', exact: true }).click();
		await picker.getByRole('button', { name: '×3' }).click();
		await picker.getByRole('button', { name: 'Done' }).click();
		// Picking a note turns the step on
		await expect(phonePads(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
		await expect(phonePads(page).nth(2)).toHaveAccessibleName('Step 3, C4');
		await expect(phonePads(page).nth(2).locator('.pl-rat')).toHaveText('×3');
	});

	test('the steppers choose sounds and patterns; the dice roll them', async ({ page }) => {
		await page.getByRole('button', { name: 'Next sound' }).click();
		await expect(page.getByRole('button', { name: 'All sounds' })).toContainText(PRESETS[0].label);
		await page.getByRole('button', { name: 'Next sound' }).click();
		await expect(page.getByRole('button', { name: 'All sounds' })).toContainText(PRESETS[1].label);
		await page.getByRole('button', { name: 'Random sound' }).click();
		await expect(page.getByRole('button', { name: 'All sounds' })).toContainText('Random');

		await page.getByRole('button', { name: 'Next pattern' }).click();
		await expect(page.getByRole('button', { name: 'All patterns' })).toContainText(PATTERNS[0].label);
		expect(await phonePads(page).evaluateAll((els) => els.filter((e) => e.getAttribute('aria-pressed') === 'true').length)).toBeGreaterThan(0);
		// A tap on the name: all six
		await page.getByRole('button', { name: 'All patterns' }).click();
		await page.getByRole('dialog', { name: 'Patterns' }).getByRole('button', { name: PATTERNS[3].label }).click();
		await expect(page.getByRole('button', { name: 'All patterns' })).toContainText(PATTERNS[3].label);
	});

	test('the four knobs turn the desktop settings: Tone is Cutoff, Space turns the reverb on', async ({ page }) => {
		const tone = page.getByRole('slider', { name: 'Tone', exact: true });
		await tone.focus();
		await page.keyboard.press('End');
		const space = page.getByRole('slider', { name: 'Space', exact: true });
		await space.focus();
		await page.keyboard.press('End');
		await page.getByRole('tab', { name: 'Sound' }).click();
		await expect(page.getByRole('slider', { name: 'Cutoff' })).toHaveAttribute('aria-valuenow', '10000');
		await page.getByRole('tab', { name: 'FX' }).click();
		await expect(page.getByRole('slider', { name: 'MIX' }).last()).toHaveAttribute('aria-valuenow', '1');
		await expect(page.locator('.phone-layout .pl-fx')).toBeVisible();
	});

	test('a swipe moves between pages', async ({ page }) => {
		// Along the top bar (a swipe across the pads paints them instead, below)
		const y = 20;
		const swipeAt = async (from: number, to: number) => {
			await page.mouse.move(from, y);
			await page.mouse.down();
			await page.mouse.move((from + to) / 2, y + 3, { steps: 4 });
			await page.mouse.move(to, y + 3, { steps: 4 });
			await page.mouse.up();
		};
		await swipeAt(560, 260);
		await expect(page.getByRole('tab', { name: 'Sound' })).toHaveAttribute('aria-selected', 'true');
		await swipeAt(260, 560);
		await expect(page.getByRole('tab', { name: 'Pads' })).toHaveAttribute('aria-selected', 'true');
		expect(await phonePads(page).evaluateAll((els) => els.some((e) => e.getAttribute('aria-pressed') === 'true'))).toBe(false);
	});

	test('a finger drawn across the pads paints them on, or off from a lit one', async ({ page }) => {
		// A real touch (a touch keeps sending its moves to the pad it began on)
		const cdp = await page.context().newCDPSession(page);
		const centre = async (i: number) => {
			const b = (await phonePads(page).nth(i).boundingBox())!;
			return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
		};
		const draw = async (from: number, to: number) => {
			const a = await centre(from), z = await centre(to);
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
			for (let k = 1; k <= 12; k++) {
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (z.x - a.x) * k / 12, y: a.y + (z.y - a.y) * k / 12 }] });
			}
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		};
		const lit = () => phonePads(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed') === 'true'));
		await draw(0, 3);
		expect((await lit()).slice(0, 5)).toEqual([true, true, true, true, false]);
		// Drawn from a lit pad: off
		await draw(1, 2);
		expect((await lit()).slice(0, 5)).toEqual([true, false, false, true, false]);
		// A tap still turns one on or off, and the page stayed on Play
		const t = await centre(7);
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [t] });
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect(phonePads(page).nth(7)).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('tab', { name: 'Pads' })).toHaveAttribute('aria-selected', 'true');
	});

	test('octave buttons move every pad; the tiny scope draws while it plays; the playing pad stands out', async ({ page }) => {
		await phonePads(page).nth(0).click();
		await expect(phonePads(page).nth(0)).toHaveAccessibleName('Step 1, A3');
		await page.getByRole('button', { name: 'Octave up' }).click();
		await expect(phonePads(page).nth(0)).toHaveAccessibleName('Step 1, A4');
		await page.getByRole('button', { name: 'Octave down' }).click();
		await page.getByRole('button', { name: 'Octave down' }).click();
		await expect(phonePads(page).nth(0)).toHaveAccessibleName('Step 1, A2');

		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await page.waitForTimeout(600);
		// The scope has drawn something
		const inked = await page.locator('.pl-scope').evaluate((c: HTMLCanvasElement) => {
			const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
			let n = 0;
			for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
			return n;
		});
		expect(inked).toBeGreaterThan(20);
		// The playing pad: a bar along its top and a thick outline
		const now = page.locator('.pl-pad.now');
		await expect(now).toHaveCount(1);
		expect(await now.evaluate((el) => getComputedStyle(el, '::before').height)).toBe('6px');
		expect(await now.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('3px');
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
	});

	test('the menu has the File bar and themes; Desktop View is remembered, and Phone view comes back', async ({ page }) => {
		await page.getByRole('button', { name: 'Menu' }).click();
		const menu = page.getByRole('dialog', { name: 'Menu' });
		await expect(menu.getByRole('button', { name: 'File ▾' })).toBeVisible();
		await expect(menu.getByRole('button', { name: 'Sand', exact: true })).toBeVisible();
		// The File menu opens there without scrolling, and works (Export audio… opens its dialog
		// over the phone layout)
		await menu.getByRole('button', { name: 'File ▾' }).click();
		expect(await menu.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
		await expect(page.getByRole('menuitem', { name: 'Export audio…' })).toBeInViewport({ ratio: 1 });
		await page.getByRole('menuitem', { name: 'Export audio…' }).click();
		const dialog = page.getByRole('dialog', { name: 'Export audio' });
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toBeHidden();
		if (!(await menu.isVisible())) await page.getByRole('button', { name: 'Menu' }).click();
		await expect(menu.getByText('The whole synth')).toHaveCount(0);
		await menu.getByRole('button', { name: 'Desktop View' }).click();
		await expect(page.locator('.phone-layout')).toHaveCount(0);
		await expect(page.locator('.ds-grid')).toBeVisible();
		await expect(page.locator('.ds-topbar')).toBeVisible();
		await page.reload();
		await expect(page.locator('.ds-grid')).toBeVisible();
		await expect(page.locator('.phone-layout')).toHaveCount(0);
		// The way back: File → Phone view, and a button always in view
		await page.getByRole('button', { name: 'File ▾' }).click();
		await expect(page.getByRole('menuitem', { name: 'Phone view' })).toBeVisible();
		await page.keyboard.press('Escape');
		const back = page.getByRole('button', { name: 'Phone view', exact: true });
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await expect(back).toBeInViewport();
		// Nothing on the page draws over it (the pad numbers sit at z-index 1000)
		for (const y of [0, 400, 800]) {
			await page.evaluate((top) => window.scrollTo(0, top), y);
			expect(await back.evaluate((el) => {
				const r = el.getBoundingClientRect();
				return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
			})).toBe(true);
		}
		await back.click();
		await expect(page.locator('.phone-layout')).toBeVisible();
		await expect(back).toHaveCount(0);
	});
});

test.describe('Phone mode, upright', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('a phone held upright asks to be turned, or shows the full layout', async ({ page }) => {
		const hint = page.getByRole('dialog', { name: 'Turn your phone' });
		await expect(hint).toBeVisible();
		await expect(hint).toContainText('The synth is laid out sideways. Turn your phone to landscape to play.');
		// Nothing of the app shows through or scrolls under it
		await expect(page.locator('.app-frame')).toBeHidden();
		expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
		const top = await page.evaluate(() => {
			const b = document.querySelector('.phone-hint')!.getBoundingClientRect();
			return document.elementFromPoint(b.width / 2, b.height - 5)?.closest('.phone-hint') !== null;
		});
		expect(top).toBe(true);
		await hint.getByRole('button', { name: 'Use the desktop view instead' }).click();
		await expect(hint).toHaveCount(0);
		await expect(page.locator('.ds-grid')).toBeVisible();
	});
});

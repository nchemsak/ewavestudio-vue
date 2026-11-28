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
// The hit (PR 94; behind the Envelope card's curve since PR 108), and what it says to screen readers
const envelopeCard = (page: Page) => page.locator('.ds-sound section[aria-label="Envelope"]');
const hitCanvas = (page: Page) => envelopeCard(page).locator('canvas.env-hit');
const hitCaption = (page: Page) => envelopeCard(page).locator('.visually-hidden');
// The machine rail (PR 108), where the big screen was
const rail = (page: Page) => page.locator('.machine-rail');
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
	// Every test but the first visit's starts from empty pads and the factory sound: the very
	// first visit in a browser opens a starter beat (useProjectSync's startFirstVisit)
	await page.addInitScript(() => localStorage.setItem('ewave-studio2:visited', '1'));
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

test('loads as version 2 with the synth lane and the machine rail', async ({ page }) => {
	await expect(page).toHaveTitle('Ephemeral Wave Synth 2');
	await expect(rail(page)).toBeVisible();
	await expect(rail(page).locator('.mr-row')).toHaveCount(4); // Rhythm, Bass (PR 115), Drums (PR 119) and Drift (PR 122)
	await expect(rail(page).locator('.mr-name')).toHaveText(['Rhythm', 'Bass', 'Drums', 'Drift']);
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
	// Before the fix, every note played stayed connected. What stays is the engine's own: among
	// them the tape pedal's four (its saturation's gain, and three sines on its delay's time)
	expect(await page.evaluate(() => (window as any).__paramSources.size)).toBeLessThanOrEqual(6);
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

test('the machine rail: its screens draw while something plays, and Rhythm mutes and sets the level', async ({ page }) => {
	// No big screen, no F-keys, and the number keys no longer pick views (PR 108)
	await expect(page.locator('.fkey')).toHaveCount(0);
	const scope = rail(page).locator('.mr-screen canvas').nth(0);
	const spec = rail(page).locator('.mr-screen canvas').nth(1);
	await expect(scope).toBeVisible();
	await expect(spec).toBeVisible();
	// How much of a canvas differs from its own corner (the screen's background)
	const painted = (c: typeof scope) => c.evaluate((el: HTMLCanvasElement) => {
		const ctx = el.getContext('2d')!;
		const { data } = ctx.getImageData(0, 0, el.width, el.height);
		const bg = [data[0], data[1], data[2]];
		let n = 0;
		for (let i = 0; i < data.length; i += 4) {
			if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 60) n++;
		}
		return n / (data.length / 4);
	});
	expect(await painted(spec)).toBe(0);

	// The row's steps follow the pads, in their colours
	await turnOnPads(page, [0, 4, 8, 12]);
	await expect(rail(page).locator('.mr-cells i.on')).toHaveCount(4);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(rail(page).locator('.mr-cells i.now')).toHaveCount(4); // one per row (Drift's: the bar playing)
	await page.waitForTimeout(1500);
	expect(await painted(spec), 'the spectrogram draws the notes').toBeGreaterThan(0.005);
	expect(await painted(scope), 'the scope draws the wave').toBeGreaterThan(0.002);

	// The LED mutes Rhythm: no more notes (counted by their filters' sweeps: one per note; a bar
	// at 120 BPM has four)
	const notes = () => page.evaluate(() => ((window as any).__filterDetuneCalls ?? []).filter((c: any) => c[0] === 'set').length as number);
	const led = rail(page).getByRole('switch', { name: 'Rhythm on' });
	await expect(led).toHaveAttribute('aria-checked', 'true');
	await led.click();
	await expect(led).toHaveAttribute('aria-checked', 'false');
	await expect(page.locator('.mute-dot')).toHaveClass(/muted/);
	await page.waitForTimeout(300);
	const before = await notes();
	await page.waitForTimeout(2100);
	expect(await notes()).toBe(before);
	await led.click();
	await expect.poll(notes, { timeout: 3000 }).toBeGreaterThan(before);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();

	// Its level is the lane's volume (hidden since PR 92), saved with the project, and MIDI-learnable
	const level = rail(page).getByRole('slider', { name: 'Rhythm level' });
	await expect(level).toHaveAttribute('aria-valuetext', '50%');
	await level.focus();
	await page.keyboard.press('Shift+ArrowUp');
	await expect(level).toHaveAttribute('aria-valuetext', '60%');
	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	expect(saved.data.instruments.find((i: any) => i.name === 'synth-voice').channelVolume).toBeCloseTo(0.6, 5);
	await expect(level).toHaveAttribute('data-midi-id', 'synth.volume');
});

test('the hit is drawn behind the Envelope card\'s curve, redrawn as the sound changes', async ({ page }) => {
	const caption = hitCaption(page);
	const drawn = () => hitCanvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL());
	// A fresh page: the hit of the factory sound (A3, the sine), its length and peak
	await expect(hitCanvas(page)).toBeVisible();
	await expect(caption).toHaveText(/^Hit: A3 Sine, \d+ ms, peak −\d+\.\d dB$/);
	const lengthOf = async () => Number(/, (\d+) ms,/.exec((await caption.textContent())!)![1]);
	const factoryLength = await lengthOf();
	// Attack 20 ms + Decay 400 ms, give or take where it fades below −80 dBFS
	expect(factoryLength).toBeGreaterThan(250);
	expect(factoryLength).toBeLessThan(700);
	// Something is drawn early on (the square-root scale: 400 ms is past 40 % of the width), and
	// nothing near the end of the card's 2.1 s
	const share = (x0: number, x1: number) => hitCanvas(page).evaluate((c: HTMLCanvasElement, [x0, x1]) => {
		const ctx = c.getContext('2d')!;
		const { data } = ctx.getImageData(Math.round(c.width * x0), 0, Math.max(1, Math.round(c.width * (x1 - x0))), c.height);
		let n = 0;
		for (let i = 3; i < data.length; i += 4) if (data[i] > 20) n++;
		return n / (data.length / 4);
	}, [x0, x1]);
	await expect.poll(() => share(0.1, 0.3)).toBeGreaterThan(0.2);
	expect(await share(0.8, 1)).toBe(0);

	// A shorter Decay: shorter, drawn again
	const before = await drawn();
	const decay = envelopeCard(page).getByRole('slider', { name: 'Decay', exact: true });
	await decay.focus();
	await page.keyboard.press('Home');
	await expect.poll(lengthOf).toBeLessThan(factoryLength / 2);
	await expect.poll(drawn).not.toBe(before);

	// A sound preset redraws it, also while playing
	await turnOnPads(page, [0, 8]);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const playing = await drawn();
	await page.locator('.transport-card').getByRole('button', { name: 'Bell', exact: true }).click();
	await expect(caption).toHaveText(/^Hit: A3 Glass, [\d.]+ s, peak/); // the long ring of its reverb
	await expect.poll(drawn).not.toBe(playing);
	await expect(hitCanvas(page)).toBeVisible();
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

// A fake microphone (PR 95): a quiet room, then a drum-like hit 0.4 s after the browser asks
// for it: a tone falling from 330 to 90 Hz, gone after half a second
function fakeMicrophone() {
	navigator.mediaDevices.getUserMedia = async () => {
		const ctx = new AudioContext();
		const dest = ctx.createMediaStreamDestination();
		const osc = ctx.createOscillator();
		const g = ctx.createGain();
		const t = ctx.currentTime + 0.4;
		osc.frequency.setValueAtTime(330, t);
		osc.frequency.exponentialRampToValueAtTime(90, t + 0.25);
		g.gain.setValueAtTime(0, ctx.currentTime);
		g.gain.setValueAtTime(0.8, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
		osc.connect(g).connect(dest);
		osc.start();
		return dest.stream;
	};
}

// Upward zero crossings in the first `seconds` of a sound, from where it starts
function crossingsFromStart(samples: Float32Array, rate: number, seconds: number) {
	const start = samples.findIndex((v) => Math.abs(v) > 0.01);
	let n = 0;
	for (let i = start + 1; i < start + seconds * rate && i < samples.length; i++) if (samples[i - 1] < 0 && samples[i] >= 0) n++;
	return n;
}

test('Sample: a sound recorded from the microphone plays on every pad at its pitch, is saved and undone', async ({ page }) => {
	await page.evaluate(fakeMicrophone);
	const strip = page.locator('.st-pick');
	await expect(strip).toHaveAttribute('aria-label', 'Sample: record a sound');
	await expect(strip).toHaveAttribute('aria-pressed', 'false');

	// REC listens, keeps the hit from just before it starts, and puts it on every pad
	await page.getByRole('button', { name: 'Record a sample' }).click();
	await expect(strip).toHaveAttribute('aria-pressed', 'true', { timeout: 6000 });
	await expect(strip).toHaveAttribute('aria-label', 'Sample: play the recording on every pad');
	await expect(page.getByRole('button', { name: 'Record a new sample' })).toBeVisible();
	const seconds = Number(/\(([\d.]+) s\)/.exec((await strip.getAttribute('title'))!)![1]);
	expect(seconds).toBeGreaterThan(0.3);
	expect(seconds).toBeLessThan(0.6);

	// Saved with the project: the recording, every pad's wave and the main wave
	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	expect(saved.data.synth.sample.data).toMatch(/^[A-Za-z0-9+/]+=*$/);
	expect(saved.data.synth.sample.sampleRate).toBeGreaterThanOrEqual(44100);
	expect(saved.data.selectedWaveform).toBe('sample');
	expect(saved.data.instruments.find((i: any) => i.name === 'synth-voice').waveforms).toEqual(Array(16).fill('sample'));

	// Played at each note's pitch, as recorded on A3: an octave up is twice as fast
	const oneShot = async (note: string) => wavSamples((await exportAudio(page, {
		mix: false, stems: false, midi: false, oneShot: true, oneShotNote: note, normalize: false,
	})).bytes);
	const a3 = await oneShot('A3 (220 Hz)');
	const a4 = await oneShot('A4 (440 Hz)');
	// (the hit falls from 330 Hz, so: the same cycles in half the time)
	const onA3 = crossingsFromStart(a3.samples, a3.rate, 0.1);
	expect(onA3).toBeGreaterThan(15);
	expect(Math.abs(crossingsFromStart(a4.samples, a4.rate, 0.05) - onA3)).toBeLessThanOrEqual(2);
	expect(crossingsFromStart(a4.samples, a4.rate, 0.1)).toBeGreaterThan(onA3 * 1.3);

	// A pad's ⋮ menu offers it too
	await page.locator('.pad-row .pad-settings-dot').first().click();
	const pop = page.locator('.pad-popover');
	await expect(pop.getByRole('button', { name: 'Sample', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await pop.getByRole('button', { name: 'Close' }).click();

	// File → New leaves no recording; the project file brings it back
	await chooseFromFileMenu(page, 'New');
	await expect(strip).toHaveAttribute('aria-label', 'Sample: record a sound');
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'With sample.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
	});
	await expect(strip).toHaveAttribute('aria-pressed', 'true');

	// A recording is one undo step: the recording and the pads' waves go back together
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.getByRole('button', { name: 'Record a new sample' }).click();
	await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Record a new sample' })).toBeVisible({ timeout: 6000 });
	await page.waitForTimeout(600);
	await page.locator('.wave-row').getByRole('radio', { name: 'SAW', exact: true }).click();
	await expect(strip).toHaveAttribute('aria-pressed', 'false');
	await page.waitForTimeout(600);
	await page.keyboard.press('Control+z'); // the saw
	await expect(strip).toHaveAttribute('aria-pressed', 'true');
	await page.waitForTimeout(100);
	await page.keyboard.press('Control+z'); // the new recording: the imported one again
	await expect(strip).toHaveAttribute('aria-pressed', 'true');
	const after = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	expect(after.data.synth.sample).toEqual(saved.data.synth.sample);
});

// Where a one-shot's sound ends: its last sample above −50 dB of its peak, in seconds
function soundSeconds(samples: Float32Array, rate: number) {
	let peak = 0;
	for (const v of samples) peak = Math.max(peak, Math.abs(v));
	let end = samples.length;
	while (end > 0 && Math.abs(samples[end - 1]) < peak * 0.00316) end--;
	return end / rate;
}

test('Sample: Length plays the whole recording or a share of it; its dice badge puts it in Random', async ({ page }) => {
	await page.evaluate(fakeMicrophone);
	const length = page.getByRole('slider', { name: 'Sample length' });
	// Before a recording: Length is there but greyed out, and there's no dice badge
	await expect(length).toBeVisible();
	await expect(page.getByRole('switch', { name: /Sample (in|from) Random/ })).toHaveCount(0);

	await page.getByRole('button', { name: 'Record a sample' }).click();
	const strip = page.locator('.st-pick');
	await expect(strip).toHaveAttribute('aria-pressed', 'true', { timeout: 6000 });
	const seconds = Number(/\(([\d.]+) s\)/.exec((await strip.getAttribute('title'))!)![1]);
	await expect(length).toHaveAttribute('aria-valuetext', 'Full');

	// Full: the whole recording, past the Envelope's Attack + Decay (20 + 400 ms: the hit lasts
	// about half a second); the Decay knob no longer cuts it
	const oneShot = async () => {
		const w = wavSamples((await exportAudio(page, {
			mix: false, stems: false, midi: false, oneShot: true, oneShotNote: 'A3 (220 Hz)', normalize: false,
		})).bytes);
		return soundSeconds(w.samples, w.rate);
	};
	const full = await oneShot();
	expect(full).toBeGreaterThan(seconds * 0.85);
	expect(full).toBeGreaterThan(0.43);

	// A quarter: about a quarter as long; one undo step
	await length.focus();
	await page.keyboard.press('Home');
	for (let i = 0; i < 2; i++) await page.keyboard.press('PageUp');
	const v = Number(await length.getAttribute('aria-valuenow'));
	expect(v).toBeGreaterThan(0.15);
	expect(v).toBeLessThan(0.35);
	await expect(length).toHaveAttribute('aria-valuetext', /^\d+% · \d+ ms$/);
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	const part = await oneShot();
	expect(part).toBeLessThan(seconds * v + 0.03);
	expect(part).toBeGreaterThan(seconds * v * 0.5);
	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	expect(saved.data.synth.sampleLength).toBeCloseTo(v);
	await page.waitForTimeout(600);
	await page.keyboard.press('Control+z');
	await expect(length).toHaveAttribute('aria-valuetext', 'Full');

	// The dice badge, lit by the recording: with every wave's badge off, Random puts it on every pad
	const dice = page.getByRole('switch', { name: 'Exclude Sample from Random' });
	await expect(dice).toHaveAttribute('aria-checked', 'true');
	for (const w of ['SINE', 'TRIANGLE', 'SAW', 'SQUARE', 'PULSE', 'ORGAN', 'HOLLOW', 'GLASS']) {
		await page.getByRole('switch', { name: `Exclude ${w} from Random` }).click();
	}
	await page.getByRole('radio', { name: 'SAW', exact: true }).click();
	await page.getByRole('button', { name: /^Random waves/ }).click();
	await expect(strip).toHaveAttribute('aria-pressed', 'true');
	// Its badge off too: Random picks from every wave (as with no badge lit), never the recording
	await dice.click();
	await expect(page.getByRole('switch', { name: 'Include Sample in Random' })).toHaveAttribute('aria-checked', 'false');
	await page.getByRole('switch', { name: 'Include GLASS in Random' }).click();
	await page.getByRole('button', { name: /^Random waves/ }).click();
	await expect(page.getByRole('radio', { name: 'GLASS', exact: true })).toHaveAttribute('aria-checked', 'true');
	const file = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	expect(file.data.synth.randomWaves).toEqual(['glass']);
});

test('Sample: a quiet microphone on an interface\'s input 2 (the right channel) is heard', async ({ page }) => {
	// PR 96: a Focusrite's "Analogue 1 + 2" sends input 2 as the right channel, which PR 95
	// never read, and a usual preamp gain peaks far under the −36 dBFS it waited for
	await page.evaluate(() => {
		navigator.mediaDevices.getUserMedia = async () => {
			const ctx = new AudioContext();
			const dest = ctx.createMediaStreamDestination();
			const merge = ctx.createChannelMerger(2);
			const osc = ctx.createOscillator();
			const g = ctx.createGain();
			const t = ctx.currentTime + 0.4;
			osc.frequency.value = 220;
			g.gain.setValueAtTime(0, ctx.currentTime);
			g.gain.setValueAtTime(0.01, t); // about −40 dBFS
			g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
			g.gain.setValueAtTime(0, t + 0.41);
			osc.connect(g).connect(merge, 0, 1); // right only
			merge.connect(dest);
			osc.start();
			return dest.stream;
		};
	});
	const strip = page.locator('.st-pick');
	await page.getByRole('button', { name: 'Record a sample' }).click();
	await expect(strip).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
	const seconds = Number(/\(([\d.]+) s\)/.exec((await strip.getAttribute('title'))!)![1]);
	expect(seconds).toBeGreaterThan(0.2);
	expect(seconds).toBeLessThan(0.6);
});

test('Sample: a blocked microphone says so and changes nothing', async ({ page }) => {
	await page.evaluate(() => {
		navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
	});
	await page.getByRole('button', { name: 'Record a sample' }).click();
	await expect(page.locator('.st [role="status"]')).toHaveText('Microphone blocked');
	await expect(page.locator('.st-pick')).toHaveAttribute('aria-pressed', 'false');
	await expect(page.locator('.st-pick')).toHaveAttribute('aria-label', 'Sample: record a sound');
});

test('the spectrogram draws a note in its pad\'s colour', async ({ page }) => {
	// Every pad on A3 (220 Hz, a blue pad), the default sine
	await turnOnPads(page, [0, 4, 8, 12]);
	const padHueNow = await pads(page).nth(0).evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--heat-h')));
	expect(padHueNow).toBe(padHue(220));
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(2500);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	// The hues drawn in the rows round 220 Hz (the rail's spectrogram: 40 Hz–10 kHz, log, low at
	// the bottom), where the note's fundamental is
	const hues = await rail(page).locator('.mr-screen canvas').nth(1).evaluate((c: HTMLCanvasElement) => {
		const ctx = c.getContext('2d')!;
		const row = 1 - Math.log(220 / 40) / Math.log(10000 / 40);
		const { data } = ctx.getImageData(0, Math.floor(c.height * (row - 0.08)), c.width, Math.ceil(c.height * 0.16));
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

test('the spectrum behind the Filter card\'s curve draws a played note at its frequency, in its pad\'s colour; the note badge names it', async ({ page }) => {
	await turnOnPads(page, [0, 4, 8, 12]); // A3, 220 Hz, the default sine
	const spectrum = page.locator('.ds-sound .filter-card canvas.filter-spectrum');
	await expect(spectrum).toBeVisible();
	const badge = page.locator('.ds-compose .note-badge');
	await expect(badge).not.toHaveClass(/\bon\b/); // nothing playing yet
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(800);
	// The column at 220 Hz on the card's 20 Hz–20 kHz log axis, and one at 40 Hz (the old
	// screen's empty wall: below 70 Hz nothing was drawn), read while it plays
	const hues = (hz: number) => spectrum.evaluate((c: HTMLCanvasElement, hz) => {
		const ctx = c.getContext('2d')!;
		const x = Math.round((Math.log(hz / 20) / Math.log(1000)) * c.width);
		const { data } = ctx.getImageData(x, 0, 1, c.height);
		const out: number[] = [];
		for (let i = 0; i < data.length; i += 4) {
			if (data[i + 3] < 30) continue; // transparent: nothing drawn
			const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
			const max = Math.max(r, g, b), min = Math.min(r, g, b);
			const d = max - min;
			if (d < 0.1) continue;
			let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
			h = Math.round(h * 60);
			out.push(h < 0 ? h + 360 : h);
		}
		return out;
	}, hz);
	const reading = await hues(220);
	expect(reading.length, 'the note is drawn there').toBeGreaterThan(10);
	const near = reading.filter((h) => Math.abs(h - padHue(220)) <= 14).length;
	expect(near / reading.length).toBeGreaterThan(0.6);
	// The note badge in the Melody Maker's screen (PR 125): the written note, A3, no cents
	await expect(badge).toHaveClass(/\bon\b/);
	await expect(badge).toHaveText('A3');
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	// Once quiet, the columns fall away and the badge fades
	await expect.poll(async () => (await hues(220)).length, { timeout: 5000 }).toBe(0);
	await expect(badge).not.toHaveClass(/\bon\b/, { timeout: 4000 });
});

test('PR 125: File → Open\'s list stays open for a mouse heading to it diagonally, over Save as…; it closes going straight down', async ({ page }) => {
	await page.getByRole('button', { name: 'File ▾' }).click();
	const open = page.locator('.pc-has-sub');
	const list = page.locator('.pc-open-submenu');
	const saveAs = page.getByRole('menuitem', { name: 'Save as…' });
	const o = (await open.boundingBox())!;
	await page.mouse.move(o.x + 30, o.y + o.height / 2);
	await expect(list).toBeVisible();
	// Down and to the right, crossing Save as… on the way to the list
	const l = (await list.boundingBox())!;
	const sa = (await saveAs.boundingBox())!;
	const steps = 8;
	const from = { x: o.x + 30, y: o.y + o.height / 2 }, to = { x: l.x + 20, y: Math.min(l.y + l.height - 10, sa.y + sa.height + 40) };
	for (let k = 1; k <= steps; k++) {
		await page.mouse.move(from.x + ((to.x - from.x) * k) / steps, from.y + ((to.y - from.y) * k) / steps);
		await expect(list).toBeVisible();
	}
	// Back on the row, then straight down onto Save as…: the list closes
	await page.mouse.move(o.x + 30, o.y + o.height / 2);
	await expect(list).toBeVisible();
	await page.mouse.move(o.x + 30, sa.y + sa.height / 2, { steps: 3 });
	await expect(list).toBeHidden();
	// Left there (a pause on a row that isn't toward the list) it stays closed
	await page.waitForTimeout(700);
	await expect(list).toBeHidden();
});

test('PR 125: the note badge names the written notes, steady with FM and unison on; Drift shows its chord', async ({ page }) => {
	const badge = page.locator('.ds-compose .note-badge');
	await patternsBox(page).getByRole('button', { name: 'Bassline', exact: true }).click();
	// FM and unison bend and smear what's heard; the badge names what's written
	await page.getByRole('switch', { name: 'FM' }).click();
	await page.getByRole('switch', { name: 'Unison' }).click();
	const written = new Set((await pads(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? '')))
		.map((n) => n.split(', ')[1]).filter(Boolean));
	expect(written.size).toBeGreaterThan(1);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const seen = new Set<string>();
	for (let k = 0; k < 20; k++) {
		await page.waitForTimeout(120);
		const t = (await badge.textContent())?.trim();
		if (t) seen.add(t);
	}
	expect([...seen].every((n) => written.has(n)), `${[...seen]} within ${[...written]}`).toBe(true);
	expect(seen.size).toBeGreaterThan(1);
	await expect(badge).not.toContainText('¢');
	// Drift shown: the chord playing
	await page.getByRole('button', { name: 'Show Drift' }).click();
	await page.getByRole('group', { name: 'Progressions', exact: true }).getByRole('button', { name: 'Rise', exact: true }).click();
	await expect(badge).toHaveText(/^(Am|C|Em|G)$/, { timeout: 5000 });
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await expect(badge).not.toHaveClass(/\bon\b/, { timeout: 4000 });
});

test('knobs work from the keyboard', async ({ page }) => {
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

	// Attack too, with a value a screen reader can say
	const attack = page.getByRole('slider', { name: 'Attack' });
	await attack.focus();
	await page.keyboard.press('ArrowUp');
	await expect(attack).toHaveAttribute('aria-valuetext', /^\d+ ms$/);
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
	await chooseRate(page, '1/8');
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
	await expect(arpRate(page, '1/8')).toHaveAttribute('aria-checked', 'true');
});

test('File → Save as… saves a copy under a new name, leaves the original, and keeps undo', async ({ page }) => {
	// Answers the browser's dialogs in turn; records what each asked
	const answers: (string | boolean)[] = [];
	const asked: string[] = [];
	page.on('dialog', async (d) => {
		asked.push(d.type() === 'prompt' ? `${d.message()} [${d.defaultValue()}]` : d.message());
		const a = answers.shift();
		if (a === false || a === undefined) await d.dismiss();
		else await d.accept(typeof a === 'string' ? a : undefined);
	});
	const name = page.getByRole('textbox', { name: 'Project name' });
	const saveBtn = page.locator('.pc-primary');
	const selected = page.locator('.pad-row .padTEST.selected');
	const openNames = async () => {
		await page.getByRole('button', { name: 'File ▾' }).click();
		await page.getByRole('button', { name: 'Open ▸' }).hover();
		const items = page.locator('.pc-open-submenu .pc-title');
		await expect(items.first()).toBeVisible();
		const list = (await items.allTextContents()).map((t) => t.trim()).sort();
		await page.keyboard.press('Escape');
		await page.locator('body').click({ position: { x: 5, y: 5 } });
		return list;
	};
	const open = async (n: string) => {
		await page.getByRole('button', { name: 'File ▾' }).click();
		await page.getByRole('button', { name: 'Open ▸' }).hover();
		await page.locator('.pc-open-submenu .pc-menu-item', { hasText: n }).click();
		await expect(name).toHaveValue(n);
	};

	// "Song A", saved with two steps
	await turnOnPads(page, [0, 4]);
	await page.waitForTimeout(SETTLED); // an undo step of its own
	await name.fill('Song A');
	await name.press('Enter');
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+s');
	await expect(saveBtn).toHaveText('Saved');

	// A third step, not saved, then Save as… "Song B" (it suggests "Song A copy")
	await turnOnPads(page, [8]);
	await page.waitForTimeout(SETTLED);
	await expect(saveBtn).toHaveText('Save');
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
	answers.push('Song B');
	await chooseFromFileMenu(page, 'Save as…');
	await expect(name).toHaveValue('Song B');
	await expect(saveBtn).toHaveText('Saved');
	expect(asked[0]).toBe('Save as a new project, named: [Song A copy]');
	await expect(selected).toHaveCount(3);

	// The same work under a new name: undo still steps back (to two steps)
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(selected).toHaveCount(2);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(selected).toHaveCount(3);

	// Both are saved; Song A as it was, Song B with the third step
	expect(await openNames()).toEqual(['Song A', 'Song B']);
	await open('Song A');
	await expect(selected).toHaveCount(2);
	await open('Song B');
	await expect(selected).toHaveCount(3);

	// Ctrl+Shift+S asks too; cancelled, nothing changes
	answers.push(false);
	await page.keyboard.press('Control+Shift+s');
	await expect.poll(() => asked.length).toBe(2);
	await expect(name).toHaveValue('Song B');

	// Another project's name: asked first, then that project is replaced
	answers.push('song a', true);
	await chooseFromFileMenu(page, 'Save as…');
	await expect.poll(() => asked[3]).toBe('“Song A” already exists. Replace it with this project?');
	await expect(name).toHaveValue('song a');
	expect(await openNames()).toEqual(['Song B', 'song a']);
	await open('Song B');
	await open('song a');
	await expect(selected).toHaveCount(3);
});

test('File → Share link… copies a link that opens the project as an unsaved copy', async ({ page }) => {
	// The clipboard, recorded
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: async (t: string) => { (window as any).__copied = t; } },
		});
	});
	const name = page.getByRole('textbox', { name: 'Project name' });
	const selected = (p: Page) => p.locator('.pad-row .padTEST.selected');

	// "Beat", saved with three steps at 100 BPM; a fourth step not saved
	await turnOnPads(page, [0, 4, 9]);
	await setTempo(page, 100);
	await name.fill('Beat');
	await name.press('Enter');
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+s');
	await expect(page.locator('.pc-primary')).toHaveText('Saved');
	await turnOnPads(page, [12]);

	await chooseFromFileMenu(page, 'Share link…');
	await expect(page.locator('.pc-toast')).toContainText('Link copied');
	const url = await page.evaluate(() => (window as any).__copied as string);
	expect(url).toMatch(/\/studio2\/#p=z[A-Za-z0-9_-]+$/);
	expect(url.length).toBeLessThan(2200);

	// Opened in another tab of this browser: the project as shared (unsaved step included),
	// unsaved here, saying to press Play; the link leaves the address bar
	const other = await page.context().newPage();
	await other.addInitScript(instrument);
	await other.route(/googletagmanager\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
	await other.goto(url);
	await expect(selected(other)).toHaveCount(4);
	await expect(other.getByRole('slider', { name: 'Tempo', exact: true })).toHaveAttribute('aria-valuenow', '100');
	await expect(other.getByRole('textbox', { name: 'Project name' })).toHaveValue('Beat');
	await expect(other.locator('.pc-primary')).toHaveText('Save');
	const notice = other.getByRole('region', { name: 'Shared project' });
	await expect(notice).toContainText('Shared pattern: Beat. Press Play');
	expect(new URL(other.url()).hash).toBe('');

	// Its Play plays, and the notice goes
	await notice.getByRole('button', { name: '▶ Play' }).click();
	await expect(notice).toBeHidden();
	await expect.poll(() => notesPlayed(other)).toBeGreaterThan(0);
	await other.getByRole('button', { name: 'Stop', exact: true }).click();

	// Nothing was written over the saved "Beat": a reload (no link now) reopens it, three steps
	await other.reload();
	await expect(selected(other)).toHaveCount(3);
	await expect(other.locator('.pc-primary')).toHaveText('Saved');
	await expect(other.getByRole('region', { name: 'Shared project' })).toBeHidden();

	// A link pasted into an open page with unsaved changes asks first; declined, nothing changes
	await turnOnPads(other, [15]);
	const asked: string[] = [];
	let accept = false;
	other.on('dialog', async (d) => { asked.push(d.message()); accept ? await d.accept() : await d.dismiss(); });
	const hash = new URL(url).hash;
	await other.evaluate((h) => { location.hash = h; }, hash);
	await expect.poll(() => asked.length).toBe(1);
	expect(asked[0]).toContain('Open the shared project?');
	await expect(selected(other)).toHaveCount(4);
	expect(new URL(other.url()).hash).toBe('');
	accept = true;
	await other.evaluate((h) => { location.hash = h; }, hash);
	await expect(other.getByRole('region', { name: 'Shared project' })).toBeVisible();
	await expect(selected(other)).toHaveCount(4);
	await expect(pads(other).nth(15)).not.toHaveClass(/selected/);

	// Saving the copy makes it a project of this browser's
	await other.locator('.pc-primary').click();
	await expect(other.locator('.pc-primary')).toHaveText('Saved');

	// A link cut short says so, and the last project opens instead
	await other.goto(url.slice(0, url.length - 200));
	await expect.poll(() => asked.length).toBe(3);
	expect(asked[2]).toContain('This share link couldn’t be opened');
	await expect(selected(other)).toHaveCount(4);
	await other.close();
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

// The top bar's gear (PR 92): Theme and MIDI
async function openSettings(page: Page) {
	const gear = page.getByRole('button', { name: 'Settings', exact: true });
	if ((await gear.getAttribute('aria-expanded')) !== 'true') await gear.click();
}

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
	mix?: boolean; stems?: boolean; machineStems?: boolean; midi?: boolean; oneShot?: boolean; oneShotNote?: string; normalize?: boolean;
};

// File → Export audio…, with these choices (the rest as the dialog has them); the download
async function exportAudio(page: Page, c: ExportChoices) {
	await chooseFromFileMenu(page, 'Export audio…');
	const dialog = page.getByRole('dialog', { name: 'Export audio' });
	await expect(dialog).toBeVisible();
	if (c.bars) await dialog.getByRole('group', { name: 'Bars' }).getByRole('button', { name: String(c.bars), exact: true }).click();
	if (c.ending) await dialog.getByRole('group', { name: 'Ending' }).getByRole('button', { name: c.ending, exact: true }).click();
	const boxes: [keyof ExportChoices, RegExp][] = [
		['mix', /^Mix/], ['stems', /^Effects stems/], ['machineStems', /^Machine stems/], ['midi', /^MIDI file/], ['oneShot', /^One-shot at/], ['normalize', /^Normalize/],
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
	await openSettings(page);
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

	const reverbSwitch = page.locator('.fx .reverb-pedal .footswitch');
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
	// Voices: keys under the card's screen (a knob until PR 77)
	const voices = page.locator('.module.unison').getByRole('radiogroup', { name: 'Voices' }).getByRole('radio');
	await expect(voices).toHaveText(['2 voices', '3 voices', '4 voices']);
	const chosen = page.locator('.module.unison').getByRole('radio', { checked: true });

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
	await expect(page.getByRole('switch', { name: 'Unison' })).toHaveAttribute('aria-checked', 'false');
	await expect(chosen).toHaveText('3 voices');
	// and one with 6 as 4
	await importChanged(page, 'uni-6', (d) => Object.assign(d.synth.unison, { enabled: true, voices: 6 }));
	await expect(page.getByRole('switch', { name: 'Unison' })).toHaveAttribute('aria-checked', 'true');
	await expect(chosen).toHaveText('4 voices');
});

// The cards' screens (PR 77, ShapePad.vue): press at a point of one, as fractions of its box, and
// drag to another
async function dragPad(page: Page, pad: Locator, from: [number, number], to: [number, number]) {
	await pad.scrollIntoViewIfNeeded();
	const b = (await pad.boundingBox())!;
	await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
	await page.mouse.down();
	await page.mouse.move(b.x + b.width * to[0], b.y + b.height * to[1], { steps: 6 });
	await page.mouse.up();
}

test('Envelope, Pitch, Filter, FM and Unison: dragging a card\'s screen changes its settings, one undo step a drag; keys pick the ratio and the voices', async ({ page }) => {
	const knob = (card: string, name: string) => page.locator(`.module.${card}`).getByRole('slider', { name, exact: true });
	const pad = (card: string) => page.locator(`.module.${card} .sp-pad`);
	const text = (l: Locator) => l.getAttribute('aria-valuetext');
	const ms = async (l: Locator) => parseInt((await text(l))!, 10);

	// Envelope: the peak sideways is Attack, the end point sideways is Decay
	const attack = knob('envelope', 'Attack'), decay = knob('envelope', 'Decay');
	expect([await ms(attack), await ms(decay)]).toEqual([20, 400]);
	await dragPad(page, pad('envelope'), [0.1, 0.1], [0.2, 0.3]);
	expect(await ms(attack)).toBeGreaterThan(60);
	expect(await ms(decay)).toBe(400);
	await dragPad(page, pad('envelope'), [0.5, 0.8], [0.9, 0.8]);
	expect(await ms(decay)).toBeGreaterThan(1200);
	await expect(page.locator('.module.envelope .sp-title small')).toHaveText(`${await ms(attack)} ms · ${await ms(decay)} ms`);

	// Pitch: the start up or down is Amount (above the middle: drops into the note), the settle
	// point sideways is Decay
	const amount = knob('pitch-env', 'Amount');
	await expect(amount).toHaveAttribute('aria-valuenow', '0');
	await dragPad(page, pad('pitch-env'), [0.06, 0.5], [0.06, 0.25]);
	expect(Number(await amount.getAttribute('aria-valuenow'))).toBeGreaterThan(15);
	expect(await text(amount)).toContain('above');
	await dragPad(page, pad('pitch-env'), [0.06, 0.25], [0.06, 0.8]);
	expect(Number(await amount.getAttribute('aria-valuenow'))).toBeLessThan(-15);
	const pitchDecay = knob('pitch-env', 'Decay');
	const before = await ms(pitchDecay);
	await dragPad(page, pad('pitch-env'), [0.4, 0.5], [0.8, 0.5]);
	expect(await ms(pitchDecay)).toBeGreaterThan(before * 2);

	// Filter: sideways is Cutoff, up is Resonance; one drag is one undo step for both
	const cutoff = knob('filter', 'Cutoff'), reso = knob('filter', 'Resonance');
	await page.waitForTimeout(SETTLED);
	await dragPad(page, pad('filter'), [0.8, 0.42], [0.5, 0.1]);
	const hz = parseInt((await text(cutoff))!, 10);
	expect(hz).toBeGreaterThan(400);
	expect(hz).toBeLessThan(900); // the middle of 20 Hz–20 kHz on a log axis is 632 Hz
	expect(parseFloat((await text(reso))!.slice(2))).toBeGreaterThan(5);
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(cutoff).toHaveAttribute('aria-valuetext', '5000 Hz');
	await expect(reso).toHaveAttribute('aria-valuetext', 'Q 0.5');

	// FM: the ribbon switches it on; up and down on the screen is Amount; the keys pick the ratio
	const fm = page.getByRole('switch', { name: 'FM' });
	const fmAmount = knob('fm', 'Amount');
	const flat = await page.locator('.module.fm .sp-line').getAttribute('d');
	await fm.click();
	await expect(fm).toHaveAttribute('aria-checked', 'true');
	expect(await page.locator('.module.fm .sp-line').getAttribute('d'), 'the wave bends once FM is on').not.toBe(flat);
	await dragPad(page, pad('fm'), [0.5, 0.5], [0.5, 0.2]);
	expect(Number(await fmAmount.getAttribute('aria-valuenow'))).toBeCloseTo(40, 0);
	const ratios = page.getByRole('group', { name: 'FM Ratio Presets' });
	await expect(ratios.getByRole('button')).toHaveText(['Lock', 'Metal', 'Bell', 'Free']);
	const freq = knob('fm', 'Mod Freq');
	await expect(freq).toHaveAttribute('aria-disabled', 'true');
	await ratios.getByRole('button', { name: 'Free' }).click();
	await expect(ratios.getByRole('button', { name: 'Free' })).toHaveAttribute('aria-pressed', 'true');
	await expect(freq).not.toHaveAttribute('aria-disabled', 'true');

	// Unison: sideways is Detune, up is Spread; the keys pick the voices, a wave drawn for each
	const unison = page.getByRole('switch', { name: 'Unison' });
	await unison.click();
	await dragPad(page, pad('unison'), [0.2, 0.5], [0.5, 0.75]);
	await expect(knob('unison', 'Detune')).toHaveAttribute('aria-valuenow', '50');
	await expect(knob('unison', 'Spread')).toHaveAttribute('aria-valuenow', '25');
	await expect(page.locator('.module.unison .sp-voice')).toHaveCount(3);
	await page.locator('.module.unison').getByRole('radio', { name: '4 voices' }).click();
	await expect(page.locator('.module.unison .sp-voice')).toHaveCount(4);
	await unison.click();
	await expect(page.locator('.module.unison .sp-voice')).toHaveCount(1);
	// Off, its screen doesn't take a drag
	await dragPad(page, pad('unison'), [0.2, 0.5], [0.9, 0.1]);
	await expect(knob('unison', 'Detune')).toHaveAttribute('aria-valuenow', '50');
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

test("the first visit opens a starter beat; File → New stays empty; no drum samples are fetched", async ({ page, browser }) => {
	const projectData = async (p: Page) =>
		JSON.parse((await downloadFromFileMenu(p, 'Export file')).toString('utf8')).data;
	const settings = ({ ui, ...rest }: any) => rest;
	const synthLane = (d: any) => d.instruments.find((i: any) => i.name === 'synth-voice');
	// A visit that isn't the first (every other test's): empty pads, the factory sound, Minor
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(0);
	const factory = await projectData(page);
	expect(factory.melody.keyScale).toBe('naturalMinor');
	await expect(page.getByRole('button', { name: 'Scale: Minor' }).first()).toBeVisible();

	// A browser that has never opened the app (a context of its own, without the test's
	// 'visited' flag)
	const ctx = await browser.newContext({
		baseURL: 'http://localhost:4173/studio2/', viewport: { width: 1600, height: 1200 }, serviceWorkers: 'block',
	});
	const first = await ctx.newPage();
	const requested: string[] = [];
	first.on('request', (r) => requested.push(r.url()));
	first.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
	await first.route(/googletagmanager\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
	await first.addInitScript(instrument);
	await first.goto('./');
	await expect(pads(first)).toHaveCount(16);

	// A built-in sound and a built-in pattern, their buttons lit
	await expect(soundsBox(first).getByRole('button', { pressed: true })).toHaveCount(1);
	await expect(patternsBox(first).getByRole('button', { pressed: true })).toHaveCount(1);
	const sound = (await soundsBox(first).getByRole('button', { pressed: true }).textContent())!.trim();
	const pattern = (await patternsBox(first).getByRole('button', { pressed: true }).textContent())!.trim();
	expect(PRESETS.map((p) => p.label)).toContain(sound);
	expect(PATTERNS.map((p) => p.label)).toContain(pattern);
	expect(await first.locator('.pad-row .padTEST.selected').count()).toBeGreaterThan(0);
	const starter = await projectData(first);
	expect(starter.melody.keyScale).toBe('naturalMinor');

	// Play plays it
	await first.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(() => notesPlayed(first)).toBeGreaterThan(0);
	await first.getByRole('button', { name: 'Stop', exact: true }).click();

	// A reload is no longer a first visit: the same project comes back, no new roll
	await first.reload();
	await expect(pads(first)).toHaveCount(16);
	expect(synthLane(await projectData(first))).toEqual(synthLane(starter));

	// File → New stays empty: the same settings as a page that isn't the first visit
	await chooseFromFileMenu(first, 'New');
	await expect(first.getByRole('menuitem', { name: 'New' })).toBeHidden();
	await expect(first.locator('.pad-row .padTEST.selected')).toHaveCount(0);
	expect(settings(await projectData(first))).toEqual(settings(factory));

	// No mp3 is downloaded (the old drum lanes' samples are gone since PR 120)
	expect(requested.filter((u) => /\.mp3(\?|$)/.test(u))).toEqual([]);
	await ctx.close();
});

test('PR 88: TAP sets the tempo from four taps; Move rotates and reverses the whole pattern, one undo step', async ({ page }) => {
	const tempo = page.getByRole('slider', { name: 'Tempo', exact: true });
	const tap = page.getByRole('button', { name: /^Tap tempo/ });
	// Three taps change nothing yet; the fourth sets it (about 100 BPM: 600 ms apart, plus each
	// click's own time; the arithmetic is unit-tested in src/lib/tapTempo.test.ts)
	for (let i = 0; i < 3; i++) { await tap.click(); await page.waitForTimeout(600); }
	await expect(tempo).toHaveAttribute('aria-valuenow', '120');
	await expect(tap).toHaveAccessibleName('Tap tempo: 1 more');
	await tap.click();
	const bpm = Number(await tempo.getAttribute('aria-valuenow'));
	expect(bpm).toBeGreaterThanOrEqual(85);
	expect(bpm).toBeLessThanOrEqual(101);

	// A pattern whose every per-step list differs from step to step
	const projectData = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	const base = await projectData();
	const lane = base.instruments.find((i: any) => i.name === 'synth-voice');
	const n = lane.steps.length;
	lane.steps = lane.steps.map((_: any, i: number) => i === 0 || i === 3 || i === 9);
	lane.velocities = lane.steps.map((_: any, i: number) => 0.3 + i * 0.04);
	lane.pitches = lane.steps.map((_: any, i: number) => 220 * Math.pow(2, i / 12));
	lane.waveforms = lane.steps.map((_: any, i: number) => (i === 3 ? 'square' : 'sine'));
	lane.ratchets = lane.steps.map((_: any, i: number) => (i === 9 ? 3 : 1));
	lane.repeatNotes = lane.steps.map((_: any, i: number) => (i === 9 ? 'up' : 'same'));
	base.synth.noise.mask = lane.steps.map((_: any, i: number) => i === 3);
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'Move.json', mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ version: 2, projectId: 'move', meta: { name: 'Move' }, data: base })),
	});
	await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Move');
	// A project's first moments are its starting point for undo
	await page.waitForTimeout(SETTLED);
	const loaded = await projectData();
	const fields = (d: any) => {
		const l = d.instruments.find((i: any) => i.name === 'synth-voice');
		return { steps: l.steps, velocities: l.velocities, pitches: l.pitches, waveforms: l.waveforms,
			ratchets: l.ratchets, repeatNotes: l.repeatNotes, mask: d.synth.noise.mask };
	};
	const before = fields(loaded);
	const rotated = (list: any[], by: number) => list.map((_, i) => list[(i - by + n) % n]);
	const each = (f: any, fn: (l: any[]) => any[]) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, fn(v as any[])]));

	// Shift later: every step one later, the last round to the first; all the lists together
	await page.getByRole('button', { name: 'Shift later' }).click();
	await expect(page.locator('.pad-row .padTEST').nth(1)).toHaveClass(/\bselected\b/);
	expect(fields(await projectData())).toEqual(each(before, (l) => rotated(l, 1)));
	// Shift earlier twice: one earlier than at first
	await page.getByRole('button', { name: 'Shift earlier' }).click();
	await page.getByRole('button', { name: 'Shift earlier' }).click();
	expect(fields(await projectData())).toEqual(each(before, (l) => rotated(l, -1)));
	// Reverse
	await page.getByRole('button', { name: 'Shift later' }).click();
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Reverse', exact: true }).click();
	expect(fields(await projectData())).toEqual(each(before, (l) => [...l].reverse()));

	// One undo step: Undo puts the pattern back the way it was before Reverse
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.locator('.pad-row .padTEST').nth(0)).toHaveClass(/\bselected\b/);
	expect(fields(await projectData())).toEqual(before);
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

	// Left of centre starts below and rises (saved as mode 'down'); Random (RND until PR 74) is mode 'random', and
	// turning it off goes back to the knob's side
	const pitchEnv = async () =>
		JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.synth.pitchEnv;
	expect(await pitchEnv()).toMatchObject({ semitones: 24, mode: 'up' });
	await amount.focus();
	for (let i = 0; i < 36; i++) await page.keyboard.press('ArrowDown');
	await expect(amount).toHaveAttribute('aria-valuenow', '-12');
	expect(await pitchEnv()).toMatchObject({ semitones: 12, mode: 'down' });
	const rnd = card.getByRole('button', { name: 'Random sweep' });
	await expect(rnd).toHaveText('Random'); // spelled out (PR 74): RND could be read as Round
	await rnd.click();
	await expect(rnd).toHaveAttribute('aria-pressed', 'true');
	expect(await pitchEnv()).toMatchObject({ semitones: 12, mode: 'random' });
	await rnd.click();
	expect(await pitchEnv()).toMatchObject({ semitones: 12, mode: 'down' });
	await expect(amount).toHaveAttribute('aria-valuenow', '-12');
});

// The plan's item 10: switching machines moves nothing. The Step Sequencer card is as tall on
// every machine (Drums', the tallest), so the rail beside it, its screens and the sections under
// it stay put; from 1200 px Sound and Compose are as tall on every machine too (Rhythm's)
test('a steady right side: switching machines moves nothing', async ({ page }) => {
	const boxes = () => page.evaluate(() => {
		const r = (sel: string) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return b.height ? [Math.round(b.top), Math.round(b.left), Math.round(b.width), Math.round(b.height)].join() : 'hidden'; };
		const screens = [...document.querySelectorAll('.machine-rail .mr-screen')].map((e) => Math.round(e.getBoundingClientRect().height)).join();
		return { steps: r('.ds-steps'), rail: r('.ds-rail'), screens, tabs: r('.ds-tabs'), sound: r('.ds-sound'), compose: r('.ds-compose'), page: document.documentElement.scrollHeight };
	});
	const show = async (name: string) => {
		await page.getByRole('button', { name: `Show ${name}` }).click();
		await expect(page.locator('.step-card .ds-which')).toHaveText(` · ${name}`);
	};
	for (const width of [1600, 1280, 1024, 820]) {
		await page.setViewportSize({ width, height: 900 });
		const at = `${width} px`;
		await show('Rhythm');
		const rhythm = await boxes();
		// Wide: everything holds still. Tablets: the tab showing (Sound) is each machine's own
		// size, but nothing above it moves
		const steady = (b: any) => (width >= 1200 ? b : { steps: b.steps, rail: b.rail, screens: b.screens, tabs: b.tabs });
		for (const name of ['Bass', 'Drums', 'Drift', 'Rhythm']) {
			await show(name);
			expect(steady(await boxes()), `${at}: ${name}`).toEqual(steady(rhythm));
		}
		// Rhythm's pads are centred in the card, under its header
		const centred = await page.evaluate(() => {
			const header = document.querySelector('.ds-steps .step-sequencer-subheader')!.getBoundingClientRect();
			const grid = document.querySelector('.ds-steps .step-card__grid')!.getBoundingClientRect();
			const card = document.querySelector('.ds-steps')!.getBoundingClientRect();
			return [grid.top - header.bottom, card.bottom - grid.bottom];
		});
		expect(Math.abs(centred[0] - centred[1]), `${at}: Rhythm's pads centred`).toBeLessThanOrEqual(30);
		expect(centred[0], `${at}: room above Rhythm's pads`).toBeGreaterThan(40);
	}
	// A phone held upright (one column, pads in two rows): each machine's own height
	await page.setViewportSize({ width: 390, height: 900 });
	await show('Rhythm');
	const h = async () => Math.round((await page.locator('.ds-steps').boundingBox())!.height);
	const upright = await h();
	await show('Bass');
	expect(await h()).toBeGreaterThan(upright + 100);
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
			['.ds-transport', '.ds-steps', '.ds-rail', '.ds-sound', '.ds-compose'].map(rect));
		// The machine rail beside the transport and the steps, as tall as both (the big screen's place)
		expect(screen.left, at).toBeGreaterThan(transport.right);
		expect(near(screen.top, transport.top) && near(screen.bottom, steps.bottom), `${at}: rail spans both`).toBe(true);
		// Sound and Compose side by side, ending on one line
		expect(compose.left, at).toBeGreaterThan(sound.right);
		expect(near(sound.top, compose.top) && near(sound.bottom, compose.bottom), `${at}: one bottom line`).toBe(true);

		// Each row of Sound is filled edge to edge: its cells end on one line
		for (const row of ['.sound-row-1', '.sound-row-2', '.sound-row-3']) {
			const bottoms = await page.locator(`${row} > *`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().bottom)));
			expect(Math.max(...bottoms) - Math.min(...bottoms), `${at}: ${row} cells end level`).toBeLessThanOrEqual(1);
		}
		// Envelope, Pitch and Filter (PR 77): three screens on one line, as tall as each other,
		// their eight mini knobs beside them; each card the height it was before (115 px)
		const pads = await page.locator('.sound-row-2 .sp-pad').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; }));
		expect(pads, at).toHaveLength(3);
		expect(new Set(pads.map((p) => p.join())).size, `${at}: the screens on one line`).toBe(1);
		await expect(page.locator('.sound-row-2 .knob-wrapper'), at).toHaveCount(8);
		// FM and Unison: cards of their own, a ribbon as the switch, off at first
		await expect(page.getByRole('switch', { name: 'FM' })).toHaveAttribute('aria-checked', 'false');
		await expect(page.getByRole('switch', { name: 'Unison' })).toHaveAttribute('aria-checked', 'false');
		for (const card of ['.module.envelope', '.module.pitch-env', '.module.filter', '.module.fm', '.module.unison']) {
			expect(Math.abs((await rect(card)).height - 115), `${at}: ${card}'s height`).toBeLessThanOrEqual(1);
		}
		// The LFO's knobs, Wave switch and RETRIG stay on one line, and the card and Noise above
		// it are the size they were before the card's redesign (PR 75)
		expect((await rect('.module.mod .lfo-row')).height, `${at}: LFO one row`).toBeLessThan(80);
		expect(Math.abs((await rect('.module.mod')).height - 189), `${at}: LFO card's height`).toBeLessThanOrEqual(1);
		expect(Math.abs((await rect('.module.noise')).height - 119), `${at}: Noise card's height`).toBeLessThanOrEqual(1);
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
	for (const width of [1024, 820, 390]) {
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
		// The pedals keep their desktop size (118 × 239 at 1600 px), centred: stretched, they were
		// 190 px wide on a tablet and 168 on a phone. Three across from 720 px, one column below
		const pedals = await page.locator('.ds-grid .module.fx .fx-pair > *').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
		const fx = await rect('.ds-grid .module.fx .fx-pair');
		// Three pedals on one row, and the tape deck under them, as wide as the three
		expect(pedals, at).toHaveLength(4);
		const deck = pedals.pop()!;
		for (const p of pedals) expect(p.width, `${at}: a pedal's width`).toBeLessThanOrEqual(121);
		expect(new Set(pedals.map((p) => Math.round(p.y))).size, `${at}: pedals on one row`).toBe(1);
		expect(deck.y, `${at}: the deck under the pedals`).toBeGreaterThan(pedals[0].y + pedals[0].height);
		expect(Math.abs(deck.x - pedals[0].x) + Math.abs(deck.x + deck.width - (pedals[2].x + pedals[2].width)), `${at}: the deck as wide as the pedals`).toBeLessThanOrEqual(2);
		const last = pedals[2];
		const sideL = pedals[0].x - fx.left, sideR = fx.right - (last.x + last.width);
		expect(Math.abs(sideL - sideR), `${at}: pedals centred`).toBeLessThanOrEqual(2);
		// The arrow keys move between the tabs
		await page.keyboard.press('ArrowRight');
		await expect(tab('Compose')).toBeFocused();
		await expect(tab('Compose')).toHaveAttribute('aria-selected', 'true');
		await expect(page.locator('.module.melody'), at).toBeVisible();
		await expect(page.locator('.module.pattern-tools'), at).toBeVisible();
		await expect(page.locator('.ds-sound'), at).toBeHidden();
		// The Melody Maker's white keys keep about the desktop's shape (51 × 88 px): 67 px wide
		// on a 1024 px tablet before
		const key = await rect('.ds-grid .mm-kb .kb-white');
		expect(key.right - key.left, `${at}: a white key's width`).toBeLessThanOrEqual(58);
		expect(key.height, `${at}: a white key's height`).toBe(88);
		expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${at}: no sideways scroll`).toBe(false);
		await tab('Sound').click();
		// The LFO card is no taller than before its redesign (PR 75: its knobs beside the screen)
		expect((await rect('.module.mod')).height, `${at}: LFO card's height`).toBeLessThanOrEqual(155);
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

test('the filter envelope sweeps each note\'s cutoff, and is saved', async ({ page }) => {
	const card = page.locator('.module.filter');
	const amount = card.getByRole('slider', { name: 'Env Amt', exact: true });
	const decay = card.getByRole('slider', { name: 'Decay', exact: true });
	const calls = () => page.evaluate(() => (window as any).__filterDetuneCalls as any[]);
	await expect(amount).toHaveAttribute('aria-valuenow', '0'); // off by default
	await expect(decay).toHaveAttribute('aria-valuenow', '200');

	// Off: each note's filter gets no sweep
	await turnOnPads(page, [0]);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(async () => (await calls()).length).toBeGreaterThan(0);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	expect((await calls()).every((c) => c[0] === 'set' && c[1] === 0)).toBe(true);

	// +2 octaves (bipolar knob, 0.1 octave per step)
	await amount.focus();
	for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp');
	await expect(amount).toHaveAttribute('aria-valuetext', 'cutoff starts 2.0 octaves higher and closes');
	await decay.focus();
	await page.keyboard.press('Home'); // 5 ms
	for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowUp'); // log knob: about half a turn
	const ms = Number(await decay.getAttribute('aria-valuenow'));
	await page.keyboard.press('Tab');

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

	// The LFO on PW with no pulse playing: PW looks dimmer and says why; the screen says No Pulse
	const pw = page.locator('.module.mod').getByRole('radio', { name: 'Pulse width' });
	await expect(pw).toHaveText('Pulse'); // spelled out: "PW" meant little to a newcomer
	const status = page.locator('.module.mod .lfo-status');
	await expect(pw).toHaveAttribute('title', /None do right now/);
	await pw.click();
	await expect(status).toHaveText('No Pulse');
	// A pad set to Pulse (here: every pad, from its tile) and it's on again
	await turnOnPads(page, [0]);
	await pulse.click();
	await expect(status).toContainText('Pulse'); // the target and its depth again
	await expect(status).not.toHaveText('No Pulse');
	await expect(pw).toHaveAttribute('title', "Modulate the pulse wave's width");
	// Back to Sine: no pulse again
	await sine.click();
	await expect(status).toHaveText('No Pulse');
});

// A project with pads 1, 5, 9 and 13 on (a hit every 0.5 s at 120 BPM), no effects, and this LFO
async function importLfoProject(page: Page, id: string, lfo: Record<string, unknown>, change?: (data: any) => void) {
	await importChanged(page, id, (data) => {
		const lane = data.instruments.find((i: any) => i.name === 'synth-voice');
		lane.steps = lane.steps.map((_: boolean, i: number) => i % 4 === 0);
		lane.velocities = lane.velocities.map(() => 1);
		for (const fx of ['delay', 'drive', 'reverb']) if (data.fx[fx]) data.fx[fx].enabled = false;
		data.synth.envelope = { ...data.synth.envelope, decayMs: 150 };
		data.synth.lfo = { ...data.synth.lfo, enabled: true, sync: true, waveform: 'sine', ...lfo };
		change?.(data);
	});
}
// The loudest sample of each of the four hits in an exported bar
const hitPeaks = (wav: Buffer) => [0, 1, 2, 3].map((k) => wavWindow(wav, k * 0.5, k * 0.5 + 0.3).peak);
const spread = (xs: number[]) => (Math.max(...xs) - Math.min(...xs)) / Math.max(...xs);
// Each hit's level with the LFO as a share of its level without it (the hits differ a little
// by themselves: the drive's offset, where each note's waves start)
const lfoShares = (wav: Buffer, plain: number[]) => hitPeaks(wav).map((p, k) => p / plain[k]);

test('LFO Retrigger: every hit gets the same movement, live and in the export; RETRIG is saved', async ({ page }) => {
	// Level (tremolo) at full depth, a dotted 1/8 apart from the hits' 1/4: free-running, each hit
	// lands at another point of the wave, so the four hits come out at different levels
	await importLfoProject(page, 'lfo-none', { target: 'amp', depth: 0, division: '1/8.', retrigger: false });
	const plain = hitPeaks(await exportWav(page));
	await importLfoProject(page, 'lfo-free', { target: 'amp', depth: 100, division: '1/8.', retrigger: false });
	const sw = page.getByRole('switch', { name: 'LFO retrigger' });
	await expect(sw).toHaveAttribute('aria-checked', 'false');
	const free = lfoShares(await exportWav(page), plain);
	expect(spread(free)).toBeGreaterThan(0.3);

	// Retrigger: each hit starts the wave afresh, so all four come out the same
	await sw.click();
	await expect(sw).toHaveAttribute('aria-checked', 'true');
	const retrig = lfoShares(await exportWav(page), plain);
	expect(spread(retrig)).toBeLessThan(0.03); // against more than 0.3 free-running
	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.synth.lfo;
	expect(saved.retrigger).toBe(true);
	expect(saved.target).toBe('amp');

	// Live: each note starts its own LFO oscillator (one more oscillator per note than without)
	const oscStarts = async () => {
		await page.evaluate(() => { (window as any).__starts.length = 0; });
		const play = page.getByRole('button', { name: 'Play', exact: true });
		await play.click();
		await page.waitForTimeout(1200);
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
		return page.evaluate(() => (window as any).__starts.filter((s: any) => s.osc).length as number);
	};
	const withRetrig = await oscStarts();
	await sw.click();
	await expect(sw).toHaveAttribute('aria-checked', 'false');
	await page.waitForTimeout(300);
	const without = await oscStarts();
	// One oscillator per note either way; Retrigger adds one LFO oscillator per note
	expect(withRetrig).toBeGreaterThanOrEqual(without + 2);

	// Greyed out while the LFO is off
	await page.getByRole('button', { name: 'LFO on' }).click();
	await expect(sw).toBeDisabled();
});

test('LFO targets Level and FM: on their own line, in the export, and FM says when FM is off', async ({ page }) => {
	const target = page.getByRole('radiogroup', { name: 'LFO Target' });
	await expect(target.getByRole('radio')).toHaveText(['Pitch', 'Filter', 'Pulse', 'Level', 'FM']);

	// FM with the FM card off: its socket is dimmed and the screen says so
	await target.getByRole('radio', { name: 'FM amount' }).click();
	await expect(target.getByRole('radio', { name: 'FM amount' })).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('.module.mod .lfo-status')).toHaveText('FM off');
	await expect(target.getByRole('radio', { name: 'FM amount' })).toHaveAttribute('title', /FM is on/);

	// With FM on, the LFO moves its Amount: the export changes with the LFO's depth
	const fmOn = (data: any) => { data.synth.fm = { ...data.synth.fm, enabled: true, index: 4, ratio: 2 }; };
	await importLfoProject(page, 'lfo-fm-0', { target: 'fm', depth: 0, division: '1/16', retrigger: true }, fmOn);
	await expect(page.locator('.module.mod .lfo-status')).not.toHaveText('FM off');
	const still = wavSamples(await exportWav(page)).samples;
	await importLfoProject(page, 'lfo-fm-100', { target: 'fm', depth: 100, division: '1/16', retrigger: true }, fmOn);
	const moved = wavSamples(await exportWav(page)).samples;
	let diff = 0;
	for (let i = 0; i < Math.min(still.length, moved.length); i++) diff = Math.max(diff, Math.abs(still[i] - moved[i]));
	expect(diff).toBeGreaterThan(0.05);

	// Level: the Depth knob reads in % of the level
	await importLfoProject(page, 'lfo-amp', { target: 'amp', depth: 40, division: '1/8' });
	await expect(target.getByRole('radio', { name: 'Level' })).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByRole('slider', { name: 'Depth' })).toHaveAttribute('aria-valuetext', '40% level');
});

test("the LFO card: a ribbon switch, a screen that draws the wave over the bar, and a patch bay with one cable", async ({ page }) => {
	const saved = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.synth.lfo;
	const lfo = page.locator('.module.mod');
	const ribbon = lfo.getByRole('button', { name: 'LFO on' });
	const wave = () => lfo.locator('.lv-wave').getAttribute('d');
	const ys = (d: string) => d.slice(1).split(' L').map((pt) => Number(pt.split(' ')[1]));
	const height = (d: string) => Math.max(...ys(d)) - Math.min(...ys(d));
	// crossings of the middle line, going up: one per cycle
	const cycles = (d: string) => { const y = ys(d), mid = (Math.max(...y) + Math.min(...y)) / 2; let n = 0; for (let i = 1; i < y.length; i++) if (y[i - 1] > mid && y[i] <= mid) n++; return n; };
	const cable = () => lfo.locator('.lv-cable').getAttribute('d');
	const cableEnd = async () => Number((await cable())!.split(' ').at(-2));
	await page.waitForTimeout(SETTLED);

	// No header: the ribbon names the card and switches it; RETRIG is on the card
	await expect(lfo.locator('.pt-title')).toBeHidden();
	await expect(ribbon).toHaveText('LFO');
	await expect(lfo.getByRole('switch', { name: 'LFO retrigger' })).toBeVisible();

	// Depth 0: a flat line. Depth up: the wave grows. The readout names the target and depth.
	expect(height((await wave())!)).toBe(0);
	const depth = lfo.getByRole('slider', { name: 'Depth' });
	await depth.focus();
	for (let i = 0; i < 3; i++) await page.keyboard.press('PageUp');
	const low = height((await wave())!);
	for (let i = 0; i < 3; i++) await page.keyboard.press('PageUp');
	expect(low).toBeGreaterThan(2);
	expect(height((await wave())!)).toBeGreaterThan(low * 1.5);
	await expect(lfo.locator('.lfo-status')).toHaveText(/^Pitch\s+\d+ cents$/);

	// Rate: as many cycles across the bar as the division has (1/4: four; 1/8: eight); a 4-bar
	// rate shows its whole cycle over four bars of steps
	const rate = lfo.getByRole('slider', { name: 'Rate' });
	const setRate = async (label: string) => {
		await rate.focus();
		await page.keyboard.press('Home');
		for (let i = 0; i < 12 && (await rate.getAttribute('aria-valuetext')) !== label; i++) await page.keyboard.press('ArrowUp');
		await expect(rate).toHaveAttribute('aria-valuetext', label);
	};
	await setRate('1/4');
	expect(cycles((await wave())!)).toBe(4);
	await expect(lfo.locator('.lv-read--l')).toHaveText('1/4');
	await setRate('1/8');
	expect(cycles((await wave())!)).toBe(8);
	await expect(lfo.locator('.lv-step')).toHaveCount(16);
	await setRate('4 bars');
	expect(cycles((await wave())!)).toBeLessThanOrEqual(1);
	await expect(lfo.locator('.lv-step')).toHaveCount(64);
	await expect(lfo.locator('.lv-read--l')).toHaveText('4 bars · 4 bars shown');

	// The steps that are on show along the bottom, and with RETRIG the wave starts again at each
	await setRate('1/2');
	await turnOnPads(page, [0, 3, 8]);
	await expect(lfo.locator('.lv-step.on')).toHaveCount(3);
	const free = await wave();
	await lfo.getByRole('switch', { name: 'LFO retrigger' }).click();
	expect(await wave()).not.toBe(free);
	await lfo.getByRole('switch', { name: 'LFO retrigger' }).click();
	expect(await wave()).toBe(free);

	// The patch bay: one cable, from LFO out to the target's socket; a click on a socket moves it
	await expect(lfo.locator('.lv-cable')).toHaveCount(1);
	const atPitch = await cableEnd();
	await lfo.getByRole('radio', { name: 'Level' }).click();
	await expect(lfo.getByRole('radio', { name: 'Level' })).toHaveAttribute('aria-checked', 'true');
	expect(await cableEnd()).toBeGreaterThan(atPitch + 200); // three sockets along, of a 600-wide box
	await expect(lfo.locator('.lv-jack.plugged')).toHaveText('Level');
	expect((await saved()).target).toBe('amp');

	// The ribbon switches the LFO off: the wave goes flat, the knobs and sockets stop
	await ribbon.click();
	await expect(ribbon).toHaveAttribute('aria-pressed', 'false');
	expect(height((await wave())!)).toBe(0);
	await expect(lfo.getByRole('radio', { name: 'Pitch' })).toBeDisabled();
	await expect(lfo.locator('.lv-read--l')).toHaveText('Off');
	expect((await saved()).enabled).toBe(false);
});

test('the LFO visualizer shows what the LFO moves, without turning the knob', async ({ page }) => {
	const lfo = page.locator('.module.mod');
	const depth = lfo.getByRole('slider', { name: 'Depth' });
	const target = (name: string) => lfo.getByRole('radio', { name, exact: true });
	const play = page.getByRole('button', { name: 'Play', exact: true });
	const stop = page.getByRole('button', { name: 'Stop', exact: true });
	// Most of the depth (a target picked the first time has a little, its default)
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
	await expect(cutoff.locator('.dial-mod-range')).toHaveCount(0); // the LFO on Pitch at depth 0
	await target('Filter').click();
	await expect(cutoff.locator('.dial-mod-range')).toHaveCount(1); // Filter's default depth
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

	// Level: on the Volume knob (the Step Sequencer's Vol until PR 92), an arc from full down to
	// the quietest, and a dot that moves with the LFO while it plays; Volume stays where it was set
	const vol = page.getByRole('slider', { name: 'Volume', exact: true });
	const volNow = await vol.getAttribute('aria-valuenow');
	await target('Level').click();
	await setDepth();
	await expect(pulse.locator('.lfo-ghost')).toHaveCount(0);
	await expect(vol.locator('.dial-mod-range')).toHaveCount(1);
	await play.click();
	await expect(vol.locator('.dial-mod-dot')).toHaveCount(1);
	expect(await distinct(() => vol.locator('.dial-mod-dot').getAttribute('cx'))).toBeGreaterThan(3);
	await expect(vol).toHaveAttribute('aria-valuenow', volNow!);
	await stop.click();

	// FM: on the FM card's Amount knob, only while FM is on (with FM off the LFO moves nothing)
	const fmCard = page.locator('.ds-sound .module.fm');
	const amount = fmCard.getByRole('slider', { name: 'Amount', exact: true });
	await target('FM amount').click();
	await setDepth();
	await expect(vol.locator('.dial-mod-range')).toHaveCount(0);
	await expect(amount.locator('.dial-mod-range')).toHaveCount(0);
	await fmCard.getByRole('switch', { name: 'FM' }).click();
	await expect(amount.locator('.dial-mod-range')).toHaveCount(1);
	const amountNow = await amount.getAttribute('aria-valuenow');
	await play.click();
	await expect(amount.locator('.dial-mod-dot')).toHaveCount(1);
	expect(await distinct(() => amount.locator('.dial-mod-dot').getAttribute('cx'))).toBeGreaterThan(3);
	await expect(amount).toHaveAttribute('aria-valuenow', amountNow!);
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

test('each LFO target remembers its depth: a new one starts at a little, an old one comes back', async ({ page }) => {
	const lfo = page.locator('.module.mod');
	const depth = lfo.getByRole('slider', { name: 'Depth' });
	const target = (name: string) => lfo.getByRole('radio', { name, exact: true });
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	await expect(depth).toHaveAttribute('aria-valuenow', '0'); // Pitch, off by default
	await page.waitForTimeout(600); // past the undo history's starting point

	// The first time, each target gets its own little depth, not 0
	await target('Filter').click();
	await expect(depth).toHaveAttribute('aria-valuetext', '1500 Hz');
	await target('Level').click();
	await expect(depth).toHaveAttribute('aria-valuetext', '40% level');
	await target('FM amount').click();
	await expect(depth).toHaveAttribute('aria-valuetext', '±40% FM');

	// Set Pitch's depth, go to Filter and change it, then back: each kept its own
	await target('Pitch').click();
	await expect(depth).toHaveAttribute('aria-valuetext', '0 cents');
	await depth.focus();
	for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp'); // about 1 % of the range each
	const pitchDepth = Number(await depth.getAttribute('aria-valuenow'));
	expect(pitchDepth).toBeGreaterThan(0);
	const pitchText = `${pitchDepth} cents`;
	await target('Filter').click();
	await expect(depth).toHaveAttribute('aria-valuetext', '1500 Hz');
	await depth.focus();
	await page.keyboard.press('Home');
	await expect(depth).toHaveAttribute('aria-valuenow', '0');
	await target('Pitch').click();
	await expect(depth).toHaveAttribute('aria-valuetext', pitchText);
	await page.waitForTimeout(600); // one undo step each
	await target('Filter').click();
	await expect(depth).toHaveAttribute('aria-valuenow', '0');

	// Undo puts the target and its depth back together
	await page.waitForTimeout(600);
	await undo.click();
	await expect(target('Pitch')).toHaveAttribute('aria-checked', 'true');
	await expect(depth).toHaveAttribute('aria-valuetext', pitchText);

	// Saved with the project: exported (every target's depth) and imported with Level's changed
	const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	expect(project.data.synth.lfo.depths).toEqual({ pitch: pitchDepth, filter: 0, pwm: 15, amp: 40, fm: 40 });
	project.data.synth.lfo.depths.amp = 70;
	project.projectId = 'lfo-depths';
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'lfo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
	});
	await expect(depth).toHaveAttribute('aria-valuetext', pitchText);
	await target('Level').click();
	await expect(depth).toHaveAttribute('aria-valuetext', '70% level');
	await target('Filter').click();
	await expect(depth).toHaveAttribute('aria-valuenow', '0');
});

test('LFO rates are locked to the bar: 4 bars to 1/64, the cycle starts on bar 1, and the export dialog fits the loop to it', async ({ page }) => {
	const lfo = page.locator('.module.mod');
	const rate = lfo.getByRole('slider', { name: 'Rate' });
	const target = (name: string) => lfo.getByRole('radio', { name, exact: true });
	// No free rate, so no ⋯ menu on the LFO card any more
	await expect(lfo.getByRole('button', { name: 'Advanced options' })).toHaveCount(0);
	await expect(rate).toHaveAttribute('aria-valuetext', '1/8');
	await rate.focus();
	await page.keyboard.press('End');
	await expect(rate).toHaveAttribute('aria-valuetext', '1/64');
	await page.keyboard.press('Home');
	await expect(rate).toHaveAttribute('aria-valuetext', '4 bars');
	await page.keyboard.press('ArrowUp');
	await expect(rate).toHaveAttribute('aria-valuetext', '2 bars');

	// Playing at 300 BPM (a bar is 0.8 s): a 2-bar LFO (0.625 Hz) starts its cycle with bar 1
	// and again every 2 bars, on the bar line
	await page.evaluate(() => {
		const w = window as any;
		w.__lfoStarts = [];
		const orig = OscillatorNode.prototype.start;
		OscillatorNode.prototype.start = function (this: OscillatorNode, when = 0, ...rest: any[]) {
			if (this.frequency.value < 20) w.__lfoStarts.push({ when, hz: this.frequency.value, now: this.context.currentTime });
			return (orig as any).call(this, when, ...rest);
		};
	});
	await setTempo(page, 300);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(() => page.evaluate(() => (window as any).__lfoStarts.length), { timeout: 5000 }).toBeGreaterThanOrEqual(3);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	const starts = (await page.evaluate(() => (window as any).__lfoStarts)) as { when: number; hz: number; now: number }[];
	// The first is the LFO starting up as Play is pressed; then one per 2 bars, from bar 1
	const synced = starts.filter((s) => s.when > 0);
	expect(synced.length).toBeGreaterThanOrEqual(2);
	for (const s of synced) expect(s.hz).toBeCloseTo(0.625, 6);
	for (let i = 1; i < synced.length; i++) expect(synced[i].when - synced[i - 1].when).toBeCloseTo(1.6, 3);

	// The export dialog: with the LFO moving the filter over 4 bars, a loop starts at 4 bars,
	// and a shorter one says it won't repeat smoothly, with a button to fix it
	await rate.focus();
	await page.keyboard.press('Home');
	await target('Filter').click();
	await chooseFromFileMenu(page, 'Export audio…');
	const dialog = page.getByRole('dialog', { name: 'Export audio' });
	const bars = dialog.getByRole('group', { name: 'Bars' });
	await expect(bars.getByRole('button', { name: '4', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(dialog).not.toContainText("won't repeat smoothly");
	await bars.getByRole('button', { name: '1', exact: true }).click();
	await expect(dialog).toContainText("The LFO's cycle takes 4 bars, so a 1-bar loop won't repeat smoothly.");
	await dialog.getByRole('button', { name: 'Use 4 bars' }).click();
	await expect(bars.getByRole('button', { name: '4', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(dialog).not.toContainText("won't repeat smoothly");
	// With the tail there's no loop to repeat
	await bars.getByRole('button', { name: '2', exact: true }).click();
	await dialog.getByRole('button', { name: 'With tail' }).click();
	await expect(dialog).not.toContainText("won't repeat smoothly");
	await page.keyboard.press('Escape');

	// With RETRIG each note starts its own LFO, so any loop repeats smoothly
	await page.getByRole('switch', { name: 'LFO retrigger' }).click();
	await chooseFromFileMenu(page, 'Export audio…');
	await dialog.getByRole('button', { name: 'Loop' }).click();
	await bars.getByRole('button', { name: '1', exact: true }).click();
	await expect(dialog).not.toContainText("won't repeat smoothly");
});

// Imports a project with only step 1 on, at velocity `vel`, and optional velocity amounts
// The pitch of a steady tone from `fromS` to `toS` seconds into the file: its upward zero
// crossings, each placed between two samples, counted against the time from the first to the last
function wavPitchHz(bytes: Buffer, fromS: number, toS: number) {
	const { rate, samples } = wavSamples(bytes);
	const a = Math.round(fromS * rate), b = Math.min(samples.length, Math.round(toS * rate));
	const at: number[] = [];
	for (let i = a + 1; i < b; i++) {
		if (samples[i - 1] < 0 && samples[i] >= 0) at.push(i - 1 + samples[i - 1] / (samples[i - 1] - samples[i]));
	}
	return at.length < 2 ? 0 : ((at.length - 1) * rate) / (at[at.length - 1] - at[0]);
}

test('the tape pedal: AGE dulls and squeezes the sound and adds hiss, WOBBLE sways the pitch, in the export', async ({ page }) => {
	await setTempo(page, 80); // a bar is 3 s
	await turnOnPads(page, [0]);
	// Pad 1 loud and pad 9 soft, a bright wave with the filter open
	const exportWith = async (id: string, tape: Record<string, unknown> | null, change?: (d: any) => void) => {
		await importChanged(page, id, (d) => {
			const lane = d.instruments.find((i: any) => i.name === 'synth-voice');
			lane.steps = lane.steps.map((_: boolean, i: number) => i === 0 || i === 8);
			lane.velocities = lane.velocities.map((_: number, i: number) => (i === 8 ? 0.25 : 1));
			lane.waveforms = lane.waveforms.map(() => 'sawtooth');
			d.selectedWaveform = 'sawtooth';
			d.synth.filter.cutoff = 10000;
			d.fx.tape = { enabled: !!tape, age: 0, wobble: 0, mode: 'tape', ...tape };
			change?.(d);
		});
		return exportWav(page);
	};
	const off = await exportWith('tape-off', null);
	// The aged one with its stems: the mix, and the sound without the tape's own noise
	await exportWith('tape-old', { age: 1 });
	const aged = unzip((await exportAudio(page, { bars: 1, ending: 'With tail', mix: true, stems: true, midi: false, oneShot: false, normalize: false })).bytes);
	const part = (name: string) => aged[Object.keys(aged).find((f) => f.endsWith(`_${name}.wav`))!];
	const old = part('mix');

	// A duller top: the saw changes less from sample to sample (the dry stem: under the hiss)
	expect(wavBrightness(part('dry'), 0.005, 0.2)).toBeLessThan(wavBrightness(off, 0.005, 0.2) * 0.75);
	// Saturation: the loud hit is squeezed and the soft one comes up, so they're closer. Measured
	// on the dry stem (PR 96): the saturation is one gain for the whole mix, so the dry stem has
	// it too, without the tape's random hiss, which sits on the soft hit's peak in the mix and
	// moved the mix's ratio between 3.24 and 3.67 from export to export (3.96 off), so the test
	// passed or failed by chance. The dry stem's is 3.59 every time: 9 % closer at AGE 1.
	const ratio = (b: Buffer) => wavWindow(b, 0, 0.4).peak / wavWindow(b, 1.5, 1.9).peak;
	expect(ratio(off)).toBeGreaterThan(3.5);
	expect(ratio(part('dry'))).toBeLessThan(ratio(off) * 0.95);
	expect(wavPeak(old)).toBeLessThan(1);
	// Hiss, between the hits (they've faded by then) and only with the pedal
	expect(wavWindow(off, 0.9, 1.4).rms).toBeLessThan(1e-4);
	const hiss = wavWindow(old, 0.9, 1.4).rms;
	expect(hiss).toBeGreaterThan(0.002);
	expect(hiss).toBeLessThan(0.03);
	// With its tail, the hiss goes with the bar: it fades within 1.5 s of its end
	const { frames, rate } = wavSamples(old);
	expect(frames / rate).toBeGreaterThan(3.5);
	expect(frames / rate).toBeLessThan(4.7);

	// AGE at 0 with the pedal on: next to nothing changes (its low-pass is up at 20 kHz), and
	// there's no hiss
	const fresh = await exportWith('tape-new', { age: 0 });
	expect(wavPeak(fresh) / wavPeak(off)).toBeGreaterThan(0.93);
	expect(wavPeak(fresh) / wavPeak(off)).toBeLessThan(1.07);
	expect(wavBrightness(fresh, 0.005, 0.2) / wavBrightness(off, 0.005, 0.2)).toBeGreaterThan(0.85);
	expect(wavWindow(fresh, 0.9, 1.4).rms).toBeLessThan(1e-4);

	// WOBBLE: a long, steady A5 holds its pitch without it and sways with it (about 1 % either
	// way for the tape's slow wow), as a tape does and as a record does
	const steady = (d: any) => {
		const lane = d.instruments.find((i: any) => i.name === 'synth-voice');
		lane.steps = lane.steps.map((_: boolean, i: number) => i === 0);
		lane.waveforms = lane.waveforms.map(() => 'sine');
		lane.pitches = lane.pitches.map(() => 880);
		d.synth.envelope.decayMs = 2000;
	};
	const sway = (b: Buffer) => {
		const hz = [0.05, 0.3, 0.55, 0.8, 1.05, 1.3].map((t) => wavPitchHz(b, t, t + 0.2));
		return { spread: (Math.max(...hz) - Math.min(...hz)) / 880, mean: hz.reduce((x, y) => x + y, 0) / hz.length };
	};
	const still = sway(await exportWith('wobble-off', { wobble: 0 }, steady));
	expect(still.mean).toBeCloseTo(880, 0);
	expect(still.spread).toBeLessThan(0.0005);
	for (const mode of ['tape', 'vinyl']) {
		const moving = sway(await exportWith(`wobble-${mode}`, { wobble: 1, mode }, steady));
		expect(moving.spread, mode).toBeGreaterThan(0.008);
		expect(moving.spread, mode).toBeLessThan(0.04);
		expect(Math.abs(moving.mean - 880), mode).toBeLessThan(8);
	}
});

test('the tape pedal: its noise is a stem of its own and the stems still add up; a one-shot ends under the hiss', async ({ page }) => {
	await setTempo(page, 80);
	const name = page.getByRole('textbox', { name: 'Project name' });
	await name.fill('Tape');
	await name.press('Enter');
	await turnOnPads(page, [0, 4, 8, 12]);
	// Noise and reverb (Snare) and the delay: every stem has sound. Not the overdrive: its
	// curve turns silence into a small steady offset, which Chrome renders differently from
	// one render to the next (on main too), so with it on the stems miss the mix by that much
	await soundsBox(page).getByRole('button', { name: 'Snare', exact: true }).click();
	await page.locator('.fx .footswitch').nth(0).click();

	const stemsOf = async (id: string, mode: string, ending: 'Loop' | 'With tail') => {
		await importChanged(page, id, (d) => { d.fx.tape = { enabled: true, age: 0.8, wobble: 0.7, mode }; });
		const zip = await exportAudio(page, { bars: 1, ending, mix: true, stems: true, midi: false, oneShot: true, oneShotNote: 'A2 (110 Hz)', normalize: true });
		const files = unzip(zip.bytes);
		const base = `${id}_80bpm_Amin_1bar${ending === 'Loop' ? '' : '-tail'}`;
		expect(Object.keys(files).sort()).toEqual([
			...['delay', 'dry', 'mix', 'noise', 'reverb', 'tape'].map((p) => `${base}_${p}.wav`), `${id}_oneshot_A2.wav`,
		].sort());
		// The stems add up to the mix, sample for sample, in both channels: the saturation
		// follows the whole mix, so each part gets the gain the mix got
		for (const ch of [0, 1]) {
			const mix = wavSamples(files[`${base}_mix.wav`], ch).samples;
			const stems = ['dry', 'delay', 'reverb', 'noise', 'tape'].map((p) => wavSamples(files[`${base}_${p}.wav`], ch).samples);
			let worst = 0;
			for (let i = 0; i < mix.length; i++) worst = Math.max(worst, Math.abs(stems.reduce((a, st) => a + st[i], 0) - mix[i]));
			expect(worst, `${id}, channel ${ch}`).toBeLessThan(1e-3);
			for (const st of stems) expect(st.length).toBe(mix.length);
		}
		return { files, base };
	};

	// Tape: the stem is a steady hiss. A loop is exactly the bar, hiss to its very end.
	const tape = await stemsOf('Tape-loop', 'tape', 'Loop');
	const hiss = tape.files[`${tape.base}_tape.wav`];
	expect(wavSamples(hiss).frames).toBe(wavSamples(hiss).rate * 3);
	const crest = (b: Buffer, to: number) => wavWindow(b, 0, to).peak / wavWindow(b, 0, to).rms;
	expect(wavWindow(hiss, 0, 3).rms).toBeGreaterThan(0.001);
	expect(crest(hiss, 3)).toBeLessThan(6);
	expect(wavWindow(hiss, 2.9, 3).rms).toBeGreaterThan(wavWindow(hiss, 0, 3).rms * 0.7);

	// Vinyl: crackle, mostly quiet with ticks standing out; with its tail it fades after the bar
	const vinyl = await stemsOf('Tape-tail', 'vinyl', 'With tail');
	const crackle = vinyl.files[`${vinyl.base}_tape.wav`];
	expect(crest(crackle, 3)).toBeGreaterThan(8);
	expect(wavWindow(crackle, 4.6, 9).peak).toBeLessThan(1e-4);

	// The one-shot: the hit with its hiss, cut where the hit has faded under it (not 6 s of
	// hiss), ending in a short fade
	const shot = tape.files['Tape-loop_oneshot_A2.wav'];
	const { frames, rate, samples } = wavSamples(shot);
	expect(frames / rate).toBeGreaterThan(0.2);
	expect(frames / rate).toBeLessThan(5.5);
	expect(Math.abs(samples[frames - 1])).toBeLessThan(1e-3);
	expect(wavWindow(shot, frames / rate - 0.2, frames / rate - 0.06).rms).toBeGreaterThan(1e-3);
});

test("the lo-fi pedal's PHONE switch: 300 Hz–3.4 kHz in mono, in the export, its stems still adding up; saved, undone", async ({ page }) => {
	// The switch: beside TAPE | VINYL on the deck, greyed out while the pedal is off
	const deck = page.locator('.ds-grid .tape-pedal.is-deck');
	const phone = deck.getByRole('switch', { name: 'Phone line' });
	await expect(phone).toHaveAttribute('aria-checked', 'false');
	await expect(phone).toBeDisabled();
	await page.getByRole('button', { name: 'Lo-fi pedal' }).first().click();
	await expect(phone).toBeEnabled();
	const vinyl = (await deck.getByRole('radio', { name: 'Vinyl' }).boundingBox())!;
	const sw = (await phone.boundingBox())!;
	const box = (await deck.boundingBox())!;
	expect(sw.x).toBeGreaterThan(vinyl.x + vinyl.width - 1);
	expect(sw.x + sw.width).toBeLessThanOrEqual(box.x + box.width);
	await page.waitForTimeout(SETTLED);
	await phone.click();
	await expect(phone).toHaveAttribute('aria-checked', 'true');
	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	expect(saved.fx.tape.phone).toBe(true);
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.waitForTimeout(SETTLED);
	await page.keyboard.press('Control+z');
	await expect(phone).toHaveAttribute('aria-checked', 'false');

	// The export: one hit, three unison voices spread wide (left and right differ), at A2
	// (110 Hz, under the band) or A5 (880 Hz, in it)
	await turnOnPads(page, [0]);
	const exportWith = async (id: string, on: boolean, hz: number) => {
		await importChanged(page, id, (d) => {
			const lane = d.instruments.find((i: any) => i.name === 'synth-voice');
			lane.steps = lane.steps.map((_: boolean, i: number) => i === 0);
			lane.pitches = lane.pitches.map(() => hz);
			lane.waveforms = lane.waveforms.map(() => 'sine');
			d.selectedWaveform = 'sine';
			d.synth.unison = { ...d.synth.unison, enabled: true, voices: 3, detuneCents: 12, stereoSpread: 100 };
			d.fx.reverb = { ...d.fx.reverb, enabled: true, mix: 0.3 };
			d.fx.tape = { enabled: true, age: 0.5, wobble: 0, mode: 'tape', phone: on };
		});
		return unzip((await exportAudio(page, { bars: 1, ending: 'With tail', mix: true, stems: true, midi: false, oneShot: false, normalize: false })).bytes);
	};
	const part = (files: Record<string, Buffer>, name: string) => files[Object.keys(files).find((f) => f.endsWith(`_${name}.wav`))!];
	const level = (b: Buffer) => wavWindow(b, 0, 0.3).rms;
	const sides = (b: Buffer) => {
		const l = wavSamples(b, 0).samples, r = wavSamples(b, 1).samples;
		let worst = 0;
		for (let i = 0; i < l.length; i++) worst = Math.max(worst, Math.abs(l[i] - r[i]));
		return worst;
	};
	const lowOff = await exportWith('phone-low-off', false, 110);
	const lowOn = await exportWith('phone-low-on', true, 110);
	const highOff = await exportWith('phone-high-off', false, 880);
	const highOn = await exportWith('phone-high-on', true, 880);
	// Under the band it's all but gone (about 35 dB down at 110 Hz); in it, about as loud
	expect(level(part(lowOn, 'dry')) / level(part(lowOff, 'dry'))).toBeLessThan(0.1);
	const kept = level(part(highOn, 'dry')) / level(part(highOff, 'dry'));
	expect(kept).toBeGreaterThan(0.6);
	expect(kept).toBeLessThan(1.3);
	// Mono: the spread voices differ left and right without it, not with it
	expect(sides(part(highOff, 'dry'))).toBeGreaterThan(0.01);
	expect(sides(part(highOn, 'dry'))).toBeLessThan(1e-4);
	expect(sides(part(highOn, 'mix'))).toBeLessThan(1e-4);
	// Linear: the stems still add up to the mix, in both channels
	for (const ch of [0, 1]) {
		const mix = wavSamples(part(highOn, 'mix'), ch).samples;
		const stems = ['dry', 'reverb', 'tape'].map((p) => wavSamples(part(highOn, p), ch).samples);
		let worst = 0;
		for (let i = 0; i < mix.length; i++) worst = Math.max(worst, Math.abs(stems.reduce((a, st) => a + st[i], 0) - mix[i]));
		expect(worst, `channel ${ch}`).toBeLessThan(1e-3);
	}
});

test("the reverb pedal: three knobs and REV in PRE's corner; a project saved with PRE plays without it, and the stems still add up", async ({ page }) => {
	const pedal = page.locator('.ds-grid .reverb-pedal');
	// DECAY, MIX and TONE, no PRE (PR 126)
	await expect(pedal.getByRole('slider')).toHaveCount(3);
	await expect(pedal.getByRole('slider', { name: 'PRE' })).toHaveCount(0);
	// REV on the face, beside TONE, where PRE was: right of it, level with it
	const tone = (await pedal.getByRole('slider', { name: 'TONE' }).boundingBox())!;
	const rev = (await pedal.getByRole('switch', { name: 'Reverse reverb' }).boundingBox())!;
	const face = (await pedal.locator('.panel-top').boundingBox())!;
	expect(rev.x).toBeGreaterThan(tone.x + tone.width);
	expect(rev.x + rev.width).toBeLessThanOrEqual(face.x + face.width + 1);
	expect(Math.abs((rev.y + rev.height / 2) - (tone.y + tone.height / 2))).toBeLessThan(tone.height);

	// The export: one hit; a project saved with PRE at 1/8 (250 ms at 120 BPM) has its reverb
	// starting with the hit, as with Off; nothing about PRE is saved again
	await turnOnPads(page, [0]);
	const exportWith = async (id: string, preDivision: string) => {
		await importChanged(page, id, (d) => {
			d.transport.tempo = 120;
			d.fx.reverb = { enabled: true, mix: 0.5, decay: 1, tone: 0.6, preDivision, preDelay: preDivision === 'Off' ? 0 : 250 };
		});
		const files = unzip((await exportAudio(page, { bars: 1, ending: 'With tail', mix: true, stems: true, midi: false, oneShot: false, normalize: false })).bytes);
		const of = (part: string) => files[Object.keys(files).find((n) => n.endsWith(`_${part}.wav`))!];
		const onsetMs = (b: Buffer) => {
			const { rate, samples } = wavSamples(b);
			let peak = 0;
			for (const v of samples) peak = Math.max(peak, Math.abs(v));
			return (samples.findIndex((v) => Math.abs(v) > peak * 0.02) / rate) * 1000;
		};
		const mix = wavSamples(of('mix')).samples;
		const stems = ['dry', 'reverb'].map((p) => wavSamples(of(p)).samples);
		let worst = 0;
		for (let i = 0; i < mix.length; i++) worst = Math.max(worst, Math.abs(stems[0][i] + stems[1][i] - mix[i]));
		expect(worst, id).toBeLessThan(1e-3);
		return { dry: onsetMs(of('dry')), reverb: onsetMs(of('reverb')) };
	};
	const none = await exportWith('Pre-off', 'Off');
	const old = await exportWith('Pre-eighth', '1/8');
	expect(Math.abs(old.dry - none.dry)).toBeLessThan(1);
	expect(Math.abs(old.reverb - none.reverb)).toBeLessThan(5);
	const reverb = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.fx.reverb;
	expect('preDivision' in reverb || 'preDelay' in reverb).toBe(false);
});

test("REV on the reverb: its switch, SWELL's lengths, saved, one undo step; each swell rises into the next hit in the export (any machine's), and the stems still add up", async ({ page }) => {
	const pedal = page.locator('.ds-grid .reverb-pedal');
	const rev = pedal.getByRole('switch', { name: 'Reverse reverb' });
	const knob = pedal.getByRole('slider', { name: /^(DECAY|SWELL)$/ });
	const saved = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.fx.reverb;
	await expect(rev).toBeDisabled();
	await expect(rev).toHaveAttribute('aria-checked', 'false');
	await page.waitForTimeout(SETTLED); // the opened project becomes the starting point
	await pedal.locator('.footswitch').click();
	await page.waitForTimeout(SETTLED);
	await expect(knob).toHaveAccessibleName('DECAY');
	await rev.click();
	await expect(rev).toHaveAttribute('aria-checked', 'true');
	// DECAY reads SWELL: Next hit, 1 step, 2 steps, 1 beat, 2 beats
	await expect(knob).toHaveAccessibleName('SWELL');
	await expect(knob).toHaveAttribute('aria-valuetext', 'Next hit');
	await page.waitForTimeout(SETTLED);
	await knob.focus();
	for (let i = 0; i < 3; i++) await knob.press('ArrowRight');
	await expect(knob).toHaveAttribute('aria-valuetext', '1 beat');
	await page.locator('body').click({ position: { x: 2, y: 2 } });
	await page.waitForTimeout(SETTLED);
	let reverb = await saved();
	expect([reverb.reverse, reverb.swell, reverb.decay]).toEqual([true, '1/4', 1.4]);
	await page.getByRole('button', { name: 'Undo', exact: true }).click(); // the length
	await expect(knob).toHaveAttribute('aria-valuetext', 'Next hit');
	await page.getByRole('button', { name: 'Undo', exact: true }).click(); // REV
	await expect(rev).toHaveAttribute('aria-checked', 'false');
	await expect(knob).toHaveAccessibleName('DECAY');

	// The export: hits on steps 1 and 5 at 120 BPM, so the first hit's swell lasts 0.5 s (to step
	// 5) and the second's 1.5 s (to the next bar's step 1)
	await turnOnPads(page, [0, 4]);
	const exportWith = async (id: string, reverse: boolean) => {
		await importChanged(page, id, (d) => {
			d.transport.tempo = 120;
			d.transport.swing = 0;
			d.fx.reverb = { enabled: true, mix: 0.4, decay: 1.4, tone: 0.6, reverse, swell: 'next' };
		});
		const files = unzip((await exportAudio(page, { bars: 1, ending: 'With tail', mix: true, stems: true, midi: false, oneShot: false, normalize: false })).bytes);
		const of = (part: string) => files[Object.keys(files).find((n) => n.endsWith(`_${part}.wav`))!];
		const mix = wavSamples(of('mix')).samples;
		const stems = ['dry', 'reverb'].map((p) => wavSamples(of(p)).samples);
		let worst = 0;
		for (let i = 0; i < mix.length; i++) worst = Math.max(worst, Math.abs(stems[0][i] + stems[1][i] - mix[i]));
		expect(worst, id).toBeLessThan(1e-3);
		return of('reverb');
	};
	const plain = await exportWith('Rev-off', false);
	const back = await exportWith('Rev-next', true);
	const rms = (b: Buffer, from: number, to: number) => wavWindow(b, from, to).rms;
	// The first swell rises until the second hit (0.5 s), the second until the bar's end (2 s)
	expect(rms(back, 0.4, 0.49)).toBeGreaterThan(rms(back, 0.02, 0.12) * 4);
	expect(rms(back, 1.85, 1.99)).toBeGreaterThan(rms(back, 0.7, 0.9) * 4);
	// …where the plain reverb decays
	expect(rms(plain, 0.4, 0.49)).toBeLessThan(rms(plain, 0.02, 0.12));
	// About as loud as the plain reverb, and never clipping
	expect(wavPeak(back)).toBeLessThan(1);
	expect(rms(back, 0, 2)).toBeGreaterThan(rms(plain, 0, 2) * 0.3);
	expect(rms(back, 0, 2)).toBeLessThan(rms(plain, 0, 2) * 3);

	// Every machine's hits time the swells (PR 126; until then only Rhythm's): Rhythm empty, the
	// Drums machine's Kick on steps 1 and 5 through the pedals. The Kick's swell rises into step 5
	// (0.5 s), as Rhythm's did; the stems (the reverb's and the Drums stem) still add up.
	await importDrums(page, 'Rev-drums', [[0, 4]], (d) => {
		d.transport.tempo = 120;
		d.transport.swing = 0;
		d.instruments.find((i: any) => i.name === 'synth-voice').steps = Array(16).fill(false);
		d.fx.reverb = { enabled: true, mix: 0.4, decay: 1.4, tone: 0.6, reverse: true, swell: 'next' };
	});
	const dfiles = unzip((await exportAudio(page, { bars: 1, ending: 'With tail', mix: true, stems: true, midi: false, oneShot: false, normalize: false })).bytes);
	const dof = (part: string) => dfiles[Object.keys(dfiles).find((n) => n.endsWith(`_${part}.wav`))!];
	const drumsRev = dof('reverb');
	expect(rms(drumsRev, 0.4, 0.49)).toBeGreaterThan(rms(drumsRev, 0.02, 0.12) * 4);
	expect(rms(drumsRev, 1.85, 1.99)).toBeGreaterThan(rms(drumsRev, 0.7, 0.9) * 4);
	{
		const mix = wavSamples(dof('mix')).samples;
		const stems = ['dry', 'reverb'].map((p) => wavSamples(dof(p)).samples);
		let worst = 0;
		for (let i = 0; i < mix.length; i++) worst = Math.max(worst, Math.abs(stems[0][i] + stems[1][i] - mix[i]));
		expect(worst).toBeLessThan(1e-3);
	}

	// Live: a short hit on step 1, then Stop before step 5. Its swell rises for the 0.5 s up to
	// where step 5 would be and stops there (the plain reverb would ring on)
	await importChanged(page, 'Rev-live', (d) => {
		d.transport.tempo = 120;
		d.synth.envelope.decayMs = 60;
		d.fx.reverb = { enabled: true, mix: 1, decay: 1.4, tone: 0.6, reverse: true, swell: 'next' };
	});
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(150);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await page.waitForTimeout(60);
	const rising = await page.evaluate(() => (window as any).__swingOver(230) as Promise<number>);
	await page.waitForTimeout(200);
	const after = await page.evaluate(() => (window as any).__swingOver(400) as Promise<number>);
	expect(rising).toBeGreaterThan(0.01);
	expect(after).toBeLessThan(rising / 3);
});

test('the tape pedal: on the panel, saved, one undo step a change, reset by File → New and a sound preset', async ({ page }) => {
	const tape = page.locator('.ds-grid .tape-pedal');
	const footswitch = tape.locator('.footswitch');
	const age = page.getByRole('slider', { name: 'AGE' });
	const wobble = page.getByRole('slider', { name: 'WOBBLE' });
	const mode = (name: string) => page.getByRole('radiogroup', { name: 'Tape or vinyl' }).getByRole('radio', { name, exact: true });
	const saved = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.fx.tape;

	// It's the last pedal, off, with its knobs and switch greyed out
	await expect(page.locator('.ds-grid .fx-pair > *').last().locator('.tape-pedal')).toHaveCount(1);
	await expect(footswitch).toHaveAttribute('aria-pressed', 'false');
	await expect(age).toHaveAttribute('aria-disabled', 'true');
	await expect(mode('Vinyl')).toBeDisabled();
	expect(await saved()).toEqual({ enabled: false, age: 0.4, wobble: 0.3, mode: 'tape', phone: false });
	await page.waitForTimeout(SETTLED);

	await footswitch.click();
	await expect(footswitch).toHaveAttribute('aria-pressed', 'true');
	await expect(mode('Tape')).toHaveAttribute('aria-checked', 'true');
	await page.waitForTimeout(SETTLED);
	await mode('Vinyl').click();
	await expect(mode('Vinyl')).toHaveAttribute('aria-checked', 'true');
	await expect(mode('Tape')).toHaveAttribute('aria-checked', 'false');
	await page.waitForTimeout(SETTLED);
	await age.focus();
	await page.keyboard.press('End');
	await expect(age).toHaveAttribute('aria-valuetext', '100%');
	await wobble.focus();
	await page.keyboard.press('Home');
	await expect(wobble).toHaveAttribute('aria-valuetext', '0%');
	await page.waitForTimeout(SETTLED);
	expect(await saved()).toEqual({ enabled: true, age: 1, wobble: 0, mode: 'vinyl', phone: false });

	// The lever between the two words flips it
	await tape.locator('.ms-slot').click();
	await expect(mode('Tape')).toHaveAttribute('aria-checked', 'true');
	await page.waitForTimeout(SETTLED);

	// Undo: the lever, the knobs, then Vinyl, then the pedal itself
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	await undo.click();
	await expect(mode('Vinyl')).toHaveAttribute('aria-checked', 'true');
	await undo.click();
	await expect(age).toHaveAttribute('aria-valuetext', '40%');
	await expect(wobble).toHaveAttribute('aria-valuetext', '30%');
	await undo.click();
	await expect(mode('Tape')).toHaveAttribute('aria-checked', 'true');
	await undo.click();
	await expect(footswitch).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(footswitch).toHaveAttribute('aria-pressed', 'true');

	// A sound preset starts from the factory sound: the pedal goes off
	await soundsBox(page).getByRole('button', { name: 'Kick', exact: true }).click();
	await expect(footswitch).toHaveAttribute('aria-pressed', 'false');
	// And File → New
	await footswitch.click();
	await mode('Vinyl').click();
	await chooseFromFileMenu(page, 'New');
	await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
	await expect(footswitch).toHaveAttribute('aria-pressed', 'false');
	await expect(mode('Tape')).toHaveAttribute('aria-checked', 'true');
	await expect(age).toHaveAttribute('aria-valuetext', '40%');
});

test('the tape pedal is last in the live path: its hiss plays while the pattern does, and the noise layer goes through it', async ({ page }) => {
	const swing = (ms: number) => page.evaluate((t) => (window as any).__swingOver(t) as Promise<number>, ms);
	const play = page.getByRole('button', { name: 'Play', exact: true });
	const stop = page.getByRole('button', { name: 'Stop', exact: true });
	const tape = page.locator('.ds-grid .tape-pedal');

	// No step is on: with the pedal off, playing is silent
	await play.click();
	expect(await swing(400)).toBeLessThan(1e-4);
	await stop.click();
	await page.waitForTimeout(3300); // the noise stays 1 s after Stop, then fades for 2

	// The pedal on, AGE at full: hiss while it plays, and the reels turn
	await tape.locator('.footswitch').click();
	await page.getByRole('slider', { name: 'AGE' }).focus();
	await page.keyboard.press('End');
	await expect(tape).not.toHaveClass(/\bturning\b/);
	await page.waitForTimeout(300);
	expect(await swing(300), 'no hiss while stopped').toBeLessThan(1e-4);
	await play.click();
	await expect(tape).toHaveClass(/\bturning\b/);
	await page.waitForTimeout(200);
	const hiss = await swing(500);
	expect(hiss).toBeGreaterThan(0.005);
	expect(hiss).toBeLessThan(0.2);
	// Vinyl crackles instead: ticks reach further than the surface noise under them
	await page.getByRole('radio', { name: 'Vinyl', exact: true }).click();
	await page.waitForTimeout(200);
	expect(await swing(1500)).toBeGreaterThan(0.01);
	// Stopped, the noise stays a moment, then goes
	await stop.click();
	await expect(tape).not.toHaveClass(/\bturning\b/);
	await page.waitForTimeout(3500);
	expect(await swing(400)).toBeLessThan(1e-4);

	// The pedal off again: nothing of it is left, and a note still reaches the speakers
	await tape.locator('.footswitch').click();
	await turnOnPads(page, [0, 4, 8, 12]);
	await play.click();
	const plain = await swing(1200);
	await stop.click();
	expect(plain).toBeGreaterThan(0.05);
	// On, the notes come through it (AGE at full squeezes and dulls them, never silences them)
	await tape.locator('.footswitch').click();
	await page.getByRole('radio', { name: 'Tape', exact: true }).click();
	await play.click();
	const aged = await swing(1200);
	await stop.click();
	expect(aged).toBeGreaterThan(0.05);
	expect(aged).toBeLessThan(2);
});

async function importOneStep(page: Page, vel: number, velocity?: Record<string, number>, change?: (data: any) => void) {
	const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	const lane = project.data.instruments.find((i: any) => i.name === 'synth-voice');
	lane.steps = lane.steps.map((_: boolean, i: number) => i === 0);
	lane.velocities = lane.velocities.map(() => vel);
	if (velocity) project.data.synth.velocity = velocity;
	change?.(project.data);
	project.projectId = `vel-${vel}-${Math.random().toString(36).slice(2, 8)}`;
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'vel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
	});
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(1);
}

// How bright a sound is, from `fromS` to `toS` seconds into the file: the RMS of its
// sample-to-sample change against its own RMS (a lower cutoff gives less change)
function wavBrightness(bytes: Buffer, fromS: number, toS: number) {
	const { rate, samples } = wavSamples(bytes);
	const a = Math.round(fromS * rate), b = Math.min(samples.length, Math.round(toS * rate));
	let sq = 0, dsq = 0;
	for (let i = a + 1; i < b; i++) { sq += samples[i] ** 2; dsq += (samples[i] - samples[i - 1]) ** 2; }
	return Math.sqrt(dsq / Math.max(sq, 1e-12));
}

test('VEL switch: only Filter has one; it makes a soft step darker, and is saved', async ({ page }) => {
	// A saw through a 2 kHz filter, one soft step (25 %)
	await importOneStep(page, 0.25, undefined, (data) => {
		data.selectedWaveform = 'sawtooth';
		data.instruments.find((i: any) => i.name === 'synth-voice').waveforms = Array(16).fill('sawtooth');
		data.synth.filter = { ...data.synth.filter, enabled: true, cutoff: 2000 };
	});
	const plain = wavBrightness(await exportWav(page), 0.01, 0.15);
	// The imported project's first moments are its undo starting point (useUndoHistory's
	// SETTLE_MS after ProjectSync's SYNC_MS); the export above takes about as long, so a click
	// right after it could land in that starting point, leaving nothing to undo
	await page.waitForTimeout(600);

	// Envelope's, Pitch's and Noise's switches are gone (PR 67): only Filter's is left
	for (const name of ['Decay', 'the pitch sweep', 'the noise']) {
		await expect(page.getByRole('switch', { name: `Velocity shapes ${name}` })).toHaveCount(0);
	}
	const sw = page.getByRole('switch', { name: 'Velocity shapes Cutoff' });
	await expect(sw).toHaveAttribute('aria-checked', 'false');
	await expect(sw).toHaveAttribute('title', 'Softer steps are darker');

	// On: +75 %, so the soft step's cutoff falls about an octave
	await sw.click();
	await expect(sw).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled(); // recorded as a step
	// A soft step is on, so no note about full velocity
	await expect(page.getByRole('status').filter({ hasText: 'full velocity' })).toHaveCount(0);

	const routed = wavBrightness(await exportWav(page), 0.01, 0.15);
	expect(routed).toBeLessThan(plain * 0.85);
	const saved = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.synth.velocity;
	expect(await saved()).toEqual({ decay: 0, cutoff: 75, pitchEnv: 0, noise: 0 });

	// Off again, and Undo brings it back
	await sw.click();
	await expect(sw).toHaveAttribute('aria-checked', 'false');
	expect(await saved()).toEqual({ decay: 0, cutoff: 0, pitchEnv: 0, noise: 0 });
	await page.waitForTimeout(600);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(sw).toHaveAttribute('aria-checked', 'true');
});

test('VEL switch: amounts with no switch any more load as 0; at full velocity a note says so and Humanize glows', async ({ page }) => {
	// A project saved before PR 67, with Decay, pitch and noise amounts: they'd play with no
	// switch to show or undo them, so they load as 0, and the soft step sounds as without them
	await importOneStep(page, 0.25);
	const plain = wavSoundMs(await exportWav(page));
	await importOneStep(page, 0.25, { decay: 75, cutoff: 0, pitchEnv: 40, noise: 75 });
	expect(wavSoundMs(await exportWav(page))).toBeCloseTo(plain, -1);
	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.synth.velocity;
	expect(saved).toEqual({ decay: 0, cutoff: 0, pitchEnv: 0, noise: 0 });

	// A saved cutoff amount lights the switch; a click turns it off
	await importOneStep(page, 1, { decay: 0, cutoff: 40, pitchEnv: 0, noise: 0 });
	const sw = page.getByRole('switch', { name: 'Velocity shapes Cutoff' });
	await expect(sw).toHaveAttribute('aria-checked', 'true');
	await sw.click();
	await expect(sw).toHaveAttribute('aria-checked', 'false');

	// Every step at full velocity, so nothing can change yet: say so, and point at Humanize
	await sw.click();
	await expect(page.getByRole('status').filter({ hasText: 'Every step is at full velocity: try Humanize' })).toBeVisible();
	await expect(page.locator('.pt-section.pt-nudged')).toHaveCount(1);
	await expect(page.locator('.pt-section.pt-nudged')).toHaveCount(0, { timeout: 4000 });
	await expect(page.getByRole('status').filter({ hasText: 'full velocity' })).toHaveCount(0, { timeout: 4000 });
});

test("Pattern Tools' octave arrows move every pad; no Active Pads Only toggle (PR 98)", async ({ page }) => {
	const pitches = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'))
		.data.instruments.find((i: any) => i.name === 'synth-voice').pitches as number[];
	await expect(page.locator('.pattern-tools').getByRole('button', { name: 'Active Pads Only' })).toHaveCount(0);
	await turnOnPads(page, [0]);
	const before = await pitches();

	// The pad that's on and the ones that are off alike
	await page.getByRole('button', { name: 'Octave up' }).click();
	let after = await pitches();
	expect(after[0]).toBeCloseTo(before[0] * 2, 3);
	expect(after[1]).toBeCloseTo(before[1] * 2, 3);
	await page.getByRole('button', { name: 'Octave down' }).click();
	after = await pitches();
	expect(after[0]).toBeCloseTo(before[0], 3);
	expect(after[1]).toBeCloseTo(before[1], 3);
});

test("the Noise card's Accents puts noise on the pattern's loudest hits; Halftime and Breaks are patterns", async ({ page }) => {
	const saved = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	const marked = (mask: boolean[]) => mask.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
	const noise = page.getByRole('button', { name: 'Toggle noise' });
	await noise.click();
	const card = page.locator('.module.noise');

	// Tresillo's accents are its first and fifth hits (steps 1 and 9), where Backbeat's 5 and 13
	// had no hit at all
	await patternsBox(page).getByRole('button', { name: 'Tresillo', exact: true }).click();
	await card.getByRole('button', { name: 'Accents' }).click();
	expect(marked((await saved()).synth.noise.mask)).toEqual([0, 8]);

	// The new patterns: Breaks' snares (an octave up) on beats 2 and 4, Halftime's on beat 3;
	// Accents follows them
	for (const [name, accents] of [['Breaks', [0, 4, 12]], ['Halftime', [0, 8]]] as const) {
		await patternsBox(page).getByRole('button', { name, exact: true }).click();
		await expect(patternsBox(page).getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
		await card.getByRole('button', { name: 'Accents' }).click();
		expect(marked((await saved()).synth.noise.mask), name).toEqual(accents);
	}
	await expect(patternsBox(page).getByRole('button', { name: 'Offbeat' })).toHaveCount(0);
	await expect(patternsBox(page).getByRole('button', { name: 'Broken' })).toHaveCount(0);
});

test("a Noise pad button turns the card on; Backbeat and Offbeats, with a note when their steps are off", async ({ page }) => {
	const saved = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	const marked = (mask: boolean[]) => mask.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
	const ribbon = page.getByRole('button', { name: 'Toggle noise' });
	const card = page.locator('.module.noise');
	const note = card.locator('.mask-note');
	const led = () => ribbon.locator('.noise-ribbon-led').evaluate((el) => getComputedStyle(el).backgroundColor);
	await page.waitForTimeout(SETTLED); // the opened project becomes the starting point

	// Every 4 and Random made way for Backbeat and Offbeats; the ribbon's LED is dark while off
	await expect(card.locator('.mask-stack').getByRole('button'))
		.toHaveText(['Every 2', 'Backbeat', 'Offbeats', 'Accents', 'Invert', 'All']);
	await expect(ribbon).toHaveAttribute('aria-pressed', 'false');
	const ledOff = await led();
	const size = await card.boundingBox();

	// A pad button while the card is off: the card comes on with it (before, nothing was heard).
	// No step is on yet, so a note says why there's still nothing to hear; the card stays its size.
	await card.getByRole('button', { name: 'Backbeat' }).click();
	await expect(ribbon).toHaveAttribute('aria-pressed', 'true');
	expect(await led()).not.toBe(ledOff);
	await expect(note).toHaveText('Those steps are off');
	expect(await card.boundingBox()).toEqual(size);
	let data = await saved();
	expect(data.synth.noise.enabled).toBe(true);
	expect(marked(data.synth.noise.mask)).toEqual([4, 12]); // beats 2 and 4: pads 5 and 13

	// One undo step: the card off again, noise back on every pad
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(ribbon).toHaveAttribute('aria-pressed', 'false');
	data = await saved();
	expect(data.synth.noise.enabled).toBe(false);
	expect(marked(data.synth.noise.mask)).toHaveLength(16);

	// With pad 5 on: Backbeat has a hit to play on, so no note; Offbeats (pads 3, 7, 11, 15) hasn't
	await turnOnPads(page, [4]);
	await card.getByRole('button', { name: 'Backbeat' }).click();
	await expect(ribbon).toHaveAttribute('aria-pressed', 'true');
	await expect(note).toHaveCount(0);
	await card.getByRole('button', { name: 'Offbeats' }).click();
	await expect(note).toHaveText('Those steps are off');
	expect(marked((await saved()).synth.noise.mask)).toEqual([2, 6, 10, 14]);

	// Invert after All leaves no pad with noise, and says so
	await card.getByRole('button', { name: 'All' }).click();
	await expect(note).toHaveCount(0);
	await card.getByRole('button', { name: 'Invert' }).click();
	await expect(note).toHaveText('No pad has noise now');
	expect(marked((await saved()).synth.noise.mask)).toEqual([]);
});

test('starting new projects does not leave old keyboard listeners behind', async ({ page }) => {
	const listeners = () => page.evaluate(() => (window as any).__keydown.length as number);
	const start = await listeners();
	for (let i = 0; i < 3; i++) {
		await chooseFromFileMenu(page, 'New');
		// The menu closes once the new project has been created
		await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
		await expect(page.getByRole('button', { name: /^Generate (melody|arpeggio)$/ })).toBeVisible();
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
			const logo = document.querySelector('.topbar-home');
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

test('PR 93: one accent: lit keys, the chosen key and the mute dot in the LEDs\' colour, no wash, readable captions while off', async ({ page }) => {
	const style = (sel: string, prop: string, pseudo?: string) => page.locator(sel).first()
		.evaluate((el, [p, ps]) => getComputedStyle(el, ps || null).getPropertyValue(p), [prop, pseudo ?? ''] as const);
	for (const theme of ['synthwave', 'dark', 'analog']) {
		await page.evaluate((t) => localStorage.setItem('ewave-studio2:ui-theme', t), theme);
		await page.reload();
		await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${theme}`));
		const led = await page.evaluate(() => {
			const probe = document.createElement('i');
			probe.style.color = 'var(--hw-led)';
			document.body.append(probe);
			const c = getComputedStyle(probe).color;
			probe.remove();
			return c;
		});
		// FM's and Unison's chosen keys, the LFO's wave key and the Step Sequencer's dot: the LEDs'
		expect(await style('.ds-grid .fm-unit .sp-key.on', 'color'), theme).toBe(led);
		expect(await style('.ds-grid .uni-unit .sp-key.on', 'color'), theme).toBe(led);
		expect(await style('.ds-grid .lk-key.on', 'color'), theme).toBe(led);
		expect(await style('.ds-steps .mute-dot', 'background-color'), theme).toBe(led);
		// The Melody Maker's key: filled in a deep shade of the LEDs' green, a white letter (PR 125;
		// PR 93's ring hardly showed on white), not the wash
		const key = '.ds-grid .mm-kb .kb-white.is-active';
		expect(await style(key, 'background-image'), theme).toContain('linear-gradient');
		expect(await style(key, 'background-image'), theme).not.toContain('radial-gradient');
		expect(await style(`${key} .wlabel`, 'color'), theme).toBe('rgb(255, 255, 255)');
		// The Waveforms card has the other cards' background
		expect(await style('.ds-grid .generators .pt-card', 'background-image'), theme)
			.toBe(await style('.ds-grid .fm-unit', 'background-image'));
		// Generate is one hue: its cap's two colours share the accent's hue
		const caps = await page.locator('.ds-grid .mm-gen-bar').evaluate((el) => {
			const cs = getComputedStyle(el);
			return [cs.getPropertyValue('--cap-hi'), cs.getPropertyValue('--cap-lo')];
		});
		const hue = (c: string) => c.match(/hsl\(\s*([\d.]+)/)?.[1] ?? c;
		expect(hue(caps[0]), theme).toBe(hue(caps[1]));
		// Captions on parts that are off (Noise, every pedal): dimmed, but readable
		for (const sel of ['.ds-grid .module.noise .knob-label', '.ds-grid .delay-pedal .knob-label', '.ds-grid .reverb-pedal .knob-label']) {
			const caption = page.locator(sel).first();
			await caption.scrollIntoViewIfNeeded();
			expect(await textContrast(page, caption), `${theme}: ${sel}`).toBeGreaterThanOrEqual(3);
		}
	}
});

test('the Pattern Tools, Sounds, Patterns and section captions are readable in every theme', async ({ page }) => {
	for (const theme of ['synthwave', 'dark', 'analog']) {
		await page.evaluate((t) => localStorage.setItem('ewave-studio2:ui-theme', t), theme);
		await page.reload();
		await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${theme}`));
		const captions = [
			...await page.locator('.pattern-tools .pt-section-title').all(),
			...await page.locator('.preset-box .pt-section-title').all(),
			...await page.locator('.ds-section-title').all(),
		];
		// Step Fills, Humanize, Move, Sounds, Patterns, Sound, Compose
		expect(captions).toHaveLength(7);
		for (const caption of captions) {
			const name = (await caption.textContent())!.trim();
			expect(await textContrast(page, caption), `${theme}: ${name}`).toBeGreaterThanOrEqual(4.5);
		}
	}
});

test('PR 79: the pedals and the screen\'s keys follow the theme, the pedals\' names readable; Dark has a dark page', async ({ page }) => {
	const looks: Record<string, string[]> = {};
	for (const theme of ['synthwave', 'dark', 'analog']) {
		await page.evaluate((t) => localStorage.setItem('ewave-studio2:ui-theme', t), theme);
		await page.reload();
		await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${theme}`));
		// Each pedal's name, and its knobs' captions while it's on (the overdrive switched on)
		await page.locator('.ds-grid .drive-pedal .footswitch').click();
		for (const pedal of ['delay', 'drive', 'reverb', 'tape']) {
			const name = page.locator(`.ds-grid .${pedal}-pedal .effect-label`);
			await name.scrollIntoViewIfNeeded();
			expect(await textContrast(page, name), `${theme}: ${pedal}'s name`).toBeGreaterThanOrEqual(4.5);
		}
		const drive = page.locator('.ds-grid .drive-pedal .drive .knob-label');
		expect(await textContrast(page, drive), `${theme}: DRIVE`).toBeGreaterThanOrEqual(4.5);
		looks[theme] = await page.evaluate(() => [
			getComputedStyle(document.querySelector('.ds-grid .delay-pedal .panel-top')!).backgroundImage,
			getComputedStyle(document.querySelector('.machine-rail .mr-screen')!).backgroundColor,
			getComputedStyle(document.querySelector('.sp-key:not(.on)')!).backgroundImage,
			getComputedStyle(document.body).backgroundImage,
		]);
	}
	// The delay pedal and the rail's screens differ in every theme (the pedals were the same in all);
	// the FM and Unison keys take the caps' colours (Synthwave's and Dark's differ)
	for (const i of [0, 1, 3]) expect(new Set(Object.values(looks).map((l) => l[i])).size, `part ${i}`).toBe(3);
	expect(looks.synthwave[2]).not.toBe(looks.dark[2]);
	// Dark's page is dark (it was Synthwave's pink wash): its brightest stop is near black
	const stops = [...looks.dark[3].matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)].map((m) => Math.max(+m[1], +m[2], +m[3]));
	expect(Math.max(...stops)).toBeLessThan(48);
});

test('PR 89: three themes; a browser that had Sand, Slate or Light saved opens in Synthwave', async ({ page }) => {
	await openSettings(page);
	const themes = page.getByRole('group', { name: 'Theme' }).getByRole('button');
	// Lightest to darkest since PR 92
	await expect(themes).toHaveText(['Synthwave', 'Analog', 'Dark']);
	for (const gone of ['sand', 'slate', 'light']) {
		await page.evaluate((t) => localStorage.setItem('ewave-studio2:ui-theme', t), gone);
		await page.reload();
		await expect(page.locator('html')).toHaveClass(/theme-synthwave/);
		await expect(page.locator('html')).not.toHaveClass(new RegExp(`theme-${gone}`));
		await openSettings(page);
		await expect(page.getByRole('button', { name: 'Synthwave', exact: true })).toHaveAttribute('aria-pressed', 'true');
	}
	// None of their rules is left in the built CSS
	const css = await page.evaluate(() => [...document.styleSheets].flatMap((sh) => {
		try { return [...sh.cssRules].map((r) => r.cssText); } catch { return []; }
	}).join('\n'));
	expect(css).not.toMatch(/theme-(sand|slate|light)\b/);
});

test('PR 92: Theme and MIDI in the top bar\'s gear; the logo links home; one volume knob', async ({ page }) => {
	// No row above the frame, no link under it: the logo is the link back to the main site
	await expect(page.locator('.app-toolbar')).toHaveCount(0);
	await expect(page.locator('a.return')).toHaveCount(0);
	const home = page.getByRole('link', { name: 'Ephemeral Wave: return to the main site' });
	await expect(home).toBeVisible();
	await expect(home).toHaveAttribute('href', '/');
	const frame = (await page.locator('.ds-topbar').boundingBox())!;
	expect(frame.y).toBeLessThan(40);

	// The gear, at the bar's right end, opens Theme and MIDI; a click outside or Esc closes it
	const gear = page.getByRole('button', { name: 'Settings', exact: true });
	const save = (await page.locator('.pc-primary').boundingBox())!;
	expect((await gear.boundingBox())!.x).toBeGreaterThan(save.x);
	const panel = page.getByRole('dialog', { name: 'Settings' });
	await expect(panel).toBeHidden();
	await gear.click();
	await expect(panel).toBeVisible();
	await expect(gear).toHaveAttribute('aria-expanded', 'true');
	await expect(panel.getByRole('button', { name: 'Enable MIDI' })).toBeVisible();
	// The link home is only for narrow windows, where the logo is hidden
	await expect(panel.getByRole('link', { name: 'Return to Ephemeral Wave' })).toBeHidden();
	await panel.getByRole('button', { name: 'Analog', exact: true }).click();
	await expect(page.locator('html')).toHaveClass(/theme-analog/);
	await expect(panel).toBeVisible(); // picking a theme leaves it open, to try another
	await page.mouse.click(5, 600);
	await expect(panel).toBeHidden();
	await gear.click();
	await page.keyboard.press('Escape');
	await expect(panel).toBeHidden();

	// One volume knob: no Vol on the Step Sequencer, and it isn't offered to MIDI learn
	await expect(page.getByRole('slider', { name: 'Synth volume' })).toHaveCount(0);
	await expect(page.getByRole('slider', { name: 'Volume', exact: true })).toBeVisible();

	// Every control in the panel can be clicked (nothing drawn over it)
	await gear.click();
	for (const b of await panel.getByRole('button').all()) await b.click({ trial: true });

	// Narrow: the logo is hidden and the panel has the link home, inside the window
	await page.setViewportSize({ width: 390, height: 800 });
	await expect(home).toBeHidden();
	const link = panel.getByRole('link', { name: 'Return to Ephemeral Wave' });
	await expect(link).toBeVisible();
	const box = (await panel.boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(390);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('PR 92: a MIDI controller chosen lights the gear; Learn closes the panel', async ({ page }) => {
	await page.addInitScript(() => {
		const input = { id: 'ctl', name: 'Test controller', state: 'connected', onmidimessage: null };
		const access = { inputs: new Map([['ctl', input]]), outputs: new Map(), onstatechange: null };
		(navigator as any).requestMIDIAccess = async () => access;
	});
	await page.reload();
	const gear = page.getByRole('button', { name: 'Settings', exact: true });
	await expect(gear.locator('.sm-dot')).toHaveCount(0);
	await openSettings(page);
	await page.getByRole('button', { name: 'Enable MIDI' }).click();
	await page.locator('#midi-input-select').selectOption('ctl');
	await expect(gear.locator('.sm-dot')).toHaveCount(1);
	await page.getByRole('button', { name: 'Learn', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
	await expect(page.getByRole('region', { name: 'MIDI learn' })).toBeVisible();
	await page.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByRole('region', { name: 'MIDI learn' })).toBeHidden();
});

test('Analog: its button applies its own colours, and is remembered', async ({ page }) => {
	for (const [name, page1, screen] of [['Analog', 'rgb(107, 75, 52)', '#1a1208']]) {
		const button = page.getByRole('button', { name, exact: true });
		await openSettings(page); // the theme buttons are in the top bar's gear (PR 92)
		await button.click();
		await expect(button).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${name.toLowerCase()}`));
		expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toContain(page1);
		expect(await page.locator('.machine-rail').evaluate((el) => getComputedStyle(el).getPropertyValue('--mr-lcd-bg').trim()))
			.toBe(screen);
		await page.reload();
		await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${name.toLowerCase()}`));
	}
});

// Hardware buttons (src/assets/styles/_hardware.scss): how far a cap sits down (its transform), its
// LED's colour (the ::before, or the tile caption's), and its size, which must never change
async function capState(cap: Locator, led = '') {
	return cap.evaluate((el, ledSel) => {
		const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
		const ledEl = ledSel ? el.querySelector(ledSel)! : el;
		return {
			down: m.m42,
			led: getComputedStyle(ledEl, '::before').backgroundColor,
			size: [(el as HTMLElement).offsetWidth, (el as HTMLElement).offsetHeight].join('x'),
		};
	}, led);
}

test('hardware buttons: a push button sinks and springs back; a chosen option and a toggle stay down, LED lit; no cap changes size', async ({ page }) => {
	const settle = () => page.waitForTimeout(200); // the caps' 50 ms travel
	const lit = await page.evaluate(() => {
		const probe = document.createElement('i');
		probe.style.color = 'var(--hw-led)';
		document.body.append(probe);
		const c = getComputedStyle(probe).color;
		probe.remove();
		return c;
	});

	// A push button: down only while the mouse holds it
	const push = page.locator('.pattern-tools').getByRole('button', { name: 'Every 2' });
	await push.scrollIntoViewIfNeeded();
	const up = await capState(push);
	expect(up.down).toBe(0);
	const box = (await push.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await settle();
	const held = await capState(push);
	expect(held.down).toBe(2);
	expect(held.size).toBe(up.size);
	await page.mouse.up();
	await settle();
	expect((await capState(push)).down).toBe(0);

	// A switch: the chosen option is down with its LED lit, the other up and dark
	const melody = page.getByRole('button', { name: 'Melody', exact: true });
	const arp = page.getByRole('button', { name: 'Arpeggio', exact: true });
	const before = { melody: await capState(melody), arp: await capState(arp) };
	expect(before.melody).toMatchObject({ down: 2, led: lit });
	expect(before.arp.down).toBe(0);
	expect(before.arp.led).not.toBe(lit);
	await arp.click();
	await page.mouse.move(0, 0);
	await settle();
	expect(await capState(arp)).toMatchObject({ down: 2, led: lit, size: before.arp.size });
	expect(await capState(melody)).toMatchObject({ down: 0, led: before.arp.led, size: before.melody.size });

	// A toggle (Filter's VEL switch, a small cap): down and lit while on
	const vel = page.getByRole('switch', { name: 'Velocity shapes Cutoff' });
	const velOff = await capState(vel);
	expect(velOff.down).toBe(0);
	await vel.click();
	await page.mouse.move(0, 0);
	await settle();
	expect(await capState(vel)).toMatchObject({ down: 1, led: lit, size: velOff.size });
	await vel.click();
	await page.mouse.move(0, 0);
	await settle();
	expect(await capState(vel)).toMatchObject({ down: 0, led: velOff.led });

	// FM's switch is a ribbon since PR 77 (as Noise's and the LFO's), not a cap: its LED lights
	const fm = page.getByRole('switch', { name: 'FM' });
	const ribbonLed = () => fm.locator('.sp-ribbon-led').evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(await ribbonLed()).not.toBe(lit);
	await fm.click();
	await expect(fm).toHaveAttribute('aria-checked', 'true');
	expect(await ribbonLed()).toBe(lit);

	// The chosen wave is down; its dice is still there. Play stays down while playing.
	const saw = page.getByRole('radio', { name: 'Saw' }).first();
	await saw.click();
	await page.mouse.move(0, 0);
	await settle();
	expect((await capState(saw)).down).toBe(2);
	expect((await capState(page.getByRole('radio', { name: 'Sine' }).first())).down).toBe(0);
	await expect(saw.locator('.dice-badge')).toBeVisible();
	const play = page.locator('.ds-transport .btn3d');
	expect((await capState(play)).down).toBe(0);
	await play.click();
	await page.mouse.move(0, 0);
	await settle();
	expect((await capState(play)).down).toBe(4);
	await play.click();

	// The pedals' CRUSH, PING PONG, REV and PHONE switches are not caps (they stay as they were)
	await expect(page.locator('.pedal-switch')).toHaveCount(4);
	await expect(page.locator('.pedal-switch.hw-cap')).toHaveCount(0);
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
	await expect(lit).toHaveText(['Breaks']);
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
	// The same rolls every run: the dice's Math.random is seeded (mulberry32) for each click, so
	// a rare quiet roll can't fail an unrelated PR (an unseeded run once peaked at 0.039). Unit
	// tests check the recipe over 500 rolls (presets.test.ts). Seeds 171 and 761 were the
	// quietest of 800 rolls (171 peaked at 0.042 before its sweep was limited, 0.093 since;
	// 761: 0.053), 739 the loudest (0.56); the others are the first few
	for (const seed of [171, 761, 739, 1, 2, 3, 4, 5]) {
		await page.evaluate((s) => {
			const w = window as any;
			w.__realRandom ??= Math.random;
			let a = s >>> 0;
			Math.random = () => {
				a = (a + 0x6D2B79F5) >>> 0;
				let t = a;
				t = Math.imul(t ^ (t >>> 15), t | 1);
				t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};
		}, seed);
		await dice.click();
		await page.evaluate(() => { Math.random = (window as any).__realRandom; });
		const peak = wavPeak(await exportWav(page));
		expect(peak, `seed ${seed}`).toBeGreaterThan(0.04);
		expect(peak, `seed ${seed}`).toBeLessThan(0.9);
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
	await page.getByRole('button', { name: "Reset Rhythm's pads" }).click();
	await expect(page.locator('.ratchet-badge')).toHaveCount(0);
});

test("the Repeats brush shows it's picked (a frame, a tag, its own cursor), and a click elsewhere puts it down", async ({ page }) => {
	const x3 = page.getByRole('button', { name: 'Repeats brush ×3' });
	const x2 = page.getByRole('button', { name: 'Repeats brush ×2' });
	const frame = page.locator('.step-card__grid');
	const stepCard = page.locator('.step-card');
	const cursor = () => pads(page).nth(0).evaluate((el) => decodeURIComponent(getComputedStyle(el).cursor));
	const frameBox = await frame.boundingBox(), cardBox = await stepCard.boundingBox();
	expect(await cursor()).toBe('pointer');

	// Picked: a dashed frame round the pads with a tag on it, and a cursor that carries the
	// count, none of which moves anything
	await x3.click();
	await expect(frame).toHaveClass(/is-brushing/);
	await expect(frame.getByRole('status')).toHaveText('Painting ×3 repeats · Esc or click elsewhere to finish');
	expect(await frame.evaluate((el) => getComputedStyle(el, '::after').borderTopStyle)).toBe('dashed');
	expect(await cursor()).toMatch(/^url\(.*×3.*\) 3 2, copy$/);
	expect(await frame.boundingBox()).toEqual(frameBox);
	expect(await stepCard.boundingBox()).toEqual(cardBox);

	// It stays picked from pad to pad (every other pad is one click each), and through what
	// goes with painting: Play / Stop to hear it, Undo / Redo to take a stroke back
	await page.waitForTimeout(SETTLED);
	for (const i of [0, 2, 4]) await pads(page).nth(i).click();
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(pads(page).nth(4)).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(x3).toHaveAttribute('aria-pressed', 'true');
	for (const i of [0, 2, 4]) await expect(pads(page).nth(i)).toHaveAttribute('aria-pressed', 'true');

	// Another count: the cursor follows
	await x2.click();
	expect(await cursor()).toContain('×2');
	await expect(frame.getByRole('status')).toContainText('Painting ×2 repeats');

	// A click elsewhere puts the brush down, and still does its own job (here: Noise on)
	const noise = page.getByRole('button', { name: 'Toggle noise' });
	await noise.click();
	await expect(noise).toHaveAttribute('aria-pressed', 'true');
	await expect(x2).toHaveAttribute('aria-pressed', 'false');
	await expect(frame).not.toHaveClass(/is-brushing/);
	await expect(frame.getByRole('status')).toHaveCount(0);
	expect(await cursor()).toBe('pointer');

	// So the next click on a pad turns it off, as without the brush
	await pads(page).nth(0).click();
	await expect(pads(page).nth(0)).toHaveAttribute('aria-pressed', 'false');
});

// The pads (PR 127, the plan's item 9): a drag up or down for velocity, sideways to paint
test('the pads: a lit pad dragged up or down sets its velocity, a sideways drag paints, arrows too; no sliders, no ⋯ menu, Reset in the header', async ({ page }) => {
	const lane = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data
		.instruments.find((l: any) => l.name === 'synth-voice');
	const centre = async (i: number) => { const b = (await pads(page).nth(i).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
	await expect(page.locator('.step-card .pt-info-icon')).toHaveCount(0);
	await expect(page.getByRole('menuitem', { name: 'Individual Pad Sliders' })).toHaveCount(0);

	// A click turns a pad on; a drag down on it makes it softer (a readout while dragging), and leaves it on
	await pads(page).nth(4).click();
	await expect(pads(page).nth(4)).toHaveAttribute('aria-pressed', 'true');
	await page.waitForTimeout(SETTLED);
	const p = await centre(4);
	await page.mouse.move(p.x, p.y);
	await page.mouse.down();
	await page.mouse.move(p.x, p.y + 20, { steps: 5 });
	await expect(page.locator('.vel-readout')).toHaveText('75%');
	await page.mouse.move(p.x, p.y + 40, { steps: 5 });
	await expect(page.locator('.vel-readout')).toHaveText('50%');
	await page.mouse.up();
	await expect(page.locator('.vel-readout')).toHaveCount(0);
	await expect(pads(page).nth(4)).toHaveAttribute('aria-pressed', 'true');
	expect((await lane()).velocities[4]).toBe(0.5);
	await expect(page.locator('.hover-slider')).toHaveCount(0);
	// One undo step for the drag
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await lane()).velocities[4]).toBe(1);

	// A drag up on a pad that's off paints instead (it can't have a velocity): sideways too
	const a = await centre(0), b = await centre(3);
	await page.mouse.move(a.x, a.y);
	await page.mouse.down();
	await page.mouse.move(b.x, b.y, { steps: 12 });
	await page.mouse.up();
	expect((await lane()).steps.slice(0, 6)).toEqual([true, true, true, true, true, false]);
	// ...and off again, from a lit pad
	await page.mouse.move(b.x, b.y);
	await page.mouse.down();
	await page.mouse.move(a.x, a.y, { steps: 12 });
	await page.mouse.up();
	expect((await lane()).steps.slice(0, 6)).toEqual([false, false, false, false, true, false]);

	// Arrows on the focused lit pad: 5 % a press, Shift 25 %
	await pads(page).nth(4).focus();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Shift+ArrowDown');
	expect((await lane()).velocities[4]).toBe(0.7);
	await pads(page).nth(4).focus(); // the File menu took it
	await page.keyboard.press('ArrowUp');
	expect((await lane()).velocities[4]).toBe(0.75);

	// Reset in the header: the machine shown's pads, one undo step
	await page.getByRole('button', { name: "Reset Rhythm's pads" }).click();
	expect((await lane()).steps.every((x: boolean) => !x)).toBe(true);
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await lane()).steps[4]).toBe(true);
	await page.getByRole('button', { name: 'Show Bass' }).click();
	await expect(page.getByRole('button', { name: "Reset Bass's pads" })).toBeVisible();
	await page.getByRole('button', { name: 'Show Drums' }).click();
	await expect(page.getByRole('button', { name: "Reset Drums's pads" })).toBeVisible();

	// Drums: a sideways drag paints the row it started in
	const step = (row: string, i: number) => page.getByRole('button', { name: `${row}, step ${i}`, exact: true });
	const s1 = (await step('Snare', 2).boundingBox())!, s2 = (await step('Snare', 6).boundingBox())!;
	await page.mouse.move(s1.x + s1.width / 2, s1.y + s1.height / 2);
	await page.mouse.down();
	await page.mouse.move(s2.x + s2.width / 2, s2.y + s2.height / 2 + 30, { steps: 12 }); // drifting into the row under it
	await page.mouse.up();
	for (const i of [2, 3, 4, 5, 6]) await expect(step('Snare', i)).toHaveAttribute('aria-pressed', 'true');
	for (const i of [1, 7]) await expect(step('Snare', i)).toHaveAttribute('aria-pressed', 'false');
	for (const i of [2, 6]) await expect(step('Metal', i)).toHaveAttribute('aria-pressed', 'false');
	// Arrows set a lit step's velocity
	await step('Snare', 3).focus();
	await page.keyboard.press('Shift+ArrowDown');
	await expect(step('Snare', 3)).toHaveAttribute('title', /75%/);
	await page.getByRole('button', { name: "Reset Drums's pads" }).click();
	await expect(step('Snare', 3)).toHaveAttribute('aria-pressed', 'false');
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

	// A pad that has the brush's hits already goes back to one, and stays on (the File menu's
	// clicks above put the brush down, as any click elsewhere does since PR 74: pick it again)
	await expect(x3).toHaveAttribute('aria-pressed', 'false');
	await x3.click();
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

	// The ×1 brush (Clear Repeats until PR 127): every pad it crosses back to one hit
	await page.getByRole('button', { name: 'Repeats brush ×1' }).click();
	await expect(page.locator('.step-card__grid').getByRole('status')).toContainText('Clearing repeats');
	const first = (await pads(page).nth(0).boundingBox())!, last = (await pads(page).nth(15).boundingBox())!;
	await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
	await page.mouse.down();
	await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 30 });
	await page.mouse.up();
	await page.mouse.move(5, 5);
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

test('the wave tiles light the wave every pad plays; the Random tile never stays down, and shows the mix', async ({ page }) => {
	const tile = (name: string) => page.getByRole('radio', { name, exact: true });
	const random = page.getByRole('button', { name: /^Random waves/ });
	const lit = page.locator('.wave-row [role="radio"][aria-checked="true"]');
	const bars = random.locator('.rw-mix i');
	await expect(tile('SINE')).toHaveAttribute('aria-checked', 'true');
	await expect(random).not.toHaveAttribute('aria-pressed');
	await expect(bars).toHaveCount(0);

	// The tile is a narrow ninth column, as tall as the two rows of waves (PR 83)
	const r = (await random.boundingBox())!, sine = (await tile('SINE').boundingBox())!, glass = (await tile('GLASS').boundingBox())!;
	expect(r.x).toBeGreaterThan(glass.x + glass.width);
	expect(r.width).toBeLessThan(sine.width);
	expect(r.height).toBeGreaterThan(glass.y + glass.height - sine.y - 4);

	// Saw, then Random: no tile stays lit (the pads play a mix), and the tile shows it
	await tile('SAW').click();
	await expect(tile('SAW')).toHaveAttribute('aria-checked', 'true');
	// Random from all eight waves (a seeded roll, so it is surely a mix)
	await page.evaluate(() => { let x = 7; Math.random = () => ((x = (x * 16807) % 2147483647) / 2147483647); });
	await random.click();
	await expect(lit).toHaveCount(0);
	await expect(random).toHaveAccessibleName(/roll again/);
	await expect(bars).toHaveCount(16);
	await expect(random.locator('.rw-dice')).toHaveClass(/tumble/);
	// PR 85: it hops and tumbles, its face changing, and lands on another face, the same size
	await expect(random.locator('.rw-dice')).not.toHaveClass(/tumble/);
	const pips = random.locator('.rw-dice circle');
	const landed = await pips.count();
	expect(landed).not.toBe(5);
	expect((await random.locator('.rw-dice').boundingBox())!.width).toBeCloseTo(26, 0);
	// Each bar in its pad's wave's colour: more than one colour
	const colours = new Set(await bars.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor)));
	expect(colours.size).toBeGreaterThan(1);

	// A tile again: every pad plays it, it lights, and the mix is gone
	await tile('SQUARE').click();
	await expect(lit).toHaveCount(1);
	await expect(tile('SQUARE')).toHaveAttribute('aria-checked', 'true');
	await expect(bars).toHaveCount(0);

	// One pad's wave changed in its ⋮ menu: a mix too
	await page.locator('.pad-settings-dot').nth(3).click();
	await page.locator('.pad-popover').getByRole('button', { name: 'Glass', exact: true }).click();
	await page.keyboard.press('Escape');
	await expect(lit).toHaveCount(0);
	await expect(bars).toHaveCount(16);
});

test('PR 85: the waves Random picks from are saved with the project; File → New and a sound preset pick all again', async ({ page }) => {
	const badge = (wave: string) => page.locator(`.ds-grid .wave-row .dice-badge[aria-label$="${wave} from Random"]`);
	const included = async () => page.locator('.ds-grid .wave-row .dice-badge[aria-checked="true"]').count();
	await expect.poll(included).toBe(8);
	await badge('GLASS').click();
	await badge('ORGAN').click();
	await expect.poll(included).toBe(6);
	await expect(page.getByRole('button', { name: /^Random waves/ })).toHaveAttribute('title', /Random from: Sine, Triangle, Saw, Square, Pulse, Hollow$/);

	// Saved with the project, and back when it's opened
	const exported = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	expect(exported.data.synth.randomWaves).toEqual(['sine', 'triangle', 'sawtooth', 'square', 'pulse', 'hollow', 'sample']);

	// File → New: every wave again (it carried over before)
	await chooseFromFileMenu(page, 'New');
	await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
	await expect.poll(included).toBe(8);

	// Opening the project brings its own back
	exported.projectId = 'pool-test';
	exported.meta = { ...exported.meta, name: 'pool-test' };
	exported.data.meta = { ...exported.data.meta, name: 'pool-test' };
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'pool-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)),
	});
	await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('pool-test');
	await expect.poll(included).toBe(6);

	// A sound preset sets the whole sound: every wave again
	await page.getByRole('button', { name: 'Kick', exact: true }).click();
	await expect.poll(included).toBe(8);
});

test("the LFO's wave is two keys with the wave drawn on them, the chosen one lit", async ({ page }) => {
	const keys = page.getByRole('radiogroup', { name: 'LFO Waveform' }).first();
	const sine = keys.getByRole('radio', { name: 'Sine', exact: true });
	const square = keys.getByRole('radio', { name: 'Square', exact: true });
	const ribbon = page.getByRole('switch', { name: /LFO/ }).first();
	if ((await ribbon.getAttribute('aria-checked')) !== 'true') await ribbon.click();
	await expect(sine).toHaveAttribute('aria-checked', 'true');
	await expect(sine.locator('svg path')).toHaveCount(1);
	const bg = (el) => el.evaluate((e) => getComputedStyle(e).backgroundImage);
	const before = { sine: await bg(sine), square: await bg(square) };
	expect(before.sine).not.toBe(before.square);
	await square.click();
	await expect(square).toHaveAttribute('aria-checked', 'true');
	await expect(sine).toHaveAttribute('aria-checked', 'false');
	expect(await bg(square)).toBe(before.sine);
	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.synth.lfo;
	expect(saved.waveform).toBe('square');
});

test("a pad's noise reads Off while the Noise card is off; turning it on turns the card on for that pad only", async ({ page }) => {
	const dot = (i: number) => page.locator('.pad-settings-dot').nth(i);
	const popover = page.locator('.pad-popover');
	const padNoise = popover.locator('.noise-toggle-wrap .pt-dot');
	const card = page.getByRole('button', { name: 'Toggle noise' });
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	await expect(card).toHaveAttribute('aria-pressed', 'false');
	await page.waitForTimeout(600); // past the page's first moments, the undo history's start

	// The card is off: the pad says Off, and why
	await dot(2).click();
	await expect(padNoise).toHaveAttribute('aria-pressed', 'false');
	await expect(popover).toContainText('Noise card is off');

	// On from the pad: the card goes on, with this pad's noise only
	await padNoise.click();
	await expect(card).toHaveAttribute('aria-pressed', 'true');
	await expect(padNoise).toHaveAttribute('aria-pressed', 'true');
	await expect(popover).not.toContainText('Noise card is off');
	await page.keyboard.press('Escape');
	await dot(0).click();
	await expect(padNoise).toHaveAttribute('aria-pressed', 'false');
	await page.keyboard.press('Escape');

	// One undo step back: the card off, every pad's own switch as before
	await page.waitForTimeout(600);
	await undo.click();
	await expect(card).toHaveAttribute('aria-pressed', 'false');
	await card.click();
	await dot(0).click();
	await expect(padNoise).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Escape');

	// The card off: pad 1 reads Off; on again, it still has its noise (the card doesn't
	// change a pad's own switch)
	await card.click();
	await dot(0).click();
	await expect(padNoise).toHaveAttribute('aria-pressed', 'false');
	await page.keyboard.press('Escape');
	await card.click();
	await dot(0).click();
	await expect(padNoise).toHaveAttribute('aria-pressed', 'true');
});

test("a pad's settings: a key previews the pad as it plays (its noise, its repeats), only while stopped; Play keeps them open", async ({ page }) => {
	const popover = page.locator('.pad-popover');
	// Sources started for notes (the LFO's oscillator starts at 0, "now": not a note). A buffer
	// source (the noise) has a start() of its own, which the init script doesn't see: noted here
	await page.evaluate(() => {
		const w = window as any;
		const orig = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, when = 0, ...rest: any[]) {
			w.__starts.push({ osc: false, when, now: this.context.currentTime });
			return (orig as any).call(this, when, ...rest);
		};
	});
	const starts = () => page.evaluate(() => ((window as any).__starts as { osc: boolean; when: number }[]).filter((s) => s.when > 0));
	const clear = () => page.evaluate(() => { (window as any).__starts.length = 0; });
	// The noise layer on (every pad may add it, until its own switch says no)
	await page.getByRole('button', { name: 'Toggle noise' }).click();
	await expect(page.getByRole('button', { name: 'Toggle noise' })).toHaveAttribute('aria-pressed', 'true');

	await page.locator('.pad-settings-dot').nth(4).click();
	await expect(popover).toContainText('Pad 5');

	// Three repeats: a key plays three hits (one oscillator each), with noise
	await popover.getByRole('button', { name: '×3', exact: true }).click();
	await clear();
	await popover.getByRole('button', { name: 'E', exact: true }).click();
	await expect.poll(async () => new Set((await starts()).filter((s) => s.osc).map((s) => s.when.toFixed(4))).size).toBe(3);
	expect((await starts()).filter((s) => !s.osc).length).toBeGreaterThan(0);

	// The pad's noise off: the preview has none
	await popover.locator('.noise-toggle-wrap .pt-dot').click();
	await page.waitForTimeout(300);
	await clear();
	await popover.getByRole('button', { name: 'G', exact: true }).click();
	await expect.poll(async () => (await starts()).filter((s) => s.osc).length).toBe(3);
	expect((await starts()).filter((s) => !s.osc).length).toBe(0);

	// Play / Stop leave the settings open; while playing, a key sets the note without a preview
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(popover).toContainText('Pad 5');
	await page.waitForTimeout(300);
	const before = (await starts()).length;
	const at = await page.evaluate(() => (window as any).__ctx.currentTime as number);
	await popover.getByRole('button', { name: 'A', exact: true }).click();
	await page.waitForTimeout(150);
	// Notes since the click are the pattern's own (pad 5 is off, nothing else on): none start now
	const near = (await starts()).slice(before).filter((s) => s.osc && Math.abs(s.when - at) < 0.1);
	expect(near).toEqual([]);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await expect(popover).toContainText('Pad 5');
	// Anywhere else still closes them
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await expect(popover).toHaveCount(0);
});

test("a pad's repeats can step up or down the key's chord, live, saved and in the MIDI file", async ({ page }) => {
	await turnOnPads(page, [0]);
	const popover = page.locator('.pad-popover');
	await page.locator('.pad-settings-dot').first().click();
	const notes = popover.getByRole('group', { name: 'Repeat notes' });
	// Only with two or more hits
	await expect(notes.getByRole('button', { name: 'Up ↑' })).toBeDisabled();
	await popover.getByRole('button', { name: '×4', exact: true }).click();
	await notes.getByRole('button', { name: 'Up ↑' }).click();
	await expect(notes.getByRole('button', { name: 'Up ↑' })).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Escape');
	await expect(page.locator('.pad-row .ratchet-badge').first()).toHaveText('×4↑');
	await expect(pads(page).first()).toHaveAccessibleName('Step 1, A3, 4 hits up the chord');

	// Live: each hit's oscillator starts on the next note of the chord (A minor, the starting
	// key and scale: A C E), from the pad's A3
	await page.evaluate(() => {
		const w = window as any;
		w.__oscFreqs = [];
		// The engine schedules the frequency (setValueAtTime, pitchEnv.ts): note what each
		// parameter was set to, and read it when its oscillator starts
		const set = new WeakMap<AudioParam, number>();
		const origSet = AudioParam.prototype.setValueAtTime;
		AudioParam.prototype.setValueAtTime = function (this: AudioParam, v: number, t: number) {
			set.set(this, v);
			return origSet.call(this, v, t);
		};
		const orig = OscillatorNode.prototype.start;
		const ctxIds = new WeakMap<BaseAudioContext, number>();
		let nextCtx = 0;
		OscillatorNode.prototype.start = function (this: OscillatorNode, when = 0, ...rest: any[]) {
			// Notes only: the LFO's oscillator runs below 20 Hz
			const hz = set.get(this.frequency) ?? this.frequency.value;
			if (!ctxIds.has(this.context)) ctxIds.set(this.context, nextCtx++);
			if (hz >= 90) w.__oscFreqs.push({ when, hz, live: this.context instanceof AudioContext, ctx: ctxIds.get(this.context) });
			return (orig as any).call(this, when, ...rest);
		};
	});
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(() => page.evaluate(() => (window as any).__oscFreqs.filter((h: any) => h.live).length)).toBeGreaterThanOrEqual(4);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	// (live notes only: the hit behind the Envelope card renders offline, PR 108)
	const hits = await page.evaluate(() => ((window as any).__oscFreqs as { when: number; hz: number; live: boolean }[])
		.filter((h) => h.live).sort((a, b) => a.when - b.when).slice(0, 4).map((h) => Math.round(69 + 12 * Math.log2(h.hz / 440))));
	expect(hits).toEqual([57, 60, 64, 69]);

	// The WAV export's engine plays them too (its oscillators start in an offline context)
	await page.evaluate(() => { (window as any).__oscFreqs = []; });
	await exportWav(page);
	// (the export's own render only: the hit behind the Envelope card renders offline too, PR 108,
	// and can render while the export does: the render with the most notes is the export's)
	const exported = await page.evaluate(() => {
		const all = ((window as any).__oscFreqs as { when: number; hz: number; ctx: number }[]);
		const counts = new Map<number, number>();
		for (const h of all) counts.set(h.ctx, (counts.get(h.ctx) ?? 0) + 1);
		const ctx = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
		return all.filter((h) => h.ctx === ctx).sort((a, b) => a.when - b.when).slice(0, 4).map((h) => Math.round(69 + 12 * Math.log2(h.hz / 440)));
	});
	expect(exported).toEqual([57, 60, 64, 69]);

	// Saved with the project
	const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	expect(project.instruments.find((i: any) => i.name === 'synth-voice').repeatNotes[0]).toBe('up');

	// The MIDI file has the four notes
	const midi = (await exportAudio(page, { mix: false, stems: false, midi: true, oneShot: false })).bytes;
	const ons: number[] = [];
	let at = 22;
	const vlq = () => { let n = 0, b; do { b = midi[at++]; n = (n << 7) | (b & 0x7f); } while (b & 0x80); return n; };
	while (at < midi.length) {
		vlq();
		const status = midi[at++];
		if (status === 0xff) { at++; const len = vlq(); at += len; }
		else { if ((status & 0xf0) === 0x90) ons.push(midi[at]); at += 2; }
	}
	expect(ons).toEqual([57, 60, 64, 69]);

	// A pattern sets its own repeats, playing the pad's note
	await patternsBox(page).getByRole('button', { name: 'Rolls', exact: true }).click();
	await expect(page.locator('.ratchet-badge', { hasText: /[↑↓]/ })).toHaveCount(0);
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
	expect(loop.name).toBe('Loop Test_80bpm_Amin_2bars_mix.wav');
	const l = wavSamples(loop.bytes);
	expect(l.frames).toBe(Math.round(2 * 4 * (60 / 80) * l.rate));
	expect(wavWindow(loop.bytes, 0, 2).peak).toBeGreaterThan(0.02);
	expect(wavWindow(loop.bytes, 0, 6).peak).toBeCloseTo(0.891, 2); // −1 dBFS

	// With the tail: a clean start, and the echoes ring on past the 2 bars
	const tail = await exportAudio(page, { ending: 'With tail' });
	expect(tail.name).toBe('Loop Test_80bpm_Amin_2bars-tail_mix.wav');
	const t = wavSamples(tail.bytes);
	expect(t.frames).toBeGreaterThan(l.frames);
	expect(wavWindow(tail.bytes, 0, 2).peak).toBe(0);
	expect(wavWindow(tail.bytes, 6, 6.5).rms).toBeGreaterThan(0.001);
});

// The output limiter (PR 114, src/audio/limiter.ts): brown noise at full Amount peaks at about
// 2.5 times full scale, straight to the output; live and exported it stays under −1 dBFS, and
// the stems still add up to the mix
test('the output limiter keeps a loud sound under −1 dBFS, live and exported, and the stems still add up', async ({ page }) => {
	await turnOnPads(page, [0, 4, 8, 12]);
	const project = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	const d = project.data;
	d.transport.volume = 1;
	// White noise: every hit starts its noise buffer at the beginning, and each export (and the
	// live engine) draws a new buffer, so brown noise's opening, which wanders slowly, was loud
	// enough to reach the ceiling only now and then (the mix's peak 0.52–0.89 over 15 runs, on
	// main too); white is near full scale within its first samples, so it reaches it every time
	Object.assign(d.synth.noise, { enabled: true, amount: 1, color: 0.5 });
	d.instruments.find((l: any) => l.type === 'synth').channelVolume = 1;
	await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
		name: 'loud.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
	});
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(4);

	const zip = await exportAudio(page, { bars: 1, ending: 'With tail', mix: true, stems: true, midi: false, oneShot: true, normalize: false });
	const files = unzip(zip.bytes);
	const file = (part: string) => files[Object.keys(files).find((n) => n.endsWith(`_${part}.wav`))!];
	expect(Object.keys(files).some((n) => n.endsWith('_noise.wav'))).toBe(true);
	for (const ch of [0, 1]) {
		const mix = wavSamples(file('mix'), ch).samples;
		const stems = ['dry', 'noise'].map((p) => wavSamples(file(p), ch).samples);
		let worst = 0, loudest = 0;
		for (let i = 0; i < mix.length; i++) {
			worst = Math.max(worst, Math.abs(stems[0][i] + stems[1][i] - mix[i]));
			loudest = Math.max(loudest, Math.abs(mix[i]));
		}
		expect(worst, `channel ${ch}`).toBeLessThan(1e-4);
		expect(loudest, `channel ${ch}`).toBeLessThanOrEqual(0.8915);
		expect(loudest, `channel ${ch}: limited, not just quiet`).toBeGreaterThan(0.85);
	}
	const shot = Object.keys(files).find((n) => n.includes('_oneshot_'))!;
	expect(wavPeak(files[shot])).toBeLessThanOrEqual(0.8915);

	// Live: what reaches the speakers stays under the ceiling too
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const live = await page.evaluate(() => (window as any).__peakOver(1500) as Promise<number>);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	expect(live).toBeGreaterThan(0.8);
	expect(live).toBeLessThanOrEqual(0.8915);
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
	expect(zip.name).toBe('Stems_80bpm_Amin_1bar.zip');
	const files = unzip(zip.bytes);
	expect(Object.keys(files).sort()).toEqual([
		'Stems_80bpm_Amin_1bar.mid',
		'Stems_80bpm_Amin_1bar_delay.wav', 'Stems_80bpm_Amin_1bar_dry.wav', 'Stems_80bpm_Amin_1bar_mix.wav',
		'Stems_80bpm_Amin_1bar_noise.wav', 'Stems_80bpm_Amin_1bar_reverb.wav',
		'Stems_oneshot_A2.wav',
	]);

	// The stems add up to the mix, sample for sample, in both channels
	for (const ch of [0, 1]) {
		const mix = wavSamples(files['Stems_80bpm_Amin_1bar_mix.wav'], ch).samples;
		const stems = ['dry', 'delay', 'reverb', 'noise'].map((p) => wavSamples(files[`Stems_80bpm_Amin_1bar_${p}.wav`], ch).samples);
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
	const midi = files['Stems_80bpm_Amin_1bar.mid'];
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
	await openSettings(page);
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
	// Learn closes the gear's panel (PR 92), so the knobs under it can be clicked
	await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
	await openSettings(page);
	await expect(learn).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.knob-wrapper.midi-learnable')).toHaveCount(67); // Bass's eight since PR 115, the rail's Pedals since PR 116, Drums' 14 since PR 119, Drift's 9 since PR 122, less the reverb's PRE since PR 126
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
	// The card's screen reads the value (PR 77; a tooltip over the knob before)
	await expect(page.locator('.module.filter .sp-title small')).toContainText('100 Hz');
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
	await openSettings(page);
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
	await openSettings(page);
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

// The Melody Maker's choices (PR 76: no dropdowns). Scale, Arp pattern and Arp tones are
// steppers whose name opens a list (chooseOption, below, as it did for the dropdowns); the
// arpeggio's Rate is a switch
const arpRate = (page: Page, rate: string) => page.getByRole('radiogroup', { name: 'Arp rate' }).getByRole('radio', { name: rate, exact: true });
async function chooseRate(page: Page, rate: string) {
	await arpRate(page, rate).click();
}

async function chooseOption(page: Page, select: string, option: string) {
	await page.getByRole('button', { name: new RegExp(`^${select}:`) }).click(); // "Scale: Minor"
	// The chosen one reads "● Minor"
	await page.getByRole('option', { name: new RegExp(`^(● )?${option}$`) }).click();
}

test("Melody Maker: no ⋯ menu and no Active Pads Only; Skip (Arpeggio) is a toggle on the card, saved", async ({ page }) => {
	const card = page.locator('.module.melody');
	await expect(card.getByRole('button', { name: 'Advanced options' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Active Pads Only' })).toHaveCount(0); // PR 98
	const skip = card.getByRole('button', { name: 'Skip', exact: true });
	const height = (await card.boundingBox())!.height;

	// Arpeggio shows its toggle; the card keeps its height in both modes
	await expect(skip).toBeHidden();
	await card.getByRole('button', { name: 'Arpeggio', exact: true }).click();
	await expect(skip).toBeVisible();
	await expect(skip).toHaveAttribute('aria-pressed', 'false');
	expect((await card.boundingBox())!.height).toBe(height);

	// Saved with the project, and File → New puts it back
	await skip.click();
	await card.getByRole('button', { name: 'Melody', exact: true }).click();
	expect((await card.boundingBox())!.height).toBe(height);
	const saved = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.melody;
	expect(await saved()).toMatchObject({ arpSkip: true });
	await chooseFromFileMenu(page, 'New');
	await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
	expect(await saved()).toMatchObject({ arpSkip: false });
	expect(await saved()).not.toHaveProperty('activeOnly');
});

test('Melody Maker: Generate gives new notes to the pads that are on; with none on, all 16, turned on (PR 98)', async ({ page }) => {
	const card = page.locator('.module.melody');
	const generate = card.getByRole('button', { name: 'Generate melody' });
	const lane = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'))
		.data.instruments.find((i: any) => i.name === 'synth-voice') as { steps: boolean[]; pitches: number[] };

	// None on: every pad gets a note and is turned on, one undo step
	const empty = await lane();
	expect(empty.steps.some(Boolean)).toBe(false);
	await page.waitForTimeout(600); // let the undo history note the starting pattern
	await generate.click();
	let after = await lane();
	expect(after.steps).toEqual(Array(16).fill(true));
	await page.waitForTimeout(600);
	await page.keyboard.press('Control+z');
	await expect.poll(async () => (await lane()).steps.some(Boolean)).toBe(false);

	// Some on: only those get new notes; the pads that are off stay off, on their notes
	await turnOnPads(page, [0, 5]);
	const before = await lane();
	// Generate until pad 6 has another note: a melody's note is random, and pad 6 can land back
	// on its own (A, about 1 in 15). Seeding Math.random didn't help: the page draws random
	// numbers of its own between the seed and the click, more or fewer on a busier machine.
	const pad6 = page.locator('.pad-row').getByRole('button', { name: /^Step 6, / });
	const startName = await pad6.getAttribute('aria-label');
	for (let k = 0; k < 20 && (await pad6.getAttribute('aria-label')) === startName; k++) await generate.click();
	after = await lane();
	expect(after.steps).toEqual(before.steps);
	after.pitches.forEach((hz, i) => {
		if (i !== 0 && i !== 5) expect(hz, `pad ${i + 1}`).toBeCloseTo(before.pitches[i], 3);
	});
	expect(after.pitches[5]).not.toBeCloseTo(before.pitches[5], 3);
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

test('while playing, a key waits for the next bar (a ghost and a caption), a pattern does not; Shift+click is at once, Stop applies it, Undo drops it', async ({ page }) => {
	// Pad 1 only: a note at each bar's start (120 BPM: a step is 0.125 s, a bar 2 s)
	await turnOnPads(page, [0]);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	// The first bar's step 1 (an oscillator started "now", at 0, isn't a note)
	await expect.poll(() => page.evaluate(() => (window as any).__starts.some((s: any) => s.osc && s.when > 0))).toBe(true);
	const t0 = await page.evaluate(() => (window as any).__starts.find((s: any) => s.osc && s.when > 0).when as number);
	const BAR = 2, STEP = 0.125;
	const ctxTime = () => page.evaluate(() => (window as any).__ctx.currentTime as number);
	// Waits (in the page, every few ms) until pad 1's label or the lit pattern changes; the time then
	const changeTime = () => page.evaluate(() => new Promise<number>((resolve) => {
		const read = () => document.querySelector('.pad-row .padTEST')!.getAttribute('aria-label') + '|' +
			[...document.querySelectorAll('.preset-grid .pt-btn[aria-pressed="true"]')].map((b) => b.textContent).join();
		const was = read();
		const id = setInterval(() => {
			if (read() !== was) { clearInterval(id); resolve((window as any).__ctx.currentTime); }
		}, 3);
	}));
	// The next bar's start after the context time t
	const nextBar = (t: number) => t0 + Math.ceil((t - t0) / BAR + 1e-6) * BAR;
	// Wait until a quarter of the way into a bar
	const intoBar = async () => {
		const t = await ctxTime();
		const target = nextBar(t) + BAR / 4;
		await page.waitForTimeout((target - t) * 1000);
	};

	// A key: it blinks, nothing moves and nothing sounds until the next bar's step 1
	await intoBar();
	const clickedAt = await ctxTime();
	const notesBefore = await notesPlayed(page);
	const changed = changeTime();
	await keyButton(page, 'C').click();
	await expect(keyButton(page, 'C')).toHaveClass(/is-queued/);
	await expect(keyButton(page, 'A')).toHaveAttribute('aria-checked', 'true');
	expect(await padNotes(page, [0])).toEqual(['A3']);
	const at = await changed;
	const bar = nextBar(clickedAt);
	// Built just before the bar (the scheduler looks 100 ms ahead), not before the bar started
	expect(at).toBeGreaterThan(bar - 0.25);
	expect(at).toBeLessThan(bar + 0.05);
	expect(await padNotes(page, [0])).toEqual(['C4']);
	await expect(keyButton(page, 'C')).toHaveAttribute('aria-checked', 'true');
	await expect(keyButton(page, 'C')).not.toHaveClass(/is-queued/);
	// No audition note: the only notes since the click are the new bar's
	const since = await page.evaluate((n) => (window as any).__starts.filter((s: any) => s.osc).slice(n).map((s: any) => s.when) as number[], notesBefore);
	for (const when of since) expect(when).toBeGreaterThan(bar - 0.01);

	// While it waits, the key shows a ghost of the chosen colour, and the caption says so
	await intoBar();
	await keyButton(page, 'D').click();
	await expect(keyButton(page, 'D')).toHaveClass(/is-queued/);
	const ghost = await keyButton(page, 'D').evaluate((el) => {
		const a = getComputedStyle(el, '::after');
		return { content: a.content, opacity: Number(a.opacity), bg: a.backgroundColor };
	});
	expect(ghost.content).not.toBe('none');
	expect(ghost.opacity).toBeGreaterThan(0.2);
	// a tint of the LEDs' colour since PR 93 (the wash's gradient before)
	expect(ghost.bg).not.toBe('rgba(0, 0, 0, 0)');
	await expect(page.locator('.mm-queued-note')).toHaveText('· D at the next bar (Shift+click: now)');
	await expect(keyButton(page, 'D')).toHaveAttribute('aria-checked', 'true', { timeout: 3000 });
	await expect(page.locator('.mm-queued-note')).toHaveCount(0);

	// A pattern changes at once, playing or not (the maintainer's call after PR 55)
	const tresillo = patternsBox(page).getByRole('button', { name: 'Tresillo', exact: true });
	await tresillo.click();
	await expect(tresillo).toHaveAttribute('aria-pressed', 'true');
	await expect(tresillo).not.toHaveClass(/is-queued/);

	// Shift+click doesn't wait
	await intoBar();
	await keyButton(page, 'E').click({ modifiers: ['Shift'] });
	await expect(keyButton(page, 'E')).toHaveAttribute('aria-checked', 'true'); // at once
	await expect(keyButton(page, 'E')).not.toHaveClass(/is-queued/);

	// Undo throws away what was waiting: the bar comes and nothing changes
	await intoBar();
	await keyButton(page, 'F').click();
	await expect(keyButton(page, 'F')).toHaveClass(/is-queued/);
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+z');
	await expect(keyButton(page, 'F')).not.toHaveClass(/is-queued/);
	await page.waitForTimeout(BAR * 1000);
	await expect(keyButton(page, 'F')).toHaveAttribute('aria-checked', 'false');

	// Stop: what was waiting happens at once
	await keyButton(page, 'F').click();
	await expect(keyButton(page, 'F')).toHaveClass(/is-queued/);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await expect(keyButton(page, 'F')).toHaveAttribute('aria-checked', 'true');
	await expect(keyButton(page, 'F')).not.toHaveClass(/is-queued/);

	// Stopped, a key moves at once and plays, as before
	const quiet = await notesPlayed(page);
	await keyButton(page, 'G').click();
	await expect(keyButton(page, 'G')).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => notesPlayed(page)).toBeGreaterThan(quiet);
});

const slotButton = (page: Page, name: string) => page.locator('.mr-slots').getByRole('button', { name: `Pattern ${name}`, exact: true });
const onPads = async (page: Page) => (await pads(page).evaluateAll((els) => els.map((el, i) => (el.classList.contains('selected') ? i : -1)))).filter((i) => i >= 0);

test('Patterns A–D: each slot keeps its own pattern; Copy; a key moves every slot; saved, imported, one undo step', async ({ page }) => {
	await turnOnPads(page, [0, 4]);
	await expect(slotButton(page, 'A')).toHaveAttribute('aria-pressed', 'true');
	await expect(slotButton(page, 'B')).toHaveClass(/empty/);

	// B: an empty pattern; stopped, at once
	await slotButton(page, 'B').click();
	await expect(slotButton(page, 'B')).toHaveAttribute('aria-pressed', 'true');
	await expect(slotButton(page, 'A')).toHaveAttribute('aria-pressed', 'false');
	expect(await onPads(page)).toEqual([]);
	await turnOnPads(page, [2]);
	await expect(slotButton(page, 'B')).not.toHaveClass(/empty/);
	await slotButton(page, 'A').click();
	expect(await onPads(page)).toEqual([0, 4]);
	await slotButton(page, 'B').click();
	expect(await onPads(page)).toEqual([2]);
	expect(await padNotes(page, [2])).toEqual(['A3']);

	// A key picked moves every slot, not only the one playing
	await keyButton(page, 'C').click();
	expect(await padNotes(page, [2])).toEqual(['C4']);
	await slotButton(page, 'A').click();
	expect(await padNotes(page, [0, 4])).toEqual(['C4', 'C4']);

	// Copy, then C: C gets A's pattern and plays; Esc puts Copy back up
	await page.waitForTimeout(500); // each change its own undo step (useUndoHistory's SETTLE_MS)
	const copy = page.locator('.mr-copy');
	await copy.click();
	await expect(copy).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.mr-cap')).toHaveText('Copy A to');
	await page.keyboard.press('Escape');
	await expect(copy).toHaveAttribute('aria-pressed', 'false');
	await copy.click();
	await slotButton(page, 'C').click();
	await expect(copy).toHaveAttribute('aria-pressed', 'false');
	await expect(slotButton(page, 'C')).toHaveAttribute('aria-pressed', 'true');
	expect(await onPads(page)).toEqual([0, 4]);
	await page.waitForTimeout(500);
	await pads(page).nth(4).click(); // C changes; A doesn't
	expect(await onPads(page)).toEqual([0]);

	// Saved in the project file: the current slot is the lane, the others their own
	const file = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	const slots = file.data.patterns.slots;
	expect(file.data.patterns.current).toBe(2);
	expect(slots.map((s: any) => s?.tracks[0].steps.flatMap((on: boolean, i: number) => (on ? [i] : [])) ?? null))
		.toEqual([[0, 4], [2], [0], null]);
	expect(slots[0].tracks[0].machine).toBe('rhythm');

	// Undo: back to before the pad (one step), then to A before the copy (one step)
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.waitForTimeout(500);
	await page.keyboard.press('Control+z');
	await expect.poll(() => onPads(page)).toEqual([0, 4]);
	await page.keyboard.press('Control+z');
	await expect(slotButton(page, 'A')).toHaveAttribute('aria-pressed', 'true');
	await expect(slotButton(page, 'C')).toHaveClass(/empty/);

	// An imported project opens on its own slot; one saved before PR 109 has its pattern in A
	await importChanged(page, 'Slots', (d) => { d.patterns = file.data.patterns; d.instruments.find((i: any) => i.name === 'synth-voice').steps = file.data.patterns.slots[2].tracks[0].steps; });
	await expect(slotButton(page, 'C')).toHaveAttribute('aria-pressed', 'true');
	await slotButton(page, 'B').click();
	expect(await onPads(page)).toEqual([2]);
	await importChanged(page, 'Old', (d) => { delete d.patterns; });
	await expect(slotButton(page, 'A')).toHaveAttribute('aria-pressed', 'true');
	expect(await onPads(page)).toEqual([2]);
	await expect(slotButton(page, 'B')).toHaveClass(/empty/);

	// File → New: four empty slots, A
	await slotButton(page, 'D').click();
	await chooseFromFileMenu(page, 'New');
	await expect(slotButton(page, 'A')).toHaveAttribute('aria-pressed', 'true');
	for (const n of ['A', 'B', 'C', 'D']) await expect(slotButton(page, n)).toHaveClass(/empty/);
});

test("item 13: each pattern slot keeps its pads' waves and noise; a sound preset sets every slot's waves; the chain exports each bar's noise", async ({ page }) => {
	const tile = (name: string) => page.getByRole('radio', { name, exact: true });
	const lit = page.locator('.ds-grid .wave-row [role="radio"][aria-checked="true"]');
	const noiseCard = page.locator('.module.noise');
	const saved = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	const offbeats = Array.from({ length: 16 }, (_, i) => i % 4 === 2);

	// A: pad 1 on Square, noise on the offbeats only (pad 1 has none)
	await turnOnPads(page, [0]);
	await tile('SQUARE').click();
	await noiseCard.getByRole('button', { name: 'Offbeats' }).click();
	await expect(page.getByRole('button', { name: 'Toggle noise' })).toHaveAttribute('aria-pressed', 'true');

	// B, never used: every pad on the main wave (Square), noise on every pad; then Saw
	await slotButton(page, 'B').click();
	await expect(lit).toHaveCount(1);
	await expect(tile('SQUARE')).toHaveAttribute('aria-checked', 'true');
	await turnOnPads(page, [0]);
	await tile('SAW').click();
	let data = await saved();
	expect(data.synth.noise.mask).toEqual(Array(16).fill(true));

	// Back to A: its own waves and noise
	await slotButton(page, 'A').click();
	await expect(tile('SQUARE')).toHaveAttribute('aria-checked', 'true');
	data = await saved();
	expect(data.synth.noise.mask).toEqual(offbeats);
	const [a, b] = data.patterns.slots.map((s: any) => s?.tracks[0]);
	expect(a.waveforms).toEqual(Array(16).fill('square'));
	expect(a.noise).toEqual(offbeats);
	expect(b.waveforms).toEqual(Array(16).fill('sawtooth'));
	expect(b.noise).toEqual(Array(16).fill(true));

	// The chain A B: bar 1's hit has no noise, bar 2's has (each bar its own slot's mask)
	await chainCell(page, 1).click();
	await chainCell(page, 2).click();
	await chainCell(page, 2).click();
	await page.locator('.mr-chain').getByRole('switch', { name: 'Chain' }).click();
	const files = unzip((await exportAudio(page, { ending: 'With tail', mix: true, stems: true, midi: false, oneShot: false, normalize: false })).bytes);
	const noise = files[Object.keys(files).find((n) => n.endsWith('_noise.wav'))!];
	expect(noise).toBeTruthy();
	const bar1 = wavWindow(noise, 0, 0.2).peak, bar2 = wavWindow(noise, 2, 2.2).peak; // 120 BPM: a bar is 2 s
	expect(bar2).toBeGreaterThan(0.005);
	expect(bar1).toBeLessThan(bar2 / 20);

	// A sound preset sets every slot's waves, and leaves their noise
	await page.locator('.pt-btn[title^="Bell:"]').click();
	await expect(tile('GLASS')).toHaveAttribute('aria-checked', 'true');
	await slotButton(page, 'B').click();
	await expect(tile('GLASS')).toHaveAttribute('aria-checked', 'true');
	data = await saved();
	expect(data.synth.noise.mask).toEqual(Array(16).fill(true));
	expect(data.patterns.slots[0].tracks[0].waveforms).toEqual(Array(16).fill('glass'));
	expect(data.patterns.slots[0].tracks[0].noise).toEqual(offbeats);

	// A project saved before item 13: every slot gets the project's waves and noise
	await importChanged(page, 'Before 13', (d) => {
		d.instruments.find((i: any) => i.name === 'synth-voice').waveforms = Array(16).fill('organ');
		d.synth.noise.mask = offbeats;
		for (const s of d.patterns.slots) if (s) for (const t of s.tracks) { delete t.waveforms; delete t.noise; }
	});
	await slotButton(page, 'A').click();
	await expect(tile('ORGAN')).toHaveAttribute('aria-checked', 'true');
	data = await saved();
	expect(data.synth.noise.mask).toEqual(offbeats);
});

test('Patterns A–D: while playing, a slot waits for the next bar (a ghost); Shift+click is at once; Stop applies it', async ({ page }) => {
	// A: pad 1; B: pad 9. 120 BPM: a bar is 2 s
	await turnOnPads(page, [0]);
	await slotButton(page, 'B').click();
	await turnOnPads(page, [8]);
	await slotButton(page, 'A').click();
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(() => page.evaluate(() => (window as any).__starts.some((s: any) => s.osc && s.when > 0))).toBe(true);
	const t0 = await page.evaluate(() => (window as any).__starts.find((s: any) => s.osc && s.when > 0).when as number);
	const BAR = 2;
	const ctxTime = () => page.evaluate(() => (window as any).__ctx.currentTime as number);
	const nextBar = (t: number) => t0 + Math.ceil((t - t0) / BAR + 1e-6) * BAR;
	// A quarter into a bar
	const t = await ctxTime();
	await page.waitForTimeout((nextBar(t) + BAR / 4 - t) * 1000);

	const clickedAt = await ctxTime();
	const changed = page.evaluate(() => new Promise<number>((resolve) => {
		const id = setInterval(() => {
			if (document.querySelectorAll('.pad-row .padTEST')[8].classList.contains('selected')) { clearInterval(id); resolve((window as any).__ctx.currentTime); }
		}, 3);
	}));
	await slotButton(page, 'B').click();
	await expect(slotButton(page, 'B')).toHaveClass(/is-queued/);
	await expect(slotButton(page, 'A')).toHaveAttribute('aria-pressed', 'true');
	expect(await onPads(page)).toEqual([0]);
	const at = await changed;
	const bar = nextBar(clickedAt);
	expect(at).toBeGreaterThan(bar - 0.25);
	expect(at).toBeLessThan(bar + 0.05);
	await expect(slotButton(page, 'B')).toHaveAttribute('aria-pressed', 'true');
	await expect(slotButton(page, 'B')).not.toHaveClass(/is-queued/);

	// Shift+click: at once
	await slotButton(page, 'A').click({ modifiers: ['Shift'] });
	await expect(slotButton(page, 'A')).toHaveAttribute('aria-pressed', 'true');
	expect(await onPads(page)).toEqual([0]);

	// Stop applies what's waiting
	const t2 = await ctxTime();
	await page.waitForTimeout((nextBar(t2) + BAR / 4 - t2) * 1000);
	await slotButton(page, 'B').click();
	await expect(slotButton(page, 'B')).toHaveClass(/is-queued/);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await expect(slotButton(page, 'B')).toHaveAttribute('aria-pressed', 'true');
	expect(await onPads(page)).toEqual([8]);
});

const chainCell = (page: Page, n: number) => page.locator('.mr-chain').getByRole('button', { name: new RegExp(`^Chain cell ${n}:`) });

test('the chain: cells step through the slots; playing follows them a bar each, without undo steps or the unsaved dot; a slot picked by hand stops it', async ({ page }) => {
	// A: pad 1; B: pad 9
	await turnOnPads(page, [0]);
	await slotButton(page, 'B').click();
	await turnOnPads(page, [8]);
	await slotButton(page, 'A').click();

	// Chain needs a filled cell
	const chainSwitch = page.locator('.mr-chain').getByRole('switch', { name: 'Chain' });
	await expect(chainSwitch).toBeDisabled();
	// Cell 1: A (one click); cell 2: B (two); cell 3: D then back to C (Shift+click)
	await chainCell(page, 1).click();
	await chainCell(page, 2).click();
	await chainCell(page, 2).click();
	for (let i = 0; i < 4; i++) await chainCell(page, 3).click();
	await chainCell(page, 3).click({ modifiers: ['Shift'] });
	await expect(chainCell(page, 1)).toHaveAccessibleName('Chain cell 1: pattern A');
	await expect(chainCell(page, 2)).toHaveAccessibleName('Chain cell 2: pattern B');
	await expect(chainCell(page, 3)).toHaveAccessibleName('Chain cell 3: pattern C');
	// C is empty: take it out again (C → D → empty)
	await chainCell(page, 3).click();
	await chainCell(page, 3).click();
	await expect(chainCell(page, 3)).toHaveAccessibleName('Chain cell 3: empty');
	await chainSwitch.click();
	await expect(chainSwitch).toHaveAttribute('aria-checked', 'true');

	// Saved, with the chain: the dot says saved, and nothing waits to be undone past this point
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.waitForTimeout(600);
	await page.keyboard.press('Control+s');
	await expect(page.locator('.pc-dot')).toHaveClass(/saved/);
	await expect(page.locator('.pc-dot')).not.toHaveClass(/unsaved/);
	const file = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	expect(file.data.patterns.chain).toEqual([0, 1, null, null, null, null, null, null]);
	expect(file.data.patterns.chainOn).toBe(true);

	// Play: bar 1 is cell 1 (A), bar 2 cell 2 (B), bar 3 cell 1 again
	await slotButton(page, 'B').click(); // stopped: Play still starts from the first cell
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(slotButton(page, 'A')).toHaveAttribute('aria-pressed', 'true');
	await expect(chainCell(page, 1)).toHaveClass(/now/);
	await expect(slotButton(page, 'B')).toHaveAttribute('aria-pressed', 'true', { timeout: 4000 });
	await expect(chainCell(page, 2)).toHaveClass(/now/);
	expect(await onPads(page)).toEqual([8]);
	await expect(slotButton(page, 'A')).toHaveAttribute('aria-pressed', 'true', { timeout: 4000 });
	await expect(chainCell(page, 1)).toHaveClass(/now/);
	expect(await onPads(page)).toEqual([0]);
	// The chain playing is no edit
	await page.waitForTimeout(700);
	await expect(page.locator('.pc-dot')).not.toHaveClass(/unsaved/);

	// A slot picked by hand while it plays: Chain goes off, the slot waits for the bar as usual
	await slotButton(page, 'B').click();
	await expect(chainSwitch).toHaveAttribute('aria-checked', 'false');
	await expect(slotButton(page, 'B')).toHaveAttribute('aria-pressed', 'true', { timeout: 4000 });
	await expect(page.locator('.mr-cell.now')).toHaveCount(0);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();

	// A chain cell is an undo step
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.waitForTimeout(600);
	await chainCell(page, 5).click();
	await expect(chainCell(page, 5)).toHaveAccessibleName('Chain cell 5: pattern A');
	await page.waitForTimeout(600);
	await page.keyboard.press('Control+z');
	await expect(chainCell(page, 5)).toHaveAccessibleName('Chain cell 5: empty');

	// File → New: an empty chain, off
	await chooseFromFileMenu(page, 'New');
	for (let n = 1; n <= 8; n++) await expect(chainCell(page, n)).toHaveAccessibleName(`Chain cell ${n}: empty`);
	await expect(chainSwitch).toHaveAttribute('aria-checked', 'false');
	await expect(chainSwitch).toBeDisabled();
});

test('Export audio plays the chain: a bar per cell, in the WAV and the MIDI file; Pattern exports the slot showing', async ({ page }) => {
	// A: pad 1; B: pad 9 (a pattern of its own)
	await turnOnPads(page, [0]);
	await slotButton(page, 'B').click();
	await turnOnPads(page, [8]);
	await slotButton(page, 'A').click();
	// Chain A B A, on
	await chainCell(page, 1).click();
	await chainCell(page, 2).click();
	await chainCell(page, 2).click();
	await chainCell(page, 3).click();
	await page.locator('.mr-chain').getByRole('switch', { name: 'Chain' }).click();

	// The dialog opens on Chain (it plays in the app), three bars long
	await chooseFromFileMenu(page, 'Export audio…');
	const dialog = page.getByRole('dialog', { name: 'Export audio' });
	const play = dialog.getByRole('group', { name: 'Play' });
	await expect(play.getByRole('button', { name: 'Chain', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(play.getByRole('button', { name: 'Pattern A', exact: true })).toBeVisible();
	await expect(dialog.getByText('A B A', { exact: true })).toBeVisible();
	await expect(dialog.getByRole('group', { name: 'Bars' })).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Close' }).click();

	const zip = await exportAudio(page, { ending: 'Loop', mix: true, stems: false, midi: true, oneShot: false, normalize: false });
	expect(zip.name).toMatch(/_120bpm_Amin_chain-3bars\.zip$/);
	const files = unzip(zip.bytes);
	const wavName = Object.keys(files).find((n) => n.endsWith('_mix.wav'))!;
	expect(wavName).toMatch(/_chain-3bars_mix\.wav$/);
	const mix = files[wavName];
	// 120 BPM: a bar is 2 s, a step 0.125 s. A hits at 0 s and 4 s, B at 3 s (bar 2, step 9)
	const { frames, rate } = wavSamples(mix);
	expect(frames / rate).toBeCloseTo(6, 2);
	const level = (t: number) => wavWindow(mix, t, t + 0.12).peak;
	expect(level(0)).toBeGreaterThan(0.05);
	expect(level(1)).toBeLessThan(0.01);   // bar 1 has no step 9
	expect(level(2)).toBeLessThan(0.01);   // bar 2 has no step 1
	expect(level(3)).toBeGreaterThan(0.05);
	expect(level(4)).toBeGreaterThan(0.05);
	expect(level(5)).toBeLessThan(0.01);
	// The MIDI file: the same three hits
	const midi = Object.entries(files).find(([n]) => n.endsWith('.mid'))![1];
	const noteOns = [...midi.subarray(22)].flatMap((b, i, a) => (b === 0x90 ? [a[i + 1]] : []));
	expect(noteOns.length).toBe(3);

	// Pattern: the slot showing (A), its bars as before
	const single = await (async () => {
		await chooseFromFileMenu(page, 'Export audio…');
		await dialog.getByRole('group', { name: 'Play' }).getByRole('button', { name: 'Pattern A', exact: true }).click();
		await dialog.getByRole('group', { name: 'Bars' }).getByRole('button', { name: '2', exact: true }).click();
		await dialog.getByRole('checkbox', { name: /^MIDI file/ }).setChecked(false);
		const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export', exact: true }).click()]);
		return { name: download.suggestedFilename(), bytes: readFileSync((await download.path())!) };
	})();
	expect(single.name).toMatch(/_120bpm_Amin_2bars_mix\.wav$/);
	expect(wavWindow(single.bytes, 2, 2.12).peak).toBeGreaterThan(0.05); // A again in bar 2
	expect(wavWindow(single.bytes, 1, 1.12).peak).toBeLessThan(0.01);

	// With no filled cell, no Play row
	await page.locator('.mr-chain').getByRole('switch', { name: 'Chain' }).click();
	for (const n of [1, 2, 3]) while (!(await chainCell(page, n).getAttribute('aria-label'))!.endsWith('empty')) await chainCell(page, n).click();
	await chooseFromFileMenu(page, 'Export audio…');
	await expect(dialog.getByRole('group', { name: 'Play' })).toHaveCount(0);
});

test('Melody Maker: a new scale keeps each note on its degree; a project opening keeps its notes', async ({ page }) => {
	const on = [0, 1, 2, 3, 4, 5, 6, 7];
	await turnOnPads(page, on);
	await keyButton(page, 'C').click();
	await chooseOption(page, 'Scale', 'Minor');
	// An arpeggio up the C minor scale: C D Eb F G Ab Bb C
	await page.getByRole('button', { name: 'Arpeggio', exact: true }).click();
	await chooseOption(page, 'Arp tones', 'Whole scale');
	await page.getByRole('button', { name: /^Generate (melody|arpeggio)$/ }).click();
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

test('Melody Maker: no dropdowns; steppers with lists, Narrow | Wide, and a screen that previews what Generate would do', async ({ page }) => {
	const saved = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.melody;
	const card = page.locator('.module.melody');
	const scale = card.getByRole('group', { name: 'Scale' });
	const scaleName = scale.getByRole('button', { name: /^Scale:/ });
	const generate = card.getByRole('button', { name: /^Generate (melody|arpeggio)$/ });
	const size = async () => { const b = (await card.boundingBox())!; return [b.width, b.height]; };
	const cardSize = await size();

	// Not one dropdown; the captions left are Key, Scale and (an arpeggio's) Octaves
	await expect(card.locator('select, .pt-select, .pt-selectbtn')).toHaveCount(0);
	await expect(card.locator('.mm-cap')).toHaveText(['Scale']);

	// The Scale stepper: its arrows step (round the ends), and the scale's notes light on the keys.
	// It starts on Minor (PR 87)
	await expect(scaleName).toHaveText(/Minor/);
	await expect(card.locator('.mm-kb .in-scale')).toHaveCount(7);
	await chooseOption(page, 'Scale', 'None');
	await expect(scaleName).toHaveText(/None/);
	await expect(card.locator('.mm-kb .in-scale')).toHaveCount(0);
	await scale.getByRole('button', { name: 'Next' }).click();
	await expect(scaleName).toHaveText(/Major/);
	await expect(card.locator('.mm-kb .in-scale')).toHaveCount(7);
	await scale.getByRole('button', { name: 'Previous' }).click();
	await scale.getByRole('button', { name: 'Previous' }).click();
	await expect(scaleName).toHaveText(/Mixolyd/);
	expect((await saved()).keyScale).toBe('mixolydian');

	// A click on the name opens the whole list, with full names; Esc and a click elsewhere close it
	await scaleName.click();
	await expect(card.getByRole('listbox', { name: 'Scale' }).getByRole('option'))
		.toHaveText(['None', 'Major', 'Minor', 'Pentatonic Major', 'Pentatonic Minor', 'Lydian', 'Dorian', 'Mixolydian']);
	await page.keyboard.press('Escape');
	await expect(card.getByRole('listbox')).toHaveCount(0);
	await scaleName.click();
	await card.locator('.pt-title').click();
	await expect(card.getByRole('listbox')).toHaveCount(0);
	await chooseOption(page, 'Scale', 'Pentatonic Minor');
	await expect(scaleName).toHaveText(/Pent Min/);
	await expect(card.locator('.mm-kb .in-scale')).toHaveCount(5);

	// Range is Narrow or Wide (Low, Mid and High went). Melody: the screen's band is the notes
	// a melody can use, so Narrow's is shorter
	const range = card.getByRole('radiogroup', { name: 'Range' });
	await expect(range.getByRole('radio')).toHaveText(['Narrow', 'Wide']);
	// Narrow by default (PR 97; it was Wide)
	await expect(range.getByRole('radio', { name: 'Narrow' })).toHaveAttribute('aria-checked', 'true');
	const band = () => card.locator('.mm-band').evaluate((el) => Number(el.getAttribute('height')));
	const narrow = await band();
	await range.getByRole('radio', { name: 'Wide' }).click();
	expect(narrow).toBeLessThan((await band()) * 0.7);
	expect((await saved()).rangePreset).toBe('wide');
	await range.getByRole('radio', { name: 'Narrow' }).click();
	expect((await saved()).rangePreset).toBe('mid');

	// A project saved with Low opens as Narrow
	await range.getByRole('radio', { name: 'Wide' }).click();
	await importChanged(page, 'low-range', (data) => { data.melody.rangePreset = 'low'; });
	await expect(range.getByRole('radio', { name: 'Narrow' })).toHaveAttribute('aria-checked', 'true');
	expect((await saved()).rangePreset).toBe('mid');

	// Arpeggio: the screen draws the pattern (solid) and, as outlines, the arpeggio Generate
	// would write; after Generate they're the pattern, and no outline is left
	await turnOnPads(page, [0, 5]);
	await card.getByRole('button', { name: 'Arpeggio', exact: true }).click();
	await expect(card.locator('.mm-band')).toHaveCount(0);
	await expect(card.locator('.mm-note')).toHaveCount(2);
	// Range is the melody's: an arpeggio's span is its Octaves, in Range's place (PR 97)
	await expect(range).toHaveCount(0);
	await expect(card.locator('.mm-cap')).toHaveText(['Scale', 'Octaves']);
	await expect(card.locator('.mm-scale-row').getByRole('radiogroup', { name: 'Arp octaves' })).toBeVisible();
	const ghosts = card.locator('.mm-ghost');
	expect(await ghosts.count()).toBeGreaterThanOrEqual(14); // 16 notes at 1/16, less any the pads already play
	await chooseRate(page, '1/8');
	expect(await ghosts.count()).toBeLessThanOrEqual(8);
	await chooseOption(page, 'Arp pattern', 'Random'); // shuffled on every Generate: nothing to preview
	await expect(ghosts).toHaveCount(0);
	await expect(card.locator('.mm-read--r')).toContainText('shuffled on Generate');
	await card.getByRole('group', { name: 'Arp pattern' }).getByRole('button', { name: 'Next' }).click(); // round to Up
	await expect(card.getByRole('button', { name: /^Arp pattern:/ })).toHaveText(/Up/);
	await generate.click();
	await expect(ghosts).toHaveCount(0);
	await expect(card.locator('.mm-note')).toHaveCount(8);

	// The card is the size it was before all that, in both modes
	expect(await size()).toEqual(cardSize);
	await card.getByRole('button', { name: 'Melody', exact: true }).click();
	expect(await size()).toEqual(cardSize);
});

// PR 80: the screen while playing. Each hit is drawn as long as it sounds, repeats as their
// hits; a line shows where the bar is and the hit it's in glows; with reduced motion only the glow.
test('Melody Maker: while playing, a playhead crosses the screen and the sounding note glows; notes are as long as they sound', async ({ page }) => {
	const card = page.locator('.module.melody');
	await importChanged(page, 'playhead', (data) => {
		const lane = data.instruments.find((i: any) => i.name === 'synth-voice');
		lane.steps = lane.steps.map((_: boolean, i: number) => [0, 4, 8].includes(i));
		lane.ratchets = lane.steps.map((_: boolean, i: number) => (i === 4 ? 3 : 1));
		lane.repeatNotes = lane.steps.map((_: boolean, i: number) => (i === 4 ? 'up' : 'same'));
		data.transport.tempo = 60; // a step is 250 ms; a note (20 + 400 ms) lasts 1.68 steps
		data.melody.keyScale = 'naturalMinor';
	});
	const notes = card.locator('.mm-note');
	const box = (n: Locator) => n.evaluate((el) => ({ x: +el.getAttribute('x')!, y: +el.getAttribute('y')!, w: +el.getAttribute('width')!, step: el.getAttribute('data-step') }));

	// Stopped: step 1's note, step 5's three hits climbing the chord, step 9's note; no line, no glow
	await expect(notes).toHaveCount(5);
	const drawn = await Promise.all([0, 1, 2, 3, 4].map((i) => box(notes.nth(i))));
	expect(drawn.map((d) => d.step)).toEqual(['0', '4', '4', '4', '8']);
	expect(drawn[0].w).toBeCloseTo(1.68 * 22 - 2, 0); // Attack + Decay at the tempo
	expect(drawn[1].w).toBeLessThan(8); // a third of a step, cut by the next hit
	expect(drawn[2].x - drawn[1].x).toBeCloseTo(22 / 3, 1);
	expect(drawn[2].y).toBeLessThan(drawn[1].y); // Up: each hit higher
	expect(drawn[3].y).toBeLessThan(drawn[2].y);
	expect(drawn[3].w).toBeCloseTo(1.68 * 22 - 2, 0); // the last hit rings out
	await expect(card.locator('.mm-playhead')).toHaveCount(0);
	await expect(card.locator('.is-playing')).toHaveCount(0);

	// The scale's notes on the white keys: a bigger dot than the black keys' LED
	const dot = (key: string) => card.getByRole('radio', { name: key, exact: true }).evaluate((el) => getComputedStyle(el, '::before').width);
	expect(await dot('C')).toBe('9px');
	expect(await dot('C#')).not.toBe('9px'); // not in A minor: no dot

	// Playing: the line moves, and the note it's in glows (each of the three steps in turn)
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const line = card.locator('.mm-playhead');
	await expect(line).toHaveCount(1);
	// The line and the glowing note are read in one go (two reads can be many frames apart on a
	// slow machine, which failed the deploy's checks after PR 80)
	const look = () => card.evaluate((el) => {
		const line = el.querySelector('.mm-playhead');
		const g = el.querySelector('.mm-note.is-playing');
		return {
			lx: line ? Number(line.getAttribute('x1')) : null,
			glow: g ? { x: Number(g.getAttribute('x')), w: Number(g.getAttribute('width')), step: g.getAttribute('data-step')! } : null,
		};
	});
	const xs = new Set<number>();
	const glowed = new Set<string>();
	for (let i = 0; i < 200 && glowed.size < 3; i++) {
		const { lx, glow } = await look();
		if (lx != null) xs.add(lx);
		if (lx != null && glow) {
			glowed.add(glow.step);
			// the line is inside the glowing note
			expect(Math.abs(lx - (glow.x + glow.w / 2))).toBeLessThanOrEqual(glow.w / 2 + 2);
		}
		await page.waitForTimeout(40);
	}
	expect([...glowed].sort()).toEqual(['0', '4', '8']);
	expect(xs.size).toBeGreaterThan(3); // it moves (few reads on a slow machine)
	expect(await card.locator('.is-playing').count()).toBeLessThanOrEqual(1);

	// Stop: both gone
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await expect(line).toHaveCount(0);
	await expect(card.locator('.is-playing')).toHaveCount(0);

	// prefers-reduced-motion: no moving line, the note still glows
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(card.locator('.mm-note.is-playing')).toHaveCount(1);
	await expect(line).toHaveCount(0);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('Melody Maker: Generate is the card\'s last line, and the screen says to press it until it has been pressed once', async ({ page }) => {
	const card = page.locator('.module.melody');
	const generate = card.getByRole('button', { name: /^Generate (melody|arpeggio)$/ });
	const hint = card.locator('.mm-hint-lcd');
	const screen = card.locator('.mm-screen');
	await expect(hint).toBeVisible();
	await expect(hint).toContainText('Press Generate');
	await expect(hint).toContainText('for a melody in A Minor'); // the starting scale (PR 87)
	await chooseOption(page, 'Scale', 'None');
	await expect(hint).toContainText('every pad gets A'); // no scale
	await expect(generate).toHaveClass(/is-fresh/);

	// It's the card's last control, under the screen and the makers' settings, the card's width
	const g = (await generate.boundingBox())!, s = (await screen.boundingBox())!, c = (await card.boundingBox())!;
	expect(g.y).toBeGreaterThan(s.y + s.height);
	expect(g.width).toBeGreaterThan(c.width * 0.85);

	// Melody | Arpeggio is in the header, and Generate names what it makes
	await card.getByRole('group', { name: 'Generate makes' }).getByRole('button', { name: 'Arpeggio', exact: true }).click();
	await expect(generate).toHaveText('Generate arpeggio');
	await expect(hint).toContainText('for an arpeggio: Up · 1/16');

	// The hint goes once Generate is pressed, and stays gone after a reload
	await generate.click();
	await expect(hint).toHaveCount(0);
	await expect(generate).not.toHaveClass(/is-fresh/);
	await page.reload();
	await expect(card.getByRole('button', { name: /^Generate (melody|arpeggio)$/ })).toBeVisible();
	await expect(card.locator('.mm-hint-lcd')).toHaveCount(0);
});

test('Melody Maker: one Generate button, Melody or Arpeggio, the card keeps its height, the choice is saved', async ({ page }) => {
	const generate = page.getByRole('button', { name: /^Generate/ });
	await expect(generate).toHaveCount(1);
	await expect(generate).toHaveText('Generate melody'); // it names what it makes (PR 82)
	const mode = page.getByRole('group', { name: 'Generate makes' });
	const random = mode.getByRole('button', { name: 'Melody', exact: true }); // "Random" until PR 57
	const arp = mode.getByRole('button', { name: 'Arpeggio', exact: true });
	await expect(random).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: 'Arp pattern' })).toBeHidden();
	await chooseOption(page, 'Scale', 'None');
	await expect(page.locator('.mm-mode-note')).toContainText('No scale chosen: the pads that are on get A');
	const card = page.locator('.module.melody');
	const height = (await card.boundingBox())!.height;

	await arp.click();
	await expect(generate).toHaveText('Generate arpeggio');
	await expect(page.getByRole('button', { name: 'Arp pattern' })).toBeVisible();
	await expect(page.locator('.mm-mode-note')).toBeHidden();
	expect((await card.boundingBox())!.height).toBe(height);

	// Generate makes an arpeggio now: up the A major chord (no scale: major) from A
	const on = [0, 1, 2, 3];
	await turnOnPads(page, on);
	await generate.click();
	const notes = (await padNotes(page, on)).map(noteMidi);
	expect(notes.map((m) => (m - notes[0] + 120) % 12)).toEqual([0, 4, 7, 0]);
	expect(notes[3] - notes[0]).toBe(12); // fitted to the bar: 1-3-5-8, the octave on top

	// Rate places the notes: every step at 1/16 (and the cycle of four repeats), every other
	// step at 1/8; the steps between go off. 1/4 is gone (it sounded like a slow bassline)
	const lit = () => pads(page).evaluateAll((els) => els.map((e, i) => (e.getAttribute('aria-pressed') === 'true' ? i : -1)).filter((i) => i >= 0));
	expect(await lit()).toEqual([...Array(16).keys()]);
	const all = (await padNotes(page, [...Array(16).keys()])).map(noteMidi);
	for (let i = 0; i < 16; i++) expect(all[i]).toBe(all[i % 4]);
	await chooseRate(page, '1/8');
	await generate.click();
	expect(await lit()).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
	expect((await padNotes(page, [0, 2, 4, 6])).map(noteMidi).map((m) => m - notes[0])).toEqual([0, 4, 7, 12]);
	await expect(page.getByRole('radiogroup', { name: 'Arp rate' }).getByRole('radio')).toHaveText(['1/8', '1/16']);
	await page.waitForTimeout(600); // its own undo step (changes 400 ms apart are one)
	await chooseRate(page, '1/16');
	await generate.click();
	expect(await lit()).toEqual([...Array(16).keys()]);
	// One undo step: the 1/8 arpeggio's steps and notes come back together
	await page.waitForTimeout(600);
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+z');
	await expect.poll(lit).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);

	// Tones → 7th: the 7th chord, 1-3-5-7 (in place of the ⋯ menu's "7th on downbeats", PR 68),
	// four notes, so the cycle of four repeats across the bar
	await chooseRate(page, '1/16');
	await chooseOption(page, 'Arp tones', '7th chord: 1-3-5-7');
	await generate.click();
	const seventh = (await padNotes(page, [...Array(16).keys()])).map(noteMidi);
	expect(seventh.slice(0, 4).map((m) => m - seventh[0])).toEqual([0, 4, 7, 11]);
	for (let i = 0; i < 16; i++) expect(seventh[i]).toBe(seventh[i % 4]);
	// Skip: every other tone, 1-5-3-7
	await page.locator('.module.melody').getByRole('button', { name: 'Skip', exact: true }).click();
	await generate.click();
	const skipped = (await padNotes(page, [0, 1, 2, 3])).map(noteMidi);
	expect(skipped.map((m) => m - skipped[0])).toEqual([0, 7, 4, 11]);

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

		// No Clear since PR 72 (☰ → Reset… clears): the Pattern row is laid out as the Sound row
		await expect(page.getByRole('button', { name: 'Clear', exact: true })).toHaveCount(0);
		const rowBox = (name: string) => page.getByRole('group', { name, exact: true }).boundingBox();
		const [soundRow, patternRow] = [(await rowBox('Sound'))!, (await rowBox('Pattern'))!];
		expect(patternRow.x).toBe(soundRow.x);
		expect(patternRow.width).toBe(soundRow.width);

		// Undo brings a change back, and Redo (beside it in the top bar since PR 72) redoes it
		await page.waitForTimeout(700); // the page's first settled state is the history's start
		await phonePads(page).nth(8).click();
		await page.waitForTimeout(700); // the undo history records a step once things are still
		await page.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect(phonePads(page).nth(8)).toHaveAttribute('aria-pressed', 'false');
		await page.getByRole('button', { name: 'Redo', exact: true }).click();
		await expect(phonePads(page).nth(8)).toHaveAttribute('aria-pressed', 'true');
		await page.waitForTimeout(700);

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

	test('PR 72: pedals near their desktop shape, the menu laid out, no Shift+click on a touch screen', async ({ page }) => {
		// FX: four pedals at most 150 px wide (they were stretched to 262), centred
		await page.getByRole('tab', { name: 'FX' }).click();
		const pedals = await page.locator('.pl-fx > *').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
		expect(pedals).toHaveLength(4);
		for (const p of pedals) {
			expect(p.width).toBeLessThanOrEqual(150);
			expect(p.height).toBeGreaterThan(p.width * 1.4);
		}
		const frame = (await page.locator('.pl-fx').boundingBox())!;
		const left = pedals[0].x - frame.x, right = frame.x + frame.width - (pedals[3].x + pedals[3].width);
		expect(Math.abs(left - right)).toBeLessThan(2);

		// The menu: a header with ✕ (no Close button), File · name · Save without Undo and Redo
		// (in the top bar) over the name, and Desktop View and Reset… the same size at the bottom
		await page.getByRole('button', { name: 'Menu' }).click();
		const menu = page.getByRole('dialog', { name: 'Menu' });
		await expect(menu.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
		await expect(menu.getByRole('button', { name: 'Undo' })).toBeHidden();
		await expect(menu.getByRole('button', { name: 'Redo' })).toBeHidden();
		const [file, name, save] = await Promise.all([
			menu.getByRole('button', { name: 'File ▾' }).boundingBox(),
			menu.getByRole('textbox', { name: 'Project name' }).boundingBox(),
			menu.locator('.pc-primary').boundingBox(),
		]);
		expect(file!.x + file!.width).toBeLessThanOrEqual(name!.x);
		expect(name!.x + name!.width).toBeLessThanOrEqual(save!.x);
		const desk = (await menu.getByRole('button', { name: 'Desktop View' }).boundingBox())!;
		const reset = (await menu.getByRole('button', { name: 'Reset…' }).boundingBox())!;
		expect(Math.abs(desk.width - reset.width)).toBeLessThan(1);
		expect(desk.y).toBe(reset.y);
		const box = (await menu.boundingBox())!;
		expect(box.y + box.height - (desk.y + desk.height)).toBeLessThan(24); // at the bottom
		// A question left open is gone when the menu opens again
		await menu.getByRole('button', { name: 'Reset…' }).click();
		await expect(menu.getByRole('button', { name: 'Reset pads' })).toBeVisible();
		await menu.getByRole('button', { name: 'Close menu' }).click();
		await expect(menu).toBeHidden();
		await page.getByRole('button', { name: 'Menu' }).click();
		await expect(menu.getByRole('button', { name: 'Reset…' })).toBeVisible();
		await menu.getByRole('button', { name: 'Close menu' }).click();

		// While playing, a key waits for the bar; the caption says so without Shift+click
		await page.getByRole('tab', { name: 'Pads' }).click();
		await phonePads(page).nth(0).click();
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await page.getByRole('tab', { name: 'Key' }).click();
		await page.locator('.pl-melody .mm-kb').getByRole('radio', { name: 'D', exact: true }).click();
		const note = page.locator('.pl-melody .mm-queued-note');
		await expect(note).toBeVisible();
		expect(await note.evaluate((el) => (el as HTMLElement).innerText.trim())).toBe('· D at the next bar');
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
	});

	test('PR 73: tiny pads in the top bar, Swing and Humanize on Pads, the LFO and Noise cards on Mod', async ({ page }) => {
		const saved = async () => {
			await page.getByRole('button', { name: 'Menu' }).click();
			const menu = page.getByRole('dialog', { name: 'Menu' });
			await menu.getByRole('button', { name: 'File ▾' }).click();
			const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export file' }).click()]);
			if (await menu.isVisible()) await menu.getByRole('button', { name: 'Close menu' }).click();
			return JSON.parse(readFileSync((await download.path())!).toString('utf8')).data;
		};

		// The tiny pads: 16, lit where the pads are, in their colours; the playing one outlined
		for (const i of [0, 4, 8, 13]) await phonePads(page).nth(i).click();
		const mini = page.locator('.pl-minipads .pl-mp');
		await expect(mini).toHaveCount(16);
		expect(await mini.evaluateAll((els) => els.map((e, i) => (e.classList.contains('on') ? i : -1)).filter((i) => i >= 0))).toEqual([0, 4, 8, 13]);
		const [padColour, miniColour] = await Promise.all([
			phonePads(page).nth(0).evaluate((el) => getComputedStyle(el).getPropertyValue('--h').trim()),
			mini.nth(0).evaluate((el) => getComputedStyle(el).getPropertyValue('--h').trim()),
		]);
		expect(miniColour).toBe(padColour);
		await page.getByRole('tab', { name: 'Key' }).click();
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect(page.locator('.pl-minipads .pl-mp.now')).toHaveCount(1);
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
		await expect(page.locator('.pl-minipads .pl-mp.now')).toHaveCount(0);
		await page.getByRole('tab', { name: 'Pads' }).click();

		// Swing: − / + by the knob's notches, the desktop's own setting
		const swing = page.getByRole('group', { name: 'Swing' });
		await expect(swing).toContainText('0% Swing');
		for (let k = 0; k < 4; k++) await swing.getByRole('button', { name: 'More swing' }).click();
		await expect(swing).toContainText('33% Swing');
		await swing.getByRole('button', { name: 'Less swing' }).click();
		await expect(swing).toContainText('24% Swing');

		// Humanize: the velocity shapes in a list; Peaks makes the 2nd step of each beat softer
		await page.getByRole('button', { name: 'Humanize' }).click();
		const shapes = page.getByRole('dialog', { name: 'Humanize' });
		await expect(shapes.getByRole('button')).toHaveText(['Peaks', 'Stairs', 'Ramp', 'dNb', 'Random', 'Reset']);
		await shapes.getByRole('button', { name: 'Peaks' }).click();
		await expect(shapes).toBeHidden();

		// Mod: the LFO card (Rate, Depth, the five targets, RETRIG) and the Noise card (its pad
		// buttons, Accents among them), the desktop's own settings; Noise left the Sound page
		await page.getByRole('tab', { name: 'Sound' }).click();
		await expect(page.locator('.pl-gens').getByRole('button', { name: 'Noise' })).toHaveCount(0);
		await page.getByRole('tab', { name: 'Mod' }).click();
		const mod = page.locator('section[aria-label="Mod"]');
		expect(await mod.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
		await expect(mod.getByRole('radio')).toHaveCount(5 + 2); // the targets, the waves
		await mod.getByRole('button', { name: 'Toggle noise' }).click(); // the ribbon (PR 106)
		await mod.getByRole('button', { name: 'Accents' }).click();
		await page.waitForTimeout(700);
		const data = await saved();
		expect(data.transport.swing).toBe(0.24);
		expect(data.instruments.find((l: any) => l.name === 'synth-voice').velocities.slice(0, 4)).toEqual([1, 0.55, 0.25, 0.55]);
		expect(data.synth.noise.enabled).toBe(true);
		const marked = (data.synth.noise.mask as boolean[]).map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
		expect(marked).toEqual([0, 4, 8]); // the loudest hits: 0, 4 and 8 at full velocity, 13 at 0.55

		// The top bar fits on the first iPhone SE (568 × 320), five tabs, the scope and the pads
		await page.setViewportSize({ width: 568, height: 320 });
		const bar = page.locator('.pl-top');
		expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
		const last = (await bar.getByRole('button', { name: 'Menu' }).boundingBox())!;
		expect(last.x + last.width).toBeLessThanOrEqual(568);
		// Every page fits without scrolling (the Key page too since PR 106)
		for (const tab of ['Pads', 'Sound', 'Mod', 'FX', 'Key']) {
			await page.getByRole('tab', { name: tab }).click();
			const page_ = page.locator(`section[aria-label="${tab === 'Pads' ? 'Play' : tab}"]`);
			expect(await page_.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), tab).toBe(true);
		}
	});

	test('PR 88: the Pads page rotates and reverses the pattern', async ({ page }) => {
		await phonePads(page).nth(0).click();
		await expect(phonePads(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
		await page.getByRole('button', { name: 'Shift later' }).click();
		await expect(phonePads(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
		await expect(phonePads(page).nth(0)).toHaveAttribute('aria-pressed', 'false');
		await page.getByRole('button', { name: 'Reverse', exact: true }).click();
		await expect(phonePads(page).nth(14)).toHaveAttribute('aria-pressed', 'true');
		await page.getByRole('button', { name: 'Shift earlier' }).click();
		await expect(phonePads(page).nth(13)).toHaveAttribute('aria-pressed', 'true');
	});

	test('PR 106: every page fits at 568 × 320 and 844 × 390; the pedals, Sound and Mod in the desktop\'s looks; Sample on Sound', async ({ page }) => {
		await page.evaluate(fakeMicrophone);
		const saved = async () => {
			await page.getByRole('button', { name: 'Menu' }).click();
			const menu = page.getByRole('dialog', { name: 'Menu' });
			await menu.getByRole('button', { name: 'File ▾' }).click();
			const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export file' }).click()]);
			if (await menu.isVisible()) await menu.getByRole('button', { name: 'Close menu' }).click();
			return JSON.parse(readFileSync((await download.path())!).toString('utf8')).data;
		};
		const fits = async (label: string, what: string) => {
			const section = page.locator(`section[aria-label="${label}"]`);
			await expect(section).toBeVisible();
			expect(await section.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1), what).toBe(true);
		};

		// Nothing scrolls, on the first iPhone SE (568 × 320) or an iPhone (844 × 390): the Key
		// page in both modes, with the Scale list open too
		for (const size of [{ width: 568, height: 320 }, { width: 844, height: 390 }]) {
			await page.setViewportSize(size);
			for (const [tab, label] of [['Pads', 'Play'], ['Sound', 'Sound'], ['Mod', 'Mod'], ['FX', 'FX'], ['Key', 'Key']]) {
				await page.getByRole('tab', { name: tab }).click();
				await fits(label, `${tab} at ${size.width}`);
			}
			const key = page.locator('section[aria-label="Key"]');
			await key.getByRole('button', { name: 'Arpeggio', exact: true }).click();
			await fits('Key', `Arpeggio at ${size.width}`);
			// Octaves' three keys inside the card
			const card = (await key.locator('.mm-card').boundingBox())!;
			const three = (await key.getByRole('radio', { name: '3', exact: true }).boundingBox())!;
			expect(three.x + three.width).toBeLessThanOrEqual(card.x + card.width);
			await key.getByRole('button', { name: /^Scale:/ }).click();
			await expect(key.getByRole('listbox', { name: 'Scale' })).toBeVisible();
			await fits('Key', `the Scale list at ${size.width}`);
			await key.getByRole('option', { name: size.width === 568 ? 'Dorian' : 'Lydian', exact: true }).click();
			await key.getByRole('button', { name: 'Melody', exact: true }).click();
			// The keyboard beside the screen, Generate under the screen
			const kb = (await key.locator('.mm-kb').boundingBox())!;
			const screen = (await key.locator('.mm-screen').boundingBox())!;
			const gen = (await key.getByRole('button', { name: 'Generate melody' }).boundingBox())!;
			expect(kb.x + kb.width).toBeLessThan(screen.x);
			expect(gen.y).toBeGreaterThan(screen.y + screen.height - 1);
			expect(Math.abs(gen.x - screen.x)).toBeLessThan(2);
		}

		// FX: each pedal's name on a ribbon down its left edge, as tall as its face, the REV switch on
		// the reverb's face (PR 126; on its ribbon until then); the lo-fi pedal's reels in a window
		await page.getByRole('tab', { name: 'FX' }).click();
		for (const [cls, name] of [['delay-pedal', 'delay'], ['drive-pedal', 'overdrive'], ['reverb-pedal', 'reverb'], ['tape-pedal', 'lo-fi']]) {
			const ribbon = page.locator(`.pl-fx .${cls} .panel-bottom`);
			await expect(ribbon).toContainText(name);
			const r = (await ribbon.boundingBox())!;
			const face = (await page.locator(`.pl-fx .${cls} .panel-top`).boundingBox())!;
			expect(r.width, name).toBeLessThan(30);
			expect(r.x + r.width, name).toBeLessThanOrEqual(face.x + 1);
			expect(Math.abs(r.height - face.height), name).toBeLessThan(2);
			expect(face.height, name).toBeGreaterThan(220); // the phone's pedals stay tall
		}
		const rev = (await page.locator('.pl-fx').getByRole('switch', { name: 'Reverse reverb' }).boundingBox())!;
		expect(rev.x).toBeGreaterThan((await page.locator('.pl-fx .reverb-pedal .panel-top').boundingBox())!.x);
		await expect(page.locator('.pl-fx .tape-window')).toBeVisible();
		await expect(page.locator('.pl-fx .tape-window .reel')).toHaveCount(2);

		// Sound: FM's and Unison's ribbons, keys and mini knobs (no screens)
		await page.getByRole('tab', { name: 'Sound' }).click();
		const sound = page.locator('section[aria-label="Sound"]');
		await expect(sound.locator('.sp-pad')).toHaveCount(0);
		await sound.getByRole('switch', { name: 'FM' }).click();
		await sound.getByRole('button', { name: 'Metal', exact: true }).click();
		await expect(sound.getByRole('button', { name: 'Metal', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await sound.getByRole('switch', { name: 'Unison' }).click();
		await sound.getByRole('radio', { name: '2 voices' }).click();
		await expect(sound.getByRole('slider', { name: 'Detune' })).toBeVisible();
		await expect(sound.getByRole('slider', { name: 'Spread' })).toBeVisible();

		// Sample: REC records onto every pad, then Length and the dice; Random picks the waves again
		const length = sound.getByRole('slider', { name: 'Sample length' });
		await expect(length).toBeVisible();
		await sound.getByRole('button', { name: 'Record a sample' }).click();
		const strip = sound.locator('.st-pick');
		await expect(strip).toHaveAttribute('aria-pressed', 'true', { timeout: 6000 });
		await expect(sound.getByRole('switch', { name: 'Exclude Sample from Random' })).toHaveAttribute('aria-checked', 'true');
		await length.focus();
		await page.keyboard.press('Home');
		await expect(length).toHaveAttribute('aria-valuetext', /^\d+% · \d+ ms$/);
		await sound.getByRole('button', { name: 'SAW', exact: true }).click();
		await expect(sound.getByRole('button', { name: 'SAW', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await expect(strip).toHaveAttribute('aria-pressed', 'false');
		await sound.getByRole('button', { name: /^Random waves/ }).click();
		await page.waitForTimeout(700);
		const data = await saved();
		expect(data.synth.fm.enabled).toBe(true);
		expect(data.synth.fm.ratio).toBe(1.5);
		expect(data.synth.unison.enabled).toBe(true);
		expect(data.synth.unison.voices).toBe(2);
		expect(data.synth.sampleLength).toBeCloseTo(0.05);
		expect(data.synth.sample).toBeTruthy();

		// Mod: the LFO's ribbon, screen and patch bay; Noise's ribbon
		await page.getByRole('tab', { name: 'Mod' }).click();
		const mod = page.locator('section[aria-label="Mod"]');
		await expect(mod.locator('.lv-screen')).toBeVisible();
		await expect(mod.getByRole('switch', { name: 'LFO retrigger' })).toBeVisible();
		await expect(mod.getByRole('button', { name: 'Toggle noise' })).toBeVisible();
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

	test('PR 118: Bass on the phone: RHY | BASS, its pads and marks, the hold sheet, four macros, Sound with Mix', async ({ page }) => {
		const saved = async () => {
			await page.getByRole('button', { name: 'Menu' }).click();
			const menu = page.getByRole('dialog', { name: 'Menu' });
			await menu.getByRole('button', { name: 'File ▾' }).click();
			const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export file' }).click()]);
			if (await menu.isVisible()) await menu.getByRole('button', { name: 'Close menu' }).click();
			return JSON.parse(readFileSync((await download.path())!).toString('utf8')).data;
		};
		const machine = page.getByRole('radiogroup', { name: 'Machine' });
		await expect(machine.getByRole('radio', { name: 'Rhythm' })).toHaveAttribute('aria-checked', 'true');
		// A Rhythm step, so the Bass pads are seen to be Bass's own
		await phonePads(page).nth(0).click();
		await machine.getByRole('radio', { name: 'Bass' }).click();
		await expect(machine.getByRole('radio', { name: 'Bass' })).toHaveAttribute('aria-checked', 'true');
		await expect(phonePads(page).nth(0)).toHaveAttribute('aria-pressed', 'false');
		// Bass's four macros instead of Rhythm's
		for (const name of ['Cutoff', 'Reso', 'Env', 'Decay']) await expect(page.locator('.pl-play').getByRole('slider', { name, exact: true })).toBeVisible();
		await expect(page.locator('.pl-play').getByRole('slider', { name: 'Sweep', exact: true })).toHaveCount(0);

		// A tap turns a Bass step on, on A1
		await phonePads(page).nth(4).click();
		await expect(phonePads(page).nth(4)).toHaveAccessibleName('Step 5, A1');
		await phonePads(page).nth(5).click();
		// Holding a pad: notes in Bass's range, Accent, Slide and Tie (no Repeats)
		await holdPad(page, 4);
		const sheet = page.getByRole('dialog', { name: 'Step 5' });
		await expect(sheet).toBeVisible();
		await expect(sheet.getByRole('button', { name: '×3' })).toHaveCount(0);
		for (const n of await sheet.locator('.pl-n').allTextContents()) expect(Number(n.replace(/\D/g, ''))).toBeLessThanOrEqual(3);
		await sheet.getByRole('button', { name: 'Accent', exact: true }).click();
		await sheet.getByRole('button', { name: 'Slide', exact: true }).click();
		await expect(sheet.getByRole('button', { name: 'Slide', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await sheet.getByRole('button', { name: 'Done' }).click();
		await expect(phonePads(page).nth(4).locator('.pl-acc')).toHaveText('ACC');
		await expect(phonePads(page).nth(4).locator('.pl-link')).toHaveText('⤳');
		// Tie takes Slide's place
		await holdPad(page, 4);
		await sheet.getByRole('button', { name: 'Tie', exact: true }).click();
		await expect(sheet.getByRole('button', { name: 'Slide', exact: true })).toHaveAttribute('aria-pressed', 'false');
		await sheet.getByRole('button', { name: 'Done' }).click();
		await expect(phonePads(page).nth(4).locator('.pl-link')).toHaveText('═');

		// A macro turns Bass's cutoff
		const cutoff = page.locator('.pl-play').getByRole('slider', { name: 'Cutoff', exact: true });
		await cutoff.focus();
		await page.keyboard.press('End');
		await expect(cutoff).toHaveAttribute('aria-valuenow', '4000');

		// The steppers are Bass's presets
		await page.getByRole('button', { name: 'Next sound' }).click();
		await expect(page.getByRole('button', { name: 'All sounds' })).toContainText('Sub');
		await page.getByRole('button', { name: 'Next pattern' }).click();
		await expect(page.getByRole('button', { name: 'All patterns' })).toContainText('Root');
		await expect(phonePads(page).nth(0)).toHaveAttribute('aria-pressed', 'true');

		// Sound: Bass's sound, and a Mix group with Level, Pedals and the meter
		await page.getByRole('tab', { name: 'Sound' }).click();
		const sound = page.locator('section[aria-label="Sound"]');
		await expect(sound.getByRole('radio', { name: 'Saw' })).toBeVisible();
		const mix = sound.getByRole('group', { name: 'Bass mix' });
		await expect(mix.getByRole('meter', { name: 'Bass level meter' })).toBeVisible();
		const pedals = mix.getByRole('slider', { name: 'Pedals', exact: true });
		await pedals.focus();
		await page.keyboard.press('Home');
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect.poll(async () => Number(await mix.getByRole('meter').getAttribute('aria-valuenow')), { timeout: 5000 }).toBeGreaterThan(0);
		await page.getByRole('button', { name: 'Stop', exact: true }).click();

		// Nothing scrolls on Bass's pages, at either size
		for (const size of [{ width: 568, height: 320 }, { width: 844, height: 390 }]) {
			await page.setViewportSize(size);
			for (const [tab, label] of [['Pads', 'Play'], ['Sound', 'Sound']]) {
				await page.getByRole('tab', { name: tab }).click();
				const s = page.locator(`section[aria-label="${label}"]`);
				expect(await s.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1), `${tab} at ${size.width}`).toBe(true);
			}
			const bar = page.locator('.pl-top');
			expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
		}

		// Saved: the Sub sound, Bass all round the pedals, Root's pattern in Bass's lane
		const data = await saved();
		expect(data.bass.sound.cutoff).toBe(140);
		expect(data.bass.pedals).toBe(0);
		expect(data.bass.lane.steps.filter(Boolean)).toHaveLength(4);
	});

	test('PR 121: Drums on the phone: DRUM, its rows (tap, paint, hold), the picked row\'s knobs and Humanize, kits and patterns, Sound with Mix, halves on a small phone', async ({ page }) => {
		const saved = async () => {
			await page.getByRole('button', { name: 'Menu' }).click();
			const menu = page.getByRole('dialog', { name: 'Menu' });
			await menu.getByRole('button', { name: 'File ▾' }).click();
			const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export file' }).click()]);
			if (await menu.isVisible()) await menu.getByRole('button', { name: 'Close menu' }).click();
			return JSON.parse(readFileSync((await download.path())!).toString('utf8')).data;
		};
		const machine = page.getByRole('radiogroup', { name: 'Machine' });
		await machine.getByRole('radio', { name: 'Drums' }).click();
		await expect(machine.getByRole('radio', { name: 'Drums' })).toHaveAttribute('aria-checked', 'true');
		const play = page.locator('.pl-play');
		const row = (n: string) => play.getByRole('group', { name: `${n} steps` });
		const cell = (n: string, i: number) => play.getByRole('button', { name: `${n}, step ${i}`, exact: true });
		for (const n of ['Kick', 'Snare', 'Metal', 'Hat']) await expect(row(n).locator('.pl-dcell')).toHaveCount(16);
		await expect(page.locator('.pl-pad')).toHaveCount(0);
		// A drum has no note: the octave arrows are greyed out
		await expect(play.getByRole('button', { name: 'Octave up' })).toBeDisabled();

		// The steppers are Drums' kits and patterns
		await expect(page.getByRole('button', { name: 'All sounds' })).toContainText('Kit');
		await page.getByRole('button', { name: 'Next sound' }).click();
		await expect(page.getByRole('button', { name: 'All sounds' })).toContainText('Tight');
		await page.getByRole('button', { name: 'Next pattern' }).click();
		await expect(page.getByRole('button', { name: 'All patterns' })).toContainText('Four');
		await expect(row('Kick').locator('.pl-dcell[aria-pressed="true"]')).toHaveCount(4);
		await page.waitForTimeout(SETTLED);

		// A tap turns a step on; a finger drawn along a row paints it
		await cell('Kick', 2).click();
		await expect(cell('Kick', 2)).toHaveAttribute('aria-pressed', 'true');
		const box = async (i: number) => (await cell('Kick', i).boundingBox())!;
		const [b6, b7, b8] = [await box(6), await box(7), await box(8)];
		await page.mouse.move(b6.x + b6.width / 2, b6.y + b6.height / 2);
		await page.mouse.down();
		await page.mouse.move(b7.x + b7.width / 2, b7.y + b7.height / 2, { steps: 3 });
		await page.mouse.move(b8.x + b8.width / 2, b8.y + b8.height / 2, { steps: 3 });
		await page.mouse.up();
		for (const i of [6, 7, 8]) await expect(cell('Kick', i)).toHaveAttribute('aria-pressed', 'true');
		await expect(cell('Snare', 8)).toHaveAttribute('aria-pressed', 'false'); // the paint stays in its row
		// Holding a step: its velocity (and it's on)
		const s3 = (await cell('Snare', 3).boundingBox())!;
		await page.mouse.move(s3.x + s3.width / 2, s3.y + s3.height / 2);
		await page.mouse.down();
		await page.waitForTimeout(600);
		await page.mouse.up();
		const sheet = page.getByRole('dialog', { name: 'Snare, step 3' });
		await expect(sheet).toBeVisible();
		await sheet.getByLabel('Velocity').fill('0.4');
		await sheet.getByRole('button', { name: 'Done' }).click();
		await expect(cell('Snare', 3)).toHaveAttribute('aria-pressed', 'true');
		await expect(cell('Snare', 3)).toHaveAttribute('style', /--v: 40%/);

		// A tap on a row's name picks it: the knobs are its slot's, Humanize shapes its velocities
		await play.getByRole('button', { name: 'Pick Snare' }).click();
		await expect(play.getByRole('button', { name: 'Pick Snare' })).toHaveAttribute('aria-pressed', 'true');
		await expect(play.locator('.pl-dpicked')).toContainText('Snare');
		const tune = play.getByRole('slider', { name: 'Tune', exact: true });
		await tune.focus();
		await page.keyboard.press('End');
		await expect(tune).toHaveAttribute('aria-valuenow', '12');
		await page.getByRole('button', { name: 'Humanize' }).click();
		await page.getByRole('dialog', { name: 'Humanize' }).getByRole('button', { name: 'Ramp' }).click();
		// The row's LED mutes its slot
		await play.getByRole('switch', { name: 'Metal on' }).click();
		await expect(play.getByRole('switch', { name: 'Metal on' })).toHaveAttribute('aria-checked', 'false');

		// Sound: the four slot cards, and a Mix group with Level, Pedals and the meter
		await page.getByRole('tab', { name: 'Sound' }).click();
		const sound = page.locator('section[aria-label="Sound"]');
		await expect(sound.getByRole('group', { name: 'Drum slot 4' })).toBeVisible();
		await expect(sound.getByRole('group', { name: 'Drum sounds' })).toHaveCount(0);
		const mix = sound.getByRole('group', { name: 'Drums mix' });
		const level = mix.getByRole('slider', { name: 'Level', exact: true });
		await level.focus();
		await page.keyboard.press('End');
		await expect(level).toHaveAttribute('aria-valuenow', '1');
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect.poll(async () => Number(await mix.getByRole('meter', { name: 'Drums level meter' }).getAttribute('aria-valuenow')), { timeout: 5000 }).toBeGreaterThan(0);
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
		// Key: the Melody Maker dimmed, with the note
		await page.getByRole('tab', { name: 'Key' }).click();
		await expect(page.locator('section[aria-label="Key"]').getByText('The Melody Maker works on Rhythm and Bass')).toBeVisible();

		// A small phone: eight steps at a time, 1–8 | 9–16; the machine keys without LEDs; nothing scrolls
		await page.setViewportSize({ width: 568, height: 320 });
		await page.getByRole('tab', { name: 'Pads' }).click();
		await expect(row('Kick').locator('.pl-dcell')).toHaveCount(8);
		await expect(cell('Kick', 9)).toHaveCount(0);
		await page.getByRole('radio', { name: '9–16' }).click();
		await expect(cell('Kick', 9)).toHaveAttribute('aria-pressed', 'true');
		await expect(cell('Kick', 1)).toHaveCount(0);
		await expect(machine.locator('.pl-mled').first()).toBeHidden();
		for (const size of [{ width: 568, height: 320 }, { width: 844, height: 390 }]) {
			await page.setViewportSize(size);
			for (const [tab, label] of [['Pads', 'Play'], ['Sound', 'Sound'], ['Key', 'Key']]) {
				await page.getByRole('tab', { name: tab }).click();
				const s = page.locator(`section[aria-label="${label}"]`);
				expect(await s.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1), `${tab} at ${size.width}`).toBe(true);
			}
			const bar = page.locator('.pl-top');
			expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `top bar at ${size.width}`).toBe(true);
		}

		// Saved: the Tight kit with Snare tuned up, Metal muted; Four with the taps and the paint;
		// Snare's velocities Ramp's, Kick's untouched
		const data = await saved();
		expect(data.drums.slots[1].tune).toBe(12);
		expect(data.drums.slots[2].muted).toBe(true);
		expect(data.drums.slots[0].tune).toBe(2); // Tight's kick
		const on = (k: number) => data.drums.lane.rows[k].steps.map((x: boolean, i: number) => (x ? i : -1)).filter((i: number) => i >= 0);
		expect(on(0)).toEqual([0, 1, 4, 5, 6, 7, 8, 12]);
		expect(on(1)).toEqual([2, 4, 12]);
		expect(data.drums.lane.rows[1].velocities[7]).toBeLessThan(0.3);
		expect(data.drums.lane.rows[0].velocities[7]).toBe(1);
		expect(data.drums.level).toBe(1);
	});

	test('Drift on the phone (option C): the plates 3 × 2 over its bars, Copy, Bars, the X/Y pad, its sounds and progressions, Sound with Mix', async ({ page }) => {
		const saved = async () => {
			await page.getByRole('button', { name: 'Menu' }).click();
			const menu = page.getByRole('dialog', { name: 'Menu' });
			await menu.getByRole('button', { name: 'File ▾' }).click();
			const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export file' }).click()]);
			if (await menu.isVisible()) await menu.getByRole('button', { name: 'Close menu' }).click();
			return JSON.parse(readFileSync((await download.path())!).toString('utf8')).data;
		};
		const machine = page.getByRole('radiogroup', { name: 'Machine' });
		await machine.getByRole('radio', { name: 'Drift' }).click();
		await expect(machine.getByRole('radio', { name: 'Drift' })).toHaveAttribute('aria-checked', 'true');
		const play = page.locator('.pl-play');
		const plate = (name: string) => play.getByRole('button', { name: new RegExp(`^${name} \\(\\d+\\) in bar`) });
		const bar = (n: number) => play.getByRole('radio', { name: new RegExp(`^Bar ${n}:`) });
		// The plates 3 × 2, big enough to play; no step pads, no knobs: the X/Y pad in their place
		await expect(play.locator('.pdr-plate')).toHaveCount(6);
		await expect(page.locator('.pl-pad')).toHaveCount(0);
		const box = (await play.locator('.pdr-plate').first().boundingBox())!;
		expect(box.width).toBeGreaterThanOrEqual(120);
		expect(box.height).toBeGreaterThanOrEqual(100);
		await expect(play.locator('.df-xy')).toBeVisible();
		await expect(play.getByRole('slider')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'All patterns' })).toContainText('None');
		await expect(bar(1)).toContainText('tap a plate');

		// Bar 1: A, C, E is Am; Copy puts it into bar 2 and picks it; one undo step
		for (const n of ['A', 'C', 'E']) await plate(n).click();
		await expect(bar(1)).toHaveAccessibleName('Bar 1: Am');
		await expect(page.getByRole('button', { name: 'All patterns' })).toContainText('Own');
		await page.waitForTimeout(600);
		const copy = play.getByRole('button', { name: 'Copy → 2' });
		await copy.click();
		await expect(bar(2)).toHaveAccessibleName('Bar 2: Am');
		await expect(bar(2)).toHaveAttribute('aria-checked', 'true');
		await expect(plate('C')).toHaveAttribute('aria-pressed', 'true');
		// Bar 1's notes carry on into bar 2: three dashes run off its edge
		await expect(bar(1).locator('.pdr-dots i.carry')).toHaveCount(3);
		await page.waitForTimeout(600);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(bar(2)).toHaveAccessibleName('Bar 2: nothing held');
		await expect(bar(1)).toHaveAccessibleName('Bar 1: Am');
		await page.getByRole('button', { name: 'Redo' }).click();
		await expect(bar(2)).toHaveAccessibleName('Bar 2: Am');
		// Then one note changed: A to G, C E G is C
		await plate('A').click();
		await plate('G').click();
		await expect(bar(2)).toHaveAccessibleName('Bar 2: C');
		await expect(bar(1).locator('.pdr-dots i.carry')).toHaveCount(2);
		// Nothing after the last bar to copy into
		await bar(4).click();
		await expect(play.getByRole('button', { name: /^Copy/ })).toBeDisabled();

		// Bars 4 | 8
		await play.getByRole('radio', { name: '8 bars' }).click();
		await expect(play.locator('.pdr-bar')).toHaveCount(8);
		await expect(play.getByRole('button', { name: 'Copy → 5' })).toBeEnabled();
		await page.waitForTimeout(600);

		// The X/Y pad: the filter across, the spread up; a drag is one undo step
		const xy = (await play.locator('.df-xy').boundingBox())!;
		await page.mouse.move(xy.x + xy.width * 0.5, xy.y + xy.height * 0.5);
		await page.mouse.down();
		await page.mouse.move(xy.x + xy.width * 0.8, xy.y + xy.height * 0.3, { steps: 5 });
		await page.mouse.move(xy.x + xy.width - 1, xy.y + 1, { steps: 5 });
		await page.mouse.up();
		await page.waitForTimeout(600);
		let data = await saved();
		expect(data.drift.sound.cutoff).toBeGreaterThan(7500);
		expect(data.drift.sound.spread).toBeGreaterThan(0.95);
		expect(data.drift.length).toBe(8);
		expect(data.drift.chords[0]).toEqual([true, true, true, false, false, false]);
		await page.getByRole('button', { name: 'Undo' }).click();
		data = await saved();
		expect(data.drift.sound.cutoff).toBe(1800);
		expect(data.drift.sound.spread).toBe(0.6);
		expect(data.drift.length).toBe(8);

		// The steppers are Drift's sounds and progressions; a progression picks bar 1
		await page.getByRole('button', { name: 'Next pattern' }).click();
		await expect(page.getByRole('button', { name: 'All patterns' })).toContainText('Hold');
		await expect(bar(1)).toHaveAttribute('aria-checked', 'true');
		await page.getByRole('button', { name: 'Next sound' }).click();
		await expect(page.getByRole('button', { name: 'All sounds' })).toContainText('Strings');
		// It plays, and the tiny pads outline the bar playing
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		expect(await page.evaluate(() => (window as any).__peakOver(2500) as Promise<number>)).toBeGreaterThan(0.02);
		await expect(page.locator('.pl-mp.now').first()).toBeVisible();
		await page.getByRole('button', { name: 'Stop', exact: true }).click();

		// Sound: the swarm and its knobs with Filter and Spread (no second X/Y pad), and Mix
		await page.getByRole('tab', { name: 'Sound' }).click();
		const sound = page.locator('section[aria-label="Sound"]');
		for (const name of ['Voices', 'Drift', 'Wave', 'Filter', 'Spread', 'Attack', 'Release', 'Level', 'Reverb'])
			await expect(sound.getByRole('slider', { name, exact: true })).toBeVisible();
		await expect(sound.getByRole('meter', { name: 'Drift level meter' })).toBeVisible();
		await expect(sound.locator('.df-xy')).toHaveCount(0);
		// Key: the Melody Maker live (its key moves the plates), Generate dimmed
		await page.getByRole('tab', { name: 'Key' }).click();
		await expect(page.locator('section[aria-label="Key"] .module.melody')).toHaveClass(/drift-key/);

		// The first iPhone SE: 8 bars four at a time (1–4 | 5–8), the half following the picked bar;
		// the plates still a good size; nothing scrolls, the top bar's four machines fit
		await page.setViewportSize({ width: 568, height: 320 });
		await page.getByRole('tab', { name: 'Pads' }).click();
		await play.getByRole('radio', { name: '8 bars' }).click();
		await expect(play.locator('.pdr-bar')).toHaveCount(4);
		await play.getByRole('radio', { name: '5–8' }).click();
		await expect(bar(5)).toBeVisible();
		await expect(bar(1)).toHaveCount(0);
		const small = (await play.locator('.pdr-plate').first().boundingBox())!;
		expect(small.width).toBeGreaterThanOrEqual(80);
		expect(small.height).toBeGreaterThanOrEqual(80);
		for (const size of [{ width: 568, height: 320 }, { width: 844, height: 390 }]) {
			await page.setViewportSize(size);
			for (const [tab, label] of [['Pads', 'Play'], ['Sound', 'Sound'], ['Key', 'Key']]) {
				await page.getByRole('tab', { name: tab }).click();
				const sec = page.locator(`section[aria-label="${label}"]`);
				expect(await sec.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1), `${tab} at ${size.width}`).toBe(true);
			}
			const top = page.locator('.pl-top');
			expect(await top.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `top bar at ${size.width}`).toBe(true);
		}
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
		// A minor (the starting key and scale): the picker offers only its notes
		await page.getByRole('tab', { name: 'Key' }).click();
		await expect(page.getByRole('button', { name: 'Scale: Minor' })).toBeVisible();
		await page.getByRole('tab', { name: 'Pads' }).click();

		await holdPad(page, 2);
		const picker = page.getByRole('dialog', { name: 'Step 3' });
		await expect(picker).toBeVisible();
		const notes = await picker.locator('.pl-n').allTextContents();
		expect(notes).toHaveLength(16);
		for (const n of notes) expect(['A', 'B', 'C', 'D', 'E', 'F', 'G']).toContain(n.replace(/\d/g, ''));
		await picker.getByRole('button', { name: 'C4', exact: true }).click();
		const notesButton = picker.getByRole('button', { name: /^Repeat notes/ });
		await expect(notesButton).toBeDisabled(); // one hit: nothing to step through
		await picker.getByRole('button', { name: '×3' }).click();
		// What the repeats play: a tap goes Same → Up → Down
		await expect(notesButton).toHaveText('Same');
		await notesButton.click();
		await expect(notesButton).toHaveText('Up ↑');
		await picker.getByRole('button', { name: 'Done' }).click();
		// Picking a note turns the step on
		await expect(phonePads(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
		await expect(phonePads(page).nth(2)).toHaveAccessibleName('Step 3, C4');
		await expect(phonePads(page).nth(2).locator('.pl-rat')).toHaveText('×3↑');
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

		// While playing, a pattern changes at once too
		const before = await phonePads(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')).join());
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await page.getByRole('button', { name: 'Next pattern' }).click();
		await expect(page.getByRole('button', { name: 'All patterns' })).toContainText(PATTERNS[4].label);
		expect(await phonePads(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')).join())).not.toBe(before);
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
		// The playing pad: a bar along its top and a thick outline. Found and measured in one
		// call: the playing step moves on every 125 ms, so a second round trip could read a pad
		// it has just left (it failed that way once on GitHub, reading "auto")
		await expect(page.locator('.pl-pad.now')).toHaveCount(1);
		const look = await page.evaluate(() => {
			const el = document.querySelector('.pl-pad.now')!;
			return { bar: getComputedStyle(el, '::before').height, outline: getComputedStyle(el).outlineWidth };
		});
		expect(look).toEqual({ bar: '6px', outline: '3px' });
		await page.getByRole('button', { name: 'Stop', exact: true }).click();
	});

	test('the menu has the File bar and themes; Desktop View is remembered, and Phone view comes back', async ({ page }) => {
		await page.getByRole('button', { name: 'Menu' }).click();
		const menu = page.getByRole('dialog', { name: 'Menu' });
		await expect(menu.getByRole('button', { name: 'File ▾' })).toBeVisible();
		await expect(menu.getByRole('button', { name: 'Analog', exact: true })).toBeVisible();
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

	// PR 107: the desktop view upright: the pads in two rows of 8, caps a finger can hit, and the
	// shape screens let a finger scroll the page unless it lands on a grip
	test('the desktop view upright: two rows of pads, finger-sized caps, screens that scroll', async ({ page, context }) => {
		await page.getByRole('dialog', { name: 'Turn your phone' }).getByRole('button', { name: 'Use the desktop view instead' }).click();
		await expect(page.locator('.ds-grid')).toBeVisible();
		const pads = await page.locator('.step-card .padTEST').evaluateAll((els) => els.map((e) => {
			const r = e.getBoundingClientRect();
			return { x: Math.round(r.x), y: Math.round(r.y), w: r.width };
		}));
		expect(pads).toHaveLength(16);
		for (let i = 0; i < 8; i++) {
			expect(pads[i].y).toBe(pads[0].y);
			expect(pads[i + 8].y).toBe(pads[8].y);
			expect(pads[i + 8].x).toBe(pads[i].x);
		}
		expect(pads[8].y).toBeGreaterThan(pads[0].y);
		expect(pads[0].w).toBeGreaterThan(30);
		// The rows are centred in the card (no empty strip on the right)
		const card = (await page.locator('.step-card').boundingBox())!;
		const left = pads[0].x - card.x, right = card.x + card.width - (pads[7].x + pads[7].w);
		expect(Math.abs(left - right)).toBeLessThan(3);
		// Caps at least 32 px tall: the preset boxes, Pattern Tools, the ⋮ on each pad
		for (const sel of ['.preset-grid .pt-btn', '.pad-settings-dot']) {
			const hs = await page.locator(`.ds-grid ${sel}`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
			expect(hs.length).toBeGreaterThan(0);
			for (const h of hs) expect(h).toBeGreaterThanOrEqual(sel === '.pad-settings-dot' ? 28 : 32);
		}
		await page.getByRole('tab', { name: 'Compose' }).click();
		for (const h of await page.locator('.ds-grid .module .pt-btn:visible').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height)))
			expect(h).toBeGreaterThanOrEqual(32);

		// The screens: a finger dragged across one away from its grips scrolls the page and
		// changes nothing; one that starts on a grip moves it, and the page stays put
		await page.getByRole('tab', { name: 'Sound' }).click();
		const cdp = await context.newCDPSession(page);
		const swipe = async (x: number, y: number, dx: number, dy: number) => {
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
			for (let i = 1; i <= 10; i++) {
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }] });
				await page.waitForTimeout(16);
			}
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			await page.waitForTimeout(300);
		};
		const scrollY = () => page.evaluate(() => window.scrollY);
		const env = page.locator('.ds-sound .sp-pad').filter({ hasText: 'Envelope' });
		const envReadout = env.locator('.sp-title small');
		await env.scrollIntoViewIfNeeded();
		let box = (await env.boundingBox())!;
		let y0 = await scrollY();
		await swipe(box.x + box.width * 0.6, box.y + box.height * 0.4, 0, -120);
		expect(await scrollY()).toBeGreaterThan(y0 + 40);
		await expect(envReadout).toHaveText('20 ms · 400 ms');
		const decayGrip = (await env.locator('.sp-handle').nth(1).boundingBox())!;
		y0 = await scrollY();
		await swipe(decayGrip.x + decayGrip.width / 2, decayGrip.y + decayGrip.height / 2, 40, -60);
		expect(Math.abs((await scrollY()) - y0)).toBeLessThan(2);
		await expect(envReadout).not.toHaveText('20 ms · 400 ms');
		await expect(envReadout).toContainText('20 ms');
		// FM has no grip with a mouse; a finger gets one where Amount is (only while FM is on)
		const fm = page.getByRole('switch', { name: 'FM', exact: true }).locator('xpath=..');
		const fmGrip = fm.locator('.sp-touch-grip');
		await expect(fmGrip).toBeHidden();
		await page.getByRole('switch', { name: 'FM', exact: true }).tap();
		await expect(fmGrip).toBeVisible();
		const fmReadout = fm.locator('.sp-title small');
		const before = await fmReadout.textContent();
		// Instantly (Bootstrap's reboot makes scrolling smooth), and once the page is still, so the
		// grip's box is where the finger lands
		await fm.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
		await expect.poll(async () => {
			const a = await scrollY();
			await page.waitForTimeout(100);
			return a === (await scrollY());
		}).toBe(true);
		const g = (await fmGrip.boundingBox())!;
		y0 = await scrollY();
		await swipe(g.x + g.width / 2, g.y + g.height / 2, 0, -25);
		expect(Math.abs((await scrollY()) - y0)).toBeLessThan(2);
		await expect(fmReadout).not.toHaveText(before!);
	});
});

test("Melody Maker: an arpeggio's Octaves aren't held back by Range (PR 97: Narrow kept 3 octaves to two)", async ({ page }) => {
	const card = page.locator('.module.melody');
	await expect(card.getByRole('radiogroup', { name: 'Range' }).getByRole('radio', { name: 'Narrow' })).toHaveAttribute('aria-checked', 'true');
	await card.getByRole('button', { name: 'Arpeggio', exact: true }).click();
	const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
	const span = async () => {
		const labels = await page.locator('.step-card [aria-label^="Step "]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
		const midi = labels.map((l) => /, ([A-G])([#b]?)(-?\d+)/.exec(l)).filter(Boolean)
			.map((m) => 12 * (Number(m![3]) + 1) + NOTE[m![1]] + (m![2] === '#' ? 1 : m![2] === 'b' ? -1 : 0));
		expect(midi).toHaveLength(16);
		return Math.max(...midi) - Math.min(...midi);
	};
	// Each octave more spans an octave more (the cycle fills the bar, so not exactly); Narrow's
	// notes spanned 23 semitones at most, whatever Octaves said
	for (const [octaves, from, to] of [[1, 12, 12], [2, 13, 24], [3, 25, 36]] as const) {
		await card.getByRole('radiogroup', { name: 'Arp octaves' }).getByRole('radio', { name: String(octaves), exact: true }).click();
		await card.getByRole('button', { name: 'Generate arpeggio' }).click();
		const s = await span();
		expect(s, `${octaves} octaves`).toBeGreaterThanOrEqual(from);
		expect(s, `${octaves} octaves`).toBeLessThanOrEqual(to);
	}
});

test('a knob drag ends when the button turns out to be up, even if its release never reached the page', async ({ page }) => {
	await page.getByRole('button', { name: 'Lo-fi pedal' }).first().click();
	const knob = page.locator('[data-midi-id="tape.wobble"]').first();
	const box = (await knob.boundingBox())!;
	const x = box.x + box.width / 2, y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y - 400, { steps: 8 });
	await expect(knob).toHaveAttribute('aria-valuenow', '1');
	// The button let go where the page didn't hear it: the next move comes with no button held
	await page.evaluate(([cx, cy]) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: cx, clientY: cy, buttons: 0 })), [x, y + 300]);
	await expect(knob).toHaveAttribute('aria-valuenow', '1');
	await page.evaluate(([cx, cy]) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: cx, clientY: cy, buttons: 0 })), [x, y + 400]);
	await expect(knob).toHaveAttribute('aria-valuenow', '1');
	await page.mouse.up();
	// An ordinary drag still turns it, and its release still ends it
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y + 400, { steps: 8 });
	await page.mouse.up();
	await expect(knob).toHaveAttribute('aria-valuenow', '0');
	await page.mouse.move(x, y - 400, { steps: 4 });
	await expect(knob).toHaveAttribute('aria-valuenow', '0');
});

test('PR 99: the pedals: the name on a ribbon, every caption under its own knob, a rubber treadle; the deck is lo-fi', async ({ page }) => {
	const fx = page.locator('.module.fx');
	const pedals = ['delay', 'drive', 'reverb'];
	const overlap = (a: DOMRect | any, b: DOMRect | any) =>
		a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
	for (const width of [1600, 1024, 390]) {
		await page.setViewportSize({ width, height: 1000 });
		if (width < 1200) await page.getByRole('tab', { name: 'Effects' }).click();
		// No caption overlaps a knob or another caption, and each sits under its own knob
		const boxes = await page.evaluate((names) => names.map((n) => {
			const ped = document.querySelector(`.module.fx .${n}-pedal`)!;
			const rect = (e: Element) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
			return {
				pedal: rect(ped),
				ribbon: rect(ped.querySelector('.panel-bottom')!),
				treadle: rect(ped.querySelector('.footswitch')!),
				knobs: [...ped.querySelectorAll('.knob-cell')].map((c) => ({
					dial: rect(c.querySelector('.knob-dial')!), label: rect(c.querySelector('.knob-label')!),
				})),
			};
		}), pedals);
		for (const [i, b] of boxes.entries()) {
			const name = `${pedals[i]} at ${width}`;
			expect(b.knobs).toHaveLength(3); // the reverb's PRE went in PR 126
			for (const k of b.knobs) {
				expect(k.label.top, name).toBeGreaterThanOrEqual(k.dial.bottom - 1);
				for (const other of b.knobs) {
					if (other !== k) {
						expect(overlap(k.label, other.dial), name).toBe(false);
						expect(overlap(k.label, other.label), name).toBe(false);
					}
				}
			}
			// The name runs down the ribbon on the left; the treadle is inside the face, under the knobs
			expect(b.ribbon.left).toBeCloseTo(b.pedal.left, 0);
			expect(b.ribbon.bottom - b.ribbon.top).toBeCloseTo(b.pedal.bottom - b.pedal.top, 0);
			expect(b.treadle.left).toBeGreaterThan(b.ribbon.right);
			expect(b.treadle.bottom).toBeLessThanOrEqual(b.pedal.bottom);
			for (const k of b.knobs) expect(overlap(k.label, b.treadle), name).toBe(false);
		}
		// The deck is lo-fi, and TAPE | VINYL stays inside it
		const deck = fx.locator('.tape-pedal');
		await expect(deck.locator('.effect-label')).toHaveText(/lo-fi/);
		const inside = await deck.evaluate((d) => d.querySelector('.ms-vinyl')!.getBoundingClientRect().right <= d.getBoundingClientRect().right);
		expect(inside, `VINYL inside the deck at ${width}`).toBe(true);
	}
	// The treadles still switch their pedals, with names a screen reader can say
	for (const name of ['Delay pedal', 'Overdrive pedal', 'Reverb pedal', 'Lo-fi pedal']) {
		const sw = fx.getByRole('button', { name });
		await expect(sw).toHaveAttribute('aria-pressed', 'false');
		await sw.click();
		await expect(sw).toHaveAttribute('aria-pressed', 'true');
	}
});

test('Move: labelled caps whose rows line up with Step Fills\'; the Melody Maker\'s Scale keeps its width in both modes', async ({ page }) => {
	const tops = async (sel: string) => Promise.all((await page.locator(sel).all()).map(async (b) => Math.round((await b.boundingBox())!.y)));
	const move = page.locator('.pt-section-move .pt-btn');
	const scale = page.locator('.module.melody .mm-scale-row .mm-stepper');
	const card = page.locator('.module.melody');
	for (const width of [1600, 390]) {
		await page.setViewportSize({ width, height: 1000 });
		if (width < 1200) await page.getByRole('tab', { name: 'Compose' }).click();
		await expect(move).toHaveText(['↓ Oct', 'Oct ↑', '◂ Shift', 'Shift ▸', '⇄ Reverse']);
		const t = await tops('.pt-section-move .pt-btn');
		if (width === 1600) {
			// Three rows, two by two and Reverse across, level with Step Fills' three rows
			const fills = [...new Set(await tops('.pt-section:first-child .pt-btn'))];
			expect([...new Set(t)]).toEqual(fills);
			const rev = (await move.nth(4).boundingBox())!, oct = (await move.nth(0).boundingBox())!;
			expect(rev.width).toBeGreaterThan(oct.width * 1.8);
		} else {
			// A narrow card: the five on one row
			expect(new Set(t).size).toBe(1);
		}
		// The Scale stepper is as wide with Octaves beside it as with Narrow | Wide
		await card.getByText('Melody', { exact: true }).click();
		const melodyW = (await scale.boundingBox())!.width;
		await card.getByText('Arpeggio', { exact: true }).click();
		expect(Math.abs((await scale.boundingBox())!.width - melodyW)).toBeLessThan(1);
	}
});

// The Bass machine (the plan's item 4, part 1) START

const railRow = (page: Page, name: string) => page.locator('.mr-row', { has: page.getByRole('button', { name: `Show ${name}` }) });

test('the Bass machine: its rail row shows it on the pads and in Sound, with Accent, Slide and Tie; saved, one undo step each', async ({ page }) => {
	await expect(page.getByRole('button', { name: 'Show Bass' })).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('button', { name: 'Show Bass' }).click();
	await expect(page.getByRole('button', { name: 'Show Bass' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.step-card .ds-which')).toHaveText(' · Bass');
	await expect(page.getByRole('radiogroup', { name: 'Bass wave' })).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Cutoff', exact: true }).first()).toBeVisible();
	await expect(page.getByRole('group', { name: 'Repeats brush' })).toHaveCount(0);
	await page.waitForTimeout(SETTLED);

	await turnOnPads(page, [0, 1, 4]);
	// Rhythm's pads stayed as they were; the rail's Bass row shows the steps
	await expect(railRow(page, 'Bass').locator('.mr-cells i.on')).toHaveCount(3);
	await expect(railRow(page, 'Rhythm').locator('.mr-cells i.on')).toHaveCount(0);
	await page.getByRole('button', { name: 'Accent on step 1', exact: true }).click();
	await page.getByRole('button', { name: 'Slide on step 1', exact: true }).click();
	await expect(page.locator('.bp-link.slide')).toHaveCount(1);
	// Tie on the same step takes Slide's place
	await page.getByRole('button', { name: 'Tie on step 1', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Slide on step 1', exact: true })).toHaveAttribute('aria-pressed', 'false');
	await expect(page.locator('.bp-link.tie')).toHaveCount(1);
	await page.waitForTimeout(SETTLED);
	await page.getByRole('radio', { name: 'Square', exact: true }).click();
	await page.waitForTimeout(SETTLED);

	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	expect(saved.bass.lane.steps.slice(0, 5)).toEqual([true, true, false, false, true]);
	expect(saved.bass.lane.accents[0]).toBe(true);
	expect(saved.bass.lane.ties[0]).toBe(true);
	expect(saved.bass.lane.slides[0]).toBe(false);
	expect(saved.bass.lane.pitches[0]).toBeCloseTo(55);
	expect(saved.bass.sound.wave).toBe('square');
	expect(saved.patterns.slots[0].tracks.map((t: any) => t.machine)).toEqual(['rhythm', 'bass', 'drums']);

	// One undo step each: the wave, then the tie
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('radio', { name: 'Saw', exact: true })).toHaveAttribute('aria-checked', 'true');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Tie on step 1', exact: true })).toHaveAttribute('aria-pressed', 'false');

	// Back to Rhythm: its pads and Sound section
	await page.getByRole('button', { name: 'Show Rhythm' }).click();
	await expect(page.getByRole('radiogroup', { name: 'Bass wave' })).toBeHidden();
	await expect(page.getByRole('radiogroup', { name: 'Waveforms' })).toBeVisible();
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(0);
});

test('the Bass machine plays: live (muted from the rail), in the export at its pitch, a slide gliding without starting again', async ({ page }) => {
	await setTempo(page, 80); // a step is 0.1875 s
	// Bass alone: steps 1 and 3 on, A1 then A2, step 1's Slide doing nothing (step 2 is off); a
	// sound that holds its pitch (no sub, the filter's envelope off)
	await importChanged(page, 'Bass alone', (d) => {
		const n = 16, on = [0, 2];
		d.bass = {
			sound: { wave: 'saw', sub: 0, cutoff: 300, resonance: 0, envAmount: 0, decayMs: 2000, accent: 0.6, slideMs: 30 },
			muted: false, level: 0.8,
			lane: {
				steps: Array.from({ length: n }, (_, i) => on.includes(i)), velocities: Array(n).fill(1),
				pitches: Array.from({ length: n }, (_, i) => (i === 2 ? 110 : 55)),
				accents: Array(n).fill(false), slides: Array.from({ length: n }, (_, i) => i === 0), ties: Array(n).fill(false),
			},
		};
	});
	const bytes = await exportWav(page);
	expect(wavPeak(bytes)).toBeGreaterThan(0.05);
	expect(wavPitchHz(bytes, 0.05, 0.3)).toBeGreaterThan(50);
	expect(wavPitchHz(bytes, 0.05, 0.3)).toBeLessThan(60);
	expect(wavPitchHz(bytes, 0.45, 0.7)).toBeGreaterThan(100);
	expect(wavPitchHz(bytes, 0.45, 0.7)).toBeLessThan(120);

	// Now step 2 on too, step 1 sliding into it: one note gliding A1 → A1 (its own pitch), then
	// step 3; live, two notes a bar (two oscillators each), not three
	await page.getByRole('button', { name: 'Show Bass' }).click();
	await pads(page).nth(1).click();
	await page.getByRole('button', { name: 'Slide on step 2', exact: true }).click();
	const playAt = await page.evaluate(() => (window as any).__ctx.currentTime as number);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const peak = await page.evaluate(() => (window as any).__peakOver(1200) as Promise<number>);
	expect(peak).toBeGreaterThan(0.02);
	// Steps 1, 2 and 3 slide into one note: every oscillator started this bar starts on step 1
	// (without the slides, step 3 would start one 0.375 s later)
	const whens = await page.evaluate((t0) => (window as any).__starts
		.filter((s: any) => s.osc && s.when >= t0 - 0.01).map((s: any) => s.when as number), playAt);
	expect(whens.length).toBeGreaterThan(0);
	expect(Math.max(...whens) - Math.min(...whens)).toBeLessThan(0.01);
	// The rail's LED mutes it
	await railRow(page, 'Bass').getByRole('switch', { name: 'Bass on' }).click();
	await page.waitForTimeout(3200); // the held note dies away
	const after = await page.evaluate(() => (window as any).__swingOver(800) as Promise<number>); // the drive's steady offset aside
	expect(after).toBeLessThan(0.002);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('the Bass machine: a project from before it opens with an empty Bass lane; File → New empties it; slots keep their own', async ({ page }) => {
	await page.getByRole('button', { name: 'Show Bass' }).click();
	await turnOnPads(page, [0, 5]);
	// Pattern B: Bass empty; back to A: its two steps
	await page.getByRole('button', { name: 'Pattern B' }).click();
	await expect(page.locator('.pad-row .padTEST.selected')).toHaveCount(0);
	await pads(page).nth(3).click();
	await page.getByRole('button', { name: 'Pattern A' }).click();
	await expect(railRow(page, 'Bass').locator('.mr-cells i.on')).toHaveCount(2);
	await page.getByRole('button', { name: 'Pattern B' }).click();
	await expect(railRow(page, 'Bass').locator('.mr-cells i.on')).toHaveCount(1);

	await importChanged(page, 'Before Bass', (d) => { delete d.bass; d.patterns.slots = d.patterns.slots.map((s: any) => s && { tracks: s.tracks.filter((t: any) => t.machine === 'rhythm') }); });
	await expect(railRow(page, 'Bass').locator('.mr-cells i.on')).toHaveCount(0);
	await page.getByRole('button', { name: 'Pattern A' }).click();
	await expect(railRow(page, 'Bass').locator('.mr-cells i.on')).toHaveCount(0);
});

// The Bass machine END

// The rail's mixer (the plan's item 4, part 2a) START

// Bass on steps 1, 5, 9 and 13 (and Rhythm on 1 and 9), a sound that rings, the reverb on
async function importBassMix(page: Page, id: string, change: (d: any) => void = () => {}) {
	await importChanged(page, id, (d) => {
		const n = 16;
		const lane = d.instruments.find((i: any) => i.name === 'synth-voice');
		lane.steps = lane.steps.map((_: boolean, i: number) => i === 0 || i === 8);
		d.bass = {
			sound: { wave: 'saw', sub: 0.5, cutoff: 600, resonance: 0.3, envAmount: 2, decayMs: 300, accent: 0.6, slideMs: 60 },
			muted: false, level: 0.8, pedals: 1,
			lane: {
				steps: Array.from({ length: n }, (_, i) => i % 4 === 0), velocities: Array(n).fill(1), pitches: Array(n).fill(55),
				accents: Array(n).fill(false), slides: Array(n).fill(false), ties: Array(n).fill(false),
			},
		};
		d.fx.reverb = { ...d.fx.reverb, enabled: true, mix: 0.6, decay: 1.5 };
		change(d);
	});
}

test('the rail mixer: each machine has a meter that lights while it plays, and Pedals; saved, an undo step', async ({ page }) => {
	await importBassMix(page, 'Mixer');
	await expect(page.locator('.mr-heads')).toContainText('Pedals');
	const meter = (name: string) => railRow(page, name).getByRole('meter', { name: `${name} level meter` });
	await expect(meter('Bass')).toHaveAttribute('aria-valuenow', '0');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(async () => Number(await meter('Bass').getAttribute('aria-valuenow')), { timeout: 3000 }).toBeGreaterThan(2);
	await expect.poll(async () => Number(await meter('Rhythm').getAttribute('aria-valuenow')), { timeout: 3000 }).toBeGreaterThan(0);
	// Muted, its meter goes dark
	await railRow(page, 'Bass').getByRole('switch', { name: 'Bass on' }).click();
	await expect.poll(async () => Number(await meter('Bass').getAttribute('aria-valuenow')), { timeout: 4000 }).toBe(0);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await railRow(page, 'Bass').getByRole('switch', { name: 'Bass on' }).click();
	await page.waitForTimeout(SETTLED);

	// Pedals: Home turns it to none
	const pedals = page.getByRole('slider', { name: 'Bass into the pedals' });
	await expect(pedals).toHaveAttribute('aria-valuenow', '1');
	await pedals.focus();
	await page.keyboard.press('Home');
	await pedals.blur();
	await page.waitForTimeout(SETTLED);
	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	expect(saved.bass.pedals).toBe(0);
	expect(saved.mixer.rhythm.pedals).toBe(1);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(pedals).toHaveAttribute('aria-valuenow', '1');
});

test('the rail mixer: Pedals at none keeps a machine out of the reverb; machine stems add up to the mix; Bass in the MIDI file', async ({ page }) => {
	await setTempo(page, 120);
	// Rhythm all through the pedals, Bass none of it
	await importBassMix(page, 'Machines', (d) => { d.bass.pedals = 0; });
	const zip = await exportAudio(page, { bars: 1, ending: 'With tail', mix: true, stems: true, machineStems: true, midi: true, oneShot: false, normalize: false });
	const files = unzip(zip.bytes);
	const f = (part: string) => files[Object.keys(files).find((k) => k.endsWith(`_${part}.wav`))!];
	expect(Object.keys(files).filter((k) => k.endsWith('.wav')).map((k) => k.split('_').at(-1)).sort())
		.toEqual(['bass.wav', 'dry.wav', 'mix.wav', 'reverb.wav', 'rhythm.wav']);
	// The machine stems add up to the mix, sample for sample
	for (const ch of [0, 1]) {
		const mix = wavSamples(f('mix'), ch).samples;
		const [r, b] = ['rhythm', 'bass'].map((p) => wavSamples(f(p), ch).samples);
		let worst = 0;
		for (let i = 0; i < mix.length; i++) worst = Math.max(worst, Math.abs(r[i] + b[i] - mix[i]));
		expect(worst, `channel ${ch}`).toBeLessThan(1e-3);
		expect(r.length).toBe(mix.length);
	}
	expect(wavPeak(f('bass'))).toBeGreaterThan(0.05);
	// Bass's stem has no reverb: it's dry after its last note (step 13 starts at 1.5 s, a 0.3 s decay)
	expect(wavWindow(f('bass'), 2.4, 2.9).peak).toBeLessThan(1e-4);
	// ...while Rhythm's rings into the reverb after its last hit
	expect(wavWindow(f('rhythm'), 1.9, 2.4).peak).toBeGreaterThan(1e-3);

	// The MIDI file has Bass's four notes on channel 2
	const midi = files[Object.keys(files).find((k) => k.endsWith('.mid'))!];
	let bassOns = 0;
	for (let i = 0; i < midi.length - 2; i++) if (midi[i] === 0x91 && midi[i + 1] === 33) bassOns++;
	expect(bassOns).toBe(4);
});

// FX and Solo per machine (the plan's item 12): two caps on each rail row
test('FX and Solo: caps on each rail row; saved, one undo step each, File → New puts them back', async ({ page }) => {
	await importBassMix(page, 'FX and Solo');
	await page.waitForTimeout(SETTLED); // a new project's first moments are its starting point, not an undo step
	const fx = (name: string) => railRow(page, name).getByRole('switch', { name: `${name} FX` });
	const solo = (name: string) => railRow(page, name).getByRole('switch', { name: `Solo ${name}` });
	for (const name of ['Rhythm', 'Bass', 'Drums', 'Drift']) {
		await expect(fx(name)).toHaveAttribute('aria-checked', 'true');
		await expect(solo(name)).toHaveAttribute('aria-checked', 'false');
	}
	// The caps don't pick the row (as the LED and the knobs don't)
	await fx('Bass').click();
	await expect(fx('Bass')).toHaveAttribute('aria-checked', 'false');
	await expect(page.getByRole('button', { name: 'Show Bass' })).toHaveAttribute('aria-pressed', 'false');
	await page.waitForTimeout(SETTLED);
	await solo('Drums').click();
	await expect(solo('Drums')).toHaveAttribute('aria-checked', 'true');
	// The others dim
	await expect(railRow(page, 'Rhythm')).toHaveClass(/is-soloed-out/);
	await expect(railRow(page, 'Drums')).not.toHaveClass(/is-soloed-out/);
	await page.waitForTimeout(SETTLED);
	const saved = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	expect(saved.mixer.fx).toEqual({ rhythm: true, bass: false, drums: true, drift: true });
	expect(saved.mixer.solo).toEqual({ rhythm: false, bass: false, drums: true, drift: false });
	// One undo step each
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(solo('Drums')).toHaveAttribute('aria-checked', 'false');
	await expect(fx('Bass')).toHaveAttribute('aria-checked', 'false');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(fx('Bass')).toHaveAttribute('aria-checked', 'true');
	// File → New: FX on, nothing soloed
	await fx('Rhythm').click();
	await solo('Bass').click();
	await chooseFromFileMenu(page, 'New');
	await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
	await expect(fx('Rhythm')).toHaveAttribute('aria-checked', 'true');
	await expect(solo('Bass')).toHaveAttribute('aria-checked', 'false');
	await expect(railRow(page, 'Rhythm')).not.toHaveClass(/is-soloed-out/);
});

test('FX off plays a machine dry, round every pedal; Solo leaves the others out, live, in the export and the MIDI file', async ({ page }) => {
	await setTempo(page, 120);
	// Rhythm (steps 1 and 9) and Bass (every beat) through a big reverb; the lo-fi pedal on too
	const files = async (id: string, mixer: any) => {
		await importBassMix(page, id, (d) => {
			d.fx.tape = { enabled: true, age: 0.6, wobble: 0, mode: 'tape' };
			d.mixer = { rhythm: { pedals: 1 }, ...mixer };
		});
		const zip = await exportAudio(page, { bars: 1, ending: 'With tail', mix: true, stems: true, machineStems: true, midi: true, oneShot: false, normalize: false });
		const all = unzip(zip.bytes);
		return (part: string) => all[Object.keys(all).find((k) => k.endsWith(part))!];
	};
	// FX on: Rhythm's stem rings into the reverb after its last hit (step 9 at 1 s; its 0.42 s
	// decay is over by 1.5 s), and the lo-fi pedal's hiss is in it
	const wet = await files('FX on', {});
	expect(wavWindow(wet('_rhythm.wav'), 1.9, 2.4).peak).toBeGreaterThan(1e-3);
	// FX off: Rhythm is dry, its stem silent after its last note; Bass still rings
	const dryF = await files('FX off', { fx: { rhythm: false } });
	expect(wavPeak(dryF('_rhythm.wav'))).toBeGreaterThan(0.02);
	expect(wavWindow(dryF('_rhythm.wav'), 1.9, 2.4).peak).toBeLessThan(1e-4);
	expect(wavWindow(dryF('_bass.wav'), 2.4, 2.9).peak).toBeGreaterThan(1e-3);
	// The machine stems still add up to the mix (the lo-fi pedal bends the sum: nearly)
	for (const ch of [0, 1]) {
		const mix = wavSamples(dryF('_mix.wav'), ch).samples;
		const [r, b] = ['_rhythm.wav', '_bass.wav'].map((p) => wavSamples(dryF(p), ch).samples);
		let worst = 0;
		for (let i = 0; i < mix.length; i++) worst = Math.max(worst, Math.abs(r[i] + b[i] - mix[i]));
		expect(worst, `channel ${ch}`).toBeLessThan(0.05);
	}

	// Bass soloed: Rhythm is left out of the mix and the MIDI file; Bass's notes are there
	const soloF = await files('Solo Bass', { solo: { bass: true } });
	const midi = soloF('.mid');
	let rhythmOns = 0, bassOns = 0;
	for (let i = 0; i < midi.length - 2; i++) {
		if (midi[i] === 0x90 && midi[i + 2] > 0) rhythmOns++;
		if (midi[i] === 0x91 && midi[i + 1] === 33) bassOns++;
	}
	expect(rhythmOns).toBe(0);
	expect(bassOns).toBe(4);
	const mix = wavSamples(soloF('_mix.wav'), 0).samples, bassOnly = wavSamples(soloF('_bass.wav'), 0).samples;
	let diff = 0;
	for (let i = 0; i < mix.length; i++) diff = Math.max(diff, Math.abs(mix[i] - bassOnly[i]));
	expect(diff).toBeLessThan(0.05);

	// Live: Drums soloed (its rows empty), nothing is heard; unsoloed, Rhythm and Bass play
	await importBassMix(page, 'Solo live', (d) => {
		d.fx.tape = { ...d.fx.tape, enabled: false }; // its hiss plays while the sequencer does
		d.mixer = { rhythm: { pedals: 1 }, solo: { drums: true } };
	});
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	expect(await page.evaluate(() => (window as any).__swingOver(1200) as Promise<number>)).toBeLessThan(0.01);
	await railRow(page, 'Drums').getByRole('switch', { name: 'Solo Drums' }).click();
	expect(await page.evaluate(() => (window as any).__swingOver(1200) as Promise<number>)).toBeGreaterThan(0.05);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

// The rail's mixer END

// The Bass machine, part 2b START

test('Bass sounds and patterns: the transport\'s boxes are Bass\'s while Bass is shown; lit, the dice, one undo step', async ({ page }) => {
	await expect(page.getByRole('button', { name: 'Kick', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Show Bass' }).click();
	await expect(page.getByRole('button', { name: 'Kick', exact: true })).toHaveCount(0);
	await expect(page.getByText('Bass sounds')).toBeVisible();
	await page.waitForTimeout(SETTLED);

	const acid = page.getByRole('button', { name: 'Acid', exact: true });
	await acid.click();
	await expect(acid).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('slider', { name: 'Reso', exact: true })).toHaveAttribute('aria-valuenow', '0.85');
	const squelch = page.getByRole('button', { name: 'Squelch', exact: true });
	await squelch.click();
	await expect(squelch).toHaveAttribute('aria-pressed', 'true');
	await expect(railRow(page, 'Bass').locator('.mr-cells i.on')).toHaveCount(13);
	// Rhythm's pattern stayed empty
	await expect(railRow(page, 'Rhythm').locator('.mr-cells i.on')).toHaveCount(0);
	await page.waitForTimeout(SETTLED);
	// A knob turned: unlit
	const cutoff = page.getByRole('slider', { name: 'Cutoff', exact: true }).first();
	await cutoff.focus();
	await page.keyboard.press('ArrowUp');
	await cutoff.blur();
	await expect(acid).toHaveAttribute('aria-pressed', 'false');
	await page.waitForTimeout(SETTLED);
	// Undo: Acid lit again
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(acid).toHaveAttribute('aria-pressed', 'true');

	// The dice: a new pattern, nothing lit
	await page.getByRole('button', { name: 'Random bass pattern' }).click();
	await expect(squelch).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('button', { name: 'Random bass sound' }).click();
	await expect(acid).toHaveAttribute('aria-pressed', 'false');

	// Back to Rhythm: its boxes
	await page.getByRole('button', { name: 'Show Rhythm' }).click();
	await expect(page.getByRole('button', { name: 'Kick', exact: true })).toBeVisible();
});

test('Pattern Tools and Generate edit the machine shown: Bass\'s steps, its notes in its range', async ({ page }) => {
	await turnOnPads(page, [0, 4]); // Rhythm
	await page.getByRole('button', { name: 'Show Bass' }).click();
	await page.getByRole('button', { name: 'Walk', exact: true }).click();
	await page.waitForTimeout(SETTLED);
	const bass = async () => JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	const before = (await bass()).bass.lane;

	// Shift later: Bass's lists move a step, its slide too; Rhythm's don't
	await page.getByRole('button', { name: 'Shift later' }).click();
	await page.waitForTimeout(SETTLED);
	const after = await bass();
	expect(after.bass.lane.steps).toEqual([before.steps[15], ...before.steps.slice(0, 15)]);
	expect(after.bass.lane.slides).toEqual([before.slides[15], ...before.slides.slice(0, 15)]);
	expect(after.instruments.find((i: any) => i.name === 'synth-voice').steps.slice(0, 5)).toEqual([true, false, false, false, true]);

	// Step Fills' All turns every Bass step on
	await page.locator('.module.pattern-tools, .pattern-tools').first().getByRole('button', { name: 'All', exact: true }).click();
	await expect(railRow(page, 'Bass').locator('.mr-cells i.on')).toHaveCount(16);

	// Generate: new notes for Bass's pads, every one within 30–250 Hz
	const card = page.locator('.module.melody');
	await card.getByRole('button', { name: 'Generate melody' }).click();
	await page.waitForTimeout(SETTLED);
	const gen = await bass();
	expect(gen.bass.lane.pitches.every((hz: number) => hz >= 30 && hz <= 250)).toBe(true);
	// Narrow is two octaves down for Bass: its notes sit low (under 130 Hz), not at the top of its range
	expect(Math.max(...gen.bass.lane.pitches)).toBeLessThan(130);
	expect(new Set(gen.bass.lane.pitches.map((hz: number) => Math.round(hz))).size).toBeGreaterThan(1);
	expect(gen.instruments.find((i: any) => i.name === 'synth-voice').pitches.every((hz: number) => hz >= 100)).toBe(true);
});

// The Bass machine, part 2b END

// The Drums machine START

// A project with the Drums machine's rows set: `on[k]` the steps that are on in row k
async function importDrums(page: Page, id: string, on: number[][], change: (d: any) => void = () => { }) {
	await importChanged(page, id, (d) => {
		d.drums.lane.rows = on.map((steps) => ({
			steps: Array.from({ length: 16 }, (_, i) => steps.includes(i)), velocities: Array(16).fill(1),
		}));
		change(d);
	});
}

test('the Drums machine: four rows on the pads; steps, velocity by dragging, mutes, the picked row for Pattern Tools; saved, one undo step each', async ({ page }) => {
	await page.getByRole('button', { name: 'Show Drums' }).click();
	await expect(page.locator('.step-card .ds-which')).toHaveText(' · Drums');
	for (const n of ['Kick', 'Snare', 'Metal', 'Hat']) await expect(page.getByRole('group', { name: `${n} steps` }).getByRole('button', { name: /, step / })).toHaveCount(16);
	await expect(page.getByRole('group', { name: 'Repeats brush' })).toHaveCount(0);
	// The preset boxes are Drums' kits and patterns (the item's part 2)
	await expect(page.getByRole('group', { name: 'Sound presets' })).toHaveCount(0);
	await expect(page.getByRole('group', { name: 'Drum kits' })).toBeVisible();
	// The Melody Maker has nothing to do here; Pattern Tools' octave arrows neither
	await expect(page.getByText('The Melody Maker works on Rhythm and Bass')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Octave up' }).first()).toBeDisabled();
	await page.waitForTimeout(SETTLED);

	const step = (row: string, i: number) => page.getByRole('button', { name: `${row}, step ${i}`, exact: true });
	await step('Kick', 1).click();
	await step('Kick', 9).click();
	await step('Snare', 5).click();
	await expect(step('Kick', 1)).toHaveAttribute('aria-pressed', 'true');
	// The rail's Drums row shows them, stacked (Kick on top)
	await expect(railRow(page, 'Drums').locator('.mr-stack').nth(0).locator('b').first()).toHaveAttribute('style', /background/);
	await expect(railRow(page, 'Drums').locator('.mr-stack').nth(4).locator('b').nth(1)).toHaveAttribute('style', /background/);
	// Rhythm's pads stayed off
	await page.waitForTimeout(SETTLED);

	// A lit step dragged down: softer
	const box = (await step('Kick', 9).boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 5 });
	await page.mouse.up();
	await expect(step('Kick', 9)).toHaveAttribute('title', /50%/);
	await expect(step('Kick', 9)).toHaveAttribute('aria-pressed', 'true'); // a drag doesn't toggle
	await page.waitForTimeout(SETTLED);

	// Pick the Snare row: Step Fills work on it, Shift moves every row
	await page.getByRole('button', { name: 'Pick Snare' }).click();
	await expect(page.getByRole('heading', { name: 'Pattern Tools · Snare' })).toBeVisible();
	await page.getByRole('button', { name: 'Every 4', exact: true }).click();
	for (const i of [1, 5, 9, 13]) await expect(step('Snare', i)).toHaveAttribute('aria-pressed', 'true');
	await expect(step('Kick', 5)).toHaveAttribute('aria-pressed', 'false');
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Shift later' }).click();
	await expect(step('Kick', 2)).toHaveAttribute('aria-pressed', 'true');
	await expect(step('Snare', 2)).toHaveAttribute('aria-pressed', 'true');
	await page.waitForTimeout(SETTLED);
	// Undo: back one step at a time
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(step('Kick', 1)).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(step('Snare', 9)).toHaveAttribute('aria-pressed', 'false');

	// A slot's LED mutes it; the rail's mutes the machine
	await page.getByRole('group', { name: 'Hat steps' }).getByRole('switch', { name: 'Hat on' }).click();
	await railRow(page, 'Drums').getByRole('switch', { name: 'Drums on' }).click();
	await page.getByRole('slider', { name: 'Hat tune' }).focus();
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await page.waitForTimeout(SETTLED);

	const data = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	expect(data.drums.muted).toBe(true);
	expect(data.drums.slots[3]).toMatchObject({ sound: 'kit:hat', muted: true, tune: 2 });
	expect(data.drums.lane.rows[0].steps.map((s: boolean, i: number) => (s ? i : -1)).filter((i: number) => i >= 0)).toEqual([0, 8]);
	expect(data.drums.lane.rows[0].velocities[8]).toBeCloseTo(0.5, 1);
	// Pattern A's Drums track is the rows
	expect(data.patterns.slots[0].tracks.find((t: any) => t.machine === 'drums').rows[1].steps[4]).toBe(true);

	// Pattern B has its own (empty) rows; back to A brings them back
	await page.getByRole('button', { name: 'Pattern B' }).click();
	await expect(step('Kick', 1)).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('button', { name: 'Pattern A' }).click();
	await expect(step('Kick', 1)).toHaveAttribute('aria-pressed', 'true');

	// File → New: the kit again, empty rows
	await chooseFromFileMenu(page, 'New');
	await page.getByRole('button', { name: 'Show Drums' }).click();
	await expect(step('Kick', 1)).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByRole('group', { name: 'Hat steps' }).getByRole('switch', { name: 'Hat on' })).toHaveAttribute('aria-checked', 'true');
});

test('the Drums machine plays: the kit at its steps in the export, its stem and MIDI channel 10; live, muted from the rail; a picture plays its hit', async ({ page }) => {
	await setTempo(page, 120); // a step is 0.125 s
	await importDrums(page, 'Drums alone', [[0, 8], [4], [], []]);
	const zip = await exportAudio(page, { bars: 1, ending: 'With tail', mix: true, stems: false, machineStems: true, midi: true, oneShot: false, normalize: false });
	const files = unzip(zip.bytes);
	const f = (part: string) => files[Object.keys(files).find((k) => k.endsWith(`_${part}.wav`))!];
	expect(Object.keys(files).filter((k) => k.endsWith('.wav')).map((k) => k.split('_').at(-1)).sort()).toEqual(['drums.wav', 'mix.wav', 'rhythm.wav']);
	const mix = f('mix');
	// The kick on step 1, the snare on step 5 (0.5 s), the kick again on step 9 (1 s); quiet between
	expect(wavWindow(mix, 0, 0.05).peak).toBeGreaterThan(0.2);
	expect(wavWindow(mix, 0.4, 0.49).peak).toBeLessThan(0.02);
	expect(wavWindow(mix, 0.5, 0.56).peak).toBeGreaterThan(0.1);
	expect(wavWindow(mix, 0.75, 0.99).peak).toBeLessThan(0.02);
	expect(wavWindow(mix, 1, 1.05).peak).toBeGreaterThan(0.2);
	// The drums stem is all of it (Rhythm has no step on)
	const d = wavSamples(f('drums')).samples, m = wavSamples(mix).samples;
	let worst = 0;
	for (let i = 0; i < m.length; i++) worst = Math.max(worst, Math.abs(d[i] - m[i]));
	expect(worst).toBeLessThan(1e-3);
	// The MIDI file: the kicks and the snare on channel 10 (General MIDI's 36 and 38)
	const midi = files[Object.keys(files).find((k) => k.endsWith('.mid'))!];
	const ons = (note: number) => { let c = 0; for (let i = 0; i < midi.length - 2; i++) if (midi[i] === 0x99 && midi[i + 1] === note && midi[i + 2] > 0) c++; return c; };
	expect([ons(36), ons(38)]).toEqual([2, 1]);

	// Live: it plays; the rail's LED mutes it
	await page.getByRole('button', { name: 'Show Drums' }).click();
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	expect(await page.evaluate(() => (window as any).__peakOver(1100) as Promise<number>)).toBeGreaterThan(0.05);
	await railRow(page, 'Drums').getByRole('switch', { name: 'Drums on' }).click();
	await page.waitForTimeout(500);
	expect(await page.evaluate(() => (window as any).__swingOver(800) as Promise<number>)).toBeLessThan(0.002);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await railRow(page, 'Drums').getByRole('switch', { name: 'Drums on' }).click();

	// Stopped, a click on a slot's picture plays its hit, and one of the shelf's sounds too
	await page.waitForTimeout(500);
	await page.getByRole('button', { name: 'Hear slot 1: Kick' }).click();
	expect(await page.evaluate(() => (window as any).__peakOver(300) as Promise<number>)).toBeGreaterThan(0.05);
	await page.waitForTimeout(500);
	await page.getByRole('button', { name: 'Hear Hat', exact: true }).click();
	expect(await page.evaluate(() => (window as any).__peakOver(200) as Promise<number>)).toBeGreaterThan(0.02);
});

test('Keep as drum: a hit of Rhythm\'s sound on the shelf and in a slot, one undo step; deleted; saved. Bass\'s screen plays its note', async ({ page }) => {
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Keep as drum in slot 4' }).click();
	await expect(page.getByRole('group', { name: 'Keep as drum' })).toContainText('Kept as Kept 1, in Drums slot 4');
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Show Drums' }).click();
	await expect(page.getByRole('button', { name: 'Hear slot 4: Kept 1' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Pick Kept 1' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Hear Kept 1' })).toBeVisible();
	const data = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	expect(data.drums.kept).toHaveLength(1);
	expect(data.drums.kept[0]).toMatchObject({ id: 'kept:1', name: 'Kept 1' });
	expect(data.drums.kept[0].data.length).toBeGreaterThan(1000);
	expect(data.drums.slots[3].sound).toBe('kept:1');
	// It plays
	await page.getByRole('button', { name: 'Hear slot 4: Kept 1' }).click();
	expect(await page.evaluate(() => (window as any).__peakOver(300) as Promise<number>)).toBeGreaterThan(0.02);
	// One undo step; redo; then deleted, the slot goes back to the kit's Hat
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Hear slot 4: Hat' })).toBeVisible();
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Hear slot 4: Kept 1' })).toBeVisible();
	await page.getByRole('button', { name: 'Delete Kept 1' }).click();
	await expect(page.getByRole('button', { name: 'Hear slot 4: Hat' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Hear Kept 1' })).toHaveCount(0);
	// A slot's ◂ ▸ steps through the sounds
	await page.getByRole('button', { name: 'Slot 1: next sound' }).click();
	await expect(page.getByRole('button', { name: 'Hear slot 1: Snare' })).toBeVisible();

	// Bass's screen: a click plays the note it draws
	await page.getByRole('button', { name: 'Show Bass' }).click();
	await page.waitForTimeout(400);
	await page.getByRole('button', { name: 'Hear A1' }).click();
	expect(await page.evaluate(() => (window as any).__peakOver(300) as Promise<number>)).toBeGreaterThan(0.02);
});

// The plan's item 11: a chip beside Keep as drum draws the hit Keep would save, and plays it while
// stopped. The head keeps its height; the chip follows the sound; it's Rhythm's only
test('Keep as drum: the chip draws and plays the hit Keep would save', async ({ page }) => {
	await page.waitForTimeout(SETTLED);
	const chip = page.getByRole('button', { name: /^Hear the hit Keep would save: A3 Sine, \d+ ms$/ });
	await expect(chip).toBeVisible();
	expect(Math.round((await page.locator('.ds-sound-head').boundingBox())!.height)).toBeLessThanOrEqual(19);
	const box = (await chip.boundingBox())!;
	expect(box.height).toBeLessThanOrEqual(18);
	// After the title, before the caps
	expect(box.x).toBeGreaterThan((await page.locator('.keep-drum__cap').boundingBox())!.x);
	expect(box.x + box.width).toBeLessThan((await page.getByRole('button', { name: 'Keep as drum in slot 1' }).boundingBox())!.x);
	// It plays while stopped
	await chip.click();
	expect(await page.evaluate(() => (window as any).__peakOver(300) as Promise<number>)).toBeGreaterThan(0.02);
	// Its length is the kept sound's
	const ms = Number((await chip.getAttribute('aria-label'))!.match(/(\d+) ms$/)![1]);
	await page.getByRole('button', { name: 'Keep as drum in slot 2' }).click();
	await expect(page.getByRole('group', { name: 'Keep as drum' })).toContainText('Kept as Kept 1');
	await page.waitForTimeout(SETTLED);
	const kept = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data.drums.kept[0];
	const samples = (kept.data.length * 3) / 4 / 2;
	expect(Math.abs((samples / kept.sampleRate) * 1000 - ms)).toBeLessThanOrEqual(2);
	// A new sound: a new picture
	const before = await page.locator('.keep-hit path').getAttribute('d');
	await page.getByRole('button', { name: 'Kick', exact: true }).click();
	await expect(page.locator('.keep-hit path')).not.toHaveAttribute('d', before!);
	await expect(page.getByRole('button', { name: /^Hear the hit Keep would save: A3 / })).toBeVisible();
	// Silent while playing (the pads are empty, so anything heard would be the chip's)
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(300);
	await page.locator('.keep-hit').click();
	expect(await page.evaluate(() => (window as any).__swingOver(300) as Promise<number>)).toBeLessThan(0.01);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	// Rhythm's only
	await page.getByRole('button', { name: 'Show Bass' }).click();
	await expect(page.locator('.keep-hit')).toHaveCount(0);
});

test('the Drums machine: a project from before it opens with the kit and empty rows', async ({ page }) => {
	await importChanged(page, 'Before Drums', (d) => {
		delete d.drums;
		for (const s of d.patterns.slots) if (s) s.tracks = s.tracks.filter((t: any) => t.machine !== 'drums');
	});
	await page.getByRole('button', { name: 'Show Drums' }).click();
	await expect(page.getByRole('button', { name: 'Hear slot 1: Kick' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Hear slot 4: Hat' })).toBeVisible();
	await expect(page.getByRole('group', { name: 'Kick steps' }).locator('.dp-cell[aria-pressed="true"]')).toHaveCount(0);
	// Nothing changed by opening it: no unsaved dot
	await expect(page.locator('.pc-primary')).toHaveText('Saved');
});

test('Drum kits and Drum patterns: the transport\'s boxes while Drums is shown; lit, the dice, one undo step each', async ({ page }) => {
	await page.getByRole('button', { name: 'Show Drums' }).click();
	const kits = page.getByRole('group', { name: 'Drum kits' });
	const patterns = page.getByRole('group', { name: 'Drum patterns' });
	await expect(kits).toBeVisible();
	await expect(patterns).toBeVisible();
	// A fresh page plays the kit as it comes: Kit is lit; no pattern yet
	await expect(kits.getByRole('button', { name: 'Kit', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(patterns.locator('[aria-pressed="true"]')).toHaveCount(0);
	await page.waitForTimeout(SETTLED);

	// A kit: the slots' Tune, Decay and Level; a slot's mute kept
	await page.getByRole('switch', { name: 'Metal on' }).first().click();
	const deep = kits.getByRole('button', { name: 'Deep', exact: true });
	await deep.click();
	await expect(deep).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('slider', { name: 'Kick tune' })).toHaveAttribute('aria-valuenow', '-5');
	await expect(page.getByRole('slider', { name: 'Metal tune' })).toHaveAttribute('aria-valuenow', '-7');
	await expect(page.getByRole('switch', { name: 'Metal on' }).first()).toHaveAttribute('aria-checked', 'false');
	await page.waitForTimeout(SETTLED);

	// A pattern: the rows, the kit untouched
	const breaks = patterns.getByRole('button', { name: 'Breaks', exact: true });
	await breaks.click();
	await expect(breaks).toHaveAttribute('aria-pressed', 'true');
	const on = (row: string) => page.getByRole('group', { name: `${row} steps` }).locator('.dp-cell[aria-pressed="true"]');
	await expect(on('Kick')).toHaveCount(3);
	await expect(on('Snare')).toHaveCount(4);
	await expect(on('Hat')).toHaveCount(10);
	await expect(deep).toHaveAttribute('aria-pressed', 'true');
	// Rhythm's pattern stayed empty
	await expect(railRow(page, 'Rhythm').locator('.mr-cells i.on')).toHaveCount(0);
	await page.waitForTimeout(SETTLED);

	// A step changed: unlit; Undo lights it again
	await page.getByRole('button', { name: 'Kick, step 2', exact: true }).click();
	await expect(breaks).toHaveAttribute('aria-pressed', 'false');
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(breaks).toHaveAttribute('aria-pressed', 'true');
	// One more undo: the kit as it was, the pattern too stays (separate steps)
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(on('Kick')).toHaveCount(0);
	await expect(deep).toHaveAttribute('aria-pressed', 'true');

	// The dice: a new kit and a new pattern, nothing lit; a kick on step 1
	await page.getByRole('button', { name: 'Random kit' }).click();
	await page.getByRole('button', { name: 'Random drum pattern' }).click();
	// (the random kit may have put another sound in slot 1, which names its row: the first row)
	await expect(page.getByRole('group', { name: / steps$/ }).first().locator('.dp-cell').first()).toHaveAttribute('aria-pressed', 'true');
	await expect(patterns.locator('[aria-pressed="true"]')).toHaveCount(0);

	// Back to Rhythm: its boxes
	await page.getByRole('button', { name: 'Show Rhythm' }).click();
	await expect(page.getByRole('group', { name: 'Sound presets' })).toBeVisible();
});

test('the old hidden drum lanes: a project from before the Drums machine gets their steps in its rows', async ({ page }) => {
	await importChanged(page, 'Old lanes', (d) => {
		delete d.drums;
		for (const s of d.patterns.slots) if (s) s.tracks = s.tracks.filter((t: any) => t.machine !== 'drums');
		const steps = (...k: number[]) => Array.from({ length: 16 }, (_, i) => k.includes(i));
		d.instruments.push(
			{ name: 'kick', label: 'Kick', type: 'sample', isCustom: false, muted: false, channelVolume: 0.5, steps: steps(0, 8), velocities: Array(16).fill(1) },
			{ name: 'hihat', label: 'Hi-Hat', type: 'sample', isCustom: false, muted: false, channelVolume: 0.5, steps: steps(2, 6), velocities: Array(16).fill(1) },
		);
	});
	await page.getByRole('button', { name: 'Show Drums' }).click();
	const on = (row: string) => page.getByRole('group', { name: `${row} steps` }).locator('.dp-cell[aria-pressed="true"]');
	await expect(on('Kick')).toHaveCount(2);
	await expect(on('Hat')).toHaveCount(2);
	await expect(on('Snare')).toHaveCount(0);
	// Saved, there are no lanes but the synth's
	await page.waitForTimeout(SETTLED);
	const data = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	expect(data.instruments.map((i: any) => i.name)).toEqual(['synth-voice']);
	expect(data.drums.lane.rows[0].steps.slice(0, 9)).toEqual([true, false, false, false, false, false, false, false, true]);
});

// The Drums machine END

// The Drift machine START (the plan's item 6)

// A project with Drift's chords: per bar, the plates held (0–5: in A minor A3 C4 E4 G4 B4 D5)
async function importDrift(page: Page, id: string, bars: number[][], change: (d: any) => void = () => { }) {
	await importChanged(page, id, (d) => {
		d.drift.chords = Array.from({ length: 8 }, (_, b) => Array.from({ length: 6 }, (_, k) => (bars[b] ?? []).includes(k)));
		change(d);
	});
}

test('the Drift machine: six plates in the key, a chord a bar (4 or 8), named on the pads and in the rail; saved, one undo step each, not a pattern slot\'s', async ({ page }) => {
	await page.getByRole('button', { name: 'Show Drift' }).click();
	await expect(page.locator('.step-card .ds-which')).toHaveText(' · Drift');
	await expect(page.locator('#sound-title')).toContainText('Drift');
	const plates = page.getByRole('group', { name: /^Plates, bar / });
	// A minor's chord in thirds: A C E G B D
	await expect(plates.locator('.dr-plate-name')).toHaveText(['AA3', 'CC4', 'EE4', 'GG4', 'BB4', 'DD5']);
	const bars = page.getByRole('radiogroup', { name: 'Bar the plates edit' }).getByRole('radio');
	await expect(bars).toHaveCount(4);
	await expect(page.getByRole('group', { name: 'Repeats brush' })).toHaveCount(0);
	// Pattern Tools work on the step machines; the Melody Maker's key stays live (it moves the plates)
	await expect(page.getByText('Pattern Tools work on the step machines')).toBeVisible();
	await page.waitForTimeout(SETTLED);

	const plate = (n: string) => plates.getByRole('button', { name: new RegExp(`^${n} \\(`) });
	// Bar 1: A C E, bar 2: C E G, each named
	for (const n of ['A', 'C', 'E']) await plate(n).click();
	await page.waitForTimeout(SETTLED);
	await bars.nth(1).click();
	await expect(plates).toHaveAttribute('aria-label', 'Plates, bar 2');
	for (const n of ['C', 'E', 'G']) await plate(n).click();
	await expect(plate('G')).toHaveAttribute('aria-pressed', 'true');
	await expect(bars.nth(0)).toHaveAccessibleName('Bar 1: Am');
	await expect(bars.nth(1)).toHaveAccessibleName('Bar 2: C');
	await expect(railRow(page, 'Drift').locator('.mr-bar')).toHaveText(['Am', 'C', '·', '·']);
	await page.waitForTimeout(SETTLED);
	// Bar 2 a 7th chord; then undo takes it back (one step)
	await plate('B').click();
	await expect(bars.nth(1)).toHaveAccessibleName('Bar 2: Cmaj7');
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(bars.nth(1)).toHaveAccessibleName('Bar 2: C');

	// 8 bars
	await page.getByRole('radio', { name: '8 bars' }).click();
	await expect(bars).toHaveCount(8);
	await expect(railRow(page, 'Drift').locator('.mr-bar')).toHaveCount(8);
	// The X/Y pad's knobs, and the swarm's
	await page.getByRole('slider', { name: 'Drift spread' }).focus();
	await page.keyboard.press('End');
	await page.getByRole('slider', { name: 'Attack' }).focus();
	await page.keyboard.press('ArrowUp');
	await page.waitForTimeout(SETTLED);

	// A pattern slot doesn't change Drift (its chords are the project's)
	await page.getByRole('button', { name: 'Pattern B' }).click();
	await expect(bars.nth(0)).toHaveAccessibleName('Bar 1: Am');
	await page.getByRole('button', { name: 'Pattern A' }).click();

	const data = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	expect(data.drift.length).toBe(8);
	expect(data.drift.chords[0]).toEqual([true, true, true, false, false, false]);
	expect(data.drift.chords[1]).toEqual([false, true, true, true, false, false]);
	expect(data.drift.sound).toMatchObject({ spread: 1, attack: 1.25, voices: 5 });

	// A new key moves the plates: C minor's chord is C Eb G Bb D F (flats: a letter each), bar 1
	// holds C Eb G now
	await page.locator('.ds-compose .mm-kb').getByRole('radio', { name: 'C', exact: true }).click();
	await expect(plates.locator('.dr-plate-name')).toHaveText(['CC3', 'EbEb3', 'GG3', 'BbBb3', 'DD4', 'FF4']);
	await expect(bars.nth(0)).toHaveAccessibleName('Bar 1: Cm');

	// File → New: nothing held, 4 bars
	await chooseFromFileMenu(page, 'New');
	await page.getByRole('button', { name: 'Show Drift' }).click();
	await expect(bars).toHaveCount(4);
	await expect(bars.nth(0)).toHaveAccessibleName('Bar 1: nothing held');
});

test('the Drift machine plays: held notes carry over the bar line, fade out over Release, its stem and MIDI channel 3; a seamless loop; live, muted from the rail', async ({ page }) => {
	await setTempo(page, 120); // a bar is 2 s
	// A held through bars 1 and 2, E in bar 1 only; nothing in bars 3 and 4. Fast fades: a
	// quarter of a bar (0.5 s), no reverb send; a soft wave, the voices together (for its pitch)
	await importDrift(page, 'Drift alone', [[0, 2], [0]], (d) => {
		Object.assign(d.drift.sound, { attack: 0.25, release: 0.25, wave: 0, spread: 0, drift: 0 });
		d.drift.pedals = 0;
	});
	const zip = await exportAudio(page, { bars: 4, ending: 'With tail', mix: true, stems: false, machineStems: true, midi: true, oneShot: false, normalize: false });
	const files = unzip(zip.bytes);
	const f = (part: string) => files[Object.keys(files).find((k) => k.endsWith(`_${part}.wav`))!];
	expect(Object.keys(files).filter((k) => k.endsWith('.wav')).map((k) => k.split('_').at(-1)).sort()).toEqual(['drift.wav', 'mix.wav', 'rhythm.wav']);
	const mix = f('mix');
	// It fades in over the first 0.5 s, then holds
	expect(wavWindow(mix, 0, 0.05).rms).toBeLessThan(wavWindow(mix, 1, 1.5).rms * 0.3);
	expect(wavWindow(mix, 1, 1.5).peak).toBeGreaterThan(0.05);
	// Bar 2 holds A alone: E fades out over 0.5 s, A carries on (no dip at the bar line)
	const before = wavWindow(mix, 1.9, 2).rms, at = wavWindow(mix, 2, 2.05).rms, after = wavWindow(mix, 2.9, 3.4).rms;
	expect(at).toBeGreaterThan(before * 0.6);
	expect(after).toBeLessThan(before * 0.95);
	expect(after).toBeGreaterThan(before * 0.3);
	// A alone in bar 2: at its pitch (220 Hz, the swarm a few cents either way)
	expect(wavPitchHz(mix, 3, 3.8)).toBeGreaterThan(214);
	expect(wavPitchHz(mix, 3, 3.8)).toBeLessThan(226);
	// Silent once A has faded (bars 3 and 4)
	expect(wavWindow(mix, 4.6, 7.9).peak).toBeLessThan(0.002);
	// The drift stem is all of it
	const d = wavSamples(f('drift')).samples, m = wavSamples(mix).samples;
	let worst = 0;
	for (let i = 0; i < m.length; i++) worst = Math.max(worst, Math.abs(d[i] - m[i]));
	expect(worst).toBeLessThan(1e-3);
	// The MIDI file: A3 (57) for two bars and E4 (64) for one, on channel 3
	const midi = files[Object.keys(files).find((k) => k.endsWith('.mid'))!];
	const ons = (note: number) => { let c = 0; for (let i = 0; i < midi.length - 2; i++) if (midi[i] === 0x92 && midi[i + 1] === note && midi[i + 2] > 0) c++; return c; };
	expect([ons(57), ons(64)]).toEqual([1, 1]);

	// A seamless loop of 2 bars with A held in both: it starts at full level (carried round the end)
	await importDrift(page, 'Drift loop', [[0], [0]], (d) => {
		Object.assign(d.drift.sound, { attack: 1, release: 0.25 });
		d.drift.pedals = 0;
		d.drift.length = 4;
		d.drift.chords[2] = d.drift.chords[3] = Array(6).fill(false);
	});
	const loop = await exportAudio(page, { bars: 2, ending: 'Loop', mix: true, stems: false, machineStems: false, midi: false, oneShot: false, normalize: false });
	expect(wavWindow(loop.bytes, 0.05, 0.3).rms).toBeGreaterThan(wavWindow(loop.bytes, 2, 3).rms * 0.7);

	// Live: it plays; the rail's LED mutes it; Stop fades it
	await importDrift(page, 'Drift live', [[0, 2, 4], [0, 2, 4]], (d) => { d.drift.sound.attack = 0.25; });
	await page.getByRole('button', { name: 'Show Drift' }).click();
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(600);
	expect(await page.evaluate(() => (window as any).__peakOver(800) as Promise<number>)).toBeGreaterThan(0.03);
	await expect(railRow(page, 'Drift').locator('.mr-bar.now')).toHaveCount(1);
	await railRow(page, 'Drift').getByRole('switch', { name: 'Drift on' }).click();
	await page.waitForTimeout(400);
	expect(await page.evaluate(() => (window as any).__swingOver(600) as Promise<number>)).toBeLessThan(0.002);
	await railRow(page, 'Drift').getByRole('switch', { name: 'Drift on' }).click();
	await page.waitForTimeout(600);
	expect(await page.evaluate(() => (window as any).__peakOver(500) as Promise<number>)).toBeGreaterThan(0.03);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await page.waitForTimeout(1800);
	expect(await page.evaluate(() => (window as any).__swingOver(500) as Promise<number>)).toBeLessThan(0.002);

	// Stopped, the swarm's screen plays the bar's chord
	await page.getByRole('button', { name: 'Hear Asus2', exact: true }).click();
	expect(await page.evaluate(() => (window as any).__peakOver(800) as Promise<number>)).toBeGreaterThan(0.02);
});

test('PR 133: a Drift note whose fade-in lasts its whole bar is heard all through it, with no gap at the bar line, in the export and live', async ({ page }) => {
	await setTempo(page, 120); // a bar is 2 s
	// A in bars 1 and 3, G in bars 2 and 4 (no note shared), each fading in over its whole bar
	// (Attack 1 bar, the factory's) and out over the next (Release 1 bar). Until PR 133 the
	// release erased the fade-in when it ended on the bar line, so the note was silent until
	// then: its whole bar in an export, about 0.1 s before each bar line live. No reverb send; a
	// soft wave, the voices together
	await importDrift(page, 'Drift gap', [[0], [3], [0], [3]], (d) => {
		Object.assign(d.drift.sound, { attack: 1, release: 1, wave: 0, spread: 0, drift: 0 });
		d.drift.pedals = 0;
	});
	const wav = (await exportAudio(page, { bars: 4, ending: 'With tail', mix: true, stems: false, machineStems: false, midi: false, oneShot: false, normalize: false })).bytes;
	// A rises through bar 1, halfway up at its middle
	const mid = wavWindow(wav, 0.9, 1.1).rms, end = wavWindow(wav, 1.85, 1.98).rms;
	expect(end).toBeGreaterThan(0.02);
	expect(mid).toBeGreaterThan(end * 0.35);
	expect(mid).toBeLessThan(end * 0.65);
	// Over the bar line A fades out from there while G rises: no gap, and G is heard in bar 2
	expect(wavWindow(wav, 2, 2.1).rms).toBeGreaterThan(end * 0.8);
	expect(wavWindow(wav, 2.9, 3.1).rms).toBeGreaterThan(end * 0.5);
	expect(wavWindow(wav, 3.85, 3.98).rms).toBeGreaterThan(end * 0.8);

	// Live: from the middle of bar 2 to the middle of bar 4 (two bar lines) the level never drops
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(2600);
	const peaks = (await page.evaluate(() => (window as any).__channelPeaksOver(4200) as Promise<number[][]>)).map((lr) => Math.max(...lr));
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	const loudest = Math.max(...peaks);
	expect(loudest).toBeGreaterThan(0.05);
	expect(Math.min(...peaks)).toBeGreaterThan(loudest * 0.3);
});

test('the Drift machine: a project from before it opens with nothing held, and the export dialog fits a loop to its bars', async ({ page }) => {
	await importChanged(page, 'Before Drift', (d) => { delete d.drift; });
	await page.getByRole('button', { name: 'Show Drift' }).click();
	await expect(page.getByRole('radiogroup', { name: 'Bar the plates edit' }).getByRole('radio')).toHaveCount(4);
	await expect(railRow(page, 'Drift').locator('.mr-bar.on')).toHaveCount(0);

	await importDrift(page, 'Drift fit', [[0], [1], [2], [3]]);
	await chooseFromFileMenu(page, 'Export audio…');
	const dialog = page.getByRole('dialog', { name: 'Export audio' });
	// The dialog opens on 4 bars (Drift's chords), and says so for a shorter loop
	await expect(dialog.getByRole('group', { name: 'Bars' }).getByRole('button', { name: '4', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await dialog.getByRole('group', { name: 'Bars' }).getByRole('button', { name: '2', exact: true }).click();
	await expect(dialog.getByText("Drift's chords take 4 bars")).toBeVisible();
	await dialog.getByRole('button', { name: 'Use 4 bars' }).click();
	await expect(dialog.getByText("Drift's chords take 4 bars")).toBeHidden();
	await expect(dialog.getByText(/rhythm and drift: they add up/)).toBeVisible();
});

test('the Drift machine goes straight to the reverb: its Pedals is its send, the delay never hears it, and the effects stems still add up', async ({ page }) => {
	await setTempo(page, 120);
	await importDrift(page, 'Drift reverb', [[0, 2]], (d) => {
		Object.assign(d.drift.sound, { attack: 0.25, release: 0.25 });
		d.drift.pedals = 1;
		Object.assign(d.fx.reverb, { enabled: true, mix: 0.6, decay: 2, reverse: false });
		Object.assign(d.fx.delay, { enabled: true, mix: 0.5 });
	});
	const zip = await exportAudio(page, { bars: 4, ending: 'With tail', mix: true, stems: true, machineStems: false, midi: false, oneShot: false, normalize: false });
	const files = unzip(zip.bytes);
	const f = (part: string) => files[Object.keys(files).find((k) => k.endsWith(`_${part}.wav`))!];
	expect(wavWindow(f('reverb'), 0.5, 3).peak).toBeGreaterThan(0.01);
	// The delay is on, but only Drift plays: no echoes
	const delay = Object.keys(files).find((k) => k.endsWith('_delay.wav'));
	if (delay) expect(wavPeak(files[delay])).toBeLessThan(1e-4);
	const m = wavSamples(f('mix')).samples, dry = wavSamples(f('dry')).samples, rev = wavSamples(f('reverb')).samples;
	let worst = 0;
	for (let i = 0; i < m.length; i++) worst = Math.max(worst, Math.abs(dry[i] + rev[i] - m[i]));
	expect(worst).toBeLessThan(1e-3);
});

test('Drift sounds and Progressions: the transport\'s boxes while Drift is shown; lit, the dice, one undo step each', async ({ page }) => {
	await page.getByRole('button', { name: 'Show Drift' }).click();
	const sounds = page.getByRole('group', { name: 'Drift sounds' });
	const progs = page.getByRole('group', { name: 'Progressions' });
	await expect(sounds).toBeVisible();
	await expect(progs).toBeVisible();
	await expect(page.getByRole('group', { name: 'Sound presets' })).toHaveCount(0);
	// A fresh page: the factory sound and nothing held, so nothing is lit
	await expect(sounds.locator('[aria-pressed="true"]')).toHaveCount(0);
	await expect(progs.locator('[aria-pressed="true"]')).toHaveCount(0);
	await page.waitForTimeout(SETTLED);
	const bars = page.getByRole('radiogroup', { name: 'Bar the plates edit' }).getByRole('radio');

	// A progression: its bars, from the key (A minor); the sound untouched
	const rise = progs.getByRole('button', { name: 'Rise', exact: true });
	await rise.click();
	await expect(rise).toHaveAttribute('aria-pressed', 'true');
	await expect(bars).toHaveCount(4);
	for (const [i, name] of ['Am', 'C', 'Em', 'G'].entries()) await expect(bars.nth(i)).toHaveAccessibleName(`Bar ${i + 1}: ${name}`);
	await expect(railRow(page, 'Drift').locator('.mr-bar')).toHaveText(['Am', 'C', 'Em', 'G']);
	await expect(page.getByRole('slider', { name: 'Voices' })).toHaveAttribute('aria-valuenow', '5');
	await page.waitForTimeout(SETTLED);
	// Eight bars
	await progs.getByRole('button', { name: 'Wander', exact: true }).click();
	await expect(bars).toHaveCount(8);
	await expect(bars.nth(7)).toHaveAccessibleName(/^Bar 8: /);
	await page.waitForTimeout(SETTLED);

	// A sound: Drift's knobs; the bars untouched
	const glass = sounds.getByRole('button', { name: 'Glass', exact: true });
	await glass.click();
	await expect(glass).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('slider', { name: 'Voices' })).toHaveAttribute('aria-valuenow', '3');
	await expect(page.getByRole('slider', { name: 'Drift filter' })).toHaveAttribute('aria-valuenow', '6000');
	await expect(progs.getByRole('button', { name: 'Wander', exact: true })).toHaveAttribute('aria-pressed', 'true');
	// Rhythm's sound wasn't touched: no Rhythm preset lit, its pads still off
	await expect(railRow(page, 'Rhythm').locator('.mr-cells i.on')).toHaveCount(0);
	await page.waitForTimeout(SETTLED);

	// A knob turned: unlit; Undo lights it again (one step)
	await page.getByRole('slider', { name: 'Release' }).focus();
	await page.keyboard.press('ArrowUp');
	await expect(glass).toHaveAttribute('aria-pressed', 'false');
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(glass).toHaveAttribute('aria-pressed', 'true');
	// One more: back to Rise
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await page.waitForTimeout(SETTLED);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(rise).toHaveAttribute('aria-pressed', 'true');

	// The dice: a new sound (nothing lit) and a progression starting on the key's chord
	await page.getByRole('button', { name: 'Random drift sound' }).click();
	await expect(sounds.locator('[aria-pressed="true"]')).toHaveCount(0);
	const voices = Number(await page.getByRole('slider', { name: 'Voices' }).getAttribute('aria-valuenow'));
	expect(voices).toBeGreaterThanOrEqual(3);
	expect(voices).toBeLessThanOrEqual(7);
	await page.getByRole('button', { name: 'Random progression' }).click();
	await expect(bars.nth(0)).toHaveAccessibleName('Bar 1: Am');
	expect([4, 8]).toContain(await bars.count());

	// Saved with the project
	await page.waitForTimeout(SETTLED);
	const data = JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8')).data;
	expect(data.drift.chords[0]).toEqual([true, true, true, false, false, false]);
	expect(data.drift.sound.voices).toBe(voices);
});

test('every Drift sound is heard and stays under the limiter, on a four-note chord', async ({ page }) => {
	await setTempo(page, 120);
	await importDrift(page, 'Drift sounds loud', [[0, 1, 2, 3], [0, 1, 2, 3]], (d) => { d.drift.pedals = 0; });
	await page.getByRole('button', { name: 'Show Drift' }).click();
	const peaks: Record<string, number> = {};
	for (const name of ['Strings', 'Haze', 'Choir', 'Glass', 'Tide', 'Dust']) {
		await page.getByRole('group', { name: 'Drift sounds' }).getByRole('button', { name, exact: true }).click();
		const wav = (await exportAudio(page, { bars: 2, ending: 'With tail', mix: true, stems: false, machineStems: false, midi: false, oneShot: false, normalize: false })).bytes;
		peaks[name] = wavPeak(wav);
	}
	for (const [name, peak] of Object.entries(peaks)) {
		expect(peak, `${name}: ${peak}`).toBeGreaterThan(0.05);
		expect(peak, `${name}: ${peak}`).toBeLessThan(0.9);
	}
	console.log('Drift sounds, peaks:', JSON.stringify(peaks));
});

// The Drift machine END

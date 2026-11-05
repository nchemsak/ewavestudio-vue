import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

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
			}
			(origConnect as any).call(this, w.__probe);
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

test('knobs work from the keyboard, and turning Attack shows the envelope until focus moves on', async ({ page }) => {
	// One step per arrow on a knob with few steps (tempo: 1 BPM)
	const tempo = page.getByRole('slider', { name: 'Tempo', exact: true });
	await expect(tempo).toHaveAttribute('aria-valuenow', '80');
	await tempo.focus();
	await page.keyboard.press('ArrowUp');
	await expect(tempo).toHaveAttribute('aria-valuenow', '81');
	await page.keyboard.press('ArrowLeft');
	await expect(tempo).toHaveAttribute('aria-valuenow', '80');
	await page.keyboard.press('Shift+ArrowUp'); // about 10% of 20..300
	await expect(tempo).toHaveAttribute('aria-valuenow', '108');
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
	// loses focus
	await expect(screenView(page)).toHaveAttribute('title', 'Oscilloscope');
	const attack = page.getByRole('slider', { name: 'Attack' });
	await attack.focus();
	await expect(screenView(page)).toHaveAttribute('title', 'Oscilloscope'); // focus alone changes nothing
	await page.keyboard.press('ArrowUp');
	await expect(screenView(page)).toHaveAttribute('title', 'Envelope');
	await expect(attack).toHaveAttribute('aria-valuetext', /^\d+ ms$/);
	await page.keyboard.press('Tab');
	await expect(screenView(page)).toHaveAttribute('title', 'Oscilloscope');
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
	await expect(page.getByRole('button', { name: 'Arp pattern' })).toContainText('Down');
	await expect(page.getByRole('button', { name: 'Arp rate' })).toContainText('1/8');
});

test('exports a WAV file with sound in it, and a project file that imports again', async ({ page }) => {
	await turnOnPads(page, [0, 3, 6, 10]);
	const name = page.getByRole('textbox', { name: 'Project name' });
	await name.fill('Export Test');
	await name.press('Enter');

	await page.getByRole('button', { name: 'File ▾' }).click();
	const [wav] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('menuitem', { name: 'Export WAV' }).click(),
	]);
	const bytes = readFileSync((await wav.path())!);
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
	const wavOn = wavPeak(await downloadFromFileMenu(page, 'Export WAV'));

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
	const wavOff = wavPeak(await downloadFromFileMenu(page, 'Export WAV'));

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
	// (synced: dotted 1/8 at 80 BPM) and tone, which the Delay panel used to set by itself.
	expect(fresh.fx.delay).toMatchObject({ division: '1/8.', time: 0.5625, toneHz: 5000 });
	const settings = ({ ui, ...rest }: any) => rest;
	expect(settings(afterNew)).toEqual(settings(fresh));
});

test('the synced delay time follows the TIME knob, the tempo and a loaded project', async ({ page }) => {
	const projectData = async () =>
		JSON.parse((await downloadFromFileMenu(page, 'Export file')).toString('utf8'));
	const time = page.getByRole('slider', { name: 'TIME', exact: true });
	const tempo = page.getByRole('slider', { name: 'Tempo', exact: true });
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
	await expect(tempo).toHaveAttribute('aria-valuenow', '80');

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
	await expect(tempo).toHaveAttribute('aria-valuenow', '110');
	await page.waitForTimeout(1000); // until the change is in the project and the undo history
	const during = (await page.evaluate(() => (window as any).__bigJson as number)) - before;
	expect(during).toBeLessThan(10);
	expect((await projectData()).transport.tempo).toBe(110);

	// Export right after a change, before it has settled, includes it
	await tempo.focus();
	await page.keyboard.press('ArrowUp');
	expect((await projectData()).transport.tempo).toBe(111);

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
	await expect(tempo).toHaveAttribute('aria-valuenow', '112');
});

test('starting new projects does not leave old keyboard listeners behind', async ({ page }) => {
	const listeners = () => page.evaluate(() => (window as any).__keydown.length as number);
	const start = await listeners();
	for (let i = 0; i < 3; i++) {
		await chooseFromFileMenu(page, 'New');
		// The menu closes once the new project has been created
		await expect(page.getByRole('menuitem', { name: 'New' })).toBeHidden();
		await expect(page.getByRole('button', { name: 'Arp pattern' })).toBeVisible();
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
	expect(dragged).toBeGreaterThan(80);
	await expect(undoBtn).toBeEnabled();

	// Undo right away, before the drag has settled: it still goes back past the whole drag
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+z');
	await expect(tempo).toHaveAttribute('aria-valuenow', '80');
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
	await expect(tempo).toHaveAttribute('aria-valuenow', '80');
	await page.waitForTimeout(SETTLED);
	await expect(redoBtn).toBeEnabled();

	// A new change after undo drops what could be redone
	await turnOnPads(page, [8]);
	await page.waitForTimeout(SETTLED);
	await expect(redoBtn).toBeDisabled();
	await page.keyboard.press('Control+z');
	await expect(selected).toHaveCount(2);
	await expect(tempo).toHaveAttribute('aria-valuenow', '80');

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
	await expect(tempo).toHaveAttribute('aria-valuenow', '81');
	await page.waitForTimeout(SETTLED);

	await page.keyboard.press('Control+z');
	await expect(tempo).toHaveAttribute('aria-valuenow', '80');
	await page.waitForTimeout(SETTLED);
	const redoBtn = page.getByRole('button', { name: 'Redo', exact: true });
	await expect(redoBtn).toBeEnabled();
	await redoBtn.click();
	await expect(tempo).toHaveAttribute('aria-valuenow', '81');
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

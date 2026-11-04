import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Injected before the app loads. Records every note the app schedules, tracks nodes that
// feed an audio parameter (the per-note LFO taps), and lets a test pause
// requestAnimationFrame the way browsers do in a hidden tab.
function instrument() {
	const w = window as any;
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
		return (origConnect as any).call(this, dest, ...rest);
	};
	const origDisconnect = AudioNode.prototype.disconnect;
	(AudioNode.prototype as any).disconnect = function (...args: any[]) {
		if (args.length === 0) w.__paramSources.delete(this);
		return (origDisconnect as any).apply(this, args);
	};
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

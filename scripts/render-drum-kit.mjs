// scripts/render-drum-kit.mjs
// Renders the Drums machine's frozen kit (src/audio/drumKit.ts) into src/audio/drumKitData.ts:
// four one-shots made by the app itself, each a Rhythm preset with its reverb switched off (the
// Drums machine has its own way into the pedals), exported as a normalized one-shot:
//   Kick:  the Kick preset on A2      Snare: the Snare preset on D3
//   Metal: the Metal preset on A4     Hat:   the Metal preset on E6, its Decay 60 ms
// Each is summed to mono, cut where it stays 46 dB under its peak (1.2 s at most) with a 10 ms
// fade, and kept as 16-bit PCM in base64.
//
// Run it only to change the kit (the kit is frozen: saved projects play it as it is):
//   npm run build
//   npx vite preview --port 4173      (in another terminal)
//   node scripts/render-drum-kit.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const APP = 'http://localhost:4173/studio2/';
const KIT = [
	{ id: 'kick', preset: 'Kick', note: 'A2' },
	{ id: 'snare', preset: 'Snare', note: 'D3' },
	{ id: 'metal', preset: 'Metal', note: 'A4' },
	{ id: 'hat', preset: 'Metal', note: 'E6', decayMs: 60 },
];

// A 32-bit float WAV's channels and sample rate
function readWav(buf) {
	let at = 12, fmt = null, data = null;
	while (at + 8 <= buf.length) {
		const id = buf.toString('ascii', at, at + 4), size = buf.readUInt32LE(at + 4);
		if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(at + 10), rate: buf.readUInt32LE(at + 12) };
		if (id === 'data') data = buf.subarray(at + 8, at + 8 + size);
		at += 8 + size + (size % 2);
	}
	const frames = data.length / 4 / fmt.channels;
	const chans = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
	for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.channels; c++) chans[c][i] = data.readFloatLE((i * fmt.channels + c) * 4);
	return { chans, rate: fmt.rate };
}

function toPcm(mono, rate) {
	let peak = 0;
	for (const v of mono) peak = Math.max(peak, Math.abs(v));
	let end = mono.length;
	while (end > 1 && Math.abs(mono[end - 1]) < peak * 0.005) end--;
	end = Math.min(mono.length, end + Math.round(0.01 * rate), Math.round(1.2 * rate));
	const out = mono.slice(0, end);
	const fade = Math.min(out.length, Math.round(0.01 * rate));
	for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
	const bytes = Buffer.alloc(out.length * 2);
	for (let i = 0; i < out.length; i++) {
		const v = Math.max(-1, Math.min(1, out[i]));
		bytes.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), i * 2);
	}
	return { data: bytes.toString('base64'), sampleRate: rate, seconds: out.length / rate, peak };
}

const browser = await chromium.launch();
const kit = {};
for (const k of KIT) {
	const page = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
	await page.addInitScript(() => { try { localStorage.setItem('ewave-studio2:visited', '1'); } catch { /* */ } });
	await page.goto(APP);
	await page.waitForTimeout(800);
	await page.getByRole('group', { name: 'Sound presets' }).getByRole('button', { name: k.preset, exact: true }).click();
	const reverb = page.getByRole('button', { name: 'Reverb pedal' });
	if ((await reverb.getAttribute('aria-pressed')) === 'true') await reverb.click();
	if (k.decayMs) {
		const decay = page.getByRole('region', { name: 'Envelope' }).getByRole('slider', { name: 'Decay', exact: true }).filter({ visible: true }).first();
		await decay.focus();
		await page.keyboard.press('Home');
		for (let i = 0; i < 100; i++) {
			const ms = parseFloat((await decay.getAttribute('aria-valuetext')) ?? '0');
			if (ms >= k.decayMs) break;
			await page.keyboard.press('ArrowUp');
		}
	}
	await page.waitForTimeout(300);
	await page.getByRole('button', { name: /^File/ }).click();
	await page.getByRole('menuitem', { name: 'Export audio…' }).click();
	const dialog = page.getByRole('dialog', { name: 'Export audio' });
	for (const [name, on] of [[/^Mix/, false], [/^Effects stems/, false], [/^Machine stems/, false], [/^MIDI file/, false], [/^One-shot at/, true], [/^Normalize/, true]]) {
		const box = dialog.getByRole('checkbox', { name });
		if (await box.count()) await box.setChecked(on);
	}
	const select = dialog.getByRole('combobox', { name: 'One-shot note' });
	const label = (await select.locator('option').allTextContents()).find((t) => t.startsWith(`${k.note} (`));
	await select.selectOption({ label });
	const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export', exact: true }).click()]);
	const { chans, rate } = readWav(readFileSync(await download.path()));
	const mono = chans[0].map((v, i) => (chans.length > 1 ? (v + chans[1][i]) / 2 : v));
	const pcm = toPcm(mono, rate);
	console.log(`${k.id}: ${pcm.seconds.toFixed(3)} s at ${rate} Hz, peak ${pcm.peak.toFixed(3)}, ${pcm.data.length} characters`);
	kit[k.id] = { data: pcm.data, sampleRate: rate };
	await page.close();
}
await browser.close();

const lines = Object.entries(kit).map(([id, s]) => `\t${id}: { sampleRate: ${s.sampleRate}, data: '${s.data}' },`);
writeFileSync(new URL('../src/audio/drumKitData.ts', import.meta.url), `// src/audio/drumKitData.ts
// GENERATED by scripts/render-drum-kit.mjs: the Drums machine's frozen kit (drumKit.ts), four
// one-shots as 16-bit PCM in base64. Don't edit by hand.
import type { SampleData } from './sample';
import type { KitId } from './drums';

export const DRUM_KIT: Record<KitId, SampleData> = {
${lines.join('\n')}
};
`);
console.log('Wrote src/audio/drumKitData.ts');

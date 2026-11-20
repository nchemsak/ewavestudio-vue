// src/lib/bassView.ts
// What the Bass machine's screen draws (BassSound.vue): one note of the sound as it plays (the
// wave through the filter, worked out here at a low rate, enough for a picture), the level's
// envelope, and where the cutoff goes as the filter's envelope falls back. Pure, unit-tested.

import { bassNoteShape, bassQ, type BassVoice } from '../audio/bass';

// The picture's length: the note's decay and a little after, at least 0.25 s
export function viewSeconds(v: BassVoice) {
	return Math.max(0.25, Math.min(2.2, (v.decayMs / 1000) * 1.3));
}

/** The level's envelope at `t` seconds, 0..1 (its peak 1) */
export function ampAt(v: BassVoice, t: number) {
	const s = bassNoteShape(v, { time: 0 });
	if (t < 0.003) return t / 0.003;
	return Math.exp(-(t - s.hold) / s.ampTc);
}

/** Octaves above Cutoff the filter is at `t` seconds */
export function envOctAt(v: BassVoice, t: number) {
	const s = bassNoteShape(v, { time: 0 });
	return s.envOct * Math.exp(-Math.max(0, t - 0.003) / s.envTc);
}

/** `n` samples of one note on `hz` (a state-variable low-pass, oversampled), scaled to ±1 */
export function noteSamples(v: BassVoice, n: number, hz: number): number[] {
	const secs = viewSeconds(v);
	const OS = 16;
	const fs = (n / secs) * OS;
	const q = 1 / bassQ(v.resonance);
	let low = 0, band = 0;
	const out: number[] = [];
	for (let k = 0; k < n; k++) {
		for (let r = 0; r < OS; r++) {
			const t = (k * OS + r) / fs;
			const ph = (t * hz) % 1;
			const osc = v.wave === 'square' ? (ph < 0.5 ? 0.6 : -0.6) : 1 - 2 * ph;
			const x = osc + 0.9 * v.sub * Math.sin(2 * Math.PI * (hz / 2) * t);
			const fc = Math.min(fs / 7, v.cutoff * 2 ** envOctAt(v, t));
			const f = 2 * Math.sin((Math.PI * fc) / fs);
			low += f * band;
			const high = x - low - q * band;
			band += f * high;
		}
		out.push(low * ampAt(v, (k / n) * secs));
	}
	const peak = Math.max(1e-6, ...out.map(Math.abs));
	return out.map((x) => x / peak);
}

// src/lib/machines/bassPresets.ts
// The Bass machine's built-in sounds and patterns, and their dice (the plan's item 4, part 2b):
// what the transport card's Sounds and Patterns boxes offer while Bass is chosen. Like the
// Rhythm machine's (src/lib/presets/, src/lib/patterns/): a sound sets the sound only (from the
// factory sound up), a pattern the pattern only (the key's root, folded into Bass's range).
// Pure (no Vue), unit-tested.

import { BASS_MAX_HZ, BASS_MIN_HZ, BASS_RANGES, type BassPattern, type BassVoice, type BassWave } from '../../audio/bass';
import { BASS_DEFAULTS } from './bass';

export type BassSoundPreset = { id: string; label: string; description: string; sound: Partial<BassVoice> };

export const BASS_SOUNDS: readonly BassSoundPreset[] = [
	{ id: 'sub', label: 'Sub', description: 'Sub: deep and round, mostly the sine an octave down, a slow fall.',
		sound: { wave: 'saw', sub: 1, cutoff: 140, resonance: 0.1, envAmount: 0.5, decayMs: 600, accent: 0.4 } },
	{ id: 'acid', label: 'Acid', description: 'Acid: a squelchy saw, the filter ringing; accents and slides bite.',
		sound: { wave: 'saw', sub: 0.2, cutoff: 220, resonance: 0.85, envAmount: 3.5, decayMs: 220, accent: 0.9, slideMs: 70 } },
	{ id: 'rubber', label: 'Rubber', description: 'Rubber: a bouncy square with a short, round thump.',
		sound: { wave: 'square', sub: 0.5, cutoff: 260, resonance: 0.4, envAmount: 2, decayMs: 180 } },
	{ id: 'pluck', label: 'Pluck', description: 'Pluck: a short, bright saw, like a picked string.',
		sound: { wave: 'saw', sub: 0.4, cutoff: 400, resonance: 0.3, envAmount: 2.5, decayMs: 120 } },
	{ id: 'growl', label: 'Growl', description: 'Growl: a long saw whose filter opens wide on each note and growls back down.',
		sound: { wave: 'saw', sub: 0.6, cutoff: 180, resonance: 0.7, envAmount: 4.5, decayMs: 450, accent: 0.7 } },
	{ id: 'hollow', label: 'Hollow', description: 'Hollow: a square with no sub, open and woody.',
		sound: { wave: 'square', sub: 0, cutoff: 600, resonance: 0.5, envAmount: 1, decayMs: 350 } },
];

/** A preset's whole sound: the factory sound, then its settings */
export function bassSoundOf(p: Partial<BassVoice>): BassVoice {
	return { ...BASS_DEFAULTS, ...p };
}

// A pattern's step: semitones from the key's root (in Bass's octave), velocity, and its flags
export type BassStep = { note: number; vel: number; acc?: boolean; slide?: boolean; tie?: boolean } | null;
export type BassPatternPreset = { id: string; label: string; description: string; steps: BassStep[] };

const _ = null;
const n = (note = 0, vel = 1, flags: { acc?: boolean; slide?: boolean; tie?: boolean } = {}): BassStep => ({ note, vel, ...flags });
const A = { acc: true }, S = { slide: true }, T = { tie: true };

// Only the root, its fifth and octaves, which are in every scale the Melody Maker offers
export const BASS_PATTERNS: readonly BassPatternPreset[] = [
	{ id: 'root', label: 'Root', description: 'Root: the key\'s root on every beat, the first accented.',
		steps: [n(0, 1, A), _, _, _, n(0, 0.85), _, _, _, n(0, 0.9), _, _, _, n(0, 0.85), _, _, _] },
	{ id: 'octaves', label: 'Octaves', description: 'Octaves: eighth notes jumping between the root and its octave.',
		steps: [n(0, 1, A), _, n(12, 0.8), _, n(0, 0.9), _, n(12, 0.8), _, n(0, 1, A), _, n(12, 0.8), _, n(0, 0.9), _, n(12, 0.8), _] },
	{ id: 'offbeat', label: 'Offbeat', description: 'Offbeat: between the beats, as in house, the last up a fifth.',
		steps: [_, _, n(0, 0.9), _, _, _, n(0, 1, A), _, _, _, n(0, 0.9), _, _, _, n(7, 1, A), _] },
	{ id: 'gallop', label: 'Gallop', description: 'Gallop: one and two-and on every beat, driving.',
		steps: [n(0, 1, A), _, n(0, 0.7), n(0, 0.8), n(0, 0.95), _, n(0, 0.7), n(0, 0.8), n(0, 1, A), _, n(0, 0.7), n(0, 0.8), n(7, 0.95), _, n(7, 0.7), n(7, 0.8)] },
	{ id: 'walk', label: 'Walk', description: 'Walk: root, fifth, octave, fifth, the last note sliding back down.',
		steps: [n(0, 1, A), _, _, n(0, 0.6), n(7, 0.9), _, _, _, n(12, 1, A), _, _, n(12, 0.6), n(7, 0.9), _, n(-5, 0.8, S), n(0, 0.8)] },
	{ id: 'squelch', label: 'Squelch', description: 'Squelch: a busy sixteenth line with accents, slides and a tie, for the Acid sound.',
		steps: [n(0, 1, A), n(0, 0.7), n(12, 0.8, S), n(0, 0.7), _, n(0, 1, A), n(7, 0.8), n(12, 0.8, S), n(0, 0.8), _, n(0, 1, A), n(12, 0.7), n(0, 0.8, T), _, n(7, 0.8, S), n(12, 1, A)] },
];

/** A note `semitones` from `rootHz`, moved by octaves into Bass's range */
export function foldBassHz(rootHz: number, semitones: number): number {
	let hz = rootHz * 2 ** (semitones / 12);
	while (hz > BASS_MAX_HZ) hz /= 2;
	while (hz < BASS_MIN_HZ) hz *= 2;
	return hz;
}

/** A pattern's lists, from the key's root in Bass's octave (off steps: the root, full, no flags) */
export function bassPatternFrom(steps: BassStep[], rootHz: number, n = 16): BassPattern {
	const at = (i: number) => steps[i] ?? null;
	return {
		steps: Array.from({ length: n }, (_, i) => !!at(i)),
		velocities: Array.from({ length: n }, (_, i) => at(i)?.vel ?? 1),
		pitches: Array.from({ length: n }, (_, i) => foldBassHz(rootHz, at(i)?.note ?? 0)),
		accents: Array.from({ length: n }, (_, i) => !!at(i)?.acc),
		slides: Array.from({ length: n }, (_, i) => !!at(i)?.slide),
		ties: Array.from({ length: n }, (_, i) => !!at(i)?.tie),
	};
}

/** A key to compare two patterns by (rounded, so a saved one matches the one applied) */
export function bassPatternKey(p: BassPattern): string {
	return JSON.stringify([p.steps.map(Boolean), p.velocities.map((v) => Math.round(v * 1000)),
		p.pitches.map((hz) => Math.round(hz * 100)), p.accents.map(Boolean), p.slides.map(Boolean), p.ties.map(Boolean)]);
}

export function bassSoundKey(v: BassVoice): string {
	return JSON.stringify([v.wave, ...(['sub', 'cutoff', 'resonance', 'envAmount', 'decayMs', 'accent', 'slideMs'] as const)
		.map((k) => Math.round(v[k] * 1000))]);
}

// The dice START

const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
const between = (r: () => number, lo: number, hi: number, step: number) => Math.round((lo + r() * (hi - lo)) / step) * step;

/** A random bass sound, within the knobs' ranges and on their steps; never silent (a cutoff
 * high enough, a decay long enough to be heard) */
export function randomBassSound(r: () => number = Math.random): BassVoice {
	const wave: BassWave = r() < 0.6 ? 'saw' : 'square';
	const sound: BassVoice = {
		wave,
		sub: between(r, 0, 1, 0.01),
		cutoff: Math.round(90 * (900 / 90) ** r()),         // 90–900 Hz, log
		resonance: between(r, 0, 0.9, 0.01),
		envAmount: between(r, 0.5, 4.5, 0.1),
		decayMs: Math.round(90 * (800 / 90) ** r()),         // 90–800 ms, log
		accent: between(r, 0.3, 1, 0.01),
		slideMs: between(r, 30, 150, 1),
	};
	for (const k of ['sub', 'cutoff', 'resonance', 'envAmount', 'decayMs', 'accent', 'slideMs'] as const) {
		const [lo, hi] = BASS_RANGES[k];
		sound[k] = Math.min(hi, Math.max(lo, sound[k]));
	}
	return sound;
}

/** A random bassline: a one-beat idea repeated, step 1 always the root, mostly roots with some
 * octaves and fifths, a few accents and slides, never more than four empty steps in a row */
export function randomBassPattern(r: () => number = Math.random): BassStep[] {
	const CELLS: number[][] = [[0], [0, 2], [0, 3], [0, 2, 3], [2], [0, 1, 2], [0, 1, 3], [1, 3]];
	const cell = pick(r, CELLS);
	const second = r() < 0.4 ? pick(r, CELLS) : cell;
	const steps: BassStep[] = Array(16).fill(null);
	for (let beat = 0; beat < 4; beat++) {
		for (const k of beat % 2 ? second : cell) {
			const note = r() < 0.7 ? 0 : pick(r, [12, 7, -5]);
			steps[beat * 4 + k] = { note, vel: k === 0 ? 1 : between(r, 0.6, 0.9, 0.05), acc: r() < 0.2 };
		}
	}
	steps[0] = { note: 0, vel: 1, acc: true };
	// Never more than four empty steps in a row (round the bar's end too): fill the middle of a gap
	for (let guard = 0; guard < 4; guard++) {
		const on = steps.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
		let worst = 0, at = -1;
		on.forEach((i, k) => {
			const next = k + 1 < on.length ? on[k + 1] : on[0] + 16;
			if (next - i - 1 > worst) { worst = next - i - 1; at = i; }
		});
		if (worst <= 4) break;
		steps[(at + 1 + Math.floor(worst / 2)) % 16] = { note: 0, vel: 0.8 };
	}
	// Slides into the next note now and then, a tie once in a while
	steps.forEach((s, i) => {
		if (!s || !steps[(i + 1) % 16] || i === 15) return;
		if (r() < 0.18) s.slide = true;
		else if (r() < 0.05) s.tie = true;
	});
	return steps;
}

// The dice END

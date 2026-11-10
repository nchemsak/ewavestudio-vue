// src/lib/patterns/random.ts
// The Patterns box's dice: a new pattern from random choices, applied like a built-in one
// (applyPattern in patterns.ts), so it sets the pattern only and one roll is one undo step.
//
// Hits placed one at a time (as before PR 51) came out as clumps and gaps ("step 1, six empty
// steps, two hits") that don't sound like a beat. A usable rhythm repeats a short idea and
// spreads its hits through the bar, so a roll is built like one:
// - An idea: one beat (4 steps) or two beats (8 steps), from rhythms that work on their own
//   (CELLS_4, CELLS_8: off-beats, "3-3-2", syncopations), or two one-beat ideas side by side.
//   Now and then (EUCLID) a whole-bar rhythm instead: 5 or 7 hits spread as evenly as possible
//   over the 16 steps.
// - The idea repeats across the bar, its notes and accents with it: step 1 is the root, the
//   idea's other hits mostly the root, some its octave or fifths (in every scale, so always in
//   key); hits on a beat are accented, the rest softer.
// - About half the time the last beat changes into a fill leading back to step 1, which may
//   end an octave or a fifth up, and may have a roll (2–4 repeats) off the beat.
// - No gap longer than four empty steps, counting round from the end of the bar to step 1.
// Velocities sit on the pads' slider steps (0.05 here).

import type { PatternStep, StepPattern } from './patterns';

// 0 ≤ x < 1, like Math.random (the tests pass a seeded one)
export type Rng = () => number;

export const RANDOM_STEPS = 16;
export const RANDOM_NOTES = [0, 12, 7, -5] as const; // the root most of the time
// The longest run of empty steps a roll can have (round the end of the bar, too)
export const MAX_GAP = 4;

type Weighted<T> = readonly [T, number];

// One-beat ideas (steps within the beat that play), and how often each comes up
const CELLS_4: readonly Weighted<number[]>[] = [
	[[0], 1],          // x...
	[[0, 2], 3],       // x.x.
	[[0, 3], 3],       // x..x
	[[0, 2, 3], 2],    // x.xx
	[[0, 1, 3], 1],    // xx.x
	[[0, 1], 1],       // xx..
];

// Two-beat ideas
const CELLS_8: readonly Weighted<number[]>[] = [
	[[0, 3, 6], 4],    // x..x..x.  3-3-2 (tresillo)
	[[0, 3, 5], 2],    // x..x.x..
	[[0, 2, 5], 2],    // x.x..x..
	[[0, 4, 6], 2],    // x...x.x.
	[[0, 3, 4, 6], 1], // x..xx.x.
	[[0, 2, 3, 6], 1], // x.xx..x.
	[[0, 3, 6, 7], 1], // x..x..xx
];

// Whole-bar ideas: hits spread as evenly as possible (a Euclidean rhythm), started on a hit
const EUCLID: readonly number[] = [5, 7];

// The last beat, changed into a fill (steps within the beat)
const FILLS: readonly Weighted<number[]>[] = [
	[[0, 2, 3], 3],    // x.xx
	[[0, 1, 2], 2],    // xxx.
	[[2, 3], 2],       // ..xx
	[[0, 1, 2, 3], 1], // xxxx
	[[1, 3], 1],       // .x.x
	[[0, 3], 1],       // x..x
];

// k hits spread as evenly as possible over n steps (Bjorklund's result, by rounding)
export function euclid(k: number, n: number): boolean[] {
	return Array.from({ length: n }, (_, i) => Math.floor(((i + 1) * k) / n) > Math.floor((i * k) / n));
}

// The longest run of empty steps, going round from the end of the bar to its start
export function longestGap(on: readonly boolean[]): number {
	let best = 0, run = 0;
	for (let i = 0; i < on.length * 2; i++) {
		if (on[i % on.length]) run = 0;
		else best = Math.max(best, ++run);
	}
	return Math.min(best, on.length);
}

export function randomPattern(rng: Rng = Math.random): StepPattern {
	const pick = <T>(xs: readonly Weighted<T>[]): T => {
		let r = rng() * xs.reduce((sum, [, w]) => sum + w, 0);
		for (const [x, w] of xs) {
			r -= w;
			if (r < 0) return x;
		}
		return xs[xs.length - 1][0];
	};
	const between = (lo: number, hi: number) => Number((Math.round((lo + rng() * (hi - lo)) / 0.05) * 0.05).toFixed(2));
	const otherNote = () => RANDOM_NOTES[1 + Math.floor(rng() * (RANDOM_NOTES.length - 1))];

	// The idea: which of its steps play
	let idea: boolean[];
	const kind = rng();
	if (kind < 0.15) {
		const k = EUCLID[Math.floor(rng() * EUCLID.length)];
		const even = euclid(k, RANDOM_STEPS);
		const hitsAt = even.map((on, i) => (on ? i : -1)).filter(i => i >= 0);
		const start = hitsAt[Math.floor(rng() * hitsAt.length)]; // turned to start on one of its hits
		idea = even.map((_, i) => even[(i + start) % RANDOM_STEPS]);
	} else if (kind < 0.55) {
		const cell = pick(CELLS_4);
		idea = Array.from({ length: 4 }, (_, i) => cell.includes(i));
	} else if (kind < 0.85) {
		const cell = pick(CELLS_8);
		idea = Array.from({ length: 8 }, (_, i) => cell.includes(i));
	} else {
		// Two one-beat ideas side by side
		const a = pick(CELLS_4), b = pick(CELLS_4);
		idea = Array.from({ length: 8 }, (_, i) => (i < 4 ? a.includes(i) : b.includes(i - 4)));
	}
	const len = idea.length;

	// Its notes and accents, which repeat with it
	const notes = idea.map((on, i) => (i === 0 || rng() < 0.65 ? 0 : otherNote()));
	const vels = idea.map((_, i) => (i % 4 === 0 ? between(0.85, 1) : between(0.45, 0.8)));

	const steps: (PatternStep | null)[] = Array.from({ length: RANDOM_STEPS }, (_, i) =>
		idea[i % len] ? { note: notes[i % len], vel: vels[i % len], repeats: 1 } : null);

	// Sometimes a fill on the last beat, leading back to step 1
	if (len < RANDOM_STEPS && rng() < 0.55) {
		const fill = pick(FILLS);
		const filled = steps.slice();
		for (let j = 0; j < 4; j++) {
			const on = fill.includes(j);
			filled[12 + j] = on
				? { note: 0, vel: Number(Math.min(1, 0.55 + 0.1 * j + (j === 0 ? 0.3 : 0)).toFixed(2)), repeats: 1 }
				: null;
		}
		// Within the rules: no long gap (a fill starting off the beat after an empty stretch)
		if (longestGap(filled.map(Boolean)) <= MAX_GAP) {
			const fillHits = fill.map(j => 12 + j);
			const last = fillHits[fillHits.length - 1];
			if (last !== 12 && rng() < 0.5) filled[last] = { ...filled[last]!, note: rng() < 0.6 ? 12 : 7 };
			// A roll on a hit off the beat
			const offBeat = fillHits.filter(i => i % 4 !== 0);
			if (offBeat.length && rng() < 0.6) {
				const i = offBeat[Math.floor(rng() * offBeat.length)];
				filled[i] = { ...filled[i]!, repeats: 2 + Math.floor(rng() * 3) };
			}
			steps.splice(0, RANDOM_STEPS, ...filled);
		}
	}

	return { id: 'random', label: 'Random', description: 'A random pattern', steps };
}

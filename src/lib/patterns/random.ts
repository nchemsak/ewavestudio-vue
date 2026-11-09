// src/lib/patterns/random.ts
// The Patterns box's dice: a new pattern from random choices, applied like a built-in one
// (applyPattern in patterns.ts), so it sets the pattern only and one roll is one undo step.
//
// Random over every step would mostly give a busy, aimless pattern, so this is a recipe: step 1
// always plays, then 3–8 more hits, more likely on the beats than between them; beats are
// accented, the rest softer; most notes are the root, some its octave or fifths (in every
// scale, so always in key); sometimes one or two hits off the beat get a roll of 2–4 repeats.
// Velocities sit on the pads' slider steps (0.05 here).

import type { PatternStep, StepPattern } from './patterns';

// 0 ≤ x < 1, like Math.random (the tests pass a seeded one)
export type Rng = () => number;

export const RANDOM_STEPS = 16;
export const RANDOM_NOTES = [0, 12, 7, -5] as const; // the root most of the time

// How likely each step is to get a hit: beats most, then the eighths between them
const weightOf = (i: number) => (i % 4 === 0 ? 4 : i % 2 === 0 ? 2 : 1);

export function randomPattern(rng: Rng = Math.random): StepPattern {
	const between = (lo: number, hi: number) => Math.round((lo + rng() * (hi - lo)) / 0.05) * 0.05;
	const hits = new Set<number>([0]);
	const extra = 3 + Math.floor(rng() * 6); // 3–8 more
	while (hits.size < 1 + extra) {
		const pool = Array.from({ length: RANDOM_STEPS }, (_, i) => i).filter(i => !hits.has(i));
		const total = pool.reduce((sum, i) => sum + weightOf(i), 0);
		let r = rng() * total;
		for (const i of pool) {
			r -= weightOf(i);
			if (r < 0) { hits.add(i); break; }
		}
	}

	const steps: (PatternStep | null)[] = Array.from({ length: RANDOM_STEPS }, (_, i) => {
		if (!hits.has(i)) return null;
		const onBeat = i % 4 === 0;
		const note = i === 0 || rng() < 0.65 ? 0 : RANDOM_NOTES[1 + Math.floor(rng() * (RANDOM_NOTES.length - 1))];
		const vel = Number((onBeat ? between(0.85, 1) : between(0.45, 0.85)).toFixed(2));
		return { note, vel, repeats: 1 };
	});

	// A roll or two, on hits off the beat
	const offBeat = [...hits].filter(i => i % 4 !== 0);
	const rolls = rng() < 0.45 ? (rng() < 0.3 ? 2 : 1) : 0;
	for (let k = 0; k < rolls && offBeat.length; k++) {
		const i = offBeat.splice(Math.floor(rng() * offBeat.length), 1)[0];
		steps[i] = { ...steps[i]!, repeats: 2 + Math.floor(rng() * 3) };
	}

	return { id: 'random', label: 'Random', description: 'A random pattern', steps };
}

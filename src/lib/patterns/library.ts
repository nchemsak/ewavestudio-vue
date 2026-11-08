// src/lib/patterns/library.ts
// The built-in patterns (see patterns.ts for what a pattern sets and how it's applied). The
// names and notes are a first try, to be changed once they've been heard.
//
// One entry per step, from step 1: `_` is an off step; n(note, velocity, repeats) is a step
// that plays `note` semitones from the key's root (in the pads' octave), at `velocity`
// (0–1, the pad's slider), with `repeats` quick hits (a ratchet, 1–4). The notes are only the
// root, its fifth and octaves (0, 7, 12, −5, −12), which belong to every scale the Melody Maker
// offers, so a pattern is always in key.

import type { PatternStep, StepPattern } from './patterns';

const _ = null;
const n = (note = 0, vel = 1, repeats = 1): PatternStep => ({ note, vel, repeats });

export const PATTERNS: readonly StepPattern[] = [
	{
		// Four on the floor: a hit on every beat
		id: 'pulse',
		label: 'Pulse',
		description: 'Pulse: a hit on every beat, four on the floor.',
		steps: [n(), _, _, _, n(), _, _, _, n(), _, _, _, n(), _, _, _],
	},
	{
		// Between the beats, with a soft pickup before the next bar
		id: 'offbeat',
		label: 'Offbeat',
		description: 'Offbeat: a hit between each beat, and a soft pickup at the end.',
		steps: [_, _, n(), _, _, _, n(), _, _, _, n(), _, _, _, n(), n(0, 0.45)],
	},
	{
		// Da-da-dum on every beat, the first hit of each accented, an octave up at the end
		id: 'gallop',
		label: 'Gallop',
		description: 'Gallop: three hits to every beat, the first accented.',
		steps: [
			n(0, 1), _, n(0, 0.6), n(0, 0.65),
			n(0, 1), _, n(0, 0.6), n(0, 0.65),
			n(0, 1), _, n(0, 0.6), n(0, 0.65),
			n(0, 1), _, n(0, 0.6), n(12, 0.65),
		],
	},
	{
		// Sparse hits with rolls of quick repeats in between, the last one up a fifth
		id: 'rolls',
		label: 'Rolls',
		description: 'Rolls: sparse hits with quick rolls of two, three and four repeats.',
		steps: [
			n(0, 1), _, _, _,
			n(0, 0.85, 2), _, _, _,
			n(0, 1), _, _, n(0, 0.7, 3),
			n(0, 1), _, n(7, 0.75, 4), _,
		],
	},
	{
		// A busy sixteenth-note line jumping between the root, its octave and its fifths
		id: 'bassline',
		label: 'Bassline',
		description: 'Bassline: a busy line between the root, its octave and its fifths, with accents.',
		steps: [
			n(0, 1), _, n(12, 0.7), n(0, 0.8),
			_, n(0, 1), n(12, 0.7), _,
			n(7, 0.9), _, n(0, 0.8), n(12, 0.7),
			n(0, 1), _, n(-5, 0.75), n(0, 0.6),
		],
	},
	{
		// Off the grid: hits that dodge the beats, with one double hit
		id: 'broken',
		label: 'Broken',
		description: 'Broken: a syncopated beat that dodges the grid, with a double hit.',
		steps: [
			n(0, 1), _, _, n(0, 0.8),
			_, _, n(7, 0.9), _,
			_, n(0, 0.85), n(0, 0.6, 2), _,
			_, n(12, 0.9), _, n(0, 0.5),
		],
	},
];

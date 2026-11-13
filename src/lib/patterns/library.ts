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
		// 3-3-2 twice: the tresillo, the last hit up a fifth. It replaced "Pulse" (PR 51), a hit
		// on every beat, which was Pattern Tools' Every 4 again
		id: 'tresillo',
		label: 'Tresillo',
		description: 'Tresillo: three hits to every two beats, 3-3-2, the rhythm under a lot of dance and Latin music.',
		steps: [
			n(0, 1), _, _, n(0, 0.75),
			_, _, n(0, 0.85), _,
			n(0, 1), _, _, n(0, 0.75),
			_, _, n(7, 0.85), _,
		],
	},
	{
		// Half-time (PR 69, replacing Offbeat, which had no downbeat and seemed to float): the
		// root as the kick on beat 1, the octave up as the snare on beat 3, so the bar feels
		// twice as slow; a kick on the "a" of 2 and the "and" of 4, soft ghost notes between
		id: 'halftime',
		label: 'Halftime',
		description: 'Halftime: a heavy, slow groove, the snare (an octave up) on beat 3 only, with ghost notes.',
		steps: [
			n(0, 1), _, _, n(0, 0.45),
			_, _, n(0, 0.8), _,
			n(12, 1), _, _, n(0, 0.45),
			_, _, n(0, 0.85), n(12, 0.4),
		],
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
		// A breakbeat (PR 69, replacing Broken, which had no clear groove): the root as the kick
		// on 1, the "and" of 1 and around beat 3, the octave up as the snare on beats 2 and 4,
		// with ghost snares and a quick double kick
		id: 'breaks',
		label: 'Breaks',
		description: 'Breaks: a funky breakbeat, kicks on the root and snares an octave up on 2 and 4.',
		steps: [
			n(0, 1), _, n(0, 0.8), _,
			n(12, 1), _, _, n(12, 0.45),
			_, n(0, 0.85), n(0, 0.75), _,
			n(12, 1), _, _, n(12, 0.5),
		],
	},
];

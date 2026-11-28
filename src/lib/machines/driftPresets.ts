// src/lib/machines/driftPresets.ts
// The Drift machine's built-in sounds and progressions, and their dice (the plan's item 6,
// part 2): what the transport card's boxes offer while Drift is chosen. Like Drums' and Bass's:
// a sound sets Drift's sound only (Voices, Drift, Wave, Spread, Filter, Attack, Release); a
// progression its bars only (how many, and the plates each holds). Pure (no Vue), unit-tested.
//
// A progression is written as plates, not notes: 0–5 are the key's chord in thirds, degrees
// 1 3 5 7 9 11 (src/audio/drift.ts), so it plays in whatever key and scale the Melody Maker has.
// Three plates in a row are a triad: [0,1,2] the key's own chord (A minor: Am), [1,2,3] the one
// a third up (C), [2,3,4] a fifth up (Em), [3,4,5] a seventh up (G). Neighbouring triads share
// two notes, so a progression of them moves smoothly (the notes they share carry on).

import { DRIFT_MAX_BARS, DRIFT_PLATES, DRIFT_RANGES, type DriftVoice } from '../../audio/drift';
import { MOTION_RATES, MOTION_SHAPES, type MotionShape } from '../../audio/driftMotion';
import { PULSE_MODES } from '../../audio/driftPulse';

export type DriftSoundPreset = { id: string; label: string; description: string; sound: DriftVoice };

// Motion (the plan's item 19): [shape, Rate, Depth]; none, Depth 0
type M = [MotionShape, number, number];
const NONE: M = ['circle', 4, 0];
const s = (voices: number, drift: number, wave: number, spread: number, cutoff: number, attack: number, release: number,
	[motionShape, motionRate, motionDepth]: M = NONE): DriftVoice =>
	({ voices, drift, wave, spread, cutoff, attack, release, motionShape, motionRate, motionDepth, pulseMode: 'off', pulseDepth: 0.7 });

export const DRIFT_SOUNDS: readonly DriftSoundPreset[] = [
	{ id: 'strings', label: 'Strings', description: 'Strings: a bright, wide string section, swelling in over a bar, the filter opening with each new chord.',
		sound: s(6, 0.35, 0.85, 0.7, 2600, 1, 1, ['swell', 4, 0.5]) },
	{ id: 'haze', label: 'Haze', description: 'Haze: every voice wandering, as wide as it goes, slow to come and go, the filter wandering too.',
		sound: s(7, 0.8, 0.4, 1, 1100, 2, 2, ['wander', 8, 0.3]) },
	{ id: 'choir', label: 'Choir', description: 'Choir: soft, round voices close together, like an "oo".',
		sound: s(5, 0.25, 0.2, 0.5, 1500, 0.75, 1.25) },
	{ id: 'glass', label: 'Glass', description: 'Glass: three pure voices, quick in and ringing out, open at the top.',
		sound: s(3, 0.1, 0.05, 0.35, 6000, 0.25, 2) },
	{ id: 'tide', label: 'Tide', description: 'Tide: dark and wide, three bars to rise and three to fall, the filter sweeping up and back every 8 bars.',
		sound: s(6, 0.6, 0.6, 0.9, 700, 3, 3, ['sweep', 8, 0.4]) },
	{ id: 'dust', label: 'Dust', description: 'Dust: a narrow, worn, out-of-tune pad behind a dark filter that circles slowly.',
		sound: s(4, 1, 0.7, 0.25, 450, 0.5, 0.75, ['circle', 4, 0.25]) },
];

/** A key to compare a sound by (rounded as the knobs step). With Depth 0 Motion's shape and
 * Rate change nothing, so they don't count. */
export function driftSoundKey(v: DriftVoice): string {
	const depth = Math.round((v.motionDepth ?? 0) * 100);
	const motion = depth > 0 ? [v.motionShape, v.motionRate, depth] : [];
	// Pulse likewise: Off, or Depth 0, whatever the rest
	const pulseDepth = Math.round((v.pulseDepth ?? 0) * 100);
	const pulse = (v.pulseMode ?? 'off') !== 'off' && pulseDepth > 0 ? ['pulse', v.pulseMode, pulseDepth] : [];
	return JSON.stringify([Math.round(v.voices), Math.round(v.drift * 100), Math.round(v.wave * 100), Math.round(v.spread * 100),
		Math.round(v.cutoff), Math.round(v.attack * 4), Math.round(v.release * 4), ...motion, ...pulse]);
}

// A progression: its length (4 or 8 bars) and each bar's plates
export type DriftProgression = { id: string; label: string; description: string; length: number; bars: number[][] };

const I = [0, 1, 2], III = [1, 2, 3], V = [2, 3, 4], VII = [3, 4, 5];
const I7 = [0, 1, 2, 3], III7 = [1, 2, 3, 4], V7 = [2, 3, 4, 5];
const Iadd9 = [0, 1, 2, 4], OPEN = [0, 2, 4];

export const DRIFT_PROGRESSIONS: readonly DriftProgression[] = [
	{ id: 'hold', label: 'Hold', description: 'Hold: the key\'s own chord for four bars, a 7th and then a 9th added and taken away.',
		length: 4, bars: [I, I, I7, Iadd9] },
	{ id: 'rise', label: 'Rise', description: 'Rise: each chord a third above the last (Am, C, Em, G in A minor).',
		length: 4, bars: [I, III, V, VII] },
	{ id: 'fall', label: 'Fall', description: 'Fall: each chord a third below the last, coming home on the fourth bar.',
		length: 4, bars: [VII, V, III, I] },
	{ id: 'sway', label: 'Sway', description: 'Sway: back and forth between the key\'s chord and the one a third up.',
		length: 4, bars: [I, III, I, III7] },
	{ id: 'wander', label: 'Wander', description: 'Wander: eight bars climbing slowly by thirds, the 7ths between, ending open.',
		length: 8, bars: [I, I7, III, III7, V, V7, VII, OPEN] },
	{ id: 'circle', label: 'Circle', description: 'Circle: eight bars round the key and back (Am, G, C, Em... in A minor).',
		length: 8, bars: [I, VII, III, V, I7, VII, III7, OPEN] },
];

/** A progression's bars as the machine's chords: DRIFT_MAX_BARS bars of DRIFT_PLATES plates (the bars after its length empty) */
export function progressionChords(bars: number[][]): boolean[][] {
	return Array.from({ length: DRIFT_MAX_BARS }, (_, b) =>
		Array.from({ length: DRIFT_PLATES }, (_, k) => (bars[b] ?? []).includes(k)));
}

/** A key to compare a progression by: its length and the bars it plays */
export function driftProgressionKey(length: number, chords: boolean[][]): string {
	return JSON.stringify([length, chords.slice(0, length).map((r) => r.map((on) => (on ? 1 : 0)).join(''))]);
}

// The dice START

const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
const between = (r: () => number, lo: number, hi: number, step: number) => Math.round((lo + r() * (hi - lo)) / step) * step;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** A random sound: every setting within a range that keeps it a pad (never silent, never a
 * buzz with no room), on the knobs' steps. Motion is drawn last (so every roll from before it
 * is the same sound otherwise): in half the rolls, any shape, a Rate of 2–16 bars, Depth
 * 0.15–0.5 */
export function randomDriftSound(r: () => number = Math.random): DriftVoice {
	const [lo, hi] = [400, 5000];
	const v = {
		voices: Math.round(between(r, DRIFT_RANGES.voices[0], DRIFT_RANGES.voices[1], 1)),
		drift: round2(between(r, 0.1, 0.9, 0.01)),
		wave: round2(between(r, 0, 1, 0.01)),
		spread: round2(between(r, 0.2, 1, 0.01)),
		cutoff: Math.round(lo * (hi / lo) ** r()),
		attack: between(r, 0.25, 3, 0.25),
		release: between(r, 0.5, 3, 0.25),
	};
	const m = r() < 0.5
		? { motionShape: NONE[0], motionRate: NONE[1], motionDepth: 0 }
		: { motionShape: pick(r, MOTION_SHAPES), motionRate: pick(r, MOTION_RATES.slice(1)), motionDepth: round2(between(r, 0.15, 0.5, 0.01)) };
	// Pulse, drawn after Motion (the plan's item 20): in a quarter of the rolls, a gate or Duck,
	// Depth 0.4–0.9 (so every roll from before it is the same sound otherwise)
	const p = r() < 0.25
		? { pulseMode: pick(r, PULSE_MODES.slice(1)), pulseDepth: round2(between(r, 0.4, 0.9, 0.01)) }
		: { pulseMode: 'off' as const, pulseDepth: 0.7 };
	return { ...v, ...m, ...p };
}

const TRIADS = [I, III, V, VII];

/** A random progression: 4 bars (or 8, a third of the time) starting on the key's own chord,
 * each next chord mostly a neighbour (a third up or down: two notes carry on), now and then a
 * leap; a 7th added to some; never the same chord twice in a row */
export function randomDriftProgression(r: () => number = Math.random): { length: number; bars: number[][] } {
	const length = r() < 1 / 3 ? 8 : 4;
	const bars: number[][] = [];
	let at = 0;
	for (let b = 0; b < length; b++) {
		if (b > 0) {
			const near = [at - 1, at + 1].filter((i) => i >= 0 && i < TRIADS.length);
			const far = TRIADS.map((_, i) => i).filter((i) => i !== at && !near.includes(i));
			at = r() < 0.75 || !far.length ? pick(r, near) : pick(r, far);
		}
		const chord = [...TRIADS[at]];
		const top = chord[chord.length - 1] + 1;
		if (b > 0 && top < DRIFT_PLATES && r() < 0.3) chord.push(top);
		bars.push(chord);
	}
	return { length, bars };
}

// The dice END

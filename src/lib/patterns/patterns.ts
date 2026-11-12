// src/lib/patterns/patterns.ts
// Built-in patterns: ready-made step patterns, picked from the Patterns buttons in the
// transport card (PresetButtons.vue, beside Sounds). The patterns themselves are in
// library.ts; the dice's random pattern is in random.ts.
//
// A pattern sets the synth lane's pattern only: which steps are on, their velocities, their
// pitches and their repeats (ratchets). Pitches are relative to the key: a pattern's notes are
// semitones from the key's root in the pads' octave (the pitch of an untouched pad, so A3 by
// default), folded by octaves into the pads' range. It never touches the sound, the pads'
// waves, which steps get noise, the key, tempo, swing or volume, or the Melody Maker.
// Off steps get the root, full velocity and one hit, as File → New leaves them.
//
// Like snapshot.ts, this only reads and writes the settings' refs, so it's unit-tested in Node.

import type { ProjectState } from '../project/snapshot';
import { clampRatchet } from '../../audio/ratchet';

// A step that plays: semitones from the key's root, velocity 0–1, 1–4 quick hits
export type PatternStep = { note: number; vel: number; repeats: number };

export type StepPattern = {
	id: string;          // stable name, for tests and analytics
	label: string;       // the button's text: short (eight letters at most)
	description: string; // the button's tooltip
	steps: readonly (PatternStep | null)[]; // one per step from step 1 (null: off); 16
};

// The pads' range (DrumSequencer's MIN_PAD_HZ, MAX_PAD_HZ)
export const PAD_RANGE = { min: 100, max: 2000 } as const;

const synthLane = (st: ProjectState) => st.instruments.value.find(i => i.name === 'synth-voice');

// The pitch `semitones` from `rootHz`, moved by whole octaves into [min, max]
export function noteHz(rootHz: number, semitones: number, range: { min: number; max: number } = PAD_RANGE): number {
	let hz = rootHz * 2 ** (semitones / 12);
	while (hz > range.max && hz / 2 >= range.min) hz /= 2;
	while (hz < range.min && hz * 2 <= range.max) hz *= 2;
	return hz;
}

// Apply START

// The pattern on the synth lane, its notes from the key's root in the pads' octave. Repeated to
// fill the lane if it has more steps than the pattern.
export function applyPattern(st: ProjectState, pattern: StepPattern, range = PAD_RANGE) {
	const lane = synthLane(st);
	if (!lane) return;
	const rootHz = st.synth.tuning.currentDefaultHz.value;
	const count = st.ui.stepLength.value;
	const at = (i: number) => pattern.steps[i % pattern.steps.length];
	const idx = Array.from({ length: count }, (_, i) => i);
	lane.steps = idx.map(i => at(i) !== null);
	lane.velocities = idx.map(i => at(i)?.vel ?? 1);
	lane.pitches = idx.map(i => noteHz(rootHz, at(i)?.note ?? 0, range));
	lane.ratchets = idx.map(i => clampRatchet(at(i)?.repeats ?? 1));
	// Its repeats play the pad's note (a pad's "Notes" Up or Down is part of the pattern too)
	if (lane.repeatNotes) lane.repeatNotes = idx.map(() => 'same');
}

// Apply END

// Matching START

// The synth lane's pattern in a snapshot (from buildSnapshot() or the project store's copy), as
// text: equal texts are the same pattern. Velocities and pitches are rounded the way the pads'
// sliders and the snapshot round-trip leave them, so a pattern still matches once saved.
export function patternKey(s: any): string {
	const lane = Array.isArray(s?.instruments) ? s.instruments.find((i: any) => i?.name === 'synth-voice') : null;
	if (!lane || !Array.isArray(lane.steps)) return '';
	const r = (x: unknown, d: number) => (typeof x === 'number' ? Math.round(x * d) / d : null);
	return JSON.stringify({
		steps: lane.steps,
		vel: (lane.velocities ?? []).map((v: unknown) => r(v, 100)),
		hz: (lane.pitches ?? []).map((v: unknown) => r(v, 100)),
		rep: lane.ratchets ?? null,
		// Older snapshots have none: the same as every step 'same'
		notes: (lane.repeatNotes ?? []).some((n: unknown) => n === 'up' || n === 'down') ? lane.repeatNotes : null,
	});
}

// Matching END

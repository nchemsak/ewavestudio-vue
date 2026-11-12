// src/audio/ratchet.ts
// Ratchets: a step can play 2, 3 or 4 quick hits instead of one (a roll or stutter), set per
// step in the pad's ⋮ menu ("Repeats") and saved as the synth lane's `ratchets` (1 = a single
// hit, as before). Shared by the live engine (liveEngine.ts) and the WAV export engine.
//
// The hits split the step's time evenly: from the step's start to the next step's start,
// which swing makes longer for an on-beat step and shorter for a swung one. Each hit is a
// whole note (its own pitch and filter sweeps), but it ends where the next hit begins, the way
// a single-voice synth retriggers, so a long sound repeated doesn't pile up into a smear that
// grows louder with each hit. The last hit rings out as a step's one note would.

export const RATCHET_COUNTS = [1, 2, 3, 4] as const;
export const RATCHET_MAX = 4;

// A saved value as a hit count: a whole number 1–4; anything else is 1
export function clampRatchet(n: unknown): number {
	return typeof n === 'number' && Number.isFinite(n) ? Math.max(1, Math.min(RATCHET_MAX, Math.round(n))) : 1;
}

// Seconds from a step's start to the next step's start. Swing (0–0.5) delays every second
// step (indexes 1, 3, 5, ...) by swing × the step's length.
export function stepSpan(stepIndex: number, stepLength: number, stepDuration: number, swing: number): number {
	const swungAt = (i: number) => (i % 2 === 1 ? stepDuration * swing : 0);
	return stepDuration + swungAt((stepIndex + 1) % stepLength) - swungAt(stepIndex);
}

// When each hit of a step starts, and how long it may last (until the next hit; the last
// hit has no limit)
export function ratchetHits(start: number, span: number, count: unknown): { time: number; maxDuration?: number }[] {
	const n = clampRatchet(count);
	const gap = span / n;
	return Array.from({ length: n }, (_, k) => (k < n - 1 ? { time: start + k * gap, maxDuration: gap } : { time: start + k * gap }));
}

// How a note's end is cut short for a ratchet hit: never before its attack is done (and at
// least 20 ms, the shortest gate), so the envelope's ramps stay in order
export function cutNoteEnd(noteEnd: number, start: number, attack: number, maxDuration?: number): number {
	if (maxDuration == null) return noteEnd;
	return Math.min(noteEnd, start + Math.max(maxDuration, attack + 0.005, 0.02));
}

// What a step's repeats play (the pad's ⋮ menu, "Notes"; saved per step as the synth lane's
// `repeatNotes`, PR 58): the pad's note every time ('same', the default and what every step did
// before), or stepping up or down through the key's chord, from the pad's own note: a ×4 on the
// root goes 1-3-5-8 (an arpeggio within the step)
export const REPEAT_NOTES = ['same', 'up', 'down'] as const;
export type RepeatNotes = typeof REPEAT_NOTES[number];

export function clampRepeatNotes(v: unknown): RepeatNotes {
	return v === 'up' || v === 'down' ? v : 'same';
}

// Each hit's pitch, Hz. chord: the key's chord as pitch classes (theory.ts, chordPitchClasses);
// each hit goes to the next chord note above (or below) the one before, keeping the pad's fine
// tuning (its cents off the note). With no chord, an octave. A hit beyond the pads' range
// (min..max Hz) moves back by an octave, so a high pad's run doesn't leave it.
export function ratchetPitches(
	hz: number,
	count: unknown,
	mode: unknown,
	chord: readonly number[],
	range: { min: number; max: number } = { min: 100, max: 2000 },
): number[] {
	const n = clampRatchet(count);
	const dir = clampRepeatNotes(mode);
	if (dir === 'same' || n === 1 || !(hz > 0)) return Array(n).fill(hz);
	const exact = 69 + 12 * Math.log2(hz / 440);
	const base = Math.round(exact);
	const cents = exact - base;
	const pcs = new Set(chord.map((p) => ((Math.round(p) % 12) + 12) % 12));
	const step = dir === 'up' ? 1 : -1;
	const toHz = (m: number) => 440 * Math.pow(2, (m + cents - 69) / 12);
	const out = [hz];
	let m = base;
	for (let k = 1; k < n; k++) {
		let next = m + step;
		if (pcs.size) {
			while (!pcs.has(((next % 12) + 12) % 12)) next += step;
		} else {
			next = m + 12 * step;
		}
		m = next;
		let f = toHz(m);
		while (f > range.max) f /= 2;
		while (f < range.min) f *= 2;
		out.push(f);
	}
	return out;
}

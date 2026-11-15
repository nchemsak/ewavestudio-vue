// src/lib/melody/roll.ts
// What the Melody Maker's screen draws (PR 76): the pattern as notes across the bar, and what
// Generate would do; since PR 80 each note as long as it sounds, and which one is playing.
// Pure, unit-tested; MelodyMaker.vue turns it into SVG.

import { ratchetHits, ratchetPitches, stepSpan } from '../../audio/ratchet';

export type RollNote = { i: number; hz: number };

// A pitch's height on the screen: log in Hz, `lo` at the bottom edge of the drawing area
// (height − bottom), `hi` at its top (top); pitches outside are held at the edges
export function rollY(hz: number, lo: number, hi: number, height: number, top = 16, bottom = 10): number {
	const t = Math.min(1, Math.max(0, Math.log(hz / lo) / Math.log(hi / lo)));
	return top + (1 - t) * (height - top - bottom);
}

// Every octave of the key's root (a pitch class, 0 = C) between lo and hi, in Hz: the
// screen's guide lines
export function rootOctavesHz(rootSemitone: number, lo: number, hi: number): number[] {
	const out: number[] = [];
	for (let m = 12 + (((rootSemitone % 12) + 12) % 12); m < 128; m += 12) {
		const hz = 440 * Math.pow(2, (m - 69) / 12);
		if (hz >= lo && hz <= hi) out.push(hz);
	}
	return out;
}

// The steps that are on, with their pitches
export function rollNotes(freqs: readonly number[], steps: readonly boolean[]): RollNote[] {
	return freqs.map((hz, i) => ({ i, hz })).filter((n) => !!steps[n.i]);
}

// The notes Generate would write that the pattern doesn't already have: a step that's off
// now, or on at another pitch (more than 5 cents away). Nothing left means nothing would change.
export function ghostNotes(now: readonly RollNote[], next: readonly RollNote[]): RollNote[] {
	const cents = (a: number, b: number) => Math.abs(1200 * Math.log2(a / b));
	return next.filter((g) => !now.some((n) => n.i === g.i && cents(n.hz, g.hz) <= 5));
}

// --- While playing (PR 80) ---------------------------------------------------------------

// One hit as the screen draws it, in steps from the bar's start: `start` to `end` is how long
// it sounds; `fadeEnd` is where its envelope would be done (the same as `end` unless the next
// hit cuts it short), so a cut note ends brighter than one that rings out. `end` can be past
// the bar's end (steps): that part is drawn from the bar's start again.
export type RollSeg = { i: number; k: number; hz: number; start: number; end: number; fadeEnd: number };

// The narrowest a hit is drawn, in steps, so a 20 ms blip can still be seen
export const ROLL_MIN_STEPS = 0.35;

// Every hit of the pattern. A step that's on starts where the engine plays it (swing delays
// every second step), sounds for `noteSteps` (Attack + Decay at the tempo, in steps) and is
// cut where the next hit begins, the next bar's first one included. A step with repeats is
// 2–4 hits splitting its time, at the pitches the engine plays (Up / Down climb the chord).
export function rollSegments(o: {
	freqs: readonly number[];
	steps: readonly boolean[];
	ratchets?: readonly number[];
	repeatNotes?: readonly string[];
	chord?: readonly number[];
	swing?: number;
	noteSteps: number;
	range?: { min: number; max: number };
}): RollSeg[] {
	const len = o.steps.length;
	const swing = Math.min(0.5, Math.max(0, o.swing ?? 0));
	const startOf = (i: number) => i + (i % 2 === 1 ? swing : 0);
	const on = o.steps.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
	const natural = Math.max(0, o.noteSteps);
	const out: RollSeg[] = [];
	on.forEach((i, n) => {
		// Where the next step that's on starts (this one again, a bar later, if it's alone)
		const nextOn = n + 1 < on.length ? startOf(on[n + 1]) : startOf(on[0]) + len;
		const hz = o.freqs[i] ?? 220;
		const hits = ratchetHits(startOf(i), stepSpan(i, len, 1, swing), o.ratchets?.[i]);
		const pitches = ratchetPitches(hz, o.ratchets?.[i], o.repeatNotes?.[i], o.chord ?? [], o.range);
		hits.forEach((hit, k) => {
			const limit = hit.maxDuration != null ? hit.time + hit.maxDuration : nextOn;
			const fadeEnd = hit.time + Math.max(natural, ROLL_MIN_STEPS);
			const end = Math.min(limit, fadeEnd);
			out.push({ i, k, hz: pitches[k] ?? hz, start: hit.time, end, fadeEnd });
		});
	});
	return out;
}

// Is the playhead (steps from the bar's start) inside this hit? A hit that runs past the
// bar's end still sounds at the start of the next bar.
export function segSounding(seg: RollSeg, pos: number, len = 16): boolean {
	return (pos >= seg.start && pos < seg.end) || (pos + len >= seg.start && pos + len < seg.end);
}

// The hit the playhead is in: the one that started last (a hit cut by the next never
// overlaps it, so there's one at most)
export function soundingKey(segs: readonly RollSeg[], pos: number | null, len = 16): string | null {
	if (pos == null) return null;
	const s = segs.find((x) => segSounding(x, pos, len));
	return s ? `${s.i}:${s.k}` : null;
}

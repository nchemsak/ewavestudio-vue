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

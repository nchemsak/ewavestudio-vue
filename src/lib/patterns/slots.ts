// Patterns A–D (the plan's item 2, part 1): four pattern slots per project. A slot holds the
// pattern, not the sound: which steps are on, their velocities, pitches, repeats and what the
// repeats play. The pads' waves and the noise mask stay with the sound and the pads, shared
// by every slot (a sound preset sets every pad's wave; the Noise card sets the mask).
//
// Saved as `patterns: { current, slots }` beside the lane, each slot a list of tracks from the
// start ({ machine: 'rhythm', ... }), so the machines to come (Bass, Drums, Drift) add a track
// to a slot without a second change to saved projects. A slot never used is null.
//
// The synth lane (instruments' 'synth-voice') is always the current slot's pattern as it's
// being edited: the engines, the pads and the export read the lane, as before. A slot's own
// copy of the current pattern is only brought up to date when another slot is picked, and
// buildSnapshot() writes the lane into it, so a saved project's current slot always matches.
// Pure (no Vue), unit-tested.

import { clampRatchet, clampRepeatNotes, type RepeatNotes } from '../../audio/ratchet';

export const SLOT_NAMES = ['A', 'B', 'C', 'D'] as const;
export const SLOT_COUNT = SLOT_NAMES.length;

/** The per-step lists a slot keeps (the pattern; not the waves or the noise, see above) */
export const SLOT_FIELDS = ['steps', 'velocities', 'pitches', 'ratchets', 'repeatNotes'] as const;

export type RhythmTrack = {
	machine: 'rhythm';
	steps: boolean[];
	velocities: number[];
	pitches: number[];
	ratchets: number[];
	repeatNotes: RepeatNotes[];
};
export type PatternTrack = RhythmTrack; // more machines join this union
export type PatternSlot = { tracks: PatternTrack[] };
export type Slots = (PatternSlot | null)[];

/** The parts of a lane a slot reads and writes */
export type LaneLike = {
	steps: boolean[];
	velocities: number[];
	pitches?: number[];
	ratchets?: number[];
	repeatNotes?: string[];
};

export function emptySlots(): Slots {
	return Array(SLOT_COUNT).fill(null);
}

/** An empty pattern: every step off, at full velocity, on the default note, one hit, Same */
export function emptyRhythm(n: number, hz: number): RhythmTrack {
	return {
		machine: 'rhythm',
		steps: Array(n).fill(false),
		velocities: Array(n).fill(1),
		pitches: Array(n).fill(hz),
		ratchets: Array(n).fill(1),
		repeatNotes: Array(n).fill('same'),
	};
}

/** The lane's pattern as a slot (copies, so editing the lane later doesn't change it) */
export function slotFromLane(lane: LaneLike, hz: number): PatternSlot {
	const n = lane.steps.length;
	return {
		tracks: [{
			machine: 'rhythm',
			steps: [...lane.steps],
			velocities: [...lane.velocities],
			pitches: lane.pitches ? [...lane.pitches] : Array(n).fill(hz),
			ratchets: lane.ratchets ? [...lane.ratchets] : Array(n).fill(1),
			repeatNotes: lane.repeatNotes ? [...lane.repeatNotes] as RepeatNotes[] : Array(n).fill('same'),
		}],
	};
}

/** A slot's Rhythm track, or null */
export function rhythmOf(slot: PatternSlot | null | undefined): RhythmTrack | null {
	return slot?.tracks.find((t) => t.machine === 'rhythm') ?? null;
}

/** Writes a slot's pattern into the lane (an empty pattern for a slot never used) */
export function loadIntoLane(lane: LaneLike, slot: PatternSlot | null | undefined, n: number, hz: number) {
	const t = rhythmOf(slot) ?? emptyRhythm(n, hz);
	lane.steps = [...t.steps];
	lane.velocities = [...t.velocities];
	if (lane.pitches) lane.pitches = [...t.pitches];
	if (lane.ratchets) lane.ratchets = [...t.ratchets];
	if (lane.repeatNotes) lane.repeatNotes = [...t.repeatNotes];
}

/** Whether a slot has any step on (its button shows it holds something) */
export function slotHasSteps(slot: PatternSlot | null | undefined): boolean {
	return !!rhythmOf(slot)?.steps.some(Boolean);
}

/** A slot with every Rhythm pitch passed through `f` (a key or scale change moves every slot) */
export function mapSlotPitches(slot: PatternSlot | null, f: (pitches: number[]) => number[]): PatternSlot | null {
	if (!slot) return slot;
	return { tracks: slot.tracks.map((t) => (t.machine === 'rhythm' ? { ...t, pitches: f([...t.pitches]) } : t)) };
}

// Loading START

function list<T>(from: unknown, n: number, fill: T, each: (x: unknown) => T): T[] {
	const a = Array.isArray(from) ? from : [];
	return Array.from({ length: n }, (_, i) => (i < a.length ? each(a[i]) : fill));
}

function trackFrom(t: any, n: number, hz: number): RhythmTrack | null {
	if (!t || typeof t !== 'object' || t.machine !== 'rhythm' || !Array.isArray(t.steps)) return null;
	const num = (d: number) => (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
	return {
		machine: 'rhythm',
		steps: list(t.steps, n, false, (x) => x === true),
		velocities: list(t.velocities, n, 1, (x) => Math.min(1, Math.max(0, num(1)(x)))),
		pitches: list(t.pitches, n, hz, (x) => { const v = num(hz)(x); return v > 0 ? v : hz; }),
		ratchets: list(t.ratchets, n, 1, (x) => clampRatchet(x as number)),
		repeatNotes: list(t.repeatNotes, n, 'same' as RepeatNotes, (x) => clampRepeatNotes(x as string)),
	};
}

/** A saved project's slots, checked: a damaged slot is dropped (null), lists fitted to n steps */
export function slotsFrom(saved: unknown, n: number, hz: number): Slots {
	const a = Array.isArray(saved) ? saved : [];
	return Array.from({ length: SLOT_COUNT }, (_, i) => {
		const s: any = a[i];
		if (!s || typeof s !== 'object' || !Array.isArray(s.tracks)) return null;
		const tracks = s.tracks.map((t: any) => trackFrom(t, n, hz)).filter(Boolean) as PatternTrack[];
		return tracks.length ? { tracks } : null;
	});
}

/** A saved current slot, 0–3 (anything else: A) */
export function slotIndexFrom(x: unknown): number {
	return Number.isInteger(x) && (x as number) >= 0 && (x as number) < SLOT_COUNT ? (x as number) : 0;
}

// Loading END

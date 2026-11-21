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
import type { BassPattern } from '../../audio/bass';
import { DRUM_SLOTS, type DrumRow } from '../../audio/drums';

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
// The Bass machine's track (the plan's item 4): its steps, velocities, pitches, and per step
// Accent, Slide and Tie (src/audio/bass.ts)
export const BASS_FIELDS = ['steps', 'velocities', 'pitches', 'accents', 'slides', 'ties'] as const;
export type BassTrack = BassPattern & { machine: 'bass' };
// The Drums machine's track (the plan's item 5): a row per slot, its steps and velocities
export type DrumsTrack = { machine: 'drums'; rows: DrumRow[] };
export type PatternTrack = RhythmTrack | BassTrack | DrumsTrack; // more machines join this union
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

/** The Bass lane's pattern as a track (copies) */
export function bassTrackFrom(b: BassPattern): BassTrack {
	return {
		machine: 'bass', steps: [...b.steps], velocities: [...b.velocities], pitches: [...b.pitches],
		accents: [...b.accents], slides: [...b.slides], ties: [...b.ties],
	};
}

/** The Drums rows as a track (copies) */
export function drumsTrackFrom(rows: DrumRow[]): DrumsTrack {
	return { machine: 'drums', rows: rows.map((r) => ({ steps: [...r.steps], velocities: [...r.velocities] })) };
}

/** The lane's pattern as a slot (copies, so editing the lane later doesn't change it), with
 * the Bass lane's and the Drums rows when given */
export function slotFromLane(lane: LaneLike, hz: number, bass?: BassPattern | null, drums?: DrumRow[] | null): PatternSlot {
	const n = lane.steps.length;
	return {
		tracks: [{
			machine: 'rhythm',
			steps: [...lane.steps],
			velocities: [...lane.velocities],
			pitches: lane.pitches ? [...lane.pitches] : Array(n).fill(hz),
			ratchets: lane.ratchets ? [...lane.ratchets] : Array(n).fill(1),
			repeatNotes: lane.repeatNotes ? [...lane.repeatNotes] as RepeatNotes[] : Array(n).fill('same'),
		} as PatternTrack, ...(bass ? [bassTrackFrom(bass)] : []), ...(drums ? [drumsTrackFrom(drums)] : [])],
	};
}

/** A slot's Rhythm track, or null */
export function rhythmOf(slot: PatternSlot | null | undefined): RhythmTrack | null {
	return (slot?.tracks.find((t) => t.machine === 'rhythm') as RhythmTrack | undefined) ?? null;
}

/** A slot's Bass track, or null */
export function bassOf(slot: PatternSlot | null | undefined): BassTrack | null {
	return (slot?.tracks.find((t) => t.machine === 'bass') as BassTrack | undefined) ?? null;
}

/** A slot's Drums track, or null */
export function drumsOf(slot: PatternSlot | null | undefined): DrumsTrack | null {
	return (slot?.tracks.find((t) => t.machine === 'drums') as DrumsTrack | undefined) ?? null;
}

/** Empty Drums rows: every step off, at full velocity */
export function emptyDrumRows(n: number): DrumRow[] {
	return Array.from({ length: DRUM_SLOTS }, () => ({ steps: Array(n).fill(false), velocities: Array(n).fill(1) }));
}

/** A slot's Drums rows (copies; empty ones for a slot without them) */
export function drumRowsOf(slot: PatternSlot | null | undefined, n: number): DrumRow[] {
	const t = drumsOf(slot);
	return t ? drumsTrackFrom(t.rows).rows : emptyDrumRows(n);
}

/** An empty Bass track */
export function emptyBass(n: number, hz: number): BassTrack {
	return {
		machine: 'bass', steps: Array(n).fill(false), velocities: Array(n).fill(1), pitches: Array(n).fill(hz),
		accents: Array(n).fill(false), slides: Array(n).fill(false), ties: Array(n).fill(false),
	};
}

/** Writes a slot's Bass pattern into the Bass lane (an empty one for a slot without it) */
export function loadBassIntoLane(lane: BassPattern, slot: PatternSlot | null | undefined, n: number, hz: number) {
	const t = bassOf(slot) ?? emptyBass(n, hz);
	for (const f of BASS_FIELDS) (lane as any)[f] = [...(t as any)[f]];
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
	return !!slot?.tracks.some((t) => (t.machine === 'drums' ? t.rows.some((r) => r.steps.some(Boolean)) : t.steps.some(Boolean)));
}

/** A slot with every Rhythm pitch passed through `f` (a key or scale change moves every slot) */
export function mapSlotPitches(slot: PatternSlot | null, f: (pitches: number[]) => number[],
	fBass?: (pitches: number[]) => number[]): PatternSlot | null {
	if (!slot) return slot;
	return {
		tracks: slot.tracks.map((t) => (t.machine === 'rhythm' ? { ...t, pitches: f([...t.pitches]) }
			: t.machine === 'bass' && fBass ? { ...t, pitches: fBass([...t.pitches]) } : t)),
	};
}

// Loading START

function list<T>(from: unknown, n: number, fill: T, each: (x: unknown) => T): T[] {
	const a = Array.isArray(from) ? from : [];
	return Array.from({ length: n }, (_, i) => (i < a.length ? each(a[i]) : fill));
}

function trackFrom(t: any, n: number, hz: number, bassHz: number): PatternTrack | null {
	const num = (d: number) => (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
	if (t && typeof t === 'object' && t.machine === 'drums') {
		if (!Array.isArray(t.rows)) return null;
		return {
			machine: 'drums',
			rows: Array.from({ length: DRUM_SLOTS }, (_, i) => ({
				steps: list(t.rows[i]?.steps, n, false, (x) => x === true),
				velocities: list(t.rows[i]?.velocities, n, 1, (x) => Math.min(1, Math.max(0, num(1)(x)))),
			})),
		};
	}
	if (!t || typeof t !== 'object' || !Array.isArray(t.steps)) return null;
	if (t.machine === 'bass') {
		const bool = (x: unknown) => x === true;
		return {
			machine: 'bass',
			steps: list(t.steps, n, false, bool),
			velocities: list(t.velocities, n, 1, (x) => Math.min(1, Math.max(0, num(1)(x)))),
			pitches: list(t.pitches, n, bassHz, (x) => { const v = num(bassHz)(x); return v > 0 ? v : bassHz; }),
			accents: list(t.accents, n, false, bool),
			slides: list(t.slides, n, false, bool),
			ties: list(t.ties, n, false, bool),
		};
	}
	if (t.machine !== 'rhythm') return null;
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
export function slotsFrom(saved: unknown, n: number, hz: number, bassHz = hz / 4): Slots {
	const a = Array.isArray(saved) ? saved : [];
	return Array.from({ length: SLOT_COUNT }, (_, i) => {
		const s: any = a[i];
		if (!s || typeof s !== 'object' || !Array.isArray(s.tracks)) return null;
		const tracks = s.tracks.map((t: any) => trackFrom(t, n, hz, bassHz)).filter(Boolean) as PatternTrack[];
		return tracks.length ? { tracks } : null;
	});
}

/** A saved current slot, 0–3 (anything else: A) */
export function slotIndexFrom(x: unknown): number {
	return Number.isInteger(x) && (x as number) >= 0 && (x as number) < SLOT_COUNT ? (x as number) : 0;
}

// Loading END

// Chain START
// The chain (the plan's item 2, part 2): up to eight cells under the slots, each a slot or empty.
// While it's on, playing follows the filled cells in order, a bar each, round again at the end.

export const CHAIN_LENGTH = 8;

export type Chain = (number | null)[];

export function emptyChain(): Chain {
	return Array(CHAIN_LENGTH).fill(null);
}

/** A saved chain, checked: 8 cells, each a slot 0–3 or null */
export function chainFrom(saved: unknown): Chain {
	const a = Array.isArray(saved) ? saved : [];
	return Array.from({ length: CHAIN_LENGTH }, (_, i) => {
		const x = a[i];
		return Number.isInteger(x) && x >= 0 && x < SLOT_COUNT ? x : null;
	});
}

/** The filled cells, in order: their positions in the chain */
export function chainCells(chain: Chain): number[] {
	return chain.flatMap((s, i) => (s == null ? [] : [i]));
}

/** The cell after `cell` (a position in the chain; −1: before the first), round the end; null with none */
export function nextChainCell(chain: Chain, cell: number): number | null {
	const cells = chainCells(chain);
	if (!cells.length) return null;
	return cells.find((i) => i > cell) ?? cells[0];
}

/** A cell clicked: — → A → B → C → D → — (back: the other way) */
export function cycleCell(value: number | null, back = false): number | null {
	const order = [null, ...SLOT_NAMES.map((_, i) => i)];
	const at = order.indexOf(value);
	return order[(at + (back ? order.length - 1 : 1)) % order.length];
}

// Chain END

// Comparing projects START
// Which slot is showing is not an edit: picking one, or the chain playing through them, mustn't
// make an undo step or the unsaved dot. So undo and the dot compare this form of a snapshot:
// without the current slot's index, without the synth lane's pattern (it's in its slot too:
// buildSnapshot writes it there), and with an empty pattern the same as a slot never used.

function blankTrack(t: any): boolean {
	if (t?.machine === 'drums') return Array.isArray(t.rows) && t.rows.every(blankTrack);
	return !!t && Array.isArray(t.steps) && t.steps.every((s: unknown) => !s)
		&& (t.velocities ?? []).every((v: unknown) => v === 1)
		&& (t.ratchets ?? []).every((r: unknown) => r === 1)
		&& (t.repeatNotes ?? []).every((n: unknown) => n === 'same')
		&& ['accents', 'slides', 'ties'].every((f) => (t[f] ?? []).every((x: unknown) => !x))
		&& new Set(t.pitches ?? []).size <= 1;
}

export function comparableProject(data: any): any {
	if (!data || typeof data !== 'object' || !data.patterns || !Array.isArray(data.patterns.slots)) return data;
	const c = JSON.parse(JSON.stringify(data));
	const { current, ...patterns } = c.patterns;
	void current;
	patterns.slots = patterns.slots.map((s: any) => {
		if (!s || (Array.isArray(s.tracks) && s.tracks.every(blankTrack))) return null;
		// An empty Bass or Drums track is the same as none (a slot from before them, or one they never played in)
		return Array.isArray(s.tracks) ? { ...s, tracks: s.tracks.filter((t: any) => !((t?.machine === 'bass' || t?.machine === 'drums') && blankTrack(t))) } : s;
	});
	c.patterns = patterns;
	const lane = Array.isArray(c.instruments) ? c.instruments.find((i: any) => i?.name === 'synth-voice') : null;
	if (lane) for (const f of SLOT_FIELDS) delete lane[f];
	// The Bass lane's pattern is in its slot too
	if (c.bass?.lane) for (const f of BASS_FIELDS) delete c.bass.lane[f];
	// So are the Drums rows
	if (c.drums?.lane) delete c.drums.lane.rows;
	return c;
}

// Comparing projects END

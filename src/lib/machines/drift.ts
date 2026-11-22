// src/lib/machines/drift.ts
// The Drift machine (the plan's item 6): its settings, reactive, and their factory values. Like
// drums.ts. Its sound (Voices, Drift, Wave, Spread, Filter, Attack, Release), its mixer (mute,
// level, Pedals: its reverb send) and its chords: 4 or 8 bars, each the plates it holds.
//
// Saved as the snapshot's `drift` group: { sound, muted, level, pedals, length, chords }
// (snapshot.ts). The chords are the project's, not a pattern slot's: they count bars from Play
// across the chain. The plates are degrees of the key's chord (src/audio/drift.ts), so a new
// key or scale moves them with it.

import { reactive } from 'vue';
import { DRIFT_LENGTHS, DRIFT_MAX_BARS, DRIFT_PLATES, DRIFT_RANGES, type DriftVoice } from '../../audio/drift';

export type DriftSoundKey = keyof DriftVoice;
export const DRIFT_SOUND_KEYS: readonly DriftSoundKey[] = ['voices', 'drift', 'wave', 'spread', 'cutoff', 'attack', 'release'];

export type Drift = DriftVoice & {
	muted: boolean;
	level: number;
	pedals: number; // how much goes into the reverb (0..1)
	length: number; // 4 or 8 bars
	chords: boolean[][]; // DRIFT_MAX_BARS bars × DRIFT_PLATES plates
};

// The factory sound: a fresh page and File → New
export const DRIFT_DEFAULTS: DriftVoice = {
	voices: 5, drift: 0.4, wave: 0.5, spread: 0.6, cutoff: 1800, attack: 1, release: 1,
};
export const DRIFT_LEVEL_DEFAULT = 0.6;
export const DRIFT_PEDALS_DEFAULT = 0.6;
export const DRIFT_LENGTH_DEFAULT = 4;

export const emptyChords = (): boolean[][] =>
	Array.from({ length: DRIFT_MAX_BARS }, () => Array(DRIFT_PLATES).fill(false));

export function createDrift(): Drift {
	return reactive({
		...DRIFT_DEFAULTS,
		muted: false,
		level: DRIFT_LEVEL_DEFAULT,
		pedals: DRIFT_PEDALS_DEFAULT,
		length: DRIFT_LENGTH_DEFAULT,
		chords: emptyChords(),
	}) as Drift;
}

// File → New: the factory sound, nothing held, 4 bars, unmuted at its level
export function resetDrift(d: Drift) {
	resetDriftSound(d);
	d.muted = false;
	d.level = DRIFT_LEVEL_DEFAULT;
	d.pedals = DRIFT_PEDALS_DEFAULT;
	d.length = DRIFT_LENGTH_DEFAULT;
	d.chords = emptyChords();
}

export function resetDriftSound(d: Drift) {
	for (const k of DRIFT_SOUND_KEYS) d[k] = DRIFT_DEFAULTS[k];
}

/** The voice src/audio/drift.ts plays, from the settings now */
export function driftVoice(d: Drift): DriftVoice {
	return Object.fromEntries(DRIFT_SOUND_KEYS.map((k) => [k, d[k]])) as DriftVoice;
}

export const clampLength = (x: unknown) => (DRIFT_LENGTHS as readonly number[]).includes(x as number) ? (x as number) : DRIFT_LENGTH_DEFAULT;

/** The chords as saved: 8 bars × 6 plates of booleans */
export function chordsFrom(x: unknown): boolean[][] {
	const out = emptyChords();
	if (!Array.isArray(x)) return out;
	for (let b = 0; b < DRIFT_MAX_BARS; b++) {
		const row = x[b];
		if (!Array.isArray(row)) continue;
		for (let k = 0; k < DRIFT_PLATES; k++) out[b][k] = row[k] === true;
	}
	return out;
}

/** As saved */
export function driftSnapshot(d: Drift) {
	return {
		sound: driftVoice(d),
		muted: d.muted,
		level: d.level,
		pedals: d.pedals,
		length: d.length,
		chords: d.chords.map((r) => [...r]),
	};
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** A saved group back into the settings: missing or wrongly typed values are left as they are,
 * numbers kept within their ranges */
export function applyDrift(d: Drift, s: any) {
	if (!s || typeof s !== 'object') return;
	const snd = s.sound && typeof s.sound === 'object' ? s.sound : {};
	for (const k of DRIFT_SOUND_KEYS) {
		const x = snd[k];
		if (!num(x)) continue;
		const [lo, hi] = DRIFT_RANGES[k];
		d[k] = k === 'voices' ? Math.round(clamp(x, lo, hi)) : clamp(x, lo, hi);
	}
	if (typeof s.muted === 'boolean') d.muted = s.muted;
	if (num(s.level)) d.level = clamp(s.level, 0, 1);
	if (num(s.pedals)) d.pedals = clamp(s.pedals, 0, 1);
	if (s.length !== undefined) d.length = clampLength(s.length);
	if (s.chords !== undefined) d.chords = chordsFrom(s.chords);
}

/** A plate turned on or off in one bar (a new list, so watchers see it) */
export function togglePlate(d: Drift, bar: number, plate: number) {
	d.chords = d.chords.map((r, b) => (b === bar ? r.map((on, k) => (k === plate ? !on : on)) : r));
}

/** The phone's Copy (part 3): bar `bar`'s plates into the next bar, which it returns (−1 from the last bar: nothing copied) */
export function copyToNextBar(d: Drift, bar: number): number {
	const to = bar + 1;
	if (bar < 0 || to >= d.length) return -1;
	d.chords = d.chords.map((r, b) => (b === to ? [...d.chords[bar]] : r));
	return to;
}

/**
 * Which plates of bar `bar` carry on into the next bar (held in both, so one note that doesn't
 * start again: driftRuns()); the last bar's go round into bar 1, as they do while playing
 */
export function carriesOn(chords: boolean[][], length: number, bar: number): boolean[] {
	const n = Math.max(1, length);
	const now = chords[bar] ?? [], next = chords[(bar + 1) % n] ?? [];
	return Array.from({ length: DRIFT_PLATES }, (_, k) => n > 1 && !!now[k] && !!next[k]);
}

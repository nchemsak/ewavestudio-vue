// src/lib/machines/drumPresets.ts
// The Drums machine's built-in kits and patterns, and their dice (the plan's item 5, part 2):
// what the transport card's boxes offer while Drums is chosen. Like Bass's (bassPresets.ts):
// a kit sets the four slots' sounds (the frozen kit's only), Tune, Decay and Level, nothing
// else (not the mutes, not the kept sounds); a pattern sets the four rows only. Pure (no Vue),
// unit-tested.

import { DRUM_RANGES, DRUM_SLOTS, FACTORY_KIT, type DrumRow, type KitId } from '../../audio/drums';
import type { DrumSlot } from './drums';

// A kit: per slot, its kit sound, Tune (semitones), Decay and Level
export type DrumKitSlot = { sound: KitId; tune: number; decay: number; level: number };
export type DrumKitPreset = { id: string; label: string; description: string; slots: DrumKitSlot[] };

const k = (sound: KitId, tune: number, decay: number, level: number): DrumKitSlot => ({ sound, tune, decay, level });

export const DRUM_KITS: readonly DrumKitPreset[] = [
	{ id: 'kit', label: 'Kit', description: 'Kit: the kit as it comes, Kick, Snare, Tom and Hat.',
		slots: [k('kick', 0, 1, 0.9), k('snare', 0, 1, 0.7), k('tom', 0, 1, 0.6), k('closed', 0, 1, 0.5)] },
	{ id: 'sub', label: 'Sub', description: 'Sub: a long, deep sub kick, a clap, and open and closed hats, for trap and half-time.',
		slots: [k('sub', 0, 1, 1), k('clap', 0, 1, 0.65), k('open', 0, 1, 0.4), k('closed', 0, 1, 0.5)] },
	{ id: 'deep', label: 'Deep', description: 'Deep: tuned down, a long low kick, a fat snare and a deep tom.',
		slots: [k('kick', -5, 1, 1), k('snare', -4, 1, 0.7), k('tom', -5, 1, 0.6), k('closed', -2, 1, 0.45)] },
	{ id: 'tin', label: 'Tin', description: 'Tin: everything high and small, like a toy drum machine, with a wood block.',
		slots: [k('kick', 7, 0.5, 0.8), k('snare', 7, 0.6, 0.6), k('wood', 5, 0.6, 0.5), k('closed', 5, 0.6, 0.5)] },
	{ id: 'boom', label: 'Boom', description: 'Boom: a big low kick, a low snare and a low conga.',
		slots: [k('kick', -9, 1, 1), k('snare', -7, 1, 0.75), k('conga', -7, 1, 0.55), k('closed', 0, 0.8, 0.35)] },
	{ id: 'dub', label: 'Dub', description: 'Dub: a round, deep kick, a rim, a low tom and a shaker, for dub techno and house.',
		slots: [k('round', 0, 1, 1), k('rim', 0, 1, 0.55), k('tom', -3, 1, 0.55), k('shaker', 0, 1, 0.45)] },
];

/** A kit's slots as the machine's (each slot's own mute kept) */
export function kitSlots(p: DrumKitPreset, current: DrumSlot[]): DrumSlot[] {
	return p.slots.map((s, i) => ({ sound: `kit:${s.sound}`, tune: s.tune, decay: s.decay, level: s.level, muted: current[i]?.muted ?? false }));
}

/** A key to compare the slots' sounds by (the mutes left out) */
export function drumKitKey(slots: Pick<DrumSlot, 'sound' | 'tune' | 'decay' | 'level'>[]): string {
	return JSON.stringify(slots.map((s) => [s.sound, Math.round(s.tune), Math.round(s.decay * 1000), Math.round(s.level * 1000)]));
}

// A pattern: per row, its hits (a step and its velocity)
export type DrumPatternPreset = { id: string; label: string; description: string; rows: [number, number][][] };

// Hits on these steps at velocity v
const at = (steps: number[], v = 1): [number, number][] => steps.map((s) => [s, v]);
// The hat's eighth notes: on the beat loud, off it softer
const EIGHTHS: [number, number][] = [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, s % 4 === 0 ? 0.9 : 0.6]);

export const DRUM_PATTERNS: readonly DrumPatternPreset[] = [
	{ id: 'four', label: 'Four', description: 'Four: a kick on every beat, the snare on 2 and 4, the hat between the beats.',
		rows: [at([0, 4, 8, 12]), at([4, 12]), [], at([2, 6, 10, 14], 0.8)] },
	{ id: 'backbeat', label: 'Backbeat', description: 'Backbeat: kick on 1 and the "and" of 3, snare on 2 and 4, eighth-note hats.',
		rows: [at([0, 8, 10]), at([4, 12]), [], EIGHTHS] },
	{ id: 'halftime', label: 'Halftime', description: 'Halftime: the snare on beat 3, a slow, heavy groove.',
		rows: [at([0, 7, 10]), at([8]), at([14], 0.5), EIGHTHS] },
	{ id: 'breaks', label: 'Breaks', description: 'Breaks: a broken kick, snares on 2 and 4 with ghost notes, busy hats.',
		rows: [[[0, 1], [10, 1], [11, 0.7]], [[4, 1], [7, 0.35], [12, 1], [15, 0.4]], [],
			[0, 2, 3, 4, 6, 8, 10, 11, 12, 14].map((s) => [s, s % 4 === 0 ? 0.9 : s % 2 ? 0.45 : 0.65])] },
	{ id: 'electro', label: 'Electro', description: 'Electro: a syncopated kick, the metal on the off-beats, a steady hat.',
		rows: [at([0, 6, 10]), at([4, 12]), [[3, 0.7], [11, 0.7], [14, 0.6]], [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, 0.7])] },
	{ id: 'gallop', label: 'Gallop', description: 'Gallop: one-and-a, one-and-a: the kick and hat galloping, the snare on 2 and 4.',
		rows: [at([0, 3, 8, 11]), at([4, 12]), [], [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15].map((s) => [s, s % 4 === 0 ? 0.9 : 0.55])] },
];

/** A pattern's rows, n steps each */
export function drumRowsFrom(rows: [number, number][][], n = 16): DrumRow[] {
	return Array.from({ length: DRUM_SLOTS }, (_, k) => {
		const hits = new Map((rows[k] ?? []).filter(([s]) => s >= 0 && s < n));
		return {
			steps: Array.from({ length: n }, (_, i) => hits.has(i)),
			velocities: Array.from({ length: n }, (_, i) => hits.get(i) ?? 1),
		};
	});
}

/** A key to compare rows by (rounded, so a saved pattern matches the one applied) */
export function drumRowsKey(rows: DrumRow[]): string {
	return JSON.stringify(rows.map((r) => r.steps.map((on, i) => (on ? Math.round((r.velocities[i] ?? 1) * 1000) : 0))));
}

// The dice START

const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
const between = (r: () => number, lo: number, hi: number, step: number) => Math.round((lo + r() * (hi - lo)) / step) * step;

// The sounds the dice draws from for each slot: the slot's own kind (kicks; snares, claps and
// rims; toms, percussion and an open hat; hats and a shaker). Not the old Metal and Tin hat.
const DICE_POOLS: readonly (readonly KitId[])[] = [
	['kick', 'sub', 'subclick', 'round'],
	['snare', 'clap', 'rim'],
	['tom', 'conga', 'wood', 'rim', 'open'],
	['closed', 'open', 'shaker'],
];

/** A random kit: each slot its factory sound half the time, else another of its kind, tuned
 * within a fifth, its decay and level within ranges that keep it heard; values on the knobs'
 * steps */
export function randomDrumKit(r: () => number = Math.random): DrumKitSlot[] {
	return FACTORY_KIT.map((id, i) => {
		const sound = r() < 0.5 ? id : pick(r, DICE_POOLS[i]);
		const tune = Math.round(-7 + r() * 14) + (i === 0 ? -2 : 0);
		return {
			sound,
			tune: Math.max(DRUM_RANGES.tune[0], Math.min(DRUM_RANGES.tune[1], tune)),
			decay: Math.round(between(r, 0.25, 1, 0.01) * 100) / 100,
			level: Math.round(between(r, i === 0 ? 0.75 : 0.4, i === 0 ? 1 : 0.8, 0.01) * 100) / 100,
		};
	});
}

/** A random drum pattern, built like a beat: a kick on step 1 and a one-bar idea around it, the
 * snare on the backbeat (or beat 3, half-time) with the odd ghost note, the hat in eighths or
 * sixteenths accented on the beat, slot 3 (the tom, once the metal) now and then on an off-beat */
export function randomDrumPattern(r: () => number = Math.random): [number, number][][] {
	const kickIdeas = [[0, 8], [0, 8, 10], [0, 6, 10], [0, 3, 8, 11], [0, 4, 8, 12], [0, 10], [0, 7, 10], [0, 2, 8, 10]];
	const kick: [number, number][] = pick(r, kickIdeas).map((s) => [s, s === 0 ? 1 : pick(r, [1, 0.85, 0.7])]);
	const half = r() < 0.2;
	const snare: [number, number][] = (half ? [8] : [4, 12]).map((s) => [s, 1]);
	for (const g of [7, 9, 15, 14]) if (r() < 0.15 && !snare.some(([s]) => s === g)) snare.push([g, Math.round(between(r, 0.3, 0.5, 0.05) * 100) / 100]);
	const hatMode = pick(r, ['eighths', 'eighths', 'sixteenths', 'offbeats'] as const);
	const hatSteps = hatMode === 'sixteenths' ? Array.from({ length: 16 }, (_, i) => i)
		: hatMode === 'offbeats' ? [2, 6, 10, 14] : [0, 2, 4, 6, 8, 10, 12, 14];
	const hat: [number, number][] = hatSteps.map((s) => [s, s % 4 === 0 ? 0.9 : s % 2 ? 0.45 : 0.65]);
	const metal: [number, number][] = [];
	const metalHits = pick(r, [0, 0, 1, 2, 3]);
	for (let i = 0; i < metalHits; i++) {
		const s = pick(r, [3, 7, 11, 14, 15, 6]);
		if (!metal.some(([x]) => x === s)) metal.push([s, Math.round(between(r, 0.5, 0.8, 0.05) * 100) / 100]);
	}
	return [kick, snare.sort((a, b) => a[0] - b[0]), metal.sort((a, b) => a[0] - b[0]), hat];
}

// The dice END

// src/lib/machines/drums.ts
// The Drums machine (the plan's item 5): its settings, reactive, and their factory values. Like
// bass.ts. Four slots, each playing one sound: one of the frozen kit's four (src/audio/drumKit.ts)
// or a sound kept from Rhythm ("Keep as drum": one hit of Rhythm's sound, rendered). The kept
// sounds are the project's (up to KEPT_MAX); a slot names its sound by reference ('kit:kick',
// 'kept:3'), so a kept sound stays to be picked again when its slot changes.
//
// Saved as the snapshot's `drums` group: { slots, kept, muted, level, pedals, lane: { rows } }
// (snapshot.ts); the pattern slots A–D keep a Drums track beside Rhythm's and Bass's
// (src/lib/patterns/slots.ts). `rows` is the current pattern slot's Drums track as it's being
// edited, as the synth lane is Rhythm's.

import { reactive } from 'vue';
import { DRUM_RANGES, DRUM_SLOTS, FACTORY_KIT, KIT_IDS, KIT_NAMES, type DrumRow, type KitId } from '../../audio/drums';
import { encodeSample, sampleFrom, type SampleData } from '../../audio/sample';

export type DrumSlot = { sound: string; tune: number; decay: number; level: number; muted: boolean };
export type KeptSound = SampleData & { id: string; name: string };
export type Drums = {
	slots: DrumSlot[];
	kept: KeptSound[];
	muted: boolean;
	level: number;
	pedals: number;
	rows: DrumRow[]; // the current pattern slot's Drums track, as it's being edited
};

export const KEPT_MAX = 8;
export const DRUMS_LEVEL_DEFAULT = 0.6;

// The factory slots: the kit, each at a level that balances it with the others
export const DRUM_SLOT_DEFAULTS: readonly DrumSlot[] = [
	{ sound: 'kit:kick', tune: 0, decay: 1, level: 0.9, muted: false },
	{ sound: 'kit:snare', tune: 0, decay: 1, level: 0.7, muted: false },
	{ sound: 'kit:tom', tune: 0, decay: 1, level: 0.6, muted: false },
	{ sound: 'kit:closed', tune: 0, decay: 1, level: 0.5, muted: false },
];

export const kitRef = (id: KitId) => `kit:${id}`;
// The kit sound a slot falls back to: its own position's (a kept sound deleted, or left out of
// a share link)
export const slotKitRef = (slot: number) => kitRef(FACTORY_KIT[slot] ?? 'kick');

export function emptyRows(n: number): DrumRow[] {
	return Array.from({ length: DRUM_SLOTS }, () => ({ steps: Array(n).fill(false), velocities: Array(n).fill(1) }));
}

export function createDrums(n: number): Drums {
	return reactive({
		slots: DRUM_SLOT_DEFAULTS.map((s) => ({ ...s })),
		kept: [],
		muted: false,
		level: DRUMS_LEVEL_DEFAULT,
		pedals: 1,
		rows: emptyRows(n),
	}) as Drums;
}

// File → New: the kit in its slots, no kept sounds, empty rows, unmuted at its level
export function resetDrums(d: Drums, n: number) {
	d.slots = DRUM_SLOT_DEFAULTS.map((s) => ({ ...s }));
	d.kept = [];
	d.muted = false;
	d.level = DRUMS_LEVEL_DEFAULT;
	d.pedals = 1;
	d.rows = emptyRows(n);
}

// The sounds START

/** Whether a reference names a sound there is: one of the kit's, or a kept one */
export function soundExists(ref: string, kept: KeptSound[]) {
	if (ref.startsWith('kit:')) return (KIT_IDS as readonly string[]).includes(ref.slice(4));
	return kept.some((k) => k.id === ref);
}

/** The sound a slot plays: its own, or its position's kit sound when that's gone */
export function slotSound(d: Pick<Drums, 'slots' | 'kept'>, slot: number) {
	const ref = d.slots[slot]?.sound ?? '';
	return soundExists(ref, d.kept) ? ref : slotKitRef(slot);
}

/** A sound's name: Kick, Snare… or a kept sound's ("Kept 1") */
export function soundName(ref: string, kept: KeptSound[]) {
	if (ref.startsWith('kit:')) return KIT_NAMES[ref.slice(4) as KitId] ?? 'Kick';
	return kept.find((k) => k.id === ref)?.name ?? '';
}

/** Every sound a slot can play, in order: the kit's, then the kept ones */
export function soundsOffered(kept: KeptSound[]): string[] {
	return [...KIT_IDS.map(kitRef), ...kept.map((k) => k.id)];
}

/** The next (or previous) sound for a slot's ◂ ▸, round the ends */
export function stepSound(ref: string, kept: KeptSound[], by: 1 | -1) {
	const all = soundsOffered(kept);
	const at = Math.max(0, all.indexOf(ref));
	return all[(at + by + all.length) % all.length];
}

/** A newly kept sound's id and name: one more than the highest so far ("kept:3", "Kept 3") */
export function nextKept(kept: KeptSound[]) {
	const n = Math.max(0, ...kept.map((k) => Number(k.id.slice(5)) || 0)) + 1;
	return { id: `kept:${n}`, name: `Kept ${n}` };
}

/**
 * Keeps `sound` and puts it in `slot`. With the shelf full (KEPT_MAX), the oldest kept sound no
 * slot plays makes room. Returns the kept sound.
 */
export function keepSound(d: Drums, slot: number, sound: SampleData): KeptSound {
	const kept = { ...nextKept(d.kept), data: sound.data, sampleRate: sound.sampleRate };
	let list = [...d.kept];
	if (list.length >= KEPT_MAX) {
		const used = new Set(d.slots.map((s, i) => (i === slot ? '' : s.sound)));
		const drop = list.findIndex((k) => !used.has(k.id));
		list.splice(drop >= 0 ? drop : 0, 1);
	}
	list.push(kept);
	d.kept = list;
	d.slots = d.slots.map((s, i) => (i === slot ? { ...s, sound: kept.id } : s));
	return kept;
}

/** Deletes a kept sound; a slot playing it goes back to its position's kit sound */
export function deleteKept(d: Drums, id: string) {
	d.kept = d.kept.filter((k) => k.id !== id);
	d.slots = d.slots.map((s, i) => (s.sound === id ? { ...s, sound: slotKitRef(i) } : s));
}

/** The recording a slot plays (its sound's data), given the kit once it has loaded */
export function slotData(d: Pick<Drums, 'slots' | 'kept'>, slot: number, kit: Record<KitId, SampleData> | null): SampleData | null {
	const ref = slotSound(d, slot);
	if (ref.startsWith('kit:')) return kit?.[ref.slice(4) as KitId] ?? null;
	return d.kept.find((k) => k.id === ref) ?? null;
}

// A kept sound at most this long (s), its peak here (−1 dBFS, as the kit's), cut where it stays
// this far under its peak (−46 dB), with a fade this long: as the kit was made
export const KEEP_MAX_S = 1.5;
const KEEP_PEAK = 0.891;
const KEEP_FLOOR = 0.005;
const KEEP_FADE_S = 0.01;

/** One rendered hit (renderHit's channels) as a sound to keep: summed to mono, its peak at
 * −1 dBFS, cut where it has faded, with a short fade. null if it's silent. */
export function hitToSound(channels: Float32Array[], sampleRate: number): SampleData | null {
	const len = Math.min(channels[0]?.length ?? 0, Math.round(KEEP_MAX_S * sampleRate));
	const mono = new Float32Array(len);
	for (const c of channels) for (let i = 0; i < len; i++) mono[i] += c[i] / channels.length;
	let peak = 0;
	for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(mono[i]));
	if (peak < 1e-4) return null;
	let end = len;
	while (end > 1 && Math.abs(mono[end - 1]) < peak * KEEP_FLOOR) end--;
	const fade = Math.round(KEEP_FADE_S * sampleRate);
	end = Math.min(len, end + fade);
	const out = mono.slice(0, end);
	const gain = KEEP_PEAK / peak;
	for (let i = 0; i < out.length; i++) out[i] *= gain;
	const f = Math.min(fade, out.length);
	for (let i = 0; i < f; i++) out[out.length - 1 - i] *= i / f;
	return { data: encodeSample(out), sampleRate };
}

// The sounds END

// Saving START

const num = (x: unknown, [lo, hi]: readonly [number, number], d: number) =>
	(typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);

/** A saved row, its lists fitted to n steps */
export function rowFrom(r: any, n: number): DrumRow {
	const steps = Array.isArray(r?.steps) ? r.steps : [];
	const vel = Array.isArray(r?.velocities) ? r.velocities : [];
	return {
		steps: Array.from({ length: n }, (_, i) => steps[i] === true),
		velocities: Array.from({ length: n }, (_, i) => num(vel[i], [0, 1], 1)),
	};
}

/** Saved rows: four, each fitted to n steps (missing ones empty) */
export function rowsFrom(rows: unknown, n: number): DrumRow[] {
	const a = Array.isArray(rows) ? rows : [];
	return Array.from({ length: DRUM_SLOTS }, (_, i) => rowFrom(a[i], n));
}

/** The machine's settings as saved (the rows are saved apart, with the pattern) */
export function drumsSnapshot(d: Drums) {
	return {
		slots: d.slots.map((s) => ({ ...s })),
		kept: d.kept.map((k) => ({ ...k })),
		muted: d.muted,
		level: d.level,
		pedals: d.pedals,
		lane: { rows: d.rows.map((r) => ({ steps: [...r.steps], velocities: [...r.velocities] })) },
	};
}

/** A saved Drums group into the settings; anything missing or damaged gets its factory value */
export function applyDrums(d: Drums, s: any, n: number) {
	const kept: KeptSound[] = [];
	for (const k of Array.isArray(s?.kept) ? s.kept : []) {
		const data = sampleFrom(k);
		if (!data || typeof k.id !== 'string' || !/^kept:\d+$/.test(k.id) || kept.some((x) => x.id === k.id)) continue;
		kept.push({ ...data, id: k.id, name: typeof k.name === 'string' && k.name ? k.name.slice(0, 24) : k.id.replace('kept:', 'Kept ') });
		if (kept.length >= KEPT_MAX) break;
	}
	d.kept = kept;
	const slots = Array.isArray(s?.slots) ? s.slots : [];
	d.slots = DRUM_SLOT_DEFAULTS.map((def, i) => {
		const x = slots[i] ?? {};
		const sound = typeof x.sound === 'string' && soundExists(x.sound, kept) ? x.sound : def.sound;
		return {
			sound,
			tune: Math.round(num(x.tune, DRUM_RANGES.tune, def.tune)),
			decay: num(x.decay, DRUM_RANGES.decay, def.decay),
			level: num(x.level, DRUM_RANGES.level, def.level),
			muted: x.muted === true,
		};
	});
	d.muted = s?.muted === true;
	d.level = num(s?.level, [0, 1], DRUMS_LEVEL_DEFAULT);
	d.pedals = num(s?.pedals, [0, 1], 1);
	d.rows = rowsFrom(s?.lane?.rows, n);
}

// Saving END

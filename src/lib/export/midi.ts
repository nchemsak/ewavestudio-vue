// src/lib/export/midi.ts
// The pattern as a standard MIDI file (type 0, one track), for the Export audio dialog: drag
// it into a DAW to play the pattern on any instrument. Each step that's on is a note: its
// pad's pitch (the nearest note: fine tuning in cents isn't carried over), its velocity, and
// swing and ratchets timed as the audio is (ratchet.ts). A note lasts until the next hit or
// step, less one tick, so repeated notes don't overlap. The file has the tempo and 4/4, and
// lasts exactly the bars exported.

import { clampRatchet, ratchetPitches, stepSpan } from '../../audio/ratchet';
import { bassPlan, type BassPattern } from '../../audio/bass';
import type { DrumRow } from '../../audio/drums';
import { driftNoteRuns, type DriftVoicing } from '../../audio/drift';

export const PPQ = 480;              // ticks per quarter note
export const STEP_TICKS = PPQ / 4;   // a 16th, one step

export type MidiPattern = {
	bpm: number;
	swing: number;       // 0..0.5, as the transport's
	stepsCount: number;
	bars: number;
	active: boolean[];
	velocities: number[]; // 0..1
	pitches: number[];    // Hz
	ratchets?: number[];  // hits per step, 1–4
	repeatNotes?: string[]; // per step: what the hits play (ratchet.ts, ratchetPitches)
	repeatChord?: number[]; // the key's chord, pitch classes
	name?: string;        // the track's name
	// The chain (PR 111): one pattern per bar, bar b playing barPatterns[b % length] (its own
	// steps, velocities, pitches and repeats); without it every bar plays the fields above
	barPatterns?: MidiBarPattern[];
	// The Bass machine (PR 116), on MIDI channel 2: each note as long as it's held (tied or
	// slid into the next steps), a slide's new pitch a new note where it arrives, Accent at
	// velocity 127; with the chain, a pattern per bar as above
	bass?: { pattern: BassPattern; barPatterns?: BassPattern[] };
	// The Drums machine (the plan's item 5), on MIDI channel 10, the General MIDI drums: each
	// slot's note is its sound's (`notes`, from drumNote(); since PR 135), or by its place
	// (DRUM_NOTES: Kick 36, Snare 38, Low tom 45, Closed hi-hat 42), a 16th long; muted slots
	// left out; with the chain, rows per bar as above
	drums?: { rows: DrumRow[]; barRows?: DrumRow[][]; muted?: boolean[]; notes?: number[] };
	// The Drift machine (the plan's item 6), on MIDI channel 3: each plate held through a run of
	// bars one note, from its first bar's start to its last bar's end (driftRuns), velocity 90
	drift?: { chords: boolean[][]; length: number; plateHz: number[]; voicing?: DriftVoicing; octave?: number };
};

// MIDI channel 2 (0-based 1): Bass; channel 10 (9): Drums
const BASS_CHANNEL = 1;
const DRUMS_CHANNEL = 9;
// MIDI channel 3 (0-based 2): Drift
const DRIFT_CHANNEL = 2;
// A slot's note by its place (a kept sound's), and each kit sound's General MIDI note
export const DRUM_NOTES = [36, 38, 45, 42];
const KIT_GM_NOTES: Record<string, number> = {
	kick: 36, sub: 35, subclick: 36, round: 35, snare: 38, clap: 39, rim: 37,
	tom: 45, conga: 64, wood: 76, shaker: 82, closed: 42, open: 46, metal: 56, hat: 42,
};
/** The General MIDI drum note for a slot's sound ('kit:tom'…), else its place's */
export function drumNote(ref: string, slot: number): number {
	return (ref.startsWith('kit:') ? KIT_GM_NOTES[ref.slice(4)] : undefined) ?? DRUM_NOTES[slot] ?? 36;
}

export type MidiBarPattern = Pick<MidiPattern, 'active' | 'velocities' | 'pitches' | 'ratchets' | 'repeatNotes'>;

export function midiNoteOf(hz: number): number {
	return Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(hz / 440))));
}

export function midiToHz(note: number): number {
	return 440 * 2 ** ((note - 69) / 12);
}

// The MIDI notes whose pitch lies within [minHz, maxHz] (the pads' range), low to high
export function notesInRange(minHz: number, maxHz: number): number[] {
	const out: number[] = [];
	for (let n = 0; n <= 127; n++) {
		const hz = midiToHz(n);
		if (hz >= minHz && hz <= maxHz) out.push(n);
	}
	return out;
}

type Event = { tick: number; order: number; bytes: number[] };

// A variable-length quantity, as MIDI files write delta times
function vlq(n: number): number[] {
	const out = [n & 0x7f];
	while ((n >>= 7) > 0) out.unshift((n & 0x7f) | 0x80);
	return out;
}

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

// Bass's notes (bassPlan(), as the engines play them), on its own channel
function bassEvents(p: MidiPattern, bars: number, swing: number): Event[] {
	const n = p.stepsCount;
	const tickOf = (step: number) => step * STEP_TICKS + (step % 2 === 1 ? swing * STEP_TICKS : 0);
	const out: Event[] = [];
	for (let bar = 0; bar < bars; bar++) {
		const b = p.bass!.barPatterns?.length ? p.bass!.barPatterns[bar % p.bass!.barPatterns.length] : p.bass!.pattern;
		for (const hit of bassPlan(b, n)) {
			if (!hit || hit.vel <= 0) continue;
			const first = bar * n + hit.step;
			const velocity = hit.accent ? 127 : Math.max(1, Math.min(126, Math.round(hit.vel * 110)));
			// Its pitches in turn: the hit's, then each glide's from the step it arrives on
			const segs = [{ at: 0, hz: hit.freq }, ...hit.glides.map((g) => ({ at: g.at, hz: g.freq }))];
			segs.forEach((seg, k) => {
				const on = Math.round(tickOf(first + seg.at));
				const stop = k + 1 < segs.length ? tickOf(first + segs[k + 1].at) : tickOf(first + hit.steps);
				const off = Math.max(on + 1, Math.round(stop) - 1);
				const note = midiNoteOf(seg.hz);
				out.push({ tick: on, order: 2, bytes: [0x90 | BASS_CHANNEL, note, velocity] });
				out.push({ tick: off, order: 1, bytes: [0x80 | BASS_CHANNEL, note, 0] });
			});
		}
	}
	return out;
}

// Drums' hits, one note per hit, on channel 10
function drumsEvents(p: MidiPattern, bars: number, swing: number): Event[] {
	const n = p.stepsCount;
	const out: Event[] = [];
	for (let bar = 0; bar < bars; bar++) {
		const rows = p.drums!.barRows?.length ? p.drums!.barRows[bar % p.drums!.barRows.length] : p.drums!.rows;
		rows.forEach((row, slot) => {
			if (p.drums!.muted?.[slot]) return;
			for (let step = 0; step < n; step++) {
				const vel = Math.max(0, Math.min(1, row.velocities[step] ?? 1));
				if (!row.steps[step] || vel <= 0) continue;
				const on = Math.round((bar * n + step) * STEP_TICKS + (step % 2 === 1 ? swing * STEP_TICKS : 0));
				const note = p.drums!.notes?.[slot] ?? DRUM_NOTES[slot] ?? 36;
				out.push({ tick: on, order: 2, bytes: [0x90 | DRUMS_CHANNEL, note, Math.max(1, Math.min(127, Math.round(vel * 127)))] });
				out.push({ tick: on + STEP_TICKS - 1, order: 1, bytes: [0x80 | DRUMS_CHANNEL, note, 0] });
			}
		});
	}
	return out;
}

// Drift's held notes, one per run of bars, on its own channel
function driftEvents(p: MidiPattern, bars: number): Event[] {
	const d = p.drift!;
	const barTicks = p.stepsCount * STEP_TICKS;
	const out: Event[] = [];
	for (const run of driftNoteRuns(d.chords, d.length, bars, false, d.plateHz, d.voicing, d.octave)) {
		const note = midiNoteOf(run.hz);
		out.push({ tick: run.start * barTicks, order: 2, bytes: [0x90 | DRIFT_CHANNEL, note, 90] });
		out.push({ tick: run.end * barTicks - 1, order: 1, bytes: [0x80 | DRIFT_CHANNEL, note, 0] });
	}
	return out;
}

export function patternToMidi(p: MidiPattern): Uint8Array {
	const bars = Math.max(1, Math.round(p.bars));
	const swing = Math.max(0, Math.min(0.5, p.swing || 0));
	const events: Event[] = [];

	// Track name, tempo (microseconds per quarter note) and 4/4 time
	const name = [...new TextEncoder().encode(p.name || 'Ephemeral Wave Studio')];
	events.push({ tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(name.length), ...name] });
	events.push({ tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, ...u32(Math.round(60_000_000 / p.bpm)).slice(1)] });
	events.push({ tick: 0, order: 0, bytes: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] });

	for (let bar = 0; bar < bars; bar++) {
		const b: MidiBarPattern = p.barPatterns?.length ? p.barPatterns[bar % p.barPatterns.length] : p;
		for (let step = 0; step < p.stepsCount; step++) {
			if (!b.active[step]) continue;
			const vel = Math.max(0, Math.min(1, b.velocities[step] ?? 1));
			if (vel <= 0) continue;
			const hitHz = ratchetPitches(b.pitches[step] || 220, b.ratchets?.[step] ?? 1, b.repeatNotes?.[step], p.repeatChord ?? []);
			const velocity = Math.max(1, Math.min(127, Math.round(vel * 127)));

			const start = (bar * p.stepsCount + step) * STEP_TICKS + (step % 2 === 1 ? swing * STEP_TICKS : 0);
			const span = stepSpan(step, p.stepsCount, STEP_TICKS, swing);
			const hits = clampRatchet(b.ratchets?.[step] ?? 1);
			for (let k = 0; k < hits; k++) {
				const note = midiNoteOf(hitHz[k]);
				const on = Math.round(start + (k * span) / hits);
				const off = Math.max(on + 1, Math.round(start + ((k + 1) * span) / hits) - 1);
				// Note-offs sort before note-ons at the same tick
				events.push({ tick: on, order: 2, bytes: [0x90, note, velocity] });
				events.push({ tick: off, order: 1, bytes: [0x80, note, 0] });
			}
		}
	}

	if (p.bass) events.push(...bassEvents(p, bars, swing));
	if (p.drums) events.push(...drumsEvents(p, bars, swing));
	if (p.drift) events.push(...driftEvents(p, bars));

	const end = Math.max(bars * p.stepsCount * STEP_TICKS, ...events.map((e) => e.tick));
	events.sort((a, b) => a.tick - b.tick || a.order - b.order);
	events.push({ tick: end, order: 3, bytes: [0xff, 0x2f, 0x00] });

	const track: number[] = [];
	let last = 0;
	for (const e of events) {
		track.push(...vlq(e.tick - last), ...e.bytes);
		last = e.tick;
	}

	return new Uint8Array([
		...ascii('MThd'), ...u32(6), ...u16(0), ...u16(1), ...u16(PPQ),
		...ascii('MTrk'), ...u32(track.length), ...track,
	]);
}

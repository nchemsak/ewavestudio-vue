// src/lib/export/midi.ts
// The pattern as a standard MIDI file (type 0, one track), for the Export audio dialog: drag
// it into a DAW to play the pattern on any instrument. Each step that's on is a note: its
// pad's pitch (the nearest note: fine tuning in cents isn't carried over), its velocity, and
// swing and ratchets timed as the audio is (ratchet.ts). A note lasts until the next hit or
// step, less one tick, so repeated notes don't overlap. The file has the tempo and 4/4, and
// lasts exactly the bars exported.

import { clampRatchet, stepSpan } from '../../audio/ratchet';

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
	name?: string;        // the track's name
};

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
		for (let step = 0; step < p.stepsCount; step++) {
			if (!p.active[step]) continue;
			const vel = Math.max(0, Math.min(1, p.velocities[step] ?? 1));
			if (vel <= 0) continue;
			const note = midiNoteOf(p.pitches[step] || 220);
			const velocity = Math.max(1, Math.min(127, Math.round(vel * 127)));

			const start = (bar * p.stepsCount + step) * STEP_TICKS + (step % 2 === 1 ? swing * STEP_TICKS : 0);
			const span = stepSpan(step, p.stepsCount, STEP_TICKS, swing);
			const hits = clampRatchet(p.ratchets?.[step] ?? 1);
			for (let k = 0; k < hits; k++) {
				const on = Math.round(start + (k * span) / hits);
				const off = Math.max(on + 1, Math.round(start + ((k + 1) * span) / hits) - 1);
				// Note-offs sort before note-ons at the same tick
				events.push({ tick: on, order: 2, bytes: [0x90, note, velocity] });
				events.push({ tick: off, order: 1, bytes: [0x80, note, 0] });
			}
		}
	}

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

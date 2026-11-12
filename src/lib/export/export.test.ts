import { describe, it, expect } from 'vitest';
import { barFrames, foldLoop, trimTail, peakOf, normalizeGain, applyGain, NORMALIZE_PEAK } from './audio';
import { patternToMidi, midiNoteOf, notesInRange, midiToHz, PPQ, STEP_TICKS } from './midi';
import { zipFiles, crc32 } from './zip';
import { safeName, keyLabel, exportNames } from './names';
import { seededRandom } from '../random';

const ch = (...v: number[]) => Float32Array.from(v);

// --- Reading back what was written ---------------------------------------------------------

// A MIDI file's header, tempo, and notes as { on, off, note, velocity } (ticks)
function readMidi(bytes: Uint8Array) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const text = (at: number, n: number) => String.fromCharCode(...bytes.slice(at, at + n));
	expect(text(0, 4)).toBe('MThd');
	const header = { format: view.getUint16(8), tracks: view.getUint16(10), ppq: view.getUint16(12) };
	expect(text(14, 4)).toBe('MTrk');
	const end = 22 + view.getUint32(18);
	expect(end).toBe(bytes.length);
	let at = 22, tick = 0, tempo = 0, endTick = -1;
	const open = new Map<number, { on: number; velocity: number }>();
	const notes: { on: number; off: number; note: number; velocity: number }[] = [];
	const vlq = () => { let n = 0, b; do { b = bytes[at++]; n = (n << 7) | (b & 0x7f); } while (b & 0x80); return n; };
	while (at < end) {
		tick += vlq();
		const status = bytes[at++];
		if (status === 0xff) {
			const type = bytes[at++];
			const len = vlq();
			if (type === 0x51) tempo = (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2];
			if (type === 0x2f) endTick = tick;
			at += len;
		} else if ((status & 0xf0) === 0x90) {
			open.set(bytes[at], { on: tick, velocity: bytes[at + 1] });
			at += 2;
		} else if ((status & 0xf0) === 0x80) {
			const o = open.get(bytes[at])!;
			notes.push({ on: o.on, off: tick, note: bytes[at], velocity: o.velocity });
			open.delete(bytes[at]);
			at += 2;
		} else throw new Error(`unexpected status ${status}`);
	}
	expect(open.size).toBe(0); // every note ends
	return { ...header, tempo, endTick, notes: notes.sort((a, b) => a.on - b.on) };
}

// A stored (uncompressed) zip's files, read through its central directory
function readZip(bytes: Uint8Array) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const eocd = bytes.length - 22;
	expect(view.getUint32(eocd, true)).toBe(0x06054b50);
	const count = view.getUint16(eocd + 10, true);
	let at = view.getUint32(eocd + 16, true);
	const files: { name: string; data: Uint8Array; crc: number }[] = [];
	for (let i = 0; i < count; i++) {
		expect(view.getUint32(at, true)).toBe(0x02014b50);
		const crc = view.getUint32(at + 16, true);
		const size = view.getUint32(at + 24, true);
		const nameLen = view.getUint16(at + 28, true);
		const local = view.getUint32(at + 42, true);
		const name = new TextDecoder().decode(bytes.slice(at + 46, at + 46 + nameLen));
		expect(view.getUint32(local, true)).toBe(0x04034b50);
		expect(view.getUint16(local + 8, true)).toBe(0); // stored
		const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
		files.push({ name, data: bytes.slice(dataAt, dataAt + size), crc });
		at += 46 + nameLen;
	}
	return files;
}

// --- Audio ---------------------------------------------------------------------------------

describe('export audio helpers', () => {
	it('measure bars in samples', () => {
		expect(barFrames(1, 80, 48000)).toBe(144000); // 3 s
		expect(barFrames(4, 120, 44100)).toBe(352800); // 8 s
		expect(barFrames(1, 133, 48000)).toBe(Math.round((4 * 60 / 133) * 48000));
	});

	it('fold what rings past a loop onto its start, however long it rings', () => {
		const [out] = foldLoop([ch(1, 2, 3, 4, 10, 20, 100)], 4);
		expect([...out]).toEqual([11, 22, 103, 4]);
		// A tail longer than the loop wraps round again
		expect([...foldLoop([ch(1, 0, 0, 2, 0, 0, 3)], 3)[0]]).toEqual([6, 0, 0]);
		// Nothing past the end: unchanged
		expect([...foldLoop([ch(1, 2, 3)], 3)[0]]).toEqual([1, 2, 3]);
		// Shorter than the loop: padded with silence
		expect([...foldLoop([ch(1)], 3)[0]]).toEqual([1, 0, 0]);
	});

	it('trim a tail after it fades, keeping the bars and a margin', () => {
		const sound = [ch(0.5, 0.2, 0.01, 0, 0, 0, 0, 0), ch(0, 0.3, 0, 0.001, 0, 0, 0, 0)];
		expect(trimTail(sound, 2).map(c => c.length)).toEqual([4, 4]); // the last sound is at 3
		expect(trimTail(sound, 2, 2)[0].length).toBe(6);
		expect(trimTail(sound, 7)[0].length).toBe(7); // never shorter than the bars
		expect(trimTail(sound, 2, 99)[0].length).toBe(8); // nor longer than the sound
		expect(trimTail([ch(0, 0, 0)], 1)[0].length).toBe(1);
	});

	it('normalize to −1 dBFS with one gain', () => {
		expect(NORMALIZE_PEAK).toBeCloseTo(0.891, 3);
		const a = [ch(0.2, -0.4)], b = [ch(0.1)];
		const g = normalizeGain(peakOf(a, b));
		expect(g).toBeCloseTo(NORMALIZE_PEAK / 0.4);
		expect([...applyGain(a, g)[0]]).toEqual([0.2 * g, -0.4 * g].map(v => expect.closeTo(v, 6)));
		expect(normalizeGain(0)).toBe(1); // silence stays silent
	});

	it('repeat random numbers for the same seed', () => {
		const a = seededRandom(42), b = seededRandom(42), c = seededRandom(43);
		const take = (r: () => number) => Array.from({ length: 5 }, r);
		const first = take(a);
		expect(take(b)).toEqual(first);
		expect(take(c)).not.toEqual(first);
		for (const x of take(seededRandom(1))) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
	});
});

// --- MIDI ----------------------------------------------------------------------------------

describe('the MIDI file', () => {
	const steps = (on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
	const base = {
		bpm: 120, swing: 0, stepsCount: 16, bars: 1,
		velocities: Array(16).fill(1), pitches: Array(16).fill(220), ratchets: Array(16).fill(1),
	};

	it('has the tempo, 4/4 and exactly the bars exported', () => {
		const m = readMidi(patternToMidi({ ...base, active: steps([0]), bars: 4 }));
		expect(m).toMatchObject({ format: 0, tracks: 1, ppq: PPQ, tempo: 500000 }); // 120 BPM
		expect(m.endTick).toBe(4 * 16 * STEP_TICKS);
		expect(m.notes.map(n => n.on)).toEqual([0, 1, 2, 3].map(b => b * 16 * STEP_TICKS));
	});

	it("plays each step that's on at its pad's nearest note and velocity", () => {
		const pitches = [...base.pitches];
		pitches[4] = 261.63; pitches[8] = 445; // middle C; 445 Hz is nearest A4
		const velocities = [...base.velocities];
		velocities[8] = 0.5;
		const m = readMidi(patternToMidi({ ...base, active: steps([0, 4, 8]), pitches, velocities }));
		expect(m.notes.map(n => [n.on, n.note, n.velocity])).toEqual([
			[0, 57, 127], [4 * STEP_TICKS, 60, 127], [8 * STEP_TICKS, 69, 64],
		]);
		// Each lasts until the next step, less a tick
		expect(m.notes[0].off).toBe(STEP_TICKS - 1);
	});

	it('times swing and ratchets as the audio does', () => {
		const ratchets = [...base.ratchets];
		ratchets[0] = 3;
		const m = readMidi(patternToMidi({ ...base, swing: 0.5, active: steps([0, 1]), ratchets }));
		// Step 1 (on-beat) lasts 1.5 steps with swing at 50%: three hits 60 ticks apart; step 2
		// starts half a step late
		expect(m.notes.map(n => n.on)).toEqual([0, 60, 120, 180]);
		expect(m.notes.map(n => n.off)).toEqual([59, 119, 179, 239]);
	});

	it("writes repeats that step up or down the key's chord as their own notes", () => {
		const ratchets = [...base.ratchets];
		ratchets[0] = 4; ratchets[4] = 3;
		const repeatNotes = Array(16).fill('same');
		repeatNotes[0] = 'up'; repeatNotes[4] = 'down';
		const m = readMidi(patternToMidi({
			...base, active: steps([0, 4]), ratchets, repeatNotes,
			repeatChord: [9, 0, 4], // A minor: A C E
		}));
		// A3 up: A3 C4 E4 A4; A3 down: A3 E3 C3
		expect(m.notes.map(n => n.note)).toEqual([57, 60, 64, 69, 57, 52, 48]);
	});

	it('skips silent steps, and keeps pitches within MIDI', () => {
		const velocities = [...base.velocities];
		velocities[2] = 0;
		expect(readMidi(patternToMidi({ ...base, active: steps([2]), velocities })).notes).toEqual([]);
		expect(midiNoteOf(440)).toBe(69);
		expect(midiNoteOf(1)).toBe(0);
		expect(midiNoteOf(99999)).toBe(127);
	});

	it("lists the pads' notes for the one-shot", () => {
		const notes = notesInRange(100, 2000);
		expect(notes[0]).toBe(44); // G#2, 103.8 Hz (G2 is 98 Hz)
		expect(notes.at(-1)).toBe(95); // B6, 1975.5 Hz
		expect(midiToHz(57)).toBeCloseTo(220);
	});
});

// --- Zip -----------------------------------------------------------------------------------

describe('the zip file', () => {
	it('computes the standard CRC-32', () => {
		expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
		expect(crc32(new Uint8Array())).toBe(0);
	});

	it('stores every file whole, with its name', () => {
		const files = [
			{ name: 'My Beat_80bpm_1bar_mix.wav', data: Uint8Array.from({ length: 1000 }, (_, i) => i % 251) },
			{ name: 'Ünïcode name.mid', data: new TextEncoder().encode('MThd') },
			{ name: 'empty.txt', data: new Uint8Array() },
		];
		const back = readZip(zipFiles(files, new Date(2026, 10, 6, 12, 30, 10)));
		expect(back.map(f => f.name)).toEqual(files.map(f => f.name));
		back.forEach((f, i) => {
			expect([...f.data]).toEqual([...files[i].data]);
			expect(f.crc).toBe(crc32(files[i].data));
		});
	});
});

// --- Names ---------------------------------------------------------------------------------

describe('export file names', () => {
	it('are safe on every system', () => {
		expect(safeName('My: "Beat"/2?')).toBe('My- -Beat--2-');
		expect(safeName('  lots   of\tspace ')).toBe('lots of space');
		expect(safeName('')).toBe('Untitled');
		expect(safeName('x'.repeat(100))).toHaveLength(60);
	});

	it('say the project, tempo, key, length and part', () => {
		expect(keyLabel('A', 'naturalMinor')).toBe('Amin');
		expect(keyLabel('C#', 'major')).toBe('C#maj');
		expect(keyLabel('A', 'none')).toBe(''); // no scale chosen: no key in the name
		const loop = exportNames({ project: 'My Beat', bpm: 80, key: 'Amin', bars: 4, ending: 'loop' });
		expect(loop.wav('mix')).toBe('My Beat_80bpm_Amin_4bars_mix.wav');
		expect(loop.midi).toBe('My Beat_80bpm_Amin_4bars.mid');
		expect(loop.zip).toBe('My Beat_80bpm_Amin_4bars.zip');
		expect(loop.oneShot('A3')).toBe('My Beat_oneshot_A3.wav');
		const tail = exportNames({ project: 'Untitled', bpm: 120.4, key: '', bars: 1, ending: 'tail' });
		expect(tail.wav('dry')).toBe('Untitled_120bpm_1bar-tail_dry.wav');
	});
});

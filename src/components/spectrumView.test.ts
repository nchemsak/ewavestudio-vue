import { describe, it, expect } from 'vitest';
import { bandLevel, holdPeaks, strongestNoteHz, noteOf, cNotes, NOTE_MIN_LEVEL, SKIP_BINS } from './spectrumView';

const BIN_HZ = 48000 / 2048; // the live analyser's: fftSize 2048 at 48 kHz

describe('the Spectrum view', () => {
	it("a band's level is its loudest bin, skipping the DC bins", () => {
		const bins = new Uint8Array(1024);
		bins[1] = 255; // DC offset: ignored
		bins[10] = 120; bins[11] = 200;
		expect(bandLevel(bins, BIN_HZ, 0, 3 * BIN_HZ)).toBe(0);
		expect(bandLevel(bins, BIN_HZ, 9 * BIN_HZ, 12 * BIN_HZ)).toBe(200);
		expect(SKIP_BINS).toBeGreaterThan(1);
	});

	it('the peak-hold line jumps up at once and falls slowly', () => {
		const held = new Float32Array([0, 100]);
		holdPeaks(held, [200, 50], 10);
		expect([...held]).toEqual([200, 90]);
		holdPeaks(held, [0, 0], 10);
		expect([...held]).toEqual([190, 80]);
	});

	it('finds the strongest note, between bins, and nothing in silence', () => {
		// A3 (220 Hz) falls between bins 9 (211 Hz) and 10 (234 Hz)
		const bins = new Uint8Array(1024);
		bins[8] = 100; bins[9] = 230; bins[10] = 200; bins[11] = 90;
		const hz = strongestNoteHz(bins, BIN_HZ)!;
		expect(hz).toBeGreaterThan(9 * BIN_HZ);
		expect(hz).toBeLessThan(10 * BIN_HZ);
		expect(noteOf(hz).name).toBe('A3');
		expect(strongestNoteHz(new Uint8Array(1024).fill(NOTE_MIN_LEVEL - 1), BIN_HZ)).toBeNull();
	});

	it("names notes as the app does (A3 = 220 Hz), with how far off they are", () => {
		expect(noteOf(220)).toEqual({ name: 'A3', cents: 0 });
		expect(noteOf(440 * Math.pow(2, 1 / 12))).toEqual({ name: 'A#4', cents: 0 });
		expect(noteOf(440 * Math.pow(2, 1 / 12), true).name).toBe('Bb4');
		expect(noteOf(225).cents).toBe(39);
	});

	it('ticks every C on the axis', () => {
		const cs = cNotes();
		expect(cs[0].name).toBe('C1');
		expect(cs.at(-1)!.name).toBe('C9');
		expect(cs.find((c) => c.name === 'C4')!.hz).toBeCloseTo(261.63, 1);
	});
});

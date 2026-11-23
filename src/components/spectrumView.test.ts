import { describe, it, expect } from 'vitest';
import { bandLevel, holdPeaks, SKIP_BINS } from './spectrumView';

const BIN_HZ = 48000 / 2048; // an analyser of 2048 points at 48 kHz

describe('reading the spectrum', () => {
	it("a band's level is its loudest bin, skipping only DC (the views' tap is high-passed, PR 108)", () => {
		const bins = new Uint8Array(1024);
		bins[0] = 255; // DC: ignored
		bins[2] = 90;  // about 47 Hz: drawn now
		bins[10] = 120; bins[11] = 200;
		expect(SKIP_BINS).toBe(1);
		expect(bandLevel(bins, BIN_HZ, 0, 0.5 * BIN_HZ)).toBe(0);
		expect(bandLevel(bins, BIN_HZ, 0, 3 * BIN_HZ)).toBe(90);
		expect(bandLevel(bins, BIN_HZ, 9 * BIN_HZ, 12 * BIN_HZ)).toBe(200);
	});

	it('the peak-hold line jumps up at once and falls slowly', () => {
		const held = new Float32Array([0, 100]);
		holdPeaks(held, [200, 50], 10);
		expect([...held]).toEqual([200, 90]);
		holdPeaks(held, [0, 0], 10);
		expect([...held]).toEqual([190, 80]);
	});
});

import { describe, it, expect } from 'vitest';
import { specRowHz, risingZero, SPEC_LOW_HZ, SPEC_HIGH_HZ } from './monitorViews';

describe("the machine rail's monitor (PR 108)", () => {
	it('the spectrogram runs 40 Hz to 10 kHz, log, low at the bottom', () => {
		const rows = 100;
		expect(specRowHz(rows - 1, rows)).toBeGreaterThan(SPEC_LOW_HZ);
		expect(specRowHz(rows - 1, rows)).toBeLessThan(SPEC_LOW_HZ * 1.1);
		expect(specRowHz(0, rows)).toBeLessThan(SPEC_HIGH_HZ);
		expect(specRowHz(0, rows)).toBeGreaterThan(SPEC_HIGH_HZ * 0.9);
		// log: the middle row is the geometric middle (1 kHz... 632 Hz)
		expect(specRowHz(49.5, rows)).toBeCloseTo(Math.sqrt(SPEC_LOW_HZ * SPEC_HIGH_HZ), 0);
		// the pads' 100–2000 Hz fill the middle of the screen, not its bottom rows
		const rowOf = (hz: number) => rows * (1 - Math.log(hz / SPEC_LOW_HZ) / Math.log(SPEC_HIGH_HZ / SPEC_LOW_HZ));
		expect(rowOf(2000) - rowOf(100)).toBeLessThan(-50);
	});

	it('the scope starts at a rising zero crossing, so a steady note stands still', () => {
		const s = Float32Array.from({ length: 400 }, (_, i) => Math.sin((2 * Math.PI * (i + 37)) / 100));
		const z = risingZero(s);
		expect(s[z - 1]).toBeLessThan(0);
		expect(s[z]).toBeGreaterThanOrEqual(0);
		expect(risingZero(new Float32Array(100))).toBe(0);
	});
});

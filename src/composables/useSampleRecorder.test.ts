import { describe, it, expect } from 'vitest';
import { onsetLevel, MIN_ONSET, ONSET_OVER_FLOOR } from './useSampleRecorder';

describe('the recorder\'s start level', () => {
	it('is 12 dB over the room\'s noise, and never below about −50 dBFS', () => {
		expect(onsetLevel(0)).toBe(MIN_ONSET);
		expect(onsetLevel(0.0001)).toBe(MIN_ONSET); // a quiet room: a −40 dBFS voice starts it
		expect(0.01).toBeGreaterThan(onsetLevel(0.0001));
		expect(onsetLevel(0.01)).toBeCloseTo(0.01 * ONSET_OVER_FLOOR); // a noisy one: above its noise
		expect(20 * Math.log10(ONSET_OVER_FLOOR)).toBeCloseTo(12, 0);
	});
});

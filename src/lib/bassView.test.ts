import { describe, it, expect } from 'vitest';
import { ampAt, envOctAt, noteSamples, viewSeconds } from './bassView';
import { BASS_DEFAULTS } from './machines/bass';

describe("the Bass screen's picture", () => {
	it('the level rises in 3 ms then falls; the cutoff falls back from Env octaves up', () => {
		expect(ampAt(BASS_DEFAULTS, 0.003)).toBeCloseTo(1, 1);
		expect(ampAt(BASS_DEFAULTS, 0.3)).toBeLessThan(0.1);
		expect(envOctAt(BASS_DEFAULTS, 0)).toBeCloseTo(3);
		expect(envOctAt(BASS_DEFAULTS, 0.3)).toBeLessThan(0.1);
	});

	it('the samples are finite, scaled to ±1, and fade out', () => {
		const s = noteSamples({ ...BASS_DEFAULTS, resonance: 1 }, 400, 55);
		expect(s.every(Number.isFinite)).toBe(true);
		expect(Math.max(...s.map(Math.abs))).toBeCloseTo(1);
		expect(Math.max(...s.slice(-40).map(Math.abs))).toBeLessThan(0.2);
	});

	it('a longer Decay shows a longer stretch', () => {
		expect(viewSeconds({ ...BASS_DEFAULTS, decayMs: 1000 })).toBeGreaterThan(viewSeconds(BASS_DEFAULTS));
	});
});

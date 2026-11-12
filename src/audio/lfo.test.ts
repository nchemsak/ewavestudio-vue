import { describe, it, expect } from 'vitest';
import { LFO_TARGETS, LFO_DEPTH_MAX, isLfoTarget, lfoAmpBase, LFO_AMP_TAP, lfoFmTapGain, lfoWaveAt } from './lfo';

describe('the LFO', () => {
	it('has five targets, each with a Depth range', () => {
		expect(LFO_TARGETS).toEqual(['pitch', 'filter', 'pwm', 'amp', 'fm']);
		for (const t of LFO_TARGETS) expect(LFO_DEPTH_MAX[t]).toBeGreaterThan(0);
		expect(isLfoTarget('amp')).toBe(true);
		expect(isLfoTarget('gain')).toBe(false);
	});

	it('Level swings the note between full and (100 − depth) %', () => {
		// The tremolo gain is the base plus the tap times the LFO's output (wave × depth)
		const level = (depth: number, wave: number) => lfoAmpBase(depth) + LFO_AMP_TAP * wave * depth;
		expect(level(0, 1)).toBe(1);
		expect(level(100, 1)).toBeCloseTo(1);
		expect(level(100, -1)).toBeCloseTo(0);
		expect(level(40, 1)).toBeCloseTo(1);
		expect(level(40, -1)).toBeCloseTo(0.6);
		expect(lfoAmpBase(150)).toBe(0.5); // kept within 0–100 %
	});

	it('FM swings the FM Amount by ±depth %', () => {
		const deviation = 880; // Hz: the FM card's Amount at some note
		const swing = (depth: number) => lfoFmTapGain(deviation) * depth;
		expect(swing(100)).toBeCloseTo(880); // from nothing to twice the setting
		expect(swing(25)).toBeCloseTo(220);
		expect(lfoFmTapGain(-5)).toBe(0);
	});

	it('knows where its wave is, as an oscillator started at that moment would be', () => {
		expect(lfoWaveAt('sine', 2, 0)).toBe(0);
		expect(lfoWaveAt('sine', 2, 0.125)).toBeCloseTo(1); // a quarter of a cycle
		expect(lfoWaveAt('sine', 2, 0.375)).toBeCloseTo(-1);
		expect(lfoWaveAt('square', 2, 0.1)).toBe(1);   // high for the first half
		expect(lfoWaveAt('square', 2, 0.3)).toBe(-1);
		expect(lfoWaveAt('square', 2, 0.55)).toBe(1);  // next cycle
	});
});

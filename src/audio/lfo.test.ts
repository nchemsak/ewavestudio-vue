import { describe, it, expect } from 'vitest';
import { divisionToHz } from './synthHelpers';
import { LFO_DIVISIONS, lfoDivisionLabel, isLfoDivision, LFO_TARGETS, LFO_DEPTH_MAX, LFO_DEFAULT_DEPTH, lfoDepthsFrom, isLfoTarget, lfoAmpBase, LFO_AMP_TAP, lfoFmTapGain, lfoWaveAt } from './lfo';

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

describe("each target's remembered depth", () => {
	it('starts every target at a little depth, within its range', () => {
		for (const t of LFO_TARGETS) {
			expect(LFO_DEFAULT_DEPTH[t], t).toBeGreaterThan(0);
			expect(LFO_DEFAULT_DEPTH[t], t).toBeLessThanOrEqual(LFO_DEPTH_MAX[t] / 2);
		}
	});

	it("reads a project's depths: missing or broken ones get the default, the rest are clamped", () => {
		expect(lfoDepthsFrom(undefined)).toEqual(LFO_DEFAULT_DEPTH);
		expect(lfoDepthsFrom({ pitch: 300, filter: 'x', pwm: 99, amp: -5, fm: NaN, pan: 3 })).toEqual({
			...LFO_DEFAULT_DEPTH, pitch: 300, pwm: LFO_DEPTH_MAX.pwm, amp: 0,
		});
	});
});

describe("the Rate knob's divisions", () => {
	it('go from 4 bars to a 64th, slowest first, all locked to the tempo', () => {
		expect(LFO_DIVISIONS[0]).toBe('4/1');
		expect(LFO_DIVISIONS.at(-1)).toBe('1/64');
		const hz = LFO_DIVISIONS.map((d) => divisionToHz(d, 120));
		for (let i = 1; i < hz.length; i++) expect(hz[i], LFO_DIVISIONS[i]).toBeGreaterThan(hz[i - 1]);
	});

	it('read as bars, then note values', () => {
		expect(LFO_DIVISIONS.map(lfoDivisionLabel)).toEqual(
			['4 bars', '2 bars', '1 bar', '1/2', '1/4', '1/8.', '1/8', '1/8T', '1/16', '1/32', '1/64']);
		expect(isLfoDivision('1/8')).toBe(true);
		expect(isLfoDivision('1/3')).toBe(false);
	});
});

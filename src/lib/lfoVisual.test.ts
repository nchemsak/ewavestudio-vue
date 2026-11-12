import { describe, it, expect } from 'vitest';
import {
	lfoCutoffAt, lfoCutoffSwing, lfoPulseWidthAt, lfoPulseWidthRange, lfoBendAt, lfoBendRange,
	lfoFmAmountAt, lfoFmAmountRange, lfoLevelAt, lfoLevelRange,
} from './lfoVisual';
import { lfoAmpBase, LFO_AMP_TAP, lfoFmTapGain } from '../audio/lfo';
import { lfoFilterTapGain } from '../audio/synthHelpers';
import { pulseOffset, lfoPwmTapGain, foldPulseWidth } from '../audio/waves';

const SR = 48000;
const norms = Array.from({ length: 401 }, (_, i) => -1 + i / 200);

describe('LFO visualizer', () => {
	it('Filter: the cutoff swings ±Depth around Cutoff, as the engine moves it', () => {
		expect(lfoCutoffAt(1000, 500, SR, 0)).toBe(1000);
		expect(lfoCutoffAt(1000, 500, SR, 1)).toBe(1500);
		expect(lfoCutoffAt(1000, 500, SR, -1)).toBe(500);
		expect(lfoCutoffSwing(1000, 500, SR)).toEqual([500, 1500]);
		// The engine shrinks a swing that would go below 30 Hz; so does the indicator
		for (const n of [-1, -0.3, 0.5, 1]) {
			expect(lfoCutoffAt(5000, 5000, SR, n)).toBeCloseTo(5000 + n * 5000 * lfoFilterTapGain(5000, 5000, SR), 6);
		}
		expect(lfoCutoffSwing(5000, 5000, SR)).toEqual([30, 9970]);
		// Out-of-range positions are held at the ends
		expect(lfoCutoffAt(1000, 500, SR, 3)).toBe(1500);
	});

	it('Filter: no range at depth 0', () => {
		expect(lfoCutoffSwing(1000, 0, SR)).toBeNull();
	});

	it('Pulse: the width is the one the engine plays, shown on the knob\'s side (5–50 %)', () => {
		for (const [width, depth] of [[50, 20], [30, 30], [10, 45], [25, 5], [5, 40], [75, 20]]) {
			for (const n of norms) {
				// What the engine does: the threshold offset plus the LFO through the PW tap
				const offset = pulseOffset(width) + n * depth * lfoPwmTapGain(width, depth);
				const heard = foldPulseWidth((offset + 1) * 50);
				expect(lfoPulseWidthAt(width, depth, n)).toBeCloseTo(heard, 6);
			}
		}
		expect(lfoPulseWidthAt(50, 20, -1)).toBeCloseTo(30, 6);
		expect(lfoPulseWidthAt(50, 20, 1)).toBeCloseTo(30, 6); // 70 % sounds like 30 %
		expect(lfoPulseWidthAt(30, 30, -1)).toBeCloseTo(5, 6); // held at 5 %: the swing shrinks
		expect(lfoPulseWidthAt(30, 30, 1)).toBeCloseTo(45, 6); // 55 % sounds like 45 %
	});

	it('Pulse: the range is the narrowest and widest the LFO plays', () => {
		for (const [width, depth] of [[50, 20], [30, 30], [10, 45], [25, 5], [5, 40], [40, 3], [75, 20]]) {
			const ws = norms.map((n) => lfoPulseWidthAt(width, depth, n));
			const range = lfoPulseWidthRange(width, depth);
			if (!range) {
				expect(Math.max(...ws) - Math.min(...ws)).toBeLessThan(1e-9);
				continue;
			}
			expect(range[0]).toBeCloseTo(Math.min(...ws), 1);
			expect(range[1]).toBeCloseTo(Math.max(...ws), 1);
		}
		expect(lfoPulseWidthRange(30, 30)).toEqual([5, 50]);
		expect(lfoPulseWidthRange(25, 5)).toEqual([20, 30]);
		// No swing: at 5 % there's no room, and at depth 0 nothing moves
		expect(lfoPulseWidthRange(5, 40)).toBeNull();
		expect(lfoPulseWidthRange(30, 0)).toBeNull();
	});

	it('Pitch: the bend is the LFO\'s cents as a share of an octave', () => {
		expect(lfoBendAt(1200, 1)).toBe(1);
		expect(lfoBendAt(600, -1)).toBe(-0.5);
		expect(lfoBendAt(600, 0)).toBe(0);
		expect(lfoBendAt(2400, 1)).toBe(1); // held at an octave
		expect(lfoBendRange(600)).toBe(0.5);
		expect(lfoBendRange(1200)).toBe(1);
		expect(lfoBendRange(0)).toBeNull();
	});

	it('FM: the Amount swings ±Depth %, as the engine moves the modulator', () => {
		// The engine adds the LFO (wave × depth) times lfoFmTapGain(deviation) to the deviation,
		// and the deviation is the Amount times the modulator's frequency
		const amount = 4, fMod = 440;
		for (const depth of [0, 25, 100]) for (const n of norms) {
			const deviation = amount * fMod + n * depth * lfoFmTapGain(amount * fMod);
			expect(lfoFmAmountAt(amount, depth, n)).toBeCloseTo(Math.max(0, deviation / fMod), 9);
		}
		expect(lfoFmAmountRange(4, 100)).toEqual([0, 8]);
		expect(lfoFmAmountRange(4, 25)).toEqual([3, 5]);
		expect(lfoFmAmountRange(0, 50)).toBeNull(); // nothing to move
		expect(lfoFmAmountRange(4, 0)).toBeNull();
	});

	it('Level: the volume swings from full down to (100 − Depth) %, as the engine\'s tremolo', () => {
		for (const depth of [0, 40, 100]) for (const n of norms) {
			expect(lfoLevelAt(0.75, depth, n)).toBeCloseTo(0.75 * (lfoAmpBase(depth) + LFO_AMP_TAP * n * depth), 9);
		}
		const [lo, hi] = lfoLevelRange(0.75, 40)!;
		expect(lo).toBeCloseTo(0.45);
		expect(hi).toBeCloseTo(0.75);
		expect(lfoLevelRange(0.75, 0)).toBeNull();
		expect(lfoLevelRange(0, 40)).toBeNull();
	});
});

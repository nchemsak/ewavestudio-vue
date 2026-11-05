import { describe, it, expect } from 'vitest';
import {
	FREQ_MIN, FREQ_MAX, DB_TOP, DB_BOTTOM,
	logFrequencies, freqToPos, posToFreq, dbToPos, engineFilter, lfoCutoffRange, formatHz, filterEnvStartHz,
} from './filterView';
import { lfoFilterTapGain } from '../audio/synthHelpers';

describe('filter view axes', () => {
	it('spaces frequencies evenly on a log axis from 20 Hz to 20 kHz', () => {
		const f = logFrequencies(4);
		expect(f[0]).toBeCloseTo(FREQ_MIN);
		expect(f[1]).toBeCloseTo(200, 3);
		expect(f[2]).toBeCloseTo(2000, 1);
		expect(f[3]).toBeCloseTo(FREQ_MAX, 0);
		expect(freqToPos(20)).toBe(0);
		expect(freqToPos(632.456)).toBeCloseTo(0.5, 4); // the middle of 20..20000 on a log axis
		expect(freqToPos(5)).toBe(0); // clipped
		expect(posToFreq(freqToPos(3000))).toBeCloseTo(3000, 6);
	});

	it('maps dB to height: the top is +24 dB, the bottom −48 dB', () => {
		expect(dbToPos(DB_TOP)).toBe(0);
		expect(dbToPos(DB_BOTTOM)).toBe(1);
		expect(dbToPos(0)).toBeCloseTo(1 / 3);
		expect(dbToPos(-200)).toBe(1); // clipped
	});

	it('formats frequencies', () => {
		expect(formatHz(440)).toBe('440 Hz');
		expect(formatHz(5000)).toBe('5.0 kHz');
		expect(formatHz(12000)).toBe('12 kHz');
	});
});

describe('filter view settings', () => {
	it('draws the filter the engine uses: wide open when it is off', () => {
		expect(engineFilter(true, 1200, 4)).toEqual({ frequency: 1200, Q: 4 });
		expect(engineFilter(false, 1200, 4)).toEqual({ frequency: 20000, Q: 0.0001 });
		// The filter envelope's starting cutoff: Env Amt octaves away; none when off or at 0
		expect(filterEnvStartHz(true, 1000, 2)).toBe(4000);
		expect(filterEnvStartHz(true, 1000, -1)).toBe(500);
		expect(filterEnvStartHz(true, 1000, 0)).toBeNull();
		expect(filterEnvStartHz(false, 1000, 2)).toBeNull();
	});

	it("shows the LFO swing only when the LFO moves the filter, kept in the engine safe band", () => {
		const lfo = { enabled: true, target: 'filter', depth: 500 };
		expect(lfoCutoffRange(lfo, 2000, 48000)).toEqual([1500, 2500]);
		// Deeper than the cutoff allows: shrunk the way the engine shrinks it (30 Hz at the bottom)
		const [lo, hi] = lfoCutoffRange({ ...lfo, depth: 1500 }, 1040, 48000)!;
		expect(lo).toBeCloseTo(30);
		expect(hi).toBeCloseTo(2050);
		expect(lfoFilterTapGain(1040, 1500, 48000)).toBeCloseTo(1010 / 1500);
		expect(lfoCutoffRange({ ...lfo, target: 'pitch' }, 2000, 48000)).toBeNull();
		expect(lfoCutoffRange({ ...lfo, enabled: false }, 2000, 48000)).toBeNull();
		expect(lfoCutoffRange({ ...lfo, depth: 0 }, 2000, 48000)).toBeNull();
	});
});

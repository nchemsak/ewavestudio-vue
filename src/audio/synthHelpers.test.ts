import { describe, it, expect } from 'vitest';
import {
	waveformGain,
	divisionToHz,
	generateDriveCurve,
	linearPassthroughCurve,
	generateNoiseBuffers,
	NOISE_STOPS,
	NOISE_LOUDNESS,
} from './synthHelpers';

// Just enough of a BaseAudioContext for generateNoiseBuffers: buffers backed by Float32Arrays
function fakeContext(sampleRate: number) {
	return {
		sampleRate,
		createBuffer(_channels: number, length: number) {
			const data = new Float32Array(length);
			return { length, getChannelData: () => data };
		},
	} as unknown as BaseAudioContext;
}

const peak = (a: Float32Array) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe('waveformGain', () => {
	it('turns square and sawtooth down so all four waves sound equally loud', () => {
		expect(waveformGain('sine')).toBe(1);
		expect(waveformGain('triangle')).toBe(1);
		expect(waveformGain('sawtooth')).toBeCloseTo(0.708, 3); // -3 dB
		expect(waveformGain('square')).toBeCloseTo(0.501, 3);   // -6 dB
	});
});

describe('divisionToHz', () => {
	it('converts a note division at a tempo into an LFO rate', () => {
		expect(divisionToHz('1/4', 120)).toBeCloseTo(2);     // one beat = 0.5 s
		expect(divisionToHz('1/8', 120)).toBeCloseTo(4);
		expect(divisionToHz('1/16', 60)).toBeCloseTo(4);
		expect(divisionToHz('1/8.', 120)).toBeCloseTo(4 / 1.5); // dotted: 1.5× longer
		expect(divisionToHz('1/8T', 120)).toBeCloseTo(6);       // triplet: 2/3 as long
		expect(divisionToHz(' 1 / 8 ', 120)).toBeCloseTo(4);    // spaces are ignored
	});

	it('never goes below 0.01 Hz', () => {
		expect(divisionToHz('1/1', 0.01)).toBe(0.01);
	});
});

describe('drive curves', () => {
	it('passes sound through unchanged before drive is turned on', () => {
		const c = linearPassthroughCurve();
		expect(c.length).toBe(1024);
		expect(c[0]).toBe(-1);
		expect(c[512]).toBe(0);
		expect(c[768]).toBe(0.5);
	});

	it('saturates more as the amount goes up, and stays within -1..1', () => {
		const soft = generateDriveCurve('overdrive', 0);
		const hard = generateDriveCurve('overdrive', 1);
		expect(soft.length).toBe(1024);
		expect(Math.abs(hard[600])).toBeGreaterThan(Math.abs(soft[600]));
		expect(peak(hard)).toBeLessThanOrEqual(1);
	});
});

describe('noise', () => {
	it('has a loudness for every color, with the colors in order along the knob', () => {
		expect(NOISE_STOPS.map(s => s.key)).toEqual(['brown', 'pink', 'white', 'blue', 'violet']);
		expect(NOISE_STOPS.map(s => s.pos)).toEqual([0, 0.25, 0.5, 0.75, 1]);
		for (const s of NOISE_STOPS) expect(NOISE_LOUDNESS[s.key]).toBeGreaterThan(0);
	});

	it('makes two seconds of each color; all but white are normalized to a peak of 1', () => {
		const bufs = generateNoiseBuffers(fakeContext(8000));
		for (const key of ['brown', 'pink', 'white', 'blue', 'violet'] as const) {
			const data = bufs[key].getChannelData(0);
			expect(data.length).toBe(16000);
			expect(data.every(Number.isFinite)).toBe(true);
			if (key === 'white') expect(peak(data)).toBeLessThanOrEqual(1);
			else expect(peak(data)).toBeCloseTo(1, 6);
		}
	});
});

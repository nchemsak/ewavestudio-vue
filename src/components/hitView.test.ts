import { describe, it, expect } from 'vitest';
import { hitSeconds, hitColumns, formatLength, formatPeak, HIT_MAX_S } from './hitView';

const sound = (o: { env?: [boolean, number, number]; delay?: [boolean, number, number, number]; reverb?: [boolean, number, number] } = {}) => {
	const [envOn, attackMs, decayMs] = o.env ?? [true, 20, 400];
	const [delayOn, time, feedback, delayMix] = o.delay ?? [false, 0.375, 0.3, 0.3];
	const [revOn, decay, revMix] = o.reverb ?? [false, 2, 0.3];
	return {
		synth: { envelope: { enabled: envOn, attackMs, decayMs } },
		fx: {
			delay: { enabled: delayOn, time, feedback, mix: delayMix },
			reverb: { enabled: revOn, decay, mix: revMix },
		},
	} as any;
};

describe('the hit (behind the Envelope card)', () => {
	it('renders as long as the sound can ring, within limits', () => {
		expect(hitSeconds(sound())).toBeCloseTo(0.62, 5); // Attack + Decay and a little room
		expect(hitSeconds(sound({ env: [true, 1, 50] }))).toBe(0.3); // at least 0.3 s
		// The echoes until they fall to −60 dB: 0.3 feedback, 7 echoes of 0.375 s
		expect(hitSeconds(sound({ delay: [true, 0.375, 0.3, 0.3] }))).toBeCloseTo(0.62 + 7 * 0.375, 5);
		// A delay or reverb at zero mix adds nothing
		expect(hitSeconds(sound({ delay: [true, 0.375, 0.3, 0], reverb: [true, 3, 0] }))).toBeCloseTo(0.62, 5);
		expect(hitSeconds(sound({ reverb: [true, 2, 0.3] }))).toBeCloseTo(0.62 + 2.4, 5);
		expect(hitSeconds(sound({ reverb: [true, 8, 0.5], delay: [true, 1, 0.9, 0.5] }))).toBe(HIT_MAX_S);
		// REV: its swell instead of the decay (a beat at 120 BPM for Next hit, as for one note), PRE before it
		const rev = (swell: string, preDelay = 0) => {
			const s = sound({ reverb: [true, 3, 0.3] });
			Object.assign(s.fx.reverb, { reverse: true, swell, preDelay });
			return { ...s, bpm: 120 };
		};
		expect(hitSeconds(rev('next'))).toBeCloseTo(0.62 + 0.5, 5);
		expect(hitSeconds(rev('1/2', 125))).toBeCloseTo(0.62 + 1 + 0.125, 5);
	});

	it('columns draw the wave itself near the start and its envelope further on', () => {
		const sr = 48000, hz = 220, period = sr / hz;
		// A 220 Hz sine at full level for 1 s, on the left only (either channel counts)
		const left = Float32Array.from({ length: sr }, (_, i) => Math.sin((2 * Math.PI * hz * i) / sr));
		const right = new Float32Array(sr);
		const cols = 300;
		const { min, max } = hitColumns([left, right], sr, cols, 1000, period);
		// The first column is a sliver of the first cycle: near the wave's start
		expect(max[0]).toBeLessThan(0.1);
		expect(min[0]).toBeCloseTo(0, 5);
		// Late columns hold a cycle or more: the whole swing
		for (const c of [150, 299]) {
			expect(max[c]).toBeGreaterThan(0.99);
			expect(min[c]).toBeLessThan(-0.99);
		}
		// Past the end of the sound: nothing
		const short = hitColumns([left.slice(0, 100)], sr, cols, 1000, period);
		expect(short.max[cols - 1]).toBe(0);
		expect(short.min[cols - 1]).toBe(0);
	});

	it('names its length and peak', () => {
		expect(formatLength(312.4)).toBe('312 ms');
		expect(formatLength(2570)).toBe('2.57 s');
		expect(formatPeak(0.5)).toBe('−6.0 dB');
		expect(formatPeak(1)).toBe('0.0 dB');
		expect(formatPeak(1.2)).toBe('+1.6 dB');
		expect(formatPeak(0)).toBe('silent');
	});
});

import { describe, expect, it } from 'vitest';
import { clampUnisonVoices, unisonPhase, unisonPosition, UNISON_PHASE_SPREAD, UNISON_PHASE_STEP } from './unison';
import { shiftSeries, waveSeries, WAVE_IDS } from './waves';

describe('unison voices', () => {
	it('are 2–4', () => {
		expect([0, 1, 2, 3, 4, 5, 6].map(clampUnisonVoices)).toEqual([2, 2, 2, 3, 4, 4, 4]);
		expect(clampUnisonVoices(2.6)).toBe(3);
		expect(clampUnisonVoices(NaN)).toBe(3);
	});

	it('sit from left to right, the centre one (odd counts) in the middle', () => {
		expect([0, 1].map(i => unisonPosition(i, 2))).toEqual([-1, 1]);
		expect([0, 1, 2].map(i => unisonPosition(i, 3))).toEqual([-1, 0, 1]);
		[-1, -1 / 3, 1 / 3, 1].forEach((x, i) => expect(unisonPosition(i, 4)).toBeCloseTo(x, 12));
		expect(unisonPosition(0, 1)).toBe(0);
	});
});

describe('where each unison voice starts in its cycle', () => {
	it('spreads with Spread: in step at 0, the outer voices furthest at 100 %', () => {
		expect([0, 1, 2].map(i => unisonPhase(i, 3, 0))).toEqual([0, 0, 0]);
		expect([0, 1, 2].map(i => unisonPhase(i, 3, 100))).toEqual([-UNISON_PHASE_SPREAD, 0, UNISON_PHASE_SPREAD]);
		expect(unisonPhase(0, 1, 100)).toBe(0); // one voice: unchanged
		expect(Object.is(unisonPhase(1, 3, 100), -0)).toBe(false);
	});

	it('comes in a few steps, so a few waves cover every setting', () => {
		const phases = new Set<number>();
		for (let n = 2; n <= 4; n++) for (let s = 0; s <= 100; s++) for (let i = 0; i < n; i++) phases.add(unisonPhase(i, n, s));
		for (const p of phases) expect(Math.abs(Math.round(p / UNISON_PHASE_STEP) * UNISON_PHASE_STEP - p)).toBeLessThan(1e-9);
		expect(phases.size).toBeLessThanOrEqual(2 * Math.round(UNISON_PHASE_SPREAD / UNISON_PHASE_STEP) + 1);
	});

	it('keeps the spread small enough that two voices can\'t cancel', () => {
		// Two voices summed to mono, in tune: the fundamental keeps cos(π · their distance)
		const apart = 2 * UNISON_PHASE_SPREAD;
		expect(Math.cos(Math.PI * apart)).toBeGreaterThan(0.7); // less than 3 dB down
	});
});

describe('a wave started later in its cycle', () => {
	// One cycle of a series, sampled
	const cycle = (real: Float32Array, imag: Float32Array, n = 400) => Array.from({ length: n }, (_, k) => {
		const t = (2 * Math.PI * k) / n;
		let v = 0;
		for (let h = 1; h < real.length; h++) v += real[h] * Math.cos(h * t) + imag[h] * Math.sin(h * t);
		return v;
	});

	it('is the same wave, shifted in time', () => {
		for (const w of WAVE_IDS) {
			const { real, imag } = waveSeries(w);
			const r = real.slice(0, 64), i = imag.slice(0, 64); // enough harmonics to compare
			const plain = cycle(r, i);
			const quarter = shiftSeries(r, i, 0.25);
			const shifted = cycle(quarter.real, quarter.imag);
			// shifted(t) = plain(t + a quarter of a cycle)
			for (let k = 0; k < 400; k += 7) expect(shifted[k], `${w} at ${k}`).toBeCloseTo(plain[(k + 100) % 400], 5);
		}
	});

	it('at 0 is the wave itself', () => {
		const { real, imag } = waveSeries('sawtooth');
		const same = shiftSeries(real, imag, 0);
		expect(Array.from(same.imag)).toEqual(Array.from(imag));
		expect(Array.from(same.real)).toEqual(Array.from(real));
	});

	it('uses the spec\'s series for the built-in shapes', () => {
		expect(waveSeries('sine').imag.slice(0, 3)).toEqual(new Float32Array([0, 1, 0]));
		const sq = waveSeries('square').imag;
		expect(sq[1]).toBeCloseTo(4 / Math.PI, 6);
		expect(sq[2]).toBe(0);
		const saw = waveSeries('sawtooth').imag;
		expect(saw[1]).toBeCloseTo(2 / Math.PI, 6);
		expect(saw[2]).toBeCloseTo(-1 / Math.PI, 6);
		expect(waveSeries('pulse').imag).toEqual(saw); // the pulse is made from a saw
		const tri = waveSeries('triangle').imag;
		expect(tri[1]).toBeCloseTo(8 / Math.PI ** 2, 6);
		expect(tri[3]).toBeCloseTo(-8 / (9 * Math.PI ** 2), 6);
		expect(waveSeries('organ').imag[2]).toBeCloseTo(0.8, 6);
	});
});

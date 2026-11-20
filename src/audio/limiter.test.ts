import { describe, it, expect } from 'vitest';
import {
	applyGains, limit, limited, limiterGain, limiterGains, limiterState,
	LIMITER_CEILING, LOOKAHEAD_S, RELEASE_S,
} from './limiter';

const SR = 48000;
const sine = (amp: number, hz: number, seconds: number, start = 0) => {
	const n = Math.round(seconds * SR);
	const out = new Float32Array(n);
	for (let i = Math.round(start * SR); i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
	return out;
};
const peak = (chs: Float32Array[]) => Math.max(...chs.map((c) => c.reduce((m, x) => Math.max(m, Math.abs(x)), 0)));

describe('the output limiter', () => {
	it('does nothing at all to a sound under the ceiling', () => {
		const chs = [sine(0.85, 220, 0.5), sine(0.6, 330, 0.5)];
		const gains = limiterGains(chs, SR);
		expect(limited(gains)).toBe(false);
		expect(gains.every((g) => g === 1)).toBe(true);
		const out = applyGains(chs, gains);
		expect(out[0]).toBe(chs[0]); // the very same samples
		expect(out[1]).toBe(chs[1]);
	});

	it('keeps a loud sound under −1 dBFS without clipping its waves flat', () => {
		// Quiet for 0.1 s, then a sine twice as loud as full scale
		const chs = [sine(2, 110, 0.6, 0.1), sine(2, 110, 0.6, 0.1)];
		const out = limit(chs, SR);
		expect(peak(out)).toBeLessThanOrEqual(LIMITER_CEILING + 1e-6);
		// The gain came down before the first loud peak, smoothly: no step bigger than 1/n of the way
		const gains = limiterGains(chs, SR);
		const n = Math.round(LOOKAHEAD_S * SR);
		const onset = Math.round(0.1 * SR);
		expect(gains[onset - n - 2]).toBe(1);
		expect(gains[onset]).toBeLessThan(1);
		let biggest = 0;
		for (let i = 1; i < gains.length; i++) biggest = Math.max(biggest, gains[i - 1] - gains[i]);
		expect(biggest).toBeLessThan(0.6 / n);
		// And then it holds about where the sound needs it: about −7 dB, not pumping
		const mid = gains.slice(Math.round(0.3 * SR), Math.round(0.5 * SR));
		expect(Math.min(...mid)).toBeGreaterThan(0.43);
		expect(Math.max(...mid) - Math.min(...mid)).toBeLessThan(0.02);
	});

	it('goes back up after a loud hit, slowly, then to exactly 1', () => {
		const chs = [new Float32Array(SR), new Float32Array(SR)];
		chs[0][1000] = 1.8; // one loud sample
		const gains = limiterGains(chs, SR);
		expect(gains[1000]).toBeCloseTo(LIMITER_CEILING / 1.8, 5);
		const after = (s: number) => gains[1000 + Math.round(s * SR)];
		expect(after(RELEASE_S)).toBeGreaterThan(0.75);
		expect(after(RELEASE_S)).toBeLessThan(0.9);
		expect(gains[gains.length - 1]).toBe(1);
	});

	it('gives the stems the mix\'s gains, so they still add up to the limited mix', () => {
		const a = [sine(1.2, 110, 0.4), sine(1.1, 110, 0.4)];
		const b = [sine(0.5, 440, 0.4), sine(0.4, 660, 0.4)];
		const mix = a.map((c, ch) => c.map((x, i) => x + b[ch][i]));
		const gains = limiterGains(mix, SR);
		const [la, lb, lm] = [a, b, mix].map((chs) => applyGains(chs, gains));
		for (let ch = 0; ch < 2; ch++) {
			for (let i = 0; i < lm[ch].length; i += 97) expect(la[ch][i] + lb[ch][i]).toBeCloseTo(lm[ch][i], 5);
		}
		expect(peak(lm)).toBeLessThanOrEqual(LIMITER_CEILING + 1e-6);
	});

	it('plays live as it exports, only later by the look-ahead', () => {
		// The worklet's way: each sample's gain arrives n samples late, applied to the delayed sample
		const x = sine(1.5, 220, 0.2, 0.05);
		const st = limiterState(SR, LIMITER_CEILING, LOOKAHEAD_S, RELEASE_S);
		const live = new Float32Array(x.length);
		for (let i = 0; i < x.length; i++) {
			const g = limiterGain(st, Math.abs(x[i]));
			live[i] = (i >= st.n ? x[i - st.n] : 0) * g;
		}
		const [offline] = limit([x], SR);
		for (let i = st.n; i < x.length; i += 13) expect(live[i]).toBeCloseTo(offline[i - st.n], 6);
	});
});

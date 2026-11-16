import { describe, it, expect } from 'vitest';
import {
	tapeSettings, tapeMakeup, tapeSaturate, tapeGainCurve, wobbleDelayAt, wobblePitchAt, fillHiss, fillCrackle,
	clampTapeMode, TAPE_CUTOFF_NEW, TAPE_CUTOFF_OLD, TAPE_SAT_MAX, TAPE_SAT_REF, TAPE_HISS_MAX, TAPE_CRACKLE_MAX,
	VINYL_SURFACE, WOBBLE_PARTS, WOBBLE_VOICES, CRACKLE_PER_SECOND,
} from './tape';
import { seededRandom } from '../lib/random';

describe('tapeSettings', () => {
	it('AGE 0 and WOBBLE 0 change nothing: no saturation, the top open, no noise, a still delay', () => {
		for (const mode of ['tape', 'vinyl'] as const) {
			const s = tapeSettings(0, 0, mode);
			expect(s.satK).toBe(0);
			expect(s.makeup).toBe(1);
			expect(s.cutoffHz).toBe(TAPE_CUTOFF_NEW);
			expect(s.hissGain).toBe(0);
			expect(s.crackleGain).toBe(0);
			expect(s.wobble).toHaveLength(WOBBLE_VOICES);
			for (const p of s.wobble) expect(p.seconds).toBe(0);
			expect(s.baseDelay).toBe(0);
		}
	});

	it('AGE closes the top, adds saturation and noise, more the further it is turned', () => {
		let last = tapeSettings(0, 0, 'tape');
		for (const age of [0.25, 0.5, 0.75, 1]) {
			const s = tapeSettings(age, 0, 'tape');
			expect(s.cutoffHz).toBeLessThan(last.cutoffHz);
			expect(s.satK).toBeGreaterThan(last.satK);
			expect(s.makeup).toBeGreaterThan(last.makeup);
			expect(s.hissGain).toBeGreaterThan(last.hissGain);
			last = s;
		}
		expect(last.cutoffHz).toBeCloseTo(TAPE_CUTOFF_OLD, 6);
		expect(last.satK).toBe(TAPE_SAT_MAX);
		expect(last.hissGain).toBeCloseTo(TAPE_HISS_MAX, 9);
	});

	it('TAPE hisses; VINYL crackles over a quieter surface noise', () => {
		const tape = tapeSettings(0.6, 0.5, 'tape');
		const vinyl = tapeSettings(0.6, 0.5, 'vinyl');
		expect(tape.crackleGain).toBe(0);
		expect(vinyl.crackleGain).toBeGreaterThan(0);
		expect(tapeSettings(1, 0, 'vinyl').crackleGain).toBeCloseTo(TAPE_CRACKLE_MAX, 9);
		expect(vinyl.hissGain).toBeCloseTo(tape.hissGain * VINYL_SURFACE, 9);
		// The sound itself ages the same either way
		expect(vinyl.cutoffHz).toBe(tape.cutoffHz);
		expect(vinyl.satK).toBe(tape.satK);
	});

	it('WOBBLE bends the pitch by each part\'s share at full, and stays subtle in its first half', () => {
		for (const mode of ['tape', 'vinyl'] as const) {
			const full = tapeSettings(0, 1, mode);
			full.wobble.forEach((p, i) => {
				expect(p.hz).toBe(WOBBLE_PARTS[mode][i].hz);
				// A sine of `seconds` on the delay's time bends the pitch by 2π·hz·seconds at most
				expect(2 * Math.PI * p.hz * p.seconds).toBeCloseTo(WOBBLE_PARTS[mode][i].bend, 9);
			});
			const half = tapeSettings(0, 0.5, mode);
			expect(half.wobble[0].seconds / full.wobble[0].seconds).toBeCloseTo(0.5 ** 1.5, 9);
		}
		// A record has no flutter
		expect(tapeSettings(0, 1, 'vinyl').wobble[2].seconds).toBe(0);
		expect(tapeSettings(0, 1, 'tape').wobble[2].seconds).toBeGreaterThan(0);
	});

	it('the delay never reaches zero, and the pitch stays within the parts\' bends', () => {
		for (const mode of ['tape', 'vinyl'] as const) {
			const s = tapeSettings(1, 1, mode);
			const most = WOBBLE_PARTS[mode].reduce((sum, p) => sum + p.bend, 0);
			let low = Infinity, high = 0, sharp = 0;
			for (let t = 0; t < 40; t += 0.003) {
				const d = wobbleDelayAt(s, t);
				low = Math.min(low, d);
				high = Math.max(high, d);
				sharp = Math.max(sharp, Math.abs(wobblePitchAt(s, t) - 1));
			}
			expect(low).toBeGreaterThan(0);
			expect(high).toBeLessThan(0.02); // well inside the 100 ms delay line
			expect(sharp).toBeLessThanOrEqual(most + 1e-9);
			expect(sharp).toBeGreaterThan(most * 0.8);
		}
	});

	it('an export\'s loop holds whole cycles of every sway, and bends the pitch as far', () => {
		for (const loop of [0.8, 2, 3.2, 8, 32]) {
			const s = tapeSettings(0.5, 0.7, 'tape', loop);
			const free = tapeSettings(0.5, 0.7, 'tape');
			s.wobble.forEach((p, i) => {
				const cycles = p.hz * loop;
				expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(1e-9);
				expect(cycles).toBeGreaterThanOrEqual(1);
				expect(p.hz * p.seconds).toBeCloseTo(free.wobble[i].hz * free.wobble[i].seconds, 12);
			});
			// So the delay is back where it started when the loop comes round
			expect(wobbleDelayAt(s, loop)).toBeCloseTo(wobbleDelayAt(s, 0), 9);
		}
	});

	it('takes any number or name: out of range is clamped, an unknown mode is tape', () => {
		expect(tapeSettings(5, -3, 'tape')).toEqual(tapeSettings(1, 0, 'tape'));
		expect(tapeSettings(NaN, NaN, 'tape')).toEqual(tapeSettings(0, 0, 'tape'));
		expect(tapeSettings(0.5, 0.5, 'cassette')).toEqual(tapeSettings(0.5, 0.5, 'tape'));
		expect(clampTapeMode('vinyl')).toBe('vinyl');
		expect(clampTapeMode(undefined)).toBe('tape');
	});
});

describe('the saturation', () => {
	it('leaves quiet sounds alone and never passes 1 / k', () => {
		expect(tapeSaturate(0.5, 0)).toBe(0.5);
		expect(tapeSaturate(0.001, 3)).toBeCloseTo(0.001, 6);
		expect(tapeSaturate(10, 3)).toBeLessThanOrEqual(1 / 3);
		expect(tapeSaturate(-0.4, 2)).toBeCloseTo(-tapeSaturate(0.4, 2), 12);
	});

	it('the makeup gain keeps the reference level where it was', () => {
		expect(tapeMakeup(0)).toBe(1);
		for (const k of [0.5, 1.5, 3]) expect(tapeMakeup(k) * tapeSaturate(TAPE_SAT_REF, k)).toBeCloseTo(TAPE_SAT_REF, 9);
	});

	it('the gain curve turns the mix into its saturated self, and is zero at silence', () => {
		for (const k of [0.6, 1.5, 3]) {
			const makeup = tapeMakeup(k);
			const curve = tapeGainCurve(k, makeup);
			expect(curve.length % 2).toBe(1);
			const mid = (curve.length - 1) / 2;
			expect(curve[mid]).toBe(0);
			for (const i of [0, 100, mid - 1, mid + 1, mid + 300, curve.length - 1]) {
				const x = (i - mid) / mid;
				// The gain is `makeup` plus the curve: x through it is makeup · saturate(x)
				expect(x * (makeup + curve[i])).toBeCloseTo(makeup * tapeSaturate(x, k), 6);
			}
			// Louder is turned down more, the same both ways
			expect(curve[0]).toBeCloseTo(curve[curve.length - 1], 9);
			expect(curve[0]).toBeLessThan(curve[mid + 300]);
			expect(curve[mid + 300]).toBeLessThan(0);
		}
		// No saturation: the curve adds nothing
		expect(Math.max(...tapeGainCurve(0, 1).map(Math.abs))).toBe(0);
	});

	it('parts of a mix, each through the mix\'s gain, add up to the saturated mix', () => {
		const k = 2.4, makeup = tapeMakeup(k);
		const random = seededRandom(7);
		for (let n = 0; n < 200; n++) {
			const parts = [random() - 0.5, (random() - 0.5) * 0.6, (random() - 0.5) * 0.3, (random() - 0.5) * 0.1];
			const mix = parts.reduce((a, b) => a + b, 0);
			const gain = makeup * (Math.abs(mix) < 1e-9 ? 1 : tapeSaturate(mix, k) / mix);
			expect(parts.reduce((sum, p) => sum + p * gain, 0)).toBeCloseTo(makeup * tapeSaturate(mix, k), 9);
		}
	});
});

describe('the noise', () => {
	it('hiss is white noise within −1..1, the same for the same seed', () => {
		const a = new Float32Array(48000), b = new Float32Array(48000);
		fillHiss(a, seededRandom(3));
		fillHiss(b, seededRandom(3));
		expect([...a.slice(0, 50)]).toEqual([...b.slice(0, 50)]);
		let sum = 0, sq = 0, peak = 0;
		for (const v of a) { sum += v; sq += v * v; peak = Math.max(peak, Math.abs(v)); }
		expect(peak).toBeLessThanOrEqual(1);
		expect(Math.abs(sum / a.length)).toBeLessThan(0.02);
		expect(Math.sqrt(sq / a.length)).toBeCloseTo(1 / Math.sqrt(3), 1);
	});

	it('crackle is mostly silence with ticks and the odd pop, the same for the same seed', () => {
		const sr = 48000, seconds = 11;
		const a = new Float32Array(sr * seconds), b = new Float32Array(sr * seconds);
		fillCrackle(a, sr, seededRandom(11));
		fillCrackle(b, sr, seededRandom(11));
		expect(a).toEqual(b);
		let peak = 0, loud = 0;
		for (const v of a) {
			peak = Math.max(peak, Math.abs(v));
			if (Math.abs(v) > 0.01) loud++;
		}
		expect(peak).toBeLessThanOrEqual(1);
		expect(peak).toBeGreaterThan(0.3);
		// About nine a second, each a few milliseconds at most: nearly all of it is silence
		expect(loud).toBeGreaterThan(seconds * CRACKLE_PER_SECOND);
		expect(loud / a.length).toBeLessThan(0.02);
		// Nothing in the last 10 ms rings past the end, so it loops without a cut-off tick
		expect(Math.abs(a[a.length - 1])).toBeLessThan(0.01);
		// Another seed, another crackle
		fillCrackle(b, sr, seededRandom(12));
		expect(a).not.toEqual(b);
	});

	it('a buffer too short for a tick stays silent', () => {
		const a = new Float32Array(100).fill(1);
		fillCrackle(a, 48000, seededRandom(1));
		expect(Math.max(...a)).toBe(0);
	});
});

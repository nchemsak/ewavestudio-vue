import { describe, it, expect } from 'vitest';
import { applyPitchEnv, pitchEnvStartCents, pitchEnvTimeConstant } from './pitchEnv';

// An AudioParam that records its automation, and its value at a time (only what applyPitchEnv
// uses: setValueAtTime, then setTargetAtTime)
function fakeParam() {
	const calls: any[] = [];
	return {
		calls,
		setValueAtTime(v: number, t: number) { calls.push(['set', v, t]); return this; },
		setTargetAtTime(v: number, t: number, tau: number) { calls.push(['target', v, t, tau]); return this; },
		valueAt(time: number) {
			let value = 0;
			let target: any = null;
			for (const c of calls) {
				if (c[0] === 'set' && c[2] <= time) { value = c[1]; target = null; }
				if (c[0] === 'target' && c[2] <= time) target = c;
			}
			if (!target) return value;
			const [, v, t, tau] = target;
			return v + (value - v) * Math.exp(-(time - t) / tau);
		},
	};
}
const fakeOsc = () => ({ frequency: fakeParam(), detune: fakeParam() }) as any;
const opts = (o: any = {}) => ({ enabled: true, semitones: 24, mode: 'up', decay: 0.05, ...o });

describe('pitch envelope', () => {
	it('starts Amount above (or below) the note and drops fast, then settles', () => {
		const osc = fakeOsc();
		applyPitchEnv(osc, 55, 1, pitchEnvStartCents(opts()), 0.05, 0);
		expect(osc.frequency.calls).toEqual([['set', 55, 1]]); // the frequency stays the note's
		expect(osc.detune.valueAt(1)).toBe(2400);
		// Half of the drop happens in the first ~9 ms of a 50 ms decay: fast, then settling
		expect(osc.detune.valueAt(1 + 0.0087)).toBeCloseTo(1200, -1);
		expect(osc.detune.valueAt(1.05)).toBeCloseTo(2400 * Math.exp(-4), 5); // ~44 cents at Decay
		expect(osc.detune.valueAt(1.2)).toBeLessThan(1);
		expect(pitchEnvTimeConstant(0.05)).toBeCloseTo(0.0125);
	});

	it('settles on the voice\'s own (unison) detune', () => {
		const osc = fakeOsc();
		applyPitchEnv(osc, 220, 0, -1200, 0.1, 15);
		expect(osc.detune.valueAt(0)).toBe(-1185);
		expect(osc.detune.valueAt(1)).toBeCloseTo(15, 3);
	});

	it('does nothing to the pitch when off or at amount 0', () => {
		for (const o of [opts({ enabled: false }), opts({ semitones: 0 })]) {
			expect(pitchEnvStartCents(o)).toBe(0);
			const osc = fakeOsc();
			applyPitchEnv(osc, 220, 2, pitchEnvStartCents(o), 0.3, 7);
			expect(osc.detune.calls).toEqual([['set', 7, 2]]);
		}
	});

	it('goes up, down, or by a random amount within ±Amount', () => {
		expect(pitchEnvStartCents(opts({ mode: 'up', semitones: 12 }))).toBe(1200);
		expect(pitchEnvStartCents(opts({ mode: 'down', semitones: 12 }))).toBe(-1200);
		expect(pitchEnvStartCents(opts({ mode: 'random', semitones: 12 }), () => 0)).toBe(-1200);
		expect(pitchEnvStartCents(opts({ mode: 'random', semitones: 12 }), () => 0.75)).toBe(600);
	});

	it('keeps very short decays from becoming a click', () => {
		expect(pitchEnvTimeConstant(0)).toBeCloseTo(0.005 / 4);
	});
});

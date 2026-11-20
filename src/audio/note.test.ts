import { describe, it, expect } from 'vitest';
import { noteTimes, noiseMorph, noiseBurstEnd, BURST_MAX_MS } from './note';
import { NOISE_LOUDNESS } from './synthHelpers';

const env = (enabled = true, attackMs = 20, decayMs = 400) => ({ envelope: { enabled, attackMs, decayMs } });
const flat = { decayFactor: 1 };

describe('a note\'s times', () => {
	it('end at Attack + Decay with the envelope on', () => {
		const t = noteTimes(env(), { freq: 220, amp: 1, time: 2, wave: 'sine' }, flat, null);
		expect(t.attack).toBeCloseTo(0.02);
		expect(t.attackEnd).toBeCloseTo(2.02);
		expect(t.end).toBeCloseTo(2.42);
		expect(t.sampleTimes).toBeNull();
	});

	it('take the caller\'s decay and the velocity\'s decay factor', () => {
		const t = noteTimes(env(), { freq: 220, amp: 1, time: 0, wave: 'sine', decaySeconds: 1 }, { decayFactor: 0.5 }, null);
		expect(t.end).toBeCloseTo(0.52);
	});

	it('hold for Decay alone with the envelope off (at least 20 ms)', () => {
		expect(noteTimes(env(false), { freq: 220, amp: 1, time: 1, wave: 'sine' }, flat, null).end).toBeCloseTo(1.4);
		expect(noteTimes(env(false, 20, 5), { freq: 220, amp: 1, time: 1, wave: 'sine' }, flat, null).end).toBeCloseTo(1.02);
	});

	it('fall back to 10 ms of attack and 100 ms of decay for unusable values', () => {
		const t = noteTimes(env(true, 0, NaN), { freq: 220, amp: 1, time: 0, wave: 'sine' }, flat, null);
		expect(t.attack).toBeCloseTo(0.01);
		expect(t.end).toBeCloseTo(0.11);
	});

	it('end where a ratchet\'s next hit begins, never before the attack is done', () => {
		const note = { freq: 220, amp: 1, time: 0, wave: 'sine', maxDuration: 0.1 };
		expect(noteTimes(env(), note, flat, null).end).toBeCloseTo(0.1);
		expect(noteTimes(env(true, 100), { ...note, maxDuration: 0.01 }, flat, null).end).toBeCloseTo(0.105);
	});

	it('last as long as the recording for the sample wave, not Decay', () => {
		// A 1 s recording on A3 (its own pitch) lasts 1 s; an octave up, half as long
		const a3 = noteTimes(env(), { freq: 220, amp: 1, time: 0, wave: 'sample' }, flat, 1);
		expect(a3.sampleTimes).not.toBeNull();
		expect(a3.end).toBeCloseTo(1);
		expect(noteTimes(env(), { freq: 440, amp: 1, time: 0, wave: 'sample' }, flat, 1).end).toBeCloseTo(0.5);
	});
});

describe('the noise colour', () => {
	it('crossfades the two neighbouring colours', () => {
		expect(noiseMorph(0)).toMatchObject({ lower: 'brown', upper: 'pink', wA: 1, wB: 0 });
		expect(noiseMorph(0.5)).toMatchObject({ lower: 'pink', upper: 'white' });
		expect(noiseMorph(0.5).wB).toBeCloseTo(1);
		const m = noiseMorph(0.625);
		expect([m.lower, m.upper]).toEqual(['white', 'blue']);
		expect(m.wA).toBeCloseTo(0.5);
		expect(m.colorGain).toBeCloseTo((NOISE_LOUDNESS.white + NOISE_LOUDNESS.blue) / 2);
		expect(noiseMorph(1)).toMatchObject({ lower: 'blue', upper: 'violet' });
	});

	it('keeps out-of-range colours at the ends', () => {
		expect(noiseMorph(-1)).toMatchObject({ lower: 'brown', wA: 1 });
		expect(noiseMorph(7).upper).toBe('violet');
		expect(noiseMorph(NaN).lower).toBe('brown');
	});
});

describe('the noise burst', () => {
	it('stops the noise soon after the attack while it is on', () => {
		expect(noiseBurstEnd({ attackBurst: true, burstMs: 30 }, 0.02, 1)).toBeCloseTo(0.05);
		expect(noiseBurstEnd({ attackBurst: true, burstMs: 0 }, 0.02, 1)).toBeCloseTo(0.025); // 5 ms at least
		expect(noiseBurstEnd({ attackBurst: true, burstMs: 200 }, 0.02, 0.1)).toBeCloseTo(0.1); // not past the note
	});

	it('lasts the note while off, or at its longest', () => {
		expect(noiseBurstEnd({ attackBurst: false, burstMs: 30 }, 0.02, 1)).toBe(1);
		expect(noiseBurstEnd({ attackBurst: true, burstMs: BURST_MAX_MS }, 0.02, 1)).toBe(1);
	});
});

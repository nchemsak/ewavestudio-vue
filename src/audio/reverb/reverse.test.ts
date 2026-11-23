import { describe, expect, it } from 'vitest';
import {
	FALLBACK_STEPS, isSwell, nextHitGaps, pedalHitSteps, revIrSeconds, revKey, reverseIrChannels, REV_FADE_S, REV_MAX_S, REV_MIN_S,
	stepTime, swellLabel, swellSeconds, SWELLS,
} from './reverse';

const STEP = 0.125; // a 1/16 at 120 BPM
const on = (...idx: number[]) => Array.from({ length: 16 }, (_, i) => idx.includes(i));

describe('REV: the reversed reverb', () => {
	it('offers Next hit and four fixed lengths', () => {
		expect(SWELLS.map((s) => s.label)).toEqual(['Next hit', '1 step', '2 steps', '1 beat', '2 beats']);
		expect(isSwell('next')).toBe(true);
		expect(isSwell('1/4')).toBe(true);
		expect(isSwell('3 beats')).toBe(false);
		expect(swellLabel('1/2')).toBe('2 beats');
		expect(swellLabel('nonsense')).toBe('Next hit');
	});

	it('times a swell to the next hit, round the bar, with swing', () => {
		// Hits on 1, 5, 9 and 13: a beat each
		expect(nextHitGaps(on(0, 4, 8, 12), STEP, 0).filter((g) => g != null)).toEqual([0.5, 0.5, 0.5, 0.5]);
		// Uneven gaps, the last one round the bar's end to step 1
		const gaps = nextHitGaps(on(0, 3, 10), STEP, 0);
		expect([gaps[0], gaps[3], gaps[10]]).toEqual([3 * STEP, 7 * STEP, 6 * STEP]);
		expect(gaps[1]).toBeNull();
		// One hit a bar swells for the whole bar
		expect(nextHitGaps(on(0), STEP, 0)[0]).toBe(16 * STEP);
		// Swing: step 2 (index 1) starts late, so the gap to it is longer and from it shorter
		const swung = nextHitGaps(on(0, 1), STEP, 0.5);
		expect(swung[0]).toBeCloseTo(STEP * 1.5, 9);
		expect(swung[1]).toBeCloseTo(15 * STEP - STEP * 0.5, 9);
		expect(stepTime(3, STEP, 0.5)).toBeCloseTo(3.5 * STEP, 9);
		expect(nextHitGaps(on(), STEP, 0).every((g) => g === null)).toBe(true);
	});

	it('has a fixed length, the gap, or a beat when there is no next hit', () => {
		expect(swellSeconds('1/16', STEP)).toBe(STEP);
		expect(swellSeconds('1/2', STEP, 9)).toBe(8 * STEP);
		expect(swellSeconds('next', STEP, 0.375)).toBe(0.375);
		expect(swellSeconds('next', STEP, null)).toBe(FALLBACK_STEPS * STEP);
	});

	it("counts every machine's hits that go through the pedals", () => {
		const off = Array(16).fill(false);
		const bass = (steps: boolean[], extra: Partial<Record<'slides' | 'ties', boolean[]>> = {}) => ({
			steps, pitches: Array(16).fill(55), velocities: Array(16).fill(1),
			accents: [...off], slides: extra.slides ?? [...off], ties: extra.ties ?? [...off],
		});
		const rows = (...each: boolean[][]) => [0, 1, 2, 3].map((k) => ({ steps: each[k] ?? [...off], velocities: Array(16).fill(1) }));
		const hitsAt = (h: boolean[]) => h.flatMap((v, i) => (v ? [i] : []));
		// Rhythm alone: its steps (a step at velocity 0 isn't a hit)
		expect(hitsAt(pedalHitSteps({ rhythm: { steps: on(0, 8), velocities: [1, 1, 1, 1, 1, 1, 1, 1, 0] } }, 16))).toEqual([0]);
		// Rhythm empty: Bass's notes and Drums' hits time the swells
		const all = pedalHitSteps({
			rhythm: { steps: on() },
			bass: { pattern: bass(on(2, 3, 10), { slides: on(2) }) }, // the note on 3 is slid into: not a hit
			drums: { rows: rows(on(0), on(4, 12)) },
		}, 16);
		expect(hitsAt(all)).toEqual([0, 2, 4, 10, 12]);
		// A muted machine, a muted slot, or one with no Pedals doesn't count
		expect(hitsAt(pedalHitSteps({
			rhythm: { steps: on(1), muted: true },
			bass: { pattern: bass(on(2)), pedals: 0 },
			drums: { rows: rows(on(0), on(4)), slotMuted: [true, false, false, false] },
		}, 16))).toEqual([4]);
		expect(hitsAt(pedalHitSteps({ drums: { rows: rows(on(4)), muted: true } }, 16))).toEqual([]);
	});

	it('keeps the impulse response within its limits', () => {
		expect(revIrSeconds(0.375)).toBe(0.375);
		expect(revIrSeconds(0.001)).toBe(REV_MIN_S);
		expect(revIrSeconds(60)).toBe(REV_MAX_S);
		expect(revKey(0.3751)).toBe(375);
	});

	it('rises to its end, fades out the last moments, and sits at one level whatever its length', () => {
		const sr = 48000;
		const energy = (chs: Float32Array[]) => chs.reduce((a, d) => a + d.reduce((b, v) => b + v * v, 0), 0);
		const rms = (d: Float32Array, from: number, to: number) => Math.sqrt(d.slice(from, to).reduce((a, v) => a + v * v, 0) / (to - from));
		const [l, r] = reverseIrChannels(0.5, sr);
		expect(l.length).toBe(0.5 * sr);
		// Rising: the last tenth far louder than the first
		expect(rms(l, 0.4 * sr, 0.49 * sr)).toBeGreaterThan(rms(l, 0, 0.05 * sr) * 50);
		// Ending in a fade to silence (no click)
		expect(Math.abs(l[l.length - 1])).toBeLessThan(1e-3);
		expect(rms(l, l.length - Math.round(REV_FADE_S * sr), l.length)).toBeLessThan(rms(l, 0.45 * sr, 0.49 * sr));
		// Two different channels
		expect(Math.abs(l[l.length - 500] - r[r.length - 500])).toBeGreaterThan(0);
		// Short and long swells carry the same energy
		expect(energy(reverseIrChannels(0.125, sr))).toBeCloseTo(energy(reverseIrChannels(2, sr)), 3);
		// The same samples every time
		expect(reverseIrChannels(0.2, sr)[0]).toEqual(reverseIrChannels(0.2, sr)[0]);
	});
});

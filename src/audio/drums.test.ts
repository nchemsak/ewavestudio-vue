import { describe, it, expect } from 'vitest';
import { drumHitShape, drumHitsForBar, DRUM_DECAY_FADE } from './drums';

const row = (on: number[], v = 1) => ({ steps: Array.from({ length: 16 }, (_, i) => on.includes(i)), velocities: Array(16).fill(v) });

describe('a drum hit', () => {
	it('plays the whole recording at Tune 0 and Decay 100%, with a short fade', () => {
		const s = drumHitShape(0.4, 0, 1);
		expect(s.rate).toBe(1);
		expect(s.seconds).toBeCloseTo(0.4, 6);
		expect(s.fade).toBeLessThanOrEqual(0.005);
	});

	it('Tune plays it faster and higher, or slower and lower, as a sampler plays a key', () => {
		expect(drumHitShape(0.4, 12, 1).rate).toBeCloseTo(2, 6);
		expect(drumHitShape(0.4, 12, 1).seconds).toBeCloseTo(0.2, 6);
		expect(drumHitShape(0.4, -12, 1).seconds).toBeCloseTo(0.8, 6);
		expect(drumHitShape(0.4, 7, 1).rate).toBeCloseTo(2 ** (7 / 12), 6);
	});

	it('Decay plays that share of it, fading over its last part', () => {
		const s = drumHitShape(0.4, 0, 0.5);
		expect(s.seconds).toBeCloseTo(0.2, 6);
		expect(s.fade).toBeCloseTo(0.2 * DRUM_DECAY_FADE, 6);
	});

	it('keeps Tune and Decay within their ranges, and a missing one at its default', () => {
		expect(drumHitShape(0.4, 40, 1).rate).toBeCloseTo(2, 6);
		expect(drumHitShape(0.4, 0, 0).seconds).toBeCloseTo(0.4 * 0.05, 6);
		expect(drumHitShape(0.4, NaN, NaN).seconds).toBeCloseTo(0.4, 6);
	});
});

describe('a bar of drums', () => {
	it('is every row\'s steps that are on, in time order, at their velocity, swing delaying the second step of each pair', () => {
		const hits = drumHitsForBar([row([0, 8]), row([4], 0.5), row([1]), row([])], [false, false, false, false], 16, 10, 0.125, 0.5);
		expect(hits.map((h) => [h.slot, h.step, h.vel])).toEqual([[0, 0, 1], [2, 1, 1], [1, 4, 0.5], [0, 8, 1]]);
		expect(hits[0].time).toBe(10);
		expect(hits[1].time).toBeCloseTo(10 + 0.125 + 0.0625, 9); // step 2, swung half a step
		expect(hits[2].time).toBeCloseTo(10 + 4 * 0.125, 9);
	});

	it('leaves out a muted slot and a step at velocity 0', () => {
		const hits = drumHitsForBar([row([0]), row([0], 0), row([0]), row([0])], [false, false, true, false], 16, 0, 0.1, 0);
		expect(hits.map((h) => h.slot)).toEqual([0, 3]);
	});
});

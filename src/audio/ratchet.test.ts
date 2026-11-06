import { describe, it, expect } from 'vitest';
import { clampRatchet, cutNoteEnd, ratchetHits, stepSpan, RATCHET_COUNTS } from './ratchet';

describe('ratchets', () => {
	it('count 1 to 4 hits; anything else is one hit', () => {
		expect(RATCHET_COUNTS).toEqual([1, 2, 3, 4]);
		expect([1, 2, 3, 4].map(clampRatchet)).toEqual([1, 2, 3, 4]);
		expect([0, -2, 9, 2.6, NaN, Infinity, undefined, null, '3'].map(clampRatchet)).toEqual([1, 1, 4, 3, 1, 1, 1, 1, 1]);
	});

	it("split a step from its start to the next step's start, which swing moves", () => {
		const d = 0.1875; // a 16th at 80 BPM
		expect(stepSpan(0, 16, d, 0)).toBeCloseTo(d);
		expect(stepSpan(7, 16, d, 0)).toBeCloseTo(d);
		// Swing delays every second step: an on-beat step gets longer, a swung one shorter
		expect(stepSpan(0, 16, d, 0.5)).toBeCloseTo(d * 1.5);
		expect(stepSpan(1, 16, d, 0.5)).toBeCloseTo(d * 0.5);
		expect(stepSpan(15, 16, d, 0.25)).toBeCloseTo(d * 0.75); // the last step, before step 1
		// However swung, the pattern's steps still add up to its length
		const total = Array.from({ length: 16 }, (_, i) => stepSpan(i, 16, d, 0.37)).reduce((a, b) => a + b, 0);
		expect(total).toBeCloseTo(16 * d);
	});

	it('play evenly spaced hits within the step; each but the last ends where the next begins', () => {
		expect(ratchetHits(2, 0.18, 1)).toEqual([{ time: 2 }]);
		expect(ratchetHits(2, 0.18, undefined)).toEqual([{ time: 2 }]);
		const hits = ratchetHits(2, 0.18, 3);
		expect(hits.map(h => h.time)).toEqual([2, 2.06, 2.12].map(t => expect.closeTo(t, 9)));
		expect(hits.map(h => h.maxDuration)).toEqual([expect.closeTo(0.06, 9), expect.closeTo(0.06, 9), undefined]);
		for (const n of [2, 3, 4]) {
			const last = ratchetHits(0, 0.1, n).at(-1)!;
			expect(last.time).toBeLessThan(0.1);
		}
	});

	it("cut a hit's note short, but never before its attack is done", () => {
		expect(cutNoteEnd(1.4, 1, 0.02)).toBe(1.4); // not a ratchet hit: as before
		expect(cutNoteEnd(1.4, 1, 0.002, 0.06)).toBeCloseTo(1.06);
		expect(cutNoteEnd(1.05, 1, 0.002, 0.06)).toBeCloseTo(1.05); // already shorter
		expect(cutNoteEnd(1.4, 1, 0.04, 0.03)).toBeCloseTo(1.045); // a slow attack finishes first
		expect(cutNoteEnd(1.4, 1, 0.001, 0.01)).toBeCloseTo(1.02); // at least 20 ms
	});
});

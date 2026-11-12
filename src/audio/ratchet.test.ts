import { describe, it, expect } from 'vitest';
import { clampRatchet, cutNoteEnd, ratchetHits, stepSpan, RATCHET_COUNTS, ratchetPitches, clampRepeatNotes } from './ratchet';
import { chordPitchClasses } from '../lib/melody/theory';

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

describe('repeats stepping through the chord', () => {
	const midi = (hz: number) => Math.round(69 + 12 * Math.log2(hz / 440));
	const A_MINOR = chordPitchClasses('A', 'naturalMinor'); // A C E
	const A3 = 220;

	it('the key\'s chord: the scale\'s 1st, 3rd and 5th (major with no scale)', () => {
		expect(A_MINOR.sort((a, b) => a - b)).toEqual([0, 4, 9]);
		expect(chordPitchClasses('C', 'none').sort((a, b) => a - b)).toEqual([0, 4, 7]);
		expect(chordPitchClasses('D', 'pentMinor').sort((a, b) => a - b)).toEqual([0, 2, 7]); // D, G, C: the scale's 1st, 3rd and 5th notes, as the arpeggio's Chord
	});

	it('Same plays the pad\'s note every hit, as before', () => {
		expect(ratchetPitches(A3, 3, 'same', A_MINOR)).toEqual([A3, A3, A3]);
		expect(ratchetPitches(A3, 4, undefined, A_MINOR)).toEqual([A3, A3, A3, A3]);
		expect(ratchetPitches(A3, 1, 'up', A_MINOR)).toEqual([A3]);
	});

	it('Up goes 1-3-5-8 from the root, Down 8-5-3-1 from the octave', () => {
		expect(ratchetPitches(A3, 4, 'up', A_MINOR).map(midi)).toEqual([57, 60, 64, 69]);
		expect(ratchetPitches(440, 4, 'down', A_MINOR).map(midi)).toEqual([69, 64, 60, 57]);
	});

	it('starts from the pad\'s own note, even off the chord, and keeps its fine tuning', () => {
		// B3 (not in A minor's chord): then C4, E4
		expect(ratchetPitches(246.94, 3, 'up', A_MINOR).map(midi)).toEqual([59, 60, 64]);
		const sharp = A3 * Math.pow(2, 20 / 1200); // 20 cents sharp
		const out = ratchetPitches(sharp, 2, 'up', A_MINOR);
		expect(1200 * Math.log2(out[1] / 261.6256)).toBeCloseTo(20, 1);
	});

	it('stays inside the pads\' range', () => {
		for (const hz of [1800, 1950, 110, 101]) {
			for (const dir of ['up', 'down']) {
				for (const f of ratchetPitches(hz, 4, dir, A_MINOR)) {
					expect(f).toBeGreaterThanOrEqual(100);
					expect(f).toBeLessThanOrEqual(2000);
				}
			}
		}
	});

	it('a saved value it doesn\'t know is Same', () => {
		expect(clampRepeatNotes('up')).toBe('up');
		expect(clampRepeatNotes('sideways')).toBe('same');
		expect(clampRepeatNotes(undefined)).toBe('same');
	});
});

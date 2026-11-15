import { describe, it, expect } from 'vitest';
import { rollY, rootOctavesHz, rollNotes, ghostNotes, rollSegments, soundingKey, ROLL_MIN_STEPS } from './roll';

describe("the Melody Maker's screen", () => {
	it('puts low notes at the bottom and high notes at the top, an octave the same distance anywhere', () => {
		const y = (hz: number) => rollY(hz, 100, 1600, 120, 16, 10);
		expect(y(100)).toBe(110);
		expect(y(1600)).toBe(16);
		expect(y(200) - y(400)).toBeCloseTo(y(400) - y(800));
		// outside the range: held at the edges
		expect(y(50)).toBe(110);
		expect(y(5000)).toBe(16);
	});

	it("has a guide line for every octave of the key's root in range", () => {
		const a = rootOctavesHz(9, 100, 2000); // A
		expect(a.map((hz) => Math.round(hz))).toEqual([110, 220, 440, 880, 1760]);
		expect(rootOctavesHz(0, 100, 2000).map((hz) => Math.round(hz))).toEqual([131, 262, 523, 1047]); // C
	});

	it('draws the steps that are on, at their pitches', () => {
		expect(rollNotes([220, 330, 440], [true, false, true])).toEqual([{ i: 0, hz: 220 }, { i: 2, hz: 440 }]);
	});

	it("previews only what Generate would change", () => {
		const now = rollNotes([220, 220, 220, 220], [true, false, true, true]);
		const next = [{ i: 0, hz: 220 }, { i: 1, hz: 262 }, { i: 2, hz: 330 }, { i: 3, hz: 220.2 }];
		// step 1 is off now, step 3 moves; steps 1 and 4 stay (within 5 cents)
		expect(ghostNotes(now, next).map((n) => n.i)).toEqual([1, 2]);
		expect(ghostNotes(next, next)).toEqual([]);
	});
});

describe("the Melody Maker's screen while playing", () => {
	const steps = (...on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
	const freqs = Array(16).fill(220);

	it('draws a note as long as it sounds, cut where the next hit begins', () => {
		const segs = rollSegments({ freqs, steps: steps(0, 2, 8), noteSteps: 3.5 });
		expect(segs.map((s) => [s.start, s.end])).toEqual([[0, 2], [2, 5.5], [8, 11.5]]);
		// a cut note would have faded later than it ends; one that rings out fades where it ends
		expect(segs.map((s) => s.fadeEnd)).toEqual([3.5, 5.5, 11.5]);
	});

	it('cuts the last note at the next bar\'s first hit, and a lone note at itself a bar later', () => {
		expect(rollSegments({ freqs, steps: steps(4, 14), noteSteps: 10 }).map((s) => [s.start, s.end])).toEqual([[4, 14], [14, 20]]);
		expect(rollSegments({ freqs, steps: steps(4), noteSteps: 40 })[0].end).toBe(20);
	});

	it('keeps a very short note wide enough to see', () => {
		expect(rollSegments({ freqs, steps: steps(0), noteSteps: 0.05 })[0].end).toBe(ROLL_MIN_STEPS);
	});

	it('starts a swung step late, as the engine does', () => {
		const segs = rollSegments({ freqs, steps: steps(0, 1, 2), noteSteps: 1, swing: 0.5 });
		expect(segs.map((s) => s.start)).toEqual([0, 1.5, 2]);
		expect(segs[1].end).toBe(2); // cut by step 3, half a step later
	});

	it('draws repeats as 2–4 hits splitting the step, climbing the chord for Up', () => {
		const ratchets = Array(16).fill(1); ratchets[4] = 4;
		const repeatNotes = Array(16).fill('same'); repeatNotes[4] = 'up';
		const segs = rollSegments({ freqs, steps: steps(4, 8), ratchets, repeatNotes, chord: [9, 0, 4], noteSteps: 2 });
		const hits = segs.filter((s) => s.i === 4);
		expect(hits.map((s) => s.start)).toEqual([4, 4.25, 4.5, 4.75]);
		expect(hits.slice(0, 3).map((s) => s.end)).toEqual([4.25, 4.5, 4.75]); // each ends where the next begins
		expect(hits[3].end).toBe(6.75); // the last rings out
		const semis = hits.map((s) => Math.round(12 * Math.log2(s.hz / 220)));
		expect(semis).toEqual([0, 3, 7, 12]); // A minor: 1-3-5-8
		// Same: every hit at the pad's pitch
		expect(rollSegments({ freqs, steps: steps(4), ratchets, noteSteps: 2 }).map((s) => s.hz)).toEqual([220, 220, 220, 220]);
	});

	it('finds the hit the playhead is in, round the bar\'s end too', () => {
		const segs = rollSegments({ freqs, steps: steps(2, 14), noteSteps: 3 });
		expect(soundingKey(segs, null)).toBe(null);
		expect(soundingKey(segs, 1.9)).toBe(null);
		expect(soundingKey(segs, 2)).toBe('2:0');
		expect(soundingKey(segs, 4.99)).toBe('2:0');
		expect(soundingKey(segs, 5)).toBe(null);
		expect(soundingKey(segs, 15.5)).toBe('14:0');
		expect(soundingKey(segs, 0.5)).toBe('14:0'); // still ringing from the bar before
		expect(soundingKey(segs, 1)).toBe(null);
	});
});

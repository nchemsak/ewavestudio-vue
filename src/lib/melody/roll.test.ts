import { describe, it, expect } from 'vitest';
import { rollY, rootOctavesHz, rollNotes, ghostNotes } from './roll';

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

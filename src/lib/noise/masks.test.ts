import { describe, it, expect } from 'vitest';
import { backbeatMask, offbeatMask, noiseGap } from './masks';

const steps = (on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
const marked = (mask: boolean[]) => mask.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);

describe("the Noise card's Backbeat and Offbeats", () => {
	it('Backbeat is beats 2 and 4: steps 5 and 13', () => {
		expect(marked(backbeatMask(16))).toEqual([4, 12]);
	});

	it('Offbeats is the "and" of every beat: steps 3, 7, 11 and 15', () => {
		expect(marked(offbeatMask(16))).toEqual([2, 6, 10, 14]);
	});

	it('they never share a pad, and follow a longer bar', () => {
		const back = backbeatMask(32), off = offbeatMask(32);
		expect(back.some((b, i) => b && off[i])).toBe(false);
		expect(marked(back)).toEqual([4, 12, 20, 28]);
		expect(marked(off)).toHaveLength(8);
		expect(backbeatMask(0)).toEqual([]);
	});
});

describe('whether a noise mask can be heard', () => {
	it('is heard when a step that is on has noise', () => {
		expect(noiseGap(backbeatMask(16), steps([0, 4, 8]))).toBeNull();
	});

	it("says when none of its pads is on (Backbeat on a pattern with no hit on 5 or 13)", () => {
		expect(noiseGap(backbeatMask(16), steps([0, 3, 6, 8, 11, 14]))).toBe('silent');
		expect(noiseGap(offbeatMask(16), steps([]))).toBe('silent');
	});

	it('says when no pad has noise at all', () => {
		expect(noiseGap(Array(16).fill(false), steps([0, 4]))).toBe('none');
	});
});

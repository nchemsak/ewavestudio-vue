import { describe, it, expect } from 'vitest';
import { accentMask } from './accents';

const steps = (on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
const marked = (mask: boolean[]) => mask.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);

describe("the Noise card's Accents", () => {
	it("puts noise on the pattern's loudest hits", () => {
		const vel = Array(16).fill(0.6);
		vel[0] = 1; vel[6] = 0.95; vel[9] = 0.85;
		expect(marked(accentMask(steps([0, 3, 6, 9, 12]), vel))).toEqual([0, 6]);
	});

	it('follows the hits, where Backbeat (steps 5 and 13) missed them', () => {
		// Tresillo: 1, 4, 7, 9, 12, 15, its accents on 1 and 9
		const on = [0, 3, 6, 8, 11, 14];
		const vel = Array(16).fill(1);
		[3, 11].forEach((i) => { vel[i] = 0.75; });
		[6, 14].forEach((i) => { vel[i] = 0.85; });
		expect(marked(accentMask(steps(on), vel))).toEqual([0, 8]);
	});

	it('with every hit as loud: the hits on a beat, or every hit when none is', () => {
		const all = Array(16).fill(1);
		expect(marked(accentMask(steps([0, 2, 4, 6, 8, 10, 12, 14]), all))).toEqual([0, 4, 8, 12]);
		expect(marked(accentMask(steps([1, 3, 5, 7, 9]), all))).toEqual([1, 3, 5, 7, 9]);
		// Four hits or fewer: each is an accent
		expect(marked(accentMask(steps([0, 3, 6]), all))).toEqual([0, 3, 6]);
	});

	it('with nothing on: the beats', () => {
		expect(marked(accentMask(steps([]), Array(16).fill(1)))).toEqual([0, 4, 8, 12]);
	});
});

import { describe, it, expect } from 'vitest';
import { lfoPlotValue, lfoPlotPath, plotSpanBars } from './lfoPlot';

const steps = (on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
const base = { division: '1/4', wave: 'sine', retrigger: false, steps: steps([]) };

describe("the LFO card's screen", () => {
	it('spans one bar, or the whole cycle of a 2- or 4-bar rate', () => {
		expect(plotSpanBars('1/4')).toBe(1);
		expect(plotSpanBars('1/64')).toBe(1);
		expect(plotSpanBars('1/8.')).toBe(1);
		expect(plotSpanBars('1/1')).toBe(1);
		expect(plotSpanBars('2/1')).toBe(2);
		expect(plotSpanBars('4/1')).toBe(4);
	});

	it('draws as many cycles in the bar as the rate has: 1/4 is four', () => {
		// a sine starts at 0 going up, peaks a quarter of a cycle in, and is back at 0 each beat
		expect(lfoPlotValue(base, 0)).toBeCloseTo(0);
		expect(lfoPlotValue(base, 1 / 16)).toBeCloseTo(1);
		expect(lfoPlotValue(base, 3 / 16)).toBeCloseTo(-1);
		for (const beat of [0.25, 0.5, 0.75]) expect(lfoPlotValue(base, beat)).toBeCloseTo(0);
		expect(lfoPlotValue({ ...base, division: '1/1' }, 0.25)).toBeCloseTo(1);
	});

	it('a square is up for the first half of its cycle, down for the second', () => {
		const sq = { ...base, wave: 'square' };
		expect(lfoPlotValue(sq, 0.01)).toBe(1);
		expect(lfoPlotValue(sq, 0.2)).toBe(-1);
	});

	it('with Retrigger the wave starts again at every step that is on', () => {
		const r = { ...base, division: '1/2', retrigger: true, steps: steps([0, 3, 8]) };
		// just after steps 1, 4 and 9 it is at its start, rising
		for (const s of [0, 3, 8]) {
			expect(lfoPlotValue(r, s / 16)).toBeCloseTo(0);
			expect(lfoPlotValue(r, (s + 0.5) / 16)).toBeGreaterThan(0);
		}
		// without it, step 4 falls mid-cycle
		expect(lfoPlotValue({ ...r, retrigger: false }, 3 / 16)).toBeCloseTo(Math.sin(2 * Math.PI * (3 / 8)));
		// before the bar's first hit it carries on from the last hit of the bar before
		const late = { ...r, steps: steps([4]) };
		expect(lfoPlotValue(late, 0)).toBeCloseTo(Math.sin(2 * Math.PI * ((12 / 16) / 0.5)));
		// no step on: it runs free
		expect(lfoPlotValue({ ...r, steps: steps([]) }, 3 / 16)).toBeCloseTo(lfoPlotValue({ ...r, retrigger: false }, 3 / 16));
	});

	it('the path stays inside its box and is flat at depth 0', () => {
		const ys = (d: string) => d.slice(1).split(' L').map((p) => Number(p.split(' ')[1]));
		const full = ys(lfoPlotPath({ ...base, wave: 'square' }, 100, 40, 1, 4));
		expect(Math.min(...full)).toBe(4);
		expect(Math.max(...full)).toBe(36);
		expect(new Set(ys(lfoPlotPath(base, 100, 40, 0))).size).toBe(1);
	});
});

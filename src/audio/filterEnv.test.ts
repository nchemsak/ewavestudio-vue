import { describe, it, expect } from 'vitest';
import { applyFilterEnv } from './filterEnv';

const fakeFilter = () => {
	const calls: any[] = [];
	return {
		calls,
		detune: {
			setValueAtTime(v: number, t: number) { calls.push(['set', v, t]); },
			setTargetAtTime(v: number, t: number, tau: number) { calls.push(['target', v, t, tau]); },
		},
	} as any;
};

describe('filter envelope', () => {
	it('starts the cutoff Env Amt octaves away and returns within Decay', () => {
		const f = fakeFilter();
		applyFilterEnv(f, 2, 3, 0.2);
		expect(f.calls).toEqual([['set', 3600, 2], ['target', 0, 2, 0.05]]); // time constant: Decay / 4
		const g = fakeFilter();
		applyFilterEnv(g, 0, -1.5, 0.1);
		expect(g.calls[0]).toEqual(['set', -1800, 0]);
	});

	it('does nothing at 0, and keeps to ±5 octaves', () => {
		const f = fakeFilter();
		applyFilterEnv(f, 1, 0, 0.2);
		expect(f.calls).toEqual([['set', 0, 1]]);
		const g = fakeFilter();
		applyFilterEnv(g, 1, 9, 0.2);
		expect(g.calls[0]).toEqual(['set', 6000, 1]);
	});
});

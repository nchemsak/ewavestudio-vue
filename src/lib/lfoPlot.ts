// src/lib/lfoPlot.ts
// What the LFO card's screen draws (PR 75): the LFO's wave across one bar of the pattern (or
// across its whole cycle, when that takes longer than a bar), over the 16 steps. Pure,
// unit-tested; LFOGroup.vue turns it into an SVG path.
import { divisionBars } from '../audio/synthHelpers';

export const STEPS_PER_BAR = 16;

export type LfoPlotInput = {
	division: string; // '1/4', '4/1', '1/8.' …
	wave: 'sine' | 'square' | string;
	// With Retrigger each note starts its own LFO, so the wave starts again at every step
	// that's on (none on: it runs free, as without Retrigger)
	retrigger: boolean;
	steps: readonly boolean[]; // the pattern's 16 steps
};

// How many bars the screen spans: 1, or the cycle's length for the 2- and 4-bar rates
export function plotSpanBars(division: string): number {
	const [p, q] = divisionBars(division);
	return Math.max(1, Math.ceil(p / q - 1e-9));
}

// The wave's value (−1…1) at `bars` from the left edge
export function lfoPlotValue(input: LfoPlotInput, bars: number): number {
	const [p, q] = divisionBars(input.division);
	const cycleBars = p / q;
	const on = (i: number) => !!input.steps[((i % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR];
	let t = bars;
	if (input.retrigger && input.steps.slice(0, STEPS_PER_BAR).some(Boolean)) {
		// time since the last step that's on, looking back into the bar before if need be
		const pos = bars * STEPS_PER_BAR;
		let i = Math.floor(pos + 1e-9);
		while (!on(i)) i--;
		t = (pos - i) / STEPS_PER_BAR;
	}
	const phase = (((t / cycleBars) % 1) + 1) % 1;
	return input.wave === 'square' ? (phase < 0.5 ? 1 : -1) : Math.sin(2 * Math.PI * phase);
}

// The wave as an SVG path in a width × height box, `amp` (0…1) of the room above and below
// the middle line; a square's edges are drawn upright
export function lfoPlotPath(input: LfoPlotInput, width: number, height: number, amp: number, pad = 0): string {
	const span = plotSpanBars(input.division);
	const mid = height / 2;
	const reach = Math.max(0, Math.min(1, amp)) * (mid - pad);
	const n = Math.round(width * 2);
	const pts: string[] = [];
	let prev = NaN;
	for (let k = 0; k <= n; k++) {
		const x = (k / n) * width;
		const y = mid - lfoPlotValue(input, (k / n) * span) * reach;
		if (Math.abs(y - prev) > reach) pts.push(`${x.toFixed(1)} ${prev.toFixed(1)}`);
		pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
		prev = y;
	}
	return 'M' + pts.join(' L');
}

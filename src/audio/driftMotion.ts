// src/audio/driftMotion.ts
// The Drift machine's Motion (the plan's item 19): the X/Y pad's dot moves by itself, for the
// live engine, the export engine and the pad's drawing alike. A shape (Circle: the filter and
// the spread together; Sweep: the filter only; Wander: both, smoothly at random; Swell: the
// filter closes at each new chord and opens again over Attack), a Rate in bars (1–16; not
// Swell's, which follows the chords) and a Depth (0: off). The periodic shapes start their
// cycle with Play's bar 1, as the LFO, and repeat every Rate bars, so a loop of whole cycles
// repeats smoothly.
//
// Where the dot is, in the pad's own units: x across (the filter, on its log scale), y up (the
// spread), both 0..1. The dot moves round the point the pad is set to, up to MOTION_REACH at
// full Depth, and stops at the pad's edges (the filter's and the spread's ranges).
//
// Both engines follow the same points, two a step (MOTION_POINTS_PER_STEP), joined by straight
// lines: the filter's offset in cents on its `detune`, the spread's offset on a shared signal
// every voice of every note follows (playDriftNote()'s `spreadMod`). Pure, unit-tested.

import { DRIFT_RANGES } from './drift';

export const MOTION_SHAPES = ['circle', 'sweep', 'wander', 'swell'] as const;
export type MotionShape = typeof MOTION_SHAPES[number];
export const MOTION_RATES = [1, 2, 4, 8, 16] as const;
export const MOTION_NAMES: Record<MotionShape, string> = { circle: 'Circle', sweep: 'Sweep', wander: 'Wander', swell: 'Swell' };

export type DriftMotion = { shape: MotionShape; rate: number; depth: number };

// How far the dot goes from its point at full Depth (half the pad: about 2.9 octaves of filter)
export const MOTION_REACH = 0.5;
// Points a step (16 a bar): each a straight line to the next
export const MOTION_POINTS_PER_STEP = 2;

const [CUT_LO, CUT_HI] = DRIFT_RANGES.cutoff;
/** The filter's range across the pad, in octaves */
export const PAD_OCTAVES = Math.log2(CUT_HI / CUT_LO);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The pad's x for a cutoff (log) and back */
export const padX = (hz: number) => clamp01(Math.log(Math.max(CUT_LO, hz) / CUT_LO) / Math.log(CUT_HI / CUT_LO));
export const cutoffAtX = (x: number) => CUT_LO * (CUT_HI / CUT_LO) ** clamp01(x);

export const clampShape = (x: unknown): MotionShape => ((MOTION_SHAPES as readonly unknown[]).includes(x) ? (x as MotionShape) : 'circle');
export const clampRate = (x: unknown): number => ((MOTION_RATES as readonly unknown[]).includes(x) ? (x as number) : 4);

// Wander: a smooth path that comes back to its start every cycle, a few harmonics of the cycle
// at fixed phases (so the same live and exported), scaled so its furthest point is 1
const WANDER: { x: [number, number][]; y: [number, number][] } = {
	x: [[1, 0.4], [0.55, 2.3], [0.32, 4.1], [0.2, 1.2]],
	y: [[1, 2.6], [0.5, 0.9], [0.35, 3.4], [0.18, 5.1]],
};
const harmonics = (h: [number, number][], phase: number) =>
	h.reduce((sum, [a, p], k) => sum + a * Math.sin(2 * Math.PI * (k + 1) * phase + p), 0);
const WANDER_SCALE = (() => {
	let mx = 0, my = 0;
	for (let i = 0; i < 1024; i++) {
		mx = Math.max(mx, Math.abs(harmonics(WANDER.x, i / 1024)));
		my = Math.max(my, Math.abs(harmonics(WANDER.y, i / 1024)));
	}
	return { x: mx, y: my };
})();

/** Is it moving anything? (Depth above 0) */
export const motionOn = (m: Pick<DriftMotion, 'depth'>) => m.depth > 0;

/**
 * The motion's offset at `bars` bars since Play (the periodic shapes), or `sinceChord` bars
 * since the last bar that started a note (Swell; null: none yet), in the pad's units, before
 * the pad's edges: −1..1 times the reach. `attack`: Swell opens over it (bars).
 */
export function motionOffset(m: DriftMotion, bars: number, sinceChord: number | null, attack: number): { dx: number; dy: number } {
	const r = MOTION_REACH * clamp01(m.depth);
	if (r <= 0) return { dx: 0, dy: 0 };
	if (m.shape === 'swell') {
		if (sinceChord == null || sinceChord < 0) return { dx: 0, dy: 0 };
		const p = attack > 0 ? clamp01(sinceChord / attack) : 1;
		return { dx: -r * (1 - p), dy: 0 };
	}
	const rate = clampRate(m.rate);
	const phase = (((bars / rate) % 1) + 1) % 1;
	const a = 2 * Math.PI * phase;
	if (m.shape === 'sweep') return { dx: r * Math.sin(a), dy: 0 };
	const unit = (v: number) => Math.max(-1, Math.min(1, v));
	if (m.shape === 'wander') return { dx: r * unit(harmonics(WANDER.x, phase) / WANDER_SCALE.x), dy: r * unit(harmonics(WANDER.y, phase) / WANDER_SCALE.y) };
	// Circle: from the top, round to the right (the filter opening first)
	return { dx: r * Math.sin(a), dy: r * Math.cos(a) };
}

/** Where the dot is: the pad's point moved by the motion, kept on the pad */
export function motionAt(base: { x: number; y: number }, m: DriftMotion, bars: number, sinceChord: number | null, attack: number): { x: number; y: number } {
	const o = motionOffset(m, bars, sinceChord, attack);
	return { x: clamp01(base.x + o.dx), y: clamp01(base.y + o.dy) };
}

/** What the engines apply: the filter's offset (cents on its detune) and the spread's (0..1 units) */
export function motionParams(base: { x: number; y: number }, at: { x: number; y: number }) {
	return { cents: (at.x - base.x) * PAD_OCTAVES * 1200, spread: at.y - base.y };
}

/** The path the dot takes, to draw on the pad (pad units): a cycle of a periodic shape, or
 * Swell's line from closed to open. Empty while Depth is 0. */
export function motionPath(base: { x: number; y: number }, m: DriftMotion, n = 64): { x: number; y: number }[] {
	if (!motionOn(m)) return [];
	if (m.shape === 'swell') return [motionAt(base, m, 0, 0, 1), { x: clamp01(base.x), y: clamp01(base.y) }];
	const rate = clampRate(m.rate);
	return Array.from({ length: n + 1 }, (_, i) => motionAt(base, m, (i / n) * rate, null, 1));
}

/** The bars after which a loop holds whole cycles of the motion: its Rate while a periodic
 * shape moves, else 0 (Swell follows the chords, whose own length the export dialog checks) */
export function motionLoopBars(m: DriftMotion): number {
	return motionOn(m) && m.shape !== 'swell' ? clampRate(m.rate) : 0;
}

/** An AudioParam that follows points: the first one set, the rest straight lines to them */
export function rampTo(param: AudioParam, time: number, value: number, first: boolean) {
	if (first) param.setValueAtTime(value, time);
	else param.linearRampToValueAtTime(value, time);
}

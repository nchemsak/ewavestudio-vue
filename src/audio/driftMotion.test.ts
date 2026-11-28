import { describe, expect, it } from 'vitest';
import { cutoffAtX, motionAt, motionLoopBars, motionOffset, motionParams, motionPath, padX, PAD_OCTAVES, MOTION_REACH, type DriftMotion } from './driftMotion';
import { applyDrift, createDrift, driftSnapshot, DRIFT_DEFAULTS } from '../lib/machines/drift';

const m = (shape: DriftMotion['shape'], rate = 4, depth = 1): DriftMotion => ({ shape, rate, depth });
const base = { x: 0.5, y: 0.5 };

describe('Drift\'s Motion', () => {
	it('does nothing at Depth 0', () => {
		for (const s of ['circle', 'sweep', 'wander', 'swell'] as const) {
			for (const bars of [0, 0.3, 1.7, 9]) expect(motionOffset(m(s, 4, 0), bars, 0.1, 1)).toEqual({ dx: 0, dy: 0 });
			expect(motionPath(base, m(s, 4, 0))).toEqual([]);
		}
	});

	it('Circle: from the top, round to the right, a cycle every Rate bars, as far as the reach', () => {
		const at = (bars: number) => motionOffset(m('circle', 4), bars, null, 1);
		expect(at(0).dx).toBeCloseTo(0);
		expect(at(0).dy).toBeCloseTo(MOTION_REACH);
		expect(at(1).dx).toBeCloseTo(MOTION_REACH);
		expect(at(1).dy).toBeCloseTo(0);
		expect(at(2).dy).toBeCloseTo(-MOTION_REACH);
		expect(at(4.3).dx).toBeCloseTo(at(0.3).dx);
		expect(at(4.3).dy).toBeCloseTo(at(0.3).dy);
		for (let b = 0; b < 4; b += 0.1) expect(Math.hypot(at(b).dx, at(b).dy)).toBeCloseTo(MOTION_REACH);
	});

	it('Sweep moves the filter only; Depth scales it', () => {
		const o = motionOffset(m('sweep', 2, 0.4), 0.5, null, 1);
		expect(o.dy).toBe(0);
		expect(o.dx).toBeCloseTo(0.4 * MOTION_REACH);
	});

	it('Wander: smooth, both ways, within the reach, back to its start each cycle', () => {
		const at = (bars: number) => motionOffset(m('wander', 8), bars, null, 1);
		let maxX = 0, maxY = 0, prev = at(0);
		for (let b = 0.01; b <= 8; b += 0.01) {
			const o = at(b);
			maxX = Math.max(maxX, Math.abs(o.dx));
			maxY = Math.max(maxY, Math.abs(o.dy));
			expect(Math.abs(o.dx - prev.dx)).toBeLessThan(0.02);
			expect(Math.abs(o.dy - prev.dy)).toBeLessThan(0.02);
			prev = o;
		}
		expect(maxX).toBeLessThanOrEqual(MOTION_REACH + 1e-9);
		expect(maxX).toBeGreaterThan(MOTION_REACH * 0.98);
		expect(maxY).toBeGreaterThan(MOTION_REACH * 0.98);
		expect(at(8).dx).toBeCloseTo(at(0).dx);
		expect(at(16.25).dy).toBeCloseTo(at(0.25).dy);
	});

	it('Swell: closed at a new chord, open again over Attack, nothing before the first', () => {
		const at = (since: number | null) => motionOffset(m('swell', 4, 0.5), 3, since, 2);
		expect(at(null)).toEqual({ dx: 0, dy: 0 });
		expect(at(0).dx).toBeCloseTo(-0.5 * MOTION_REACH);
		expect(at(1).dx).toBeCloseTo(-0.25 * MOTION_REACH);
		expect(at(2).dx).toBeCloseTo(0);
		expect(at(5).dx).toBeCloseTo(0);
		expect(at(1).dy).toBe(0);
	});

	it('stays on the pad, and gives the engines the filter\'s cents and the spread', () => {
		const p = motionAt({ x: 0.95, y: 0.05 }, m('circle'), 1, null, 1);
		expect(p.x).toBe(1);
		const q = motionAt({ x: 0.95, y: 0.05 }, m('circle'), 2, null, 1);
		expect(q.y).toBe(0);
		const r = motionParams({ x: 0.5, y: 0.5 }, { x: 0.75, y: 0.3 });
		expect(r.cents).toBeCloseTo(0.25 * PAD_OCTAVES * 1200);
		expect(r.spread).toBeCloseTo(-0.2);
		expect(cutoffAtX(padX(1800))).toBeCloseTo(1800);
		expect(cutoffAtX(0)).toBeCloseTo(150);
		expect(cutoffAtX(1)).toBeCloseTo(8000);
	});

	it('draws a closed path for the cycles, a line for Swell', () => {
		const c = motionPath(base, m('circle', 4, 0.5), 32);
		expect(c).toHaveLength(33);
		expect(c[0].x).toBeCloseTo(c[32].x);
		expect(c[0].y).toBeCloseTo(c[32].y);
		const s = motionPath(base, m('swell', 4, 0.5));
		expect(s).toEqual([{ x: 0.25, y: 0.5 }, { x: 0.5, y: 0.5 }]);
	});

	it('loops hold whole cycles of its Rate; Swell follows the chords', () => {
		expect(motionLoopBars(m('circle', 8))).toBe(8);
		expect(motionLoopBars(m('wander', 16, 0.2))).toBe(16);
		expect(motionLoopBars(m('swell', 8))).toBe(0);
		expect(motionLoopBars(m('sweep', 8, 0))).toBe(0);
	});

	it('is saved with Drift\'s sound; a sound saved before it has none', () => {
		const d = createDrift();
		Object.assign(d, { motionShape: 'swell', motionRate: 8, motionDepth: 0.4 });
		const e = createDrift();
		applyDrift(e, JSON.parse(JSON.stringify(driftSnapshot(d))));
		expect([e.motionShape, e.motionRate, e.motionDepth]).toEqual(['swell', 8, 0.4]);
		applyDrift(e, { sound: { voices: 4 } });
		expect([e.motionShape, e.motionRate, e.motionDepth]).toEqual([DRIFT_DEFAULTS.motionShape, DRIFT_DEFAULTS.motionRate, 0]);
		applyDrift(e, { sound: { motionShape: 'spiral', motionRate: 3, motionDepth: 7 } });
		expect([e.motionShape, e.motionRate, e.motionDepth]).toEqual(['circle', 4, 1]);
	});
});

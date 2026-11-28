import { describe, expect, it } from 'vitest';
import { applyPulse, duckHits, pulseStepEvents, releasePulse, PULSE_EDGE_S, type PulseEvent } from './driftPulse';
import { applyDrift, createDrift, driftSnapshot } from '../lib/machines/drift';

const S = 0.125; // a step at 120 BPM
const bar = (mode: any, depth = 0.6, swing = 0, hits?: boolean[]) =>
	Array.from({ length: 16 }, (_, i) => pulseStepEvents(mode, depth, i, 16, S, swing, hits).map((e) => ({ ...e, at: e.at + i * S })))
		.flat();
// The gain at time t from a bar's events (set: a jump; else a straight line from the last)
function gainAt(events: PulseEvent[], t: number) {
	let v = 1, at = -1;
	for (const e of events) {
		if (e.at > t) {
			if (e.set) return v;
			return v + (e.v - v) * ((t - at) / (e.at - at));
		}
		v = e.v; at = e.at;
	}
	return v;
}

describe('Drift\'s Pulse', () => {
	it('Off, or Depth 0, does nothing', () => {
		expect(bar('off')).toEqual([]);
		expect(bar('1/8', 0)).toEqual([]);
		expect(bar('duck', 0, 0, Array(16).fill(true))).toEqual([]);
	});

	it('a gate is open for the first half of each division, down to 1 − Depth for the rest', () => {
		for (const [mode, steps] of [['1/16', 1], ['1/8', 2], ['1/4', 4]] as const) {
			const ev = bar(mode, 0.6);
			expect(ev.filter((e) => e.set && e.v === 0.4)).toHaveLength(16 / steps); // each opening
			for (let k = 0; k < 16 / steps; k++) {
				const start = k * steps * S, half = steps * S / 2;
				expect(gainAt(ev, start + PULSE_EDGE_S + 0.001), `${mode} open`).toBeCloseTo(1);
				expect(gainAt(ev, start + half + PULSE_EDGE_S + 0.001), `${mode} shut`).toBeCloseTo(0.4);
			}
			// in time order
			for (let i = 1; i < ev.length; i++) expect(ev[i].at).toBeGreaterThanOrEqual(ev[i - 1].at);
		}
	});

	it('the 1/16 gate opens on the steps as they\'re swung', () => {
		const ev = bar('1/16', 1, 0.5);
		const opens = ev.filter((e) => e.set && e.v === 0).map((e) => e.at);
		expect(opens[1]).toBeCloseTo(S + 0.5 * S);
		// its gate is half of the swung step's shorter span
		expect(gainAt(ev, S * 1.5 + 0.0625 / 2 + 0.006)).toBeCloseTo(0);
	});

	it('Duck: a dip at each hit of slot 1, back up before the next hit or within a beat', () => {
		const hits = Array.from({ length: 16 }, (_, i) => i % 4 === 0);
		const ev = bar('duck', 0.8, 0, hits);
		for (const at of [0, 4 * S, 8 * S, 12 * S]) {
			expect(gainAt(ev, at + 0.006)).toBeCloseTo(0.2, 1);
			expect(gainAt(ev, at + 3.95 * S)).toBeCloseTo(1);
			expect(gainAt(ev, at + 1.2 * S)).toBeGreaterThan(0.5); // most of the way back early on
		}
		// a lone hit: back within a beat
		const one = bar('duck', 0.8, 0, hits.map((_, i) => i === 0));
		expect(gainAt(one, 4 * S)).toBeCloseTo(1);
	});

	it('slot 1\'s hits: steps on at a velocity above 0, none while muted', () => {
		const row = { steps: [true, false, true, true], velocities: [1, 1, 0, 0.5] };
		expect(duckHits(row, false, 4)).toEqual([true, false, false, true]);
		expect(duckHits(row, true, 4)).toEqual([false, false, false, false]);
		expect(duckHits(undefined, false, 2)).toEqual([false, false]);
	});

	it('applies events in time order, skipping ones before the last applied, and goes back to full', () => {
		const calls: [string, number, number][] = [];
		const param = {
			setValueAtTime: (v: number, t: number) => calls.push(['set', v, t]),
			linearRampToValueAtTime: (v: number, t: number) => calls.push(['ramp', v, t]),
		} as unknown as AudioParam;
		let last = applyPulse(param, 10, [{ at: 0, v: 0.5, set: true }, { at: 0.1, v: 0.2 }], { t: 0, v: 1 });
		expect(last).toEqual({ t: 10.1, v: 0.2 });
		last = applyPulse(param, 10, [{ at: 0.05, v: 1, set: true }, { at: 0.2, v: 1 }], last);
		expect(calls).toEqual([['set', 0.5, 10], ['ramp', 0.2, 10.1], ['ramp', 1, 10.2]]);
		calls.length = 0;
		last = releasePulse(param, 11, { t: 10.2, v: 0.3 });
		expect(calls).toEqual([['set', 0.3, 11], ['ramp', 1, 11 + PULSE_EDGE_S]]);
		expect(releasePulse(param, 12, last)).toBe(last);
	});

	it('is saved with Drift\'s sound; a sound saved before it has none', () => {
		const d = createDrift();
		Object.assign(d, { pulseMode: 'duck', pulseDepth: 0.5 });
		const e = createDrift();
		applyDrift(e, JSON.parse(JSON.stringify(driftSnapshot(d))));
		expect([e.pulseMode, e.pulseDepth]).toEqual(['duck', 0.5]);
		applyDrift(e, { sound: { voices: 4 } });
		expect([e.pulseMode, e.pulseDepth]).toEqual(['off', 0.7]);
		applyDrift(e, { sound: { pulseMode: '1/3', pulseDepth: -1 } });
		expect([e.pulseMode, e.pulseDepth]).toEqual(['off', 0]);
	});
});

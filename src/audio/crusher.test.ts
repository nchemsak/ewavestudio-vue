import { describe, expect, it } from 'vitest';
import { crushBlock, crushSettings, CRUSH_BITS_MAX, CRUSH_BITS_MIN, type CrushState } from './crusher';

const run = (input: number[][], bits: number, hold: number, st: CrushState = { phase: 0, held: [] }) => {
	const ins = input.map(ch => Float32Array.from(ch));
	const outs = input.map(ch => new Float32Array(ch.length));
	crushBlock(st, ins, outs, bits, hold);
	return outs.map(o => Array.from(o));
};

describe('crushSettings', () => {
	it('goes from 8 bits at 12 kHz to 4 bits at 3 kHz as DRIVE goes up', () => {
		expect(crushSettings(0, 48000)).toEqual({ bits: CRUSH_BITS_MAX, hold: 4 });
		expect(crushSettings(1, 48000)).toEqual({ bits: CRUSH_BITS_MIN, hold: 16 });
		const mid = crushSettings(0.5, 48000);
		expect(mid.bits).toBe(6);
		expect(mid.hold).toBeCloseTo(8, 9); // 6 kHz: halfway on a log scale
	});

	it('keeps DRIVE to 0..1 and holds at least one sample', () => {
		expect(crushSettings(-1, 48000)).toEqual(crushSettings(0, 48000));
		expect(crushSettings(5, 48000)).toEqual(crushSettings(1, 48000));
		expect(crushSettings(NaN, 48000)).toEqual(crushSettings(0, 48000));
		expect(crushSettings(0, 8000).hold).toBe(1);
	});
});

describe('crushBlock', () => {
	it('rounds to the nearest level, so quiet sound falls to silence', () => {
		// 2 bits: levels every 0.5
		const [out] = run([[0.1, 0.3, -0.3, 0.74, 0.76, 1, -1, -0.24]], 2, 1);
		expect(out).toEqual([0, 0.5, -0.5, 0.5, 1, 1, -1, 0]);
		expect(Object.is(out[7], -0)).toBe(false);
	});

	it('holds each value for `hold` samples, carrying the phase across blocks', () => {
		const st: CrushState = { phase: 0, held: [] };
		const ramp = (from: number) => Array.from({ length: 4 }, (_, i) => (from + i) / 16);
		const a = run([ramp(0)], 16, 3, st)[0];
		const b = run([ramp(4)], 16, 3, st)[0];
		const levels = (x: number) => Math.round(x * 2 ** 15) / 2 ** 15;
		expect([...a, ...b]).toEqual([0, 0, 0, 3, 3, 3, 6, 6].map(i => levels(i / 16)));
	});

	it('averages a fractional hold', () => {
		const n = 1000;
		const input = [Array.from({ length: n }, (_, i) => i / n)]; // a new level every sample
		const out = run(input, 16, 2.5)[0];
		let changes = 0;
		for (let i = 1; i < n; i++) if (out[i] !== out[i - 1]) changes++;
		expect(changes).toBeGreaterThanOrEqual(n / 2.5 - 2);
		expect(changes).toBeLessThanOrEqual(n / 2.5);
	});

	it('crushes each channel on its own, a missing one following channel 0', () => {
		const st: CrushState = { phase: 0, held: [] };
		const ins = [Float32Array.from([0.5, 0.5]), Float32Array.from([-0.5, -0.5])];
		const outs = [new Float32Array(2), new Float32Array(2)];
		crushBlock(st, ins, outs, 8, 1);
		expect(Array.from(outs[0])).toEqual([0.5, 0.5]);
		expect(Array.from(outs[1])).toEqual([-0.5, -0.5]);
		const mono = [new Float32Array(2), new Float32Array(2)];
		crushBlock({ phase: 0, held: [] }, [ins[0]], mono, 8, 1);
		expect(Array.from(mono[1])).toEqual([0.5, 0.5]);
		const silent = [new Float32Array(2)];
		crushBlock({ phase: 0, held: [] }, [], silent, 8, 1);
		expect(Array.from(silent[0])).toEqual([0, 0]);
	});

	it('is self-contained, so the worklet can be built from its source', () => {
		const fn = new Function(`return (${crushBlock.toString()})`)() as typeof crushBlock;
		const out = [new Float32Array(3)];
		fn({ phase: 0, held: [] }, [Float32Array.from([0.3, 0.6, 0.9])], out, 2, 1);
		expect(Array.from(out[0])).toEqual([0.5, 0.5, 1]);
	});
});

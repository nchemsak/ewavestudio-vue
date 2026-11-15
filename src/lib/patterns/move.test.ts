import { describe, it, expect } from 'vitest';
import { moveList, moveSource, MOVED_LANE_FIELDS } from './move';

const bar = Array.from({ length: 16 }, (_, i) => i);

describe('Move (rotate and reverse)', () => {
	it('rotates right: every step one later, the last round to the first', () => {
		expect(moveList(bar, 'right')).toEqual([15, ...bar.slice(0, 15)]);
	});
	it('rotates left: every step one earlier, the first round to the last', () => {
		expect(moveList(bar, 'left')).toEqual([...bar.slice(1), 0]);
	});
	it('left undoes right, and sixteen moves come back round', () => {
		expect(moveList(moveList(bar, 'right'), 'left')).toEqual(bar);
		let x: number[] = bar;
		for (let k = 0; k < 16; k++) x = moveList(x, 'right') as number[];
		expect(x).toEqual(bar);
	});
	it('reverses, and twice is the pattern again', () => {
		expect(moveList(bar, 'reverse')).toEqual([...bar].reverse());
		expect(moveList(moveList(bar, 'reverse'), 'reverse')).toEqual(bar);
	});
	it('keeps a missing list missing, and works on any length', () => {
		expect(moveList(null, 'left')).toBeNull();
		expect(moveList(undefined, 'reverse')).toBeUndefined();
		expect(moveList(['a', 'b', 'c'], 'right')).toEqual(['c', 'a', 'b']);
		expect(moveSource('right', 0, 32)).toBe(31);
	});
	it('names every per-step list of the synth lane', () => {
		expect([...MOVED_LANE_FIELDS].sort()).toEqual(['pitches', 'ratchets', 'repeatNotes', 'steps', 'velocities', 'waveforms']);
	});
});

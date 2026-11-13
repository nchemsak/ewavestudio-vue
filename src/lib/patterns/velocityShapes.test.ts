import { describe, it, expect } from 'vitest';
import { VELOCITY_SHAPES, velocityShape } from './velocityShapes';

describe('Humanize velocity shapes', () => {
	it('has the six shapes, in the order of the buttons', () => {
		expect(VELOCITY_SHAPES.map((s) => s.label)).toEqual(['Peaks', 'Stairs', 'Ramp', 'dNb', 'Random', 'Reset']);
	});

	it('gives one velocity per step, as Pattern Tools always did', () => {
		expect(velocityShape('peaks', 8)).toEqual([1, 0.55, 0.25, 0.55, 1, 0.55, 0.25, 0.55]);
		expect(velocityShape('stairs', 4)).toEqual([1, 0.75, 0.5, 0.25]);
		const ramp = velocityShape('ramp', 16);
		expect(ramp[0]).toBeCloseTo(1);
		expect(ramp[15]).toBeCloseTo(1);
		expect(Math.min(...ramp)).toBeGreaterThanOrEqual(0.2);
		expect(velocityShape('dnb', 16)[6]).toBe(0.9);
		expect(velocityShape('reset', 16)).toEqual(Array(16).fill(1));
	});

	it('keeps Random between 0.15 and 1', () => {
		expect(velocityShape('random', 3, () => 0)).toEqual([0.15, 0.15, 0.15]);
		expect(velocityShape('random', 1, () => 0.999999)[0]).toBeCloseTo(1, 5);
	});
});

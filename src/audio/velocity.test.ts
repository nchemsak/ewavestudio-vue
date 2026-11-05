import { describe, it, expect } from 'vitest';
import {
	velocityFactor, routeVelocity, routedCutoff, routedSemitones, routedNoise, velocityRoutingActive,
	VELOCITY_ROUTING_DEFAULT,
} from './velocity';

describe('velocity routing', () => {
	it('leaves full-velocity steps exactly as the panel says', () => {
		const n = routeVelocity({ decay: 100, cutoff: 100, pitchEnv: -100, noise: 60 }, 1);
		expect(n).toEqual({ decayFactor: 1, cutoffOctaves: -0, pitchEnvFactor: 1, noiseFactor: 1 });
	});

	it('changes nothing with every amount at 0 (the default), at any velocity', () => {
		for (const v of [0, 0.3, 1]) {
			expect(routeVelocity(VELOCITY_ROUTING_DEFAULT, v)).toEqual({ decayFactor: 1, cutoffOctaves: -0, pitchEnvFactor: 1, noiseFactor: 1 });
			expect(routeVelocity(undefined, v).decayFactor).toBe(1);
		}
		expect(velocityRoutingActive(VELOCITY_ROUTING_DEFAULT)).toBe(false);
		expect(velocityRoutingActive({ ...VELOCITY_ROUTING_DEFAULT, noise: -5 })).toBe(true);
	});

	it('right of centre: softer steps get less; left: more', () => {
		expect(velocityFactor(100, 0.5)).toBe(0.5);  // half velocity, full amount: half
		expect(velocityFactor(50, 0.5)).toBe(0.75);
		expect(velocityFactor(100, 0)).toBe(0);
		expect(velocityFactor(-100, 0.5)).toBe(1.5);
		expect(velocityFactor(-100, 0)).toBe(2);       // at most twice
		expect(velocityFactor(500, 0.5)).toBe(0.5);   // amounts kept to ±100 %
	});

	it('moves Cutoff by up to 2 octaves: soft steps darker (or brighter, left of centre)', () => {
		const half = routeVelocity({ cutoff: 100 }, 0.5);
		expect(half.cutoffOctaves).toBe(-1);
		expect(routedCutoff(2000, half)).toBe(1000);
		expect(routedCutoff(2000, routeVelocity({ cutoff: 100 }, 0.2))).toBeCloseTo(2000 / 2 ** 1.6, 6);
		expect(routedCutoff(2000, routeVelocity({ cutoff: -100 }, 0.5))).toBe(4000);
		expect(routedCutoff(15000, routeVelocity({ cutoff: -100 }, 0))).toBe(20000); // kept within 20 Hz–20 kHz
	});

	it('scales Decay, the pitch envelope and the noise mix, within their limits', () => {
		expect(routeVelocity({ decay: 100 }, 0).decayFactor).toBe(0.05); // never a silent click
		expect(routeVelocity({ decay: 100 }, 0.5).decayFactor).toBe(0.5);
		expect(routedSemitones(24, routeVelocity({ pitchEnv: 100 }, 0.25))).toBe(6);
		expect(routedSemitones(36, routeVelocity({ pitchEnv: -100 }, 0))).toBe(48); // the knob's maximum
		expect(routedNoise(0.4, routeVelocity({ noise: 100 }, 0.5))).toBeCloseTo(0.2);
		expect(routedNoise(0.8, routeVelocity({ noise: -100 }, 0))).toBe(1);
	});
});

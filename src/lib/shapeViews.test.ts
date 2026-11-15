import { describe, it, expect } from 'vitest';
import {
	timeX, xTime, ENV_MAX_MS, envelopePts, pitchY, yPitch, pitchPts, freqX, xFreq, filterY, filterPts, yResonance,
	fmPts, voicePts, voiceDots, toPath,
} from './shapeViews';

describe("the cards' pictures", () => {
	it('time: a drag maps back to the time it shows, and short times get room', () => {
		for (const ms of [1, 20, 400, 2000]) expect(xTime(timeX(ms, 120, ENV_MAX_MS), 120, ENV_MAX_MS)).toBeCloseTo(ms, 5);
		expect(timeX(20, 120, ENV_MAX_MS)).toBeGreaterThan(10); // a 20 ms attack isn't a hairline
	});

	it('the envelope peaks at Attack and has nearly died away at Attack + Decay', () => {
		const pts = envelopePts(20, 400, 120, 80);
		const peak = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
		expect(peak[0]).toBeCloseTo(timeX(20, 120, ENV_MAX_MS));
		const atDecay = pts.find((p) => p[0] >= timeX(420, 120, ENV_MAX_MS))!;
		expect(atDecay[1]).toBeGreaterThan(80 - 2 - 78 * 0.05); // under 5 % of full left
	});

	it('the pitch sweep starts Amount away, above or below, and settles on the note', () => {
		expect(pitchPts(24, 200, 100, 80)[0][1]).toBeCloseTo(pitchY(24, 80));
		expect(pitchPts(24, 200, 100, 80)[0][1]).toBeLessThan(40);
		expect(pitchPts(-24, 200, 100, 80)[0][1]).toBeGreaterThan(40);
		expect(pitchPts(24, 200, 100, 80).at(-1)![1]).toBeCloseTo(40, 1);
		expect(pitchPts(0, 200, 100, 80).every((p) => p[1] === 40)).toBe(true);
		expect(yPitch(pitchY(-12, 80), 80)).toBeCloseTo(-12);
		expect(yPitch(-50, 80)).toBe(48);
	});

	it('the filter: flat below the cutoff, a peak there that grows with resonance, falling above', () => {
		for (const hz of [100, 1000, 10000]) expect(xFreq(freqX(hz, 200), 200)).toBeCloseTo(hz, 3);
		const flat = filterY(50, 1000, 0.7, 80);
		expect(flat).toBeCloseTo(80 * 0.42, 0);
		expect(filterY(1000, 1000, 8, 80)).toBeLessThan(filterY(1000, 1000, 2, 80)); // a higher peak
		expect(filterY(8000, 1000, 2, 80)).toBeGreaterThan(flat); // quieter above
		expect(filterPts(1000, 2, 200, 80)).toHaveLength(81);
		expect(yResonance(0, 80, 0.1, 20)).toBeCloseTo(20);
		expect(yResonance(80, 80, 0.1, 20)).toBeCloseTo(0.1);
	});

	it('FM: a plain sine at Amount 0, bent more as Amount grows', () => {
		const plain = fmPts(2, 0, 100, 60), bent = fmPts(2, 12, 100, 60);
		expect(plain[30][1]).toBeCloseTo(30 - Math.sin((30 / 240) * 4 * Math.PI) * 23);
		expect(bent.some((p, i) => Math.abs(p[1] - plain[i][1]) > 5)).toBe(true);
	});

	it('Unison: a wave per voice, alike at Detune 0, apart with Detune; dots spread with Spread', () => {
		expect(voicePts(3, 0, 100, 60)).toHaveLength(3);
		expect(toPath(voicePts(3, 0, 100, 60)[0])).toBe(toPath(voicePts(3, 0, 100, 60)[2]));
		expect(toPath(voicePts(3, 40, 100, 60)[0])).not.toBe(toPath(voicePts(3, 40, 100, 60)[2]));
		expect(voiceDots(3, 0, 100)).toEqual([50, 50, 50]);
		expect(voiceDots(3, 100, 100)).toEqual([8, 50, 92]);
		expect(voiceDots(1, 100, 100)).toEqual([50]);
	});
});

import { describe, it, expect } from 'vitest';
import {
	encodeSample, decodeSample, sampleFrom, sampleSeconds, trimRecording,
	MIN_LEVEL, ONSET_SHARE, PRE_ROLL_S, SAMPLE_MAX_S, FADE_S,
} from './sample';

const SR = 48000;

describe('a recorded sound', () => {
	it('is kept as 16-bit PCM in base64, and read back within a step of 16 bits', () => {
		const x = Float32Array.from({ length: 1001 }, (_, i) => Math.sin(i / 7) * 0.9);
		x[0] = 1; x[1] = -1; x[2] = 1.5; // full scale both ways; beyond it, clipped
		const data = encodeSample(x);
		expect(data).toMatch(/^[A-Za-z0-9+/]+=*$/);
		expect(data.length).toBe(Math.ceil((x.length * 2) / 3) * 4);
		const back = decodeSample(data);
		expect(back.length).toBe(x.length);
		expect(back[0]).toBe(1);
		expect(back[1]).toBe(-1);
		expect(back[2]).toBe(1);
		for (let i = 3; i < x.length; i++) expect(Math.abs(back[i] - x[i])).toBeLessThan(1 / 32000);
		expect(sampleSeconds({ data, sampleRate: SR })).toBeCloseTo(x.length / SR, 6);
	});

	it('is checked when a project loads', () => {
		const data = encodeSample(new Float32Array([0.1, 0.2]));
		expect(sampleFrom({ data, sampleRate: SR })).toEqual({ data, sampleRate: SR });
		expect(sampleFrom(null)).toBeNull();
		expect(sampleFrom({ data: '', sampleRate: SR })).toBeNull();
		expect(sampleFrom({ data: 'not base64!', sampleRate: SR })).toBeNull();
		expect(sampleFrom({ data, sampleRate: 'fast' })).toBeNull();
		expect(sampleFrom({ data, sampleRate: 10 })).toBeNull();
	});

	it('starts where the sound does, ends where it has faded, at full scale', () => {
		const n = SR * 3;
		const x = new Float32Array(n);
		const onset = SR * 1; // a second of near-silence first
		for (let i = 0; i < onset; i++) x[i] = (i % 2 ? 1 : -1) * 0.005; // a quiet room
		// A hit: 0.4 at its start, decaying, gone after 0.3 s
		for (let i = 0; i < SR * 0.3; i++) x[onset + i] = 0.4 * Math.exp(-i / (SR * 0.03)) * Math.sin(i / 10);
		const out = trimRecording(x, SR)!;
		// From PRE_ROLL_S before its first sample within 20 dB of its peak (a few samples into the hit)
		const xPeak = peakOf(x);
		const found = x.findIndex((v) => Math.abs(v) >= xPeak * ONSET_SHARE);
		expect(found - onset).toBeGreaterThanOrEqual(0);
		expect(found - onset).toBeLessThan(20);
		const start = found - Math.round(PRE_ROLL_S * SR);
		for (const k of [0, 100, 300, 1000]) expect(out[k]).toBeCloseTo(x[start + k] / peakOf(x), 4);
		expect(peakOf(out)).toBeCloseTo(1, 5);
		expect(out.length / SR).toBeLessThan(0.3 + FADE_S + PRE_ROLL_S);
		expect(out.length / SR).toBeGreaterThan(0.15);
		expect(out[out.length - 1]).toBe(0); // faded out
	});

	it('is at most a second long, and silence is no recording', () => {
		const loud = Float32Array.from({ length: SR * 3 }, (_, i) => Math.sin(i / 20) * 0.5);
		expect(trimRecording(loud, SR)!.length).toBe(SAMPLE_MAX_S * SR);
		expect(trimRecording(new Float32Array(SR).fill(MIN_LEVEL / 2), SR)).toBeNull();
	});

	it('is found however quietly it came in (PR 96: an interface\'s input at −40 dBFS was "nothing")', () => {
		const x = new Float32Array(SR);
		const onset = SR / 4;
		for (let i = 0; i < SR / 4; i++) x[onset + i] = 0.01 * Math.exp(-i / (SR * 0.03)) * Math.sin(i / 10);
		const out = trimRecording(x, SR)!;
		expect(out).not.toBeNull();
		expect(peakOf(out)).toBeCloseTo(1, 5);
		expect(out.length / SR).toBeLessThan(0.3); // from the hit, not the quarter second before it
	});
});

function peakOf(x: Float32Array) {
	let p = 0;
	for (const v of x) p = Math.max(p, Math.abs(v));
	return p;
}

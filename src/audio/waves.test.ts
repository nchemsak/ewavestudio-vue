import { describe, it, expect } from 'vitest';
import {
	WAVE_IDS, isWave, waveGain, harmonicCycle, HARMONICS, pulseOffset, lfoPwmTapGain,
	createVoiceSource, PULSE_WIDTH_DEFAULT, PULSE_WIDTH_MAX, foldPulseWidth,
} from './waves';

const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

describe('waves', () => {
	it('lists eight waves, and knows them by name', () => {
		expect(WAVE_IDS).toEqual(['sine', 'triangle', 'sawtooth', 'square', 'pulse', 'organ', 'hollow', 'glass']);
		expect(isWave('glass')).toBe(true);
		expect(isWave('custom')).toBe(false);
	});

	it('keeps the old balance for the four oscillator waves; the pulse matches the square', () => {
		expect(waveGain('sine')).toBe(1);
		expect(waveGain('triangle')).toBe(1);
		expect(waveGain('sawtooth')).toBeCloseTo(0.708, 3);
		expect(waveGain('square')).toBeCloseTo(0.501, 3);
		expect(waveGain('pulse')).toBe(waveGain('square'));
		expect(waveGain('something-new')).toBe(1);
	});

	it('balances the harmonic shapes to the sine (never above 1)', () => {
		for (const w of ['organ', 'hollow', 'glass'] as const) {
			const cycle = harmonicCycle(HARMONICS[w]);
			expect(Math.max(...cycle.map(Math.abs))).toBeCloseTo(1, 5); // peak-normalized
			const g = waveGain(w);
			expect(g).toBeLessThanOrEqual(1);
			// as loud as a sine (RMS 0.707), unless that would need a boost
			if (g < 1) expect(rms(cycle) * g).toBeCloseTo(Math.SQRT1_2, 3);
		}
	});
});

describe('pulse wave', () => {
	// What the comparator network does to one cycle of a sawtooth: the share of the cycle that's
	// high, and the level after the DC is cancelled
	function pulseCycle(widthPct: number, n = 10000) {
		const off = pulseOffset(widthPct);
		let high = 0, sum = 0;
		for (let i = 0; i < n; i++) {
			const saw = (i / n) * 2 - 1;
			const out = Math.tanh((saw + off) * 40) - off;
			if (saw + off > 0) high++;
			sum += out;
		}
		return { high: high / n, mean: sum / n };
	}

	it('is high for Width % of each cycle, and centred on 0 (no DC)', () => {
		for (const w of [5, 25, 40, 50]) {
			const c = pulseCycle(w);
			expect(c.high).toBeCloseTo(w / 100, 2);
			expect(Math.abs(c.mean)).toBeLessThan(0.02);
		}
		// Above 50% (older projects): played as its mirror, which sounds the same
		expect(pulseCycle(80).high).toBeCloseTo(0.2, 2);
		expect(pulseOffset(50)).toBe(0); // 50% is the square
		expect(pulseOffset(0)).toBe(pulseOffset(5)); // kept to 5–50%
		expect(pulseOffset(75)).toBe(pulseOffset(25)); // the mirror sounds the same
	});

	it('mirrors a width above 50% (an upside-down pulse sounds the same)', () => {
		expect(foldPulseWidth(75)).toBe(25);
		expect(foldPulseWidth(95)).toBe(5);
		expect(foldPulseWidth(50)).toBe(50);
		expect(foldPulseWidth(30)).toBe(30);
		expect(foldPulseWidth(1)).toBe(5);
	});

	it('limits the LFO\'s width swing to 5–95%', () => {
		expect(lfoPwmTapGain(50, 20)).toBeCloseTo(0.02); // ±20% width → ±0.4 offset
		expect(lfoPwmTapGain(20, 30) * 30).toBeCloseTo(0.3); // only 15% of room: ±15%
		expect(lfoPwmTapGain(50, 0)).toBe(0);
	});

	it('builds a sawtooth into the comparator for "pulse", a plain oscillator otherwise', () => {
		const made: string[] = [];
		const node = (kind: string, extra: any = {}) => {
			made.push(kind);
			return { kind, connect(n: any) { return n; }, start() {}, stop() {}, ...extra };
		};
		const ctx: any = {
			createOscillator: () => node('osc', { type: 'sine', setPeriodicWave(w: any) { this.periodic = w; } }),
			createConstantSource: () => node('const', { offset: { value: 0 } }),
			createGain: () => node('gain', { gain: { value: 1 } }),
			createWaveShaper: () => node('shaper'),
			createPeriodicWave: () => ({ periodic: true }),
		};
		const pulse = createVoiceSource(ctx, 'pulse', 25);
		expect((pulse.osc as any).type).toBe('sawtooth');
		expect(pulse.width).toEqual({ value: -0.5 });
		expect(made).toContain('shaper');
		const saw = createVoiceSource(ctx, 'sawtooth');
		expect((saw.osc as any).type).toBe('sawtooth');
		expect(saw.output).toBe(saw.osc);
		expect(saw.width).toBeNull();
		expect((createVoiceSource(ctx, 'organ').osc as any).periodic).toEqual({ periodic: true });
		expect((createVoiceSource(ctx, 'nonsense').osc as any).type).toBe('sine');
		expect(PULSE_WIDTH_DEFAULT).toBe(50);
		expect(PULSE_WIDTH_MAX).toBe(50); // the knob goes from 5% (thinnest) to the square
	});
});

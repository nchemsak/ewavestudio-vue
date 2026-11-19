import { describe, expect, it } from 'vitest';
import { clampPreDelayMs, preDelayDetents, preDelayLabel, PRE_DELAY_MAX_MS } from './preDelay';

describe('reverb pre-delay', () => {
	it('keeps a saved value to whole ms within 0–250; anything else is 0', () => {
		expect(clampPreDelayMs(40)).toBe(40);
		expect(clampPreDelayMs(40.4)).toBe(40);
		expect(clampPreDelayMs(-5)).toBe(0);
		expect(clampPreDelayMs(900)).toBe(PRE_DELAY_MAX_MS);
		expect(clampPreDelayMs(undefined)).toBe(0);
		expect(clampPreDelayMs('30')).toBe(0);
		expect(clampPreDelayMs(NaN)).toBe(0);
	});

	it('has notches at 1/64 and 1/32 of a bar at the tempo', () => {
		expect(preDelayDetents(120)).toEqual([{ ms: 31, label: '1/64' }, { ms: 63, label: '1/32' }]);
		expect(preDelayDetents(60)).toEqual([{ ms: 63, label: '1/64' }, { ms: 125, label: '1/32' }]);
		// At the slowest tempo 1/32 would be past the knob's end
		expect(preDelayDetents(20).map((d) => d.label)).toEqual(['1/64']);
	});

	it('names a notch it sits on', () => {
		expect(preDelayLabel(31, 120)).toBe('31 ms (1/64)');
		expect(preDelayLabel(40, 120)).toBe('40 ms');
		expect(preDelayLabel(0, 120)).toBe('0 ms');
	});
});

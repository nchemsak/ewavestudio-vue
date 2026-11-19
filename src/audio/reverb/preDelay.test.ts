import { describe, expect, it } from 'vitest';
import { ref, nextTick } from 'vue';
import {
	clampPreDelayMs, followPreDelay, isPreDivision, preDelayLabel, preDelayMs, preDivisionForMs, PRE_DELAY_MAX_MS, PRE_DIVISIONS,
} from './preDelay';

describe('reverb pre-delay', () => {
	it('is a note value at the tempo, Off to 1/8', () => {
		expect(PRE_DIVISIONS.map((d) => d.label)).toEqual(['Off', '1/64', '1/32', '1/16T', '1/16', '1/16.', '1/8']);
		expect(PRE_DIVISIONS.map((d) => Math.round(preDelayMs(120, d.label)))).toEqual([0, 31, 63, 83, 125, 188, 250]);
		expect(preDelayMs(60, '1/8')).toBe(500);
		// The longest, 1/8 at the slowest tempo, is the DelayNodes' length
		expect(preDelayMs(20, '1/8')).toBe(PRE_DELAY_MAX_MS);
		expect(preDelayMs(120, 'nonsense')).toBe(0);
		expect(isPreDivision('1/16.')).toBe(true);
		expect(isPreDivision('1/4')).toBe(false);
	});

	it('keeps an engine value within 0–1500 ms', () => {
		expect(clampPreDelayMs(40.5)).toBe(40.5);
		expect(clampPreDelayMs(-5)).toBe(0);
		expect(clampPreDelayMs(9000)).toBe(PRE_DELAY_MAX_MS);
		expect(clampPreDelayMs(undefined)).toBe(0);
		expect(clampPreDelayMs('30')).toBe(0);
	});

	it('gives a time in ms (PR 103) the nearest note value', () => {
		expect(preDivisionForMs(0, 120)).toBe('Off');
		expect(preDivisionForMs(undefined, 120)).toBe('Off');
		expect(preDivisionForMs(31, 120)).toBe('1/64');
		expect(preDivisionForMs(80, 120)).toBe('1/16T');
		expect(preDivisionForMs(250, 120)).toBe('1/8');
		expect(preDivisionForMs(250, 60)).toBe('1/16');
	});

	it('names the value and its time', () => {
		expect(preDelayLabel(120, 'Off')).toBe('Off');
		expect(preDelayLabel(120, '1/16')).toBe('1/16 · 125 ms');
		expect(preDelayLabel(120, '1/16.')).toBe('1/16. · 188 ms');
	});

	it('keeps the time in step with the tempo and the value, at once', async () => {
		const tempo = ref(120), division = ref('1/16'), ms = ref(0);
		followPreDelay({ tempo, division, ms });
		expect(ms.value).toBe(125);
		tempo.value = 60;
		expect(ms.value).toBe(250);
		division.value = 'Off';
		expect(ms.value).toBe(0);
		await nextTick();
	});
});

import { describe, it, expect } from 'vitest';
import { meterLeds } from './meter';

describe('the rail meters', () => {
	it('lights an LED per 6 dB from −42 dBFS, all eight at −3 dBFS', () => {
		expect(meterLeds(0)).toBe(0);
		expect(meterLeds(NaN)).toBe(0);
		expect(meterLeds(0.005)).toBe(0); // −46 dB
		expect(meterLeds(0.01)).toBe(1);  // −40 dB
		expect(meterLeds(0.52)).toBe(7);  // −5.7 dB
		expect(meterLeds(0.49)).toBe(6);  // −6.2 dB
		expect(meterLeds(0.71)).toBe(8);
		expect(meterLeds(2)).toBe(8);
	});
});

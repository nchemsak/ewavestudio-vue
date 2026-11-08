import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import {
	DELAY_DIVISIONS,
	DEFAULT_DELAY_TIME,
	divisionForTime,
	followDelaySync,
	isDelayDivision,
	syncedDelaySeconds,
} from './delaySync';

describe('synced delay time', () => {
	it('is the division at the tempo', () => {
		expect(syncedDelaySeconds(80, '1/8.')).toBe(0.5625);
		expect(DEFAULT_DELAY_TIME).toBe(0.375); // dotted 1/8 at 120 BPM, the starting tempo
		expect(syncedDelaySeconds(120, '1/4')).toBe(0.5);
		expect(syncedDelaySeconds(120, '1/16')).toBe(0.125);
		expect(syncedDelaySeconds(120, 'nonsense')).toBe(syncedDelaySeconds(120, '1/8.'));
		expect(syncedDelaySeconds(10, '1/4.')).toBe(5); // the DelayNode's maximum
	});

	it('finds the division of a saved time', () => {
		for (const d of DELAY_DIVISIONS) expect(divisionForTime(syncedDelaySeconds(97, d.label), 97)).toBe(d.label);
		expect(divisionForTime(0.2, 80)).toBeNull();
		expect(divisionForTime(0, 80)).toBeNull();
		expect(isDelayDivision('1/8.')).toBe(true);
		expect(isDelayDivision('1/3')).toBe(false);
		expect(isDelayDivision(3)).toBe(false);
	});

	it('follows the tempo and division while sync is on', () => {
		const r = { tempo: ref(80), division: ref('1/8.'), sync: ref(true), time: ref(0.2) };
		const stop = followDelaySync(r);
		expect(r.time.value).toBe(0.5625); // right away
		r.tempo.value = 120;
		expect(r.time.value).toBe(0.375);
		r.division.value = '1/4';
		expect(r.time.value).toBe(0.5);
		r.sync.value = false;
		r.tempo.value = 60;
		r.time.value = 0.3;
		expect(r.time.value).toBe(0.3); // free time while sync is off
		r.sync.value = true;
		expect(r.time.value).toBe(1);
		stop();
	});
});

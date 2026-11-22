import { describe, expect, it } from 'vitest';
import { applyDrift, chordsFrom, createDrift, driftSnapshot, DRIFT_DEFAULTS, resetDrift, togglePlate } from './drift';

describe('the Drift machine\'s settings', () => {
	it('start at the factory sound, nothing held, 4 bars', () => {
		const d = createDrift();
		expect(d.voices).toBe(DRIFT_DEFAULTS.voices);
		expect(d.length).toBe(4);
		expect(d.chords).toHaveLength(8);
		expect(d.chords.flat().some(Boolean)).toBe(false);
	});

	it('save and load back, keeping values within their ranges', () => {
		const d = createDrift();
		togglePlate(d, 2, 3);
		Object.assign(d, { voices: 7, cutoff: 500, attack: 2, level: 0.3, pedals: 0.1, length: 8, muted: true });
		const e = createDrift();
		applyDrift(e, JSON.parse(JSON.stringify(driftSnapshot(d))));
		expect(driftSnapshot(e)).toEqual(driftSnapshot(d));
		expect(e.chords[2][3]).toBe(true);

		applyDrift(e, { sound: { voices: 40, cutoff: 1, attack: 'x' }, length: 5, level: 9 });
		expect(e.voices).toBe(7);
		expect(e.cutoff).toBe(150);
		expect(e.attack).toBe(2);
		expect(e.length).toBe(4);
		expect(e.level).toBe(1);
	});

	it('read damaged chords as nothing held', () => {
		expect(chordsFrom('no').flat().some(Boolean)).toBe(false);
		expect(chordsFrom([[true, 'yes', 1], null])[0]).toEqual([true, false, false, false, false, false]);
	});

	it('go back to the factory on File → New', () => {
		const d = createDrift();
		togglePlate(d, 0, 0);
		d.voices = 3;
		resetDrift(d);
		expect(d.voices).toBe(DRIFT_DEFAULTS.voices);
		expect(d.chords[0][0]).toBe(false);
	});
});

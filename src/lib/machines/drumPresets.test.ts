import { describe, it, expect } from 'vitest';
import {
	DRUM_KITS, DRUM_PATTERNS, drumKitKey, drumRowsFrom, drumRowsKey, kitSlots, randomDrumKit, randomDrumPattern,
} from './drumPresets';
import { createDrums } from './drums';
import { DRUM_RANGES, FACTORY_KIT, KIT_IDS } from '../../audio/drums';
import { seededRandom } from '../random';

describe('the Drums machine\'s kits', () => {
	it('are six, labels short enough for the buttons, each slot\'s values within the knobs\' ranges', () => {
		expect(DRUM_KITS).toHaveLength(6);
		for (const p of DRUM_KITS) {
			expect(p.label.length).toBeLessThanOrEqual(8);
			expect(p.slots).toHaveLength(4);
			for (const s of p.slots) {
				expect(KIT_IDS).toContain(s.sound);
				expect(s.tune).toBeGreaterThanOrEqual(DRUM_RANGES.tune[0]);
				expect(s.tune).toBeLessThanOrEqual(DRUM_RANGES.tune[1]);
				expect(s.decay).toBeGreaterThanOrEqual(DRUM_RANGES.decay[0]);
				expect(s.decay).toBeLessThanOrEqual(1);
				expect(s.level).toBeGreaterThan(0);
				expect(s.level).toBeLessThanOrEqual(1);
			}
		}
	});

	it('"Kit" is the factory kit, so a fresh page lights it', () => {
		const d = createDrums(16);
		expect(drumKitKey(kitSlots(DRUM_KITS[0], d.slots))).toBe(drumKitKey(d.slots));
	});

	it('a kit sets the sounds, Tune, Decay and Level, and keeps each slot\'s mute', () => {
		const d = createDrums(16);
		d.slots[2].muted = true;
		const s = kitSlots(DRUM_KITS.find((p) => p.id === 'deep')!, d.slots);
		expect(s[0]).toEqual({ sound: 'kit:kick', tune: -5, decay: 1, level: 1, muted: false });
		expect(s[2].muted).toBe(true);
		// Each kit is a different sound
		expect(new Set(DRUM_KITS.map((p) => drumKitKey(kitSlots(p, d.slots)))).size).toBe(6);
	});
});

describe('the Drums machine\'s patterns', () => {
	it('are six, each with a kick on step 1, four rows of 16', () => {
		expect(DRUM_PATTERNS).toHaveLength(6);
		for (const p of DRUM_PATTERNS) {
			expect(p.label.length).toBeLessThanOrEqual(8);
			const rows = drumRowsFrom(p.rows);
			expect(rows).toHaveLength(4);
			expect(rows.every((r) => r.steps.length === 16 && r.velocities.length === 16)).toBe(true);
			expect(rows[0].steps[0]).toBe(true);
			expect(rows.some((r, k) => k > 0 && r.steps.some(Boolean))).toBe(true);
		}
		expect(new Set(DRUM_PATTERNS.map((p) => drumRowsKey(drumRowsFrom(p.rows)))).size).toBe(6);
	});

	it('a step off has full velocity; the key compares the hits only', () => {
		const rows = drumRowsFrom([[[0, 0.5]], [], [], []]);
		expect(rows[0].velocities[0]).toBe(0.5);
		expect(rows[0].velocities[1]).toBe(1);
		const other = drumRowsFrom([[[0, 0.5]], [], [], []]);
		other[0].velocities[5] = 0.2; // a step that's off: not part of the pattern
		expect(drumRowsKey(other)).toBe(drumRowsKey(rows));
	});
});

describe('the Drums machine\'s dice', () => {
	it('500 random kits: values on the knobs\' steps, within their ranges, each slot\'s own sound about half the time, else one of its kind, varied', () => {
		const r = seededRandom(7);
		const keys = new Set<string>();
		let own = 0;
		const seen = new Set<string>();
		for (let i = 0; i < 500; i++) {
			const kit = randomDrumKit(r);
			kit.forEach((s, k) => {
				if (s.sound === FACTORY_KIT[k]) own++;
				seen.add(s.sound);
				// Never the old Metal or Tin hat, and a kick only in slot 1
				expect(['metal', 'hat']).not.toContain(s.sound);
				expect(['kick', 'sub', 'subclick', 'round'].includes(s.sound)).toBe(k === 0);
				expect(Number.isInteger(s.tune)).toBe(true);
				expect(s.tune).toBeGreaterThanOrEqual(-12);
				expect(s.tune).toBeLessThanOrEqual(12);
				expect(s.decay).toBeGreaterThanOrEqual(0.25);
				expect(s.decay).toBeLessThanOrEqual(1);
				expect(Math.round(s.decay * 100)).toBeCloseTo(s.decay * 100, 6);
				expect(s.level).toBeGreaterThanOrEqual(0.4);
				expect(s.level).toBeLessThanOrEqual(1);
			});
			keys.add(drumKitKey(kitSlots({ id: '', label: '', description: '', slots: kit }, createDrums(16).slots)));
		}
		expect(own / 2000).toBeGreaterThan(0.5);
		expect(own / 2000).toBeLessThan(0.75);
		// Every new sound turns up
		for (const id of KIT_IDS) if (id !== 'metal' && id !== 'hat') expect(seen).toContain(id);
		expect(keys.size).toBeGreaterThan(450);
	});

	it('500 random patterns: a kick on step 1, a snare, a hat, velocities in range, varied', () => {
		const r = seededRandom(11);
		const keys = new Set<string>();
		for (let i = 0; i < 500; i++) {
			const rows = drumRowsFrom(randomDrumPattern(r));
			expect(rows[0].steps[0]).toBe(true);
			expect(rows[1].steps.some(Boolean)).toBe(true);
			expect(rows[3].steps.filter(Boolean).length).toBeGreaterThanOrEqual(4);
			for (const row of rows) for (const v of row.velocities) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1); }
			keys.add(drumRowsKey(rows));
		}
		expect(keys.size).toBeGreaterThan(200);
	});
});

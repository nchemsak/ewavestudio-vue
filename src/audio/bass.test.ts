import { describe, it, expect } from 'vitest';
import { bassNoteFromHit, bassNoteShape, bassNotesForBar, bassPlan, bassQ, stepOffset, type BassPattern } from './bass';
import { BASS_DEFAULTS } from '../lib/machines/bass';

function pattern(n: number, on: number[], extra: Partial<Record<'accents' | 'slides' | 'ties', number[]>> = {}): BassPattern {
	const set = (list: number[] = []) => Array.from({ length: n }, (_, i) => list.includes(i));
	return {
		steps: set(on), pitches: Array.from({ length: n }, (_, i) => 50 + i), velocities: Array(n).fill(1),
		accents: set(extra.accents), slides: set(extra.slides), ties: set(extra.ties),
	};
}

describe('bassPlan: what the steps play', () => {
	it('a note on every step that is on, one step long', () => {
		const plan = bassPlan(pattern(8, [0, 3, 5]), 8);
		expect(plan.map((h) => h?.step ?? null)).toEqual([0, null, null, 3, null, 5, null, null]);
		expect(plan[3]).toMatchObject({ freq: 53, steps: 1, glides: [] });
	});

	it('Slide glides into the next step, which does not start again', () => {
		const plan = bassPlan(pattern(8, [0, 1, 4], { slides: [0] }), 8);
		expect(plan[1]).toBeNull();
		expect(plan[0]).toMatchObject({ steps: 2, glides: [{ at: 1, freq: 51 }] });
		expect(plan[4]).toMatchObject({ steps: 1 });
	});

	it('Slide into a step that is off does nothing', () => {
		expect(bassPlan(pattern(8, [0, 4], { slides: [0] }), 8)[0]).toMatchObject({ steps: 1, glides: [] });
	});

	it('Tie holds through the next step, on or off, at the same pitch', () => {
		const plan = bassPlan(pattern(8, [0, 1], { ties: [0] }), 8);
		expect(plan[0]).toMatchObject({ steps: 2, glides: [] });
		expect(plan[1]).toBeNull();
		expect(bassPlan(pattern(8, [2], { ties: [2] }), 8)[2]).toMatchObject({ steps: 2 });
	});

	it('slides and ties chain, and carry round the end of the bar', () => {
		const plan = bassPlan(pattern(8, [6, 7, 0, 3], { slides: [6, 7], ties: [0] }), 8);
		expect(plan[6]).toMatchObject({ steps: 4, glides: [{ at: 1, freq: 57 }, { at: 2, freq: 50 }] });
		expect(plan[7]).toBeNull();
		expect(plan[0]).toBeNull();
		expect(plan[3]).toMatchObject({ steps: 1 });
	});

	it('Tie wins over Slide on one step; accents and velocities ride along', () => {
		const p = pattern(4, [0, 1], { slides: [0], ties: [0], accents: [0] });
		p.velocities[0] = 0.5;
		expect(bassPlan(p, 4)[0]).toMatchObject({ steps: 2, glides: [], accent: true, vel: 0.5 });
	});

	it('a bar tied all the way round still starts on its first step', () => {
		const plan = bassPlan(pattern(4, [1, 2], { ties: [0, 1, 2, 3] }), 4);
		expect(plan.filter(Boolean)).toHaveLength(1);
		expect(plan[1]).toMatchObject({ steps: 4 });
	});
});

describe('timing', () => {
	it('stepOffset counts swing on the swung steps', () => {
		expect(stepOffset(0, 1, 0.1, 0.5)).toBeCloseTo(0.15);
		expect(stepOffset(1, 1, 0.1, 0.5)).toBeCloseTo(0.05);
		expect(stepOffset(0, 2, 0.1, 0.5)).toBeCloseTo(0.2);
	});

	it('a held note holds until its last step starts, and glides there', () => {
		const p = pattern(8, [0, 1, 2], { slides: [0], ties: [1] });
		const [note] = bassNotesForBar(p, 8, 10, 0.125, 0, 0.5);
		expect(note).toMatchObject({ time: 10, freq: 50, amp: 0.5, holdUntil: 10.25 });
		expect(note.glides).toEqual([{ time: 10.125, freq: 51 }]);
	});

	it('bassNoteFromHit: loudness is velocity × level, at most 1', () => {
		const hit = bassPlan(pattern(4, [0]), 4)[0]!;
		expect(bassNoteFromHit({ ...hit, vel: 0.5 }, 0, 0.1, 0, 0.8).amp).toBeCloseTo(0.4);
	});
});

describe('the note', () => {
	it('Accent is louder, opens the filter further and closes it sooner', () => {
		const plain = bassNoteShape(BASS_DEFAULTS, { time: 0 });
		const acc = bassNoteShape(BASS_DEFAULTS, { time: 0, accent: true });
		expect(acc.peak).toBeGreaterThan(plain.peak);
		expect(acc.envOct).toBeGreaterThan(plain.envOct);
		expect(acc.envTc).toBeLessThan(plain.envTc);
	});

	it('a held note ends Decay × 1.6 after its hold', () => {
		const s = bassNoteShape({ ...BASS_DEFAULTS, decayMs: 500 }, { time: 1, holdUntil: 2 });
		expect(s.hold).toBe(2);
		expect(s.end).toBeCloseTo(2.8);
	});

	it('resonance maps to a rising Q', () => {
		expect(bassQ(0)).toBeCloseTo(0.7);
		expect(bassQ(1)).toBeGreaterThan(bassQ(0.5));
	});
});

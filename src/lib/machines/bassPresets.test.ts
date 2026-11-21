import { describe, it, expect } from 'vitest';
import { BASS_PATTERNS, BASS_SOUNDS, bassPatternFrom, bassPatternKey, bassSoundKey, bassSoundOf, foldBassHz, randomBassPattern, randomBassSound } from './bassPresets';
import { BASS_MAX_HZ, BASS_MIN_HZ, BASS_RANGES, bassPlan } from '../../audio/bass';
import { seededRandom } from '../random';

describe('Bass sounds', () => {
	it('six of them, each within the knobs\' ranges, all different', () => {
		expect(BASS_SOUNDS).toHaveLength(6);
		const keys = new Set(BASS_SOUNDS.map((p) => bassSoundKey(bassSoundOf(p.sound))));
		expect(keys.size).toBe(6);
		for (const p of BASS_SOUNDS) {
			const v = bassSoundOf(p.sound);
			for (const [k, [lo, hi]] of Object.entries(BASS_RANGES)) {
				expect((v as any)[k], `${p.id}.${k}`).toBeGreaterThanOrEqual(lo);
				expect((v as any)[k], `${p.id}.${k}`).toBeLessThanOrEqual(hi);
			}
		}
	});

	it('the dice: 300 seeded rolls within the ranges, varied', () => {
		const r = seededRandom(7);
		const rolls = Array.from({ length: 300 }, () => randomBassSound(r));
		for (const v of rolls) {
			for (const [k, [lo, hi]] of Object.entries(BASS_RANGES)) {
				expect((v as any)[k]).toBeGreaterThanOrEqual(lo);
				expect((v as any)[k]).toBeLessThanOrEqual(hi);
			}
			expect(v.cutoff).toBeGreaterThanOrEqual(90);
			expect(v.decayMs).toBeGreaterThanOrEqual(90);
		}
		expect(new Set(rolls.map((v) => v.wave)).size).toBe(2);
		expect(new Set(rolls.map(bassSoundKey)).size).toBe(300);
	});
});

describe('Bass patterns', () => {
	it('six of them, step 1 on (but Offbeat\'s), every note in Bass\'s range, from the key\'s root', () => {
		expect(BASS_PATTERNS).toHaveLength(6);
		for (const p of BASS_PATTERNS) {
			const lane = bassPatternFrom(p.steps, 55);
			expect(lane.steps[0], p.id).toBe(p.id !== 'offbeat');
			for (const hz of lane.pitches) {
				expect(hz).toBeGreaterThanOrEqual(BASS_MIN_HZ);
				expect(hz).toBeLessThanOrEqual(BASS_MAX_HZ);
			}
			expect(lane.pitches[0]).toBeCloseTo(55);
		}
		// Squelch has accents, slides and a tie
		const sq = bassPatternFrom(BASS_PATTERNS.find((p) => p.id === 'squelch')!.steps, 55);
		expect(sq.accents.some(Boolean) && sq.slides.some(Boolean) && sq.ties.some(Boolean)).toBe(true);
	});

	it('notes are folded into the range by octaves', () => {
		expect(foldBassHz(55, 12)).toBeCloseTo(110);
		expect(foldBassHz(220, 0)).toBeCloseTo(220);
		expect(foldBassHz(200, 12)).toBeCloseTo(200);   // 400 → 200
		expect(foldBassHz(40, -12)).toBeCloseTo(40);    // 20 → 40
	});

	it('a pattern matches its key after a round trip through rounding', () => {
		const lane = bassPatternFrom(BASS_PATTERNS[1].steps, 61.735);
		const saved = JSON.parse(JSON.stringify(lane));
		expect(bassPatternKey(saved)).toBe(bassPatternKey(lane));
	});

	it('the dice: 300 seeded rolls start on the root, never leave more than four empty steps, slide only into a note', () => {
		const r = seededRandom(3);
		const keys = new Set<string>();
		for (let k = 0; k < 300; k++) {
			const steps = randomBassPattern(r);
			expect(steps[0]).toMatchObject({ note: 0, vel: 1 });
			const on = steps.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
			on.forEach((i, j) => {
				const next = j + 1 < on.length ? on[j + 1] : on[0] + 16;
				expect(next - i - 1).toBeLessThanOrEqual(4);
			});
			steps.forEach((s, i) => { if (s?.slide) expect(steps[(i + 1) % 16]).not.toBeNull(); });
			const lane = bassPatternFrom(steps, 55);
			expect(bassPlan(lane, 16).some(Boolean)).toBe(true);
			keys.add(bassPatternKey(lane));
		}
		expect(keys.size).toBeGreaterThan(200);
	});
});

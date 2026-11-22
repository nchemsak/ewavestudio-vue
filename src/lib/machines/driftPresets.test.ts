import { describe, expect, it } from 'vitest';
import { DRIFT_PROGRESSIONS, DRIFT_SOUNDS, driftProgressionKey, driftSoundKey, progressionChords, randomDriftProgression, randomDriftSound } from './driftPresets';
import { DRIFT_RANGES, DRIFT_PLATES, type DriftVoice } from '../../audio/drift';
import { applyDrift, createDrift, driftVoice } from './drift';
import { seededRandom } from '../random';

const STEPS: Record<keyof DriftVoice, number> = { voices: 1, drift: 0.01, wave: 0.01, spread: 0.01, cutoff: 1, attack: 0.25, release: 0.25 };
function inRangeOnSteps(v: DriftVoice) {
	for (const k of Object.keys(STEPS) as (keyof DriftVoice)[]) {
		const [lo, hi] = DRIFT_RANGES[k];
		expect(v[k], k).toBeGreaterThanOrEqual(lo);
		expect(v[k], k).toBeLessThanOrEqual(hi);
		expect(Math.abs(v[k] / STEPS[k] - Math.round(v[k] / STEPS[k])), k).toBeLessThan(1e-6);
	}
}

describe('Drift sounds', () => {
	it('are within the knobs\' ranges, on their steps, each different', () => {
		for (const p of DRIFT_SOUNDS) inRangeOnSteps(p.sound);
		expect(new Set(DRIFT_SOUNDS.map((p) => driftSoundKey(p.sound))).size).toBe(DRIFT_SOUNDS.length);
		expect(new Set(DRIFT_SOUNDS.map((p) => p.label)).size).toBe(DRIFT_SOUNDS.length);
		for (const p of DRIFT_SOUNDS) expect(p.label.length).toBeLessThanOrEqual(8);
	});

	it('survive saving: the sound loaded back matches the preset', () => {
		for (const p of DRIFT_SOUNDS) {
			const d = createDrift();
			applyDrift(d, { sound: p.sound });
			expect(driftSoundKey(driftVoice(d))).toBe(driftSoundKey(p.sound));
		}
	});

	it('the dice: 500 rolls in range, on the steps, and varied', () => {
		const r = seededRandom(3);
		const keys = new Set<string>();
		for (let i = 0; i < 500; i++) {
			const v = randomDriftSound(r);
			inRangeOnSteps(v);
			keys.add(driftSoundKey(v));
		}
		expect(keys.size).toBeGreaterThan(490);
	});
});

describe('Drift progressions', () => {
	it('hold something in every bar of their length, nothing after it', () => {
		for (const p of DRIFT_PROGRESSIONS) {
			expect([4, 8]).toContain(p.length);
			expect(p.bars).toHaveLength(p.length);
			const c = progressionChords(p.bars);
			expect(c).toHaveLength(8);
			for (let b = 0; b < 8; b++) expect(c[b].some(Boolean), `${p.id} bar ${b + 1}`).toBe(b < p.length);
			for (const bar of p.bars) for (const k of bar) expect(k).toBeLessThan(DRIFT_PLATES);
		}
		expect(new Set(DRIFT_PROGRESSIONS.map((p) => driftProgressionKey(p.length, progressionChords(p.bars)))).size).toBe(DRIFT_PROGRESSIONS.length);
	});

	it('Rise is Am C Em G in A minor: triads a third apart', () => {
		const rise = DRIFT_PROGRESSIONS.find((p) => p.id === 'rise')!;
		expect(rise.bars).toEqual([[0, 1, 2], [1, 2, 3], [2, 3, 4], [3, 4, 5]]);
	});

	it('the dice: 500 rolls start on the key\'s chord, move mostly to a neighbour, never repeat a chord, and vary', () => {
		const r = seededRandom(9);
		const keys = new Set<string>();
		let shared = 0, moves = 0, eights = 0;
		for (let i = 0; i < 500; i++) {
			const p = randomDriftProgression(r);
			expect([4, 8]).toContain(p.length);
			if (p.length === 8) eights++;
			expect(p.bars).toHaveLength(p.length);
			expect(p.bars[0]).toEqual([0, 1, 2]);
			for (let b = 1; b < p.length; b++) {
				expect(p.bars[b].length).toBeGreaterThanOrEqual(3);
				expect(p.bars[b].slice(0, 3)).not.toEqual(p.bars[b - 1].slice(0, 3));
				moves++;
				if (p.bars[b].filter((k) => p.bars[b - 1].includes(k)).length >= 2) shared++;
			}
			keys.add(JSON.stringify(p));
		}
		expect(shared / moves).toBeGreaterThan(0.6);
		expect(eights).toBeGreaterThan(100);
		expect(eights).toBeLessThan(250);
		expect(keys.size).toBeGreaterThan(150);
	});
});

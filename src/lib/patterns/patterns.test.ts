import { describe, it, expect } from 'vitest';
import { applyPattern, noteHz, patternKey, PAD_RANGE } from './patterns';
import { PATTERNS } from './library';
import { randomPattern, RANDOM_NOTES } from './random';
import { buildSnapshot } from '../project/snapshot';
import { soundKey } from '../presets/presets';
import { STEPS, fresh, asSaved, changeEverything } from '../project/testState';
import { seededRandom } from '../random';

const lane = (st: ReturnType<typeof fresh>) => st.instruments.value.find(i => i.name === 'synth-voice')!;
const IN_KEY = new Set([0, 7, 12, -5, -12, 19, 24]); // root, fifths and octaves: in every scale

describe('built-in patterns', () => {
	it('each has an id, a short label, a tooltip and 16 steps within the pads\' ranges', () => {
		expect(new Set(PATTERNS.map(p => p.id)).size).toBe(PATTERNS.length);
		expect(PATTERNS.length).toBe(6);
		for (const p of PATTERNS) {
			expect(p.label.length, p.id).toBeLessThanOrEqual(8);
			expect(p.description.startsWith(p.label), p.id).toBe(true);
			expect(p.steps.length, p.id).toBe(STEPS);
			expect(p.steps.filter(Boolean).length, `${p.id}: plays something`).toBeGreaterThanOrEqual(4);
			for (const s of p.steps) {
				if (!s) continue;
				expect(IN_KEY.has(s.note), `${p.id}: note ${s.note} in every scale`).toBe(true);
				expect(s.vel).toBeGreaterThan(0);
				expect(s.vel).toBeLessThanOrEqual(1);
				expect(Math.round(s.vel * 100) / 100, `${p.id}: velocity on the slider's step`).toBe(s.vel);
				expect([1, 2, 3, 4]).toContain(s.repeats);
			}
		}
	});

	it('are all different', () => {
		const st = fresh();
		const keys = PATTERNS.map(p => { applyPattern(st, p); return patternKey(buildSnapshot(st)); });
		expect(new Set(keys).size).toBe(PATTERNS.length);
	});
});

describe('applyPattern', () => {
	it('sets steps, velocities, pitches from the key\'s root and repeats', () => {
		const st = fresh(); // key A, pads' octave: A3 = 220 Hz
		const bass = PATTERNS.find(p => p.id === 'bassline')!;
		applyPattern(st, bass);
		const l = lane(st);
		expect(l.steps).toEqual(bass.steps.map(s => s !== null));
		expect(l.velocities).toEqual(bass.steps.map(s => s?.vel ?? 1));
		expect(l.ratchets).toEqual(bass.steps.map(s => s?.repeats ?? 1));
		// root A3, octave A4, fifth E4, fifth below E3; off steps on the root
		expect(l.pitches![0]).toBeCloseTo(220, 6);
		expect(l.pitches![2]).toBeCloseTo(440, 6);
		expect(l.pitches![8]).toBeCloseTo(220 * 2 ** (7 / 12), 6);
		expect(l.pitches![14]).toBeCloseTo(220 * 2 ** (-5 / 12), 6);
		expect(l.pitches![1]).toBeCloseTo(220, 6);
	});

	it('follows the key and the pads\' octave, and stays within the pads\' range', () => {
		const st = fresh();
		st.synth.tuning.globalOctaveOffset.value = 3; // A6, 1760 Hz: an octave up would leave the range
		applyPattern(st, PATTERNS.find(p => p.id === 'bassline')!);
		const l = lane(st);
		expect(l.pitches![0]).toBeCloseTo(1760, 6);
		expect(l.pitches![2]).toBeCloseTo(1760, 6); // its octave, A7, is out of range: an octave down
		for (const hz of l.pitches!) {
			expect(hz).toBeGreaterThanOrEqual(PAD_RANGE.min);
			expect(hz).toBeLessThanOrEqual(PAD_RANGE.max);
		}
		expect(noteHz(110, -12)).toBeCloseTo(110, 6); // 55 Hz is under the range: back up an octave
		expect(noteHz(1760, 12)).toBeCloseTo(1760, 6);
	});

	it('changes the pattern only: never the sound, the pads\' waves, the noise steps or the key', () => {
		const st = fresh();
		changeEverything(st);
		const before = asSaved(st);
		applyPattern(st, PATTERNS[0]);
		const after = asSaved(st);
		expect(soundKey(after)).toBe(soundKey(before));
		const strip = (s: any) => {
			const out = JSON.parse(JSON.stringify(s));
			const l = out.instruments.find((i: any) => i.name === 'synth-voice');
			delete l.steps; delete l.velocities; delete l.pitches; delete l.ratchets;
			return out;
		};
		expect(strip(after)).toEqual(strip(before));
		expect(lane(st).waveforms).toEqual(before.instruments.find((i: any) => i.name === 'synth-voice').waveforms);
	});

	it('matches its own key once applied, also after a save and load round trip', () => {
		const st = fresh();
		for (const p of PATTERNS) {
			applyPattern(st, p);
			const key = patternKey(buildSnapshot(st));
			expect(patternKey(asSaved(st))).toBe(key);
		}
	});
});

describe('the random pattern (the dice)', () => {
	const rolls = Array.from({ length: 500 }, (_, i) => randomPattern(seededRandom(i + 1)));

	it('always plays step 1, with 4–9 hits, in key, on the slider\'s steps, 1–4 repeats', () => {
		for (const p of rolls) {
			expect(p.steps.length).toBe(16);
			expect(p.steps[0]).not.toBeNull();
			const hits = p.steps.filter(Boolean);
			expect(hits.length).toBeGreaterThanOrEqual(4);
			expect(hits.length).toBeLessThanOrEqual(9);
			for (const s of hits) {
				expect((RANDOM_NOTES as readonly number[]).includes(s!.note)).toBe(true);
				expect(s!.vel).toBeGreaterThanOrEqual(0.45);
				expect(s!.vel).toBeLessThanOrEqual(1);
				expect(Math.round(s!.vel * 100) / 100).toBe(s!.vel);
				expect([1, 2, 3, 4]).toContain(s!.repeats);
			}
			// Rolls only off the beat
			p.steps.forEach((s, i) => { if (s && s.repeats > 1) expect(i % 4).not.toBe(0); });
		}
	});

	it('varies: different hits, notes and rolls', () => {
		const shapes = new Set(rolls.map(p => p.steps.map(s => (s ? 'x' : '.')).join('')));
		expect(shapes.size).toBeGreaterThan(300);
		expect(rolls.filter(p => p.steps.some(s => s && s.note !== 0)).length).toBeGreaterThan(200);
		expect(rolls.filter(p => p.steps.some(s => s && s.repeats > 1)).length).toBeGreaterThan(100);
		expect(rolls.filter(p => p.steps.every(s => !s || s.repeats === 1)).length).toBeGreaterThan(100);
		// Beats are hit more often than the sixteenths between them
		const count = (i: number) => rolls.filter(p => p.steps[i]).length;
		expect(count(4)).toBeGreaterThan(count(5));
		expect(count(8)).toBeGreaterThan(count(9));
	});
});

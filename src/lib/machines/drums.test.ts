import { describe, it, expect } from 'vitest';
import {
	applyDrums, createDrums, deleteKept, drumsSnapshot, hitToSound, keepSound, KEPT_MAX, nextKept, resetDrums,
	slotData, slotSound, soundName, soundsOffered, stepSound,
} from './drums';
import { decodeSample } from '../../audio/sample';

const sound = (n = 1) => ({ data: 'AAAAAA'.repeat(n), sampleRate: 44100 });

describe('the Drums machine', () => {
	it('starts with the kit in its slots: Kick, Snare, Metal, Hat; empty rows', () => {
		const d = createDrums(16);
		expect(d.slots.map((s) => s.sound)).toEqual(['kit:kick', 'kit:snare', 'kit:metal', 'kit:hat']);
		expect(d.slots.map((_, k) => soundName(slotSound(d, k), d.kept))).toEqual(['Kick', 'Snare', 'Metal', 'Hat']);
		expect(d.rows).toHaveLength(4);
		expect(d.rows.every((r) => r.steps.length === 16 && !r.steps.some(Boolean))).toBe(true);
		expect(d.kept).toEqual([]);
	});

	it('a slot steps through the kit, then the kept sounds, round the ends', () => {
		const d = createDrums(16);
		keepSound(d, 3, sound());
		expect(soundsOffered(d.kept)).toEqual(['kit:kick', 'kit:snare', 'kit:metal', 'kit:hat', 'kept:1']);
		expect(stepSound('kit:hat', d.kept, 1)).toBe('kept:1');
		expect(stepSound('kept:1', d.kept, 1)).toBe('kit:kick');
		expect(stepSound('kit:kick', d.kept, -1)).toBe('kept:1');
	});

	it('Keep as drum: a new kept sound, numbered on, in the slot; with the shelf full, the oldest one no slot plays makes room', () => {
		const d = createDrums(16);
		const a = keepSound(d, 1, sound());
		expect(a).toMatchObject({ id: 'kept:1', name: 'Kept 1' });
		expect(d.slots[1].sound).toBe('kept:1');
		for (let i = 0; i < KEPT_MAX - 1; i++) keepSound(d, 2, sound());
		expect(d.kept).toHaveLength(KEPT_MAX);
		expect(nextKept(d.kept).id).toBe(`kept:${KEPT_MAX + 1}`);
		// Slot 2 plays kept:1, slot 3 the last one: the next drops kept:2, the oldest unused
		keepSound(d, 0, sound());
		expect(d.kept).toHaveLength(KEPT_MAX);
		expect(d.kept.map((k) => k.id)).not.toContain('kept:2');
		expect(d.kept.map((k) => k.id)).toContain('kept:1');
	});

	it('a deleted kept sound: its slot goes back to its own kit sound', () => {
		const d = createDrums(16);
		keepSound(d, 2, sound());
		deleteKept(d, 'kept:1');
		expect(d.kept).toEqual([]);
		expect(d.slots[2].sound).toBe('kit:metal');
	});

	it('a slot whose sound is missing (a share link leaves kept sounds out) plays its kit sound', () => {
		const d = createDrums(16);
		d.slots[3] = { ...d.slots[3], sound: 'kept:7' };
		expect(slotSound(d, 3)).toBe('kit:hat');
		const kit = { kick: sound(1), snare: sound(2), metal: sound(3), hat: sound(4) };
		expect(slotData(d, 3, kit)).toBe(kit.hat);
		expect(slotData(d, 0, null)).toBeNull(); // the kit not loaded yet
	});

	it('saves and loads: every setting, the kept sounds, the rows; damaged values get their defaults', () => {
		const d = createDrums(16);
		keepSound(d, 3, sound(2));
		d.slots = d.slots.map((s, i) => ({ ...s, tune: i - 2, decay: 0.4, level: 0.3, muted: i === 0 }));
		d.muted = true; d.level = 0.25; d.pedals = 0.5;
		d.rows = d.rows.map((r, k) => ({ steps: r.steps.map((_, i) => i === k), velocities: r.velocities.map(() => 0.6) }));
		const saved = JSON.parse(JSON.stringify(drumsSnapshot(d)));
		const e = createDrums(16);
		applyDrums(e, saved, 16);
		expect(drumsSnapshot(e)).toEqual(saved);

		applyDrums(e, { slots: [{ sound: 'kept:9', tune: 99, decay: -1, level: 'x' }], kept: [{ id: 'nope', data: '' }], lane: { rows: [{ steps: [true] }] } }, 16);
		expect(e.slots[0]).toEqual({ sound: 'kit:kick', tune: 12, decay: 0.05, level: 0.9, muted: false });
		expect(e.kept).toEqual([]);
		expect(e.rows[0].steps.slice(0, 2)).toEqual([true, false]);
		expect(e.rows[3].steps).toHaveLength(16);
		resetDrums(e, 16);
		expect(drumsSnapshot(e)).toEqual(drumsSnapshot(createDrums(16)));
	});
});

describe('a hit kept as a drum sound', () => {
	it('is mono, its peak at −1 dBFS, cut where it has faded, with a fade', () => {
		const sr = 8000, n = sr; // a second
		const l = new Float32Array(n), r = new Float32Array(n);
		for (let i = 0; i < n; i++) { const v = 0.4 * Math.exp(-i / 400) * Math.sin(i * 0.3); l[i] = v; r[i] = v; }
		const s = hitToSound([l, r], sr)!;
		expect(s.sampleRate).toBe(sr);
		const x = decodeSample(s.data);
		expect(Math.max(...x.map(Math.abs))).toBeGreaterThan(0.85);
		expect(Math.max(...x.map(Math.abs))).toBeLessThan(0.9);
		expect(x.length).toBeLessThan(n / 2); // the silent rest is cut
		expect(Math.abs(x[x.length - 1])).toBeLessThan(0.01);
	});

	it('is nothing when the hit is silent', () => {
		expect(hitToSound([new Float32Array(100)], 8000)).toBeNull();
	});
});

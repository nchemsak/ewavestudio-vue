import { describe, it, expect } from 'vitest';
import { emptyRhythm, emptySlots, loadIntoLane, mapSlotPitches, rhythmOf, slotFromLane, slotHasSteps, slotIndexFrom, slotsFrom, SLOT_COUNT } from './slots';
import { applySnapshot, buildSnapshot } from '../project/snapshot';
import { STEPS, asSaved, changeEverything, fresh } from '../project/testState';

const lane = () => ({
	steps: Array.from({ length: 16 }, (_, i) => i % 4 === 0),
	velocities: Array.from({ length: 16 }, (_, i) => i / 16),
	pitches: Array.from({ length: 16 }, (_, i) => 200 + i),
	ratchets: Array.from({ length: 16 }, (_, i) => (i % 4) + 1),
	repeatNotes: Array.from({ length: 16 }, (_, i) => ['same', 'up', 'down'][i % 3]),
	waveforms: Array(16).fill('square'),
});

describe('pattern slots', () => {
	it('a slot is a copy of the lane, as a list of tracks', () => {
		const l = lane();
		const slot = slotFromLane(l, 220);
		expect(slot.tracks).toHaveLength(1);
		expect(slot.tracks[0]).toEqual({
			machine: 'rhythm', steps: l.steps, velocities: l.velocities, pitches: l.pitches,
			ratchets: l.ratchets, repeatNotes: l.repeatNotes,
		});
		l.steps[1] = true; // editing the lane later leaves the slot alone
		expect(slot.tracks[0].steps[1]).toBe(false);
		expect(slotHasSteps(slot)).toBe(true);
	});

	it('loads a slot into the lane, and an unused slot as an empty pattern; the waves stay', () => {
		const l = lane();
		const saved = slotFromLane(lane(), 220);
		loadIntoLane(l, null, 16, 330);
		expect(l.steps.every(s => !s)).toBe(true);
		expect(l.pitches.every(p => p === 330)).toBe(true);
		expect(l.ratchets.every(r => r === 1)).toBe(true);
		expect(l.repeatNotes.every(n => n === 'same')).toBe(true);
		expect(l.waveforms.every(w => w === 'square')).toBe(true);
		loadIntoLane(l, saved, 16, 330);
		expect(l.steps).toEqual(lane().steps);
		expect(l.pitches).toEqual(lane().pitches);
	});

	it('moves a slot\'s pitches (a key change), leaving null slots null', () => {
		const s = mapSlotPitches(slotFromLane(lane(), 220), (p) => p.map(x => x * 2));
		expect(rhythmOf(s)!.pitches[0]).toBe(400);
		expect(mapSlotPitches(null, (p) => p)).toBeNull();
	});

	it('checks saved slots: damaged ones dropped, lists fitted to the bar', () => {
		const good = { tracks: [{ machine: 'rhythm', steps: [true, 'x'], velocities: [2], pitches: [-5, 300], ratchets: [9], repeatNotes: ['up', 'sideways'] }] };
		const slots = slotsFrom([good, { tracks: 'no' }, 7, { tracks: [{ machine: 'bass' }] }, good], 4, 220);
		expect(slots).toHaveLength(SLOT_COUNT);
		expect(slots[0]!.tracks[0]).toEqual({
			machine: 'rhythm', steps: [true, false, false, false], velocities: [1, 1, 1, 1],
			pitches: [220, 300, 220, 220], ratchets: [4, 1, 1, 1], repeatNotes: ['up', 'same', 'same', 'same'],
		});
		expect(slots.slice(1)).toEqual([null, null, null]);
		expect(slotsFrom(undefined, 16, 220)).toEqual(emptySlots());
		expect([slotIndexFrom(3), slotIndexFrom(4), slotIndexFrom('1'), slotIndexFrom(1.5)]).toEqual([3, 0, 0, 0]);
	});
});

describe('pattern slots in a project', () => {
	it('File → New: four empty slots, A playing', () => {
		expect(asSaved(fresh()).patterns).toEqual({ current: 0, slots: [{ tracks: [emptyRhythm(STEPS, 220)] }, null, null, null] });
	});

	it('the saved current slot is the lane as it is now', () => {
		const st = fresh();
		changeEverything(st);
		const snap = asSaved(st);
		const synth = snap.instruments.find((i: any) => i.name === 'synth-voice');
		expect(snap.patterns.current).toBe(2);
		expect(snap.patterns.slots[2].tracks[0].steps).toEqual(synth.steps);
		expect(snap.patterns.slots[2].tracks[0].pitches).toEqual(synth.pitches);
		expect(snap.patterns.slots[1].tracks[0].pitches[1]).toBe(210);
	});

	it('round trip, and a project saved before them gets empty slots with A playing', () => {
		const a = fresh();
		changeEverything(a);
		const saved = asSaved(a);
		const b = fresh();
		applySnapshot(b, saved);
		expect(asSaved(b).patterns).toEqual(saved.patterns);

		const old = JSON.parse(JSON.stringify(saved));
		delete old.patterns;
		applySnapshot(b, old);
		expect(b.patterns.current.value).toBe(0);
		expect(b.patterns.slots.value).toEqual(emptySlots());
		// its pattern is in A, as the lane
		expect(buildSnapshot(b).patterns.slots[0]!.tracks[0].steps).toEqual(saved.instruments.find((i: any) => i.name === 'synth-voice').steps);
	});
});

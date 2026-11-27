import { describe, it, expect } from 'vitest';
import { bassOf, emptyBass, loadBassIntoLane, chainCells, chainFrom, comparableProject, cycleCell, emptyChain, emptyRhythm, emptySlots, loadIntoLane, mapSlotPitches, nextChainCell, rhythmOf, slotFromLane, slotHasSteps, slotIndexFrom, slotsFrom, setSlotWaves, SLOT_COUNT, drumRowsOf, emptyDrumRows, type RhythmTrack } from './slots';
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
		const noise = Array.from({ length: 16 }, (_, i) => i % 2 === 0);
		const slot = slotFromLane(l, 220, null, null, noise);
		expect(slot.tracks).toHaveLength(1);
		expect(slot.tracks[0]).toEqual({
			machine: 'rhythm', steps: l.steps, velocities: l.velocities, pitches: l.pitches,
			ratchets: l.ratchets, repeatNotes: l.repeatNotes, waveforms: l.waveforms, noise,
		});
		noise[0] = false;
		expect((slot.tracks[0] as RhythmTrack).noise![0]).toBe(true);
		l.steps[1] = true; // editing the lane later leaves the slot alone
		expect((slot.tracks[0] as RhythmTrack).steps[1]).toBe(false);
		expect(slotHasSteps(slot)).toBe(true);
	});

	it('loads a slot into the lane with its waves and noise, and an unused slot as an empty pattern on the main wave', () => {
		const l = lane();
		const noise = Array.from({ length: 16 }, (_, i) => i % 3 === 0);
		const saved = slotFromLane({ ...lane(), waveforms: Array.from({ length: 16 }, (_, i) => (i % 2 ? 'glass' : 'saw')) }, 220, null, null, noise);
		const mask = loadIntoLane(l, null, 16, 330, 'organ');
		expect(l.steps.every(s => !s)).toBe(true);
		expect(l.pitches.every(p => p === 330)).toBe(true);
		expect(l.ratchets.every(r => r === 1)).toBe(true);
		expect(l.repeatNotes.every(n => n === 'same')).toBe(true);
		expect(l.waveforms.every(w => w === 'organ')).toBe(true);
		expect(mask).toEqual(Array(16).fill(true));
		expect(loadIntoLane(l, saved, 16, 330)).toEqual(noise);
		expect(l.steps).toEqual(lane().steps);
		expect(l.pitches).toEqual(lane().pitches);
		expect(l.waveforms[1]).toBe('glass');
		// A slot saved without waves (none given to slotsFrom) leaves the lane's
		const old = { tracks: [{ ...rhythmOf(saved)!, waveforms: undefined, noise: undefined }] };
		l.waveforms = Array(16).fill('pulse');
		expect(loadIntoLane(l, old, 16, 330)).toBeNull();
		expect(l.waveforms[1]).toBe('pulse');
	});

	it('a sound preset puts every used slot on its wave; unused slots stay unused', () => {
		const slots = [slotFromLane(lane(), 220), null, { tracks: [emptyBass(16, 55)] }, slotFromLane(lane(), 220)];
		const out = setSlotWaves(slots, 'hollow', 16);
		expect(rhythmOf(out[0])!.waveforms).toEqual(Array(16).fill('hollow'));
		expect(rhythmOf(out[3])!.waveforms).toEqual(Array(16).fill('hollow'));
		expect(out[1]).toBeNull();
		expect(out[2]).toEqual(slots[2]);
		expect(rhythmOf(slots[0])!.waveforms![0]).toBe('square'); // a copy
	});

	it('a slot saved before slots kept their waves and noise gets the project\'s', () => {
		const old = { tracks: [{ machine: 'rhythm', steps: [true, false, true, false] }] };
		const own = { tracks: [{ machine: 'rhythm', steps: [true], waveforms: ['glass', 7], noise: [false] }] };
		const shared = { waveforms: ['saw', 'square', 'saw', 'square'], noise: [true, false, false, true] };
		const slots = slotsFrom([old, own], 4, 220, 55, shared);
		expect(rhythmOf(slots[0])!.waveforms).toEqual(shared.waveforms);
		expect(rhythmOf(slots[0])!.noise).toEqual(shared.noise);
		expect(rhythmOf(slots[1])!.waveforms).toEqual(['glass', 'sine', 'sine', 'sine']);
		expect(rhythmOf(slots[1])!.noise).toEqual([false, true, true, true]);
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
		expect(asSaved(fresh()).patterns).toEqual({ current: 0, slots: [{ tracks: [emptyRhythm(STEPS, 220, 'sine'), emptyBass(STEPS, 55), { machine: 'drums', rows: emptyDrumRows(STEPS) }] }, null, null, null], chain: emptyChain(), chainOn: false });
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
		// Its waves and noise mask too (the plan's item 13)
		expect(snap.patterns.slots[2].tracks[0].waveforms).toEqual(synth.waveforms);
		expect(snap.patterns.slots[2].tracks[0].noise).toEqual(snap.synth.noise.mask);
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
		expect(b.patterns.chain.value).toEqual(emptyChain());
		expect(b.patterns.chainOn.value).toBe(false);
		expect(b.patterns.slots.value).toEqual(emptySlots());
		// its pattern is in A, as the lane
		expect(buildSnapshot(b).patterns.slots[0]!.tracks[0].steps).toEqual(saved.instruments.find((i: any) => i.name === 'synth-voice').steps);
	});
});

describe('the chain', () => {
	it('checks a saved chain: eight cells, each a slot or empty', () => {
		expect(chainFrom([0, 3, 4, -1, 'A', 1.5, null, 2, 1])).toEqual([0, 3, null, null, null, null, null, 2]);
		expect(chainFrom(undefined)).toEqual(emptyChain());
	});

	it('plays the filled cells in order, round again after the last', () => {
		const chain = [null, 0, null, 1, 1, null, null, 2];
		expect(chainCells(chain)).toEqual([1, 3, 4, 7]);
		expect(nextChainCell(chain, -1)).toBe(1);
		expect(nextChainCell(chain, 1)).toBe(3);
		expect(nextChainCell(chain, 4)).toBe(7);
		expect(nextChainCell(chain, 7)).toBe(1);
		expect(nextChainCell(emptyChain(), -1)).toBeNull();
	});

	it('a click steps a cell through — A B C D, Shift+click the other way', () => {
		const seq = [null];
		for (let i = 0; i < 5; i++) seq.push(cycleCell(seq[seq.length - 1]));
		expect(seq).toEqual([null, 0, 1, 2, 3, null]);
		expect(cycleCell(null, true)).toBe(3);
		expect(cycleCell(0, true)).toBeNull();
	});

	it('the chain is saved, and round-trips', () => {
		const a = fresh();
		changeEverything(a);
		const saved = asSaved(a);
		expect(saved.patterns.chain).toEqual([2, 2, 1, 2, null, 3, null, null]);
		expect(saved.patterns.chainOn).toBe(true);
	});
});

describe('which slot is showing is not a change', () => {
	it('two snapshots that differ only in the slot showing compare the same; an edit does not', () => {
		const st = fresh();
		changeEverything(st);
		const before = asSaved(st);
		// Switch to B as the app does: the lane into C, B into the lane
		const lane = st.instruments.value.find(i => i.name === 'synth-voice')!;
		const slots = [...st.patterns.slots.value];
		slots[2] = slotFromLane(lane, 220, st.bass.lane, st.drums.rows, st.synth.noise.mask.value);
		st.synth.noise.mask.value = loadIntoLane(lane, slots[1], STEPS, 220) ?? Array(STEPS).fill(true);
		loadBassIntoLane(st.bass.lane, slots[1], STEPS, 55);
		st.drums.rows = drumRowsOf(slots[1], STEPS);
		st.patterns.slots.value = slots;
		st.patterns.current.value = 1;
		const after = asSaved(st);
		expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
		expect(comparableProject(after)).toEqual(comparableProject(before));
		lane.steps = lane.steps.map(s => !s);
		expect(comparableProject(asSaved(st))).not.toEqual(comparableProject(before));
	});

	it('the slot showing\'s waves and noise are edits', () => {
		const st = fresh();
		changeEverything(st);
		const before = comparableProject(asSaved(st));
		const lane = st.instruments.value.find(i => i.name === 'synth-voice')! as any;
		lane.waveforms = [...lane.waveforms]; lane.waveforms[3] = lane.waveforms[3] === 'saw' ? 'organ' : 'saw';
		expect(comparableProject(asSaved(st))).not.toEqual(before);
		const st2 = fresh();
		changeEverything(st2);
		st2.synth.noise.mask.value = st2.synth.noise.mask.value.map((x) => !x);
		expect(comparableProject(asSaved(st2))).not.toEqual(before);
	});

	it('an empty pattern compares the same as a slot never used', () => {
		const st = fresh();
		const a = asSaved(st);
		st.patterns.slots.value = [null, { tracks: [emptyRhythm(STEPS, 220)] }, null, null];
		expect(comparableProject(asSaved(st))).toEqual(comparableProject(a));
		// as it loads: every pad on one wave, with noise
		st.patterns.slots.value = [null, { tracks: [emptyRhythm(STEPS, 220, 'glass')] }, null, null];
		expect(comparableProject(asSaved(st))).toEqual(comparableProject(a));
		// Mixed waves or a pad without noise are something to keep
		const mixed = emptyRhythm(STEPS, 220, 'glass');
		mixed.waveforms![2] = 'saw';
		st.patterns.slots.value = [null, { tracks: [mixed] }, null, null];
		expect(comparableProject(asSaved(st))).not.toEqual(comparableProject(a));
	});
});

describe('the Bass machine in the slots', () => {
	it('a slot keeps a Bass track beside the Rhythm one, saved and loaded', () => {
		const st = fresh();
		changeEverything(st);
		const snap = asSaved(st);
		const bass = bassOf(snap.patterns.slots[2]);
		expect(bass?.steps).toEqual(st.bass.lane.steps);
		expect(bass?.accents).toEqual(st.bass.lane.accents);
		expect(bass?.ties).toEqual(st.bass.lane.ties);
		const back = slotsFrom(snap.patterns.slots, STEPS, 220, 55);
		expect(bassOf(back[2])).toEqual(bass);
	});

	it('a slot from before Bass loads an empty Bass pattern into the lane', () => {
		const lane = { ...emptyBass(STEPS, 70), steps: Array(STEPS).fill(true) };
		loadBassIntoLane(lane, { tracks: [emptyRhythm(STEPS, 220)] }, STEPS, 55);
		expect(lane.steps.some(Boolean)).toBe(false);
		expect(lane.pitches).toEqual(Array(STEPS).fill(55));
	});

	it('a key change moves the Bass track with its own function', () => {
		const slot = { tracks: [emptyRhythm(4, 220), emptyBass(4, 55)] };
		const moved = mapSlotPitches(slot, (p) => p.map((x) => x * 2), (p) => p.map((x) => x + 1))!;
		expect(rhythmOf(moved)!.pitches).toEqual([440, 440, 440, 440]);
		expect(bassOf(moved)!.pitches).toEqual([56, 56, 56, 56]);
	});

	it('a slot with only Bass steps on counts as filled', () => {
		const b = emptyBass(4, 55);
		b.steps[2] = true;
		expect(slotHasSteps({ tracks: [emptyRhythm(4, 220), b] })).toBe(true);
	});
});

describe('the Drums machine in the slots', () => {
	const rows = () => emptyDrumRows(STEPS).map((r, k) => ({ steps: r.steps.map((_, i) => i === k * 2), velocities: r.velocities.map(() => 0.7) }));
	const lane = { steps: Array(STEPS).fill(false), velocities: Array(STEPS).fill(1) };

	it('a slot keeps a Drums track: four rows, copied', () => {
		const r = rows();
		const slot = slotFromLane(lane, 220, null, r);
		r[0].steps[0] = false; // editing the rows later leaves the slot alone
		expect(drumRowsOf(slot, STEPS)[0].steps[0]).toBe(true);
		expect(drumRowsOf(slot, STEPS)[3].steps[6]).toBe(true);
		expect(slotHasSteps(slot)).toBe(true);
		expect(drumRowsOf(null, STEPS)).toEqual(emptyDrumRows(STEPS));
	});

	it('a saved Drums track loads, fitted to the bar; a damaged one is dropped', () => {
		const saved = JSON.parse(JSON.stringify([{ tracks: [{ machine: 'drums', rows: [{ steps: [true], velocities: [2] }] }] },
			{ tracks: [{ machine: 'drums', rows: 'no' }] }]));
		const slots = slotsFrom(saved, STEPS, 220);
		const r = drumRowsOf(slots[0], STEPS);
		expect(r).toHaveLength(4);
		expect(r[0].steps).toHaveLength(STEPS);
		expect(r[0].steps[0]).toBe(true);
		expect(r[0].velocities[0]).toBe(1);
		expect(slots[1]).toBeNull();
	});

	it('an empty Drums track is the same as none (a slot from before Drums isn\'t an edit)', () => {
		const st = fresh();
		const before = asSaved(st);
		const withEmpty = JSON.parse(JSON.stringify(before));
		withEmpty.patterns.slots[0].tracks = withEmpty.patterns.slots[0].tracks.filter((t: any) => t.machine !== 'drums');
		expect(comparableProject(withEmpty)).toEqual(comparableProject(before));
		st.drums.rows = rows();
		expect(comparableProject(asSaved(st))).not.toEqual(comparableProject(before));
	});
});

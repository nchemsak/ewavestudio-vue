import { describe, expect, it } from 'vitest';
import { chordRootPc, driftNoteRuns, driftRuns, plateHz, voicedBar } from './drift';
import { applyDrift, createDrift, driftSnapshot } from '../lib/machines/drift';

const hz = plateHz('A', 'naturalMinor'); // A3 C4 E4 G4 B4 D5
const held = (...k: number[]) => Array.from({ length: 6 }, (_, i) => k.includes(i));
const midi = (f: number) => Math.round(12 * Math.log2(f / 440) + 69);

describe('Drift\'s Octave and Voicing', () => {
	it('Close is the plates as they are', () => {
		expect(voicedBar(held(0, 1, 2), hz, 'close', 0).map(midi)).toEqual([57, 60, 64]);
		expect(voicedBar(held(), hz, 'open', 1)).toEqual([]);
	});

	it('Open puts every other note, from the lowest, an octave up', () => {
		expect(voicedBar(held(0, 1, 2), hz, 'open', 0).map(midi)).toEqual([57, 64, 72]);
		expect(voicedBar(held(0, 1, 2, 3), hz, 'open', 0).map(midi)).toEqual([57, 64, 72, 79]);
	});

	it('Low root doubles the chord\'s root an octave under it, an inversion\'s too', () => {
		expect(voicedBar(held(0, 1, 2), hz, 'lowroot', 0).map(midi)).toEqual([45, 57, 60, 64]); // Am: A2
		expect(voicedBar(held(1, 2, 3), hz, 'lowroot', 0).map(midi)).toEqual([48, 60, 64, 67]); // C: C3
		// C E A is Am in first inversion: the root is A, doubled under the A it has
		expect(chordRootPc([60, 64, 69])).toBe(9);
	});

	it('Octave moves the whole chord', () => {
		expect(voicedBar(held(0, 1, 2), hz, 'close', 1).map(midi)).toEqual([69, 72, 76]);
		expect(voicedBar(held(0, 1, 2), hz, 'lowroot', -1).map(midi)).toEqual([33, 45, 48, 52]);
	});

	it('runs by pitch: Close gives the plates\' runs; a note two bars share carries on, voiced too', () => {
		const chords = [held(0, 2), held(0), held(), held()];
		const plates = driftRuns(chords, 4, 4, false);
		const notes = driftNoteRuns(chords, 4, 4, false, hz);
		expect(notes.map((r) => [midi(r.hz), r.start, r.end])).toEqual(plates.map((r) => [midi(hz[r.plate]), r.start, r.end]).sort((a, b) => a[0] - b[0]));
		// Low root: A2 is held in both bars (both are A chords), so it carries on as one note
		const low = driftNoteRuns([held(0, 1, 2), held(0, 2), held(), held()], 4, 4, false, hz, 'lowroot');
		expect(low.filter((r) => midi(r.hz) === 45).map((r) => [r.start, r.end])).toEqual([[0, 2]]);
		// A loop carries a pitch round its end
		const loop = driftNoteRuns([held(0), held(0)], 4, 2, true, hz, 'open', 1);
		expect(loop).toEqual([{ hz: hz[0] * 2, start: 0, end: 2, carriedIn: true, carriedOut: true }]);
	});

	it('are saved with Drift\'s sound; a sound saved before them has neither', () => {
		const d = createDrift();
		Object.assign(d, { octave: -1, voicing: 'open' });
		const e = createDrift();
		applyDrift(e, JSON.parse(JSON.stringify(driftSnapshot(d))));
		expect([e.octave, e.voicing]).toEqual([-1, 'open']);
		applyDrift(e, { sound: { voices: 4 } });
		expect([e.octave, e.voicing]).toEqual([0, 'close']);
		applyDrift(e, { sound: { octave: 5, voicing: 'spread' } });
		expect([e.octave, e.voicing]).toEqual([1, 'close']);
	});
});

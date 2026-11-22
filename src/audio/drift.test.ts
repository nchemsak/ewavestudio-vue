import { describe, expect, it } from 'vitest';
import { chordLabel, driftHasNotes, driftRootMidi, driftRuns, heldInBar, plateHz, platePitchClasses, plateSemitones, plateSpelling, swarmLayout, waveHarmonics } from './drift';

const H = (on: number[]) => Array.from({ length: 6 }, (_, k) => on.includes(k));
const chords = (bars: number[][]) => Array.from({ length: 8 }, (_, b) => H(bars[b] ?? []));
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

describe('Drift: the plates', () => {
	it('are the key\'s chord in thirds (1 3 5 7 9 11), the root in C3–B3', () => {
		expect(plateSemitones('naturalMinor')).toEqual([0, 3, 7, 10, 14, 17]);
		expect(plateSemitones('major')).toEqual([0, 4, 7, 11, 14, 17]);
		expect(plateSemitones('none')).toEqual(plateSemitones('major'));
		// Five notes: every other one, round into the next octave
		expect(plateSemitones('pentMinor')).toEqual([0, 5, 10, 15, 19, 24]);
		expect(driftRootMidi('A')).toBe(57);
		expect(driftRootMidi('C')).toBe(48);
		expect(plateHz('A', 'naturalMinor')[0]).toBeCloseTo(220, 6);
		expect(plateHz('A', 'naturalMinor')[2]).toBeCloseTo(329.63, 1);
	});

	it('are spelled with a letter each', () => {
		expect(plateSpelling(platePitchClasses('C', 'naturalMinor'), 'sharp')[3]).toBe('Eb');
		expect(plateSpelling(platePitchClasses('E', 'major'), 'flat')[8]).toBe('G#');
		expect(plateSpelling(platePitchClasses('A', 'naturalMinor'), 'sharp')[0]).toBe('C');
	});

	it('name the chord a bar holds', () => {
		const am = platePitchClasses('A', 'naturalMinor'); // A C E G B D
		const label = (ks: number[]) => chordLabel(ks.map((k) => am[k]), NAMES);
		expect(label([0, 1, 2])).toBe('Am');
		expect(label([1, 2, 3])).toBe('C');
		expect(label([2, 3, 4])).toBe('Em');
		expect(label([3, 4, 5])).toBe('G');
		expect(label([0, 1, 2, 3])).toBe('Am7');
		expect(label([1, 2, 3, 4])).toBe('Cmaj7');
		expect(label([0, 2])).toBe('A5');
		expect(label([0])).toBe('A');
		expect(label([])).toBe('');
		// A B D: no shape fits from any of them, so the names
		expect(label([0, 4, 5])).toBe('A·B·D');
	});
});

describe('Drift: the bars', () => {
	it('repeat every 4 or 8 bars', () => {
		const c = chords([[0], [1], [2], [3], [4]]);
		expect(heldInBar(c, 4, 4)).toEqual(H([0]));
		expect(heldInBar(c, 8, 4)).toEqual(H([4]));
		expect(driftHasNotes(c, 4)).toBe(true);
		expect(driftHasNotes(chords([[], [], [], [], [0]]), 4)).toBe(false);
	});

	it('hold a plate through the bars in a row that have it, as one note', () => {
		const runs = driftRuns(chords([[0, 2], [0], [], [0]]), 4, 4, false);
		expect(runs).toEqual([
			{ plate: 0, start: 0, end: 2, carriedIn: false, carriedOut: false },
			{ plate: 0, start: 3, end: 4, carriedIn: false, carriedOut: false },
			{ plate: 2, start: 0, end: 1, carriedIn: false, carriedOut: false },
		]);
		// Past the 4 bars, round again
		expect(driftRuns(chords([[1], [], [], []]), 4, 8, false).map((r) => r.start)).toEqual([0, 4]);
	});

	it('in a seamless loop, carry a plate held at the end and at the start round', () => {
		const runs = driftRuns(chords([[0, 1], [0], [0, 1], [0, 1]]), 4, 4, true);
		const a = runs.filter((r) => r.plate === 0);
		expect(a).toEqual([{ plate: 0, start: 0, end: 4, carriedIn: true, carriedOut: true }]);
		const c = runs.filter((r) => r.plate === 1);
		expect(c).toEqual([
			{ plate: 1, start: 0, end: 1, carriedIn: true, carriedOut: false },
			{ plate: 1, start: 2, end: 4, carriedIn: false, carriedOut: true },
		]);
	});
});

describe('Drift: the swarm', () => {
	it('spreads its voices from left (lowest) to right (highest) by Spread', () => {
		const l = swarmLayout(5, 1);
		expect(l[0].pan).toBe(-1);
		expect(l[4].pan).toBe(1);
		expect(l[2]).toEqual({ cents: 0, pan: 0 });
		expect(l[0].cents).toBeLessThan(0);
		expect(swarmLayout(3, 0).every((v) => v.cents === 0 && v.pan === 0)).toBe(true);
	});

	it('goes from soft to a saw by Wave', () => {
		const soft = waveHarmonics(0, 8), bright = waveHarmonics(1, 8);
		expect(bright[3]).toBeCloseTo(1 / 3, 6);
		expect(soft[3]).toBeCloseTo(1 / 27, 6);
		expect(soft[0]).toBe(0);
	});
});

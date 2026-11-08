import { describe, it, expect } from 'vitest';
import {
	shortestInterval, transposePitches, remapScale, nearestInScale, foldIntoRange,
	midiToFreq, freqToMidiExact, SCALES,
} from './theory';

const MIN = 100, MAX = 2000; // the pads' range
const hz = (midi: number) => midiToFreq(midi);
const midi = (f: number) => Math.round(freqToMidiExact(f) * 1000) / 1000; // 3 decimals: cents survive

describe('moving a pattern to another key', () => {
	it('goes the shorter way round', () => {
		expect(shortestInterval('C', 'D')).toBe(2);
		expect(shortestInterval('C', 'A')).toBe(-3);
		expect(shortestInterval('A', 'C')).toBe(3);
		expect(shortestInterval('A', 'E')).toBe(-5);
		expect(shortestInterval('E', 'A')).toBe(5);
		expect(shortestInterval('C', 'F#')).toBe(6); // a tritone goes up
		expect(shortestInterval('Bb', 'Bb')).toBe(0);
		expect(shortestInterval('B', 'C')).toBe(1);
	});

	it('moves every pad by the same interval: the same melody', () => {
		const melody = [57, 60, 64, 62, 57].map(hz); // A3 C4 E4 D4 A3
		expect(transposePitches(melody, 3, MIN, MAX).map(midi)).toEqual([60, 63, 67, 65, 60]);
		expect(transposePitches(melody, -5, MIN, MAX).map(midi)).toEqual([52, 55, 59, 57, 52]);
		expect(transposePitches(melody, 0, MIN, MAX)).toEqual(melody);
	});

	it("keeps each pad's fine tuning", () => {
		const detuned = hz(60) * Math.pow(2, 25 / 1200); // C4 + 25 cents
		expect(midi(transposePitches([detuned], 2, MIN, MAX)[0])).toBeCloseTo(62.25, 3);
	});

	it('goes the other way round when the shorter way would leave the range', () => {
		// Pads near the top (B6 is 1976 Hz): up 3 would pass 2000 Hz, so down 9 instead
		const high = [95, 93].map(hz);
		expect(transposePitches(high, 3, MIN, MAX).map(midi)).toEqual([86, 84]);
		// Near the bottom (G#2 is 104 Hz): down 3 would go under 100 Hz, so up 9
		expect(transposePitches([hz(44)], -3, MIN, MAX).map(midi)).toEqual([53]);
	});

	it('moves a single pad an octave when neither way fits the whole pattern', () => {
		// A wide melody: the top note can't go up 5, the bottom one can't go down 7
		const wide = [hz(44), hz(94)];
		const out = transposePitches(wide, 5, MIN, MAX).map(midi);
		expect(out[0]).toBe(49); // up 5, as asked
		expect(out[1]).toBe(87); // 94 + 5 = 99 is above 2000 Hz: an octave lower
		for (const f of transposePitches(wide, 5, MIN, MAX)) { expect(f).toBeGreaterThanOrEqual(MIN); expect(f).toBeLessThanOrEqual(MAX); }
	});

	it('folds a frequency into the range by octaves', () => {
		expect(foldIntoRange(5000, MIN, MAX)).toBe(1250);
		expect(foldIntoRange(4000, MIN, MAX)).toBe(2000); // the edge is in range
		expect(foldIntoRange(55, MIN, MAX)).toBe(110);
		expect(foldIntoRange(440, MIN, MAX)).toBe(440);
	});
});

describe('moving a pattern to another scale', () => {
	// In C (root 0, MIDI 60 = C4)
	const C = 'C';

	it('keeps each note on its degree between scales of the same size (minor → major)', () => {
		const cMinor = [60, 62, 63, 65, 67, 68, 70, 72].map(hz); // C D Eb F G Ab Bb C
		expect(remapScale(cMinor, C, 'naturalMinor', 'major', MIN, MAX).map(midi))
			.toEqual([60, 62, 64, 65, 67, 69, 71, 72]); // C D E F G A B C
		// And back
		expect(remapScale(remapScale(cMinor, C, 'naturalMinor', 'major', MIN, MAX), C, 'major', 'naturalMinor', MIN, MAX).map(midi))
			.toEqual(cMinor.map(midi));
		// Pentatonic to pentatonic: the same place in the scale
		expect(remapScale([62, 64, 69].map(hz), C, 'pentMajor', 'pentMinor', MIN, MAX).map(midi)).toEqual([63, 65, 70]);
	});

	it('works in any key and octave', () => {
		// A minor → A major: C5 → C#5, F3 → F#3, G4 → G#4
		expect(remapScale([72, 53, 67].map(hz), 'A', 'naturalMinor', 'major', MIN, MAX).map(midi)).toEqual([73, 54, 68]);
	});

	it('takes the nearest note of the new scale between scales of different sizes, or from none', () => {
		// C major → C pentatonic major (C D E G A): F → E, B → C above
		expect(remapScale([65, 71].map(hz), C, 'major', 'pentMajor', MIN, MAX).map(midi)).toEqual([64, 72]);
		// No scale → C major: C# goes down to C (as near as D: the lower wins), F# → F
		expect(remapScale([61, 66, 64].map(hz), C, 'none', 'major', MIN, MAX).map(midi)).toEqual([60, 65, 64]);
		// A note outside the old scale also goes to the nearest one
		expect(remapScale([hz(61)], C, 'naturalMinor', 'major', MIN, MAX).map(midi)).toEqual([60]);
	});

	it('leaves the pads alone when the scale is cleared or unchanged', () => {
		const p = [61, 66].map(hz);
		expect(remapScale(p, C, 'major', 'none', MIN, MAX)).toEqual(p);
		expect(remapScale(p, C, 'major', 'major', MIN, MAX)).toEqual(p);
	});

	it("keeps each pad's fine tuning and its range", () => {
		const eb = hz(63) * Math.pow(2, -10 / 1200); // Eb4 − 10 cents
		expect(midi(remapScale([eb], C, 'naturalMinor', 'major', MIN, MAX)[0])).toBeCloseTo(63.9, 3);
		for (const f of remapScale([hz(95)], C, 'none', 'major', MIN, MAX)) expect(f).toBeLessThanOrEqual(MAX);
	});

	it('finds the nearest note of a scale, the lower when two are as near', () => {
		expect(nearestInScale(61, 0, SCALES.major)).toBe(60);
		expect(nearestInScale(63, 0, SCALES.major)).toBe(62);
		expect(nearestInScale(66, 0, SCALES.pentMajor)).toBe(67);
		expect(nearestInScale(64, 0, SCALES.major)).toBe(64);
	});
});

describe('the note a key plays', () => {
	it("is the key's root in the octave nearest the pattern", async () => {
		const { nearestRootHz, patternCenterHz } = await import('./theory');
		expect(midi(nearestRootHz('C', hz(62)))).toBe(60); // D4 → C4
		expect(midi(nearestRootHz('C', hz(67)))).toBe(72); // G4 → C5 (5 up is nearer than 7 down)
		expect(midi(nearestRootHz('A', hz(57)))).toBe(57);
		// The pattern's middle: the median of the pads that are on, else of all
		const pads = [hz(48), hz(60), hz(64), hz(84)];
		expect(midi(patternCenterHz(pads, [false, true, true, false]))).toBe(60);
		expect(midi(patternCenterHz(pads, [false, false, false, false]))).toBe(60);
	});
});

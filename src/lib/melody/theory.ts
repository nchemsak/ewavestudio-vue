// src/lib/melody/theory.ts
// The Melody Maker's music theory (pure, unit-tested): keys, scales, and moving a pattern to
// another key or scale without losing its melody.
// - A new key moves every pad by the same interval, the shorter way round (C → D up 2, C → A
//   down 3), so the melody stays in its register (transposePitches).
// - A new scale keeps each note on its degree of the scale when both scales have as many notes
//   (minor → major: the third, sixth and seventh go up a semitone); otherwise each note goes to
//   the nearest note of the new scale (remapScale).
// Pads keep their fine tuning (their cents away from the nearest note), and stay in the pads'
// range by moving an octave if they'd leave it.

export const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export type KeyRoot = typeof ROOTS[number];

export const SCALES = {
	major: [0, 2, 4, 5, 7, 9, 11],
	naturalMinor: [0, 2, 3, 5, 7, 8, 10],
	pentMajor: [0, 2, 4, 7, 9],
	pentMinor: [0, 3, 5, 7, 10],
	dorian: [0, 2, 3, 5, 7, 9, 10],
	lydian: [0, 2, 4, 6, 7, 9, 11],
	mixolydian: [0, 2, 4, 5, 7, 9, 10],
} as const;
export type ScaleName = keyof typeof SCALES;
export type KeyScale = 'none' | ScaleName;

export const NOTE_TO_SEMITONE: Record<string, number> = {
	C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
	G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// The exact (fractional) MIDI note of a frequency
export const freqToMidiExact = (hz: number) => 69 + 12 * Math.log2(hz / 440);

const mod12 = (n: number) => ((n % 12) + 12) % 12;

// From one key to another the shorter way round: −5…+6 semitones (a tritone goes up)
export function shortestInterval(from: string, to: string): number {
	const d = mod12((NOTE_TO_SEMITONE[to] ?? 0) - (NOTE_TO_SEMITONE[from] ?? 0));
	return d > 6 ? d - 12 : d;
}

// Into [minHz, maxHz] by whole octaves (the note stays the same)
export function foldIntoRange(hz: number, minHz: number, maxHz: number): number {
	let f = hz;
	while (f > maxHz && f / 2 >= minHz) f /= 2;
	while (f < minHz && f * 2 <= maxHz) f *= 2;
	return Math.min(maxHz, Math.max(minHz, f));
}

// Every pad moved by `semitones`. If that would take a pad out of range and going the other
// way round (an octave apart) wouldn't, the whole pattern goes the other way; otherwise a pad
// that would leave the range moves by an octave instead.
export function transposePitches(pitches: number[], semitones: number, minHz: number, maxHz: number): number[] {
	if (!semitones) return pitches.slice();
	const ratio = (s: number) => Math.pow(2, s / 12);
	const fits = (s: number) => pitches.every((hz) => hz * ratio(s) >= minHz - 1e-9 && hz * ratio(s) <= maxHz + 1e-9);
	const other = semitones > 0 ? semitones - 12 : semitones + 12;
	const s = fits(semitones) || !fits(other) ? semitones : other;
	return pitches.map((hz) => foldIntoRange(hz * ratio(s), minHz, maxHz));
}

// The nearest MIDI note in the scale (root + steps), the lower one when two are as near
export function nearestInScale(midi: number, rootSemi: number, steps: readonly number[]): number {
	for (let d = 0; d <= 6; d++) {
		if (steps.includes(mod12(midi - d - rootSemi))) return midi - d;
		if (steps.includes(mod12(midi + d - rootSemi))) return midi + d;
	}
	return midi;
}

// Every pad moved from one scale to another, in the key of `root` (see the top of this file).
// To 'none' (no scale), nothing moves.
export function remapScale(pitches: number[], root: string, from: KeyScale, to: KeyScale, minHz: number, maxHz: number): number[] {
	if (to === 'none' || from === to) return pitches.slice();
	const r = NOTE_TO_SEMITONE[root] ?? 0;
	const toSteps = SCALES[to];
	const fromSteps = from === 'none' ? null : SCALES[from];
	return pitches.map((hz) => {
		const exact = freqToMidiExact(hz);
		const m = Math.round(exact);
		const cents = exact - m; // fine tuning, kept
		const degree = fromSteps ? (fromSteps as readonly number[]).indexOf(mod12(m - r)) : -1;
		// The same degree: from this octave's root (m minus its old step), the new step
		const target = degree >= 0 && fromSteps!.length === toSteps.length
			? m - fromSteps![degree] + toSteps[degree]
			: nearestInScale(m, r, toSteps);
		return foldIntoRange(midiToFreq(target + cents), minHz, maxHz);
	});
}

// The key's root in the octave nearest `hz` (where the pattern is): what clicking a key plays
export function nearestRootHz(root: string, hz: number): number {
	const r = NOTE_TO_SEMITONE[root] ?? 0;
	const m = freqToMidiExact(hz);
	const below = Math.floor((m - r) / 12) * 12 + r;
	return midiToFreq(m - below <= below + 12 - m ? below : below + 12);
}

// The middle of the pads that are on (or of all of them): where the pattern sits
export function patternCenterHz(pitches: number[], on: boolean[]): number {
	const chosen = pitches.filter((_, i) => on[i]);
	const list = (chosen.length ? chosen : pitches).map(freqToMidiExact).sort((a, b) => a - b);
	if (!list.length) return 220;
	return midiToFreq(list[Math.floor((list.length - 1) / 2)]);
}

// The key's chord as pitch classes (0–11): the scale's 1st, 3rd and 5th degrees, as the Melody
// Maker's arpeggio uses with Tones "Chord" (no scale: major). For a pad's repeats stepping
// through the chord (src/audio/ratchet.ts, ratchetPitches)
export function chordPitchClasses(root: string, scale: KeyScale): number[] {
	const steps: readonly number[] = scale !== 'none' && SCALES[scale] ? SCALES[scale] : SCALES.major;
	const r = NOTE_TO_SEMITONE[root] ?? 9;
	return [...new Set([0, 2, 4].filter((i) => i < steps.length).map((i) => mod12(r + steps[i])))];
}

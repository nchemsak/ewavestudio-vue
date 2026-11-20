// src/components/spectrumView.ts
// Reading the output's spectrum (PR 70: the big screen's Spectrum view; since PR 108 drawn
// behind the Filter card's curve, cardViews.ts, and the Melody Maker's tuner, TunerBadge.vue):
// a band's level, a falling peak hold, the strongest note and its name. They read the fine
// analyser (liveEngine.ts: 8192 points behind a 10 Hz high-pass, about 6 Hz a bin at 48 kHz; the
// strongest note's frequency is refined between bins). Tested in spectrumView.test.ts.

// Helpers START

// The bins skipped at the bottom: only DC. The views' tap has a 10 Hz high-pass (PR 108), so
// the drive's DC offset no longer shows; until then the bottom three bins (to about 70 Hz at
// 2048 points) were skipped, and the curve started with a wall between C1 and C2.
export const SKIP_BINS = 1;
// How fast the peak-hold line falls, in the analyser's 0–255 units a second (its 255 span the
// analyser's −90…−30 dB range, so about 14 dB a second)
export const PEAK_FALL_PER_S = 60;
// A note is marked only above this level (0–255), so silence and reverb tails mark nothing
export const NOTE_MIN_LEVEL = 110;
// …and only between these, where a played note's fundamental is (the pads' 100–2000 Hz, and
// an octave either side)
export const NOTE_LOW_HZ = 50;
export const NOTE_HIGH_HZ = 4000;

// The level (0–255) of the band of bins from f0 to f1 Hz: its loudest bin
export function bandLevel(bins: ArrayLike<number>, binHz: number, f0: number, f1: number): number {
	let v = 0;
	const b0 = Math.max(SKIP_BINS, Math.floor(f0 / binHz));
	const b1 = Math.min(bins.length - 1, Math.ceil(f1 / binHz));
	for (let b = b0; b <= b1; b++) v = Math.max(v, bins[b]);
	return v;
}

// The peak-hold line: each point follows a louder level at once, and falls by `fall` otherwise
export function holdPeaks(held: Float32Array, levels: ArrayLike<number>, fall: number): Float32Array {
	for (let i = 0; i < held.length; i++) held[i] = Math.max(levels[i] ?? 0, (held[i] ?? 0) - fall);
	return held;
}

// The strongest note: the loudest bin between NOTE_LOW_HZ and NOTE_HIGH_HZ, if it's above
// NOTE_MIN_LEVEL, its frequency refined between its neighbours (a parabola through the three),
// or null
export function strongestNoteHz(bins: ArrayLike<number>, binHz: number): number | null {
	const lo = Math.max(SKIP_BINS + 1, Math.ceil(NOTE_LOW_HZ / binHz));
	const hi = Math.min(bins.length - 2, Math.floor(NOTE_HIGH_HZ / binHz));
	let best = -1;
	for (let b = lo; b <= hi; b++) if (best < 0 || bins[b] > bins[best]) best = b;
	if (best < 0 || bins[best] < NOTE_MIN_LEVEL) return null;
	const a = bins[best - 1], c = bins[best + 1], m = bins[best];
	const den = a - 2 * m + c;
	const shift = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
	return (best + shift) * binHz;
}

// A frequency's nearest note (the app's names: A3 = 220 Hz) and how far off it is, in cents
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export function noteOf(hz: number, flats = false): { name: string; cents: number } {
	const exact = 69 + 12 * Math.log2(hz / 440);
	const m = Math.round(exact);
	const names = flats ? FLAT : SHARP;
	return { name: `${names[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`, cents: Math.round((exact - m) * 100) };
}

// Helpers END

// src/components/spectrumView.ts
// Reading the output's spectrum (PR 70: the big screen's Spectrum view; since PR 108 drawn
// behind the Filter card's curve, cardViews.ts): a band's level and a falling peak hold. They
// read the fine analyser (liveEngine.ts: 8192 points behind a 10 Hz high-pass, about 6 Hz a bin
// at 48 kHz). The strongest note and its name went with the tuner (PR 125). Tested in
// spectrumView.test.ts.

// Helpers START

// The bins skipped at the bottom: only DC. The views' tap has a 10 Hz high-pass (PR 108), so
// the drive's DC offset no longer shows; until then the bottom three bins (to about 70 Hz at
// 2048 points) were skipped, and the curve started with a wall between C1 and C2.
export const SKIP_BINS = 1;
// How fast the peak-hold line falls, in the analyser's 0–255 units a second (its 255 span the
// analyser's −90…−30 dB range, so about 14 dB a second)
export const PEAK_FALL_PER_S = 60;
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

// Helpers END

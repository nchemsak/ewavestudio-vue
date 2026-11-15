// Tap tempo: the TAP cap beside the Tempo knob. Four taps set the tempo (the average of their
// three gaps); each tap after that updates it, from the last eight. A pause longer than
// TAP_RESET_MS starts again, so a tap after a rest is a first tap.

export const TAP_RESET_MS = 2000;
export const TAPS_NEEDED = 4;
const TAPS_KEPT = 8;

/** The taps to keep after a new one at `now` (ms) */
export function addTap(taps: readonly number[], now: number): number[] {
	const last = taps[taps.length - 1];
	const kept = last != null && now - last <= TAP_RESET_MS && now > last ? [...taps, now] : [now];
	return kept.slice(-TAPS_KEPT);
}

/** The tempo the taps give (whole BPM, within min–max), or null before four taps */
export function tapBpm(taps: readonly number[], min = 20, max = 300): number | null {
	if (taps.length < TAPS_NEEDED) return null;
	const span = taps[taps.length - 1] - taps[0];
	const gap = span / (taps.length - 1);
	if (!(gap > 0)) return null;
	return Math.max(min, Math.min(max, Math.round(60000 / gap)));
}

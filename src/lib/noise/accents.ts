// src/lib/noise/accents.ts
// The Noise card's "Accents" mask (PR 69, replacing Backbeat, which put noise on steps 5 and
// 13 and so did nothing for a pattern with no hit there, as Tresillo): noise on the pattern's
// loudest hits, the way a drummer's accents get the snare's rattle. Pure, unit-tested.
//
// - The steps that are on and within 10 % of the loudest step's velocity.
// - When every step that's on is as loud (a pattern with no accents, more than four hits),
//   only those on a beat (steps 1, 5, 9, 13), if any are: noise on every hit is "All" again.
// - Nothing on: the beats, as Every 4 (there are no hits to follow yet).
export const ACCENT_SHARE = 0.9;

export function accentMask(steps: readonly boolean[], velocities: readonly number[]): boolean[] {
	const len = steps.length;
	const onBeat = (i: number) => i % 4 === 0;
	const vel = (i: number) => (Number.isFinite(velocities[i]) ? velocities[i] : 1);
	const on = steps.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
	if (!on.length) return Array.from({ length: len }, (_, i) => onBeat(i));

	const loudest = Math.max(...on.map(vel));
	let picked = on.filter((i) => vel(i) >= loudest * ACCENT_SHARE);
	if (picked.length === on.length && on.length > 4 && on.some(onBeat)) picked = on.filter(onBeat);
	const set = new Set(picked);
	return Array.from({ length: len }, (_, i) => set.has(i));
}

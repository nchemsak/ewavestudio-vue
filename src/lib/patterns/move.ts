// Pattern Tools' Move: rotate the pattern one step either way (round the bar's end) or reverse
// it. Every per-step list (steps, velocities, pitches, waves, repeats and what they play, the
// noise mask) moves together, so each pad keeps its note, as a hit moved along the bar.

export type MoveKind = 'left' | 'right' | 'reverse';

/** Where step i's contents come from after the move, in a bar of n steps */
export function moveSource(kind: MoveKind, i: number, n: number): number {
	if (kind === 'reverse') return n - 1 - i;
	const by = kind === 'right' ? 1 : -1; // right: every step one later; the last comes round to the first
	return (((i - by) % n) + n) % n;
}

/** The list moved; a missing list stays missing */
export function moveList<T>(list: readonly T[] | null | undefined, kind: MoveKind): T[] | null | undefined {
	if (!list) return list as null | undefined;
	const n = list.length;
	return list.map((_, i) => list[moveSource(kind, i, n)]);
}

/** The per-step lists of a lane that move together */
export const MOVED_LANE_FIELDS = ['steps', 'velocities', 'pitches', 'waveforms', 'ratchets', 'repeatNotes'] as const;

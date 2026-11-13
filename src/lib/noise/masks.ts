// src/lib/noise/masks.ts
// The Noise card's pad buttons that go by where a step sits in the bar (PR 74; Accents, which
// goes by the pattern's hits, is in accents.ts). Pure, unit-tested.
//
// A bar is four beats of four steps. Noise is part of a step's note, so it's only heard on
// steps that are on: noiseGap() says when a button's pads would be silent, so the card can
// say so (Backbeat, before PR 69, often landed on steps with no hit and seemed dead).
const STEPS_PER_BEAT = 4;

// Beats 2 and 4, where a snare sits: steps 5 and 13 of 16
export function backbeatMask(len: number): boolean[] {
	return Array.from({ length: len }, (_, i) => i % (STEPS_PER_BEAT * 2) === STEPS_PER_BEAT);
}

// The "and" of every beat, where an open hi-hat sits: steps 3, 7, 11 and 15 of 16
export function offbeatMask(len: number): boolean[] {
	return Array.from({ length: len }, (_, i) => i % STEPS_PER_BEAT === STEPS_PER_BEAT / 2);
}

// Why a mask can't be heard yet: 'none' (no pad has noise), 'silent' (none of its pads is
// on), or null (some step that's on has noise)
export function noiseGap(mask: readonly boolean[], steps: readonly boolean[]): 'none' | 'silent' | null {
	if (!mask.some(Boolean)) return 'none';
	return mask.some((m, i) => m && !!steps[i]) ? null : 'silent';
}

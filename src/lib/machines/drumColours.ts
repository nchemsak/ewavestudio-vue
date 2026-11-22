// src/lib/machines/drumColours.ts
// Each Drums sound's colour, on the pads' blue-to-red scale (padColour.ts): the kit's from where
// each sits (the kick low and blue, the hat high and red), a kept sound's from its number, so a
// sound keeps its colour from slot to slot. Pure.

import { padHue } from '../padColour';

const KIT_HZ: Record<string, number> = { kick: 110, snare: 640, metal: 1600, hat: 1950 };

export function soundHue(ref: string): number {
	if (ref.startsWith('kit:')) return padHue(KIT_HZ[ref.slice(4)] ?? 110);
	const n = Number(ref.replace(/^kept:/, '')) || 1;
	// Kept sounds spread across the scale's middle, away from the kit's colours
	return padHue(300 + ((n * 430) % 1100));
}

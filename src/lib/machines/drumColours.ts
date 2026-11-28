// src/lib/machines/drumColours.ts
// Each Drums sound's colour, on the pads' blue-to-red scale (padColour.ts): the kit's from where
// each sits (the kicks low and blue, the hats high and red, the tom and percussion between), a
// kept sound's from its number, so a sound keeps its colour from slot to slot. Pure.

import { padHue } from '../padColour';

const KIT_HZ: Record<string, number> = {
	kick: 110, sub: 100, subclick: 130, round: 160, snare: 640, clap: 820, rim: 1250,
	tom: 300, conga: 450, wood: 1050, shaker: 1750, closed: 1950, open: 1850, metal: 1600, hat: 2000,
};

export function soundHue(ref: string): number {
	if (ref.startsWith('kit:')) return padHue(KIT_HZ[ref.slice(4)] ?? 110);
	const n = Number(ref.replace(/^kept:/, '')) || 1;
	// Kept sounds spread across the scale's middle, away from the kit's colours
	return padHue(300 + ((n * 430) % 1100));
}

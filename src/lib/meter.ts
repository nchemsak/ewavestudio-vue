// src/lib/meter.ts
// The rail's level meters (MachineRail.vue, PR 116): a peak level as a number of lit LEDs, out
// of eight, 6 dB apart from −42 dBFS, the last two (−6 and −3 dBFS) amber. Pure, unit-tested.

export const METER_DB = [-42, -36, -30, -24, -18, -12, -6, -3] as const;

/** How many of the eight LEDs a peak (0..1 and over) lights */
export function meterLeds(peak: number): number {
	if (!(peak > 0)) return 0;
	const db = 20 * Math.log10(peak);
	return METER_DB.filter((t) => db >= t).length;
}

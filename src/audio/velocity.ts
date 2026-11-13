// src/audio/velocity.ts
// Velocity routing: each step's velocity (its pad slider, 0..1; or a MIDI note's velocity)
// changes more than its loudness, the way DFAM patches its velocity sequence to other inputs.
// Shared by the live engine (liveEngine.ts) and the WAV export engine.
//
// Four destinations, each with an amount from −100 to +100 % (0, the default, is off):
// - decay:    the amp envelope's Decay
// - cutoff:   the filter's Cutoff (up to CUTOFF_RANGE_OCT octaves)
// - pitchEnv: the pitch envelope's Amount
// - noise:    the noise mix
// A full-velocity step always plays the settings exactly as the panel shows them. Right of
// centre, softer steps get less (shorter, darker, smaller sweep, less noise); left of centre,
// softer steps get more. So with every amount at 0, nothing changes.

export type VelocityRouting = { decay: number; cutoff: number; pitchEnv: number; noise: number };

export const VELOCITY_DESTINATIONS = ['decay', 'cutoff', 'pitchEnv', 'noise'] as const;
// The destinations with a VEL switch on the panel: only Filter's since PR 67 (Envelope's,
// Pitch's and Noise's were hard to hear). The others stay at 0 (applySnapshot sets them so);
// the engines still route all four.
export const VELOCITY_SWITCHED: readonly (typeof VELOCITY_DESTINATIONS)[number][] = ['cutoff'];
export const VELOCITY_ROUTING_DEFAULT: VelocityRouting = { decay: 0, cutoff: 0, pitchEnv: 0, noise: 0 };
export const VELOCITY_AMOUNT_MAX = 100; // %
// What a card's VEL switch sets (on) for its destination; off is 0. Older projects and the
// presets may hold other amounts, which play as before (the switch is lit while it isn't 0).
export const VELOCITY_SWITCH_AMOUNT = 75;
// The softer velocities the screen draws (dashed) while Decay's or Cutoff's VEL is on
export const VELOCITY_FAN = [0.7, 0.4] as const;
// How far Cutoff moves for a silent step at full amount
export const CUTOFF_RANGE_OCT = 2;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const amount = (pct: number) => clamp(Number(pct) || 0, -VELOCITY_AMOUNT_MAX, VELOCITY_AMOUNT_MAX) / 100;

// How much of a setting a step at velocity `v` gets: 1 at full velocity; at +100 % it falls
// to 0 for a silent step, at −100 % it rises to 2
export function velocityFactor(amountPct: number, v: number): number {
	return clamp(1 - amount(amountPct) * (1 - clamp(v, 0, 1)), 0, 2);
}

export type RoutedNote = {
	decayFactor: number;     // multiplies the amp envelope's Decay
	cutoffOctaves: number;   // moves Cutoff (negative: darker)
	pitchEnvFactor: number;  // multiplies the pitch envelope's Amount
	noiseFactor: number;     // multiplies the noise mix
};

// What velocity `v` does to one note; `r` missing (or all 0) changes nothing
export function routeVelocity(r: Partial<VelocityRouting> | null | undefined, v: number): RoutedNote {
	const vel = clamp(Number.isFinite(v) ? v : 1, 0, 1);
	return {
		decayFactor: Math.max(0.05, velocityFactor(r?.decay ?? 0, vel)), // never a silent click
		cutoffOctaves: -amount(r?.cutoff ?? 0) * (1 - vel) * CUTOFF_RANGE_OCT,
		pitchEnvFactor: velocityFactor(r?.pitchEnv ?? 0, vel),
		noiseFactor: velocityFactor(r?.noise ?? 0, vel),
	};
}

// The settings with a note's routing applied (cutoff kept within 20 Hz..20 kHz, the pitch
// envelope within its 48 semitones, the noise mix within 0..1)
export function routedCutoff(cutoffHz: number, n: RoutedNote): number {
	return clamp(cutoffHz * Math.pow(2, n.cutoffOctaves), 20, 20000);
}
export function routedSemitones(semitones: number, n: RoutedNote): number {
	return clamp(semitones * n.pitchEnvFactor, 0, 48);
}
export function routedNoise(mix: number, n: RoutedNote): number {
	return clamp(mix * n.noiseFactor, 0, 1);
}

// Is any destination in use?
export const velocityRoutingActive = (r: Partial<VelocityRouting> | null | undefined) =>
	VELOCITY_DESTINATIONS.some((k) => (r?.[k] ?? 0) !== 0);

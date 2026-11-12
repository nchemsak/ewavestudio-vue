// src/lib/lfoVisual.ts
// The LFO visualizer's arithmetic: where the LFO's swing puts the setting it moves, at an
// LFO position `norm` (−1..1, from the engine's lfoNow()). Pure, so it's unit-tested; it uses
// the engines' own limits, so the indicators show what you hear.
// DrumSequencer draws the results without turning any knob (the knob stays where the user
// set it, so it can still be turned while the LFO runs):
// - Filter: a coloured dot on the Cutoff knob at the modulated cutoff, over a faint arc for
//   the whole swing;
// - Pulse: the Pulse tile's bar at the modulated width, over a faint outline of the widest;
// - Pitch: a bar on each lit step pad, sliding up and down with the bend, over a faint track
//   for the whole bend;
// - FM: a dot on the FM card's Amount knob at the modulated Amount, over an arc for the swing;
// - Level: a dot on the Step Sequencer's Vol knob at the level notes play at now, over an arc
//   from full down to the quietest (PR 62; the pads' fill height already means velocity).
// The ranges show whenever the LFO moves that setting (depth above 0); the moving parts only
// while something plays (and never with prefers-reduced-motion).

import { lfoFilterTapGain } from '../audio/synthHelpers';
import { lfoPwmTapGain, foldPulseWidth } from '../audio/waves';
import { lfoAmpBase, LFO_AMP_TAP } from '../audio/lfo';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// What the indicators show, worked out by DrumSequencer. It's passed down as one reactive
// object, so only the components that read it redraw every frame, not DrumSequencer.
// null: nothing to show.
export type LfoView = {
	cutoff: number | null;                 // Hz: where the LFO has the cutoff now
	cutoffRange: [number, number] | null;  // Hz: the swing's ends
	pulseWidth: number | null;             // %: the width the pulse plays at now
	pulseRange: [number, number] | null;   // %: the narrowest and widest it plays
	bend: number | null;                   // −1..1 octave: how far notes are bent now
	bendRange: number | null;              // 0..1 octave: how far they bend either way
	fmAmount: number | null;               // the FM card's Amount the LFO has now
	fmAmountRange: [number, number] | null;
	level: number | null;                  // the Vol knob's scale: the level notes play at now
	levelRange: [number, number] | null;
};

// Filter: the cutoff (Hz) at LFO position `norm`, and the swing's ends, as the engine moves
// it: ±Depth Hz, shrunk to stay within 30 Hz..0.45 × sample rate
export function lfoCutoffAt(cutoffHz: number, depthHz: number, sampleRate: number, norm: number): number {
	return cutoffHz + clamp(norm, -1, 1) * depthHz * lfoFilterTapGain(cutoffHz, depthHz, sampleRate);
}
export function lfoCutoffSwing(cutoffHz: number, depthHz: number, sampleRate: number): [number, number] | null {
	const swing = depthHz * lfoFilterTapGain(cutoffHz, depthHz, sampleRate);
	return swing > 0 ? [cutoffHz - swing, cutoffHz + swing] : null;
}

// Pulse: how far (in % width) the LFO moves the width either way, as the engine's PW tap does
// (the tap's gain is in threshold units, 2 per 100 % width)
const pulseSwing = (widthPct: number, depthPct: number) => depthPct * lfoPwmTapGain(widthPct, depthPct) * 50;

// Pulse: the width (%) the pulse plays at LFO position `norm`, shown as on the knob's scale
// (above 50 % it sounds like its mirror, so it's shown as that)
export function lfoPulseWidthAt(widthPct: number, depthPct: number, norm: number): number {
	return foldPulseWidth(foldPulseWidth(widthPct) + clamp(norm, -1, 1) * pulseSwing(widthPct, depthPct));
}

// The widths the pulse plays at over the LFO's whole swing: down to width − swing, and up to
// 50 % at most (past 50 % it sounds like its mirror, so it comes back down)
export function lfoPulseWidthRange(widthPct: number, depthPct: number): [number, number] | null {
	const swing = pulseSwing(widthPct, depthPct);
	if (!(swing > 0)) return null;
	const w = foldPulseWidth(widthPct);
	return [foldPulseWidth(w - swing), Math.min(50, w + swing)];
}

// Pitch: how far the LFO bends notes, as −1..1 of an octave (the bar's travel); the LFO's
// pitch depth is in cents (up to 1200)
export function lfoBendAt(depthCents: number, norm: number): number {
	return clamp((clamp(norm, -1, 1) * depthCents) / 1200, -1, 1);
}
export const lfoBendRange = (depthCents: number) => (depthCents > 0 ? Math.min(1, depthCents / 1200) : null);

// FM: the FM card's Amount at LFO position `norm`. The engine swings the modulator's deviation
// (the Amount times its frequency) by ±Depth %, so the Amount swings the same way.
export function lfoFmAmountAt(amount: number, depthPct: number, norm: number): number {
	return Math.max(0, amount * (1 + clamp(norm, -1, 1) * clamp(depthPct, 0, 100) / 100));
}
export function lfoFmAmountRange(amount: number, depthPct: number): [number, number] | null {
	if (!(amount > 0 && depthPct > 0)) return null;
	return [lfoFmAmountAt(amount, depthPct, -1), lfoFmAmountAt(amount, depthPct, 1)];
}

// Level: the volume (on the Vol knob's 0..1 scale) notes play at, at LFO position `norm`: the
// engine's tremolo gain (lfo.ts) times the lane's volume. It swings from full down to
// (100 − Depth) %.
export function lfoLevelAt(volume: number, depthPct: number, norm: number): number {
	const d = clamp(depthPct, 0, 100);
	return volume * (lfoAmpBase(d) + LFO_AMP_TAP * clamp(norm, -1, 1) * d);
}
export function lfoLevelRange(volume: number, depthPct: number): [number, number] | null {
	if (!(volume > 0 && depthPct > 0)) return null;
	return [lfoLevelAt(volume, depthPct, -1), lfoLevelAt(volume, depthPct, 1)];
}

// src/audio/driftPulse.ts
// The Drift machine's Pulse (the plan's item 20): rhythm for the held chords, a gain after
// Drift's level that both engines move from the same events, step by step.
// - A gate (a "trance gate"): 1/4, 1/8 or 1/16, open for the first half of each, then down to
//   1 − Depth; each edge a 4 ms ramp, so it doesn't click. It opens on the steps as they're
//   played, swing included.
// - Duck: a dip at every hit of the Drums machine's slot 1 (its first row), the pumping of a
//   compressor keyed from a kick, but planned from the hits the app already knows rather than
//   listening: on time, the same live and exported. Down to 1 − Depth in 5 ms, back up (a
//   curve: most of the way in the first 40 %) by the next hit or a beat, whichever is sooner.
// Linear (a gain), so Drift's stems still add up. Pure, unit-tested.

import { stepSpan } from './ratchet';
import { nextHitGaps, stepTime } from './reverb/reverse';

export const PULSE_MODES = ['off', '1/4', '1/8', '1/16', 'duck'] as const;
export type PulseMode = typeof PULSE_MODES[number];
export const PULSE_NAMES: Record<PulseMode, string> = { off: 'Off', '1/4': '1/4', '1/8': '1/8', '1/16': '1/16', duck: 'Duck' };
export const clampPulseMode = (x: unknown): PulseMode => ((PULSE_MODES as readonly unknown[]).includes(x) ? (x as PulseMode) : 'off');

// A gate's edge, and Duck's way down
export const PULSE_EDGE_S = 0.004;
export const DUCK_ATTACK_S = 0.005;
const GATE_STEPS: Record<string, number> = { '1/4': 4, '1/8': 2, '1/16': 1 };

/** One change of the gain: `set` jumps to `v` at `at`, else a straight line to `v` by `at`;
 * `at` in seconds after the step's own (unswung) start */
export type PulseEvent = { at: number; v: number; set?: boolean };

/** Whether Pulse does anything */
export const pulseOn = (mode: PulseMode, depth: number) => mode !== 'off' && depth > 0;

/**
 * The events of step `i` of `len`: a gate's edges that start in it, or Duck's dip at a slot 1
 * hit (`hits`: slot 1's steps that sound, this bar's). Nothing for Off or Depth 0.
 */
export function pulseStepEvents(mode: PulseMode, depth: number, i: number, len: number, stepS: number, swing: number,
	hits?: readonly boolean[]): PulseEvent[] {
	const d = Math.max(0, Math.min(1, depth));
	if (!pulseOn(mode, d)) return [];
	const low = 1 - d;
	const s = stepTime(i, stepS, swing) - i * stepS; // where the step sounds (swung)
	if (mode === 'duck') {
		if (!hits?.[i]) return [];
		const gap = nextHitGaps(hits, stepS, swing)[i] ?? len * stepS;
		const r = Math.min(gap, 4 * stepS) * 0.9;
		return [
			{ at: s, v: 1, set: true },
			{ at: s + DUCK_ATTACK_S, v: low },
			{ at: s + 0.4 * r, v: 1 - d * 0.35 },
			{ at: s + r, v: 1 },
		];
	}
	const p = GATE_STEPS[mode] ?? 1;
	if (i % p !== 0) return [];
	// Closes halfway through the gate: half the step for 1/16, else where its middle step sounds
	const close = p === 1 ? s + stepSpan(i, len, stepS, swing) / 2 : stepTime(i + p / 2, stepS, swing) - i * stepS;
	return [
		{ at: s, v: low, set: true },
		{ at: s + PULSE_EDGE_S, v: 1 },
		{ at: close, v: 1, set: true },
		{ at: close + PULSE_EDGE_S, v: low },
	];
}

/** Slot 1's hits that sound: its steps that are on, at a velocity above 0, while it's unmuted */
export function duckHits(row: { steps: readonly boolean[]; velocities: readonly number[] } | undefined, muted: boolean, len: number): boolean[] {
	return Array.from({ length: len }, (_, i) => !muted && !!row?.steps[i] && (row.velocities[i] ?? 1) > 0);
}

/**
 * Applies events to a gain, keeping them in time order: an event before the last one applied
 * (a mode changed while a gate's edge was already planned) is skipped. Returns the last time and
 * value, for the next call.
 */
export function applyPulse(param: AudioParam, base: number, events: PulseEvent[], last: { t: number; v: number }): { t: number; v: number } {
	let { t, v } = last;
	for (const e of events) {
		const at = base + e.at;
		if (at <= t) continue;
		if (e.set) param.setValueAtTime(e.v, at);
		else param.linearRampToValueAtTime(e.v, at);
		t = at;
		v = e.v;
	}
	return { t, v };
}

/** Back to full (Off, or Depth turned to 0, while a gate had it down): a 4 ms ramp from `at` */
export function releasePulse(param: AudioParam, at: number, last: { t: number; v: number }): { t: number; v: number } {
	if (last.v === 1) return last;
	const from = Math.max(at, last.t);
	param.setValueAtTime(last.v, from);
	param.linearRampToValueAtTime(1, from + PULSE_EDGE_S);
	return { t: from + PULSE_EDGE_S, v: 1 };
}

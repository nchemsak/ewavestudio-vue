// REV on the reverb (PR 105): the reverb played backwards. After each hit the reverb rises
// instead of decaying, then cuts off, so the hit is "sucked into" the next one. The swell
// comes after the hit, so it needs no look-ahead: it works live, in the export, with MIDI notes
// and with the stems (it's the reverb's stem).
//
// How long a swell lasts is SWELL (the DECAY knob while REV is on, its caption reading SWELL):
// - Next hit (the default): each hit's swell lasts until the next hit, round the bar's end too
//   (one hit a bar swells for the whole bar). A hit is any machine's that goes through the
//   pedals (PR 126; until then only Rhythm's steps): Rhythm's steps, Bass's notes and Drums'
//   hits, each machine while it's heard and its Pedals is above 0 (`pedalHitSteps()`). Drift
//   has no hits (its chords are held). The engines keep one reversed impulse response per
//   length in use, each behind a gate, and open the hit's own gate as the hit reaches it. A
//   note with no next hit (a MIDI note or a preview while stopped, the one-shot, the hit
//   behind the Envelope card) swells for a beat.
// - Fixed lengths: 1 step, 2 steps, 1 beat, 2 beats, for a steadier pulse.
//
// This file is pure (unit-tested): the lengths, the timing and the impulse response's samples.

import { bassPlan, type BassPattern } from '../bass';
import type { DrumRow } from '../drums';

export type SwellOption = { id: string; label: string; steps: number | null }; // steps: 1/16 notes

// In the order of the knob's positions
export const SWELLS: readonly SwellOption[] = [
	{ id: 'next', label: 'Next hit', steps: null },
	{ id: '1/16', label: '1 step', steps: 1 },
	{ id: '1/8', label: '2 steps', steps: 2 },
	{ id: '1/4', label: '1 beat', steps: 4 },
	{ id: '1/2', label: '2 beats', steps: 8 },
];

export const DEFAULT_SWELL = 'next';
// A note with no next hit swells for a beat
export const FALLBACK_STEPS = 4;
// The impulse response's shortest and longest
export const REV_MIN_S = 0.02;
export const REV_MAX_S = 6;
// Its last moments fade out, so the cut makes no click
export const REV_FADE_S = 0.004;

export const isSwell = (id: unknown): id is string => typeof id === 'string' && SWELLS.some((s) => s.id === id);

export const swellLabel = (id: string) => SWELLS.find((s) => s.id === id)?.label ?? SWELLS[0].label;

// How far a step starts after the bar's start, with swing (every second step later, as the
// engines play it)
export function stepTime(index: number, stepS: number, swing: number): number {
	return index * stepS + (index % 2 === 1 ? stepS * swing : 0);
}

// For each step that's on, the time until the next step that's on (round the bar's end; a lone
// hit's own next play, a bar on); null for the steps that are off
export function nextHitGaps(active: readonly boolean[], stepS: number, swing: number): (number | null)[] {
	const n = active.length;
	return active.map((on, i) => {
		if (!on) return null;
		for (let k = 1; k <= n; k++) {
			const j = (i + k) % n;
			// (a bar has an even number of steps, so step i + k is swung as step j is)
			if (active[j]) return stepTime(i + k, stepS, swing) - stepTime(i, stepS, swing);
		}
		return null;
	});
}

// A swell's length in seconds: SWELL's own, or for Next hit the gap to the next hit (none: a beat)
export function swellSeconds(id: string, stepS: number, gapS?: number | null): number {
	const steps = SWELLS.find((s) => s.id === id)?.steps;
	if (steps != null) return steps * stepS;
	return gapS != null && gapS > 0 ? gapS : FALLBACK_STEPS * stepS;
}

// The impulse response's length: the swell's, within its limits
export function revIrSeconds(swellS: number): number {
	return Math.max(REV_MIN_S, Math.min(REV_MAX_S, swellS));
}

// What REV's Next hit counts as a hit: a machine's, while it's heard and some of it goes
// through the pedals (Pedals above 0; missing: all of it). Each list is per step.
export type RevMachines = {
	rhythm?: { steps: readonly boolean[]; velocities?: readonly number[]; muted?: boolean; pedals?: number };
	bass?: { pattern: BassPattern; muted?: boolean; pedals?: number };
	drums?: { rows: readonly DrumRow[]; slotMuted?: readonly boolean[]; muted?: boolean; pedals?: number };
};

const throughPedals = (m: { muted?: boolean; pedals?: number } | undefined) =>
	!!m && !m.muted && (m.pedals ?? 1) > 0;

// Per step of a bar of n, whether any machine has a hit there that goes through the pedals:
// Rhythm's steps that are on (at a velocity above 0), the steps a Bass note starts on (not
// those it's tied or slid into: bassPlan), and any unmuted Drums slot's steps that are on
export function pedalHitSteps(m: RevMachines, n: number): boolean[] {
	const hits = Array<boolean>(n).fill(false);
	const r = m.rhythm;
	if (throughPedals(r)) {
		for (let i = 0; i < n; i++) if (r.steps[i] && (r.velocities?.[i] ?? 1) > 0) hits[i] = true;
	}
	const b = m.bass;
	if (throughPedals(b)) {
		bassPlan(b.pattern, n).forEach((h, i) => { if (h && h.vel > 0) hits[i] = true; });
	}
	const d = m.drums;
	if (throughPedals(d)) {
		d.rows.forEach((row, slot) => {
			if (d.slotMuted?.[slot] || !row) return;
			for (let i = 0; i < n; i++) if (row.steps[i] && (row.velocities[i] ?? 1) > 0) hits[i] = true;
		});
	}
	return hits;
}

// The reversed response's level, measured against the plain reverb (whose convolver normalizes
// its impulse response, which this one's doesn't): one hit's swell about as loud overall as
// its plain reverb at the same MIX (an export of hits on steps 1 and 5 at 120 BPM: the plain
// reverb's stem 0.023 RMS, REV's 0.31 before this)
export const REV_LEVEL = 0.075;

// The engines keep one impulse response per length in whole ms
export const revKey = (seconds: number) => Math.round(seconds * 1000);

// The reversed impulse response's samples, two channels: smoothed noise rising from −60 dB to
// full over its length (a reverb's tail played backwards), its last REV_FADE_S fading out,
// scaled to the energy of a one-second forward reverb (generateIr.ts) times REV_LEVEL, so
// short and long swells sit at a similar level. Fixed random numbers, so a render is the same every time.
export function reverseIrChannels(seconds: number, sampleRate: number, seed = 4242): Float32Array[] {
	const length = Math.max(1, Math.round(seconds * sampleRate));
	const tau = seconds / Math.log(1000);
	const fade = Math.max(1, Math.min(Math.round(REV_FADE_S * sampleRate), Math.floor(length / 4)));
	const out: Float32Array[] = [];
	let energy = 0;
	for (let ch = 0; ch < 2; ch++) {
		const data = new Float32Array(length);
		let s = (seed + (ch + 1) * 0x9e3779b9) | 0;
		let prev = 0;
		for (let i = 0; i < length; i++) {
			s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
			const white = ((s >>> 0) / 4294967296) * 2 - 1;
			prev += 0.12 * (white - prev);
			const t = i / sampleRate;
			let v = prev * Math.exp(-(seconds - t) / tau);
			const left = length - 1 - i;
			if (left < fade) v *= left / fade;
			data[i] = v;
			energy += v * v;
		}
		out.push(data);
	}
	// A one-second forward reverb's energy per channel: the smoothed noise's power (0.12 / 1.88
	// of white noise's 1/3) over its envelope's (tau / 2)
	const target = 2 * (1 / 3) * (0.12 / 1.88) * (1 / Math.log(1000) / 2) * sampleRate;
	const k = energy > 0 ? REV_LEVEL * Math.sqrt(target / energy) : 0;
	for (const d of out) for (let i = 0; i < d.length; i++) d[i] *= k;
	return out;
}

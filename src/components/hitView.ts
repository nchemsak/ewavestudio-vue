// src/components/hitView.ts
// One hit of the current sound (PR 94: the big screen at rest; since PR 108 drawn faintly
// behind the Envelope card's curve, cardViews.ts): the one-shot the Export dialog would make
// (renderHit() in src/audio/export/exportFiles.ts: full velocity, the key's root in the pads'
// octave, the main wave, effects included, without the tape pedal's hiss). How long to render
// it, its columns on the shape cards' square-root time scale (timeX() in
// src/lib/shapeViews.ts), and its length and peak for screen readers. Tested in hitView.test.ts.

import { xTime } from '../lib/shapeViews';
import type { StepSequencerState } from '../audio/export/scheduleStepSequencer';
import { sampleSeconds, sampleSpan, SAMPLE_WAVE } from '../audio/sample';
import { swellSeconds } from '../audio/reverb/reverse';

// Helpers START

// The longest hit rendered: the one-shot's 6 s
export const HIT_MAX_S = 6;

// How long a hit of `state` may ring, so a short sound isn't rendered for 6 s: the envelope,
// the delay's echoes until they fall to −60 dB, the reverb's pre-delay and decay (or REV's swell), and a little room. On the
// recording (`wave` 'sample' at `hz`), its own length instead of the envelope's.
export function hitSeconds(state: Pick<StepSequencerState, 'synth' | 'fx'> & { bpm?: number }, wave?: string, hz?: number): number {
	const env = state.synth.envelope;
	const rec = wave === SAMPLE_WAVE ? state.synth.sample : null;
	let s = rec ? sampleSpan(sampleSeconds(rec), hz ?? 220, state.synth.sampleLength ?? 1).seconds
		: env.enabled ? (env.attackMs + env.decayMs) / 1000 : 2;
	const d = state.fx.delay;
	if (d.enabled && d.mix > 0) {
		const fb = Math.min(0.95, Math.max(0.01, d.feedback));
		s += d.time * Math.min(60, Math.ceil(Math.log(0.001) / Math.log(fb)) + 1);
	}
	const r = state.fx.reverb;
	// REV swells for SWELL's length (a beat for Next hit: one hit has no next) instead of decaying
	if (r.enabled && r.mix > 0) {
		s += (r.preDelay ?? 0) / 1000 + (r.reverse ? swellSeconds(r.swell ?? 'next', 60 / (state.bpm || 120) / 4, null) : r.decay * 1.2);
	}
	return Math.min(HIT_MAX_S, Math.max(0.3, s + 0.2));
}

// What each of `cols` columns of the plot shows: the lowest and highest sample of either
// channel in its stretch of time (the square-root scale over 0…spanMs). Near the start, where
// a column is a small part of the note's cycle (`period`, in frames), that stretch runs on to
// the next column's first sample, so the columns draw the wave itself as one line; further on,
// at least a whole cycle round the column's middle, so the columns draw its envelope without
// the moiré a column about a cycle wide would make.
export function hitColumns(channels: Float32Array[], sampleRate: number, cols: number, spanMs: number, period = 0):
	{ min: Float32Array; max: Float32Array } {
	const min = new Float32Array(cols);
	const max = new Float32Array(cols);
	const frames = channels[0]?.length ?? 0;
	for (let c = 0; c < cols; c++) {
		let f0 = Math.floor((xTime(c, cols, spanMs) / 1000) * sampleRate);
		let f1 = Math.max(f0 + 1, Math.floor((xTime(c + 1, cols, spanMs) / 1000) * sampleRate) + 1);
		if (period > 0 && f1 - f0 > period / 3) {
			const m = (f0 + f1) / 2;
			f0 = Math.min(f0, Math.floor(m - period / 2));
			f1 = Math.max(f1, Math.ceil(m + period / 2));
		}
		let lo = 0, hi = 0;
		for (let f = Math.max(0, f0); f < Math.min(f1, frames); f++) {
			for (const ch of channels) {
				const v = ch[f];
				if (v < lo) lo = v;
				if (v > hi) hi = v;
			}
		}
		min[c] = lo;
		max[c] = hi;
	}
	return { min, max };
}

// "312 ms", "1.25 s"
export function formatLength(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)} ms`;
	return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

// "−6.2 dB", "0.0 dB", "+1.4 dB" (dBFS), or "silent"
export function formatPeak(peak: number): string {
	if (!(peak > 1e-5)) return 'silent';
	const db = 20 * Math.log10(peak);
	const r = Math.round(db * 10) / 10;
	return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)} dB`;
}

// Helpers END

// What's drawn behind the Envelope card's curve (cardViews.ts)
export type HitPicture = {
	channels: Float32Array[]; // the hit, cut where it fades
	sampleRate: number;
	hz: number;               // its note, for the pads' colour
	title: string;            // "A3 Sine"
};

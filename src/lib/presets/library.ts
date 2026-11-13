// src/lib/presets/library.ts
// The built-in presets (see presets.ts for what a preset sets and how it's applied). Each one
// lists only what it changes from the factory sound, and uses a different part of the synth,
// so together they show what it can do. The comments say what to listen for.
//
// Factory sound, for reference: Envelope attack 20 ms, decay 400 ms; Filter 5000 Hz,
// resonance 0.5, no envelope; Pitch envelope off (0 semitones); no noise, unison, FM, LFO
// depth, velocity routing, delay, drive or reverb.
//
// Knob ranges the values must stay within (a test checks them): Attack 1–100 ms, Decay
// 50–2000 ms, Cutoff 100–10000 Hz, Resonance 0.1–20, filter Env Amt ±5 octaves, Pitch Amount
// 0–48 semitones, envelope decays 5–2000 ms, noise Burst 5–250 ms, FM Amount 0–50 with ratio
// 1 (Lock), 1.5 (Metal), 2 (Bell) or null (Free), Pulse Width 5–50 %, velocity routing only
// on the cutoff, at VELOCITY_SWITCH_AMOUNT (what the Filter card's VEL switch sets, so the
// switch turns it off and on again; the other destinations have no switch since PR 67), Reverb decay 0.2–4 s, Drive tone 100–10000 Hz, mixes and amounts 0–1. The delay's
// feedback has no knob (it stays at 0.3), so presets leave it alone.

import type { SynthPreset } from './presets';
import { VELOCITY_SWITCH_AMOUNT } from '../../audio/velocity';

export const PRESETS: readonly SynthPreset[] = [
	{
		// A sine that drops two octaves fast: a kick on low pads (Octave ↓), a tom or a zap
		// higher up. Drive thickens it.
		id: 'kick',
		label: 'Kick',
		description: 'Kick: a sine that drops two octaves in a flash, with a little drive. Deepest on low pads.',
		wave: 'sine',
		synth: {
			envelope: { attackMs: 1, decayMs: 320 },
			pitchEnv: { semitones: 24, decayMs: 45, mode: 'up' },
		},
		fx: {
			drive: { enabled: true, amount: 0.25, tone: 2500, mix: 0.3 },
		},
	},
	{
		// A short triangle body with a quick pitch drop, and a burst of noise for the snares.
		// The noise skips the effects, so the reverb is on the body only.
		id: 'snare',
		label: 'Snare',
		description: 'Snare: a short triangle body with a snap of noise and a small room.',
		wave: 'triangle',
		synth: {
			envelope: { attackMs: 1, decayMs: 200 },
			filter: { cutoff: 7000 },
			pitchEnv: { semitones: 12, decayMs: 30, mode: 'up' },
			noise: { enabled: true, amount: 0.55, color: 0.6, attackBurst: true, burstMs: 140 },
		},
		fx: {
			reverb: { enabled: true, mix: 0.15, decay: 0.8, tone: 0.6 },
		},
	},
	{
		// A thin pulse frequency-modulated at 3:2 ("Metal") through a ringing filter: cowbell,
		// clank and metal-bar sounds.
		id: 'metal',
		label: 'Metal',
		description: 'Metal: a thin pulse with metallic FM through a ringing filter, like a cowbell or a struck bar.',
		wave: 'pulse',
		synth: {
			envelope: { attackMs: 1, decayMs: 180 },
			filter: { cutoff: 6000, resonance: 4 },
			fm: { enabled: true, ratio: 1.5, index: 5 },
			pulse: { width: 30 },
		},
		fx: {
			reverb: { enabled: true, mix: 0.2, decay: 1.2, tone: 0.7 },
		},
	},
	{
		// Three detuned saws behind a filter that snaps open and closes within 140 ms, with a
		// dotted-eighth echo. Softer steps are darker.
		id: 'pluck',
		label: 'Pluck',
		description: 'Pluck: three detuned saws behind a filter that snaps shut, with a dotted-eighth echo.',
		wave: 'sawtooth',
		synth: {
			envelope: { attackMs: 1, decayMs: 450 },
			filter: { cutoff: 350, resonance: 5, envAmount: 4, envDecayMs: 140 },
			unison: { enabled: true, voices: 3, detuneCents: 8, stereoSpread: 60 },
			velocity: { cutoff: VELOCITY_SWITCH_AMOUNT },
		},
		fx: {
			delay: { enabled: true, division: '1/8.', mix: 0.25 },
		},
	},
	{
		// A square through a resonant filter swept by its envelope, driven hard, with the LFO
		// slowly opening and closing the filter over a bar. Full-velocity steps are the
		// accents: softer steps stay darker.
		id: 'acid',
		label: 'Acid',
		description: 'Acid: a driven square through a squelchy resonant filter that the LFO sweeps over each bar.',
		wave: 'square',
		synth: {
			envelope: { attackMs: 1, decayMs: 260 },
			filter: { cutoff: 500, resonance: 10, envAmount: 3, envDecayMs: 180 },
			lfo: { target: 'filter', depth: 400, division: '1/1' },
			velocity: { cutoff: VELOCITY_SWITCH_AMOUNT },
		},
		fx: {
			drive: { enabled: true, amount: 0.4, tone: 4000, mix: 0.35 },
		},
	},
	{
		// The Glass wave frequency-modulated an octave up ("Bell"), with a long decay and a big
		// reverb.
		id: 'bell',
		label: 'Bell',
		description: 'Bell: glassy FM tones with a long ring and a big reverb.',
		wave: 'glass',
		synth: {
			envelope: { attackMs: 2, decayMs: 1400 },
			filter: { cutoff: 8000 },
			fm: { enabled: true, ratio: 2, index: 2.5 },
		},
		fx: {
			reverb: { enabled: true, mix: 0.3, decay: 2.4, tone: 0.5 },
		},
	},
];

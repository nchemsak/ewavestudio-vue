// src/lib/presets/random.ts
// The Presets panel's dice: a new sound from random settings. It's built as a preset and
// applied like one (applyPreset in presets.ts: from the factory sound up), so it sets the
// sound only, never the pattern, and one roll is one undo step.
//
// Random over every knob would mostly give noise, mud or silence, so this is a recipe for a
// percussion voice in the spirit of the synth: always a short, plucked amp envelope and a
// filter; then, some of the time, a pitch sweep, a filter envelope, noise, FM, unison, the
// LFO, velocity routing and each effect. The ranges keep every roll usable and the level in
// the presets' range: resonance up to 10, drive mix up to 0.35 (the drive saturates to near
// full scale, so its mix sets the level). A browser test renders rolls and checks none is
// silent or clipping.
//
// Values sit on the knobs' own steps (whole ms, Hz and percent; 0.1 for resonance, FM amount
// and the filter's Env Amt), so the panels show them without rounding them.

import type { PresetFx, PresetSynth, SynthPreset } from './presets';
import { WAVE_IDS } from '../../audio/waves';
import { VELOCITY_DESTINATIONS } from '../../audio/velocity';

// 0 ≤ x < 1, like Math.random (the tests pass a seeded one)
export type Rng = () => number;

// The lowest cutoff an opening filter envelope starts from
export const OPEN_FROM_HZ = 150;

export function randomPreset(rng: Rng = Math.random): SynthPreset {
	const chance = (p: number) => rng() < p;
	const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
	// Evenly between lo and hi, on a step such as 10, 1, 0.1, 0.05 or 0.01
	const between = (lo: number, hi: number, step = 1) => {
		const decimals = step >= 1 ? 0 : Math.ceil(-Math.log10(step) - 1e-9);
		return Number((Math.round((lo + rng() * (hi - lo)) / step) * step).toFixed(decimals));
	};
	// Between lo and hi on a log scale (as times and frequencies are heard), whole numbers
	const logBetween = (lo: number, hi: number) => Math.round(lo * (hi / lo) ** rng());

	const wave = pick(WAVE_IDS);
	const decayMs = logBetween(80, 1200);
	const cutoff = logBetween(400, 9000);
	const synth: PresetSynth = {
		envelope: { attackMs: chance(0.8) ? between(1, 5) : between(5, 40), decayMs },
		filter: { cutoff, resonance: chance(0.7) ? between(0.5, 3, 0.1) : between(3, 10, 0.1) },
	};
	const fx: PresetFx = {};

	if (wave === 'pulse') synth.pulse = { width: between(10, 50) };

	// A drum-style pitch sweep, mostly dropping into the note
	if (chance(0.55)) {
		synth.pitchEnv = {
			semitones: between(3, 36),
			decayMs: logBetween(15, 300),
			mode: chance(0.8) ? 'up' : pick(['down', 'random'] as const),
		};
	}

	// The filter's envelope, mostly closing (a pluck). An opening one starts below Cutoff: it
	// starts at 150 Hz or above and has opened before the note has faded, or most of the note
	// is muffled (a roll that did neither was nearly silent)
	if (chance(0.5)) {
		const amount = between(1, 4.5, 0.1);
		const envDecayMs = logBetween(30, 600);
		if (chance(0.75)) {
			synth.filter.envAmount = amount;
			synth.filter.envDecayMs = envDecayMs;
		} else {
			synth.filter.envAmount = -Math.min(amount, Math.floor(Math.log2(cutoff / OPEN_FROM_HZ) * 10) / 10);
			synth.filter.envDecayMs = Math.min(envDecayMs, Math.floor(decayMs * 0.6));
		}
	}

	if (chance(0.3)) {
		synth.noise = {
			enabled: true,
			attackBurst: true, // the Noise panel turns it on with the noise
			amount: between(0.15, 0.6, 0.01),
			color: between(0, 1, 0.01),
			burstMs: between(20, 200),
		};
	}

	// FM at one of the panel's ratios: Lock, Metal or Bell
	if (chance(0.3)) synth.fm = { enabled: true, ratio: pick([1, 1.5, 2]), index: between(0.5, 8, 0.1) };

	// Three voices at most, as phones play
	if (chance(0.2)) {
		synth.unison = { enabled: true, voices: pick([2, 3]), detuneCents: between(4, 25), stereoSpread: between(30, 80) };
	}

	if (chance(0.2)) {
		const target = wave === 'pulse' && chance(0.5) ? 'pwm' : chance(0.6) ? 'filter' : 'pitch';
		synth.lfo = {
			target,
			depth: target === 'filter' ? between(200, 1500, 10) : target === 'pwm' ? between(5, 30) : between(5, 60),
			division: pick(['1/1', '1/2', '1/4', '1/8', '1/16']),
		};
	}

	// Velocity shapes one or two things (most audible with Humanize's shapes)
	if (chance(0.4)) {
		const first = pick(VELOCITY_DESTINATIONS);
		const second = chance(0.5) ? pick(VELOCITY_DESTINATIONS) : first;
		synth.velocity = { [first]: between(30, 80), [second]: between(30, 80) };
	}

	if (chance(0.35)) fx.reverb = { enabled: true, mix: between(0.1, 0.35, 0.01), decay: between(0.6, 3, 0.05), tone: between(0.3, 0.8, 0.01) };
	if (chance(0.25)) fx.delay = { enabled: true, division: pick(['1/16', '1/8', '1/8.', '1/4']), mix: between(0.15, 0.3, 0.01), pingPong: chance(0.4) };
	if (chance(0.2)) fx.drive = { enabled: true, amount: between(0.1, 0.45, 0.01), tone: between(1500, 6000, 10), mix: between(0.15, 0.35, 0.01), crush: chance(0.3) };

	return { id: 'random', label: 'Random', description: 'A random sound', wave, synth, fx };
}

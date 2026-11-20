// src/lib/machines/rhythm.ts
// The Rhythm machine (the synth lane): its sound settings as refs, their factory values, and
// the plain voice note.ts plays. Until PR 113 these refs were declared one by one in
// DrumSequencer.vue, and the factory values written out again in snapshot.ts; the Bass,
// Drums and Drift machines (the plan's items 4–6) each get a file like this one.
//
// The settings' shape is the snapshot's `synth` group (less the key, `tuning`, which is the
// project's): saving, loading and presets read and write them as before.

import { ref, shallowRef, type Ref } from 'vue';
import { LFO_DEFAULT_DEPTH, type LfoTarget } from '../../audio/lfo';
import { divisionToHz } from '../../audio/synthHelpers';
import { clampUnisonVoices, UNISON_DETUNE_DEFAULT, UNISON_SPREAD_DEFAULT, UNISON_VOICES_DEFAULT } from '../../audio/unison';
import { PULSE_WIDTH_DEFAULT, RANDOM_WAVE_IDS, type PadWave } from '../../audio/waves';
import { SAMPLE_LENGTH_DEFAULT, type SampleData } from '../../audio/sample';
import { VELOCITY_DESTINATIONS } from '../../audio/velocity';
import type { VoiceSettings } from '../../audio/note';

type R<T> = Readonly<Ref<T>>;

export type RhythmSettings = {
	envelope: { enabled: Ref<boolean>; attackMs: Ref<number>; decayMs: Ref<number> };
	// envAmount: the filter envelope in octaves (−5..+5, 0 off); envDecayMs: its decay
	filter: { enabled: Ref<boolean>; cutoff: Ref<number>; resonance: Ref<number>; envAmount: Ref<number>; envDecayMs: Ref<number> };
	noise: {
		enabled: Ref<boolean>;
		color: Ref<number>;
		amount: Ref<number>; // 0 = no noise, 1 = full noise
		mask: Ref<boolean[]>; // per step: may this step add noise? (the Noise card's pad buttons)
		attackBurst: Ref<boolean>;
		burstMs: Ref<number>;
	};
	unison: {
		enabled: Ref<boolean>;
		voices: Ref<number>;      // 2–4
		detuneCents: Ref<number>; // 0–100 cents per step
		stereoSpread: Ref<number>; // 0–100 %
		maxVoices: R<number>;     // 3 on phones, 4 elsewhere
	};
	lfo: {
		enabled: Ref<boolean>;
		rate: Ref<number>; // saved, unused since PR 66 (the rate is the division at the tempo)
		depth: Ref<number>; // the current target's
		// Each target's depth as last set (the current target's is `depth`): switching
		// target recalls it (chooseLfoTarget in DrumSequencer.vue)
		depths: Ref<Record<LfoTarget, number>>;
		target: Ref<LfoTarget>;
		waveform: Ref<'sine' | 'square'>;
		sync: Ref<boolean>; // saved, unused since PR 66
		division: Ref<string>;
		retrigger: Ref<boolean>;
		bipolar: Ref<boolean>; // saved, unused
	};
	fm: { enabled: Ref<boolean>; modFreq: Ref<number>; index: Ref<number>; ratio: Ref<number | null> };
	pitchEnv: {
		enabled: Ref<boolean>;
		semitones: Ref<number>;
		decayMs: Ref<number>;
		mode: Ref<'up' | 'down' | 'random'>;
	};
	pulse: { width: Ref<number> }; // the pulse wave's width, % (5–50; 50 is the square)
	// The recorded sound the 'sample' wave plays (src/audio/sample.ts); none by default
	sample: Ref<SampleData | null>;
	// How much of the recording a pad plays, 0.05–1 (the strip's Length knob; 1 = all of it)
	sampleLength: Ref<number>;
	// The waves the Waveforms card's Random picks from (the tiles' dice badges, and the
	// Sample strip's, PR 100); all by default
	randomWaves: Ref<PadWave[]>;
	// Velocity routing amounts, % −100..100 (src/audio/velocity.ts; 0 = off)
	velocity: { decay: Ref<number>; cutoff: Ref<number>; pitchEnv: Ref<number>; noise: Ref<number> };
};

// The factory sound: a fresh page, File → New, and what every preset starts from
// (resetSoundToFactoryDefaults in snapshot.ts). The recording and its Length aren't part of
// the sound (a preset keeps them), so they're not here.
export const RHYTHM_DEFAULTS = {
	envelope: { enabled: true, attackMs: 20, decayMs: 400 },
	filter: { enabled: true, cutoff: 5000, resonance: 0.5, envAmount: 0, envDecayMs: 200 },
	noise: { enabled: false, color: 0.5, amount: 0.25, attackBurst: false, burstMs: 80 },
	unison: { enabled: false, voices: UNISON_VOICES_DEFAULT, detuneCents: UNISON_DETUNE_DEFAULT, stereoSpread: UNISON_SPREAD_DEFAULT },
	lfo: {
		enabled: true, rate: 5, depth: 0, target: 'pitch' as LfoTarget, waveform: 'sine' as 'sine' | 'square',
		sync: true, division: '1/8', retrigger: false, bipolar: false,
	},
	fm: { enabled: false, modFreq: 200, index: 4.0, ratio: 1 as number | null },
	pitchEnv: { enabled: true, semitones: 0, decayMs: 300, mode: 'up' as 'up' | 'down' | 'random' },
	pulse: { width: PULSE_WIDTH_DEFAULT },
};

// Copies `from`'s values into the refs of `to`, group by group
function assign(to: Record<string, Ref<unknown>>, from: Record<string, unknown>) {
	for (const k of Object.keys(from)) to[k].value = from[k];
}

/** The Rhythm machine's settings, at the factory sound, with `steps` noise-mask steps */
export function createRhythm(o: { maxVoices: R<number>; steps: number }): RhythmSettings {
	const d = RHYTHM_DEFAULTS;
	return {
		envelope: { enabled: ref(d.envelope.enabled), attackMs: ref(d.envelope.attackMs), decayMs: ref(d.envelope.decayMs) },
		filter: {
			enabled: ref(d.filter.enabled), cutoff: ref(d.filter.cutoff), resonance: ref(d.filter.resonance),
			envAmount: ref(d.filter.envAmount), envDecayMs: ref(d.filter.envDecayMs),
		},
		noise: {
			enabled: ref(d.noise.enabled), color: ref(d.noise.color), amount: ref(d.noise.amount),
			mask: ref<boolean[]>(Array(o.steps).fill(true)),
			attackBurst: ref(d.noise.attackBurst), burstMs: ref(d.noise.burstMs),
		},
		unison: {
			enabled: ref(d.unison.enabled), voices: ref(d.unison.voices), detuneCents: ref(d.unison.detuneCents),
			stereoSpread: ref(d.unison.stereoSpread), maxVoices: o.maxVoices,
		},
		lfo: {
			enabled: ref(d.lfo.enabled), rate: ref(d.lfo.rate), depth: ref(d.lfo.depth),
			depths: ref<Record<LfoTarget, number>>({ ...LFO_DEFAULT_DEPTH }),
			target: ref<LfoTarget>(d.lfo.target), waveform: ref<'sine' | 'square'>(d.lfo.waveform),
			sync: ref(d.lfo.sync), division: ref(d.lfo.division), retrigger: ref(d.lfo.retrigger), bipolar: ref(d.lfo.bipolar),
		},
		fm: { enabled: ref(d.fm.enabled), modFreq: ref(d.fm.modFreq), index: ref(d.fm.index), ratio: ref<number | null>(d.fm.ratio) },
		pitchEnv: {
			enabled: ref(d.pitchEnv.enabled), semitones: ref(d.pitchEnv.semitones), decayMs: ref(d.pitchEnv.decayMs),
			mode: ref<'up' | 'down' | 'random'>(d.pitchEnv.mode),
		},
		pulse: { width: ref(d.pulse.width) },
		sample: shallowRef<SampleData | null>(null),
		sampleLength: ref(SAMPLE_LENGTH_DEFAULT),
		randomWaves: ref<PadWave[]>([...RANDOM_WAVE_IDS]),
		velocity: { decay: ref(0), cutoff: ref(0), pitchEnv: ref(0), noise: ref(0) },
	};
}

/** Back to the factory sound (the noise mask, the recording and its Length are left as they are) */
export function resetRhythmSound(r: RhythmSettings) {
	const d = RHYTHM_DEFAULTS;
	assign(r.envelope, d.envelope);
	assign(r.filter, d.filter);
	assign(r.noise, d.noise);
	assign(r.unison, d.unison);
	assign(r.lfo, d.lfo);
	r.lfo.depths.value = { ...LFO_DEFAULT_DEPTH };
	assign(r.fm, d.fm);
	assign(r.pitchEnv, d.pitchEnv);
	assign(r.pulse, d.pulse);
	r.randomWaves.value = [...RANDOM_WAVE_IDS];
	for (const k of VELOCITY_DESTINATIONS) r.velocity[k].value = 0;
}

/** The voice note.ts plays (playNote), from the settings now; the LFO's rate is its division at `tempo` */
export function rhythmVoice(r: RhythmSettings, tempo: number): VoiceSettings {
	return {
		envelope: { enabled: r.envelope.enabled.value, attackMs: r.envelope.attackMs.value, decayMs: r.envelope.decayMs.value },
		filter: {
			enabled: r.filter.enabled.value, cutoff: r.filter.cutoff.value, resonance: r.filter.resonance.value,
			envAmount: r.filter.envAmount.value, envDecayMs: r.filter.envDecayMs.value,
		},
		noise: {
			enabled: r.noise.enabled.value, color: r.noise.color.value, amount: r.noise.amount.value,
			attackBurst: r.noise.attackBurst.value, burstMs: r.noise.burstMs.value,
		},
		unison: {
			enabled: r.unison.enabled.value,
			voices: Math.min(r.unison.maxVoices.value, clampUnisonVoices(r.unison.voices.value)),
			detuneCents: r.unison.detuneCents.value, stereoSpread: r.unison.stereoSpread.value,
		},
		lfo: {
			enabled: r.lfo.enabled.value, target: r.lfo.target.value, waveform: r.lfo.waveform.value,
			depth: r.lfo.depth.value, rateHz: divisionToHz(r.lfo.division.value, tempo), retrigger: r.lfo.retrigger.value,
		},
		fm: { enabled: r.fm.enabled.value, modFreq: r.fm.modFreq.value, index: r.fm.index.value, ratio: r.fm.ratio.value },
		pitchEnv: {
			enabled: r.pitchEnv.enabled.value, semitones: r.pitchEnv.semitones.value,
			decayMs: r.pitchEnv.decayMs.value, mode: r.pitchEnv.mode.value,
		},
		pulse: { width: r.pulse.width.value },
		sampleLength: r.sampleLength.value,
		velocity: {
			decay: r.velocity.decay.value, cutoff: r.velocity.cutoff.value,
			pitchEnv: r.velocity.pitchEnv.value, noise: r.velocity.noise.value,
		},
	};
}

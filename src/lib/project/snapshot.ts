// src/lib/project/snapshot.ts
// A project's settings as a plain object (a "snapshot"), and back. DrumSequencer.vue owns the
// settings as refs and passes them in grouped like the snapshot (ProjectState). These
// functions only read and write those refs: no store, no storage, no page, so they can be
// unit-tested in Node. useProjectSync.ts connects them to the project store.
//
// Snapshot shape: { meta, ui, transport, synth, fx, instruments[], melody, selectedWaveform }.
// Saved projects must keep loading: applySnapshot() treats a missing or wrongly typed field as
// "keep the current value". A new parameter goes into buildSnapshot, applySnapshot and the
// factory defaults below (a sound setting into resetSoundToFactoryDefaults, which presets use
// too), and, if it affects sound, into the live and export engines; see CLAUDE.md.

import { isLfoTarget, lfoDepthsFrom, LFO_DEFAULT_DEPTH, type LfoTarget } from '../../audio/lfo';
import type { Ref } from 'vue';
import { clampUnisonVoices, UNISON_DETUNE_DEFAULT, UNISON_SPREAD_DEFAULT, UNISON_VOICES_DEFAULT, UNISON_VOICES_MIN } from '../../audio/unison';
import { DEFAULT_DELAY_DIVISION, DEFAULT_TEMPO, divisionForTime, isDelayDivision, syncedDelaySeconds } from '../delaySync';

type R<T> = Readonly<Ref<T>>;

export type KeyRoot = 'C' | 'C#' | 'D' | 'Eb' | 'E' | 'F' | 'F#' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';

// The synth's waveforms (src/audio/waves.ts): the oscillator's own four, the pulse and three
// harmonic shapes. Saved projects may hold any name; an unknown one plays as a sine.
import type { Wave } from '../../audio/waves';
import { PULSE_WIDTH_DEFAULT, foldPulseWidth } from '../../audio/waves';
import { VELOCITY_DESTINATIONS } from '../../audio/velocity';
import { clampRatchet, clampRepeatNotes } from '../../audio/ratchet';
export type { Wave };

// One sequencer lane. Only 'synth-voice' is visible; the sample lanes are hidden (see CLAUDE.md).
export type Instrument = {
	name: string;
	label: string;
	type: 'synth' | 'sample';
	isCustom: boolean;
	isEditingName?: boolean;
	buffer?: AudioBuffer | null;
	muted: boolean;
	channelVolume: number;
	steps: boolean[];
	velocities: number[];
	pitches?: number[];
	waveforms?: string[];
	ratchets?: number[]; // per step: 1 hit, or 2–4 quick hits (src/audio/ratchet.ts); synth lane only
	repeatNotes?: string[]; // per step: what the repeats play, 'same' | 'up' | 'down' (ratchet.ts); synth lane only
	inputRef?: HTMLInputElement | null;
};

// Melody Maker settings (MelodyMaker.vue reports each change; see CLAUDE.md)
export type MelodyUi = {
	keyRoot: KeyRoot;
	keyScale: 'none' | 'major' | 'naturalMinor' | 'pentMajor' | 'pentMinor' | 'dorian' | 'lydian' | 'mixolydian';
	rangePreset: 'low' | 'mid' | 'high' | 'wide';
	arpPattern: 'up' | 'down' | 'updown' | 'random';
	arpRate: '1/4' | '1/8' | '1/16';
	arpOctaves: 1 | 2 | 3;
	arpTones: 'chord' | 'scale';
	mode: 'random' | 'arp'; // what Generate makes: random notes or an arpeggio
};

// Every setting a project saves, as the component's refs, grouped like the snapshot. The live
// engine (liveEngine.ts) is given the same groups. Read-only refs are derived values that
// applying or resetting needs.
export type ProjectState = {
	ui: {
		currentTheme: Ref<string>;
		stepLength: Ref<number>;
		collapsibleState: Record<string, boolean | undefined>; // reactive
		seqOpen: Ref<boolean>;
	};
	transport: { volume: Ref<number>; tempo: Ref<number>; swing: Ref<number> };
	synth: {
		envelope: { enabled: Ref<boolean>; attackMs: Ref<number>; decayMs: Ref<number> };
		// envAmount: the filter envelope in octaves (−5..+5, 0 off); envDecayMs: its decay
		filter: { enabled: Ref<boolean>; cutoff: Ref<number>; resonance: Ref<number>; envAmount: Ref<number>; envDecayMs: Ref<number> };
		noise: {
			enabled: Ref<boolean>;
			color: Ref<number>;
			amount: Ref<number>;
			mask: Ref<boolean[]>;
			attackBurst: Ref<boolean>;
			burstMs: Ref<number>;
		};
		unison: {
			enabled: Ref<boolean>;
			voices: Ref<number>;
			detuneCents: Ref<number>;
			stereoSpread: Ref<number>;
			maxVoices: R<number>; // 3 on phones, 6 elsewhere
		};
		lfo: {
			enabled: Ref<boolean>;
			rate: Ref<number>;
			depth: Ref<number>; // the current target's
			// Each target's depth as last set (the current target's is `depth`): switching
			// target recalls it (chooseLfoTarget in DrumSequencer.vue)
			depths: Ref<Record<LfoTarget, number>>;
			target: Ref<LfoTarget>;
			waveform: Ref<'sine' | 'square'>;
			sync: Ref<boolean>;
			division: Ref<string>;
			retrigger: Ref<boolean>;
			bipolar: Ref<boolean>;
		};
		fm: { enabled: Ref<boolean>; modFreq: Ref<number>; index: Ref<number>; ratio: Ref<number | null> };
		pitchEnv: {
			enabled: Ref<boolean>;
			semitones: Ref<number>;
			decayMs: Ref<number>;
			mode: Ref<'up' | 'down' | 'random'>;
		};
		pulse: { width: Ref<number> }; // the pulse wave's width, % (5–50; 50 is the square)
		// Velocity routing amounts, % −100..100 (src/audio/velocity.ts; 0 = off)
		velocity: { decay: Ref<number>; cutoff: Ref<number>; pitchEnv: Ref<number>; noise: Ref<number> };
		tuning: {
			selectedKeyRoot: Ref<KeyRoot>;
			globalOctaveOffset: Ref<number>;
			currentDefaultHz: R<number>; // an untouched pad's pitch, from the two above
		};
	};
	fx: {
		delay: {
			enabled: Ref<boolean>;
			sync: Ref<boolean>;
			division: Ref<string>; // TIME knob's note division (delaySync.ts)
			time: Ref<number>; // seconds; with sync on, the division at the tempo
			feedback: Ref<number>;
			mix: Ref<number>;
			toneEnabled: Ref<boolean>;
			toneHz: Ref<number>;
			toneType: Ref<'lowpass' | 'highpass'>;
			pingPong: Ref<boolean>; // echoes alternate left and right
		};
		drive: { enabled: Ref<boolean>; type: Ref<string>; amount: Ref<number>; tone: Ref<number>; mix: Ref<number>; crush: Ref<boolean> };
		reverb: { enabled: Ref<boolean>; mix: Ref<number>; decay: Ref<number>; tone: Ref<number> };
	};
	instruments: Ref<Instrument[]>;
	melody: MelodyUi; // reactive
	selectedWaveform: Ref<Wave>;
	// Resizes every lane's step arrays (and the noise mask) to the step count
	setStepLength: () => void;
};

// The settings under the names they have in DrumSequencer.vue, so the functions below read
// the same as they did there
function byName(st: ProjectState) {
	const { synth: sy, fx } = st;
	return {
		currentTheme: st.ui.currentTheme,
		stepLength: st.ui.stepLength,
		collapsibleState: st.ui.collapsibleState,
		seqOpen: st.ui.seqOpen,
		setStepLength: st.setStepLength,
		volume: st.transport.volume,
		tempo: st.transport.tempo,
		swing: st.transport.swing,
		envelopeEnabled: sy.envelope.enabled,
		ampEnvAttackMs: sy.envelope.attackMs,
		ampEnvDecayMs: sy.envelope.decayMs,
		filterEnabled: sy.filter.enabled,
		filterCutoff: sy.filter.cutoff,
		filterResonance: sy.filter.resonance,
		filterEnvAmount: sy.filter.envAmount,
		filterEnvDecayMs: sy.filter.envDecayMs,
		noiseEnabled: sy.noise.enabled,
		noiseColor: sy.noise.color,
		noiseAmount: sy.noise.amount,
		noiseMask: sy.noise.mask,
		noiseAttackBurst: sy.noise.attackBurst,
		noiseBurstMs: sy.noise.burstMs,
		unisonEnabled: sy.unison.enabled,
		unisonVoices: sy.unison.voices,
		detuneCents: sy.unison.detuneCents,
		stereoSpread: sy.unison.stereoSpread,
		unisonMaxVoices: sy.unison.maxVoices,
		lfoEnabled: sy.lfo.enabled,
		lfoRate: sy.lfo.rate,
		lfoDepth: sy.lfo.depth,
		lfoDepths: sy.lfo.depths,
		lfoTarget: sy.lfo.target,
		lfoWaveform: sy.lfo.waveform,
		lfoSync: sy.lfo.sync,
		lfoDivision: sy.lfo.division,
		lfoRetrigger: sy.lfo.retrigger,
		lfoBipolar: sy.lfo.bipolar,
		fmEnabled: sy.fm.enabled,
		fmModFreq: sy.fm.modFreq,
		fmIndex: sy.fm.index,
		fmRatio: sy.fm.ratio,
		pitchEnvEnabled: sy.pitchEnv.enabled,
		pitchEnvSemitones: sy.pitchEnv.semitones,
		pitchEnvDecayMs: sy.pitchEnv.decayMs,
		pitchMode: sy.pitchEnv.mode,
		pulseWidth: sy.pulse.width,
		velocityRouting: sy.velocity,
		selectedKeyRoot: sy.tuning.selectedKeyRoot,
		globalOctaveOffset: sy.tuning.globalOctaveOffset,
		currentDefaultHz: sy.tuning.currentDefaultHz,
		delayEnabled: fx.delay.enabled,
		delaySync: fx.delay.sync,
		delayDivision: fx.delay.division,
		delayTime: fx.delay.time,
		delayFeedback: fx.delay.feedback,
		delayMix: fx.delay.mix,
		delayToneEnabled: fx.delay.toneEnabled,
		delayToneHz: fx.delay.toneHz,
		delayToneType: fx.delay.toneType,
		delayPingPong: fx.delay.pingPong,
		driveEnabled: fx.drive.enabled,
		driveType: fx.drive.type,
		driveAmount: fx.drive.amount,
		driveTone: fx.drive.tone,
		driveMix: fx.drive.mix,
		driveCrush: fx.drive.crush,
		reverbEnabled: fx.reverb.enabled,
		reverbMix: fx.reverb.mix,
		reverbDecay: fx.reverb.decay,
		reverbTone: fx.reverb.tone,
		instruments: st.instruments,
		melodyUi: st.melody,
		selectedWaveform: st.selectedWaveform,
	};
}

// Build START

// All saved settings as a plain, serializable object
export function buildSnapshot(st: ProjectState) {
	const {
		currentTheme, stepLength, collapsibleState, seqOpen, setStepLength,
		volume, tempo, swing,
		envelopeEnabled, ampEnvAttackMs, ampEnvDecayMs,
		filterEnabled, filterCutoff, filterResonance, filterEnvAmount, filterEnvDecayMs,
		noiseEnabled, noiseColor, noiseAmount, noiseMask, noiseAttackBurst, noiseBurstMs,
		unisonEnabled, unisonVoices, detuneCents, stereoSpread, unisonMaxVoices,
		lfoEnabled, lfoRate, lfoDepth, lfoDepths, lfoTarget, lfoWaveform, lfoSync, lfoDivision, lfoRetrigger, lfoBipolar,
		fmEnabled, fmModFreq, fmIndex, fmRatio,
		pitchEnvEnabled, pitchEnvSemitones, pitchEnvDecayMs, pitchMode, pulseWidth, velocityRouting,
		selectedKeyRoot, globalOctaveOffset, currentDefaultHz,
		delayEnabled, delaySync, delayDivision, delayTime, delayFeedback, delayMix, delayToneEnabled, delayToneHz, delayToneType, delayPingPong,
		driveEnabled, driveType, driveAmount, driveTone, driveMix, driveCrush,
		reverbEnabled, reverbMix, reverbDecay, reverbTone,
		instruments, melodyUi, selectedWaveform,
	} = byName(st);

	return {
		meta: {

		},
		ui: {
			currentTheme: currentTheme.value,
			stepLength: stepLength.value,
			collapsibleState: JSON.parse(JSON.stringify(collapsibleState)),
			seqOpen: seqOpen.value,
		},
		transport: {
			volume: volume.value,
			tempo: tempo.value,
			swing: swing.value,
		},
		synth: {
			envelope: {
				enabled: envelopeEnabled.value,
				attackMs: ampEnvAttackMs.value,
				decayMs: ampEnvDecayMs.value,
			},
			filter: {
				enabled: filterEnabled.value,
				cutoff: filterCutoff.value,
				resonance: filterResonance.value,
				envAmount: filterEnvAmount.value,
				envDecayMs: filterEnvDecayMs.value,
			},
			noise: {
				enabled: noiseEnabled.value,
				type: 'legacy',
				color: noiseColor.value,
				amount: noiseAmount.value,
				mask: [...noiseMask.value],
				attackBurst: noiseAttackBurst.value,
				burstMs: noiseBurstMs.value,
			},
			unison: {
				enabled: unisonEnabled.value,
				voices: unisonVoices.value,
				detuneCents: detuneCents.value,
				stereoSpread: stereoSpread.value,
			},
			lfo: {
				enabled: lfoEnabled.value,
				rate: lfoRate.value,
				depth: lfoDepth.value,
				// The current target's entry is always the knob's own depth
				depths: { ...lfoDepths.value, [lfoTarget.value]: lfoDepth.value },
				target: lfoTarget.value,
				waveform: lfoWaveform.value,
				sync: lfoSync.value,
				division: lfoDivision.value,
				retrigger: lfoRetrigger.value,
				bipolar: lfoBipolar.value,
			},
			fm: {
				enabled: fmEnabled.value,
				modFreq: fmModFreq.value,
				index: fmIndex.value,
				ratio: fmRatio.value,
			},
			pitchEnv: {
				enabled: pitchEnvEnabled.value,
				semitones: pitchEnvSemitones.value,
				decayMs: pitchEnvDecayMs.value,
				mode: pitchMode.value
			},
			pulse: { width: pulseWidth.value },
			velocity: {
				decay: velocityRouting.decay.value,
				cutoff: velocityRouting.cutoff.value,
				pitchEnv: velocityRouting.pitchEnv.value,
				noise: velocityRouting.noise.value,
			},
			tuning: {
				selectedKeyRoot: selectedKeyRoot.value,
				globalOctaveOffset: globalOctaveOffset.value,
			}
		},
		fx: {
			delay: {
				enabled: delayEnabled.value,
				sync: delaySync.value,
				division: delayDivision.value,
				time: delayTime.value,
				feedback: delayFeedback.value,
				mix: delayMix.value,
				toneEnabled: delayToneEnabled.value,
				toneHz: delayToneHz.value,
				toneType: delayToneType.value,
				pingPong: delayPingPong.value,
			},
			drive: {
				enabled: driveEnabled.value,
				type: driveType.value,
				amount: driveAmount.value,
				tone: driveTone.value,
				mix: driveMix.value,
				crush: driveCrush.value,
			},
			reverb: {
				enabled: reverbEnabled.value,
				mix: reverbMix.value,
				decay: reverbDecay.value,
				tone: reverbTone.value,
			},

		},
		instruments: instruments.value.map(i => ({
			name: i.name,
			label: i.label,
			type: i.type,
			isCustom: i.isCustom,
			muted: i.muted,
			channelVolume: i.channelVolume,
			steps: [...i.steps],
			velocities: [...i.velocities],
			pitches: i.pitches ? [...i.pitches] : null,
			waveforms: (i as any).waveforms ? [...(i as any).waveforms] : null,
			ratchets: i.ratchets ? [...i.ratchets] : null,
			repeatNotes: i.repeatNotes ? [...i.repeatNotes] : null,
		})),

		// melodyUi mirrors the Melody Maker panel, which reports every change through events
		melody: {
			keyRoot: melodyUi.keyRoot,
			keyScale: melodyUi.keyScale,
			rangePreset: melodyUi.rangePreset,
			arpPattern: melodyUi.arpPattern,
			arpRate: melodyUi.arpRate,
			arpOctaves: melodyUi.arpOctaves,
			arpTones: melodyUi.arpTones,
			mode: melodyUi.mode,
		},

		selectedWaveform: selectedWaveform.value,
	};
}

export type ProjectSnapshot = ReturnType<typeof buildSnapshot>;

// Build END

// Apply START

// Restore settings from a snapshot (a saved or imported project). Missing parts are left as
// they are, so older projects still load.
export function applySnapshot(st: ProjectState, s: any) {
	const {
		currentTheme, stepLength, collapsibleState, seqOpen, setStepLength,
		volume, tempo, swing,
		envelopeEnabled, ampEnvAttackMs, ampEnvDecayMs,
		filterEnabled, filterCutoff, filterResonance, filterEnvAmount, filterEnvDecayMs,
		noiseEnabled, noiseColor, noiseAmount, noiseMask, noiseAttackBurst, noiseBurstMs,
		unisonEnabled, unisonVoices, detuneCents, stereoSpread, unisonMaxVoices,
		lfoEnabled, lfoRate, lfoDepth, lfoDepths, lfoTarget, lfoWaveform, lfoSync, lfoDivision, lfoRetrigger, lfoBipolar,
		fmEnabled, fmModFreq, fmIndex, fmRatio,
		pitchEnvEnabled, pitchEnvSemitones, pitchEnvDecayMs, pitchMode, pulseWidth, velocityRouting,
		selectedKeyRoot, globalOctaveOffset, currentDefaultHz,
		delayEnabled, delaySync, delayDivision, delayTime, delayFeedback, delayMix, delayToneEnabled, delayToneHz, delayToneType, delayPingPong,
		driveEnabled, driveType, driveAmount, driveTone, driveMix, driveCrush,
		reverbEnabled, reverbMix, reverbDecay, reverbTone,
		instruments, melodyUi, selectedWaveform,
	} = byName(st);

	if (!s || typeof s !== 'object') return;

	// UI
	if (s.ui) {
		if (typeof s.ui.currentTheme === 'string') currentTheme.value = s.ui.currentTheme;
		setStepLength();
		if (s.ui.seqOpen != null) seqOpen.value = !!s.ui.seqOpen;
		if (s.ui.collapsibleState) {
			Object.keys(collapsibleState).forEach((k) => {
				if (k in s.ui.collapsibleState) (collapsibleState as any)[k] = !!s.ui.collapsibleState[k];
			});
		}
	}

	// Transport
	if (s.transport) {
		if (typeof s.transport.volume === 'number') volume.value = s.transport.volume;
		if (typeof s.transport.tempo === 'number') tempo.value = s.transport.tempo;
		if (typeof s.transport.swing === 'number') swing.value = s.transport.swing;
	}

	// Synth core
	const syn = s.synth || {};
	if (syn.envelope) {
		envelopeEnabled.value = !!syn.envelope.enabled;
		if (typeof syn.envelope.attackMs === 'number') ampEnvAttackMs.value = syn.envelope.attackMs;
		if (typeof syn.envelope.decayMs === 'number') ampEnvDecayMs.value = syn.envelope.decayMs;
	}
	if (syn.filter) {
		filterEnabled.value = !!syn.filter.enabled;
		if (typeof syn.filter.cutoff === 'number') filterCutoff.value = syn.filter.cutoff;
		if (typeof syn.filter.resonance === 'number') filterResonance.value = syn.filter.resonance;
		// Projects saved before the filter envelope: none (0 octaves), default decay
		filterEnvAmount.value = typeof syn.filter.envAmount === 'number' ? Math.max(-5, Math.min(5, syn.filter.envAmount)) : 0;
		filterEnvDecayMs.value = typeof syn.filter.envDecayMs === 'number' ? syn.filter.envDecayMs : 200;
	}

	if (syn.noise) {
		noiseEnabled.value = !!syn.noise.enabled;

		if (typeof syn.noise.color === 'number') {
			noiseColor.value = Math.max(0, Math.min(1, syn.noise.color));
		} else {
			const legacy = (syn.noise.type || '').toLowerCase();
			const map: Record<string, number> = { brown: 0.0, pink: 0.25, white: 0.5, blue: 0.75, violet: 1.0 };
			noiseColor.value = map[legacy] ?? 0.5;
		}

		if (typeof syn.noise.amount === 'number') {
			noiseAmount.value = syn.noise.amount;
		}

		if (Array.isArray(syn.noise.mask)) {
			const len = stepLength.value;
			const src = syn.noise.mask as boolean[];
			noiseMask.value = (src.length === len)
				? [...src]
				: [...src.slice(0, len), ...Array(Math.max(0, len - src.length)).fill(true)];
		} else if (!noiseMask.value?.length) {
			noiseMask.value = Array(stepLength.value).fill(true);
		}
		if (typeof syn.noise.attackBurst === 'boolean') noiseAttackBurst.value = syn.noise.attackBurst;
		if (typeof syn.noise.burstMs === 'number') noiseBurstMs.value = syn.noise.burstMs;
	}

	if (syn.unison) {
		unisonEnabled.value = !!syn.unison.enabled;
		if (typeof syn.unison.voices === 'number') {
			// 2–4 voices (unison.ts), and no more than this device plays. One voice with unison
			// on sounded the same as off (before PR 52 the knob went down to 1), so it opens off,
			// with the default count for when it's turned on; 5 or 6 open as 4.
			if (syn.unison.voices < UNISON_VOICES_MIN) {
				unisonEnabled.value = false;
				unisonVoices.value = Math.min(unisonMaxVoices.value, UNISON_VOICES_DEFAULT);
			} else {
				unisonVoices.value = Math.min(unisonMaxVoices.value, clampUnisonVoices(syn.unison.voices));
			}
		}
		if (typeof syn.unison.detuneCents === 'number') detuneCents.value = syn.unison.detuneCents;
		if (typeof syn.unison.stereoSpread === 'number') stereoSpread.value = syn.unison.stereoSpread;
	}
	if (syn.lfo) {
		lfoEnabled.value = !!syn.lfo.enabled;
		if (typeof syn.lfo.rate === 'number') lfoRate.value = syn.lfo.rate;
		if (typeof syn.lfo.depth === 'number') lfoDepth.value = syn.lfo.depth;

		if (syn.lfo.target) {
			lfoTarget.value = isLfoTarget(syn.lfo.target) ? syn.lfo.target : 'pitch';
		}

		// Saved since PR 65; a project from before gets the defaults for the other targets
		lfoDepths.value = lfoDepthsFrom(syn.lfo.depths);

		if (syn.lfo.waveform) lfoWaveform.value = syn.lfo.waveform;
		if (typeof syn.lfo.sync === 'boolean') lfoSync.value = syn.lfo.sync;
		if (syn.lfo.division) lfoDivision.value = syn.lfo.division;
		if (typeof syn.lfo.retrigger === 'boolean') lfoRetrigger.value = syn.lfo.retrigger;
		if (typeof syn.lfo.bipolar === 'boolean') lfoBipolar.value = syn.lfo.bipolar;
	}
	if (syn.fm) {
		fmEnabled.value = !!syn.fm.enabled;
		if (typeof syn.fm.modFreq === 'number') fmModFreq.value = syn.fm.modFreq;
		if (typeof syn.fm.index === 'number') fmIndex.value = syn.fm.index;
		fmRatio.value = syn.fm.ratio ?? fmRatio.value;
	}
	if (syn.pitchEnv) {
		pitchEnvEnabled.value = !!syn.pitchEnv.enabled;
		if (typeof syn.pitchEnv.semitones === 'number') pitchEnvSemitones.value = syn.pitchEnv.semitones;
		if (typeof syn.pitchEnv.decayMs === 'number') pitchEnvDecayMs.value = syn.pitchEnv.decayMs;
		if (syn.pitchEnv.mode) pitchMode.value = syn.pitchEnv.mode;
	}
	if (typeof syn.pulse?.width === 'number') {
		// 5–50%; a width above 50% (older projects) becomes its mirror, which sounds the same
		pulseWidth.value = foldPulseWidth(syn.pulse.width);
	} else if (!syn.pulse && syn.envelope) {
		// A whole project saved before the pulse wave: the default width (a square)
		pulseWidth.value = PULSE_WIDTH_DEFAULT;
	}
	if (syn.velocity && typeof syn.velocity === 'object') {
		for (const k of VELOCITY_DESTINATIONS) {
			const v = syn.velocity[k];
			if (typeof v === 'number') velocityRouting[k].value = Math.max(-100, Math.min(100, v));
		}
	} else if (syn.envelope) {
		// A whole project saved before velocity routing: none
		for (const k of VELOCITY_DESTINATIONS) velocityRouting[k].value = 0;
	}
	if (syn.tuning) {
		if (typeof syn.tuning.selectedKeyRoot === 'string') (selectedKeyRoot as any).value = syn.tuning.selectedKeyRoot;
		if (typeof syn.tuning.globalOctaveOffset === 'number') globalOctaveOffset.value = syn.tuning.globalOctaveOffset;
	}

	// FX
	if (s.fx?.delay) {
		delayEnabled.value = !!s.fx.delay.enabled;
		delaySync.value = !!s.fx.delay.sync;
		if (typeof s.fx.delay.time === 'number') delayTime.value = s.fx.delay.time;
		// Projects saved before the division was saved: the division that matches the saved
		// time at the project's tempo, else the default (as the TIME knob showed)
		const d = s.fx.delay.division;
		delayDivision.value = isDelayDivision(d) ? d : (divisionForTime(delayTime.value, tempo.value) ?? DEFAULT_DELAY_DIVISION);
		// With sync on, the time is the division's at the tempo (older projects could hold a
		// time that didn't match the knob)
		if (delaySync.value) delayTime.value = syncedDelaySeconds(tempo.value, delayDivision.value);
		if (typeof s.fx.delay.feedback === 'number') delayFeedback.value = s.fx.delay.feedback;
		if (typeof s.fx.delay.mix === 'number') delayMix.value = s.fx.delay.mix;
		delayToneEnabled.value = !!s.fx.delay.toneEnabled;
		if (typeof s.fx.delay.toneHz === 'number') delayToneHz.value = s.fx.delay.toneHz;
		if (typeof s.fx.delay.toneType === 'string') delayToneType.value = s.fx.delay.toneType;
		delayPingPong.value = s.fx.delay.pingPong === true; // older projects: off
	}
	if (s.fx?.drive) {
		driveEnabled.value = !!s.fx.drive.enabled;
		if (s.fx.drive.type) driveType.value = s.fx.drive.type;
		if (typeof s.fx.drive.amount === 'number') driveAmount.value = s.fx.drive.amount;
		if (typeof s.fx.drive.tone === 'number') driveTone.value = s.fx.drive.tone;
		if (typeof s.fx.drive.mix === 'number') driveMix.value = s.fx.drive.mix;
		driveCrush.value = s.fx.drive.crush === true; // older projects: off
	}
	if (s.fx?.reverb) {
		reverbEnabled.value = !!s.fx.reverb.enabled;
		if (typeof s.fx.reverb.mix === 'number') reverbMix.value = s.fx.reverb.mix;
		if (typeof s.fx.reverb.decay === 'number') reverbDecay.value = s.fx.reverb.decay;
		if (typeof s.fx.reverb.tone === 'number') reverbTone.value = s.fx.reverb.tone;
	}

	if (s.melody) {
		if (s.melody.keyRoot) melodyUi.keyRoot = s.melody.keyRoot;
		if (s.melody.keyScale) melodyUi.keyScale = s.melody.keyScale;
		if (s.melody.rangePreset) melodyUi.rangePreset = s.melody.rangePreset;

		// Also keep arp aligned if present
		if (s.melody.arpPattern) melodyUi.arpPattern = s.melody.arpPattern;
		if (s.melody.arpRate) melodyUi.arpRate = s.melody.arpRate;
		if (s.melody.arpOctaves) melodyUi.arpOctaves = s.melody.arpOctaves;
		if (s.melody.arpTones) melodyUi.arpTones = s.melody.arpTones;
		// Projects saved before PR 39 have no mode: Generate keeps what it was
		if (s.melody.mode === 'random' || s.melody.mode === 'arp') melodyUi.mode = s.melody.mode;
		// The Melody Maker panel follows these through its initial-* props
	}

	// Instruments
	if (Array.isArray(s.instruments) && s.instruments.length) {
		// keep buffers on existing sample instruments; only copy serializable fields
		const mapByName = new Map<string, any>(s.instruments.map((i: any) => [i.name, i]));
		instruments.value.forEach((inst) => {
			const from = mapByName.get(inst.name);
			if (!from) return;
			inst.label = from.label ?? inst.label;
			inst.isCustom = !!from.isCustom;
			inst.muted = !!from.muted;
			inst.channelVolume = typeof from.channelVolume === 'number' ? from.channelVolume : inst.channelVolume;

			if (Array.isArray(from.steps)) inst.steps = [...from.steps];
			if (Array.isArray(from.velocities)) inst.velocities = [...from.velocities];
			if (Array.isArray(from.pitches)) (inst as any).pitches = [...from.pitches];
			if (Array.isArray(from.waveforms)) (inst as any).waveforms = [...from.waveforms];
			// Ratchets (the synth lane): projects saved before them play one hit per step
			if (inst.ratchets) {
				inst.ratchets = Array.isArray(from.ratchets)
					? from.ratchets.map(clampRatchet)
					: Array(inst.ratchets.length).fill(1);
			}
			// What the repeats play (PR 58): projects saved before it play the pad's note each hit
			if (inst.repeatNotes) {
				inst.repeatNotes = Array.isArray(from.repeatNotes)
					? from.repeatNotes.map(clampRepeatNotes)
					: Array(inst.repeatNotes.length).fill('same');
			}
		});

		// If there are saved *custom* instruments that don't exist yet, append them
		s.instruments.forEach((from: any) => {
			const exists = instruments.value.find(i => i.name === from.name);
			if (!exists && from.isCustom) {
				instruments.value.push({
					name: from.name,
					label: from.label ?? from.name,
					type: 'sample',
					isCustom: true,
					isEditingName: false,
					buffer: null,
					muted: !!from.muted,
					channelVolume: typeof from.channelVolume === 'number' ? from.channelVolume : 0.5,
					steps: Array.isArray(from.steps) ? [...from.steps] : Array(stepLength.value).fill(false),
					velocities: Array.isArray(from.velocities) ? [...from.velocities] : Array(stepLength.value).fill(1),
				} as any);
			}
		});
	}


	if (typeof s.selectedWaveform === 'string') selectedWaveform.value = s.selectedWaveform as any;
}

// Apply END

// Factory defaults START

// Every saved setting back to its default, as for File → New. These values must match the
// refs' starting values in DrumSequencer.vue (a browser test checks that they do).
export function resetToFactoryDefaults(st: ProjectState) {
	const {
		currentTheme, stepLength, collapsibleState, seqOpen, setStepLength,
		volume, tempo, swing,
		noiseMask,
		selectedKeyRoot, globalOctaveOffset, currentDefaultHz,
		instruments, melodyUi, selectedWaveform,
	} = byName(st);

	currentTheme.value = '';
	seqOpen.value = false;
	(Object.keys(collapsibleState) as Array<keyof typeof collapsibleState>)
		.forEach((k) => { collapsibleState[k] = undefined; });

	// grid length
	setStepLength();

	// transport (first: the synced delay time below follows the tempo)
	volume.value = 0.75;
	tempo.value = DEFAULT_TEMPO;
	swing.value = 0;

	// synth and effects
	resetSoundToFactoryDefaults(st);
	noiseMask.value = Array(stepLength.value).fill(true);

	selectedKeyRoot.value = 'A';
	globalOctaveOffset.value = 0;

	melodyUi.keyRoot = 'A';
	melodyUi.keyScale = 'none';
	melodyUi.rangePreset = 'wide';
	melodyUi.arpPattern = 'up';
	melodyUi.arpRate = '1/16';
	melodyUi.arpOctaves = 1;
	melodyUi.arpTones = 'chord';
	melodyUi.mode = 'random';

	// instruments
	instruments.value.forEach((i: any) => {
		i.muted = false;
		i.channelVolume = 0.5;
		i.steps = Array(stepLength.value).fill(false);
		i.velocities = Array(stepLength.value).fill(1);
		if (i.pitches) i.pitches = Array(stepLength.value).fill(currentDefaultHz.value);
		if (i.waveforms) i.waveforms = Array(stepLength.value).fill('sine');
		if (i.ratchets) i.ratchets = Array(stepLength.value).fill(1);
		if (i.repeatNotes) i.repeatNotes = Array(stepLength.value).fill('same');
	});
	// remove custom channels
	for (let idx = instruments.value.length - 1; idx >= 0; idx--) {
		if ((instruments.value[idx] as any).isCustom) instruments.value.splice(idx, 1);
	}

	selectedWaveform.value = 'sine';
}

// The sound back to its defaults: every synth and effect setting, except what belongs to the
// pattern (the key and octave, which tune the pads, and which steps get noise) and the wave
// (the main wave and each pad's). File → New uses it, and a preset (src/lib/presets/) starts
// from it. The synced delay time follows the current tempo.
export function resetSoundToFactoryDefaults(st: ProjectState) {
	const {
		tempo,
		envelopeEnabled, ampEnvAttackMs, ampEnvDecayMs,
		filterEnabled, filterCutoff, filterResonance, filterEnvAmount, filterEnvDecayMs,
		noiseEnabled, noiseColor, noiseAmount, noiseAttackBurst, noiseBurstMs,
		unisonEnabled, unisonVoices, detuneCents, stereoSpread,
		lfoEnabled, lfoRate, lfoDepth, lfoDepths, lfoTarget, lfoWaveform, lfoSync, lfoDivision, lfoRetrigger, lfoBipolar,
		fmEnabled, fmModFreq, fmIndex, fmRatio,
		pitchEnvEnabled, pitchEnvSemitones, pitchEnvDecayMs, pitchMode, pulseWidth, velocityRouting,
		delayEnabled, delaySync, delayDivision, delayTime, delayFeedback, delayMix, delayToneEnabled, delayToneHz, delayToneType, delayPingPong,
		driveEnabled, driveType, driveAmount, driveTone, driveMix, driveCrush,
		reverbEnabled, reverbMix, reverbDecay, reverbTone,
	} = byName(st);

	envelopeEnabled.value = true;
	ampEnvAttackMs.value = 20;
	ampEnvDecayMs.value = 400;

	filterEnabled.value = true;
	filterCutoff.value = 5000;
	filterResonance.value = 0.5;
	filterEnvAmount.value = 0;
	filterEnvDecayMs.value = 200;

	noiseEnabled.value = false;
	noiseColor.value = 0.5;
	noiseAmount.value = 0.25;
	noiseAttackBurst.value = false;
	noiseBurstMs.value = 80;

	unisonEnabled.value = false;
	unisonVoices.value = UNISON_VOICES_DEFAULT;
	detuneCents.value = UNISON_DETUNE_DEFAULT;
	stereoSpread.value = UNISON_SPREAD_DEFAULT;

	lfoEnabled.value = true;
	lfoRate.value = 5;
	lfoDepth.value = 0;
	lfoDepths.value = { ...LFO_DEFAULT_DEPTH };
	lfoTarget.value = 'pitch';
	lfoWaveform.value = 'sine';
	lfoSync.value = true;
	lfoDivision.value = '1/8';
	lfoRetrigger.value = false;
	lfoBipolar.value = false;

	fmEnabled.value = false;
	fmModFreq.value = 200;
	fmIndex.value = 4.0;
	fmRatio.value = 1;

	pitchEnvEnabled.value = true;
	pitchEnvSemitones.value = 0;
	pitchEnvDecayMs.value = 300;
	pitchMode.value = 'up';
	pulseWidth.value = PULSE_WIDTH_DEFAULT;
	for (const k of VELOCITY_DESTINATIONS) velocityRouting[k].value = 0;

	// FX: Delay
	delayEnabled.value = false;
	delaySync.value = true;
	delayDivision.value = DEFAULT_DELAY_DIVISION;
	delayTime.value = syncedDelaySeconds(tempo.value, DEFAULT_DELAY_DIVISION); // 0.375 s at 120 BPM
	delayFeedback.value = 0.3;
	delayMix.value = 0.3;
	delayToneEnabled.value = true;
	delayToneHz.value = 5000;
	delayToneType.value = 'lowpass';
	delayPingPong.value = false;

	// FX: Drive
	driveEnabled.value = false;
	driveType.value = 'overdrive';
	driveAmount.value = 0.4;
	driveTone.value = 5000;
	driveMix.value = 0.5;
	driveCrush.value = false;

	// FX: Reverb
	reverbEnabled.value = false;
	reverbMix.value = 0.18;
	reverbDecay.value = 1.4;
	reverbTone.value = 0.6;
}

// Factory defaults END

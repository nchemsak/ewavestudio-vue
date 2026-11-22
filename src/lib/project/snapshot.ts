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

import { isLfoTarget, isLfoDivision, lfoDepthsFrom } from '../../audio/lfo';
import type { Ref } from 'vue';
import { resetRhythmSound, type RhythmSettings } from '../machines/rhythm';
import { clampUnisonVoices, UNISON_VOICES_DEFAULT, UNISON_VOICES_MIN } from '../../audio/unison';
import { DEFAULT_DELAY_DIVISION, DEFAULT_TEMPO, divisionForTime, isDelayDivision, syncedDelaySeconds } from '../delaySync';

type R<T> = Readonly<Ref<T>>;

export type KeyRoot = 'C' | 'C#' | 'D' | 'Eb' | 'E' | 'F' | 'F#' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';

// The synth's waveforms (src/audio/waves.ts): the oscillator's own four, the pulse and three
// harmonic shapes. Saved projects may hold any name; an unknown one plays as a sine.
import type { Wave } from '../../audio/waves';
import { PULSE_WIDTH_DEFAULT, RANDOM_WAVE_IDS, WAVE_IDS, foldPulseWidth, type PadWave } from '../../audio/waves';
import { VELOCITY_DESTINATIONS, VELOCITY_SWITCHED } from '../../audio/velocity';
import { clampRatchet, clampRepeatNotes } from '../../audio/ratchet';
import { arpRateFrom, type ArpRate } from '../melody/arp';
import { clampTapeMode, TAPE_DEFAULTS, type TapeMode } from '../../audio/tape';
import { clampSampleLength, sampleFrom, SAMPLE_LENGTH_DEFAULT } from '../../audio/sample';
import { DEFAULT_SWELL, isSwell } from '../../audio/reverb/reverse';
import { DEFAULT_PRE_DIVISION, isPreDivision, preDelayMs, preDivisionForMs } from '../../audio/reverb/preDelay';
import { BASS_FIELDS, chainFrom, emptyChain, emptySlots, slotFromLane, slotIndexFrom, slotsFrom, type Chain, type Slots } from '../patterns/slots';
import { applyBassSound, bassSoundSnapshot, BASS_LEVEL_DEFAULT, resetBassSound, type BassLane, type BassSettings } from '../machines/bass';
import { BASS_MAX_HZ, BASS_MIN_HZ } from '../../audio/bass';
import { applyDrums, drumsSnapshot, resetDrums, type Drums } from '../machines/drums';
export type { Wave };

// The synth lane, 'synth-voice' (the Rhythm machine's pattern as it's being edited). Saved as
// the snapshot's `instruments` list, which held the hidden sample lanes too until PR 120.
export type Instrument = {
	name: string;
	label: string;
	type: 'synth' | 'sample';
	isCustom: boolean;
	isEditingName?: boolean;
	muted: boolean;
	channelVolume: number;
	steps: boolean[];
	velocities: number[];
	pitches?: number[];
	waveforms?: string[];
	ratchets?: number[]; // per step: 1 hit, or 2–4 quick hits (src/audio/ratchet.ts); synth lane only
	repeatNotes?: string[]; // per step: what the repeats play, 'same' | 'up' | 'down' (ratchet.ts); synth lane only
};

// Melody Maker settings (MelodyMaker.vue reports each change; see CLAUDE.md)
export type MelodyUi = {
	keyRoot: KeyRoot;
	keyScale: 'none' | 'major' | 'naturalMinor' | 'pentMajor' | 'pentMinor' | 'dorian' | 'lydian' | 'mixolydian';
	rangePreset: 'low' | 'mid' | 'high' | 'wide';
	arpPattern: 'up' | 'down' | 'updown' | 'random';
	arpRate: ArpRate;
	arpOctaves: 1 | 2 | 3;
	arpTones: 'chord' | 'seventh' | 'scale';
	arpSkip: boolean;    // the arpeggio's Skip (every other tone), on the card since PR 68
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
	// The Rhythm machine's settings (src/lib/machines/rhythm.ts), and the project's key
	synth: RhythmSettings & {
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
		// PRE (src/audio/reverb/preDelay.ts): preDivision, the knob's note value ('Off', '1/16' …);
		// preDelay, its time in ms at the tempo (what the engines read)
		reverb: { enabled: Ref<boolean>; mix: Ref<number>; decay: Ref<number>; tone: Ref<number>; preDivision: Ref<string>; preDelay: Ref<number>;
			// REV (src/audio/reverb/reverse.ts): the reverb backwards, each swell SWELL long
			reverse: Ref<boolean>; swell: Ref<string> };
		// The tape pedal, last in the chain (src/audio/tape.ts): age and wobble 0..1
		tape: { enabled: Ref<boolean>; age: Ref<number>; wobble: Ref<number>; mode: Ref<TapeMode> };
	};
	instruments: Ref<Instrument[]>;
	// Patterns A–D (src/lib/patterns/slots.ts): the four slots and which one plays (0–3). The
	// synth lane is the current slot as it's being edited; its entry in `slots` is filled in
	// from the lane when another slot is picked and when a snapshot is built.
	// The chain (PR 110): eight cells, each a slot or null, and whether playing follows it
	patterns: { slots: Ref<Slots>; current: Ref<number>; chain: Ref<Chain>; chainOn: Ref<boolean> };
	// The Bass machine (src/lib/machines/bass.ts): its sound, and its lane (the current slot's
	// Bass track as it's being edited, with the machine's mute and level), reactive
	bass: { sound: BassSettings; lane: BassLane };
	// The Drums machine (src/lib/machines/drums.ts): its slots, kept sounds, mute, level and
	// Pedals, and its rows (the current slot's Drums track as it's being edited), reactive
	drums: Drums;
	// The rail's mixer (PR 116): Rhythm's Pedals, how much of it goes through the pedals 0..1
	// (Bass's is its lane's `pedals`)
	mixer: { rhythmPedals: Ref<number> };
	melody: MelodyUi; // reactive
	selectedWaveform: Ref<PadWave>;
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
		sample: sy.sample,
		sampleLength: sy.sampleLength,
		randomWaves: sy.randomWaves,
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
		reverbPreDivision: fx.reverb.preDivision,
		reverbPreDelay: fx.reverb.preDelay,
		reverbReverse: fx.reverb.reverse,
		reverbSwell: fx.reverb.swell,
		tapeEnabled: fx.tape.enabled,
		tapeAge: fx.tape.age,
		tapeWobble: fx.tape.wobble,
		tapeMode: fx.tape.mode,
		instruments: st.instruments,
		patternSlots: st.patterns.slots,
		currentSlot: st.patterns.current,
		chain: st.patterns.chain,
		chainOn: st.patterns.chainOn,
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
		pitchEnvEnabled, pitchEnvSemitones, pitchEnvDecayMs, pitchMode, pulseWidth, sample, sampleLength, randomWaves, velocityRouting,
		selectedKeyRoot, globalOctaveOffset, currentDefaultHz,
		delayEnabled, delaySync, delayDivision, delayTime, delayFeedback, delayMix, delayToneEnabled, delayToneHz, delayToneType, delayPingPong,
		driveEnabled, driveType, driveAmount, driveTone, driveMix, driveCrush,
		reverbEnabled, reverbMix, reverbDecay, reverbTone, reverbPreDivision, reverbPreDelay, reverbReverse, reverbSwell,
		tapeEnabled, tapeAge, tapeWobble, tapeMode,
		instruments, patternSlots, currentSlot, chain, chainOn, melodyUi, selectedWaveform,
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
			sample: sample.value,
			sampleLength: sampleLength.value,
			randomWaves: [...randomWaves.value],
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
				preDivision: reverbPreDivision.value,
				preDelay: reverbPreDelay.value,
				reverse: reverbReverse.value,
				swell: reverbSwell.value,
			},
			tape: {
				enabled: tapeEnabled.value,
				age: tapeAge.value,
				wobble: tapeWobble.value,
				mode: tapeMode.value,
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

		// Patterns A–D: the current slot is the synth lane as it is now
		patterns: {
			current: currentSlot.value,
			slots: patternSlots.value.map((slot, idx) => {
				if (idx !== currentSlot.value) return slot ? JSON.parse(JSON.stringify(slot)) : null;
				const lane = instruments.value.find(i => i.name === 'synth-voice');
				return lane ? slotFromLane(lane, currentDefaultHz.value, st.bass.lane, st.drums.rows) : null;
			}),
			chain: [...chain.value],
			chainOn: chainOn.value,
		},

		// The Bass machine: its sound, mute and level, and its lane (the current slot's Bass track)
		bass: {
			sound: bassSoundSnapshot(st.bass.sound),
			muted: st.bass.lane.muted,
			level: st.bass.lane.level,
			pedals: st.bass.lane.pedals,
			lane: Object.fromEntries(BASS_FIELDS.map((f) => [f, [...st.bass.lane[f]]])) as Record<(typeof BASS_FIELDS)[number], any[]>,
		},

		// The Drums machine: its slots, kept sounds, mute, level, Pedals and rows
		drums: drumsSnapshot(st.drums),

		// The rail's mixer: Rhythm's Pedals (Bass's is in `bass`)
		mixer: { rhythm: { pedals: st.mixer.rhythmPedals.value } },

		// melodyUi mirrors the Melody Maker panel, which reports every change through events
		melody: {
			keyRoot: melodyUi.keyRoot,
			keyScale: melodyUi.keyScale,
			rangePreset: melodyUi.rangePreset,
			arpPattern: melodyUi.arpPattern,
			arpRate: melodyUi.arpRate,
			arpOctaves: melodyUi.arpOctaves,
			arpTones: melodyUi.arpTones,
			arpSkip: melodyUi.arpSkip,
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
		pitchEnvEnabled, pitchEnvSemitones, pitchEnvDecayMs, pitchMode, pulseWidth, sample, sampleLength, randomWaves, velocityRouting,
		selectedKeyRoot, globalOctaveOffset, currentDefaultHz,
		delayEnabled, delaySync, delayDivision, delayTime, delayFeedback, delayMix, delayToneEnabled, delayToneHz, delayToneType, delayPingPong,
		driveEnabled, driveType, driveAmount, driveTone, driveMix, driveCrush,
		reverbEnabled, reverbMix, reverbDecay, reverbTone, reverbPreDivision, reverbPreDelay, reverbReverse, reverbSwell,
		tapeEnabled, tapeAge, tapeWobble, tapeMode,
		instruments, patternSlots, currentSlot, chain, chainOn, melodyUi, selectedWaveform,
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
		// Only a division the Rate knob has (an unknown one would play, but the knob couldn't show it)
		if (isLfoDivision(syn.lfo.division)) lfoDivision.value = syn.lfo.division;
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
	if ('sample' in syn) {
		// The recording (a damaged one is dropped); a preset keeps it (applyPreset passes it on)
		sample.value = sampleFrom(syn.sample);
	} else if (syn.envelope) {
		// A whole project saved without one
		sample.value = null;
	}
	if (typeof syn.sampleLength === 'number') {
		sampleLength.value = clampSampleLength(syn.sampleLength);
	} else if (syn.envelope) {
		// A whole project saved before Length (PR 100): the whole recording, as before
		sampleLength.value = SAMPLE_LENGTH_DEFAULT;
	}
	if (Array.isArray(syn.randomWaves)) {
		// Known waves only, in the tiles' order; none lit is allowed (Random then picks from all).
		// A project saved before the recording could be in it (PR 100) keeps it out.
		randomWaves.value = RANDOM_WAVE_IDS.filter((w) => syn.randomWaves.includes(w));
	} else if (syn.envelope) {
		// A whole project saved before the pool was saved (PR 85): every wave, as a fresh page
		randomWaves.value = [...RANDOM_WAVE_IDS];
	}
	if (syn.velocity && typeof syn.velocity === 'object') {
		for (const k of VELOCITY_DESTINATIONS) {
			const v = syn.velocity[k];
			if (typeof v === 'number') velocityRouting[k].value = Math.max(-100, Math.min(100, v));
		}
		// Only Filter has a VEL switch since PR 67: an amount for Decay, the pitch sweep or the
		// noise (an older project's, a preset's) would play with no switch to show or undo it
		for (const k of VELOCITY_DESTINATIONS) if (!VELOCITY_SWITCHED.includes(k)) velocityRouting[k].value = 0;
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
		// PRE: its note value; a project from PR 103 has only ms (the nearest value), older ones
		// neither (Off)
		const pd = s.fx.reverb.preDivision;
		reverbPreDivision.value = isPreDivision(pd) ? pd : preDivisionForMs(s.fx.reverb.preDelay, tempo.value);
		// REV: off in a project saved before it; an unknown length is Next hit
		reverbReverse.value = s.fx.reverb.reverse === true;
		reverbSwell.value = isSwell(s.fx.reverb.swell) ? s.fx.reverb.swell : DEFAULT_SWELL;
	}
	reverbPreDelay.value = preDelayMs(tempo.value, reverbPreDivision.value); // always the value at the tempo
	if (s.fx?.tape || s.fx?.delay || s.fx?.drive || s.fx?.reverb) {
		// The tape pedal: a project saved before it (it has the other pedals, not this one)
		// gets it off, at its starting values
		const t = s.fx.tape;
		const knob = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
		tapeEnabled.value = t?.enabled === true;
		tapeAge.value = knob(t?.age, TAPE_DEFAULTS.age);
		tapeWobble.value = knob(t?.wobble, TAPE_DEFAULTS.wobble);
		tapeMode.value = clampTapeMode(t?.mode);
	}

	if (s.melody) {
		if (s.melody.keyRoot) melodyUi.keyRoot = s.melody.keyRoot;
		if (s.melody.keyScale) melodyUi.keyScale = s.melody.keyScale;
		// Range is Narrow or Wide since PR 76: Low, Mid and High (the same two octaves, an octave
		// apart; Pattern Tools' Octave arrows do that) open as Narrow, saved as 'mid'
		if (s.melody.rangePreset) melodyUi.rangePreset = s.melody.rangePreset === 'wide' ? 'wide' : 'mid';

		// Also keep arp aligned if present
		if (s.melody.arpPattern) melodyUi.arpPattern = s.melody.arpPattern;
		{ const r = arpRateFrom(s.melody.arpRate); if (r) melodyUi.arpRate = r; }
		if (s.melody.arpOctaves) melodyUi.arpOctaves = s.melody.arpOctaves;
		if (['chord', 'seventh', 'scale'].includes(s.melody.arpTones)) melodyUi.arpTones = s.melody.arpTones;
		// Saved since PR 68 (the ⋯ menu's toggles weren't): a project from before gets the defaults
		melodyUi.arpSkip = typeof s.melody.arpSkip === 'boolean' ? s.melody.arpSkip : false;
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
		// The old sample lanes (kick, snare, hihat and user-loaded ones, hidden since long before
		// PR 120 removed them) aren't loaded: their steps go into the Drums rows below
	}


	// The Bass machine (the plan's item 4): a project saved before it has none (an empty lane,
	// the factory sound)
	const bassHz = bassDefaultHz(currentDefaultHz.value);
	if (s.bass && typeof s.bass === 'object') {
		applyBassSound(st.bass.sound, s.bass.sound);
		if (typeof s.bass.muted === 'boolean') st.bass.lane.muted = s.bass.muted;
		if (typeof s.bass.level === 'number' && Number.isFinite(s.bass.level)) st.bass.lane.level = Math.min(1, Math.max(0, s.bass.level));
		// Pedals (PR 116): a project from PR 115 has none, all through them as it played
		st.bass.lane.pedals = typeof s.bass.pedals === 'number' && Number.isFinite(s.bass.pedals) ? Math.min(1, Math.max(0, s.bass.pedals)) : 1;
		applyBassLane(st.bass.lane, s.bass.lane, stepLength.value, bassHz);
	} else if (Array.isArray(s.instruments) && s.instruments.length) {
		resetBass(st, stepLength.value, bassHz);
	}

	// The Drums machine (the plan's item 5): a project saved before it has none (the kit in its
	// slots, empty rows)
	if (s.drums && typeof s.drums === 'object') applyDrums(st.drums, s.drums, stepLength.value);
	else if (Array.isArray(s.instruments) && s.instruments.length) {
		resetDrums(st.drums, stepLength.value);
		drumsFromOldLanes(st.drums, s.instruments, stepLength.value);
	}

	// The rail's mixer (PR 116): a project from before plays Rhythm all through the pedals
	const rp = s.mixer?.rhythm?.pedals;
	if (typeof rp === 'number' && Number.isFinite(rp)) st.mixer.rhythmPedals.value = Math.min(1, Math.max(0, rp));
	else if (Array.isArray(s.instruments) && s.instruments.length) st.mixer.rhythmPedals.value = 1;

	// Patterns A–D (PR 109): a project saved before them has its pattern in A, B–D empty. The
	// current slot's pattern is the lane's (above), as it always was.
	if (s.patterns && typeof s.patterns === 'object') {
		patternSlots.value = slotsFrom(s.patterns.slots, stepLength.value, currentDefaultHz.value, bassHz);
		currentSlot.value = slotIndexFrom(s.patterns.current);
		// The chain (PR 110): a project from PR 109 has none
		chain.value = chainFrom(s.patterns.chain);
		chainOn.value = s.patterns.chainOn === true;
	} else if (Array.isArray(s.instruments) && s.instruments.length) {
		patternSlots.value = emptySlots();
		currentSlot.value = 0;
		chain.value = emptyChain();
		chainOn.value = false;
	}

	if (typeof s.selectedWaveform === 'string') selectedWaveform.value = s.selectedWaveform as any;
}

// The Bass lane's default note: the key's root two octaves under the pads' (A1, 55 Hz), in its range
export function bassDefaultHz(padHz: number) {
	let hz = padHz / 4;
	while (hz > BASS_MAX_HZ) hz /= 2;
	while (hz < BASS_MIN_HZ) hz *= 2;
	return hz;
}

// A saved Bass lane into the lane, its lists fitted to n steps
function applyBassLane(lane: BassLane, from: any, n: number, hz: number) {
	if (!from || typeof from !== 'object') return;
	const fit = <T,>(a: unknown, fill: T, each: (x: unknown) => T) => {
		const arr = Array.isArray(a) ? a : [];
		return Array.from({ length: n }, (_, i) => (i < arr.length ? each(arr[i]) : fill));
	};
	const num = (d: number, lo: number, hi: number) => (x: unknown) =>
		(typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
	lane.steps = fit(from.steps, false, (x) => x === true);
	lane.velocities = fit(from.velocities, 1, num(1, 0, 1));
	lane.pitches = fit(from.pitches, hz, num(hz, BASS_MIN_HZ / 2, BASS_MAX_HZ * 2));
	lane.accents = fit(from.accents, false, (x) => x === true);
	lane.slides = fit(from.slides, false, (x) => x === true);
	lane.ties = fit(from.ties, false, (x) => x === true);
}

// The Bass machine back to File → New's: its sound, an empty lane, unmuted at its level
function resetBass(st: ProjectState, n: number, hz: number) {
	resetBassSound(st.bass.sound);
	const lane = st.bass.lane;
	lane.muted = false;
	lane.level = BASS_LEVEL_DEFAULT;
	lane.pedals = 1;
	lane.steps = Array(n).fill(false);
	lane.velocities = Array(n).fill(1);
	lane.pitches = Array(n).fill(hz);
	lane.accents = Array(n).fill(false);
	lane.slides = Array(n).fill(false);
	lane.ties = Array(n).fill(false);
}

// Apply END

// Factory defaults START

// Every saved setting back to its default, as for File → New. These values must match the
// refs' starting values in DrumSequencer.vue (a browser test checks that they do).
export function resetToFactoryDefaults(st: ProjectState) {
	const {
		currentTheme, stepLength, collapsibleState, seqOpen, setStepLength,
		volume, tempo, swing,
		noiseMask, sample, sampleLength,
		selectedKeyRoot, globalOctaveOffset, currentDefaultHz,
		instruments, patternSlots, currentSlot, chain, chainOn, melodyUi, selectedWaveform,
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
	// The recording goes with the project (a sound preset keeps it, so it isn't in the above),
	// and so does how much of it plays
	sample.value = null;
	sampleLength.value = SAMPLE_LENGTH_DEFAULT;

	selectedKeyRoot.value = 'A';
	globalOctaveOffset.value = 0;

	melodyUi.keyRoot = 'A';
	melodyUi.keyScale = 'naturalMinor';
	melodyUi.rangePreset = 'mid';
	melodyUi.arpPattern = 'up';
	melodyUi.arpRate = '1/16';
	melodyUi.arpOctaves = 1;
	melodyUi.arpTones = 'chord';
	melodyUi.arpSkip = false;
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
	patternSlots.value = emptySlots();
	currentSlot.value = 0;
	chain.value = emptyChain();
	chainOn.value = false;
	resetBass(st, stepLength.value, bassDefaultHz(currentDefaultHz.value));
	resetDrums(st.drums, stepLength.value);
	st.mixer.rhythmPedals.value = 1;

	selectedWaveform.value = 'sine';
}

// The old hidden sample lanes (removed in PR 120): a project from before the Drums machine whose
// kick, snare or hihat lane has steps on gets them in the Drums rows (Kick, Snare, Hat), with
// their velocities and mutes; the custom lanes' samples were never saved, so they're dropped
const OLD_LANE_ROWS: Record<string, number> = { kick: 0, snare: 1, hihat: 3 };
export function drumsFromOldLanes(drums: Drums, lanes: any[], n: number) {
	for (const lane of lanes) {
		const row = OLD_LANE_ROWS[lane?.name];
		if (row === undefined || !Array.isArray(lane.steps) || !lane.steps.some(Boolean)) continue;
		drums.rows[row] = {
			steps: Array.from({ length: n }, (_, i) => lane.steps[i] === true),
			velocities: Array.from({ length: n }, (_, i) => {
				const v = lane.velocities?.[i];
				return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
			}),
		};
		if (lane.muted === true) drums.slots[row].muted = true;
	}
}

// The sound back to its defaults: every synth and effect setting, except what belongs to the
// pattern (the key and octave, which tune the pads, and which steps get noise) and the wave
// (the main wave and each pad's). File → New uses it, and a preset (src/lib/presets/) starts
// from it. The synced delay time follows the current tempo.
export function resetSoundToFactoryDefaults(st: ProjectState) {
	const {
		tempo,
		delayEnabled, delaySync, delayDivision, delayTime, delayFeedback, delayMix, delayToneEnabled, delayToneHz, delayToneType, delayPingPong,
		driveEnabled, driveType, driveAmount, driveTone, driveMix, driveCrush,
		reverbEnabled, reverbMix, reverbDecay, reverbTone, reverbPreDivision, reverbPreDelay, reverbReverse, reverbSwell,
		tapeEnabled, tapeAge, tapeWobble, tapeMode,
	} = byName(st);

	// The synth: the Rhythm machine's factory sound (src/lib/machines/rhythm.ts)
	resetRhythmSound(st.synth);

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
	reverbPreDivision.value = DEFAULT_PRE_DIVISION;
	reverbPreDelay.value = 0;
	reverbReverse.value = false;
	reverbSwell.value = DEFAULT_SWELL;

	// FX: Tape
	tapeEnabled.value = false;
	tapeAge.value = TAPE_DEFAULTS.age;
	tapeWobble.value = TAPE_DEFAULTS.wobble;
	tapeMode.value = TAPE_DEFAULTS.mode;
}

// Factory defaults END

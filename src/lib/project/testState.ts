// src/lib/project/testState.ts
// For unit tests only (snapshot.test.ts, presets.test.ts): settings shaped like
// DrumSequencer's ProjectState, with helpers to reset, change and read them. Not used by the app.

import { encodeSample } from '../../audio/sample';
import { emptyChain, emptyRhythm, emptySlots, type Chain, type Slots } from '../patterns/slots';
import { ref, reactive, computed } from 'vue';
import { createBass } from '../machines/bass';
import { createDrums } from '../machines/drums';
import { createDrift } from '../machines/drift';
import { createMix } from '../machines/mix';
import {
	buildSnapshot,
	resetToFactoryDefaults,
	type ProjectState,
	type Instrument,
	type KeyRoot,
	type Wave,
} from './snapshot';

export const STEPS = 16;
const lane = (name: string, type: Instrument['type'], extra: Partial<Instrument> = {}): Instrument => ({
	name, label: name, type, isCustom: false, muted: true, channelVolume: 0.9,
	steps: Array(STEPS).fill(true), velocities: Array(STEPS).fill(0.3), ...extra,
});

// Settings like DrumSequencer's, filled with arbitrary values. fresh() resets them to the
// factory defaults, as File → New does.
export function makeState(maxVoices = 4): ProjectState { // 4 on a computer, 3 on a phone
	const stepLength = ref(STEPS);
	const selectedKeyRoot = ref<KeyRoot>('C');
	const globalOctaveOffset = ref(2);
	const instruments = ref<Instrument[]>([
		lane('synth-voice', 'synth', { pitches: Array(STEPS).fill(1), waveforms: Array(STEPS).fill('square'), ratchets: Array(STEPS).fill(2), repeatNotes: Array(STEPS).fill('same') }),
	]);
	const noiseMask = ref<boolean[]>(Array(STEPS).fill(false));
	const resize = <T,>(arr: T[], fill: T) =>
		(arr.length < STEPS ? [...arr, ...Array(STEPS - arr.length).fill(fill)] : arr.slice(0, STEPS));
	return {
		ui: {
			currentTheme: ref('x'),
			stepLength,
			collapsibleState: reactive<Record<string, boolean | undefined>>({ melody: true, fx: false }),
			seqOpen: ref(true),
		},
		transport: { volume: ref(0.1), tempo: ref(140), swing: ref(0.5) },
		synth: {
			envelope: { enabled: ref(false), attackMs: ref(1), decayMs: ref(2) },
			filter: { enabled: ref(false), cutoff: ref(1), resonance: ref(2), envAmount: ref(3), envDecayMs: ref(9) },
			noise: {
				enabled: ref(true), color: ref(0.9), amount: ref(0.9), mask: noiseMask,
				attackBurst: ref(true), burstMs: ref(5),
			},
			unison: {
				enabled: ref(true), voices: ref(2), detuneCents: ref(1), stereoSpread: ref(1),
				maxVoices: computed(() => maxVoices),
			},
			lfo: {
				enabled: ref(false), rate: ref(1), depth: ref(1), depths: ref({ pitch: 1, filter: 1, pwm: 1, amp: 1, fm: 1 }),
				target: ref('filter'), waveform: ref('square'),
				sync: ref(false), division: ref('1/4'), retrigger: ref(true), bipolar: ref(true),
			},
			fm: { enabled: ref(true), modFreq: ref(1), index: ref(1), ratio: ref(null) },
			pitchEnv: { enabled: ref(false), semitones: ref(5), decayMs: ref(1), mode: ref('down') },
			pulse: { width: ref(7) },
			sample: ref(null),
			sampleLength: ref(0.3),
			randomWaves: ref(['glass']),
			velocity: { decay: ref(1), cutoff: ref(2), pitchEnv: ref(3), noise: ref(4) },
			tuning: {
				selectedKeyRoot,
				globalOctaveOffset,
				// Like the app's: an untouched pad's pitch follows the key and octave
				currentDefaultHz: computed(() => (selectedKeyRoot.value === 'A' ? 220 : 999) * 2 ** globalOctaveOffset.value),
			},
		},
		fx: {
			delay: {
				enabled: ref(true), sync: ref(false), division: ref('1/64'), time: ref(1), feedback: ref(0.9), mix: ref(0.9),
				toneEnabled: ref(false), toneHz: ref(1), toneType: ref('highpass'),
				pingPong: ref(true),
			},
			drive: { enabled: ref(true), type: ref('fuzz'), amount: ref(0.9), tone: ref(1), mix: ref(0.9), crush: ref(true) },
			reverb: { enabled: ref(true), mix: ref(0.9), decay: ref(5), tone: ref(0.1), reverse: ref(true), swell: ref('1/2') },
			tape: { enabled: ref(true), age: ref(0.9), wobble: ref(0.9), mode: ref<'tape' | 'vinyl'>('vinyl'), phone: ref(true) },
		},
		instruments,
		bass: {
			sound: (() => { const b = createBass(); b.cutoff.value = 41; b.wave.value = 'square'; return b; })(),
			lane: reactive({
				muted: true, level: 0.1, pedals: 0.3, steps: Array(STEPS).fill(true), velocities: Array(STEPS).fill(0.2),
				pitches: Array(STEPS).fill(40), accents: Array(STEPS).fill(true), slides: Array(STEPS).fill(true), ties: Array(STEPS).fill(true),
			}),
		},
		drums: (() => { const d = createDrums(STEPS); d.level = 0.15; return d; })(),
		drift: (() => { const d = createDrift(); d.level = 0.12; d.voices = 7; return d; })(),
		mixer: { rhythmPedals: ref(0.2), mix: createMix() },
		patterns: { slots: ref<Slots>(emptySlots()), current: ref(0), chain: ref<Chain>(emptyChain()), chainOn: ref(false) },
		melody: reactive({
			keyRoot: 'C', keyScale: 'major', rangePreset: 'wide', arpPattern: 'down', arpRate: '1/16',
			arpOctaves: 3, arpTones: 'scale', arpSkip: false, mode: 'random',
		}),
		selectedWaveform: ref<Wave>('square'),
		setStepLength: () => {
			instruments.value.forEach(inst => {
				inst.steps = resize(inst.steps, false);
				inst.velocities = resize(inst.velocities, 1);
			});
			noiseMask.value = resize(noiseMask.value, true);
			stepLength.value = STEPS;
		},
	};
}

export function fresh(maxVoices = 4) {
	const st = makeState(maxVoices);
	resetToFactoryDefaults(st);
	return st;
}

// What a project file would hold: plain JSON
export const asSaved = (st: ProjectState) => JSON.parse(JSON.stringify(buildSnapshot(st)));

// Every saved setting, changed away from its default
export function changeEverything(st: ProjectState) {
	const { transport: t, synth: s, fx } = st;
	t.volume.value = 0.5; t.tempo.value = 123; t.swing.value = 0.25;
	s.envelope.enabled.value = false; s.envelope.attackMs.value = 7; s.envelope.decayMs.value = 900;
	s.filter.enabled.value = false; s.filter.cutoff.value = 1200; s.filter.resonance.value = 3;
	s.filter.envAmount.value = -2.5; s.filter.envDecayMs.value = 80;
	s.noise.enabled.value = true; s.noise.color.value = 0.8; s.noise.amount.value = 0.6;
	s.noise.mask.value = s.noise.mask.value.map((_, i) => i % 2 === 0);
	s.noise.attackBurst.value = true; s.noise.burstMs.value = 40;
	s.unison.enabled.value = true; s.unison.voices.value = 4; s.unison.detuneCents.value = 30; s.unison.stereoSpread.value = 80;
	s.lfo.enabled.value = false; s.lfo.rate.value = 2; s.lfo.depth.value = 300; s.lfo.target.value = 'filter';
	s.lfo.depths.value = { pitch: 60, filter: 300, pwm: 30, amp: 70, fm: 20 };
	s.lfo.waveform.value = 'square'; s.lfo.sync.value = false; s.lfo.division.value = '1/16';
	s.lfo.retrigger.value = true; s.lfo.bipolar.value = true;
	s.fm.enabled.value = true; s.fm.modFreq.value = 440; s.fm.index.value = 9; s.fm.ratio.value = 2;
	s.pitchEnv.enabled.value = false; s.pitchEnv.semitones.value = 12; s.pitchEnv.decayMs.value = 50; s.pitchEnv.mode.value = 'random';
	s.pulse.width.value = 25;
	s.sample.value = { data: encodeSample(Float32Array.from([0, 0.5, -0.5, 0.25, -1])), sampleRate: 44100 };
	s.sampleLength.value = 0.4;
	s.randomWaves.value = ['triangle', 'pulse', 'sample'];
	// Only the cutoff has a VEL switch (PR 67): the others load as 0 whatever is saved
	s.velocity.cutoff.value = -40;
	s.tuning.selectedKeyRoot.value = 'Eb'; s.tuning.globalOctaveOffset.value = -1;
	fx.delay.enabled.value = true; fx.delay.sync.value = false; fx.delay.division.value = '1/4'; fx.delay.time.value = 0.5; fx.delay.feedback.value = 0.6;
	fx.delay.mix.value = 0.4; fx.delay.toneEnabled.value = false; fx.delay.toneHz.value = 2000; fx.delay.toneType.value = 'highpass';
	fx.delay.pingPong.value = true;
	fx.drive.enabled.value = true; fx.drive.type.value = 'fuzz'; fx.drive.amount.value = 0.8; fx.drive.tone.value = 3000; fx.drive.mix.value = 0.7; fx.drive.crush.value = true;
	fx.reverb.enabled.value = true; fx.reverb.mix.value = 0.5; fx.reverb.decay.value = 3; fx.reverb.tone.value = 0.2; fx.reverb.reverse.value = true; fx.reverb.swell.value = '1/4';
	fx.tape.enabled.value = true; fx.tape.age.value = 0.7; fx.tape.wobble.value = 0.6; fx.tape.mode.value = 'vinyl'; fx.tape.phone.value = true;
	Object.assign(st.melody, {
		keyRoot: 'D', keyScale: 'dorian', rangePreset: 'wide', arpPattern: 'updown', arpRate: '1/8', arpOctaves: 2, arpTones: 'seventh',
		arpSkip: true, mode: 'arp',
	});
	st.selectedWaveform.value = 'sawtooth';
	const synth = st.instruments.value.find(i => i.name === 'synth-voice')!;
	synth.muted = true; synth.channelVolume = 0.8;
	synth.steps = synth.steps.map((_, i) => i % 4 === 0);
	synth.velocities = synth.velocities.map((_, i) => i / 20);
	synth.pitches = synth.pitches!.map((_, i) => 300 + i);
	synth.waveforms = synth.waveforms!.map((_, i) => (i % 2 ? 'triangle' : 'square'));
	synth.ratchets = synth.ratchets!.map((_, i) => (i % 4) + 1);
	synth.repeatNotes = synth.repeatNotes!.map((_, i) => ['same', 'up', 'down'][i % 3]);
	// The Bass machine
	const bs = st.bass.sound;
	bs.wave.value = 'square'; bs.sub.value = 0.2; bs.cutoff.value = 900; bs.resonance.value = 0.9; bs.envAmount.value = 1.5;
	bs.decayMs.value = 700; bs.accent.value = 0.3; bs.slideMs.value = 150;
	const bl = st.bass.lane;
	bl.muted = true; bl.level = 0.35; bl.pedals = 0.45;
	st.mixer.rhythmPedals.value = 0.7;
	st.mixer.mix.fx.drums = false; st.mixer.mix.solo.bass = true;
	bl.steps = bl.steps.map((_, i) => i % 3 === 0);
	bl.velocities = bl.velocities.map((_, i) => 0.4 + i / 50);
	bl.pitches = bl.pitches.map((_, i) => 50 + i);
	bl.accents = bl.accents.map((_, i) => i % 5 === 0);
	bl.slides = bl.slides.map((_, i) => i % 7 === 0);
	bl.ties = bl.ties.map((_, i) => i === 9);
	// The Drums machine: every slot changed, two kept sounds (one in slot 4), every row
	const dr = st.drums;
	dr.kept = [{ id: 'kept:2', name: 'Kept 2', data: 'AAAAAAEAAgADAA==', sampleRate: 22050 }, { id: 'kept:5', name: 'Boom', data: 'AQACAAMA', sampleRate: 48000 }];
	dr.slots = dr.slots.map((sl, i) => ({ sound: i === 3 ? 'kept:5' : i === 0 ? 'kit:hat' : sl.sound, tune: i - 3, decay: 0.3 + i / 10, level: 0.2 + i / 10, muted: i === 1 }));
	dr.muted = true; dr.level = 0.33; dr.pedals = 0.4;
	dr.rows = dr.rows.map((r, k) => ({ steps: r.steps.map((_, i) => (i + k) % 3 === 0), velocities: r.velocities.map((_, i) => 0.3 + (i + k) / 40) }));
	// The Drift machine: every setting, and chords in all 8 bars
	const df = st.drift;
	df.voices = 3; df.drift = 0.9; df.wave = 0.1; df.spread = 0.2; df.cutoff = 600; df.attack = 2.5; df.release = 0.5;
	df.muted = true; df.level = 0.4; df.pedals = 0.25; df.length = 8;
	df.chords = df.chords.map((r, b) => r.map((_, k) => (b + k) % 2 === 0));
	// Patterns A–D: C is playing (the lane above), B holds another pattern
	st.patterns.current.value = 2;
	const b = emptyRhythm(STEPS, 330);
	b.steps = b.steps.map((_, i) => i % 3 === 0);
	b.velocities = b.velocities.map((_, i) => 0.5 + i / 40);
	b.pitches = b.pitches.map((_, i) => 200 + 10 * i);
	b.ratchets = b.ratchets.map((_, i) => (i % 2) + 1);
	b.repeatNotes = b.repeatNotes.map((_, i) => (i % 2 ? 'up' : 'same'));
	// Its own waves and noise (the plan's item 13)
	b.waveforms = b.steps.map((_, i) => (i % 2 ? 'square' : 'glass'));
	b.noise = b.steps.map((_, i) => i % 4 !== 1);
	st.patterns.slots.value = [null, { tracks: [b] }, null, null];
	st.patterns.chain.value = [2, 2, 1, 2, null, 3, null, null];
	st.patterns.chainOn.value = true;
}

// Leaf values of an object, by path ("synth.lfo.rate", "instruments.3.steps", ...)
export function leaves(o: any, path = ''): Record<string, unknown> {
	if (o === null || typeof o !== 'object' || Array.isArray(o)) return { [path]: JSON.stringify(o) };
	return Object.assign({}, ...Object.keys(o).map(k => leaves(o[k], path ? `${path}.${k}` : k)));
}

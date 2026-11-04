import { describe, it, expect } from 'vitest';
import { ref, reactive, computed } from 'vue';
import {
	buildSnapshot,
	applySnapshot,
	resetToFactoryDefaults,
	type ProjectState,
	type Instrument,
	type KeyRoot,
	type Wave,
} from './snapshot';

const STEPS = 16;
const lane = (name: string, type: Instrument['type'], extra: Partial<Instrument> = {}): Instrument => ({
	name, label: name, type, isCustom: false, muted: true, channelVolume: 0.9,
	steps: Array(STEPS).fill(true), velocities: Array(STEPS).fill(0.3), ...extra,
});

// Settings like DrumSequencer's, filled with arbitrary values. fresh() resets them to the
// factory defaults, as File → New does.
function makeState(maxVoices = 6): ProjectState {
	const stepLength = ref(STEPS);
	const selectedKeyRoot = ref<KeyRoot>('C');
	const globalOctaveOffset = ref(2);
	const instruments = ref<Instrument[]>([
		lane('kick', 'sample', { buffer: { fake: 'decoded kick' } as any }),
		lane('snare', 'sample'),
		lane('hihat', 'sample'),
		lane('synth-voice', 'synth', { pitches: Array(STEPS).fill(1), waveforms: Array(STEPS).fill('square') }),
		lane('custom-1', 'sample', { isCustom: true }),
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
			filter: { enabled: ref(false), cutoff: ref(1), resonance: ref(2) },
			noise: {
				enabled: ref(true), color: ref(0.9), amount: ref(0.9), mask: noiseMask,
				attackBurst: ref(true), burstMs: ref(5),
			},
			unison: {
				enabled: ref(true), voices: ref(2), detuneCents: ref(1), stereoSpread: ref(1),
				maxVoices: computed(() => maxVoices),
			},
			lfo: {
				enabled: ref(false), rate: ref(1), depth: ref(1), target: ref('filter'), waveform: ref('square'),
				sync: ref(false), division: ref('1/4'), retrigger: ref(true), bipolar: ref(true),
			},
			fm: { enabled: ref(true), modFreq: ref(1), index: ref(1), ratio: ref(null) },
			pitchEnv: { enabled: ref(false), semitones: ref(5), decayMs: ref(1), mode: ref('down') },
			tuning: {
				selectedKeyRoot,
				globalOctaveOffset,
				// Like the app's: an untouched pad's pitch follows the key and octave
				currentDefaultHz: computed(() => (selectedKeyRoot.value === 'A' ? 220 : 999) * 2 ** globalOctaveOffset.value),
			},
		},
		fx: {
			delay: {
				enabled: ref(true), sync: ref(false), time: ref(1), feedback: ref(0.9), mix: ref(0.9),
				toneEnabled: ref(false), toneHz: ref(1), toneType: ref('highpass'),
			},
			drive: { enabled: ref(true), type: ref('fuzz'), amount: ref(0.9), tone: ref(1), mix: ref(0.9) },
			reverb: { enabled: ref(true), mix: ref(0.9), decay: ref(5), tone: ref(0.1) },
		},
		instruments,
		melody: reactive({
			keyRoot: 'C', keyScale: 'major', rangePreset: 'low', arpPattern: 'down', arpRate: '1/4',
			arpOctaves: 3, arpTones: 'scale',
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

function fresh(maxVoices = 6) {
	const st = makeState(maxVoices);
	resetToFactoryDefaults(st);
	return st;
}

// What a project file would hold: plain JSON
const asSaved = (st: ProjectState) => JSON.parse(JSON.stringify(buildSnapshot(st)));

// Every saved setting, changed away from its default
function changeEverything(st: ProjectState) {
	const { transport: t, synth: s, fx } = st;
	t.volume.value = 0.5; t.tempo.value = 123; t.swing.value = 0.25;
	s.envelope.enabled.value = false; s.envelope.attackMs.value = 7; s.envelope.decayMs.value = 900;
	s.filter.enabled.value = false; s.filter.cutoff.value = 1200; s.filter.resonance.value = 3;
	s.noise.enabled.value = true; s.noise.color.value = 0.8; s.noise.amount.value = 0.6;
	s.noise.mask.value = s.noise.mask.value.map((_, i) => i % 2 === 0);
	s.noise.attackBurst.value = true; s.noise.burstMs.value = 40;
	s.unison.enabled.value = true; s.unison.voices.value = 5; s.unison.detuneCents.value = 30; s.unison.stereoSpread.value = 80;
	s.lfo.enabled.value = false; s.lfo.rate.value = 2; s.lfo.depth.value = 300; s.lfo.target.value = 'filter';
	s.lfo.waveform.value = 'square'; s.lfo.sync.value = false; s.lfo.division.value = '1/16';
	s.lfo.retrigger.value = true; s.lfo.bipolar.value = true;
	s.fm.enabled.value = true; s.fm.modFreq.value = 440; s.fm.index.value = 9; s.fm.ratio.value = 2;
	s.pitchEnv.enabled.value = false; s.pitchEnv.semitones.value = 12; s.pitchEnv.decayMs.value = 50; s.pitchEnv.mode.value = 'random';
	s.tuning.selectedKeyRoot.value = 'Eb'; s.tuning.globalOctaveOffset.value = -1;
	fx.delay.enabled.value = true; fx.delay.sync.value = false; fx.delay.time.value = 0.5; fx.delay.feedback.value = 0.6;
	fx.delay.mix.value = 0.4; fx.delay.toneEnabled.value = false; fx.delay.toneHz.value = 2000; fx.delay.toneType.value = 'highpass';
	fx.drive.enabled.value = true; fx.drive.type.value = 'fuzz'; fx.drive.amount.value = 0.8; fx.drive.tone.value = 3000; fx.drive.mix.value = 0.7;
	fx.reverb.enabled.value = true; fx.reverb.mix.value = 0.5; fx.reverb.decay.value = 3; fx.reverb.tone.value = 0.2;
	Object.assign(st.melody, {
		keyRoot: 'D', keyScale: 'dorian', rangePreset: 'high', arpPattern: 'updown', arpRate: '1/8', arpOctaves: 2, arpTones: 'scale',
	});
	st.selectedWaveform.value = 'sawtooth';
	const synth = st.instruments.value.find(i => i.name === 'synth-voice')!;
	synth.muted = true; synth.channelVolume = 0.8;
	synth.steps = synth.steps.map((_, i) => i % 4 === 0);
	synth.velocities = synth.velocities.map((_, i) => i / 20);
	synth.pitches = synth.pitches!.map((_, i) => 300 + i);
	synth.waveforms = synth.waveforms!.map((_, i) => (i % 2 ? 'triangle' : 'square'));
}

// Leaf values of an object, by path ("synth.lfo.rate", "instruments.3.steps", ...)
function leaves(o: any, path = ''): Record<string, unknown> {
	if (o === null || typeof o !== 'object' || Array.isArray(o)) return { [path]: JSON.stringify(o) };
	return Object.assign({}, ...Object.keys(o).map(k => leaves(o[k], path ? `${path}.${k}` : k)));
}

describe('factory defaults (File → New)', () => {
	it('sets every saved setting to its default', () => {
		const snap = asSaved(fresh());
		expect(snap.transport).toEqual({ volume: 0.75, tempo: 80, swing: 0 });
		expect(snap.synth).toEqual({
			envelope: { enabled: true, attackMs: 20, decayMs: 400 },
			filter: { enabled: true, cutoff: 5000, resonance: 0.5 },
			noise: {
				enabled: false, type: 'legacy', color: 0.5, amount: 0.25,
				mask: Array(STEPS).fill(true), attackBurst: false, burstMs: 80,
			},
			unison: { enabled: false, voices: 3, detuneCents: 12, stereoSpread: 50 },
			lfo: {
				enabled: true, rate: 5, depth: 0, target: 'pitch', waveform: 'sine',
				sync: true, division: '1/8', retrigger: false, bipolar: false,
			},
			fm: { enabled: false, modFreq: 200, index: 4, ratio: 1 },
			pitchEnv: { enabled: true, semitones: 0, decayMs: 300, mode: 'up' },
			tuning: { selectedKeyRoot: 'A', globalOctaveOffset: 0 },
		});
		expect(snap.fx).toEqual({
			delay: {
				enabled: false, sync: true, time: 0.2, feedback: 0.3, mix: 0.3,
				toneEnabled: true, toneHz: 5000, toneType: 'lowpass',
			},
			drive: { enabled: false, type: 'overdrive', amount: 0.4, tone: 5000, mix: 0.5 },
			reverb: { enabled: false, mix: 0.18, decay: 1.4, tone: 0.6 },
		});
		expect(snap.melody).toEqual({
			keyRoot: 'A', keyScale: 'none', rangePreset: 'wide', arpPattern: 'up', arpRate: '1/16', arpOctaves: 1, arpTones: 'chord',
		});
		expect(snap.selectedWaveform).toBe('sine');
		expect(snap.ui).toEqual({ currentTheme: '', stepLength: STEPS, collapsibleState: {}, seqOpen: false });
	});

	it('clears every lane, removes custom lanes, and tunes untouched pads to the default key', () => {
		const st = fresh();
		expect(st.instruments.value.map(i => i.name)).toEqual(['kick', 'snare', 'hihat', 'synth-voice']);
		for (const inst of st.instruments.value) {
			expect(inst.muted).toBe(false);
			expect(inst.channelVolume).toBe(0.5);
			expect(inst.steps).toEqual(Array(STEPS).fill(false));
			expect(inst.velocities).toEqual(Array(STEPS).fill(1));
		}
		const synth = st.instruments.value[3];
		// A at the default octave: the key is reset before the pads are
		expect(synth.pitches).toEqual(Array(STEPS).fill(220));
		expect(synth.waveforms).toEqual(Array(STEPS).fill('sine'));
		expect(st.instruments.value[0].pitches).toBeUndefined(); // sample lanes have no pitches
		expect(st.instruments.value[0].buffer).toEqual({ fake: 'decoded kick' }); // keeps its sample
	});
});

describe('saving and loading a project', () => {
	it('restores every saved setting', () => {
		const st = fresh();
		changeEverything(st);
		const saved = asSaved(st);

		// The test changes every setting, so a setting that isn't restored shows up below
		const defaults = leaves(asSaved(fresh()));
		const unchanged = Object.entries(leaves(saved))
			.filter(([path, v]) => /^(transport|synth|fx|melody|selectedWaveform)/.test(path) && defaults[path] === v)
			.map(([path]) => path);
		expect(unchanged).toEqual(['synth.noise.type']); // always 'legacy'

		const loaded = fresh();
		applySnapshot(loaded, saved);
		expect(asSaved(loaded)).toEqual(saved);
	});

	it('leaves settings alone when a project has nothing to say about them', () => {
		const st = fresh();
		changeEverything(st);
		const before = asSaved(st);
		applySnapshot(st, null);
		applySnapshot(st, 'not an object');
		applySnapshot(st, {});
		applySnapshot(st, { synth: {}, fx: {}, instruments: [] });
		applySnapshot(st, { transport: { tempo: '120' } }); // wrong type: ignored
		expect(asSaved(st)).toEqual(before);
	});

	it('reads the noise color of projects saved before the color knob', () => {
		const color = (noise: any) => {
			const st = fresh();
			applySnapshot(st, { synth: { noise } });
			return st.synth.noise.color.value;
		};
		expect(color({ type: 'brown' })).toBe(0);
		expect(color({ type: 'Pink' })).toBe(0.25);
		expect(color({ type: 'violet' })).toBe(1);
		expect(color({ type: 'unknown' })).toBe(0.5);
		expect(color({ type: 'pink', color: 0.6 })).toBe(0.6); // a saved color wins
		expect(color({ color: 7 })).toBe(1); // kept within 0..1
	});

	it('fits saved values to this device and this app', () => {
		const st = fresh(3); // a phone: at most 3 unison voices
		applySnapshot(st, { synth: { unison: { enabled: true, voices: 6 }, lfo: { enabled: true, target: 'gain' } } });
		expect(st.synth.unison.voices.value).toBe(3);
		expect(st.synth.lfo.target.value).toBe('pitch'); // an LFO target this version doesn't have

		applySnapshot(st, { synth: { unison: { voices: 0 } } });
		expect(st.synth.unison.voices.value).toBe(1);

		// A noise mask of another length is padded with "on" or cut to the step count
		applySnapshot(st, { synth: { noise: { mask: [false, false] } } });
		expect(st.synth.noise.mask.value).toEqual([false, false, ...Array(STEPS - 2).fill(true)]);
		applySnapshot(st, { synth: { noise: { mask: Array(32).fill(false) } } });
		expect(st.synth.noise.mask.value).toEqual(Array(STEPS).fill(false));
	});

	it('loads lanes by name, keeps their samples, and adds saved custom lanes', () => {
		const st = fresh();
		applySnapshot(st, {
			instruments: [
				{ name: 'kick', label: 'Big Kick', muted: true, channelVolume: 0.2, steps: [true] },
				{ name: 'custom-9', label: 'Clap', isCustom: true, steps: Array(STEPS).fill(true) },
				{ name: 'from-the-future', label: 'Unknown', isCustom: false },
			],
		});
		const kick = st.instruments.value[0];
		expect(kick).toMatchObject({ label: 'Big Kick', muted: true, channelVolume: 0.2, steps: [true] });
		expect(kick.buffer).toEqual({ fake: 'decoded kick' });

		expect(st.instruments.value.map(i => i.name)).toEqual(['kick', 'snare', 'hihat', 'synth-voice', 'custom-9']);
		expect(st.instruments.value[4]).toMatchObject({
			label: 'Clap', type: 'sample', isCustom: true, buffer: null, channelVolume: 0.5,
			velocities: Array(STEPS).fill(1),
		});
	});
});

// src/lib/presets/presets.ts
// Built-in presets: ready-made synth sounds, picked from the buttons in the transport card
// (PresetButtons.vue). The sounds themselves are in library.ts.
//
// A preset sets the sound only: the synth and effect settings, the main wave and every pad's
// wave. It never touches the pattern (steps, velocities, pitches, which steps get noise, the
// key and octave), the tempo, swing or volume, or the Melody Maker.
//
// A preset lists only what it changes from the factory sound. Applying one first puts the
// whole sound back to its factory defaults (resetSoundToFactoryDefaults in snapshot.ts), so a
// preset that doesn't mention the delay has the delay off, and each preset sounds the same
// whatever was set before it.
//
// Like snapshot.ts, this only reads and writes the settings' refs, so it's unit-tested in Node.

import {
	applySnapshot,
	buildSnapshot,
	resetSoundToFactoryDefaults,
	type ProjectSnapshot,
	type ProjectState,
	type Wave,
} from '../project/snapshot';

type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

type Synth = ProjectSnapshot['synth'];
type Fx = ProjectSnapshot['fx'];

// What a preset may set. Left out on purpose: the key and octave (they tune the pads), the
// noise mask (which steps get noise), the noise's legacy `type`, and the delay's time and sync
// (the time is the division at the tempo).
export type PresetSynth = DeepPartial<Omit<Synth, 'tuning' | 'noise'> & { noise: Omit<Synth['noise'], 'mask' | 'type'> }>;
export type PresetFx = DeepPartial<Omit<Fx, 'delay'> & { delay: Omit<Fx['delay'], 'time' | 'sync'> }>;

export type SynthPreset = {
	id: string;          // stable name, for tests and analytics
	label: string;       // the button's text: short (five letters fit on a phone)
	description: string; // the button's tooltip
	wave: Wave;          // the main wave, and every pad's
	synth?: PresetSynth;
	fx?: PresetFx;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	v !== null && typeof v === 'object' && !Array.isArray(v);

// `over` on top of `base`, recursing into objects; arrays and other values (null too) replace
function merge<T>(base: T, over: unknown): T {
	if (!isPlainObject(base) || !isPlainObject(over)) return (over === undefined ? base : over) as T;
	const out: Record<string, unknown> = { ...base };
	for (const [k, v] of Object.entries(over)) out[k] = merge(out[k], v);
	return out as T;
}

const synthLane = (st: ProjectState) => st.instruments.value.find(i => i.name === 'synth-voice');

// Apply START

// The preset's sound, from the factory sound: settings, main wave and every pad's wave
export function applyPreset(st: ProjectState, preset: SynthPreset) {
	resetSoundToFactoryDefaults(st);
	// applySnapshot() reads a section's on/off switch as "off" when it's missing, so give it
	// whole sections: the factory sound with the preset's changes on top
	const base = buildSnapshot(st);
	applySnapshot(st, {
		synth: merge(base.synth, preset.synth),
		fx: merge(base.fx, preset.fx),
		selectedWaveform: preset.wave,
	});
	// The wave on every pad, as clicking its tile does
	const lane = synthLane(st);
	if (lane) lane.waveforms = Array(st.ui.stepLength.value).fill(preset.wave);
}

// Apply END

// Matching START

// The parts of a snapshot that make up the sound, as text: equal texts sound the same. From
// buildSnapshot() or the project store's copy. Leaves out what a preset doesn't set (see
// PresetSynth), and the synced delay time, so a tempo change doesn't count as a new sound.
export function soundKey(s: any): string {
	if (!s?.synth || !s?.fx) return '';
	const { tuning, noise, ...synth } = s.synth;
	const { mask, type, ...noiseRest } = noise ?? {};
	const { time, ...delay } = s.fx.delay ?? {};
	const lane = Array.isArray(s.instruments) ? s.instruments.find((i: any) => i?.name === 'synth-voice') : null;
	return JSON.stringify({
		synth: { ...synth, noise: noiseRest },
		fx: { ...s.fx, delay: delay.sync ? delay : { ...delay, time } },
		wave: s.selectedWaveform,
		padWaves: lane?.waveforms ?? null,
	});
}

// Matching END

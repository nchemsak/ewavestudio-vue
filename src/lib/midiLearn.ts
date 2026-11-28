// src/lib/midiLearn.ts
// MIDI learn's bookkeeping (pure; the learn mode itself is src/composables/useMidiLearn.ts):
// which knobs can be learned, and which controller knob (a control change number on a MIDI
// channel) drives which of them. One controller knob drives one knob, and a knob is driven
// by one controller knob: learning a new one replaces the old.

// A control change message: channel 0–15 (shown 1–16), controller 0–119, value 0–127
export type ControlChange = { channel: number; controller: number; value: number };

// "1:21": channel 1, controller 21
export type CcKey = string;

// Which knob (by its id) each controller knob drives
export type Mappings = Record<CcKey, string>;

// The knobs that can be learned: each <Knob> with a `midi-id` from this list, and what the
// learn bar calls it. The ids are saved with the mappings, so don't rename them. The knobs in
// pop-ups (a pad's Fine) aren't here: they'd only follow while open. 'synth.volume' (the Step
// Sequencer's Vol) left with its knob in PR 92 and came back in PR 108 as the machine rail's
// Rhythm level (the same setting, the lane's volume).
export const MIDI_KNOBS: Record<string, string> = {
	'transport.volume': 'Volume',
	'transport.tempo': 'Tempo',
	'transport.swing': 'Swing',
	'synth.volume': 'Synth level',
	'pulse.width': 'Pulse width',
	'sample.length': 'Sample length',
	'env.attack': 'Attack',
	'env.decay': 'Decay',
	'filter.cutoff': 'Cutoff',
	'filter.resonance': 'Resonance',
	'filter.envAmount': 'Filter env amount',
	'filter.envDecay': 'Filter env decay',
	'pitchEnv.amount': 'Pitch amount',
	'pitchEnv.decay': 'Pitch decay',
	'noise.burst': 'Noise burst',
	'noise.amount': 'Noise amount',
	'noise.color': 'Noise color',
	'fm.modFreq': 'FM mod freq',
	'fm.amount': 'FM amount',
	'unison.detune': 'Unison detune',
	'unison.spread': 'Unison spread',
	'lfo.rate': 'LFO rate',
	'lfo.depth': 'LFO depth',
	'delay.mix': 'Delay mix',
	'delay.time': 'Delay time',
	'delay.tone': 'Delay tone',
	'drive.mix': 'Drive mix',
	'drive.amount': 'Drive',
	'drive.tone': 'Drive tone',
	'reverb.mix': 'Reverb mix',
	'reverb.decay': 'Reverb decay',
	'reverb.tone': 'Reverb tone',
	'tape.age': 'Lo-fi age',
	'tape.wobble': 'Lo-fi wobble',
	// The Bass machine (the plan's item 4): its level in the rail, and its Sound panel
	'bass.level': 'Bass level',
	// The rail's Pedals (PR 116): how much of each machine goes through the pedals
	'synth.pedals': 'Synth into the pedals',
	'bass.pedals': 'Bass into the pedals',
	'bass.sub': 'Bass sub',
	'bass.cutoff': 'Bass cutoff',
	'bass.resonance': 'Bass resonance',
	'bass.envAmount': 'Bass env amount',
	'bass.decay': 'Bass decay',
	'bass.accent': 'Bass accent',
	'bass.slide': 'Bass slide time',
	'drums.level': 'Drums level',
	'drums.pedals': 'Drums into the pedals',
	'drums.1.tune': 'Drum slot 1 tune',
	'drums.1.decay': 'Drum slot 1 decay',
	'drums.1.level': 'Drum slot 1 level',
	'drums.2.tune': 'Drum slot 2 tune',
	'drums.2.decay': 'Drum slot 2 decay',
	'drums.2.level': 'Drum slot 2 level',
	'drums.3.tune': 'Drum slot 3 tune',
	'drums.3.decay': 'Drum slot 3 decay',
	'drums.3.level': 'Drum slot 3 level',
	'drums.4.tune': 'Drum slot 4 tune',
	'drums.4.decay': 'Drum slot 4 decay',
	'drums.4.level': 'Drum slot 4 level',
	// The Drift machine (the plan's item 6): the rail's level and reverb send, the X/Y pad's two
	// mini knobs and its Sound panel
	'drift.level': 'Drift level',
	'drift.pedals': 'Drift into the reverb',
	'drift.cutoff': 'Drift filter',
	'drift.spread': 'Drift spread',
	'drift.voices': 'Drift voices',
	'drift.drift': 'Drift drift',
	'drift.wave': 'Drift wave',
	'drift.attack': 'Drift attack',
	'drift.release': 'Drift release',
	// Drift's Motion (the plan's item 19): its Depth (Rate and the shape are switches)
	'drift.motionDepth': 'Drift motion depth',
	// Drift's Pulse (the plan's item 20): its Depth (the gate's division is a switch)
	'drift.pulseDepth': 'Drift pulse depth',
};

export function ccKey(channel: number, controller: number): CcKey {
	return `${channel + 1}:${controller}`;
}

// "CC 21", or "CC 21 ch 2" off channel 1
export function ccLabel(key: CcKey): string {
	const [ch, cc] = key.split(':');
	return ch === '1' ? `CC ${cc}` : `CC ${cc} ch ${ch}`;
}

// The controller knob that drives a knob, if any
export function keyFor(m: Mappings, knobId: string): CcKey | undefined {
	return Object.keys(m).find((k) => m[k] === knobId);
}

// `key` drives `knobId` from now on: whatever else drove that knob no longer does, and
// whatever `key` drove before, it doesn't any more
export function assign(m: Mappings, key: CcKey, knobId: string): Mappings {
	const out: Mappings = {};
	for (const [k, id] of Object.entries(m)) if (id !== knobId && k !== key) out[k] = id;
	out[key] = knobId;
	return out;
}

export function unassign(m: Mappings, knobId: string): Mappings {
	return Object.fromEntries(Object.entries(m).filter(([, id]) => id !== knobId));
}

// Saved mappings as text, back to Mappings: anything malformed, or a knob that no longer
// exists, is left out
export function parseMappings(text: string | null | undefined): Mappings {
	let raw: unknown;
	try { raw = JSON.parse(text ?? ''); } catch { return {}; }
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const out: Mappings = {};
	for (const [k, id] of Object.entries(raw as Record<string, unknown>)) {
		if (/^(?:[1-9]|1[0-6]):(?:\d|[1-9]\d|1[01]\d)$/.test(k) && typeof id === 'string' && id in MIDI_KNOBS) out[k] = id;
	}
	return out;
}

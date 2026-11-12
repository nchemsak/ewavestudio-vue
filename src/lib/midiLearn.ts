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
// pop-ups (a pad's Fine) aren't here: they'd only follow while open.
export const MIDI_KNOBS: Record<string, string> = {
	'transport.volume': 'Volume',
	'transport.tempo': 'Tempo',
	'transport.swing': 'Swing',
	'synth.volume': 'Step Sequencer volume',
	'pulse.width': 'Pulse width',
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
	'unison.voices': 'Unison voices',
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

// src/composables/useMidiLearn.ts
// MIDI learn: link a knob on a MIDI controller to a knob in the app.
// - "MIDI learn" in the MIDI toolbar (MidiToolbar.vue) starts learn mode: every learnable knob
//   is outlined and shows the controller knob it follows, if any.
// - Click (or Enter on) a knob to arm it, then turn a knob on the controller: the two are
//   linked, and the app's knob jumps to where the controller's is. Delete or Backspace on a
//   knob unlinks it. Done or Escape ends learn mode.
// - From then on a controller knob turns its app knob as a drag would (Knob.vue's
//   setPosition: the knob's own curve and step, its tooltip and screen view), so undo,
//   saving and the engines need nothing new. A disabled knob ignores it, as it ignores the
//   mouse.
// The links belong to the controller, not to a song: they're kept in this browser
// (localStorage 'midi-map'), not in projects. The pure part is src/lib/midiLearn.ts.

import { reactive } from 'vue';
import { storageKey } from '../lib/storage/namespace';
import {
	assign, ccKey, ccLabel, keyFor, parseMappings, unassign, MIDI_KNOBS,
	type ControlChange, type Mappings,
} from '../lib/midiLearn';

// What a knob gives MIDI learn: turn it to a position along its turn, 0..1, and whether it's
// greyed out (its module is off), when it ignores the controller as it ignores the mouse
export type MidiKnob = { setPosition(position: number): void; disabled?(): boolean };

export function createMidiLearn(storage: { load(): string | null; save(text: string): void }) {
	const state = reactive({
		learning: false,
		armed: null as string | null,   // the knob waiting for a controller knob
		mappings: parseMappings(storage.load()) as Mappings,
		message: '',                    // what the learn bar says
	});
	const knobs = new Map<string, MidiKnob>();

	const name = (id: string) => MIDI_KNOBS[id] ?? id;
	function store(m: Mappings) {
		state.mappings = m;
		storage.save(JSON.stringify(m));
	}

	// A knob with a midi-id takes part while it's on the page; returns how to leave
	function register(id: string, knob: MidiKnob) {
		knobs.set(id, knob);
		return () => { if (knobs.get(id) === knob) knobs.delete(id); };
	}

	function start() {
		state.learning = true;
		state.armed = null;
		state.message = 'Click a knob, then turn a knob on your controller.';
	}
	function stop() {
		state.learning = false;
		state.armed = null;
		state.message = '';
	}
	function arm(id: string) {
		if (!state.learning) return;
		state.armed = id;
		state.message = `${name(id)}: turn a knob on your controller.`;
	}
	function clear(id: string) {
		if (!keyFor(state.mappings, id)) return;
		store(unassign(state.mappings, id));
		if (state.armed === id) state.armed = null;
		state.message = `${name(id)} no longer follows the controller.`;
	}
	function clearAll() {
		store({});
		state.armed = null;
		state.message = 'Every knob is unlinked.';
	}

	// The controller knob a knob follows ("CC 21"), or ''
	function labelFor(id: string): string {
		const key = keyFor(state.mappings, id);
		return key ? ccLabel(key) : '';
	}

	// A control change from the chosen MIDI input (useMidiInput)
	function handleControlChange(cc: ControlChange) {
		const key = ccKey(cc.channel, cc.controller);
		if (state.learning && state.armed) {
			const id = state.armed;
			store(assign(state.mappings, key, id));
			state.armed = null;
			state.message = knobs.get(id)?.disabled?.()
				? `${name(id)} follows ${ccLabel(key)} once its module is on. Click another knob, or Done.`
				: `${name(id)} follows ${ccLabel(key)}. Click another knob, or Done.`;
		}
		const id = state.mappings[key];
		if (id) knobs.get(id)?.setPosition(Math.max(0, Math.min(127, cc.value)) / 127);
	}

	return { state, register, start, stop, arm, clear, clearAll, labelFor, handleControlChange };
}

export type MidiLearn = ReturnType<typeof createMidiLearn>;

// The app's one MIDI learn, its links kept in this browser
const STORAGE_KEY = storageKey('midi-map');
const midiLearn = createMidiLearn({
	load: () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
	save: (text) => { try { localStorage.setItem(STORAGE_KEY, text); } catch { /* private mode: not kept */ } },
});

export function useMidiLearn(): MidiLearn {
	return midiLearn;
}

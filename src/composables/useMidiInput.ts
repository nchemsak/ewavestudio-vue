// src/composables/useMidiInput.ts
// Web MIDI note input: asks for MIDI access when the visitor clicks "Enable MIDI", lists the
// connected inputs, listens to the chosen one, and plays its note-on messages. It knows nothing
// about the synth: the caller's noteToPlay() decides what a note plays (or that it plays
// nothing). Only note-on is used; note-off, CC, pitch bend and MIDI clock are ignored.
//
// The audio engine starts suspended (browsers wait for a click). Enabling MIDI resumes it, and
// a note that arrives while it is suspended resumes it and then plays, unless resuming takes
// more than RESUME_LIMIT_MS: then the note is dropped rather than played late.

import { ref, reactive, onScopeDispose } from 'vue';

export type MidiInputInfo = {
	id: string;
	name: string;
	input: MIDIInput;
};

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const RESUME_LIMIT_MS = 250;

// A note-on message as { note, velocity 0..1 }, or null for anything else. A note-on with
// velocity 0 counts as a note-off (MIDI convention). Any channel.
export function parseNoteOn(data: ArrayLike<number> | null | undefined): { note: number; velocity: number } | null {
	if (!data || data.length < 3) return null;
	const cmd = data[0] & 0xf0;
	if (cmd !== NOTE_ON && cmd !== NOTE_OFF) return null;
	const isNoteOn = cmd === NOTE_ON && data[2] > 0;
	if (!isNoteOn) return null;
	return { note: data[1], velocity: Math.max(0.0, Math.min(1.0, data[2] / 127)) };
}

export function useMidiInput(opts: {
	audioCtx: Pick<AudioContext, 'state' | 'resume'>;
	// Called for each note-on, before the audio engine is woken. Returns a function that plays
	// the note (called once audio is running), or null to ignore the note.
	noteToPlay: (note: number, velocity: number) => (() => void) | null;
}) {
	const { audioCtx } = opts;

	const supported = typeof navigator !== 'undefined' && !!(navigator as any).requestMIDIAccess;

	const inputs = ref<MidiInputInfo[]>([]);
	const selectedId = ref<string>('');
	const listening = ref(false); // a chosen input is attached
	const initialized = ref(false);
	const initInProgress = ref(false);

	function handleMidiMessage(e: MIDIMessageEvent) {
		if (!listening.value) return;

		const msg = parseNoteOn(e.data);
		if (!msg) return;

		const play = opts.noteToPlay(msg.note, msg.velocity);
		if (!play) return;

		// Wake the audio engine if needed. If that takes more than a moment (the page hasn't
		// been clicked yet), drop the note rather than play it late.
		if (audioCtx.state === 'running') {
			play();
		} else {
			const requested = performance.now();
			audioCtx.resume().then(() => { if (performance.now() - requested < RESUME_LIMIT_MS) play(); }, () => { });
		}
	}

	async function initMidiAccess() {
		if (!supported || initialized.value) return;

		try {
			const access = await (navigator as any).requestMIDIAccess();

			const updateInputs = () => {
				const list: MidiInputInfo[] = [];
				access.inputs.forEach((input: MIDIInput) => {
					list.push({
						id: input.id,
						name: input.name || `Input ${input.id}`,
						input,
					});
				});
				inputs.value = list;

				// If the currently selected input disappeared, stop listening
				if (!list.some(i => i.id === selectedId.value)) {
					selectedId.value = '';
					listening.value = false;
				}
			};

			updateInputs();
			access.onstatechange = () => {
				updateInputs();
			};

			initialized.value = true;
		} catch (err) {
			console.warn('MIDI access failed:', err);
		}
	}

	// The "Enable MIDI" button
	async function enable() {
		if (!supported || initialized.value || initInProgress.value) return;
		// This click lets the audio engine start, so MIDI notes play before Play is ever pressed
		audioCtx.resume().catch(() => { });
		initInProgress.value = true;
		try {
			await initMidiAccess();
		} finally {
			initInProgress.value = false;
		}
	}

	// Listen to the input with this id ('' = none), and to no other
	function select(id: string) {
		selectedId.value = id;

		inputs.value.forEach(({ input }) => {
			input.onmidimessage = null;
		});

		const info = inputs.value.find(i => i.id === selectedId.value);
		if (!info) {
			listening.value = false;
			return;
		}

		info.input.onmidimessage = handleMidiMessage;
		listening.value = true;
	}

	// Stop listening when the component that uses this goes away
	onScopeDispose(() => {
		inputs.value.forEach(({ input }) => {
			input.onmidimessage = null;
		});
	});

	// One reactive object, so a template can read midi.inputs, midi.initialized, ... directly
	return reactive({
		supported,
		inputs,
		selectedId,
		initialized,
		initInProgress,
		enable,
		select,
	});
}

export type MidiInput = ReturnType<typeof useMidiInput>;

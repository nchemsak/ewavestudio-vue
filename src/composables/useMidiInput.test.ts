import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { parseNoteOn, useMidiInput } from './useMidiInput';

describe('parseNoteOn', () => {
	it('reads a note-on on any channel, with velocity scaled to 0..1', () => {
		expect(parseNoteOn([0x90, 60, 127])).toEqual({ note: 60, velocity: 1 });
		expect(parseNoteOn([0x9f, 36, 0x40])?.note).toBe(36); // channel 16
		expect(parseNoteOn([0x90, 60, 0x40])?.velocity).toBeCloseTo(64 / 127);
	});

	it('ignores note-off, note-on with velocity 0, other messages and short ones', () => {
		expect(parseNoteOn([0x80, 60, 64])).toBeNull(); // note-off
		expect(parseNoteOn([0x90, 60, 0])).toBeNull();  // note-on, velocity 0 = note-off
		expect(parseNoteOn([0xb0, 7, 100])).toBeNull(); // control change
		expect(parseNoteOn([0xe0, 0, 64])).toBeNull();  // pitch bend
		expect(parseNoteOn([0xf8])).toBeNull();         // MIDI clock
		expect(parseNoteOn(null)).toBeNull();
	});
});

// A fake MIDI system: inputs the test can add, remove and "play"
function fakeMidi() {
	const inputs = new Map<string, any>();
	const access: any = { inputs, outputs: new Map(), onstatechange: null };
	const add = (id: string, name = '') => { inputs.set(id, { id, name, onmidimessage: null }); access.onstatechange?.(); };
	const remove = (id: string) => { inputs.delete(id); access.onstatechange?.(); };
	const send = (id: string, data: number[]) => inputs.get(id)?.onmidimessage?.({ data: new Uint8Array(data) });
	const requestMIDIAccess = vi.fn(async () => access);
	vi.stubGlobal('navigator', { requestMIDIAccess });
	return { inputs, add, remove, send, requestMIDIAccess };
}

function fakeAudio(state: AudioContextState = 'running') {
	const ctx = { state, resume: vi.fn(async () => { ctx.state = 'running'; }) };
	return ctx;
}

function setup(audio = fakeAudio()) {
	const played: Array<[number, number]> = [];
	const noteToPlay = vi.fn((note: number, velocity: number) => () => { played.push([note, velocity]); });
	const scope = effectScope();
	const midi = scope.run(() => useMidiInput({ audioCtx: audio as any, noteToPlay }))!;
	return { midi, played, noteToPlay, audio, scope };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('useMidiInput', () => {
	it('does nothing in a browser without Web MIDI', async () => {
		vi.stubGlobal('navigator', {});
		const { midi, audio } = setup();
		expect(midi.supported).toBe(false);
		await midi.enable();
		expect(midi.initialized).toBe(false);
		expect(audio.resume).not.toHaveBeenCalled();
	});

	it('Enable MIDI wakes the audio engine, then lists the inputs', async () => {
		const m = fakeMidi();
		m.add('a', 'Keyboard A');
		m.add('b'); // no name
		const { midi, audio } = setup(fakeAudio('suspended'));
		await midi.enable();
		expect(audio.resume).toHaveBeenCalled();
		expect(midi.initialized).toBe(true);
		expect(midi.inputs.map(i => [i.id, i.name])).toEqual([['a', 'Keyboard A'], ['b', 'Input b']]);

		await midi.enable(); // a second click asks for nothing new
		expect(m.requestMIDIAccess).toHaveBeenCalledTimes(1);
	});

	it('plays note-ons from the chosen input only', async () => {
		const m = fakeMidi();
		m.add('a');
		m.add('b');
		const { midi, played } = setup();
		await midi.enable();

		m.send('a', [0x90, 60, 127]);
		expect(played).toEqual([]); // nothing chosen yet

		midi.select('a');
		m.send('a', [0x90, 60, 127]);
		m.send('a', [0x80, 60, 0]);   // note-off: ignored
		m.send('b', [0x90, 62, 127]); // not the chosen input
		expect(played).toEqual([[60, 1]]);

		midi.select('b');
		m.send('a', [0x90, 64, 127]);
		m.send('b', [0x90, 65, 127]);
		expect(played).toEqual([[60, 1], [65, 1]]);

		midi.select(''); // None
		m.send('b', [0x90, 67, 127]);
		expect(played).toHaveLength(2);
	});

	it('plays nothing when noteToPlay says so (a muted synth), without waking the audio engine', async () => {
		const m = fakeMidi();
		m.add('a');
		const audio = fakeAudio();
		const scope = effectScope();
		const midi = scope.run(() => useMidiInput({ audioCtx: audio as any, noteToPlay: () => null }))!;
		await midi.enable();
		midi.select('a');
		audio.resume.mockClear();
		audio.state = 'suspended';
		m.send('a', [0x90, 60, 100]);
		expect(audio.resume).not.toHaveBeenCalled();
	});

	it('wakes suspended audio for a note, and plays it unless waking took over 250 ms', async () => {
		const m = fakeMidi();
		m.add('a');
		const audio = fakeAudio();
		const { midi, played } = setup(audio);
		await midi.enable();
		midi.select('a');

		const now = vi.spyOn(performance, 'now');
		now.mockReturnValue(1000);
		audio.state = 'suspended';
		m.send('a', [0x90, 60, 127]);
		expect(played).toEqual([]); // waits for the audio engine
		await Promise.resolve(); await Promise.resolve();
		expect(audio.resume).toHaveBeenCalled();
		expect(played).toEqual([[60, 1]]);

		// Waking took too long: the note is dropped instead of played late
		audio.state = 'suspended';
		let wake!: () => void;
		audio.resume.mockImplementationOnce(() => new Promise<void>((r) => { wake = () => { audio.state = 'running'; r(); }; }));
		m.send('a', [0x90, 62, 127]);
		now.mockReturnValue(1300);
		wake();
		await Promise.resolve(); await Promise.resolve();
		expect(played).toEqual([[60, 1]]);
	});

	it('stops listening when the chosen input is unplugged', async () => {
		const m = fakeMidi();
		m.add('a');
		const { midi, played } = setup();
		await midi.enable();
		midi.select('a');

		const unplugged = m.inputs.get('a');
		m.remove('a');
		expect(midi.selectedId).toBe('');
		expect(midi.inputs).toEqual([]);
		unplugged.onmidimessage?.({ data: new Uint8Array([0x90, 60, 127]) }); // a late message
		expect(played).toEqual([]);

		m.add('c', 'New'); // plugging in another one doesn't select it
		expect(midi.inputs.map(i => i.id)).toEqual(['c']);
		expect(midi.selectedId).toBe('');
	});

	it('detaches from the input when the component goes away', async () => {
		const m = fakeMidi();
		m.add('a');
		const { midi, scope } = setup();
		await midi.enable();
		midi.select('a');
		expect(m.inputs.get('a').onmidimessage).toBeTypeOf('function');
		scope.stop();
		expect(m.inputs.get('a').onmidimessage).toBeNull();
	});
});

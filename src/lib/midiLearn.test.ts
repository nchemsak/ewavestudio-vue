import { describe, it, expect } from 'vitest';
import { assign, ccKey, ccLabel, keyFor, parseMappings, unassign, MIDI_KNOBS } from './midiLearn';
import { createMidiLearn } from '../composables/useMidiLearn';

describe('MIDI learn mappings', () => {
	it('name controller knobs by channel and number', () => {
		expect(ccKey(0, 21)).toBe('1:21');
		expect(ccKey(15, 74)).toBe('16:74');
		expect(ccLabel('1:21')).toBe('CC 21');
		expect(ccLabel('3:7')).toBe('CC 7 ch 3');
	});

	it('link one controller knob to one knob, either way round', () => {
		let m = assign({}, '1:21', 'filter.cutoff');
		m = assign(m, '1:22', 'filter.resonance');
		expect(m).toEqual({ '1:21': 'filter.cutoff', '1:22': 'filter.resonance' });
		// Cutoff learns another controller knob: CC 21 no longer drives it
		m = assign(m, '1:30', 'filter.cutoff');
		expect(m).toEqual({ '1:22': 'filter.resonance', '1:30': 'filter.cutoff' });
		// CC 22 is learned by another knob: Resonance no longer follows it
		m = assign(m, '1:22', 'env.decay');
		expect(m).toEqual({ '1:22': 'env.decay', '1:30': 'filter.cutoff' });
		expect(keyFor(m, 'filter.cutoff')).toBe('1:30');
		expect(keyFor(m, 'filter.resonance')).toBeUndefined();
		expect(unassign(m, 'filter.cutoff')).toEqual({ '1:22': 'env.decay' });
	});

	it('read saved links, leaving out anything malformed or unknown', () => {
		expect(parseMappings('{"1:21":"filter.cutoff","16:119":"lfo.rate"}')).toEqual({ '1:21': 'filter.cutoff', '16:119': 'lfo.rate' });
		expect(parseMappings('{"0:21":"filter.cutoff","17:1":"lfo.rate","1:120":"env.decay","1:5":"gone.knob","1:6":7}')).toEqual({});
		for (const bad of [null, '', 'not json', '[1,2]', '"text"', 'null']) expect(parseMappings(bad)).toEqual({});
	});

	it('name every learnable knob', () => {
		expect(Object.keys(MIDI_KNOBS)).toHaveLength(32);
		for (const name of Object.values(MIDI_KNOBS)) expect(name.length).toBeGreaterThan(2);
	});
});

describe('MIDI learn', () => {
	function setup(saved: string | null = null) {
		const storage = { text: saved, load: () => storage.text, save: (t: string) => { storage.text = t; } };
		const learn = createMidiLearn(storage);
		const turns: Record<string, number[]> = {};
		const knob = (id: string) => learn.register(id, { setPosition: (p) => { (turns[id] ??= []).push(p); } });
		return { learn, storage, turns, knob };
	}
	const cc = (controller: number, value: number, channel = 0) => ({ channel, controller, value });

	it('links the armed knob to the next controller knob turned, which then turns it', () => {
		const { learn, storage, turns, knob } = setup();
		knob('filter.cutoff');
		knob('filter.resonance');

		learn.handleControlChange(cc(21, 64)); // not linked: nothing turns
		expect(turns).toEqual({});

		learn.start();
		learn.handleControlChange(cc(21, 64)); // learning, but no knob armed
		expect(turns).toEqual({});
		learn.arm('filter.cutoff');
		expect(learn.state.message).toContain('Cutoff');
		learn.handleControlChange(cc(21, 127));
		expect(turns['filter.cutoff']).toEqual([1]); // jumps to where the controller is
		expect(learn.state.armed).toBeNull();
		expect(learn.labelFor('filter.cutoff')).toBe('CC 21');
		expect(learn.state.message).toContain('follows CC 21');
		learn.stop();

		learn.handleControlChange(cc(21, 0));
		learn.handleControlChange(cc(22, 64)); // not linked
		learn.handleControlChange(cc(21, 64, 1)); // CC 21 on channel 2: another knob
		expect(turns['filter.cutoff']).toEqual([1, 0]);
		expect(turns['filter.resonance']).toBeUndefined();
		expect(JSON.parse(storage.text!)).toEqual({ '1:21': 'filter.cutoff' }); // kept
	});

	it('keeps links across visits, and forgets them on request', () => {
		const { learn, turns, knob } = setup('{"1:21":"filter.cutoff","1:22":"env.decay"}');
		knob('filter.cutoff');
		learn.handleControlChange(cc(21, 127));
		expect(turns['filter.cutoff']).toEqual([1]);

		learn.start();
		learn.clear('filter.cutoff');
		expect(learn.labelFor('filter.cutoff')).toBe('');
		expect(learn.labelFor('env.decay')).toBe('CC 22');
		learn.clearAll();
		expect(learn.state.mappings).toEqual({});
		learn.handleControlChange(cc(21, 0));
		expect(turns['filter.cutoff']).toEqual([1]);
	});

	it('only arms a knob in learn mode, and turns a knob only while it is on the page', () => {
		const { learn, turns, knob } = setup('{"1:21":"filter.cutoff"}');
		learn.arm('filter.cutoff');
		expect(learn.state.armed).toBeNull();
		const leave = knob('filter.cutoff');
		leave();
		learn.handleControlChange(cc(21, 127));
		expect(turns).toEqual({});
	});

	it("says when a greyed-out knob won't move until its module is on", () => {
		const { learn } = setup();
		learn.register('delay.mix', { setPosition() {}, disabled: () => true });
		learn.start();
		learn.arm('delay.mix');
		learn.handleControlChange(cc(23, 64));
		expect(learn.labelFor('delay.mix')).toBe('CC 23');
		expect(learn.state.message).toBe('Delay mix follows CC 23 once its module is on. Click another knob, or Done.');
	});
});

describe('the learnable knobs', () => {
	it('are each on exactly one <Knob midi-id> in the components', () => {
		const sources = import.meta.glob('../components/**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
		const ids: string[] = [];
		for (const src of Object.values(sources)) {
			for (const m of src.matchAll(/<Knob\b[^>]*?\bmidi-id="([^"]+)"/g)) ids.push(m[1]);
		}
		expect([...ids].sort()).toEqual(Object.keys(MIDI_KNOBS).sort());
	});
});

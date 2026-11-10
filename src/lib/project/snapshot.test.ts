import { describe, it, expect } from 'vitest';
import {
	buildSnapshot,
	applySnapshot,
	resetToFactoryDefaults,
} from './snapshot';
import { STEPS, makeState, fresh, asSaved, changeEverything, leaves } from './testState';

describe('factory defaults (File → New)', () => {
	it('sets every saved setting to its default', () => {
		const snap = asSaved(fresh());
		expect(snap.transport).toEqual({ volume: 0.75, tempo: 120, swing: 0 });
		expect(snap.synth).toEqual({
			envelope: { enabled: true, attackMs: 20, decayMs: 400 },
			filter: { enabled: true, cutoff: 5000, resonance: 0.5, envAmount: 0, envDecayMs: 200 },
			noise: {
				enabled: false, type: 'legacy', color: 0.5, amount: 0.25,
				mask: Array(STEPS).fill(true), attackBurst: false, burstMs: 80,
			},
			unison: { enabled: false, voices: 3, detuneCents: 12, stereoSpread: 100 },
			lfo: {
				enabled: true, rate: 5, depth: 0, target: 'pitch', waveform: 'sine',
				sync: true, division: '1/8', retrigger: false, bipolar: false,
			},
			fm: { enabled: false, modFreq: 200, index: 4, ratio: 1 },
			pitchEnv: { enabled: true, semitones: 0, decayMs: 300, mode: 'up' },
			pulse: { width: 50 },
			velocity: { decay: 0, cutoff: 0, pitchEnv: 0, noise: 0 },
			tuning: { selectedKeyRoot: 'A', globalOctaveOffset: 0 },
		});
		expect(snap.fx).toEqual({
			delay: {
				enabled: false, sync: true, division: '1/8.', time: 0.375, feedback: 0.3, mix: 0.3,
				toneEnabled: true, toneHz: 5000, toneType: 'lowpass', pingPong: false,
			},
			drive: { enabled: false, type: 'overdrive', amount: 0.4, tone: 5000, mix: 0.5, crush: false },
			reverb: { enabled: false, mix: 0.18, decay: 1.4, tone: 0.6 },
		});
		expect(snap.melody).toEqual({
			keyRoot: 'A', keyScale: 'none', rangePreset: 'wide', arpPattern: 'up', arpRate: '1/16', arpOctaves: 1, arpTones: 'chord',
			mode: 'random',
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
		expect(synth.ratchets).toEqual(Array(STEPS).fill(1)); // one hit per step
		expect(st.instruments.value[0].ratchets).toBeUndefined(); // sample lanes have none
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

	it('keeps a synced delay time at the division and tempo', () => {
		const st = fresh();
		// A project whose saved time doesn't match its division (saved before this was fixed)
		applySnapshot(st, { transport: { tempo: 120 }, fx: { delay: { sync: true, division: '1/4', time: 0.2 } } });
		expect(st.fx.delay.division.value).toBe('1/4');
		expect(st.fx.delay.time.value).toBe(0.5); // a quarter note at 120 BPM
		// Sync off: the saved time is kept
		applySnapshot(st, { fx: { delay: { sync: false, division: '1/4', time: 0.2 } } });
		expect(st.fx.delay.time.value).toBe(0.2);
	});

	it('turns ping-pong and crush off for projects saved before them', () => {
		const st = fresh();
		changeEverything(st);
		expect([st.fx.delay.pingPong.value, st.fx.drive.crush.value]).toEqual([true, true]);
		applySnapshot(st, { fx: { delay: { enabled: true, mix: 0.3 }, drive: { enabled: true, amount: 0.4 } } });
		expect([st.fx.delay.pingPong.value, st.fx.drive.crush.value]).toEqual([false, false]);
		applySnapshot(st, { fx: { delay: { pingPong: true }, drive: { crush: true } } });
		expect([st.fx.delay.pingPong.value, st.fx.drive.crush.value]).toEqual([true, true]);
	});

	it('works out the delay division of projects saved before it was saved', () => {
		const delay = (tempo: number, time: number) => {
			const st = fresh();
			applySnapshot(st, { transport: { tempo }, fx: { delay: { sync: true, time } } });
			return [st.fx.delay.division.value, st.fx.delay.time.value];
		};
		expect(delay(80, 0.5625)).toEqual(['1/8.', 0.5625]);
		expect(delay(120, 0.25)).toEqual(['1/8', 0.25]);
		expect(delay(100, 0.401)[0]).toBe('1/4T'); // within 1% of 0.4 s
		// No division matches (File → New used to leave 0.2 s): the default, as the knob showed
		expect(delay(80, 0.2)).toEqual(['1/8.', 0.5625]);
	});

	it('gives projects saved before ratchets one hit per step, and keeps hit counts to 1–4', () => {
		const st = fresh();
		changeEverything(st); // ratchets 1, 2, 3, 4, 1, ...
		const synth = () => st.instruments.value.find(i => i.name === 'synth-voice')!;
		const saved = asSaved(st);
		const older = saved.instruments.map(({ ratchets, ...lane }: any) => lane);
		applySnapshot(st, { instruments: older });
		expect(synth().ratchets).toEqual(Array(STEPS).fill(1));

		applySnapshot(st, { instruments: [{ name: 'synth-voice', ratchets: [0, 7, 2.6, -1, ...Array(STEPS - 4).fill(2)] }] });
		expect(synth().ratchets).toEqual([1, 4, 3, 1, ...Array(STEPS - 4).fill(2)]);
	});

	it('gives projects saved before velocity routing none', () => {
		const st = fresh();
		changeEverything(st);
		applySnapshot(st, { synth: { envelope: { enabled: true, attackMs: 20, decayMs: 400 } } });
		expect([st.synth.velocity.decay.value, st.synth.velocity.cutoff.value, st.synth.velocity.pitchEnv.value, st.synth.velocity.noise.value]).toEqual([0, 0, 0, 0]);
		applySnapshot(st, { synth: { velocity: { decay: 250, noise: -30 } } });
		expect(st.synth.velocity.decay.value).toBe(100); // kept to ±100 %
		expect(st.synth.velocity.noise.value).toBe(-30);
	});

	it('gives projects saved before the pulse wave the default width, and keeps the new waves', () => {
		const st = fresh();
		changeEverything(st);
		applySnapshot(st, { synth: { envelope: { enabled: true, attackMs: 20, decayMs: 400 } } });
		expect(st.synth.pulse.width.value).toBe(50);
		applySnapshot(st, { synth: { pulse: { width: 75 } } });
		expect(st.synth.pulse.width.value).toBe(25); // above 50%: its mirror, which sounds the same
		applySnapshot(st, { synth: { pulse: { width: 99 } } });
		expect(st.synth.pulse.width.value).toBe(5); // and kept to 5–50%
		applySnapshot(st, { synth: { lfo: { target: 'pwm' } } });
		expect(st.synth.lfo.target.value).toBe('pwm');
		applySnapshot(st, { selectedWaveform: 'glass' });
		expect(st.selectedWaveform.value).toBe('glass');
	});

	it('gives projects saved before the filter envelope none', () => {
		const st = fresh();
		changeEverything(st);
		applySnapshot(st, { synth: { filter: { enabled: true, cutoff: 900, resonance: 2 } } });
		expect(st.synth.filter.envAmount.value).toBe(0);
		expect(st.synth.filter.envDecayMs.value).toBe(200);
		applySnapshot(st, { synth: { filter: { envAmount: 12 } } });
		expect(st.synth.filter.envAmount.value).toBe(5); // kept to ±5 octaves
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

	it('opens unison with 2–4 voices: 1 voice (which sounded as off) as off, 5 or 6 as 4', () => {
		const st = fresh(); // a computer: up to 4 voices
		const unison = (u: object) => {
			applySnapshot(st, { synth: { unison: u } });
			return [st.synth.unison.enabled.value, st.synth.unison.voices.value];
		};
		expect(unison({ enabled: true, voices: 1 })).toEqual([false, 3]);
		expect(unison({ enabled: false, voices: 1 })).toEqual([false, 3]);
		expect(unison({ enabled: true, voices: 2 })).toEqual([true, 2]);
		expect(unison({ enabled: true, voices: 4 })).toEqual([true, 4]);
		expect(unison({ enabled: true, voices: 6 })).toEqual([true, 4]);
		expect(unison({ enabled: true, voices: 5 })).toEqual([true, 4]);
		expect(unison({ enabled: true, voices: 2.6 })).toEqual([true, 3]);
	});

	it('fits saved values to this device and this app', () => {
		const st = fresh(3); // a phone: at most 3 unison voices
		applySnapshot(st, { synth: { unison: { enabled: true, voices: 6 }, lfo: { enabled: true, target: 'gain' } } });
		expect(st.synth.unison.voices.value).toBe(3);
		expect(st.synth.lfo.target.value).toBe('pitch'); // an LFO target this version doesn't have

		applySnapshot(st, { synth: { unison: { enabled: true, voices: 0 } } });
		expect(st.synth.unison.voices.value).toBe(3);
		expect(st.synth.unison.enabled.value).toBe(false);

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

import { describe, it, expect } from 'vitest';
import { applyPreset, soundKey } from './presets';
import { PRESETS } from './library';
import { buildSnapshot, resetSoundToFactoryDefaults } from '../project/snapshot';
import { STEPS, fresh, asSaved, changeEverything, leaves } from '../project/testState';
import { WAVE_IDS } from '../../audio/waves';
import { isDelayDivision } from '../delaySync';

// Each knob's range (the panels in src/components/modules/), by snapshot path
const RANGES: Record<string, [number, number]> = {
	'synth.envelope.attackMs': [1, 100],
	'synth.envelope.decayMs': [50, 2000],
	'synth.filter.cutoff': [100, 10000],
	'synth.filter.resonance': [0.1, 20],
	'synth.filter.envAmount': [-5, 5],
	'synth.filter.envDecayMs': [5, 2000],
	'synth.noise.color': [0, 1],
	'synth.noise.amount': [0, 1],
	'synth.noise.burstMs': [5, 250],
	'synth.unison.voices': [1, 3], // phones have three
	'synth.unison.detuneCents': [0, 100],
	'synth.unison.stereoSpread': [0, 100],
	'synth.lfo.rate': [0.1, 20],
	'synth.fm.modFreq': [1, 5000],
	'synth.fm.index': [0, 50],
	'synth.pitchEnv.semitones': [0, 48],
	'synth.pitchEnv.decayMs': [5, 2000],
	'synth.pulse.width': [5, 50],
	'synth.velocity.decay': [-100, 100],
	'synth.velocity.cutoff': [-100, 100],
	'synth.velocity.pitchEnv': [-100, 100],
	'synth.velocity.noise': [-100, 100],
	'fx.delay.mix': [0, 1],
	'fx.drive.amount': [0, 1],
	'fx.drive.tone': [100, 10000],
	'fx.drive.mix': [0, 1],
	'fx.reverb.mix': [0, 1],
	'fx.reverb.decay': [0.2, 4],
	'fx.reverb.tone': [0, 1],
};
const LFO_DEPTH_MAX = { pitch: 1200, filter: 5000, pwm: 45 };
const LFO_DIVISIONS = ['1/1', '1/2', '1/4', '1/8.', '1/8', '1/8T', '1/16', '1/32'];

// The preset's own settings, by snapshot path
const presetLeaves = (p: (typeof PRESETS)[number]) => leaves({ synth: p.synth ?? {}, fx: p.fx ?? {} });

// Every sound setting of a snapshot (what soundKey compares), by path
const soundLeaves = (snap: any) => {
	const all = leaves({ synth: snap.synth, fx: snap.fx });
	return Object.fromEntries(Object.entries(all).filter(([path]) =>
		!/^synth\.tuning\.|^synth\.noise\.(mask|type)$|^fx\.delay\.time$/.test(path)));
};

describe('the preset library', () => {
	it('has six presets with short, distinct names and known waves', () => {
		expect(PRESETS.map(p => p.label)).toEqual(['Kick', 'Snare', 'Metal', 'Pluck', 'Acid', 'Bell']);
		expect(new Set(PRESETS.map(p => p.id)).size).toBe(PRESETS.length);
		for (const p of PRESETS) {
			expect(p.label.length).toBeLessThanOrEqual(5);
			expect(p.description.length).toBeGreaterThan(10);
			expect(WAVE_IDS).toContain(p.wave);
		}
	});

	it('only sets settings that exist, within their knobs\' ranges', () => {
		const known = soundLeaves(asSaved(fresh()));
		for (const p of PRESETS) {
			const lfoTarget = p.synth?.lfo?.target ?? 'pitch';
			for (const [path, json] of Object.entries(presetLeaves(p))) {
				const where = `${p.id}: ${path}`;
				expect(Object.keys(known), where).toContain(path);
				const v = JSON.parse(json as string);
				if (RANGES[path]) {
					expect(v, where).toBeGreaterThanOrEqual(RANGES[path][0]);
					expect(v, where).toBeLessThanOrEqual(RANGES[path][1]);
				}
				if (path === 'synth.lfo.depth') expect(v, where).toBeLessThanOrEqual(LFO_DEPTH_MAX[lfoTarget]);
				if (path === 'synth.lfo.division') expect(LFO_DIVISIONS, where).toContain(v);
				if (path === 'synth.fm.ratio') expect([1, 1.5, 2, null], where).toContain(v);
				if (path === 'synth.pitchEnv.mode') expect(['up', 'down', 'random'], where).toContain(v);
				if (path === 'fx.delay.division') expect(isDelayDivision(v), where).toBe(true);
			}
		}
	});
});

describe('applying a preset', () => {
	it('sets its own settings, and every other sound setting to its default', () => {
		const defaults = soundLeaves(asSaved(fresh()));
		for (const p of PRESETS) {
			const st = fresh();
			changeEverything(st);
			applyPreset(st, p);
			const own = presetLeaves(p);
			const sound = soundLeaves(asSaved(st));
			for (const [path, v] of Object.entries(sound)) {
				expect(v, `${p.id}: ${path}`).toBe(path in own ? own[path] : defaults[path]);
			}
		}
	});

	it('puts its wave on every pad and as the main wave', () => {
		for (const p of PRESETS) {
			const st = fresh();
			changeEverything(st); // mixed pad waves
			applyPreset(st, p);
			expect(st.selectedWaveform.value).toBe(p.wave);
			const lane = st.instruments.value.find(i => i.name === 'synth-voice')!;
			expect(lane.waveforms).toEqual(Array(STEPS).fill(p.wave));
		}
	});

	it('leaves the pattern, tempo, swing, volume, key and Melody Maker alone', () => {
		const st = fresh();
		changeEverything(st);
		const before = asSaved(st);
		applyPreset(st, PRESETS[3]);
		const after = asSaved(st);
		expect(after.transport).toEqual(before.transport);
		expect(after.melody).toEqual(before.melody);
		expect(after.ui).toEqual(before.ui);
		expect(after.synth.tuning).toEqual(before.synth.tuning);
		expect(after.synth.noise.mask).toEqual(before.synth.noise.mask);
		const withoutWaves = (snap: any) => snap.instruments.map(({ waveforms, ...rest }: any) => rest);
		expect(withoutWaves(after)).toEqual(withoutWaves(before));
	});

	it('sounds the same whatever was set before it', () => {
		for (const p of PRESETS) {
			const fromNew = fresh();
			applyPreset(fromNew, p);
			const fromChanged = fresh();
			changeEverything(fromChanged); // also a different tempo: the delay time follows it
			applyPreset(fromChanged, PRESETS[(PRESETS.indexOf(p) + 1) % PRESETS.length]);
			applyPreset(fromChanged, p);
			expect(soundKey(buildSnapshot(fromChanged)), p.id).toBe(soundKey(buildSnapshot(fromNew)));
		}
	});

	it('keeps the synced delay time at the division and the current tempo', () => {
		const st = fresh();
		st.transport.tempo.value = 120;
		applyPreset(st, PRESETS.find(p => p.id === 'pluck')!);
		expect(st.fx.delay.division.value).toBe('1/8.');
		expect(st.fx.delay.time.value).toBeCloseTo(0.375); // a dotted eighth at 120 BPM
	});

	it('keeps unison within what the device plays', () => {
		const phone = fresh(3);
		applyPreset(phone, PRESETS.find(p => p.id === 'pluck')!);
		expect(phone.synth.unison.voices.value).toBeLessThanOrEqual(3);
	});
});

describe('resetting the sound', () => {
	it('is File → New for the synth and effects, and leaves the rest alone', () => {
		const st = fresh();
		changeEverything(st);
		const before = asSaved(st);
		resetSoundToFactoryDefaults(st);
		const after = asSaved(st);
		const factory = asSaved(fresh());
		expect(after.synth).toEqual({
			...factory.synth,
			noise: { ...factory.synth.noise, mask: before.synth.noise.mask },
			tuning: before.synth.tuning,
		});
		// The delay time is the division at this project's tempo (123 BPM)
		expect(after.fx).toEqual({ ...factory.fx, delay: { ...factory.fx.delay, time: 60 / 123 * 0.75 } });
		expect(after.transport).toEqual(before.transport);
		expect(after.instruments).toEqual(before.instruments);
		expect(after.selectedWaveform).toBe(before.selectedWaveform);
	});
});

describe('sound keys', () => {
	it('are equal for the same sound, whatever the pattern, key or tempo', () => {
		const a = fresh();
		applyPreset(a, PRESETS[0]);
		const b = fresh();
		applyPreset(b, PRESETS[0]);
		const lane = b.instruments.value.find(i => i.name === 'synth-voice')!;
		lane.steps = lane.steps.map(() => true);
		lane.pitches = lane.pitches!.map((_, i) => 300 + i);
		b.synth.noise.mask.value = b.synth.noise.mask.value.map(() => false);
		b.synth.tuning.selectedKeyRoot.value = 'D';
		b.transport.tempo.value = 140;
		b.fx.delay.time.value = 0.3214; // synced: follows the tempo
		expect(soundKey(buildSnapshot(b))).toBe(soundKey(buildSnapshot(a)));
		// The store's copy (plain JSON) gives the same key
		expect(soundKey(asSaved(b))).toBe(soundKey(buildSnapshot(a)));
	});

	it('differ when a sound setting or a pad\'s wave changes', () => {
		const st = fresh();
		applyPreset(st, PRESETS[0]);
		const key = soundKey(buildSnapshot(st));
		st.synth.filter.cutoff.value = 4999;
		expect(soundKey(buildSnapshot(st))).not.toBe(key);
		applyPreset(st, PRESETS[0]);
		expect(soundKey(buildSnapshot(st))).toBe(key);
		st.instruments.value.find(i => i.name === 'synth-voice')!.waveforms![5] = 'square';
		expect(soundKey(buildSnapshot(st))).not.toBe(key);
		// With sync off, the delay time is a setting of its own
		applyPreset(st, PRESETS[0]);
		st.fx.delay.sync.value = false;
		const unsynced = soundKey(buildSnapshot(st));
		st.fx.delay.time.value = 0.3;
		expect(soundKey(buildSnapshot(st))).not.toBe(unsynced);
	});

	it('are empty for an empty project', () => {
		expect(soundKey({})).toBe('');
		expect(soundKey(null)).toBe('');
	});
});

import { describe, it, expect } from 'vitest';
import { applyPreset, soundKey } from './presets';
import { PRESETS } from './library';
import { randomPreset, OPEN_FROM_HZ, SWEEP_REF_HZ, SWEEP_SHARE } from './random';
import { buildSnapshot, resetSoundToFactoryDefaults } from '../project/snapshot';
import { STEPS, fresh, asSaved, changeEverything, leaves } from '../project/testState';
import { WAVE_IDS } from '../../audio/waves';
import { isDelayDivision } from '../delaySync';
import { VELOCITY_SWITCH_AMOUNT } from '../../audio/velocity';

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

// Knobs whose panel rounds what it's given to its step: a value off the step would be changed
const KNOB_STEPS: Record<string, number> = {
	'synth.envelope.attackMs': 1,
	'synth.envelope.decayMs': 1,
	'synth.filter.cutoff': 1,
	'synth.filter.envAmount': 0.1,
	'synth.filter.envDecayMs': 1,
	'synth.noise.burstMs': 1,
	'synth.unison.voices': 1,
	'synth.unison.detuneCents': 1,
	'synth.unison.stereoSpread': 1,
	'synth.pitchEnv.semitones': 1,
	'synth.pitchEnv.decayMs': 1,
	'synth.pulse.width': 1,
	'synth.velocity.decay': 1,
	'synth.velocity.cutoff': 1,
	'synth.velocity.pitchEnv': 1,
	'synth.velocity.noise': 1,
};

// Every setting a preset sets exists, within its knob's range, and on its step
function expectValid(p: (typeof PRESETS)[number], where: string) {
	const known = Object.keys(soundLeaves(asSaved(fresh())));
	const lfoTarget = p.synth?.lfo?.target ?? 'pitch';
	expect(WAVE_IDS, `${where}: wave`).toContain(p.wave);
	for (const [path, json] of Object.entries(presetLeaves(p))) {
		const at = `${where}: ${path}`;
		expect(known, at).toContain(path);
		const v = JSON.parse(json as string);
		if (RANGES[path]) {
			expect(v, at).toBeGreaterThanOrEqual(RANGES[path][0]);
			expect(v, at).toBeLessThanOrEqual(RANGES[path][1]);
		}
		const step = KNOB_STEPS[path];
		if (step) expect(Math.abs(v / step - Math.round(v / step)), at).toBeLessThan(1e-9);
		if (path === 'synth.lfo.depth') expect(v, at).toBeLessThanOrEqual(LFO_DEPTH_MAX[lfoTarget]);
		if (path === 'synth.lfo.division') expect(LFO_DIVISIONS, at).toContain(v);
		if (path === 'synth.fm.ratio') expect([1, 1.5, 2, null], at).toContain(v);
		if (path === 'synth.pitchEnv.mode') expect(['up', 'down', 'random'], at).toContain(v);
		if (path === 'fx.delay.division') expect(isDelayDivision(v), at).toBe(true);
	}
}

// The same "random" numbers every run (mulberry32)
function seeded(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const ROLLS = Array.from({ length: 500 }, (_, i) => randomPreset(seeded(i + 1)));

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

	it('only sets settings that exist, within their knobs\' ranges and on their steps', () => {
		for (const p of PRESETS) expectValid(p, p.id);
	});

	it('sets velocity amounts a VEL switch can turn off and on again', () => {
		const amounts = PRESETS.flatMap(p => Object.values(p.synth?.velocity ?? {}));
		expect(amounts.length).toBeGreaterThan(0);
		for (const a of amounts) expect(a).toBe(VELOCITY_SWITCH_AMOUNT);
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

describe('the dice (a random sound)', () => {
	it('stays within the knobs\' ranges and on their steps, roll after roll', () => {
		ROLLS.forEach((p, i) => expectValid(p, `roll ${i + 1}`));
	});

	it('sets velocity amounts a VEL switch can turn off and on again', () => {
		for (const p of ROLLS) for (const a of Object.values(p.synth?.velocity ?? {})) expect(a).toBe(VELOCITY_SWITCH_AMOUNT);
	});

	it('keeps the level in the presets\' range: resonance up to 10, drive mix up to 0.35', () => {
		for (const p of ROLLS) {
			expect(p.synth?.filter?.resonance ?? 0.5).toBeLessThanOrEqual(10);
			expect(p.fx?.drive?.mix ?? 0).toBeLessThanOrEqual(0.35);
			expect(p.synth?.envelope?.decayMs).toBeGreaterThanOrEqual(80); // never a silent click
		}
	});

	it('never muffles a note with an opening filter envelope', () => {
		const opening = ROLLS.filter(p => (p.synth?.filter?.envAmount ?? 0) < 0);
		expect(opening.length).toBeGreaterThan(20);
		for (const { synth } of opening) {
			// It starts at 150 Hz or above, and has opened before the note fades
			expect(synth!.filter!.cutoff! / 2 ** -synth!.filter!.envAmount!).toBeGreaterThanOrEqual(OPEN_FROM_HZ);
			expect(synth!.filter!.envDecayMs!).toBeLessThanOrEqual(synth!.envelope!.decayMs! * 0.6);
		}
	});

	it('never leaves a note above Cutoff with a slow pitch sweep', () => {
		// A sweep that starts above Cutoff falls back within 30 % of Decay: a slow 33-semitone
		// drop onto a 435 Hz cutoff spent most of the note above it and was nearly silent
		const above = ROLLS.filter(p => p.synth?.pitchEnv && p.synth.pitchEnv.mode !== 'down'
			&& SWEEP_REF_HZ * 2 ** (p.synth.pitchEnv.semitones! / 12) > p.synth.filter!.cutoff!);
		expect(above.length).toBeGreaterThan(20);
		for (const { synth } of above) {
			expect(synth!.pitchEnv!.decayMs!).toBeLessThanOrEqual(Math.max(15, synth!.envelope!.decayMs! * SWEEP_SHARE));
		}
		// Sweeps below Cutoff keep their whole range, up to 300 ms
		expect(Math.max(...ROLLS.map(p => p.synth?.pitchEnv?.decayMs ?? 0))).toBeGreaterThan(250);
	});

	it('lands exactly, with every other sound setting at its default', () => {
		const defaults = soundLeaves(asSaved(fresh()));
		ROLLS.slice(0, 60).forEach((p, i) => {
			const st = fresh();
			changeEverything(st);
			applyPreset(st, p);
			const own = presetLeaves(p);
			for (const [path, v] of Object.entries(soundLeaves(asSaved(st)))) {
				expect(v, `roll ${i + 1}: ${path}`).toBe(path in own ? own[path] : defaults[path]);
			}
			expect(st.instruments.value.find(l => l.name === 'synth-voice')!.waveforms).toEqual(Array(STEPS).fill(p.wave));
		});
	});

	it('varies: every wave comes up, and each part is on in some rolls and off in others', () => {
		expect(new Set(ROLLS.map(p => p.wave))).toEqual(new Set(WAVE_IDS));
		const share = (on: (p: (typeof ROLLS)[number]) => boolean) => ROLLS.filter(on).length / ROLLS.length;
		const parts = {
			pitchEnv: share(p => !!p.synth?.pitchEnv),
			filterEnv: share(p => !!p.synth?.filter?.envAmount),
			noise: share(p => !!p.synth?.noise),
			fm: share(p => !!p.synth?.fm),
			unison: share(p => !!p.synth?.unison),
			lfo: share(p => !!p.synth?.lfo),
			velocity: share(p => !!p.synth?.velocity),
			reverb: share(p => !!p.fx?.reverb),
			delay: share(p => !!p.fx?.delay),
			drive: share(p => !!p.fx?.drive),
		};
		for (const [part, s] of Object.entries(parts)) {
			expect(s, part).toBeGreaterThan(0.1);
			expect(s, part).toBeLessThan(0.7);
		}
		expect(new Set(ROLLS.map(p => JSON.stringify(p))).size).toBe(ROLLS.length); // no two alike
	});

	it('is the same roll for the same random numbers, and uses Math.random by default', () => {
		expect(randomPreset(seeded(7))).toEqual(randomPreset(seeded(7)));
		expect(WAVE_IDS).toContain(randomPreset().wave);
	});
});

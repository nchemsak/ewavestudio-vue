import { describe, it, expect } from 'vitest';
import { computed, isRef } from 'vue';
import { createRhythm, resetRhythmSound, rhythmVoice, RHYTHM_DEFAULTS, type RhythmSettings } from './rhythm';
import { LFO_DEFAULT_DEPTH } from '../../audio/lfo';
import { RANDOM_WAVE_IDS } from '../../audio/waves';
import { divisionToHz } from '../../audio/synthHelpers';

const make = (maxVoices = 4) => createRhythm({ maxVoices: computed(() => maxVoices), steps: 16 });

// The refs' values, group by group
const values = (r: RhythmSettings) => JSON.parse(JSON.stringify(r, (_k, v) => (isRef(v) ? v.value : v)));

describe('the Rhythm machine', () => {
	it('starts at the factory sound', () => {
		const r = values(make());
		for (const [group, fields] of Object.entries(RHYTHM_DEFAULTS)) {
			expect(r[group], group).toMatchObject(fields);
		}
		expect(r.lfo.depths).toEqual(LFO_DEFAULT_DEPTH);
		expect(r.randomWaves).toEqual(RANDOM_WAVE_IDS);
		expect(r.velocity).toEqual({ decay: 0, cutoff: 0, pitchEnv: 0, noise: 0 });
		expect(r.noise.mask).toEqual(Array(16).fill(true));
		expect(r.sample).toBeNull();
		expect(r.sampleLength).toBe(1);
	});

	it('goes back to the factory sound, keeping the noise mask and the recording', () => {
		const r = make();
		const start = values(r);
		r.envelope.decayMs.value = 900; r.filter.cutoff.value = 300; r.noise.enabled.value = true;
		r.unison.voices.value = 2; r.lfo.target.value = 'fm'; r.lfo.depths.value = { ...LFO_DEFAULT_DEPTH, fm: 1 };
		r.fm.ratio.value = null; r.pitchEnv.mode.value = 'random'; r.pulse.width.value = 10;
		r.randomWaves.value = ['glass']; r.velocity.cutoff.value = 75;
		r.noise.mask.value = Array(16).fill(false);
		r.sample.value = { data: 'AAA=', sampleRate: 48000 }; r.sampleLength.value = 0.3;
		resetRhythmSound(r);
		const after = values(r);
		expect({ ...after, noise: { ...after.noise, mask: null }, sample: null, sampleLength: null })
			.toEqual({ ...start, noise: { ...start.noise, mask: null }, sample: null, sampleLength: null });
		expect(after.noise.mask).toEqual(Array(16).fill(false));
		expect(after.sample).toEqual({ data: 'AAA=', sampleRate: 48000 });
		expect(after.sampleLength).toBe(0.3);
	});

	it('gives note.ts its voice: the LFO at its division at the tempo, unison capped by the screen', () => {
		const r = make(3);
		r.unison.enabled.value = true; r.unison.voices.value = 4;
		r.lfo.division.value = '1/16';
		const v = rhythmVoice(r, 120);
		expect(v.lfo.rateHz).toBeCloseTo(divisionToHz('1/16', 120));
		expect(v.unison.voices).toBe(3);
		expect(rhythmVoice(make(4), 120).unison.voices).toBe(RHYTHM_DEFAULTS.unison.voices);
		expect(v.envelope).toEqual(RHYTHM_DEFAULTS.envelope);
		expect(v.sampleLength).toBe(1);
		// Plain values only: what an offline render or a note can keep
		expect(JSON.parse(JSON.stringify(v))).toEqual(v);
		expect('mask' in v.noise).toBe(false);
	});
});

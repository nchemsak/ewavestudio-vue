// src/lib/machines/bass.ts
// The Bass machine (the plan's item 4): its sound settings as refs, their factory values, its
// pattern lane (as the Rhythm machine's is the synth lane), and the plain voice
// src/audio/bass.ts plays. Like rhythm.ts.
//
// Saved as the snapshot's `bass` group: { sound, muted, level, lane } (snapshot.ts); the
// pattern slots A–D keep a Bass track beside the Rhythm one (src/lib/patterns/slots.ts).

import { reactive, ref, type Ref } from 'vue';
import { BASS_RANGES, clampBassWave, type BassPattern, type BassVoice, type BassWave } from '../../audio/bass';

export type BassSettings = {
	wave: Ref<BassWave>;
	sub: Ref<number>;
	cutoff: Ref<number>;
	resonance: Ref<number>;
	envAmount: Ref<number>;
	decayMs: Ref<number>;
	accent: Ref<number>;
	slideMs: Ref<number>;
};

// The lane being edited (the current slot's Bass track), as the pads read and write it
// `pedals`: how much of it goes through the pedals, 0..1 (the rail's Pedals knob)
export type BassLane = BassPattern & { muted: boolean; level: number; pedals: number };

// The factory sound: a fresh page and File → New
export const BASS_DEFAULTS = {
	wave: 'saw' as BassWave, sub: 0.5, cutoff: 320, resonance: 0.55, envAmount: 3, decayMs: 260, accent: 0.6, slideMs: 60,
};
export const BASS_LEVEL_DEFAULT = 0.6;

export const BASS_SOUND_KEYS = ['wave', 'sub', 'cutoff', 'resonance', 'envAmount', 'decayMs', 'accent', 'slideMs'] as const;

export function createBass(): BassSettings {
	const d = BASS_DEFAULTS;
	return {
		wave: ref<BassWave>(d.wave), sub: ref(d.sub), cutoff: ref(d.cutoff), resonance: ref(d.resonance),
		envAmount: ref(d.envAmount), decayMs: ref(d.decayMs), accent: ref(d.accent), slideMs: ref(d.slideMs),
	};
}

export function resetBassSound(b: BassSettings) {
	for (const k of BASS_SOUND_KEYS) (b[k] as Ref<unknown>).value = BASS_DEFAULTS[k];
}

/** An empty Bass pattern: every step off, at full velocity, on `hz`, no accent, slide or tie */
export function emptyBassPattern(n: number, hz: number): BassPattern {
	return {
		steps: Array(n).fill(false), velocities: Array(n).fill(1), pitches: Array(n).fill(hz),
		accents: Array(n).fill(false), slides: Array(n).fill(false), ties: Array(n).fill(false),
	};
}

export function createBassLane(n: number, hz: number): BassLane {
	return reactive({ ...emptyBassPattern(n, hz), muted: false, level: BASS_LEVEL_DEFAULT, pedals: 1 });
}

/** The voice src/audio/bass.ts plays, from the settings now */
export function bassVoice(b: BassSettings): BassVoice {
	return {
		wave: b.wave.value, sub: b.sub.value, cutoff: b.cutoff.value, resonance: b.resonance.value,
		envAmount: b.envAmount.value, decayMs: b.decayMs.value, accent: b.accent.value, slideMs: b.slideMs.value,
	};
}

/** The sound as saved */
export function bassSoundSnapshot(b: BassSettings) {
	return Object.fromEntries(BASS_SOUND_KEYS.map((k) => [k, b[k].value])) as BassVoice;
}

/** A saved sound back into the settings: missing or wrongly typed values are left as they are */
export function applyBassSound(b: BassSettings, s: any) {
	if (!s || typeof s !== 'object') return;
	if (typeof s.wave === 'string') b.wave.value = clampBassWave(s.wave);
	for (const k of BASS_SOUND_KEYS) {
		if (k === 'wave') continue;
		const x = s[k];
		if (typeof x !== 'number' || !Number.isFinite(x)) continue;
		const [lo, hi] = BASS_RANGES[k];
		(b[k] as Ref<number>).value = Math.min(hi, Math.max(lo, x));
	}
}

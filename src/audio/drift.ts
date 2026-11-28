// src/audio/drift.ts
// The Drift machine's voice (the plan's item 6), for the live engine and the export engine:
// held chords for strings and ambience, after the Elta Solar 42F's swarm voices. Six plates,
// one per note of the key's chord stacked in thirds (1 3 5 7 9 11), so the plates held in a bar
// spell a chord (A C E is Am, C E G is C...). Each held note is a small swarm of oscillators
// (Voices), spread in pitch and across the stereo field (Spread), each wandering slowly on its
// own (Drift); it fades in over Attack and out over Release, both in bars. A note held from one
// bar into the next carries on without starting again, so only the notes that change move.
// One slow low-pass (Filter) over the whole machine. No steps: a chord per bar, 4 or 8 bars,
// counted from Play across the pattern chain. Straight to the reverb (the machine's Pedals is
// its reverb send), skipping the overdrive and the delay.
//
// The pure parts (the plates' pitches, a bar's chord name, which notes a run of bars holds)
// are unit-tested.

import { NOTE_TO_SEMITONE, SCALES, type KeyScale } from '../lib/melody/theory';
import type { MotionShape } from './driftMotion';
import type { PulseMode } from './driftPulse';

export const DRIFT_PLATES = 6;
export const DRIFT_MAX_BARS = 8;
export const DRIFT_LENGTHS = [4, 8] as const;

// The voice's sound (the Drift machine's settings as plain values: driftVoice() in
// src/lib/machines/drift.ts)
export type DriftVoice = {
	voices: number;   // oscillators per note, 3–7
	drift: number;    // 0..1: how far each voice wanders in pitch
	wave: number;     // 0..1: soft (few harmonics) to bright (a saw)
	spread: number;   // 0..1: the voices' detune and stereo width
	cutoff: number;   // Hz, the machine's low-pass
	attack: number;   // bars to fade in
	release: number;  // bars to fade out
	// Motion (the plan's item 19, src/audio/driftMotion.ts): the X/Y pad's dot moving by itself
	motionShape: MotionShape;
	motionRate: number;  // bars a cycle: 1, 2, 4, 8 or 16 (not Swell's)
	motionDepth: number; // 0..1, 0: off
	// Pulse (the plan's item 20, src/audio/driftPulse.ts): a gate on the level, or Duck
	pulseMode: PulseMode;
	pulseDepth: number;  // 0..1: how far the level drops
};

export const DRIFT_RANGES = {
	voices: [3, 7], drift: [0, 1], wave: [0, 1], spread: [0, 1], cutoff: [150, 8000], attack: [0.25, 4], release: [0.25, 4],
	motionRate: [1, 16], motionDepth: [0, 1], pulseDepth: [0, 1],
} as const;

// The swarm: its widest detune (cents either side, at full Spread), its wander (cents at full
// Drift) and how fast each voice wanders (Hz, a range per voice)
const SPREAD_CENTS = 18;
const DRIFT_CENTS = 14;
const WANDER_HZ: readonly [number, number] = [0.06, 0.24];
// One note's loudness at the machine's full level, before the voices are summed (each voice
// gets 1/√voices of it), so a full chord stays under the limiter's ceiling
export const DRIFT_NOTE_GAIN = 0.22;
// The filter's resonance (gentle) and how slowly it follows a turn (time constant, s)
const FILTER_Q = 0.8;
export const FILTER_GLIDE_S = 0.12;

// The plates START

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Semitones above the key's root of each plate: the scale's degrees 1 3 5 7 9 11 (no scale: major) */
export function plateSemitones(scale: KeyScale): number[] {
	const steps: readonly number[] = scale !== 'none' && SCALES[scale] ? SCALES[scale] : SCALES.major;
	return Array.from({ length: DRIFT_PLATES }, (_, k) => {
		const i = k * 2;
		return steps[i % steps.length] + 12 * Math.floor(i / steps.length);
	});
}

/** The key's root in Drift's octave (C3–B3: A3 is 220 Hz), as a MIDI note */
export function driftRootMidi(root: string): number {
	return 48 + mod(NOTE_TO_SEMITONE[root] ?? 9, 12);
}

/** Each plate's pitch (Hz) in the key */
export function plateHz(root: string, scale: KeyScale): number[] {
	const r = driftRootMidi(root);
	return plateSemitones(scale).map((st) => 440 * 2 ** ((r + st - 69) / 12));
}

/** Each plate's pitch class (0–11) in the key */
export function platePitchClasses(root: string, scale: KeyScale): number[] {
	const r = driftRootMidi(root);
	return plateSemitones(scale).map((st) => mod(r + st, 12));
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * The note names to spell the plates with: stacked thirds take every other letter, so the
 * spelling (sharps or flats) whose plate names each have a letter of their own (C minor: C Eb G
 * Bb D F, not C D# G A# D F); when both or neither do, `prefer`'s.
 */
export function plateSpelling(pcs: number[], prefer: 'sharp' | 'flat'): string[] {
	const distinct = (names: string[]) => new Set(pcs.map((p) => names[mod(p, 12)][0])).size === new Set(pcs.map((p) => mod(p, 12))).size;
	const sharp = distinct(SHARP_NAMES), flat = distinct(FLAT_NAMES);
	if (sharp !== flat) return sharp ? SHARP_NAMES : FLAT_NAMES;
	return prefer === 'flat' ? FLAT_NAMES : SHARP_NAMES;
}

// Chord shapes, as intervals above their root, in the order a name is preferred
const SHAPES: { name: string; set: number[] }[] = [
	{ name: '', set: [0, 4, 7] },
	{ name: 'm', set: [0, 3, 7] },
	{ name: 'maj7', set: [0, 4, 7, 11] },
	{ name: 'm7', set: [0, 3, 7, 10] },
	{ name: '7', set: [0, 4, 7, 10] },
	{ name: 'dim', set: [0, 3, 6] },
	{ name: 'm7b5', set: [0, 3, 6, 10] },
	{ name: 'aug', set: [0, 4, 8] },
	{ name: 'sus2', set: [0, 2, 7] },
	{ name: 'sus4', set: [0, 5, 7] },
	{ name: 'add9', set: [0, 2, 4, 7] },
	{ name: 'madd9', set: [0, 2, 3, 7] },
	{ name: 'maj9', set: [0, 2, 4, 7, 11] },
	{ name: 'm9', set: [0, 2, 3, 7, 10] },
	{ name: '9', set: [0, 2, 4, 7, 10] },
	{ name: '5', set: [0, 7] },
	{ name: 'm11', set: [0, 2, 3, 5, 7, 10] },
	{ name: '11', set: [0, 2, 4, 5, 7, 10] },
	{ name: 'maj11', set: [0, 2, 4, 5, 7, 11] },
];

/**
 * A chord's name from the pitch classes held, lowest first ("Am", "Cmaj7", "Em7"): the lowest
 * note as the root when a shape fits it, else any held note; failing that, the notes' names
 * ("A·D"). `names` spells each pitch class (sharps or flats, as the key). Nothing held: ''.
 */
export function chordLabel(held: number[], names: readonly string[]): string {
	const pcs = [...new Set(held.map((p) => mod(p, 12)))];
	if (!pcs.length) return '';
	if (pcs.length === 1) return names[pcs[0]];
	for (const root of pcs) {
		const rel = pcs.map((p) => mod(p - root, 12)).sort((a, b) => a - b);
		const shape = SHAPES.find((s) => s.set.length === rel.length && s.set.every((x, i) => x === rel[i]));
		if (shape) return names[root] + shape.name;
	}
	return pcs.map((p) => names[p]).join('·');
}

// The plates END

// The bars START

/** A plate's run of bars: from `start` to `end` (bars, end not included) */
export type DriftRun = {
	plate: number;
	start: number;
	end: number;
	// A seamless loop: the run carries on from the loop's end (starts at full level), or into
	// its start (doesn't fade out at the end)
	carriedIn: boolean;
	carriedOut: boolean;
};

/** Which plates bar `bar` holds (bars counted from Play; the chords repeat every `length`) */
export function heldInBar(chords: boolean[][], length: number, bar: number): boolean[] {
	const n = Math.max(1, Math.min(DRIFT_MAX_BARS, length));
	const c = chords[mod(bar, n)] ?? [];
	return Array.from({ length: DRIFT_PLATES }, (_, k) => !!c[k]);
}

/**
 * Every note `bars` bars play, as runs: a plate held through several bars in a row is one note.
 * `loop`: the bars repeat (a seamless loop export), so a plate held both at the end and at the
 * start carries on round, starting at full level and not fading out at the end.
 */
export function driftRuns(chords: boolean[][], length: number, bars: number, loop: boolean): DriftRun[] {
	const runs: DriftRun[] = [];
	const held = (b: number) => heldInBar(chords, length, b);
	for (let k = 0; k < DRIFT_PLATES; k++) {
		let b = 0;
		while (b < bars) {
			if (!held(b)[k]) { b++; continue; }
			const start = b;
			while (b < bars && held(b)[k]) b++;
			runs.push({
				plate: k, start, end: b,
				carriedIn: loop && start === 0 && held(bars - 1)[k],
				carriedOut: loop && b === bars && held(0)[k],
			});
		}
	}
	return runs;
}

/** Whether any bar of the first `length` holds a plate */
export function driftHasNotes(chords: boolean[][], length: number): boolean {
	for (let b = 0; b < Math.min(length, chords.length); b++) if (chords[b]?.some(Boolean)) return true;
	return false;
}

// The bars END

// The sound START

/** Each voice's detune (cents) and pan (−1..1) for `n` voices at `spread`: lowest on the left */
export function swarmLayout(n: number, spread: number): { cents: number; pan: number }[] {
	const s = Math.max(0, Math.min(1, spread));
	return Array.from({ length: n }, (_, i) => {
		const x = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
		return { cents: x * SPREAD_CENTS * s, pan: x * s };
	});
}

/** The wave's harmonics' amplitudes (1/n^p: p 3 when soft, 1, a saw, when bright) */
export function waveHarmonics(wave: number, count = 32): number[] {
	const p = 3 - 2 * Math.max(0, Math.min(1, wave));
	return Array.from({ length: count + 1 }, (_, n) => (n === 0 ? 0 : 1 / n ** p));
}

const waveCache = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
function periodicWave(ctx: BaseAudioContext, wave: number): PeriodicWave {
	const key = Math.round(Math.max(0, Math.min(1, wave)) * 50);
	let m = waveCache.get(ctx);
	if (!m) waveCache.set(ctx, (m = new Map()));
	let w = m.get(key);
	if (!w) {
		const real = new Float32Array(waveHarmonics(key / 50));
		w = ctx.createPeriodicWave(real.map(() => 0), real);
		m.set(key, w);
	}
	return w;
}

/** The machine's filter: the one slow low-pass every note goes through */
export function createDriftFilter(ctx: BaseAudioContext, cutoff: number): BiquadFilterNode {
	const f = ctx.createBiquadFilter();
	f.type = 'lowpass';
	f.Q.value = FILTER_Q;
	f.frequency.value = clampCutoff(cutoff);
	return f;
}
export const clampCutoff = (hz: number) => Math.max(DRIFT_RANGES.cutoff[0], Math.min(DRIFT_RANGES.cutoff[1], hz || 1000));

export type DriftNote = {
	freq: number;
	time: number;
	amp: number;       // the machine's level
	attackS: number;   // seconds to fade in (0: starts at full)
};

export type DriftSounding = {
	freq: number;
	/** Fades out from `at` over `seconds` (once; a later call does nothing) */
	release: (at: number, seconds: number) => void;
	/** Follows Spread and Drift while it sounds (the X/Y pad, the knob) */
	update: (v: Pick<DriftVoice, 'spread' | 'drift'>, at: number) => void;
	released: boolean;
};

/** One held note, a swarm of `voices` oscillators, into `out`; `random` places each voice's wander.
 * `spreadMod`: a signal added to Spread (Motion's, src/audio/driftMotion.ts), which every voice
 * follows: its detune and pan move with it as with the knob. */
export function playDriftNote(ctx: BaseAudioContext, voice: DriftVoice, note: DriftNote, out: AudioNode, random: () => number = Math.random,
	spreadMod?: AudioNode): DriftSounding {
	const t = note.time;
	const n = Math.round(Math.max(DRIFT_RANGES.voices[0], Math.min(DRIFT_RANGES.voices[1], voice.voices)));
	const env = ctx.createGain();
	const peak = DRIFT_NOTE_GAIN * Math.max(0, note.amp);
	const attack = Math.max(0, note.attackS);
	if (attack > 0) {
		env.gain.setValueAtTime(0, t);
		env.gain.linearRampToValueAtTime(peak, t + attack);
	} else {
		env.gain.setValueAtTime(peak, t);
	}
	env.connect(out);
	const wave = periodicWave(ctx, voice.wave);
	const layout = swarmLayout(n, voice.spread);
	const parts = layout.map((l, li) => {
		const osc = ctx.createOscillator();
		osc.setPeriodicWave(wave);
		osc.frequency.value = note.freq;
		osc.detune.value = l.cents;
		// Each voice wanders on its own: a slow sine on its detune, from a random point of its cycle
		const wander = ctx.createOscillator();
		wander.frequency.value = WANDER_HZ[0] + random() * (WANDER_HZ[1] - WANDER_HZ[0]);
		const depth = ctx.createGain();
		depth.gain.value = DRIFT_CENTS * Math.max(0, Math.min(1, voice.drift));
		const pan = ctx.createStereoPanner();
		pan.pan.value = l.pan;
		const g = ctx.createGain();
		g.gain.value = 1 / Math.sqrt(n);
		wander.connect(depth).connect(osc.detune);
		osc.connect(g).connect(pan).connect(env);
		// Motion's spread: this voice's share of it, in cents and in pan (as swarmLayout's)
		let mods: GainNode[] = [];
		if (spreadMod) {
			const unit = swarmLayout(n, 1)[li];
			const toCents = ctx.createGain(), toPan = ctx.createGain();
			toCents.gain.value = unit.cents;
			toPan.gain.value = unit.pan;
			spreadMod.connect(toCents).connect(osc.detune);
			spreadMod.connect(toPan).connect(pan.pan);
			mods = [toCents, toPan];
		}
		osc.start(t);
		wander.start(t);
		return { osc, wander, depth, pan, mods };
	});
	// Every other voice wanders the other way first, so the swarm spreads out from the start
	parts.forEach((p, i) => { if (i % 2) p.depth.gain.value *= -1; });

	let released = false;
	const sounding: DriftSounding = {
		freq: note.freq,
		get released() { return released; },
		release(at: number, seconds: number) {
			if (released) return;
			released = true;
			const from = Math.max(at, t);
			// The level at `from`, worked out from the attack (no reading back from the param)
			const v = attack > 0 ? peak * Math.min(1, (from - t) / attack) : peak;
			const r = Math.max(0.005, seconds);
			env.gain.cancelScheduledValues(from);
			// Carry the fade-in's line on to `from`, then fade out from there. Cancelling removes
			// the fade-in's end too when it isn't before `from` (a 1-bar Attack ends on the bar
			// line), and a step to `v` at `from` would leave the level at the fade-in's start, 0,
			// until then: silence up to the bar line, its whole run in an export (until PR 133)
			if (from > t) env.gain.linearRampToValueAtTime(v, from);
			else env.gain.setValueAtTime(v, from);
			env.gain.linearRampToValueAtTime(0, from + r);
			for (const p of parts) {
				p.osc.stop(from + r + 0.05);
				p.wander.stop(from + r + 0.05);
			}
			// The spread's signal lives on: let go of this note's taps on it, so the note can go
			parts[0].osc.onended = () => {
				try { env.disconnect(); } catch { /* gone */ }
				if (spreadMod) for (const p of parts) for (const m of p.mods) { try { spreadMod.disconnect(m); } catch { /* gone */ } }
			};
		},
		update(v, at: number) {
			const lay = swarmLayout(n, v.spread);
			parts.forEach((p, i) => {
				p.osc.detune.setTargetAtTime(lay[i].cents, at, 0.08);
				p.pan.pan.setTargetAtTime(lay[i].pan, at, 0.08);
				p.depth.gain.setTargetAtTime((i % 2 ? -1 : 1) * DRIFT_CENTS * Math.max(0, Math.min(1, v.drift)), at, 0.08);
			});
		},
	};
	return sounding;
}

// The sound END

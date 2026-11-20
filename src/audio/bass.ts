// src/audio/bass.ts
// The Bass machine's voice (the plan's item 4), for the live engine and the export engine:
// one note at a time, a saw or a square with a sine an octave down (Sub), through one
// resonant low-pass whose cutoff starts Env octaves up and falls back within Decay, as on a
// classic monosynth. Per step: Accent (louder, and the filter opens further and closes
// sooner), Slide (the note glides into the next step's, which doesn't start again) and Tie
// (the note holds through the next step, which isn't played).
//
// What the steps play is worked out here too (`bassPlan()`, pure, unit-tested), so both
// engines read a pattern the same way. A note is cut where the next one starts
// (`cut()`), as a single-voice synth retriggers.

export type BassWave = 'saw' | 'square';
export const BASS_WAVES: readonly BassWave[] = ['saw', 'square'];

// The pads' range for Bass (A0 is 27.5 Hz; B2 247 Hz)
export const BASS_MIN_HZ = 30;
export const BASS_MAX_HZ = 250;

// The voice's sound (the Bass machine's settings as plain values: bassVoice() in
// src/lib/machines/bass.ts)
export type BassVoice = {
	wave: BassWave;
	sub: number;        // 0..1, the sine an octave down
	cutoff: number;     // Hz
	resonance: number;  // 0..1
	envAmount: number;  // octaves the cutoff starts above Cutoff, 0..5
	decayMs: number;    // the note's and the filter's decay
	accent: number;     // 0..1: how much an accented step stands out
	slideMs: number;    // how long a slide takes
};

export const BASS_RANGES = {
	sub: [0, 1], cutoff: [40, 4000], resonance: [0, 1], envAmount: [0, 5],
	decayMs: [30, 2000], accent: [0, 1], slideMs: [10, 400],
} as const;

export function clampBassWave(x: unknown): BassWave {
	return x === 'square' ? 'square' : 'saw';
}

// The plan START

/** The parts of a Bass pattern the plan reads (per step) */
export type BassPattern = {
	steps: boolean[];
	pitches: number[];
	velocities: number[];
	accents: boolean[];
	slides: boolean[];
	ties: boolean[];
};

/** A note that starts on a step: how many steps it lasts, and where it glides */
export type BassHit = {
	step: number;
	freq: number;
	vel: number;
	accent: boolean;
	steps: number; // 1: its own step; more while tied or slid into the next ones
	// Each step it slides into: how many steps after its own (1, 2...), to what pitch
	glides: { at: number; freq: number }[];
};

// Does the note sounding on step k carry on into the step after it?
function carries(p: BassPattern, k: number, n: number) {
	if (p.ties[k]) return true;
	return !!p.slides[k] && !!p.steps[(k + 1) % n];
}

/**
 * Per step, the note that starts there, or null (no note, or the step is part of a note
 * that started before it: tied into, or slid into). Tie holds the note through the next step
 * whether or not that step is on; Slide glides into the next step's note, if it's on. Both on
 * one step: Tie. Round the bar's end, as the pattern loops.
 */
export function bassPlan(p: BassPattern, n: number): (BassHit | null)[] {
	// Which steps a note already sounding carries into (two passes: round the end)
	const sounding = Array.from({ length: n }, (_, i) => !!p.steps[i]);
	const absorbed = Array(n).fill(false);
	for (let pass = 0; pass < 2; pass++) {
		for (let i = 0; i < n; i++) {
			const k = (i - 1 + n) % n;
			absorbed[i] = sounding[k] && carries(p, k, n);
			sounding[i] = !!p.steps[i] || absorbed[i];
		}
	}
	// A bar tied all the way round has no start: the first step that's on starts it
	if (!absorbed.some((a, i) => !a && p.steps[i])) {
		const first = p.steps.findIndex(Boolean);
		if (first >= 0 && first < n) absorbed[first] = false;
	}
	return Array.from({ length: n }, (_, i) => {
		if (!p.steps[i] || absorbed[i]) return null;
		const hit: BassHit = {
			step: i, freq: p.pitches[i], vel: p.velocities[i] ?? 1, accent: !!p.accents[i], steps: 1, glides: [],
		};
		// Follow it while it carries on (at most round the bar)
		for (let k = i; hit.steps < n && carries(p, k % n, n); k++) {
			const next = (k + 1) % n;
			if (!p.ties[k % n]) hit.glides.push({ at: hit.steps, freq: p.pitches[next] });
			hit.steps++;
			if (next === i) break;
		}
		return hit;
	});
}

/** Seconds from step `i`'s start to the start of the step `k` steps later, swing included */
export function stepOffset(i: number, k: number, stepS: number, swing: number) {
	const shift = (j: number) => (j % 2 === 1 ? stepS * swing : 0);
	return k * stepS + shift(i + k) - shift(i);
}

// The plan END

// The note START

export type BassNote = {
	freq: number;
	amp: number;        // the step's velocity × the machine's level
	accent?: boolean;
	time: number;       // when it starts
	holdUntil?: number; // a tied or slid note holds until then before it decays (missing: time)
	glides?: { time: number; freq: number }[];
};

export type BassWiring = {
	ctx: BaseAudioContext;
	out: AudioNode[]; // the tone's ways out (the drive's dry and shaper, or driveSum)
};

export type BassSounding = {
	end: number;               // when it ends by itself
	cut: (at: number) => void; // ends it at `at`, quickly (the next note starts)
};

// The note's level at full velocity (a saw at full scale; a square is louder for its RMS)
const BASS_LEVEL = 0.5;
const SQUARE_BALANCE = 0.6;
const ATTACK_S = 0.003;
const CUT_S = 0.005;

/** Pure: the note's numbers (unit-tested) */
export function bassNoteShape(v: BassVoice, note: Pick<BassNote, 'time' | 'holdUntil' | 'accent'>) {
	const decay = Math.max(0.03, (Number.isFinite(v.decayMs) ? v.decayMs : 260) / 1000);
	const acc = note.accent ? Math.max(0, Math.min(1, v.accent)) : 0;
	const hold = Math.max(note.time + ATTACK_S, note.holdUntil ?? note.time);
	return {
		peak: BASS_LEVEL * (1 + acc),                 // up to +6 dB
		envOct: Math.max(0, v.envAmount) + 2 * acc,   // the filter opens further...
		envTc: (decay * (1 - 0.5 * acc)) / 4,         // ...and closes sooner
		ampTc: decay / 3,
		hold,
		end: hold + decay * 1.6,
	};
}

/** Resonance 0..1 as the filter's Q */
export function bassQ(resonance: number) {
	const r = Math.max(0, Math.min(1, resonance));
	return 0.7 + r * r * 14;
}

/** Plays one note; returns when it ends and a way to cut it short */
export function playBassNote(v: BassVoice, note: BassNote, w: BassWiring): BassSounding {
	const { ctx } = w;
	const t = note.time;
	const shape = bassNoteShape(v, note);
	const slideTc = Math.max(0.01, v.slideMs / 1000) / 3;

	const osc = ctx.createOscillator();
	osc.type = v.wave === 'square' ? 'square' : 'sawtooth';
	const sub = ctx.createOscillator();
	sub.type = 'sine';
	for (const [o, m] of [[osc, 1], [sub, 0.5]] as const) {
		o.frequency.setValueAtTime(note.freq * m, t);
		for (const g of note.glides ?? []) o.frequency.setTargetAtTime(g.freq * m, g.time, slideTc);
	}
	const oscGain = ctx.createGain();
	oscGain.gain.value = v.wave === 'square' ? SQUARE_BALANCE : 1;
	const subGain = ctx.createGain();
	subGain.gain.value = Math.max(0, Math.min(1, v.sub)) * 0.9;

	const filter = ctx.createBiquadFilter();
	filter.type = 'lowpass';
	const cutoff = Math.max(20, Math.min(18000, v.cutoff));
	filter.frequency.setValueAtTime(cutoff, t);
	filter.Q.setValueAtTime(bassQ(v.resonance), t);
	// The envelope: an offset in cents on detune, kept under 18 kHz
	const envCents = 1200 * Math.min(shape.envOct, Math.log2(18000 / cutoff));
	filter.detune.setValueAtTime(envCents, t);
	filter.detune.setTargetAtTime(0, t + ATTACK_S, shape.envTc);

	const env = ctx.createGain();
	const peak = Math.max(0.0001, note.amp * shape.peak);
	env.gain.setValueAtTime(0, t);
	env.gain.linearRampToValueAtTime(peak, t + ATTACK_S);
	env.gain.setValueAtTime(peak, shape.hold);
	env.gain.setTargetAtTime(0, shape.hold, shape.ampTc);
	env.gain.setValueAtTime(peak * Math.exp(-(shape.end - 0.01 - shape.hold) / shape.ampTc), shape.end - 0.01);
	env.gain.linearRampToValueAtTime(0, shape.end);

	// The cut: a gain of its own, so cutting needs no knowledge of where the envelope is
	const cutGain = ctx.createGain();
	osc.connect(oscGain).connect(filter);
	sub.connect(subGain).connect(filter);
	filter.connect(env).connect(cutGain);
	for (const o of w.out) cutGain.connect(o);

	osc.start(t);
	sub.start(t);
	osc.stop(shape.end + 0.01);
	sub.stop(shape.end + 0.01);
	osc.onended = () => { try { cutGain.disconnect(); } catch { /* gone */ } };

	let end = shape.end;
	return {
		get end() { return end; },
		cut(at: number) {
			if (at >= end) return;
			const from = Math.max(at, t);
			cutGain.gain.setValueAtTime(1, from);
			cutGain.gain.linearRampToValueAtTime(0, from + CUT_S);
			osc.stop(from + CUT_S + 0.005);
			sub.stop(from + CUT_S + 0.005);
			end = from + CUT_S;
		},
	};
}

/** The steps of one bar as notes on the context's clock: what both engines play */
export function bassNotesForBar(p: BassPattern, n: number, barStart: number, stepS: number, swing: number, level: number): BassNote[] {
	const notes: BassNote[] = [];
	bassPlan(p, n).forEach((hit) => {
		if (!hit || hit.vel <= 0) return;
		const t = barStart + stepOffset(0, hit.step, stepS, swing);
		notes.push(bassNoteFromHit(hit, t, stepS, swing, level));
	});
	return notes;
}

/** One hit as a note starting at `t` */
export function bassNoteFromHit(hit: BassHit, t: number, stepS: number, swing: number, level: number): BassNote {
	return {
		freq: hit.freq,
		amp: Math.max(0, Math.min(1, hit.vel * level)),
		accent: hit.accent,
		time: t,
		holdUntil: t + stepOffset(hit.step, hit.steps - 1, stepS, swing),
		glides: hit.glides.map((g) => ({ time: t + stepOffset(hit.step, g.at, stepS, swing), freq: g.freq })),
	};
}

// The note END

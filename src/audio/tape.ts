// Tape pedal: the fourth pedal, last in the chain, in the live and export engines. Everything
// goes through it: the synth with its drive, the delay's echoes, the reverb, and the noise
// layer, which skips the other pedals.
//
//   AGE     how worn the tape is: soft saturation (louder parts are squeezed, quieter ones come
//           up), a duller top (a low-pass that closes from 20 kHz to 3.2 kHz) and the tape's
//           own noise.
//   WOBBLE  wow and flutter: the sound passes through a very short delay whose time drifts, so
//           its pitch sways.
//   TAPE | VINYL  what the noise is (hiss, or a record's crackle and pops over a little
//           surface noise) and how the pitch sways (a tape's slow wow, slower drift and fast
//           flutter, or a record turning 33⅓ times a minute, a little off-centre and warped).
//
//   input ─► sat ─► dull ─► wow ─► output            sidechain ─► shaper ─► sat.gain
//   hiss ─► filters ─► hissGain ─┬► noise            sines ─► wow.delayTime
//   crackle ─► crackleGain ──────┘
//
// The saturation is a gain, not a curve the sound goes through: `shaper` reads the level of
// the whole mix (`sidechain`) and sets how much `sat` turns everything down at that instant, to
// tanh(k·x) / (k·x) of it. Through it the mix comes out as k⁻¹·tanh(k·mix), a plain soft
// saturation, and a part of the mix (an export stem: the dry sound, the echoes, the reverb, the
// noise layer) gets the very same gain, so the stems still add up to the mix sample for sample.
// The noise is added after it, and is a stem of its own.

export type TapeMode = 'tape' | 'vinyl';
export const TAPE_MODES: readonly TapeMode[] = ['tape', 'vinyl'];
export const clampTapeMode = (v: unknown): TapeMode => (v === 'vinyl' ? 'vinyl' : 'tape');

// The pedal's starting values (off)
export const TAPE_DEFAULTS = { age: 0.4, wobble: 0.3, mode: 'tape' as TapeMode };

export const TAPE_CUTOFF_NEW = 20000; // Hz, AGE at 0
export const TAPE_CUTOFF_OLD = 3200;  // Hz, AGE at 1
export const TAPE_SAT_MAX = 3;        // the saturation's k at AGE 1 (0: none)
// The level the makeup gain keeps where it was (quieter sounds come up, louder ones are squeezed)
export const TAPE_SAT_REF = 0.4;
export const TAPE_HISS_MAX = 0.03;    // the hiss source's gain at AGE 1
export const TAPE_CRACKLE_MAX = 0.12; // the crackle's (its loudest pop peaks at this)
export const VINYL_SURFACE = 0.35;    // a record's surface noise, as a share of a tape's hiss

// What sways the pitch: each part's rate, and how far it bends the pitch at WOBBLE 1 (0.01 = 1 %)
type WobblePart = { hz: number; bend: number };
export const WOBBLE_PARTS: Record<TapeMode, readonly WobblePart[]> = {
	tape: [{ hz: 0.8, bend: 0.01 }, { hz: 0.31, bend: 0.004 }, { hz: 7.5, bend: 0.002 }],
	// 33⅓ turns a minute, and twice that for a warp; no flutter
	vinyl: [{ hz: 100 / 180, bend: 0.009 }, { hz: 200 / 180, bend: 0.003 }, { hz: 7.5, bend: 0 }],
};
export const WOBBLE_VOICES = 3;
// The delay is never shorter than this, so its time stays above zero
const WOBBLE_FLOOR_S = 0.0003;

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

export type TapeSettings = {
	cutoffHz: number;
	satK: number;     // 0 = no saturation
	makeup: number;   // gain after the saturation
	hissGain: number;
	crackleGain: number;
	// Each sine on the delay's time: its rate, and how far it moves the time either way
	wobble: { hz: number; seconds: number }[];
	baseDelay: number; // the delay's time at rest, seconds
};

// The makeup gain for a saturation k: the reference level comes out as loud as it went in
export function tapeMakeup(k: number): number {
	const x = k * TAPE_SAT_REF;
	return x < 1e-6 ? 1 : x / Math.tanh(x);
}

// What the pedal's knobs mean. `loopSeconds` (an export): each sway's rate is moved to the
// nearest one with whole cycles in that time, so the loop repeats without a jump in pitch.
export function tapeSettings(age: number, wobble: number, mode: TapeMode | string, loopSeconds = 0): TapeSettings {
	const a = clamp01(age);
	const w = clamp01(wobble) ** 1.5; // the first half of the knob stays subtle
	const vinyl = clampTapeMode(mode) === 'vinyl';
	const satK = TAPE_SAT_MAX * a;
	const hiss = TAPE_HISS_MAX * a ** 1.5;
	const parts = WOBBLE_PARTS[vinyl ? 'vinyl' : 'tape'].map(({ hz, bend }) => {
		const rate = loopSeconds > 0 ? Math.max(1, Math.round(hz * loopSeconds)) / loopSeconds : hz;
		// A sine of this many seconds on the delay's time bends the pitch by `bend` at its steepest
		return { hz: rate, seconds: (bend * w) / (2 * Math.PI * rate) };
	});
	return {
		cutoffHz: TAPE_CUTOFF_NEW * (TAPE_CUTOFF_OLD / TAPE_CUTOFF_NEW) ** a,
		satK,
		makeup: tapeMakeup(satK),
		hissGain: vinyl ? hiss * VINYL_SURFACE : hiss,
		crackleGain: vinyl ? TAPE_CRACKLE_MAX * a ** 1.5 : 0,
		wobble: parts,
		// At rest in the middle of its swing; with no wobble there is no delay at all
		baseDelay: w > 0 ? WOBBLE_FLOOR_S + parts.reduce((sum, p) => sum + p.seconds, 0) : 0,
	};
}

// The delay's time `t` seconds after its sines started (they all start at zero, rising)
export function wobbleDelayAt(s: TapeSettings, t: number): number {
	return s.baseDelay + s.wobble.reduce((sum, p) => sum + p.seconds * Math.sin(2 * Math.PI * p.hz * t), 0);
}

// How far the pitch is off at `t`, as a ratio (1.01: 1 % sharp): the delay getting shorter
// plays the sound faster
export function wobblePitchAt(s: TapeSettings, t: number): number {
	return 1 - s.wobble.reduce((sum, p) => sum + p.seconds * 2 * Math.PI * p.hz * Math.cos(2 * Math.PI * p.hz * t), 0);
}

// The saturation: k⁻¹·tanh(k·x), which is x for quiet sounds and never passes 1/k
export function tapeSaturate(x: number, k: number): number {
	return k < 1e-6 ? x : Math.tanh(k * x) / k;
}

// The shaper's curve over −1..1: what to add to the gain `makeup` at each level of the mix, so
// the gain is makeup·tanh(k·x)/(k·x). It is 0 at silence (the middle point: the count is odd),
// so silence in gives exactly the gain `makeup` and no offset.
export function tapeGainCurve(k: number, makeup: number, points = 2049): Float32Array<ArrayBuffer> {
	const curve = new Float32Array(points);
	const mid = (points - 1) / 2;
	for (let i = 0; i < points; i++) {
		const x = (i - mid) / mid;
		const kx = k * x;
		curve[i] = Math.abs(kx) < 1e-6 ? 0 : makeup * (Math.tanh(kx) / kx - 1);
	}
	return curve;
}

// Noise for the hiss: white, −1..1
export function fillHiss(data: Float32Array, random: () => number): void {
	for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
}

export const CRACKLE_PER_SECOND = 9;
export const CRACKLE_POP_SHARE = 0.06; // how many of them are pops (lower, longer, louder)

// A record's crackle: short ticks at random moments, most of them faint, and now and then a
// pop (a low thud). Nothing in the last 10 ms, so the buffer can loop without a cut-off tick.
export function fillCrackle(data: Float32Array, sampleRate: number, random: () => number): void {
	data.fill(0);
	const guard = Math.ceil(0.01 * sampleRate);
	const room = data.length - guard;
	if (room <= 0) return;
	const count = Math.round((data.length / sampleRate) * CRACKLE_PER_SECOND);
	for (let c = 0; c < count; c++) {
		const at = Math.floor(random() * room);
		const level = 0.08 + 0.92 * random() ** 3;
		const sign = random() < 0.5 ? -1 : 1;
		const pop = random() < CRACKLE_POP_SHARE;
		const spread = random();
		if (pop) {
			// A damped sine around 200 Hz
			const tau = (0.001 + 0.0006 * spread) * sampleRate;
			for (let n = 0; n < guard; n++) data[at + n] += sign * level * Math.exp(-n / tau) * Math.sin((Math.PI * n) / (2 * tau));
		} else {
			// A tick: a spike that rings for a few samples, each the other way
			const tau = (0.00008 + 0.00025 * spread) * sampleRate;
			const len = Math.min(guard, Math.ceil(tau * 7));
			for (let n = 0; n < len; n++) data[at + n] += sign * level * 0.6 * Math.exp(-n / tau) * (n % 2 ? -0.6 : 1);
		}
	}
	for (let i = 0; i < data.length; i++) data[i] = Math.max(-1, Math.min(1, data[i]));
}

// How long the noise buffers are (they loop; the two lengths share no beat or bar)
export const HISS_SECONDS = 4;
export const CRACKLE_SECONDS = 11;

export type Tape = {
	input: GainNode;     // the sound to play through the tape
	sidechain: GainNode; // the whole mix: its level sets the saturation (live: the same sound)
	output: GainNode;
	noise: GainNode;     // the tape's own noise (hiss, crackle), to add after `output`
	// Sets the knobs. `smooth`: glide there (a knob turned while playing), not at once
	apply(s: TapeSettings, smooth?: boolean): void;
	// Starts the noise at `when`. With `stopAt` it ends there, fading for `fade` seconds after it
	startNoise(random: () => number, when?: number, stopAt?: number, fade?: number): void;
};

export function createTape(ctx: BaseAudioContext): Tape {
	const input = ctx.createGain();
	const sidechain = ctx.createGain();
	const output = ctx.createGain();
	const noise = ctx.createGain();

	// Saturation: the mix's level, through the curve, onto the gain
	const sat = ctx.createGain();
	const shaper = ctx.createWaveShaper();
	sidechain.connect(shaper).connect(sat.gain);

	const dull = ctx.createBiquadFilter();
	dull.type = 'lowpass';
	dull.Q.value = Math.SQRT1_2; // flat up to the cutoff, so AGE at 0 takes next to nothing away

	const wow = ctx.createDelay(0.1);
	const sines: { osc: OscillatorNode; depth: GainNode }[] = [];
	for (let i = 0; i < WOBBLE_VOICES; i++) {
		const osc = ctx.createOscillator();
		const depth = ctx.createGain();
		depth.gain.value = 0;
		osc.connect(depth).connect(wow.delayTime);
		osc.start();
		sines.push({ osc, depth });
	}

	input.connect(sat).connect(dull).connect(wow).connect(output);

	// The noise: hiss through a band (a tape's hiss sits in the upper middle), crackle as it is
	const hissHP = ctx.createBiquadFilter();
	hissHP.type = 'highpass';
	hissHP.frequency.value = 2000;
	hissHP.Q.value = 0.5;
	const hissLP = ctx.createBiquadFilter();
	hissLP.type = 'lowpass';
	hissLP.frequency.value = 11000;
	hissLP.Q.value = 0.5;
	const hissGain = ctx.createGain();
	const crackleGain = ctx.createGain();
	hissHP.connect(hissLP).connect(hissGain).connect(noise);
	crackleGain.connect(noise);

	function apply(s: TapeSettings, smooth = false) {
		const t = ctx.currentTime;
		const set = (p: AudioParam, v: number) => {
			if (smooth) p.setTargetAtTime(v, t, 0.02);
			else p.setValueAtTime(v, t);
		};
		shaper.curve = tapeGainCurve(s.satK, s.makeup);
		set(sat.gain, s.makeup);
		set(dull.frequency, Math.min(s.cutoffHz, ctx.sampleRate * 0.45));
		set(wow.delayTime, s.baseDelay);
		sines.forEach(({ osc, depth }, i) => {
			const p = s.wobble[i];
			set(osc.frequency, p ? p.hz : 1);
			set(depth.gain, p ? p.seconds : 0);
		});
		set(hissGain.gain, s.hissGain);
		set(crackleGain.gain, s.crackleGain);
	}

	function startNoise(random: () => number, when = 0, stopAt?: number, fade = 0) {
		const loop = (seconds: number, fill: (d: Float32Array) => void, to: AudioNode) => {
			const buffer = ctx.createBuffer(1, Math.round(seconds * ctx.sampleRate), ctx.sampleRate);
			fill(buffer.getChannelData(0));
			const src = ctx.createBufferSource();
			src.buffer = buffer;
			src.loop = true;
			src.connect(to);
			src.start(when);
			if (stopAt !== undefined) src.stop(stopAt + fade);
		};
		loop(HISS_SECONDS, (d) => fillHiss(d, random), hissHP);
		loop(CRACKLE_SECONDS, (d) => fillCrackle(d, ctx.sampleRate, random), crackleGain);
		if (stopAt !== undefined && fade > 0) {
			noise.gain.setValueAtTime(1, stopAt);
			noise.gain.linearRampToValueAtTime(0, stopAt + fade);
		}
	}

	return { input, sidechain, output, noise, apply, startNoise };
}

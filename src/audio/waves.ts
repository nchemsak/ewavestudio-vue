// src/audio/waves.ts
// The synth's waveforms, and the sound source each note's voices are built from. Shared by
// the live engine (liveEngine.ts) and the WAV export engine (export/scheduleStepSequencer.ts).
//
// - sine, triangle, sawtooth, square: the oscillator's own shapes.
// - pulse: a square whose width (the share of each cycle spent high) is the Width knob
//   5–50%: from the thinnest to the square (50%, the fullest). A width w and 100 − w are the
//   same wave upside down and sound the same, so the knob covers one side only. Web Audio
//   has no such oscillator, so the voice's sawtooth goes
//   through a comparator (a steep, smooth WaveShaper curve, oversampled to keep aliasing down)
//   whose threshold a ConstantSourceNode moves. The same source also cancels the pulse's DC
//   (a narrow pulse sits mostly at −1), so it can't push the drive or speakers off-centre.
//   The LFO's "PW" target moves that source too (pulse-width modulation).
// - organ, hollow, glass: fixed harmonic recipes (createPeriodicWave).
//
// A unison voice can start at another point of its cycle (`phase`, in cycles): its wave is the
// same shape shifted in time (every harmonic turned by its own share), built with
// createPeriodicWave from the Web Audio spec's own series for the built-in shapes, so at phase 0
// it's the same wave. Without it every voice of a note starts in step, and a hit's loud start
// is nearly mono whatever Spread is (see UNISON_PHASE_SPREAD in the engines' use).
//
// Each source exposes `osc`, the OscillatorNode whose frequency and detune the engines set
// (pitch envelope, FM, unison detune, LFO pitch), and `output`, the node to connect onward.

export const WAVE_IDS = ['sine', 'triangle', 'sawtooth', 'square', 'pulse', 'organ', 'hollow', 'glass'] as const;
export type Wave = typeof WAVE_IDS[number];

export const WAVE_LABELS: Record<Wave, string> = {
	sine: 'Sine', triangle: 'Triangle', sawtooth: 'Saw', square: 'Square',
	pulse: 'Pulse', organ: 'Organ', hollow: 'Hollow', glass: 'Glass',
};

export const isWave = (w: unknown): w is Wave => typeof w === 'string' && (WAVE_IDS as readonly string[]).includes(w);

// Harmonic recipes: amplitude of each sine harmonic (index 1 = the fundamental)
export const HARMONICS: Record<'organ' | 'hollow' | 'glass', Record<number, number>> = {
	// Drawbar-like: the fundamental and its octaves and fifths
	organ: { 1: 1, 2: 0.8, 3: 0.6, 4: 0.5, 6: 0.35, 8: 0.3 },
	// Odd harmonics only, falling fast (clarinet-like), so the middle is hollow
	hollow: { 1: 1, 3: 0.5, 5: 0.25, 7: 0.12, 9: 0.06 },
	// A few high harmonics over the fundamental: thin and glassy, a little bell-like
	glass: { 1: 1, 4: 0.5, 7: 0.35, 11: 0.25, 16: 0.15 },
};

// One cycle of a harmonic recipe, peak-normalized as createPeriodicWave does
export function harmonicCycle(h: Record<number, number>, n = 2048): Float32Array {
	const out = new Float32Array(n);
	let peak = 0;
	for (let i = 0; i < n; i++) {
		const t = (2 * Math.PI * i) / n;
		let v = 0;
		for (const k in h) v += h[k] * Math.sin(Number(k) * t);
		out[i] = v;
		peak = Math.max(peak, Math.abs(v));
	}
	for (let i = 0; i < n; i++) out[i] /= peak || 1;
	return out;
}

const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

// Loudness balance for each wave (a gain on the voice), so switching waves doesn't jump in
// level. The built-in ones are the long-standing values (square −6 dB, saw −3 dB); the pulse
// is the square's; the harmonic shapes are matched to the sine's RMS (never boosted past 1).
const HARMONIC_GAIN = Object.fromEntries(
	(Object.keys(HARMONICS) as (keyof typeof HARMONICS)[]).map((k) => [k, Math.min(1, Math.SQRT1_2 / rms(harmonicCycle(HARMONICS[k])))]),
) as Record<keyof typeof HARMONICS, number>;

export function waveGain(w: string): number {
	switch (w) {
		case 'square':
		case 'pulse': return 0.5011872336;
		case 'sawtooth': return 0.7079457844;
		case 'organ':
		case 'hollow':
		case 'glass': return HARMONIC_GAIN[w];
		default: return 1.0;
	}
}

// Pulse width START

// The knob's (and a saved project's) range: 5% (thinnest) to 50% (the square, fullest)
export const PULSE_WIDTH_MIN = 5;
export const PULSE_WIDTH_MAX = 50;
export const PULSE_WIDTH_DEFAULT = 50;
// How far the LFO may push the width: the same 5% from the other side (95%), which sounds the
// same as 5%; past 50% the sound comes back the way it went
const PULSE_SWING_MAX = 100 - PULSE_WIDTH_MIN;

// A width as the knob shows it: above 50% it's mirrored (75% sounds the same as 25%), then
// kept to 5–50%. Older projects could save up to 95%.
export function foldPulseWidth(pct: number): number {
	const w = pct > 50 ? 100 - pct : pct;
	return Math.min(PULSE_WIDTH_MAX, Math.max(PULSE_WIDTH_MIN, w));
}
const clampWidth = foldPulseWidth;

// The threshold offset for a width: a sawtooth (−1..1) plus this is above 0 for `pct`% of
// each cycle. It's also the pulse's DC, which is subtracted again.
export const pulseOffset = (pct: number) => (2 * clampWidth(pct)) / 100 - 1;

// The LFO's "PW" tap: the LFO swings ±Depth (in % width). Returns the gain from the LFO's
// output (±Depth) to the threshold offset, shrunk so the width stays within 5–95%.
export function lfoPwmTapGain(widthPct: number, depthPct: number): number {
	if (!(depthPct > 0)) return 0;
	const w = clampWidth(widthPct);
	const room = Math.max(0, Math.min(w - PULSE_WIDTH_MIN, PULSE_SWING_MAX - w));
	return (Math.min(1, room / depthPct) * 2) / 100;
}

// The comparator: −1 below 0, +1 above, with a short smooth edge (steep tanh)
const comparatorCurves = new WeakMap<BaseAudioContext, Float32Array<ArrayBuffer>>();
function comparatorCurve(ctx: BaseAudioContext) {
	let c = comparatorCurves.get(ctx);
	if (!c) {
		const n = 4097; // odd: 0 maps to exactly 0
		c = new Float32Array(new ArrayBuffer(n * 4));
		for (let i = 0; i < n; i++) c[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 40);
		comparatorCurves.set(ctx, c);
	}
	return c;
}

// Pulse width END

const periodicWaves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
function periodicWaveFor(ctx: BaseAudioContext, w: keyof typeof HARMONICS): PeriodicWave {
	let byWave = periodicWaves.get(ctx);
	if (!byWave) periodicWaves.set(ctx, (byWave = new Map()));
	let pw = byWave.get(w);
	if (!pw) {
		const h = HARMONICS[w];
		const n = Math.max(...Object.keys(h).map(Number)) + 1;
		const real = new Float32Array(n);
		const imag = new Float32Array(n);
		for (const k in h) imag[Number(k)] = h[k];
		pw = ctx.createPeriodicWave(real, imag);
		byWave.set(w, pw);
	}
	return pw;
}

// Phase-shifted waves START

// Harmonics for the built-in shapes as custom waves (Chrome's own sawtooth and this match to
// within 1e-6; a browser test checks)
const SERIES_LENGTH = 2048;

// The sine (imag) coefficients of a wave, harmonic 1 at index 1, before any shift
export function waveSeries(w: string): { real: Float32Array; imag: Float32Array } {
	if (w === 'organ' || w === 'hollow' || w === 'glass') {
		const h = HARMONICS[w];
		const n = Math.max(...Object.keys(h).map(Number)) + 1;
		const imag = new Float32Array(n);
		for (const k in h) imag[Number(k)] = h[k];
		return { real: new Float32Array(n), imag };
	}
	const imag = new Float32Array(SERIES_LENGTH);
	for (let n = 1; n < SERIES_LENGTH; n++) {
		switch (w) {
			case 'square': imag[n] = n % 2 ? 4 / (n * Math.PI) : 0; break;
			case 'sawtooth':
			case 'pulse': imag[n] = (n % 2 ? 2 : -2) / (n * Math.PI); break; // the pulse is made from a saw
			case 'triangle': imag[n] = (8 * Math.sin((n * Math.PI) / 2)) / (n * n * Math.PI * Math.PI); break;
			default: imag[n] = n === 1 ? 1 : 0; // sine, and unknown names
		}
	}
	return { real: new Float32Array(SERIES_LENGTH), imag };
}

// The same series started `phase` cycles later in its wave (x(t) becomes x(t + phase · period))
export function shiftSeries(real: Float32Array, imag: Float32Array, phase: number) {
	const r = new Float32Array(real.length), i = new Float32Array(imag.length);
	for (let n = 0; n < real.length; n++) {
		const a = 2 * Math.PI * n * phase;
		const c = Math.cos(a), s = Math.sin(a);
		r[n] = real[n] * c + imag[n] * s;
		i[n] = imag[n] * c - real[n] * s;
	}
	return { real: r, imag: i };
}

const SHIFTED_CACHE = 64;
const shiftedWaves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
function shiftedWaveFor(ctx: BaseAudioContext, w: string, phase: number): PeriodicWave {
	let byKey = shiftedWaves.get(ctx);
	if (!byKey) shiftedWaves.set(ctx, (byKey = new Map()));
	const key = `${w}@${phase}`;
	let pw = byKey.get(key);
	if (!pw) {
		const { real, imag } = waveSeries(w);
		const shifted = shiftSeries(real, imag, phase);
		pw = ctx.createPeriodicWave(shifted.real, shifted.imag); // peak-normalized, as the built-ins
		// Kept for the next notes, the oldest let go past SHIFTED_CACHE (notes playing keep theirs)
		if (byKey.size >= SHIFTED_CACHE) byKey.delete(byKey.keys().next().value!);
		byKey.set(key, pw);
	}
	return pw;
}

// Builds (and keeps) the wave a voice starting at `phase` would use, before a note needs it
export function prepareVoiceWave(ctx: BaseAudioContext, w: string, phase: number): void {
	if (phase) shiftedWaveFor(ctx, isWave(w) ? w : 'sine', phase);
}

// Phase-shifted waves END

export type VoiceSource = {
	osc: OscillatorNode;      // set its frequency and detune; connect FM/LFO pitch to it
	output: AudioNode;        // connect this onward (to the voice's filter)
	width: AudioParam | null; // pulse only: the threshold offset, for the LFO's PW tap
	start(t: number): void;
	stop(t: number): void;
};

// The source for one voice of a note, for wave `w` (an unknown name plays a sine), starting
// `phase` cycles into its wave (unison voices; 0 for one voice)
export function createVoiceSource(ctx: BaseAudioContext, w: string, widthPct = PULSE_WIDTH_DEFAULT, phase = 0): VoiceSource {
	const osc = ctx.createOscillator();
	const known = isWave(w) ? w : 'sine';
	if (w === 'pulse') {
		if (phase) osc.setPeriodicWave(shiftedWaveFor(ctx, 'pulse', phase));
		else osc.type = 'sawtooth';
		const offset = ctx.createConstantSource();
		offset.offset.value = pulseOffset(widthPct);
		const sum = ctx.createGain();
		const shaper = ctx.createWaveShaper();
		shaper.curve = comparatorCurve(ctx);
		shaper.oversample = '4x';
		const dcCancel = ctx.createGain();
		dcCancel.gain.value = -1;
		const out = ctx.createGain();
		osc.connect(sum);
		offset.connect(sum);
		sum.connect(shaper).connect(out);
		offset.connect(dcCancel).connect(out);
		return {
			osc, output: out, width: offset.offset,
			start(t) { osc.start(t); offset.start(t); },
			stop(t) { osc.stop(t); offset.stop(t); },
		};
	}
	if (phase) osc.setPeriodicWave(shiftedWaveFor(ctx, known, phase));
	else if (w === 'organ' || w === 'hollow' || w === 'glass') osc.setPeriodicWave(periodicWaveFor(ctx, w));
	else osc.type = (['sine', 'triangle', 'sawtooth', 'square'] as string[]).includes(w) ? (w as OscillatorType) : 'sine';
	return {
		osc, output: osc, width: null,
		start(t) { osc.start(t); },
		stop(t) { osc.stop(t); },
	};
}

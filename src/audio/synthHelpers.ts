// src/audio/synthHelpers.ts
// Pure helpers used by the live engine (liveEngine.ts) and the synth panel. No Vue, no
// long-lived audio nodes. The WAV export engine (export/scheduleStepSequencer.ts) still has
// its own copies of some of these; keep them in step until the two engines are merged.

// Waveform loudness START

// Each wave's loudness balance now lives with the waves (waves.ts: waveGain), so the live
// and export engines share it; this name is kept for existing callers.
export { waveGain as waveformGain } from './waves';

// Waveform loudness END

// LFO filter depth START

// The LFO swings each note's cutoff by ±Depth Hz around the cutoff, scaled down so it stays
// between 30 Hz and 0.45 × the sample rate. Returns that scale (the tap's gain, 0..1). Used
// by the live and export engines, and by the screen's filter view to draw the swing.
export const LFO_FILTER_MIN_HZ = 30;
export function lfoFilterTapGain(cutoffHz: number, depthHz: number, sampleRate: number): number {
	const maxHz = sampleRate * 0.45;
	const maxDepth = Math.max(0, Math.min(cutoffHz - LFO_FILTER_MIN_HZ, maxHz - cutoffHz));
	return depthHz > 0 ? Math.min(1, maxDepth / depthHz) : 0;
}

// LFO filter depth END

// LFO timing START

// A note division such as "1/8", "1/8." (dotted), "1/8T" (triplet), or "2/1" and "4/1" (two
// and four whole notes: 2 and 4 bars of 4/4), as a fraction of a bar: [p, q] = p/q bars, in
// lowest terms. Anything unreadable is a quarter note.
export function divisionBars(div: string): [number, number] {
	const m = /^(\d+)\/(\d+)([.T])?$/.exec(String(div).replace(/\s+/g, ''));
	let p = m ? Math.max(1, parseInt(m[1], 10)) : 1;
	let q = m ? Math.max(1, parseInt(m[2], 10)) : 4;
	if (m?.[3] === '.') { p *= 3; q *= 2; }
	if (m?.[3] === 'T') { p *= 2; q *= 3; }
	const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
	const g = gcd(p, q);
	return [p / g, q / g];
}

// Tempo-synced LFO rate: a division (above) at `bpm`, as Hz
export function divisionToHz(div: string, bpm: number): number {
	const [p, q] = divisionBars(div);
	const seconds = (60 / bpm) * 4 * (p / q); // a bar of 4/4 is four beats
	return Math.max(0.01, 1 / seconds);
}

// After how many bars an LFO at `div` is back at the start of its cycle on a bar line: 1 for
// any division that divides the bar (1/8, 1/8T), 2 or 4 for the 2- and 4-bar rates, 3 for a
// dotted 1/8 (8 cycles in 3 bars). The live LFO restarts there while playing, so it stays in
// step with the pattern; an exported loop repeats smoothly only if its bars are a multiple.
export function lfoAlignBars(div: string): number {
	return divisionBars(div)[0];
}

// LFO timing END

// Drive curves START

export function generateDriveCurve(type: string, amount = 0.5) {
	const samples = 1024;
	const curve = new Float32Array(samples);
	for (let i = 0; i < samples; ++i) {
		const x = (i * 2) / samples - 1;
		// force overdrive behavior
		curve[i] = Math.tanh(x * (1 + amount * 25));
	}
	return curve;
}

// Straight line: the shaper passes sound through unchanged until drive is first turned on
export function linearPassthroughCurve() {
	const n = 2 ** 10;
	const c = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const x = (i * 2) / n - 1;
		c[i] = x; // linear passthrough
	}
	return c;
}

// Drive curves END

// Noise START

export type NoiseKey = 'brown' | 'pink' | 'white' | 'blue' | 'violet';

// Positions of the five noise colors on the 0..1 color knob (0 = brown, 1 = violet)
export const NOISE_STOPS: { key: NoiseKey; pos: number }[] = [
	{ key: 'brown', pos: 0.00 },
	{ key: 'pink', pos: 0.25 },
	{ key: 'white', pos: 0.50 },
	{ key: 'blue', pos: 0.75 },
	{ key: 'violet', pos: 1.00 },
];

// Gain per color so they sound about equally loud
export const NOISE_LOUDNESS: Record<NoiseKey, number> = {
	brown: 2.5,
	pink: 2,
	white: 1.0,
	blue: 1.5,
	violet: 2,
};

function normalize(buf: Float32Array) {
	let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
	if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] /= m;
}

// Two seconds of mono noise in each color, all derived from the same white noise
export function generateNoiseBuffers(ctx: BaseAudioContext): Record<NoiseKey, AudioBuffer> {
	const length = ctx.sampleRate * 2; // 2 seconds
	const createBuffer = () => ctx.createBuffer(1, length, ctx.sampleRate);

	// white
	const white = createBuffer();
	const wd = white.getChannelData(0);
	for (let i = 0; i < length; i++) wd[i] = Math.random() * 2 - 1;

	//Pink
	const pink = createBuffer();
	const pd = pink.getChannelData(0);
	let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
	for (let i = 0; i < length; i++) {
		const w = wd[i];
		b0 = 0.99886 * b0 + w * 0.0555179;
		b1 = 0.99332 * b1 + w * 0.0750759;
		b2 = 0.96900 * b2 + w * 0.1538520;
		b3 = 0.86650 * b3 + w * 0.3104856;
		b4 = 0.55000 * b4 + w * 0.5329522;
		b5 = -0.7616 * b5 - w * 0.0168980;
		pd[i] = b0 + b1 + b2 + b3 + b4 + b5 + (w * 0.5362);
	}
	normalize(pd);

	//  Brown
	const brown = createBuffer();
	const bd = brown.getChannelData(0);
	let lastOut = 0;
	for (let i = 0; i < length; i++) {
		const w = wd[i];
		lastOut = (lastOut + (0.02 * w)) / 1.02;
		bd[i] = lastOut * 3.5;
	}
	normalize(bd);

	//  Blue (+3 dB/oct)
	const blue = createBuffer();
	const bud = blue.getChannelData(0);
	let prev = 0;
	for (let i = 0; i < length; i++) {
		const x = wd[i] - prev;
		prev = wd[i];
		bud[i] = x;
	}
	normalize(bud);

	//  Violet (~ +6 dB/oct)
	const violet = createBuffer();
	const vd = violet.getChannelData(0);
	let prev1 = 0, prev2 = 0;
	for (let i = 0; i < length; i++) {
		const d1 = wd[i] - prev1; prev1 = wd[i];
		const d2 = d1 - prev2; prev2 = d1;
		vd[i] = d2;
	}
	normalize(vd);

	return { white, pink, brown, blue, violet };
}

// Noise END

// src/audio/synthHelpers.ts
// Pure helpers used by the live engine (liveEngine.ts) and the synth panel. No Vue, no
// long-lived audio nodes. The WAV export engine (export/scheduleStepSequencer.ts) still has
// its own copies of some of these; keep them in step until the two engines are merged.

// Waveform loudness START

// Equalize waveform volume: square and sawtooth are louder than sine at the same peak
export function waveformGain(type: OscillatorType): number {
	switch (type) {
		case 'square': return 0.5011872336;
		case 'sawtooth': return 0.7079457844;
		case 'triangle':
		case 'sine':
		default: return 1.0;
	}
}

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

// Tempo-synced LFO rate: a note division such as "1/8", "1/8." (dotted) or "1/8T" (triplet)
// at `bpm`, as Hz
export function divisionToHz(div: string, bpm: number): number {
	const parts = div.replace(/\s+/g, '');
	const dotted = parts.endsWith('.');
	const trip = parts.endsWith('T');
	const base = parts.replace(/[\.T]$/, ''); // e.g., "1/8"

	const denom = parseInt(base.split('/')[1] || '4', 10);
	let beats = 4 / denom; // whole note = 4 beats
	if (dotted) beats *= 1.5;
	if (trip) beats *= 2 / 3;

	const seconds = (60 / bpm) * beats;
	return Math.max(0.01, 1 / seconds);
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

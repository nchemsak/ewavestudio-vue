// src/audio/sample.ts
// A sound recorded from the microphone (about a second) that the pads play as a wave, "sample":
// at each pad's pitch, through the same envelope, filter, effects and pedals as the other waves.
// Shared by the live engine (liveEngine.ts) and the export engine (scheduleStepSequencer.ts).
//
// - Pitch: the recording plays as recorded on A3 (SAMPLE_ROOT_HZ, the pads' default note), an
//   octave up at A4 twice as fast, and so on, as a sampler plays a key. Its source has a
//   `frequency` parameter as an oscillator has (a ConstantSourceNode's offset, scaled into the
//   buffer's playbackRate), so the pitch envelope, FM, unison detune and the LFO's pitch target
//   work on it unchanged; AudioBufferSourceNode's playbackRate and detune are k-rate, so FM
//   moves it a block (128 samples) at a time.
// - Kept in the project as 16-bit PCM in base64 (`synth.sample`: about 128 kB for a second at
//   48 kHz), so it's saved, exported, imported and undone with the rest; share links leave it
//   out (too big for a link).
// - A recording is trimmed to where the sound starts (a few ms before), at most SAMPLE_MAX_S
//   long, cut where it has faded, with a short fade at the end, and its peak set to full scale.
//   How loud it came in doesn't matter: the start is found against its own peak (PR 96: a
//   Focusrite's input at a usual gain never reached the fixed −36 dBFS PR 95 waited for).

// Helpers START

export const SAMPLE_WAVE = 'sample';
export const SAMPLE_ROOT_HZ = 220;
export const SAMPLE_MAX_S = 1;
// Quieter than this throughout (about −66 dBFS) is no sound at all
export const MIN_LEVEL = 0.0005;
// The sound starts at its first sample within 20 dB of the recording's peak (a level of its
// own, not a fixed one: a microphone's preamp at a modest gain peaks far below full scale)
export const ONSET_SHARE = 0.1;
// Kept before the onset, so the attack isn't clipped
export const PRE_ROLL_S = 0.005;
// The end: where it stays more than this far under its peak (−50 dB)
export const TAIL_BELOW_PEAK = 0.00316;
export const FADE_S = 0.01;

// What's saved: the recording (encodeSample) and its sample rate
export type SampleData = { data: string; sampleRate: number };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
	let out = '';
	let i = 0;
	for (; i + 2 < bytes.length; i += 3) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
		out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
	}
	const rest = bytes.length - i;
	if (rest === 1) {
		const n = bytes[i] << 16;
		out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
	} else if (rest === 2) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
		out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
	}
	return out;
}

function base64ToBytes(s: string): Uint8Array {
	const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
	const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
	const val = (c: string) => B64.indexOf(c);
	let o = 0;
	for (let i = 0; i < clean.length; i += 4) {
		const n = (val(clean[i]) << 18) | (val(clean[i + 1]) << 12)
			| ((i + 2 < clean.length ? val(clean[i + 2]) : 0) << 6) | (i + 3 < clean.length ? val(clean[i + 3]) : 0);
		if (o < out.length) out[o++] = (n >> 16) & 255;
		if (o < out.length) out[o++] = (n >> 8) & 255;
		if (o < out.length) out[o++] = n & 255;
	}
	return out;
}

// Samples (−1..1) → 16-bit little-endian PCM in base64
export function encodeSample(samples: Float32Array): string {
	const bytes = new Uint8Array(samples.length * 2);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < samples.length; i++) {
		const v = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(i * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true);
	}
	return bytesToBase64(bytes);
}

export function decodeSample(data: string): Float32Array {
	const bytes = base64ToBytes(data);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const out = new Float32Array(Math.floor(bytes.length / 2));
	for (let i = 0; i < out.length; i++) {
		const v = view.getInt16(i * 2, true);
		out[i] = v < 0 ? v / 32768 : v / 32767;
	}
	return out;
}

// A recording's length in seconds
export const sampleSeconds = (s: SampleData) => Math.floor((s.data.replace(/=+$/, '').length * 3) / 4 / 2) / s.sampleRate;

// A saved sample, checked: its data a non-empty base64 string, its rate a sensible number; else null
export function sampleFrom(v: unknown): SampleData | null {
	const s = v as SampleData;
	if (!s || typeof s !== 'object' || typeof s.data !== 'string' || !s.data.length) return null;
	if (!/^[A-Za-z0-9+/]+=*$/.test(s.data)) return null;
	if (typeof s.sampleRate !== 'number' || !(s.sampleRate >= 3000 && s.sampleRate <= 384000)) return null;
	return { data: s.data, sampleRate: s.sampleRate };
}

// A recording made ready to play: from where the sound starts (its first sample within 20 dB of
// the loudest, less PRE_ROLL_S), at most SAMPLE_MAX_S, cut where it stays 50 dB under its peak,
// a FADE_S fade at the end, its peak at full scale. null when nothing in it reaches MIN_LEVEL.
export function trimRecording(input: Float32Array, sampleRate: number): Float32Array | null {
	let loudest = 0;
	for (let i = 0; i < input.length; i++) loudest = Math.max(loudest, Math.abs(input[i]));
	if (loudest < MIN_LEVEL) return null;
	const level = loudest * ONSET_SHARE;
	let onset = 0;
	while (Math.abs(input[onset]) < level) onset++;
	const start = Math.max(0, onset - Math.round(PRE_ROLL_S * sampleRate));
	const end0 = Math.min(input.length, start + Math.round(SAMPLE_MAX_S * sampleRate));
	let peak = 0;
	for (let i = start; i < end0; i++) peak = Math.max(peak, Math.abs(input[i]));
	const floor = peak * TAIL_BELOW_PEAK;
	let end = end0;
	while (end > onset + 1 && Math.abs(input[end - 1]) < floor) end--;
	const fade = Math.round(FADE_S * sampleRate);
	end = Math.min(end0, end + fade);
	const out = input.slice(start, end);
	const gain = 1 / peak;
	for (let i = 0; i < out.length; i++) out[i] *= gain;
	const n = Math.min(fade, out.length);
	for (let i = 0; i < n; i++) out[out.length - 1 - i] *= i / n;
	return out;
}

// Helpers END

// Playing START

// The recording as an AudioBuffer, made once per recording (an AudioBuffer plays in any context)
let cached: { data: string; sampleRate: number; buffer: AudioBuffer } | null = null;
export function sampleBuffer(s: SampleData | null): AudioBuffer | null {
	if (!s || typeof AudioBuffer === 'undefined') return null;
	if (cached && cached.data === s.data && cached.sampleRate === s.sampleRate) return cached.buffer;
	const samples = decodeSample(s.data);
	if (!samples.length) return null;
	const buffer = new AudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate: s.sampleRate });
	buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
	cached = { data: s.data, sampleRate: s.sampleRate, buffer };
	return buffer;
}

// What the engines set on a voice's source, as on an oscillator
export type PitchedSource = {
	frequency: AudioParam;
	detune: AudioParam;
	addEventListener(type: 'ended', fn: () => void): void;
};

// One voice of a note playing `buffer`: its `frequency` (Hz, SAMPLE_ROOT_HZ playing it as
// recorded) drives the buffer's speed
export function createSampleVoice(ctx: BaseAudioContext, buffer: AudioBuffer) {
	const src = ctx.createBufferSource();
	src.buffer = buffer;
	src.playbackRate.value = 0;
	const freq = ctx.createConstantSource();
	freq.offset.value = SAMPLE_ROOT_HZ;
	const scale = ctx.createGain();
	scale.gain.value = 1 / SAMPLE_ROOT_HZ;
	freq.connect(scale).connect(src.playbackRate);
	const osc: PitchedSource = {
		frequency: freq.offset,
		detune: src.detune,
		addEventListener: (type, fn) => src.addEventListener(type, fn),
	};
	return {
		osc,
		output: src as AudioNode,
		start(t: number) { src.start(t); freq.start(t); },
		stop(t: number) { try { src.stop(t); } catch { /* ended */ } freq.stop(t); },
	};
}

// Playing END

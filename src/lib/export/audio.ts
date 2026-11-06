// src/lib/export/audio.ts
// What the Export audio dialog does to rendered sound before it's saved: make a seamless loop
// of exactly N bars, trim the silence after a tail, and normalize. Sound is a list of channels
// (Float32Array per channel), so these run, and are tested, without Web Audio.

export type Channels = Float32Array[];

// Normalize turns the loudest sample up (or down) to −1 dBFS
export const NORMALIZE_PEAK = 10 ** (-1 / 20);

// Quieter than this (−80 dBFS) counts as silence when trimming a tail
export const SILENCE = 1e-4;

// How many samples N bars of 4/4 last at a tempo
export function barFrames(bars: number, bpm: number, sampleRate: number): number {
	return Math.round(bars * 4 * (60 / bpm) * sampleRate);
}

// A loop of exactly `frames` samples: whatever rings on past the end (reverb, echoes, a long
// decay) is added onto the start, where it would be heard if the loop had just played. So the
// loop repeats with nothing cut off and no gap, the way the pattern sounds looping in the app.
// A tail longer than the loop wraps round as many times as it takes.
export function foldLoop(channels: Channels, frames: number): Channels {
	return channels.map((ch) => {
		const out = new Float32Array(frames);
		for (let i = 0; i < ch.length; i++) out[i % frames] += ch[i];
		return out;
	});
}

// The sound up to where it fades to silence, plus `marginFrames`, and never shorter than
// `minFrames` (the bars themselves)
export function trimTail(channels: Channels, minFrames: number, marginFrames = 0, threshold = SILENCE): Channels {
	let last = -1;
	for (const ch of channels) {
		for (let i = ch.length - 1; i > last; i--) {
			if (Math.abs(ch[i]) > threshold) { last = i; break; }
		}
	}
	const length = Math.min(channels[0]?.length ?? 0, Math.max(minFrames, last + 1 + marginFrames));
	return channels.map((ch) => ch.slice(0, length));
}

// The loudest sample across several sounds
export function peakOf(...sounds: Channels[]): number {
	let peak = 0;
	for (const sound of sounds) for (const ch of sound) for (let i = 0; i < ch.length; i++) {
		const v = Math.abs(ch[i]);
		if (v > peak) peak = v;
	}
	return peak;
}

// The gain that brings `peak` to NORMALIZE_PEAK (1 for silence)
export function normalizeGain(peak: number): number {
	return peak > 0 ? NORMALIZE_PEAK / peak : 1;
}

export function applyGain(channels: Channels, gain: number): Channels {
	if (gain === 1) return channels;
	return channels.map((ch) => ch.map((v) => v * gain));
}

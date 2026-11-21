// src/audio/drumKit.ts
// The Drums machine's frozen kit and its sounds as AudioBuffers. The kit is four recordings
// (Kick, Snare, Metal and Hat: the Rhythm presets Kick, Snare and Metal, and Metal shorter and
// higher, each rendered once, dry, by scripts/render-drum-kit.mjs), kept in drumKitData.ts as
// 16-bit PCM in base64, as a recorded sample is. That module is loaded on its own when the app
// first needs it (a chunk of its own in the build), so the page's first load doesn't carry it.
//
// "Frozen": the kit doesn't follow later changes to the presets or the synth, so a saved
// project's drums sound the same tomorrow.

import { decodeSample, type SampleData } from './sample';
import type { KitId } from './drums';

let kit: Record<KitId, SampleData> | null = null;
let loading: Promise<Record<KitId, SampleData>> | null = null;

/** The kit, loading it the first time */
export function loadDrumKit(): Promise<Record<KitId, SampleData>> {
	loading ??= import('./drumKitData').then((m) => (kit = m.DRUM_KIT));
	return loading;
}

/** The kit if it has loaded, else null */
export const drumKitNow = () => kit;

// AudioBuffers, one per recording, made once (an AudioBuffer plays in any context, so the
// export's offline renders use the same ones). Keyed by a short fingerprint of the data.
const buffers = new Map<string, AudioBuffer>();
const fingerprint = (s: SampleData) => `${s.sampleRate}:${s.data.length}:${s.data.slice(0, 48)}:${s.data.slice(-48)}`;

export function soundBuffer(s: SampleData | null | undefined): AudioBuffer | null {
	if (!s || typeof AudioBuffer === 'undefined') return null;
	const key = fingerprint(s);
	let b = buffers.get(key);
	if (!b) {
		const samples = decodeSample(s.data);
		if (!samples.length) return null;
		b = new AudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate: s.sampleRate });
		b.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
		if (buffers.size > 32) buffers.delete(buffers.keys().next().value!);
		buffers.set(key, b);
	}
	return b;
}

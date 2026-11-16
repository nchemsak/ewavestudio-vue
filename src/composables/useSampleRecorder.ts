// src/composables/useSampleRecorder.ts
// Records a sound from the microphone for the 'sample' wave (src/audio/sample.ts). It asks for
// the microphone, then listens: nothing is kept until a sound starts (so there's no hurry to
// make one), then about a second from just before it, and stops by itself. The recording is
// trimmed (trimRecording()) and returned. A press while it listens or records stops it there.
//
// The microphone is read in the app's own AudioContext through a tiny AudioWorklet (built from
// a Blob URL, as the bit crusher is, so the build has no extra file), which passes each block
// of 128 samples on. Its output is silent and goes nowhere audible, so nothing is heard while
// recording. The browser's echo cancelling, noise suppression and level control are off: they
// would eat a drum hit's attack and pump its tail.

import { ref } from 'vue';
import { trimRecording, ONSET_LEVEL, PRE_ROLL_S, SAMPLE_MAX_S } from '../audio/sample';

// How long it listens for a sound to start before giving up
export const LISTEN_MAX_S = 6;

export type RecorderState = 'idle' | 'asking' | 'listening' | 'recording' | 'denied' | 'silent' | 'unsupported';

const PROCESSOR = 'ew-sample-recorder';
const processorSource = () => `
class Recorder extends AudioWorkletProcessor {
	process(inputs) {
		const ch = inputs[0] && inputs[0][0];
		if (ch) this.port.postMessage(ch.slice(0));
		return true;
	}
}
registerProcessor('${PROCESSOR}', Recorder);
`;

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();
function loadRecorder(ctx: AudioContext): Promise<void> {
	let p = loaded.get(ctx);
	if (!p) {
		const url = URL.createObjectURL(new Blob([processorSource()], { type: 'text/javascript' }));
		p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
		loaded.set(ctx, p);
	}
	return p;
}

export function useSampleRecorder(audioCtx: AudioContext) {
	const state = ref<RecorderState>('idle');
	// The input's level now, 0..1 (a meter while listening and recording)
	const level = ref(0);
	let finish: (() => void) | null = null;
	let cancelled = false;

	async function record(): Promise<Float32Array | null> {
		if (state.value === 'listening' || state.value === 'recording') {
			cancelled = state.value === 'listening';
			finish?.();
			return null;
		}
		cancelled = false;
		if (!navigator.mediaDevices?.getUserMedia || !audioCtx.audioWorklet) { state.value = 'unsupported'; return null; }
		state.value = 'asking';
		let stream: MediaStream;
		try {
			const resumed = audioCtx.resume().catch(() => {});
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
			});
			await resumed;
			await loadRecorder(audioCtx);
		} catch (err) {
			console.warn('No microphone:', err);
			state.value = 'denied';
			return null;
		}

		const sr = audioCtx.sampleRate;
		const source = audioCtx.createMediaStreamSource(stream);
		const node = new AudioWorkletNode(audioCtx, PROCESSOR, { numberOfOutputs: 1 });
		const mute = audioCtx.createGain();
		mute.gain.value = 0;
		source.connect(node).connect(mute).connect(audioCtx.destination);

		const preRoll = Math.round(PRE_ROLL_S * sr) + 256;
		const want = Math.round(SAMPLE_MAX_S * sr) + preRoll;
		const before: Float32Array[] = []; // the last blocks before the sound, for the pre-roll
		let beforeLen = 0;
		const kept: Float32Array[] = [];
		let keptLen = 0;
		state.value = 'listening';

		const result = await new Promise<Float32Array | null>((resolve) => {
			const giveUp = setTimeout(() => { if (state.value === 'listening') done(); }, LISTEN_MAX_S * 1000);
			function done() {
				clearTimeout(giveUp);
				finish = null;
				node.port.onmessage = null;
				source.disconnect();
				node.disconnect();
				mute.disconnect();
				stream.getTracks().forEach((t) => t.stop());
				level.value = 0;
				if (!keptLen) { resolve(null); return; }
				const all = new Float32Array(keptLen);
				let o = 0;
				for (const b of kept) { all.set(b, o); o += b.length; }
				resolve(all);
			}
			finish = done;
			node.port.onmessage = (e: MessageEvent<Float32Array>) => {
				const block = e.data;
				let peak = 0;
				for (let i = 0; i < block.length; i++) peak = Math.max(peak, Math.abs(block[i]));
				level.value = Math.max(peak, level.value * 0.9);
				if (state.value === 'listening') {
					before.push(block);
					beforeLen += block.length;
					while (beforeLen - before[0].length >= preRoll) beforeLen -= before.shift()!.length;
					if (peak < ONSET_LEVEL) return;
					state.value = 'recording';
					kept.push(...before);
					keptLen = beforeLen;
					return;
				}
				kept.push(block);
				keptLen += block.length;
				if (keptLen >= want) done();
			};
		});

		const trimmed = result ? trimRecording(result, sr) : null;
		state.value = trimmed || cancelled ? 'idle' : 'silent';
		return trimmed;
	}

	return { state, level, record, stop: () => finish?.() };
}

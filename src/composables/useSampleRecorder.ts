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
// would eat a drum hit's attack and pump its tail. Every channel of the input is summed: a
// two-input audio interface sends its input 2 as the right channel (PR 95 read the left only,
// so a microphone on input 2 was never heard).

import { ref } from 'vue';
import { trimRecording, MIN_LEVEL, PRE_ROLL_S, SAMPLE_MAX_S } from '../audio/sample';

// How long it listens for a sound to start before giving up
export const LISTEN_MAX_S = 6;
// The room's own noise is measured over the first moment of listening; a sound starts with a
// block this many times louder than it (12 dB), and never below MIN_ONSET (about −50 dBFS).
// Until PR 96 the start was a fixed −36 dBFS, which a Focusrite's input at a usual gain didn't
// reach, so it said "Nothing heard" to a voice the computer's meters showed.
export const FLOOR_S = 0.15;
export const ONSET_OVER_FLOOR = 4;
export const MIN_ONSET = 0.003;

// Where a sound starts, for a room whose noise peaks at `floor`
export const onsetLevel = (floor: number) => Math.max(MIN_ONSET, floor * ONSET_OVER_FLOOR);

export type RecorderState = 'idle' | 'asking' | 'listening' | 'recording' | 'denied' | 'silent' | 'unsupported';

const PROCESSOR = 'ew-sample-recorder';
const processorSource = () => `
class Recorder extends AudioWorkletProcessor {
	process(inputs) {
		const chs = inputs[0];
		if (!chs || !chs.length) return true;
		const out = chs[0].slice(0);
		for (let c = 1; c < chs.length; c++) for (let i = 0; i < out.length; i++) out[i] += chs[c][i];
		this.port.postMessage(out);
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
				audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
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
		// Everything heard while listening, for when no block crosses the start level: then the
		// loudest moment is kept, if it stood out from the room at all
		const heard: Float32Array[] = [];
		const floorFrames = Math.round(FLOOR_S * sr);
		let heardLen = 0;
		let floor = 0;
		let loudest = 0;
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
				const fallback = !keptLen && !cancelled && loudest >= MIN_LEVEL && loudest >= floor * 3;
				const blocks = keptLen ? kept : fallback ? heard : null;
				if (!blocks) {
					if (!cancelled) console.info(`Sample: nothing heard (loudest ${dbfs(loudest)}, room ${dbfs(floor)})`);
					resolve(null);
					return;
				}
				const all = new Float32Array(blocks.reduce((n, b) => n + b.length, 0));
				let o = 0;
				for (const b of blocks) { all.set(b, o); o += b.length; }
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
					heard.push(block);
					heardLen += block.length;
					if (heardLen <= floorFrames) { floor = Math.max(floor, peak); return; }
					loudest = Math.max(loudest, peak);
					if (peak < onsetLevel(floor)) return;
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

const dbfs = (v: number) => (v > 0 ? `${(20 * Math.log10(v)).toFixed(1)} dBFS` : 'silence');

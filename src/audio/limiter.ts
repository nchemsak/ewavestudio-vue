// The output limiter (PR 114, the plan's item 3, part 3): a gentle brickwall at −1 dBFS on the
// whole mix, after the Volume knob, in the live engine and the export. One voice rarely gets
// near it (the presets peak at 0.2–0.65); four machines summed (the plan's items 4–6) will.
//
// Below the ceiling it does nothing at all: the gain is exactly 1, so a sound that never goes
// over plays and exports bit for bit as before. When a peak would go over, the gain comes down
// over the 1.5 ms before it (a look-ahead: the sound is delayed that long, so the gain is
// already low when the peak arrives, and no wave is clipped flat), and goes back up over
// about 100 ms (RELEASE_S), so a loud hit doesn't pump. Both channels get the same gain, so
// the stereo picture stays.
//
// How it's sure to be low in time (a "min then box" look-ahead): each sample's needed gain is
// ceiling / peak (1 under the ceiling); the gain used is the average, over the look-ahead,
// of the lowest needed gain in the look-ahead before it. Every value in that average already
// saw the peak, so it's no higher than the peak needs, and it moves smoothly.
//
// limiterGain() is the whole algorithm, one sample at a time; it and limiterState() are
// self-contained (no outside names), because their source is copied into the live engine's
// AudioWorklet (loaded from a Blob URL, as the bit crusher is). The export runs the same code
// over the rendered mix without the delay (limiterGains()), and applies the mix's gains to
// every stem as well, so the stems still add up to the mix.

export const LIMITER_PROCESSOR = 'ew-limiter';
export const LIMITER_CEILING = 0.891; // −1 dBFS
export const LOOKAHEAD_S = 0.0015;
export const RELEASE_S = 0.1; // time constant of the way back up

export type LimiterState = {
	n: number;          // the look-ahead in samples
	ceiling: number;
	release: number;    // the release's factor per sample
	need: number[];     // the last n + 1 needed gains
	low: number[];      // the last n + 1 lowest-in-the-look-ahead gains
	lowSum: number;
	under: number;      // how many of `low` are under 1 (none: the gain is exactly 1)
	at: number;         // where the rings are
	gain: number;
};

export function limiterState(sampleRate: number, ceiling: number, lookaheadS: number, releaseS: number): LimiterState {
	const n = Math.max(1, Math.round(lookaheadS * sampleRate));
	return {
		n, ceiling,
		release: Math.exp(-1 / (releaseS * sampleRate)),
		need: new Array(n + 1).fill(1),
		low: new Array(n + 1).fill(1),
		lowSum: n + 1,
		under: 0,
		at: 0,
		gain: 1,
	};
}

// One sample in: its peak (the larger channel, made positive). Out: the gain for the sample
// that came in n samples ago.
export function limiterGain(st: LimiterState, peak: number): number {
	const size = st.n + 1;
	st.need[st.at] = peak > st.ceiling ? st.ceiling / peak : 1;
	let m = 1;
	for (let k = 0; k < size; k++) if (st.need[k] < m) m = st.need[k];
	const old = st.low[st.at];
	if (old < 1) st.under--;
	if (m < 1) st.under++;
	st.low[st.at] = m;
	st.lowSum += m - old;
	st.at = (st.at + 1) % size;
	let want: number;
	if (st.under === 0) {
		want = 1;
		st.lowSum = size; // no drift from the running sum
	} else {
		want = Math.min(1, st.lowSum / size);
	}
	if (want <= st.gain) st.gain = want; // down at once (the look-ahead made it smooth)
	else {
		st.gain = want - (want - st.gain) * st.release; // up slowly
		if (want === 1 && st.gain > 0.9999) st.gain = 1; // −0.0009 dB: done
	}
	return st.gain;
}

const newState = (sampleRate: number) => limiterState(sampleRate, LIMITER_CEILING, LOOKAHEAD_S, RELEASE_S);

/** The export's limiter: the gain for each sample of `channels` (the mix), aligned with it */
export function limiterGains(channels: Float32Array[], sampleRate: number): Float32Array {
	const len = channels.length ? channels[0].length : 0;
	const st = newState(sampleRate);
	const gains = new Float32Array(len);
	for (let i = 0; i < len + st.n; i++) {
		let peak = 0;
		if (i < len) for (const c of channels) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
		const g = limiterGain(st, peak);
		if (i >= st.n) gains[i - st.n] = g;
	}
	return gains;
}

/** Is anything turned down? (all 1: the limiter did nothing) */
export const limited = (gains: Float32Array) => gains.some((g) => g < 1);

/** `channels` with the gains applied (new arrays; the same arrays when nothing was turned down) */
export function applyGains(channels: Float32Array[], gains: Float32Array): Float32Array[] {
	if (!limited(gains)) return channels;
	return channels.map((c) => {
		const out = new Float32Array(c.length);
		for (let i = 0; i < c.length; i++) out[i] = c[i] * (i < gains.length ? gains[i] : 1);
		return out;
	});
}

/** The export's limiter on one file: the gains from the file itself */
export const limit = (channels: Float32Array[], sampleRate: number) => applyGains(channels, limiterGains(channels, sampleRate));

const processorSource = () => `
const limiterState = (${limiterState.toString()});
const limiterGain = (${limiterGain.toString()});
class EwLimiter extends AudioWorkletProcessor {
	constructor() {
		super();
		this.st = limiterState(sampleRate, ${LIMITER_CEILING}, ${LOOKAHEAD_S}, ${RELEASE_S});
		this.delay = [];
		this.at = 0;
	}
	process(inputs, outputs) {
		const input = inputs[0] || [];
		const output = outputs[0];
		const len = output.length ? output[0].length : 0;
		const size = this.st.n;
		while (this.delay.length < output.length) this.delay.push(new Float32Array(size));
		for (let i = 0; i < len; i++) {
			let peak = 0;
			for (let c = 0; c < output.length; c++) {
				const ch = input[c] || input[0];
				const x = ch ? ch[i] : 0;
				const a = x < 0 ? -x : x;
				if (a > peak) peak = a;
			}
			const g = limiterGain(this.st, peak);
			for (let c = 0; c < output.length; c++) {
				const ch = input[c] || input[0];
				const x = ch ? ch[i] : 0;
				const d = this.delay[c];
				const y = d[this.at] * g;
				output[c][i] = y === 0 ? 0 : y;
				d[this.at] = x;
			}
			this.at = (this.at + 1) % size;
		}
		return true;
	}
}
registerProcessor('${LIMITER_PROCESSOR}', EwLimiter);
`;

// Loads the processor into a context once; resolves false where AudioWorklets aren't there
const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();
export function loadLimiter(ctx: BaseAudioContext): Promise<boolean> {
	let p = loaded.get(ctx);
	if (!p) {
		p = (async () => {
			const worklet = (ctx as any).audioWorklet;
			if (!worklet || typeof AudioWorkletNode === 'undefined') return false;
			const url = URL.createObjectURL(new Blob([processorSource()], { type: 'text/javascript' }));
			try {
				await worklet.addModule(url);
				return true;
			} catch (e) {
				console.warn('Limiter unavailable:', e);
				return false;
			} finally {
				URL.revokeObjectURL(url);
			}
		})();
		loaded.set(ctx, p);
	}
	return p;
}

/** The live limiter (stereo), or null if the processor isn't loaded in this context */
export function createLimiter(ctx: BaseAudioContext): AudioWorkletNode | null {
	try {
		return new AudioWorkletNode(ctx, LIMITER_PROCESSOR, {
			numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
			channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers',
		});
	} catch {
		return null;
	}
}

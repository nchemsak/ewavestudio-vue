// Bit crusher: the overdrive pedal's CRUSH switch, in the live and export engines.
// With CRUSH on, the pedal's driven (wet) path goes shaper → TONE → crusher → MIX: the crusher
// keeps fewer bits (rounding to the nearest level, so quiet tails fall to silence) and holds
// each sample for a while (a lower sample rate, whose aliasing is the crushed sound). The
// DRIVE knob sets how hard: from 8 bits at 12 kHz to 4 bits at 3 kHz (crushSettings()).
// It comes after TONE because a filter after the hard steps overshoots them (half again as
// loud at full DRIVE); here its output stays within ±1, as loud as the overdrive's.
//
// A sample-and-hold needs an AudioWorklet (no built-in node holds samples). Its processor is
// built from crushBlock() below, which unit tests run in Node, and loaded from a Blob URL, so
// the build has no extra file (and the service worker nothing new to cache). AudioWorklets
// also run in the OfflineAudioContext of an export.

export const CRUSH_PROCESSOR = 'ew-crusher';

export const CRUSH_BITS_MAX = 8;   // DRIVE at 0
export const CRUSH_BITS_MIN = 4;   // DRIVE at 1
export const CRUSH_RATE_MAX = 12000; // Hz, DRIVE at 0
export const CRUSH_RATE_MIN = 3000;  // Hz, DRIVE at 1

// The crusher's bits and hold (samples per held value, ≥ 1) for a DRIVE amount (0..1)
export function crushSettings(amount: number, sampleRate: number): { bits: number; hold: number } {
	const a = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));
	const bits = CRUSH_BITS_MAX - (CRUSH_BITS_MAX - CRUSH_BITS_MIN) * a;
	const rate = CRUSH_RATE_MAX * Math.pow(CRUSH_RATE_MIN / CRUSH_RATE_MAX, a);
	return { bits, hold: Math.max(1, sampleRate / rate) };
}

export type CrushState = { phase: number; held: number[] };

// One block of the crusher. Self-contained (no outside names): its source is copied into the
// worklet. The first sample is always taken; then one every `hold` samples (fractional holds
// average out). Each channel holds its own value; a missing input channel follows channel 0.
export function crushBlock(st: CrushState, input: Float32Array[], output: Float32Array[], bits: number, hold: number): void {
	const step = 2 / Math.pow(2, bits);
	const n = output.length ? output[0].length : 0;
	for (let i = 0; i < n; i++) {
		let take = false;
		if (st.phase <= 0) {
			take = true;
			st.phase += hold;
		}
		st.phase -= 1;
		for (let c = 0; c < output.length; c++) {
			if (take) {
				const ch = input[c] || input[0];
				const x = ch ? ch[i] : 0;
				let y = Math.round(x / step) * step;
				if (y > 1) y = 1;
				else if (y < -1) y = -1;
				st.held[c] = y === 0 ? 0 : y; // no −0
			}
			output[c][i] = st.held[c] || 0;
		}
	}
}

const processorSource = () => `
const crushBlock = (${crushBlock.toString()});
class EwCrusher extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [
			{ name: 'bits', defaultValue: ${CRUSH_BITS_MAX}, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
			{ name: 'hold', defaultValue: 1, minValue: 1, maxValue: 256, automationRate: 'k-rate' },
		];
	}
	constructor() {
		super();
		this.st = { phase: 0, held: [] };
	}
	process(inputs, outputs, params) {
		crushBlock(this.st, inputs[0] || [], outputs[0], params.bits[0], params.hold[0]);
		return true;
	}
}
registerProcessor('${CRUSH_PROCESSOR}', EwCrusher);
`;

// Loads the processor into a context once; resolves false where AudioWorklets aren't there
const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();
export function loadCrusher(ctx: BaseAudioContext): Promise<boolean> {
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
				console.warn('Bit crusher unavailable:', e);
				return false;
			} finally {
				URL.revokeObjectURL(url);
			}
		})();
		loaded.set(ctx, p);
	}
	return p;
}

// A crusher node set for a DRIVE amount, or null if the processor isn't loaded in this context
export function createCrusher(ctx: BaseAudioContext, amount: number): AudioWorkletNode | null {
	try {
		const node = new AudioWorkletNode(ctx, CRUSH_PROCESSOR);
		setCrusher(node, ctx, amount);
		return node;
	} catch {
		return null;
	}
}

export function setCrusher(node: AudioWorkletNode, ctx: BaseAudioContext, amount: number) {
	const { bits, hold } = crushSettings(amount, ctx.sampleRate);
	const t = ctx.currentTime;
	(node.parameters as any).get('bits').setValueAtTime(bits, t);
	(node.parameters as any).get('hold').setValueAtTime(hold, t);
}

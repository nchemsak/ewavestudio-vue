// src/components/filterView.ts
// The screen's filter view: the low-pass filter's real response curve on a log-frequency
// axis, with the live spectrum faintly behind it. DrumSequencer shows it while Cutoff or
// Resonance is turned (like the envelope view, but without an F-key). When the LFO moves the
// cutoff, faint dashed curves show how far it goes either way.
//
// The curve comes from BiquadFilterNode.getFrequencyResponse() on a node set up as each
// note's filter is (liveEngine.ts): type lowpass, the cutoff and Q, or 20 kHz and Q 0.0001
// when the filter is off. The node is never connected. The pure helpers below are tested in
// filterView.test.ts.

import { lfoFilterTapGain } from '../audio/synthHelpers';

// Axes START

export const FREQ_MIN = 20;
export const FREQ_MAX = 20000;
// dB range: a low-pass Q is in dB, and Q 20 (the knob's maximum) peaks at about +20 dB
export const DB_TOP = 24;
export const DB_BOTTOM = -48;

// `n` frequencies spaced evenly on a log axis from FREQ_MIN to FREQ_MAX
export function logFrequencies(n: number): Float32Array<ArrayBuffer> {
	const out = new Float32Array(new ArrayBuffer(n * 4));
	const span = Math.log(FREQ_MAX / FREQ_MIN);
	for (let i = 0; i < n; i++) out[i] = FREQ_MIN * Math.exp((span * i) / Math.max(1, n - 1));
	return out;
}

// Position (0..1) of a frequency along the axis, and back
export function freqToPos(hz: number): number {
	const f = Math.min(FREQ_MAX, Math.max(FREQ_MIN, hz));
	return Math.log(f / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
}
export function posToFreq(pos: number): number {
	return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, Math.min(1, Math.max(0, pos)));
}

// Height (0 at the top of the plot, 1 at the bottom) of a level in dB; clipped to the plot
export function dbToPos(db: number): number {
	const d = Math.min(DB_TOP, Math.max(DB_BOTTOM, db));
	return (DB_TOP - d) / (DB_TOP - DB_BOTTOM);
}

// Axes END

// What the engine sets each note's filter to
export function engineFilter(enabled: boolean, cutoff: number, resonance: number) {
	return enabled ? { frequency: cutoff, Q: resonance } : { frequency: 20000, Q: 0.0001 };
}

// The cutoffs the LFO swings between ([low, high]), or null when it doesn't move the filter
export function lfoCutoffRange(
	lfo: { enabled: boolean; target: string; depth: number },
	cutoff: number,
	sampleRate: number,
): [number, number] | null {
	if (!lfo.enabled || lfo.target !== 'filter' || !(lfo.depth > 0)) return null;
	const swing = lfo.depth * lfoFilterTapGain(cutoff, lfo.depth, sampleRate);
	if (!(swing > 0)) return null;
	return [cutoff - swing, cutoff + swing];
}

export function formatHz(hz: number): string {
	return hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz` : `${Math.round(hz)} Hz`;
}

// Drawing START

type Settings = {
	filterEnabled: () => boolean;
	cutoff: () => number;
	resonance: () => number;
	lfo: () => { enabled: boolean; target: string; depth: number };
};

const POINTS = 256;
// The live spectrum skips the lowest FFT bins (DC up to about 60 Hz at 48 kHz): the drive
// shaper's DC offset (see "Master limiter" in CLAUDE.md's plan) shows there as a steady block
// even in silence. Drop this once that offset is fixed.
const SKIP_BINS = 3;

// Starts a drawing loop on `canvas` that draws only while `isActive()` is true. `fit` sizes
// the canvas to its box for the device pixel ratio (DrumSequencer's fitCanvasToBox).
export function startFilterView(opts: {
	canvas: HTMLCanvasElement;
	audioCtx: BaseAudioContext;
	analyser: AnalyserNode;
	isActive: () => boolean;
	fit: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void;
	settings: Settings;
}) {
	const { canvas, audioCtx, analyser, isActive, fit, settings } = opts;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const probe = audioCtx.createBiquadFilter(); // never connected: only asked for its response
	probe.type = 'lowpass';
	const freqs = logFrequencies(POINTS);
	const mag = new Float32Array(POINTS);
	const phase = new Float32Array(POINTS);
	const bins = new Uint8Array(analyser.frequencyBinCount);
	const nyquist = audioCtx.sampleRate / 2;

	// The response in dB at each of `freqs`, for a cutoff and Q
	function response(frequency: number, Q: number): Float32Array {
		probe.frequency.value = Math.min(nyquist, Math.max(10, frequency));
		probe.Q.value = Q;
		probe.getFrequencyResponse(freqs, mag, phase);
		const db = new Float32Array(POINTS);
		for (let i = 0; i < POINTS; i++) db[i] = 20 * Math.log10(Math.max(1e-6, mag[i]));
		return db;
	}

	function draw() {
		requestAnimationFrame(draw);
		if (!isActive()) return;

		fit(canvas, ctx!);
		const W = Math.round(canvas.clientWidth);
		const H = Math.round(canvas.clientHeight);
		const css = getComputedStyle(canvas);
		const bg = (css.getPropertyValue('--nac-lcd-bg') || '#0f141b').trim();
		const ink = (css.getPropertyValue('--nac-scope-trace') || '#c7d6ff').trim();
		const specInk = (css.getPropertyValue('--nac-spec-low') || ink).trim();

		const L = 14, R = 10, T = 25, B = 16;
		const plotW = Math.max(1, W - L - R);
		const plotH = Math.max(1, H - T - B);
		const xOf = (hz: number) => L + freqToPos(hz) * plotW;
		const yOf = (db: number) => T + dbToPos(db) * plotH;

		ctx!.fillStyle = bg;
		ctx!.fillRect(0, 0, W, H);

		// Grid: 100 Hz, 1 kHz, 10 kHz, and the 0 dB line
		ctx!.strokeStyle = ink;
		ctx!.lineWidth = 1;
		ctx!.globalAlpha = 0.15;
		ctx!.beginPath();
		for (const hz of [100, 1000, 10000]) { ctx!.moveTo(xOf(hz), T); ctx!.lineTo(xOf(hz), T + plotH); }
		ctx!.moveTo(L, yOf(0)); ctx!.lineTo(L + plotW, yOf(0));
		ctx!.stroke();

		// The live spectrum, faintly, as a filled area
		analyser.getByteFrequencyData(bins);
		ctx!.globalAlpha = 0.22;
		ctx!.fillStyle = specInk;
		ctx!.beginPath();
		ctx!.moveTo(L, T + plotH);
		const binHz = nyquist / bins.length;
		for (let x = 0; x <= plotW; x += 2) {
			const f0 = posToFreq(x / plotW), f1 = posToFreq((x + 2) / plotW);
			let v = 0;
			const b0 = Math.max(SKIP_BINS, Math.floor(f0 / binHz));
			for (let b = b0; b <= Math.min(bins.length - 1, Math.ceil(f1 / binHz)); b++) v = Math.max(v, bins[b]);
			ctx!.lineTo(L + x, T + plotH - (v / 255) * plotH);
		}
		ctx!.lineTo(L + plotW, T + plotH);
		ctx!.closePath();
		ctx!.fill();

		const on = settings.filterEnabled();
		const { frequency, Q } = engineFilter(on, settings.cutoff(), settings.resonance());

		const stroke = (db: Float32Array) => {
			ctx!.beginPath();
			for (let i = 0; i < POINTS; i++) {
				const x = L + (i / (POINTS - 1)) * plotW;
				const y = yOf(db[i]);
				i === 0 ? ctx!.moveTo(x, y) : ctx!.lineTo(x, y);
			}
			ctx!.stroke();
		};

		// How far the LFO moves the cutoff: faint dashed curves at both ends
		const range = lfoCutoffRange(settings.lfo(), frequency, audioCtx.sampleRate);
		if (range) {
			ctx!.globalAlpha = 0.4;
			ctx!.lineWidth = 1;
			ctx!.setLineDash([4, 4]);
			for (const f of range) stroke(response(f, Q));
			ctx!.setLineDash([]);
		}

		// The response curve
		ctx!.globalAlpha = 1;
		ctx!.lineWidth = 2;
		ctx!.strokeStyle = ink;
		stroke(response(frequency, Q));

		// Cutoff marker
		const cx = xOf(frequency);
		if (on) {
			ctx!.globalAlpha = 0.35;
			ctx!.lineWidth = 1;
			ctx!.beginPath(); ctx!.moveTo(cx, T); ctx!.lineTo(cx, T + plotH); ctx!.stroke();
		}

		// Labels
		ctx!.font = '700 11px Cousine, ui-monospace, monospace';
		ctx!.fillStyle = ink;
		ctx!.globalAlpha = 0.9;
		ctx!.textAlign = 'left';
		ctx!.fillText(on ? 'Low-pass Filter' : 'Low-pass Filter: off', L, 12);
		ctx!.textAlign = 'right';
		if (on) ctx!.fillText(`Q ${settings.resonance().toFixed(1)}`, L + plotW, 12);

		const cutLabel = on ? formatHz(frequency) : '';
		const cutW = cutLabel ? ctx!.measureText(cutLabel).width : 0;
		const lx = Math.min(L + plotW - cutW / 2, Math.max(L + cutW / 2, cx));
		ctx!.globalAlpha = 0.85;
		if (cutLabel) { ctx!.textAlign = 'center'; ctx!.fillText(cutLabel, lx, H - 4); }
		// Axis ends, unless the cutoff label is in the way
		ctx!.globalAlpha = 0.6;
		const lo = '20 Hz', hi = '20 kHz';
		if (!cutLabel || lx - cutW / 2 > L + ctx!.measureText(lo).width + 6) { ctx!.textAlign = 'left'; ctx!.fillText(lo, L, H - 4); }
		if (!cutLabel || lx + cutW / 2 < L + plotW - ctx!.measureText(hi).width - 6) { ctx!.textAlign = 'right'; ctx!.fillText(hi, L + plotW, H - 4); }
		ctx!.globalAlpha = 1;
	}
	draw();
}

// Drawing END

// src/components/cardViews.ts
// The big screen's views, spread around the cards (PR 108, the plan's item 1): the live
// spectrum drawn faintly behind the Filter card's curve, one hit of the sound behind the
// Envelope card's curve, and the tuner in the Melody Maker's screen (TunerBadge.vue). Each is
// drawn on the card's own axis (src/lib/shapeViews.ts), so the curve you drag sits on what you
// hear. The pure helpers are tested in cardViews.test.ts.

import { padHue } from '../lib/padColour';
import { xFreq, ENV_MAX_MS } from '../lib/shapeViews';
import { bandLevel, holdPeaks, strongestNoteHz, noteOf } from './spectrumView';
import { hitColumns, type HitPicture } from './hitView';

// What the views read: the fine analyser (liveEngine.ts, 8192 points behind a 10 Hz
// high-pass) and whether anything sounds (playing, or a note in the last moment)
export type ViewSource = {
	analyser: AnalyserNode;
	sampleRate: number;
	active: () => boolean;
};

// Helpers START

// How fast the spectrum's columns fall, in the analyser's 0–255 units a second (about 20 dB)
export const UNDER_FALL_PER_S = 90;
// Below this level (0–255) a column isn't drawn: silence and the room's hiss stay dark
export const UNDER_MIN_LEVEL = 24;

// The level (0–255) of each of `cols` columns across the Filter card's 20 Hz–20 kHz log axis
// (xFreq() in shapeViews.ts): the loudest bin in the column's band
export function spectrumColumns(bins: ArrayLike<number>, binHz: number, cols: number): Float32Array {
	const out = new Float32Array(cols);
	for (let c = 0; c < cols; c++) {
		const f0 = xFreq(c, cols), f1 = xFreq(c + 1, cols);
		out[c] = bandLevel(bins, binHz, f0, f1);
	}
	return out;
}

// One column's height (0–1) behind the Filter curve, from its level: the analyser's −90…−10 dB
// mapped from UNDER_MIN_LEVEL up, so a loud note reaches about the top
export function columnHeight(level: number): number {
	if (level <= UNDER_MIN_LEVEL) return 0;
	return Math.min(1, (level - UNDER_MIN_LEVEL) / (230 - UNDER_MIN_LEVEL));
}

// What the hit looks like behind the Envelope card: each of `cols` columns' loudest sample, as a
// share (0–1) of the hit's peak, on the card's square-root time scale up to ENV_MAX_MS
// (a whole cycle of its note at least, once a column is wider than a third of one, so the
// envelope shows without moiré: hitColumns())
export function hitHeights(hit: Pick<HitPicture, 'channels' | 'sampleRate' | 'hz'>, cols: number): Float32Array {
	const { min, max } = hitColumns(hit.channels, hit.sampleRate, cols, ENV_MAX_MS, hit.hz > 0 ? hit.sampleRate / hit.hz : 0);
	let peak = 0;
	const out = new Float32Array(cols);
	for (let c = 0; c < cols; c++) {
		out[c] = Math.max(-min[c], max[c]);
		peak = Math.max(peak, out[c]);
	}
	if (peak > 0) for (let c = 0; c < cols; c++) out[c] /= peak;
	return out;
}

// The tuner's reading: the strongest note, its name (sharps or flats, as the key), and how far
// off in cents; null when nothing clear sounds
export function tunerReading(bins: ArrayLike<number>, binHz: number, flats = false): { name: string; cents: number; hz: number } | null {
	const hz = strongestNoteHz(bins, binHz);
	if (!hz) return null;
	return { ...noteOf(hz, flats), hz };
}

// Helpers END

// Drawing START

// Sizes the canvas to its box at the screen's pixel ratio; false while it has no size (hidden)
function fit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): boolean {
	const W = canvas.clientWidth, H = canvas.clientHeight;
	if (!W || !H) return false;
	const dpr = window.devicePixelRatio || 1;
	const w = Math.round(W * dpr), h = Math.round(H * dpr);
	if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return true;
}

// The spectrum behind the Filter card's curve: a loop that reads the analyser only while
// something sounds (and the card is on screen), lets the columns fall after, then rests.
// Returns a function that stops it.
export function startSpectrumUnderlay(canvas: HTMLCanvasElement, source: ViewSource): () => void {
	const ctx = canvas.getContext('2d');
	if (!ctx) return () => { };
	let frame = 0;
	let bins: Uint8Array<ArrayBuffer> | null = null;
	let held = new Float32Array(0);
	let lastT = performance.now();
	let lit = false;

	function draw() {
		frame = requestAnimationFrame(draw);
		const now = performance.now();
		const dt = Math.min(0.1, (now - lastT) / 1000);
		lastT = now;
		const active = source.active();
		if (!active && !lit) return;
		if (!fit(canvas, ctx!)) return;
		const W = canvas.clientWidth, H = canvas.clientHeight;
		const cols = Math.max(1, Math.round(W));
		if (held.length !== cols) held = new Float32Array(cols);
		const an = source.analyser;
		if (!bins || bins.length !== an.frequencyBinCount) bins = new Uint8Array(an.frequencyBinCount);
		if (active) an.getByteFrequencyData(bins);
		else bins.fill(0);
		holdPeaks(held, spectrumColumns(bins, source.sampleRate / an.fftSize, cols), UNDER_FALL_PER_S * dt);
		ctx!.clearRect(0, 0, W, H);
		lit = false;
		for (let c = 0; c < cols; c++) {
			const h = columnHeight(held[c]) * H;
			if (h < 0.5) continue;
			lit = true;
			const hz = xFreq(c + 0.5, cols);
			ctx!.fillStyle = `hsl(${padHue(hz)} 80% 62% / 0.4)`;
			ctx!.fillRect(c, H - h, 1, h);
		}
	}
	frame = requestAnimationFrame(draw);
	return () => cancelAnimationFrame(frame);
}

// One hit behind the Envelope card's curve, filled from the bottom in its pad's colour, as
// tall as the curve's peak (`topShare` of the screen's height under its top edge, as the
// card's ENV_TOP is of its box). Drawn once per hit or size.
export function drawHitUnderlay(canvas: HTMLCanvasElement, hit: HitPicture | null, topShare = 0) {
	const ctx = canvas.getContext('2d');
	if (!ctx || !fit(canvas, ctx)) return;
	const W = canvas.clientWidth, H = canvas.clientHeight;
	ctx.clearRect(0, 0, W, H);
	if (!hit) return;
	const cols = Math.max(1, Math.round(W));
	const heights = hitHeights(hit, cols);
	ctx.fillStyle = `hsl(${padHue(hit.hz)} 80% 62% / 0.38)`;
	const span = H * (1 - topShare);
	for (let c = 0; c < cols; c++) {
		const h = heights[c] * span;
		if (h >= 0.5) ctx.fillRect(c, H - h, 1, h);
	}
}

// Drawing END

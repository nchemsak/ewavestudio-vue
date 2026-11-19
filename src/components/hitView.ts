// src/components/hitView.ts
// The screen at rest (PR 94): while nothing plays, the screen draws one hit of the current
// sound as a waveform, the one-shot the Export dialog would make (renderHit() in
// src/audio/export/exportFiles.ts: full velocity, the key's root in the pads' octave, the main
// wave, effects included, without the tape pedal's hiss), with its length and peak, redrawn as
// a knob turns. So the biggest thing on the page is never blank, and a sound can be read
// before it's heard.
//
// Time runs on a square-root scale, as on the shape cards (timeX() in src/lib/shapeViews.ts),
// so a 5 ms click shows beside a 2 s reverb tail. The pure helpers are tested in
// hitView.test.ts.

import { timeX, xTime } from '../lib/shapeViews';
import { padHue } from '../lib/padColour';
import type { StepSequencerState } from '../audio/export/scheduleStepSequencer';
import { sampleSeconds, sampleSpan, SAMPLE_WAVE } from '../audio/sample';
import { swellSeconds } from '../audio/reverb/reverse';

// Helpers START

// The longest hit rendered: the one-shot's 6 s
export const HIT_MAX_S = 6;

// How long a hit of `state` may ring, so a short sound isn't rendered for 6 s: the envelope,
// the delay's echoes until they fall to −60 dB, the reverb's pre-delay and decay (or REV's swell), and a little room. On the
// recording (`wave` 'sample' at `hz`), its own length instead of the envelope's.
export function hitSeconds(state: Pick<StepSequencerState, 'synth' | 'fx'> & { bpm?: number }, wave?: string, hz?: number): number {
	const env = state.synth.envelope;
	const rec = wave === SAMPLE_WAVE ? state.synth.sample : null;
	let s = rec ? sampleSpan(sampleSeconds(rec), hz ?? 220, state.synth.sampleLength ?? 1).seconds
		: env.enabled ? (env.attackMs + env.decayMs) / 1000 : 2;
	const d = state.fx.delay;
	if (d.enabled && d.mix > 0) {
		const fb = Math.min(0.95, Math.max(0.01, d.feedback));
		s += d.time * Math.min(60, Math.ceil(Math.log(0.001) / Math.log(fb)) + 1);
	}
	const r = state.fx.reverb;
	// REV swells for SWELL's length (a beat for Next hit: one hit has no next) instead of decaying
	if (r.enabled && r.mix > 0) {
		s += (r.preDelay ?? 0) / 1000 + (r.reverse ? swellSeconds(r.swell ?? 'next', 60 / (state.bpm || 120) / 4, null) : r.decay * 1.2);
	}
	return Math.min(HIT_MAX_S, Math.max(0.3, s + 0.2));
}

// The time axis's end: the hit's length rounded up to a round number of ms
const SPANS = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000];
export function hitSpanMs(lengthMs: number): number {
	return SPANS.find((s) => s >= lengthMs * 1.02) ?? SPANS[SPANS.length - 1];
}

// The ticks along the time axis (ms), on the square-root scale: the round numbers up to
// `spanMs`, each at least `minGap` (a share of the width) from the one before
const TICKS = [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 4000];
export function hitTicks(spanMs: number, minGap = 0.14): number[] {
	const out: number[] = [];
	let last = 0;
	for (const t of TICKS) {
		if (t >= spanMs) break;
		const x = timeX(t, 1, spanMs);
		if (x - last >= minGap && 1 - x >= minGap * 0.6) { out.push(t); last = x; }
	}
	return out;
}

// What each of `cols` columns of the plot shows: the lowest and highest sample of either
// channel in its stretch of time (the square-root scale over 0…spanMs). Near the start, where
// a column is a small part of the note's cycle (`period`, in frames), that stretch runs on to
// the next column's first sample, so the columns draw the wave itself as one line; further on,
// at least a whole cycle round the column's middle, so the columns draw its envelope without
// the moiré a column about a cycle wide would make.
export function hitColumns(channels: Float32Array[], sampleRate: number, cols: number, spanMs: number, period = 0):
	{ min: Float32Array; max: Float32Array } {
	const min = new Float32Array(cols);
	const max = new Float32Array(cols);
	const frames = channels[0]?.length ?? 0;
	for (let c = 0; c < cols; c++) {
		let f0 = Math.floor((xTime(c, cols, spanMs) / 1000) * sampleRate);
		let f1 = Math.max(f0 + 1, Math.floor((xTime(c + 1, cols, spanMs) / 1000) * sampleRate) + 1);
		if (period > 0 && f1 - f0 > period / 3) {
			const m = (f0 + f1) / 2;
			f0 = Math.min(f0, Math.floor(m - period / 2));
			f1 = Math.max(f1, Math.ceil(m + period / 2));
		}
		let lo = 0, hi = 0;
		for (let f = Math.max(0, f0); f < Math.min(f1, frames); f++) {
			for (const ch of channels) {
				const v = ch[f];
				if (v < lo) lo = v;
				if (v > hi) hi = v;
			}
		}
		min[c] = lo;
		max[c] = hi;
	}
	return { min, max };
}

// "312 ms", "1.25 s"
export function formatLength(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)} ms`;
	return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

// "−6.2 dB", "0.0 dB", "+1.4 dB" (dBFS), or "silent"
export function formatPeak(peak: number): string {
	if (!(peak > 1e-5)) return 'silent';
	const db = 20 * Math.log10(peak);
	const r = Math.round(db * 10) / 10;
	return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)} dB`;
}

// A tick's label: "50", "1 s"
const tickLabel = (ms: number) => (ms >= 1000 ? `${ms / 1000} s` : `${ms}`);

// Helpers END

// Drawing START

export type HitPicture = {
	channels: Float32Array[]; // the hit, cut where it fades
	sampleRate: number;
	hz: number;               // its note, for the pads' colour
	title: string;            // "A3 Sine"
};

// Starts a drawing loop on `canvas` that draws only while `isActive()` is true, and then only
// when the hit, the size or the theme has changed. `hit()` is null until the first render.
export function startHitView(opts: {
	canvas: HTMLCanvasElement;
	isActive: () => boolean;
	fit: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void;
	hit: () => HitPicture | null;
}) {
	const { canvas, isActive, fit, hit } = opts;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	let drawn = '';
	let drawnHit: HitPicture | null = null;

	function draw() {
		requestAnimationFrame(draw);
		if (!isActive()) return;
		const h = hit();
		const css = getComputedStyle(canvas);
		const bg = (css.getPropertyValue('--nac-lcd-bg') || '#0f141b').trim();
		const ink = (css.getPropertyValue('--nac-scope-trace') || '#c7d6ff').trim();
		const W0 = Math.round(canvas.clientWidth), H0 = Math.round(canvas.clientHeight);
		const key = `${W0}x${H0}|${window.devicePixelRatio}|${bg}|${ink}`;
		if (key === drawn && h === drawnHit) return;
		drawn = key;
		drawnHit = h;

		fit(canvas, ctx!);
		const W = Math.round(canvas.clientWidth);
		const H = Math.round(canvas.clientHeight);
		ctx!.globalAlpha = 1;
		ctx!.fillStyle = bg;
		ctx!.fillRect(0, 0, W, H);

		const L = 14, R = 10, T = 25, B = 16;
		const plotW = Math.max(1, W - L - R);
		const plotH = Math.max(1, H - T - B);
		const mid = T + plotH / 2;

		ctx!.font = '700 11px Cousine, ui-monospace, monospace';
		ctx!.fillStyle = ink;
		ctx!.strokeStyle = ink;
		ctx!.globalAlpha = 0.9;
		ctx!.textAlign = 'left';
		if (!h) { ctx!.fillText('Hit', L, 12); return; }

		const frames = h.channels[0]?.length ?? 0;
		const lengthMs = (frames / h.sampleRate) * 1000;
		let peak = 0;
		for (const ch of h.channels) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
		const spanMs = hitSpanMs(lengthMs);

		// The title top left, its length and peak top right (the peak in red if it would clip),
		// shortened where the screen is narrow
		const len = formatLength(lengthMs), pk = formatPeak(peak);
		const fits = (left: string, right: string) => ctx!.measureText(left).width + 10 + ctx!.measureText(right).width <= plotW;
		const lefts = [`Hit · ${h.title}`, h.title];
		const rights: [string, string][] = [[`${len} · `, `peak ${pk}`], [`${len} · `, pk], [len, '']];
		let left = lefts[1], right = rights[2];
		search: for (const r of rights) for (const l of lefts) if (fits(l, r[0] + r[1])) { left = l; right = r; break search; }
		ctx!.fillText(left, L, 12);
		ctx!.textAlign = 'right';
		const peakW = right[1] ? ctx!.measureText(right[1]).width : 0;
		ctx!.fillText(right[0], L + plotW - peakW, 12);
		if (right[1]) {
			if (peak >= 1) ctx!.fillStyle = '#ff5a5a';
			ctx!.fillText(right[1], L + plotW, 12);
			ctx!.fillStyle = ink;
		}

		// The middle line, and the time ticks along the bottom
		ctx!.lineWidth = 1;
		ctx!.globalAlpha = 0.18;
		ctx!.beginPath(); ctx!.moveTo(L, mid); ctx!.lineTo(L + plotW, mid); ctx!.stroke();
		ctx!.font = '700 9px Cousine, ui-monospace, monospace';
		ctx!.textAlign = 'center';
		// The axis's end is labelled right-aligned, with its unit; a tick whose label would run
		// into the one before or the end's isn't labelled
		const endLabel = `${tickLabel(spanMs)}${spanMs < 1000 ? ' ms' : ''}`;
		const endLeft = L + plotW - ctx!.measureText(endLabel).width - 6;
		let labelEnd = -Infinity;
		for (const t of hitTicks(spanMs)) {
			const x = L + timeX(t, plotW, spanMs);
			ctx!.globalAlpha = 0.15;
			ctx!.beginPath(); ctx!.moveTo(x, T); ctx!.lineTo(x, T + plotH); ctx!.stroke();
			const w = ctx!.measureText(tickLabel(t)).width;
			if (x - w / 2 < labelEnd + 6 || x + w / 2 > endLeft) continue;
			ctx!.globalAlpha = 0.6;
			ctx!.fillText(tickLabel(t), x, H - 3);
			labelEnd = x + w / 2;
		}
		ctx!.globalAlpha = 0.6;
		ctx!.textAlign = 'right';
		ctx!.fillText(endLabel, L + plotW, H - 3);

		// The waveform, scaled so a usual hit fills the height (a quiet one, below −12 dB, shows
		// smaller); filled in its pad's colour, outlined in the screen's ink
		const scale = ((plotH / 2) * 0.92) / Math.max(peak, 0.25);
		const cols = Math.max(1, Math.round(plotW));
		const { min, max } = hitColumns(h.channels, h.sampleRate, cols, spanMs, h.sampleRate / h.hz);
		const yOf = (v: number) => mid - v * scale;
		const xEnd = Math.min(cols, Math.ceil(timeX(lengthMs, cols, spanMs)));
		ctx!.beginPath();
		for (let c = 0; c < xEnd; c++) c === 0 ? ctx!.moveTo(L + c, yOf(max[c])) : ctx!.lineTo(L + c, yOf(max[c]));
		for (let c = xEnd - 1; c >= 0; c--) ctx!.lineTo(L + c, yOf(min[c]));
		ctx!.closePath();
		ctx!.globalAlpha = 0.75;
		ctx!.fillStyle = `hsl(${padHue(h.hz)} 85% 58%)`;
		ctx!.fill();
		ctx!.globalAlpha = 0.9;
		ctx!.lineWidth = 1.25;
		ctx!.stroke();

		// The peak, dashed both ways
		if (peak > 1e-5) {
			ctx!.globalAlpha = 0.45;
			ctx!.setLineDash([3, 3]);
			ctx!.beginPath();
			for (const v of [peak, -peak]) { ctx!.moveTo(L, yOf(v)); ctx!.lineTo(L + plotW, yOf(v)); }
			ctx!.stroke();
			ctx!.setLineDash([]);
		}
		ctx!.globalAlpha = 1;
	}
	requestAnimationFrame(draw);
}

// Drawing END

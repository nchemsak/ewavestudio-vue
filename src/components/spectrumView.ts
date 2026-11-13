// src/components/spectrumView.ts
// The screen's Spectrum view (F2, PR 70): the live frequency curve of the output, on the same
// log-frequency axis as the filter view (20 Hz–20 kHz), filled in the pads' colours
// (src/lib/padColour.ts: a note shows in its pad's colour, as on the spectrogram), with a
// peak-hold line that falls slowly, a mark on the strongest note with its name and how far off
// it is in cents, and C notes ticked along the bottom. The spectrogram (F3) shows the same over
// time; this one shows it now, sharper.
//
// It reads the analyser the scope and the spectrogram read (liveEngine.ts: fftSize 2048, so
// about 23 Hz a bin at 48 kHz; the strongest note's frequency is refined between bins). The
// pure helpers are tested in spectrumView.test.ts.

import { freqToPos, posToFreq, FREQ_MIN, FREQ_MAX } from './filterView';
import { spectrumColour } from '../lib/padColour';

// Helpers START

// The bins skipped at the bottom (DC up to about 60 Hz): the drive's DC offset shows there as
// a steady block even in silence, as the filter view notes
export const SKIP_BINS = 3;
// How fast the peak-hold line falls, in the analyser's 0–255 units a second (its 255 span the
// analyser's −90…−30 dB range, so about 14 dB a second)
export const PEAK_FALL_PER_S = 60;
// A note is marked only above this level (0–255), so silence and reverb tails mark nothing
export const NOTE_MIN_LEVEL = 110;
// …and only between these, where a played note's fundamental is (the pads' 100–2000 Hz, and
// an octave either side)
export const NOTE_LOW_HZ = 50;
export const NOTE_HIGH_HZ = 4000;

// The level (0–255) of the band of bins from f0 to f1 Hz: its loudest bin
export function bandLevel(bins: ArrayLike<number>, binHz: number, f0: number, f1: number): number {
	let v = 0;
	const b0 = Math.max(SKIP_BINS, Math.floor(f0 / binHz));
	const b1 = Math.min(bins.length - 1, Math.ceil(f1 / binHz));
	for (let b = b0; b <= b1; b++) v = Math.max(v, bins[b]);
	return v;
}

// The peak-hold line: each point follows a louder level at once, and falls by `fall` otherwise
export function holdPeaks(held: Float32Array, levels: ArrayLike<number>, fall: number): Float32Array {
	for (let i = 0; i < held.length; i++) held[i] = Math.max(levels[i] ?? 0, (held[i] ?? 0) - fall);
	return held;
}

// The strongest note: the loudest bin between NOTE_LOW_HZ and NOTE_HIGH_HZ, if it's above
// NOTE_MIN_LEVEL, its frequency refined between its neighbours (a parabola through the three),
// or null
export function strongestNoteHz(bins: ArrayLike<number>, binHz: number): number | null {
	const lo = Math.max(SKIP_BINS + 1, Math.ceil(NOTE_LOW_HZ / binHz));
	const hi = Math.min(bins.length - 2, Math.floor(NOTE_HIGH_HZ / binHz));
	let best = -1;
	for (let b = lo; b <= hi; b++) if (best < 0 || bins[b] > bins[best]) best = b;
	if (best < 0 || bins[best] < NOTE_MIN_LEVEL) return null;
	const a = bins[best - 1], c = bins[best + 1], m = bins[best];
	const den = a - 2 * m + c;
	const shift = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
	return (best + shift) * binHz;
}

// A frequency's nearest note (the app's names: A3 = 220 Hz) and how far off it is, in cents
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export function noteOf(hz: number, flats = false): { name: string; cents: number } {
	const exact = 69 + 12 * Math.log2(hz / 440);
	const m = Math.round(exact);
	const names = flats ? FLAT : SHARP;
	return { name: `${names[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`, cents: Math.round((exact - m) * 100) };
}

// The C notes on the axis (C1…C9), for the ticks along the bottom
export function cNotes(): { name: string; hz: number }[] {
	const out: { name: string; hz: number }[] = [];
	for (let o = 1; o <= 9; o++) {
		const hz = 440 * Math.pow(2, (12 * (o + 1) - 69) / 12);
		if (hz >= FREQ_MIN && hz <= FREQ_MAX) out.push({ name: `C${o}`, hz });
	}
	return out;
}

// Helpers END

// Drawing START

const COLS = 2; // px per column of the filled curve

// Starts a drawing loop on `canvas` that draws only while `isActive()` is true (as the filter
// view's). `flats()`: name notes with flats (the key's preference).
export function startSpectrumView(opts: {
	canvas: HTMLCanvasElement;
	audioCtx: BaseAudioContext;
	analyser: AnalyserNode;
	isActive: () => boolean;
	fit: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void;
	flats: () => boolean;
}) {
	const { canvas, audioCtx, analyser, isActive, fit, flats } = opts;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const bins = new Uint8Array(analyser.frequencyBinCount);
	const binHz = audioCtx.sampleRate / 2 / bins.length;
	let held = new Float32Array(0);
	let lastT = 0;
	// The note mark stays a moment after its note fades, so it can be read
	let mark: { hz: number; until: number } | null = null;
	const colours = new Map<string, string>();

	const isLight = (bg: string) => {
		const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bg);
		if (!m) return false;
		const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
		return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
	};

	function draw(now: number) {
		requestAnimationFrame(draw);
		if (!isActive()) { lastT = 0; return; }

		fit(canvas, ctx!);
		const W = Math.round(canvas.clientWidth);
		const H = Math.round(canvas.clientHeight);
		const css = getComputedStyle(canvas);
		const bg = (css.getPropertyValue('--nac-lcd-bg') || '#0f141b').trim();
		const ink = (css.getPropertyValue('--nac-scope-trace') || '#c7d6ff').trim();
		const light = isLight(bg);

		const L = 14, R = 10, T = 25, B = 16;
		const plotW = Math.max(1, W - L - R);
		const plotH = Math.max(1, H - T - B);
		const xOf = (hz: number) => L + freqToPos(hz) * plotW;
		const yOf = (level: number) => T + plotH - (level / 255) * plotH;

		analyser.getByteFrequencyData(bins);
		const cols = Math.ceil(plotW / COLS) + 1;
		const levels = new Float32Array(cols);
		for (let k = 0; k < cols; k++) {
			const x = k * COLS;
			levels[k] = bandLevel(bins, binHz, posToFreq(x / plotW), posToFreq((x + COLS) / plotW));
		}
		if (held.length !== cols) held = new Float32Array(cols);
		const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
		lastT = now;
		holdPeaks(held, levels, PEAK_FALL_PER_S * dt);

		ctx!.globalAlpha = 1;
		ctx!.fillStyle = bg;
		ctx!.fillRect(0, 0, W, H);

		// Grid: 100 Hz, 1 kHz, 10 kHz
		ctx!.strokeStyle = ink;
		ctx!.lineWidth = 1;
		ctx!.globalAlpha = 0.15;
		ctx!.beginPath();
		for (const hz of [100, 1000, 10000]) { ctx!.moveTo(xOf(hz), T); ctx!.lineTo(xOf(hz), T + plotH); }
		ctx!.stroke();

		// The curve, filled column by column in each frequency's pad colour
		ctx!.globalAlpha = 0.85;
		for (let k = 0; k < cols; k++) {
			const v = levels[k];
			if (v < 4) continue;
			const hz = posToFreq((k * COLS) / plotW);
			const lv = Math.min(255, Math.round(v / 16) * 16);
			const key = `${Math.round(hz / 10)}|${lv}|${light}`;
			let c = colours.get(key);
			if (!c) { c = spectrumColour(hz, lv, light); colours.set(key, c); }
			ctx!.fillStyle = c;
			const y = yOf(v);
			ctx!.fillRect(L + k * COLS, y, COLS, T + plotH - y);
		}

		// Its outline, and the peak-hold line above it
		const line = (vals: Float32Array) => {
			ctx!.beginPath();
			for (let k = 0; k < cols; k++) {
				const x = Math.min(L + plotW, L + k * COLS), y = yOf(vals[k]);
				k === 0 ? ctx!.moveTo(x, y) : ctx!.lineTo(x, y);
			}
			ctx!.stroke();
		};
		ctx!.strokeStyle = ink;
		ctx!.globalAlpha = 0.9;
		ctx!.lineWidth = 1.5;
		line(levels);
		ctx!.globalAlpha = 0.45;
		ctx!.lineWidth = 1;
		line(held);

		// The strongest note: a mark and its name (held for a moment after it fades)
		const hz = strongestNoteHz(bins, binHz);
		if (hz) mark = { hz, until: now + 600 };
		ctx!.font = '700 11px Cousine, ui-monospace, monospace';
		ctx!.fillStyle = ink;
		if (mark && now < mark.until) {
			const mx = xOf(mark.hz);
			ctx!.globalAlpha = 0.6;
			ctx!.setLineDash([3, 3]);
			ctx!.beginPath(); ctx!.moveTo(mx, T); ctx!.lineTo(mx, T + plotH); ctx!.stroke();
			ctx!.setLineDash([]);
			const n = noteOf(mark.hz, flats());
			const label = `${n.name} ${n.cents > 0 ? '+' : ''}${n.cents}¢ · ${Math.round(mark.hz)} Hz`;
			ctx!.globalAlpha = 0.95;
			ctx!.textAlign = 'right';
			ctx!.fillText(label, L + plotW, 12);
		}

		// The title, and the C notes along the bottom
		ctx!.globalAlpha = 0.9;
		ctx!.textAlign = 'left';
		ctx!.fillText('Spectrum', L, 12);
		ctx!.font = '700 9px Cousine, ui-monospace, monospace';
		ctx!.textAlign = 'center';
		for (const c of cNotes()) {
			const x = xOf(c.hz);
			if (x < L + 8 || x > L + plotW - 8) continue;
			ctx!.globalAlpha = 0.3;
			ctx!.beginPath(); ctx!.moveTo(x, T + plotH); ctx!.lineTo(x, T + plotH + 3); ctx!.stroke();
			ctx!.globalAlpha = 0.6;
			ctx!.fillText(c.name, x, H - 3);
		}
	}
	requestAnimationFrame(draw);
}

// Drawing END

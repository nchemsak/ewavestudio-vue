// src/components/monitorViews.ts
// The machine rail's two small screens (PR 108; the big screen's F1 and F3 until then): the
// oscilloscope and the spectrogram of the output. Each loop draws only while something sounds
// (`active()`) and its canvas is on screen; at rest the scope is a flat line and the
// spectrogram keeps what it drew, so the last bars stay to read. The pure helpers are tested in
// monitorViews.test.ts.

import { spectrumColour } from '../lib/padColour';

// Helpers START

// The spectrogram's frequency axis: 40 Hz at the bottom to 10 kHz at the top, log (the pads'
// 100–2000 Hz in the middle three fifths; the old screen squeezed the low notes into its
// bottom rows)
export const SPEC_LOW_HZ = 40;
export const SPEC_HIGH_HZ = 10000;
export function specRowHz(y: number, rows: number): number {
	const t = 1 - (y + 0.5) / rows;
	return SPEC_LOW_HZ * Math.pow(SPEC_HIGH_HZ / SPEC_LOW_HZ, t);
}

// Where the scope starts drawing: the first rising zero crossing in the first half, so a
// steady note stands still (as phone mode's tiny scope does)
export function risingZero(samples: ArrayLike<number>): number {
	for (let i = 1; i < samples.length / 2; i++) if (samples[i - 1] < 0 && samples[i] >= 0) return i;
	return 0;
}

// Helpers END

function fit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, keep = false): boolean {
	const W = canvas.clientWidth, H = canvas.clientHeight;
	if (!W || !H) return false;
	const dpr = window.devicePixelRatio || 1;
	const w = Math.round(W * dpr), h = Math.round(H * dpr);
	if (canvas.width !== w || canvas.height !== h) {
		const old = keep && canvas.width && canvas.height ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
		canvas.width = w; canvas.height = h;
		if (old) ctx.putImageData(old, w - old.width, 0);
	}
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return true;
}

const cssVar = (el: Element, name: string, fallback: string) =>
	(getComputedStyle(el).getPropertyValue(name) || fallback).trim();

// The scope: the output's waveform, about 21 ms of it (1024 samples at 48 kHz) from a rising
// zero crossing. Returns a function that stops it.
export function startScope(canvas: HTMLCanvasElement, analyser: AnalyserNode, active: () => boolean): () => void {
	const ctx = canvas.getContext('2d');
	if (!ctx) return () => { };
	let frame = 0;
	let data: Float32Array<ArrayBuffer> | null = null;
	let flat = '';
	function draw() {
		frame = requestAnimationFrame(draw);
		const on = active();
		const W = canvas.clientWidth, H = canvas.clientHeight;
		const bg = cssVar(canvas, '--mr-lcd-bg', '#0f141b');
		const ink = cssVar(canvas, '--mr-ink', '#c7d6ff');
		// At rest: one flat line, drawn again only when the size or the theme changes
		const key = `${W}x${H}|${bg}|${ink}|${window.devicePixelRatio}`;
		if (!on && flat === key) return;
		if (!fit(canvas, ctx!)) return;
		ctx!.fillStyle = bg;
		ctx!.fillRect(0, 0, W, H);
		ctx!.strokeStyle = ink;
		ctx!.lineWidth = 1.5;
		ctx!.lineJoin = 'round';
		ctx!.beginPath();
		if (!on) {
			ctx!.globalAlpha = 0.4;
			ctx!.moveTo(0, H / 2); ctx!.lineTo(W, H / 2);
			ctx!.stroke();
			ctx!.globalAlpha = 1;
			flat = key;
			return;
		}
		flat = '';
		if (!data || data.length !== analyser.fftSize) data = new Float32Array(analyser.fftSize);
		analyser.getFloatTimeDomainData(data);
		const start = risingZero(data);
		const n = Math.min(1024, data.length - start);
		for (let i = 0; i < n; i++) {
			const x = (i / (n - 1)) * W;
			const y = H / 2 - Math.max(-1, Math.min(1, data[start + i] * 1.5)) * (H / 2 - 3);
			i ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y);
		}
		ctx!.stroke();
	}
	frame = requestAnimationFrame(draw);
	return () => cancelAnimationFrame(frame);
}

// The spectrogram: time scrolling left, frequency up (40 Hz–10 kHz, log), each frequency in the
// colour its pad would have, brighter when louder (src/lib/padColour.ts), so a note shows in its
// pad's colour. One column a frame while something sounds; it stops (keeping its picture) at rest.
export function startSpectrogram(canvas: HTMLCanvasElement, analyser: AnalyserNode, sampleRate: number,
	active: () => boolean): () => void {
	const ctx = canvas.getContext('2d');
	if (!ctx) return () => { };
	let frame = 0;
	let bins: Uint8Array<ArrayBuffer> | null = null;
	let bg = '';
	const colours = new Map<string, string>();
	function draw() {
		frame = requestAnimationFrame(draw);
		const W = canvas.clientWidth, H = canvas.clientHeight;
		const nowBg = cssVar(canvas, '--mr-lcd-bg', '#0f141b');
		const themeChanged = nowBg !== bg;
		if (!active() && !themeChanged && canvas.width) return;
		if (!fit(canvas, ctx!, true)) return;
		if (themeChanged) {
			bg = nowBg;
			ctx!.fillStyle = bg;
			ctx!.fillRect(0, 0, W, H);
			if (!active()) return;
		}
		const dpr = window.devicePixelRatio || 1;
		// Scroll one CSS pixel to the left
		ctx!.save();
		ctx!.setTransform(1, 0, 0, 1, 0, 0);
		ctx!.drawImage(canvas, dpr, 0, canvas.width - dpr, canvas.height, 0, 0, canvas.width - dpr, canvas.height);
		ctx!.restore();
		const x = W - 1;
		ctx!.fillStyle = bg;
		ctx!.fillRect(x, 0, 1, H);
		if (!bins || bins.length !== analyser.frequencyBinCount) bins = new Uint8Array(analyser.frequencyBinCount);
		analyser.getByteFrequencyData(bins);
		const binHz = sampleRate / analyser.fftSize;
		const rows = Math.max(1, Math.round(H));
		for (let y = 0; y < rows; y++) {
			const hz = specRowHz(y, rows);
			const v = bins[Math.min(bins.length - 1, Math.round(hz / binHz))] - 40;
			if (v < 8) continue;
			const level = Math.min(255, Math.round((v * 1.4) / 8) * 8);
			const key = `${Math.round(hz)}|${level}`;
			let c = colours.get(key);
			if (!c) { c = spectrumColour(hz, level); colours.set(key, c); }
			ctx!.fillStyle = c;
			ctx!.fillRect(x, y, 1, 1);
		}
	}
	frame = requestAnimationFrame(draw);
	return () => cancelAnimationFrame(frame);
}

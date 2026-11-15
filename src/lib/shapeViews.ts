// src/lib/shapeViews.ts
// The pictures on the Envelope, Pitch, Filter, FM and Unison cards (PR 77), and how a drag on
// one maps back to its settings. Pure, unit-tested; the cards (src/components/modules) and
// ShapePad.vue draw them as SVG in a w × h box.

export type Pt = [number, number];
export const toPath = (pts: readonly Pt[]) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── time, left to right ──
// On a square-root scale, so a 20 ms attack still shows beside a 2 s decay
export const timeX = (ms: number, w: number, maxMs: number) => Math.sqrt(clamp(ms, 0, maxMs) / maxMs) * w;
export const xTime = (x: number, w: number, maxMs: number) => Math.pow(clamp(x / w, 0, 1), 2) * maxMs;

// The amp envelope: up to full over Attack, then falling as the engines' decay does (time
// constant Decay / 4: about 2 % left after Decay)
export const ENV_MAX_MS = 2100;
export const ENV_TOP = 8; // room for the peak's grip
export function envelopePts(attackMs: number, decayMs: number, w: number, h: number): Pt[] {
	const top = ENV_TOP, base = h - 2;
	const pts: Pt[] = [[0, base], [timeX(attackMs, w, ENV_MAX_MS), top]];
	for (let i = 1; i <= 40; i++) {
		const t = (i / 40) * decayMs * 1.6;
		pts.push([timeX(attackMs + t, w, ENV_MAX_MS), base - (base - top) * Math.exp(-t / (decayMs / 4))]);
	}
	pts.push([w, base]);
	return pts;
}

// The pitch sweep: `semitones` (signed: above or below the note) away at the start, settling
// on the note (the middle line) with time constant Decay / 4
export const PITCH_MAX_MS = 2000;
export const PITCH_MAX_ST = 48;
export const pitchY = (semitones: number, h: number) => h / 2 - (clamp(semitones, -PITCH_MAX_ST, PITCH_MAX_ST) / PITCH_MAX_ST) * (h / 2 - 3);
export const yPitch = (y: number, h: number) => clamp(((h / 2 - y) / (h / 2 - 3)) * PITCH_MAX_ST, -PITCH_MAX_ST, PITCH_MAX_ST);
export function pitchPts(semitones: number, decayMs: number, w: number, h: number): Pt[] {
	const reach = h / 2 - pitchY(semitones, h);
	const pts: Pt[] = [];
	for (let i = 0; i <= 50; i++) {
		const x = (i / 50) * w;
		pts.push([x, h / 2 - reach * Math.exp(-xTime(x, w, PITCH_MAX_MS) / Math.max(1, decayMs / 4))]);
	}
	return pts;
}

// ── frequency, left to right (log, 20 Hz–20 kHz) ──
export const freqX = (hz: number, w: number) => (Math.log(clamp(hz, 20, 20000) / 20) / Math.log(1000)) * w;
export const xFreq = (x: number, w: number) => 20 * Math.pow(1000, clamp(x / w, 0, 1));

// A low-pass filter's response (2nd order, Q = resonance): flat at 42 % of the height, 30 dB
// from there to the top
export function filterY(hz: number, cutoff: number, resonance: number, h: number): number {
	const r = hz / cutoff, q = Math.max(0.3, resonance);
	const db = -10 * Math.log10(Math.pow(1 - r * r, 2) + Math.pow(r / q, 2));
	return clamp(h * 0.42 - (db / 30) * (h * 0.42 - 2), 2, h + 4);
}
export function filterPts(cutoff: number, resonance: number, w: number, h: number): Pt[] {
	const pts: Pt[] = [];
	for (let i = 0; i <= 80; i++) {
		const x = (i / 80) * w;
		pts.push([x, filterY(xFreq(x, w), cutoff, resonance, h)]);
	}
	return pts;
}
// Dragging the filter's point up and down: the resonance, log over its range, the top 55 % of
// the box
export const yResonance = (y: number, h: number, min: number, max: number) => min * Math.pow(max / min, clamp(1 - y / (h * 0.55), 0, 1));

// ── FM and Unison ──
// The carrier bent by the modulator: two cycles, the modulator `ratio` times as fast, `amount`
// (the card's Amount, 0–50) deep
export function fmPts(ratio: number, amount: number, w: number, h: number): Pt[] {
	const depth = Math.min(7, Math.max(0, amount) / 4);
	const pts: Pt[] = [];
	for (let i = 0; i <= 240; i++) {
		const p = (i / 240) * 2 * Math.PI * 2;
		pts.push([(i / 240) * w, h / 2 - Math.sin(p + depth * Math.sin(p * ratio)) * (h / 2 - 7)]);
	}
	return pts;
}
// Each unison voice as a sine a little off the others (Detune), so they drift apart to the right
export function voicePts(voices: number, detune: number, w: number, h: number): Pt[][] {
	const n = Math.max(1, Math.round(voices));
	return Array.from({ length: n }, (_, v) => {
		const off = n === 1 ? 0 : (v / (n - 1) - 0.5) * 2;
		const pts: Pt[] = [];
		for (let i = 0; i <= 120; i++) {
			const p = (i / 120) * 2 * Math.PI * 2.5 * (1 + off * (clamp(detune, 0, 100) / 100) * 0.22);
			pts.push([(i / 120) * w, (h - 10) / 2 - Math.sin(p) * ((h - 10) / 2 - 6)]);
		}
		return pts;
	});
}
// Where the voices sit between left and right (Spread, 0–100 %): the dots under the waves
export function voiceDots(voices: number, spread: number, w: number): number[] {
	const n = Math.max(1, Math.round(voices));
	return Array.from({ length: n }, (_, v) => w / 2 + (n === 1 ? 0 : v / (n - 1) - 0.5) * (w - 16) * (clamp(spread, 0, 100) / 100));
}

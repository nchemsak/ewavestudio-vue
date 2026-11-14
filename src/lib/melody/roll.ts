// src/lib/melody/roll.ts
// What the Melody Maker's screen draws (PR 76): the pattern as notes across the bar, and what
// Generate would do. Pure, unit-tested; MelodyMaker.vue turns it into SVG.

export type RollNote = { i: number; hz: number };

// A pitch's height on the screen: log in Hz, `lo` at the bottom edge of the drawing area
// (height − bottom), `hi` at its top (top); pitches outside are held at the edges
export function rollY(hz: number, lo: number, hi: number, height: number, top = 16, bottom = 10): number {
	const t = Math.min(1, Math.max(0, Math.log(hz / lo) / Math.log(hi / lo)));
	return top + (1 - t) * (height - top - bottom);
}

// Every octave of the key's root (a pitch class, 0 = C) between lo and hi, in Hz: the
// screen's guide lines
export function rootOctavesHz(rootSemitone: number, lo: number, hi: number): number[] {
	const out: number[] = [];
	for (let m = 12 + (((rootSemitone % 12) + 12) % 12); m < 128; m += 12) {
		const hz = 440 * Math.pow(2, (m - 69) / 12);
		if (hz >= lo && hz <= hi) out.push(hz);
	}
	return out;
}

// The steps that are on, with their pitches
export function rollNotes(freqs: readonly number[], steps: readonly boolean[]): RollNote[] {
	return freqs.map((hz, i) => ({ i, hz })).filter((n) => !!steps[n.i]);
}

// The notes Generate would write that the pattern doesn't already have: a step that's off
// now, or on at another pitch (more than 5 cents away). Nothing left means nothing would change.
export function ghostNotes(now: readonly RollNote[], next: readonly RollNote[]): RollNote[] {
	const cents = (a: number, b: number) => Math.abs(1200 * Math.log2(a / b));
	return next.filter((g) => !now.some((n) => n.i === g.i && cents(n.hz, g.hz) <= 5));
}

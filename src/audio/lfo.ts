// src/audio/lfo.ts
// The LFO's parts shared by the live engine (liveEngine.ts) and the export engine
// (export/scheduleStepSequencer.ts): its targets, a note's own LFO for Retrigger, and how
// deep the Level and FM targets go. Pitch, Filter and Pulse have their own helpers
// (lfoFilterTapGain in synthHelpers.ts, lfoPwmTapGain in waves.ts).
//
// Both engines make the LFO's output a gain node whose value is the LFO's wave (−1..1) times
// the Depth knob's value, in the target's units (cents, Hz, % width, % level, % FM). Each note
// connects a "tap" from it to what it moves, scaled for that target.

export type LfoTarget = 'pitch' | 'filter' | 'pwm' | 'amp' | 'fm';
export const LFO_TARGETS: readonly LfoTarget[] = ['pitch', 'filter', 'pwm', 'amp', 'fm'];
export const isLfoTarget = (v: unknown): v is LfoTarget => LFO_TARGETS.includes(v as LfoTarget);

export type LfoWave = 'sine' | 'square';

// The Rate knob's divisions, slowest to fastest, always locked to the tempo (the free rate in
// Hz went in PR 66): 4 and 2 bars, a bar, then note values down to a 64th
export const LFO_DIVISIONS: readonly string[] = ['4/1', '2/1', '1/1', '1/2', '1/4', '1/8.', '1/8', '1/8T', '1/16', '1/32', '1/64'];
export const isLfoDivision = (v: unknown): v is string => LFO_DIVISIONS.includes(v as string);

// What the Rate knob shows: "4 bars", "2 bars", "1 bar", else the division ("1/8T")
export function lfoDivisionLabel(div: string): string {
	if (div === '4/1') return '4 bars';
	if (div === '2/1') return '2 bars';
	if (div === '1/1') return '1 bar';
	return div;
}

// Depth knob range per target (the knob's max; 0 is off)
export const LFO_DEPTH_MAX: Record<LfoTarget, number> = {
	pitch: 1200,  // cents
	filter: 5000, // Hz
	pwm: 45,      // % of the pulse's width
	amp: 100,     // % of the note's level (tremolo)
	fm: 100,      // % of the FM card's Amount
};

// Depth for a target the first time it's picked (each target then remembers its own:
// chooseLfoTarget in DrumSequencer.vue): a little of each, so a new target sounds like the LFO is on, never 0
export const LFO_DEFAULT_DEPTH: Record<LfoTarget, number> = {
	pitch: 25,    // cents: a gentle vibrato
	filter: 1500, // Hz
	pwm: 15,      // % width
	amp: 40,      // % level
	fm: 40,       // % FM
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// Each target's remembered depth, from a saved project's `depths` (anything missing or out
// of range: the default; values are clamped to the target's Depth range)
export function lfoDepthsFrom(saved: unknown): Record<LfoTarget, number> {
	const out = { ...LFO_DEFAULT_DEPTH };
	if (!saved || typeof saved !== 'object') return out;
	for (const t of LFO_TARGETS) {
		const v = (saved as Record<string, unknown>)[t];
		if (typeof v === 'number' && Number.isFinite(v)) out[t] = clamp(v, 0, LFO_DEPTH_MAX[t]);
	}
	return out;
}

// Retrigger: a note's own LFO, starting at the note's start, so every note gets the same
// movement (the shared LFO runs freely, so each note hears whichever part of it comes along).
// The returned gain carries the wave times `depth`, like the shared LFO's. It stops with the note.
export function startNoteLfo(ctx: BaseAudioContext, wave: LfoWave, hz: number, depth: number, start: number, end: number): GainNode {
	// Rate and depth set as plain values, not scheduled at `start`: Chrome applies an event
	// scheduled for a start partway through a 128-sample block a little late, so the wave began
	// at the default 440 Hz and each note's LFO started somewhere else (a browser test caught it)
	const osc = ctx.createOscillator();
	osc.type = wave;
	osc.frequency.value = Math.max(0.01, hz);
	const out = ctx.createGain();
	out.gain.value = depth;
	osc.connect(out);
	osc.start(start);
	osc.stop(end + 0.05);
	osc.addEventListener('ended', () => { osc.disconnect(); out.disconnect(); });
	return out;
}

// Level (tremolo): the note's level swings between full and (100 − depth) %. The tremolo gain
// sits at the middle of that swing, and the tap adds ±depth/2 % from the LFO.
export const lfoAmpBase = (depthPct: number) => 1 - clamp(depthPct, 0, 100) / 200;
export const LFO_AMP_TAP = 1 / 200; // × the LFO's output (wave × depth %)

// FM: the FM card's Amount (the modulator's deviation, Hz) swings by ±depth %, so at 100 % it
// goes from nothing to twice the card's setting.
export const lfoFmTapGain = (deviationHz: number) => Math.max(0, deviationHz) / 100;

// Where an oscillator of this wave and rate is `t` seconds after it started (−1..1), as Web
// Audio's own oscillators run: a sine starts at 0 rising; a square is high for the first half
// of each cycle. For the LFO visualizer while Retrigger is on (each note's LFO starts afresh).
export function lfoWaveAt(wave: LfoWave, hz: number, t: number): number {
	const phase = ((hz * Math.max(0, t)) % 1 + 1) % 1;
	if (wave === 'square') return phase < 0.5 ? 1 : -1;
	return Math.sin(2 * Math.PI * phase);
}

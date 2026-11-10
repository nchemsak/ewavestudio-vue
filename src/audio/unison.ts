// src/audio/unison.ts
// Unison: how many voices a note has, and where in its wave each one starts. Shared by the
// live engine (liveEngine.ts) and the export engine (export/scheduleStepSequencer.ts).
//
// - Voices 2–4. One voice with unison on sounded the same as unison off, and more than four
//   measured narrower, not wider (each voice gets 1/N of the level, so the side voices'
//   share shrinks). A project saved with 1 voice opens with unison off, 5 or 6 as 4
//   (applySnapshot in src/lib/project/snapshot.ts).
// - Each voice starts at its own point of its cycle (UNISON_PHASE_SPREAD, see waves.ts's
//   `phase`). Started in step, the voices only drift apart as the detune builds up, so a short
//   hit's loud start was nearly mono whatever Spread was: an exported hit at 100 % spread had
//   side/mid 0.20 in its first 50 ms, 1.6 only after 150 ms. The centre voice (odd counts)
//   stays at 0; the outer ones go furthest, the same way on each side as their detune and pan.

export const UNISON_VOICES_MIN = 2;
export const UNISON_VOICES_MAX = 4;
export const UNISON_VOICES_DEFAULT = 3;
export const UNISON_DETUNE_DEFAULT = 12; // cents, a notch on the Detune knob
// Full width: since the voices start apart (below), 100 % is wide from a hit's start; it was
// 50 before PR 52. Presets set their own.
export const UNISON_SPREAD_DEFAULT = 100;

// At full Spread, the outer voices start this far (in cycles) from the centre, either way;
// less Spread, less (at 0 the voices start in step, as before, so a centred sound is
// unchanged). Measured on exported hits (sine, saw, square; 2–4 voices; 12 cents; 100 %):
// side/mid in the first 50 ms went from 0.16–0.61 to about 0.5–1.3 at 0.1 cycles, for under
// 1 dB of level. Further was worse: at 0.2, two voices nearly cancel when the sound is summed
// to mono (side/mid 11), and a sine lost 2.5 dB.
export const UNISON_PHASE_SPREAD = 0.12;
export const UNISON_PHASE_STEP = 0.02;

// A voice count kept to 2–4
export function clampUnisonVoices(n: number): number {
	if (!Number.isFinite(n)) return UNISON_VOICES_DEFAULT;
	return Math.max(UNISON_VOICES_MIN, Math.min(UNISON_VOICES_MAX, Math.round(n)));
}

// Where voice i of n sits, −1 (left, lowest) … 1 (right, highest); 0 for a single voice
export function unisonPosition(i: number, n: number): number {
	return n <= 1 ? 0 : (i / (n - 1)) * 2 - 1;
}

// The point of its cycle voice i of n starts at, in cycles, at Spread `spreadPct` (0–100)
export function unisonPhase(i: number, n: number, spreadPct: number): number {
	if (n <= 1) return 0;
	const spread = Math.max(0, Math.min(100, Number.isFinite(spreadPct) ? spreadPct : 0)) / 100;
	// Rounded to steps of 0.02 cycles, so a few phases cover every setting (waves.ts builds and
	// keeps one wave per phase): at most six either way
	const steps = Math.round((unisonPosition(i, n) * UNISON_PHASE_SPREAD * spread) / UNISON_PHASE_STEP);
	return Number((steps * UNISON_PHASE_STEP).toFixed(4)) || 0; // no −0
}

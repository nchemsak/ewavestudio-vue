// src/audio/filterEnv.ts
// Filter envelope, shared by the live engine (liveEngine.ts) and the WAV export engine
// (export/scheduleStepSequencer.ts). Like DFAM's VCF decay: each note's cutoff starts
// `octaves` above (or, below zero, below) the Cutoff knob and returns to it within Decay. Like
// the pitch envelope (pitchEnv.ts), it's an exponentially decaying offset, here in cents on
// the filter's `detune` (which multiplies its frequency), so the sweep moves the same number
// of octaves per moment wherever the cutoff is. The LFO's filter tap moves `frequency` and
// adds on top.

import { pitchEnvTimeConstant } from './pitchEnv';

export const FILTER_ENV_OCTAVES = 5; // the Env Amt knob's range: ±5 octaves

/**
 * Set a note's filter sweep.
 * @param filter - the note's (voice's) BiquadFilterNode, its frequency already set
 * @param startTime - AudioContext time the note starts
 * @param octaves - Env Amt: how far the cutoff starts from the knob (0: no sweep)
 * @param decay - Decay in seconds: by then the offset is down to about 2%
 */
export function applyFilterEnv(filter: BiquadFilterNode, startTime: number, octaves: number, decay: number) {
    const cents = Math.max(-FILTER_ENV_OCTAVES, Math.min(FILTER_ENV_OCTAVES, octaves || 0)) * 1200;
    filter.detune.setValueAtTime(cents, startTime);
    if (cents) filter.detune.setTargetAtTime(0, startTime, pitchEnvTimeConstant(decay));
}

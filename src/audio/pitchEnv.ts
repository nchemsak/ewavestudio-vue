// src/audio/pitchEnv.ts
// Pitch envelope, shared by the live engine (liveEngine.ts) and the WAV export engine
// (export/scheduleStepSequencer.ts).
//
// A drum-style sweep: the note starts `semitones` above (or below) its pitch and falls back
// fast, then settles, the way an analog decay envelope into an exponential oscillator does
// (DFAM's VCO decay). The offset is in cents on the oscillator's `detune`, decaying
// exponentially: offset(t) = start · e^(−t/τ). A glide of the frequency itself
// (exponentialRampToValueAtTime) moves by the same number of semitones every millisecond,
// which sounds like a laser or siren slide instead.
//
// `detune` also carries the unison detune (the value the sweep settles to) and the LFO's
// pitch tap (connected to it, so added on top).

export type PitchEnvMode = 'up' | 'down' | 'random';

export interface PitchEnvOptions {
    enabled: boolean;
    semitones: number;
    mode: PitchEnvMode;
    decay: number; // seconds: by then the offset is down to about 2% (four time constants)
}

export const MIN_PITCH_ENV_DECAY_S = 0.005;
// Time constants per Decay: after Decay the offset is e^−4 ≈ 1.8% of where it started
export const TIME_CONSTANTS_PER_DECAY = 4;

// The note's starting offset in cents. Call once per note, so every unison voice of a note
// sweeps together (with 'random', each note gets its own offset).
export function pitchEnvStartCents(options: PitchEnvOptions, random: () => number = Math.random): number {
    const { enabled, semitones, mode } = options;
    if (!enabled || !(semitones > 0)) return 0;
    if (mode === 'down') return -semitones * 100;
    if (mode === 'random') return (random() * 2 - 1) * semitones * 100;
    return semitones * 100;
}

// The time constant (seconds) of the sweep for a Decay in seconds
export function pitchEnvTimeConstant(decay: number): number {
    return Math.max(MIN_PITCH_ENV_DECAY_S, decay) / TIME_CONSTANTS_PER_DECAY;
}

/**
 * Set an oscillator's pitch for one note: its frequency, and its detune with the sweep.
 * @param osc - the note's oscillator (one unison voice)
 * @param baseFreq - the note's pitch in Hz
 * @param startTime - AudioContext time the note starts
 * @param startCents - the sweep's starting offset, from pitchEnvStartCents() (0: no sweep)
 * @param decay - the envelope's Decay in seconds
 * @param baseDetuneCents - the voice's own detune (unison), where the sweep settles
 */
export function applyPitchEnv(
    osc: OscillatorNode,
    baseFreq: number,
    startTime: number,
    startCents: number,
    decay: number,
    baseDetuneCents = 0
) {
    osc.frequency.setValueAtTime(baseFreq, startTime);
    if (!startCents) {
        osc.detune.setValueAtTime(baseDetuneCents, startTime);
        return;
    }
    osc.detune.setValueAtTime(baseDetuneCents + startCents, startTime);
    osc.detune.setTargetAtTime(baseDetuneCents, startTime, pitchEnvTimeConstant(decay));
}

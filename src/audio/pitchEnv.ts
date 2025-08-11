// src/audio/pitchEnv.ts
export interface PitchEnvOptions {
    enabled: boolean
    semitones: number
    mode: 'up' | 'down' | 'random'
    decay: number // in seconds
}

/**
 * Apply a pitch envelope to an oscillator.
 * @param osc - OscillatorNode to modify.
 * @param baseFreq - Base frequency in Hz.
 * @param startTime - AudioContext time to start envelope.
 * @param options - PitchEnvOptions object.
 */
export function applyPitchEnv(
    osc: OscillatorNode,
    baseFreq: number,
    startTime: number,
    options: PitchEnvOptions
) {
    const { enabled, semitones, mode, decay } = options

    if (!enabled || semitones === 0) {
        osc.frequency.setValueAtTime(baseFreq, startTime)
        return
    }

    let actualOffset = semitones
    if (mode === 'down') actualOffset = -semitones
    else if (mode === 'random') {
        actualOffset = (Math.random() * 2 - 1) * semitones
    }

    const ratio = Math.pow(2, actualOffset / 12)
    const startFreq = baseFreq * ratio

    // Start at offset pitch
    osc.frequency.setValueAtTime(startFreq, startTime)

    // Ramp back to base pitch
    osc.frequency.exponentialRampToValueAtTime(
        baseFreq,
        startTime + Math.max(decay, 0.001)
    )
}

export interface FMOptions {
    enabled: boolean
    modFreqHz: number    // used when ratio === null
    index: number        // modulation index I; deviation Δf = I * f_mod
    ratio: number | null // if set, modFreq = baseFreq * ratio
}

/**
 * Creates an FM modulator that drives carrier.frequency.
 * Returns a stop() handle so you can end it with the voice.
 */
export function startFM(
    ctx: AudioContext,
    carrier: OscillatorNode,
    baseFreq: number,
    startTime: number,
    { enabled, modFreqHz, index, ratio }: FMOptions
) {
    if (!enabled || index <= 0) return null

    const modOsc = ctx.createOscillator()
    const modGain = ctx.createGain()

    const fMod = ratio ? baseFreq * ratio : modFreqHz
    modOsc.type = 'sine'
    modOsc.frequency.setValueAtTime(Math.max(0.1, fMod), startTime)

    // Δf = I * f_mod → gain in Hz
    const deviation = Math.max(0, index * fMod)
    modGain.gain.setValueAtTime(deviation, startTime)

    modOsc.connect(modGain).connect(carrier.frequency)
    modOsc.start(startTime)

    return {
        stop: (when: number) => {
            try { modOsc.stop(when) } catch { }
        }
    }
}

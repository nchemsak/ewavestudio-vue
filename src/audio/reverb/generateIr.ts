// src/audio/reverb/generateIr.ts
// Deterministic, file-free plate/room IR generator.
// Use the same function in live AudioContext and OfflineAudioContext.

export type ReverbType = 'plate' | 'room';

export interface ReverbIrOptions {
    decaySeconds: number;      // 0.2..4.0
    type?: ReverbType;         // 'plate' | 'room'
    sampleRate?: number;       // defaults to ctx.sampleRate
    stereo?: boolean;          // default true
    seed?: number;             // deterministic decorrelation seed
}

export function generateReverbIR(
    ctx: BaseAudioContext,
    opts: ReverbIrOptions
): AudioBuffer {
    const sr = Math.max(3000, Math.min(192000, opts.sampleRate || ctx.sampleRate || 48000));
    const decay = Math.max(0.1, Math.min(8.0, opts.decaySeconds));
    const type = opts.type || 'plate';
    const stereo = opts.stereo ?? true;
    const seedBase = (opts.seed ?? 1337) | 0;

    // Length: cap ~ 3.5 * decay but <= 4 s for sanity
    const maxLenSec = Math.min(4.0, Math.max(0.6, decay * 3.5));
    const length = Math.max(1, Math.floor(maxLenSec * sr));
    const ch = stereo ? 2 : 1;

    const buffer = ctx.createBuffer(ch, length, sr);

    // Simple xorshift-ish PRNG for determinism
    const makeRng = (s: number) => () => {
        s |= 0; s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        return ((s >>> 0) / 4294967296) * 2 - 1; // -1..+1
    };

    // Early reflection taps (very lightweight) differ by type
    const earlyTapsMs =
        type === 'plate'
            ? [1.2, 3.7, 5.1, 8.3, 12.7]            // sparse, bright
            : [2.0, 4.2, 6.4, 9.0, 11.0, 15.0];     // a touch more "roomy"

    const earlyGainScale = type === 'plate' ? 0.5 : 0.6;

    // High-frequency damping profile per sample (plate brighter than room)
    const hfDamp = (n: number) => {
        const t = n / length; // 0..1
        const base = type === 'plate' ? 0.96 : 0.90; // 1 => no damping
        return Math.pow(base, t * 12000 / (sr / 2)); // crude psychoacoustic rolloff
    };

    // Exponential amplitude envelope (target ~ -60 dB near "decay" seconds)
    // A(t) ~ exp(-t / tau), choose tau so that at t=decay, amplitude ~ 0.001
    const tau = decay / Math.log(1000);

    for (let chIdx = 0; chIdx < ch; chIdx++) {
        const data = buffer.getChannelData(chIdx);
        const rng = makeRng(seedBase + (chIdx + 1) * 0x9e3779b9);

        // Fill with exponentially decaying, gently HF-damped noise
        let prev = 0;
        for (let i = 0; i < length; i++) {
            const t = i / sr;
            const env = Math.exp(-t / tau);

            // Light one-pole LP (noise smoothing) for cohesion
            const white = rng();
            const smooth = prev + 0.12 * (white - prev); // ~2 kHz-ish at 48k
            prev = smooth;

            // Decorrelate channels with tiny random allpass-ish wobble
            const wobble = 1 + 0.0008 * Math.sin((i + chIdx * 97) * 0.021) + 0.0006 * Math.cos((i * 0.013) + chIdx);

            data[i] = smooth * env * hfDamp(i) * wobble;
        }

        // Add a few very small early reflection spikes
        for (const ms of earlyTapsMs) {
            const idx = Math.floor((ms / 1000) * sr);
            if (idx >= 0 && idx < length) data[idx] += earlyGainScale * 0.2;
        }
    }

    // Normalize softly so swapping IRs mid-play is predictable
    softNormalize(buffer, 0.9);

    return buffer;
}

function softNormalize(buf: AudioBuffer, targetPeak = 0.9) {
    let peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    if (peak > 0 && peak > targetPeak) {
        const k = targetPeak / peak;
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < d.length; i++) d[i] *= k;
        }
    }
}

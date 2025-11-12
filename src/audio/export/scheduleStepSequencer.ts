// src/audio/export/scheduleStepSequencer.ts

import { applyPitchEnv } from "../pitchEnv";
import { startFM } from "../fm";

export type StepSequencerState = {
  bpm: number;
  stepsCount: 16; // locked to 16
  swing: number;
  masterVolume: number;
  channelVolume: number;

  pattern: {
    active: boolean[];
    velocities: number[];
    pitches: number[];
    waveforms: OscillatorType[];
  };

  synth: {
    envelope: { enabled: boolean; attackMs: number; decayMs: number; };
    filter: { enabled: boolean; cutoff: number; resonance: number; };

    noise: {
      enabled: boolean;
      color?: number;
      type?: "white" | "pink" | "brown" | "blue" | "violet";
      amount: number;
      mask?: boolean[];
      attackBurst?: boolean;
      burstMs?: number;
    };

    unison: { enabled: boolean; voices: number; detuneCents: number; stereoSpread: number; };

    lfo: {
      enabled: boolean;
      target: "pitch" | "gain" | "filter" | "pan" | "resonance";
      waveform: "sine" | "triangle" | "sawtooth" | "square" | "random";
      depth: number;
      rateHz: number;
      division: string;
      retrigger: boolean;
      bipolar: boolean;
    };

    fm: { enabled: boolean; modFreq: number; index: number; ratio: number | null; };
    pitchEnv: { enabled: boolean; semitones: number; decayMs: number; mode: "up" | "down" | "random"; };
  };

  fx: {
    delay: {
      enabled: boolean; sync: boolean; time: number; feedback: number; mix: number;
      toneEnabled: boolean; toneHz: number; toneType: "lowpass" | "highpass"
    };
    drive: { enabled: boolean; type: "overdrive" | "distortion"; amount: number; tone: number; mix: number };
  };

  sampleRate: number;
  tailSeconds: number;
};

function stepDurationSeconds(bpm: number) {
  // 1/16th
  return (60 / bpm) / 4;
}

function generateDriveCurve(type: "overdrive" | "distortion", amount = 0.5) {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;

  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1;
    switch (type) {
      case "distortion":
        curve[i] = (3 + amount * 30) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
        break;
      case "overdrive":
      default:
        curve[i] = Math.tanh(x * (1 + amount * 25));
        break;
    }
  }
  return curve;
}

function createAllNoiseBuffers(ctx: BaseAudioContext) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 2)); // 2s
  const mk = () => ctx.createBuffer(1, length, ctx.sampleRate);

  // Base white
  const white = mk();
  const wd = white.getChannelData(0);
  for (let i = 0; i < length; i++) wd[i] = Math.random() * 2 - 1;

  // Pink (~ -3 dB/oct)
  const pink = mk();
  const pd = pink.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = wd[i];
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    pd[i] = b0 + b1 + b2 + b3 + b4 + b5 + (w * 0.5362);
    b6 = w * 0.115926;
  }
  normalize(pd);

  // Brown (~ -6 dB/oct) — integrated white
  const brown = mk();
  const bd = brown.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < length; i++) {
    const w = wd[i];
    lastOut = (lastOut + (0.02 * w)) / 1.02;
    bd[i] = lastOut * 3.5;
  }
  normalize(bd);

  // Blue (~ +3 dB/oct) — first difference of white
  const blue = mk();
  const bud = blue.getChannelData(0);
  let prev = 0;
  for (let i = 0; i < length; i++) {
    const x = wd[i] - prev;
    prev = wd[i];
    bud[i] = x;
  }
  normalize(bud);

  // Violet (~ +6 dB/oct) — second difference of white
  const violet = mk();
  const vd = violet.getChannelData(0);
  let prev1 = 0, prev2 = 0;
  for (let i = 0; i < length; i++) {
    const d1 = wd[i] - prev1; prev1 = wd[i];
    const d2 = d1 - prev2; prev2 = d1;
    vd[i] = d2;
  }
  normalize(vd);

  return { white, pink, brown, blue, violet } as const;
}

function normalize(buf: Float32Array) {
  let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] /= m;
}

function normIndex(i: number, n: number) {
  return n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // [-1..+1]
}

type NoiseKey = "brown" | "pink" | "white" | "blue" | "violet";
const NOISE_STOPS: { key: NoiseKey; pos: number }[] = [
  { key: "brown", pos: 0.00 },
  { key: "pink", pos: 0.25 },
  { key: "white", pos: 0.50 },
  { key: "blue", pos: 0.75 },
  { key: "violet", pos: 1.00 },
];

// Waveform loudness compensation for offline export
// square: −6 dB, sawtooth: −2 dB, sine/triangle: 0 dB
function waveformGain(type: OscillatorType): number {
  switch (type) {
    case "square": return 0.5011872336;
    case "sawtooth": return 0.7079457844;
    case "triangle":
    case "sine":
    default: return 1.0;
  }
}

// --- NEW: array coercion helpers to guarantee 16 steps ---
function coerceTo16<T>(arr: T[] | undefined, fill: T): T[] {
  if (!Array.isArray(arr)) return Array(16).fill(fill);
  if (arr.length === 16) return arr.slice();
  return arr.length > 16 ? arr.slice(0, 16) : arr.concat(Array(16 - arr.length).fill(fill));
}

export function scheduleStepSequencer(ctx: BaseAudioContext, incoming: StepSequencerState, t0 = 0): void {
  // Lock to 16 steps and sanitize arrays
  const STEPS = 16 as const;
  const state: StepSequencerState = {
    ...incoming,
    stepsCount: 16,
    pattern: {
      active: coerceTo16(incoming.pattern.active, false),
      velocities: coerceTo16(incoming.pattern.velocities, 1),
      pitches: coerceTo16(incoming.pattern.pitches, 220),
      waveforms: coerceTo16<OscillatorType>(incoming.pattern.waveforms, "sine"),
    },
    synth: {
      ...incoming.synth,
      noise: {
        ...incoming.synth.noise,
        mask: coerceTo16(incoming.synth.noise.mask, true),
      },
    },
  };

  const stepDur = stepDurationSeconds(state.bpm);
  const bars = 1; // 16 steps * 1/16 = 1 bar
  const patternDuration = bars * (60 / state.bpm) * 4;
  const tEnd = t0 + patternDuration + state.tailSeconds;

  // Master gain
  const master = ctx.createGain();
  master.gain.setValueAtTime(Math.max(0, Math.min(1, state.masterVolume)), t0);
  (master as any).connect((ctx as any).destination ?? (ctx as OfflineAudioContext).destination);

  // Drive & Delay chain
  // Drive
  const driveShaper = ctx.createWaveShaper();
  driveShaper.curve = generateDriveCurve(state.fx.drive.type, state.fx.drive.amount);
  (driveShaper as any).oversample = "2x";

  const driveTone = ctx.createBiquadFilter(); driveTone.type = "lowpass";
  driveTone.frequency.setValueAtTime(state.fx.drive.tone, t0);

  const driveMakeup = ctx.createGain();
  driveMakeup.gain.setValueAtTime(1 + state.fx.drive.amount * 0.1, t0);

  const driveDry = ctx.createGain(); driveDry.gain.setValueAtTime(state.fx.drive.enabled ? (1 - state.fx.drive.mix) : 1, t0);
  const driveWet = ctx.createGain(); driveWet.gain.setValueAtTime(state.fx.drive.enabled ? state.fx.drive.mix : 0, t0);
  const driveSum = ctx.createGain();

  // Wire drive internals
  driveShaper.connect(driveTone).connect(driveMakeup).connect(driveWet);
  driveDry.connect(driveSum);
  driveWet.connect(driveSum);

  // Delay
  const delayNode = ctx.createDelay(5.0);
  delayNode.delayTime.setValueAtTime(state.fx.delay.time, t0);

  const feedbackGain = ctx.createGain();
  feedbackGain.gain.setValueAtTime(state.fx.delay.feedback, t0);

  const fbTone = ctx.createBiquadFilter();
  fbTone.type = state.fx.delay.toneEnabled ? state.fx.delay.toneType : "allpass";
  fbTone.frequency.setValueAtTime(state.fx.delay.toneEnabled ? state.fx.delay.toneHz : 20000, t0);

  const wetTone = ctx.createBiquadFilter();
  wetTone.type = state.fx.delay.toneEnabled ? state.fx.delay.toneType : "allpass";
  wetTone.frequency.setValueAtTime(state.fx.delay.toneEnabled ? state.fx.delay.toneHz : 20000, t0);

  const delayWet = ctx.createGain();
  const delayDry = ctx.createGain();
  if (state.fx.delay.enabled) {
    delayWet.gain.setValueAtTime(state.fx.delay.mix, t0);
    delayDry.gain.setValueAtTime(1 - state.fx.delay.mix, t0);
  } else {
    delayWet.gain.setValueAtTime(0, t0);
    delayDry.gain.setValueAtTime(1, t0);
  }

  // Feedback loop
  delayNode.connect(fbTone).connect(feedbackGain).connect(delayNode);

  // Wet path
  delayNode.connect(wetTone).connect(delayWet);

  // Drive bus → Delay split
  driveSum.connect(delayDry);
  driveSum.connect(delayNode);

  // To master
  delayDry.connect(master);
  delayWet.connect(master);

  // Shared bus that notes feed into (pre-drive)
  const busIn = ctx.createGain();
  // If drive disabled, go straight to driveSum (which will pass mostly dry)
  busIn.connect(driveDry);
  busIn.connect(driveShaper);

  // LFO (shared)
  const lfo = {
    enabled: state.synth.lfo.enabled,
    osc: null as OscillatorNode | null,
    gain: null as GainNode | null,
    uni: null as GainNode | null
  };

  if (state.synth.lfo.enabled) {
    const wf = state.synth.lfo.waveform === "random" ? "triangle" : state.synth.lfo.waveform;
    const osc = ctx.createOscillator();
    osc.type = wf as OscillatorType;
    osc.frequency.setValueAtTime(Math.max(0.01, state.synth.lfo.rateHz || 1), t0);

    const g = ctx.createGain(); // raw bipolar scaler
    g.gain.setValueAtTime(1, t0);

    osc.connect(g);
    (osc as any).start?.(t0);
    (osc as any).stop?.(tEnd + 0.05);

    lfo.osc = osc;
    lfo.gain = g;

    // Unipolar (0..1) branch for tremolo
    const half = ctx.createGain(); half.gain.setValueAtTime(0.5, t0);
    const uni = ctx.createGain();
    const offset = (ctx as any).createConstantSource ? (ctx as any).createConstantSource() : null;
    if (offset) {
      offset.offset.setValueAtTime(0.5, t0);
      g.connect(half).connect(uni);
      offset.connect(uni);
      (offset as any).start?.(t0);
      (offset as any).stop?.(tEnd + 0.05);
      lfo.uni = uni;
    }
  }

  // Noise buffers
  const noiseBufs = createAllNoiseBuffers(ctx);
  const BURST_MAX_MS = 250; // keep in sync with UI

  // Precompute mask with sane default (already coerced; keep fallback for safety)
  const mask =
    Array.isArray(state.synth.noise.mask) && state.synth.noise.mask.length
      ? state.synth.noise.mask
      : Array(STEPS).fill(true);

  // Schedule all steps
  const voices = Math.max(1, Math.min(6, state.synth.unison.enabled ? state.synth.unison.voices : 1));
  const detuneStep = state.synth.unison.enabled ? state.synth.unison.detuneCents : 0;
  const spreadPct = state.synth.unison.enabled ? state.synth.unison.stereoSpread : 0;

  for (let step = 0; step < STEPS; step++) {
    const isOn = !!(state.pattern.active[step]);
    if (!isOn) continue;

    const isEven = (step % 2) === 1;
    const swingOffset = isEven ? stepDur * state.swing : 0;
    const tOn = t0 + step * stepDur + swingOffset;

    const vel = state.pattern.velocities[step] ?? 1;
    const pitchHz = state.pattern.pitches[step] ?? 220;
    const wave = state.pattern.waveforms[step] ?? "sine";

    const attack = Math.max(0.001, state.synth.envelope.attackMs / 1000);
    const decay = Math.max(0.01, state.synth.envelope.decayMs / 1000);
    const attackEnd = tOn + attack;
    const naturalEnd = attackEnd + decay;

    const wfComp = waveformGain(wave);
    const safeOscGain = Math.max(0.0001, Math.min(1, vel * state.channelVolume * wfComp));

    const noteEnd = state.synth.envelope.enabled ? naturalEnd : (tOn + Math.max(0.02, state.synth.envelope.decayMs / 1000));

    // Sum of unison voices before AM LFO
    const oscEnvGain = ctx.createGain();
    // Single amplitude envelope
    if (state.synth.envelope.enabled) {
      oscEnvGain.gain.setValueAtTime(0.0001, tOn);
      oscEnvGain.gain.exponentialRampToValueAtTime(safeOscGain, attackEnd);
      oscEnvGain.gain.exponentialRampToValueAtTime(0.001, noteEnd);
    } else {
      oscEnvGain.gain.setValueAtTime(safeOscGain, tOn);
      oscEnvGain.gain.setTargetAtTime(0.0001, noteEnd - 0.01, 0.005);
    }

    // Build voices
    for (let i = 0; i < voices; i++) {
      const osc = ctx.createOscillator();
      osc.type = wave;

      // Pitch env
      applyPitchEnv(osc, pitchHz, tOn, {
        enabled: state.synth.pitchEnv.enabled,
        semitones: state.synth.pitchEnv.semitones,
        mode: state.synth.pitchEnv.mode,
        decay: state.synth.pitchEnv.decayMs / 1000
      });

      // FM
      const fmHandle = startFM(ctx as any, osc as any, pitchHz, tOn, {
        enabled: state.synth.fm.enabled,
        modFreqHz: state.synth.fm.modFreq,
        index: state.synth.fm.index,
        ratio: state.synth.fm.ratio
      });

      // Per-voice detune & pan
      const dNorm = normIndex(i, voices);
      const detuneC = dNorm * detuneStep;
      osc.detune.setValueAtTime(detuneC, tOn);

      // Filter
      const vFilter = ctx.createBiquadFilter();
      vFilter.type = "lowpass";
      if (state.synth.filter.enabled) {
        vFilter.frequency.setValueAtTime(state.synth.filter.cutoff, tOn);
        vFilter.Q.setValueAtTime(state.synth.filter.resonance, tOn);
      } else {
        vFilter.frequency.setValueAtTime(20000, tOn);
        vFilter.Q.setValueAtTime(0.0001, tOn);
      }

      const vGain = ctx.createGain(); vGain.gain.setValueAtTime(1 / voices, tOn);
      const panner = (ctx as any).createStereoPanner ? (ctx as any).createStereoPanner() : null;
      if (panner) (panner as StereoPannerNode).pan.setValueAtTime((dNorm * spreadPct) / 100, tOn);

      // LFO routing (shared osc/gain, per-voice taps)
      if (lfo.enabled && lfo.osc && lfo.gain) {
        if (state.synth.lfo.target === "pitch") {
          const tap = ctx.createGain(); tap.gain.setValueAtTime(state.synth.lfo.depth, tOn); // cents
          lfo.gain.connect(tap).connect(osc.detune);

        } else if (state.synth.lfo.target === "filter") {
          const f0 = state.synth.filter.enabled ? state.synth.filter.cutoff : 20000;
          const minHz = 30, maxHz = ctx.sampleRate * 0.45;
          const maxDepth = Math.max(0, Math.min(f0 - minHz, maxHz - f0));
          const scale = state.synth.lfo.depth > 0 ? Math.min(1, maxDepth / state.synth.lfo.depth) : 0;

          const tap = ctx.createGain(); tap.gain.setValueAtTime(scale, tOn);
          const ctrlLP = ctx.createBiquadFilter(); ctrlLP.type = "lowpass"; ctrlLP.frequency.setValueAtTime(120, tOn);
          lfo.gain.connect(tap).connect(ctrlLP).connect(vFilter.frequency);

        } else if (state.synth.lfo.target === "resonance") {
          const qBase = state.synth.filter.enabled ? state.synth.filter.resonance : 0.0001;
          const qMin = 0.0001, qMax = 20;
          const maxUp = qMax - qBase, maxDown = qBase - qMin;
          const maxSym = Math.max(0, Math.min(maxUp, maxDown));
          const qScale = state.synth.lfo.depth > 0 ? Math.min(1, maxSym / state.synth.lfo.depth) : 0;

          const tap = ctx.createGain(); tap.gain.setValueAtTime(qScale, tOn);
          const ctrlLP = ctx.createBiquadFilter(); ctrlLP.type = "lowpass"; ctrlLP.frequency.setValueAtTime(120, tOn);
          lfo.gain.connect(tap).connect(ctrlLP).connect(vFilter.Q);

        } else if (state.synth.lfo.target === "pan" && panner) {
          const tap = ctx.createGain(); tap.gain.setValueAtTime(state.synth.lfo.depth / 100, tOn); // percent→0..1
          lfo.gain.connect(tap).connect((panner as StereoPannerNode).pan);
        }
      }

      if (panner) {
        (osc as any).connect(vFilter).connect(vGain).connect(panner).connect(oscEnvGain);
      } else {
        (osc as any).connect(vFilter).connect(vGain).connect(oscEnvGain);
      }

      (osc as any).start?.(tOn);
      (osc as any).stop?.(noteEnd);
      if (fmHandle?.stop) fmHandle.stop(noteEnd);
    }

    // Amplitude LFO (tremolo) after env
    let postNode: AudioNode = oscEnvGain;
    if (lfo.enabled && lfo.uni && state.synth.lfo.target === "gain") {
      const trem = ctx.createGain(); trem.gain.setValueAtTime(1, tOn);
      const depth = Math.min(1, Math.max(0, state.synth.lfo.depth / 100)); // 0..1

      const scale = ctx.createGain(); scale.gain.setValueAtTime(depth, tOn);  // d * lfoUni
      lfo.uni.connect(scale);

      const base = (ctx as any).createConstantSource ? (ctx as any).createConstantSource() : null; // (1 - d)
      if (base) {
        base.offset.setValueAtTime(1 - depth, tOn);
        base.connect((trem as GainNode).gain);
        (scale as any).connect((trem as GainNode).gain);
        (base as any).start?.(tOn);
        (base as any).stop?.(noteEnd + 0.05);
      }

      (oscEnvGain as any).connect(trem);
      postNode = trem;
    }

    // Route to FX bus
    (postNode as any).connect(busIn);

    // Noise
    const noiseEnabled = !!state.synth.noise.enabled && state.synth.noise.amount > 0;
    const maskOn = !!mask[step];
    if (noiseEnabled && maskOn && vel > 0) {
      // Determine color crossfade from continuous color (preferred), else legacy type
      let wA = 1, wB = 0;
      let keyA: NoiseKey = "white", keyB: NoiseKey = "white";

      if (typeof state.synth.noise.color === "number") {
        const t = Math.max(0, Math.min(1, state.synth.noise.color));
        // find adjacent stops
        let lower = NOISE_STOPS[0], upper = NOISE_STOPS[NOISE_STOPS.length - 1];
        for (let i = 0; i < NOISE_STOPS.length - 1; i++) {
          const a = NOISE_STOPS[i], b = NOISE_STOPS[i + 1];
          if (t >= a.pos && t <= b.pos) { lower = a; upper = b; break; }
        }
        const span = Math.max(1e-6, upper.pos - lower.pos);
        const w = (t - lower.pos) / span;
        wA = 1 - w; wB = w;
        keyA = lower.key; keyB = upper.key;
      } else {
        // discrete/legacy
        const k = (state.synth.noise.type || "white") as NoiseKey;
        keyA = keyB = (["brown", "pink", "white", "blue", "violet"].includes(k) ? k : "white") as NoiseKey;
        wA = 1; wB = 0;
      }

      // Single mixed bus for the two sources
      const mix = ctx.createGain(); mix.gain.setValueAtTime(1, tOn);

      if (wA > 0.0001) {
        const sA = ctx.createBufferSource();
        sA.buffer = noiseBufs[keyA];
        const gA = ctx.createGain(); gA.gain.setValueAtTime(wA, tOn);
        sA.connect(gA).connect(mix);
        (sA as any).start?.(tOn);
        (sA as any).stop?.(noteEnd);
      }
      if (wB > 0.0001) {
        const sB = ctx.createBufferSource();
        sB.buffer = noiseBufs[keyB];
        const gB = ctx.createGain(); gB.gain.setValueAtTime(wB, tOn);
        sB.connect(gB).connect(mix);
        (sB as any).start?.(tOn);
        (sB as any).stop?.(noteEnd);
      }

      // Envelope (velocity-weighted amount; same as live)
      const nEnv = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(8000, tOn);
      noiseFilter.Q.setValueAtTime(1, tOn);

      // Blend = amount (0..1)
      const blend = Math.max(0, Math.min(1, state.synth.noise.amount));
      const safeNoiseGain = Math.max(0.0001, vel * blend);

      nEnv.gain.setValueAtTime(0.0001, tOn);
      nEnv.gain.exponentialRampToValueAtTime(safeNoiseGain, attackEnd);

      // Attack Burst
      const burstActive = !!state.synth.noise.attackBurst &&
        typeof state.synth.noise.burstMs === "number" &&
        state.synth.noise.burstMs < BURST_MAX_MS;

      const burstEnd = burstActive
        ? Math.min(noteEnd, attackEnd + Math.max(0.005, (state.synth.noise.burstMs || 80) / 1000))
        : noteEnd;

      nEnv.gain.exponentialRampToValueAtTime(0.001, burstEnd);
      nEnv.gain.setTargetAtTime(0.0001, burstEnd, 0.01);

      mix.connect(noiseFilter).connect(nEnv).connect(master);
    }
  }
}

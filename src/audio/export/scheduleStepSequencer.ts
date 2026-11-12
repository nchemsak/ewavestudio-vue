// src/audio/export/scheduleStepSequencer.ts
// Pure offline scheduler for the Step Sequencer synth.
// Rebuilds a minimal version of your live graph inside any BaseAudioContext.
//
// For the Export audio dialog (src/audio/export/exportFiles.ts) it plays the pattern `bars`
// times, can render one part of the mix on its own (`part`: the dry sound, the delay's echoes,
// the reverb, or the noise layer, which add up to the mix), and takes its random numbers
// (noise, the pitch envelope's random mode) from `random`, so every part of one export plays
// the same noise and the same random sweeps.

import { applyPitchEnv, pitchEnvStartCents } from "../pitchEnv";
import { lfoFilterTapGain } from "../synthHelpers";
import { applyFilterEnv } from "../filterEnv";
import { createVoiceSource, lfoPwmTapGain, waveGain, PULSE_WIDTH_DEFAULT } from "../waves";
import { routeVelocity, routedCutoff, routedSemitones, routedNoise, type VelocityRouting } from "../velocity";
import { startFM } from "../fm";
import { startNoteLfo, lfoAmpBase, LFO_AMP_TAP, lfoFmTapGain, type LfoTarget } from "../lfo";
import { generateReverbIR } from "../reverb/generateIr";
import { cutNoteEnd, ratchetHits, ratchetPitches, stepSpan } from "../ratchet";
import { createCrusher } from "../crusher";
import { createPingPong } from "../pingPong";
import { clampUnisonVoices, unisonPhase, unisonPosition } from "../unison";

export type StepSequencerState = {
	bpm: number;
	stepsCount: 16 | 32;
	swing: number;                // 0..0.5
	masterVolume: number;         // 0..1
	channelVolume: number;        // 0..1

	pattern: {
		active: boolean[];
		velocities: number[];        // 0..1
		pitches: number[];           // Hz
		waveforms: string[]; // per-step wave (waves.ts)
		ratchets?: number[]; // per step: 1 hit, or 2–4 quick hits (ratchet.ts)
		repeatNotes?: string[]; // per step: what the hits play, 'same' | 'up' | 'down' (ratchet.ts)
		repeatChord?: number[]; // the key's chord, pitch classes, which Up/Down step through
	};

	synth: {
		envelope: { enabled: boolean; attackMs: number; decayMs: number; };
		filter: { enabled: boolean; cutoff: number; resonance: number; envAmount?: number; envDecayMs?: number };

		noise: {
			enabled: boolean;
			color: number;             // 0..1 morph along Brown→Pink→White→Blue→Violet
			type?: "brown" | "pink" | "white" | "blue" | "violet" | string;
			amount: number;            // 0..1  (crossfade between tone & noise)
			mask: boolean[];
			attackBurst: boolean;
			burstMs: number;
		};

		unison: { enabled: boolean; voices: number; detuneCents: number; stereoSpread: number; };

		lfo: {
			enabled: boolean;
			target: LfoTarget;
			waveform: "sine" | "square";
			depth: number;       // in the target's units (lfo.ts): cents, Hz, % width, % level, % FM
			rateHz: number;      // resolved from sync/division in the UI
			division: string;
			retrigger: boolean; // each note starts the LFO afresh, as live (lfo.ts)
			bipolar: boolean;
		};

		fm: { enabled: boolean; modFreq: number; index: number; ratio: number | null; };

		pitchEnv: {
			enabled: boolean;
			semitones: number;
			decayMs: number;
			mode: "up" | "down" | "random";
		};

		pulse?: { width: number }; // the pulse wave's width, % (missing: 50)

		velocity?: VelocityRouting; // velocity routing amounts (missing: off)
	};

	fx: {
		delay: {
			enabled: boolean;
			sync: boolean;
			time: number;
			feedback: number;
			mix: number;
			toneEnabled: boolean;
			toneHz: number;
			toneType: "lowpass" | "highpass" | "allpass";
			pingPong?: boolean; // echoes alternate left and right (missing: off)
		};
		drive: {
			enabled: boolean;
			type: "overdrive" | string;
			amount: number;   // 0..1
			tone: number;     // Hz
			mix: number;      // 0..1
			crush?: boolean;  // bit crusher in the driven path (missing: off); load it first (loadCrusher)
		};
		reverb: {
			enabled: boolean;
			mix: number;      // 0..1
			decay: number;    // seconds
			tone: number;     // 0..1 (dark→bright)
		};
	};

	sampleRate: number;
	tailSeconds: number;

	bars?: number;          // how many times the pattern plays (default 1)
	part?: ExportPart;      // which part of the mix to render (default 'mix')
	random?: () => number;  // 0 ≤ x < 1 (default Math.random); seeded for an export's parts
};

// The mix, or one part of it: the parts add up to the mix. 'dry' is the sound with drive but
// without the delay's echoes or the reverb; the noise layer skips the effects, as live.
export type ExportPart = 'mix' | 'dry' | 'delay' | 'reverb' | 'noise';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(x: number) {
	return Math.max(0, Math.min(1, x));
}

// Noise setup (same stops + loudness behavior as DrumSequencer.vue)

type NoiseKey = "brown" | "pink" | "white" | "blue" | "violet";

const NOISE_STOPS: { key: NoiseKey; pos: number }[] = [
	{ key: "brown", pos: 0.00 },
	{ key: "pink", pos: 0.25 },
	{ key: "white", pos: 0.50 },
	{ key: "blue", pos: 0.75 },
	{ key: "violet", pos: 1.00 },
];

const NOISE_LOUDNESS: Record<NoiseKey, number> = {
	brown: 2.5,
	pink: 2.0,
	white: 1.0,
	blue: 1.5,
	violet: 2.0,
};

function generateNoiseBuffers(ctx: BaseAudioContext, random: () => number): Record<NoiseKey, AudioBuffer> {
	const length = ctx.sampleRate * 2; // 2 seconds
	const createBuffer = () => ctx.createBuffer(1, length, ctx.sampleRate);

	const white = createBuffer();
	const wd = white.getChannelData(0);
	for (let i = 0; i < length; i++) wd[i] = random() * 2 - 1;

	// Normalize helper
	const norm = (buf: Float32Array) => {
		let m = 0;
		for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
		if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] /= m;
	};

	// Pink
	const pink = createBuffer();
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
	norm(pd);

	// Brown
	const brown = createBuffer();
	const bd = brown.getChannelData(0);
	let lastOut = 0;
	for (let i = 0; i < length; i++) {
		const w = wd[i];
		lastOut = (lastOut + (0.02 * w)) / 1.02;
		bd[i] = lastOut * 3.5;
	}
	norm(bd);

	// Blue (+3 dB/oct)
	const blue = createBuffer();
	const bud = blue.getChannelData(0);
	let prev = 0;
	for (let i = 0; i < length; i++) {
		const x = wd[i] - prev;
		prev = wd[i];
		bud[i] = x;
	}
	norm(bud);

	// Violet (~ +6 dB/oct)
	const violet = createBuffer();
	const vd = violet.getChannelData(0);
	let prev1 = 0, prev2 = 0;
	for (let i = 0; i < length; i++) {
		const d1 = wd[i] - prev1; prev1 = wd[i];
		const d2 = d1 - prev2; prev2 = d1;
		vd[i] = d2;
	}
	norm(vd);

	return { white, pink, brown, blue, violet };
}

function pickNoiseStops(morph: number) {
	let t = clamp01(morph);
	let lower = NOISE_STOPS[0];
	let upper = NOISE_STOPS[NOISE_STOPS.length - 1];

	for (let i = 0; i < NOISE_STOPS.length - 1; i++) {
		const a = NOISE_STOPS[i];
		const b = NOISE_STOPS[i + 1];
		if (t >= a.pos && t <= b.pos) {
			lower = a;
			upper = b;
			break;
		}
	}

	const span = Math.max(1e-6, upper.pos - lower.pos);
	const wMorph = (t - lower.pos) / span;
	const wA = 1 - wMorph;
	const wB = wMorph;

	return { lower, upper, wA, wB };
}

// Drive curve (same behavior as live generateDriveCurve)
function generateDriveCurve(type: string, amount = 0.5) {
	const samples = 1024;
	const curve = new Float32Array(samples);
	for (let i = 0; i < samples; ++i) {
		const x = (i * 2) / samples - 1;
		curve[i] = Math.tanh(x * (1 + amount * 25));
	}
	return curve;
}

// ---------------------------------------------------------------------------
// Main scheduler
// ---------------------------------------------------------------------------

export function scheduleStepSequencer(
	ctx: BaseAudioContext,
	state: StepSequencerState,
	offsetSeconds = 0
): void {
	const sr = Math.max(3000, Math.min(192000, state.sampleRate || ctx.sampleRate || 48000));
	const random = state.random ?? Math.random;
	const bars = Math.max(1, Math.round(state.bars ?? 1));

	// Master
	const masterGain = ctx.createGain();
	masterGain.gain.setValueAtTime(clamp01(state.masterVolume), ctx.currentTime + offsetSeconds);
	masterGain.connect(ctx.destination);

	// The parts of the mix, each through its own gate to the master: all open for the mix, one
	// for a part. Everything is scheduled the same either way, so a part uses the same random
	// numbers as the mix.
	const part = state.part ?? 'mix';
	const partOut = (name: ExportPart) => {
		const g = ctx.createGain();
		g.gain.value = part === 'mix' || part === name ? 1 : 0;
		g.connect(masterGain);
		return g;
	};
	const dryOut = partOut('dry');
	const delayOut = partOut('delay');
	const reverbOut = partOut('reverb');
	const noiseOut = partOut('noise');

	// Noise buffers (shared by all notes)
	const noiseBuffers = generateNoiseBuffers(ctx, random);

	// -------------------------------------------------------------------------
	// FX: Drive
	// -------------------------------------------------------------------------
	const drive = state.fx.drive;
	const driveEnabled = !!drive.enabled;
	const driveShaper = ctx.createWaveShaper();
	const driveToneFilter = ctx.createBiquadFilter();
	driveToneFilter.type = "lowpass";

	const driveDry = ctx.createGain();
	const driveWet = ctx.createGain();
	const driveMakeup = ctx.createGain();
	const driveSum = ctx.createGain();

	// CRUSH: shaper → tone → bit crusher → makeup (crusher.ts). The caller loads the crusher's
	// worklet into ctx first (loadCrusher); without it the tone filter goes straight on.
	driveShaper.connect(driveToneFilter);
	const crusher = driveEnabled && drive.crush ? createCrusher(ctx, clamp01(drive.amount)) : null;
	if (crusher) driveToneFilter.connect(crusher).connect(driveMakeup);
	else driveToneFilter.connect(driveMakeup);
	driveMakeup.connect(driveWet);

	driveDry.connect(driveSum);
	driveWet.connect(driveSum);

	if (driveEnabled) {
		driveShaper.curve = generateDriveCurve(drive.type, clamp01(drive.amount));
		driveMakeup.gain.value = 1 + clamp01(drive.amount) * 0.1;
	} else {
		// passthrough curve
		const n = 1024;
		const c = new Float32Array(n);
		for (let i = 0; i < n; i++) c[i] = (i * 2) / n - 1;
		driveShaper.curve = c;
		driveMakeup.gain.value = 1;
	}

	driveToneFilter.frequency.value = drive.tone || 5000;

	const driveMix = clamp01(drive.mix);
	driveWet.gain.value = driveEnabled ? driveMix : 0;
	driveDry.gain.value = driveEnabled ? 1 - driveMix : 1;

	// -------------------------------------------------------------------------
	// FX: Delay
	// -------------------------------------------------------------------------
	const delay = state.fx.delay;
	const delayEnabled = !!delay.enabled && delay.mix > 0;

	const delayDry = ctx.createGain();
	const delayWet = ctx.createGain();
	const delayNode = ctx.createDelay(5.0);
	const feedbackGain = ctx.createGain();
	const fbTone = ctx.createBiquadFilter();
	const wetTone = ctx.createBiquadFilter();

	delayNode.connect(fbTone);
	fbTone.connect(feedbackGain);
	feedbackGain.connect(delayNode);

	delayNode.connect(wetTone);
	wetTone.connect(delayWet);

	const delayTime = Math.max(0.001, Math.min(5, delay.time || 0));
	delayNode.delayTime.value = delayTime;

	feedbackGain.gain.value = Math.max(0, Math.min(0.95, delay.feedback));

	const delayMixClamped = clamp01(delay.mix);
	delayWet.gain.value = delayEnabled ? delayMixClamped : 0;
	delayDry.gain.value = delayEnabled ? 1 - delayMixClamped : 1;

	const delayToneType = delay.toneEnabled
		? (delay.toneType === "highpass" ? "highpass" : "lowpass")
		: "allpass";

	fbTone.type = delayToneType;
	wetTone.type = delayToneType;

	const toneHz = delay.toneEnabled ? delay.toneHz : 20000;
	fbTone.frequency.value = toneHz;
	wetTone.frequency.value = toneHz;

	// drive → delay: the plain one, or the ping-pong (pingPong.ts)
	driveSum.connect(delayDry);
	if (delay.pingPong) {
		const pp = createPingPong(ctx);
		for (const d of pp.delays) d.delayTime.value = delayTime;
		for (const g of pp.feedback) g.gain.value = feedbackGain.gain.value;
		for (const f of pp.tones) {
			f.type = delayToneType;
			f.frequency.value = toneHz;
		}
		pp.output.connect(delayWet);
		driveSum.connect(pp.input);
	} else {
		driveSum.connect(delayNode);
	}

	// -------------------------------------------------------------------------
	// FX: Reverb
	// -------------------------------------------------------------------------
	const rev = state.fx.reverb;
	const reverbEnabled = !!rev.enabled && rev.mix > 0 && rev.decay > 0.05;

	const reverbToneFilter = ctx.createBiquadFilter();
	reverbToneFilter.type = "lowpass";
	const reverbConvolver = ctx.createConvolver();
	const reverbWet = ctx.createGain();

	driveSum.connect(reverbToneFilter);
	reverbToneFilter.connect(reverbConvolver);
	reverbConvolver.connect(reverbWet);

	if (reverbEnabled) {
		const ir = generateReverbIR(ctx as any, {
			decaySeconds: Math.max(0.1, rev.decay),
			sampleRate: sr,
			stereo: true,
			seed: 1337,
		});
		reverbConvolver.buffer = ir;

		const t = clamp01(rev.tone);
		const minHz = 800;
		const maxHz = 12000;
		const freq = minHz * Math.pow(maxHz / minHz, t);
		reverbToneFilter.frequency.value = freq;

		reverbWet.gain.value = clamp01(rev.mix);
	} else {
		reverbWet.gain.value = 0;
		reverbToneFilter.frequency.value = 20000;
	}

	// -------------------------------------------------------------------------
	// Connect FX to master
	// -------------------------------------------------------------------------
	delayDry.connect(dryOut);
	delayWet.connect(delayOut);
	reverbWet.connect(reverbOut);

	// -------------------------------------------------------------------------
	// Global LFO (audio-rate) – optional, minimal parity
	// -------------------------------------------------------------------------
	const lfoState = state.synth.lfo;
	let lfoGainNode: GainNode | null = null;

	if (lfoState.enabled && lfoState.depth !== 0 && lfoState.rateHz > 0) {
		const lfoOsc = ctx.createOscillator();
		const lfoGain = ctx.createGain();
		lfoOsc.type = lfoState.waveform;
		lfoOsc.frequency.value = Math.max(0.01, lfoState.rateHz);
		lfoGain.gain.value = lfoState.depth;

		lfoOsc.connect(lfoGain);

		const now = ctx.currentTime + offsetSeconds;
		const beatsPerStep = 0.25; // 16th notes
		const secondsPerBeat = 60 / state.bpm;
		const stepDur = secondsPerBeat * beatsPerStep;
		const patternDuration = bars * state.stepsCount * stepDur + state.tailSeconds;

		lfoOsc.start(now);
		lfoOsc.stop(now + patternDuration);

		lfoGainNode = lfoGain;
	}

	// -------------------------------------------------------------------------
	// Note scheduling (synth voice only)
	// -------------------------------------------------------------------------

	const envState = state.synth.envelope;
	const filterState = state.synth.filter;
	const noiseState = state.synth.noise;
	const uni = state.synth.unison;
	const fmState = state.synth.fm;
	const pitchEnv = state.synth.pitchEnv;

	const secondsPerBeat = 60 / state.bpm;
	const stepDuration = secondsPerBeat / 4; // 16th notes
	const chanVol = clamp01(state.channelVolume);

	const steps = state.pattern.active;
	const velArr = state.pattern.velocities;
	const pitchArr = state.pattern.pitches;
	const waveArr = state.pattern.waveforms;

	// The pattern, `bars` times over
	for (let bar = 0; bar < bars; bar++) for (let stepIndex = 0; stepIndex < state.stepsCount; stepIndex++) {
		if (!steps[stepIndex]) continue;

		const baseVel = clamp01(velArr[stepIndex] ?? 1);
		if (baseVel <= 0) continue;

		const freq = pitchArr[stepIndex] || 220;
		const wave = waveArr[stepIndex] ?? "sine";

		// Swing: same as live schedule()
		const isEvenStep = stepIndex % 2 === 1;
		const swingOffset = isEvenStep ? stepDuration * clamp01(state.swing) : 0;
		const barStart = bar * state.stepsCount * stepDuration;
		const t = ctx.currentTime + offsetSeconds + barStart + stepIndex * stepDuration + swingOffset;

		const padNoiseOn = noiseState.mask?.[stepIndex] ?? true;

		// One note, or a ratchet's 2–4 quick hits within the step, as in the live engine
		const span = stepSpan(stepIndex, state.stepsCount, stepDuration, clamp01(state.swing));
		const hitHz = ratchetPitches(freq, state.pattern.ratchets?.[stepIndex], state.pattern.repeatNotes?.[stepIndex], state.pattern.repeatChord ?? []);
		ratchetHits(t, span, state.pattern.ratchets?.[stepIndex]).forEach((hit, k) => scheduleSynthNote({
			ctx,
			time: hit.time,
			maxDuration: hit.maxDuration,
			freq: hitHz[k] ?? freq,
			baseVelocity: baseVel,
			channelVolume: chanVol,
			wave,
			envState,
			filterState,
			noiseState,
			padNoiseOn,
			unisonState: uni,
			fmState,
			pitchEnv,
			pulseWidth: state.synth.pulse?.width ?? PULSE_WIDTH_DEFAULT,
			velocityRouting: state.synth.velocity,
			driveEnabled,
			driveDry,
			driveShaper,
			driveSum,
			lfoState,
			lfoGainNode,
			noiseOut,
			noiseBuffers,
			random,
		}));
	}
}

// ---------------------------------------------------------------------------
// Single-note scheduling (parity with live playSynthNote noise behavior)
// ---------------------------------------------------------------------------

type EnvState = StepSequencerState["synth"]["envelope"];
type FilterState = StepSequencerState["synth"]["filter"];
type NoiseState = StepSequencerState["synth"]["noise"];
type UnisonState = StepSequencerState["synth"]["unison"];
type FMState = StepSequencerState["synth"]["fm"];
type PitchEnvState = StepSequencerState["synth"]["pitchEnv"];
type LfoState = StepSequencerState["synth"]["lfo"];

function scheduleSynthNote(opts: {
	ctx: BaseAudioContext;
	time: number;
	maxDuration?: number; // a ratchet hit ends by then, where the next hit begins
	freq: number;
	baseVelocity: number;
	channelVolume: number;
	wave: string;
	envState: EnvState;
	filterState: FilterState;
	noiseState: NoiseState;
	padNoiseOn: boolean;
	unisonState: UnisonState;
	fmState: FMState;
	pitchEnv: PitchEnvState;
	pulseWidth: number;
	velocityRouting?: VelocityRouting;
	driveEnabled: boolean;
	driveDry: GainNode;
	driveShaper: WaveShaperNode;
	driveSum: GainNode;
	lfoState: LfoState;
	lfoGainNode: GainNode | null;
	noiseOut: GainNode; // the noise layer's way to the master (it skips the effects, as live)
	noiseBuffers: Record<NoiseKey, AudioBuffer>;
	random: () => number;
}) {
	const {
		ctx, time, maxDuration, freq, baseVelocity, channelVolume, wave,
		envState, filterState, noiseState, padNoiseOn,
		unisonState, fmState, pitchEnv, pulseWidth, velocityRouting, driveEnabled,
		driveDry, driveShaper, driveSum,
		lfoState, lfoGainNode,
		noiseOut, noiseBuffers, random,
	} = opts;

	const attackSec = envState.enabled
		? Math.max(0.001, envState.attackMs / 1000)
		: 0.01;

	// Velocity routing, as in the live engine: the step's velocity also shapes decay, cutoff,
	// pitch envelope and noise
	const routed = routeVelocity(velocityRouting, baseVelocity);
	const noteCutoff = routedCutoff(filterState.cutoff, routed);

	const decaySec = (envState.enabled
		? Math.max(0.05, envState.decayMs / 1000)
		: 0.1) * routed.decayFactor;

	const attackEnd = time + attackSec;
	const naturalEnd = attackEnd + decaySec;
	const gateEnd = time + Math.max(0.02, (envState.decayMs / 1000) * routed.decayFactor);
	const noteEnd = cutNoteEnd(envState.enabled ? naturalEnd : gateEnd, time, attackSec, maxDuration);

	const baseAmp = baseVelocity * channelVolume;

	// --- Tone vs Noise blend: 100% parity with live code ---------------------
	const addNoiseForThisPad = padNoiseOn !== false;
	const blend = (addNoiseForThisPad && noiseState.enabled)
		? routedNoise(clamp01(noiseState.amount), routed)
		: 0;

	const oscBlend = 1 - blend;
	const noiseBlend = blend;

	// Tone envelope gain
	const oscEnvGain = ctx.createGain();

	const wfComp = waveGain(wave);
	const oscPeak = Math.max(0.0001, baseAmp * oscBlend * wfComp);

	if (envState.enabled) {
		oscEnvGain.gain.setValueAtTime(0.0001, time);
		oscEnvGain.gain.exponentialRampToValueAtTime(oscPeak, attackEnd);
		oscEnvGain.gain.exponentialRampToValueAtTime(0.001, noteEnd);
	} else {
		// Same level as the envelope's peak: waveform balance and noise mix included
		oscEnvGain.gain.setValueAtTime(oscPeak, time);
		oscEnvGain.gain.setTargetAtTime(0.0001, noteEnd - 0.01, 0.005);
	}

	// The LFO this note listens to: the shared one, or with Retrigger its own, starting with
	// the note (as in the live engine)
	const lfoSrc: AudioNode | null = !(lfoState.enabled && lfoGainNode) ? null
		: lfoState.retrigger ? startNoteLfo(ctx, lfoState.waveform, lfoState.rateHz, lfoState.depth, time, noteEnd)
		: lfoGainNode;
	// Level (tremolo): the whole note, tone and noise, goes through gains the LFO moves
	let tremoloTap: GainNode | null = null;
	if (lfoSrc && lfoState.target === "amp") {
		tremoloTap = ctx.createGain();
		tremoloTap.gain.value = LFO_AMP_TAP;
		lfoSrc.connect(tremoloTap);
	}
	const tremolo = (input: AudioNode): AudioNode => {
		if (!tremoloTap) return input;
		const g = ctx.createGain();
		g.gain.value = lfoAmpBase(lfoState.depth);
		tremoloTap.connect(g.gain);
		return input.connect(g);
	};

	// --- Unison / filter / LFO hookup (simplified parity) -------------------
	const voices = unisonState.enabled ? clampUnisonVoices(unisonState.voices) : 1;

	const detuneStep = voices > 1 ? unisonState.detuneCents : 0;
	const spreadPct = voices > 1 ? unisonState.stereoSpread : 0;

	// Pitch envelope: one starting offset for the whole note, as in the live engine
	const pitchDecay = pitchEnv.decayMs / 1000;
	const pitchStartCents = pitchEnvStartCents({
		enabled: pitchEnv.enabled,
		semitones: routedSemitones(pitchEnv.semitones, routed),
		mode: pitchEnv.mode,
		decay: pitchDecay,
	}, random);

	for (let i = 0; i < voices; i++) {
		// The voice's sound source, as in the live engine (the pulse network for 'pulse')
		// (each unison voice starting at its own point of its cycle, unison.ts)
		const source = createVoiceSource(ctx, wave, pulseWidth, unisonPhase(i, voices, spreadPct));
		const osc = source.osc;

		const voiceFilter = ctx.createBiquadFilter();
		voiceFilter.type = "lowpass";

		const voiceGain = ctx.createGain();
		const panner = ctx.createStereoPanner();

		const dNorm = unisonPosition(i, voices);
		const detuneC = dNorm * detuneStep;
		// Frequency, and detune: the unison detune plus the pitch envelope's sweep
		applyPitchEnv(osc, freq, time, pitchStartCents, pitchDecay, detuneC);

		const fmHandle = startFM(ctx, osc, freq, time, {
			enabled: fmState.enabled,
			modFreqHz: fmState.modFreq,
			index: fmState.index,
			ratio: fmState.ratio,
		});


		if (filterState.enabled) {
			voiceFilter.frequency.setValueAtTime(noteCutoff, time);
			voiceFilter.Q.setValueAtTime(filterState.resonance, time);
			// Filter envelope, as in the live engine
			applyFilterEnv(voiceFilter, time, filterState.envAmount ?? 0, (filterState.envDecayMs ?? 200) / 1000);
		} else {
			voiceFilter.frequency.setValueAtTime(20000, time);
			voiceFilter.Q.setValueAtTime(0.0001, time);
		}

		voiceGain.gain.setValueAtTime(1 / voices, time);
		panner.pan.setValueAtTime((dNorm * spreadPct) / 100, time);

		// LFO modulation, as in the live engine (Level is note-wide, above)
		if (lfoSrc) {
			const lfoGainNode = lfoSrc;
			if (lfoState.target === "pitch") {
				const tap = ctx.createGain();
				tap.gain.value = 1;
				lfoGainNode.connect(tap).connect(osc.detune);
			} else if (lfoState.target === "filter") {
				const f0 = filterState.enabled ? noteCutoff : 20000;
				const tap = ctx.createGain();
				tap.gain.value = lfoFilterTapGain(f0, lfoState.depth, ctx.sampleRate);

				const ctrlLP = ctx.createBiquadFilter();
				ctrlLP.type = "lowpass";
				ctrlLP.frequency.value = 120;

				lfoGainNode.connect(tap).connect(ctrlLP).connect(voiceFilter.frequency);
			} else if (lfoState.target === "pwm" && source.width) {
				const tap = ctx.createGain();
				tap.gain.value = lfoPwmTapGain(pulseWidth, lfoState.depth);
				lfoGainNode.connect(tap).connect(source.width);
			} else if (lfoState.target === "fm" && fmHandle) {
				const tap = ctx.createGain();
				tap.gain.value = lfoFmTapGain(fmHandle.deviationHz);
				lfoGainNode.connect(tap).connect(fmHandle.deviation);
			}
		}

		source.output.connect(voiceFilter).connect(voiceGain).connect(panner).connect(oscEnvGain);

		source.start(time);
		source.stop(noteEnd);
		if (fmHandle) fmHandle.stop(noteEnd);
	}

	// Tone path → drive / FX chain (through the tremolo when the LFO moves the level)
	const oscOut = tremolo(oscEnvGain);
	if (driveEnabled) {
		oscOut.connect(driveDry);
		oscOut.connect(driveShaper);
	} else {
		oscOut.connect(driveSum);
	}

	// --- Noise path (matches live DrumSequencer playSynthNote) --------------

	if (noiseBlend > 0 && noiseState.enabled) {
		const { lower, upper, wA, wB } = pickNoiseStops(noiseState.color);

		const bufA = noiseBuffers[lower.key];
		const bufB = noiseBuffers[upper.key];

		if (bufA || bufB) {
			const mix = ctx.createGain();
			mix.gain.setValueAtTime(1, time);

			if (bufA) {
				const sA = ctx.createBufferSource();
				sA.buffer = bufA;
				sA.loop = false;
				const gA = ctx.createGain();
				gA.gain.setValueAtTime(wA, time);
				sA.connect(gA).connect(mix);
				sA.start(time);
				sA.stop(noteEnd);
			}
			if (bufB) {
				const sB = ctx.createBufferSource();
				sB.buffer = bufB;
				sB.loop = false;
				const gB = ctx.createGain();
				gB.gain.setValueAtTime(wB, time);
				sB.connect(gB).connect(mix);
				sB.start(time);
				sB.stop(noteEnd);
			}

			const noiseEnvGain = ctx.createGain();
			const attackEnd = time + attackSec;

			const gainLower = NOISE_LOUDNESS[lower.key];
			const gainUpper = NOISE_LOUDNESS[upper.key];
			const colorGain = gainLower * wA + gainUpper * wB;

			const safePeak = Math.max(0.0001, baseAmp * noiseBlend * colorGain);

			noiseEnvGain.gain.setValueAtTime(0.0001, time);
			noiseEnvGain.gain.exponentialRampToValueAtTime(safePeak, attackEnd);

			const BURST_MAX_MS = 250;
			const burstActive =
				noiseState.attackBurst && noiseState.burstMs < BURST_MAX_MS;

			const burstEnd = burstActive
				? Math.min(
					noteEnd,
					attackEnd + Math.max(0.005, noiseState.burstMs / 1000)
				)
				: noteEnd;

			noiseEnvGain.gain.exponentialRampToValueAtTime(0.001, burstEnd);
			noiseEnvGain.gain.setTargetAtTime(0.0001, burstEnd, 0.01);

			// As in the live engine: band-limited, then straight to the master, skipping drive,
			// delay and reverb (exports before PR 34 sent it through the effects)
			const noiseHP = ctx.createBiquadFilter();
			noiseHP.type = "highpass";
			noiseHP.frequency.setValueAtTime(40, time);    // remove sub-rumble
			const noiseLP = ctx.createBiquadFilter();
			noiseLP.type = "lowpass";
			noiseLP.frequency.setValueAtTime(16000, time); // tame ultra-high fizz

			mix.connect(noiseHP).connect(noiseLP).connect(noiseEnvGain);
			tremolo(noiseEnvGain).connect(noiseOut);

		}
	}
}

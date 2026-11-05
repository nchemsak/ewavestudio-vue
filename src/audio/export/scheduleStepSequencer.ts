// src/audio/export/scheduleStepSequencer.ts
// Pure offline scheduler for the Step Sequencer synth.
// Rebuilds a minimal version of your live graph inside any BaseAudioContext.

import { applyPitchEnv, pitchEnvStartCents } from "../pitchEnv";
import { lfoFilterTapGain } from "../synthHelpers";
import { applyFilterEnv } from "../filterEnv";
import { createVoiceSource, lfoPwmTapGain, waveGain, PULSE_WIDTH_DEFAULT } from "../waves";
import { routeVelocity, routedCutoff, routedSemitones, routedNoise, type VelocityRouting } from "../velocity";
import { startFM } from "../fm";
import { generateReverbIR } from "../reverb/generateIr";

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
			target: "pitch" | "filter" | "pwm";
			waveform: "sine" | "square";
			depth: number;       // detune cents for pitch, Hz for filter
			rateHz: number;      // resolved from sync/division in the UI
			division: string;
			retrigger: boolean;
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
		};
		drive: {
			enabled: boolean;
			type: "overdrive" | string;
			amount: number;   // 0..1
			tone: number;     // Hz
			mix: number;      // 0..1
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
};

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

function generateNoiseBuffers(ctx: BaseAudioContext): Record<NoiseKey, AudioBuffer> {
	const length = ctx.sampleRate * 2; // 2 seconds
	const createBuffer = () => ctx.createBuffer(1, length, ctx.sampleRate);

	const white = createBuffer();
	const wd = white.getChannelData(0);
	for (let i = 0; i < length; i++) wd[i] = Math.random() * 2 - 1;

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

	// Master
	const masterGain = ctx.createGain();
	masterGain.gain.setValueAtTime(clamp01(state.masterVolume), ctx.currentTime + offsetSeconds);
	masterGain.connect(ctx.destination);

	// Noise buffers (shared by all notes)
	const noiseBuffers = generateNoiseBuffers(ctx);

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

	driveShaper.connect(driveToneFilter);
	driveToneFilter.connect(driveMakeup);
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

	// drive → delay
	driveSum.connect(delayDry);
	driveSum.connect(delayNode);

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
	delayDry.connect(masterGain);
	delayWet.connect(masterGain);
	reverbWet.connect(masterGain);

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
		const patternDuration = state.stepsCount * stepDur + state.tailSeconds;

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

	for (let stepIndex = 0; stepIndex < state.stepsCount; stepIndex++) {
		if (!steps[stepIndex]) continue;

		const baseVel = clamp01(velArr[stepIndex] ?? 1);
		if (baseVel <= 0) continue;

		const freq = pitchArr[stepIndex] || 220;
		const wave = waveArr[stepIndex] ?? "sine";

		// Swing: same as live schedule()
		const isEvenStep = stepIndex % 2 === 1;
		const swingOffset = isEvenStep ? stepDuration * clamp01(state.swing) : 0;
		const t = ctx.currentTime + offsetSeconds + stepIndex * stepDuration + swingOffset;

		const padNoiseOn = noiseState.mask?.[stepIndex] ?? true;

		scheduleSynthNote({
			ctx,
			time: t,
			freq,
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
			masterGain,
			noiseBuffers,
		});
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
	masterGain: GainNode;
	noiseBuffers: Record<NoiseKey, AudioBuffer>;
}) {
	const {
		ctx, time, freq, baseVelocity, channelVolume, wave,
		envState, filterState, noiseState, padNoiseOn,
		unisonState, fmState, pitchEnv, pulseWidth, velocityRouting, driveEnabled,
		driveDry, driveShaper, driveSum,
		lfoState, lfoGainNode,
		masterGain, noiseBuffers,
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
	const noteEnd = envState.enabled ? naturalEnd : gateEnd;

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

	// --- Unison / filter / LFO hookup (simplified parity) -------------------
	const voices = unisonState.enabled
		? Math.max(1, Math.min(6, unisonState.voices))
		: 1;

	const detuneStep = voices > 1 ? unisonState.detuneCents : 0;
	const spreadPct = voices > 1 ? unisonState.stereoSpread : 0;

	const normIndex = (i: number, n: number) =>
		n === 1 ? 0 : (i / (n - 1)) * 2 - 1;

	// Pitch envelope: one starting offset for the whole note, as in the live engine
	const pitchDecay = pitchEnv.decayMs / 1000;
	const pitchStartCents = pitchEnvStartCents({
		enabled: pitchEnv.enabled,
		semitones: routedSemitones(pitchEnv.semitones, routed),
		mode: pitchEnv.mode,
		decay: pitchDecay,
	});

	for (let i = 0; i < voices; i++) {
		// The voice's sound source, as in the live engine (the pulse network for 'pulse')
		const source = createVoiceSource(ctx, wave, pulseWidth);
		const osc = source.osc;

		const voiceFilter = ctx.createBiquadFilter();
		voiceFilter.type = "lowpass";

		const voiceGain = ctx.createGain();
		const panner = ctx.createStereoPanner();

		const dNorm = normIndex(i, voices);
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

		// LFO modulation (basic parity)
		if (lfoState.enabled && lfoGainNode) {
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
			}
		}

		source.output.connect(voiceFilter).connect(voiceGain).connect(panner).connect(oscEnvGain);

		source.start(time);
		source.stop(noteEnd);
		if (fmHandle) fmHandle.stop(noteEnd);
	}

	// Tone path → drive / FX chain
	if (driveEnabled) {
		oscEnvGain.connect(driveDry);
		oscEnvGain.connect(driveShaper);
	} else {
		oscEnvGain.connect(driveSum);
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

			const noiseTarget = driveSum; // common pre-FX bus for tone + noise

			mix.connect(noiseEnvGain).connect(noiseTarget);

		}
	}
}

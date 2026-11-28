// src/audio/export/scheduleStepSequencer.ts
// Pure offline scheduler for the Step Sequencer synth.
// Rebuilds the live effects graph inside any BaseAudioContext; its notes are built by
// note.ts, as the live engine's are.
//
// For the Export audio dialog (src/audio/export/exportFiles.ts) it plays the pattern `bars`
// times, can render one part of the mix on its own (`part`: the dry sound, the delay's echoes,
// the reverb, the noise layer, or the tape pedal's own noise, which add up to the mix), and
// takes its random numbers (noise, the pitch envelope's random mode, the tape's hiss) from
// `random`, so every part of one export plays the same noise and the same random sweeps.

import { playNote, type NoteWiring, type VoiceSettings } from "../note";
import { generateReverbIR } from "../reverb/generateIr";
import { DEFAULT_SWELL, isSwell, nextHitGaps, pedalHitSteps, revIrSeconds, revKey, reverseIrChannels, stepTime, swellSeconds } from "../reverb/reverse";
import { ratchetHits, ratchetPitches, stepSpan } from "../ratchet";
import { createCrusher } from "../crusher";
import { createPingPong } from "../pingPong";
import { createTape, tapeSettings, type TapeMode } from "../tape";
import { sampleBuffer, type SampleData } from "../sample";
import { bassNotesForBar, playBassNote, type BassPattern, type BassSounding, type BassVoice } from "../bass";
import { DRUM_SLOTS, drumHitsForBar, playDrumHit, type DrumRow, type DrumSounding } from "../drums";
import { soundBuffer } from "../drumKit";
import { createDriftFilter, driftRuns, playDriftNote, type DriftVoice } from "../drift";
import { motionAt, motionOn, motionParams, MOTION_POINTS_PER_STEP, padX, rampTo, type DriftMotion } from "../driftMotion";
import { seededRandom } from "../../lib/random";

export type StepPattern = {
	active: boolean[];
	velocities: number[];        // 0..1
	pitches: number[];           // Hz
	waveforms: string[]; // per-step wave (waves.ts)
	ratchets?: number[]; // per step: 1 hit, or 2–4 quick hits (ratchet.ts)
	repeatNotes?: string[]; // per step: what the hits play, 'same' | 'up' | 'down' (ratchet.ts)
	repeatChord?: number[]; // the key's chord, pitch classes, which Up/Down step through
	noise?: boolean[]; // per step: may it add noise? (a chain's bar, its slot's; missing: synth.noise.mask)
};

/** The pattern bar `bar` plays: the chain's, or the one pattern */
export function patternForBar(state: Pick<StepSequencerState, 'pattern' | 'barPatterns'>, bar: number): StepPattern {
	const list = state.barPatterns;
	return list && list.length ? list[bar % list.length] : state.pattern;
}

export type StepSequencerState = {
	bpm: number;
	stepsCount: 16 | 32;
	swing: number;                // 0..0.5
	masterVolume: number;         // 0..1
	channelVolume: number;        // 0..1

	pattern: StepPattern;
	// The chain (PR 111): one pattern per bar, bar b playing barPatterns[b % length]; without
	// it every bar plays `pattern`
	barPatterns?: StepPattern[];

	// The synth's voice, as note.ts plays it (the Rhythm machine's: rhythmVoice() in
	// src/lib/machines/rhythm.ts), with the noise mask and the recording
	synth: VoiceSettings & {
		noise: VoiceSettings['noise'] & { mask: boolean[] }; // per step: may it add noise?
		sample?: SampleData | null; // the recorded sound, the 'sample' wave (sample.ts; missing: none)
	};

	// The Bass machine (src/audio/bass.ts; missing: none): its voice, level, and pattern, or one
	// per bar with the chain (as barPatterns). Not in a one-shot.
	// `pedals`: how much of it goes through the pedals (missing: all)
	bass?: { voice: BassVoice; level: number; pedals?: number; pattern: BassPattern; barPatterns?: BassPattern[] };
	// The Drums machine (src/audio/drums.ts; missing: none): each slot's recording and settings,
	// the machine's level and Pedals, and its rows, or one set per bar with the chain (as
	// barPatterns). Not in a one-shot.
	drums?: {
		// `note`: its sound's General MIDI note, for the MIDI file (drumNote())
		slots: { data: SampleData | null; tune: number; decay: number; level: number; muted: boolean; note?: number }[];
		level: number; pedals?: number; rows: DrumRow[]; barRows?: DrumRow[][];
	};
	// The Drift machine (src/audio/drift.ts; missing: none): its voice, level, Pedals (its reverb
	// send), and chords (a bar's plates, repeating every `length` bars, counted from the first
	// bar across the chain), each plate's pitch. `loop`: the bars repeat (a seamless loop), so a
	// plate held at the end and at the start carries on round. Not in a one-shot.
	drift?: { voice: DriftVoice; level: number; pedals: number; length: number; chords: boolean[][]; plateHz: number[]; loop?: boolean };
	// The Rhythm machine's Pedals (missing: all of it through the pedals)
	rhythmPedals?: number;
	// The machines whose FX is off (the rail's FX cap, the plan's item 12): dry, round every
	// pedal, the lo-fi one too (missing: none)
	dryMachines?: Partial<Record<'rhythm' | 'bass' | 'drums' | 'drift', boolean>>;
	// One machine only (a machine's stem, PR 116): the others' notes aren't played (missing: all)
	machine?: 'rhythm' | 'bass' | 'drums' | 'drift';

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
			reverse?: boolean; // REV: the reverb backwards (reverb/reverse.ts; missing: off)
			swell?: string;    // REV's length: 'next' (until the next hit) or a fixed one
		};
		// The tape pedal, last in the chain (tape.ts; missing: off)
		tape?: {
			enabled: boolean;
			age: number;      // 0..1
			wobble: number;   // 0..1
			mode: TapeMode;
			phone?: boolean;  // PHONE: 300 Hz–3.4 kHz in mono (missing: off)
		};
	};

	sampleRate: number;
	tailSeconds: number;

	bars?: number;          // how many times the pattern plays (default 1)
	part?: ExportPart;      // which part of the mix to render (default 'mix')
	random?: () => number;  // 0 ≤ x < 1 (default Math.random); seeded for an export's parts
	// The tape pedal's own noise (hiss, crackle) plays for `seconds` (default: the bars, so a
	// loop repeats without a doubled stretch of it), then fades for `fade` seconds (default 0)
	tapeNoise?: { seconds?: number; fade?: number };
	// One note with no next hit (the one-shot, the screen's hit at rest): REV's Next hit swells
	// for a beat, as for a MIDI note
	oneShot?: boolean;
};

// The mix, or one part of it: the parts add up to the mix. 'dry' is the sound with drive but
// without the delay's echoes or the reverb; the noise layer skips those effects, as live.
// With the tape pedal on, each of those is as it comes off the tape, and 'tape' is the
// tape's own noise.
export type ExportPart = 'mix' | 'dry' | 'delay' | 'reverb' | 'noise' | 'tape';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A Drift note held round a seamless loop's end fades out past the end, and in at the start, over this
const LOOP_SEAM_S = 0.05;

function clamp01(x: number) {
	return Math.max(0, Math.min(1, x));
}

// Noise buffers, made from `random` (the colours and their loudness are in note.ts)

type NoiseKey = "brown" | "pink" | "white" | "blue" | "violet";

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

	// The parts of the mix, each through its own gate: all open for the mix, one for a part.
	// Everything is scheduled the same either way, so a part uses the same random numbers as
	// the mix. The gates meet in `partBus`; `fullBus` gets every part whatever is rendered,
	// because the tape pedal's saturation follows the level of the whole mix (tape.ts), which
	// is what lets the parts still add up to it.
	const part = state.part ?? 'mix';
	const partBus = ctx.createGain();
	const fullBus = ctx.createGain();
	const gate = (name: ExportPart, to: AudioNode) => {
		const g = ctx.createGain();
		g.gain.value = part === 'mix' || part === name ? 1 : 0;
		g.connect(to);
		return g;
	};
	const partOut = (name: ExportPart) => {
		const bus = ctx.createGain();
		bus.connect(gate(name, partBus));
		bus.connect(fullBus);
		return bus;
	};
	const dryOut = partOut('dry');
	const delayOut = partOut('delay');
	const reverbOut = partOut('reverb');
	const noiseOut = partOut('noise');
	// A machine whose FX is off (dryMachines): its part goes round every pedal, the lo-fi one too,
	// straight to the master as live; not into fullBus (the tape's saturation doesn't hear it, as
	// live, where it skips preMaster)
	const isDry = (id: 'rhythm' | 'bass' | 'drums' | 'drift') => !!state.dryMachines?.[id];
	const dryAround = gate('dry', masterGain);
	const noiseAround = gate('noise', masterGain);

	// The tape pedal, last in the chain: everything goes through it, and its own noise is a
	// part of its own. Its sways are fitted to the bars, so a loop repeats without a jump.
	const tapeState = state.fx.tape;
	const barsSeconds = bars * state.stepsCount * (60 / state.bpm / 4);
	const tape = tapeState?.enabled ? createTape(ctx) : null;
	if (tape && tapeState) {
		tape.apply(tapeSettings(tapeState.age, tapeState.wobble, tapeState.mode, barsSeconds));
		tape.setPhone(tapeState.phone === true);
		partBus.connect(tape.input);
		fullBus.connect(tape.sidechain);
		tape.output.connect(masterGain);
		tape.noise.connect(gate('tape', masterGain));
	} else {
		partBus.connect(masterGain);
	}

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

	// Keeps the effects running to the end of the render. Chrome stops processing a node once
	// every source feeding it has finished, at a moment that depends on how busy the browser is,
	// so a delay's echoes, the reverb's tail or the tape pedal's path could be cut short in one
	// render and not in another, and the stems then missed the mix (by 0.2 on a loaded machine).
	// A silent source into driveSum and the parts' buses keeps everything after them going.
	const keepAlive = ctx.createConstantSource();
	keepAlive.offset.value = 0;
	for (const n of [driveSum, dryOut, delayOut, reverbOut, noiseOut, dryAround, noiseAround]) keepAlive.connect(n);
	keepAlive.start(ctx.currentTime + offsetSeconds);

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

	// REV (reverb/reverse.ts): the reverb backwards instead, as live: one reversed
	// impulse response per swell length behind a gate, each hit opening its own as it reaches
	// it. Inside the reverb's stem.
	const revOn = reverbEnabled && rev.reverse === true;
	const revSwell = isSwell(rev.swell) ? rev.swell : DEFAULT_SWELL;
	const revGates = new Map<number, GainNode>();
	const revWet = ctx.createGain(); // MIX, as the plain reverb's
	revWet.gain.value = clamp01(rev.mix);
	revWet.connect(reverbOut);
	const revGate = (irSeconds: number) => {
		const key = revKey(irSeconds);
		let gate = revGates.get(key);
		if (!gate) {
			gate = ctx.createGain();
			gate.gain.value = 0;
			const conv = ctx.createConvolver();
			conv.normalize = false;
			const chs = reverseIrChannels(key / 1000, sr);
			const buf = ctx.createBuffer(2, chs[0].length, sr);
			chs.forEach((d, i) => buf.copyToChannel(d as Float32Array<ArrayBuffer>, i));
			conv.buffer = buf;
			reverbToneFilter.connect(gate).connect(conv).connect(revWet);
			revGates.set(key, gate);
		}
		return { key, gate };
	};
	const openRev = (irSeconds: number, at: number) => {
		const { key } = revGate(irSeconds);
		for (const [k, g] of revGates) g.gain.setTargetAtTime(k === key ? 1 : 0, at, 0.003);
	};
	if (revOn) {
		reverbWet.gain.value = 0; // the plain reverb is off while REV plays it backwards
		const stepS = 60 / state.bpm / 4;
		// SWELL's fixed length, or a beat (for one note, and with Next hit until the first hit, as
		// live, where that gate is open at rest): open from the start (Next hit: per hit, below)
		openRev(revIrSeconds(swellSeconds(revSwell, stepS, null)), ctx.currentTime + offsetSeconds);
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

	const noiseState = state.synth.noise;

	const secondsPerBeat = 60 / state.bpm;
	const stepDuration = secondsPerBeat / 4; // 16th notes
	const chanVol = clamp01(state.channelVolume);

	// The machines' buses, as live (liveEngine.ts, "Machine buses"): Pedals of each goes into
	// the pedals (through the drive while it's on), the rest straight to the dry part
	const driveIn = ctx.createGain();
	if (driveEnabled) { driveIn.connect(driveDry); driveIn.connect(driveShaper); } else driveIn.connect(driveSum);
	const machineBus = (pedals: number | undefined, dryOnly: boolean) => {
		const p = clamp01(pedals ?? 1);
		const bus = ctx.createGain();
		if (dryOnly) { bus.connect(dryAround); return bus; }
		const send = ctx.createGain();
		const direct = ctx.createGain();
		send.gain.value = p;
		direct.gain.value = 1 - p;
		bus.connect(send).connect(driveIn);
		bus.connect(direct).connect(dryOut);
		return bus;
	};
	const rhythmBus = machineBus(state.rhythmPedals, isDry('rhythm'));
	const bassBus = machineBus(state.bass?.pedals, isDry('bass'));
	const drumsBus = machineBus(state.drums?.pedals, isDry('drums'));
	const playRhythm = !state.machine || state.machine === 'rhythm';
	const playBass = !state.machine || state.machine === 'bass';
	const playDrums = !state.machine || state.machine === 'drums';

	// Where every note goes (note.ts builds it, as in the live engine)
	const noteWiring: NoteWiring = {
		ctx,
		toneOut: [rhythmBus],
		noiseOut: isDry('rhythm') ? noiseAround : noiseOut,
		noiseBuffers,
		sample: sampleBuffer(state.synth.sample ?? null),
		lfo: lfoGainNode,
		random,
	};

	// The Bass machine, as live: one note at a time, each cutting the one before
	if (state.bass && !state.oneShot && playBass) {
		const b = state.bass;
		let sounding: BassSounding | null = null;
		for (let bar = 0; bar < bars; bar++) {
			const pat = b.barPatterns?.length ? b.barPatterns[bar % b.barPatterns.length] : b.pattern;
			const barStart = ctx.currentTime + offsetSeconds + bar * state.stepsCount * stepDuration;
			for (const note of bassNotesForBar(pat, state.stepsCount, barStart, stepDuration, clamp01(state.swing), clamp01(b.level))) {
				sounding?.cut(note.time);
				sounding = playBassNote(b.voice, note, { ctx, out: [bassBus] });
			}
		}
	}

	// The Drums machine, as live: each slot one hit at a time, a new hit cutting its last
	if (state.drums && !state.oneShot && playDrums) {
		const d = state.drums;
		const buffers = d.slots.map((sl) => soundBuffer(sl.data));
		const muted = d.slots.map((sl) => sl.muted);
		const sounding: (DrumSounding | null)[] = Array(DRUM_SLOTS).fill(null);
		for (let bar = 0; bar < bars; bar++) {
			const rows = d.barRows?.length ? d.barRows[bar % d.barRows.length] : d.rows;
			const barStart = ctx.currentTime + offsetSeconds + bar * state.stepsCount * stepDuration;
			for (const hit of drumHitsForBar(rows, muted, state.stepsCount, barStart, stepDuration, clamp01(state.swing))) {
				const sl = d.slots[hit.slot], buffer = buffers[hit.slot];
				if (!sl || !buffer) continue;
				sounding[hit.slot]?.cut(hit.time);
				sounding[hit.slot] = playDrumHit(ctx, buffer, {
					time: hit.time, amp: hit.vel * clamp01(sl.level) * clamp01(d.level), tune: sl.tune, decay: sl.decay,
				}, [drumsBus]);
			}
		}
	}

	// The Drift machine, as live: its notes through its filter, all of it to the dry part and
	// Pedals of it into the reverb (skipping the overdrive and the delay). A plate held through
	// several bars is one note; each fades in over Attack and out over Release. In a seamless
	// loop a note held round the loop's end starts at full level and, past the end, fades out
	// quickly over the start it folds onto. Its random numbers are its own (a fixed seed), so the
	// other machines' are the same with Drift or without it.
	if (state.drift && !state.oneShot && (!state.machine || state.machine === 'drift')) {
		const d = state.drift;
		const barS = state.stepsCount * stepDuration;
		const t0 = ctx.currentTime + offsetSeconds;
		const filter = createDriftFilter(ctx, d.voice.cutoff);
		const level = ctx.createGain();
		level.gain.value = clamp01(d.level);
		const send = ctx.createGain();
		send.gain.value = clamp01(d.pedals);
		filter.connect(level);
		if (isDry('drift')) level.connect(dryAround);
		else {
			level.connect(dryOut);
			level.connect(send).connect(reverbToneFilter);
		}
		const driftRandom = seededRandom(6);
		const attackS = d.voice.attack * barS, releaseS = d.voice.release * barS;
		// Motion (the plan's item 19), as live: two points a step from bar 1, through the tail too;
		// Swell at each bar that starts a note (a loop's bars come round in the tail)
		const spreadMod = ctx.createConstantSource();
		spreadMod.offset.value = 0;
		spreadMod.start(t0);
		const runs = driftRuns(d.chords, d.length, bars, !!d.loop);
		const motion: DriftMotion = { shape: d.voice.motionShape, rate: d.voice.motionRate, depth: d.voice.motionDepth ?? 0 };
		if (motionOn(motion)) {
			const chordBars = new Set(runs.filter((r) => !r.carriedIn).map((r) => r.start));
			const base = { x: padX(d.voice.cutoff), y: d.voice.spread };
			const total = Math.ceil((bars * barS + state.tailSeconds) / barS);
			let chordBar: number | null = null;
			let first = true;
			for (let b = 0; b < total; b++) {
				if (b < bars ? chordBars.has(b) : !!d.loop && chordBars.has(b % bars)) chordBar = b;
				for (let i = 0; i < state.stepsCount; i++) {
					for (let j = 0; j < MOTION_POINTS_PER_STEP; j++) {
						const k = i + j / MOTION_POINTS_PER_STEP;
						const pos = b + k / state.stepsCount;
						const at = motionAt(base, motion, pos, chordBar == null ? null : pos - chordBar, d.voice.attack);
						const p = motionParams(base, at);
						const t = t0 + b * barS + k * stepDuration;
						rampTo(filter.detune, t, p.cents, first);
						rampTo(spreadMod.offset, t, p.spread, first);
						first = false;
					}
				}
			}
		}
		for (const run of runs) {
			const note = playDriftNote(ctx, d.voice, {
				freq: d.plateHz[run.plate] ?? 220,
				time: t0 + run.start * barS,
				amp: 1,
				attackS: run.carriedIn ? LOOP_SEAM_S : attackS,
			}, filter, driftRandom, spreadMod);
			note.release(t0 + run.end * barS, run.carriedOut ? LOOP_SEAM_S : releaseS);
		}
	}

	// REV with Next hit, as live: each bar's hits through the pedals, every machine's
	// (pedalHitSteps; with the chain, each bar's own patterns, so a swell at a bar's end comes
	// round to its own first hit, not the next bar's). Whatever is rendered (one machine's stem
	// too), the gates open as in the mix, so the stems still add up.
	if (revOn && revSwell === 'next' && !state.oneShot) {
		const n = state.stepsCount, swingNow = clamp01(state.swing);
		for (let bar = 0; bar < bars; bar++) {
			const pat = patternForBar(state, bar);
			const b = state.bass, d = state.drums;
			const hits = pedalHitSteps({
				rhythm: { steps: pat.active.slice(0, n).map(Boolean), velocities: pat.velocities, pedals: isDry('rhythm') ? 0 : state.rhythmPedals },
				bass: b ? { pattern: b.barPatterns?.length ? b.barPatterns[bar % b.barPatterns.length] : b.pattern, pedals: isDry('bass') ? 0 : b.pedals } : undefined,
				drums: d ? { rows: d.barRows?.length ? d.barRows[bar % d.barRows.length] : d.rows, slotMuted: d.slots.map((sl) => sl.muted), pedals: isDry('drums') ? 0 : d.pedals } : undefined,
			}, n);
			const gaps = nextHitGaps(hits, stepDuration, swingNow);
			const barStart = ctx.currentTime + offsetSeconds + bar * n * stepDuration;
			gaps.forEach((gap, i) => {
				if (gap == null) return;
				openRev(revIrSeconds(swellSeconds('next', stepDuration, gap)), barStart + stepTime(i, stepDuration, swingNow));
			});
		}
	}

	// The pattern, `bars` times over (with the chain, each bar its own pattern)
	for (let bar = 0; bar < bars; bar++) {
	const pat = patternForBar(state, bar);
	const steps = pat.active;
	const velArr = pat.velocities;
	const pitchArr = pat.pitches;
	const waveArr = pat.waveforms;
	for (let stepIndex = 0; stepIndex < state.stepsCount; stepIndex++) {
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

		const padNoiseOn = (pat.noise ?? noiseState.mask)?.[stepIndex] ?? true;

		// Another machine's stem alone: Rhythm doesn't play
		if (!playRhythm) continue;

		// One note, or a ratchet's 2–4 quick hits within the step, as in the live engine
		const span = stepSpan(stepIndex, state.stepsCount, stepDuration, clamp01(state.swing));
		const hitHz = ratchetPitches(freq, pat.ratchets?.[stepIndex], pat.repeatNotes?.[stepIndex], pat.repeatChord ?? []);
		ratchetHits(t, span, pat.ratchets?.[stepIndex]).forEach((hit, k) => playNote(state.synth, {
			freq: hitHz[k] ?? freq,
			amp: baseVel * chanVol,
			vel: baseVel,
			time: hit.time,
			wave,
			addNoise: padNoiseOn,
			maxDuration: hit.maxDuration,
		}, noteWiring));
	}
	}

	// The tape's noise takes its random numbers last, so the notes' are the same with the
	// pedal on or off
	if (tape) {
		const t0 = ctx.currentTime + offsetSeconds;
		tape.startNoise(random, t0, t0 + (state.tapeNoise?.seconds ?? barsSeconds), state.tapeNoise?.fade ?? 0);
	}
}

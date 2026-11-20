// src/audio/liveEngine.ts
// The live sound engine: the AudioContext, the effects graph, the shared LFO, per-note synth
// voices and the step sequencer clock. DrumSequencer.vue owns the settings (as refs) and
// passes them in; the engine only reads them, and follows changes with watchers.
//
// Graph: per-note synth voices → drive (dry + shaper → tone, optionally through the bit
// crusher, → driveSum). From driveSum two paths run in parallel: delay (dry + wet, feedback loop with
// tone filters; plain or ping-pong) and a reverb send (tone filter → pre-delay → convolver → wet gain). Both go to preMaster, and so do the
// noise layer and the sample lanes, which bypass drive, delay and reverb. From preMaster
// everything goes through the tape pedal (tape.ts), or round it while it's off, to masterGain
// → destination. The views' analysers are tapped from masterGain through a 10 Hz high-pass.
//
// WAV export uses a separate offline engine (export/scheduleStepSequencer.ts). Both build
// their notes with note.ts (since PR 112); the effects graph is still built by each, so a
// change to the effects here must be mirrored there, or exports will sound different.
//
// Call useLiveEngine() once, from a component's setup: it registers watchers and
// mount/unmount hooks.

import { ref, computed, watch, onMounted, onBeforeUnmount, type Ref } from 'vue';
import { prepareVoiceWave, type Wave, type PadWave } from './waves';
import { sampleBuffer, SAMPLE_WAVE, type SampleData } from './sample';
import { playNote, type VoiceSettings } from './note';
import { lfoWaveAt, type LfoTarget } from './lfo';
import { createTicker } from './ticker';
import { generateReverbIR } from './reverb/generateIr';
import { clampPreDelayMs, PRE_DELAY_MAX_MS } from './reverb/preDelay';
import { nextHitGaps, revIrSeconds, revKey, reverseIrChannels, swellSeconds } from './reverb/reverse';
import { ratchetHits, ratchetPitches, stepSpan } from './ratchet';
import { createCrusher, loadCrusher, setCrusher } from './crusher';
import { createPingPong } from './pingPong';
import { createTape, tapeSettings, type TapeMode } from './tape';
import { clampUnisonVoices, unisonPhase } from './unison';
import {
	divisionToHz,
	lfoAlignBars,
	generateDriveCurve,
	linearPassthroughCurve,
	generateNoiseBuffers,
	type NoiseKey,
} from './synthHelpers';

type R<T> = Readonly<Ref<T>>;

// The parts of a sequencer lane the engine reads
export type LiveLane = {
	type: 'synth' | 'sample';
	muted: boolean;
	channelVolume: number;
	steps: boolean[];
	velocities: number[];
	pitches?: number[];
	waveforms?: string[];
	ratchets?: number[]; // per step: 1 hit, or 2–4 quick hits (ratchet.ts)
	repeatNotes?: string[]; // per step: what the hits play, 'same' | 'up' | 'down' (ratchet.ts)
	buffer?: AudioBuffer | null;
};

export type LiveEngineSettings = {
	transport: { volume: R<number>; tempo: R<number>; swing: R<number> };
	pattern: {
		lanes: R<LiveLane[]>;
		stepLength: R<number>;
		selectedWaveform: R<PadWave>;
		noiseMask: R<boolean[]>; // per step: may this step add noise?
		repeatChord: R<number[]>; // the key's chord, pitch classes: what Up/Down repeats step through
	};
	envelope: { enabled: R<boolean>; attackMs: R<number>; decayMs: R<number> };
	filter: { enabled: R<boolean>; cutoff: R<number>; resonance: R<number>; envAmount: R<number>; envDecayMs: R<number> };
	noise: { enabled: R<boolean>; color: R<number>; amount: R<number>; attackBurst: R<boolean>; burstMs: R<number> };
	unison: { enabled: R<boolean>; voices: R<number>; maxVoices: R<number>; detuneCents: R<number>; stereoSpread: R<number> };
	lfo: {
		enabled: R<boolean>;
		rate: R<number>;
		depth: R<number>;
		target: R<LfoTarget>;
		waveform: R<'sine' | 'square'>;
		sync: R<boolean>;
		division: R<string>;
		retrigger: R<boolean>; // each note starts the LFO afresh (lfo.ts)
	};
	fm: { enabled: R<boolean>; modFreq: R<number>; index: R<number>; ratio: R<number | null> };
	pitchEnv: { enabled: R<boolean>; semitones: R<number>; decayMs: R<number>; mode: R<'up' | 'down' | 'random'> };
	pulse: { width: R<number> }; // pulse wave's width, % (waves.ts)
	sample: R<SampleData | null>; // the recorded sound, the 'sample' wave (sample.ts)
	sampleLength: R<number>; // how much of it a pad plays, 0.05–1 (sample.ts)
	// Velocity routing amounts, % −100..100 (velocity.ts)
	velocity: { decay: R<number>; cutoff: R<number>; pitchEnv: R<number>; noise: R<number> };
	delay: {
		enabled: R<boolean>;
		time: R<number>;
		feedback: R<number>;
		mix: R<number>;
		toneEnabled: R<boolean>;
		toneHz: R<number>;
		toneType: R<'lowpass' | 'highpass'>;
		pingPong: R<boolean>; // echoes alternate left and right (pingPong.ts)
	};
	drive: { enabled: R<boolean>; type: R<string>; amount: R<number>; tone: R<number>; mix: R<number>; crush: R<boolean> };
	reverb: { enabled: R<boolean>; mix: R<number>; decay: R<number>; tone: R<number>; preDelay: R<number>; reverse: R<boolean>; swell: R<string> };
	// The tape pedal, last in the chain (tape.ts): age and wobble 0..1
	tape: { enabled: R<boolean>; age: R<number>; wobble: R<number>; mode: R<TapeMode> };
	// Called just before a bar's first step is built (about 100 ms before it sounds), so a
	// change waiting for the bar (DrumSequencer's BAR QUEUE) is applied in time for it
	onBarStart?: () => void;
};

export function useLiveEngine(s: LiveEngineSettings) {
	const { volume, tempo, swing } = s.transport;
	const { lanes, stepLength, selectedWaveform, noiseMask } = s.pattern;

	const synthDecay = computed(() => s.envelope.decayMs.value / 1000);

	const isPlaying = ref(false);
	const currentStep = ref(-1);

	// Context + master START

	// Created suspended by the browser; resumed on the first Play (or by MIDI)
	const AC = window.AudioContext || (window as any).webkitAudioContext;
	const audioCtx: AudioContext = new AC();

	const masterGain = audioCtx.createGain();
	masterGain.gain.value = volume.value;
	masterGain.connect(audioCtx.destination);

	// The views' tap (PR 108): a 10 Hz high-pass first, so the drive's DC offset (see "Dropped
	// after PR 30" in CLAUDE.md) doesn't show as a block at the bottom of the spectrum. Only the
	// views hear it; the speakers get masterGain as before.
	const viewTap = audioCtx.createBiquadFilter();
	viewTap.type = 'highpass';
	viewTap.frequency.value = 10;
	viewTap.Q.value = 0.707;
	masterGain.connect(viewTap);

	// The scope and spectrogram analyser (the rail's monitor; phone mode's tiny scope)
	const analyser = audioCtx.createAnalyser();
	analyser.fftSize = 2048;
	viewTap.connect(analyser);
	analyser.smoothingTimeConstant = 0.8;
	analyser.minDecibels = -90;
	analyser.maxDecibels = -10;

	// A finer one for the spectrum behind the Filter card's curve and the Melody Maker's tuner:
	// 8192 points, about 6 Hz a bin at 48 kHz, so the low end is drawn and not a wall of empty
	// columns (PR 108; the big screen's Spectrum read the 2048-point one, about 23 Hz a bin)
	const fineAnalyser = audioCtx.createAnalyser();
	fineAnalyser.fftSize = 8192;
	viewTap.connect(fineAnalyser);
	fineAnalyser.smoothingTimeConstant = 0.6;
	fineAnalyser.minDecibels = -90;
	fineAnalyser.maxDecibels = -10;

	watch(volume, val => {
		masterGain.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
	});

	// Context + master END

	// Tape START

	// Everything on its way to the master meets here, and goes through the tape pedal or,
	// while it's off, round it (tape.ts)
	const preMaster = audioCtx.createGain();
	const tapeAround = audioCtx.createGain();
	const tapeThrough = audioCtx.createGain();
	const tape = createTape(audioCtx);
	preMaster.connect(tapeAround).connect(masterGain);
	preMaster.connect(tape.input);
	preMaster.connect(tape.sidechain);
	tape.output.connect(tapeThrough).connect(masterGain);

	// The tape's own noise (hiss, crackle) plays while something does: the sequencer, or a
	// note played by hand until a second after it ends. Its buffers are made when the pedal is
	// first turned on.
	const tapeNoiseGate = audioCtx.createGain();
	tapeNoiseGate.gain.value = 0;
	tape.noise.connect(tapeNoiseGate).connect(tapeThrough);
	let tapeNoiseStarted = false;
	const TAPE_NOISE_HOLD_S = 1;    // how long the noise stays after the sound
	const TAPE_NOISE_FADE_S = 0.25; // then it fades (a time constant),
	const TAPE_NOISE_GONE_S = 2;    // and is gone this long after the hold

	function applyTapeEnabled(now = false) {
		const on = s.tape.enabled.value;
		if (on && !tapeNoiseStarted) {
			tapeNoiseStarted = true;
			tape.startNoise(Math.random);
		}
		const t = audioCtx.currentTime;
		if (now) {
			tapeAround.gain.setValueAtTime(on ? 0 : 1, t);
			tapeThrough.gain.setValueAtTime(on ? 1 : 0, t);
		} else {
			tapeAround.gain.setTargetAtTime(on ? 0 : 1, t, 0.005);
			tapeThrough.gain.setTargetAtTime(on ? 1 : 0, t, 0.005);
		}
	}
	const currentTape = () => tapeSettings(s.tape.age.value, s.tape.wobble.value, s.tape.mode.value);
	tape.apply(currentTape());
	applyTapeEnabled(true);
	watch(s.tape.enabled, () => applyTapeEnabled());
	watch([s.tape.age, s.tape.wobble, s.tape.mode], () => tape.apply(currentTape(), true));

	// The noise from `from` on; with `until`, it goes a moment after that
	function holdTapeNoise(from: number, until?: number) {
		const g = tapeNoiseGate.gain;
		g.cancelScheduledValues(from);
		g.setTargetAtTime(1, from, 0.02);
		if (until !== undefined) {
			g.setTargetAtTime(0, until + TAPE_NOISE_HOLD_S, TAPE_NOISE_FADE_S);
			g.setValueAtTime(0, until + TAPE_NOISE_HOLD_S + TAPE_NOISE_GONE_S);
		}
	}
	watch(isPlaying, (playing) => {
		const t = audioCtx.currentTime;
		if (playing) holdTapeNoise(t);
		else holdTapeNoise(t, t);
	});

	// Tape END

	// Delay START

	const { time: delayTime, feedback: delayFeedback, mix: delayMix, enabled: delayEnabled } = s.delay;

	const delayNode = audioCtx.createDelay(5.0);
	delayNode.delayTime.setValueAtTime(delayTime.value, audioCtx.currentTime);

	const feedbackGain = audioCtx.createGain();
	feedbackGain.gain.value = delayFeedback.value;

	const delayWet = audioCtx.createGain();
	const delayDry = audioCtx.createGain();

	function applyDelayEnabled(on: boolean) {
		const t = audioCtx.currentTime;
		if (on) {
			delayWet.gain.setValueAtTime(delayMix.value, t);
			delayDry.gain.setValueAtTime(1 - delayMix.value, t);
		} else {
			delayWet.gain.setValueAtTime(0, t);
			delayDry.gain.setValueAtTime(1, t);
		}
	}
	applyDelayEnabled(delayEnabled.value);

	const fbTone = audioCtx.createBiquadFilter();
	fbTone.type = 'lowpass';
	fbTone.frequency.value = 5000;

	// wet path tone (colors first echo)
	const wetTone = audioCtx.createBiquadFilter();
	wetTone.type = 'lowpass';
	wetTone.frequency.value = 5000;

	delayNode.connect(fbTone);
	fbTone.connect(feedbackGain);
	feedbackGain.connect(delayNode);

	delayNode.connect(wetTone);
	wetTone.connect(delayWet);

	// The PING PONG switch picks which delay the sound goes into (a send each); echoes already
	// in the other one ring out
	const delayMonoSend = audioCtx.createGain();
	delayMonoSend.connect(delayNode);
	const pingPong = createPingPong(audioCtx);
	pingPong.output.connect(delayWet);
	for (const d of pingPong.delays) d.delayTime.setValueAtTime(delayTime.value, audioCtx.currentTime);
	for (const g of pingPong.feedback) g.gain.value = delayFeedback.value;

	function applyPingPong(on: boolean, now = false) {
		const t = audioCtx.currentTime;
		if (now) {
			delayMonoSend.gain.setValueAtTime(on ? 0 : 1, t);
			pingPong.input.gain.setValueAtTime(on ? 1 : 0, t);
		} else {
			delayMonoSend.gain.setTargetAtTime(on ? 0 : 1, t, 0.005);
			pingPong.input.gain.setTargetAtTime(on ? 1 : 0, t, 0.005);
		}
	}
	applyPingPong(s.delay.pingPong.value, true);
	watch(s.delay.pingPong, on => applyPingPong(on));

	watch(delayTime, val => {
		const t = audioCtx.currentTime;
		for (const d of [delayNode, ...pingPong.delays]) {
			const current = d.delayTime.value;
			d.delayTime.cancelScheduledValues(t);
			d.delayTime.setValueAtTime(current, t);
			d.delayTime.linearRampToValueAtTime(val, t + 0.03);
		}
	});
	watch(delayFeedback, val => {
		for (const g of [feedbackGain, ...pingPong.feedback]) g.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
	});
	watch(delayMix, val => {
		const t = audioCtx.currentTime;
		if (delayEnabled.value) {
			delayWet.gain.setTargetAtTime(val, t, 0.02);
			delayDry.gain.setTargetAtTime(1 - val, t, 0.02);
		} else {
			// keep dry when disabled
			delayWet.gain.setValueAtTime(0, t);
			delayDry.gain.setValueAtTime(1, t);
		}
	});

	function applyDelayToneState() {
		const type = s.delay.toneEnabled.value
			? (s.delay.toneType.value === 'highpass' ? 'highpass' : 'lowpass')
			: 'allpass'; // click-free bypass

		const targetHz = s.delay.toneEnabled.value ? s.delay.toneHz.value : 20000;
		const t = audioCtx.currentTime;
		for (const f of [fbTone, wetTone, ...pingPong.tones]) {
			f.type = type;
			f.frequency.setTargetAtTime(targetHz, t, 0.02);
		}
	}

	watch([s.delay.toneEnabled, s.delay.toneType, s.delay.toneHz], applyDelayToneState);
	onMounted(applyDelayToneState);

	watch(delayEnabled, on => {
		applyDelayEnabled(on);
	});

	// Delay END

	// Drive START

	const { enabled: driveEnabled, type: driveType, amount: driveAmount, tone: driveTone, mix: driveMix, crush: driveCrush } = s.drive;

	// Drive node chain
	const driveShaper = audioCtx.createWaveShaper();
	const driveToneFilter = audioCtx.createBiquadFilter();
	driveToneFilter.type = 'lowpass';

	const driveDry = audioCtx.createGain();
	const driveWet = audioCtx.createGain();

	//  sum both drive paths before delay
	const driveSum = audioCtx.createGain();
	const driveMakeup = audioCtx.createGain();
	driveMakeup.gain.value = 1.0;

	// connections inside Drive. The CRUSH switch fades between the tone filter straight on and
	// through the bit crusher (crusher.ts), which joins once its worklet has loaded.
	const crushBypass = audioCtx.createGain();
	const crushWet = audioCtx.createGain();
	crushWet.gain.value = 0;
	driveShaper.connect(driveToneFilter);
	driveToneFilter.connect(crushBypass).connect(driveMakeup);
	crushWet.connect(driveMakeup);
	let crusher: AudioWorkletNode | null = null;
	function applyCrush() {
		const on = driveCrush.value && !!crusher;
		const t = audioCtx.currentTime;
		crushBypass.gain.setTargetAtTime(on ? 0 : 1, t, 0.005);
		crushWet.gain.setTargetAtTime(on ? 1 : 0, t, 0.005);
	}
	loadCrusher(audioCtx).then(ok => {
		if (!ok) return;
		crusher = createCrusher(audioCtx, driveAmount.value);
		if (!crusher) return;
		driveToneFilter.connect(crusher).connect(crushWet);
		applyCrush();
	});
	watch(driveCrush, applyCrush);
	watch(driveAmount, amount => {
		if (crusher) setCrusher(crusher, audioCtx, amount);
	});
	driveMakeup.connect(driveWet);

	// gains set by mix
	driveWet.gain.value = driveMix.value;
	driveDry.gain.value = 1 - driveMix.value;

	//  IMPORTANT: feed the sum, not the delay directly
	driveDry.connect(driveSum);
	driveWet.connect(driveSum);

	// Now feed delay chain **from the sum** (same for all cases)
	driveSum.connect(delayDry);
	driveSum.connect(delayMonoSend);
	driveSum.connect(pingPong.input);

	watch([driveType, driveAmount], ([type, amount]) => {
		driveShaper.curve = generateDriveCurve(type, amount);
		driveMakeup.gain.setTargetAtTime(1 + amount * 0.1, audioCtx.currentTime, 0.01);
	});

	watch(driveTone, hz => {
		driveToneFilter.frequency.setValueAtTime(hz, audioCtx.currentTime);
	});

	watch(driveMix, val => {
		driveWet.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
		driveDry.gain.setTargetAtTime(1 - val, audioCtx.currentTime, 0.01);
	});

	function initDriveNow() {
		const t = audioCtx.currentTime;

		// Ensure the shaper actually has a curve before any audio hits it
		driveShaper.curve = generateDriveCurve(driveType.value, driveAmount.value);
		driveShaper.oversample = '2x';

		// Anchor params so setTargetAtTime works consistently in all browsers
		driveToneFilter.frequency.setValueAtTime(driveTone.value, t);

		// Make sure wet/dry reflect current mix
		driveWet.gain.setValueAtTime(driveMix.value, t);
		driveDry.gain.setValueAtTime(1 - driveMix.value, t);
	}

	watch(driveEnabled, on => {
		if (on) initDriveNow();
	});
	driveShaper.curve = linearPassthroughCurve();
	onMounted(initDriveNow);

	// Drive END

	// Reverb START

	const { enabled: reverbEnabled, mix: reverbMix, decay: reverbDecay, tone: reverbTone, preDelay: reverbPreDelayMs, reverse: reverbReverse, swell: reverbSwell } = s.reverb;
	// The plain reverb's level: none while REV plays the reverb backwards instead
	const plainWet = () => (reverbEnabled.value && !reverbReverse.value ? reverbMix.value : 0);

	let reverbConvolver = audioCtx.createConvolver();
	const reverbToneFilter = audioCtx.createBiquadFilter();
	reverbToneFilter.type = 'lowpass';
	// PRE: the send waits this long before the convolver, so the hit stays dry for a moment
	// (reverb/preDelay.ts). Echoes already in the tail carry on; a turn bends the send's pitch
	// briefly, as a delay's time does.
	const reverbPreDelay = audioCtx.createDelay(PRE_DELAY_MAX_MS / 1000 + 0.01);
	reverbPreDelay.delayTime.value = clampPreDelayMs(reverbPreDelayMs.value) / 1000;
	reverbToneFilter.connect(reverbPreDelay);
	watch(reverbPreDelayMs, (v) => {
		reverbPreDelay.delayTime.setTargetAtTime(clampPreDelayMs(v) / 1000, audioCtx.currentTime, 0.03);
	});

	let reverbWet = audioCtx.createGain();

	// Track whether we've initialized the IR at least once
	let reverbIrReady = false;

	// Debounce handle so we don't regenerate on every tiny knob tick
	let reverbIrUpdateTimer: number | null = null;

	// Cross-fade between old and new IR to avoid chopping tails
	function swapReverbIRSmooth(newBuffer: AudioBuffer) {
		const oldConvolver = reverbConvolver;
		const oldWet = reverbWet;

		// New convolver + wet gain
		const newConvolver = audioCtx.createConvolver();
		newConvolver.buffer = newBuffer;

		const newWet = audioCtx.createGain();
		newWet.gain.value = 0;

		// Wire in parallel
		reverbPreDelay.connect(newConvolver);
		newConvolver.connect(newWet);
		newWet.connect(preMaster);

		const fadeTime = 0.25; // seconds
		const now = audioCtx.currentTime;
		const targetWet = plainWet();

		// Fade new IR up
		newWet.gain.setValueAtTime(0, now);
		newWet.gain.linearRampToValueAtTime(targetWet, now + fadeTime);

		// Fade old IR down
		oldWet.gain.setValueAtTime(oldWet.gain.value, now);
		oldWet.gain.linearRampToValueAtTime(0, now + fadeTime);

		// After fade, disconnect old chain and update references
		setTimeout(() => {
			try { reverbPreDelay.disconnect(oldConvolver); } catch { }
			try { oldConvolver.disconnect(); } catch { }
			try { oldWet.disconnect(); } catch { }

			reverbConvolver = newConvolver;
			reverbWet = newWet;
		}, fadeTime * 1000 + 50);
	}

	// Drive sum → tone filter → pre-delay → convolver → wet gain → the tape pedal, then the master
	driveSum.connect(reverbToneFilter);
	reverbPreDelay.connect(reverbConvolver);
	reverbConvolver.connect(reverbWet);
	reverbWet.connect(preMaster);
	reverbWet.gain.value = 0;

	function ensureReverbIR() {
		const buf = generateReverbIR(audioCtx as any, {
			decaySeconds: reverbDecay.value,
			sampleRate: audioCtx.sampleRate,
			stereo: true,
			seed: 1337,
		});

		// First-time init: no need to cross-fade, just assign
		if (!reverbIrReady || !reverbConvolver.buffer) {
			reverbConvolver.buffer = buf;
			reverbIrReady = true;
			return;
		}

		// Subsequent changes: smooth swap so the current tail isn't chopped
		swapReverbIRSmooth(buf);
	}

	// Debounce decay changes so we only rebuild IR once the knob slows down
	watch(reverbDecay, () => {
		if (reverbIrUpdateTimer != null) {
			clearTimeout(reverbIrUpdateTimer);
		}
		reverbIrUpdateTimer = window.setTimeout(() => {
			reverbIrUpdateTimer = null;
			ensureReverbIR();
		}, 120); // ~1–2 frames of pause before rebuilding
	});

	// Map 0..1 tone → lowpass frequency (dark → bright)
	function applyReverbTone() {
		const t = Math.max(0, Math.min(1, reverbTone.value));
		const minHz = 800;
		const maxHz = 12000;
		const freq = minHz * Math.pow(maxHz / minHz, t); // exponential-ish
		const now = audioCtx.currentTime;
		reverbToneFilter.frequency.setTargetAtTime(freq, now, 0.05);
	}

	watch(reverbTone, applyReverbTone);
	onMounted(() => {
		applyReverbTone();
	});

	// Enable/disable reverb, its mix, and REV (which plays the reverb backwards instead)
	watch([reverbEnabled, reverbMix, reverbReverse], () => {
		const t = audioCtx.currentTime;
		if (reverbEnabled.value && !reverbConvolver.buffer) ensureReverbIR();
		reverbWet.gain.setTargetAtTime(plainWet(), t, 0.03);
		applyRevLevel();
	});

	// Reverb END

	// REV START
	// The reverb backwards (reverb/reverse.ts): after PRE the send goes into one reversed
	// impulse response per swell length in use, each behind a gate; a hit opens its own gate as
	// it reaches it, so its swell lasts until the next hit (Next hit) or SWELL's fixed length.
	// The gates switch with a 3 ms glide, and a convolver whose gate shuts plays on, so a swell
	// already rising finishes. While stopped (MIDI notes, previews) the gate for a beat's swell
	// is open (Next hit), or SWELL's own.
	const revWet = audioCtx.createGain();
	revWet.gain.value = 0;
	revWet.connect(preMaster);
	type RevChain = { gate: GainNode; conv: ConvolverNode; usedAt: number };
	const revChains = new Map<number, RevChain>();
	const REV_CHAINS_MAX = 10;

	function revBuffer(seconds: number): AudioBuffer {
		const chs = reverseIrChannels(seconds, audioCtx.sampleRate);
		const buf = audioCtx.createBuffer(2, chs[0].length, audioCtx.sampleRate);
		chs.forEach((d, i) => buf.copyToChannel(d as Float32Array<ArrayBuffer>, i));
		return buf;
	}

	function revChain(key: number): RevChain {
		let c = revChains.get(key);
		if (!c) {
			// Make room: drop the longest-unused chain whose swell has surely finished
			if (revChains.size >= REV_CHAINS_MAX) {
				const now = audioCtx.currentTime;
				const old = [...revChains.entries()].filter(([k, ch]) => ch.usedAt + k / 1000 + 1 < now)
					.sort((a, b) => a[1].usedAt - b[1].usedAt)[0];
				if (old) {
					try { reverbPreDelay.disconnect(old[1].gate); } catch { }
					old[1].gate.disconnect();
					old[1].conv.disconnect();
					revChains.delete(old[0]);
				}
			}
			const gate = audioCtx.createGain();
			gate.gain.value = 0;
			const conv = audioCtx.createConvolver();
			conv.normalize = false;
			conv.buffer = revBuffer(key / 1000);
			reverbPreDelay.connect(gate).connect(conv).connect(revWet);
			c = { gate, conv, usedAt: audioCtx.currentTime };
			revChains.set(key, c);
		}
		return c;
	}

	// Open the gate for a swell this long (s) at `at`, and shut the others
	function openRev(irSeconds: number, at: number) {
		const key = revKey(irSeconds);
		const chain = revChain(key);
		chain.usedAt = Math.max(chain.usedAt, at);
		for (const [k, c] of revChains) c.gate.gain.setTargetAtTime(k === key ? 1 : 0, at, 0.003);
	}

	const revStepS = () => 60 / tempo.value / 4;
	const revPreS = () => clampPreDelayMs(reverbPreDelayMs.value) / 1000;

	// What's open while nothing is scheduled: SWELL's fixed length, or a beat for Next hit
	function openRevAtRest() {
		if (!reverbReverse.value) return;
		const now = audioCtx.currentTime;
		for (const c of revChains.values()) c.gate.gain.cancelScheduledValues(now);
		openRev(revIrSeconds(swellSeconds(reverbSwell.value, revStepS(), null), revPreS()), now);
	}

	// A step that's on, played at `t` (the swung step time): with Next hit, its swell lasts until
	// the next step that's on (the pattern as it is now); its gate opens as the hit reaches it
	function revForStep(stepIdx: number, active: readonly boolean[], t: number) {
		if (!reverbReverse.value || reverbSwell.value !== 'next') return;
		const gap = nextHitGaps(active, revStepS(), swing.value)[stepIdx];
		openRev(revIrSeconds(swellSeconds('next', revStepS(), gap), revPreS()), t + revPreS());
	}

	function applyRevLevel() {
		const on = reverbEnabled.value && reverbReverse.value;
		revWet.gain.setTargetAtTime(on ? reverbMix.value : 0, audioCtx.currentTime, 0.03);
		if (on) openRevAtRest();
	}
	// A new length, tempo or PRE: the gate for it (the sequencer's next hits take over again)
	watch([reverbSwell, tempo, reverbPreDelayMs], openRevAtRest);
	onMounted(applyRevLevel);
	// REV END

	// LFO START

	// The LFO's rate is always its division at the tempo (lfo.rate and lfo.sync are saved, but
	// the free rate in Hz went in PR 66)
	const { enabled: lfoEnabled, depth: lfoDepth, target: lfoTarget, waveform: lfoWaveform, division: lfoDivision, retrigger: lfoRetrigger } = s.lfo;

	//  LFO source + core gain. One shared oscillator; each note taps lfoGain.
	let lfoOsc: OscillatorNode | null = null;
	const lfoGain = audioCtx.createGain();
	lfoGain.gain.value = 0;

	function currentLfoHz() {
		return divisionToHz(lfoDivision.value, tempo.value);
	}

	function stopLfo() {
		if (lfoOsc) { try { lfoOsc.stop(); } catch { } lfoOsc.disconnect(); lfoOsc = null; }
	}

	// Where the LFO is now (−1..1), for the LFO visualizer (DrumSequencer shows it on the
	// control the LFO moves): a tiny AnalyserNode on the LFO oscillator, read on demand. An
	// analyser is processed even though it isn't connected to the speakers.
	const lfoProbe = audioCtx.createAnalyser();
	lfoProbe.fftSize = 32;
	const lfoProbeBuf = new Float32Array(lfoProbe.fftSize);
	// With Retrigger, each note runs its own LFO from its start: show where the latest note's is
	const noteStarts: number[] = []; // audio times of the latest notes' starts (some ahead)
	function lfoNow(): number | null {
		if (!lfoOsc || audioCtx.state !== 'running') return null;
		if (lfoRetrigger.value) {
			const now = audioCtx.currentTime;
			const started = noteStarts.filter((t) => t <= now);
			if (!started.length) return null;
			return lfoWaveAt(lfoWaveform.value, currentLfoHz(), now - Math.max(...started));
		}
		lfoProbe.getFloatTimeDomainData(lfoProbeBuf);
		const v = lfoProbeBuf[lfoProbeBuf.length - 1];
		return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : null;
	}

	// Is anything sounding? The sequencer is playing, or a note (MIDI) started in the last
	// `ms`. The LFO visualizer only moves then.
	let lastNoteAt = -Infinity;
	const soundingRecently = (ms = 1500) => isPlaying.value || performance.now() - lastNoteAt < ms;

	function ensureLfoSource() {
		stopLfo();

		const hz = currentLfoHz();
		lfoOsc = audioCtx.createOscillator();
		lfoOsc.type = lfoWaveform.value;
		lfoOsc.frequency.setValueAtTime(hz, audioCtx.currentTime);
		lfoOsc.connect(lfoGain);
		lfoOsc.connect(lfoProbe);
		lfoOsc.start();
	}

	// Start the LFO's cycle afresh at `when` (a bar's step 1, see schedule()): a new oscillator
	// takes over from the old one at that moment, so the wave begins at its start in step with
	// the pattern, as a hardware LFO synced to the clock does. With the tempo unchanged the
	// old one is just finishing a cycle there, so nothing jumps.
	function restartLfoAt(when: number) {
		if (!lfoEnabled.value) return;
		const old = lfoOsc;
		const osc = audioCtx.createOscillator();
		osc.type = lfoWaveform.value;
		osc.frequency.value = currentLfoHz();
		osc.connect(lfoGain);
		osc.connect(lfoProbe);
		osc.start(when);
		lfoOsc = osc;
		if (old) {
			try { old.stop(when); } catch { }
			old.onended = () => old.disconnect();
		}
	}

	function startLfoIfNeeded(): void {
		if (!lfoEnabled.value) return;
		if (lfoOsc) return;

		if (audioCtx.state === 'running') {
			ensureLfoSource();
			return;
		}
		const onStateChange = () => {
			if (audioCtx.state === 'running') {
				ensureLfoSource();
				audioCtx.removeEventListener?.('statechange', onStateChange);
			}
		};
		audioCtx.addEventListener?.('statechange', onStateChange);
	}

	watch(lfoEnabled, (on) => {
		if (on) startLfoIfNeeded();
		else stopLfo();
	});

	watch([lfoWaveform, lfoDivision, tempo], () => {
		if (!lfoEnabled.value) return;

		if (!lfoOsc) {
			startLfoIfNeeded();
			return;
		}

		lfoOsc.type = lfoWaveform.value;
		lfoOsc.frequency.setValueAtTime(currentLfoHz(), audioCtx.currentTime);
	});


	function applyDepthScale() {
		const t = audioCtx.currentTime;
		switch (lfoTarget.value) {
			case 'pitch':
				lfoGain.gain.setValueAtTime(lfoDepth.value, t);
				break;
			case 'filter':
			case 'pwm':
			case 'amp':
			case 'fm':
				lfoGain.gain.setValueAtTime(lfoDepth.value, t);
				break;

		}
	}
	watch([lfoDepth, lfoTarget], applyDepthScale);
	applyDepthScale();

	// Detach a note's LFO tap from the LFO once the note has finished. Without this, every
	// note ever played stays connected to the shared LFO and the nodes pile up. (A note's own
	// LFO, with Retrigger, goes when its oscillator stops.)
	function releaseLfoTap(tap: AudioNode, ...rest: AudioNode[]) {
		try { lfoGain.disconnect(tap); } catch { /* not connected to the shared LFO */ }
		tap.disconnect();
		rest.forEach(n => n.disconnect());
	}

	// LFO END

	// Noise buffers START

	let noiseBuffers: Record<NoiseKey, AudioBuffer | null> = {
		brown: null, pink: null, white: null, blue: null, violet: null
	};
	onMounted(() => { noiseBuffers = generateNoiseBuffers(audioCtx); });

	// Noise buffers END

	// Synth voice START

	// `velocity` is the note's loudness (its step's velocity × the lane's volume); `opts.vel` is
	// the step's (or MIDI note's) own velocity 0..1, for velocity routing (velocity.ts)
	// opts.maxDuration: a ratchet hit ends by then, where the next hit begins (ratchet.ts)
	function playSynthNote(freq: number, velocity: number, decayTime: number, startTime: number, waveType: Wave | string, opts: { addNoise?: boolean; vel?: number; maxDuration?: number } = {}) {

		lastNoteAt = performance.now();
		noteStarts.push(startTime);
		if (noteStarts.length > 8) noteStarts.shift();

		// The note itself is built by note.ts, as in the export engine
		const { end } = playNote(voiceNow(), {
			freq, amp: velocity, vel: opts.vel, time: startTime, wave: waveType,
			addNoise: opts.addNoise, maxDuration: opts.maxDuration, decaySeconds: decayTime,
		}, {
			ctx: audioCtx,
			toneOut: driveEnabled.value ? [driveDry, driveShaper] : [driveSum],
			noiseOut: preMaster,
			noiseBuffers,
			sample: waveType === SAMPLE_WAVE ? sampleBuffer(s.sample.value) : null,
			lfo: lfoGain,
			release: releaseLfoTap,
		});

		// A note played by hand (MIDI, a preview) brings the tape's noise with it
		if (s.tape.enabled.value && !isPlaying.value) holdTapeNoise(startTime, end);
	}

	// The voice's settings now, as the plain object note.ts reads (the export state's `synth`
	// has the same shape)
	function voiceNow(): VoiceSettings {
		return {
			envelope: { enabled: s.envelope.enabled.value, attackMs: s.envelope.attackMs.value, decayMs: s.envelope.decayMs.value },
			filter: {
				enabled: s.filter.enabled.value, cutoff: s.filter.cutoff.value, resonance: s.filter.resonance.value,
				envAmount: s.filter.envAmount.value, envDecayMs: s.filter.envDecayMs.value,
			},
			noise: {
				enabled: s.noise.enabled.value, color: s.noise.color.value, amount: s.noise.amount.value,
				attackBurst: s.noise.attackBurst.value, burstMs: s.noise.burstMs.value,
			},
			unison: {
				enabled: s.unison.enabled.value,
				voices: Math.min(s.unison.maxVoices.value, clampUnisonVoices(s.unison.voices.value)),
				detuneCents: s.unison.detuneCents.value, stereoSpread: s.unison.stereoSpread.value,
			},
			lfo: {
				enabled: lfoEnabled.value, target: lfoTarget.value, waveform: lfoWaveform.value,
				depth: lfoDepth.value, rateHz: currentLfoHz(), retrigger: lfoRetrigger.value,
			},
			fm: { enabled: s.fm.enabled.value, modFreq: s.fm.modFreq.value, index: s.fm.index.value, ratio: s.fm.ratio.value },
			pitchEnv: {
				enabled: s.pitchEnv.enabled.value, semitones: s.pitchEnv.semitones.value,
				decayMs: s.pitchEnv.decayMs.value, mode: s.pitchEnv.mode.value,
			},
			pulse: { width: s.pulse.width.value },
			sampleLength: s.sampleLength.value,
			velocity: {
				decay: s.velocity.decay.value, cutoff: s.velocity.cutoff.value,
				pitchEnv: s.velocity.pitchEnv.value, noise: s.velocity.noise.value,
			},
		};
	}

	delayDry.connect(preMaster);
	delayWet.connect(preMaster);

	// Unison: build the waves its voices start with as soon as the setting changes, rather
	// than on the first note (a few ms each, too long for a MIDI note played 3 ms ahead)
	watch([s.unison.enabled, s.unison.voices, s.unison.stereoSpread, s.unison.maxVoices, selectedWaveform], () => {
		if (!s.unison.enabled.value) return;
		const n = Math.min(s.unison.maxVoices.value, clampUnisonVoices(s.unison.voices.value));
		for (let i = 0; i < n; i++) prepareVoiceWave(audioCtx, selectedWaveform.value, unisonPhase(i, n, s.unison.stereoSpread.value));
	}, { immediate: true });

	// Synth voice END

	// Samples START (only the hidden drum lanes use these)

	function playBuffer(buffer: AudioBuffer, time: number, amp = 1) {
		const source = audioCtx.createBufferSource();
		source.buffer = buffer;
		const gain = audioCtx.createGain();
		gain.gain.setValueAtTime(Math.max(0.0001, amp), time); // no master volume here
		source.connect(gain).connect(preMaster);
		source.start(time);
	}

	async function loadSample(url: string) {
		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.arrayBuffer();
			return await audioCtx.decodeAudioData(data);
		} catch (err) {
			console.error(`Failed to load or decode sample: ${url}`, err);
			return null;
		}
	}

	// Samples END

	// Sequencer clock START

	// Every tick schedules the steps that start within the next SCHEDULE_AHEAD_S seconds. The
	// ticker runs in a Web Worker (see ticker.ts) so playback keeps going in background tabs.
	const SCHEDULE_AHEAD_S = 0.1;
	const sequencerTicker = createTicker(schedule, 25);

	let startTime = 0;
	let stepIndex = 0;
	let barCount = 0; // bars started since Play, for the LFO's restarts

	function hardStopSequencer() {
		sequencerTicker.stop();
		openRevAtRest(); // REV: the gate for a note with no next hit
		isPlaying.value = false;
		currentStep.value = -1;
		stepIndex = 0;
		startTime = audioCtx.currentTime;
	}

	// Where the bar is now, in steps from its start (2.5: halfway through the third step), or
	// null while stopped: the Melody Maker's playhead. `leadS` looks that far ahead of the
	// audio clock; the pads light when their step is scheduled, up to SCHEDULE_AHEAD_S early.
	function barPosition(leadS = 0): number | null {
		if (!isPlaying.value) return null;
		const stepDuration = 60 / tempo.value / 4;
		const len = stepLength.value;
		const pos = stepIndex - (startTime - (audioCtx.currentTime + leadS)) / stepDuration;
		return ((pos % len) + len) % len;
	}

	function schedule() {
		const now = audioCtx.currentTime;
		const stepDuration = 60 / tempo.value / 4;

		// If the clock fell more than a step behind (computer asleep, page busy), don't play
		// every missed step at once: skip to the next step that is still ahead, keeping the
		// pattern position where it would have been.
		if (startTime < now - stepDuration) {
			const missed = Math.ceil((now - startTime) / stepDuration);
			startTime += missed * stepDuration;
			barCount += Math.floor((stepIndex + missed) / stepLength.value);
			stepIndex = (stepIndex + missed) % stepLength.value;
		}

		while (startTime < now + SCHEDULE_AHEAD_S) {
			if (stepIndex === 0) {
				s.onBarStart?.();
				// The LFO starts its cycle on bar 1 and again on each bar line where a cycle
				// begins (every 4 bars for a 4-bar rate, every bar for 1/8), so it moves with
				// the pattern (and comes back into step after a tempo change)
				if (barCount % lfoAlignBars(lfoDivision.value) === 0) restartLfoAt(startTime);
				barCount++;
			}
			lanes.value.forEach(inst => {
				if (!inst.muted && inst.steps[stepIndex]) {
					const vel = inst.velocities[stepIndex] ?? 1;
					const chanVol = inst.channelVolume ?? 1;
					const amp = Math.min(1, chanVol * vel);

					const pitch = inst.pitches?.[stepIndex] || 220;
					const safeDecay = (isFinite(synthDecay.value) && synthDecay.value > 0) ? synthDecay.value : 0.1;

					// Swing delays every second step (2, 4, 6, ... counting from 1)
					const isEvenStep = stepIndex % 2 === 1;
					const swingOffset = isEvenStep ? stepDuration * swing.value : 0;
					const t = startTime + swingOffset;

					if (inst.type === 'synth') {
						const wf = (inst.waveforms?.[stepIndex] ?? selectedWaveform.value) as PadWave;
						const padNoiseOn = noiseMask.value?.[stepIndex] ?? true;

						// One note, or a ratchet's 2–4 quick hits within the step (ratchet.ts).
						// The noise mask makes noise per step.
						const span = stepSpan(stepIndex, stepLength.value, stepDuration, swing.value);
						// Up or Down repeats step through the key's chord (ratchetPitches)
						const hitHz = ratchetPitches(pitch, inst.ratchets?.[stepIndex], inst.repeatNotes?.[stepIndex], s.pattern.repeatChord.value);
						// REV with Next hit: this hit's swell lasts until the next step that's on
						revForStep(stepIndex, inst.steps.slice(0, stepLength.value).map(Boolean), t);
						ratchetHits(t, span, inst.ratchets?.[stepIndex]).forEach((hit, k) => {
							playSynthNote(hitHz[k] ?? pitch, amp, safeDecay, hit.time, wf, { addNoise: padNoiseOn, vel, maxDuration: hit.maxDuration });
						});

					} else if (inst.buffer) {
						playBuffer(inst.buffer, t, amp);
					}
				}
			});

			currentStep.value = stepIndex;
			stepIndex = (stepIndex + 1) % stepLength.value;
			startTime += stepDuration;
		}
	}

	async function togglePlay() {
		if (isPlaying.value) {
			// STOP
			hardStopSequencer();
			return;
		} else {
			// START
			if (audioCtx.state === 'suspended') {
				await audioCtx.resume();
			}
			startLfoIfNeeded();
			startTime = audioCtx.currentTime;
			stepIndex = 0;
			barCount = 0;
			isPlaying.value = true;
			schedule();
			sequencerTicker.start();
		}
	}

	// Sequencer clock END

	onBeforeUnmount(() => {
		hardStopSequencer();
		stopLfo();
		sequencerTicker.dispose();
	});

	return {
		audioCtx,
		analyser,
		fineAnalyser,
		isPlaying,
		currentStep,
		playSynthNote,
		startLfoIfNeeded,
		lfoNow,
		soundingRecently,
		barPosition,
		togglePlay,
		hardStopSequencer,
		loadSample,
	};
}

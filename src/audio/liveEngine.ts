// src/audio/liveEngine.ts
// The live sound engine: the AudioContext, the effects graph, the shared LFO, per-note synth
// voices and the step sequencer clock. DrumSequencer.vue owns the settings (as refs) and
// passes them in; the engine only reads them, and follows changes with watchers.
//
// Graph: per-note synth voices → drive (dry + shaper → tone, optionally through the bit
// crusher, → driveSum). From driveSum two paths run in parallel: delay (dry + wet, feedback loop with
// tone filters; plain or ping-pong) and a reverb send (tone filter → convolver → wet gain). Both go to masterGain → destination. The analyser for the
// screen views is tapped from masterGain. The noise layer and the sample lanes go straight
// to masterGain, so they bypass drive, delay and reverb.
//
// WAV export uses a separate offline engine (export/scheduleStepSequencer.ts). Changes to
// the sound here must be mirrored there, or exports will sound different.
//
// Call useLiveEngine() once, from a component's setup: it registers watchers and
// mount/unmount hooks.

import { ref, computed, watch, onMounted, onBeforeUnmount, type Ref } from 'vue';
import { applyPitchEnv, pitchEnvStartCents } from './pitchEnv';
import { applyFilterEnv } from './filterEnv';
import { createVoiceSource, lfoPwmTapGain, prepareVoiceWave, waveGain, type Wave } from './waves';
import { routeVelocity, routedCutoff, routedSemitones, routedNoise } from './velocity';
import { startFM } from './fm';
import { startNoteLfo, lfoAmpBase, LFO_AMP_TAP, lfoFmTapGain, lfoWaveAt, type LfoTarget } from './lfo';
import { createTicker } from './ticker';
import { generateReverbIR } from './reverb/generateIr';
import { cutNoteEnd, ratchetHits, ratchetPitches, stepSpan } from './ratchet';
import { createCrusher, loadCrusher, setCrusher } from './crusher';
import { createPingPong } from './pingPong';
import { clampUnisonVoices, unisonPhase, unisonPosition } from './unison';
import {
	divisionToHz,
	generateDriveCurve,
	linearPassthroughCurve,
	generateNoiseBuffers,
	NOISE_STOPS,
	NOISE_LOUDNESS,
	type NoiseKey,
	lfoFilterTapGain,
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
		selectedWaveform: R<Wave>;
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
	reverb: { enabled: R<boolean>; mix: R<number>; decay: R<number>; tone: R<number> };
	// Called just before a bar's first step is built (about 100 ms before it sounds), so a
	// change waiting for the bar (DrumSequencer's BAR QUEUE) is applied in time for it
	onBarStart?: () => void;
};

export function useLiveEngine(s: LiveEngineSettings) {
	const { volume, tempo, swing } = s.transport;
	const { lanes, stepLength, selectedWaveform, noiseMask } = s.pattern;

	const synthAttack = computed(() => s.envelope.attackMs.value / 1000);
	const synthDecay = computed(() => s.envelope.decayMs.value / 1000);
	const pitchEnvDecay = computed(() => s.pitchEnv.decayMs.value / 1000);

	const isPlaying = ref(false);
	const currentStep = ref(-1);

	// Context + master START

	// Created suspended by the browser; resumed on the first Play (or by MIDI)
	const AC = window.AudioContext || (window as any).webkitAudioContext;
	const audioCtx: AudioContext = new AC();

	const masterGain = audioCtx.createGain();
	masterGain.gain.value = volume.value;
	masterGain.connect(audioCtx.destination);

	// Oscilloscope / spectrogram / tuner analyser
	const analyser = audioCtx.createAnalyser();
	analyser.fftSize = 2048;
	masterGain.connect(analyser);
	analyser.smoothingTimeConstant = 0.8;
	analyser.minDecibels = -90;
	analyser.maxDecibels = -10;

	watch(volume, val => {
		masterGain.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
	});

	// Context + master END

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

	const { enabled: reverbEnabled, mix: reverbMix, decay: reverbDecay, tone: reverbTone } = s.reverb;

	let reverbConvolver = audioCtx.createConvolver();
	const reverbToneFilter = audioCtx.createBiquadFilter();
	reverbToneFilter.type = 'lowpass';

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
		reverbToneFilter.connect(newConvolver);
		newConvolver.connect(newWet);
		newWet.connect(masterGain);

		const fadeTime = 0.25; // seconds
		const now = audioCtx.currentTime;
		const targetWet = reverbEnabled.value ? reverbMix.value : 0;

		// Fade new IR up
		newWet.gain.setValueAtTime(0, now);
		newWet.gain.linearRampToValueAtTime(targetWet, now + fadeTime);

		// Fade old IR down
		oldWet.gain.setValueAtTime(oldWet.gain.value, now);
		oldWet.gain.linearRampToValueAtTime(0, now + fadeTime);

		// After fade, disconnect old chain and update references
		setTimeout(() => {
			try { reverbToneFilter.disconnect(oldConvolver); } catch { }
			try { oldConvolver.disconnect(); } catch { }
			try { oldWet.disconnect(); } catch { }

			reverbConvolver = newConvolver;
			reverbWet = newWet;
		}, fadeTime * 1000 + 50);
	}

	// Drive sum → tone filter → convolver → wet gain → master
	driveSum.connect(reverbToneFilter);
	reverbToneFilter.connect(reverbConvolver);
	reverbConvolver.connect(reverbWet);
	reverbWet.connect(masterGain);
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

	// Enable/disable reverb
	watch(reverbEnabled, (on) => {
		const t = audioCtx.currentTime;
		if (on) {
			if (!reverbConvolver.buffer) ensureReverbIR();
			reverbWet.gain.setTargetAtTime(reverbMix.value, t, 0.03);
		} else {
			reverbWet.gain.setTargetAtTime(0, t, 0.03);
		}
	});

	// Mix changes
	watch(reverbMix, (v) => {
		const t = audioCtx.currentTime;
		reverbWet.gain.setTargetAtTime(reverbEnabled.value ? v : 0, t, 0.03);
	});

	// Reverb END

	// LFO START

	const { enabled: lfoEnabled, rate: lfoRate, depth: lfoDepth, target: lfoTarget, waveform: lfoWaveform, sync: lfoSync, division: lfoDivision, retrigger: lfoRetrigger } = s.lfo;

	//  LFO source + core gain. One shared oscillator; each note taps lfoGain.
	let lfoOsc: OscillatorNode | null = null;
	const lfoGain = audioCtx.createGain();
	lfoGain.gain.value = 0;

	function currentLfoHz() {
		return lfoSync.value ? divisionToHz(lfoDivision.value, tempo.value) : lfoRate.value;
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

	watch([lfoWaveform, lfoSync, lfoDivision, tempo], () => {
		if (!lfoEnabled.value) return;

		if (!lfoOsc) {
			startLfoIfNeeded();
			return;
		}

		lfoOsc.type = lfoWaveform.value;
		lfoOsc.frequency.setValueAtTime(currentLfoHz(), audioCtx.currentTime);
	});

	watch(lfoRate, (r) => {
		if (!lfoEnabled.value) return;
		if (!lfoSync.value) {
			if (!lfoOsc) startLfoIfNeeded();
			if (lfoOsc) lfoOsc.frequency.setValueAtTime(r, audioCtx.currentTime);
		}
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

		// Velocity routing: what this note's velocity does to decay, cutoff, pitch env and noise
		const routed = routeVelocity({
			decay: s.velocity.decay.value,
			cutoff: s.velocity.cutoff.value,
			pitchEnv: s.velocity.pitchEnv.value,
			noise: s.velocity.noise.value,
		}, opts.vel ?? 1);

		const attackTime = isFinite(synthAttack.value) && synthAttack.value > 0 ? synthAttack.value : 0.01;
		const decay = (isFinite(decayTime) && decayTime > 0 ? decayTime : 0.1) * routed.decayFactor;

		// ENV sums all unison voices
		const oscEnvGain = audioCtx.createGain();

		// Shared envelope timings
		const attackEnd = startTime + attackTime;
		const naturalEnd = attackEnd + decay;
		const gateEnd = startTime + Math.max(0.02, (s.envelope.decayMs.value / 1000) * routed.decayFactor);
		const noteEnd = cutNoteEnd(s.envelope.enabled.value ? naturalEnd : gateEnd, startTime, attackTime, opts.maxDuration);

		//  Per-step blend (masked)
		const addNoiseForThisPad = opts.addNoise !== false;
		const blend = (addNoiseForThisPad && s.noise.enabled.value)
			? routedNoise(Math.min(Math.max(s.noise.amount.value, 0), 1), routed)
			: 0;
		const oscBlend = 1 - blend;
		const noiseBlend = blend;

		// Apply waveform loudness compensation to the TONAL path only
		const wfComp = waveGain(waveType);
		const safeOscGain = Math.max(0.0001, velocity * oscBlend * wfComp);

		// Single amplitude envelope for the OSC path
		if (s.envelope.enabled.value) {
			oscEnvGain.gain.setValueAtTime(0.0001, startTime);
			oscEnvGain.gain.exponentialRampToValueAtTime(safeOscGain, attackEnd);
			oscEnvGain.gain.exponentialRampToValueAtTime(0.001, noteEnd);
		} else {
			// Same level as the envelope's peak: waveform balance and noise mix included
			oscEnvGain.gain.setValueAtTime(safeOscGain, startTime);
			oscEnvGain.gain.setTargetAtTime(0.0001, noteEnd - 0.01, 0.005);
		}

		//  UNISON
		const voices = s.unison.enabled.value
			? Math.min(s.unison.maxVoices.value, clampUnisonVoices(s.unison.voices.value))
			: 1;

		const detuneStep = (voices > 1) ? s.unison.detuneCents.value : 0;
		const spreadPct = (voices > 1) ? s.unison.stereoSpread.value : 0;

		const filterEnabled = s.filter.enabled.value;
		const filterCutoff = routedCutoff(s.filter.cutoff.value, routed);

		// Pitch envelope: one starting offset for the whole note, so the voices sweep together
		const pitchStartCents = pitchEnvStartCents({
			enabled: s.pitchEnv.enabled.value,
			semitones: routedSemitones(s.pitchEnv.semitones.value, routed),
			mode: s.pitchEnv.mode.value,
			decay: pitchEnvDecay.value,
		});

		// The LFO this note listens to: the shared one, or with Retrigger its own, starting now
		const lfoOn = lfoEnabled.value && lfoDepth.value !== 0;
		const lfoSrc: AudioNode = lfoOn && lfoRetrigger.value
			? startNoteLfo(audioCtx, lfoWaveform.value, currentLfoHz(), lfoDepth.value, startTime, noteEnd)
			: lfoGain;
		const lfoTapFrom = (tap: AudioNode) => { lfoSrc.connect(tap); return tap; };

		// Level (tremolo): the whole note, tone and noise, goes through a gain the LFO moves
		const tremolo = (lfoOn && lfoTarget.value === 'amp') ? (() => {
			const tap = audioCtx.createGain();
			tap.gain.value = LFO_AMP_TAP;
			lfoTapFrom(tap);
			const make = () => {
				const g = audioCtx.createGain();
				g.gain.value = lfoAmpBase(lfoDepth.value);
				tap.connect(g.gain);
				return g;
			};
			return { tap, make };
		})() : null;
		let firstOsc: OscillatorNode | null = null;

		for (let i = 0; i < voices; i++) {
			// The voice's sound source: the oscillator, plus the pulse network for 'pulse'
			// (each unison voice starting at its own point of its cycle, unison.ts)
			const source = createVoiceSource(audioCtx, waveType, s.pulse.width.value, unisonPhase(i, voices, spreadPct));
			const osc = source.osc;
			const voiceFilter = audioCtx.createBiquadFilter();
			const voiceGain = audioCtx.createGain();
			const panner = audioCtx.createStereoPanner();
			const dNorm = unisonPosition(i, voices);
			const detuneC = dNorm * detuneStep;
			// Frequency, and detune: the unison detune plus the pitch envelope's sweep
			applyPitchEnv(osc, freq, startTime, pitchStartCents, pitchEnvDecay.value, detuneC);

			const fmHandle = startFM(audioCtx, osc, freq, startTime, {
				enabled: s.fm.enabled.value,
				modFreqHz: s.fm.modFreq.value,
				index: s.fm.index.value,
				ratio: s.fm.ratio.value
			});

			voiceFilter.type = 'lowpass';
			if (filterEnabled) {
				voiceFilter.frequency.setValueAtTime(filterCutoff, startTime);
				voiceFilter.Q.setValueAtTime(s.filter.resonance.value, startTime);
				// Filter envelope: the cutoff starts Env Amt octaves away and returns within Decay
				applyFilterEnv(voiceFilter, startTime, s.filter.envAmount.value, s.filter.envDecayMs.value / 1000);
			} else {
				voiceFilter.frequency.setValueAtTime(20000, startTime);
				voiceFilter.Q.setValueAtTime(0.0001, startTime);
			}

			voiceGain.gain.setValueAtTime(1 / voices, startTime);
			panner.pan.setValueAtTime((dNorm * spreadPct) / 100, startTime);

			if (!firstOsc) firstOsc = osc;
			//  LFO routing per target (Level is note-wide, above)
			if (lfoOn) {
				if (lfoTarget.value === 'pitch') {
					const lfoTap = audioCtx.createGain(); lfoTap.gain.value = 1;
					lfoTapFrom(lfoTap).connect(osc.detune);
					osc.addEventListener('ended', () => releaseLfoTap(lfoTap));

				} else if (lfoTarget.value === 'filter') {
					//  keep cutoff in a safe band and smooth the control
					const f0 = filterEnabled ? filterCutoff : 20000;
					const lfoTap = audioCtx.createGain();
					// shrink the depth so the cutoff stays within the safe band
					lfoTap.gain.value = lfoFilterTapGain(f0, lfoDepth.value, audioCtx.sampleRate);

					const ctrlLP = audioCtx.createBiquadFilter();
					ctrlLP.type = 'lowpass';
					ctrlLP.frequency.value = 120;

					lfoTapFrom(lfoTap).connect(ctrlLP).connect(voiceFilter.frequency);
					osc.addEventListener('ended', () => releaseLfoTap(lfoTap, ctrlLP));
				} else if (lfoTarget.value === 'pwm' && source.width) {
					// Pulse-width modulation: moves the pulse's threshold (pulse wave only)
					const lfoTap = audioCtx.createGain();
					lfoTap.gain.value = lfoPwmTapGain(s.pulse.width.value, lfoDepth.value);
					lfoTapFrom(lfoTap).connect(source.width);
					osc.addEventListener('ended', () => releaseLfoTap(lfoTap));
				} else if (lfoTarget.value === 'fm' && fmHandle) {
					// FM: the FM card's Amount swings by ±depth %
					const lfoTap = audioCtx.createGain();
					lfoTap.gain.value = lfoFmTapGain(fmHandle.deviationHz);
					lfoTapFrom(lfoTap).connect(fmHandle.deviation);
					osc.addEventListener('ended', () => releaseLfoTap(lfoTap));
				}
			}

			// voice chain into the shared envelope
			source.output.connect(voiceFilter).connect(voiceGain).connect(panner).connect(oscEnvGain);

			source.start(startTime);
			source.stop(noteEnd);
			if (fmHandle) fmHandle.stop(noteEnd);
		}

		// The tone's way out: through the tremolo when the LFO moves the level
		const oscOut: AudioNode = tremolo ? oscEnvGain.connect(tremolo.make()) : oscEnvGain;
		if (tremolo && firstOsc) {
			const t = tremolo.tap;
			firstOsc.addEventListener('ended', () => setTimeout(() => releaseLfoTap(t), 500)); // after the noise
		}
		if (driveEnabled.value) {
			oscOut.connect(driveDry);
			oscOut.connect(driveShaper);
		} else {
			oscOut.connect(driveSum);
		}

		//  Noise
		if (noiseBlend > 0) {
			const t = Math.min(1, Math.max(0, s.noise.color.value));
			let lower = NOISE_STOPS[0], upper = NOISE_STOPS[NOISE_STOPS.length - 1];
			for (let i = 0; i < NOISE_STOPS.length - 1; i++) {
				const a = NOISE_STOPS[i], b = NOISE_STOPS[i + 1];
				if (t >= a.pos && t <= b.pos) { lower = a; upper = b; break; }
			}
			const span = Math.max(1e-6, upper.pos - lower.pos);
			const wMorph = (t - lower.pos) / span;
			const wA = 1 - wMorph, wB = wMorph;

			const bufA = noiseBuffers[lower.key];
			const bufB = noiseBuffers[upper.key];

			if (bufA || bufB) {
				const mix = audioCtx.createGain();
				mix.gain.setValueAtTime(1, startTime);

				if (bufA) {
					const sA = audioCtx.createBufferSource();
					sA.buffer = bufA; sA.loop = false;
					const gA = audioCtx.createGain(); gA.gain.setValueAtTime(wA, startTime);
					sA.connect(gA).connect(mix);
					sA.start(startTime);
					sA.stop(noteEnd);
				}
				if (bufB) {
					const sB = audioCtx.createBufferSource();
					sB.buffer = bufB; sB.loop = false;
					const gB = audioCtx.createGain(); gB.gain.setValueAtTime(wB, startTime);
					sB.connect(gB).connect(mix);
					sB.start(startTime);
					sB.stop(noteEnd);
				}

				const noiseEnvGain = audioCtx.createGain();
				const attackEnd = startTime + attackTime;

				// Interpolate loudness between the two neighboring colors
				const gainLower = NOISE_LOUDNESS[lower.key];
				const gainUpper = NOISE_LOUDNESS[upper.key];
				const colorGain = gainLower * wA + gainUpper * wB;

				const safePeak = Math.max(0.0001, velocity * noiseBlend * colorGain);
				noiseEnvGain.gain.setValueAtTime(0.0001, startTime);
				noiseEnvGain.gain.exponentialRampToValueAtTime(safePeak, attackEnd);

				const BURST_MAX_MS = 250;
				const burstMs = s.noise.burstMs.value;
				const burstActive = s.noise.attackBurst.value && (burstMs < BURST_MAX_MS);
				const burstEnd = burstActive
					? Math.min(noteEnd, attackEnd + Math.max(0.005, burstMs / 1000))
					: noteEnd;

				noiseEnvGain.gain.exponentialRampToValueAtTime(0.001, burstEnd);
				noiseEnvGain.gain.setTargetAtTime(0.0001, burstEnd, 0.01);

				const noiseHP = audioCtx.createBiquadFilter();
				noiseHP.type = 'highpass';
				noiseHP.frequency.setValueAtTime(40, startTime);    // remove sub-rumble

				const noiseLP = audioCtx.createBiquadFilter();
				noiseLP.type = 'lowpass';
				noiseLP.frequency.setValueAtTime(16000, startTime); // tame ultra-high fizz

				// Mono path to master
				const noiseOut: AudioNode = tremolo ? noiseEnvGain.connect(tremolo.make()) : noiseEnvGain;
				mix.connect(noiseHP).connect(noiseLP).connect(noiseEnvGain);
				noiseOut.connect(masterGain);
			}
		}
	}

	delayDry.connect(masterGain);
	delayWet.connect(masterGain);

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
		source.connect(gain).connect(masterGain);
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

	function hardStopSequencer() {
		sequencerTicker.stop();
		isPlaying.value = false;
		currentStep.value = -1;
		stepIndex = 0;
		startTime = audioCtx.currentTime;
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
			stepIndex = (stepIndex + missed) % stepLength.value;
		}

		while (startTime < now + SCHEDULE_AHEAD_S) {
			if (stepIndex === 0) s.onBarStart?.();
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
						const wf = (inst.waveforms?.[stepIndex] ?? selectedWaveform.value) as Wave;
						const padNoiseOn = noiseMask.value?.[stepIndex] ?? true;

						// One note, or a ratchet's 2–4 quick hits within the step (ratchet.ts).
						// The noise mask makes noise per step.
						const span = stepSpan(stepIndex, stepLength.value, stepDuration, swing.value);
						// Up or Down repeats step through the key's chord (ratchetPitches)
						const hitHz = ratchetPitches(pitch, inst.ratchets?.[stepIndex], inst.repeatNotes?.[stepIndex], s.pattern.repeatChord.value);
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
		isPlaying,
		currentStep,
		playSynthNote,
		startLfoIfNeeded,
		lfoNow,
		soundingRecently,
		togglePlay,
		hardStopSequencer,
		loadSample,
	};
}

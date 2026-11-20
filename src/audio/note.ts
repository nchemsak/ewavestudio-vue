// src/audio/note.ts
// One note of the synth voice, built the same way for the live engine (liveEngine.ts) and the
// export engine (export/scheduleStepSequencer.ts). Until PR 112 each engine had its own copy,
// kept in step by hand. The engines decide when notes play and where they go (`NoteWiring`);
// what a note is (its envelope, unison voices, filter, pitch envelope, FM, LFO taps and the
// noise layer) is here.
//
// A note: per unison voice, source (waves.ts) → low-pass filter → 1/voices gain → panner,
// summed into one envelope gain → [tremolo] → the tone's way out (the drive). The noise layer:
// two neighbouring noise colours crossfaded → 40 Hz high-pass → 16 kHz low-pass → its own
// envelope → [tremolo] → the noise's way out (it skips drive, delay and reverb).

import { applyPitchEnv, pitchEnvStartCents } from './pitchEnv';
import { applyFilterEnv } from './filterEnv';
import { createVoiceSource, lfoPwmTapGain, waveGain, PULSE_WIDTH_DEFAULT } from './waves';
import { applySampleEnvelope, sampleNoteTimes, SAMPLE_WAVE, type PitchedSource } from './sample';
import { routeVelocity, routedCutoff, routedSemitones, routedNoise, type VelocityRouting, type RoutedNote } from './velocity';
import { startFM } from './fm';
import { startNoteLfo, lfoAmpBase, LFO_AMP_TAP, lfoFmTapGain, type LfoTarget } from './lfo';
import { cutNoteEnd } from './ratchet';
import { clampUnisonVoices, unisonPhase, unisonPosition } from './unison';
import { lfoFilterTapGain, NOISE_STOPS, NOISE_LOUDNESS, type NoiseKey } from './synthHelpers';

// The voice's sound: the synth settings a note reads (the export state's `synth` has this
// shape, and the live engine builds one from its refs for each note)
export type VoiceSettings = {
	envelope: { enabled: boolean; attackMs: number; decayMs: number };
	filter: { enabled: boolean; cutoff: number; resonance: number; envAmount?: number; envDecayMs?: number };
	noise: { enabled: boolean; color: number; amount: number; attackBurst: boolean; burstMs: number };
	unison: { enabled: boolean; voices: number; detuneCents: number; stereoSpread: number };
	lfo: {
		enabled: boolean;
		target: LfoTarget;
		waveform: 'sine' | 'square';
		depth: number;   // in the target's units (lfo.ts)
		rateHz: number;  // its division at the tempo
		retrigger: boolean;
	};
	fm: { enabled: boolean; modFreq: number; index: number; ratio: number | null };
	pitchEnv: { enabled: boolean; semitones: number; decayMs: number; mode: 'up' | 'down' | 'random' };
	pulse?: { width: number };  // % (missing: 50)
	sampleLength?: number;      // 0.05–1 (missing: all of it)
	velocity?: VelocityRouting; // missing: off
};

// What to play
export type NoteRequest = {
	freq: number;
	amp: number;          // loudness: the step's velocity × the lane's volume
	vel?: number;         // the step's (or MIDI note's) own velocity 0..1, for velocity routing
	time: number;         // when it starts, on the context's clock
	wave: string;         // a wave (waves.ts) or 'sample'
	addNoise?: boolean;   // the noise mask lets this step add noise (missing: yes)
	maxDuration?: number; // a ratchet hit ends by then, where the next hit begins (ratchet.ts)
	decaySeconds?: number; // the amp envelope's decay (missing: the voice's)
};

// Where the note goes, and what it shares with other notes
export type NoteWiring = {
	ctx: BaseAudioContext;
	toneOut: AudioNode[];  // the tone's ways out (the drive's dry and shaper, or driveSum)
	noiseOut: AudioNode;   // the noise layer's way out
	noiseBuffers: Partial<Record<NoiseKey, AudioBuffer | null>>;
	sample: AudioBuffer | null; // the recording, for the 'sample' wave
	lfo: AudioNode | null; // the shared LFO (its wave × depth), or null while it moves nothing
	random?: () => number; // for the pitch envelope's random mode (default Math.random)
	// Live only: disconnect a note's LFO taps once it has ended, so they don't pile up on the
	// shared LFO (the export's context goes when its render ends)
	release?: (tap: AudioNode, ...rest: AudioNode[]) => void;
};

// The note's times: when its attack ends and when it ends (pure, unit-tested)
export function noteTimes(voice: Pick<VoiceSettings, 'envelope' | 'sampleLength'>, note: NoteRequest,
	routed: Pick<RoutedNote, 'decayFactor'>, sampleSeconds: number | null) {
	const env = voice.envelope;
	const a = env.attackMs / 1000;
	const attack = Number.isFinite(a) && a > 0 ? a : 0.01;
	const d = note.decaySeconds ?? env.decayMs / 1000;
	const decay = (Number.isFinite(d) && d > 0 ? d : 0.1) * routed.decayFactor;
	const start = note.time;
	const attackEnd = start + attack;
	// The recording (sample.ts) plays for its own length, not the Envelope card's Decay
	const sampleTimes = sampleSeconds != null ? sampleNoteTimes({
		start, bufferSeconds: sampleSeconds, freq: note.freq, length: voice.sampleLength ?? 1,
		attack: env.enabled ? attack : 0.002, maxDuration: note.maxDuration,
	}) : null;
	const gateEnd = start + Math.max(0.02, (env.decayMs / 1000) * routed.decayFactor);
	const end = sampleTimes ? sampleTimes.end
		: cutNoteEnd(env.enabled ? attackEnd + decay : gateEnd, start, attack, note.maxDuration);
	return { attack, attackEnd, end, sampleTimes };
}

// The two noise colours either side of `color` (0..1, Brown → Violet) and their weights (pure)
export function noiseMorph(color: number) {
	const t = Math.min(1, Math.max(0, Number.isFinite(color) ? color : 0));
	let lower = NOISE_STOPS[0], upper = NOISE_STOPS[NOISE_STOPS.length - 1];
	for (let i = 0; i < NOISE_STOPS.length - 1; i++) {
		const a = NOISE_STOPS[i], b = NOISE_STOPS[i + 1];
		if (t >= a.pos && t <= b.pos) { lower = a; upper = b; break; }
	}
	const span = Math.max(1e-6, upper.pos - lower.pos);
	const wB = (t - lower.pos) / span;
	const wA = 1 - wB;
	// Loudness between the two colours, so they sound about as loud
	const colorGain = NOISE_LOUDNESS[lower.key] * wA + NOISE_LOUDNESS[upper.key] * wB;
	return { lower: lower.key, upper: upper.key, wA, wB, colorGain };
}

// The noise burst's end: with Attack Burst under 250 ms, the noise stops that soon after the
// attack; otherwise it lasts the note (pure)
export const BURST_MAX_MS = 250;
export function noiseBurstEnd(noise: Pick<VoiceSettings['noise'], 'attackBurst' | 'burstMs'>, attackEnd: number, end: number) {
	return noise.attackBurst && noise.burstMs < BURST_MAX_MS
		? Math.min(end, attackEnd + Math.max(0.005, noise.burstMs / 1000))
		: end;
}

/** Build and schedule one note. Returns when it ends. */
export function playNote(voice: VoiceSettings, note: NoteRequest, w: NoteWiring): { end: number } {
	const { ctx, release } = w;
	const time = note.time;
	const freq = note.freq;

	// Velocity routing: what this note's velocity does to decay, cutoff, pitch env and noise
	const routed = routeVelocity(voice.velocity, note.vel ?? 1);

	const sampleBuf = note.wave === SAMPLE_WAVE ? w.sample : null;
	const { attackEnd, end, sampleTimes } = noteTimes(voice, note, routed, sampleBuf ? sampleBuf.duration : null);

	// Tone vs noise: the noise card's Amount, on steps whose mask lets them
	const blend = (note.addNoise !== false && voice.noise.enabled)
		? routedNoise(Math.min(Math.max(voice.noise.amount, 0), 1), routed)
		: 0;

	// One amplitude envelope for the tone, all unison voices summed into it (the waveform's
	// loudness balance on the tone only)
	const oscEnvGain = ctx.createGain();
	const oscPeak = Math.max(0.0001, note.amp * (1 - blend) * waveGain(note.wave));
	if (sampleTimes) {
		applySampleEnvelope(oscEnvGain.gain, time, oscPeak, sampleTimes);
	} else if (voice.envelope.enabled) {
		oscEnvGain.gain.setValueAtTime(0.0001, time);
		oscEnvGain.gain.exponentialRampToValueAtTime(oscPeak, attackEnd);
		oscEnvGain.gain.exponentialRampToValueAtTime(0.001, end);
	} else {
		// Same level as the envelope's peak: waveform balance and noise mix included
		oscEnvGain.gain.setValueAtTime(oscPeak, time);
		oscEnvGain.gain.setTargetAtTime(0.0001, end - 0.01, 0.005);
	}

	const uni = voice.unison;
	const voices = uni.enabled ? clampUnisonVoices(uni.voices) : 1;
	const detuneStep = voices > 1 ? uni.detuneCents : 0;
	const spreadPct = voices > 1 ? uni.stereoSpread : 0;

	const filter = voice.filter;
	const cutoff = routedCutoff(filter.cutoff, routed);
	const pulseWidth = voice.pulse?.width ?? PULSE_WIDTH_DEFAULT;

	// Pitch envelope: one starting offset for the whole note, so the voices sweep together
	const pitchDecay = voice.pitchEnv.decayMs / 1000;
	const pitchStartCents = pitchEnvStartCents({
		enabled: voice.pitchEnv.enabled,
		semitones: routedSemitones(voice.pitchEnv.semitones, routed),
		mode: voice.pitchEnv.mode,
		decay: pitchDecay,
	}, w.random);

	// The LFO this note listens to: the shared one, or with Retrigger its own, starting now
	const lfo = voice.lfo;
	const lfoSrc: AudioNode | null = !(lfo.enabled && lfo.depth !== 0 && w.lfo) ? null
		: lfo.retrigger ? startNoteLfo(ctx, lfo.waveform, lfo.rateHz, lfo.depth, time, end)
		: w.lfo;
	const lfoTap = (gain: number) => {
		const tap = ctx.createGain();
		tap.gain.value = gain;
		lfoSrc!.connect(tap);
		return tap;
	};

	// Level (tremolo): the whole note, tone and noise, goes through gains the LFO moves
	const tremoloTap = lfoSrc && lfo.target === 'amp' ? lfoTap(LFO_AMP_TAP) : null;
	const tremolo = (input: AudioNode): AudioNode => {
		if (!tremoloTap) return input;
		const g = ctx.createGain();
		g.gain.value = lfoAmpBase(lfo.depth);
		tremoloTap.connect(g.gain);
		return input.connect(g);
	};
	let firstOsc: PitchedSource | null = null;

	for (let i = 0; i < voices; i++) {
		// The voice's sound source: the oscillator, plus the pulse network for 'pulse' (each
		// unison voice starting at its own point of its cycle, unison.ts)
		const source = createVoiceSource(ctx, note.wave, pulseWidth, unisonPhase(i, voices, spreadPct), sampleBuf);
		const osc = source.osc;
		if (!firstOsc) firstOsc = osc;
		const voiceFilter = ctx.createBiquadFilter();
		const voiceGain = ctx.createGain();
		const panner = ctx.createStereoPanner();
		const dNorm = unisonPosition(i, voices);

		// Frequency, and detune: the unison detune plus the pitch envelope's sweep
		applyPitchEnv(osc, freq, time, pitchStartCents, pitchDecay, dNorm * detuneStep);

		const fm = startFM(ctx, osc, freq, time, {
			enabled: voice.fm.enabled,
			modFreqHz: voice.fm.modFreq,
			index: voice.fm.index,
			ratio: voice.fm.ratio,
		});

		voiceFilter.type = 'lowpass';
		if (filter.enabled) {
			voiceFilter.frequency.setValueAtTime(cutoff, time);
			voiceFilter.Q.setValueAtTime(filter.resonance, time);
			// Filter envelope: the cutoff starts Env Amt octaves away and returns within Decay
			applyFilterEnv(voiceFilter, time, filter.envAmount ?? 0, (filter.envDecayMs ?? 200) / 1000);
		} else {
			voiceFilter.frequency.setValueAtTime(20000, time);
			voiceFilter.Q.setValueAtTime(0.0001, time);
		}

		voiceGain.gain.setValueAtTime(1 / voices, time);
		panner.pan.setValueAtTime((dNorm * spreadPct) / 100, time);

		// The LFO, per target (Level is note-wide, above)
		const releaseOnEnd = (tap: AudioNode, ...rest: AudioNode[]) => {
			if (release) osc.addEventListener('ended', () => release(tap, ...rest));
		};
		if (lfoSrc) {
			if (lfo.target === 'pitch') {
				const tap = lfoTap(1);
				tap.connect(osc.detune);
				releaseOnEnd(tap);
			} else if (lfo.target === 'filter') {
				// Kept within a safe band of the cutoff, and smoothed
				const tap = lfoTap(lfoFilterTapGain(filter.enabled ? cutoff : 20000, lfo.depth, ctx.sampleRate));
				const ctrlLP = ctx.createBiquadFilter();
				ctrlLP.type = 'lowpass';
				ctrlLP.frequency.value = 120;
				tap.connect(ctrlLP).connect(voiceFilter.frequency);
				releaseOnEnd(tap, ctrlLP);
			} else if (lfo.target === 'pwm' && source.width) {
				// Pulse-width modulation: moves the pulse's threshold (pulse wave only)
				const tap = lfoTap(lfoPwmTapGain(pulseWidth, lfo.depth));
				tap.connect(source.width);
				releaseOnEnd(tap);
			} else if (lfo.target === 'fm' && fm) {
				// FM: the FM card's Amount swings by ±depth %
				const tap = lfoTap(lfoFmTapGain(fm.deviationHz));
				tap.connect(fm.deviation);
				releaseOnEnd(tap);
			}
		}

		source.output.connect(voiceFilter).connect(voiceGain).connect(panner).connect(oscEnvGain);
		source.start(time);
		source.stop(end);
		if (fm) fm.stop(end);
	}

	if (tremoloTap && firstOsc && release) {
		firstOsc.addEventListener('ended', () => setTimeout(() => release(tremoloTap), 500)); // after the noise
	}

	// The tone's way out, through the tremolo when the LFO moves the level
	const oscOut = tremolo(oscEnvGain);
	for (const n of w.toneOut) oscOut.connect(n);

	// The noise layer
	if (blend > 0) {
		const m = noiseMorph(voice.noise.color);
		const bufA = w.noiseBuffers[m.lower];
		const bufB = w.noiseBuffers[m.upper];
		if (bufA || bufB) {
			const mix = ctx.createGain();
			mix.gain.setValueAtTime(1, time);
			const layer = (buf: AudioBuffer, weight: number) => {
				const src = ctx.createBufferSource();
				src.buffer = buf;
				src.loop = false;
				const g = ctx.createGain();
				g.gain.setValueAtTime(weight, time);
				src.connect(g).connect(mix);
				src.start(time);
				src.stop(end);
			};
			if (bufA) layer(bufA, m.wA);
			if (bufB) layer(bufB, m.wB);

			const noiseEnvGain = ctx.createGain();
			const peak = Math.max(0.0001, note.amp * blend * m.colorGain);
			noiseEnvGain.gain.setValueAtTime(0.0001, time);
			noiseEnvGain.gain.exponentialRampToValueAtTime(peak, attackEnd);
			const burstEnd = noiseBurstEnd(voice.noise, attackEnd, end);
			noiseEnvGain.gain.exponentialRampToValueAtTime(0.001, burstEnd);
			noiseEnvGain.gain.setTargetAtTime(0.0001, burstEnd, 0.01);

			const noiseHP = ctx.createBiquadFilter();
			noiseHP.type = 'highpass';
			noiseHP.frequency.setValueAtTime(40, time);    // remove sub-rumble
			const noiseLP = ctx.createBiquadFilter();
			noiseLP.type = 'lowpass';
			noiseLP.frequency.setValueAtTime(16000, time); // tame ultra-high fizz

			mix.connect(noiseHP).connect(noiseLP).connect(noiseEnvGain);
			tremolo(noiseEnvGain).connect(w.noiseOut);
		}
	}

	return { end };
}

// src/audio/export/exportFiles.ts
// The files File → Export audio… makes (ExportDialog.vue chooses, DrumSequencer.vue downloads):
// - the mix: N bars of the pattern, as a seamless loop (exactly N bars, the effects' tail
//   folded onto the start) or with its tail (clean start, the tail rings out after the bars);
// - effects stems: dry, delay, reverb, noise and the tape pedal's own noise, rendered one at a
//   time with the same random numbers as the mix, so they add up to it (a stem that would be
//   silent, an effect that's off, is left out);
// - a MIDI file of the same bars (src/lib/export/midi.ts);
// - a one-shot: one hit of the sound at a chosen note, effects included, until it fades (the
//   tape pedal's hiss never does, so it ends where the hit has faded under it).
// Every file goes through the output limiter, as the app plays (limiter.ts: the stems take the
// mix's gains). Normalize turns the mix and stems up by one gain (so the stems still add up),
// and the one-shot on its own, to −1 dBFS. Rendering uses the offline engine (scheduleStepSequencer)
// in an OfflineAudioContext, faster than real time.

import { loadCrusher } from '../crusher';
import { applyGains, limit, limiterGains } from '../limiter';
import { scheduleStepSequencer, type ExportPart, type StepSequencerState } from './scheduleStepSequencer';
import { encodeWavFloat32 } from './encodeWav';
import { applyGain, barFrames, fadeOut, foldLoop, normalizeGain, peakOf, subtract, trimTail, type Channels } from '../../lib/export/audio';
import { patternToMidi } from '../../lib/export/midi';
import { exportNames, type Ending } from '../../lib/export/names';
import { seededRandom } from '../../lib/random';

export const EXPORT_BARS = [1, 2, 4, 8] as const;
export type ExportBars = typeof EXPORT_BARS[number];

// What plays: the pattern showing, its bars times over, or the chain (PR 111), once through,
// a bar per filled cell
export type ExportPlay = 'pattern' | 'chain';

export type ExportOptions = {
	play: ExportPlay;
	bars: ExportBars;
	ending: Ending;
	mix: boolean;
	stems: boolean;      // dry, delay, reverb, noise, tape
	machineStems?: boolean; // a file per machine, rhythm and bass (and the lo-fi pedal's noise)
	midi: boolean;
	oneShot: boolean;
	oneShotHz: number;   // the one-shot's note
	normalize: boolean;
};

export const DEFAULT_EXPORT_OPTIONS: Omit<ExportOptions, 'oneShotHz'> = {
	play: 'pattern', bars: 1, ending: 'loop', mix: true, stems: false, machineStems: false, midi: false, oneShot: false, normalize: true,
};

export const STEM_PARTS: ExportPart[] = ['dry', 'delay', 'reverb', 'noise', 'tape'];

// The one-shot is rendered this long, then trimmed where it fades
const ONE_SHOT_SECONDS = 6;
// Kept after a tail fades below −80 dBFS
const TAIL_MARGIN_S = 0.05;
// A stem quieter than this throughout is silent (its effect is off) and left out
const SILENT_PEAK = 1e-6;
// With its tail, the tape pedal's noise fades for this long after the bars
const TAPE_NOISE_FADE_S = 1.5;
// A one-shot through the tape pedal ends with a fade this long, under its hiss
const ONE_SHOT_FADE_S = 0.04;

export type ExportFile = { name: string; data: Uint8Array; type: string };

export type ExportMeta = {
	project: string;
	key: string;                      // "Amin", or '' (names.ts)
	oneShotWave: string;              // the main wave
	noteName: (hz: number) => string; // "A3"
};

async function render(state: StepSequencerState, seconds: number): Promise<Channels> {
	const sr = state.sampleRate;
	const OfflineAC = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
	const ctx: OfflineAudioContext = new OfflineAC(2, Math.ceil(seconds * sr), sr);
	if (state.fx.drive.enabled && state.fx.drive.crush) await loadCrusher(ctx);
	scheduleStepSequencer(ctx, state, 0);
	const buf = await ctx.startRendering();
	return [buf.getChannelData(0), buf.getChannelData(1)];
}

// One full-velocity hit on the first step, at `hz`, on `wave` (the one-shot, and the screen's
// hit at rest). The tape pedal's noise plays for `noiseSeconds` (0: none)
function oneShotState(state: StepSequencerState, hz: number, wave: string, part: ExportPart,
	random: () => number, noiseSeconds: number): StepSequencerState {
	const n = state.stepsCount;
	return {
		...state,
		swing: 0,
		bars: 1,
		part,
		random,
		tapeNoise: { seconds: noiseSeconds },
		oneShot: true,
		barPatterns: undefined, // one hit, never the chain
		pattern: {
			active: Array.from({ length: n }, (_, i) => i === 0),
			velocities: Array(n).fill(1),
			pitches: Array(n).fill(hz),
			waveforms: Array(n).fill(wave),
			ratchets: Array(n).fill(1),
		},
		synth: { ...state.synth, noise: { ...state.synth.noise, mask: Array(n).fill(true) } },
	};
}

// The screen's hit at rest (hitView.ts): one hit as the one-shot renders it, without the tape
// pedal's noise (which never fades), with fixed random numbers so the picture doesn't change
// when nothing has, cut where it fades below −80 dBFS. `seconds` is how long it may ring.
export async function renderHit(state: StepSequencerState, hz: number, wave: string, seconds = ONE_SHOT_SECONDS): Promise<Channels> {
	const raw = await render(oneShotState(state, hz, wave, 'mix', seededRandom(1), 0), seconds);
	return limit(trimTail(raw, Math.round(0.02 * state.sampleRate)), state.sampleRate);
}

const wav = (channels: Channels, sampleRate: number) => new Uint8Array(encodeWavFloat32(channels, sampleRate));

export async function buildExportFiles(
	state: StepSequencerState,
	o: ExportOptions,
	meta: ExportMeta,
	progress: (done: number, total: number) => void = () => {},
): Promise<ExportFile[]> {
	const sr = state.sampleRate;
	// The chain: a bar per filled cell (state.barPatterns, the cells' patterns in order), once
	// through; otherwise the pattern showing, o.bars times over
	const chain = o.play === 'chain' && !!state.barPatterns?.length;
	const bars = chain ? state.barPatterns!.length : o.bars;
	state = chain ? state : { ...state, barPatterns: undefined, bass: state.bass && { ...state.bass, barPatterns: undefined } };
	const names = exportNames({ project: meta.project, bpm: state.bpm, key: meta.key, bars, ending: o.ending, chain });
	const loopFrames = barFrames(bars, state.bpm, sr);
	const seconds = loopFrames / sr + state.tailSeconds;
	// What to render, each a file named `name`: the mix (rendered for the stems too: the output
	// limiter's gains come from it), the effects stems, and the machine stems (PR 116): each
	// machine alone through the pedals, without the lo-fi pedal's noise, which is a file of its
	// own (the effects stems' 'tape'), so they add up to the mix (with the overdrive and the
	// lo-fi pedal off exactly: both bend the sum, not each machine)
	type Job = { name: string; part: ExportPart; machine?: 'rhythm' | 'bass' };
	const stemNames = new Set<string>();
	const jobs: Job[] = [];
	if (o.mix || o.stems || o.machineStems) jobs.push({ name: 'mix', part: 'mix' });
	if (o.stems) for (const p of STEM_PARTS) { jobs.push({ name: p, part: p }); stemNames.add(p); }
	if (o.machineStems) {
		jobs.push({ name: 'rhythm', part: 'mix', machine: 'rhythm' });
		if (state.bass) jobs.push({ name: 'bass', part: 'mix', machine: 'bass' });
		if (!o.stems) jobs.push({ name: 'tape', part: 'tape' });
	}
	const total = jobs.length + (o.oneShot ? 1 : 0);
	let done = 0;
	progress(done, total);

	// The mix and stems: the same random numbers for each, so they match
	const seed = Math.floor(Math.random() * 2 ** 32);
	const rendered: { part: string; channels: Channels }[] = [];
	for (const job of jobs) {
		const fade = o.ending === 'tail' ? TAPE_NOISE_FADE_S : 0;
		rendered.push({
			part: job.name,
			channels: await render({
				...state, bars, part: job.part, machine: job.machine, random: seededRandom(seed),
				tapeNoise: job.machine ? { seconds: 0, fade: 0 } : { fade },
			}, seconds),
		});
		progress(++done, total);
	}
	// A loop folds its tail onto its start; with the tail, every file ends where the last of
	// them has faded, so they're all the same length and line up in a DAW
	const tailFrames = o.ending === 'tail' && rendered.length
		? trimTail(rendered.flatMap((r) => r.channels), loopFrames, Math.round(TAIL_MARGIN_S * sr))[0].length
		: 0;
	const shaped = rendered.map(({ part, channels }) => ({
		part,
		channels: o.ending === 'loop' ? foldLoop(channels, loopFrames) : channels.map((c) => c.slice(0, tailFrames)),
	}));
	// The output limiter (limiter.ts), as it plays: on the mix as it loops (after the fold),
	// and the very same gains on every stem, so the stems still add up to the mix. Below
	// −1 dBFS it changes nothing.
	const mixed = shaped.find((a) => a.part === 'mix');
	const gains = mixed ? limiterGains(mixed.channels, sr) : null;
	const audio = shaped
		.map((a) => (gains ? { ...a, channels: applyGains(a.channels, gains) } : a))
		.filter(({ part, channels }) => (part === 'mix' ? o.mix : part === 'dry' || part === 'rhythm' || peakOf(channels) > SILENT_PEAK));
	const gain = o.normalize ? normalizeGain(peakOf(...audio.map((a) => a.channels))) : 1;
	const files: ExportFile[] = audio.map((a) => ({
		name: names.wav(a.part), data: wav(applyGain(a.channels, gain), sr), type: 'audio/wav',
	}));

	if (o.midi) {
		files.push({
			name: names.midi,
			type: 'audio/midi',
			data: patternToMidi({
				bpm: state.bpm, swing: state.swing, stepsCount: state.stepsCount, bars, barPatterns: state.barPatterns,
				active: state.pattern.active, velocities: state.pattern.velocities,
				pitches: state.pattern.pitches, ratchets: state.pattern.ratchets,
				repeatNotes: state.pattern.repeatNotes, repeatChord: state.pattern.repeatChord, name: meta.project,
				bass: state.bass && { pattern: state.bass.pattern, barPatterns: state.bass.barPatterns },
			}),
		});
	}

	if (o.oneShot) {
		const hit = (part: ExportPart, random: () => number) =>
			render(oneShotState(state, o.oneShotHz, meta.oneShotWave, part, random, ONE_SHOT_SECONDS), ONE_SHOT_SECONDS);
		const hitSeed = Math.floor(Math.random() * 2 ** 32);
		const raw = await hit('mix', seededRandom(hitSeed));
		const minFrames = Math.round(0.02 * sr);
		const margin = Math.round(TAIL_MARGIN_S * sr);
		let channels: Channels;
		if (state.fx.tape?.enabled) {
			// The tape's noise never fades: the one-shot ends where the hit has faded under it
			// (the mix less the noise, rendered with the same random numbers), with a short fade
			const sound = subtract(raw, await hit('tape', seededRandom(hitSeed)));
			const frames = trimTail(sound, minFrames, margin)[0].length;
			channels = fadeOut(raw.map((c) => c.slice(0, frames)), Math.round(ONE_SHOT_FADE_S * sr));
		} else {
			channels = trimTail(raw, minFrames, margin);
		}
		channels = limit(channels, sr); // the output limiter, as a hit played live
		const g = o.normalize ? normalizeGain(peakOf(channels)) : 1;
		files.push({ name: names.oneShot(meta.noteName(o.oneShotHz)), data: wav(applyGain(channels, g), sr), type: 'audio/wav' });
		progress(++done, total);
	}

	return files;
}

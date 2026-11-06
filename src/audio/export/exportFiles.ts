// src/audio/export/exportFiles.ts
// The files File → Export audio… makes (ExportDialog.vue chooses, DrumSequencer.vue downloads):
// - the mix: N bars of the pattern, as a seamless loop (exactly N bars, the effects' tail
//   folded onto the start) or with its tail (clean start, the tail rings out after the bars);
// - effects stems: dry, delay, reverb and noise, rendered one at a time with the same random
//   numbers as the mix, so they add up to it (a stem that would be silent, an effect that's
//   off, is left out);
// - a MIDI file of the same bars (src/lib/export/midi.ts);
// - a one-shot: one hit of the sound at a chosen note, effects included, until it fades.
// Normalize turns the mix and stems up by one gain (so the stems still add up), and the
// one-shot on its own, to −1 dBFS. Rendering uses the offline engine (scheduleStepSequencer)
// in an OfflineAudioContext, faster than real time.

import { scheduleStepSequencer, type ExportPart, type StepSequencerState } from './scheduleStepSequencer';
import { encodeWavFloat32 } from './encodeWav';
import { applyGain, barFrames, foldLoop, normalizeGain, peakOf, trimTail, type Channels } from '../../lib/export/audio';
import { patternToMidi } from '../../lib/export/midi';
import { exportNames, type Ending } from '../../lib/export/names';
import { seededRandom } from '../../lib/random';

export const EXPORT_BARS = [1, 2, 4, 8] as const;
export type ExportBars = typeof EXPORT_BARS[number];

export type ExportOptions = {
	bars: ExportBars;
	ending: Ending;
	mix: boolean;
	stems: boolean;      // dry, delay, reverb, noise
	midi: boolean;
	oneShot: boolean;
	oneShotHz: number;   // the one-shot's note
	normalize: boolean;
};

export const DEFAULT_EXPORT_OPTIONS: Omit<ExportOptions, 'oneShotHz'> = {
	bars: 1, ending: 'loop', mix: true, stems: false, midi: false, oneShot: false, normalize: true,
};

export const STEM_PARTS: ExportPart[] = ['dry', 'delay', 'reverb', 'noise'];

// The one-shot is rendered this long, then trimmed where it fades
const ONE_SHOT_SECONDS = 6;
// Kept after a tail fades below −80 dBFS
const TAIL_MARGIN_S = 0.05;
// A stem quieter than this throughout is silent (its effect is off) and left out
const SILENT_PEAK = 1e-6;

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
	scheduleStepSequencer(ctx, state, 0);
	const buf = await ctx.startRendering();
	return [buf.getChannelData(0), buf.getChannelData(1)];
}

const wav = (channels: Channels, sampleRate: number) => new Uint8Array(encodeWavFloat32(channels, sampleRate));

export async function buildExportFiles(
	state: StepSequencerState,
	o: ExportOptions,
	meta: ExportMeta,
	progress: (done: number, total: number) => void = () => {},
): Promise<ExportFile[]> {
	const sr = state.sampleRate;
	const names = exportNames({ project: meta.project, bpm: state.bpm, key: meta.key, bars: o.bars, ending: o.ending });
	const loopFrames = barFrames(o.bars, state.bpm, sr);
	const seconds = loopFrames / sr + state.tailSeconds;
	const parts: ExportPart[] = [...(o.mix ? ['mix' as const] : []), ...(o.stems ? STEM_PARTS : [])];
	const total = parts.length + (o.oneShot ? 1 : 0);
	let done = 0;
	progress(done, total);

	// The mix and stems: the same random numbers for each, so they match
	const seed = Math.floor(Math.random() * 2 ** 32);
	const rendered: { part: ExportPart; channels: Channels }[] = [];
	for (const part of parts) {
		rendered.push({ part, channels: await render({ ...state, bars: o.bars, part, random: seededRandom(seed) }, seconds) });
		progress(++done, total);
	}
	// A loop folds its tail onto its start; with the tail, every file ends where the last of
	// them has faded, so they're all the same length and line up in a DAW
	const tailFrames = o.ending === 'tail' && rendered.length
		? trimTail(rendered.flatMap((r) => r.channels), loopFrames, Math.round(TAIL_MARGIN_S * sr))[0].length
		: 0;
	const audio = rendered
		.map(({ part, channels }) => ({
			part,
			channels: o.ending === 'loop' ? foldLoop(channels, loopFrames) : channels.map((c) => c.slice(0, tailFrames)),
		}))
		.filter(({ part, channels }) => part === 'mix' || part === 'dry' || peakOf(channels) > SILENT_PEAK);
	const gain = o.normalize ? normalizeGain(peakOf(...audio.map((a) => a.channels))) : 1;
	const files: ExportFile[] = audio.map((a) => ({
		name: names.wav(a.part), data: wav(applyGain(a.channels, gain), sr), type: 'audio/wav',
	}));

	if (o.midi) {
		files.push({
			name: names.midi,
			type: 'audio/midi',
			data: patternToMidi({
				bpm: state.bpm, swing: state.swing, stepsCount: state.stepsCount, bars: o.bars,
				active: state.pattern.active, velocities: state.pattern.velocities,
				pitches: state.pattern.pitches, ratchets: state.pattern.ratchets, name: meta.project,
			}),
		});
	}

	if (o.oneShot) {
		// One full-velocity hit on the first step, at the chosen note, on the main wave
		const n = state.stepsCount;
		const raw = await render({
			...state,
			swing: 0,
			bars: 1,
			part: 'mix',
			pattern: {
				active: Array.from({ length: n }, (_, i) => i === 0),
				velocities: Array(n).fill(1),
				pitches: Array(n).fill(o.oneShotHz),
				waveforms: Array(n).fill(meta.oneShotWave),
				ratchets: Array(n).fill(1),
			},
			synth: { ...state.synth, noise: { ...state.synth.noise, mask: Array(n).fill(true) } },
		}, ONE_SHOT_SECONDS);
		const channels = trimTail(raw, Math.round(0.02 * sr), Math.round(TAIL_MARGIN_S * sr));
		const g = o.normalize ? normalizeGain(peakOf(channels)) : 1;
		files.push({ name: names.oneShot(meta.noteName(o.oneShotHz)), data: wav(applyGain(channels, g), sr), type: 'audio/wav' });
		progress(++done, total);
	}

	return files;
}

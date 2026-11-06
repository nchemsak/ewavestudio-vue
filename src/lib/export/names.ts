// src/lib/export/names.ts
// File names for the Export audio dialog, so the files sort together and say what they are
// in a DAW: project, tempo, key (when the Melody Maker has a scale), length and part, for
// example "My Beat_80bpm_Amin_4bars_mix.wav" or "My Beat_oneshot_A3.wav".

// Characters Windows, macOS or Linux don't allow in a file name
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g;

export function safeName(name: string): string {
	const s = (name || '').replace(/\s+/g, ' ').replace(UNSAFE, '-').trim().slice(0, 60).trim();
	return s || 'Untitled';
}

const SCALE_SHORT: Record<string, string> = {
	major: 'maj', naturalMinor: 'min', pentMajor: 'pentmaj', pentMinor: 'pentmin',
	dorian: 'dorian', lydian: 'lydian', mixolydian: 'mixolydian',
};

// "Amin", "C#maj", ... or '' when no scale is set (the key root alone says little then)
export function keyLabel(root: string, scale: string): string {
	return SCALE_SHORT[scale] ? `${root}${SCALE_SHORT[scale]}` : '';
}

export type Ending = 'loop' | 'tail';

export function barsLabel(bars: number, ending: Ending): string {
	return `${bars}bar${bars === 1 ? '' : 's'}${ending === 'tail' ? '-tail' : ''}`;
}

export function exportNames(o: { project: string; bpm: number; key: string; bars: number; ending: Ending }) {
	const project = safeName(o.project);
	const base = [project, `${Math.round(o.bpm)}bpm`, o.key, barsLabel(o.bars, o.ending)].filter(Boolean).join('_');
	return {
		wav: (part: string) => `${base}_${part}.wav`,
		midi: `${base}.mid`,
		zip: `${base}.zip`,
		oneShot: (note: string) => `${project}_oneshot_${note.replace(UNSAFE, '-')}.wav`,
	};
}

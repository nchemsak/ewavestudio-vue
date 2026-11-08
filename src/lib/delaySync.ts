// src/lib/delaySync.ts
// Tempo-synced delay time, worked out in one place. The Delay panel's TIME knob picks a note
// division (saved as fx.delay.division); with sync on (fx.delay.sync), the delay time is that
// division at the current tempo. DrumSequencer.vue keeps the time in step when the tempo or
// division changes (followDelaySync), and applySnapshot() when a project is loaded, so the
// saved time and the sound always match the knob.

import { watch, type Ref } from 'vue';

export type DelayDivision = { label: string; steps: number }; // steps: in 1/16 notes

// In the order of the TIME knob's positions
export const DELAY_DIVISIONS: readonly DelayDivision[] = [
	{ label: '1/64', steps: 0.25 },
	{ label: '1/32T', steps: (2 / 3) * 0.5 },
	{ label: '1/32', steps: 0.5 },
	{ label: '1/16T', steps: (2 / 3) * 1 },
	{ label: '1/16', steps: 1 },
	{ label: '1/8T', steps: (2 / 3) * 2 },
	{ label: '1/8', steps: 2 },
	{ label: '1/4T', steps: (2 / 3) * 4 },
	{ label: '1/8.', steps: 3 },
	{ label: '1/4', steps: 4 },
	{ label: '1/2T', steps: (2 / 3) * 8 },
	{ label: '1/4.', steps: 6 },
];

export const DEFAULT_DELAY_DIVISION = '1/8.';
// The app's starting tempo (a fresh page, File → New): 120, most DAWs' default, so an export
// drops into a new DAW project at its tempo
export const DEFAULT_TEMPO = 120;
const MAX_DELAY_S = 5; // the live engine's DelayNode maximum
const MIN_DELAY_S = 0.005;

export const isDelayDivision = (label: unknown): label is string =>
	typeof label === 'string' && DELAY_DIVISIONS.some(d => d.label === label);

// The delay time (seconds) of a division at a tempo (BPM)
export function syncedDelaySeconds(tempo: number, division: string): number {
	const steps = DELAY_DIVISIONS.find(d => d.label === division)?.steps
		?? DELAY_DIVISIONS.find(d => d.label === DEFAULT_DELAY_DIVISION)!.steps;
	const stepS = 60 / (tempo > 0 ? tempo : 120) / 4;
	return Math.min(MAX_DELAY_S, Math.max(MIN_DELAY_S, steps * stepS));
}

// For projects saved before the division was saved: the division whose synced time matches
// the saved time (within 1%), or null if none does
export function divisionForTime(time: number, tempo: number): string | null {
	if (!(time > 0)) return null;
	const match = DELAY_DIVISIONS.find(d => Math.abs(syncedDelaySeconds(tempo, d.label) - time) <= time * 0.01);
	return match ? match.label : null;
}

// The app's starting delay time (default division at the default tempo)
export const DEFAULT_DELAY_TIME = syncedDelaySeconds(DEFAULT_TEMPO, DEFAULT_DELAY_DIVISION);

// While sync is on, keep the delay time at the division's time at the current tempo. Runs
// synchronously, so every snapshot taken after a change already has the matching time.
export function followDelaySync(r: { tempo: Ref<number>; division: Ref<string>; sync: Ref<boolean>; time: Ref<number> }) {
	return watch(
		[r.tempo, r.division, r.sync],
		() => {
			if (!r.sync.value) return;
			const t = syncedDelaySeconds(r.tempo.value, r.division.value);
			if (r.time.value !== t) r.time.value = t;
		},
		{ immediate: true, flush: 'sync' },
	);
}

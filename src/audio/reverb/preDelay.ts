// The reverb's pre-delay (the PRE knob): a DelayNode on the reverb send, before the convolver,
// so the hit stays dry and clear for a moment before its tail starts. Both engines use it, and
// it sits inside the reverb's stem, so the export's stems still add up.
//
// Since PR 104 the knob picks a note value at the tempo, as the delay's TIME does: Off, 1/64 …
// 1/8 (`fx.reverb.preDivision`). The time in ms (`fx.reverb.preDelay`, what the engines read)
// is that value at the tempo, kept in step by DrumSequencer (followPreDelay) and by
// applySnapshot(). Longer than 1/8 it would sound like an echo, not a pre-delay.

import { watch, type Ref } from 'vue';

export type PreDivision = { label: string; steps: number }; // steps: in 1/16 notes

// In the order of the PRE knob's positions
export const PRE_DIVISIONS: readonly PreDivision[] = [
	{ label: 'Off', steps: 0 },
	{ label: '1/64', steps: 0.25 },
	{ label: '1/32', steps: 0.5 },
	{ label: '1/16T', steps: 2 / 3 },
	{ label: '1/16', steps: 1 },
	{ label: '1/16.', steps: 1.5 },
	{ label: '1/8', steps: 2 },
];

export const DEFAULT_PRE_DIVISION = 'Off';

// The longest it can be: 1/8 at the slowest tempo (20 BPM). The DelayNodes are made this long.
export const PRE_DELAY_MAX_MS = 1500;

export const isPreDivision = (label: unknown): label is string =>
	typeof label === 'string' && PRE_DIVISIONS.some((d) => d.label === label);

// A division's time at a tempo, in ms (an unknown division is Off)
export function preDelayMs(tempo: number, division: string): number {
	const steps = PRE_DIVISIONS.find((d) => d.label === division)?.steps ?? 0;
	const stepMs = 60000 / (tempo > 0 ? tempo : 120) / 4;
	return Math.min(PRE_DELAY_MAX_MS, steps * stepMs);
}

// What the engines play: whole ms within 0–1500; anything else is 0
export function clampPreDelayMs(v: unknown): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
	return Math.max(0, Math.min(PRE_DELAY_MAX_MS, v));
}

// For a project saved with only a time in ms (PR 103, before the divisions): the division
// nearest to it at the project's tempo; 0 (or none) is Off
export function preDivisionForMs(ms: unknown, tempo: number): string {
	const t = clampPreDelayMs(ms);
	if (t <= 0) return DEFAULT_PRE_DIVISION;
	let best = PRE_DIVISIONS[1];
	for (const d of PRE_DIVISIONS.slice(1)) {
		if (Math.abs(preDelayMs(tempo, d.label) - t) < Math.abs(preDelayMs(tempo, best.label) - t)) best = d;
	}
	return best.label;
}

// What the knob says: "Off", or "1/16 · 125 ms"
export function preDelayLabel(tempo: number, division: string): string {
	if (!isPreDivision(division) || division === 'Off') return 'Off';
	return `${division} · ${Math.round(preDelayMs(tempo, division))} ms`;
}

// Keep the time at the division's time at the current tempo. Runs synchronously, so every
// snapshot taken after a change already has the matching time (as followDelaySync).
export function followPreDelay(r: { tempo: Ref<number>; division: Ref<string>; ms: Ref<number> }) {
	return watch(
		[r.tempo, r.division],
		() => {
			const t = preDelayMs(r.tempo.value, r.division.value);
			if (r.ms.value !== t) r.ms.value = t;
		},
		{ immediate: true, flush: 'sync' },
	);
}

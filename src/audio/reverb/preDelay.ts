// The reverb's pre-delay (the PRE knob): a DelayNode on the reverb send, before the convolver,
// so the hit stays dry and clear for a moment before its tail starts. Both engines use it, and
// it sits inside the reverb's stem, so the export's stems still add up. Saved in ms as
// `fx.reverb.preDelay` (a project saved before it gets 0, today's sound).

export const PRE_DELAY_MAX_MS = 250;

// A saved or typed value as the knob's: whole ms within 0–250; anything else is 0
export function clampPreDelayMs(v: unknown): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
	return Math.round(Math.max(0, Math.min(PRE_DELAY_MAX_MS, v)));
}

// The knob's notches: 1/64 and 1/32 of a bar at the tempo (31 and 63 ms at 120 BPM), short
// enough to stay a pre-delay rather than an echo; each rounded to the knob's 1 ms step
export const PRE_DELAY_DIVISIONS = [64, 32] as const;
export function preDelayDetents(bpm: number): { ms: number; label: string }[] {
	const barMs = (4 * 60000) / Math.max(1, bpm);
	return PRE_DELAY_DIVISIONS
		.map((d) => ({ ms: Math.round(barMs / d), label: `1/${d}` }))
		.filter((n) => n.ms > 0 && n.ms <= PRE_DELAY_MAX_MS);
}

// What the knob says: "40 ms", or "31 ms (1/64)" on a notch
export function preDelayLabel(ms: number, bpm: number): string {
	const n = preDelayDetents(bpm).find((d) => d.ms === Math.round(ms));
	return n ? `${Math.round(ms)} ms (${n.label})` : `${Math.round(ms)} ms`;
}

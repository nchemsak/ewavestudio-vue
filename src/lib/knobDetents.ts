// src/lib/knobDetents.ts
// Soft notches on a knob: common values (120 BPM, a triplet swing, the middle of a two-way
// knob) where the knob holds for a few pixels of drag before carrying on, so they're easy to
// land on without being hard stops (Knob.vue's `detents`).
//
// A drag moves along a "travel" slightly longer than the knob's turn: each notch has a short
// stretch of travel (its hold) during which the knob stays on the notch, and between notches
// travel and turn move together. So the knob never jumps: it reaches the notch, holds, then
// carries on from it. A MIDI controller's knob goes along the same travel, so it can reach
// the notches too (128 steps over 20–300 BPM would otherwise skip from 119 to 121).

// Each notch's hold, as a share of the turn: 14 px of a knob's 200 px drag, enough to feel
// without feeling stuck. A MIDI controller's knob has a short turn, so it gets a lighter hold
// (at 14 px a third of Tempo's turn would sit on notches).
export const DETENT_HOLD = 0.07;
export const CONTROLLER_DETENT_HOLD = 0.04;

export const TEMPO_DETENTS = [60, 90, 100, 120, 140, 160, 174];

// The Swing knob's 0–50 % is how far every second step moves towards the next (50 % is half a
// step, a drum machine's 75 %). Drum machines' usual 54, 58, 62, 66 (triplet) and 71 % are:
export const SWING_DETENTS = [0.08, 0.16, 0.24, 0.33, 0.42];
export const TRIPLET_SWING = 0.33;

// The phone's Swing − / + (PR 73): from none to half a step, by the notches
export const SWING_STOPS = [0, ...SWING_DETENTS, 0.5];

// The next stop up (dir 1) or down (dir −1) from a value, which needn't be on a stop itself
// (a knob turned on the desktop); at either end it stays
export function nextStop(value: number, stops: readonly number[], dir: 1 | -1): number {
	const eps = 1e-9;
	if (dir > 0) return stops.find((s) => s > value + eps) ?? stops[stops.length - 1];
	return [...stops].reverse().find((s) => s < value - eps) ?? stops[0];
}

export type DetentPoint = { pos: number; value: number };

export type DetentTravel = {
	length: number;                                           // travel for the whole turn
	toTravel(pos: number): number;                            // a notch: the middle of its hold
	toKnob(travel: number): { pos: number; value: number | null }; // value: the notch held, if any
};

const SAME = 1e-9;

// `points`: the notches, by position along the turn (0..1); those at the very ends are left out
// (the end of the turn already stops there)
export function detentTravel(points: DetentPoint[], hold = DETENT_HOLD): DetentTravel {
	const notches = points
		.filter((p) => p.pos > SAME && p.pos < 1 - SAME)
		.sort((a, b) => a.pos - b.pos)
		.filter((p, i, all) => i === 0 || p.pos - all[i - 1].pos > SAME);
	const length = 1 + hold * notches.length;

	function toTravel(pos: number): number {
		let t = Math.min(1, Math.max(0, pos));
		for (const n of notches) {
			if (pos > n.pos + SAME) t += hold;
			else if (pos > n.pos - SAME) t += hold / 2;
		}
		return t;
	}

	function toKnob(travel: number) {
		const t = Math.min(length, Math.max(0, travel));
		let before = 0; // holds passed so far
		for (const n of notches) {
			const start = n.pos + before;
			if (t < start) return { pos: t - before, value: null };
			if (t <= start + hold) return { pos: n.pos, value: n.value };
			before += hold;
		}
		return { pos: t - before, value: null };
	}

	return { length, toTravel, toKnob };
}

import { describe, it, expect } from 'vitest';
import { detentTravel, DETENT_HOLD, CONTROLLER_DETENT_HOLD, SWING_DETENTS, TEMPO_DETENTS, TRIPLET_SWING, SWING_STOPS, nextStop } from './knobDetents';

// A 20–300 BPM knob, as the Tempo knob
const tempoPos = (bpm: number) => (bpm - 20) / 280;
const tempo = detentTravel(TEMPO_DETENTS.map((v) => ({ pos: tempoPos(v), value: v })));

describe('soft notches on a knob', () => {
	it('make the travel one hold longer per notch, and leave the ends where they were', () => {
		expect(tempo.length).toBeCloseTo(1 + TEMPO_DETENTS.length * DETENT_HOLD);
		expect(tempo.toKnob(0)).toEqual({ pos: 0, value: null });
		expect(tempo.toKnob(tempo.length)).toEqual({ pos: 1, value: null });
		expect(tempo.toKnob(-1).pos).toBe(0); // dragged past the ends
		expect(tempo.toKnob(99).pos).toBe(1);
		expect(tempo.toTravel(1)).toBeCloseTo(tempo.length);
	});

	it('hold the knob on a notch, at its exact value, for the whole hold', () => {
		const at = tempo.toTravel(tempoPos(120));
		for (const d of [-0.49, -0.25, 0, 0.25, 0.49]) {
			expect(tempo.toKnob(at + d * DETENT_HOLD)).toEqual({ pos: tempoPos(120), value: 120 });
		}
		// Just past the hold, the knob carries on from the notch: no jump
		const after = tempo.toKnob(at + 0.51 * DETENT_HOLD + 0.001);
		expect(after.value).toBeNull();
		expect(after.pos - tempoPos(120)).toBeCloseTo(0.001 + 0.01 * DETENT_HOLD, 6);
		const before = tempo.toKnob(at - 0.51 * DETENT_HOLD - 0.001);
		expect(tempoPos(120) - before.pos).toBeCloseTo(0.001 + 0.01 * DETENT_HOLD, 6);
	});

	it('move the knob steadily between notches, never backwards', () => {
		let last = -1;
		for (let t = 0; t <= tempo.length; t += 0.0005) {
			const { pos } = tempo.toKnob(t);
			expect(pos).toBeGreaterThanOrEqual(last);
			last = pos;
		}
		// Every notch is held somewhere along the way, in order
		const held: number[] = [];
		for (let t = 0; t <= tempo.length; t += 0.001) {
			const { value } = tempo.toKnob(t);
			if (value !== null && held.at(-1) !== value) held.push(value);
		}
		expect(held).toEqual(TEMPO_DETENTS);
	});

	it('find a position again on the travel (a drag starts where the knob is)', () => {
		for (const pos of [0, 0.1, tempoPos(119), tempoPos(121), 0.9, 1]) {
			expect(tempo.toKnob(tempo.toTravel(pos)).pos).toBeCloseTo(pos, 9);
		}
		expect(tempo.toKnob(tempo.toTravel(tempoPos(140)))).toEqual({ pos: tempoPos(140), value: 140 });
	});

	it('ignore notches at the very ends and repeated ones; none is a plain knob', () => {
		const t = detentTravel([{ pos: 0, value: 0 }, { pos: 0.5, value: 5 }, { pos: 0.5, value: 5 }, { pos: 1, value: 10 }]);
		expect(t.length).toBeCloseTo(1 + DETENT_HOLD);
		const plain = detentTravel([]);
		expect(plain.length).toBe(1);
		expect(plain.toKnob(0.37)).toEqual({ pos: 0.37, value: null });
	});

	it('let a MIDI controller reach 120 BPM, which its 128 steps miss without notches', () => {
		// A controller's knob gets the lighter hold (Knob.vue's setPosition)
		const controller = detentTravel(TEMPO_DETENTS.map((v) => ({ pos: tempoPos(v), value: v })), CONTROLLER_DETENT_HOLD);
		expect(CONTROLLER_DETENT_HOLD).toBeLessThan(DETENT_HOLD);
		const bpmAt = (cc: number) => {
			const k = controller.toKnob((cc / 127) * controller.length);
			return k.value ?? Math.round(20 + k.pos * 280);
		};
		const plain = Array.from({ length: 128 }, (_, cc) => Math.round(20 + (cc / 127) * 280));
		expect(plain).not.toContain(120);
		const reached = Array.from({ length: 128 }, (_, cc) => bpmAt(cc));
		for (const bpm of TEMPO_DETENTS) expect(reached).toContain(bpm);
	});

	it('put the swing notches on the knob\'s 1 % steps, the triplet among them', () => {
		for (const v of SWING_DETENTS) expect(Math.round(v * 100) / 100).toBe(v);
		expect(SWING_DETENTS).toContain(TRIPLET_SWING);
		expect(SWING_DETENTS.every((v) => v > 0 && v < 0.5)).toBe(true);
		expect(TEMPO_DETENTS.every((v) => Number.isInteger(v) && v > 20 && v < 300)).toBe(true);
	});
});

describe("the phone's Swing stops", () => {
	it('go from none to half a step by the notches', () => {
		expect(SWING_STOPS).toEqual([0, 0.08, 0.16, 0.24, 0.33, 0.42, 0.5]);
	});

	it('step to the next stop either way, from a stop or from between two', () => {
		expect(nextStop(0, SWING_STOPS, 1)).toBe(0.08);
		expect(nextStop(0.33, SWING_STOPS, 1)).toBe(0.42);
		expect(nextStop(0.33, SWING_STOPS, -1)).toBe(0.24);
		expect(nextStop(0.2, SWING_STOPS, 1)).toBe(0.24);
		expect(nextStop(0.2, SWING_STOPS, -1)).toBe(0.16);
		expect(nextStop(0.5, SWING_STOPS, 1)).toBe(0.5);
		expect(nextStop(0, SWING_STOPS, -1)).toBe(0);
	});
});

import { describe, it, expect } from 'vitest';
import { createHistory } from './history';

type S = { tempo: number; steps: boolean[] };
const s = (tempo: number, steps = [false, false]): S => ({ tempo, steps });

describe('undo history', () => {
	it('starts empty; the first record only sets the starting point', () => {
		const h = createHistory<S>();
		expect(h.current()).toBeNull();
		expect(h.canUndo()).toBe(false);
		expect(h.canRedo()).toBe(false);
		expect(h.undo()).toBeNull();
		expect(h.redo()).toBeNull();

		expect(h.record(s(80))).toBe(false);
		expect(h.current()).toEqual(s(80));
		expect(h.canUndo()).toBe(false);
	});

	it('steps back and forward through recorded changes', () => {
		const h = createHistory<S>();
		h.record(s(80));
		expect(h.record(s(90))).toBe(true);
		expect(h.record(s(100))).toBe(true);
		expect(h.canUndo()).toBe(true);
		expect(h.canRedo()).toBe(false);

		expect(h.undo()).toEqual(s(90));
		expect(h.undo()).toEqual(s(80));
		expect(h.undo()).toBeNull(); // nothing before the start
		expect(h.current()).toEqual(s(80));
		expect(h.canRedo()).toBe(true);

		expect(h.redo()).toEqual(s(90));
		expect(h.redo()).toEqual(s(100));
		expect(h.redo()).toBeNull();
	});

	it('ignores a record that changes nothing', () => {
		const h = createHistory<S>();
		h.record(s(80));
		expect(h.record(s(80))).toBe(false);
		expect(h.canUndo()).toBe(false);
		expect(h.isCurrent(s(80))).toBe(true);
		expect(h.isCurrent(s(81))).toBe(false);
	});

	it('a new change after undo drops what could be redone', () => {
		const h = createHistory<S>();
		h.record(s(80));
		h.record(s(90));
		h.record(s(100));
		h.undo();
		h.undo();
		h.record(s(120));
		expect(h.canRedo()).toBe(false);
		expect(h.undo()).toEqual(s(80));
		expect(h.redo()).toEqual(s(120));
	});

	it('keeps copies, so later edits to the recorded object change nothing', () => {
		const h = createHistory<S>();
		const a = s(80);
		h.record(a);
		a.steps[0] = true;
		a.tempo = 200;
		expect(h.current()).toEqual(s(80));
		const back = h.current()!;
		back.tempo = 1;
		expect(h.current()).toEqual(s(80));
	});

	it('replaceCurrent overwrites the current entry and keeps the redo side', () => {
		const h = createHistory<S>();
		h.record(s(80));
		h.record(s(90));
		h.undo();
		h.replaceCurrent(s(80, [true, false]));
		expect(h.canRedo()).toBe(true);
		expect(h.redo()).toEqual(s(90));
		expect(h.undo()).toEqual(s(80, [true, false]));
	});

	it('reset forgets everything; clear empties it', () => {
		const h = createHistory<S>();
		h.record(s(80));
		h.record(s(90));
		h.reset(s(140));
		expect(h.canUndo()).toBe(false);
		expect(h.canRedo()).toBe(false);
		expect(h.current()).toEqual(s(140));
		h.clear();
		expect(h.current()).toBeNull();
	});

	it('keeps only the newest changes, up to the limit', () => {
		const h = createHistory<S>(3);
		for (let t = 0; t <= 10; t++) h.record(s(t));
		const back: number[] = [];
		let e: S | null;
		while ((e = h.undo())) back.push(e.tempo);
		expect(back).toEqual([9, 8, 7]);
	});
});

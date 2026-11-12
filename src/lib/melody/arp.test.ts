import { describe, it, expect } from 'vitest';
import { arpSlots, arpSequence, blockSize, foldInto } from './arp';

// A minor triad from A3 (MIDI 57): A C E
const TRIAD = [57, 60, 64];
const RANGE = { lo: 44, hi: 95 }; // about 100–2000 Hz, the pads' range

describe('the arpeggio on the pads', () => {
	it('places a note every step, every other step, or every beat', () => {
		expect(arpSlots(16, '1/16')).toEqual([...Array(16).keys()]);
		expect(arpSlots(16, '1/8')).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
		expect(arpSlots(16, '1/4')).toEqual([0, 4, 8, 12]);
	});

	it('fits a rising triad to the bar: 1-3-5-8, four times', () => {
		const seq = arpSequence(TRIAD, 16, { fit: true, direction: 'up', ...RANGE });
		expect(seq.slice(0, 4)).toEqual([57, 60, 64, 69]);
		for (let i = 0; i < 16; i++) expect(seq[i]).toBe(seq[i % 4]);
	});

	it('fits a falling triad by going on into the octave below', () => {
		const down = [64, 60, 57];
		const seq = arpSequence(down, 8, { fit: true, direction: 'down', ...RANGE });
		expect(seq).toEqual([64, 60, 57, 52, 64, 60, 57, 52]);
	});

	it('fits a 7-note scale into 8 (up to the octave), and leaves 4-note cycles as they are', () => {
		const scale = [57, 59, 60, 62, 64, 65, 67];
		const seq = arpSequence(scale, 16, { fit: true, direction: 'up', ...RANGE });
		expect(seq.slice(0, 8)).toEqual([...scale, 69]);
		expect(seq.slice(8)).toEqual(seq.slice(0, 8));
		const updown = [57, 60, 64, 60];
		expect(arpSequence(updown, 8, { fit: true, direction: 'updown', ...RANGE })).toEqual([...updown, ...updown]);
	});

	it('every fitted sequence repeats within the bar, whatever its length', () => {
		for (let n = 1; n <= 14; n++) {
			const order = Array.from({ length: n }, (_, i) => 50 + i * 2);
			for (const slots of [4, 8, 16]) {
				const seq = arpSequence(order, slots, { fit: true, direction: 'updown', ...RANGE });
				const block = Math.min(blockSize(n), slots);
				expect(slots % block, `${n} notes in ${slots}`).toBe(0);
				for (let i = 0; i < slots; i++) expect(seq[i]).toBe(seq[i % block]);
			}
		}
	});

	it('free: the cycle as it comes, ending mid-bar (the old behaviour)', () => {
		const seq = arpSequence(TRIAD, 16, { fit: false, direction: 'up', ...RANGE });
		expect(seq).toEqual(Array.from({ length: 16 }, (_, i) => TRIAD[i % 3]));
	});

	it('keeps notes inside the pads\' range, by octaves', () => {
		expect(foldInto(100, 44, 95)).toBe(88);
		expect(foldInto(30, 44, 95)).toBe(54);
		const high = [88, 91, 95];
		const seq = arpSequence(high, 16, { fit: true, direction: 'up', ...RANGE });
		for (const m of seq) expect(m).toBeLessThanOrEqual(95);
	});
});

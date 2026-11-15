import { describe, it, expect } from 'vitest';
import { addTap, tapBpm, TAP_RESET_MS } from './tapTempo';

const tapAt = (times: number[]) => times.reduce<number[]>((t, now) => addTap(t, now), []);

describe('Tap tempo', () => {
	it('needs four taps', () => {
		expect(tapBpm(tapAt([0, 500, 1000]))).toBeNull();
		expect(tapBpm(tapAt([0, 500, 1000, 1500]))).toBe(120);
	});
	it('averages the gaps and rounds to a whole BPM', () => {
		expect(tapBpm(tapAt([0, 480, 1010, 1500]))).toBe(120);
		expect(tapBpm(tapAt([0, 333, 667, 1000]))).toBe(180);
	});
	it('starts again after a pause', () => {
		const t = tapAt([0, 500, 1000, 1500, 1500 + TAP_RESET_MS + 1]);
		expect(t).toHaveLength(1);
		expect(tapBpm(t)).toBeNull();
	});
	it('follows a new tempo from the last eight taps', () => {
		const slow = [0, 1000, 2000, 3000];
		const fast = Array.from({ length: 8 }, (_, i) => 3000 + 500 * (i + 1));
		expect(tapBpm(tapAt([...slow, ...fast]))).toBe(120);
	});
	it('stays within the knob\'s range', () => {
		expect(tapBpm(tapAt([0, 100, 200, 300]))).toBe(300);
		expect(tapBpm(tapAt([0, 1999, 3998, 5997]), 40)).toBe(40);
	});
});

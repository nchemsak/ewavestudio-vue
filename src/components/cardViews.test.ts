import { describe, it, expect } from 'vitest';
import { spectrumColumns, columnHeight, hitHeights, UNDER_MIN_LEVEL } from './cardViews';
import { freqX, timeX, ENV_MAX_MS } from '../lib/shapeViews';

const SR = 48000;
const BIN_HZ = SR / 8192; // the fine analyser's: about 5.9 Hz a bin

describe('the views in the cards (PR 108)', () => {
	it('the spectrum behind the Filter curve sits on its axis, and the low end is drawn', () => {
		const bins = new Uint8Array(4096);
		bins[Math.round(220 / BIN_HZ)] = 220;   // A3
		bins[Math.round(30 / BIN_HZ)] = 150;    // 30 Hz: the old screen's wall
		const cols = 250;
		const levels = spectrumColumns(bins, BIN_HZ, cols);
		const at = (hz: number) => Math.floor(freqX(hz, cols));
		expect(levels[at(220)]).toBe(220);
		expect(levels[at(30)]).toBe(150);
		expect(levels[at(1000)]).toBe(0);
		// every column below 100 Hz has a bin of its own to read (no empty wall)
		const lowCols = Array.from({ length: at(100) }, (_, c) => c);
		expect(lowCols.length).toBeGreaterThan(30);
	});

	it('a column is dark under the floor and full near the top of the analyser\'s range', () => {
		expect(columnHeight(0)).toBe(0);
		expect(columnHeight(UNDER_MIN_LEVEL)).toBe(0);
		expect(columnHeight(128)).toBeGreaterThan(0.4);
		expect(columnHeight(255)).toBe(1);
	});

	it('the hit behind the Envelope curve is on its square-root time scale, as a share of its peak', () => {
		// 50 ms of a 200 Hz tone at 0.5, then silence, 1 s long
		const ch = Float32Array.from({ length: SR }, (_, i) => (i < SR * 0.05 ? 0.5 * Math.sin((2 * Math.PI * 200 * i) / SR) : 0));
		const cols = 110;
		const h = hitHeights({ channels: [ch], sampleRate: SR, hz: 200 }, cols);
		expect(Math.max(...h)).toBeCloseTo(1, 5);
		const end = timeX(50, cols, ENV_MAX_MS);
		expect(h[Math.floor(end) - 3]).toBeGreaterThan(0.9);
		expect(h[Math.ceil(end) + 3]).toBe(0);
		expect(h[cols - 1]).toBe(0);
	});
});

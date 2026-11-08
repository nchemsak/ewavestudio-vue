import { describe, it, expect } from 'vitest';
import { padHue, spectrumHue, spectrumColour, PAD_LOW_HZ, PAD_HIGH_HZ } from './padColour';

const lightOf = (c: string) => Number(/(\d+)%\)$/.exec(c)![1]);
const hueOf = (c: string) => Number(/^hsl\((\d+)/.exec(c)![1]);

describe('pad colours', () => {
	it('run from blue at the lowest pad pitch to red at the highest', () => {
		expect(padHue(PAD_LOW_HZ)).toBe(220);
		expect(padHue(PAD_HIGH_HZ)).toBe(0);
		expect(padHue(220)).toBe(206); // A3, the default pad: blue
		expect(padHue(50)).toBe(220);
		expect(padHue(5000)).toBe(0);
	});

	it('the spectrogram draws a note in its pad\'s colour', () => {
		for (const hz of [100, 220, 440, 880, 1760, 2000]) expect(spectrumHue(hz)).toBe(padHue(hz));
		expect(hueOf(spectrumColour(440, 200))).toBe(padHue(440));
	});

	it('above the pads, harmonics go on from red toward magenta', () => {
		expect(spectrumHue(4000)).toBeLessThan(360);
		expect(spectrumHue(4000)).toBeGreaterThan(spectrumHue(8000));
		expect(spectrumHue(32000)).toBe(300);
		expect(spectrumHue(100000)).toBe(300);
	});

	it('louder is brighter on a dark screen, darker on a light one', () => {
		expect(lightOf(spectrumColour(440, 250))).toBeGreaterThan(lightOf(spectrumColour(440, 30)));
		expect(lightOf(spectrumColour(440, 250, true))).toBeLessThan(lightOf(spectrumColour(440, 30, true)));
		expect(lightOf(spectrumColour(440, 30))).toBeGreaterThanOrEqual(22); // still visible when quiet
	});
});

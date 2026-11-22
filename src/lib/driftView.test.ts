import { describe, expect, it } from 'vitest';
import { envelopePath, fadeStops, pitchY, swarmLines } from './driftView';
import { DRIFT_DEFAULTS } from './machines/drift';

describe('the swarm\'s screen', () => {
	it('shows Attack, a bar held and Release across', () => {
		expect(fadeStops({ attack: 1, release: 2 })).toEqual({ inEnd: 0.25, outStart: 0.5 });
		expect(envelopePath({ attack: 1, release: 1 })).toMatch(/^M0 /);
	});

	it('draws a line per voice of each note, higher notes higher', () => {
		const lines = swarmLines({ ...DRIFT_DEFAULTS, voices: 4 }, [{ hz: 220, hue: 200 }, { hz: 440, hue: 10 }]);
		expect(lines).toHaveLength(8);
		expect(pitchY(440)).toBeLessThan(pitchY(220));
		// Deterministic: the same picture for the same sound
		expect(swarmLines(DRIFT_DEFAULTS, [{ hz: 220, hue: 1 }])).toEqual(swarmLines(DRIFT_DEFAULTS, [{ hz: 220, hue: 1 }]));
	});
});

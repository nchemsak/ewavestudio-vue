import { describe, it, expect } from 'vitest';
import { validateAndMigrate, CURRENT_VERSION } from './projectSchema';

// A lane as the app saves it today
const lane = (overrides: Record<string, unknown> = {}) => ({
	name: 'synth-voice',
	label: 'Percussion Synth',
	type: 'synth',
	isCustom: false,
	muted: false,
	channelVolume: 0.5,
	steps: Array(16).fill(false),
	velocities: Array(16).fill(1),
	pitches: Array(16).fill(220),
	waveforms: Array(16).fill('sine'),
	...overrides,
});

describe('validateAndMigrate', () => {
	it('accepts a current project and keeps every field, including unknown ones', () => {
		const file = {
			version: 2,
			projectId: 'p1',
			meta: { name: 'Song' },
			data: {
				synth: { lfo: { rate: 5, target: 'filter' } },
				instruments: [lane({ steps: [true, ...Array(15).fill(false)] })],
				melody: { arpPattern: 'down', arpRate: '1/8' },
				someFutureField: 42,
			},
		};
		const out = validateAndMigrate(structuredClone(file));
		expect(out.version).toBe(CURRENT_VERSION);
		expect(out.projectId).toBe('p1');
		expect(out.data).toEqual(file.data);
	});

	it('accepts a project with no lanes', () => {
		expect(() => validateAndMigrate({ version: 2, data: {} })).not.toThrow();
	});

	it('treats a file without a version number as current', () => {
		const out = validateAndMigrate({ data: { instruments: [lane()] } });
		expect(out.version).toBe(2);
		expect(out.data.instruments).toHaveLength(1);
	});

	it('upgrades a version-1 project (pads) to lanes, filling in defaults', () => {
		const out = validateAndMigrate({ data: { pads: [{ name: 'kick', steps: [true, false] }, {}] } });
		expect(out.version).toBe(2);
		expect(out.data.instruments[0]).toMatchObject({
			name: 'kick',
			label: 'Pad 1',
			type: 'sample',
			isCustom: false,
			muted: false,
			channelVolume: 0.5,
			steps: [true, false],
		});
		expect(out.data.instruments[1]).toMatchObject({ name: 'legacy-1', label: 'Pad 2' });
		expect(out.data.instruments[1].steps).toEqual(Array(16).fill(false));
	});

	it('rejects a project whose lanes are malformed', () => {
		expect(() => validateAndMigrate({ version: 2, data: { instruments: [{ name: 1 }] } })).toThrow();
		expect(() => validateAndMigrate({ version: 2, data: { instruments: [lane({ steps: 'on' })] } })).toThrow();
	});
});

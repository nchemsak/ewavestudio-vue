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

	// The cases below pin details of the zod schema this check replaced, so they stay the same.

	it('rejects numbers that are not finite (NaN, Infinity)', () => {
		for (const bad of [NaN, Infinity, -Infinity]) {
			expect(() => validateAndMigrate({ data: { instruments: [lane({ channelVolume: bad })] } })).toThrow();
			expect(() => validateAndMigrate({ data: { instruments: [lane({ velocities: [1, bad] })] } })).toThrow();
			expect(() => validateAndMigrate({ data: { instruments: [lane({ pitches: [220, bad] })] } })).toThrow();
		}
	});

	it('accepts a missing optional field but not null, except for pitches and waveforms', () => {
		expect(() => validateAndMigrate({ data: { meta: {} } })).not.toThrow();
		expect(() => validateAndMigrate({ data: { meta: { name: null } } })).toThrow();
		expect(() => validateAndMigrate({ data: { meta: null } })).toThrow();
		expect(() => validateAndMigrate({ data: { instruments: null } })).toThrow();
		expect(() => validateAndMigrate({ data: { selectedWaveform: null } })).toThrow();
		expect(() => validateAndMigrate({ data: { instruments: [lane({ pitches: null, waveforms: null })] } })).not.toThrow();
		expect(() => validateAndMigrate({ data: { instruments: [lane({ pitches: undefined, waveforms: undefined })] } })).not.toThrow();
	});

	it('rejects lists with holes or wrong items, and lanes that are not objects', () => {
		const withHole = [true, , false]; // nothing between the two commas
		expect(() => validateAndMigrate({ data: { instruments: [lane({ steps: withHole })] } })).toThrow();
		expect(() => validateAndMigrate({ data: { instruments: [lane({ pitches: [220, '440'] })] } })).toThrow();
		expect(() => validateAndMigrate({ data: { instruments: [null] } })).toThrow();
		expect(() => validateAndMigrate({ data: { instruments: [[]] } })).toThrow();
		expect(() => validateAndMigrate({ data: 'not a project' })).toThrow();
	});

	it('does not check the free-form sections (ui, transport, synth, fx)', () => {
		expect(() => validateAndMigrate({ data: { ui: 'x', transport: null, synth: [1], fx: 5 } })).not.toThrow();
	});

	it('rejects a version-1 file whose pads or patterns are not lists', () => {
		expect(() => validateAndMigrate({ version: 1, data: { pads: 'kick' } })).toThrow();
		expect(() => validateAndMigrate({ version: 1, data: { patterns: {} } })).toThrow();
		expect(() => validateAndMigrate({ version: 1, data: 'old' })).toThrow();
	});

	it('says where it found the problem', () => {
		expect(() => validateAndMigrate({ data: { instruments: [lane(), lane({ muted: 'no' })] } }))
			.toThrow('instruments[1].muted');
	});
});

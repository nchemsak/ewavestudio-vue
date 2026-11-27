import { describe, expect, it } from 'vitest';
import { anySolo, applyMix, createMix, dry, heard, mixSnapshot, resetMix } from './mix';

describe('FX and Solo per machine', () => {
	it('starts with FX on and nothing soloed', () => {
		const m = createMix();
		expect(mixSnapshot(m)).toEqual({
			fx: { rhythm: true, bass: true, drums: true, drift: true },
			solo: { rhythm: false, bass: false, drums: false, drift: false },
		});
		expect(dry('bass', m)).toBe(false);
	});

	it('hears every unmuted machine while nothing is soloed', () => {
		const m = createMix();
		expect(anySolo(m.solo)).toBe(false);
		expect(heard('rhythm', false, m.solo)).toBe(true);
		expect(heard('rhythm', true, m.solo)).toBe(false);
	});

	it('hears only the soloed machines while any is soloed, and a muted one stays muted', () => {
		const m = createMix();
		m.solo.bass = true;
		expect(heard('bass', false, m.solo)).toBe(true);
		expect(heard('rhythm', false, m.solo)).toBe(false);
		expect(heard('drift', false, m.solo)).toBe(false);
		m.solo.drums = true;
		expect(heard('drums', false, m.solo)).toBe(true);
		expect(heard('drums', true, m.solo)).toBe(false);
	});

	it('FX off plays a machine dry', () => {
		const m = createMix();
		m.fx.drift = false;
		expect(dry('drift', m)).toBe(true);
		expect(dry('rhythm', m)).toBe(false);
	});

	it('saves and loads; a project from before gets FX on and no solo; damaged flags are ignored', () => {
		const m = createMix();
		m.fx.rhythm = false; m.solo.drums = true;
		const saved = JSON.parse(JSON.stringify(mixSnapshot(m)));
		const n = createMix();
		applyMix(n, saved);
		expect(mixSnapshot(n)).toEqual(saved);
		applyMix(n, undefined);
		expect(mixSnapshot(n)).toEqual(mixSnapshot(createMix()));
		applyMix(n, { fx: { bass: 'no', drums: false }, solo: 3 });
		expect(n.fx).toEqual({ rhythm: true, bass: true, drums: false, drift: true });
		expect(anySolo(n.solo)).toBe(false);
		n.solo.bass = true; n.fx.bass = false;
		resetMix(n);
		expect(mixSnapshot(n)).toEqual(mixSnapshot(createMix()));
	});
});

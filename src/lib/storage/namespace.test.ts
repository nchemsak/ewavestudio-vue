import { describe, it, expect } from 'vitest';
import { STORAGE_NS, storageKey } from './namespace';

// The original app on /studio/ uses these names. This copy must never touch them.
const STUDIO_V1_NAMES = ['ewave-db', 'ewave:lastProjectId', 'ewave:reset-ui-next', 'seqOpen', 'ui-theme'];

describe('storage names', () => {
	it('are prefixed with the folder this build is served from', () => {
		expect(import.meta.env.BASE_URL).toBe('/studio2/');
		expect(STORAGE_NS).toBe('ewave-studio2');
		expect(storageKey('lastProjectId')).toBe('ewave-studio2:lastProjectId');
	});

	it("never collide with the original /studio/ app's names", () => {
		const ours = [`${STORAGE_NS}-db`, ...['lastProjectId', 'reset-ui-next', 'seqOpen', 'ui-theme'].map(storageKey)];
		for (const name of ours) expect(STUDIO_V1_NAMES).not.toContain(name);
	});
});

// src/lib/storage/namespace.ts
// Browsers keep localStorage and IndexedDB per website, not per folder, so every copy of
// the app on ephemeralwave.com (/studio/, /studio2/, ...) would otherwise share saved
// projects and settings. All storage names are prefixed with the folder this build is
// served from (vite.config.js `base`), so each copy stays independent.
//
// The original app on /studio/ uses unprefixed names ('ewave-db', 'ewave:lastProjectId',
// 'ewave:reset-ui-next', 'seqOpen', 'ui-theme'). Never use those names here.

const folder = import.meta.env.BASE_URL.replace(/^\/+|\/+$/g, '') || 'root';

/** For example "ewave-studio2" when served from /studio2/ */
export const STORAGE_NS = `ewave-${folder}`;

/** localStorage key for this copy of the app, for example "ewave-studio2:lastProjectId" */
export function storageKey(name: string): string {
	return `${STORAGE_NS}:${name}`;
}

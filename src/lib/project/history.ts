// src/lib/project/history.ts
// Undo/redo history of project snapshots (snapshot.ts). Pure logic, no Vue, so it can be
// unit-tested in Node; src/composables/useUndoHistory.ts decides when to record an entry and
// applies the one undo/redo returns.
//
// Entries are stored as JSON text: a cheap deep copy that nothing can change afterwards, and
// a cheap way to tell whether anything changed.

export type History<T> = {
	// Forget everything; `state` becomes the only entry (a project was opened, imported or made)
	reset(state: T): void;
	// Add `state` after the current entry, dropping anything that could be redone. Returns false
	// (and does nothing) when it equals the current entry. The first call after creation or
	// clear() only sets the starting point.
	record(state: T): boolean;
	// Overwrite the current entry without adding one (settings that follow by themselves after
	// an undo, such as the delay time following the tempo)
	replaceCurrent(state: T): void;
	// Step back or forward; returns the entry to apply, or null at either end
	undo(): T | null;
	redo(): T | null;
	// The current entry, or null before the first record()/reset()
	current(): T | null;
	isCurrent(state: T): boolean;
	canUndo(): boolean;
	canRedo(): boolean;
	clear(): void;
};

export const DEFAULT_HISTORY_LIMIT = 100;

export function createHistory<T>(limit = DEFAULT_HISTORY_LIMIT): History<T> {
	let entries: string[] = [];
	let index = -1; // the entry the settings are at

	const encode = (s: T) => JSON.stringify(s);
	const decode = (s: string) => JSON.parse(s) as T;

	return {
		reset(state) {
			entries = [encode(state)];
			index = 0;
		},
		record(state) {
			const enc = encode(state);
			if (index < 0) {
				entries = [enc];
				index = 0;
				return false;
			}
			if (entries[index] === enc) return false;
			entries = entries.slice(0, index + 1);
			entries.push(enc);
			// Keep the newest `limit` changes (plus the state they started from)
			if (entries.length > limit + 1) entries = entries.slice(entries.length - (limit + 1));
			index = entries.length - 1;
			return true;
		},
		replaceCurrent(state) {
			if (index < 0) {
				entries = [encode(state)];
				index = 0;
				return;
			}
			entries[index] = encode(state);
		},
		undo() {
			if (index <= 0) return null;
			index--;
			return decode(entries[index]);
		},
		redo() {
			if (index < 0 || index >= entries.length - 1) return null;
			index++;
			return decode(entries[index]);
		},
		current() {
			return index < 0 ? null : decode(entries[index]);
		},
		isCurrent(state) {
			return index >= 0 && entries[index] === encode(state);
		},
		canUndo: () => index > 0,
		canRedo: () => index >= 0 && index < entries.length - 1,
		clear() {
			entries = [];
			index = -1;
		},
	};
}

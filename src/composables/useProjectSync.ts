// src/composables/useProjectSync.ts
// Connects the app's settings to the project store (stores/projectStore.ts):
// - every change to the settings is copied into the store (UI -> store), which is what
//   ProjectControls saves, exports and compares to show unsaved changes;
// - a project put into the store (opened, imported, new) is applied to the settings
//   (store -> UI);
// - after File -> New (ProjectControls sets the one-shot 'reset-ui-next' flag), the settings
//   go back to factory defaults;
// - the last opened project is remembered and reopened when the page loads.
// Saving to IndexedDB happens only in ProjectControls, on an explicit Save.
//
// Call once, from DrumSequencer's setup: it registers watchers and a mount hook.

import { watch, onMounted, nextTick } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { storageKey } from '../lib/storage/namespace';
import { BrokenProjectError, brokenProjectMessage } from '../lib/storage/projects';

export function useProjectSync(opts: {
	// All saved settings as a plain object (snapshot.ts)
	buildSnapshot: () => any;
	// Restore settings from a snapshot (snapshot.ts)
	applySnapshot: (s: any) => void;
	// Factory defaults for File -> New, including UI-only parts such as closing menus
	resetUiToFactoryDefaults: () => void;
}) {
	const { buildSnapshot, applySnapshot, resetUiToFactoryDefaults } = opts;

	const project = useProjectStore();

	// Remember last opened project id
	watch(() => project.projectId, (id) => {
		if (id) localStorage.setItem(storageKey('lastProjectId'), id);
	});

	watch(() => project.projectId, async () => {
		// one-shot UI reset if requested by ProjectControls
		const flag = localStorage.getItem(storageKey('reset-ui-next'));
		if (flag === '1') {
			localStorage.removeItem(storageKey('reset-ui-next'));
			resetUiToFactoryDefaults();
			// replace the blank store snapshot with the fresh UI defaults so autosave is coherent
			project.data = buildSnapshot();
			await project.save?.();
		}
	});

	let applyingFromStore = false;

	// UI -> Store
	watch(
		() => buildSnapshot(),
		(snap) => {
			if (applyingFromStore) return;
			try {
				const a = JSON.stringify(project.data);
				const b = JSON.stringify(snap);
				if (a === b) return;
			} catch { }

			project.data = snap;
		},
		{ deep: true }
	);

	// Store -> UI
	watch(
		() => project.data,
		(data) => {
			if (!data) return;
			applyingFromStore = true;
			try {
				applySnapshot(data);
				// applySnapshot() may correct what it loads (an older project's delay time is
				// recomputed from its division, values are fitted to this device). Store the
				// result right away, so the project, its export and its undo history hold what
				// the settings are. This runs before ProjectControls notes the loaded project
				// as saved, so it doesn't count as an unsaved change. Applying the result again
				// changes nothing, so this happens once.
				const snap = buildSnapshot();
				if (JSON.stringify(snap) !== JSON.stringify(data)) project.data = snap;
			} finally {
				nextTick(() => { applyingFromStore = false; });
			}
		},
		{ deep: false, flush: 'sync' }
	);

	// On first mount, open last project or create a new one from current defaults. If the last
	// project fails the project check, say so and start a new one, so Save works (it needs a
	// loaded project). The broken record stays in IndexedDB, untouched.
	onMounted(async () => {
		const lastId = localStorage.getItem(storageKey('lastProjectId'));
		let opened = false;
		let broken: BrokenProjectError | null = null;
		if (lastId) {
			try {
				opened = await project.load(lastId);
			} catch (err) {
				if (!(err instanceof BrokenProjectError)) throw err;
				broken = err;
				console.error(err, (err as any).cause);
			}
		}
		if (!opened) {
			await project.newProject('Untitled', buildSnapshot());
		}
		if (broken) {
			// After the page has drawn the new project
			const msg = brokenProjectMessage(broken, 'Your last project', 'A new project was started instead.');
			setTimeout(() => window.alert(msg), 0);
		}

		if (project.data) {
			applyingFromStore = true;
			try { applySnapshot(project.data); } finally { applyingFromStore = false; }
		}
	});

	return { project };
}

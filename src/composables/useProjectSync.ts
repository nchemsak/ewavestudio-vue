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

	// On first mount, open last project or create a new one from current defaults
	onMounted(async () => {
		const lastId = localStorage.getItem(storageKey('lastProjectId'));
		if (lastId) {
			const ok = await project.load(lastId);
			if (!ok) {
				await project.newProject('Untitled', buildSnapshot());
			}
		} else {
			await project.newProject('Untitled', buildSnapshot());
		}

		if (project.data) {
			applyingFromStore = true;
			try { applySnapshot(project.data); } finally { applyingFromStore = false; }
		}
	});

	return { project };
}

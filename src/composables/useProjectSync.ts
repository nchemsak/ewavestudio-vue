// src/composables/useProjectSync.ts
// Connects the app's settings to the project store (stores/projectStore.ts):
// - every change to the settings is copied into the store (UI -> store), once they have been
//   still for SYNC_MS; the store is what ProjectControls saves, exports and compares to show
//   unsaved changes;
// - a project put into the store (opened, imported, new) is applied to the settings
//   (store -> UI);
// - after File -> New (ProjectControls sets the one-shot 'reset-ui-next' flag), the settings
//   go back to factory defaults;
// - the last opened project is remembered and reopened when the page loads.
// Saving to IndexedDB happens only in ProjectControls, on an explicit Save.
//
// Call once, from DrumSequencer's setup: it registers watchers and a mount hook.

import { watch, onMounted, onUnmounted, toRaw } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { storageKey } from '../lib/storage/namespace';
import { BrokenProjectError, brokenProjectMessage } from '../lib/storage/projects';

// How long the settings must be still before a change is copied into the store
export const SYNC_MS = 100;

export function useProjectSync(opts: {
	// The saved settings' refs (DrumSequencer's projectState): watched, never changed here.
	// buildSnapshot() must read nothing else, or a change to it would be missed.
	settings: object;
	// All saved settings as a plain object (snapshot.ts)
	buildSnapshot: () => any;
	// Restore settings from a snapshot (snapshot.ts)
	applySnapshot: (s: any) => void;
	// Factory defaults for File -> New, including UI-only parts such as closing menus
	resetUiToFactoryDefaults: () => void;
}) {
	const { settings, buildSnapshot, applySnapshot, resetUiToFactoryDefaults } = opts;

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
			flushToStore();
			await project.save?.();
		}
	});

	// The project store holds the settings as one snapshot (snapshot.ts). Building it and
	// turning it into JSON costs more as the project grows, so it isn't done on every change
	// (every frame of a knob drag): a deep watch on the settings refs (cheap: it only reads
	// them) notices a change, and the snapshot is built once the settings have been still for
	// SYNC_MS. flushToStore() does it at once; the store calls it before saving, and
	// ProjectControls before exporting and before the page is left.
	let timer: ReturnType<typeof setTimeout> | null = null;
	let storedJson = '';     // JSON of project.data, as last written or applied here
	let written: any = null; // the last snapshot written here (not to be applied back)

	function flushToStore() {
		if (timer) { clearTimeout(timer); timer = null; }
		const snap = buildSnapshot();
		const json = JSON.stringify(snap);
		if (json === storedJson) return;
		storedJson = json;
		written = snap;
		project.data = snap;
	}
	project.setFlushHook(flushToStore);
	onUnmounted(() => {
		if (timer) clearTimeout(timer);
		project.setFlushHook(null);
	});

	// UI -> Store
	// (a getter: `settings` is a plain object of refs, which `deep` reads through)
	watch(() => settings, () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(flushToStore, SYNC_MS);
	}, { deep: true });

	// Store -> UI: a project put into the store (opened, imported, new)
	function applyFromStore(data: any) {
		// Whatever was pending belongs to the settings being replaced
		if (timer) { clearTimeout(timer); timer = null; }
		applySnapshot(data);
		storedJson = JSON.stringify(data);
		written = null;
		// applySnapshot() may correct what it loads (an older project's delay time is
		// recomputed from its division, values are fitted to this device). Store the result
		// right away, so the project, its export and its undo history hold what the settings
		// are. This runs before ProjectControls notes the loaded project as saved, so it doesn't
		// count as an unsaved change.
		flushToStore();
	}
	watch(
		() => project.data,
		(data) => {
			if (!data || toRaw(data) === written) return; // our own write: the settings already match
			applyFromStore(data);
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

		if (project.data && toRaw(project.data) !== written) applyFromStore(project.data);
	});

	return { project };
}

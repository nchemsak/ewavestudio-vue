// src/composables/useUndoHistory.ts
// Undo/redo for the project's settings (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y, and the
// buttons in ProjectControls).
//
// - Each entry is a full project snapshot (snapshot.ts) without its `ui` part: the theme and
//   which panels are open are not undone.
// - A change is recorded once the settings have stayed the same for SETTLE_MS and no pointer
//   is held down, so a knob drag, a slider drag or a burst of arrow keys is one undo step.
// - Opening, importing or creating a project (a new projectId) starts a fresh history, so
//   File → New and Open can't be undone; their own project is the starting point.
// - After an undo or redo the panels may adjust settings by themselves (the Delay panel sets
//   the delay time from the tempo). Those follow-ups are folded into the entry, so they don't
//   count as a new change that would throw away the redo side.
//
// The history is in memory only; it isn't saved with the project. Call once, from
// DrumSequencer's setup.

import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { createHistory } from '../lib/project/history';

export const SETTLE_MS = 400;

export function useUndoHistory(opts: {
	// All saved settings as a plain object (snapshot.ts)
	buildSnapshot: () => any;
	// Restore settings from a snapshot (snapshot.ts)
	applySnapshot: (s: any) => void;
}) {
	const { buildSnapshot, applySnapshot } = opts;
	const project = useProjectStore();
	const history = createHistory<any>();

	const canUndo = ref(false);
	const canRedo = ref(false);
	const updateFlags = () => {
		canUndo.value = history.canUndo();
		canRedo.value = history.canRedo();
	};

	// The part of a snapshot that undo restores
	const undoable = () => {
		const { ui, ...rest } = buildSnapshot();
		return rest;
	};

	let timer: ReturnType<typeof setTimeout> | null = null;
	let changePending = false; // a change seen but not recorded yet
	let startFresh = true;     // the next record starts a new history (a new project)
	let applying = false;      // an undo/redo is being applied
	let pointerHeld = false;

	function record() {
		if (timer) { clearTimeout(timer); timer = null; }
		changePending = false;
		if (applying) return;
		const state = undoable();
		if (startFresh) {
			history.reset(state);
			startFresh = false;
		} else {
			history.record(state);
		}
		updateFlags();
	}

	function scheduleRecord() {
		changePending = true;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			// Still dragging: wait for the pointer to come up (onPointerUp)
			if (!pointerHeld) record();
		}, SETTLE_MS);
	}

	// ProjectSync copies every settings change into project.data (a new object each time), so
	// a shallow watch sees each change without building another snapshot
	watch(() => project.data, () => {
		if (!applying) scheduleRecord();
	});
	watch(() => project.projectId, () => {
		startFresh = true;
		scheduleRecord();
	});

	// Record what's pending now, so undo goes back past the latest change even if it hasn't
	// settled yet
	function flush() {
		if (changePending || startFresh) record();
	}

	async function step(dir: 'undo' | 'redo') {
		if (applying) return;
		flush();
		const state = dir === 'undo' ? history.undo() : history.redo();
		if (!state) return;
		applying = true;
		try {
			applySnapshot(state);
			// Let the panels react (props, their watchers and what they emit back)
			await nextTick();
			await nextTick();
			history.replaceCurrent(undoable());
		} finally {
			if (timer) { clearTimeout(timer); timer = null; }
			changePending = false;
			applying = false;
			updateFlags();
		}
	}

	const undo = () => step('undo');
	const redo = () => step('redo');

	function onPointerDown() { pointerHeld = true; }
	function onPointerUp() {
		pointerHeld = false;
		if (changePending && !timer) scheduleRecord();
	}
	onMounted(() => {
		window.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('pointerup', onPointerUp, true);
		window.addEventListener('pointercancel', onPointerUp, true);
	});
	onUnmounted(() => {
		window.removeEventListener('pointerdown', onPointerDown, true);
		window.removeEventListener('pointerup', onPointerUp, true);
		window.removeEventListener('pointercancel', onPointerUp, true);
		if (timer) clearTimeout(timer);
	});

	return { canUndo, canRedo, undo, redo };
}

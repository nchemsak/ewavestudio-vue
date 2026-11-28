// src/composables/useDriftMotion.ts
// Drift's Motion on the X/Y pad (the plan's item 19): where the engine has the pad's dot now
// (its driftMotionNow(), pad units), read once a frame into one reactive object while Motion
// moves something and the sequencer plays (or the dot is still gliding home after Stop), as the
// LFO visualizer's clock (useLfoVisual.ts). Only the pad reads its fields, so only it redraws
// every frame. With prefers-reduced-motion it never runs: the pad shows the path only.

import { reactive, watch, onBeforeUnmount, type Ref } from 'vue';

export type DriftMotionView = { x: number | null; y: number | null };

export function useDriftMotion(opts: {
	now: () => { x: number; y: number } | null;
	active: Ref<boolean>; // Depth above 0 and playing
}) {
	const view = reactive<DriftMotionView>({ x: null, y: null });
	const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
	let raf = 0;

	function tick() {
		raf = 0;
		const p = mq?.matches ? null : opts.now();
		view.x = p ? Math.round(p.x * 1000) / 1000 : null;
		view.y = p ? Math.round(p.y * 1000) / 1000 : null;
		// Keeps going while playing, and after Stop until the dot is home
		if (opts.active.value || p) raf = requestAnimationFrame(tick);
	}

	watch(opts.active, (on) => {
		if (on && !raf) raf = requestAnimationFrame(tick);
	}, { immediate: true });

	onBeforeUnmount(() => { if (raf) cancelAnimationFrame(raf); });
	return view;
}

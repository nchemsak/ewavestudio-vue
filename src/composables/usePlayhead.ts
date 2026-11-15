// src/composables/usePlayhead.ts
// The Melody Maker's playhead (PR 80): where the bar is now, read from the engine once per
// frame while playing, into one reactive object, `playView`. DrumSequencer passes the object
// down and never reads its fields (as with `lfoView`), so only the Melody Maker's screen
// redraws every frame.
//
// - requestAnimationFrame doesn't run in hidden tabs, so it stops there by itself.
// - With prefers-reduced-motion `line` is false: the screen shows no moving line, only the
//   playing note lit.

import { reactive, watch, onBeforeUnmount, type Ref } from 'vue';

export type PlayView = {
	pos: number | null; // steps from the bar's start (2.5: halfway through step 3); null while stopped
	line: boolean;      // draw the moving line (not with prefers-reduced-motion)
};

// The pads light when their step is scheduled: 75–100 ms before it sounds (the engine's 100 ms
// look-ahead, checked every 25 ms). The playhead runs that far ahead of the audio clock, so
// the line reaches a note as its pad lights.
export const PAD_LEAD_S = 0.0875;

export function usePlayhead(opts: { barPosition: (leadS?: number) => number | null; isPlaying: Ref<boolean> }): PlayView {
	const mq = typeof window !== 'undefined' && window.matchMedia
		? window.matchMedia('(prefers-reduced-motion: reduce)')
		: null;
	const view: PlayView = reactive({ pos: null, line: !mq?.matches });
	const onMq = () => { view.line = !mq?.matches; };
	mq?.addEventListener?.('change', onMq);

	let raf = 0;
	function tick() {
		const p = opts.barPosition(PAD_LEAD_S);
		// A hundredth of a step is finer than the screen can show
		view.pos = p == null ? null : Math.round(p * 100) / 100;
		raf = p == null ? 0 : requestAnimationFrame(tick);
	}
	function stop() {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		view.pos = null;
	}

	watch(opts.isPlaying, (on) => { stop(); if (on) tick(); }, { immediate: true });

	onBeforeUnmount(() => {
		stop();
		mq?.removeEventListener?.('change', onMq);
	});

	return view;
}

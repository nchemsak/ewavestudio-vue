// src/composables/useLfoVisual.ts
// The LFO visualizer's clock: reads where the shared LFO is (the engine's lfoNow(), −1..1)
// once per frame, into `lfoPos`, while the LFO is on with depth above 0 and something plays.
// DrumSequencer turns that into what each indicator shows (src/lib/lfoVisual.ts).
//
// - While nothing sounds, it checks four times a second instead of every frame, and
//   `lfoPos` is null (the indicators rest).
// - requestAnimationFrame doesn't run in hidden tabs, so it stops there by itself.
// - With prefers-reduced-motion it never runs: `lfoPos` stays null and `reducedMotion` is
//   true, so the indicators show the LFO's static range instead of moving.

import { ref, watch, onBeforeUnmount, type Ref } from 'vue';

export const LFO_IDLE_CHECK_MS = 250;

export function useLfoVisual(opts: {
	lfoNow: () => number | null;
	soundingRecently: () => boolean;
	active: Ref<boolean>; // the LFO is on, with depth above 0
}) {
	const lfoPos = ref<number | null>(null);

	const mq = typeof window !== 'undefined' && window.matchMedia
		? window.matchMedia('(prefers-reduced-motion: reduce)')
		: null;
	const reducedMotion = ref(!!mq?.matches);
	const onMq = () => { reducedMotion.value = !!mq?.matches; };
	mq?.addEventListener?.('change', onMq);

	let raf = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function stop() {
		if (raf) cancelAnimationFrame(raf);
		if (timer) clearTimeout(timer);
		raf = 0;
		timer = null;
		lfoPos.value = null;
	}

	function tick() {
		raf = 0;
		timer = null;
		if (!opts.active.value || reducedMotion.value) { stop(); return; }
		if (opts.soundingRecently()) {
			const v = opts.lfoNow();
			// Two decimals is finer than any indicator can show, and stops needless updates
			lfoPos.value = v == null ? null : Math.round(v * 100) / 100;
			raf = requestAnimationFrame(tick);
		} else {
			lfoPos.value = null;
			timer = setTimeout(tick, LFO_IDLE_CHECK_MS);
		}
	}

	watch([opts.active, reducedMotion], ([on, reduced]) => {
		stop();
		if (on && !reduced) tick();
	}, { immediate: true });

	onBeforeUnmount(() => {
		stop();
		mq?.removeEventListener?.('change', onMq);
	});

	return { lfoPos, reducedMotion };
}

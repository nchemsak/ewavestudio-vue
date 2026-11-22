<!-- src/components/DriftXYPad.vue -->
<!-- The Drift machine's X/Y pad (the plan's item 6): the filter across, on a log scale, the swarm's
     Spread up. A drag is one undo step (the undo history waits while a pointer is held) and,
     while notes sound, glides them (the engine follows both settings). The desktop's Sound section
     (DriftSound.vue, with a mini knob for each under it) and phone mode's Pads page (option C of
     the mockups, in the knobs' place) use it. Hidden from screen readers: the knobs are the way in. -->
<template>
    <div ref="xyEl" class="df-xy" :class="{ held: dragging }" aria-hidden="true" :title="`Drag: the filter across (${hzText(drift.cutoff)}), the spread up (${pct(drift.spread)})`"
        @pointerdown="xyDown" @pointermove="xyMove" @pointerup="xyUp" @pointercancel="xyUp">
        <span class="df-xy-grid"></span>
        <span class="df-xy-glow" :style="dotStyle"></span>
        <span class="df-xy-cross v" :style="{ left: dotStyle.left }"></span>
        <span class="df-xy-cross h" :style="{ bottom: dotStyle.bottom }"></span>
        <span class="df-xy-dot" :style="dotStyle"></span>
        <span class="df-xy-lab x">FILTER {{ hzText(drift.cutoff).toUpperCase() }} →</span>
        <span class="df-xy-lab y">SPREAD {{ pct(drift.spread) }} →</span>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { DRIFT_RANGES } from '../audio/drift';
import type { Drift } from '../lib/machines/drift';

const props = defineProps<{ drift: Drift }>();
const CUT = DRIFT_RANGES.cutoff;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const hzText = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`);

// The X/Y pad: the filter across (log), the spread up
const logPos = (hz: number) => Math.log(hz / CUT[0]) / Math.log(CUT[1] / CUT[0]);
const dotStyle = computed(() => ({
    left: `${(logPos(props.drift.cutoff) * 100).toFixed(2)}%`,
    bottom: `${(props.drift.spread * 100).toFixed(2)}%`,
}));
const xyEl = ref<HTMLElement | null>(null);
const dragging = ref(false);
function xySet(e: PointerEvent) {
    const r = xyEl.value?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    props.drift.cutoff = Math.round(CUT[0] * (CUT[1] / CUT[0]) ** x);
    props.drift.spread = Math.round(y * 100) / 100;
}
function xyDown(e: PointerEvent) {
    dragging.value = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    xySet(e);
}
function xyMove(e: PointerEvent) {
    if (dragging.value) xySet(e);
}
function xyUp() {
    dragging.value = false;
}
</script>

<style scoped>
/* The X/Y pad */
.df-xy {
    --sp-bg: #0c1118;
    --sp-ink: #cfe0ff;
    position: relative;
    flex: 1 1 auto;
    min-height: 140px;
    border-radius: 8px;
    background: var(--sp-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), inset 0 2px 12px rgba(0, 0, 0, .6);
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
}

.theme-analog .df-xy {
    --sp-bg: #160f05;
    --sp-ink: #ffcf8a;
}

.theme-synthwave .df-xy {
    --sp-bg: #2a0f52;
    --sp-ink: #e8dcff;
}

.df-xy-grid {
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(to right, color-mix(in oklab, var(--sp-ink) 12%, transparent) 1px, transparent 1px),
        linear-gradient(to top, color-mix(in oklab, var(--sp-ink) 12%, transparent) 1px, transparent 1px);
    background-size: 25% 25%;
}

.df-xy-cross {
    position: absolute;
    background: color-mix(in oklab, var(--sp-ink) 40%, transparent);
}

.df-xy-cross.v {
    top: 0;
    bottom: 0;
    width: 1px;
}

.df-xy-cross.h {
    left: 0;
    right: 0;
    height: 1px;
}

.df-xy-glow {
    position: absolute;
    width: 70px;
    height: 70px;
    margin: 0 0 -35px -35px;
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in oklab, var(--hw-led, #5dffb0) 35%, transparent), transparent 70%);
}

.df-xy-dot {
    position: absolute;
    width: 16px;
    height: 16px;
    margin: 0 0 -8px -8px;
    border-radius: 50%;
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 10px var(--hw-led, #5dffb0), inset 0 -2px 3px rgba(0, 0, 0, .3);
}

.df-xy-lab {
    position: absolute;
    font: 700 8px Cousine, ui-monospace, monospace;
    letter-spacing: .06em;
    color: var(--sp-ink);
    opacity: .85;
    white-space: nowrap;
    pointer-events: none;
}

.df-xy-lab.x {
    bottom: 4px;
    right: 6px;
}

.df-xy-lab.y {
    top: 50%;
    left: 6px;
    transform-origin: 0 0;
    transform: rotate(-90deg) translate(-50%, 0);
}

/* A finger on it (phone mode): the dot a little bigger, so it shows round the fingertip */
.df-xy.held .df-xy-dot {
    transform: scale(1.4);
}
</style>

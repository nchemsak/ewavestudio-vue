<!-- src/components/ShapePad.vue -->
<!-- A card's screen that you drag (PR 77, option C of the plain cards' mockups): Envelope, Pitch,
     Filter, FM and Unison each draw what their settings do (src/lib/shapeViews.ts) in the slot,
     as SVG in a `w` × `h` box, and a drag on the picture changes them. The pad only reports
     where the pointer is, in the box's own units; its card decides what that sets. Every
     setting also has a mini knob beside the pad (for fine steps, the keyboard and MIDI learn),
     so the pad is for the pointer only: it takes no focus and is hidden from screen readers.
     The cards' shared styles (the card, its mini knobs, FM's and Unison's ribbon and keys) are
     in this file's second <style> block. -->
<template>
    <div class="sp-pad" :class="{ dragging, 'is-disabled': disabled }" aria-hidden="true"
        @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp">
        <svg :viewBox="`0 0 ${w} ${h}`" preserveAspectRatio="none">
            <slot />
        </svg>
        <span v-for="p in handles" :key="p.id" class="sp-handle" :class="{ on: dragging && active === p.id }"
            :style="{ left: `${(p.x / w) * 100}%`, top: `${(p.y / h) * 100}%` }"></span>
        <span v-if="title || readout" class="sp-title" :class="{ right: titleRight }">{{ title }}<small v-if="readout">{{ readout }}</small></span>
        <span v-if="hint" class="sp-hint">{{ hint }}</span>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

export type PadHandle = { id: string; x: number; y: number };
export type PadPoint = { x: number; y: number };

const props = withDefaults(defineProps<{
    w: number;
    h: number;
    handles?: PadHandle[];   // the round grips, in the box's units
    active?: string;         // the grip being dragged
    title?: string;
    readout?: string;        // the settings in numbers, under the title
    titleRight?: boolean;
    hint?: string;           // what a drag does ("↕ amount"), where there are no grips
    disabled?: boolean;
}>(), { handles: () => [], active: '', title: '', readout: '', titleRight: false, hint: '', disabled: false });

const emit = defineEmits<{
    (e: 'start', p: PadPoint): void;
    (e: 'move', p: PadPoint): void;
    (e: 'end'): void;
}>();

const dragging = ref(false);

function point(e: PointerEvent): PadPoint {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * props.w, y: ((e.clientY - r.top) / r.height) * props.h };
}
function onDown(e: PointerEvent) {
    if (props.disabled || e.button > 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragging.value = true;
    const p = point(e);
    emit('start', p);
    emit('move', p);
}
function onMove(e: PointerEvent) {
    if (dragging.value) emit('move', point(e));
}
function onUp() {
    if (!dragging.value) return;
    dragging.value = false;
    emit('end');
}
</script>

<script lang="ts">
// The grip nearest a point: the one a drag that starts there takes hold of
export function nearestHandle(handles: PadHandle[], p: PadPoint): string {
    return handles.reduce((a, b) => (Math.hypot(a.x - p.x, a.y - p.y) <= Math.hypot(b.x - p.x, b.y - p.y) ? a : b)).id;
}
</script>

<style>
/* ── the screen ── in each theme's screen colours, as the LFO card's */
.sp-pad {
    --sp-bg: #0c1118;
    --sp-ink: #cfe0ff;
    --sp-line: var(--sp-ink); /* the screen's own ink, as the LFO card's (the accent until PR 93) */
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    border-radius: 6px;
    background: var(--sp-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 2px 10px rgba(0, 0, 0, 0.7), 0 0 0 2px rgba(0, 0, 0, 0.45);
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
}

.theme-analog .sp-pad {
    --sp-bg: #160f05;
    --sp-ink: #ffcf8a;
}

.sp-pad.dragging {
    cursor: grabbing;
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--sp-ink), transparent 30%), inset 0 2px 10px rgba(0, 0, 0, 0.7), 0 0 0 2px rgba(0, 0, 0, 0.45);
}

.sp-pad.is-disabled {
    cursor: default;
}

.sp-pad svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.sp-line {
    fill: none;
    stroke: var(--sp-line);
    stroke-width: 1.7;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
}

.sp-line.sp-fill {
    fill: color-mix(in oklab, var(--sp-line), transparent 82%);
}

.sp-line.sp-voice {
    stroke-opacity: 0.75;
}

/* Where something starts before it settles (the filter envelope), and softer steps */
.sp-ghost {
    fill: none;
    stroke: var(--sp-line);
    stroke-opacity: 0.6;
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
}

.sp-axis {
    stroke: var(--sp-ink);
    stroke-opacity: 0.28;
    stroke-dasharray: 2 3;
    vector-effect: non-scaling-stroke;
}

.sp-dot {
    fill: var(--sp-ink);
}

/* The LFO's movement, in its own colour (as on the knobs) */
.sp-lfo {
    fill: none;
    stroke: var(--lfo-mod);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
}

.sp-lfo-range {
    fill: var(--lfo-mod);
    fill-opacity: 0.14;
}

.is-off .sp-line,
.is-disabled .sp-line {
    stroke-opacity: 0.4;
}

.is-off .sp-dot {
    fill-opacity: 0.4;
}

.sp-handle {
    position: absolute;
    width: 11px;
    height: 11px;
    margin: -5.5px 0 0 -5.5px;
    border-radius: 50%;
    background: var(--sp-bg);
    box-shadow: 0 0 0 2px var(--sp-line), 0 0 8px color-mix(in oklab, var(--sp-line), transparent 45%);
    pointer-events: none;
}

.sp-handle.on {
    background: var(--sp-line);
}

.is-disabled .sp-handle {
    display: none;
}

.sp-title,
.sp-hint {
    position: absolute;
    line-height: 1;
    text-transform: uppercase;
    color: var(--sp-ink);
    pointer-events: none;
    white-space: nowrap;
}

.sp-title {
    left: 6px;
    top: 5px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
}

.sp-title.right {
    left: auto;
    right: 6px;
    text-align: right;
}

.sp-title small {
    display: block;
    margin-top: 4px;
    font-size: 8px;
    font-weight: 400;
    letter-spacing: 0.06em;
    opacity: 0.85;
}

.sp-hint {
    right: 5px;
    top: 5px;
    font-size: 7.5px;
    letter-spacing: 0.08em;
    opacity: 0.55;
}

/* ── the cards ── a screen and its mini knobs, side by side, in a card as tall as before */
/* (.module: over DrumSequencer's own .pt-card padding) */
.module .pt-card.sp-card {
    min-height: 115px;
    padding: 9px 10px;
}

.sp-body {
    flex: 1 1 auto;
    display: flex;
    align-items: stretch;
    gap: 8px;
    min-width: 0;
    min-height: 0;
}

.sp-minis {
    flex: none;
    display: grid;
    grid-template-columns: auto;
    align-content: center;
    justify-items: center;
    gap: 2px 6px;
}

.sp-minis.four {
    grid-template-columns: auto auto;
}

.sp-mini {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
}

.sp-mini>span:not(.custom-tooltip) {
    font-size: 8.5px;
    line-height: 1.15;
    letter-spacing: 0.04em;
    color: var(--pt-text, inherit);
    opacity: 0.85;
    white-space: nowrap;
}

.sp-minis .sp-wide {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    line-height: 1;
}

/* A small toggle under the mini knobs (Pitch's Random) */
.sp-pill {
    --hw-led-size: 5px;
    flex: none;
    padding: 1px 5px 1px 4px;
    border-radius: 5px;
    border: 1px solid transparent;
    font: inherit;
    font-size: 8px;
    line-height: 1.4;
    letter-spacing: 0.06em;
}

.sp-pill:disabled {
    cursor: default;
    opacity: 0.35;
}

/* ── FM and Unison ── a ribbon switch on the left edge (as Noise's and the LFO's), the screen
   with its choices as keys under it, the mini knobs on the right */
.module .pt-card.sp-unit {
    min-height: 115px;
    padding: 0;
    overflow: hidden;
}

.sp-unit .sp-body {
    gap: 0;
}

.sp-ribbon {
    flex: none;
    position: relative;
    width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    cursor: pointer;
    background: linear-gradient(180deg, var(--pt-surface-3, #26263a), var(--pt-surface-1, #151522));
    color: color-mix(in oklab, var(--pt-text, #e5e9ff), transparent 20%);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 1px 0 0 rgba(0, 0, 0, 0.7);
    transition: filter 120ms ease;
}

.sp-ribbon:hover {
    filter: brightness(1.06);
}

.sp-ribbon:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 62%);
    outline-offset: -3px;
}

/* On: only its LED lights, as Noise's (PR 93; the ribbon was filled with the accent until then) */
.sp-ribbon.is-on {
    color: var(--pt-text);
}

.sp-ribbon-led {
    position: absolute;
    top: 9px;
    left: 50%;
    width: 6px;
    height: 6px;
    margin-left: -3px;
    border-radius: 50%;
    background: var(--hw-led-off, rgb(255 255 255 / 0.2));
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.35);
}

.sp-ribbon.is-on .sp-ribbon-led {
    background: var(--hw-led, #5effb0);
    box-shadow: 0 0 6px var(--hw-led, #5effb0), 0 0 1px var(--hw-led, #5effb0);
}

.sp-ribbon-label {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    letter-spacing: 0.2em;
    font-size: 11px;
    font-weight: 600;
}

.sp-face {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: stretch;
    gap: 12px;
    padding: 10px 14px 10px 12px;
}

.sp-screencol {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
}

/* The choices as soft keys under the screen, as the F-keys under the main one */
.sp-keys {
    flex: none;
    display: flex;
    gap: 4px;
}

.sp-key {
    flex: 1 1 0;
    min-width: 0;
    height: 18px;
    padding: 0 2px;
    border: 0;
    border-radius: 4px;
    /* the caps' colours, per theme (PR 79; they were Dark's in every theme) */
    background: linear-gradient(180deg, var(--cap-hi), var(--cap-lo));
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    color: color-mix(in oklab, var(--cap-ink) 72%, transparent);
    font: inherit;
    font-size: 8.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    cursor: pointer;
}

.sp-key:hover {
    filter: brightness(1.15);
}

.sp-key:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 62%);
    outline-offset: 1px;
}

/* The chosen key stays down, its label lit in the LEDs' colour, as every other switch (PR 93;
   lit in the accent until then) */
.sp-key.on {
    color: var(--hw-led);
    background: linear-gradient(180deg, color-mix(in oklab, var(--pt-surface-2), black 30%), color-mix(in oklab, var(--pt-surface-2), black 10%));
    box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.6), inset 0 0 0 1px rgb(255 255 255 / 0.06), 0 0 8px color-mix(in oklab, var(--hw-led), transparent 80%);
    text-shadow: 0 0 6px color-mix(in oklab, var(--hw-led), transparent 40%);
}

.is-off .sp-key {
    opacity: 0.5;
}

.is-off .sp-mini {
    opacity: 0.85; /* 0.75 until PR 93: FM's Freq, dimmed twice, measured 4.6 : 1 */
}

/* Compact (phone mode's Sound page, PR 106): no screen, so a low card: the ribbon, the keys
   and the mini knobs on one line, the ribbon's name smaller */
.module .pt-card.sp-unit.sp-compact {
    min-height: 0;
}

.sp-compact .sp-face {
    align-items: center;
    gap: 6px;
    padding: 6px 6px 6px 7px;
}

.sp-compact .sp-keys {
    gap: 3px;
}

.sp-compact .sp-screencol {
    justify-content: center;
}

.sp-compact .sp-key {
    height: 24px;
    padding: 0 1px;
    font-size: 8px;
    letter-spacing: 0.03em;
}

.sp-compact .sp-key-unit {
    display: none;
}

.sp-compact .sp-minis {
    grid-auto-flow: column;
}

.sp-compact .sp-ribbon {
    width: 26px;
}

.sp-compact .sp-ribbon-led {
    top: 6px;
}

.sp-compact .sp-ribbon-label {
    margin-top: 10px;
    font-size: 8.5px;
    letter-spacing: 0.08em;
}
</style>

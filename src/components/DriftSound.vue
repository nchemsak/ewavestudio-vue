<!-- src/components/DriftSound.vue -->
<!-- The Drift machine's Sound section (the plan's item 6; option A of the mockups): the X/Y pad
     (the filter across, the swarm's Spread up, with a mini knob for each under it), a screen of
     the swarm (each held note of the bar the plates edit, its voices as lines, faded in over
     Attack and out over Release: src/lib/driftView.ts; a click plays the chord while stopped),
     and the knobs, Swarm (Voices, Drift, Wave) and In bars (Attack, Release), each with its
     value under it. The pedals beside them are everyone's (DrumSequencer's Effects card); Drift
     uses only the reverb (the rail's Pedals is its send). Grid areas: xy, swarm, knobs. -->
<template>
    <div class="drift-sound">
        <div class="pt-card df-card df-xycard" style="grid-area: xy">
            <div ref="xyEl" class="df-xy" aria-hidden="true" :title="`Drag: the filter across (${hzText(drift.cutoff)}), the spread up (${pct(drift.spread)})`"
                @pointerdown="xyDown" @pointermove="xyMove" @pointerup="xyUp" @pointercancel="xyUp">
                <span class="df-xy-grid"></span>
                <span class="df-xy-glow" :style="dotStyle"></span>
                <span class="df-xy-cross v" :style="{ left: dotStyle.left }"></span>
                <span class="df-xy-cross h" :style="{ bottom: dotStyle.bottom }"></span>
                <span class="df-xy-dot" :style="dotStyle"></span>
                <span class="df-xy-lab x">FILTER {{ hzText(drift.cutoff).toUpperCase() }} →</span>
                <span class="df-xy-lab y">SPREAD {{ pct(drift.spread) }} →</span>
            </div>
            <div class="df-minis">
                <span class="df-mini">
                    <Knob midi-id="drift.cutoff" v-model="drift.cutoff" label="Drift filter" :value-text="hzText(drift.cutoff)"
                        :min="CUT[0]" :max="CUT[1]" :step="1" taper="log" size="mini" hideLabel :useThemeArc="true" />
                    <i>Filter</i>
                </span>
                <span class="df-mini">
                    <Knob midi-id="drift.spread" v-model="drift.spread" label="Drift spread" :value-text="pct(drift.spread)"
                        :min="0" :max="1" :step="0.01" size="mini" hideLabel :useThemeArc="true" />
                    <i>Spread</i>
                </span>
            </div>
        </div>

        <div class="pt-card df-card df-swarmcard" style="grid-area: swarm">
            <!-- A click plays the chord it draws (only while stopped: DrumSequencer's previewDrift) -->
            <button type="button" class="df-screen" :aria-label="chord ? `Hear ${chord}` : 'Nothing held in this bar'"
                :title="chord ? `Click to hear bar ${bar + 1}: ${chord}` : `Bar ${bar + 1} holds nothing: touch a plate`" @click="emit('preview')">
                <svg :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                        <linearGradient :id="fadeId" x1="0" x2="1" y1="0" y2="0">
                            <stop offset="0" stop-color="#fff" stop-opacity="0.05" />
                            <stop :offset="stops.inEnd" stop-color="#fff" stop-opacity="1" />
                            <stop :offset="stops.outStart" stop-color="#fff" stop-opacity="1" />
                            <stop offset="1" stop-color="#fff" stop-opacity="0.05" />
                        </linearGradient>
                        <mask :id="maskId"><rect x="0" y="0" :width="VIEW_W" :height="VIEW_H" :fill="`url(#${fadeId})`" /></mask>
                    </defs>
                    <g :mask="`url(#${maskId})`">
                        <path v-for="(l, i) in lines" :key="i" :d="l.d" class="df-line" :style="{ stroke: `hsl(${l.hue} 85% 70%)` }" />
                    </g>
                    <path :d="env" class="df-env" />
                </svg>
                <span class="df-read">SWARM · {{ drift.voices }} VOICES A NOTE · BAR {{ bar + 1 }}{{ chord ? ` · ${chord}` : '' }}</span>
                <span v-if="!chord" class="df-empty">Touch a plate to hold a note</span>
                <span class="df-read r"><b>- - ATTACK {{ barsText(drift.attack).toUpperCase() }}, RELEASE {{ barsText(drift.release).toUpperCase() }}</b></span>
            </button>
        </div>

        <!-- The knobs written out one by one: MIDI learn's ids must each be on one knob in the source -->
        <div class="pt-card df-card df-knobcard" style="grid-area: knobs">
            <div class="df-kgroup" role="group" aria-label="Drift swarm">
                <span class="df-kcap">Swarm</span>
                <div class="df-kgrid">
                    <div class="df-kcell">
                        <Knob midi-id="drift.voices" v-model="drift.voices" label="Voices" :value-text="`${drift.voices} voices`"
                            :min="3" :max="7" :step="1" size="medium" :useThemeArc="true" />
                        <span class="df-kval">{{ drift.voices }}</span>
                    </div>
                    <div class="df-kcell">
                        <Knob midi-id="drift.drift" v-model="drift.drift" label="Drift" :value-text="pct(drift.drift)"
                            :min="0" :max="1" :step="0.01" size="medium" :useThemeArc="true" />
                        <span class="df-kval">{{ pct(drift.drift) }}</span>
                    </div>
                    <div class="df-kcell">
                        <Knob midi-id="drift.wave" v-model="drift.wave" label="Wave" :value-text="waveText(drift.wave)"
                            :min="0" :max="1" :step="0.01" size="medium" :useThemeArc="true" />
                        <span class="df-kval">{{ waveText(drift.wave) }}</span>
                    </div>
                </div>
            </div>
            <div class="df-kgroup" role="group" aria-label="Drift fades, in bars">
                <span class="df-kcap">In bars</span>
                <div class="df-kgrid two">
                    <div class="df-kcell">
                        <Knob midi-id="drift.attack" v-model="drift.attack" label="Attack" :value-text="barsText(drift.attack)"
                            :min="0.25" :max="4" :step="0.25" :detents="[1, 2]" size="medium" :useThemeArc="true" />
                        <span class="df-kval">{{ barsText(drift.attack) }}</span>
                    </div>
                    <div class="df-kcell">
                        <Knob midi-id="drift.release" v-model="drift.release" label="Release" :value-text="barsText(drift.release)"
                            :min="0.25" :max="4" :step="0.25" :detents="[1, 2]" size="medium" :useThemeArc="true" />
                        <span class="df-kval">{{ barsText(drift.release) }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import Knob from './Knob.vue';
import { DRIFT_RANGES } from '../audio/drift';
import type { Drift } from '../lib/machines/drift';
import { envelopePath, fadeStops, swarmLines, VIEW_H, VIEW_W } from '../lib/driftView';

const props = defineProps<{
    drift: Drift;
    notes: { hz: number; hue: number }[]; // the bar's held notes
    bar: number;                          // the bar the plates edit
    chord: string;                        // its chord's name ('' for nothing)
}>();
const emit = defineEmits<{ (e: 'preview'): void }>();

const CUT = DRIFT_RANGES.cutoff;
const id = useId();
const fadeId = `df-fade-${id}`, maskId = `df-mask-${id}`;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const hzText = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`);
const barsText = (b: number) => (b === 1 ? '1 bar' : b < 1 ? `${b * 4}/4 bar` : `${b} bars`);
const waveText = (w: number) => (w < 0.34 ? 'Soft' : w < 0.67 ? 'Warm' : 'Bright');

const lines = computed(() => swarmLines(props.drift, props.notes));
const env = computed(() => envelopePath(props.drift));
const stops = computed(() => fadeStops(props.drift));

// The X/Y pad: the filter across (log), the spread up
const logPos = (hz: number) => Math.log(hz / CUT[0]) / Math.log(CUT[1] / CUT[0]);
const dotStyle = computed(() => ({
    left: `${(logPos(props.drift.cutoff) * 100).toFixed(2)}%`,
    bottom: `${(props.drift.spread * 100).toFixed(2)}%`,
}));
const xyEl = ref<HTMLElement | null>(null);
let dragging = false;
function xySet(e: PointerEvent) {
    const r = xyEl.value?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    props.drift.cutoff = Math.round(CUT[0] * (CUT[1] / CUT[0]) ** x);
    props.drift.spread = Math.round(y * 100) / 100;
}
function xyDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    xySet(e);
}
function xyMove(e: PointerEvent) {
    if (dragging) xySet(e);
}
function xyUp() {
    dragging = false;
}
</script>

<style scoped>
.drift-sound {
    display: contents;
}

.df-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 8px;
}

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

.theme-analog .df-xy,
.theme-analog .df-screen {
    --sp-bg: #160f05;
    --sp-ink: #ffcf8a;
}

.theme-synthwave .df-xy,
.theme-synthwave .df-screen {
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

.df-minis {
    display: flex;
    justify-content: space-around;
}

.df-mini {
    display: flex;
    align-items: center;
    gap: 6px;
}

.df-mini i {
    font: 700 9px Cousine, ui-monospace, monospace;
    font-style: normal;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

/* The swarm's screen */
.df-screen {
    --sp-bg: #0c1118;
    --sp-ink: #cfe0ff;
    position: relative;
    display: block;
    width: 100%;
    flex: 1 1 auto;
    min-height: 170px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
    background: var(--sp-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07), inset 0 2px 10px rgba(0, 0, 0, .6);
    overflow: hidden;
}

.df-screen svg {
    position: absolute;
    inset: 22px 0 22px;
    width: 100%;
    height: calc(100% - 44px);
}

.df-line {
    fill: none;
    stroke-width: 1.1;
    opacity: .8;
    vector-effect: non-scaling-stroke;
}

.df-env {
    fill: none;
    stroke: var(--sp-ink);
    stroke-width: 1;
    stroke-dasharray: 3 4;
    opacity: .55;
    vector-effect: non-scaling-stroke;
}

.df-read {
    position: absolute;
    top: 5px;
    left: 8px;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .06em;
    color: var(--sp-ink);
    white-space: nowrap;
}

.df-read.r {
    top: auto;
    bottom: 5px;
    left: auto;
    right: 8px;
}

.df-read b {
    opacity: .75;
}

.df-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 700 11px Cousine, ui-monospace, monospace;
    color: var(--sp-ink);
    opacity: .6;
}

/* The knobs */
.df-knobcard {
    justify-content: center;
    gap: 14px;
}

.df-kgroup {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.df-kcap {
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.df-kgrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    justify-items: center;
    gap: 4px;
}

.df-kgrid.two {
    grid-template-columns: repeat(3, 1fr);
}

.df-kcell {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.df-kval {
    font: 700 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text, #fff);
    opacity: .8;
    margin-top: 2px;
}
</style>

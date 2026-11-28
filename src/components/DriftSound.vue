<!-- src/components/DriftSound.vue -->
<!-- The Drift machine's Sound section (the plan's item 6; option A of the mockups): the X/Y pad
     (the filter across, the swarm's Spread up, with a mini knob for each under it), a screen of
     the swarm (each held note of the bar the plates edit, its voices as lines, faded in over
     Attack and out over Release: src/lib/driftView.ts; a click plays the chord while stopped),
     and the knobs, Swarm (Voices, Drift, Wave) and In bars (Attack, Release), each with its
     value under it. The pedals beside them are everyone's (DrumSequencer's Effects card); Drift
     uses only the reverb (the rail's Pedals is its send). Grid areas: xy, swarm, knobs. -->
<template>
    <div class="drift-sound" :class="{ compact }">
        <div v-if="!compact" class="pt-card df-card df-xycard" style="grid-area: xy">
            <DriftXYPad :drift="drift" :motionView="motionView" />
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
            <!-- Motion (the plan's item 19): the dot moving by itself. Depth 0 is off; Rate is a
                 cycle's bars (not Swell's: it opens over Attack at each new chord) -->
            <div class="df-motion" :class="{ 'is-off': drift.motionDepth <= 0 }" role="group" aria-label="Drift motion">
                <div class="df-mhead">
                    <span class="df-kcap">Motion</span>
                    <span class="df-mini">
                        <Knob midi-id="drift.motionDepth" v-model="drift.motionDepth" label="Motion depth"
                            :value-text="drift.motionDepth > 0 ? pct(drift.motionDepth) : 'Off'"
                            :min="0" :max="1" :step="0.01" size="mini" hideLabel :useThemeArc="true" />
                        <i>{{ drift.motionDepth > 0 ? `Depth ${pct(drift.motionDepth)}` : 'Depth: off' }}</i>
                    </span>
                </div>
                <div class="sp-keys" role="radiogroup" aria-label="Motion shape">
                    <button v-for="sh in MOTION_SHAPES" :key="sh" type="button" class="sp-key" :class="{ on: drift.motionShape === sh }" role="radio"
                        :aria-checked="drift.motionShape === sh" :title="SHAPE_TIPS[sh]" @click="drift.motionShape = sh">{{ MOTION_NAMES[sh] }}</button>
                </div>
                <div class="df-mrate" :class="{ 'is-swell': drift.motionShape === 'swell' }">
                    <div class="sp-keys" role="radiogroup" aria-label="Motion rate, in bars">
                        <button v-for="r in MOTION_RATES" :key="r" type="button" class="sp-key" :class="{ on: drift.motionRate === r }" role="radio"
                            :aria-checked="drift.motionRate === r" :aria-label="`${r}-bar cycle`"
                            :title="drift.motionShape === 'swell' ? 'Swell opens over Attack at each new chord: Rate is for the other shapes' : `A cycle every ${r} bar${r === 1 ? '' : 's'}`"
                            @click="drift.motionRate = r">{{ r }}</button>
                    </div>
                    <span class="df-mcap">bars</span>
                </div>
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
                            :min="3" :max="7" :step="1" :size="compact ? 'small' : 'medium'" :useThemeArc="true" />
                        <span class="df-kval">{{ drift.voices }}</span>
                    </div>
                    <div class="df-kcell">
                        <Knob midi-id="drift.drift" v-model="drift.drift" label="Drift" :value-text="pct(drift.drift)"
                            :min="0" :max="1" :step="0.01" :size="compact ? 'small' : 'medium'" :useThemeArc="true" />
                        <span class="df-kval">{{ pct(drift.drift) }}</span>
                    </div>
                    <div class="df-kcell">
                        <Knob midi-id="drift.wave" v-model="drift.wave" label="Wave" :value-text="waveText(drift.wave)"
                            :min="0" :max="1" :step="0.01" :size="compact ? 'small' : 'medium'" :useThemeArc="true" />
                        <span class="df-kval">{{ waveText(drift.wave) }}</span>
                    </div>
                </div>
            </div>
            <!-- Phone mode: the X/Y pad is on its Pads page, so Filter and Spread are knobs here (no
                 midi-id: each is on the desktop's mini knob, and phone mode takes no links) -->
            <div v-if="compact" class="df-kgroup" role="group" aria-label="Drift tone">
                <span class="df-kcap">Tone</span>
                <div class="df-kgrid two">
                    <div class="df-kcell">
                        <Knob v-model="drift.cutoff" label="Filter" :value-text="hzText(drift.cutoff)"
                            :min="CUT[0]" :max="CUT[1]" :step="1" taper="log" size="small" :useThemeArc="true" />
                        <span class="df-kval">{{ hzText(drift.cutoff) }}</span>
                    </div>
                    <div class="df-kcell">
                        <Knob v-model="drift.spread" label="Spread" :value-text="pct(drift.spread)"
                            :min="0" :max="1" :step="0.01" size="small" :useThemeArc="true" />
                        <span class="df-kval">{{ pct(drift.spread) }}</span>
                    </div>
                </div>
            </div>
            <div class="df-kgroup" role="group" aria-label="Drift fades, in bars">
                <span class="df-kcap">In bars</span>
                <div class="df-kgrid two">
                    <div class="df-kcell">
                        <Knob midi-id="drift.attack" v-model="drift.attack" label="Attack" :value-text="barsText(drift.attack)"
                            :min="0.25" :max="4" :step="0.25" :detents="[1, 2]" :size="compact ? 'small' : 'medium'" :useThemeArc="true" />
                        <span class="df-kval">{{ barsText(drift.attack) }}</span>
                    </div>
                    <div class="df-kcell">
                        <Knob midi-id="drift.release" v-model="drift.release" label="Release" :value-text="barsText(drift.release)"
                            :min="0.25" :max="4" :step="0.25" :detents="[1, 2]" :size="compact ? 'small' : 'medium'" :useThemeArc="true" />
                        <span class="df-kval">{{ barsText(drift.release) }}</span>
                    </div>
                </div>
            </div>
            <!-- Pulse (the plan's item 20): a gate on the level (1/4, 1/8, 1/16), or Duck at the Drums
                 machine's slot 1 hits, and how far the level drops. Not on the phone yet -->
            <div v-if="!compact" class="df-kgroup df-pulse" :class="{ 'is-off': drift.pulseMode === 'off' }" role="group" aria-label="Drift pulse">
                <span class="df-kcap">Pulse</span>
                <div class="df-prow">
                    <div class="sp-keys" role="radiogroup" aria-label="Pulse">
                        <button v-for="m in PULSE_MODES" :key="m" type="button" class="sp-key" :class="{ on: drift.pulseMode === m }" role="radio"
                            :aria-checked="drift.pulseMode === m" :aria-label="PULSE_TIPS[m]" :title="PULSE_TIPS[m]"
                            @click="drift.pulseMode = m">{{ PULSE_NAMES[m] }}</button>
                    </div>
                    <span class="df-mini df-pdepth">
                        <Knob midi-id="drift.pulseDepth" v-model="drift.pulseDepth" label="Pulse depth" :value-text="pct(drift.pulseDepth)"
                            :min="0" :max="1" :step="0.01" size="mini" hideLabel :useThemeArc="true" :disabled="drift.pulseMode === 'off'" />
                        <i>Depth {{ pct(drift.pulseDepth) }}</i>
                    </span>
                </div>
            </div>
            <!-- The phone's Mix group (Level, the reverb send, the meter) -->
            <slot name="mix" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import Knob from './Knob.vue';
import DriftXYPad from './DriftXYPad.vue';
import { DRIFT_RANGES } from '../audio/drift';
import { MOTION_NAMES, MOTION_RATES, MOTION_SHAPES, type MotionShape } from '../audio/driftMotion';
import { PULSE_MODES, PULSE_NAMES, type PulseMode } from '../audio/driftPulse';
import type { DriftMotionView } from '../composables/useDriftMotion';
import type { Drift } from '../lib/machines/drift';
import { envelopePath, fadeStops, swarmLines, VIEW_H, VIEW_W } from '../lib/driftView';

const props = defineProps<{
    drift: Drift;
    notes: { hz: number; hue: number }[]; // the bar's held notes
    bar: number;                          // the bar the plates edit
    chord: string;                        // its chord's name ('' for nothing)
    compact?: boolean;                    // phone mode's Sound page: no X/Y pad (it's on the Pads page), Filter and Spread knobs
    motionView?: DriftMotionView | null;  // where Motion has the pad's dot now (only the pad reads it)
}>();

const PULSE_TIPS: Record<PulseMode, string> = {
    off: 'Pulse off: the chords held as they are',
    '1/4': 'Pulse: a gate every beat, open for its first half',
    '1/8': 'Pulse: a gate every 1/8, open for its first half',
    '1/16': 'Pulse: a gate every step, open for its first half',
    duck: 'Pulse: Duck, a dip at every hit of the Drums machine\'s slot 1 (heard or muted), back up by the next',
};

const SHAPE_TIPS: Record<MotionShape, string> = {
    circle: 'Circle: the filter and the spread together, round the point you set',
    sweep: 'Sweep: the filter up and back down, the spread as set',
    wander: 'Wander: the filter and the spread, smoothly at random, the same path each cycle',
    swell: 'Swell: the filter closes at each new chord and opens again over Attack',
};
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

</script>

<style scoped>
.drift-sound {
    display: contents;
}

/* Phone mode's Sound page (part 3): the swarm's screen over a row of knobs */
.drift-sound.compact {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas: "swarm" "knobs";
    gap: 6px;
    height: 100%;
    min-height: 0;
}

.compact .df-card {
    padding: 6px;
    min-height: 0;
}

.compact .df-screen {
    min-height: 0;
}

.compact .df-knobcard {
    flex-direction: row;
    justify-content: space-evenly;
    align-items: flex-start;
    gap: 8px;
}

/* The smallest phones: the knob groups closer, their values smaller */
@media (max-width: 639.98px) {
    .compact .df-knobcard {
        gap: 2px;
        padding: 4px;
    }

    .compact .df-kgrid {
        gap: 0;
    }
}

.compact .df-kgrid.two {
    grid-template-columns: repeat(2, 1fr);
}

.df-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 8px;
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

/* Motion, under the X/Y pad's mini knobs */
.df-motion {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-top: 6px;
    border-top: 1px solid color-mix(in oklab, var(--pt-text-dim, #b9a8d8) 20%, transparent);
}

.df-mhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.df-mrate {
    display: flex;
    align-items: center;
    gap: 6px;
}

.df-mrate .sp-keys {
    flex: 1;
}

.df-mcap {
    font: 700 8px Cousine, ui-monospace, monospace;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

/* Rate means nothing to Swell; Depth 0 moves nothing */
.df-mrate.is-swell .sp-keys,
.df-motion.is-off .sp-keys {
    opacity: .5;
}

/* Pulse, the knob card's last row */
.df-prow {
    display: flex;
    align-items: center;
    gap: 10px;
}

.df-prow .sp-keys {
    flex: 1;
}

.df-pulse.is-off .df-pdepth {
    opacity: .5;
}

/* The swarm's screen */
.theme-analog .df-screen {
    --sp-bg: #160f05;
    --sp-ink: #ffcf8a;
}

.theme-synthwave .df-screen {
    --sp-bg: #2a0f52;
    --sp-ink: #e8dcff;
}

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

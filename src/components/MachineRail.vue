<!-- src/components/MachineRail.vue -->
<!-- The machine rail (PR 108, option A of three mockups): the column beside the transport and
     the Step Sequencer where the big screen was. On top, the monitor: the output's scope and
     spectrogram (monitorViews.ts; the big screen's F1 and F3). Under it, one row per machine:
     its LED (a click mutes it), its name, its level and a tiny row of its 16 steps. There's one
     machine for now, Rhythm (the synth lane); Bass, Drums and Drift (the plan's items 4–6) add
     rows, and patterns A–D and the chain (item 2) go under them, so the screens shrink to a
     strip as they come. A row will pick which machine the pads and the Sound section show. -->
<template>
    <aside class="pt-card machine-rail" aria-label="Machines">
        <div class="mr-monitor">
            <div class="mr-screen">
                <canvas ref="scopeEl" aria-hidden="true"></canvas>
                <span class="mr-label" aria-hidden="true">Scope</span>
            </div>
            <div class="mr-screen">
                <canvas ref="specEl" aria-hidden="true"></canvas>
                <span class="mr-label" aria-hidden="true">Spectrogram</span>
            </div>
        </div>

        <div class="mr-rows" role="list">
            <div class="mr-row is-chosen" role="listitem">
                <button type="button" class="mr-led" :class="{ lit: !muted }" role="switch" :aria-checked="!muted"
                    :aria-label="`${name} on`" :title="muted ? `${name} is muted: click to hear it` : `Mute ${name}`"
                    @click="emit('toggle-mute')"></button>
                <span class="mr-name">{{ name }}</span>
                <div class="mr-level">
                    <Knob midi-id="synth.volume" v-model="levelModel" :label="`${name} level`" hideLabel size="mini"
                        :value-text="`${Math.round(level * 100)}%`" :min="0" :max="1" :step="0.01" :useThemeArc="true" />
                </div>
                <div class="mr-cells" aria-hidden="true">
                    <i v-for="(c, i) in cells" :key="i" :style="c.style"
                        :class="{ on: c.on, beat: i % 4 === 0, now: playing && i === currentStep }"></i>
                </div>
            </div>
        </div>
    </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Knob from './Knob.vue';
import { padHue } from '../lib/padColour';
import { startScope, startSpectrogram } from './monitorViews';

const props = defineProps<{
    analyser: AnalyserNode;
    sampleRate: number;
    active: () => boolean;  // whether anything sounds (the screens rest otherwise)
    name: string;
    steps: boolean[];
    pitches: number[];
    velocities: number[];
    muted: boolean;
    level: number;          // the lane's channelVolume
    currentStep: number;
    playing: boolean;
}>();
const emit = defineEmits<{
    (e: 'toggle-mute'): void;
    (e: 'update:level', v: number): void;
}>();

const levelModel = computed({ get: () => props.level, set: (v: number) => emit('update:level', v) });

// Each step: off, or its pad's colour (the note), brighter when louder (the velocity)
const cells = computed(() => props.steps.map((on, i) => ({
    on,
    style: on ? { background: `hsl(${padHue(props.pitches[i] || 220)} 80% ${38 + 24 * (props.velocities[i] ?? 1)}%)` } : undefined,
})));

const scopeEl = ref<HTMLCanvasElement | null>(null);
const specEl = ref<HTMLCanvasElement | null>(null);
const stops: (() => void)[] = [];
onMounted(() => {
    if (scopeEl.value) stops.push(startScope(scopeEl.value, props.analyser, props.active));
    if (specEl.value) stops.push(startSpectrogram(specEl.value, props.analyser, props.sampleRate, props.active));
});
onBeforeUnmount(() => stops.forEach((s) => s()));
</script>

<style scoped>
.machine-rail {
    --mr-lcd-bg: #0f141b;
    --mr-ink: #c7d6ff;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    min-height: 0;
}

.theme-analog .machine-rail {
    --mr-lcd-bg: #1a1208;
    --mr-ink: #ffb547;
}

.theme-synthwave .machine-rail {
    --mr-lcd-bg: #2a0f52;
    --mr-ink: #e8dcff;
}

/* The monitor takes whatever the rows leave: two screens, the scope over the spectrogram */
.mr-monitor {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mr-screen {
    position: relative;
    flex: 1 1 0;
    min-height: 44px;
    border-radius: 6px;
    background: var(--mr-lcd-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 2px 10px rgba(0, 0, 0, 0.6), 0 0 0 2px rgba(0, 0, 0, 0.45);
    overflow: hidden;
}

.mr-screen canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.mr-label {
    position: absolute;
    top: 4px;
    left: 7px;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--mr-ink);
    opacity: 0.6;
    pointer-events: none;
}

.mr-rows {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.mr-row {
    display: grid;
    grid-template-columns: 14px 64px 30px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--pt-inset, rgba(0, 0, 0, 0.3));
}

.mr-row.is-chosen {
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--hw-led, #7dffb0), transparent 35%);
}

/* The LED: a 12 px light on a 22 px button, so a finger can hit it */
.mr-led {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin: -4px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
}

.mr-led::before {
    content: "";
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--hw-led-off, #2b3a33);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}

.mr-led.lit::before {
    background: var(--hw-led, #7dffb0);
    box-shadow: 0 0 6px var(--hw-led, #7dffb0);
}

.mr-led:focus-visible {
    outline: 2px solid var(--pt-accent, #ff4fd8);
    outline-offset: 2px;
}

.mr-name {
    font: 700 12px Cousine, ui-monospace, monospace;
    letter-spacing: 0.04em;
    color: var(--pt-text, #e8e2ff);
}

.mr-level {
    display: flex;
    justify-content: center;
}

.mr-cells {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    gap: 2px;
    height: 16px;
}

.mr-cells i {
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.07);
}

.mr-cells i.beat:not(.on) {
    background: rgba(255, 255, 255, 0.13);
}

.mr-cells i.now {
    outline: 1px solid #fff;
    outline-offset: 0;
}
</style>

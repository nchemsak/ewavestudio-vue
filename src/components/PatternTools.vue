<template>
    <div class="pattern-tools p-2">
        <h2 class="mb-2">Pattern Tools</h2>

        <!-- Clear / Invert / Shift -->
        <div class="d-flex align-items-center gap-2 flex-wrap mb-3">
            <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary" @click="clear">Clear</button>
                <button class="btn btn-outline-secondary" @click="invert">Invert</button>
                <button class="btn btn-outline-secondary" @click="shift(-1)">Shift ←</button>
                <button class="btn btn-outline-secondary" @click="shift(1)">Shift →</button>
            </div>
        </div>

        <!-- Randomize (steps only) -->
        <div class="d-flex align-items-center gap-3 mb-3">
            <div class="position-relative text-center">
                <Knob v-model="randomizeAmt" label="Randomize" :min="0" :max="1" :step="0.01" size="small"
                    color="#2ECC71" @knobStart="activeKnob = 'rand'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'rand'" class="custom-tooltip">
                    {{ Math.round(randomizeAmt * 100) }}%
                </span>
            </div>

            <button class="btn btn-sm btn-outline-success" @click="randomize">
                Randomize
            </button>
        </div>

        <!-- Humanize (velocities only, from 100% each click) -->
        <div class="d-flex align-items-center gap-3" v-if="props.velocities">
            <div class="position-relative text-center">
                <Knob v-model="humanizeAmt" label="Humanize" :min="0" :max="1" :step="0.01" size="small" color="#9B59B6"
                    @knobStart="activeKnob = 'human'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'human'" class="custom-tooltip">
                    {{ Math.round(humanizeAmt * 100) }}%
                </span>
            </div>

            <button class="btn btn-sm btn-outline-primary" @click="humanize">
                Humanize
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Knob from './Knob.vue';

const props = defineProps<{
    steps: boolean[];
    velocities?: number[]; // 0..1
}>();

const emit = defineEmits<{
    (e: 'update:steps', v: boolean[]): void;
    (e: 'update:velocities', v: number[]): void;
}>();

/* UI state */
const randomizeAmt = ref(0.35);
const humanizeAmt = ref(0.5); // higher default for a noticeable effect
const activeKnob = ref<null | 'rand' | 'human'>(null);

/* Buttons */
function clear(): void {
    // Steps -> all off
    emit('update:steps', props.steps.map(() => false));
    // Velocities -> all 1.0 (even for inactive pads)
    if (props.velocities) {
        emit('update:velocities', props.velocities.map(() => 1));
    }
}

function invert(): void {
    emit('update:steps', props.steps.map(s => !s));
}

function shift(dir: -1 | 1): void {
    const s = props.steps;
    const out = dir === -1
        ? s.slice(1).concat(s[0])
        : s.slice(-1).concat(s.slice(0, -1));
    emit('update:steps', out);

    if (props.velocities) {
        const v = props.velocities;
        const vout = dir === -1
            ? v.slice(1).concat(v[0])
            : v.slice(-1).concat(v.slice(0, -1));
        emit('update:velocities', vout);
    }
}

/* Actions */
function randomize(): void {
    const d = clamp01(randomizeAmt.value);
    const newSteps = props.steps.map(() => Math.random() < d);
    emit('update:steps', newSteps);
    // Velocities untouched here (by design).
}

function humanize(): void {
    if (!props.velocities) return;

    const amt = clamp01(humanizeAmt.value);
    // At amt=1 -> uniform in [0..1]; at amt=0.5 -> [0.5..1], etc.
    const floor = clamp(1 - amt, 0, 1);

    const out = props.velocities.map((_, i) => {
        if (!props.steps[i]) return 1; // inactive pads snap to full velocity
        return floor + Math.random() * (1 - floor);
    });
    emit('update:velocities', out);
}

/* Utils */
function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
}
function clamp01(x: number): number {
    return clamp(x, 0, 1);
}
</script>

<style scoped>
.pattern-tools {
    max-width: 520px;
}
</style>

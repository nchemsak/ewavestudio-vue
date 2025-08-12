<template>
    <div class="d-flex align-items-center gap-2 flex-wrap mb-2">
        <strong class="me-2">Pattern</strong>

        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" @click="clear">Clear</button>
            <button class="btn btn-outline-secondary" @click="invert">Invert</button>
            <button class="btn btn-outline-secondary" @click="shift(-1)">Shift ←</button>
            <button class="btn btn-outline-secondary" @click="shift(1)">Shift →</button>
        </div>

        <!-- Randomize -->
        <div class="d-flex align-items-center ms-2">
            <small class="me-2">Randomize</small>
            <input type="range" min="0" max="1" step="0.01" v-model.number="densityLocal" style="width: 120px" />
            <small class="ms-2">{{ Math.round(densityLocal * 100) }}%</small>
            <button class="btn btn-sm btn-primary ms-2" @click="randomize">Go</button>
        </div>

        <!-- Humanize -->
        <div class="d-flex align-items-center ms-3" v-if="velocities">
            <small class="me-2">Humanize</small>
            <input type="range" min="0" max="0.4" step="0.01" v-model.number="humanizeAmt" style="width: 120px" />
            <small class="ms-2">±{{ Math.round(humanizeAmt * 100) }}%</small>
            <button class="btn btn-sm btn-outline-primary ms-2" @click="humanize">Apply</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
    steps: boolean[]
    velocities?: number[] // 0..1, optional
}>()

const emit = defineEmits<{
    (e: 'update:steps', v: boolean[]): void
    (e: 'update:velocities', v: number[]): void
}>()

const densityLocal = ref(0.35)   // default randomize density
const humanizeAmt = ref(0.08)   // ±8% by default

function clear() {
    emit('update:steps', props.steps.map(() => false))
}

function invert() {
    emit('update:steps', props.steps.map(s => !s))
}

function shift(dir: -1 | 1) {
    const s = props.steps
    const out = dir === -1
        ? s.slice(1).concat(s[0])
        : s.slice(-1).concat(s.slice(0, -1))
    emit('update:steps', out)

    if (props.velocities) {
        const v = props.velocities
        const vout = dir === -1
            ? v.slice(1).concat(v[0])
            : v.slice(-1).concat(v.slice(0, -1))
        emit('update:velocities', vout)
    }
}

function randomize() {
    const d = Math.min(Math.max(densityLocal.value, 0), 1)
    const newSteps = props.steps.map(() => Math.random() < d)
    emit('update:steps', newSteps)
    // leave velocities as-is; users can adjust with your hover sliders
}

function humanize() {
    if (!props.velocities) return
    const amt = Math.min(Math.max(humanizeAmt.value, 0), 0.4)
    const out = props.velocities.map((v, i) => {
        if (!props.steps[i]) return v
        const jitter = (Math.random() * 2 - 1) * amt
        return Math.min(1, Math.max(0, v + jitter))
    })
    emit('update:velocities', out)
}
</script>

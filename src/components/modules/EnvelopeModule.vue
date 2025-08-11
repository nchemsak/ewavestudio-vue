<template>
    <KnobGroup v-model="localEnabled" :title="title" :color="color" :showToggle="showToggle">
        <!-- Attack -->
        <div class="position-relative text-center">
            <Knob v-model="attackNorm" label="Attack" size="medium" :min="0" :max="100" :step="1"
                :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'attack'"
                @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'attack'" class="custom-tooltip">
                {{ Math.round(attackMsLocal) }} ms
            </span>
        </div>

        <!-- Decay -->
        <div class="position-relative text-center">
            <Knob v-model="decayNorm" label="Decay" size="medium" :min="0" :max="100" :step="1"
                :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'decay'"
                @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'decay'" class="custom-tooltip">
                {{ Math.round(decayMsLocal) }} ms
            </span>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'

const props = withDefaults(defineProps<{
    enabled: boolean
    attackMs: number        // outward value in ms
    decayMs: number         // outward value in ms
    title?: string
    color?: string
    showToggle?: boolean

    // optional behavior
    attackMinMs?: number
    attackMaxMs?: number
    decayMinMs?: number
    decayMaxMs?: number
    attackLog?: boolean     // map 0..100 knob to time exponentially
    decayLog?: boolean      // same for decay (defaults to linear)
}>(), {
    title: 'Envelope',
    color: '#4CAF50',
    showToggle: false,
    attackMinMs: 1,    // 1ms
    attackMaxMs: 100,  // 100ms
    decayMinMs: 50,    // 50ms
    decayMaxMs: 2000,  // 2000ms
    attackLog: true,
    decayLog: false
})

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void
    (e: 'update:attackMs', v: number): void
    (e: 'update:decayMs', v: number): void
}>()

// Local mirrors
const localEnabled = ref(props.enabled)

// Normalized 0..100 knob positions:
const attackNorm = ref(msToNorm(props.attackMs ?? 20, props.attackMinMs, props.attackMaxMs, props.attackLog))
const decayNorm = ref(msToNorm(props.decayMs ?? 400, props.decayMinMs, props.decayMaxMs, props.decayLog))

// Derived ms for tooltips (and emitting)
const attackMsLocal = ref(normToMs(attackNorm.value, props.attackMinMs, props.attackMaxMs, props.attackLog))
const decayMsLocal = ref(normToMs(decayNorm.value, props.decayMinMs, props.decayMaxMs, props.decayLog))

// Sync down from parent
watch(() => props.enabled, v => (localEnabled.value = v))
watch(() => props.attackMs, v => {
    const ms = clampMs(v ?? 20, props.attackMinMs, props.attackMaxMs)
    attackNorm.value = msToNorm(ms, props.attackMinMs, props.attackMaxMs, props.attackLog)
    attackMsLocal.value = ms
})
watch(() => props.decayMs, v => {
    const ms = clampMs(v ?? 400, props.decayMinMs, props.decayMaxMs)
    decayNorm.value = msToNorm(ms, props.decayMinMs, props.decayMaxMs, props.decayLog)
    decayMsLocal.value = ms
})

// Emit up when knobs move
watch(localEnabled, v => emit('update:enabled', v))
watch(attackNorm, n => {
    const ms = normToMs(n, props.attackMinMs, props.attackMaxMs, props.attackLog)
    attackMsLocal.value = ms
    emit('update:attackMs', Math.round(ms))
})
watch(decayNorm, n => {
    const ms = normToMs(n, props.decayMinMs, props.decayMaxMs, props.decayLog)
    decayMsLocal.value = ms
    emit('update:decayMs', Math.round(ms))
})

const activeKnob = ref<null | 'attack' | 'decay'>(null)

// helpers
function clampMs(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v))
}
function normToMs(norm: number, min: number, max: number, log: boolean) {
    const t = Math.max(0, Math.min(100, norm)) / 100
    if (!log) return min + (max - min) * t
    const ratio = max / min
    return min * Math.pow(ratio, t)
}
function msToNorm(ms: number, min: number, max: number, log: boolean) {
    const x = clampMs(ms, min, max)
    if (!log) return ((x - min) / (max - min)) * 100
    const ratio = max / min
    return (Math.log(x / min) / Math.log(ratio)) * 100
}
</script>

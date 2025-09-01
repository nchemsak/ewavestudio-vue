<template>
    <div class="pt-subblock">
        <div class="pt-subheader">
            <div class="pt-section-title">{{ title }}</div>

            <label v-if="showToggle" class="pt-switch">
                <input type="checkbox" v-model="localEnabled" aria-label="Enable filter" />
                <span></span>
            </label>
        </div>

        <div class="pt-knob-row">
            <!-- Cutoff -->
            <div class="position-relative text-center">
                <Knob v-model="localCutoff" label="Cutoff" size="small" :min="minCutoff" :max="maxCutoff"
                    :step="cutoffStep" :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'cutoff'"
                    @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'cutoff'" class="custom-tooltip">
                    {{ Math.round(localCutoff) }} Hz
                </span>
            </div>

            <!-- Resonance -->
            <div class="position-relative text-center">
                <Knob v-model="localResonance" label="Resonance" size="small" :min="minResonance" :max="maxResonance"
                    :step="resonanceStep" :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'res'"
                    @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'res'" class="custom-tooltip">
                    Q: {{ localResonance.toFixed(1) }}
                </span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Knob from '../Knob.vue'

const props = withDefaults(defineProps<{
    enabled: boolean
    cutoff: number
    resonance: number
    title?: string
    color?: string
    showToggle?: boolean
    minCutoff?: number
    maxCutoff?: number
    cutoffStep?: number
    minResonance?: number
    maxResonance?: number
    resonanceStep?: number
}>(), {
    title: 'Filter',
    color: '#FF5722',
    showToggle: false,
    minCutoff: 100,
    maxCutoff: 10000,
    cutoffStep: 1,
    minResonance: 0.1,
    maxResonance: 20,
    resonanceStep: 0.1
})

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void
    (e: 'update:cutoff', v: number): void
    (e: 'update:resonance', v: number): void
}>()

const localEnabled = ref(props.enabled)
const localCutoff = ref(props.cutoff ?? 5000)
const localResonance = ref(props.resonance ?? 0.5)

watch(() => props.enabled, v => (localEnabled.value = v))
watch(() => props.cutoff, v => (localCutoff.value = v ?? 5000))
watch(() => props.resonance, v => (localResonance.value = v ?? 0.5))

watch(localEnabled, v => emit('update:enabled', v))
watch(localCutoff, v => {
    const clamped = Math.max(props.minCutoff, Math.min(props.maxCutoff, Math.round(v)))
    emit('update:cutoff', clamped)
})
watch(localResonance, v => {
    const clamped = Math.max(props.minResonance, Math.min(props.maxResonance, +v))
    emit('update:resonance', clamped)
})

const activeKnob = ref<null | 'cutoff' | 'res'>(null)
</script>

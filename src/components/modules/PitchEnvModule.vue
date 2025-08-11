<!-- /components/modules/PitchEnvModule.vue -->
<template>
    <KnobGroup v-model="localEnabled" :title="title" :color="color" :showToggle="showToggle">
        <!-- Header controls (mode buttons) -->
        <template #header-content>
            <div class="btn-group ms-auto" role="group" aria-label="Pitch Env Mode">
                <button class="btn btn-sm" :disabled="!localEnabled"
                    :class="localMode === 'up' ? 'btn-primary' : 'btn-outline-primary'" @click="updateMode('up')"
                    title="Pitch up then decay">
                    <i class="bi bi-arrow-up"></i>
                </button>
                <button class="btn btn-sm" :disabled="!localEnabled"
                    :class="localMode === 'down' ? 'btn-primary' : 'btn-outline-primary'" @click="updateMode('down')"
                    title="Pitch down then settle">
                    <i class="bi bi-arrow-down"></i>
                </button>
                <button class="btn btn-sm" :disabled="!localEnabled"
                    :class="localMode === 'random' ? 'btn-primary' : 'btn-outline-primary'"
                    @click="updateMode('random')" title="Random up/down per hit">
                    <i class="bi bi-shuffle"></i>
                </button>
            </div>
        </template>

        <!-- Amount (semitones) -->
        <div class="position-relative text-center">
            <Knob v-model="localSemitones" label="Amount" size="medium" :min="0" :max="48" :step="1"
                :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'amt'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'amt'" class="custom-tooltip">
                {{ localSemitones }} semitones
            </span>
        </div>

        <!-- Decay (milliseconds) -->
        <div class="position-relative text-center">
            <Knob v-model="localDecayMs" label="Decay" size="medium" :min="5" :max="2000" :step="1"
                :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'decay'"
                @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'decay'" class="custom-tooltip">
                {{ Math.round(localDecayMs) }} ms
            </span>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'

type Mode = 'up' | 'down' | 'random'

const props = withDefaults(defineProps<{
    /** v-model:enabled */
    enabled: boolean
    /** v-model:semitones (0..48) */
    semitones: number
    /** v-model:decayMs (5..2000 ms) */
    decayMs: number
    /** v-model:mode */
    mode: Mode
    /** UI only */
    title?: string
    color?: string
    showToggle?: boolean
}>(), {
    title: 'Pitch Env',
    color: '#3F51B5',
    showToggle: false
})

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void
    (e: 'update:semitones', v: number): void
    (e: 'update:decayMs', v: number): void
    (e: 'update:mode', v: Mode): void
}>()

// Local mirrors for smooth knob UX
const localEnabled = ref(props.enabled)
const localSemitones = ref(props.semitones)
const localDecayMs = ref(props.decayMs)
const localMode = ref<Mode>(props.mode)

watch(() => props.enabled, v => (localEnabled.value = v))
watch(() => props.semitones, v => (localSemitones.value = v))
watch(() => props.decayMs, v => (localDecayMs.value = v))
watch(() => props.mode, v => (localMode.value = v))

watch(localEnabled, v => emit('update:enabled', v))
watch(localSemitones, v => emit('update:semitones', Math.max(0, Math.min(48, Math.round(v)))))
watch(localDecayMs, v => emit('update:decayMs', Math.max(5, Math.min(2000, Math.round(v)))))
function updateMode(m: Mode) {
    localMode.value = m
    emit('update:mode', m)
}

// Tooltip state (matches your pattern)
const activeKnob = ref<null | 'amt' | 'decay'>(null)
</script>

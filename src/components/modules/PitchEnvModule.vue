<!-- components/modules/PitchEnvModule.vue -->
<template>
    <KnobGroup v-model="localEnabled" :title="title" :color="color" :showToggle="showToggle">

        <template #header-content>

            <div class="pt-seg" role="group" aria-label="Pitch Env Mode">
                <button class="pt-seg-btn" :class="{ 'is-active': localMode === 'up' }"
                    :aria-pressed="localMode === 'up'" :disabled="!localEnabled" @click="selectMode('up')">
                    ↑
                    <span class="selector-tooltip">Pitch up</span>
                </button>

                <button class="pt-seg-btn" :class="{ 'is-active': localMode === 'down' }"
                    :aria-pressed="localMode === 'down'" :disabled="!localEnabled" @click="selectMode('down')">
                    ↓
                    <span class="selector-tooltip">Pitch down</span>
                </button>

                <button class="pt-seg-btn" :class="{ 'is-active': localMode === 'random' }"
                    :aria-pressed="localMode === 'random'" :disabled="!localEnabled" @click="selectMode('random')">
                    ⇵
                    <span class="selector-tooltip">Random pitch</span>
                </button>
            </div>


        </template>
        <!-- KNOBS (Amount, Decay) -->
        <div class="position-relative text-center">
            <Knob v-model="localSemitones" label="Amount" size="medium" :min="0" :max="48" :step="1"
                :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'amt'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'amt'" class="custom-tooltip">
                {{ localSemitones }} semitones
            </span>
        </div>

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
    enabled: boolean
    semitones: number
    decayMs: number
    mode: Mode
    title?: string
    color?: string
    showToggle?: boolean
}>(), {
    title: 'Pitch Env',
    color: '#3F51B5',
    showToggle: true,   // show the dot toggle for clarity
})

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void
    (e: 'update:semitones', v: number): void
    (e: 'update:decayMs', v: number): void
    (e: 'update:mode', v: Mode): void
}>()

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

function selectMode(m: Mode) {
    if (!localEnabled.value) localEnabled.value = true; // smart-enable on click
    localMode.value = m
    emit('update:mode', m)
}

const activeKnob = ref<null | 'amt' | 'decay'>(null)
</script>

<style scoped>
/* tighter chip spacing in header */
.pt-tight {
    gap: 6px;
}
</style>

<!-- /components/modules/FMModule.vue -->
<template>
    <KnobGroup v-model="localEnabled" title="FM" :color="color" :showToggle="showToggle">
        <template #header-content>
            <div class="d-flex align-items-center ms-auto gap-2 position-relative">
                <!-- Ratio presets -->
                <div class="btn-group" role="group" aria-label="FM Ratio Presets">
                    <button v-for="r in ratioPresets" :key="r.label" class="btn btn-sm" :disabled="!localEnabled"
                        :class="localRatio === r.value ? 'btn-primary' : 'btn-outline-primary'"
                        @click="setRatio(r.value)" :title="`Mod Freq = Carrier × ${r.label}`">{{ r.label }}</button>
                    <button class="btn btn-sm" :disabled="!localEnabled"
                        :class="localRatio === null ? 'btn-info' : 'btn-outline-info'" @click="setRatio(null)"
                        title="Free Hz (use Mod Freq knob)">Hz</button>
                </div>

                <!-- Info button -->
                <button class="btn btn-xs btn-outline-secondary" @click.stop="infoOpen = !infoOpen"
                    aria-label="What is FM?" title="What is FM?">
                    <i class="bi bi-info-circle"></i>
                </button>

                <!-- Info pop-up -->
                <div v-if="infoOpen" class="fm-info-popover card p-2 small" @click.stop>
                    <strong class="d-block mb-1">FM Explained</strong>
                    <ul class="mb-2 ps-3">
                        <li>FM adds a fast wobble to pitch → new harmonics.</li>
                    </ul>
                    <div class="mb-1"><strong>Ratio</strong>: Locks Mod Freq to the note. Consistent tone.</div>
                    <div class="mb-1"><strong>Hz</strong>: Unlocks Mod Freq. Tone varies more between notes.</div>
                    <div class="mb-1"><strong>Mod Freq</strong>: Modulator speed (active in Hz mode).</div>
                    <div class="mb-2"><strong>Amount</strong>: Intensity/brightness. Higher = richer/clangier.</div>
                    <div class="text-muted mb-2"><i>Tip: Sine wave sounds cleanest with FM.</i></div>
                    <div class="text-end">
                        <button class="btn btn-xs btn-outline-secondary" @click="infoOpen = false">Close</button>
                    </div>
                </div>
            </div>
        </template>

        <!-- Mod Freq (active only in Hz mode) -->
        <div class="position-relative text-center" :class="{ 'is-disabled': modFreqDisabled }" aria-disabled="true">
            <Knob v-model="localModFreq" label="Mod Freq" size="medium" :min="1" :max="5000" :step="1"
                :disabled="modFreqDisabled" :color="color" @knobStart="activeKnob = 'mf'"
                @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'mf'" class="custom-tooltip">
                {{ Math.round(localModFreq) }} Hz
            </span>
        </div>


        <!-- Index / Amount -->
        <div class="position-relative text-center">
            <Knob v-model="localIndex" label="Amount" size="medium" :min="0" :max="50" :step="0.1"
                :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'ix'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'ix'" class="custom-tooltip">
                {{ localIndex.toFixed(1) }}
            </span>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'

import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'
const modFreqDisabled = computed(() => !localEnabled.value || localRatio.value !== null)

const props = withDefaults(defineProps<{
    enabled: boolean
    modFreq: number
    index: number
    ratio: number | null
    title?: string
    color?: string
    showToggle?: boolean
}>(), {
    title: 'FM',
    color: '#3F51B5',
    showToggle: false
})

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void
    (e: 'update:modFreq', v: number): void
    (e: 'update:index', v: number): void
    (e: 'update:ratio', v: number | null): void
}>()

// local mirrors
const localEnabled = ref(props.enabled)
const localModFreq = ref(props.modFreq ?? 200)
const localIndex = ref(props.index ?? 0)
const localRatio = ref<number | null>(props.ratio ?? null)

watch(() => props.enabled, v => (localEnabled.value = v))
watch(() => props.modFreq, v => (localModFreq.value = v ?? 200))
watch(() => props.index, v => (localIndex.value = v ?? 0))
watch(() => props.ratio, v => (localRatio.value = v ?? null))

watch(localEnabled, v => emit('update:enabled', v))
watch(localModFreq, v => emit('update:modFreq', Math.max(1, Math.min(5000, Math.round(v)))))
watch(localIndex, v => emit('update:index', Math.max(0, Math.min(50, +v))))
function setRatio(r: number | null) {
    localRatio.value = r
    emit('update:ratio', r)
}

// ratios in ascending order
const ratioPresets = [
    { value: 1, label: '1:1' },
    { value: 3 / 2, label: '3:2' },
    { value: 2, label: '2:1' }
    // { value: 5 / 2, label: '5:2' },
    // { value: 7 / 2, label: '7:2' }
]

// info popover
const infoOpen = ref(false)
function handleDocClick() {
    if (infoOpen.value) infoOpen.value = false
}
onMounted(() => document.addEventListener('click', handleDocClick))
onBeforeUnmount(() => document.removeEventListener('click', handleDocClick))

const activeKnob = ref<null | 'mf' | 'ix'>(null)
</script>

<style scoped>
.fm-info-popover {
    position: absolute;
    left: 179px;
    top: 0px;
    width: 375px;
    z-index: 10;
}

.btn.btn-xs {
    padding: 0.15rem 0.4rem;
    font-size: 0.75rem;
    line-height: 1;
}

/* Gray out the knob’s label (and optionally value text) when disabled */
.is-disabled :deep(.knob-label) {
    color: #9aa0a6;
    /* subtle gray */
    opacity: 0.7;
}

/* Optional: dim the number readout if your Knob shows one */
.is-disabled :deep(.knob-readout),
.is-disabled :deep(.knob-value) {
    color: #9aa0a6;
    opacity: 0.6;
}
</style>

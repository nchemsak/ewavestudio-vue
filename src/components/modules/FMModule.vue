<!-- components/modules/FMModule.vue -->
<template>
    <KnobGroup v-model="localEnabled" title="FM" :color="color" :showToggle="showToggle">
        <!-- header info button -->
        <template #header-content>
            <div class="pt-header-tools">
                <InfoPopover title="FM Explained" aria-label="What is FM?">
                    FM adds a fast wobble to pitch → new harmonics.
                    <div class="pt-rule"></div>
                    <ul class="mb-2 ps-3">
                        <li><strong>Ratio</strong>: Locks Mod Freq to the note. Consistent tone.</li>
                        <li><strong>Hz</strong>: Unlocks Mod Freq. Tone varies more between notes.</li>
                        <li><strong>Mod Freq</strong>: Modulator speed <i>(only active in "Hz" mode)</i></li>
                        <li><strong>Amount</strong>: Intensity/brightness. Higher = richer/clangier.</li>
                    </ul>
                </InfoPopover>
            </div>
        </template>

        <!-- stack: buttons row, then knobs row -->
        <div class="pt-stack">
            <div class="pt-seg pt-seg-sm pt-seg-row" role="group" aria-label="FM Ratio Presets">
                <button class="pt-seg-btn" :class="{ 'is-active': localRatio === 1 }" :aria-pressed="localRatio === 1"
                    :disabled="!localEnabled" @click="setRatio(1)">
                    1:1 <span class="selector-tooltip">Carrier × 1</span>
                </button>
                <button class="pt-seg-btn" :class="{ 'is-active': localRatio === 1.5 }"
                    :aria-pressed="localRatio === 1.5" :disabled="!localEnabled" @click="setRatio(1.5)">
                    3:2 <span class="selector-tooltip">Carrier × 1.5</span>
                </button>
                <button class="pt-seg-btn" :class="{ 'is-active': localRatio === 2 }" :aria-pressed="localRatio === 2"
                    :disabled="!localEnabled" @click="setRatio(2)">
                    2:1 <span class="selector-tooltip">Carrier × 2</span>
                </button>
                <button class="pt-seg-btn" :class="{ 'is-active': localRatio === null }"
                    :aria-pressed="localRatio === null" :disabled="!localEnabled" @click="setRatio(null)">
                    Hz <span class="selector-tooltip">Free Hz mode</span>
                </button>
            </div>

            <div class="pt-knob-row">
                <div class="position-relative text-center" :class="{ 'is-disabled': modFreqDisabled }"
                    aria-disabled="true">
                    <Knob v-model="localModFreq" label="Mod Freq" size="medium" :min="1" :max="5000" :step="1"
                        :disabled="modFreqDisabled" :color="color" @knobStart="activeKnob = 'mf'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'mf'" class="custom-tooltip">{{ Math.round(localModFreq) }} Hz</span>
                </div>

                <div class="position-relative text-center">
                    <Knob v-model="localIndex" label="Amount" size="medium" :min="0" :max="50" :step="0.1"
                        :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'ix'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'ix'" class="custom-tooltip">{{ localIndex.toFixed(1) }}</span>
                </div>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'
import InfoPopover from '../InfoPopover.vue' // ⬅️ ADD THIS

type Ratio = number | null

const props = withDefaults(defineProps<{
    enabled: boolean
    modFreq: number
    index: number
    ratio: Ratio
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
    (e: 'update:ratio', v: Ratio): void
}>()

/* local mirrors */
const localEnabled = ref(props.enabled)
const localModFreq = ref(props.modFreq ?? 200)
const localIndex = ref(props.index ?? 0)
const localRatio = ref<Ratio>(props.ratio ?? null)

/* sync down */
watch(() => props.enabled, v => (localEnabled.value = v))
watch(() => props.modFreq, v => (localModFreq.value = v ?? 200))
watch(() => props.index, v => (localIndex.value = v ?? 0))
watch(() => props.ratio, v => (localRatio.value = v ?? null))

/* emit up */
watch(localEnabled, v => emit('update:enabled', v))
watch(localModFreq, v => emit('update:modFreq', Math.max(1, Math.min(5000, Math.round(v)))))
watch(localIndex, v => emit('update:index', Math.max(0, Math.min(50, +v))))

function setRatio(r: Ratio) {
    localRatio.value = r
    emit('update:ratio', r)
}

const modFreqDisabled = computed(() => !localEnabled.value || localRatio.value !== null)

/* knob tooltip state */
const activeKnob = ref<null | 'mf' | 'ix'>(null)
</script>

<style scoped>
.pt-seg-row {
    margin-top: .25rem;
    margin-bottom: .5rem;
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
}

.pt-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
}

.pt-knob-row {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
}

.fm-li strong {
    border-bottom: 1px dotted white;
}

.is-disabled :deep(.knob-label) {
    color: #9aa0a6;
    opacity: .7;
}

.is-disabled :deep(.knob-readout),
.is-disabled :deep(.knob-value) {
    color: #9aa0a6;
    opacity: .6;
}
</style>

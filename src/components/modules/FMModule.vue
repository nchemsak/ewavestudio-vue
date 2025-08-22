<!-- /components/modules/FMModule.vue -->
<template>
    <KnobGroup v-model="localEnabled" title="FM" :color="color" :showToggle="showToggle">
        <!-- HEADER -->
        <template #header-content>
            <div class="pt-header-tools">
                <!-- Ratio presets (segmented) -->
                <div class="pt-seg pt-seg-sm" role="group" aria-label="FM Ratio Presets">
                    <button class="pt-seg-btn" :class="{ 'is-active': localRatio === 1 }"
                        :aria-pressed="localRatio === 1" :disabled="!localEnabled" @click="setRatio(1)">
                        1:1
                        <span class="selector-tooltip">Carrier × 1</span>
                    </button>

                    <button class="pt-seg-btn" :class="{ 'is-active': localRatio === 1.5 }"
                        :aria-pressed="localRatio === 1.5" :disabled="!localEnabled" @click="setRatio(1.5)">
                        3:2
                        <span class="selector-tooltip">Carrier × 1.5</span>
                    </button>

                    <button class="pt-seg-btn" :class="{ 'is-active': localRatio === 2 }"
                        :aria-pressed="localRatio === 2" :disabled="!localEnabled" @click="setRatio(2)">
                        2:1
                        <span class="selector-tooltip">Carrier × 2</span>
                    </button>

                    <button class="pt-seg-btn" :class="{ 'is-active': localRatio === null }"
                        :aria-pressed="localRatio === null" :disabled="!localEnabled" @click="setRatio(null)">
                        Hz
                        <span class="selector-tooltip">Free Hz mode</span>
                    </button>
                </div>

                <!-- Info icon -->
                <button ref="infoBtn" class="pt-info-icon" :class="{ 'is-active': infoOpen }" @click.stop="toggleInfo"
                    aria-label="What is FM?" title="What is FM?">
                    ⓘ
                </button>

                <!-- Popover (fixed; positioned via JS; never off-screen) -->
                <div v-if="infoOpen" ref="infoEl" class="pt-popover fm-info" :data-side="infoSide"
                    :style="{ top: infoPos.top + 'px', left: infoPos.left + 'px' }" @click.stop>
                    <strong class="d-block mb-2">FM Explained</strong>
                    <ul class="mb-2 ps-3">
                        <li>FM adds a fast wobble to pitch → new harmonics.</li>
                    </ul>
                    <div class="mb-1"><strong>Ratio</strong>: Locks Mod Freq to the note. Consistent tone.</div>
                    <div class="mb-1"><strong>Hz</strong>: Unlocks Mod Freq. Tone varies more between notes.</div>
                    <div class="mb-1"><strong>Mod Freq</strong>: Modulator speed (active in Hz mode).</div>
                    <div class="mb-2"><strong>Amount</strong>: Intensity/brightness. Higher = richer/clangier.</div>
                    <div class="text-end mt-2">
                        <button class="pt-seg-btn pt-seg-sm" @click="infoOpen = false">Close</button>
                    </div>
                </div>
            </div>
        </template>

        <!-- Mod Freq (Hz mode only) -->
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
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'

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

watch(() => props.enabled, v => (localEnabled.value = v))
watch(() => props.modFreq, v => (localModFreq.value = v ?? 200))
watch(() => props.index, v => (localIndex.value = v ?? 0))
watch(() => props.ratio, v => (localRatio.value = v ?? null))

watch(localEnabled, v => emit('update:enabled', v))
watch(localModFreq, v => emit('update:modFreq', Math.max(1, Math.min(5000, Math.round(v)))))
watch(localIndex, v => emit('update:index', Math.max(0, Math.min(50, +v))))

function setRatio(r: Ratio) {
    localRatio.value = r
    emit('update:ratio', r)
}

const modFreqDisabled = computed(() => !localEnabled.value || localRatio.value !== null)

/* --- Info popover: fixed positioning, auto-flip + clamped --- */
const infoOpen = ref(false)
const infoBtn = ref<HTMLElement | null>(null)
const infoEl = ref<HTMLElement | null>(null)
const infoSide = ref<'right' | 'left'>('right')
const infoPos = ref({ top: 0, left: 0 })

function positionInfo() {
    const btnRect = infoBtn.value?.getBoundingClientRect()
    const elRect = infoEl.value?.getBoundingClientRect()
    if (!btnRect || !elRect) return

    const gap = 10
    const margin = 8

    // choose the side
    const spaceRight = window.innerWidth - btnRect.right
    infoSide.value = spaceRight >= elRect.width + gap ? 'right' : 'left'

    // compute coords
    let top = btnRect.top + btnRect.height / 2 - elRect.height / 2
    let left = infoSide.value === 'right'
        ? btnRect.right + gap
        : btnRect.left - elRect.width - gap

    // clamp to viewport
    top = Math.max(margin, Math.min(top, window.innerHeight - elRect.height - margin))
    left = Math.max(margin, Math.min(left, window.innerWidth - elRect.width - margin))

    infoPos.value = { top, left }
}

function toggleInfo() {
    infoOpen.value = !infoOpen.value
    if (infoOpen.value) nextTick(positionInfo)
}

function onViewportChange() {
    if (infoOpen.value) positionInfo()
}

function onDocClick(e: MouseEvent) {
    if (!infoOpen.value) return
    const t = e.target as Node
    if (infoEl.value && !infoEl.value.contains(t) && infoBtn.value && !infoBtn.value.contains(t)) {
        infoOpen.value = false
    }
}

onMounted(() => {
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, { passive: true })
    document.addEventListener('click', onDocClick, { capture: true })
})
onBeforeUnmount(() => {
    window.removeEventListener('resize', onViewportChange)
    window.removeEventListener('scroll', onViewportChange)
    document.removeEventListener('click', onDocClick, { capture: true })
})

/* knob tooltip state */
const activeKnob = ref<null | 'mf' | 'ix'>(null)
</script>

<style scoped>
/* popover is fixed & sized; the rest comes from your global .pt-popover styles */
.fm-info {
    position: fixed;
    width: min(380px, 76vw);
}

/* Dim the knob label/value when disabled (Hz hidden by ratio) */
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

<!-- components/LFOGroup.vue -->
<template>
    <KnobGroup v-model="localEnabled" :color="color" :showToggle="showToggle" :showHeader="false">
        <!-- Header: info icon only -->
        <!-- <template #header-content>
            <div class="pt-header-tools lfo-header">
                <div class="lfo-info-wrap">
                    <InfoPopover title="LFO" aria-label="What is the LFO?">
                        A Low Frequency Oscillator (LFO) is a slow modulation source that changes a target parameter.
                    </InfoPopover>
                </div>
            </div>
        </template> -->
        <InfoPopover title="LFO" aria-label="What is the LFO?">
            A Low Frequency Oscillator (LFO) is a slow modulation source that changes a target parameter.
        </InfoPopover>
        <div class="pt-stack">
            <div class="lfo-controls" role="group" aria-label="LFO Controls">
                <!-- Sync / Free toggle -->
                <div class="pt-seg pt-seg-sm" role="group" aria-label="LFO Rate Mode"
                    :class="{ disabled: !localEnabled }">
                    <button class="pt-seg-btn" :class="{ 'is-active': localSync }" :disabled="!localEnabled"
                        @click="setSync(true)">
                        Sync
                    </button>
                    <button class="pt-seg-btn" :class="{ 'is-active': !localSync }" :disabled="!localEnabled"
                        @click="setSync(false)">
                        Free
                    </button>
                </div>

                <!-- Waveform selector -->
                <div class="pt-seg pt-seg-sm" role="group" aria-label="LFO Wave" :class="{ disabled: !localEnabled }">
                    <button v-for="w in waves" :key="w" class="pt-seg-btn" :class="{ 'is-active': localWaveform === w }"
                        :aria-pressed="localWaveform === w" :disabled="!localEnabled" @click="setWave(w)">
                        {{ waveLabel(w) }}
                        <span class="selector-tooltip">{{ waveLong(w) }}</span>
                    </button>
                </div>

                <!-- Target selector (no resonance) -->
                <div class="lfo-target-selector" role="group" aria-label="LFO Target">
                    <span v-for="t in targets" :key="t" class="lfo-type-dot"
                        :class="{ selected: currentTarget === t, disabled: !localEnabled }"
                        @click="localEnabled && updateTarget(t)">
                        <span class="selector-tooltip">{{ labelFor(t) }}</span>
                    </span>
                </div>
            </div>

            <!-- Knobs -->
            <div class="pt-knob-row">
                <div class="position-relative text-center">
                    <Knob v-model="rateKnobModel" size="small" :min="rateMin" :max="rateMax" :step="rateStep"
                        label="Rate" :color="color" :disabled="!localEnabled" :showMarkers="localSync"
                        :markers="rateMarkers" :markersOnly="localSync" :markersOffsetDeg="-90"
                        @knobStart="activeKnob = 'rate'" @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'rate'" class="custom-tooltip">
                        <template v-if="localSync">{{ localDivision }}</template>
                        <template v-else>{{ Number(localRate).toFixed(1) }} Hz</template>
                    </span>
                </div>

                <div class="position-relative text-center">
                    <Knob v-model="localDepth" size="small" :min="0" :max="depthMax" :step="depthStep" label="Depth"
                        :color="color" :disabled="!localEnabled" @knobStart="activeKnob = 'depth'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'depth'" class="custom-tooltip">
                        {{ depthReadout }}
                    </span>
                </div>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'
import InfoPopover from '../InfoPopover.vue'

type Target = 'pitch' | 'gain' | 'filter' | 'pan'
type Wave = 'sine' | 'square' | 'random'

const props = withDefaults(defineProps<{
    modelValue: boolean
    rate: number
    depth: number
    target: Target
    waveform?: Wave
    syncEnabled?: boolean
    division?: string
    depthMax?: number
    color?: string
    targets?: Target[]
    waves?: Wave[]
    divisions?: string[]
    showToggle?: boolean
}>(), {
    modelValue: false,
    rate: 2,
    depth: 0,
    target: 'gain',
    waveform: 'sine',
    syncEnabled: true,
    division: '1/8',
    depthMax: 100,
    color: '#00BCD4',
    targets: () => ['pitch', 'gain', 'filter', 'pan'],
    waves: () => ['sine', 'square', 'random'],
    divisions: () => ['1/1', '1/2', '1/4', '1/8', '1/16', '1/8T', '1/8.'],
    showToggle: false
})

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    (e: 'update:rate', v: number): void
    (e: 'update:depth', v: number): void
    (e: 'update:target', v: Target): void
    (e: 'update:waveform', v: Wave): void
    (e: 'update:syncEnabled', v: boolean): void
    (e: 'update:division', v: string): void
}>()

function waveLabel(w: Wave | string): string {
    return w === 'random' ? 'Rnd' : w.charAt(0).toUpperCase() + w.slice(1)
}
function waveLong(w: Wave | string): string {
    return w === 'random' ? 'Random (Sample & Hold)' : waveLabel(w)
}
function labelFor(t: Target | string): string {
    return t === 'gain' ? 'Amplitude' : t.charAt(0).toUpperCase() + t.slice(1)
}

/* locals (snappy knobs) */
const localEnabled = ref(props.modelValue)
watch(() => props.modelValue, v => (localEnabled.value = v))
watch(localEnabled, v => emit('update:modelValue', v))

const localRate = ref(props.rate)
watch(() => props.rate, v => (localRate.value = v))
watch(localRate, v => emit('update:rate', v))

const localDepth = ref(props.depth)
watch(() => props.depth, v => (localDepth.value = v))
watch(localDepth, v => emit('update:depth', v))

const currentTarget = computed(() => props.target)
const updateTarget = (t: Target) => {
    emit('update:target', t)
    localDepth.value = 0
    emit('update:depth', 0)
}

const localWaveform = ref(props.waveform)
watch(() => props.waveform, v => (localWaveform.value = v))
function setWave(w: Wave) { emit('update:waveform', w) }

const localSync = ref(props.syncEnabled)
watch(() => props.syncEnabled, v => (localSync.value = v))
function setSync(v: boolean) { emit('update:syncEnabled', v) }

const localDivision = ref(props.division)
watch(() => props.division, v => (localDivision.value = v))
function setDivision(d: string) { emit('update:division', d) }

const activeKnob = ref<null | 'rate' | 'depth'>(null)

const depthStep = computed(() => {
    switch (currentTarget.value) {
        case 'pitch': return 1
        case 'gain': return 1
        case 'pan': return 1
        case 'filter': return 10
        default: return 1
    }
})
const depthReadout = computed(() => {
    const v = localDepth.value
    switch (currentTarget.value) {
        case 'pitch': return `${Math.round(v)} cents`
        case 'gain': return `${Math.round(v)}%`
        case 'pan': return `${Math.round(v)}%`
        case 'filter': return `${Math.round(v)} Hz`
        default: return String(v)
    }
})

const rateMin = computed(() => localSync.value ? 0 : 0.1)
const rateMax = computed(() => localSync.value ? (props.divisions.length - 1) : 20)
const rateStep = computed(() => localSync.value ? 1 : 0.1)
const rateMarkers = computed(() => {
    if (!localSync.value) return []
    const n = props.divisions.length
    return n <= 1 ? [0.5] : props.divisions.map((_, i) => i / (n - 1))
})

const divisionIndex = computed({
    get() {
        const idx = props.divisions.indexOf(localDivision.value)
        return Math.max(0, idx)
    },
    set(v: number) {
        const n = props.divisions.length
        const i = Math.min(n - 1, Math.max(0, Math.round(v)))
        const d = props.divisions[i] || props.divisions[0]
        setDivision(d)
    }
})

const rateKnobModel = computed({
    get() {
        return localSync.value ? divisionIndex.value : localRate.value
    },
    set(v: number) {
        if (localSync.value) divisionIndex.value = v
        else localRate.value = v
    }
})
</script>

<style scoped>
.lfo-header {
    display: flex;
    align-items: center;
}

.lfo-info-wrap {
    margin-left: auto;
}

.lfo-controls {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
}

.lfo-target-selector {
    display: flex;
    gap: 8px;
    align-items: center;
}

.pt-seg.disabled,
.lfo-type-dot.disabled {
    opacity: .5;
    pointer-events: none;
}
</style>

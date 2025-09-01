<!-- components/LFOGroup.vue -->
<template>
    <KnobGroup v-model="localEnabled" title="LFO" :color="color" :showToggle="showToggle">
        <!-- Header: info icon only -->
        <template #header-content>
            <div class="pt-header-tools lfo-header">
                <div class="lfo-info-wrap">
                    <InfoPopover title="LFO" aria-label="What is the LFO?">
                        A Low Frequencey Oscillator (LFO) is a slow modulation source that changes a target parameter.
                        <div class="pt-rule"></div>
                        <ul class="mb-2 ps-3">
                            <li><strong>Targets</strong>:
                                <ul>
                                    <li>Pitch (vibrato)</li>
                                    <li>Gain (tremolo)</li>
                                    <li>Filter (wah)</li>
                                    <li>Pan (auto-pan)</li>
                                    <li>Resonance (squelch)</li>
                                </ul>
                            </li>
                            <li><strong>Wave Shapes</strong>:

                                <ul>
                                    <li>Sine (smooth)</li>
                                    <li>Triangle (linear)</li>
                                    <li>Sawtooth (ramp)</li>
                                    <li>Square (on/off)</li>
                                    <li>Random/S&H (stepped)</li>
                                </ul>
                            </li>
                            <li><strong>Rate</strong>: <em>Sync</em> locks to tempo. <em>Free</em> = Hz.</li>
                            <li><strong>Depth</strong>: Mod amount.</li>
                        </ul>
                    </InfoPopover>
                </div>
            </div>
        </template>

        <div class="pt-stack">
            <div class="lfo-controls" role="group" aria-label="LFO Controls">
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

                <div class="pt-seg pt-seg-sm" role="group" aria-label="LFO Wave" :class="{ disabled: !localEnabled }">
                    <button v-for="w in waves" :key="w" class="pt-seg-btn" :class="{ 'is-active': localWaveform === w }"
                        :aria-pressed="localWaveform === w" :disabled="!localEnabled" @click="setWave(w)">
                        {{ waveLabel(w) }}
                        <span class="selector-tooltip">{{ waveLong(w) }}</span>
                    </button>
                </div>

                <div class="lfo-target-selector" role="group" aria-label="LFO Target">
                    <span v-for="t in targets" :key="t" class="lfo-type-dot"
                        :class="{ selected: currentTarget === t, disabled: !localEnabled }"
                        @click="localEnabled && updateTarget(t)">
                        <span class="selector-tooltip">{{ labelFor(t) }}</span>
                    </span>
                </div>
            </div>

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

type Target = 'pitch' | 'gain' | 'filter' | 'pan' | 'resonance'
type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'random'

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
    targets: () => ['pitch', 'gain', 'filter', 'pan', 'resonance'],
    waves: () => ['sine', 'triangle', 'sawtooth', 'square', 'random'],
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
    const s = String(w)
    return s === 'random' ? 'Rnd' : s.charAt(0).toUpperCase() + s.slice(1)
}

function waveLong(w: Wave | string): string {
    const s = String(w)
    return s === 'random' ? 'Random (Sample & Hold)' : waveLabel(s)
}

function labelFor(t: Target | string): string {
    const s = String(t)
    if (s === 'gain') return 'Amplitude'
    if (s === 'pan') return 'Pan'
    if (s === 'resonance') return 'Resonance'
    return s.charAt(0).toUpperCase() + s.slice(1)
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
    // Reset depth to avoid jumps when ranges/units change
    localDepth.value = 0
    emit('update:depth', 0)
}

const localWaveform = ref(props.waveform)
watch(() => props.waveform, v => (localWaveform.value = v))
function setWave(w: Wave) { emit('update:waveform', w) }

/* Sync default ON */
const localSync = ref(props.syncEnabled)
watch(() => props.syncEnabled, v => (localSync.value = v))
function setSync(v: boolean) { emit('update:syncEnabled', v) }

const localDivision = ref(props.division)
watch(() => props.division, v => (localDivision.value = v))
function setDivision(d: string) { emit('update:division', d) }

/* tooltip state */
const activeKnob = ref<null | 'rate' | 'depth'>(null)

/* Readouts + stepping */
const depthStep = computed(() => {
    switch (currentTarget.value) {
        case 'pitch': return 1      // cents
        case 'gain': return 1       // %
        case 'pan': return 1        // %
        case 'filter': return 10    // Hz
        case 'resonance': return 0.1 // Q
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
        case 'resonance': return `${v.toFixed(1)} Q`
        default: return String(v)
    }
})

/* --- Rate knob model: Hz (free) or index (sync) --- */
const rateMin = computed(() => localSync.value ? 0 : 0.1)
const rateMax = computed(() => localSync.value ? (props.divisions.length - 1) : 20)
const rateStep = computed(() => localSync.value ? 1 : 0.1)

const rateMarkers = computed(() => {
    if (!localSync.value) return []
    const n = props.divisions.length
    if (n <= 1) return [0.5]
    return props.divisions.map((_, i) => i / (n - 1))
})

/* index <-> division string */
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

/* Single v-model that the knob binds to */
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

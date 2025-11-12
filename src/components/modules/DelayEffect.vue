<!-- components/modules/DelayEffect.vue -->
<template>
    <KnobGroup v-model="localEnabled" :color="color" :showToggle="showToggle" :showHeader="false">
        <div class="delay-stack">
            <!-- Full-width hero tile -->
            <div class="delay-top">
                <DelayButton v-model="localEnabled" label="Delay" :style="{ '--w': '100%' }" />
            </div>

            <!-- Time / Feedback / Mix / Cutoff (LP) -->
            <div class="delay-knob-row">
                <!-- Time -->
                <div class="position-relative text-center">
                    <Knob v-if="!localSync" v-model="localTime" label="Time" :min="0.01" :max="maxSeconds" :step="0.01"
                        size="small" :color="color" :disabled="!localEnabled" @knobStart="activeKnob = 'time'"
                        @knobEnd="activeKnob = null" />
                    <Knob v-else v-model="divIndexKnob" label="Time" :min="0" :max="1" :step="knobStep" size="small"
                        :color="color" :disabled="!localEnabled" :showMarkers="true" :markers="knobMarkers"
                        :markersOnly="true" :markersOffsetDeg="-90" @knobStart="activeKnob = 'time'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'time'" class="custom-tooltip">
                        <template v-if="!localSync">{{ (localTime * 1000).toFixed(0) }} ms</template>
                        <template v-else>{{ currentDivLabel }} · {{ syncedMs.toFixed(0) }} ms</template>
                    </span>
                </div>

                <!-- Feedback -->
                <div class="position-relative text-center">
                    <Knob v-model="localFeedback" label="Feedback" :min="0" :max="0.95" :step="0.01" size="small"
                        :color="color" :disabled="!localEnabled" @knobStart="activeKnob = 'feedback'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'feedback'" class="custom-tooltip">
                        {{ Math.round(localFeedback * 100) }}%
                    </span>
                </div>

                <!-- Mix -->
                <div class="position-relative text-center">
                    <Knob v-model="localMix" label="Mix" :min="0" :max="1" :step="0.01" size="small" :color="color"
                        :disabled="!localEnabled" @knobStart="activeKnob = 'mix'" @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'mix'" class="custom-tooltip">
                        {{ Math.round(localMix * 100) }}%
                    </span>
                </div>

                <!-- Cutoff (LP, always on) -->
                <div class="position-relative text-center">
                    <Knob v-model="localToneNorm" label="Cutoff" :min="0" :max="1" :step="0.001" size="small"
                        :color="color" :disabled="!localEnabled" @knobStart="activeKnob = 'toneHz'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'toneHz'" class="custom-tooltip">
                        {{ Math.round(mappedToneHz) }} Hz
                    </span>
                </div>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'
import DelayButton from '../DelayButton.vue'

type ToneType = 'lowpass' | 'highpass'

const props = withDefaults(defineProps<{
    audioCtx?: AudioContext | null
    enabled: boolean

    delayTime?: number
    delayFeedback?: number
    delayMix?: number

    /* Tone (legacy props kept for compatibility but ignored for mode/enable) */
    toneEnabled?: boolean
    toneHz?: number
    toneType?: ToneType

    /* Sync */
    syncEnabled?: boolean
    tempo?: number
    maxSeconds?: number

    /* Musical divisions for Sync mode */
    divisions?: Array<{ label: string; steps: number }>

    /* Theme */
    color?: string
    showToggle?: boolean
}>(), {
    enabled: false,

    delayTime: 0.2,
    delayFeedback: 0.3,
    delayMix: 0.3,

    /* we will force LP enabled regardless of these */
    toneEnabled: true,
    toneHz: 5000,
    toneType: 'lowpass',

    syncEnabled: true,
    tempo: 120,
    maxSeconds: 5.0,

    divisions: () => ([
        { label: '1/64', steps: 0.25 },
        { label: '1/32T', steps: (2 / 3) * 0.5 },
        { label: '1/32', steps: 0.5 },
        { label: '1/16T', steps: (2 / 3) * 1 },
        { label: '1/16', steps: 1 },
        { label: '1/8T', steps: (2 / 3) * 2 },
        { label: '1/8', steps: 2 },
        { label: '1/8.', steps: 3 },
        { label: '1/4T', steps: (2 / 3) * 4 },
        { label: '1/4', steps: 4 },
        { label: '1/4.', steps: 6 },
        { label: '1/2T', steps: (2 / 3) * 8 }
    ]),

    color: '#00BCD4',
    showToggle: false
})

const emit = defineEmits([
    'update:enabled',
    'update:delayTime',
    'update:delayFeedback',
    'update:delayMix',
    'update:syncEnabled',
    'update:toneEnabled',
    'update:toneHz',
    'update:toneType'
])

/* ---------- LP cutoff mapping (always on) ---------- */
const LP_MIN = 400
const LP_MAX = 8000
const ln = Math.log
const mapNormToHzLP = (norm: number) => {
    const a = ln(LP_MIN), b = ln(LP_MAX)
    return Math.exp(a + Math.max(0, Math.min(1, norm)) * (b - a))
}
const mapHzToNormLP = (hz: number) => {
    const clamped = Math.max(LP_MIN, Math.min(LP_MAX, hz))
    const a = ln(LP_MIN), b = ln(LP_MAX)
    return Math.max(0, Math.min(1, (ln(clamped) - a) / (b - a)))
}

/* ---------- Locals ---------- */
const localEnabled = ref<boolean>(props.enabled)
const localTime = ref<number>(props.delayTime ?? 0.2)
const localFeedback = ref<number>(props.delayFeedback ?? 0.3)
const localMix = ref<number>(props.delayMix ?? 0.3)
const localSync = ref<boolean>(props.syncEnabled ?? true)

/* LP cutoff (normalized 0..1) */
const localToneNorm = ref<number>(
    typeof props.toneHz === 'number'
        ? mapHzToNormLP(props.toneHz)
        : 0.65
)
const mappedToneHz = computed<number>(() => mapNormToHzLP(localToneNorm.value))

const activeKnob = ref<null | 'time' | 'feedback' | 'mix' | 'toneHz'>(null)

/* ---------- Music math (Sync) ---------- */
const DIVS = computed(() => props.divisions ?? [])
const stepDuration = computed(() => 60 / (props.tempo || 120) / 4) // 1/16 note

const knobMarkers = computed(() => {
    const n = DIVS.value.length
    return n > 1 ? DIVS.value.map((_, i) => i / (n - 1)) : []
})

const defaultDivIndex = computed(() => {
    const i = DIVS.value.findIndex(d => d.label === '1/8.')
    return i >= 0 ? i : Math.min(4, Math.max(0, DIVS.value.length - 1))
})
const divIndex = ref<number>(defaultDivIndex.value)

const knobStep = computed(() => DIVS.value.length > 1 ? 1 / (DIVS.value.length - 1) : 1)
const divIndexKnob = computed<number>({
    get: () => DIVS.value.length > 1 ? (divIndex.value / (DIVS.value.length - 1)) : 0,
    set: (v: number) => {
        const idx = Math.round(v * (DIVS.value.length - 1))
        divIndex.value = Math.max(0, Math.min(DIVS.value.length - 1, idx))
    }
})

const syncedSeconds = computed<number>(() => {
    const s = DIVS.value[divIndex.value]?.steps ?? 1
    const sec = s * stepDuration.value
    return Math.min(props.maxSeconds || 5, Math.max(0.005, sec))
})
const syncedMs = computed<number>(() => syncedSeconds.value * 1000)
const currentDivLabel = computed<string>(() => DIVS.value[divIndex.value]?.label ?? '—')

/* ---------- Emits ---------- */
watch(localEnabled, v => emit('update:enabled', v))
watch(localFeedback, v => emit('update:delayFeedback', v))
watch(localMix, v => emit('update:delayMix', v))
watch(localSync, v => emit('update:syncEnabled', v), { immediate: true })

// Free time
watch(localTime, v => {
    if (!localSync.value) {
        const clamped = Math.min(props.maxSeconds || 5, Math.max(0.01, v))
        emit('update:delayTime', clamped)
    }
})

// Sync time
watch([divIndex, stepDuration, DIVS, localSync], () => {
    if (localSync.value) emit('update:delayTime', syncedSeconds.value)
}, { immediate: true })

// Always-on LP tone
watch(localToneNorm, () => {
    emit('update:toneHz', mappedToneHz.value)
})

/* ---------- Enforce LP always-on ---------- */
onMounted(() => {
    emit('update:toneEnabled', true)
    emit('update:toneType', 'lowpass')
    emit('update:toneHz', mappedToneHz.value)
})

/* ---------- Keep in sync with parent (where applicable) ---------- */
watch(() => props.enabled, v => (localEnabled.value = !!v))
watch(() => props.delayTime, v => {
    if (!localSync.value && typeof v === 'number') localTime.value = v
})
watch(() => props.delayFeedback, v => (localFeedback.value = typeof v === 'number' ? v : localFeedback.value))
watch(() => props.delayMix, v => (localMix.value = typeof v === 'number' ? v : localMix.value))
watch(() => props.syncEnabled, v => (localSync.value = typeof v === 'boolean' ? v : localSync.value))

// If parent drives toneHz, accept it but still enforce LP mode being "on"
watch(() => props.toneHz, v => {
    if (typeof v === 'number') localToneNorm.value = mapHzToNormLP(v)
})
</script>

<style scoped>
.delay-stack {
    display: flex;
    flex-direction: column;
    align-items: stretch;
}

.delay-top {
    display: flex;
    justify-content: center;
    margin: 0 0 6px;
}

/* Four knobs: even spacing, responsive */
.delay-knob-row {
    display: flex;
    gap: 16px;
    justify-content: space-evenly;
    align-items: flex-start;
    width: 100%;
    max-width: 520px;
    /* allow four knobs to breathe; shrink if needed */
    margin: 0 auto;
}

.position-relative {
    position: relative;
}

.custom-tooltip {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: -22px;
    padding: 2px 6px;
    font-size: 12px;
    line-height: 1.2;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
}
</style>

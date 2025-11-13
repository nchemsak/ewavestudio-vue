<template>
    <KnobGroup v-model="localEnabled" :color="color" :showToggle="showToggle" :showHeader="false">
        <div class="delay-pedal">
            <!-- TOP: LED + Time/Mix row + Tone row -->
            <div class="panel-top">
                <span class="check-led" :class="{ on: localEnabled }" aria-hidden="true"></span>

                <!-- TIME -->
                <div class="knob-cell time">
                    <Knob
                        v-if="!localSync"
                        v-model="localTime"
                        label="TIME"
                        :min="0.01"
                        :max="maxSeconds"
                        :step="0.01"
                        size="small"
                        :color="color"
                        :disabled="!localEnabled"
                        @knobStart="activeKnob = 'time'"
                        @knobEnd="activeKnob = null"
                    />
                    <Knob
                        v-else
                        v-model="divIndexKnob"
                        label="TIME"
                        :min="0"
                        :max="1"
                        :step="knobStep"
                        size="small"
                        :color="color"
                        :disabled="!localEnabled"
                        :showMarkers="true"
                        :markers="knobMarkers"
                        :markersOnly="true"
                        :markersOffsetDeg="-90"
                        @knobStart="activeKnob = 'time'"
                        @knobEnd="activeKnob = null"
                    />
                    <span v-if="activeKnob === 'time'" class="custom-tooltip">
                        <template v-if="!localSync">{{ (localTime * 1000).toFixed(0) }} ms</template>
                        <template v-else>{{ currentDivLabel }} · {{ syncedMs.toFixed(0) }} ms</template>
                    </span>
                </div>

                <!-- MIX -->
                <div class="knob-cell mix">
                    <Knob
                        v-model="localMix"
                        label="MIX"
                        :min="0"
                        :max="1"
                        :step="0.01"
                        size="small"
                        :color="color"
                        :disabled="!localEnabled"
                        @knobStart="activeKnob = 'mix'"
                        @knobEnd="activeKnob = null"
                    />
                    <span v-if="activeKnob === 'mix'" class="custom-tooltip">
                        {{ Math.round(localMix * 100) }}%
                    </span>
                </div>

                <!-- TONE (cutoff) -->
                <div class="knob-cell tone">
                    <Knob
                        v-model="localToneNorm"
                        label="TONE"
                        :min="0"
                        :max="1"
                        :step="0.001"
                        size="small"
                        :color="color"
                        :disabled="!localEnabled"
                        @knobStart="activeKnob = 'toneHz'"
                        @knobEnd="activeKnob = null"
                    />
                    <span v-if="activeKnob === 'toneHz'" class="custom-tooltip">
                        {{ Math.round(mappedToneHz) }} Hz
                    </span>
                </div>
            </div>

            <!-- seam -->
            <div class="panel-seam" aria-hidden="true"></div>

            <!-- bottom panel with footswitch -->
            <div class="panel-bottom">
                <button
                    class="footswitch"
                    type="button"
                    :aria-pressed="localEnabled"
                    @click="localEnabled = !localEnabled"
                    @keydown.space.prevent="localEnabled = !localEnabled"
                    @keydown.enter.prevent="localEnabled = !localEnabled"
                />
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'

type ToneType = 'lowpass' | 'highpass'

const props = withDefaults(defineProps<{
    audioCtx?: AudioContext | null
    enabled: boolean
    delayTime?: number
    delayFeedback?: number
    delayMix?: number
    toneEnabled?: boolean
    toneHz?: number
    toneType?: ToneType
    syncEnabled?: boolean
    tempo?: number
    maxSeconds?: number
    divisions?: Array<{ label: string; steps: number }>
    color?: string
    showToggle?: boolean
}>(), {
    enabled: false,
    delayTime: 0.2,
    // Fixed feedback "set amount" – tweak this to taste (0.3–0.5)
    delayFeedback: 0.35,
    delayMix: 0.3,
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

/* LP cutoff mapping */
const LP_MIN = 400, LP_MAX = 8000, ln = Math.log
const mapNormToHzLP = (n: number) => {
    const a = ln(LP_MIN), b = ln(LP_MAX)
    return Math.exp(a + Math.max(0, Math.min(1, n)) * (b - a))
}
const mapHzToNormLP = (hz: number) => {
    const clamped = Math.max(LP_MIN, Math.min(LP_MAX, hz))
    const a = ln(LP_MIN), b = ln(LP_MAX)
    return Math.max(0, Math.min(1, (ln(clamped) - a) / (b - a)))
}

/* locals */
const localEnabled = ref<boolean>(props.enabled)
const localTime = ref<number>(props.delayTime ?? 0.2)
const localFeedback = ref<number>(props.delayFeedback ?? 0.35)
const localMix = ref<number>(props.delayMix ?? 0.3)
const localSync = ref<boolean>(props.syncEnabled ?? true)

/* cutoff normalized */
const localToneNorm = ref<number>(
    typeof props.toneHz === 'number' ? mapHzToNormLP(props.toneHz) : 0.65
)
const mappedToneHz = computed(() => mapNormToHzLP(localToneNorm.value))

const activeKnob = ref<null | 'time' | 'mix' | 'toneHz'>(null)

/* sync helpers */
const DIVS = computed(() => props.divisions ?? [])
const stepDuration = computed(() => 60 / (props.tempo || 120) / 4) // 1/16

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

const syncedSeconds = computed(() => {
    const s = DIVS.value[divIndex.value]?.steps ?? 1
    return Math.min(props.maxSeconds || 5, Math.max(0.005, s * stepDuration.value))
})
const syncedMs = computed(() => syncedSeconds.value * 1000)
const currentDivLabel = computed(() => DIVS.value[divIndex.value]?.label ?? '—')

/* emits */
watch(localEnabled, v => emit('update:enabled', v))
watch(localFeedback, v => emit('update:delayFeedback', v))
watch(localMix, v => emit('update:delayMix', v))
watch(localSync, v => emit('update:syncEnabled', v), { immediate: true })

watch(localTime, v => {
    if (!localSync.value) {
        const clamped = Math.min(props.maxSeconds || 5, Math.max(0.01, v))
        emit('update:delayTime', clamped)
    }
})

watch([divIndex, stepDuration, DIVS, localSync], () => {
    if (localSync.value) emit('update:delayTime', syncedSeconds.value)
}, { immediate: true })

watch(localToneNorm, () => emit('update:toneHz', mappedToneHz.value))

onMounted(() => {
    // Ensure tone stage is always on for this pedal
    emit('update:toneEnabled', true)
    emit('update:toneType', 'lowpass')
    emit('update:toneHz', mappedToneHz.value)
    // Push the fixed feedback value into the graph
    emit('update:delayFeedback', localFeedback.value)
})

watch(() => props.enabled, v => (localEnabled.value = !!v))
watch(() => props.delayTime, v => { if (!localSync.value && typeof v === 'number') localTime.value = v })
// Keep localFeedback in sync if parent changes it, even though there's no UI knob
watch(() => props.delayFeedback, v => {
    if (typeof v === 'number') localFeedback.value = v
})
watch(() => props.delayMix, v => (localMix.value = typeof v === 'number' ? v : localMix.value))
watch(() => props.syncEnabled, v => (localSync.value = typeof v === 'boolean' ? v : localSync.value))
watch(() => props.toneHz, v => { if (typeof v === 'number') localToneNorm.value = mapHzToNormLP(v) })
</script>

<style scoped>
/* overall */
.delay-pedal {
    display: grid;
    /* Match Drive/Reverb layout: top, seam, footswitch */
    grid-template-rows: auto 8px auto;
    width: 100%;
}

/* ===== TOP PANEL (yellow) ===== */
.panel-top {
    position: relative;
    border-radius: 8px 8px 0 0;
    padding: 12px 0px 10px;
    background: linear-gradient(#f1df8f, #ebbd54);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .35),
        0 1px 0 rgba(0, 0, 0, .35);

    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto;
    grid-template-areas:
        "led   led"
        "time  mix"
        "tone  tone";
    /* row-gap: 8px; */
    align-items: center;
    justify-items: center;
}

/* LED */
.check-led {
    grid-area: led;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #7a1f19;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, .55) inset;
    margin-top: 2px;
}

.check-led.on {
    background: #e53935;
    box-shadow:
        0 0 0 1px rgba(0, 0, 0, .55) inset,
        0 0 8px 3px rgba(229, 57, 53, .6),
        0 0 18px 6px rgba(229, 57, 53, .35);
}

/* knob placements */
.time {
    grid-area: time;
}

.mix {
    grid-area: mix;
}

.tone {
    grid-area: tone;
}

.knob-cell {
    width: min-content;
    text-align: center;
    position: relative;
    justify-self: center;
}

/* tooltips */
.custom-tooltip {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: -22px;
    padding: 2px 6px;
    font-size: 12px;
    line-height: 1.2;
    background: rgba(0, 0, 0, .85);
    color: #fff;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
}

/* seam */
.panel-seam {
    height: 25px;
    border-radius: 2px;
    background: linear-gradient(#efe18a, #e1b952);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .35);
}

/* bottom panel */
.panel-bottom {
    border-radius: 8px;
    padding: 8px;
    background: linear-gradient(#f0d367, #ebbd54);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .3),
        0 1px 0 rgba(0, 0, 0, .35);
}

/* footswitch */
.footswitch {
    display: block;
    width: 100%;
    height: 96px;
    border: 0;
    border-radius: 8px;
    background: linear-gradient(#3f3c3f, #2d2b2f);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .06),
        inset 0 -10px 16px rgba(0, 0, 0, .35);
    cursor: pointer;
    position: relative;
}

.footswitch::before {
    content: "";
    position: absolute;
    inset: 8px;
    border-radius: 8px;
    box-shadow: 0 0 0 2px #caa84a inset;
    opacity: .8;
    pointer-events: none;
}

.footswitch:active {
    transform: translateY(1px);
    filter: brightness(.96);
}

/* (Optional) simple responsive behavior if needed later */
/* You can probably keep this as-is since the layout is already compact */
</style>

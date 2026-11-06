<template>
    <KnobGroup v-model="localEnabled" :color="color" :showToggle="showToggle" :showHeader="false">
        <div class="delay-pedal">
            <div class="panel-top">
                <span class="check-led" :class="{ on: localEnabled }" aria-hidden="true"></span>

                <!-- MIX -->
                <div class="knob-cell mix">
                    <Knob midi-id="delay.mix" :value-text="`${Math.round(localMix * 100)}%`" v-model="localMix" label="MIX" :min="0" :max="1" :step="0.01" size="small" :color="color"
                        :disabled="!localEnabled" @knobStart="activeKnob = 'mix'" @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'mix'" class="custom-tooltip">
                        {{ Math.round(localMix * 100) }}%
                    </span>
                </div>

                <!-- TIME (SYNCED ONLY) -->
                <div class="knob-cell time">
                    <Knob midi-id="delay.time" :value-text="`${currentDivLabel}, ${timeMs.toFixed(0)} ms`" v-model="divIndexKnob" label="TIME" :min="0" :max="1" :step="knobStep" size="small"
                        :color="color" :disabled="!localEnabled" :showMarkers="true" :markers="knobMarkers"
                        :markersOnly="true" :markersOffsetDeg="-90" @knobStart="activeKnob = 'time'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'time'" class="custom-tooltip">
                        {{ currentDivLabel }} · {{ timeMs.toFixed(0) }} ms
                    </span>
                </div>

                <!-- TONE -->
                <div class="knob-cell tone">
                    <Knob midi-id="delay.tone" :value-text="`${Math.round(mappedToneHz)} Hz`" v-model="localToneNorm" label="TONE" :min="0" :max="1" :step="0.001" size="small"
                        :color="color" :disabled="!localEnabled" @knobStart="activeKnob = 'toneHz'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'toneHz'" class="custom-tooltip">
                        {{ Math.round(mappedToneHz) }} Hz
                    </span>
                </div>
            </div>

            <div class="panel-seam" aria-hidden="true"></div>

            <div class="panel-bottom">
                <div class="effect-label">delay</div>
                <button class="footswitch" type="button" :aria-pressed="localEnabled"
                    @click="localEnabled = !localEnabled" @keydown.space.prevent="localEnabled = !localEnabled"
                    @keydown.enter.prevent="localEnabled = !localEnabled"></button>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
// The TIME knob picks a note division (v-model:division). Turning it also sets the delay time
// to that division at the current tempo; while sync is on, DrumSequencer keeps the time in
// step with the tempo and division (followDelaySync in src/lib/delaySync.ts), so the panel
// never sets the time by itself and always shows the real one.
import { ref, watch, computed, onMounted } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';
import { DELAY_DIVISIONS, DEFAULT_DELAY_DIVISION, DEFAULT_DELAY_TIME, syncedDelaySeconds } from '../../lib/delaySync';

type ToneType = 'lowpass' | 'highpass';

const props = withDefaults(
    defineProps<{
        audioCtx?: AudioContext | null;
        enabled: boolean;
        division?: string;
        delayTime?: number;
        delayFeedback?: number;
        delayMix?: number;
        toneEnabled?: boolean;
        toneHz?: number;
        toneType?: ToneType;
        tempo?: number;
        color?: string;
        showToggle?: boolean;
    }>(),
    {
        enabled: false,
        division: DEFAULT_DELAY_DIVISION,
        delayTime: DEFAULT_DELAY_TIME,
        delayFeedback: 0.35,
        delayMix: 0.3,
        toneEnabled: true,
        toneHz: 5000,
        toneType: 'lowpass',
        tempo: 120,
        color: '#00BCD4',
        showToggle: false
    }
);

const emit = defineEmits([
    'update:enabled',
    'update:division',
    'update:delayTime',
    'update:delayFeedback',
    'update:delayMix',
    'update:toneEnabled',
    'update:toneHz',
    'update:toneType'
]);

// LP cutoff mapping
const LP_MIN = 400;
const LP_MAX = 8000;
const ln = Math.log;

const mapNormToHzLP = (n: number) => {
    const a = ln(LP_MIN);
    const b = ln(LP_MAX);
    return Math.exp(a + Math.max(0, Math.min(1, n)) * (b - a));
};

const mapHzToNormLP = (hz: number) => {
    const clamped = Math.max(LP_MIN, Math.min(LP_MAX, hz));
    const a = ln(LP_MIN);
    const b = ln(LP_MAX);
    return Math.max(0, Math.min(1, (ln(clamped) - a) / (b - a)));
};

// locals
const localEnabled = ref<boolean>(props.enabled);
const localFeedback = ref<number>(props.delayFeedback ?? 0.35);
const localMix = ref<number>(props.delayMix ?? 0.3);

// cutoff normalized
const localToneNorm = ref<number>(
    typeof props.toneHz === 'number' ? mapHzToNormLP(props.toneHz) : 0.65
);
const mappedToneHz = computed(() => mapNormToHzLP(localToneNorm.value));

const activeKnob = ref<null | 'time' | 'mix' | 'toneHz'>(null);

// TIME knob: one position per division
const DIVS = DELAY_DIVISIONS;

const knobMarkers = DIVS.map((_, i) => i / (DIVS.length - 1));
const knobStep = 1 / (DIVS.length - 1);

const divIndex = computed(() => {
    const i = DIVS.findIndex((d) => d.label === props.division);
    return i >= 0 ? i : DIVS.findIndex((d) => d.label === DEFAULT_DELAY_DIVISION);
});

const divIndexKnob = computed<number>({
    get: () => divIndex.value / (DIVS.length - 1),
    set: (v: number) => {
        const idx = Math.max(0, Math.min(DIVS.length - 1, Math.round(v * (DIVS.length - 1))));
        if (idx === divIndex.value) return;
        const label = DIVS[idx].label;
        emit('update:division', label);
        emit('update:delayTime', syncedDelaySeconds(props.tempo, label));
    }
});

const timeMs = computed(() => (props.delayTime ?? 0) * 1000);
const currentDivLabel = computed(() => DIVS[divIndex.value]?.label ?? '—');

watch(localEnabled, (v) => emit('update:enabled', v));
watch(localFeedback, (v) => emit('update:delayFeedback', v));
watch(localMix, (v) => emit('update:delayMix', v));

// Only a turn of the knob sets the tone: a value from outside (a loaded project) is shown,
// not rounded or clamped back into the project
watch(localToneNorm, (n) => {
    if (typeof props.toneHz === 'number' && Math.abs(mapHzToNormLP(props.toneHz) - n) < 1e-9) return;
    emit('update:toneHz', mappedToneHz.value);
});

onMounted(() => {
    // Ensure tone stage is always on for this pedal
    emit('update:toneEnabled', true);
    emit('update:toneType', 'lowpass');
    // Push the fixed feedback value into the graph
    emit('update:delayFeedback', localFeedback.value);
});

watch(
    () => props.enabled,
    (v) => {
        localEnabled.value = !!v;
    }
);

// Keep localFeedback/localMix in sync if parent changes them
watch(
    () => props.delayFeedback,
    (v) => {
        if (typeof v === 'number') {
            localFeedback.value = v;
        }
    }
);

watch(
    () => props.delayMix,
    (v) => {
        if (typeof v === 'number') {
            localMix.value = v;
        }
    }
);

watch(
    () => props.toneHz,
    (v) => {
        if (typeof v === 'number') {
            localToneNorm.value = mapHzToNormLP(v);
        }
    }
);
</script>

<style scoped>
.delay-pedal {
    display: grid;
    grid-template-rows: auto 8px auto;
    width: 100%;
    opacity: .9;
}

.panel-top {
    position: relative;
    border-radius: 8px 8px 0 0;
    padding: 12px 0px 10px;
    background: linear-gradient(#ffc069, #ffa263);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        0 1px 0 rgba(0, 0, 0, 0.35);
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto;
    grid-template-areas:
        'led   led'
        'time  mix'
        'tone  tone';
    align-items: center;
    justify-items: center;
}

.check-led {
    grid-area: led;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #7a1f19;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55) inset;
    margin-top: 2px;
}

.check-led.on {
    background: #e53935;
    box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.55) inset,
        0 0 8px 3px rgba(229, 57, 53, 0.6),
        0 0 18px 6px rgba(229, 57, 53, 0.35);
}

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

.tone .custom-tooltip {
    top: initial;
    bottom: -18px;
}

.panel-seam {
    height: 25px;
    border-radius: 2px;
    background: linear-gradient(#ffc069, #ffa263);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.panel-bottom {
    border-radius: 8px;
    padding: 8px;
    background: linear-gradient(#ffc069, #ffa263);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.3),
        0 1px 0 rgba(0, 0, 0, 0.35);
}

.footswitch {
    display: block;
    width: 100%;
    height: 75px;
    border: 0;
    border-radius: 8px;
    background: linear-gradient(#3f3c3f, #2d2b2f);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.06),
        inset 0 -10px 16px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    position: relative;
}

.footswitch::before {
    content: '';
    position: absolute;
    inset: 8px;
    border-radius: 8px;
    box-shadow: 0 0 0 2px #2d2b2f inset;
    opacity: 0.8;
    pointer-events: none;
}

.footswitch:active {
    transform: translateY(1px);
    filter: brightness(0.96);
}

/* Custom marker colors for TIME knob */
.delay-pedal .time {
    --knob-marker: rgba(110, 40, 200, 0.85);
    --knob-marker-active: #fff176;
}

.effect-label {
    text-align: center;
    line-height: 1;
    padding-bottom: 8px;
    text-shadow: 0px 0px 8px black;
    color: white;
}


@media (max-width: 720px) {
    .delay-pedal {
        width: 50%;
    }
}
</style>

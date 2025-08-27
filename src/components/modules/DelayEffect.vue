<!-- components/modules/DelayModule.vue -->
<template>
    <KnobGroup v-model="localEnabled" title="Delay" :color="color" :showToggle="showToggle">
        <!-- Header: keep only the division readout -->
        <template #header-content>
            <div class="pt-header-tools">
                <span v-if="localSync" class="info"><i>{{ currentDivLabel }}</i></span>
            </div>
        </template>

        <!-- MODE ROW (moved out of header) -->
        <div class="mode-row">
            <div class="pt-seg pt-seg-sm" role="group" aria-label="Delay Time Mode">
                <button class="pt-seg-btn" :class="{ 'is-active': localSync }" :aria-pressed="localSync"
                    :disabled="!localEnabled" @click="localSync = true">Sync</button>
                <button class="pt-seg-btn" :class="{ 'is-active': !localSync }" :aria-pressed="!localSync"
                    :disabled="!localEnabled" @click="localSync = false">Free</button>
            </div>
        </div>

        <!-- Time -->
        <div class="position-relative text-center">
            <Knob v-if="!localSync" v-model="localTime" label="Time" :min="0.01" :max="maxSeconds" :step="0.01"
                size="small" :color="color" :disabled="!localEnabled" @knobStart="activeKnob = 'time'"
                @knobEnd="activeKnob = null" />
            <Knob v-else v-model="divIndexKnob" label="Time" :min="0" :max="1" :step="knobStep" size="small"
                :color="color" :disabled="!localEnabled" @knobStart="activeKnob = 'time'"
                @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'time'" class="custom-tooltip">
                <template v-if="!localSync">{{ (localTime * 1000).toFixed(0) }} ms</template>
                <template v-else>{{ currentDivLabel }} · {{ syncedMs.toFixed(0) }} ms</template>
            </span>
        </div>

        <!-- Feedback -->
        <div class="position-relative text-center">
            <Knob v-model="localFeedback" label="Feedback" :min="0" :max="0.95" :step="0.01" size="small" :color="color"
                :disabled="!localEnabled" @knobStart="activeKnob = 'feedback'" @knobEnd="activeKnob = null" />
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

        <!-- TONE ROW (forced onto next line) -->
        <div class="tone-row">
            <!-- Dot toggle -->
            <button class="pt-dot effect-toggle" :class="{ 'is-on': localToneEnabled }" :aria-pressed="localToneEnabled"
                :disabled="!localEnabled" :title="localToneEnabled ? 'Tone on' : 'Tone off'"
                @click="localToneEnabled = !localToneEnabled"></button>

            <!-- LP / HP -->
            <div class="pt-seg pt-seg-sm" role="group" aria-label="Tone Type">
                <button class="pt-seg-btn" :class="{ 'is-active': localToneType === 'lowpass' }"
                    :aria-pressed="localToneType === 'lowpass'" :disabled="!localEnabled || !localToneEnabled"
                    @click="localToneType = 'lowpass'">LP</button>
                <button class="pt-seg-btn" :class="{ 'is-active': localToneType === 'highpass' }"
                    :aria-pressed="localToneType === 'highpass'" :disabled="!localEnabled || !localToneEnabled"
                    @click="localToneType = 'highpass'">HP</button>
            </div>

            <!-- Cutoff knob -->
            <div class="tone-knob position-relative text-center">
                <Knob v-model="localToneHz" label="Cutoff" :min="120" :max="12000" :step="1" size="small" :color="color"
                    :disabled="!localEnabled || !localToneEnabled" @knobStart="activeKnob = 'toneHz'"
                    @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'toneHz'" class="custom-tooltip">
                    {{ Math.round(localToneHz) }} Hz
                </span>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';

type ToneType = 'lowpass' | 'highpass';

const props = withDefaults(defineProps<{
    audioCtx?: AudioContext | null;
    enabled: boolean;

    delayTime?: number;
    delayFeedback?: number;
    delayMix?: number;

    // Tone
    toneEnabled?: boolean;
    toneHz?: number;
    toneType?: ToneType;

    // Sync
    syncEnabled?: boolean;      // default: true (Sync as default)
    tempo?: number;             // BPM
    maxSeconds?: number;

    // Musical divisions for Sync mode
    divisions?: Array<{ label: string; steps: number }>;

    // Theme 
    color?: string;
    showToggle?: boolean;
}>(), {
    enabled: false,

    delayTime: 0.2,
    delayFeedback: 0.3,
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
});

const emit = defineEmits([
    'update:enabled',
    'update:delayTime',
    'update:delayFeedback',
    'update:delayMix',
    'update:syncEnabled',
    'update:toneEnabled',
    'update:toneHz',
    'update:toneType'
]);

/* Locals */
const localEnabled = ref<boolean>(props.enabled);
const localTime = ref<number>(props.delayTime ?? 0.2);
const localFeedback = ref<number>(props.delayFeedback ?? 0.3);
const localMix = ref<number>(props.delayMix ?? 0.3);
const localSync = ref<boolean>(props.syncEnabled ?? true);

const localToneEnabled = ref<boolean>(props.toneEnabled ?? true);
const localToneHz = ref<number>(props.toneHz ?? 5000);
const localToneType = ref<ToneType>(props.toneType ?? 'lowpass');

const activeKnob = ref<null | 'time' | 'feedback' | 'mix' | 'toneHz'>(null);

/* Music math */
const DIVS = computed(() => props.divisions ?? []);
const stepDuration = computed(() => 60 / (props.tempo || 120) / 4); // 1/16 note

// Index into divisions; default settings
const defaultDivIndex = computed(() => {
    const i = DIVS.value.findIndex(d => d.label === '1/8.');
    return i >= 0 ? i : Math.min(4, Math.max(0, DIVS.value.length - 1));
});
const divIndex = ref<number>(defaultDivIndex.value);

// Map 0..1 knob to index
const knobStep = computed(() => DIVS.value.length > 1 ? 1 / (DIVS.value.length - 1) : 1);
const divIndexKnob = computed<number>({
    get: () => DIVS.value.length > 1 ? (divIndex.value / (DIVS.value.length - 1)) : 0,
    set: (v: number) => {
        const idx = Math.round(v * (DIVS.value.length - 1));
        divIndex.value = Math.max(0, Math.min(DIVS.value.length - 1, idx));
    }
});

const syncedSeconds = computed<number>(() => {
    const s = DIVS.value[divIndex.value]?.steps ?? 1;
    const sec = s * stepDuration.value;
    return Math.min(props.maxSeconds || 5, Math.max(0.005, sec));
});
const syncedMs = computed<number>(() => syncedSeconds.value * 1000);
const currentDivLabel = computed<string>(() => DIVS.value[divIndex.value]?.label ?? '—');

// Emits 
watch(localEnabled, v => emit('update:enabled', v));
watch(localFeedback, v => emit('update:delayFeedback', v));
watch(localMix, v => emit('update:delayMix', v));
watch(localSync, v => emit('update:syncEnabled', v), { immediate: true });

// Free
watch(localTime, v => {
    if (!localSync.value) {
        const clamped = Math.min(props.maxSeconds || 5, Math.max(0.01, v));
        emit('update:delayTime', clamped);
    }
});

// Sync
watch([divIndex, stepDuration, DIVS, localSync], () => {
    if (localSync.value) emit('update:delayTime', syncedSeconds.value);
}, { immediate: true });

// Tone emits
watch(localToneEnabled, v => emit('update:toneEnabled', v));
watch(localToneHz, v => emit('update:toneHz', v));
watch(localToneType, v => emit('update:toneType', v));

// Keep in sync with parent
watch(() => props.enabled, v => (localEnabled.value = !!v));
watch(() => props.delayTime, v => {
    if (!localSync.value && typeof v === 'number') localTime.value = v;
});
watch(() => props.delayFeedback, v => (localFeedback.value = typeof v === 'number' ? v : localFeedback.value));
watch(() => props.delayMix, v => (localMix.value = typeof v === 'number' ? v : localMix.value));
watch(() => props.syncEnabled, v => (localSync.value = typeof v === 'boolean' ? v : localSync.value));

watch(() => props.toneEnabled, v => (localToneEnabled.value = typeof v === 'boolean' ? v : localToneEnabled.value));
watch(() => props.toneHz, v => (localToneHz.value = typeof v === 'number' ? v : localToneHz.value));
watch(() => props.toneType, v => (localToneType.value = (v as ToneType) || localToneType.value));

// When switching to Sync, snap to closest division from current time
watch(localSync, on => {
    if (on) {
        const curSec = (typeof props.delayTime === 'number') ? props.delayTime : localTime.value;
        const curSteps = curSec / stepDuration.value;
        let best = 0, bestErr = Infinity;
        DIVS.value.forEach((d, i) => {
            const err = Math.abs((d.steps ?? 1) - curSteps);
            if (err < bestErr) { bestErr = err; best = i; }
        });
        divIndex.value = best;
        emit('update:delayTime', syncedSeconds.value);
    }
});
</script>
<style scoped>
/* Small readout on the right of the header */
.info {
    font-size: 10px;
    font-style: italic;
    position: absolute;
    right: 6px;
    top: 0;
}

/* Keep header container minimal */
.pt-header-tools {
    position: relative;
    min-height: 18px;
}

/* ✅ Force these rows onto their own line no matter if the parent is GRID or FLEX */
.mode-row,
.tone-row {
    /* If parent is CSS Grid: take the whole row */
    grid-column: 1 / -1 !important;

    /* If parent is Flex: take the whole line */
    flex: 0 0 100% !important;
    width: 100%;

    /* Row layout */
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

/* Spacing */
.mode-row {
    margin-bottom: 2px;
}

.tone-row {
    margin-top: 6px;
}

/* Don’t let segment groups shrink weirdly */
.mode-row .pt-seg,
.tone-row .pt-seg {
    min-width: 0;
}

/* Tone knob block stays compact */
.tone-knob {
    flex: 0 0 auto;
}

/* Dot state polish */
.pt-dot::after {
    transition: background .2s ease, box-shadow .2s ease;
}

.pt-dot.is-on::after {
    background: hsl(var(--pt-accent) 82% 60%);
    box-shadow: 0 0 10px var(--pt-btn-glow);
}

.pt-dot.is-on {
    background: hsl(var(--pt-accent) 82% 60%);
}

.pt-dot:active {
    transform: translateY(1px) scale(0.98);
}
</style>

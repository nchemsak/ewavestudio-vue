<template>
    <KnobGroup v-model="localEnabled" title="Delay" color="#00BCD4">
        <!-- Header: Free/Sync -->
        <template #header-content>
            <div class="btn-group btn-group-sm ms-auto">
                <span v-if="localSync" class="header-info">{{ DIVS[divIndex].label }}</span>
                <button type="button" class="btn" :class="!localSync ? 'btn-primary' : 'btn-outline-primary'"
                    @click="localSync = false" :disabled="!localEnabled">
                    Free
                </button>
                <button type="button" class="btn" :class="localSync ? 'btn-primary' : 'btn-outline-primary'"
                    @click="localSync = true" :disabled="!localEnabled">
                    Sync
                </button>
            </div>
        </template>

        <!-- Time -->
        <div class="position-relative">
            <!-- Free: seconds -->
            <Knob v-if="!localSync" v-model="localTime" label="Time" :min="0.01" :max="maxSeconds" :step="0.01"
                size="small" color="#00BCD4" :disabled="!localEnabled" @knobStart="activeKnob = 'time'"
                @knobEnd="activeKnob = null" />

            <!-- Sync: snapped divisions -->
            <Knob v-else v-model="divIndexKnob" label="Time" :min="0" :max="1" :step="knobStep" size="small"
                color="#00BCD4" :disabled="!localEnabled" @knobStart="activeKnob = 'time'"
                @knobEnd="activeKnob = null" />

            <span v-if="activeKnob === 'time'" class="custom-tooltip">
                <template v-if="!localSync">
                    {{ (localTime * 1000).toFixed(0) }} ms
                </template>
                <template v-else>
                    {{ DIVS[divIndex].label }} · {{ (syncedMs).toFixed(0) }} ms
                </template>
            </span>
        </div>

        <!-- Feedback -->
        <div class="position-relative">
            <Knob v-model="localFeedback" label="Feedback" :min="0" :max="0.95" :step="0.01" size="small"
                color="#00BCD4" :disabled="!localEnabled" @knobStart="activeKnob = 'feedback'"
                @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'feedback'" class="custom-tooltip">
                {{ Math.round(localFeedback * 100) }}%
            </span>
        </div>

        <!-- Mix -->
        <div class="position-relative">
            <Knob v-model="localMix" label="Mix" :min="0" :max="1" :step="0.01" size="small" color="#00BCD4"
                :disabled="!localEnabled" @knobStart="activeKnob = 'mix'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'mix'" class="custom-tooltip">
                {{ Math.round(localMix * 100) }}%
            </span>
        </div>

        <!-- Tone -->
        <div class="d-flex align-items-center justify-content-between mb-2">
            <small class="text-muted">Tone</small>
            <div class="d-flex align-items-center gap-2">
                <!-- On/Off -->
                <div class="btn-group btn-group-sm me-2">
                    <button type="button" class="btn" :class="localToneEnabled ? 'btn-primary' : 'btn-outline-primary'"
                        @click="localToneEnabled = true" :disabled="!localEnabled">On</button>
                    <button type="button" class="btn" :class="!localToneEnabled ? 'btn-primary' : 'btn-outline-primary'"
                        @click="localToneEnabled = false" :disabled="!localEnabled">Off</button>
                </div>

                <!-- LP / HP -->
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn"
                        :class="localToneType === 'lowpass' ? 'btn-primary' : 'btn-outline-primary'"
                        @click="localToneType = 'lowpass'" :disabled="!localEnabled || !localToneEnabled">LP</button>
                    <button type="button" class="btn"
                        :class="localToneType === 'highpass' ? 'btn-primary' : 'btn-outline-primary'"
                        @click="localToneType = 'highpass'" :disabled="!localEnabled || !localToneEnabled">HP</button>
                </div>
            </div>
        </div>

        <!-- Cutoff -->
        <div class="position-relative">
            <Knob v-model="localToneHz" label="Cutoff" :min="120" :max="12000" :step="1" size="small" color="#00BCD4"
                :disabled="!localEnabled || !localToneEnabled" @knobStart="activeKnob = 'toneHz'"
                @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'toneHz'" class="custom-tooltip">
                {{ Math.round(localToneHz) }} Hz
            </span>
        </div>
    </KnobGroup>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';

const props = defineProps({
    audioCtx: Object,
    enabled: Boolean,
    delayTime: Number,
    delayFeedback: Number,
    delayMix: Number,

    // Tone
    toneEnabled: { type: Boolean, default: true },
    toneHz: { type: Number, default: 5000 },
    toneType: { type: String, default: 'lowpass' }, // 'lowpass' | 'highpass'

    // Sync
    syncEnabled: { type: Boolean, default: false },
    tempo: { type: Number, default: 120 },
    maxSeconds: { type: Number, default: 5.0 },

    // Musical divisions for Sync mode
    divisions: {
        type: Array,
        default: () => ([
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
        ])
    }
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

// Locals
const localEnabled = ref(props.enabled);
const localTime = ref(props.delayTime ?? 0.2);
const localFeedback = ref(props.delayFeedback ?? 0.3);
const localMix = ref(props.delayMix ?? 0.3);
const localSync = ref(props.syncEnabled ?? false);

const localToneEnabled = ref(props.toneEnabled);
const localToneHz = ref(props.toneHz);
const localToneType = ref(props.toneType);

const activeKnob = ref(null);

// Music math
const stepDuration = computed(() => 60 / (props.tempo || 120) / 4); // 1/16 note
const DIVS = computed(() => props.divisions);

// Sync index mapped to a 0..1 knob
const divIndex = ref(4); // default ~ 1/16
const knobStep = computed(() => DIVS.value.length > 1 ? 1 / (DIVS.value.length - 1) : 1);
const divIndexKnob = computed({
    get: () => DIVS.value.length > 1 ? (divIndex.value / (DIVS.value.length - 1)) : 0,
    set: (v) => {
        const idx = Math.round(v * (DIVS.value.length - 1));
        divIndex.value = Math.max(0, Math.min(DIVS.value.length - 1, idx));
    }
});

// Synced time (seconds/ms)
const syncedSeconds = computed(() => {
    const s = DIVS.value[divIndex.value]?.steps ?? 1;
    return Math.min(props.maxSeconds, Math.max(0.005, s * stepDuration.value));
});
const syncedMs = computed(() => syncedSeconds.value * 1000);

// Emit upstream
watch(localEnabled, v => emit('update:enabled', v));
watch(localFeedback, v => emit('update:delayFeedback', v));
watch(localMix, v => emit('update:delayMix', v));
watch(localSync, v => emit('update:syncEnabled', v));

// Free: emit raw seconds
watch(localTime, v => { if (!localSync.value) emit('update:delayTime', Math.min(props.maxSeconds, v)); });

// Sync: emit computed seconds on changes
watch([divIndex, stepDuration, DIVS, localSync], () => {
    if (localSync.value) emit('update:delayTime', syncedSeconds.value);
});

// Tone emits
watch(localToneEnabled, v => emit('update:toneEnabled', v));
watch(localToneHz, v => emit('update:toneHz', v));
watch(localToneType, v => emit('update:toneType', v));

// Keep locals in sync with parent
watch(() => props.enabled, v => (localEnabled.value = v));
watch(() => props.delayTime, v => { if (!localSync.value && typeof v === 'number') localTime.value = v; });
watch(() => props.delayFeedback, v => (localFeedback.value = v));
watch(() => props.delayMix, v => (localMix.value = v));
watch(() => props.syncEnabled, v => (localSync.value = v));

watch(() => props.toneEnabled, v => (localToneEnabled.value = v));
watch(() => props.toneHz, v => (localToneHz.value = v));
watch(() => props.toneType, v => (localToneType.value = v));

// When switching to Sync, pick closest division
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

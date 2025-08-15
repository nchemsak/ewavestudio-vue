<template>
    <KnobGroup v-model="localEnabled" title="Delay" color="#00BCD4">
        <!-- Mode toggle -->
        <div class="d-flex align-items-center justify-content-between mb-2">
            <small class="text-muted">Mode</small>
            <div class="btn-group btn-group-sm">
                <button type="button" class="btn" :class="!localSync ? 'btn-primary' : 'btn-outline-primary'"
                    @click="localSync = false" :disabled="!localEnabled">
                    Free
                </button>
                <button type="button" class="btn" :class="localSync ? 'btn-primary' : 'btn-outline-primary'"
                    @click="localSync = true" :disabled="!localEnabled">
                    Sync
                </button>
            </div>
        </div>

        <!-- Time -->
        <div class="position-relative">
            <!-- Free: seconds -->
            <Knob v-if="!localSync" v-model="localTime" label="Time" :min="0.01" :max="maxSeconds" :step="0.01"
                size="small" color="#00BCD4" :disabled="!localEnabled" @knobStart="activeKnob = 'time'"
                @knobEnd="activeKnob = null" />

            <!-- Sync: snapped musical divisions -->
            <Knob v-else v-model="divIndexKnob" label="Time (Sync)" :min="0" :max="1" :step="knobStep" size="small"
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

        <div class="position-relative">
            <Knob v-model="localFeedback" label="Feedback" :min="0" :max="0.95" :step="0.01" size="small"
                color="#00BCD4" :disabled="!localEnabled" @knobStart="activeKnob = 'feedback'"
                @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'feedback'" class="custom-tooltip">
                {{ Math.round(localFeedback * 100) }}%
            </span>
        </div>

        <div class="position-relative">
            <Knob v-model="localMix" label="Mix" :min="0" :max="1" :step="0.01" size="small" color="#00BCD4"
                :disabled="!localEnabled" @knobStart="activeKnob = 'mix'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'mix'" class="custom-tooltip">
                {{ Math.round(localMix * 100) }}%
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

    // NEW
    syncEnabled: { type: Boolean, default: false },
    tempo: { type: Number, default: 120 },
    // Max allowed seconds (match your createDelay(5.0))
    maxSeconds: { type: Number, default: 5.0 },

    /**
     * Optional custom divisions. If omitted, we use a rich default pack.
     * Each item: { label: string, steps: number }
     * (1 step = 1/16 note in your grid)
     */
    divisions: {
        type: Array,
        default: () => ([
            { label: '1/64', steps: 0.25 },
            { label: '1/32T', steps: (2 / 3) * 0.5 },
            { label: '1/32', steps: 0.5 },
            { label: '1/16T', steps: (2 / 3) * 1 },
            { label: '1/16', steps: 1 },
            { label: '1/8T', steps: (2 / 3) * 2 }
            // { label: '1/8', steps: 2 },
            // { label: '1/8.', steps: 3 },      // dotted 1/8 = 3 steps
            // { label: '1/4T', steps: (2 / 3) * 4 },
            // { label: '1/4', steps: 4 },
            // { label: '1/4.', steps: 6 },      // dotted 1/4 = 6 steps
            // { label: '1/2T', steps: (2 / 3) * 8 },
            // { label: '1/2', steps: 8 },
            // { label: '1/2.', steps: 12 },     // dotted 1/2 = 12 steps
            // { label: '1', steps: 16 }      // whole note = full bar (16 steps)
            // You can add { label:'2', steps:32 } for 2 bars; stays clamped by maxSeconds.
        ])
    }
});

const emit = defineEmits([
    'update:enabled',
    'update:delayTime',
    'update:delayFeedback',
    'update:delayMix',
    'update:syncEnabled'
]);

// Local mirrors
const localEnabled = ref(props.enabled);
const localTime = ref(props.delayTime ?? 0.2);
const localFeedback = ref(props.delayFeedback ?? 0.3);
const localMix = ref(props.delayMix ?? 0.3);
const localSync = ref(props.syncEnabled ?? false);
const activeKnob = ref(null);

// Music math
const stepDuration = computed(() => 60 / (props.tempo || 120) / 4); // 1/16 note
const DIVS = computed(() => props.divisions);

// Snap control via a 0..1 knob that maps to 0..N-1 indices
const divIndex = ref(4); // default to 1/16 (index of '1/16' in defaults)
const knobStep = computed(() => DIVS.value.length > 1 ? 1 / (DIVS.value.length - 1) : 1);
const divIndexKnob = computed({
    get: () => DIVS.value.length > 1 ? (divIndex.value / (DIVS.value.length - 1)) : 0,
    set: (v) => {
        const idx = Math.round(v * (DIVS.value.length - 1));
        divIndex.value = Math.max(0, Math.min(DIVS.value.length - 1, idx));
    }
});

// Convert the selected division to seconds, clamped to device max
const syncedSeconds = computed(() => {
    const s = DIVS.value[divIndex.value]?.steps ?? 1;
    return Math.min(props.maxSeconds, Math.max(0.005, s * stepDuration.value));
});
const syncedMs = computed(() => syncedSeconds.value * 1000);

// Upstream updates
watch(localEnabled, v => emit('update:enabled', v));
watch(localFeedback, v => emit('update:delayFeedback', v));
watch(localMix, v => emit('update:delayMix', v));
watch(localSync, v => emit('update:syncEnabled', v));

// Free: emit raw seconds
watch(localTime, v => { if (!localSync.value) emit('update:delayTime', Math.min(props.maxSeconds, v)); });

// Sync: emit computed seconds whenever division or tempo changes
watch([divIndex, stepDuration, DIVS, localSync], () => {
    if (localSync.value) emit('update:delayTime', syncedSeconds.value);
});

// Keep locals in sync with parent
watch(() => props.enabled, v => (localEnabled.value = v));
watch(() => props.delayTime, v => { if (!localSync.value && typeof v === 'number') localTime.value = v; });
watch(() => props.delayFeedback, v => (localFeedback.value = v));
watch(() => props.delayMix, v => (localMix.value = v));
watch(() => props.syncEnabled, v => (localSync.value = v));

// When switching to Sync, pick the closest division to current time
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

<!-- components/LFOGroup.vue -->
<template>
    <KnobGroup v-model="localEnabled" title="LFO" :color="color" :showToggle="showToggle">
        <!-- Header tools: target dots + wave + sync/division -->
        <template #header-content>
            <div class="pt-header-tools lfo-header">
                <!-- Targets (existing dots) -->
                <div class="lfo-target-selector" role="group" aria-label="LFO Target">
                    <span v-for="t in targets" :key="t" class="lfo-type-dot"
                        :class="{ selected: currentTarget === t, disabled: !localEnabled }"
                        @click="localEnabled && updateTarget(t)">
                        <span class="selector-tooltip">{{ labelFor(t) }}</span>
                    </span>
                </div>

                <!-- Wave shape segmented -->
                <div class="pt-seg pt-seg-sm" role="group" aria-label="LFO Wave" :class="{ disabled: !localEnabled }">
                    <button v-for="w in waves" :key="w" class="pt-seg-btn" :class="{ 'is-active': localWaveform === w }"
                        :aria-pressed="localWaveform === w" :disabled="!localEnabled" @click="setWave(w)">
                        {{ waveLabel(w) }}
                        <span class="selector-tooltip">{{ waveLong(w) }}</span>
                    </button>
                </div>

                <!-- Sync segmented -->
                <div class="pt-seg pt-seg-sm" role="group" aria-label="LFO Rate Mode"
                    :class="{ disabled: !localEnabled }">
                    <button class="pt-seg-btn" :class="{ 'is-active': !localSync }" :disabled="!localEnabled"
                        @click="setSync(false)">
                        Free
                    </button>
                    <button class="pt-seg-btn" :class="{ 'is-active': localSync }" :disabled="!localEnabled"
                        @click="setSync(true)">
                        Sync
                    </button>
                </div>

                <!-- Divisions (when synced) -->
                <!-- <div v-if="localSync" class="pt-seg pt-seg-sm" role="group" aria-label="LFO Division"
                    :class="{ disabled: !localEnabled }">
                    <button v-for="d in divisions" :key="d" class="pt-seg-btn"
                        :class="{ 'is-active': localDivision === d }" :disabled="!localEnabled" @click="setDivision(d)">
                        {{ d }}
                    </button>
                </div> -->
            </div>
        </template>

        <!-- Knobs row (under header) -->
        <div class="pt-knob-row">
            <!-- Rate (Hz) ... disabled when Sync is on -->
            <!-- <div class="position-relative text-center">
                <Knob v-model="localRate" size="medium" :min="0.1" :max="20" :step="0.1" label="Rate" :color="color"
                    :disabled="!localEnabled || localSync" @knobStart="activeKnob = 'rate'"
                    @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'rate'" class="custom-tooltip">
                    {{ localRate.toFixed(1) }} Hz
                </span>
            </div> -->
            <!-- Rate knob: free Hz OR stepped divisions when Sync is on -->
            <div class="position-relative text-center">
                <Knob v-model="rateKnobModel" size="medium" :min="rateMin" :max="rateMax" :step="rateStep" label="Rate"
                    :color="color" :disabled="!localEnabled" :showMarkers="localSync" :markers="rateMarkers"
                    :markersOnly="localSync" :markersOffsetDeg="-90" @knobStart="activeKnob = 'rate'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'rate'" class="custom-tooltip">
                    <!-- Tooltip adapts by mode -->
                    <template v-if="localSync">
                        {{ localDivision }}
                    </template>
                    <template v-else>
                        {{ Number(localRate).toFixed(1) }} Hz
                    </template>
                </span>
            </div>


            <!-- Depth -->
            <div class="position-relative text-center">
                <Knob v-model="localDepth" size="medium" :min="0" :max="depthMax" :step="depthStep" label="Depth"
                    :color="color" :disabled="!localEnabled" @knobStart="activeKnob = 'depth'"
                    @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'depth'" class="custom-tooltip">
                    {{ depthReadout }}
                </span>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';

type Target = 'pitch' | 'gain' | 'filter' | 'pan' | 'resonance';
type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'random';

const props = withDefaults(defineProps<{
    /* v-model for enabled */
    modelValue: boolean;

    /* v-models for params */
    rate: number;           // Hz (free)
    depth: number;          // units depend on target (see depthReadout)
    target: Target;         // modulation destination
    waveform?: Wave;        // waveshape
    syncEnabled?: boolean;  // free or tempo-synced
    division?: string;      // e.g., '1/4', '1/8T', '1/8.' (dotted)

    /* misc */
    depthMax?: number;
    color?: string;
    targets?: Target[];
    waves?: Wave[];
    divisions?: string[];
    showToggle?: boolean;
}>(), {
    modelValue: false,
    rate: 2,
    depth: 0,
    target: 'gain',
    waveform: 'sine',
    syncEnabled: false,
    division: '1/8',
    depthMax: 100,
    color: '#00BCD4',
    targets: () => ['pitch', 'gain', 'filter', 'pan', 'resonance'],
    waves: () => ['sine', 'triangle', 'sawtooth', 'square', 'random'],
    divisions: () => ['1/1', '1/2', '1/4', '1/8', '1/16', '1/8T', '1/8.'],
    showToggle: false
});

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
    (e: 'update:rate', v: number): void;
    (e: 'update:depth', v: number): void;
    (e: 'update:target', v: Target): void;
    (e: 'update:waveform', v: Wave): void;
    (e: 'update:syncEnabled', v: boolean): void;
    (e: 'update:division', v: string): void;
}>();

/* locals (snappy knobs) */
const localEnabled = ref(props.modelValue);
watch(() => props.modelValue, v => (localEnabled.value = v));
watch(localEnabled, v => emit('update:modelValue', v));

const localRate = ref(props.rate);
watch(() => props.rate, v => (localRate.value = v));
watch(localRate, v => emit('update:rate', v));

const localDepth = ref(props.depth);
watch(() => props.depth, v => (localDepth.value = v));
watch(localDepth, v => emit('update:depth', v));

const currentTarget = computed(() => props.target);
// const updateTarget = (t: Target) => emit('update:target', t);
const updateTarget = (t: Target) => {
    emit('update:target', t);
    // Reset depth to avoid jumps when ranges/units change
    localDepth.value = 0;
    emit('update:depth', 0);
};

const localWaveform = ref(props.waveform);
watch(() => props.waveform, v => (localWaveform.value = v));
function setWave(w: Wave) { emit('update:waveform', w); }

const localSync = ref(props.syncEnabled);
watch(() => props.syncEnabled, v => (localSync.value = v));
function setSync(v: boolean) { emit('update:syncEnabled', v); }

const localDivision = ref(props.division);
watch(() => props.division, v => (localDivision.value = v));
function setDivision(d: string) { emit('update:division', d); }

/* tooltip state */
const activeKnob = ref<null | 'rate' | 'depth'>(null);

/* Readouts + stepping */
const depthStep = computed(() => {
    switch (currentTarget.value) {
        case 'pitch': return 1;     // cents
        case 'gain': return 1;      // %
        case 'pan': return 1;       // %
        case 'filter': return 10;   // Hz
        case 'resonance': return 0.1; // Q
        default: return 1;
    }
});

const depthReadout = computed(() => {
    const v = localDepth.value;
    switch (currentTarget.value) {
        case 'pitch': return `${Math.round(v)} cents`;
        case 'gain': return `${Math.round(v)}%`;
        case 'pan': return `${Math.round(v)}%`;
        case 'filter': return `${Math.round(v)} Hz`;
        case 'resonance': return `${v.toFixed(1)} Q`;
        default: return String(v);
    }
});

const labelFor = (t: string) => {
    if (t === 'gain') return 'Amplitude';
    if (t === 'pan') return 'Pan';
    if (t === 'resonance') return 'Resonance';
    return t.charAt(0).toUpperCase() + t.slice(1);
};
const waveLabel = (w: Wave) => w === 'random' ? 'Rnd' : w[0].toUpperCase() + w.slice(1);
const waveLong = (w: Wave) => w === 'random' ? 'Random (Sample & Hold)' : waveLabel(w);


//rate knob
/* --- Rate knob model: Hz (free) or index (sync) --- */
const rateMin = computed(() => localSync.value ? 0 : 0.1);
const rateMax = computed(() => localSync.value ? (props.divisions.length - 1) : 20);
const rateStep = computed(() => localSync.value ? 1 : 0.1);

const rateMarkers = computed(() => {
    if (!localSync.value) return [];
    const n = props.divisions.length;
    if (n <= 1) return [0.5];
    return props.divisions.map((_, i) => i / (n - 1));
});

/* index <-> division string */
const divisionIndex = computed({
    get() {
        const idx = props.divisions.indexOf(localDivision.value);
        return Math.max(0, idx);
    },
    set(v: number) {
        const n = props.divisions.length;
        const i = Math.min(n - 1, Math.max(0, Math.round(v)));
        const d = props.divisions[i] || props.divisions[0];
        setDivision(d); // emits update:division
    }
});

/* Single v-model that the knob binds to */
const rateKnobModel = computed({
    get() {
        return localSync.value ? divisionIndex.value : localRate.value;
    },
    set(v: number) {
        if (localSync.value) divisionIndex.value = v;
        else localRate.value = v; // emits update:rate via watch(localRate)
    }
});


</script>

<style scoped>
.lfo-header {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
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

<template>
    <div class="pt-subblock">
        <div class="pt-knob-row">
            <!-- Cutoff -->
            <div class="position-relative text-center">
                <Knob midi-id="filter.cutoff" :value-text="`${Math.round(localCutoff)} Hz`" v-model="localCutoff" label="Cutoff" size="small" :min="minCutoff" :max="maxCutoff"
                    :step="cutoffStep" :disabled="!localEnabled" :color="color"
                    :modValue="lfoView?.cutoff ?? null" :modRange="lfoView?.cutoffRange ?? null"
                    @knobStart="onKnobStart('cutoff')" @knobEnd="onKnobEnd" />
                <span v-if="activeKnob === 'cutoff'" class="custom-tooltip">
                    {{ Math.round(localCutoff) }} Hz
                </span>
            </div>

            <!-- Resonance -->
            <div class="position-relative text-center">
                <Knob midi-id="filter.resonance" :value-text="`Q ${localResonance.toFixed(1)}`" v-model="localResonance" label="Resonance" size="small" :min="minResonance" :max="maxResonance"
                    :step="resonanceStep" :disabled="!localEnabled" :color="color" @knobStart="onKnobStart('res')"
                    @knobEnd="onKnobEnd" />
                <span v-if="activeKnob === 'res'" class="custom-tooltip">
                    Q: {{ localResonance.toFixed(1) }}
                </span>
            </div>

            <!-- Filter envelope: how far the cutoff jumps at each note (octaves, either way), and
                 how fast it comes back -->
            <div class="position-relative text-center">
                <Knob midi-id="filter.envAmount" v-model="envAmountModel" bipolar label="Env Amt" size="small" :min="-ENV_OCTAVES" :max="ENV_OCTAVES"
                    :step="0.1" :value-text="envAmountText" :disabled="!localEnabled" :color="color"
                    @knobStart="onKnobStart('envAmt')" @knobEnd="onKnobEnd" />
                <span v-if="activeKnob === 'envAmt'" class="custom-tooltip">{{ envAmountTip }}</span>
            </div>

            <div class="position-relative text-center">
                <Knob midi-id="filter.envDecay" v-model="envDecayModel" label="Decay" size="small" :min="5" :max="2000" :step="1" taper="log"
                    :value-text="`${Math.round(envDecayMs)} ms`" :disabled="!localEnabled" :color="color"
                    @knobStart="onKnobStart('envDecay')" @knobEnd="onKnobEnd" />
                <span v-if="activeKnob === 'envDecay'" class="custom-tooltip">{{ Math.round(envDecayMs) }} ms</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Knob from '../Knob.vue';
import type { LfoView } from '../../lib/lfoVisual';

const props = withDefaults(
    defineProps<{
        enabled: boolean;
        cutoff: number;
        resonance: number;
        envAmount?: number; // octaves, −ENV_OCTAVES..+ENV_OCTAVES (0: off)
        envDecayMs?: number;
        title?: string;
        color?: string;
        showToggle?: boolean;
        minCutoff?: number;
        maxCutoff?: number;
        cutoffStep?: number;
        minResonance?: number;
        maxResonance?: number;
        resonanceStep?: number;
        // The LFO visualizer: when the LFO moves the cutoff, a dot on the Cutoff knob shows where
        // it has it now, over an arc for its whole swing (the knob itself stays where it's set)
        lfoView?: LfoView | null;
    }>(),
    {
        title: 'Filter',
        color: '#FF5722',
        showToggle: false,
        minCutoff: 100,
        maxCutoff: 10000,
        cutoffStep: 1,
        minResonance: 0.1,
        maxResonance: 20,
        resonanceStep: 0.1
    }
);

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void;
    (e: 'update:cutoff', v: number): void;
    (e: 'update:resonance', v: number): void;
    (e: 'update:envAmount', v: number): void;
    (e: 'update:envDecayMs', v: number): void;
    // A knob is being turned (drag or keys) / let go: the screen shows the filter meanwhile
    (e: 'knob-start'): void;
    (e: 'knob-end'): void;
}>();

const localEnabled = ref<boolean>(props.enabled);
const localCutoff = ref<number>(props.cutoff ?? 5000);
const localResonance = ref<number>(props.resonance ?? 0.5);

watch(
    () => props.enabled,
    (v) => {
        localEnabled.value = v;
    }
);

watch(
    () => props.cutoff,
    (v) => {
        localCutoff.value = v ?? 5000;
    }
);

watch(
    () => props.resonance,
    (v) => {
        localResonance.value = v ?? 0.5;
    }
);

watch(localEnabled, (v) => emit('update:enabled', v));

watch(localCutoff, (v) => {
    const clamped = Math.max(props.minCutoff, Math.min(props.maxCutoff, Math.round(v)));
    emit('update:cutoff', clamped);
});

watch(localResonance, (v) => {
    const clamped = Math.max(props.minResonance, Math.min(props.maxResonance, +v));
    emit('update:resonance', clamped);
});

const activeKnob = ref<null | 'cutoff' | 'res' | 'envAmt' | 'envDecay'>(null);

const ENV_OCTAVES = 5;
const envAmount = computed(() => props.envAmount ?? 0);
const envDecayMs = computed(() => props.envDecayMs ?? 200);
const envAmountModel = computed<number>({
    get: () => envAmount.value,
    set: (v) => emit('update:envAmount', Math.round(Math.max(-ENV_OCTAVES, Math.min(ENV_OCTAVES, v)) * 10) / 10),
});
const envDecayModel = computed<number>({
    get: () => envDecayMs.value,
    set: (v) => emit('update:envDecayMs', Math.max(5, Math.min(2000, Math.round(v)))),
});
const envAmountTip = computed(() => {
    const a = envAmount.value;
    if (a === 0) return 'Off';
    return `${a > 0 ? '+' : '−'}${Math.abs(a).toFixed(1)} oct, ${a > 0 ? 'closes' : 'opens'}`;
});
const envAmountText = computed(() => {
    const a = envAmount.value;
    if (a === 0) return 'off';
    return a > 0
        ? `cutoff starts ${a.toFixed(1)} octaves higher and closes`
        : `cutoff starts ${Math.abs(a).toFixed(1)} octaves lower and opens`;
});

function onKnobStart(which: 'cutoff' | 'res' | 'envAmt' | 'envDecay') {
    activeKnob.value = which;
    emit('knob-start');
}
function onKnobEnd() {
    activeKnob.value = null;
    emit('knob-end');
}
</script>

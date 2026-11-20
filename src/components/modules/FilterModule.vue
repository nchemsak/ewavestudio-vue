<!-- components/modules/FilterModule.vue -->
<!-- The Filter card (PR 77): a screen that draws the filter's response and can be dragged (the
     point sideways for Cutoff, up and down for Resonance; ShapePad.vue), dashed where the
     filter's envelope starts each note, with a mini knob for each of the four settings and
     the VEL switch (the `tools` slot) beside it. `classic` is the card as it was, four knobs,
     which the phone's Sound page keeps (inside its own SectionWrap). -->
<template>
    <div v-if="classic" class="pt-subblock">
        <div class="pt-knob-row">
            <!-- Cutoff -->
            <div class="position-relative text-center">
                <Knob :value-text="`${Math.round(localCutoff)} Hz`" v-model="localCutoff" label="Cutoff" size="small" :min="minCutoff" :max="maxCutoff"
                    :step="cutoffStep" :disabled="!localEnabled" :color="color"
                    :modValue="lfoView?.cutoff ?? null" :modRange="lfoView?.cutoffRange ?? null"
                    @knobStart="onKnobStart('cutoff')" @knobEnd="onKnobEnd" />
                <span v-if="activeKnob === 'cutoff'" class="custom-tooltip">
                    {{ Math.round(localCutoff) }} Hz
                </span>
            </div>

            <!-- Resonance -->
            <div class="position-relative text-center">
                <Knob :value-text="`Q ${localResonance.toFixed(1)}`" v-model="localResonance" label="Resonance" size="small" :min="minResonance" :max="maxResonance"
                    :step="resonanceStep" :disabled="!localEnabled" :color="color" @knobStart="onKnobStart('res')"
                    @knobEnd="onKnobEnd" />
                <span v-if="activeKnob === 'res'" class="custom-tooltip">
                    Q: {{ localResonance.toFixed(1) }}
                </span>
            </div>

            <!-- A hairline between the filter and its envelope -->
            <div class="filter-divider" aria-hidden="true"></div>

            <!-- Filter envelope: how far the cutoff jumps at each note (octaves, either way), and
                 how fast it comes back -->
            <div class="position-relative text-center">
                <Knob v-model="envAmountModel" bipolar label="Env Amt" size="small" :min="-ENV_OCTAVES" :max="ENV_OCTAVES"
                    :step="0.1" :value-text="envAmountText" :disabled="!localEnabled" :color="color"
                    @knobStart="onKnobStart('envAmt')" @knobEnd="onKnobEnd" />
                <span v-if="activeKnob === 'envAmt'" class="custom-tooltip">{{ envAmountTip }}</span>
            </div>

            <div class="position-relative text-center">
                <Knob v-model="envDecayModel" label="Decay" size="small" :min="5" :max="2000" :step="1" taper="log"
                    :value-text="`${Math.round(envDecayMs)} ms`" :disabled="!localEnabled" :color="color"
                    @knobStart="onKnobStart('envDecay')" @knobEnd="onKnobEnd" />
                <span v-if="activeKnob === 'envDecay'" class="custom-tooltip">{{ Math.round(envDecayMs) }} ms</span>
            </div>
        </div>
    </div>

    <section v-else class="pt-card sp-card filter-card" aria-label="Filter">
        <div class="sp-body">
            <ShapePad :w="PAD_W" :h="PAD_H" title="Filter" :readout="`${Math.round(localCutoff)} Hz · Q ${localResonance.toFixed(1)}`"
                :handles="handles" active="cutoff" :disabled="!localEnabled" @start="onKnobStart('cutoff')" @move="onPadMove" @end="onKnobEnd">
                <!-- The live spectrum, faint, on the same axis (PR 108: the big screen's Spectrum) -->
                <template v-if="spectrum" #under><canvas ref="underEl" class="sp-under filter-spectrum"></canvas></template>
                <!-- The LFO's swing of the cutoff, and where it has it now -->
                <rect v-if="lfoSpan" :x="lfoSpan[0]" y="0" :width="lfoSpan[1] - lfoSpan[0]" :height="PAD_H" class="sp-lfo-range" />
                <path v-if="ghost" :d="ghost" class="sp-ghost" />
                <path :d="shape" class="sp-line sp-fill" />
                <line v-if="lfoX !== null" :x1="lfoX" :x2="lfoX" y1="0" :y2="PAD_H" class="sp-lfo" />
            </ShapePad>
            <div class="sp-minis four">
                <div class="sp-mini">
                    <Knob midi-id="filter.cutoff" :value-text="`${Math.round(localCutoff)} Hz`" v-model="localCutoff" label="Cutoff" hideLabel size="mini" :min="minCutoff" :max="maxCutoff"
                        :step="cutoffStep" :disabled="!localEnabled" :color="color"
                        :modValue="lfoView?.cutoff ?? null" :modRange="lfoView?.cutoffRange ?? null"
                        @knobStart="onKnobStart('cutoff')" @knobEnd="onKnobEnd" />
                    <span>Cutoff</span>
                </div>
                <div class="sp-mini">
                    <Knob midi-id="filter.resonance" :value-text="`Q ${localResonance.toFixed(1)}`" v-model="localResonance" label="Resonance" hideLabel size="mini" :min="minResonance" :max="maxResonance"
                        :step="resonanceStep" :disabled="!localEnabled" :color="color" @knobStart="onKnobStart('res')"
                        @knobEnd="onKnobEnd" />
                    <span>Reso</span>
                </div>
                <!-- The filter's envelope: how far the cutoff jumps at each note (octaves, either
                     way), and how fast it comes back; the dashed curve on the screen -->
                <div class="sp-mini">
                    <Knob midi-id="filter.envAmount" v-model="envAmountModel" bipolar label="Env Amt" hideLabel size="mini" :min="-ENV_OCTAVES" :max="ENV_OCTAVES"
                        :step="0.1" :value-text="envAmountText" :disabled="!localEnabled" :color="color"
                        @knobStart="onKnobStart('envAmt')" @knobEnd="onKnobEnd" />
                    <span>Env Amt</span>
                    <span v-if="activeKnob === 'envAmt'" class="custom-tooltip">{{ envAmountTip }}</span>
                </div>
                <div class="sp-mini">
                    <Knob midi-id="filter.envDecay" v-model="envDecayModel" label="Decay" hideLabel size="mini" :min="5" :max="2000" :step="1" taper="log"
                        :value-text="`${Math.round(envDecayMs)} ms`" :disabled="!localEnabled" :color="color"
                        @knobStart="onKnobStart('envDecay')" @knobEnd="onKnobEnd" />
                    <span>Decay</span>
                    <span v-if="activeKnob === 'envDecay'" class="custom-tooltip">{{ Math.round(envDecayMs) }} ms</span>
                </div>
                <!-- The VEL switch (DrumSequencer's) -->
                <div class="sp-wide"><slot name="tools" /></div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import { startSpectrumUnderlay, type ViewSource } from '../cardViews';
import Knob from '../Knob.vue';
import type { LfoView } from '../../lib/lfoVisual';
import ShapePad, { type PadPoint } from '../ShapePad.vue';
import { filterPts, filterY, freqX, toPath, xFreq, yResonance } from '../../lib/shapeViews';

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
        classic?: boolean;
        // What sounds, drawn behind the curve (cardViews.ts); none on the phone's classic card
        spectrum?: ViewSource | null;
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
        resonanceStep: 0.1,
        classic: false
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

// The screen: the response curve (closed along the bottom, so it can be filled), dashed where
// the envelope starts each note's cutoff, and one grip at the cutoff
// The spectrum behind the curve: its own loop, which rests while nothing sounds
const underEl = ref<HTMLCanvasElement | null>(null);
let stopUnder: (() => void) | null = null;
onMounted(() => { if (underEl.value && props.spectrum) stopUnder = startSpectrumUnderlay(underEl.value, props.spectrum); });
onBeforeUnmount(() => stopUnder?.());

const PAD_W = 250;
const PAD_H = 88;
const shape = computed(() => toPath([[0, PAD_H + 4], ...filterPts(localCutoff.value, localResonance.value, PAD_W, PAD_H), [PAD_W, PAD_H + 4]]));
const ghost = computed(() => {
    if (Math.abs(envAmount.value) < 0.05) return '';
    return toPath(filterPts(Math.min(20000, Math.max(20, localCutoff.value * Math.pow(2, envAmount.value))), localResonance.value, PAD_W, PAD_H));
});
const handles = computed(() => [
    { id: 'cutoff', x: freqX(localCutoff.value, PAD_W), y: filterY(localCutoff.value, localCutoff.value, localResonance.value, PAD_H) },
]);
function onPadMove(p: PadPoint) {
    localCutoff.value = Math.round(Math.max(props.minCutoff, Math.min(props.maxCutoff, xFreq(p.x, PAD_W))));
    localResonance.value = Math.round(yResonance(p.y, PAD_H, props.minResonance, props.maxResonance) * 10) / 10;
}
// The LFO on the cutoff (the visualizer's view): its swing as a band, where it is now as a line
const lfoSpan = computed(() => {
    const r = props.lfoView?.cutoffRange;
    return r && localEnabled.value ? [freqX(r[0], PAD_W), freqX(r[1], PAD_W)] : null;
});
const lfoX = computed(() => (props.lfoView?.cutoff != null && localEnabled.value ? freqX(props.lfoView.cutoff, PAD_W) : null));
</script>

<style scoped>
.filter-divider {
    align-self: stretch;
    width: 1px;
    margin: 4px 0;
    background: var(--pt-hairline);
}
</style>

<!-- components/modules/FMModule.vue -->
<!-- The FM card (PR 77): a ribbon down its left edge is its name and switch (as Noise's and the
     LFO's); a screen draws the carrier bent by the modulator and can be dragged up and down
     for Amount (ShapePad.vue); the ratio's four choices are keys under the screen; Mod Freq
     (for Free) and Amount are mini knobs on the right. Until PR 77: a tile, a row of ratio
     buttons and two knobs. The phone's Sound page has it `compact` (PR 106): no screen. -->
<template>
    <section class="pt-card sp-unit fm-unit" :class="{ 'is-off': !localEnabled, 'sp-compact': compact }" aria-label="FM">
        <div class="sp-body">
            <button type="button" class="sp-ribbon" :class="{ 'is-on': localEnabled }" role="switch" :aria-checked="localEnabled" aria-label="FM"
                :title="localEnabled ? 'FM: on' : 'FM: off'" @click="localEnabled = !localEnabled">
                <span class="sp-ribbon-led" aria-hidden="true"></span>
                <span class="sp-ribbon-label">FM</span>
            </button>
            <div class="sp-face">
                <div class="sp-screencol">
                    <ShapePad v-if="!compact" :w="PAD_W" :h="PAD_H" :title="ratioName" :readout="readout" hint="↕ amount" :touchGrip="fmGrip" :disabled="!localEnabled"
                        @start="activeKnob = 'ix'" @move="onPadMove" @end="activeKnob = null">
                        <path :d="wave" class="sp-line" />
                        <!-- The LFO on Amount: the wave as it has it now -->
                        <path v-if="lfoWave" :d="lfoWave" class="sp-lfo" />
                    </ShapePad>
                    <div class="sp-keys" role="group" aria-label="FM Ratio Presets">
                        <button v-for="r in RATIOS" :key="r.name" type="button" class="sp-key" :class="{ on: localRatio === r.value }"
                            :aria-pressed="localRatio === r.value" :title="r.tip" @click="setRatio(r.value)">{{ r.name }}</button>
                    </div>
                </div>
                <div class="sp-minis">
                    <div class="sp-mini" :class="{ 'is-disabled': modFreqDisabled }">
                        <Knob midi-id="fm.modFreq" :value-text="`${displayHz} Hz`" v-model="localModFreqCtrl" label="Mod Freq" hideLabel size="mini" :min="0" :max="CTRL_MAX" :step="1"
                            :disabled="modFreqDisabled" :color="color" @knobStart="activeKnob = 'mf'"
                            @knobEnd="activeKnob = null" />
                        <span>Freq</span>
                        <span v-if="activeKnob === 'mf'" class="custom-tooltip">{{ displayHz }} Hz</span>
                    </div>
                    <div class="sp-mini">
                        <Knob midi-id="fm.amount" :value-text="localIndex.toFixed(1)" v-model="localIndex" label="Amount" hideLabel size="mini" :min="0" :max="50" :step="0.1" :color="color"
                            :modValue="lfoView?.fmAmount ?? null" :modRange="lfoView?.fmAmountRange ?? null"
                            @knobStart="activeKnob = 'ix'" @knobEnd="activeKnob = null" />
                        <span>Amount</span>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Knob from '../Knob.vue';
import ShapePad, { type PadPoint } from '../ShapePad.vue';
import { fmPts, toPath } from '../../lib/shapeViews';
import type { LfoView } from '../../lib/lfoVisual';

type Ratio = number | null;

const props = withDefaults(
    defineProps<{
        enabled: boolean;
        modFreq: number;
        index: number;
        ratio: Ratio;
        title?: string;
        color?: string;
        showToggle?: boolean;
        // The LFO visualizer: where the LFO's FM target has the Amount now (src/lib/lfoVisual.ts)
        lfoView?: LfoView | null;
        // Phone mode's Sound page (PR 106): the ribbon, the keys and the mini knobs, no screen
        compact?: boolean;
    }>(),
    {
        title: 'FM',
        color: '#3F51B5',
        showToggle: false
    }
);

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void;
    (e: 'update:modFreq', v: number): void;
    (e: 'update:index', v: number): void;
    (e: 'update:ratio', v: Ratio): void;
}>();

const MF_MIN = 1;
const MF_MAX = 5000;
const CTRL_MAX = 1000;
const SKEW = 0.55;

function ctrlToHz(ctrl: number): number {
    const t = Math.max(0, Math.min(1, ctrl / CTRL_MAX));
    const n = Math.pow(t, SKEW);
    const hz = MF_MIN * Math.pow(MF_MAX / MF_MIN, n);
    return Math.max(MF_MIN, Math.min(MF_MAX, hz));
}

function hzToCtrl(hz: number): number {
    const clamped = Math.max(MF_MIN, Math.min(MF_MAX, hz));
    const n = Math.log(clamped / MF_MIN) / Math.log(MF_MAX / MF_MIN);
    const t = Math.pow(n, 1 / SKEW);
    return Math.round(t * CTRL_MAX);
}

const localEnabled = ref<boolean>(props.enabled);
const localIndex = ref<number>(props.index ?? 4.0);
const localRatio = ref<Ratio>(props.ratio ?? null);

const initialHz =
    props.ratio === null && (props.modFreq === undefined || props.modFreq === null)
        ? MF_MIN
        : props.modFreq ?? 200;

const localModFreqCtrl = ref<number>(hzToCtrl(initialHz));

const displayHz = computed(() => {
    const hz = ctrlToHz(localModFreqCtrl.value);
    return Math.round(hz);
});

// sync down (props → local)
watch(
    () => props.enabled,
    (v) => {
        localEnabled.value = v;
    }
);

watch(
    () => props.index,
    (v) => {
        localIndex.value = v ?? 4.0;
    }
);

watch(
    () => props.ratio,
    (v) => {
        localRatio.value = v ?? null;
    }
);

watch(
    () => props.modFreq,
    (v) => {
        const hz = v ?? 200;
        localModFreqCtrl.value = hzToCtrl(hz);
    }
);

// emit up (local → parent)
watch(localEnabled, (v) => emit('update:enabled', v));

watch(localIndex, (v) =>
    emit('update:index', Math.max(0, Math.min(50, +v)))
);

watch(localModFreqCtrl, (v) => {
    const hz = Math.round(ctrlToHz(v));
    emit('update:modFreq', hz);
});

function setRatio(r: Ratio): void {
    const prev = localRatio.value;
    localRatio.value = r;
    emit('update:ratio', r);

    if (r === null && prev !== null) {
        localModFreqCtrl.value = hzToCtrl(MF_MIN);
        emit('update:modFreq', MF_MIN);
    }
}

const modFreqDisabled = computed(() => localRatio.value !== null);
const activeKnob = ref<null | 'mf' | 'ix'>(null);

// The ratio's keys
const RATIOS: { value: Ratio; name: string; tip: string }[] = [
    { value: 1, name: 'Lock', tip: '1:1 Sync' }, { value: 1.5, name: 'Metal', tip: '3:2 Fifth' },
    { value: 2, name: 'Bell', tip: '2:1 Octave' }, { value: null, name: 'Free', tip: 'Any frequency, in Hz (the Freq knob)' },
];
const ratioName = computed(() => RATIOS.find((r) => r.value === localRatio.value)?.name ?? 'Free');

// The screen: two cycles of the carrier, bent by the modulator. A free modulator's ratio is
// drawn against A3 (220 Hz), the pads' default note. A plain sine while FM is off.
const PAD_W = 200;
const PAD_H = 60;
const drawnRatio = computed(() => localRatio.value ?? Math.max(0.25, displayHz.value / 220));
const wave = computed(() => toPath(fmPts(drawnRatio.value, localEnabled.value ? localIndex.value : 0, PAD_W, PAD_H)));
const lfoWave = computed(() => {
    const now = props.lfoView?.fmAmount;
    return now != null && localEnabled.value ? toPath(fmPts(drawnRatio.value, now, PAD_W, PAD_H)) : '';
});
const readout = computed(() => `${localRatio.value === null ? `${displayHz.value} Hz` : RATIOS.find((r) => r.value === localRatio.value)?.tip.split(' ')[0] ?? ''} · ${localIndex.value.toFixed(1)}`);
// Where a finger takes hold on a touch screen: Amount's height (onPadMove's inverse)
const fmGrip = computed(() => ({ x: PAD_W / 2, y: (1 - localIndex.value / 50) * PAD_H }));
function onPadMove(p: PadPoint) {
    localIndex.value = Math.round(Math.max(0, Math.min(1, 1 - p.y / PAD_H)) * 500) / 10;
}
</script>

<style scoped>
/* Mod Freq only does something with Free (only its mini knob: the screen's root has an
   is-disabled of its own while FM is off, which this dimmed to 0.55 until PR 93) */
.sp-mini.is-disabled {
    opacity: 0.55;
}
</style>

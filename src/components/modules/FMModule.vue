<!-- components/modules/FMModule.vue -->
<template>
    <KnobGroup class="pitch-col" v-model="localEnabled" :showHeader="false">
        <div class="pt-stack">
            <div class="fm-top">
                <FmTowerButton v-model="localEnabled" label="FM" />
            </div>

            <!-- Ratio preset buttons -->
            <div class="pt-seg pt-seg-sm pt-seg-row" role="group" aria-label="FM Ratio Presets">
                <button class="pt-seg-btn" :class="{ 'is-active': localRatio === 1 }" :aria-pressed="localRatio === 1"
                    :disabled="!localEnabled" @click="setRatio(1)">
                    Lock <span class="selector-tooltip">1:1 Sync</span>
                </button>
                <button class="pt-seg-btn" :class="{ 'is-active': localRatio === 1.5 }"
                    :aria-pressed="localRatio === 1.5" :disabled="!localEnabled" @click="setRatio(1.5)">
                    Metal <span class="selector-tooltip">3:2 Fifth</span>
                </button>
                <button class="pt-seg-btn" :class="{ 'is-active': localRatio === 2 }" :aria-pressed="localRatio === 2"
                    :disabled="!localEnabled" @click="setRatio(2)">
                    Bell <span class="selector-tooltip">2:1 Octave</span>
                </button>
                <button class="pt-seg-btn" :class="{ 'is-active': localRatio === null }"
                    :aria-pressed="localRatio === null" :disabled="!localEnabled" @click="setRatio(null)">
                    Free <span class="selector-tooltip">Hz</span>
                </button>
            </div>

            <!-- Knobs -->
            <div class="pt-knob-row">
                <div class="position-relative text-center" :class="{ 'is-disabled': modFreqDisabled }" aria-disabled="true">
                    <!-- NOTE: v-model binds to control space [0..CTRL_MAX]; value is mapped to Hz under the hood -->
                    <Knob
                        v-model="localModFreqCtrl"
                        label="Mod Freq"
                        size="small"
                        :min="0"
                        :max="CTRL_MAX"
                        :step="1"
                        :disabled="modFreqDisabled"
                        :color="color"
                        @knobStart="activeKnob = 'mf'"
                        @knobEnd="activeKnob = null"
                    />
                    <span v-if="activeKnob === 'mf'" class="custom-tooltip">{{ displayHz }} Hz</span>
                </div>

                <div class="position-relative text-center">
                    <Knob v-model="localIndex" label="Amount" size="small" :min="0" :max="50" :step="0.1"
                        :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'ix'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'ix'" class="custom-tooltip">{{ localIndex.toFixed(1) }}</span>
                </div>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'
import FmTowerButton from '../FmTowerButton.vue'

type Ratio = number | null

const props = withDefaults(defineProps<{
    enabled: boolean
    modFreq: number
    index: number
    ratio: Ratio
    title?: string
    color?: string
    showToggle?: boolean
}>(), {
    title: 'FM',
    color: '#3F51B5',
    showToggle: false
})

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void
    (e: 'update:modFreq', v: number): void
    (e: 'update:index', v: number): void
    (e: 'update:ratio', v: Ratio): void
}>()

/* ====== Mapping constants (log-skewed control → Hz) ====== */
const MF_MIN = 1;
const MF_MAX = 5000;
const CTRL_MAX = 1000;              // internal control resolution
const SKEW = 0.55;                  // <1 = more resolution down low (t^SKEW)

/* Helpers */
function ctrlToHz(ctrl: number): number {
    const t = Math.max(0, Math.min(1, ctrl / CTRL_MAX));
    const n = Math.pow(t, SKEW); // skew toward low end
    const hz = MF_MIN * Math.pow(MF_MAX / MF_MIN, n);
    return Math.max(MF_MIN, Math.min(MF_MAX, hz));
}
function hzToCtrl(hz: number): number {
    const clamped = Math.max(MF_MIN, Math.min(MF_MAX, hz));
    const n = Math.log(clamped / MF_MIN) / Math.log(MF_MAX / MF_MIN);
    const t = Math.pow(n, 1 / SKEW);
    return Math.round(t * CTRL_MAX);
}

/* local mirrors */
const localEnabled = ref(props.enabled);
const localIndex = ref(props.index ?? 4.0);
const localRatio = ref<Ratio>(props.ratio ?? null);

/* Control-space knob value for Mod Freq */
const initialHz = (props.ratio === null && (props.modFreq === undefined || props.modFreq === null))
    ? MF_MIN
    : (props.modFreq ?? 200);
const localModFreqCtrl = ref(hzToCtrl(initialHz));

/* Derived display Hz for tooltip/readout */
const displayHz = computed(() => {
    const hz = ctrlToHz(localModFreqCtrl.value);
    // Round to integers; shows 1, 2, 3… cleanly in the low region
    return Math.round(hz);
});

/* sync down (props → local) */
watch(() => props.enabled, v => (localEnabled.value = v));
watch(() => props.index, v => (localIndex.value = v ?? 4.0));
watch(() => props.ratio, v => (localRatio.value = v ?? null));
watch(() => props.modFreq, v => {
    // keep control in sync with external modFreq changes
    const hz = v ?? 200;
    localModFreqCtrl.value = hzToCtrl(hz);
});

/* emit up (local → parent) */
watch(localEnabled, v => emit('update:enabled', v));
watch(localIndex, v => emit('update:index', Math.max(0, Math.min(50, +v))));
watch(localModFreqCtrl, v => {
    // Emit rounded Hz so you can nail 2 Hz, 3 Hz, etc.
    const hz = Math.round(ctrlToHz(v));
    emit('update:modFreq', hz);
});

/* ratio changes */
function setRatio(r: Ratio) {
    const prev = localRatio.value;
    localRatio.value = r;
    emit('update:ratio', r);

    // When entering Free from a ratio preset, set default to 1 Hz
    if (r === null && prev !== null) {
        localModFreqCtrl.value = hzToCtrl(MF_MIN);     // control → 1 Hz
        emit('update:modFreq', MF_MIN);
    }
}

const modFreqDisabled = computed(() => !localEnabled.value || localRatio.value !== null);

/* knob tooltip state */
const activeKnob = ref<null | 'mf' | 'ix'>(null);

/* expose constants used in template bindings */
</script>

<style scoped>
.pt-seg-row {
    margin-top: .25rem;
    margin-bottom: .5rem;
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
}

.pt-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
}

.pt-knob-row {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
}

.fm-top {
    display: flex;
    justify-content: center;
    align-items: center;
}

.is-disabled :deep(.knob-label) {
    color: #9aa0a6;
    opacity: .7;
}

.is-disabled :deep(.knob-readout),
.is-disabled :deep(.knob-value) {
    color: #9aa0a6;
    opacity: .6;
}
</style>

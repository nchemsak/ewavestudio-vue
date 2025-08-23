<!-- components/LFOGroup.vue -->
<template>
    <KnobGroup v-model="localEnabled" title="LFO" :color="color" :showToggle="showToggle">
        <!-- Header: keep your dot selector -->
        <template #header-content>
            <div class="pt-header-tools">
                <div class="lfo-target-selector" role="group" aria-label="LFO Target">
                    <span v-for="t in targets" :key="t" class="lfo-type-dot"
                        :class="{ selected: currentTarget === t, disabled: !localEnabled }"
                        @click="localEnabled && updateTarget(t)">
                        <span class="selector-tooltip">{{ labelFor(t) }}</span>
                    </span>
                </div>
            </div>
        </template>

        <!-- Knobs row -->
        <div class="pt-knob-row">
            <!-- Rate -->
            <div class="position-relative text-center">
                <Knob v-model="localRate" size="medium" :min="0.1" :max="20" :step="0.1" label="Rate" :color="color"
                    :disabled="!localEnabled" @knobStart="activeKnob = 'rate'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'rate'" class="custom-tooltip">
                    {{ localRate.toFixed(1) }} Hz
                </span>
            </div>

            <!-- Depth -->
            <div class="position-relative text-center">
                <Knob v-model="localDepth" size="medium" :min="0" :max="depthMax" :step="1" label="Depth" :color="color"
                    :disabled="!localEnabled" @knobStart="activeKnob = 'depth'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'depth'" class="custom-tooltip">
                    {{ localDepth }}
                </span>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';

const props = withDefaults(defineProps<{
    /* v-model for enabled */
    modelValue: boolean;

    /* v-models for params */
    rate: number;
    depth: number;
    target: string;

    /* misc */
    depthMax?: number;
    color?: string;
    targets?: string[];
    showToggle?: boolean;
}>(), {
    modelValue: false,
    rate: 2,
    depth: 0,
    target: 'gain',
    depthMax: 100,
    color: '#00BCD4',
    targets: () => ['pitch', 'gain', 'filter'],
    showToggle: false
});

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
    (e: 'update:rate', v: number): void;
    (e: 'update:depth', v: number): void;
    (e: 'update:target', v: string): void;
}>();

/* locals that mirror props (snappy knobs) */
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
const updateTarget = (t: string) => emit('update:target', t);

/* tooltip state */
const activeKnob = ref<null | 'rate' | 'depth'>(null);

const labelFor = (t: string) => (t === 'gain' ? 'Amplitude' : t.charAt(0).toUpperCase() + t.slice(1));
</script>

<style scoped>
/* keep header dots tidy without Bootstrap helpers */
.lfo-target-selector {
    display: flex;
    gap: 8px;
    margin-left: 8px;
    align-items: center;
}
</style>

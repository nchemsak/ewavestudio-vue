<!-- components/LFOGroup.vue -->
<template>
    <KnobGroup v-model="localEnabled" title="LFO" :color="color">
        <!-- Header selector (reuses your styles) -->
        <template #header-content>
            <div class="lfo-target-selector d-flex justify-content-center gap-2 ms-2">
                <span v-for="t in targets" :key="t" class="lfo-type-dot"
                    :class="{ selected: currentTarget === t, disabled: !localEnabled }"
                    @click="localEnabled && updateTarget(t)">
                    <span class="selector-tooltip">{{ labelFor(t) }}</span>
                </span>
            </div>
        </template>

        <!-- Rate -->
        <div class="position-relative">
            <Knob v-model="localRate" size="medium" :min="0.1" :max="20" :step="0.1" label="Rate" :color="color"
                :disabled="!localEnabled" @knobStart="activeKnob = 'rate'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'rate'" class="custom-tooltip">
                {{ localRate.toFixed(1) }} Hz
            </span>
        </div>

        <!-- Depth -->
        <div class="position-relative">
            <Knob v-model="localDepth" size="medium" :min="0" :max="depthMax" :step="1" label="Depth" :color="color"
                :disabled="!localEnabled" @knobStart="activeKnob = 'depth'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'depth'" class="custom-tooltip">
                {{ localDepth }}
            </span>
        </div>
    </KnobGroup>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'

const props = defineProps({
    /* v-model for enabled */
    modelValue: { type: Boolean, default: false },

    /* v-models for params */
    rate: { type: Number, default: 2 },
    depth: { type: Number, default: 0 },
    target: { type: String, default: 'gain' },

    /* misc */
    depthMax: { type: Number, default: 100 },
    color: { type: String, default: '#00BCD4' },
    targets: { type: Array, default: () => ['pitch', 'gain', 'filter'] },
})

const emit = defineEmits([
    'update:modelValue',
    'update:rate',
    'update:depth',
    'update:target',
])

/* locals that mirror props (so knobs stay controlled but feel snappy) */
const localEnabled = ref(props.modelValue)
watch(() => props.modelValue, v => (localEnabled.value = v))
watch(localEnabled, v => emit('update:modelValue', v))

const localRate = ref(props.rate)
watch(() => props.rate, v => (localRate.value = v))
watch(localRate, v => emit('update:rate', v))

const localDepth = ref(props.depth)
watch(() => props.depth, v => (localDepth.value = v))
watch(localDepth, v => emit('update:depth', v))

const currentTarget = computed(() => props.target)
const updateTarget = t => emit('update:target', t)

const activeKnob = ref(null)

const labelFor = t => (t === 'gain' ? 'Amplitude' : t.charAt(0).toUpperCase() + t.slice(1))
</script>
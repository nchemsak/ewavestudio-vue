<template>
    <KnobGroup v-model="localEnabled" title="Delay" color="#00BCD4">
        <div class="position-relative">
            <Knob v-model="localTime" label="Time" :min="0.01" :max="1" :step="0.01" size="small" color="#00BCD4"
                :disabled="!localEnabled" @knobStart="activeKnob = 'time'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'time'" class="custom-tooltip">
                {{ (localTime * 1000).toFixed(0) }} ms
            </span>
        </div>

        <div class="position-relative">
            <Knob v-model="localFeedback" label="Feedback" :min="0" :max="0.95" :step="0.01" size="small"
                :disabled="!localEnabled" color="#00BCD4" @knobStart="activeKnob = 'feedback'"
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
import { ref, watch, onMounted } from 'vue';
import Knob from './Knob.vue';
import KnobGroup from './KnobGroup.vue';

const props = defineProps({
    audioCtx: Object,
    enabled: Boolean,
    delayTime: Number,
    delayFeedback: Number,
    delayMix: Number
});

const emit = defineEmits(['update:enabled', 'update:delayTime', 'update:delayFeedback', 'update:delayMix']);

// Local state mirrors props for internal control
const localEnabled = ref(props.enabled);
const localTime = ref(props.delayTime ?? 0.2);
const localFeedback = ref(props.delayFeedback ?? 0.3);
const localMix = ref(props.delayMix ?? 0.3);
const activeKnob = ref(null);

// Emit changes upward
watch(localEnabled, val => emit('update:enabled', val));
watch(localTime, val => emit('update:delayTime', val));
watch(localFeedback, val => emit('update:delayFeedback', val));
watch(localMix, val => emit('update:delayMix', val));

</script>

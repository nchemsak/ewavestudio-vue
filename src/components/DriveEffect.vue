<template>
    <KnobGroup v-model="localEnabled" title="Drive" color="#FF4081">
        <template #header-content>
            <div class="drive-type-dot-wrap d-flex justify-content-center gap-2 ms-2">
                <!-- <span v-for="type in driveTypes" :key="type" class="drive-dot"
                    :class="{ selected: localDriveType === type }" @click="localDriveType = type">
                    <span class="selector-tooltip">
                        {{ type.charAt(0).toUpperCase() + type.slice(1) }}
                    </span>
                </span> -->
                <span v-for="type in driveTypes" :key="type" class="drive-dot"
                    :class="{ selected: localDriveType === type, disabled: !localEnabled }"
                    @click="localEnabled && (localDriveType = type)">
                    <span class="selector-tooltip">
                        {{ type.charAt(0).toUpperCase() + type.slice(1) }}
                    </span>
                </span>
            </div>

        </template>

        <!-- Drive Amount -->
        <div class="position-relative text-center">
            <Knob v-model="localAmount" label="Amount" :min="0" :max="1" :step="0.01" size="small" color="#FF4081" :disabled="!localEnabled"
                @knobStart="activeKnob = 'amount'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'amount'" class="custom-tooltip">
                {{ Math.round(localAmount * 100) }}%
            </span>
        </div>

        <!-- Drive Tone -->
        <div class="position-relative text-center">
            <Knob v-model="localTone" label="Tone" :min="100" :max="10000" :step="10" size="small" color="#FF4081" :disabled="!localEnabled"
                @knobStart="activeKnob = 'tone'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'tone'" class="custom-tooltip">
                {{ Math.round(localTone) }} Hz
            </span>
        </div>

        <!-- Mix -->
        <div class="position-relative text-center">
            <Knob v-model="localMix" label="Mix" :min="0" :max="1" :step="0.01" size="small" color="#FF4081" :disabled="!localEnabled"
                @knobStart="activeKnob = 'mix'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'mix'" class="custom-tooltip">
                {{ Math.round(localMix * 100) }}%
            </span>
        </div>
    </KnobGroup>
</template>

<script setup>
import { ref, watch } from 'vue';
import Knob from './Knob.vue';
import KnobGroup from './KnobGroup.vue';

const props = defineProps({
    enabled: Boolean,
    driveType: String,
    driveAmount: Number,
    driveTone: Number,
    driveMix: Number
});

const emit = defineEmits([
    'update:enabled',
    'update:driveType',
    'update:driveAmount',
    'update:driveTone',
    'update:driveMix'
]);

const driveTypes = ['overdrive', 'distortion'];

const localEnabled = ref(props.enabled);
const localDriveType = ref(props.driveType ?? 'overdrive');
const localAmount = ref(props.driveAmount ?? 0.4);
const localTone = ref(props.driveTone ?? 5000);
const localMix = ref(props.driveMix ?? 0.5);
const activeKnob = ref(null);

watch(localEnabled, val => emit('update:enabled', val));
watch(localDriveType, val => emit('update:driveType', val));
watch(localAmount, val => emit('update:driveAmount', val));
watch(localTone, val => emit('update:driveTone', val));
watch(localMix, val => emit('update:driveMix', val));

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
</script>

<style scoped>
.drive-dot.selected {
    background: #FF4081;
}
</style>

<!-- components/modules/DriveEffect.vue -->
<template>
    <KnobGroup v-model="localEnabled" title="Drive" :color="color" :showToggle="showToggle">
        <!-- Header: keep your dot selectors -->
        <template #header-content>
            <div class="pt-header-tools">
                <div class="drive-type-selector" role="group" aria-label="Drive Type">
                    <span v-for="type in driveTypes" :key="type" class="drive-dot"
                        :class="{ selected: localDriveType === type, disabled: !localEnabled }"
                        @click="localEnabled && (localDriveType = type)">
                        <span class="selector-tooltip">{{ capitalize(type) }}</span>
                    </span>
                </div>
            </div>
        </template>

        <!-- Knobs on a single themed row -->
        <div class="pt-knob-row">
            <!-- Amount -->
            <div class="position-relative text-center">
                <Knob v-model="localAmount" label="Amount" :min="0" :max="1" :step="0.01" size="small" :color="color"
                    :disabled="!localEnabled" @knobStart="activeKnob = 'amount'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'amount'" class="custom-tooltip">
                    {{ Math.round(localAmount * 100) }}%
                </span>
            </div>

            <!-- Tone -->
            <div class="position-relative text-center">
                <Knob v-model="localTone" label="Tone" :min="100" :max="10000" :step="10" size="small" :color="color"
                    :disabled="!localEnabled" @knobStart="activeKnob = 'tone'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'tone'" class="custom-tooltip">
                    {{ Math.round(localTone) }} Hz
                </span>
            </div>

            <!-- Mix -->
            <div class="position-relative text-center">
                <Knob v-model="localMix" label="Mix" :min="0" :max="1" :step="0.01" size="small" :color="color"
                    :disabled="!localEnabled" @knobStart="activeKnob = 'mix'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'mix'" class="custom-tooltip">
                    {{ Math.round(localMix * 100) }}%
                </span>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';

type DriveType = 'overdrive' | 'distortion' | string;

const props = withDefaults(defineProps < {
    enabled: boolean;
    driveType?: DriveType;
    driveAmount?: number;
    driveTone?: number;
    driveMix?: number;
    color?: string;
    showToggle?: boolean;
} > (), {
    driveType: 'overdrive',
    driveAmount: 0.4,
    driveTone: 5000,
    driveMix: 0.5,
    color: '#FF4081',
    showToggle: true
});

const emit = defineEmits < {
  (e: 'update:enabled', v: boolean): void;
(e: 'update:driveType', v: DriveType): void;
(e: 'update:driveAmount', v: number): void;
(e: 'update:driveTone', v: number): void;
(e: 'update:driveMix', v: number): void;
}> ();

const driveTypes: DriveType[] = ['overdrive', 'distortion'];

const localEnabled = ref < boolean > (props.enabled);
const localDriveType = ref < DriveType > (props.driveType ?? 'overdrive');
const localAmount = ref < number > (props.driveAmount ?? 0.4);
const localTone = ref < number > (props.driveTone ?? 5000);
const localMix = ref < number > (props.driveMix ?? 0.5);
const activeKnob = ref < null | 'amount' | 'tone' | 'mix' > (null);

/* emit upward */
watch(localEnabled, v => emit('update:enabled', v));
watch(localDriveType, v => emit('update:driveType', v));
watch(localAmount, v => emit('update:driveAmount', Math.max(0, Math.min(1, v))));
watch(localTone, v => emit('update:driveTone', Math.max(100, Math.min(10000, v))));
watch(localMix, v => emit('update:driveMix', Math.max(0, Math.min(1, v))));

/* keep in sync if parent updates */
watch(() => props.enabled, v => (localEnabled.value = v));
watch(() => props.driveType, v => (localDriveType.value = v ?? localDriveType.value));
watch(() => props.driveAmount, v => (localAmount.value = typeof v === 'number' ? v : localAmount.value));
watch(() => props.driveTone, v => (localTone.value = typeof v === 'number' ? v : localTone.value));
watch(() => props.driveMix, v => (localMix.value = typeof v === 'number' ? v : localMix.value));

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

<style scoped>
/* tidy header dots without Bootstrap helpers */
.drive-type-selector {
    display: flex;
    gap: 8px;
    margin-left: 8px;
    align-items: center;
}

/* (Optional) let the selected dot take the Drive color; keeps your dot visuals */
.drive-dot.selected {
    background: #FF4081;
    /* or use your theme accent if you prefer */
    box-shadow: 0 0 6px #FF4081;
}
</style>

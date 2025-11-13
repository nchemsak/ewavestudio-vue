<template>
    <KnobGroup v-model="localEnabled" title="Drive" :color="color" :showToggle="showToggle" :showHeader="false">
        <div class="drive-pedal">

            <div class="panel-top">
                <span class="check-led" :class="{ on: localEnabled }" aria-hidden="true"></span>

                <div class="knob-cell level">
                    <Knob v-model="localMix" label="LEVEL" :min="0" :max="1" :step="0.01" size="small" :color="color"
                        :disabled="!localEnabled" @knobStart="activeKnob = 'mix'" @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'mix'" class="custom-tooltip">
                        {{ Math.round(localMix * 100) }}%
                    </span>
                </div>
 
                <div class="knob-cell drive">
                    <Knob v-model="localAmount" label="DRIVE" :min="0" :max="1" :step="0.01" size="small" :color="color"
                        :disabled="!localEnabled" @knobStart="activeKnob = 'amount'" @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'amount'" class="custom-tooltip">
                        {{ Math.round(localAmount * 100) }}%
                    </span>
                </div>

                <div class="knob-cell tone">
                    <Knob v-model="localTone" label="TONE" :min="100" :max="10000" :step="10" size="small"
                        :color="color" :disabled="!localEnabled" @knobStart="activeKnob = 'tone'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'tone'" class="custom-tooltip">
                        {{ Math.round(localTone) }} Hz
                    </span>
                </div>
            </div>

            <div class="panel-seam" aria-hidden="true"></div>

            <div class="panel-bottom">
                <button class="footswitch" type="button" :aria-pressed="localEnabled"
                    @click="localEnabled = !localEnabled" @keydown.space.prevent="localEnabled = !localEnabled"
                    @keydown.enter.prevent="localEnabled = !localEnabled" />
            </div>
        </div>
    </KnobGroup>
</template>


<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';

type DriveType = 'overdrive' | string;

const props = withDefaults(defineProps<{
    enabled: boolean;
    driveType?: DriveType;
    driveAmount?: number;
    driveTone?: number;
    driveMix?: number;
    color?: string;
    showToggle?: boolean;
}>(), {
    driveType: 'overdrive',
    driveAmount: 0.4,
    driveTone: 5000,
    driveMix: 0.5,
    color: '#FF4081',
    showToggle: true
});

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void;
    (e: 'update:driveType', v: DriveType): void;
    (e: 'update:driveAmount', v: number): void;
    (e: 'update:driveTone', v: number): void;
    (e: 'update:driveMix', v: number): void;
}>();

const localEnabled = ref<boolean>(props.enabled);
const localDriveType = ref<DriveType>('overdrive');

const localAmount = ref<number>(props.driveAmount ?? 0.4);
const localTone = ref<number>(props.driveTone ?? 5000);
const localMix = ref<number>(props.driveMix ?? 0.5);

const activeKnob = ref<null | 'amount' | 'tone' | 'mix'>(null);

onMounted(() => {
    if (props.driveType !== 'overdrive') {
        localDriveType.value = 'overdrive';
        emit('update:driveType', 'overdrive');
    }
});

watch(() => props.driveType, (v) => {
    if (v !== 'overdrive') {
        localDriveType.value = 'overdrive';
        emit('update:driveType', 'overdrive');
    }
});

/* Emits */
watch(localEnabled, v => emit('update:enabled', v));
watch(localDriveType, v => {
    if (v !== 'overdrive') {
        localDriveType.value = 'overdrive';
        emit('update:driveType', 'overdrive');
    } else {
        emit('update:driveType', v);
    }
});
watch(localAmount, v => emit('update:driveAmount', Math.max(0, Math.min(1, v))));
watch(localTone, v => emit('update:driveTone', Math.max(100, Math.min(10000, v))));
watch(localMix, v => emit('update:driveMix', Math.max(0, Math.min(1, v))));

watch(() => props.enabled, v => (localEnabled.value = v));
watch(() => props.driveAmount, v => (localAmount.value = typeof v === 'number' ? v : localAmount.value));
watch(() => props.driveTone, v => (localTone.value = typeof v === 'number' ? v : localTone.value));
watch(() => props.driveMix, v => (localMix.value = typeof v === 'number' ? v : localMix.value));
</script>
<style scoped>
.drive-pedal {
    display: grid;
    grid-template-rows: auto 8px auto;
    width: 100%;
}

.panel-top {
    position: relative;
    border-radius: 8px 8px 0px 0px;
    padding: 12px 0px 10px;
    background: linear-gradient(#f1df8f, #ebbd54);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .35),
        0 1px 0 rgba(0, 0, 0, .35);
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto;
    grid-template-areas:
        "led  led"
        "level drive"
        "tone  tone";
    align-items: center;
    justify-items: center;
}

.check-led {
    grid-area: led;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #7a1f19;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, .55) inset;
    margin-top: 2px;
}

.check-led.on {
    background: #e53935;
    box-shadow:
        0 0 0 1px rgba(0, 0, 0, .55) inset,
        0 0 8px 3px rgba(229, 57, 53, .6),
        0 0 18px 6px rgba(229, 57, 53, .35);
}

.level {
    grid-area: level;
}



.drive {
    grid-area: drive;
}

.tone {
    grid-area: tone;
}

.knob-cell {
    width: min-content;
    text-align: center;
    position: relative;
    justify-self: center;
}

.custom-tooltip {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: -22px;
    padding: 2px 6px;
    font-size: 12px;
    line-height: 1.2;
    background: rgba(0, 0, 0, .85);
    color: #fff;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
}

.panel-seam {
    height: 25px;
    border-radius: 2px;
    background: linear-gradient(#efe18a, #e1b952);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .35);
}

.panel-bottom {
    border-radius: 8px;
    padding: 8px;
    background: linear-gradient(#f0d367, #ebbd54);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .3),
        0 1px 0 rgba(0, 0, 0, .35);
}

.footswitch {
    display: block;
    width: 100%;
    height: 96px;
    border: 0;
    border-radius: 8px;
    background: linear-gradient(#3f3c3f, #2d2b2f);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .06),
        inset 0 -10px 16px rgba(0, 0, 0, .35);
    cursor: pointer;
    position: relative;
}

.footswitch::before {
    content: "";
    position: absolute;
    inset: 8px;
    border-radius: 8px;
    box-shadow: 0 0 0 2px #caa84a inset;
    opacity: .8;
    pointer-events: none;
}

.footswitch:active {
    transform: translateY(1px);
    filter: brightness(.96);
}


</style>

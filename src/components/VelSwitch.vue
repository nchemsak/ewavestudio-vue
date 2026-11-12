<!-- components/VelSwitch.vue -->
<!-- A card's VEL switch (Envelope, Pitch, Filter, Noise): on, a step's velocity also shapes
     that card's setting by a fixed amount (VELOCITY_SWITCH_AMOUNT, src/audio/velocity.ts): softer
     steps get less of it. Off is 0. An amount saved by an older project or a preset plays as it
     is and lights the switch; a click turns it off. The pill itself is PillSwitch.vue. -->
<template>
    <PillSwitch :modelValue="on" label="VEL" :name="name" :tip="tip" :disabled="disabled" :note="note"
        @update:modelValue="toggle" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PillSwitch from './PillSwitch.vue';
import { VELOCITY_SWITCH_AMOUNT } from '../audio/velocity';

const props = withDefaults(defineProps<{
    modelValue: number;  // the destination's amount, −100..100 %
    name: string;        // its accessible name: "Velocity shapes Decay"
    tip: string;         // one line: what it does ("Softer steps decay sooner")
    disabled?: boolean;
    note?: string;       // a passing message under it (every step at full velocity)
}>(), { disabled: false, note: '' });

const emit = defineEmits<{
    (e: 'update:modelValue', v: number): void;
    (e: 'switched-on'): void;
}>();

const on = computed(() => props.modelValue !== 0);

function toggle() {
    if (on.value) emit('update:modelValue', 0);
    else {
        emit('update:modelValue', VELOCITY_SWITCH_AMOUNT);
        emit('switched-on');
    }
}
</script>

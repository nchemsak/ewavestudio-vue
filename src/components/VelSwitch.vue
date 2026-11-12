<!-- components/VelSwitch.vue -->
<!-- A card's VEL switch (Envelope, Pitch, Filter, Noise): on, a step's velocity also shapes
     that card's setting by a fixed amount (VELOCITY_SWITCH_AMOUNT, src/audio/velocity.ts): softer
     steps get less of it. Off is 0. An amount saved by an older project or a preset plays as it
     is and lights the switch; a click turns it off. Sized and placed like Pitch's RND pill. -->
<template>
    <span class="vel-switch-wrap">
        <button type="button" role="switch" class="vel-switch" :class="{ on }" :aria-checked="on ? 'true' : 'false'"
            :aria-label="name" :aria-description="tip" :title="tip" :disabled="disabled" @click="toggle">
            <span class="vel-led" aria-hidden="true"></span>VEL
        </button>
        <span v-if="note" class="custom-tooltip vel-note" role="status">{{ note }}</span>
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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

<style scoped>
.vel-switch-wrap {
    position: relative;
    display: inline-flex;
    flex: none;
}

.vel-switch {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 5px 1px 4px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 9px;
    line-height: 1.4;
    letter-spacing: 0.06em;
    opacity: 0.7;
    cursor: pointer;
}

/* The LED: dark when off, lit in the notch colour when on */
.vel-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4);
}

.vel-switch.on {
    opacity: 1;
    border-color: hsl(var(--pt-accent) 80% 62% / 0.9);
    background: hsl(var(--pt-accent) 80% 60% / 0.18);
}

.vel-switch.on .vel-led {
    background: var(--knob-detent, #6fe3b5);
    box-shadow: 0 0 6px var(--knob-detent, #6fe3b5);
}

.vel-switch:disabled {
    cursor: default;
    opacity: 0.35;
}

.vel-switch:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 62%);
    outline-offset: 2px;
}

/* On a light theme: a dark outline and a little more ink, as Pitch's RND pill */
.theme-light .vel-switch,
.theme-sand .vel-switch {
    border-color: color-mix(in oklab, var(--pt-text), transparent 72%);
}

.theme-light .vel-switch:not(:disabled),
.theme-sand .vel-switch:not(:disabled) {
    opacity: 0.85;
}

.theme-light .vel-switch.on,
.theme-sand .vel-switch.on {
    border-color: hsl(var(--pt-accent) 60% 48%);
    opacity: 1;
}

.theme-light .vel-led,
.theme-sand .vel-led {
    background: rgba(0, 0, 0, 0.15);
}

/* Under the switch, kept inside the card: it sits at the card's right edge */
.vel-note {
    top: calc(100% + 6px);
    left: auto;
    right: 0;
    transform: none;
}
</style>

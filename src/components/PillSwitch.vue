<!-- components/PillSwitch.vue -->
<!-- A small on/off pill with an LED, for a card's header corner: the cards' VEL switches
     (VelSwitch.vue) and the LFO's RETRIG. Sized like Pitch's RND pill. -->
<template>
    <span class="pill-switch-wrap">
        <button type="button" role="switch" class="pill-switch" :class="{ on: modelValue }"
            :aria-checked="modelValue ? 'true' : 'false'" :aria-label="name" :aria-description="tip" :title="tip"
            :disabled="disabled" @click="emit('update:modelValue', !modelValue)">
            <span class="pill-led" aria-hidden="true"></span>{{ label }}
        </button>
        <span v-if="note" class="custom-tooltip pill-note" role="status">{{ note }}</span>
    </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
    modelValue: boolean;
    label: string;       // on the pill: "VEL", "RETRIG"
    name: string;        // its accessible name: "Velocity shapes Decay"
    tip: string;         // one line: what it does
    disabled?: boolean;
    note?: string;       // a passing message under it
}>(), { disabled: false, note: '' });

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();
</script>

<style scoped>
.pill-switch-wrap {
    position: relative;
    display: inline-flex;
    flex: none;
}

.pill-switch {
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
.pill-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4);
}

.pill-switch.on {
    opacity: 1;
    border-color: hsl(var(--pt-accent) 80% 62% / 0.9);
    background: hsl(var(--pt-accent) 80% 60% / 0.18);
}

.pill-switch.on .pill-led {
    background: var(--knob-detent, #6fe3b5);
    box-shadow: 0 0 6px var(--knob-detent, #6fe3b5);
}

.pill-switch:disabled {
    cursor: default;
    opacity: 0.35;
}

.pill-switch:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 62%);
    outline-offset: 2px;
}

/* On a light theme: a dark outline and a little more ink, as Pitch's RND pill */
.theme-light .pill-switch,
.theme-sand .pill-switch {
    border-color: color-mix(in oklab, var(--pt-text), transparent 72%);
}

.theme-light .pill-switch:not(:disabled),
.theme-sand .pill-switch:not(:disabled) {
    opacity: 0.85;
}

.theme-light .pill-switch.on,
.theme-sand .pill-switch.on {
    border-color: hsl(var(--pt-accent) 60% 48%);
    opacity: 1;
}

.theme-light .pill-led,
.theme-sand .pill-led {
    background: rgba(0, 0, 0, 0.15);
}

/* A passing note under the switch, kept inside the card: it sits at the card's right edge */
.pill-note {
    top: calc(100% + 6px);
    left: auto;
    right: 0;
    transform: none;
}
</style>

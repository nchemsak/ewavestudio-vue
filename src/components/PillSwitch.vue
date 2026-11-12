<!-- components/PillSwitch.vue -->
<!-- A small on/off pill with an LED, for a card's header corner: the cards' VEL switches
     (VelSwitch.vue) and the LFO's RETRIG. Sized like Pitch's RND pill. -->
<template>
    <span class="pill-switch-wrap">
        <button type="button" role="switch" class="pill-switch hw-cap hw-cap-sm hw-led-left" :class="{ on: modelValue }"
            :aria-checked="modelValue ? 'true' : 'false'" :aria-label="name" :aria-description="tip" :title="tip"
            :disabled="disabled" @click="emit('update:modelValue', !modelValue)">
            {{ label }}
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

/* A toggle: a small cap with an LED beside its label, down and lit while on (_hardware.scss) */
.pill-switch {
    --hw-led-size: 5px;
    padding: 1px 5px 1px 4px;
    border-radius: 5px;
    border: 1px solid transparent;
    font: inherit;
    font-size: 9px;
    line-height: 1.4;
    letter-spacing: 0.06em;
}

.pill-switch:disabled {
    cursor: default;
    opacity: 0.35;
}

/* A passing note under the switch, kept inside the card: it sits at the card's right edge */
.pill-note {
    top: calc(100% + 6px);
    left: auto;
    right: 0;
    transform: none;
}
</style>

<!-- components/UnisonButton.vue -->
<template>
    <button class="wave-btn" type="button" role="switch" :class="[{ 'is-active': modelValue, 'is-disabled': disabled }]"
        :aria-checked="modelValue ? 'true' : 'false'" :aria-label="label"
        @click="!disabled && $emit('update:modelValue', !modelValue)"
        @keydown.space.prevent="!disabled && $emit('update:modelValue', !modelValue)"
        @keydown.enter.prevent="!disabled && $emit('update:modelValue', !modelValue)">
        <UnisonIcon class="wave-svg" :voices="voices" :detune="detune" :spread="spread" :enabled="modelValue"
            :palette="palette" />
        <span class="wave-label">{{ label }}</span>
    </button>
</template>

<script setup>
import UnisonIcon from './UnisonIcon.vue'

const props = defineProps({
    modelValue: { type: Boolean, default: false }, // v-model: on/off
    voices: { type: Number, default: 3 },          // mirrors knobs
    detune: { type: Number, default: 10 },
    spread: { type: Number, default: 50 },
    label: { type: String, default: 'Unison' },
    disabled: { type: Boolean, default: false },
    palette: {
        type: Array,
        default: () => ['#ff7eb3', '#ffd06b', '#7bd0ff']
    }
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
/* Theme-driven tile surface (darker in dark/synthwave via --pt-tile-1/2) */
.wave-btn {
    --tile-1: var(--pt-tile-1, var(--pt-surface-1));
    --tile-2: var(--pt-tile-2, var(--pt-surface-2));

    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    width: var(--w, 100px);
    padding: 6px 6px 6px;
    border-radius: 14px;

    background: linear-gradient(145deg, var(--tile-1), var(--tile-2));
    border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 70%);
    color: var(--pt-text);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.05),
        0 8px 22px rgb(0 0 0 / 0.35);

    transition: transform .08s ease, box-shadow .12s ease, background .2s ease, filter .2s ease;
    cursor: pointer;
}

.wave-btn:hover {
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.06),
        0 10px 24px var(--pt-btn-glow);
    background: linear-gradient(145deg,
            color-mix(in oklab, var(--tile-1), white 6%),
            color-mix(in oklab, var(--tile-2), white 6%));
}

.wave-btn:active {
    transform: translateY(1px);
}

.wave-btn.is-active {
    box-shadow:
        0 0 0 2px hsl(var(--pt-accent) 80% 60% / .25),
        inset 0 1px 0 rgb(255 255 255 / 0.06),
        0 12px 28px var(--pt-btn-glow);
    background: linear-gradient(145deg,
            color-mix(in oklab, var(--tile-2), white 3%),
            color-mix(in oklab, var(--tile-1), white 3%));
}

.wave-btn.is-disabled {
    opacity: .5;
    pointer-events: none;
}

/* Keep sizing consistent with WaveButton/FmTowerButton */
.wave-svg {
    display: block;
    width: 72px;
    height: 72px;
}

.wave-label {
    font-size: .72rem;
    letter-spacing: .08em;
    opacity: .9;
    user-select: none;
}
</style>

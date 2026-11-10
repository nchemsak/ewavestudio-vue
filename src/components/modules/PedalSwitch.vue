<template>
    <!-- A mini toggle on an effect pedal (CRUSH, PING PONG): the lever is up and lit when on -->
    <button type="button" role="switch" class="pedal-switch" :class="{ on: modelValue }"
        :aria-checked="modelValue ? 'true' : 'false'" :aria-label="ariaLabel || label" :title="title"
        :disabled="disabled" @click="emit('update:modelValue', !modelValue)">
        <span class="ps-slot" aria-hidden="true"><span class="ps-lever"></span></span>
        <span class="ps-label" aria-hidden="true"><span v-for="w in label.split(' ')" :key="w">{{ w }}</span></span>
    </button>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        modelValue: boolean;
        label: string;       // shown under the switch, one word a line ("PING PONG")
        ariaLabel?: string;
        title?: string;
        disabled?: boolean;
    }>(),
    { ariaLabel: '', title: '', disabled: false }
);

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();
</script>

<style scoped>
.pedal-switch {
    position: absolute;
    right: 5px;
    bottom: 3px;
    width: 34px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 1px 0;
    border: 0;
    background: none;
    cursor: pointer;
    font-family: monospace;
}

.ps-slot {
    position: relative;
    width: 11px;
    height: 17px;
    border-radius: 6px;
    background: linear-gradient(#2d2b2f, #3f3c3f);
    box-shadow:
        inset 0 1px 3px rgba(0, 0, 0, 0.7),
        0 1px 0 rgba(255, 255, 255, 0.35);
}

.ps-lever {
    position: absolute;
    left: 2px;
    top: 8px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #f4f4f4, #9a9a9a);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    transition: top 0.08s ease-out, background 0.08s;
}

.pedal-switch.on .ps-lever {
    top: 2px;
    background: radial-gradient(circle at 35% 35%, #ff8a80, #e53935);
    box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.6),
        0 0 6px 2px rgba(229, 57, 53, 0.55);
}

.ps-label {
    font-size: 0.48rem;
    font-weight: bold;
    line-height: 1;
    min-height: 2em; /* two lines, so a one-word switch sits as high as PING PONG */
    color: black;
    text-align: center;
    display: flex;
    flex-direction: column;
}

.pedal-switch:disabled {
    cursor: default;
}

.pedal-switch:disabled .ps-label {
    color: #666;
}

.pedal-switch:disabled .ps-lever {
    filter: grayscale(1);
    opacity: 0.8;
}

.pedal-switch:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 60%);
    outline-offset: 1px;
    border-radius: 6px;
}

.pedal-switch:active:not(:disabled) .ps-slot {
    filter: brightness(0.9);
}
</style>

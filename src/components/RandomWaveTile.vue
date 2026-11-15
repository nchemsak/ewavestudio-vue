<!-- src/components/RandomWaveTile.vue -->
<!-- The Waveforms card's Random, as a tile like the eight waves (MOCKUPS: ?waves=a|b). It never
     stays down: each press rolls the pads' waves again, the dice tumbling. While the pads play
     a mix, it shows the mix: a small bar per pad in its wave's colour, "Mix · roll again". -->
<template>
    <button type="button" class="rw-tile hw-cap" :class="[`rw-${shape}`, { 'is-mixed': mixed }]" :disabled="disabled"
        :title="title" :aria-label="mixed ? 'Random waves: the pads play a mix, roll again' : 'Random waves'"
        @click="roll">
        <span class="rw-top">
        <svg :key="rolls" class="rw-dice" :class="{ tumble: rolls > 0 }" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
            <circle cx="8" cy="8" r="1.6" /><circle cx="16" cy="8" r="1.6" /><circle cx="12" cy="12" r="1.6" />
            <circle cx="8" cy="16" r="1.6" /><circle cx="16" cy="16" r="1.6" />
        </svg>
        <span v-if="mixed" class="rw-mix" aria-hidden="true">
            <i v-for="(c, i) in bars" :key="i" :style="{ background: c }" />
        </span>
        </span>
        <span class="rw-label">
            <template v-if="mixed">Mix<span class="rw-sep"> · </span><span class="rw-again">roll again</span></template>
            <template v-else>Random</template>
        </span>
    </button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
    waves: string[]; // each pad's wave
    palettes: Record<string, string[]>;
    mixed: boolean;
    disabled?: boolean;
    title?: string;
    shape?: 'square' | 'column';
}>();
const emit = defineEmits<{ (e: 'roll'): void }>();

const shape = computed(() => props.shape ?? 'square');
const bars = computed(() => props.waves.map((w) => props.palettes[w]?.[1] ?? '#888'));
const rolls = ref(0);
function roll() {
    rolls.value++;
    emit('roll');
}
</script>

<style scoped>
.rw-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    height: 100%;
    padding: 4px;
    border: 0;
    border-radius: 12px;
    font: inherit;
    color: var(--cap-ink);
    overflow: hidden;
}

.rw-tile:disabled {
    opacity: 0.45;
    cursor: default;
}

.rw-dice {
    width: 30px;
    height: 30px;
    flex: none;
}

.rw-dice rect {
    fill: hsl(var(--pt-accent) 70% 60% / 0.18);
    stroke: currentColor;
    stroke-width: 1.4px;
}

.rw-dice circle {
    fill: currentColor;
}

.rw-dice.tumble {
    animation: rw-tumble 0.55s cubic-bezier(.3, .7, .4, 1);
}

@keyframes rw-tumble {
    0% { transform: rotate(0) translateY(0) scale(1); }
    35% { transform: rotate(200deg) translateY(-6px) scale(0.9); }
    70% { transform: rotate(330deg) translateY(1px) scale(1.05); }
    100% { transform: rotate(360deg) translateY(0) scale(1); }
}

.is-mixed .rw-dice {
    width: 22px;
    height: 22px;
}

/* The mix: a bar per pad, in its wave's colour */
.rw-mix {
    display: grid;
    grid-template-columns: repeat(8, 5px);
    gap: 2px;
}

.rw-mix i {
    display: block;
    height: 6px;
    border-radius: 1px;
}

.rw-label {
    font-size: .62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    line-height: 1.1;
    text-align: center;
}

.rw-again {
    opacity: 0.75;
}

.rw-top {
    display: flex;
    align-items: center;
    gap: 7px;
}

/* The square tile with a mix: the dice beside the bars, the words smaller */
.rw-square.is-mixed .rw-label {
    font-size: .52rem;
    letter-spacing: 0.03em;
}

/* The narrow ninth column: everything stacked, the label on two lines */
.rw-column {
    gap: 8px;
}

.rw-column .rw-top {
    flex-direction: column;
    gap: 8px;
}

.rw-column .rw-mix {
    grid-template-columns: repeat(2, 7px);
    gap: 2px 3px;
}

.rw-column .rw-mix i {
    height: 4px;
}

.rw-column .rw-sep {
    display: none;
}

.rw-column .rw-again {
    display: block;
    font-size: .5rem;
    white-space: normal;
}

@media (prefers-reduced-motion: reduce) {
    .rw-dice.tumble {
        animation: none;
    }
}
</style>

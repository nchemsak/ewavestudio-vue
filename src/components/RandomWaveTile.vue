<!-- src/components/RandomWaveTile.vue -->
<!-- The Waveforms card's Random (PR 83, option B of two mockups): a tall tile in a narrow ninth
     column beside the eight waves. It never stays down: each press rolls the pads' waves again
     (from the waves whose dice badge is lit), the dice tumbling. While the pads play a mix, it
     shows the mix: a small bar per pad in its wave's colour, "Mix / roll again". -->
<template>
    <button type="button" class="rw-tile hw-cap" :class="{ 'is-mixed': mixed }" :disabled="disabled"
        :title="title" :aria-label="mixed ? 'Random waves: the pads play a mix, roll again' : 'Random waves'"
        @click="roll">
        <span class="rw-top">
        <svg class="rw-dice" :class="{ tumble }" viewBox="0 0 24 24" aria-hidden="true"
            @animationend="tumble = false">
            <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
            <circle v-for="([cx, cy], i) in PIPS[face - 1]" :key="i" :cx="cx" :cy="cy" r="1.6" />
        </svg>
        <span v-if="mixed" class="rw-mix" aria-hidden="true">
            <i v-for="(c, i) in bars" :key="i" :style="{ background: c }" />
        </span>
        </span>
        <span class="rw-label">
            <template v-if="mixed">Mix<span class="rw-again">roll again</span></template>
            <template v-else>Random</template>
        </span>
    </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

const props = defineProps<{
    waves: string[]; // each pad's wave
    palettes: Record<string, string[]>;
    mixed: boolean;
    disabled?: boolean;
    title?: string;
}>();
const emit = defineEmits<{ (e: 'roll'): void }>();

const bars = computed(() => props.waves.map((w) => props.palettes[w]?.[1] ?? '#888'));
// The dice's faces, pips as [cx, cy]
const L = 8, M = 12, R = 16;
const PIPS: [number, number][][] = [
    [[M, M]],
    [[L, L], [R, R]],
    [[L, L], [M, M], [R, R]],
    [[L, L], [R, L], [L, R], [R, R]],
    [[L, L], [R, L], [M, M], [L, R], [R, R]],
    [[L, L], [R, L], [L, M], [R, M], [L, R], [R, R]],
];

// A roll: the dice hops and tumbles a quarter turn at a time (each turn lands on a side, as a
// die does), showing a new face every turn, and lands on a face other than the one it showed.
// Until PR 85 it spun a whole turn round a point off its centre, its face never changing.
const face = ref(5);
const tumble = ref(false);
let faceTimer: ReturnType<typeof setInterval> | null = null;
const TURNS = 4; // quarter turns in the animation (rw-tumble), one face each
const TURN_MS = 120;

// A face other than these
function otherFace(...not: number[]) {
    const faces = [1, 2, 3, 4, 5, 6].filter((f) => !not.includes(f));
    return faces[Math.floor(Math.random() * faces.length)];
}

function roll() {
    emit('roll');
    if (faceTimer) clearInterval(faceTimer);
    tumble.value = false;
    // Restart the animation even mid-roll (the class comes off for a frame)
    requestAnimationFrame(() => {
        tumble.value = true;
    });
    const start = face.value;
    let turns = 1;
    face.value = otherFace(start);
    faceTimer = setInterval(() => {
        turns++;
        // The last turn lands on a face other than the one the roll started from
        face.value = turns === TURNS ? otherFace(face.value, start) : otherFace(face.value);
        if (turns === TURNS) {
            clearInterval(faceTimer!);
            faceTimer = null;
        }
    }, TURN_MS);
}

onBeforeUnmount(() => {
    if (faceTimer) clearInterval(faceTimer);
});
</script>

<style scoped>
.rw-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
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

/* The same size whether or not the pads play a mix (it shrank from 30 to 22 px mid-roll on
   the first press until PR 85) */
.rw-dice {
    width: 26px;
    height: 26px;
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

.rw-dice {
    transform-origin: 50% 50%;
}

/* A hop with four quarter turns, the hop applied before the turn (so it goes straight up, not
   round in a circle), slowing as it lands, with a little squash on landing */
.rw-dice.tumble {
    animation: rw-tumble 0.5s linear;
}

@keyframes rw-tumble {
    0% { transform: translateY(0) rotate(0deg); }
    25% { transform: translateY(-7px) rotate(90deg); }
    50% { transform: translateY(-8px) rotate(180deg); }
    75% { transform: translateY(-4px) rotate(270deg); }
    90% { transform: translateY(0) rotate(352deg) scale(1.06, 0.92); }
    100% { transform: translateY(0) rotate(360deg) scale(1); }
}


.rw-top {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

/* The mix: a bar per pad, in its wave's colour, two columns of eight */
.rw-mix {
    display: grid;
    grid-template-columns: repeat(2, 7px);
    gap: 2px 3px;
}

.rw-mix i {
    display: block;
    height: 4px;
    border-radius: 1px;
}

.rw-label {
    font-size: .62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 1.1;
    text-align: center;
}

.rw-again {
    display: block;
    font-size: .5rem;
    opacity: 0.75;
}

@media (prefers-reduced-motion: reduce) {
    .rw-dice.tumble {
        animation: none;
    }
}
</style>

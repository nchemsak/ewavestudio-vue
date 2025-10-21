<!-- components/WaveButton.vue -->
<template>
    <button class="wave-btn" type="button" role="radio" :class="[{ 'is-active': checked, 'is-disabled': disabled }]"
        :aria-checked="checked ? 'true' : 'false'" :aria-label="label"
        @click="!disabled && $emit('update:modelValue', value)"
        @keydown.space.prevent="!disabled && $emit('update:modelValue', value)"
        @keydown.enter.prevent="!disabled && $emit('update:modelValue', value)">
        <!-- Dice badge (toggles random-inclusion) -->
        <span v-if="showDice" class="dice-badge" :class="{ on: randomIncluded }" role="switch"
            :aria-checked="randomIncluded ? 'true' : 'false'" :aria-label="diceAria" :title="diceAria" tabindex="0"
            @click.stop.prevent="toggleDice" @keydown.space.stop.prevent="onDiceKey"
            @keydown.enter.stop.prevent="onDiceKey">
            <!-- tiny dice icon -->
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
                <circle cx="8" cy="8" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="16" cy="16" r="1.6" />
            </svg>
        </span>

        <svg class="wave-svg" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
                <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" :stop-color="colors[0]" />
                    <stop offset="55%" :stop-color="colors[1]" />
                    <stop offset="100%" :stop-color="colors[2]" />
                </linearGradient>
            </defs>

            <component :is="shapeTag" v-bind="shapeAttrs" :fill="`url(#${gid})`" />
            <component :is="shapeTag" v-bind="shapeAttrs" fill="none" stroke="white" stroke-opacity="0.15"
                stroke-width="1.2" />
        </svg>

        <span class="wave-label">{{ label }}</span>
    </button>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    modelValue: String,
    value: { type: String, required: true }, // 'sine' | 'triangle' | 'sawtooth' | 'square'
    label: { type: String, default: '' },
    disabled: Boolean,
    palette: {
        type: Array,
        default: () => ['#ff7eb3', '#ffd06b', '#7bd0ff']
    },
    // Dice badge controls
    showDice: { type: Boolean, default: true },
    randomIncluded: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue', 'toggle-random'])

const checked = computed(() => props.modelValue === props.value)
const colors = computed(() => props.palette.length >= 3 ? props.palette : ['#aef', '#fda', '#fea'])

const uid = Math.random().toString(36).slice(2)
const gid = `grad-${uid}`

const shapeTag = computed(() => {
    switch (props.value) {
        case 'square': return 'rect'
        case 'triangle': return 'polygon'
        case 'sawtooth': return 'polygon'
        case 'sine': return 'circle'
        default: return 'rect'
    }
})

const shapeAttrs = computed(() => {
    switch (props.value) {
        case 'square': return { x: 18, y: 18, width: 64, height: 64, rx: 0 }
        case 'triangle': return { points: '50,14 88,86 12,86' }
        case 'sawtooth': return { points: '16,84 84,84 16,16' }
        case 'sine': return { cx: 50, cy: 50, r: 32 }
        default: return { x: 20, y: 20, width: 60, height: 60, rx: 12 }
    }
})

const diceAria = computed(() =>
    props.randomIncluded
        ? `Exclude ${props.label || props.value} from Random`
        : `Include ${props.label || props.value} in Random`
)

function toggleDice() {
    // No “shift-only” behavior anymore
    emit('toggle-random', props.value, !props.randomIncluded)
}

function onDiceKey(e) {
    if (e.key === ' ' || e.key === 'Enter') toggleDice()
}
</script>
<style scoped>
.wave-btn {
    /* Theme-driven tile surface (replaces the hard-coded --panel) */
    /* --tile-1: var(--pt-surface-1);
  --tile-2: var(--pt-surface-2); */
    --tile-1: var(--pt-tile-1, var(--pt-surface-1));
    --tile-2: var(--pt-tile-2, var(--pt-surface-2));
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    width: var(--w, 100px);
    padding: 6px 6px 6px;
    border-radius: 14px;

    /* themed background + border */
    background: linear-gradient(145deg, var(--tile-1), var(--tile-2));
    border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 70%);

    /* themed text + shadow */
    color: var(--pt-text);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.05),
        0 8px 22px rgb(0 0 0 / 0.35);

    transition: transform .08s ease, box-shadow .12s ease, background .2s ease, filter .2s ease;
    cursor: pointer;
}

.wave-btn:hover {
    /* gentle lift toward accent glow + a touch lighter */
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
    /* accent ring + brighter surface */
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

/* Icon size unchanged */
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

/* --- dice badge, themed --- */
.dice-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    border-radius: 8px;
    background: color-mix(in oklab, var(--pt-surface-2), transparent 10%);
    border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 65%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgb(0 0 0 / .25);
    opacity: .95;
}

.dice-badge svg {
    width: 20px;
    height: 20px;
}

.dice-badge svg rect {
    fill: none;
    stroke: color-mix(in oklab, var(--pt-text) 90%, transparent);
    stroke-width: 1.6px;
}

.dice-badge svg circle {
    fill: var(--pt-surface-1);
}

.dice-badge.on {
    background: hsl(var(--pt-accent) 80% 60% / .15);
    border-color: hsl(var(--pt-accent) 80% 60% / .55);
}

.dice-badge.on svg circle {
    fill: color-mix(in oklab, var(--pt-text) 92%, transparent);
}

.dice-badge:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 60%);
    outline-offset: 2px;
}
</style>

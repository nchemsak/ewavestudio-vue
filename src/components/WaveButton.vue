<!-- components/WaveButton.vue -->
<template>
    <button class="wave-btn" type="button" role="radio" :class="[{ 'is-active': checked, 'is-disabled': disabled }]"
        :aria-checked="checked ? 'true' : 'false'" :aria-label="label"
        @click="!disabled && $emit('update:modelValue', value)"
        @keydown.space.prevent="!disabled && $emit('update:modelValue', value)"
        @keydown.enter.prevent="!disabled && $emit('update:modelValue', value)">
        <svg class="wave-svg" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
                <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
                    <!-- pastel gradient like the earlier buttons -->
                    <stop offset="0%" :stop-color="colors[0]" />
                    <stop offset="55%" :stop-color="colors[1]" />
                    <stop offset="100%" :stop-color="colors[2]" />
                </linearGradient>
            </defs>

            <!-- icon: simple, crisp shape -->
            <component :is="shapeTag" v-bind="shapeAttrs" :fill="`url(#${gid})`" />
            <!-- subtle edge to keep it crisp on dark backgrounds -->
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
        default: () => ['#ff7eb3', '#ffd06b', '#7bd0ff'] // earlier colorway
    },
})

defineEmits(['update:modelValue'])

const checked = computed(() => props.modelValue === props.value)
const colors = computed(() => props.palette.length >= 3 ? props.palette : ['#aef', '#fda', '#fea'])

const uid = Math.random().toString(36).slice(2)
const gid = `grad-${uid}`

// which SVG element to draw
const shapeTag = computed(() => {
    switch (props.value) {
        case 'square': return 'rect'
        case 'triangle': return 'polygon'
        case 'sawtooth': return 'polygon'
        case 'sine': return 'circle'
        default: return 'rect'
    }
})

// geometry 
const shapeAttrs = computed(() => {
    switch (props.value) {
        case 'square': return { x: 18, y: 18, width: 64, height: 64, rx: 0 }
        case 'triangle': return { points: '50,14 88,86 12,86' }
        case 'sawtooth': return { points: '16,84 84,84 16,16' }
        case 'sine': return { cx: 50, cy: 50, r: 32 }
        default: return { x: 20, y: 20, width: 60, height: 60, rx: 12 }
    }
})
</script>

<style scoped>
.wave-btn {
    --panel: #1a1e27;
    --w: 100px;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    width: var(--w);
    padding: 6px 6px 6px;
    border-radius: 14px;
    background: var(--panel);
    border: 1px solid rgba(255, 255, 255, .06);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .06),
        0 8px 22px rgba(0, 0, 0, .55);
    transition: transform .08s ease, box-shadow .12s ease, background .2s ease;
    cursor: pointer;
}

.wave-btn:hover {
    background: color-mix(in oklab, var(--panel) 92%, white);
}

.wave-btn:active {
    transform: translateY(1px);
}

.wave-btn.is-active {
    box-shadow:
        0 0 0 2px rgba(125, 200, 255, .25),
        inset 0 1px 0 rgba(255, 255, 255, .06),
        0 12px 28px rgba(0, 0, 0, .6);
}

.wave-btn.is-disabled {
    opacity: .5;
    pointer-events: none;
}

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

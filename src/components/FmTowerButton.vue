<!-- components/FmTowerButton.vue -->
<template>
    <button class="wave-btn" type="button" role="switch" :class="[{ 'is-active': modelValue, 'is-disabled': disabled }]"
        :aria-checked="modelValue ? 'true' : 'false'" :aria-label="label"
        @click="!disabled && $emit('update:modelValue', !modelValue)"
        @keydown.space.prevent="!disabled && $emit('update:modelValue', !modelValue)"
        @keydown.enter.prevent="!disabled && $emit('update:modelValue', !modelValue)">
        <svg class="wave-svg" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
                <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" :stop-color="colors[0]" />
                    <stop offset="55%" :stop-color="colors[1]" />
                    <stop offset="100%" :stop-color="colors[2]" />
                </linearGradient>
            </defs>

            <!-- Main icon (gradient stroke) -->
            <g fill="none" :stroke="`url(#${gid})`" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                <!-- emitter -->
                <circle cx="50" cy="26" r="4" />
                <!-- broadcast waves -->
                <g class="waves" :key="animNonce" :class="{ on: modelValue }">
                    <path class="wave w1r" d="M50 26 a14 14 0 0 1 14 14" />
                    <path class="wave w1l" d="M50 26 a14 14 0 0 0 -14 14" />
                    <path class="wave w2r" d="M50 26 a26 26 0 0 1 26 26" />
                    <path class="wave w2l" d="M50 26 a26 26 0 0 0 -26 26" />
                    <path class="wave w3r" d="M50 26 a38 38 0 0 1 38 38" />
                    <path class="wave w3l" d="M50 26 a38 38 0 0 0 -38 38" />
                </g>
                <!-- tower + base -->
                <path d="M30 84h40" />
                <path d="M38 84L50 34l12 50" />
                <path d="M44 60h12" />
                <path d="M42 72h16" />
            </g>

            <g fill="none" stroke="white" stroke-opacity="0.15" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round">
                <path d="M30 84h40" />
                <path d="M38 84L50 34l12 50" />
            </g>
        </svg>

        <span class="wave-label">{{ label }}</span>
    </button>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    label: { type: String, default: 'FM' },
    disabled: { type: Boolean, default: false },
    palette: {
        type: Array,
        default: () => ['#ff7eb3', '#ffd06b', '#7bd0ff']
    }
})

defineEmits(['update:modelValue'])

const colors = computed(() =>
    props.palette.length >= 3 ? props.palette : ['#aef', '#fda', '#fea']
)

const uid = Math.random().toString(36).slice(2)
const gid = `grad-${uid}`

const animNonce = ref(0)
watch(() => props.modelValue, (v) => {
    if (v) animNonce.value++
})
</script>

<style scoped>
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

.wave-btn.is-active .wave {
    animation: radiate 1.6s cubic-bezier(.2, .6, .3, 1) infinite;
    opacity: .35;
}

.wave-btn.is-active .w2r,
.wave-btn.is-active .w2l {
    animation-delay: .15s;
}

.wave-btn.is-active .w3r,
.wave-btn.is-active .w3l {
    animation-delay: .30s;
}

@keyframes radiate {
    0% {
        opacity: 0;
    }

    15% {
        opacity: .55;
    }

    100% {
        opacity: 0;
    }
}


.waves .wave {
    opacity: 0;
}

.waves.on .wave {
    animation: radiate 1.6s cubic-bezier(.2, .6, .3, 1) infinite both;
    opacity: .35;
}

.waves.on .w2r,
.waves.on .w2l {
    animation-delay: .15s;
}

.waves.on .w3r,
.waves.on .w3l {
    animation-delay: .30s;
}

@keyframes radiate {
    0% {
        opacity: 0;
    }

    15% {
        opacity: .55;
    }

    100% {
        opacity: 0;
    }
}
</style>

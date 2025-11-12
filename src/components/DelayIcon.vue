<template>
    <svg class="delay-icon" viewBox="0 0 100 100" role="img" aria-label="Delay">
        <defs>
            <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" :stop-color="colors[0]" />
                <stop offset="55%" :stop-color="colors[1]" />
                <stop offset="100%" :stop-color="colors[2]" />
            </linearGradient>
            <radialGradient :id="gidDots" cx="50%" cy="50%" r="50%">
                <stop offset="0%" :stop-color="colors[2]" stop-opacity="1" />
                <stop offset="100%" :stop-color="colors[2]" stop-opacity="0" />
            </radialGradient>
        </defs>

        <!-- Play triangle (source) -->
        <polygon points="20,50 36,40 36,60" :fill="triangleFill" :opacity="enabled ? 0.95 : 0.7" />

        <!-- Feedback loop path -->
        <path d="M36 50 C 52 30, 78 30, 78 50 S 52 70, 36 50" fill="none" :stroke="`url(#${gid})`"
            :stroke-width="enabled ? 3 : 2" stroke-linecap="round" stroke-linejoin="round"
            :opacity="enabled ? 1 : 0.8" />
        <!-- subtle gloss outline -->
        <path d="M36 50 C 52 30, 78 30, 78 50 S 52 70, 36 50" fill="none" stroke="white" stroke-opacity="0.10"
            :stroke-width="enabled ? 2.5 : 1.5" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Echo taps (fading dots along the path) -->
        <g :opacity="enabled ? 0.95 : 0.65">
            <circle v-for="(p, i) in dots" :key="i" :cx="p.x" :cy="p.y" :r="p.r"
                :fill="i === 0 ? `url(#${gidDots})` : `url(#${gid})`" :fill-opacity="p.o" />
        </g>
    </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
    enabled?: boolean
    palette?: string[]
}>(), {
    enabled: true,
    palette: () => ['#8ad0ff', '#a78bfa', '#ffb4e6']
})

const colors = computed(() =>
    (props.palette?.length ?? 0) >= 3 ? props.palette! : ['#9ad', '#b9f', '#fbd']
)

const triangleFill = computed(() =>
    props.enabled ? colors.value[0] : 'color-mix(in oklab, var(--pt-text), transparent 30%)'
)

/* positions for 5 dots along the cubic path (0..1 t) */
const tVals = [0.15, 0.35, 0.55, 0.75, 0.9]
function cubicPoint(t: number, p0: number, p1: number, p2: number, p3: number) {
    const u = 1 - t
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}
// Path: M36,50 C52,30 78,30 78,50 S52,70 36,50
// Split second S segment to cubic with reflected control.
function getPoint(t: number) {
    if (t <= 0.5) {
        const tt = t / 0.5
        return {
            x: cubicPoint(tt, 36, 52, 78, 78),
            y: cubicPoint(tt, 50, 30, 30, 50)
        }
    } else {
        const tt = (t - 0.5) / 0.5
        // second cubic: 78,50 C78,70 52,70 36,50
        return {
            x: cubicPoint(tt, 78, 78, 52, 36),
            y: cubicPoint(tt, 50, 70, 70, 50)
        }
    }
}
const dots = computed(() =>
    tVals.map((t, i) => {
        const p = getPoint(t)
        const fall = (tVals.length - i) / tVals.length
        return { x: p.x, y: p.y, r: 3.2 * fall, o: 0.55 + 0.35 * fall }
    })
)

const uid = Math.random().toString(36).slice(2)
const gid = `grad-delay-${uid}`
const gidDots = `grad-dots-${uid}`
</script>

<style scoped>
.delay-icon {
    display: block;
    width: 72px;
    height: 72px;
}
</style>

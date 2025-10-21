<!-- components/UnisonIcon.vue -->
<template>
    <svg class="unison-icon" viewBox="0 0 100 100" role="img"
        :aria-label="`Unison: ${n} voices, ${detune}¢, ${spread}%`">
        <defs>
            <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" :stop-color="colors[0]" />
                <stop offset="55%" :stop-color="colors[1]" />
                <stop offset="100%" :stop-color="colors[2]" />
            </linearGradient>
        </defs>

        <g v-for="(idx, i) in indices" :key="i">
            <path :d="paths[i]" fill="none" :stroke="`url(#${gid})`" :stroke-width="strokeWidth(i)"
                stroke-linecap="round" stroke-linejoin="round" :opacity="strokeOpacity(i)"
                :transform="`translate(${dx(i)}, ${dy(i)})`" />
            <!-- glossy outline, very subtle -->
            <path :d="paths[i]" fill="none" stroke="white" stroke-opacity="0.10"
                :stroke-width="Math.max(1, strokeWidth(i) - 1)" stroke-linecap="round" stroke-linejoin="round"
                :transform="`translate(${dx(i)}, ${dy(i)})`" />
        </g>
    </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    voices: { type: Number, default: 3 },   // 1..6
    detune: { type: Number, default: 10 },  // 0..100 (cents)
    spread: { type: Number, default: 50 },  // 0..100 (%)
    enabled: { type: Boolean, default: true },
    // gradient palette (matches your Wave/Tile look)
    palette: {
        type: Array,
        default: () => ['#ff7eb3', '#ffd06b', '#7bd0ff']
    }
})

/* --- helpers --- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

const n = computed(() => clamp(Math.round(props.voices || 1), 1, 6))

// Symmetric indices around center: odd => [-k..0..k], even => [-1.5,-0.5,0.5,1.5] etc.
const indices = computed(() => {
    const count = n.value
    if (count === 1) return [0]
    if (count % 2 === 1) {
        const half = (count - 1) / 2
        const arr = []
        for (let i = -half; i <= half; i++) arr.push(i)
        return arr
    } else {
        const half = count / 2
        const arr = []
        for (let i = -(half - 0.5); i <= (half - 0.5); i += 1) arr.push(i)
        return arr
    }
})

const maxAbs = computed(() =>
    indices.value.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1
)

// Mapping: Spread -> vertical separation + tiny stereo/nudge
const spreadPx = computed(() => 4 + (props.spread / 100) * 8)      // 4..12 px
const nudgePx = computed(() => (props.spread / 100) * 4)          // 0..4 px

// Mapping: Detune -> phase offset
const phaseMax = computed(() => (props.detune / 100) * (Math.PI * 0.5)) // 0..~0.5π

// Per-line transforms
const dy = i => indices.value[i] * spreadPx.value
const dx = i => Math.sign(indices.value[i] || 0) * nudgePx.value

// Stroke width/opacity taper (center is stronger)
const strokeWidth = i => {
    const rel = Math.abs(indices.value[i]) / maxAbs.value
    const base = 1.6, center = 2.6
    // if only one voice, just use center width
    return n.value === 1 ? center : base + (1 - rel) * (center - base)
}
const strokeOpacity = i => {
    const rel = Math.abs(indices.value[i]) / maxAbs.value
    const on = props.enabled ? 1 : 0.65
    const min = 0.55, max = 0.95
    return on * (min + (1 - rel) * (max - min))
}

// Build sine path with phase
function buildPath(phase = 0) {
    // draw inside margins to avoid clipping
    const x0 = 6, x1 = 94, steps = 64
    const width = x1 - x0
    const midY = 50
    const amp = 16   // wave amplitude (px)
    let d = ''
    for (let s = 0; s <= steps; s++) {
        const t = s / steps
        const x = x0 + t * width
        const y = midY + amp * Math.sin(t * 2 * Math.PI + phase)
        d += (s === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`)
    }
    return d
}

// Paths per voice: phase scales with distance from center
const paths = computed(() => {
    const out = []
    for (let i = 0; i < indices.value.length; i++) {
        const rel = maxAbs.value ? Math.abs(indices.value[i]) / maxAbs.value : 0
        const sign = Math.sign(indices.value[i] || 0)
        const phase = sign * rel * phaseMax.value
        out.push(buildPath(phase))
    }
    return out
})

const colors = computed(() =>
    props.palette.length >= 3 ? props.palette : ['#aef', '#fda', '#fea']
)

const uid = Math.random().toString(36).slice(2)
const gid = `grad-${uid}`
</script>

<style scoped>
.unison-icon {
    display: block;
    width: 72px;
    height: 72px;
}
</style>

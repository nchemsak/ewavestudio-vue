<template>
    <KnobGroup v-model="enabledLocal" title="Noise" :color="accent" :showToggle="showToggle">
        <div class="noise-layout">
            <!-- LEFT: one row = Dot, Burst(ms), Amount, Color (with swatch) -->
            <div class="controls-row">
                <!-- Enable dot (also means “Burst on”) -->
                <button class="pt-dot" :class="{ 'is-on': enabledLocal }" :aria-pressed="enabledLocal"
                    title="Toggle noise" @click="enabledLocal = !enabledLocal" />

                <!-- Burst time -->
                <div class="control-block">
                    <Knob v-model="burstMsLocal" label="Burst" :min="5" :max="250" :step="1" size="small"
                        :color="accent" :disabled="!enabledLocal" @knobStart="activeKnob = 'burstMs'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'burstMs'" class="custom-tooltip">
                        {{ Math.round(burstMsLocal) >= 250 ? 'Full decay' : Math.round(burstMsLocal) + ' ms' }}
                    </span>
                </div>

                <!-- Amount -->
                <div class="control-block">
                    <Knob v-model="amountLocal" label="Amount" :min="0" :max="1" :step="0.01" size="small"
                        :color="accent" :disabled="!enabledLocal" @knobStart="activeKnob = 'noiseAmount'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'noiseAmount'" class="custom-tooltip">
                        {{ Math.round(amountLocal * 100) }}%
                    </span>
                </div>

                <!-- Color morph (swatch + knob) -->
                <div class="control-block color-block">
                    <div class="swatch-wrap" :aria-label="`Noise color swatch: ${colorLabel}`" :title="colorLabel">
                        <div class="swatch" :style="{ backgroundColor: swatchHex }">Color</div>
                    </div>

                    <Knob v-model="colorLocal" aria-label="Noise color morph" :min="0" :max="1" :step="0.01"
                        size="small" :color="accent" :disabled="!enabledLocal" @knobStart="activeKnob = 'colorMorph'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'colorMorph'" class="custom-tooltip">
                        {{ Math.round(colorLocal * 100) }}%
                    </span>
                </div>
            </div>

            <!-- RIGHT: stacked mask button groups -->
            <div v-if="hasMask" class="mask-col">
                <div class="pt-section-title">Apply to Pads</div>

                <div class="mask-stack">
                    <div class="pt-btn-group" role="group" aria-label="Noise mask group 1">
                        <button class="pt-btn" @click="maskAll">All</button>
                        <button class="pt-btn" @click="maskEvery2">Every 2</button>
                        <button class="pt-btn" @click="maskBackbeat">Backbeat</button>
                    </div>

                    <div class="pt-btn-group" role="group" aria-label="Noise mask group 2">
                        <!-- <button class="pt-btn" @click="maskBeats23">Beats 2 &amp; 3</button> -->
                        <button class="pt-btn" @click="maskRandom">Random</button>
                        <button class="pt-btn" @click="maskInvert">Invert</button>
                        <button class="pt-btn pt-danger" @click="maskClear">Clear</button>
                    </div>
                </div>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'

/**
 * Exposed v-models:
 *  - v-model:enabled
 *  - v-model:amount
 *  - v-model:colorMorph   0..1
 *  - v-model:mask         boolean[]
 *  - v-model:attackBurst  boolean  (mirrors enabled)
 *  - v-model:burstMs      number (ms)
 */

const props = withDefaults(defineProps<{
    enabled: boolean
    amount: number
    colorMorph: number
    mask?: boolean[]
    attackBurst?: boolean
    burstMs?: number
    color?: string
    showToggle?: boolean
}>(), {
    enabled: false,
    amount: 0.25,
    colorMorph: 0.5,
    attackBurst: false,
    burstMs: 80,
    color: '#9C27B0',
    showToggle: true
})

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void
    (e: 'update:amount', v: number): void
    (e: 'update:colorMorph', v: number): void
    (e: 'update:mask', v: boolean[]): void
    (e: 'update:attackBurst', v: boolean): void
    (e: 'update:burstMs', v: number): void
}>()

// locals
const enabledLocal = ref(props.enabled)
const amountLocal = ref(props.amount)
const colorLocal = ref(props.colorMorph)
const burstMsLocal = ref(props.burstMs ?? 80)
const activeKnob = ref<null | 'noiseAmount' | 'colorMorph' | 'burstMs'>(null)

// sync props -> locals
watch(() => props.enabled, v => enabledLocal.value = v)
watch(() => props.amount, v => amountLocal.value = v)
watch(() => props.colorMorph, v => colorLocal.value = v)
watch(() => props.burstMs, v => { if (typeof v === 'number') burstMsLocal.value = v })

// emit locals -> parent
watch(enabledLocal, v => {
    emit('update:enabled', v)
    emit('update:attackBurst', v) // Burst always follows enabled
})
watch(amountLocal, v => emit('update:amount', Math.max(0, Math.min(1, v))))
watch(colorLocal, v => emit('update:colorMorph', Math.max(0, Math.min(1, v))))
watch(burstMsLocal, v => emit('update:burstMs', Math.max(5, Math.min(250, Math.round(v)))))

// also on mount, ensure parent gets synced burst state once
if (props.attackBurst !== props.enabled) {
    emit('update:attackBurst', props.enabled)
}

// misc
const accent = computed(() => props.color)

/* ---------- Color stops & swatch ---------- */
const stops = [
    { pos: 0.00, name: 'Brown', hex: '#6a4b2f' },
    { pos: 0.25, name: 'Pink', hex: '#f5a3bd' },
    { pos: 0.50, name: 'White', hex: '#ffffff' },
    { pos: 0.75, name: 'Blue', hex: '#7bbcff' },
    { pos: 1.00, name: 'Violet', hex: '#c7a4ff' },
] as const

const colorLabel = computed(() => {
    const t = colorLocal.value
    let nearest = stops[0], best = Infinity
    for (const s of stops) {
        const d = Math.abs(s.pos - t)
        if (d < best) { best = d; nearest = s }
    }
    return nearest.name
})

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '').trim()
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return [r, g, b]
}
function rgbToHex(r: number, g: number, b: number): string {
    const to2 = (n: number) => n.toString(16).padStart(2, '0')
    return `#${to2(Math.round(r))}${to2(Math.round(g))}${to2(Math.round(b))}`
}
function mixHex(a: string, b: string, w: number): string {
    const [ar, ag, ab] = hexToRgb(a)
    const [br, bg, bb] = hexToRgb(b)
    const ir = ar + (br - ar) * w
    const ig = ag + (bg - ag) * w
    const ib = ab + (bb - ab) * w
    return rgbToHex(ir, ig, ib)
}

const swatchHex = computed(() => {
    const t = Math.min(1, Math.max(0, colorLocal.value))
    let a = stops[0], b = stops[stops.length - 1]
    for (let i = 0; i < stops.length - 1; i++) {
        const s0 = stops[i], s1 = stops[i + 1]
        if (t >= s0.pos && t <= s1.pos) { a = s0; b = s1; break }
    }
    const span = Math.max(1e-6, b.pos - a.pos)
    const w = (t - a.pos) / span
    return mixHex(a.hex, b.hex, w)
})

/* ---------- Per-Pad Noise mask helpers ---------- */
const hasMask = computed(() => Array.isArray(props.mask) && props.mask.length > 0)

function updateMask(make: (i: number, len: number) => boolean) {
    const len = props.mask?.length ?? 0
    if (len <= 0) return
    const out = Array.from({ length: len }, (_, i) => !!make(i, len))
    emit('update:mask', out)
}
function maskAll() { updateMask(() => true) }
function maskClear() { updateMask(() => false) }
function maskEvery2() { updateMask((i) => i % 2 === 0) }
function maskInvert() { if (!props.mask) return; emit('update:mask', props.mask.map(v => !v)) }
function maskRandom() { updateMask(() => Math.random() < 0.5) }
function maskBackbeat() {
    updateMask((i, len) => {
        const perBeat = Math.max(1, Math.round(len / 4))
        const beatIdx = Math.floor(i / perBeat) + 1
        const isDownbeatStep = (i % perBeat) === 0
        return isDownbeatStep && (beatIdx === 2 || beatIdx === 4)
    })
}
// function maskBeats23() {
//     updateMask((i, len) => {
//         const perBeat = Math.max(1, Math.round(len / 4))
//         const beatIdx = Math.floor(i / perBeat) + 1
//         const isDownbeatStep = (i % perBeat) === 0
//         return isDownbeatStep && (beatIdx === 2 || beatIdx === 3)
//     })
// }
</script>

<style scoped>
/* Layout: left controls row + right mask tools */
.noise-layout {
    display: grid;
    /* FR units avoid % + gap overflow. Right rail capped so it wraps nicely. */
    /* grid-template-columns: minmax(0, 3fr) minmax(220px, 340px); */
    grid-template-columns: minmax(0, 3fr) minmax(204px, 204px);

    gap: 12px;
    align-items: start;
    min-width: 0;
    /* allow children to shrink inside */
}

/* Four compact columns: dot + 3 knobs */
.controls-row {
    display: grid;
    grid-auto-flow: column;
    /* grid-template-columns: auto repeat(3, minmax(64px, 1fr)); */
    justify-content: start;
    /* keep the knobs left-aligned */
    align-items: center;
    gap: 10px;
    min-width: 0;
}


.control-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: auto;
}

/* Swatch */
.swatch-wrap {
    width: 100%;
}

.swatch {

    height: 9px;
    border-radius: 1px;
    border: none;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05);
    transition: background-color 120ms linear;
    font-size: 10px;
    color: black;
    line-height: 9px;
    text-align: center;
}

/* Right column: stacked groups */
.mask-col {
    min-width: 0;
    max-width: 340px;
}

.mask-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.pt-btn-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px !important;
}

.pt-btn {
    min-width: 64px;
    min-height: auto;
    line-height: 1;
    font-size: 0.65rem;
    width: 56px;
    padding: 4px;
}

/* The inline dot lives in this component now */
.pt-dot {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 45%);
    background: var(--pt-surface-2);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05);
    cursor: pointer;
    transition: transform .12s ease, filter .2s ease, box-shadow .25s ease;
}

.pt-dot:hover {
    transform: scale(1.06);
}

.pt-dot.is-on {
    background: hsl(var(--pt-accent) 80% 60%);
    box-shadow:
        0 0 0 3px hsl(var(--pt-accent) 90% 60% / .18),
        0 0 12px var(--pt-btn-glow);
}

/* Stack on narrow screens */
@media (max-width: 640px) {
    .noise-layout {
        grid-template-columns: 1fr;
    }
}
</style>

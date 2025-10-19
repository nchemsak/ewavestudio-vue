<template>
  <KnobGroup v-model="enabledLocal" title="Noise" :color="accent" :showToggle="showToggle">
    <div class="noise-row">
      <!-- Color morph (swatch above knob) -->
      <div class="noise-color">
        <!-- <div class="label-wrap">
          <span class="label">Color</span>
        </div> -->

        <!-- Live swatch (solid, interpolated color) -->
        <div
          class="swatch-wrap"
          :aria-label="`Noise color swatch: ${colorLabel}`"
          :title="colorLabel"
        >
          <div class="swatch" :style="{ backgroundColor: swatchHex }" />
        </div>

        <!-- Knob -->
        <Knob
          v-model="colorLocal"
          aria-label="Noise color morph"
          :min="0" :max="1" :step="0.01"
          size="small"
          :color="accent"
          :disabled="!enabledLocal"
          @knobStart="activeKnob = 'colorMorph'"
          @knobEnd="activeKnob = null"
        />
        <span v-if="activeKnob === 'colorMorph'" class="custom-tooltip">
          {{ Math.round(colorLocal * 100) }}%
        </span>
      </div>

      <!-- Amount -->
      <div class="noise-knob">
        <Knob
          v-model="amountLocal"
          label="Amount"
          :min="0" :max="1" :step="0.01"
          size="small" :color="accent"
          :disabled="!enabledLocal"
          @knobStart="activeKnob = 'noiseAmount'"
          @knobEnd="activeKnob = null"
        />
        <span v-if="activeKnob === 'noiseAmount'" class="custom-tooltip">
          {{ Math.round(amountLocal * 100) }}%
        </span>
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
 *  - v-model:colorMorph   0..1 (0=brown, 0.25=pink, 0.5=white, 0.75=blue, 1=violet)
 */

const props = withDefaults(defineProps<{
  enabled: boolean
  amount: number
  colorMorph: number
  color?: string
  showToggle?: boolean
}>(), {
  enabled: false,
  amount: 0.25,
  colorMorph: 0.5,
  color: '#9C27B0',
  showToggle: true
})

const emit = defineEmits<{
  (e: 'update:enabled', v: boolean): void
  (e: 'update:amount', v: number): void
  (e: 'update:colorMorph', v: number): void
}>()

// locals
const enabledLocal = ref(props.enabled)
const amountLocal  = ref(props.amount)
const colorLocal   = ref(props.colorMorph)
const activeKnob   = ref<null | 'noiseAmount' | 'colorMorph'>(null)

watch(() => props.enabled, v => enabledLocal.value = v)
watch(() => props.amount, v => amountLocal.value = v)
watch(() => props.colorMorph, v => colorLocal.value = v)

watch(enabledLocal, v => emit('update:enabled', v))
watch(amountLocal,  v => emit('update:amount', Math.max(0, Math.min(1, v))))
watch(colorLocal,   v => emit('update:colorMorph', Math.max(0, Math.min(1, v))))

const accent = computed(() => props.color)

// ----- Stops + helpers -----
const stops = [
  { pos: 0.00, name: 'Brown',  hex: '#6a4b2f' },
  { pos: 0.25, name: 'Pink',   hex: '#f5a3bd' },
  { pos: 0.50, name: 'White',  hex: '#ffffff' },
  { pos: 0.75, name: 'Blue',   hex: '#7bbcff' },
  { pos: 1.00, name: 'Violet', hex: '#c7a4ff' },
] as const

// For accessibility tooltip/aria only (not shown visually)
const colorLabel = computed(() => {
  const t = colorLocal.value
  let nearest = stops[0], best = Infinity
  for (const s of stops) {
    const d = Math.abs(s.pos - t)
    if (d < best) { best = d; nearest = s }
  }
  return nearest.name
})

// Interpolated hex between adjacent stops at t∈[0,1]
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#','').trim()
  const r = parseInt(h.slice(0,2), 16)
  const g = parseInt(h.slice(2,4), 16)
  const b = parseInt(h.slice(4,6), 16)
  return [r,g,b]
}
function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (n:number) => n.toString(16).padStart(2, '0')
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
  // find adjacent stops
  let a = stops[0], b = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    const s0 = stops[i], s1 = stops[i + 1]
    if (t >= s0.pos && t <= s1.pos) { a = s0; b = s1; break }
  }
  const span = Math.max(1e-6, b.pos - a.pos)
  const w = (t - a.pos) / span
  return mixHex(a.hex, b.hex, w)
})
</script>

<style scoped>
.noise-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--pt-gap);
}

/* Vertical stack inside the color block */
.noise-color {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

/* Simple label row (no color name text) */
.label-wrap {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.label { font-weight: 600; opacity: .85; }

/* Swatch */
.swatch-wrap { width: 100%; }
.swatch {
  height: 9px;
  border-radius: 1px;
  /* border: 1px solid var(--pt-hairline, #2a2f3a); */
  border: none;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.05);
  /* gentle fade between colors */
  transition: background-color 120ms linear;
}

.noise-knob { justify-self: end; }

@media (max-width: 560px) {
  .noise-row { grid-template-columns: 1fr; }
  .noise-knob { margin-top: 6px; justify-self: start; }
}
</style>

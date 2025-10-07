<template>
  <div class="pt-subblock">
    <div class="pt-subheader">
      <div class="pt-section-title">{{ title }}</div>

      <!-- optional enable switch -->
      <label v-if="showToggle" class="pt-switch">
        <input type="checkbox" v-model="localEnabled" aria-label="Enable envelope" />
        <span></span>
      </label>
    </div>

    <div class="pt-knob-row">
      <!-- Attack -->
      <div class="position-relative text-center">
        <Knob
          v-model="attackNorm"
          label="Attack"
          size="small"
          :min="0" :max="100" :step="1"
          :disabled="!localEnabled"
          :color="color"
          @knobStart="onAttackStart"
          @knobEnd="onAttackEnd"
        />
        <span v-if="activeKnob === 'attack'" class="custom-tooltip">
          {{ Math.round(attackMsLocal) }} ms
        </span>
      </div>

      <!-- Decay -->
      <div class="position-relative text-center">
        <Knob
          v-model="decayNorm"
          label="Decay"
          size="small"
          :min="0" :max="100" :step="1"
          :disabled="!localEnabled"
          :color="color"
          @knobStart="onDecayStart"
          @knobEnd="onDecayEnd"
        />
        <span v-if="activeKnob === 'decay'" class="custom-tooltip">
          {{ Math.round(decayMsLocal) }} ms
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Knob from '../Knob.vue'

const props = withDefaults(defineProps<{
  enabled: boolean
  attackMs: number
  decayMs: number
  title?: string
  color?: string
  showToggle?: boolean
  attackMinMs?: number
  attackMaxMs?: number
  decayMinMs?: number
  decayMaxMs?: number
  attackLog?: boolean
  decayLog?: boolean
}>(), {
  title: 'Envelope',
  color: '#4CAF50',
  showToggle: false,
  attackMinMs: 1,
  attackMaxMs: 100,
  decayMinMs: 50,
  decayMaxMs: 2000,
  attackLog: true,
  decayLog: false
})

const emit = defineEmits<{
  (e: 'update:enabled', v: boolean): void
  (e: 'update:attackMs', v: number): void
  (e: 'update:decayMs', v: number): void
  // new: surface knob press/release so parent can react
  (e: 'attack-knob-start'): void
  (e: 'attack-knob-end'): void
  (e: 'decay-knob-start'): void
  (e: 'decay-knob-end'): void
}>()

const localEnabled = ref(props.enabled)
const attackNorm = ref(msToNorm(props.attackMs ?? 20, props.attackMinMs, props.attackMaxMs, props.attackLog))
const decayNorm = ref(msToNorm(props.decayMs ?? 400, props.decayMinMs, props.decayMaxMs, props.decayLog))
const attackMsLocal = ref(normToMs(attackNorm.value, props.attackMinMs, props.attackMaxMs, props.attackLog))
const decayMsLocal = ref(normToMs(decayNorm.value, props.decayMinMs, props.decayMaxMs, props.decayLog))

watch(() => props.enabled, v => (localEnabled.value = v))
watch(() => props.attackMs, v => {
  const ms = clampMs(v ?? 20, props.attackMinMs, props.attackMaxMs)
  attackNorm.value = msToNorm(ms, props.attackMinMs, props.attackMaxMs, props.attackLog)
  attackMsLocal.value = ms
})
watch(() => props.decayMs, v => {
  const ms = clampMs(v ?? 400, props.decayMinMs, props.decayMaxMs)
  decayNorm.value = msToNorm(ms, props.decayMinMs, props.decayMaxMs, props.decayLog)
  decayMsLocal.value = ms
})

watch(localEnabled, v => emit('update:enabled', v))
watch(attackNorm, n => {
  const ms = normToMs(n, props.attackMinMs, props.attackMaxMs, props.attackLog)
  attackMsLocal.value = ms
  emit('update:attackMs', Math.round(ms))
})
watch(decayNorm, n => {
  const ms = normToMs(n, props.decayMinMs, props.decayMaxMs, props.decayLog)
  decayMsLocal.value = ms
  emit('update:decayMs', Math.round(ms))
})

const activeKnob = ref<null | 'attack' | 'decay'>(null)

// Emitters that also manage the tooltip state
function onAttackStart() {
  activeKnob.value = 'attack'
  emit('attack-knob-start')
}
function onAttackEnd() {
  activeKnob.value = null
  emit('attack-knob-end')
}
function onDecayStart() {
  activeKnob.value = 'decay'
  emit('decay-knob-start')
}
function onDecayEnd() {
  activeKnob.value = null
  emit('decay-knob-end')
}

// helpers
function clampMs(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)) }
function normToMs(norm: number, min: number, max: number, log: boolean) {
  const t = Math.max(0, Math.min(100, norm)) / 100
  if (!log) return min + (max - min) * t
  const ratio = max / min
  return min * Math.pow(ratio, t)
}
function msToNorm(ms: number, min: number, max: number, log: boolean) {
  const x = clampMs(ms, min, max)
  if (!log) return ((x - min) / (max - min)) * 100
  const ratio = max / min
  return (Math.log(x / min) / Math.log(ratio)) * 100
}
</script>

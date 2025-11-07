<!-- src/components/effects/ReverbEffect.vue -->
<template>
  <div class="pt-section">
    <div class="group-title">Reverb</div>

    <div class="pt-subblock">
      <div class="pt-row" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">

        <!-- Optional toggle (hidden by default, matches your other modules) -->
        <button
          v-if="showToggle"
          class="pt-dot"
          :class="{ 'is-on': modelEnabled }"
          :aria-pressed="modelEnabled"
          title="Toggle reverb"
          @click="$emit('update:enabled', !modelEnabled)"
        />

        <!-- Mix -->
        <div class="position-relative text-center">
          <Knob
            v-model="localMix"
            label="Mix"
            :min="0"
            :max="1"
            :step="0.01"
            size="small"
            :disabled="!modelEnabled"
            @update:modelValue="$emit('update:mix', localMix)"
            @knobStart="activeKnob = 'mix'"
            @knobEnd="activeKnob = null"
          />
          <span v-if="activeKnob === 'mix'" class="custom-tooltip">
            {{ Math.round(localMix * 100) }}%
          </span>
        </div>

        <!-- Decay (s) -->
        <div class="position-relative text-center">
          <Knob
            v-model="localDecay"
            label="Decay"
            :min="0.2"
            :max="4.0"
            :step="0.05"
            size="small"
            :disabled="!modelEnabled"
            @update:modelValue="$emit('update:decay', localDecay)"
            @knobStart="activeKnob = 'decay'"
            @knobEnd="activeKnob = null"
          />
          <span v-if="activeKnob === 'decay'" class="custom-tooltip">
            {{ localDecay.toFixed(2) }} s
          </span>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Knob from '../Knob.vue';

const props = defineProps<{
  showToggle?: boolean;
  enabled: boolean;
  mix: number;
  decay: number;                 // seconds
  audioCtx?: AudioContext;       // kept for API parity with other effects (unused here)
}>();

const emit = defineEmits<{
  (e: 'update:enabled', v: boolean): void;
  (e: 'update:mix', v: number): void;
  (e: 'update:decay', v: number): void;
}>();

const modelEnabled = computed(() => props.enabled);

// Locals
const localMix = ref(props.mix);
const localDecay = ref(props.decay);

// Track which knob is currently being adjusted (for tooltip)
const activeKnob = ref<null | 'mix' | 'decay'>(null);

// Keep in sync with parent
watch(() => props.mix, v => { if (v !== localMix.value) localMix.value = v; });
watch(() => props.decay, v => { if (v !== localDecay.value) localDecay.value = v; });
</script>

<style scoped>
.group-title {
  font-weight: 600;
  margin-bottom: 6px;
}

/* Utility to anchor tooltips above individual knobs */
.position-relative {
  position: relative;
}

/* Matches the lightweight tooltip style used elsewhere; tweak if you have a global version */
.custom-tooltip {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: -22px;                 /* raise above the knob */
  padding: 2px 6px;
  font-size: 12px;
  line-height: 1.2;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}
</style>

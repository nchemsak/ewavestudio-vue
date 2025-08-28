<!-- components/modules/UnisonEffect.vue -->
<template>
    <KnobGroup v-model="localEnabled" title="Unison" :color="color" :showToggle="showToggle">
        <div class="pt-knob-row">
            <!-- Voices -->
            <div class="position-relative text-center">
                <Knob v-model="localVoices" size="small" :min="1" :max="6" :step="1" label="Voices" :color="color"
                    :disabled="!localEnabled" @knobStart="activeKnob = 'voices'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'voices'" class="custom-tooltip">
                    {{ localVoices }}
                </span>
            </div>

            <!-- Detune -->
            <div class="position-relative text-center">
                <Knob v-model="localDetune" size="small" :min="0" :max="100" :step="1" label="Detune" :color="color"
                    :disabled="!localEnabled" @knobStart="activeKnob = 'detune'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'detune'" class="custom-tooltip">
                    {{ localDetune }}¢
                </span>
            </div>

            <!-- Stereo Spread -->
            <div class="position-relative text-center">
                <Knob v-model="localSpread" size="small" :min="0" :max="100" :step="1" label="Spread" :color="color"
                    :disabled="!localEnabled" @knobStart="activeKnob = 'spread'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'spread'" class="custom-tooltip">
                    {{ localSpread }}%
                </span>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'

const props = withDefaults(defineProps < {
    enabled: boolean
  voices: number
  detune: number     // cents
  spread: number     // percent
  color?: string
  showToggle?: boolean
} > (), {
    enabled: false,
    voices: 3,
    detune: 10,
    spread: 50,
    color: '#27fcff',
    showToggle: true,   // keep the on/off ability visible
})

const emit = defineEmits < {
  (e: 'update:enabled', v: boolean): void
    (e: 'update:voices', v: number): void
        (e: 'update:detune', v: number): void
            (e: 'update:spread', v: number): void
}> ()

const activeKnob = ref < null | 'voices' | 'detune' | 'spread' > (null)

/* local mirrors for smooth knob UX */
const localEnabled = ref(props.enabled)
const localVoices = ref(props.voices)
const localDetune = ref(props.detune)
const localSpread = ref(props.spread)

/* emit updates (clamped just in case) */
watch(localEnabled, v => emit('update:enabled', v))
watch(localVoices, v => emit('update:voices', Math.max(1, Math.min(6, Math.round(v)))))
watch(localDetune, v => emit('update:detune', Math.max(0, Math.min(100, Math.round(v)))))
watch(localSpread, v => emit('update:spread', Math.max(0, Math.min(100, Math.round(v)))))

/* sync down from parent */
watch(() => props.enabled, v => (localEnabled.value = v))
watch(() => props.voices, v => (localVoices.value = v))
watch(() => props.detune, v => (localDetune.value = v))
watch(() => props.spread, v => (localSpread.value = v))
</script>

<style scoped>
</style>

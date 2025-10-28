<!-- src/components/effects/ReverbEffect.vue -->
<template>
    <div class="pt-section">
        <div class="group-title">Reverb</div>

        <div class="pt-subblock">
            <div class="pt-row" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">

                <!-- Optional toggle (hidden by default, matches your other modules) -->
                <button v-if="showToggle" class="pt-dot" :class="{ 'is-on': modelEnabled }" :aria-pressed="modelEnabled"
                    title="Toggle reverb" @click="$emit('update:enabled', !modelEnabled)" />

                <!-- Mix -->
                <Knob v-model="localMix" label="Mix" :min="0" :max="1" :step="0.01" size="small"
                    :disabled="!modelEnabled" @update:modelValue="$emit('update:mix', localMix)" />

                <!-- Decay (s) -->
                <Knob v-model="localDecay" label="Decay" :min="0.2" :max="4.0" :step="0.05" size="small"
                    :disabled="!modelEnabled" @update:modelValue="$emit('update:decay', localDecay)" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Knob from '../Knob.vue'

const props = defineProps<{
    showToggle?: boolean
    enabled: boolean
    mix: number
    decay: number       // seconds
    audioCtx?: AudioContext // kept for API parity with other effects (unused here)
}>()

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void
    (e: 'update:mix', v: number): void
    (e: 'update:decay', v: number): void
}>()

const modelEnabled = computed(() => props.enabled)

const localMix = ref(props.mix)
const localDecay = ref(props.decay)

watch(() => props.mix, v => { if (v !== localMix.value) localMix.value = v })
watch(() => props.decay, v => { if (v !== localDecay.value) localDecay.value = v })
</script>

<style scoped>
.group-title {
    font-weight: 600;
    margin-bottom: 6px;
}
</style>

<template>
    <KnobGroup :showToggle="false" v-model="localEnabled" title="Unison" color="#27fcff">
        <!-- Voices -->
        <div class="position-relative text-center">
            <Knob v-model="localVoices" size="small" :min="1" :max="6" :step="1" label="Voices" color="#27fcff"
                :disabled="!localEnabled" @knobStart="activeKnob = 'voices'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'voices'" class="custom-tooltip">{{ localVoices }}</span>
        </div>

        <!-- Detune -->
        <div class="position-relative text-center">
            <Knob v-model="localDetune" size="small" :min="0" :max="100" :step="1" label="Detune" color="#27fcff"
                :disabled="!localEnabled" @knobStart="activeKnob = 'detune'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'detune'" class="custom-tooltip">{{ localDetune }}¢</span>
        </div>

        <!-- Stereo Spread -->
        <div class="position-relative text-center">
            <Knob v-model="localSpread" size="small" :min="0" :max="100" :step="1" label="Spread" color="#27fcff"
                :disabled="!localEnabled" @knobStart="activeKnob = 'spread'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'spread'" class="custom-tooltip">{{ localSpread }}%</span>
        </div>
    </KnobGroup>
</template>

<script setup>
import { ref, watch } from 'vue';
import Knob from './Knob.vue';
import KnobGroup from './KnobGroup.vue';

const props = defineProps({
    enabled: { type: Boolean, default: false },
    voices: { type: Number, default: 3 },
    detune: { type: Number, default: 10 },     // cents
    spread: { type: Number, default: 50 }       // percent
});

const emit = defineEmits(['update:enabled', 'update:voices', 'update:detune', 'update:spread']);

const activeKnob = ref(null);

// local copies so knob changes v-model outward cleanly
const localEnabled = ref(props.enabled);
const localVoices = ref(props.voices);
const localDetune = ref(props.detune);
const localSpread = ref(props.spread);

watch(localEnabled, v => emit('update:enabled', v));
watch(localVoices, v => emit('update:voices', v));
watch(localDetune, v => emit('update:detune', v));
watch(localSpread, v => emit('update:spread', v));

// keep in sync if parent updates externally
watch(() => props.enabled, v => (localEnabled.value = v));
watch(() => props.voices, v => (localVoices.value = v));
watch(() => props.detune, v => (localDetune.value = v));
watch(() => props.spread, v => (localSpread.value = v));
</script>

<style scoped>
/* .custom-tooltip {
    position: absolute;
    transform: translate(-50%, -8px);
    left: 50%;
    top: 0;
    background: rgba(0, 0, 0, .9);
    color: #fff;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
} */
</style>

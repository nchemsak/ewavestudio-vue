<template>
  <KnobGroup v-model="localEnabled" title="Reverb" :color="color" :showToggle="showToggle" :showHeader="false">
    <div class="reverb-pedal">
      <div class="panel-top">
        <span class="check-led" :class="{ on: localEnabled }" aria-hidden="true"></span>

        <div class="knob-cell mix">
          <Knob v-model="localMix" label="Mix" :min="0" :max="1" :step="0.01" size="small" :disabled="!localEnabled"
            :color="color" @knobStart="activeKnob = 'mix'" @knobEnd="activeKnob = null" />
          <span v-if="activeKnob === 'mix'" class="custom-tooltip">
            {{ Math.round(localMix * 100) }}%
          </span>
        </div>

        <div class="knob-cell decay">
          <Knob v-model="localDecay" label="Decay" :min="0.2" :max="4.0" :step="0.05" size="small"
            :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'decay'" @knobEnd="activeKnob = null" />
          <span v-if="activeKnob === 'decay'" class="custom-tooltip">
            {{ localDecay.toFixed(2) }} s
          </span>
        </div>
      </div>

      <div class="panel-seam" aria-hidden="true"></div>

      <div class="panel-bottom">
        <button class="footswitch" type="button" :aria-pressed="localEnabled" @click="localEnabled = !localEnabled"
          @keydown.space.prevent="localEnabled = !localEnabled" @keydown.enter.prevent="localEnabled = !localEnabled" />
      </div>
    </div>
  </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';

const props = withDefaults(defineProps<{
  showToggle?: boolean;
  enabled: boolean;
  mix: number;
  decay: number;
  audioCtx?: AudioContext;
  color?: string;
}>(), {
  showToggle: true,
  color: '#7c9bff'
});

const emit = defineEmits<{
  (e: 'update:enabled', v: boolean): void;
  (e: 'update:mix', v: number): void;
  (e: 'update:decay', v: number): void;
}>();

const localEnabled = ref<boolean>(props.enabled);
const localMix = ref<number>(props.mix);
const localDecay = ref<number>(props.decay);

const activeKnob = ref<null | 'mix' | 'decay'>(null);

/* Emits */
watch(localEnabled, v => emit('update:enabled', v));
watch(localMix, v => emit('update:mix', Math.max(0, Math.min(1, v))));
watch(localDecay, v => emit('update:decay', Math.max(0.2, Math.min(4.0, v))));

/* Props → local mirrors */
watch(() => props.enabled, v => (localEnabled.value = v));
watch(() => props.mix, v => { if (v !== localMix.value) localMix.value = v; });
watch(() => props.decay, v => { if (v !== localDecay.value) localDecay.value = v; });
</script>

<style scoped>
.reverb-pedal {
  display: grid;
  grid-template-rows: auto 25px auto;
  width: 100%;
}

.panel-top {
  position: relative;
  border-radius: 8px 8px 0 0;
  padding: 12px 12px 10px;
  background: linear-gradient(#f1df8f, #ebbd54);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .35),
    0 1px 0 rgba(0, 0, 0, .35);

  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto;
  grid-template-areas:
    "led  led"
    "mix  decay";
  align-items: center;
  justify-items: center;
}

.check-led {
  grid-area: led;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #7a1f19;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .55) inset;
  margin-top: 2px;
}

.check-led.on {
  background: #e53935;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, .55) inset,
    0 0 8px 3px rgba(229, 57, 53, .6),
    0 0 18px 6px rgba(229, 57, 53, .35);
}

.mix {
  grid-area: mix;
}

.decay {
  grid-area: decay;
}

.knob-cell {
  width: min-content;
  text-align: center;
  position: relative;
  justify-self: center;
}

.custom-tooltip {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: -22px;
  padding: 2px 6px;
  font-size: 12px;
  line-height: 1.2;
  background: rgba(0, 0, 0, .85);
  color: #fff;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

.panel-seam {
  height: 25px;
  border-radius: 2px;
  background: linear-gradient(#efe18a, #e1b952);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .35);
}

.panel-bottom {
  border-radius: 8px;
  padding: 8px;
  background: linear-gradient(#f0d367, #ebbd54);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .3),
    0 1px 0 rgba(0, 0, 0, .35);
}

.footswitch {
  display: block;
  width: 100%;
  height: 96px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(#3f3c3f, #2d2b2f);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .06),
    inset 0 -10px 16px rgba(0, 0, 0, .35);
  cursor: pointer;
  position: relative;
}

.footswitch::before {
  content: "";
  position: absolute;
  inset: 8px;
  border-radius: 8px;
  box-shadow: 0 0 0 2px #caa84a inset;
  opacity: .8;
  pointer-events: none;
}

.footswitch:active {
  transform: translateY(1px);
  filter: brightness(.96);
}
</style>

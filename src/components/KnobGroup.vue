<!-- components/KnobGroup.vue -->
<template>
  <div class="knob-group">
    <div class="knob-group-header" :class="{ inactive: !enabled }">
      <div class="effect-toggle" :style="{ backgroundColor: enabled ? color : '#666' }" @click="enabled = !enabled"></div>
      <span class="group-title">{{ title }}</span>
    </div>
    <div class="knob-stack" :class="{ disabled: !enabled }">
      <slot :enabled="enabled"></slot>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits } from 'vue';

const props = defineProps({
  title: String,
  color: { type: String, default: '#23CDE8' },
  modelValue: Boolean // v-model binding for enabled state
});
const emit = defineEmits(['update:modelValue']);

const enabled = ref(props.modelValue);

watch(() => props.modelValue, val => (enabled.value = val));
watch(enabled, val => emit('update:modelValue', val));
</script>

<style scoped>
.knob-group {
  background-color: #2c2c2c;
  padding: 10px;
  border-radius: 6px;
}

.knob-group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 2px solid #1d1d1d;
  margin-bottom: 12px;
}

.knob-group-header .effect-toggle {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 0.2s;
}

.group-title {
  font-weight: 500;
  color: #fff;
  font-size: 1rem;
}

.knob-group-header.inactive .group-title {
  color: #888;
}

.knob-stack.disabled .knob-label {
  color: #666;
}

.knob-stack.disabled ::v-deep(.dial-svg path:nth-child(2)) {
  stroke: #555 !important;
}
</style>

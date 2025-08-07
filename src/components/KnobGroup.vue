<!-- components/KnobGroup.vue -->

<template>
    <div class="knob-group">
        <!-- HEADER -->
        <div class="knob-group-header toggle-header" :class="{ inactive: !enabled }">
            <!-- Toggle dot -->
            <div v-if="showToggle" class="effect-toggle" :style="{ backgroundColor: enabled ? color : '#666' }"
                @click="enabled = !enabled"></div>

            <!-- Title (clickable toggle) -->
            <span class="group-title">{{ title }}</span>

            <!--  Injected content via named slot -->
            <slot name="header-content" />
        </div>

        <!-- KNOBS SLOT -->
        <div class="knob-stack" :class="{ disabled: !enabled }">
            <slot :enabled="enabled"></slot>
        </div>
    </div>
</template>


<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
    title: String,
    color: { type: String, default: '#23CDE8' },
    modelValue: Boolean, // v-model binding for enabled state
    showToggle: { type: Boolean, default: true }
});
const emit = defineEmits(['update:modelValue']);

const enabled = ref(props.modelValue);

watch(() => props.modelValue, val => (enabled.value = val));
watch(enabled, val => emit('update:modelValue', val));
</script>

<style scoped></style>

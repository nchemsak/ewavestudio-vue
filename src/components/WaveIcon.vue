<!-- components/WaveIcon.vue -->
<!-- Small line icon for a waveform (12×12, drawn in currentColor), for the step pads' badges and
     the pad settings. The big tiles in the Waveforms panel are WaveButton.vue. -->
<template>
    <svg class="wave-ico" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor"
        stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"
        preserveAspectRatio="xMidYMid meet">
        <path v-if="wave === 'triangle'" d="M2 10 L6 2 L10 10 Z" />
        <path v-else-if="wave === 'sawtooth'" d="M2 10 L2 2 L10 10 Z" />
        <rect v-else-if="wave === 'square'" x="2.2" y="2.2" width="7.6" height="7.6" rx="0.3" />
        <path v-else-if="wave === 'pulse'" d="M1.5 9.5 H4.5 V2.5 H6.5 V9.5 H10.5" />
        <path v-else-if="wave === 'organ'" d="M3 10 V5 M6 10 V2 M9 10 V6" />
        <template v-else-if="wave === 'hollow'">
            <circle cx="6" cy="6" r="3.8" />
            <circle cx="6" cy="6" r="1.3" />
        </template>
        <path v-else-if="wave === 'glass'" d="M6 1.6 L10.2 6 L6 10.4 L1.8 6 Z" />
        <circle v-else cx="6" cy="6" r="3.6" />
    </svg>
</template>

<script setup lang="ts">
defineProps<{ wave: string }>();
</script>

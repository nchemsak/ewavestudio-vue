<!-- components/LfoBendMark.vue -->
<!-- The LFO visualizer on a lit step pad (LFO target Pitch): a faint amber track for how far
     the LFO bends the note either way (an octave fills the track), and a bar that slides up
     (sharper) and down (flatter) with the LFO while something plays. Its own component, so
     only these marks redraw every frame, not the whole pad grid. -->
<template>
    <div v-if="view.bendRange != null" class="lfo-bend" aria-hidden="true"
        :style="{ '--range': view.bendRange, '--bend': view.bend ?? 0 }">
        <div class="lfo-bend-track" />
        <div v-if="view.bend != null" class="lfo-bend-bar" />
    </div>
</template>

<script setup lang="ts">
import type { LfoView } from '../lib/lfoVisual';

defineProps<{ view: LfoView }>();
</script>

<style scoped>
/* The pad's middle, clear of the wave badge at its foot */
.lfo-bend {
    position: absolute;
    left: 0;
    right: 0;
    top: 10%;
    bottom: 26%;
    pointer-events: none;
    z-index: 3;
}

.lfo-bend-track {
    position: absolute;
    left: 50%;
    width: 2px;
    top: calc(50% - var(--range) * 50%);
    height: calc(var(--range) * 100%);
    min-height: 4px;
    transform: translate(-50%, 0);
    border-radius: 1px;
    background: rgb(255 197 61 / 0.35);
}

.lfo-bend-bar {
    position: absolute;
    left: 24%;
    right: 24%;
    height: 3px;
    top: calc(50% - var(--bend) * 50%);
    transform: translateY(-50%);
    border-radius: 2px;
    background: var(--lfo-mod, #ffc53d);
    box-shadow: 0 0 4px rgb(255 197 61 / 0.7), 0 0 0 1px rgb(0 0 0 / 0.35);
}
</style>

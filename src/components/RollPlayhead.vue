<!-- src/components/RollPlayhead.vue
     The Melody Maker screen's playhead (PR 80): a line where the bar is now. A component of its
     own, so it alone redraws every frame (it reads `view.pos`; see usePlayhead.ts). -->
<template>
    <line v-if="view && view.line && view.pos != null" class="mm-playhead" :x1="x" :x2="x" y1="0" :y2="height" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PlayView } from '../composables/usePlayhead';

const props = defineProps<{ view?: PlayView | null; width: number; height: number; steps?: number }>();
const x = computed(() => ((props.view?.pos ?? 0) / (props.steps ?? 16)) * props.width);
</script>

<style scoped>
.mm-playhead {
    stroke: var(--mm-lcd-ink);
    stroke-opacity: 0.85;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
}
</style>

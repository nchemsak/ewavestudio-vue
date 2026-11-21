<!-- src/components/LevelMeter.vue -->
<!-- A machine's level as eight LEDs (the rail's meter, PR 116), for phone mode's Bass Sound page
     (PR 118): it reads `read()` every frame while `active()`, falling back smoothly. -->
<template>
    <span class="lm" role="meter" :aria-label="label" aria-valuemin="0" aria-valuemax="8" :aria-valuenow="lit"><b
            v-for="n in 8" :key="n" :class="{ on: n <= lit, hot: n >= 7 }"></b></span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { meterLeds } from '../lib/meter';

const props = defineProps<{ read: () => number; active: () => boolean; label: string }>();
const lit = ref(0);
let held = 0;
let frame = 0;
function loop() {
    frame = requestAnimationFrame(loop);
    held = Math.max(props.active() ? props.read() : 0, held * 0.88);
    const n = meterLeds(held);
    if (n !== lit.value) lit.value = n;
}
onMounted(() => { frame = requestAnimationFrame(loop); });
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<style scoped>
.lm {
    display: inline-grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 1px;
    width: 40px;
    height: 10px;
    vertical-align: middle;
}

.lm b {
    border-radius: 1px;
    background: rgba(0, 0, 0, 0.5);
}

.lm b.on {
    background: #3ddc97;
    box-shadow: 0 0 3px #3ddc97;
}

.lm b.on.hot {
    background: #ffd166;
    box-shadow: 0 0 3px #ffd166;
}
</style>

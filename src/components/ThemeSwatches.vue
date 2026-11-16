<!-- MOCKUP (plan item 1, option C): the three themes as swatches in the top bar, one click each -->
<template>
    <div class="ts" role="group" aria-label="Theme">
        <button v-for="t in LIST" :key="t.id" type="button" class="ts-b" :class="[`ts-${t.id}`, { on: theme === t.id }]"
            :aria-pressed="theme === t.id" :aria-label="`${t.name} theme`" :title="`${t.name} theme`" @click="setTheme(t.id)"></button>
    </div>
</template>

<script setup lang="ts">
import { useTheme } from '../composables/useTheme';
const { theme, setTheme } = useTheme();
const LIST = [{ id: 'dark', name: 'Dark' }, { id: 'synthwave', name: 'Synthwave' }, { id: 'analog', name: 'Analog' }] as const;
</script>

<style scoped>
.ts {
    display: inline-flex;
    gap: 6px;
    align-items: center;
}

.ts-b {
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid rgb(0 0 0 / .55);
    box-shadow: 0 0 0 1px rgb(255 255 255 / .18);
    cursor: pointer;
}

.ts-b.on {
    box-shadow: 0 0 0 2px var(--pt-text-strong, #fff);
}

.ts-dark { background: linear-gradient(135deg, #2a2d3a 50%, #7c86ff 50%); }
.ts-synthwave { background: linear-gradient(135deg, #ff5fd2 50%, #35d6ff 50%); }
.ts-analog { background: linear-gradient(135deg, #3a2a1c 50%, #ffb347 50%); }
</style>

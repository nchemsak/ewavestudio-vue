<template>
    <div class="pt-btn-group" role="group" aria-label="Theme">
        <button class="pt-btn hw-led-mini" :class="{ 'is-active': theme === 'dark' }" :aria-pressed="theme === 'dark'"
            @click="setTheme('dark')">Dark</button>
        <button class="pt-btn hw-led-mini" :class="{ 'is-active': theme === 'synthwave' }" :aria-pressed="theme === 'synthwave'"
            @click="setTheme('synthwave')">Synthwave</button>
        <button class="pt-btn hw-led-mini" :class="{ 'is-active': theme === 'analog' }" :aria-pressed="theme === 'analog'"
            @click="setTheme('analog')">Analog</button>
    </div>
</template>

<script setup lang="ts">
import { useTheme } from '../composables/useTheme';
const { theme, setTheme } = useTheme();
</script>

<style scoped>
/* The chosen theme's button stays down, its LED lit (_hardware.scss); the label sits a
   little lower, under the LED */
.pt-btn {
    padding-top: 10px;
    padding-bottom: 6px;
}
</style>

<template>
    <div class="pt-btn-group" role="group" aria-label="Theme">
        <button class="pt-btn" :class="{ 'is-active': theme === 'dark' }" @click="setTheme('dark')">Dark</button>
        <button class="pt-btn" :class="{ 'is-active': theme === 'light' }" @click="setTheme('light')">Light</button>
        <button class="pt-btn" :class="{ 'is-active': theme === 'synthwave' }"
            @click="setTheme('synthwave')">Synthwave</button>
    </div>
</template>

<script setup lang="ts">
import { useTheme } from '../composables/useTheme';
const { theme, setTheme } = useTheme();
</script>

<style scoped>
.pt-btn.is-active {
    box-shadow: 0 0 0 2px hsl(var(--pt-accent) 80% 60% / 0.35), 0 0 12px var(--pt-btn-glow);
}
</style>

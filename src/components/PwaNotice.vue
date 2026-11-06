<!-- components/PwaNotice.vue -->
<!-- "A new version is ready": shown when a deploy has been installed in the background
     (src/composables/usePwa.ts). Reload switches to it; Later keeps this version until the
     app is next opened. -->
<template>
    <div v-if="pwa.state.updateReady" class="pwa-notice" role="region" aria-label="New version">
        <span class="pwa-notice-msg" aria-live="polite">A new version of the app is ready.</span>
        <button type="button" class="pt-btn pt-btn-sm" title="It opens next time otherwise"
            @click="pwa.dismissUpdate()">Later</button>
        <button type="button" class="pt-btn pt-btn-sm pwa-notice-go" @click="pwa.applyUpdate()">Reload</button>
    </div>
</template>

<script setup lang="ts">
import { usePwa } from '../composables/usePwa'

const pwa = usePwa()
</script>

<style scoped>
/* The MIDI learn bar's look (MidiToolbar.vue), in the bottom-right corner */
.pwa-notice {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 1060;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100vw - 32px);
    padding: 8px 10px 8px 14px;
    border: 1px solid transparent;
    border-radius: var(--pt-radius-sm);
    background:
        linear-gradient(145deg, var(--pt-panel), var(--pt-surface-2)) padding-box,
        linear-gradient(90deg, hsl(var(--pt-accent) 84% 64% / 0.95), hsl(calc(var(--pt-accent) + 10) 84% 64% / 0.95)) border-box;
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.45);
    color: var(--pt-text);
    font-size: 0.85rem;
}

.pwa-notice .pt-btn {
    flex: 0 0 auto;
    white-space: nowrap;
}
</style>

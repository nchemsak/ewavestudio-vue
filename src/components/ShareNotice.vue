<!-- components/ShareNotice.vue -->
<!-- "Shared pattern: press Play": shown when the page opened a share link's project
     (projectStore.fromLink, src/composables/useProjectSync.ts). Browsers don't start audio
     before a tap, so it says to press Play, and its own Play button is that tap. It goes once
     playing starts, on ✕, or when another project is opened. -->
<template>
    <div v-if="show" class="share-notice" role="region" aria-label="Shared project">
        <span class="share-notice-msg" aria-live="polite">
            Shared pattern<template v-if="name">: <b>{{ name }}</b></template>. Press Play
            <span class="share-notice-sub">(not saved here until you Save)</span>
        </span>
        <button type="button" class="pt-btn pt-btn-sm share-notice-go" data-keeps-brush data-keeps-pad-settings
            @click="emit('play')">▶ Play</button>
        <button type="button" class="pt-btn pt-btn-sm" aria-label="Close" @click="dismissedId = store.projectId">✕</button>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useProjectStore } from '../stores/projectStore'

const props = defineProps<{ playing: boolean }>()
const emit = defineEmits<{ (e: 'play'): void }>()
const store = useProjectStore()

// The project whose notice was closed (or played)
const dismissedId = ref('')
watch(() => props.playing, (p) => { if (p) dismissedId.value = store.projectId })

const show = computed(() => store.fromLink && !!store.projectId && dismissedId.value !== store.projectId)
const name = computed(() => (store.name || '').trim())
</script>

<style scoped>
/* PwaNotice's look, at the bottom centre */
.share-notice {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    z-index: 2600; /* over phone mode and the Phone view button */
    display: flex;
    align-items: center;
    gap: 10px;
    width: max-content;
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

.share-notice-sub {
    opacity: 0.75;
    font-size: 0.8em;
}

.share-notice .pt-btn {
    flex: 0 0 auto;
    white-space: nowrap;
}

@media (max-width: 600px), (max-height: 500px) {
    .share-notice-sub {
        display: none;
    }
}
</style>

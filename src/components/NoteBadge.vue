<!-- src/components/NoteBadge.vue -->
<!-- The note playing, in the Melody Maker screen's corner (PR 125; until then TunerBadge.vue, a
     tuner that listened to the sound, which unison, FM and the pitch sweep led astray): the note
     the pattern plays now, as written (the hit under the playhead: Rhythm's or Bass's pad, a
     repeat's own note), or Drift's chord, for playing along on another instrument. It holds
     until the next hit and fades once playing stops. No cents: the app is always in tune. -->
<template>
    <div class="note-badge" :class="{ on: !!note }" aria-hidden="true">
        <b v-if="shown">{{ shown }}</b>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ note: string | null }>();
// The last note shown stays while the badge fades
const shown = ref<string | null>(props.note);
watch(() => props.note, (n) => { if (n) shown.value = n; });
</script>

<style scoped>
.note-badge {
    position: absolute;
    right: 6px;
    bottom: 6px;
    z-index: 3;
    min-width: 44px;
    padding: 2px 8px 3px;
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.6);
    text-align: center;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.4s;
}

.note-badge.on {
    opacity: 1;
    transition-duration: 0.1s;
}

.note-badge b {
    font: 700 18px/1.15 Cousine, ui-monospace, monospace;
    color: #fff;
    white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
    .note-badge {
        transition: none;
    }
}
</style>

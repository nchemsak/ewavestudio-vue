<template>
    <svg class="reverb-icon" viewBox="0 0 100 100" role="img" aria-label="Reverb">
        <defs>
            <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" :stop-color="colors[0]" />
                <stop offset="55%" :stop-color="colors[1]" />
                <stop offset="100%" :stop-color="colors[2]" />
            </linearGradient>
        </defs>

        <!-- soft back glow -->
        <g v-if="enabled" opacity="0.16">
            <circle cx="50" cy="52" r="34" :fill="colors[1]" />
        </g>

        <!-- emitter (small tile) -->
        <rect x="44" y="58" width="12" height="10" rx="2" :fill="enabled ? colors[0] : 'currentColor'"
            :opacity="enabled ? 0.9 : 0.6" />

        <!-- concentric arcs (reverb tail) -->
        <g fill="none" :stroke="`url(#${gid})`" stroke-linecap="round">
            <path d="M30 56 C 40 42, 60 42, 70 56" :opacity="enabled ? 0.95 : 0.75" :stroke-width="enabled ? 3 : 2" />
            <path d="M24 52 C 40 34, 60 34, 76 52" :opacity="enabled ? 0.75 : 0.55"
                :stroke-width="enabled ? 2.6 : 1.8" />
            <path d="M18 48 C 40 26, 60 26, 82 48" :opacity="enabled ? 0.55 : 0.4"
                :stroke-width="enabled ? 2.2 : 1.6" />
        </g>

        <!-- subtle gloss on the strongest arc -->
        <path d="M30 56 C 40 42, 60 42, 70 56" fill="none" stroke="white" stroke-opacity="0.10"
            :stroke-width="enabled ? 2.2 : 1.6" stroke-linecap="round" />
    </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
    enabled?: boolean;
    palette?: string[];
}>(), {
    enabled: true,
    palette: () => ['#7c9bff', '#9fe0ff', '#cba6ff']
});

const colors = computed(() =>
    (props.palette?.length ?? 0) >= 3 ? props.palette! : ['#9ad', '#bdf', '#cbd']
);

const uid = Math.random().toString(36).slice(2);
const gid = `grad-reverb-${uid}`;
</script>

<style scoped>
.reverb-icon {
    display: block;
    width: 72px;
    height: 72px;
}
</style>

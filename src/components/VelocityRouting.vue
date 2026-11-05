<!-- components/VelocityRouting.vue -->
<!-- Velocity routing panel, opened from the Step Sequencer's "Vel →" button: four bipolar
     amount knobs saying what a step's velocity does besides its loudness (src/audio/velocity.ts).
     Full-velocity steps always play the settings as shown; right of centre, softer steps get
     less (shorter, darker, smaller sweep, less noise); left of centre, more. -->
<template>
    <div class="vel-pop" role="dialog" aria-label="Velocity routing" @click.stop>
        <div class="vel-head">
            <strong class="vel-title">Velocity →</strong>
            <button type="button" class="vel-close" aria-label="Close" @click="emit('close')">×</button>
        </div>
        <p class="vel-help">
            A step's velocity can also shape its sound. Turn a knob right and softer steps get
            less of it, left and they get more. Full-velocity steps play as set.
        </p>

        <div class="vel-grid">
            <div v-for="d in DESTS" :key="d.key" class="position-relative text-center">
                <Knob :modelValue="values[d.key]" bipolar :label="d.label" size="small" :min="-100" :max="100"
                    :step="1" :color="color" :value-text="valueText(d, values[d.key])"
                    @update:modelValue="(v: number) => emit(`update:${d.key}` as any, Math.round(v))"
                    @knobStart="active = d.key" @knobEnd="active = null" />
                <span v-if="active === d.key" class="custom-tooltip">{{ tip(d, values[d.key]) }}</span>
            </div>
        </div>

        <p class="vel-hint">
            Set each step's velocity with ⋯ → Individual Pad Sliders, or with Humanize in Pattern Tools.
        </p>
        <button type="button" class="vel-reset" :disabled="!anyOn" @click="resetAll">Reset</button>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import Knob from './Knob.vue';

type Key = 'decay' | 'cutoff' | 'pitchEnv' | 'noise';

const props = withDefaults(defineProps<{
    decay: number;
    cutoff: number;
    pitchEnv: number;
    noise: number;
    color?: string;
}>(), { color: '#8E44AD' });

const emit = defineEmits<{
    (e: 'update:decay', v: number): void;
    (e: 'update:cutoff', v: number): void;
    (e: 'update:pitchEnv', v: number): void;
    (e: 'update:noise', v: number): void;
    (e: 'close'): void;
}>();

// What "less" means for each, for the tooltips and screen readers
const DESTS: { key: Key; label: string; less: string; more: string }[] = [
    { key: 'decay', label: 'Decay', less: 'shorter', more: 'longer' },
    { key: 'cutoff', label: 'Cutoff', less: 'darker', more: 'brighter' },
    { key: 'pitchEnv', label: 'Pitch', less: 'less pitch sweep', more: 'more pitch sweep' },
    { key: 'noise', label: 'Noise', less: 'less noise', more: 'more noise' },
];

const values = computed<Record<Key, number>>(() => ({
    decay: props.decay, cutoff: props.cutoff, pitchEnv: props.pitchEnv, noise: props.noise,
}));
const anyOn = computed(() => DESTS.some((d) => values.value[d.key] !== 0));
const active = ref<Key | null>(null);

const tip = (d: typeof DESTS[number], v: number) =>
    v === 0 ? 'Off' : `${v > 0 ? '+' : '−'}${Math.abs(v)}%: soft steps ${v > 0 ? d.less : d.more}`;
const valueText = (d: typeof DESTS[number], v: number) =>
    v === 0 ? 'off' : `${Math.abs(v)} percent: softer steps ${v > 0 ? d.less : d.more}`;

function resetAll() {
    for (const d of DESTS) emit(`update:${d.key}` as any, 0);
}
</script>

<style scoped>
.vel-pop {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 2001; /* above the page-wide overlay that closes it (z-index 2000) */
    width: min(290px, calc(100vw - 32px));
    padding: 10px 12px 12px;
    border-radius: 12px;
    background: var(--pt-panel, #1b1530);
    color: var(--pt-text);
    border: 1px solid var(--pt-hairline);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
}

.vel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.vel-title {
    font-size: 0.95rem;
}

.vel-close {
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.8;
}

.vel-help,
.vel-hint {
    margin: 6px 0 8px;
    font-size: 0.72rem;
    line-height: 1.35;
    opacity: 0.8;
}

.vel-hint {
    margin: 10px 0 8px;
    opacity: 0.65;
}

/* 2×2, like the Filter card */
.vel-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    justify-items: center;
    row-gap: 12px;
}

.vel-reset {
    font: inherit;
    font-size: 0.75rem;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--pt-hairline);
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.vel-reset:disabled {
    opacity: 0.4;
    cursor: default;
}

.vel-close:focus-visible,
.vel-reset:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 62%);
    outline-offset: 2px;
}
</style>

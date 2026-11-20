<!-- src/components/TunerBadge.vue -->
<!-- The tuner (PR 108; the big screen's F4 until then), in the Melody Maker screen's corner:
     the strongest note in what sounds (the pads' notes, MIDI notes), how far off in cents, and
     a needle. It shows while a note is heard and for a moment after, then fades. Its own loop
     reads the fine analyser (cardViews.ts) and changes what it shows at most ten times a
     second, so only this badge redraws. -->
<template>
    <div class="tuner-badge" :class="{ on: !!reading }" aria-hidden="true">
        <template v-if="shown">
            <b>{{ shown.name }}</b><span class="tb-cents">{{ shownCents }}</span>
            <span class="tb-needle" aria-hidden="true"><i :style="{ left: `${50 + Math.max(-50, Math.min(50, shown.cents))}%` }"
                    :class="{ near: Math.abs(shown.cents) <= 5 }"></i></span>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { tunerReading, type ViewSource } from './cardViews';

const props = defineProps<{ source: ViewSource; flats?: boolean }>();

type Reading = { name: string; cents: number; hz: number };
// What's heard now (null: nothing clear), and what the badge shows (the last reading, while it fades)
const reading = shallowRef<Reading | null>(null);
const shown = shallowRef<Reading | null>(null);
const HOLD_MS = 600;   // a note stays a moment after it stops being clear, as the Spectrum held it
const EVERY_MS = 100;  // the badge changes at most this often

const fmt = (c: number) => `${c > 0 ? '+' : c < 0 ? '−' : '±'}${Math.abs(c)}¢`;
const shownCents = computed(() => (shown.value ? fmt(shown.value.cents) : ''));

let frame = 0;
let bins: Uint8Array<ArrayBuffer> | null = null;
let lastHeard = 0;
let lastShown = 0;
function loop() {
    frame = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - lastShown < EVERY_MS) return;
    lastShown = now;
    const src = props.source;
    let r: Reading | null = null;
    if (src.active()) {
        const an = src.analyser;
        if (!bins || bins.length !== an.frequencyBinCount) bins = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(bins);
        r = tunerReading(bins, src.sampleRate / an.fftSize, !!props.flats);
    }
    if (r) {
        lastHeard = now;
        if (!shown.value || shown.value.name !== r.name || shown.value.cents !== r.cents) shown.value = r;
        reading.value = r;
    } else if (reading.value && now - lastHeard > HOLD_MS) {
        reading.value = null;
    }
}
onMounted(() => { frame = requestAnimationFrame(loop); });
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<style scoped>
.tuner-badge {
    position: absolute;
    right: 6px;
    bottom: 6px;
    z-index: 3;
    display: grid;
    grid-template-columns: auto auto;
    align-items: baseline;
    column-gap: 5px;
    padding: 2px 6px 4px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.6);
    color: var(--mm-ink, #cfe0ff);
    font: 10px Cousine, ui-monospace, monospace;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.4s;
}

.tuner-badge.on {
    opacity: 1;
    transition-duration: 0.1s;
}

.tuner-badge b {
    font-size: 12px;
    color: #fff;
}

.tb-needle {
    grid-column: 1 / -1;
    position: relative;
    width: 64px;
    height: 4px;
    margin-top: 2px;
    border-radius: 2px;
    background: linear-gradient(90deg, transparent calc(50% - 1px), var(--hw-led, #7dffb0) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)), rgba(255, 255, 255, 0.14);
}

.tb-needle i {
    position: absolute;
    top: -1px;
    width: 3px;
    height: 6px;
    margin-left: -1.5px;
    border-radius: 1px;
    background: var(--lfo-mod, #ffb547);
}

.tb-needle i.near {
    background: var(--hw-led, #7dffb0);
}

@media (prefers-reduced-motion: reduce) {
    .tuner-badge {
        transition: none;
    }
}
</style>

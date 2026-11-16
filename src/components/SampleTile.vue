<!-- src/components/SampleTile.vue -->
<!-- The Waveforms card's Sample: a sound recorded from the microphone, played by the pads as a
     wave (src/audio/sample.ts; recorded by useSampleRecorder.ts). Its REC button records (again);
     with a recording, the tile itself picks it for every pad, as a wave tile does, and shows
     it (a small picture of the recording, lit while every pad plays it). While recording it
     says what it's doing and shows the input's level.
     `layout`: 'tile', a tall tile beside Random; 'strip', a strip under the wave tiles. -->
<template>
    <div class="st" :class="[`st--${layout}`, { 'is-lit': lit, 'is-busy': busy }]">
        <button type="button" class="st-pick hw-cap" :class="{ 'is-active': lit }" :disabled="busy"
            :aria-pressed="lit ? 'true' : 'false'" :aria-label="hasSample ? 'Sample: play the recording on every pad' : 'Sample: record a sound'"
            :title="hasSample ? `Sample: the recording (${seconds} s) on every pad, as recorded on A3` : 'Sample: record a sound from the microphone'"
            @click="hasSample ? emit('pick') : emit('record')">
            <span class="st-pic" aria-hidden="true">
                <svg v-if="hasSample" :viewBox="`0 0 ${PIC_W} ${PIC_H}`" preserveAspectRatio="none">
                    <path :d="picPath" />
                </svg>
                <svg v-else class="st-mic" viewBox="0 0 24 24">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
                </svg>
            </span>
            <span class="st-label"><span class="hw-led" aria-hidden="true" />{{ caption }}</span>
        </button>

        <button type="button" class="st-rec" :class="{ 'is-on': busy }" data-keeps-brush
            :aria-label="busy ? 'Stop recording' : hasSample ? 'Record a new sample' : 'Record a sample'"
            :title="busy ? 'Stop' : 'Record about a second from the microphone: it starts when you make a sound'"
            @click="emit('record')">
            <span class="st-rec-dot" aria-hidden="true" />
            <span v-if="busy" class="st-meter" aria-hidden="true"><i :style="{ transform: `scaleX(${meter})` }" /></span>
        </button>

        <span class="visually-hidden" role="status" aria-live="polite">{{ status }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { decodeSample, sampleSeconds, type SampleData } from '../audio/sample';
import type { RecorderState } from '../composables/useSampleRecorder';

const props = withDefaults(defineProps<{
    sample: SampleData | null;
    state: RecorderState;
    level: number;     // the input's level while recording, 0..1
    lit: boolean;      // every pad plays the recording
    layout?: 'tile' | 'strip';
}>(), { layout: 'tile' });
const emit = defineEmits<{ (e: 'pick'): void; (e: 'record'): void }>();

const hasSample = computed(() => !!props.sample);
const busy = computed(() => props.state === 'asking' || props.state === 'listening' || props.state === 'recording');
const seconds = computed(() => (props.sample ? sampleSeconds(props.sample).toFixed(2) : '0'));
// The meter: the level in dB from −48 to 0, so a quiet room still moves it
const meter = computed(() => Math.max(0, Math.min(1, 1 + (20 * Math.log10(Math.max(props.level, 1e-5))) / 48)));

const STATUS: Partial<Record<RecorderState, string>> = {
    asking: 'Allow the microphone',
    listening: 'Make a sound',
    recording: 'Recording',
    denied: 'Microphone blocked',
    silent: 'Nothing heard',
    unsupported: 'No microphone',
};
const status = computed(() => STATUS[props.state] ?? '');
const caption = computed(() => status.value || 'Sample');

// The recording's picture: the highest and lowest sample in each column
const PIC_W = 120;
const PIC_H = 40;
const picPath = computed(() => {
    if (!props.sample) return '';
    const x = decodeSample(props.sample.data);
    const cols = PIC_W;
    const top: string[] = [];
    const bottom: string[] = [];
    for (let c = 0; c < cols; c++) {
        const a = Math.floor((c * x.length) / cols);
        const b = Math.max(a + 1, Math.floor(((c + 1) * x.length) / cols));
        let hi = 0, lo = 0;
        for (let i = a; i < b && i < x.length; i++) { if (x[i] > hi) hi = x[i]; if (x[i] < lo) lo = x[i]; }
        const mid = PIC_H / 2;
        top.push(`${c} ${(mid - hi * (mid - 1)).toFixed(1)}`);
        bottom.push(`${c} ${(mid - lo * (mid - 1)).toFixed(1)}`);
    }
    return `M${top.join(' L')} L${bottom.reverse().join(' L')} Z`;
});
</script>

<style scoped>
.st {
    position: relative;
    width: 100%;
    height: 100%;
}

.st-pick {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 100%;
    padding: 4px;
    border: 0;
    border-radius: 12px;
    font: inherit;
    color: var(--cap-ink);
    overflow: hidden;
}

.st-pick:disabled {
    cursor: default;
}

/* Lit as a wave tile is: a thin ring in the LEDs' colour */
.st-pick.is-active {
    outline: 1.5px solid var(--hw-led, #5dffb0);
    outline-offset: -1.5px;
}

.st-pic {
    display: grid;
    place-items: center;
    width: 100%;
    flex: 1 1 auto;
    min-height: 0;
}

.st-pic svg {
    width: 100%;
    height: 100%;
    max-height: 46px;
}

.st-pic svg:not(.st-mic) path {
    fill: #ff6b6b;
    fill-opacity: 0.75;
    stroke: #ffb3b3;
    stroke-width: 0.6px;
    vector-effect: non-scaling-stroke;
}

.st-pic .st-mic {
    width: 26px !important;
    height: 26px !important;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6px;
    stroke-linecap: round;
    opacity: 0.55;
}

.st-mic rect {
    fill: none;
}

.st-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: .62rem;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    white-space: nowrap;
}

.st-label .hw-led {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--hw-led-off, #2a3b33);
}

.is-lit .st-label .hw-led {
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 6px var(--hw-led, #5dffb0);
}

/* REC: a small round button with a red dot, in the corner (tile) or at the start (strip) */
.st-rec {
    position: absolute;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, .18);
    border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #3b3446, #18141f);
    cursor: pointer;
    z-index: 1;
}

.st-rec-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #e5484d;
    box-shadow: inset 0 -1px 2px rgba(0, 0, 0, .4);
}

.st-rec.is-on .st-rec-dot {
    background: #ff5a5f;
    box-shadow: 0 0 8px #ff5a5f;
    animation: st-blink 1s steps(2, start) infinite;
}

@keyframes st-blink {
    to { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
    .st-rec.is-on .st-rec-dot { animation: none; }
}

.st-rec:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 65%);
    outline-offset: 2px;
}

.st-meter {
    position: absolute;
    left: 50%;
    top: calc(100% + 3px);
    width: 30px;
    height: 3px;
    margin-left: -15px;
    border-radius: 2px;
    background: rgba(255, 255, 255, .12);
    overflow: hidden;
}

.st-meter i {
    display: block;
    width: 100%;
    height: 100%;
    background: #ff6b6b;
    transform-origin: left;
}

/* The tall tile: REC in the top-right corner, where a wave tile has its dice */
.st--tile .st-pick {
    padding-top: 26px;
}

.st--tile .st-rec {
    top: 4px;
    right: 4px;
}

.st--tile .st-label {
    flex-direction: column;
    gap: 3px;
    white-space: normal;
    text-align: center;
    line-height: 1.1;
}

/* The strip: REC first, then the recording, its LED and name */
.st--strip .st-pick {
    flex-direction: row;
    justify-content: flex-start;
    padding: 3px 10px 3px 40px;
    border-radius: 10px;
    gap: 10px;
}

.st--strip .st-rec {
    left: 9px;
    top: 50%;
    margin-top: -11px;
}

.st--strip .st-pic {
    order: 2;
    height: 100%;
}

.st--strip .st-pic svg {
    max-height: none;
}

.st--strip .st-label {
    order: 1;
    min-width: 66px;
}

.st--strip .st-meter {
    top: auto;
    bottom: -6px;
}
</style>

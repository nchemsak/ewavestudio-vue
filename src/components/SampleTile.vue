<!-- src/components/SampleTile.vue -->
<!-- The Waveforms card's Sample: a sound recorded from the microphone, played by the pads as a
     wave (src/audio/sample.ts; recorded by useSampleRecorder.ts). Its REC button records (again);
     with a recording, the tile itself picks it for every pad, as a wave tile does, and shows
     it (a small picture of the recording, lit while every pad plays it). While recording it
     says what it's doing and shows the input's level. A strip under the wave tiles (PR 95,
     option B of two mockups; A was a tall tile beside Random, which made the tiles narrower).
     At its right end (PR 100): a dice badge, as the wave tiles have, shown once there's a
     recording, so Random can mix the recording in; and Length, a mini knob: how much of the
     recording the pads play (Full, the default, all of it; less, that share of it, fading). -->
<template>
    <div class="st" :class="{ 'is-lit': lit, 'is-busy': busy }">
        <button type="button" class="st-pick hw-cap" :class="{ 'is-active': lit }" :disabled="busy"
            :aria-pressed="lit ? 'true' : 'false'" :aria-label="hasSample ? 'Sample: play the recording on every pad' : 'Sample: record a sound'"
            :title="hasSample ? `Sample: the recording (${seconds} s) on every pad, as recorded on A3` : 'Sample: record a sound from the microphone'"
            @click="hasSample ? emit('pick') : emit('record')">
            <span class="st-label"><span class="hw-led" aria-hidden="true" />{{ turning ? lengthText : caption }}</span>
            <span class="st-pic" aria-hidden="true">
                <svg v-if="hasSample" :viewBox="`0 0 ${PIC_W} ${PIC_H}`" preserveAspectRatio="none">
                    <path :d="picPath" />
                    <!-- What Length leaves out, shaded -->
                    <rect v-if="length < 1" class="st-cut" :x="PIC_W * length" y="0" :width="PIC_W * (1 - length)" :height="PIC_H" />
                </svg>
                <svg v-else class="st-mic" viewBox="0 0 24 24">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
                </svg>
            </span>
        </button>

        <button type="button" class="st-rec" :class="{ 'is-on': busy }"
            :aria-label="busy ? 'Stop recording' : hasSample ? 'Record a new sample' : 'Record a sample'"
            :title="busy ? 'Stop' : 'Record about a second from the microphone: it starts when you make a sound'"
            @click="emit('record')">
            <span class="st-rec-dot" aria-hidden="true" />
            <span v-if="busy" class="st-meter" aria-hidden="true"><i :style="{ transform: `scaleX(${meter})` }" /></span>
        </button>

        <span v-if="hasSample" class="dice-badge st-dice" :class="{ on: randomIncluded }" role="switch"
            :aria-checked="randomIncluded ? 'true' : 'false'" :aria-label="diceAria" :title="diceAria" tabindex="0"
            @click.stop.prevent="toggleDice" @keydown.space.stop.prevent="toggleDice" @keydown.enter.stop.prevent="toggleDice">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
                <circle cx="8" cy="8" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="16" cy="16" r="1.6" />
            </svg>
        </span>

        <div class="st-length">
            <Knob midi-id="sample.length" :modelValue="length" @update:modelValue="v => emit('update:length', v)"
                label="Sample length" hideLabel size="mini" :min="SAMPLE_LENGTH_MIN" :max="1" :step="0.01"
                :disabled="!hasSample || busy" :value-text="lengthText" color="#ff6b6b"
                @knobStart="turning = true" @knobEnd="turning = false" />
        </div>

        <span class="visually-hidden" role="status" aria-live="polite">{{ status }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Knob from './Knob.vue';
import { decodeSample, sampleSeconds, SAMPLE_LENGTH_MIN, type SampleData } from '../audio/sample';
import type { RecorderState } from '../composables/useSampleRecorder';

const props = defineProps<{
    sample: SampleData | null;
    state: RecorderState;
    level: number;     // the input's level while recording, 0..1
    lit: boolean;      // every pad plays the recording
    length: number;    // how much of it plays, 0.05–1 (v-model:length)
    randomIncluded: boolean; // Random may pick it (its dice badge)
}>();
const emit = defineEmits<{
    (e: 'pick'): void; (e: 'record'): void;
    (e: 'update:length', v: number): void;
    (e: 'toggle-random', w: 'sample', next: boolean): void;
}>();

const turning = ref(false);
// "Full", or the share and how long that is on A3 (as recorded)
const lengthText = computed(() => {
    if (props.length >= 1) return 'Full';
    const sec = props.sample ? sampleSeconds(props.sample) * props.length : 0;
    return `${Math.round(props.length * 100)}% · ${sec < 1 ? `${Math.round(sec * 1000)} ms` : `${sec.toFixed(2)} s`}`;
});
const diceAria = computed(() => (props.randomIncluded ? 'Exclude Sample from Random' : 'Include Sample in Random'));
const toggleDice = () => emit('toggle-random', 'sample', !props.randomIncluded);

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

/* The strip: REC first, then the name with its LED, then the recording's picture */
.st-pick {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 100%;
    /* room for REC on the left, the dice and Length on the right */
    padding: 3px 66px 3px 40px;
    border: 0;
    border-radius: 10px;
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

.st-label {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 66px;
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

.st-pic {
    display: grid;
    place-items: center;
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
}

.st-pic svg {
    width: 100%;
    height: 100%;
}

.st-pic svg:not(.st-mic) path {
    fill: #ff6b6b;
    fill-opacity: 0.75;
    stroke: #ffb3b3;
    stroke-width: 0.6px;
    vector-effect: non-scaling-stroke;
}

.st-pic .st-mic {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6px;
    stroke-linecap: round;
    opacity: 0.55;
}

.st-pic svg .st-cut {
    fill: rgb(0 0 0 / .55);
}

/* The dice badge (as the wave tiles', WaveButton.vue) and Length, at the strip's right end */
.st-dice {
    position: absolute;
    right: 38px;
    top: 50%;
    width: 22px;
    height: 22px;
    margin-top: -11px;
    border-radius: 8px;
    background: color-mix(in oklab, var(--pt-surface-2), transparent 10%);
    border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 65%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 1;
}

.st-dice svg {
    width: 16px;
    height: 16px;
}

.st-dice svg rect {
    fill: none;
    stroke: color-mix(in oklab, var(--pt-text) 90%, transparent);
    stroke-width: 1.6px;
}

.st-dice svg circle {
    fill: var(--pt-surface-1);
}

.st-dice.on {
    background: color-mix(in oklab, var(--hw-led), transparent 88%);
    border-color: color-mix(in oklab, var(--hw-led), transparent 50%);
}

.st-dice.on svg circle {
    fill: color-mix(in oklab, var(--pt-text) 92%, transparent);
}

.st-dice:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 60%);
    outline-offset: 2px;
}

.st-length {
    position: absolute;
    right: 7px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
}

/* REC: a small round button with a red dot, at the strip's start */
.st-rec {
    position: absolute;
    left: 9px;
    top: 50%;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin-top: -11px;
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

/* The input's level while listening and recording, under REC */
.st-meter {
    position: absolute;
    left: 50%;
    bottom: -6px;
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
</style>

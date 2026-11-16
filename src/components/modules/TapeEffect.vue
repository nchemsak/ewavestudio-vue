<template>
    <!-- The tape pedal, last in the chain (src/audio/tape.ts): AGE (saturation, a duller top,
         hiss), WOBBLE (wow and flutter) and a TAPE | VINYL switch (what the noise is and how
         the pitch sways). Two reels, or records, turn beside its name while it plays (the deck
         has a window for them). -->
    <KnobGroup v-model="localEnabled" title="Tape" :color="color" :showToggle="false" :showHeader="false">
        <div class="tape-pedal" :class="[`is-${layout}`, `mode-${localMode}`, { turning: playing && localEnabled }]">
            <div class="panel-top">
                <span class="check-led" :class="{ on: localEnabled }" aria-hidden="true"></span>

                <div class="knob-cell age">
                    <Knob midi-id="tape.age" :value-text="`${Math.round(localAge * 100)}%`" v-model="localAge" label="AGE" :min="0" :max="1" :step="0.01" size="small" :color="color"
                        :disabled="!localEnabled" @knobStart="activeKnob = 'age'" @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'age'" class="custom-tooltip">{{ Math.round(localAge * 100) }}%</span>
                </div>

                <div class="knob-cell wobble">
                    <Knob midi-id="tape.wobble" :value-text="`${Math.round(localWobble * 100)}%`" v-model="localWobble" label="WOBBLE" :min="0" :max="1" :step="0.01" size="small" :color="color"
                        :disabled="!localEnabled" @knobStart="activeKnob = 'wobble'" @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'wobble'" class="custom-tooltip">{{ Math.round(localWobble * 100) }}%</span>
                </div>

                <!-- TAPE | VINYL: either word picks it, the lever between them flips it -->
                <div class="mode-switch" role="radiogroup" aria-label="Tape or vinyl" :class="{ disabled: !localEnabled }">
                    <button v-for="m in TAPE_MODES" :key="m" type="button" role="radio" class="ms-word" :class="`ms-${m}`"
                        :aria-checked="localMode === m ? 'true' : 'false'" :aria-label="MODE_NAMES[m]" :title="MODE_TITLES[m]"
                        :disabled="!localEnabled" @click="localMode = m">{{ m.toUpperCase() }}</button>
                    <span class="ms-slot" aria-hidden="true" @click="flipMode"><span class="ms-lever"></span></span>
                </div>
            </div>

            <div class="panel-seam" aria-hidden="true">
                <div class="tape-window">
                    <template v-if="localMode === 'tape'">
                        <span class="reel"></span>
                        <span class="tape-run"></span>
                        <span class="reel"></span>
                    </template>
                    <template v-else>
                        <span class="record"></span>
                        <span class="arm"></span>
                    </template>
                </div>
            </div>

            <div class="panel-bottom">
                <!-- On the pedal, the reels (or two records) sit either side of its name -->
                <div class="effect-label">
                    <span class="name-spin" :class="localMode === 'tape' ? 'reel' : 'record'" aria-hidden="true"></span>
                    <span>tape</span>
                    <span class="name-spin" :class="localMode === 'tape' ? 'reel' : 'record'" aria-hidden="true"></span>
                </div>
                <button class="footswitch" type="button" :aria-pressed="localEnabled" aria-label="Tape pedal"
                    @click="localEnabled = !localEnabled" @keydown.space.prevent="localEnabled = !localEnabled"
                    @keydown.enter.prevent="localEnabled = !localEnabled"></button>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';
import { TAPE_DEFAULTS, TAPE_MODES, clampTapeMode, type TapeMode } from '../../audio/tape';

const props = withDefaults(
    defineProps<{
        enabled: boolean;
        age?: number;      // 0..1
        wobble?: number;   // 0..1
        mode?: TapeMode;
        playing?: boolean; // the reels turn while the sequencer plays
        layout?: 'pedal' | 'deck'; // a stomp box (the phone's FX page) or a low, wide deck (the desktop's Effects card)
        color?: string;
    }>(),
    { age: TAPE_DEFAULTS.age, wobble: TAPE_DEFAULTS.wobble, mode: TAPE_DEFAULTS.mode, playing: false, layout: 'pedal', color: '#4DB6AC' }
);

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void;
    (e: 'update:age', v: number): void;
    (e: 'update:wobble', v: number): void;
    (e: 'update:mode', v: TapeMode): void;
}>();

const MODE_NAMES: Record<TapeMode, string> = { tape: 'Tape', vinyl: 'Vinyl' };
const MODE_TITLES: Record<TapeMode, string> = {
    tape: 'Tape: hiss, and a slow wow with a fast flutter',
    vinyl: 'Vinyl: crackle and pops, and the slow sway of a record turning',
};

const localEnabled = ref<boolean>(props.enabled);
const localAge = ref<number>(props.age);
const localWobble = ref<number>(props.wobble);
const localMode = ref<TapeMode>(clampTapeMode(props.mode));
const activeKnob = ref<null | 'age' | 'wobble'>(null);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function flipMode() {
    if (localEnabled.value) localMode.value = localMode.value === 'tape' ? 'vinyl' : 'tape';
}

/* Emits: only what a person changed here, never an echo of a prop */
watch(localEnabled, (v) => { if (v !== props.enabled) emit('update:enabled', v); });
watch(localAge, (v) => { if (v !== props.age) emit('update:age', clamp01(v)); });
watch(localWobble, (v) => { if (v !== props.wobble) emit('update:wobble', clamp01(v)); });
watch(localMode, (v) => { if (v !== props.mode) emit('update:mode', v); });

watch(() => props.enabled, (v) => { localEnabled.value = v; });
watch(() => props.age, (v) => { if (typeof v === 'number') localAge.value = v; });
watch(() => props.wobble, (v) => { if (typeof v === 'number') localWobble.value = v; });
watch(() => props.mode, (v) => { localMode.value = clampTapeMode(v); });
</script>

<style scoped>
.tape-pedal {
    display: grid;
    grid-template-rows: auto 8px auto;
    width: 100%;
    opacity: .9;
}

.panel-top {
    position: relative;
    border-radius: 8px 8px 0 0;
    padding: 12px 0 10px;
    background: linear-gradient(var(--pedal-hi, #8fd9cf), var(--pedal-lo, #4fb3ad));
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        0 1px 0 rgba(0, 0, 0, 0.35);
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto 1fr;
    grid-template-areas:
        'led    led'
        'age    wobble'
        'mode   mode';
    align-items: center;
    justify-items: center;
}

.check-led {
    grid-area: led;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #7a1f19;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55) inset;
    margin-top: 2px;
}

.check-led.on {
    background: #e53935;
    box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.55) inset,
        0 0 8px 3px rgba(229, 57, 53, 0.6),
        0 0 18px 6px rgba(229, 57, 53, 0.35);
}

.age {
    grid-area: age;
}

.wobble {
    grid-area: wobble;
}

.knob-cell {
    width: min-content;
    text-align: center;
    position: relative;
    justify-self: center;
}

/* The captions under the knobs, as on the other pedals */
.knob-cell :deep(.knob-label) {
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 44px;
    color: var(--pedal-ink, black);
    font-weight: bold;
}

.custom-tooltip {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: -22px;
    padding: 2px 6px;
    font-size: 12px;
    line-height: 1.2;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
    z-index: 2;
}

/* TAPE | VINYL: a little slide switch between its two words. It fills the row the other
   pedals' TONE knob has, so the pedal is as tall as they are. */
.mode-switch {
    grid-area: mode;
    align-self: end;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    column-gap: 4px;
    width: 100%;
    min-height: 40px;
    padding: 12px 4px 0;
    font-family: monospace;
}

.ms-word {
    border: 0;
    background: none;
    padding: 3px 0;
    font-family: inherit;
    font-size: 0.5rem;
    font-weight: bold;
    line-height: 1;
    letter-spacing: 0.02em;
    color: var(--pedal-ink, black);
    opacity: 0.55;
    cursor: pointer;
}

.ms-tape {
    grid-column: 1;
    grid-row: 1;
    justify-self: end;
}

.ms-vinyl {
    grid-column: 3;
    grid-row: 1;
    justify-self: start;
}

.ms-word[aria-checked='true'] {
    opacity: 1;
}

.ms-slot {
    grid-column: 2;
    grid-row: 1;
    position: relative;
    width: 22px;
    height: 11px;
    border-radius: 6px;
    background: linear-gradient(#2d2b2f, #3f3c3f);
    box-shadow:
        inset 0 1px 3px rgba(0, 0, 0, 0.7),
        0 1px 0 rgba(255, 255, 255, 0.35);
    cursor: pointer;
}

.ms-lever {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #f4f4f4, #9a9a9a);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    transition: left 0.08s ease-out;
}

.mode-vinyl .ms-lever {
    left: 13px;
}

.mode-switch.disabled .ms-word {
    color: var(--pedal-ink-off, #666);
    cursor: default;
}

.mode-switch.disabled .ms-slot {
    cursor: default;
}

.mode-switch.disabled .ms-lever {
    filter: grayscale(1);
    opacity: 0.8;
}

.ms-word:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 60%);
    outline-offset: 1px;
    border-radius: 4px;
}

/* The window: two reels and the tape between them, or a record under its arm */
.panel-seam {
    height: 25px;
    border-radius: 2px;
    background: linear-gradient(var(--pedal-hi, #8fd9cf), var(--pedal-lo, #4fb3ad));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
    display: grid;
    place-items: center;
}

.tape-window {
    position: relative;
    width: min(74px, 78%);
    height: 19px;
    border-radius: 5px;
    background: linear-gradient(#1c1a1e, #2d2b2f);
    box-shadow:
        inset 0 1px 3px rgba(0, 0, 0, 0.8),
        0 1px 0 rgba(255, 255, 255, 0.3);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px;
    overflow: hidden;
}

.reel {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background:
        radial-gradient(circle, #2d2b2f 0 2px, transparent 2.5px),
        conic-gradient(#d9d4c8 0 40deg, #6c655a 40deg 120deg, #d9d4c8 120deg 160deg, #6c655a 160deg 240deg, #d9d4c8 240deg 280deg, #6c655a 280deg 360deg);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
    flex: none;
}

.tape-run {
    flex: 1 1 auto;
    height: 2px;
    margin: 9px 2px 0;
    background: #6b4a34;
    border-radius: 1px;
}

.record {
    width: 15px;
    height: 15px;
    flex: none;
    border-radius: 50%;
    background:
        radial-gradient(circle, #e9c46a 0 2.2px, transparent 2.7px),
        conic-gradient(#0f0e10 0 70deg, #3a373d 90deg, #0f0e10 110deg 250deg, #3a373d 270deg, #0f0e10 290deg);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
}

.arm {
    position: absolute;
    right: 14px;
    top: 3px;
    width: 14px;
    height: 2px;
    border-radius: 1px;
    background: #bdb7ab;
    transform-origin: 100% 50%;
    transform: rotate(-24deg);
}

@keyframes tape-turn {
    to {
        transform: rotate(360deg);
    }
}

.turning .reel {
    animation: tape-turn 2.4s linear infinite;
}

/* 33⅓ turns a minute */
.turning .record {
    animation: tape-turn 1.8s linear infinite;
}

@media (prefers-reduced-motion: reduce) {

    .turning .reel,
    .turning .record {
        animation: none;
    }
}

.panel-bottom {
    border-radius: 8px;
    padding: 8px;
    background: linear-gradient(var(--pedal-foot-hi, var(--pedal-hi, #8fd9cf)), var(--pedal-foot-lo, var(--pedal-lo, #4fb3ad)));
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.3),
        0 1px 0 rgba(0, 0, 0, 0.35);
}

.footswitch {
    display: block;
    width: 100%;
    height: 75px;
    border: 0;
    border-radius: 8px;
    background: linear-gradient(var(--pedal-switch-hi, #3f3c3f), var(--pedal-switch-lo, #2d2b2f));
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.06),
        inset 0 -10px 16px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    position: relative;
}

.footswitch::before {
    content: '';
    position: absolute;
    inset: 8px;
    border-radius: 8px;
    box-shadow: 0 0 0 2px #2d2b2f inset;
    opacity: 0.8;
    pointer-events: none;
}

.footswitch:active {
    transform: translateY(1px);
    filter: brightness(0.96);
}

.effect-label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    line-height: 1;
    height: calc(1rem + 8px);
    padding-bottom: 8px;
    text-shadow: var(--pedal-name-shadow, 0px 0px 8px black);
    color: var(--pedal-name, white);
}

.effect-label .name-spin {
    margin: -2px 0;
}

.effect-label .record {
    margin: -3px 0;
}

/* The pedal has no window (its seam is a thin line, as on the others) */
.is-pedal .tape-window {
    display: none;
}

.is-deck .name-spin {
    display: none;
}

/* The deck: the same controls on one low, wide unit, under the desktop's three pedals */
.tape-pedal.is-deck {
    grid-template-rows: none;
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: stretch;
    border-radius: 8px;
    background: linear-gradient(var(--pedal-hi, #8fd9cf), var(--pedal-lo, #4fb3ad));
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        0 1px 0 rgba(0, 0, 0, 0.35);
    height: 64px;
}

.is-deck .panel-bottom {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column-reverse;
    justify-content: center;
    gap: 4px;
    padding: 6px 4px 6px 10px;
    background: none;
    box-shadow: none;
}

.is-deck .effect-label {
    padding: 0;
    font-size: 0.8rem;
}

.is-deck .footswitch {
    width: 44px;
    height: 26px;
    border-radius: 6px;
}

.is-deck .footswitch::before {
    inset: 4px;
    border-radius: 4px;
}

.is-deck .panel-seam {
    grid-column: 2;
    grid-row: 1;
    height: auto;
    padding: 0 8px;
    background: none;
    box-shadow: none;
}

.is-deck .tape-window {
    width: 92px;
    height: 40px;
    padding: 0 10px;
    border-radius: 7px;
}

.is-deck .reel {
    width: 24px;
    height: 24px;
    background:
        radial-gradient(circle, #2d2b2f 0 3.5px, transparent 4px),
        conic-gradient(#d9d4c8 0 40deg, #6c655a 40deg 120deg, #d9d4c8 120deg 160deg, #6c655a 160deg 240deg, #d9d4c8 240deg 280deg, #6c655a 280deg 360deg);
}

.is-deck .tape-run {
    margin-top: 20px;
}

.is-deck .record {
    width: 30px;
    height: 30px;
    margin: 0 auto;
    background:
        radial-gradient(circle, #e9c46a 0 4.5px, transparent 5px),
        conic-gradient(#0f0e10 0 70deg, #3a373d 90deg, #0f0e10 110deg 250deg, #3a373d 270deg, #0f0e10 290deg);
}

.is-deck .arm {
    right: 16px;
    top: 8px;
    width: 26px;
}

.is-deck .panel-top {
    grid-column: 3;
    grid-row: 1;
    padding: 0 8px 0 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    grid-template-columns: auto auto minmax(0, 1fr);
    grid-template-rows: auto;
    grid-template-areas: 'age wobble mode';
    column-gap: 12px;
    justify-items: start;
}

/* The deck's light sits in its top right corner, clear of the switch on a narrow deck */
.is-deck .check-led {
    position: absolute;
    top: 7px;
    right: 9px;
    width: 9px;
    height: 9px;
    margin: 0;
}

.is-deck .knob-cell {
    padding-bottom: 10px;
}

.is-deck .knob-cell :deep(.knob-label) {
    bottom: 0;
}

.is-deck .mode-switch {
    align-self: center;
    min-height: 0;
    padding: 0;
}
</style>

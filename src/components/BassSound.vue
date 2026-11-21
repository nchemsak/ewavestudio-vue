<!-- src/components/BassSound.vue -->
<!-- The Bass machine's Sound section (the plan's item 4; option K of four rounds of mockups):
     Saw | Square tiles and the Sub knob in a column, one big screen drawing a note of the sound
     (the wave, its level's envelope dashed, the cutoff falling back in pink: bassView.ts), and
     the knobs on a card of their own, Filter (Cutoff, Reso, Env) and Note (Decay, Accent,
     Slide), each with its value under it. The effects pedals beside them are the Rhythm
     machine's (DrumSequencer's Effects card). Grid areas: osc, big, knobs. -->
<template>
    <div class="bass-sound" :class="{ compact }">
        <div class="pt-card bs-card bs-osc" style="grid-area: osc">
            <div class="bs-tiles" role="radiogroup" aria-label="Bass wave">
                <button v-for="t in TILES" :key="t.id" type="button" class="bs-tile hw-cap" role="radio"
                    :class="{ 'hw-down': sound.wave.value === t.id }" :aria-checked="sound.wave.value === t.id ? 'true' : 'false'" :aria-label="t.name"
                    @click="sound.wave.value = t.id">
                    <svg viewBox="0 0 60 30" aria-hidden="true"><path :d="t.icon" /></svg>
                    <span><i class="bs-led" :class="{ lit: sound.wave.value === t.id }"></i>{{ t.label }}</span>
                </button>
                <div class="bs-tile bs-subtile">
                    <svg viewBox="0 0 60 30" aria-hidden="true"><path :d="SUB_ICON" /></svg>
                    <div class="bs-kcell">
                        <Knob midi-id="bass.sub" v-model="sound.sub.value" label="Sub" :value-text="pct(sound.sub.value)"
                            :min="0" :max="1" :step="0.01" size="small" :useThemeArc="true" />
                        <span class="bs-kval">{{ pct(sound.sub.value) }}</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="pt-card bs-card bs-big" style="grid-area: big">
            <!-- A click plays the note it draws (only while stopped: DrumSequencer's auditionBass) -->
            <button type="button" class="bs-screen" :aria-label="`Hear ${noteName}`" :title="`Click to hear ${noteName}`" @click="emit('preview')">
                <svg viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true">
                    <path :d="paths.env" class="bs-env" />
                    <path :d="paths.wave" class="bs-wave" />
                    <path :d="paths.cut" class="bs-cutline" />
                </svg>
                <span class="bs-read">{{ waveName }}{{ sound.sub.value > 0 ? ' + SUB' : '' }} · {{ noteName }}</span>
                <span class="bs-read r"><b class="cut">— CUTOFF {{ hzText(sound.cutoff.value) }}, ENV +{{ sound.envAmount.value.toFixed(1) }} OCT</b> · <b>- - LEVEL, DECAY {{ Math.round(sound.decayMs.value) }} MS</b></span>
            </button>
        </div>

        <!-- The knobs written out one by one: MIDI learn's ids must each be on one knob in the source -->
        <div class="pt-card bs-card bs-knobcard" style="grid-area: knobs">
            <div class="bs-kgroup" role="group" aria-label="Bass filter">
                <span class="bs-kcap">Filter</span>
                <div class="bs-kgrid">
                    <div class="bs-kcell">
                        <Knob midi-id="bass.cutoff" v-model="sound.cutoff.value" label="Cutoff" :value-text="`${Math.round(sound.cutoff.value)} Hz`"
                            :min="40" :max="4000" :step="1" taper="log" :size="compact ? 'small' : 'medium'" :useThemeArc="true" />
                        <span class="bs-kval">{{ Math.round(sound.cutoff.value) }} Hz</span>
                    </div>
                    <div class="bs-kcell">
                        <Knob midi-id="bass.resonance" v-model="sound.resonance.value" label="Reso" :value-text="pct(sound.resonance.value)"
                            :min="0" :max="1" :step="0.01" :size="compact ? 'small' : 'medium'" :useThemeArc="true" />
                        <span class="bs-kval">{{ pct(sound.resonance.value) }}</span>
                    </div>
                    <div class="bs-kcell">
                        <Knob midi-id="bass.envAmount" v-model="sound.envAmount.value" label="Env" :value-text="`+${sound.envAmount.value.toFixed(1)} octaves`"
                            :min="0" :max="5" :step="0.1" :size="compact ? 'small' : 'medium'" :useThemeArc="true" />
                        <span class="bs-kval">+{{ sound.envAmount.value.toFixed(1) }} oct</span>
                    </div>
                </div>
            </div>
            <div class="bs-kgroup" role="group" aria-label="Bass note">
                <span class="bs-kcap">Note</span>
                <div class="bs-kgrid">
                    <div class="bs-kcell">
                        <Knob midi-id="bass.decay" v-model="sound.decayMs.value" label="Decay" :value-text="`${Math.round(sound.decayMs.value)} ms`"
                            :min="30" :max="2000" :step="1" taper="log" :size="compact ? 'small' : 'medium'" :useThemeArc="true" />
                        <span class="bs-kval">{{ Math.round(sound.decayMs.value) }} ms</span>
                    </div>
                    <div class="bs-kcell">
                        <Knob midi-id="bass.accent" v-model="sound.accent.value" label="Accent" :value-text="pct(sound.accent.value)"
                            :min="0" :max="1" :step="0.01" :size="compact ? 'small' : 'medium'" :useThemeArc="true" />
                        <span class="bs-kval">{{ pct(sound.accent.value) }}</span>
                    </div>
                    <div class="bs-kcell">
                        <Knob midi-id="bass.slide" v-model="sound.slideMs.value" label="Slide" :value-text="`${Math.round(sound.slideMs.value)} ms`"
                            :min="10" :max="400" :step="1" taper="log" :size="compact ? 'small' : 'medium'" :useThemeArc="true" />
                        <span class="bs-kval">{{ Math.round(sound.slideMs.value) }} ms</span>
                    </div>
                </div>
            </div>
            <!-- Phone mode's Mix group (the rail's row, which the phone has no room for) -->
            <slot name="mix" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Knob from './Knob.vue';
import type { BassSettings } from '../lib/machines/bass';
import { bassVoice } from '../lib/machines/bass';
import { ampAt, envOctAt, noteSamples, viewSeconds } from '../lib/bassView';

const props = defineProps<{
    sound: BassSettings;
    compact?: boolean; // phone mode's Sound page (PR 118): smaller knobs, a shorter screen
    noteHz: number;   // the note drawn (the lane's first note, or the key's root)
    noteName: string;
}>();
const emit = defineEmits<{ (e: 'preview'): void }>();

const TILES = [
    { id: 'saw', label: 'SAW', name: 'Saw', icon: 'M2 26 L20 4 L20 26 L39 4 L39 26 L58 4' },
    { id: 'square', label: 'SQUARE', name: 'Square', icon: 'M2 26 L2 4 L16 4 L16 26 L30 26 L30 4 L44 4 L44 26 L58 26' },
] as const;
const SUB_ICON = 'M2 15 C 9 2, 23 2, 30 15 S 51 28, 58 15';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const hzText = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)} KHZ` : `${Math.round(hz)} HZ`);
const waveName = computed(() => (props.sound.wave.value === 'square' ? 'SQUARE' : 'SAW'));

// The picture, redrawn as the sound changes
const paths = computed(() => {
    const v = bassVoice(props.sound);
    const W = 400, H = 150, N = 600;
    const secs = viewSeconds(v);
    const S = noteSamples(v, N, props.noteHz);
    const wave = S.map((x, i) => `${i ? 'L' : 'M'}${((i / (N - 1)) * W).toFixed(1)} ${(H / 2 - x * H * 0.42).toFixed(1)}`).join(' ');
    const top: string[] = [], bot: string[] = [], cut: string[] = [];
    const maxOct = Math.max(1, v.envAmount + 2);
    for (let i = 0; i <= 80; i++) {
        const t = (i / 80) * secs, x = ((i / 80) * W).toFixed(1), a = ampAt(v, t) * H * 0.45;
        top.push(`${i ? 'L' : 'M'}${x} ${(H / 2 - a).toFixed(1)}`);
        bot.push(`${i ? 'L' : 'M'}${x} ${(H / 2 + a).toFixed(1)}`);
        // The cutoff on a log axis, 40 Hz at the foot to 40 Hz × 2^(Env + 2 + the cutoff's octaves) at the top
        const oct = Math.log2(v.cutoff / 40) + envOctAt(v, t);
        cut.push(`${i ? 'L' : 'M'}${x} ${(H * 0.92 - (oct / (Math.log2(4000 / 40) + maxOct)) * H * 0.84).toFixed(1)}`);
    }
    return { wave, env: `${top.join(' ')} ${bot.join(' ')}`, cut: cut.join(' ') };
});
</script>

<style scoped>
.bass-sound {
    display: contents;
}

.bs-card {
    display: flex;
    min-width: 0;
    gap: 12px;
}

.bs-osc {
    flex-direction: column;
    justify-content: center;
}

.bs-tiles {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    height: 100%;
}

.bs-tile {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    border-radius: 10px;
    min-height: 0;
}

.bs-tile svg {
    width: 64px;
    height: 34px;
    flex: none;
}

.bs-tile path {
    fill: none;
    stroke: #ff9ad5;
    stroke-width: 3;
    stroke-linejoin: round;
}

.bs-tile span {
    font: 700 11px Cousine, ui-monospace, monospace;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--cap-ink, #fff);
}

.bs-tile.hw-down {
    box-shadow: 0 0 0 2px var(--hw-led, #5dffb0);
}

.bs-subtile {
    background: color-mix(in oklab, var(--pt-inset) 70%, transparent);
    border: 1px dashed rgba(255, 255, 255, .14);
}

.bs-subtile path {
    stroke: #79d9ff;
}

.bs-led {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--hw-led-off, #2c3a33);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, .5);
}

.bs-led.lit {
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 6px var(--hw-led, #5dffb0);
}

.bs-big {
    flex-direction: column;
}

.bs-screen {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    text-align: left;
    cursor: pointer;
    --sp-bg: #0c1118;
    --sp-ink: #cfe0ff;
    --bs-cut: #ff7eb3;
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 170px;
    border-radius: 6px;
    background: var(--sp-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07), inset 0 2px 10px rgba(0, 0, 0, .6);
    overflow: hidden;
}

.theme-analog .bs-screen {
    --sp-bg: #160f05;
    --sp-ink: #ffcf8a;
}

.theme-synthwave .bs-screen {
    --sp-bg: #2a0f52;
    --sp-ink: #e8dcff;
}

.bs-screen svg {
    position: absolute;
    inset: 22px 0 6px;
    width: 100%;
    height: calc(100% - 28px);
}

.bs-wave {
    fill: none;
    stroke: var(--sp-ink);
    stroke-width: 1.2;
    opacity: .9;
    vector-effect: non-scaling-stroke;
}

.bs-env {
    fill: none;
    stroke: var(--sp-ink);
    stroke-width: 1;
    stroke-dasharray: 3 4;
    opacity: .6;
    vector-effect: non-scaling-stroke;
}

.bs-cutline {
    fill: none;
    stroke: var(--bs-cut);
    stroke-width: 2.2;
    vector-effect: non-scaling-stroke;
}

.bs-read {
    position: absolute;
    top: 5px;
    left: 8px;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .06em;
    color: var(--sp-ink);
    white-space: nowrap;
}

.bs-read.r {
    left: auto;
    right: 8px;
}

.bs-read b {
    opacity: .75;
}

.bs-read b.cut {
    color: var(--bs-cut);
    opacity: 1;
}

.bs-knobcard {
    flex-direction: column;
    justify-content: center;
    gap: 14px;
}

.bs-kgroup {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.bs-kcap {
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.bs-kgrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    justify-items: center;
    gap: 4px;
}

.bs-kcell {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.bs-kval {
    font: 700 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text, #fff);
    opacity: .8;
    margin-top: 2px;
}

/* Phone mode (PR 118): one row, the tiles over each other, a shorter screen, smaller knobs */
.compact .bs-tile {
    padding: 5px 8px;
    gap: 8px;
}

.compact .bs-tile svg {
    width: 40px;
    height: 22px;
}

.compact .bs-tiles {
    gap: 6px;
}

.compact .bs-screen {
    min-height: 0;
}

.compact .bs-knobcard {
    flex-direction: column;
    gap: 4px;
}

.compact .bs-card {
    padding: 8px;
}

/* Compact wins over the one-column rules below (a phone is under 720 px wide) */
.bass-sound.compact .bs-tiles {
    grid-template-columns: 1fr !important;
}

.bass-sound.compact .bs-tile {
    flex-direction: column !important;
    justify-content: center !important;
    gap: 2px !important;
    padding: 4px !important;
    min-width: 0;
}

.bass-sound.compact .bs-tile svg {
    width: 34px !important;
    height: 18px !important;
}

.bass-sound.compact .bs-tile span {
    font-size: 9px;
}

.bass-sound.compact .bs-subtile .bs-kcell {
    transform: scale(0.85);
}

.bass-sound.compact .bs-osc {
    padding: 6px;
    overflow: hidden;
}

.bass-sound.compact .bs-read.r {
    display: none;
}

.bass-sound.compact .bs-knobcard {
    flex-direction: column !important;
    justify-content: center;
}

/* Under 1200 px the knob card has the row: Filter beside Note */
@media (max-width: 1199.98px) {
    .bs-knobcard {
        flex-direction: row;
        justify-content: space-evenly;
    }

    .bs-kgroup {
        flex: 1 1 0;
    }
}

/* One column (under 720 px): the tiles across, a shorter screen, the groups one over the other */
@media (max-width: 719.98px) {
    .bs-tiles {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .bs-tile {
        flex-direction: column;
        justify-content: center;
        gap: 4px;
        padding: 8px 4px;
    }

    .bs-tile svg {
        width: 48px;
        height: 26px;
    }

    .bs-screen {
        min-height: 130px;
    }

    .bs-read.r {
        display: none;
    }

    .bs-knobcard {
        flex-direction: column;
    }
}
</style>

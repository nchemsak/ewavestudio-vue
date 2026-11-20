<!-- src/components/BassMock.vue -->
<!-- MOCKUPS ONLY (behind ?bass=j|k|l, and &m=rhythm with Rhythm chosen; not for a PR; round 4,
     after the maintainer's notes on g|h|i; a–i are in git history): the Bass machine chosen, its
     pads (Accent, Slide and Tie rows) and its Sound section. The mixer is in the rail
     (MachineRail.vue). Nothing here makes sound.
     `part`: 'pads', 'sound'. -->
<template>
    <!-- THE PADS -->
    <div v-if="part === 'pads'" class="bm-pads" :class="`is-${variant}`">
        <div class="bm-grid-wrap">
            <SynthStepGrid name="bass" :current-step="-1" :min-hz="100" :max-hz="2000" :steps="steps"
                :velocities="velocities" :pitches="shownPitches" :nearestNote="(hz: number) => nearestNote(hz / 4)"
                :showVelocity="false" :showPitch="false" :waveforms="waves" :ratchets="ones" :repeatNotes="sames"
                :repeatBrush="null" defaultWave="sawtooth" :noiseMask="offs" noiseTint="#fff" noise-mode="static"
                :noise-alpha="0" :noise-fps="14" :noise-speed="40" :noise-enabled="false" :pepper-alpha="0"
                :pepper-scale="6" :lfoView="null" />
            <!-- What the buttons set, drawn between the notes' names: an arc glides, a bar holds -->
            <div class="bm-links" aria-hidden="true">
                <span v-for="(l, i) in links" :key="i" class="bm-link-cell">
                    <svg v-if="l === 'slide'" class="bm-link slide" viewBox="0 0 100 20" preserveAspectRatio="none">
                        <path d="M8 16 C 35 16, 60 4, 92 4" /><path d="M84 1 L93 4 L85 9" />
                    </svg>
                    <i v-else-if="l === 'tie'" class="bm-link tie"></i>
                </span>
            </div>
        </div>
        <div class="bm-rows">
            <div class="bm-row">
                <span class="bm-row-cap">Accent</span>
                <button v-for="(a, i) in accents" :key="i" type="button" tabindex="-1"
                    class="bm-tog hw-cap hw-cap-sm" :class="{ 'hw-down': a, off: !steps[i] }"><i class="bm-led" :class="{ lit: a }"></i></button>
            </div>
            <div class="bm-row">
                <span class="bm-row-cap">Slide <small>into the next note</small></span>
                <button v-for="(l, i) in links" :key="i" type="button" tabindex="-1"
                    class="bm-tog hw-cap hw-cap-sm" :class="{ 'hw-down': l === 'slide', off: !steps[i] }"><i class="bm-led" :class="{ lit: l === 'slide' }"></i></button>
            </div>
            <div class="bm-row">
                <span class="bm-row-cap">Tie <small>through the next step</small></span>
                <button v-for="(l, i) in links" :key="i" type="button" tabindex="-1"
                    class="bm-tog hw-cap hw-cap-sm" :class="{ 'hw-down': l === 'tie', off: !steps[i] }"><i class="bm-led" :class="{ lit: l === 'tie' }"></i></button>
            </div>
        </div>
    </div>

    <!-- THE SOUND SECTION: the wave tiles left of one big screen (G's), and the knobs: under the
         screen (J), or bigger on a card of their own (K, L) -->
    <div v-else-if="part === 'sound'" class="bm-sound" :class="`is-${variant}`">
        <div class="pt-card bm-card bm-osc" style="grid-area: osc">
            <div class="bm-tiles col">
                <div v-for="t in ['Saw', 'Square']" :key="t" class="bm-tile hw-cap" :class="{ 'hw-down': t === 'Saw' }">
                    <svg viewBox="0 0 60 30" aria-hidden="true"><path :d="t === 'Saw' ? SAW_ICON : SQUARE_ICON" /></svg>
                    <span><i class="bm-led" :class="{ lit: t === 'Saw' }"></i>{{ t.toUpperCase() }}</span>
                </div>
                <div class="bm-tile bm-subtile">
                    <svg viewBox="0 0 60 30" aria-hidden="true"><path :d="SUB_ICON" /></svg>
                    <Knob v-model="vals.sub" label="Sub" :min="0" :max="1" :step="0.01" size="small" :useThemeArc="true" />
                </div>
            </div>
        </div>
        <div class="pt-card bm-card bm-big" style="grid-area: big">
            <div class="bm-screen bm-screen-big">
                <svg viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true">
                    <path :d="envOutline(400, 150)" class="bm-env" />
                    <path :d="wavePath(400, 150)" class="bm-wave" />
                    <path :d="cutoffPath(400, 150)" class="bm-cutline" />
                </svg>
                <span class="bm-read">SAW + SUB · A1</span>
                <span class="bm-read r"><b class="cut">— CUTOFF 320 HZ, ENV +3 OCT</b> · <b>- - LEVEL, DECAY 260 MS</b></span>
                <i class="bm-grip cut" style="left: 1%; top: 22%"></i>
                <i class="bm-grip cut" style="left: 96%; top: 84%"></i>
                <i class="bm-grip" style="left: 62%; top: 49%"></i>
            </div>
            <div v-if="variant === 'j'" class="bm-knobrow">
                <Knob v-for="k in KNOBS" :key="k.id" v-model="vals[k.id]" :label="k.label" :min="0" :max="1" :step="0.01"
                    size="small" :useThemeArc="true" />
            </div>
        </div>
        <div v-if="variant !== 'j'" class="pt-card bm-card bm-knobcard" style="grid-area: knobs">
            <div v-for="g in GROUPS" :key="g.title" class="bm-kgroup">
                <span class="bm-kcap">{{ g.title }}</span>
                <div class="bm-kgrid" :class="{ narrow: variant === 'l' }">
                    <div v-for="k in g.knobs" :key="k.id" class="bm-kcell">
                        <Knob v-model="vals[k.id]" :label="k.label" :min="0" :max="1" :step="0.01"
                            :size="variant === 'k' ? 'medium' : 'small'" :useThemeArc="true" />
                        <span class="bm-kval">{{ k.text }}</span>
                    </div>
                </div>
            </div>
            <!-- The phone: the chosen machine's Level, Pedals and meter (the rail's row) -->
            <div v-if="variant === 'p'" class="bm-kgroup">
                <span class="bm-kcap">Mix <i class="bm-ladder"><b v-for="n in 8" :key="n" :class="{ on: n <= 6, hot: n >= 7 }"></b></i></span>
                <div class="bm-kgrid">
                    <div class="bm-kcell"><Knob :modelValue="0.6" label="Level" :min="0" :max="1" :step="0.01" size="small" :useThemeArc="true" /><span class="bm-kval">60%</span></div>
                    <div class="bm-kcell"><Knob :modelValue="0.4" label="Pedals" :min="0" :max="1" :step="0.01" size="small" :useThemeArc="true" /><span class="bm-kval">40%</span></div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import Knob from './Knob.vue';
import SynthStepGrid from './SynthStepGrid.vue';

defineProps<{
    part: 'pads' | 'sound';
    variant: string;
    nearestNote?: (hz: number) => string;
}>();

// A made-up bassline in A minor: A1 A1 A2 E2 · A1 G1 C2 E2
const on = [0, 2, 3, 6, 8, 10, 11, 14];
const notes: Record<number, number> = { 0: 55, 2: 55, 3: 110, 6: 82.41, 8: 55, 10: 49, 11: 65.41, 14: 82.41 };
const steps = Array.from({ length: 16 }, (_, i) => on.includes(i));
const velocities = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 1 : 0.7));
// The pads' colours run 100–2000 Hz; Bass's 30–250 Hz are drawn two octaves up
const shownPitches = Array.from({ length: 16 }, (_, i) => (notes[i] ?? 55) * 4);
const waves = Array(16).fill('sawtooth');
const ones = Array(16).fill(1);
const sames = Array(16).fill('same');
const offs = Array(16).fill(false);
const accents = Array.from({ length: 16 }, (_, i) => [0, 6, 11].includes(i));
// Step 3 slides up into step 4 (A1 → A2), 11 into 12 (G1 → C2); step 15 is held into 16
const links = Array.from({ length: 16 }, (_, i) => ([2, 10].includes(i) ? 'slide' : i === 14 ? 'tie' : ''));

const SAW_ICON = 'M2 26 L20 4 L20 26 L39 4 L39 26 L58 4';
const SQUARE_ICON = 'M2 26 L2 4 L16 4 L16 26 L30 26 L30 4 L44 4 L44 26 L58 26';
const SUB_ICON = 'M2 15 C 9 2, 23 2, 30 15 S 51 28, 58 15';
const KNOBS = [
    { id: 'cutoff', label: 'Cutoff' }, { id: 'reso', label: 'Reso' }, { id: 'env', label: 'Env' },
    { id: 'decay', label: 'Decay' }, { id: 'accent', label: 'Accent' }, { id: 'glide', label: 'Slide' },
];
const vals = reactive<Record<string, number>>({ cutoff: 0.32, reso: 0.55, env: 0.6, decay: 0.4, sub: 0.5, accent: 0.6, glide: 0.35 });
// K and L: the same six knobs, grouped, each with its value under it
const GROUPS = [
    { title: 'Filter', knobs: [{ id: 'cutoff', label: 'Cutoff', text: '320 Hz' }, { id: 'reso', label: 'Reso', text: '55%' }, { id: 'env', label: 'Env', text: '+3 oct' }] },
    { title: 'Note', knobs: [{ id: 'decay', label: 'Decay', text: '260 ms' }, { id: 'accent', label: 'Accent', text: '60%' }, { id: 'glide', label: 'Slide', text: '60 ms' }] },
];

// A note of the bass: a saw (and a sine an octave down) through a two-pole low-pass whose
// cutoff starts 3 octaves up and falls back, fading out
const SECS = 0.32;
const cutAt = (t: number) => 3 * Math.exp(-t / 0.08);
const ampAt = (t: number) => Math.min(1, t / 0.004) * Math.exp(-t / 0.12);
function samples(n: number) {
    const f = 55;
    let y1 = 0, y2 = 0;
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
        const t = (k / n) * SECS, ph = (t * f) % 1;
        const x = 1 - 2 * ph + 0.6 * Math.sin(2 * Math.PI * (f / 2) * t);
        const a = 1 - Math.exp(-2 * Math.PI * 320 * Math.pow(2, cutAt(t)) * SECS / n / 4);
        for (let r = 0; r < 4; r++) { y1 += a * (x - y1); y2 += a * (y1 - y2); }
        out.push(y2 * ampAt(t));
    }
    return out;
}
const S = samples(700);
const PEAK = Math.max(...S.map(Math.abs)) || 1;
function wavePath(W: number, H: number) {
    return S.map((v, i) => `${i ? 'L' : 'M'}${((i / (S.length - 1)) * W).toFixed(1)} ${(H / 2 - (v / PEAK) * H * 0.42).toFixed(1)}`).join(' ');
}
function envOutline(W: number, H: number) {
    const top: string[] = [], bot: string[] = [];
    for (let i = 0; i <= 80; i++) {
        const t = (i / 80) * SECS, x = (i / 80) * W, a = ampAt(t) * H * 0.42 * 1.08;
        top.push(`${i ? 'L' : 'M'}${x.toFixed(1)} ${(H / 2 - a).toFixed(1)}`);
        bot.push(`${i ? 'L' : 'M'}${x.toFixed(1)} ${(H / 2 + a).toFixed(1)}`);
    }
    return `${top.join(' ')} ${bot.join(' ')}`;
}
function cutoffPath(W: number, H: number) {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
        const t = (i / 60) * SECS;
        pts.push(`${i ? 'L' : 'M'}${((i / 60) * W).toFixed(1)} ${(H * 0.84 - (cutAt(t) / 3) * H * 0.62).toFixed(1)}`);
    }
    return pts.join(' ');
}

</script>

<style scoped>
.bm-led {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--hw-led-off, #2c3a33);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, .5);
    flex: none;
}

.bm-led.lit {
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 6px var(--hw-led, #5dffb0);
}

/* PADS */
.bm-grid-wrap {
    position: relative;
}

.bm-links {
    position: absolute;
    left: 0;
    right: 12px;
    bottom: -22px;
    height: 18px;
    display: grid;
    grid-template-columns: repeat(16, 1fr);
    pointer-events: none;
}

.bm-link-cell {
    position: relative;
}

.bm-link {
    position: absolute;
    left: 50%;
    width: 100%;
}

.bm-link.slide {
    top: -2px;
    height: 20px;
    overflow: visible;
}

.bm-link.slide path {
    fill: none;
    stroke: var(--hw-led, #5dffb0);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
}

.bm-link.tie {
    top: 7px;
    height: 4px;
    border-radius: 2px;
    background: var(--hw-led, #5dffb0);
    left: calc(50% + 14px);
    width: calc(100% - 28px);
}

.bm-rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 30px;
}

.bm-row {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    row-gap: 2px;
    align-items: center;
    padding-right: 12px;
}

.bm-row-cap {
    grid-column: 1 / -1;
    padding-left: 4px;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.bm-row-cap small {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    opacity: .8;
    margin-left: 4px;
}

.bm-tog {
    justify-self: center;
    width: 30px;
    height: 18px;
    padding: 0;
    display: grid;
    place-items: center;
}

.bm-glyph {
    font: 700 12px Cousine, ui-monospace, monospace;
    color: var(--hw-led, #5dffb0);
}

.bm-tog.off {
    opacity: .45;
}

/* SOUND */
.bm-sound {
    display: contents;
}

.bm-card {
    display: flex;
    min-width: 0;
    gap: 12px;
}

.bm-title {
    font: 700 14px Cousine, ui-monospace, monospace;
    margin: 0 0 6px;
    color: var(--pt-text, #fff);
}

.bm-screen {
    --sp-bg: #0c1118;
    --sp-ink: #cfe0ff;
    --bm-cut: #ff7eb3;
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 90px;
    border-radius: 6px;
    background: var(--sp-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07), inset 0 2px 10px rgba(0, 0, 0, .6);
    overflow: hidden;
}

.theme-analog .bm-screen {
    --sp-bg: #160f05;
    --sp-ink: #ffcf8a;
}

.bm-screen svg {
    position: absolute;
    inset: 22px 0 6px;
    width: 100%;
    height: calc(100% - 28px);
}

.bm-wave {
    fill: none;
    stroke: var(--sp-ink);
    stroke-width: 1.2;
    opacity: .9;
    vector-effect: non-scaling-stroke;
}

.bm-env {
    fill: none;
    stroke: var(--sp-ink);
    stroke-width: 1;
    stroke-dasharray: 3 4;
    opacity: .6;
    vector-effect: non-scaling-stroke;
}

.bm-cutline {
    fill: none;
    stroke: var(--bm-cut);
    stroke-width: 2.2;
    vector-effect: non-scaling-stroke;
}

.bm-read {
    position: absolute;
    top: 5px;
    left: 8px;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .06em;
    color: var(--sp-ink);
}

.bm-read.r {
    left: auto;
    right: 8px;
}

.bm-read b {
    font-weight: 700;
    opacity: .75;
}

.bm-read b.cut {
    color: var(--bm-cut);
    opacity: 1;
}

.bm-grip {
    position: absolute;
    width: 12px;
    height: 12px;
    margin: -6px;
    border-radius: 50%;
    border: 2px solid var(--sp-ink);
    background: var(--sp-bg);
}

.bm-grip.cut {
    border-color: var(--bm-cut);
}

.bm-osc {
    flex-direction: column;
    justify-content: center;
}

.bm-tiles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    height: 100%;
}

.is-h .bm-tiles {
    align-content: center;
}

.is-h .bm-tile {
    max-height: 150px;
}

.bm-tiles.col {
    grid-template-columns: 1fr;
}

.bm-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border-radius: 10px;
    min-height: 96px;
}

.bm-tiles.col .bm-tile {
    min-height: 0;
    flex-direction: row;
    justify-content: flex-start;
    gap: 12px;
}

.bm-tiles.col .bm-tile svg {
    width: 64px;
}

.bm-tile svg {
    width: 70%;
    max-width: 120px;
    height: 40px;
}

.bm-tile path {
    fill: none;
    stroke: #ff9ad5;
    stroke-width: 3;
    stroke-linejoin: round;
}

.bm-tile span {
    font: 700 11px Cousine, ui-monospace, monospace;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--cap-ink, #fff);
}

.bm-tile.hw-down {
    box-shadow: 0 0 0 2px var(--hw-led, #5dffb0);
}

.bm-subtile {
    background: color-mix(in oklab, var(--pt-inset) 70%, transparent);
    border: 1px dashed rgba(255, 255, 255, .14);
}

.bm-subtile path {
    stroke: #79d9ff;
}

.bm-big {
    flex-direction: column;
}

.bm-screen-big {
    min-height: 170px;
}

.bm-knobrow {
    display: flex;
    justify-content: space-evenly;
}

/* K and L: the knobs on a card of their own, in two groups */
.bm-knobcard {
    flex-direction: column;
    justify-content: center;
    gap: 14px;
}

.bm-kgroup {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.bm-kcap {
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.bm-kgrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    justify-items: center;
    gap: 4px;
}

.bm-kcell {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.bm-kval {
    font: 700 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text, #fff);
    opacity: .8;
    margin-top: 2px;
}

.bm-ladder {
    display: inline-grid;
    grid-template-columns: repeat(8, 3px);
    gap: 1px;
    height: 8px;
    margin-left: 6px;
    vertical-align: middle;
}

.bm-ladder b {
    border-radius: 1px;
    background: rgba(0, 0, 0, .5);
}

.bm-ladder b.on {
    background: #3ddc97;
}

.bm-ladder b.on.hot {
    background: #ffd166;
}

/* The phone's Sound page: everything smaller */
.is-p .bm-tile {
    min-height: 0;
    padding: 6px 8px;
}

.is-p .bm-tiles.col .bm-tile svg {
    width: 40px;
    height: 24px;
}

.is-p .bm-screen-big {
    min-height: 0;
}

.is-p.bm-knobcard,
.is-p .bm-knobcard {
    gap: 6px;
}

/* L: the tiles run the section's height */
.is-l .bm-tiles.col {
    grid-auto-rows: 1fr;
}

.is-l .bm-tiles.col .bm-tile {
    flex-direction: column;
    justify-content: center;
}

.is-l .bm-tiles.col .bm-tile svg {
    width: 70%;
}
</style>

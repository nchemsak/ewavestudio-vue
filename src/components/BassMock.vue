<!-- src/components/BassMock.vue -->
<!-- MOCKUPS ONLY (behind ?bass=g|h|i, and &m=rhythm for the same with Rhythm chosen; not for a
     PR; round 3, after the maintainer's notes on d|e|f; a–f are in git history): the Bass
     machine, the mixer and the cables between the pedals. Nothing here makes sound, and the
     cables are a picture: the effects keep working as they do.
     `part`: 'pads' (Bass's pads, Accent, Slide and Tie), 'sound' (Bass's Sound section),
     'mixer' (every machine's level and how much goes to the pedals), 'cables'. -->
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
            <template v-if="variant !== 'h'">
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
            </template>
            <!-- H: one row for both: a click goes none → slide → tie -->
            <div v-else class="bm-row">
                <span class="bm-row-cap">Slide ⤳ · Tie ═ <small>a click: none → slide → tie</small></span>
                <button v-for="(l, i) in links" :key="i" type="button" tabindex="-1"
                    class="bm-tog bm-glyph hw-cap hw-cap-sm" :class="{ 'hw-down': !!l, off: !steps[i] }">{{ l === 'slide' ? '⤳' : l === 'tie' ? '═' : '' }}</button>
            </div>
        </div>
    </div>

    <!-- THE SOUND SECTION: the wave tiles, and one big screen with the knobs under it -->
    <div v-else-if="part === 'sound'" class="bm-sound" :class="`is-${variant}`">
        <div class="pt-card bm-card bm-osc" style="grid-area: osc">
            <div class="bm-tiles" :class="{ col: variant === 'g' }">
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
            <div class="bm-knobrow">
                <Knob v-for="k in KNOBS" :key="k.id" v-model="vals[k.id]" :label="k.label" :min="0" :max="1" :step="0.01"
                    size="small" :useThemeArc="true" />
            </div>
        </div>
    </div>

    <!-- THE MIXER: every machine, whichever is chosen. Level, and how much goes to the pedals
         (the rest goes straight out); its socket's cable shows it reaching them -->
    <div v-else-if="part === 'mixer'" class="pt-card bm-card bm-mixer" :class="`is-${variant}`" style="grid-area: mix">
        <h3 class="bm-title">Mixer</h3>
        <div class="bm-mix-head" aria-hidden="true">
            <span></span><span v-if="variant === 'i'">Now</span><span>Level</span><span>Pedals</span><span></span>
        </div>
        <div v-for="m in MIXER" :key="m.name" class="bm-mix-row" :class="{ ghost: m.ghost, chosen: m.name === chosen }">
            <span class="bm-mix-name"><i class="bm-led" :class="{ lit: !m.ghost }"></i>{{ m.name }}<small v-if="m.ghost">soon</small></span>
            <span v-if="variant === 'i'" class="bm-meter"><i :style="{ width: `${m.ghost ? 0 : m.meter * 100}%` }"></i></span>
            <Knob :modelValue="m.level" :label="`${m.name} level`" hideLabel :min="0" :max="1" :step="0.01" size="mini" :useThemeArc="true" :disabled="m.ghost" />
            <Knob :modelValue="m.fx" :label="`${m.name} to the pedals`" hideLabel :min="0" :max="1" :step="0.01" size="mini" :useThemeArc="true" :disabled="m.ghost" />
            <span class="bm-sock" :data-mix-jack="m.ghost ? null : m.name"></span>
        </div>
    </div>

    <!-- THE CABLES: a picture of the way through the pedals that are on -->
    <svg v-else-if="part === 'cables'" ref="svgEl" class="bm-cables" :viewBox="`0 0 ${box.w} ${box.h}`" aria-hidden="true">
        <template v-for="(c, i) in cables" :key="i">
            <path :d="c.d" class="bm-cable-shadow" />
            <path :d="c.d" class="bm-cable" :style="{ stroke: c.colour }" />
        </template>
        <g v-for="(s, i) in sockets" :key="`s${i}`" class="bm-socket">
            <circle :cx="s.x" :cy="s.y" r="6.5" class="ring" />
            <circle :cx="s.x" :cy="s.y" r="3" class="hole" />
            <text v-if="s.label" :x="s.x + (s.lx ?? 0)" :y="s.y + (s.ly ?? -11)" :text-anchor="s.anchor ?? 'middle'">{{ s.label }}</text>
        </g>
        <rect v-for="(p, i) in plugs" :key="`p${i}`" :x="p.x - 4" :y="p.y - 9" width="8" height="10" rx="2" class="bm-plug" />
    </svg>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import Knob from './Knob.vue';
import SynthStepGrid from './SynthStepGrid.vue';

const props = defineProps<{
    part: 'pads' | 'sound' | 'mixer' | 'cables';
    variant: string;
    chosen?: string;
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
const MIXER = [
    { name: 'Rhythm', level: 0.5, fx: 1, meter: 0.62, ghost: false },
    { name: 'Bass', level: 0.6, fx: 0.4, meter: 0.78, ghost: false },
    { name: 'Drums', level: 0.7, fx: 0.3, meter: 0, ghost: true },
    { name: 'Drift', level: 0.4, fx: 1, meter: 0, ghost: true },
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

// THE CABLES, measured from the page. Drawn as a simple line through the pedals that are on,
// left to right (the overdrive first), then down to the lo-fi deck, which is the way out. It's
// a picture: the delay and the reverb still run side by side as they do today. A pedal's top
// jacks are its ::before (38 px from the left) and ::after (12 px from the right), 13 px wide.
const RHYTHM_CABLE = '#ff7eb3';
const BASS_CABLE = '#4fd1c5';
const CHAIN_CABLE = '#9aa3b8';
const svgEl = ref<SVGSVGElement | null>(null);
const box = reactive({ w: 100, h: 100 });
const cables = ref<{ d: string; colour: string }[]>([]);
const sockets = ref<{ x: number; y: number; label?: string; lx?: number; ly?: number; anchor?: string }[]>([]);
const plugs = ref<{ x: number; y: number }[]>([]);

function measure() {
    const host = svgEl.value?.parentElement;
    const fx = host?.querySelector('#effects-panel') as HTMLElement | null;
    if (!host || !fx) return;
    const o = host.getBoundingClientRect();
    box.w = o.width; box.h = o.height;
    const r = (el: Element | null) => {
        const b = el!.getBoundingClientRect();
        return { left: b.left - o.left, right: b.right - o.left, top: b.top - o.top, bottom: b.bottom - o.top };
    };
    const card = r(fx);
    const pedal = (c: string) => r(fx.querySelector(c));
    const drive = pedal('.drive-pedal'), reverb = pedal('.reverb-pedal'), deck = pedal('.tape-pedal');
    const c: { d: string; colour: string }[] = [];
    const s: typeof sockets.value = [];
    // Overdrive → (over the delay, which is off) → reverb, by their top jacks
    const dOut = { x: drive.right - 18.5, y: drive.top - 3 }, rIn = { x: reverb.left + 44.5, y: reverb.top - 3 };
    c.push({ d: `M${dOut.x} ${dOut.y} C${dOut.x + 10} ${dOut.y - 30}, ${rIn.x - 10} ${rIn.y - 30}, ${rIn.x} ${rIn.y}`, colour: CHAIN_CABLE });
    // Reverb → lo-fi, one cable down the right-hand side; the deck's socket is the way out
    const rOut = { x: reverb.right + 4, y: reverb.top + 40 };
    const lofi = { x: deck.right + 4, y: (deck.top + deck.bottom) / 2 };
    s.push({ x: rOut.x, y: rOut.y }, { x: lofi.x, y: lofi.y, label: 'OUT', lx: 7, ly: 20 });
    c.push({ d: `M${rOut.x} ${rOut.y} C${rOut.x + 20} ${rOut.y + 30}, ${lofi.x + 20} ${lofi.y - 40}, ${lofi.x} ${lofi.y}`, colour: CHAIN_CABLE });
    plugs.value = [dOut, rIn];
    if (props.variant === 'h') {
        // One IN on the card, fed from the mixer in the rail
        const p = { x: card.left + 170, y: card.top + 26 };
        const dIn = { x: drive.left + 44.5, y: drive.top - 3 };
        s.push({ x: p.x, y: p.y, label: 'IN ← MIXER', ly: -11 });
        c.push({ d: `M${p.x} ${p.y} C${p.x} ${p.y + 22}, ${dIn.x} ${dIn.y - 22}, ${dIn.x} ${dIn.y}`, colour: CHAIN_CABLE });
        plugs.value.push(dIn);
    } else {
        // From the mixer's sockets into the overdrive's side
        const dIn = { x: drive.left - 4, y: drive.top + 40 };
        s.push({ x: dIn.x, y: dIn.y });
        host.querySelectorAll('[data-mix-jack]').forEach((el) => {
            const b = r(el);
            const p = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
            const bass = el.getAttribute('data-mix-jack') === 'Bass';
            const k = Math.max(30, (dIn.x - p.x) * 0.45);
            c.push({ d: `M${p.x} ${p.y} C${p.x + k} ${p.y}, ${dIn.x - k} ${dIn.y}, ${dIn.x} ${dIn.y}`, colour: bass ? BASS_CABLE : RHYTHM_CABLE });
        });
    }
    sockets.value = s;
    cables.value = c;
}
let ro: ResizeObserver | null = null;
let timer = 0;
onMounted(() => {
    if (props.part !== 'cables') return;
    ro = new ResizeObserver(() => measure());
    if (svgEl.value?.parentElement) ro.observe(svgEl.value.parentElement);
    timer = window.setInterval(measure, 500);
    measure();
});
onBeforeUnmount(() => { ro?.disconnect(); clearInterval(timer); });
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

/* THE MIXER */
.bm-mixer {
    flex-direction: column;
    justify-content: flex-start;
    gap: 8px;
}

.bm-mix-head,
.bm-mix-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px 44px 22px;
    align-items: center;
    justify-items: center;
    gap: 8px;
}

.is-i .bm-mix-head,
.is-i .bm-mix-row {
    grid-template-columns: 110px minmax(0, 1fr) 44px 44px 22px;
}

.bm-mix-head {
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.bm-mix-row {
    padding: 4px 6px;
    border-radius: 6px;
    background: var(--pt-inset, rgba(0, 0, 0, .3));
}

.bm-mix-row.chosen {
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--hw-led, #7dffb0), transparent 35%);
}

.bm-mix-row.ghost {
    opacity: .45;
}

.bm-mix-name {
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 7px;
    font: 700 11px Cousine, ui-monospace, monospace;
    color: var(--pt-text, #fff);
    white-space: nowrap;
}

.bm-mix-name small {
    font-weight: 400;
    opacity: .7;
}

.bm-meter {
    justify-self: stretch;
    height: 8px;
    border-radius: 4px;
    background: rgba(0, 0, 0, .45);
    overflow: hidden;
}

.bm-meter i {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #3ddc97, #3ddc97 65%, #ffd166 85%, #ff6b6b);
}

.bm-sock {
    display: inline-block;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: radial-gradient(circle, #050505 35%, #8d8d8d 40%, #3a3a3a 70%);
}

/* THE CABLES */
.bm-cables {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 6;
}

.bm-cable,
.bm-cable-shadow {
    fill: none;
    stroke-linecap: round;
}

.bm-cable {
    stroke-width: 4;
}

.bm-cable-shadow {
    stroke: rgba(0, 0, 0, .5);
    stroke-width: 7;
    transform: translateY(2px);
}

.bm-socket .ring {
    fill: #3a3a3a;
    stroke: #8d8d8d;
    stroke-width: 1.5;
}

.bm-socket .hole {
    fill: #050505;
}

.bm-socket text {
    font: 700 8px Cousine, ui-monospace, monospace;
    letter-spacing: .06em;
    fill: var(--pt-text-dim, #b9a8d8);
}

.bm-plug {
    fill: #1b1b1b;
    stroke: #777;
    stroke-width: 1;
}
</style>

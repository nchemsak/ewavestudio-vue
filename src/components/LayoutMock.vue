<!-- src/components/LayoutMock.vue -->
<!-- MOCKUPS ONLY (behind ?mock=a|b|c; not for a PR): what the page could look like once the big
     screen's views are spread around the cards (the plan's item 1), and where the machines
     (items 2–6) would go in the space the screen leaves. `part` picks what this copy draws:
     'column' (the right-hand column of A and C), 'strip' (the tiny scope and spectrogram, in
     the top bar for B), 'lanes' (C's thin lanes under the pads), 'tabs' (B's machine tabs).
     It also lays the in-card views over the Filter, Envelope and Melody Maker screens (once,
     from the 'overlays' part). -->
<template>
    <!-- The tiny screens: scope and spectrogram -->
    <div v-if="part === 'strip'" class="lm-strip" :class="`is-${variant}`">
        <canvas ref="scopeEl" class="lm-mini" aria-hidden="true"></canvas>
        <canvas ref="specEl" class="lm-mini" aria-hidden="true"></canvas>
    </div>

    <!-- A: the machine rail; C: the presets column -->
    <aside v-else-if="part === 'column'" class="pt-card lm-column">
        <div class="lm-strip is-col">
            <canvas ref="scopeEl" class="lm-mini" aria-hidden="true"></canvas>
            <canvas ref="specEl" class="lm-mini" aria-hidden="true"></canvas>
        </div>
        <template v-if="variant === 'a'">
            <div class="lm-head"><span>Machines</span><small>click one: the pads and Sound show it</small></div>
            <div class="lm-rail">
                <div v-for="m in machines" :key="m.id" class="lm-row" :class="{ on: m.id === 'rhythm', ghost: m.ghost }">
                    <span class="lm-led" :class="{ lit: m.id === 'rhythm' && !muted }"></span>
                    <span class="lm-name">{{ m.name }}<small v-if="m.ghost">soon</small></span>
                    <span class="lm-level"><i :style="{ width: `${m.level * 100}%` }"></i></span>
                    <span class="lm-cells" :class="{ bars: m.id === 'drift' }">
                        <template v-if="m.id === 'drift'">
                            <i v-for="c in ['Am', 'F', 'C', 'G']" :key="c">{{ c }}</i>
                        </template>
                        <template v-else>
                            <i v-for="(c, i) in m.cells" :key="i" :style="c" :class="{ now: m.id === 'rhythm' && i === currentStep && playing }"></i>
                        </template>
                    </span>
                </div>
            </div>
            <div class="lm-slots">
                <span class="lm-cap">Pattern</span>
                <button v-for="s in ['A', 'B', 'C', 'D']" :key="s" type="button" class="hw-cap hw-cap-sm lm-slot" :class="{ 'hw-down': s === 'A' }" tabindex="-1">{{ s }}</button>
                <button type="button" class="hw-cap hw-cap-sm lm-slot lm-copy" tabindex="-1">Copy</button>
            </div>
            <div class="lm-slots">
                <span class="lm-cap">Chain</span>
                <span v-for="(c, i) in chain" :key="i" class="lm-chain" :class="{ filled: c }">{{ c }}</span>
            </div>
        </template>
        <template v-else>
            <div class="lm-presets"><slot /></div>
            <div class="lm-note">Sound and Pattern presets moved here from the transport; with machines, they're the chosen machine's</div>
        </template>
    </aside>

    <!-- C: the other machines as thin lanes under the pads -->
    <div v-else-if="part === 'lanes'" class="lm-lanes">
        <div v-for="m in machines.slice(1)" :key="m.id" class="lm-lane ghost">
            <span class="lm-led"></span><span class="lm-name">{{ m.name }}<small>soon</small></span>
            <span class="lm-cells" :class="{ bars: m.id === 'drift' }">
                <template v-if="m.id === 'drift'"><i v-for="c in ['Am', 'F', 'C', 'G']" :key="c">{{ c }}</i></template>
                <template v-else><i v-for="(c, i) in m.cells" :key="i" :style="c"></i></template>
            </span>
        </div>
    </div>

    <!-- B: the machines as tabs over the pads, and the pattern slots and chain in the transport -->
    <div v-else-if="part === 'tabs'" class="lm-tabs">
        <button v-for="m in machines" :key="m.id" type="button" class="lm-tab" :class="{ on: m.id === 'rhythm', ghost: m.ghost }" tabindex="-1">
            <span class="lm-led" :class="{ lit: m.id === 'rhythm' }"></span>{{ m.name }}
        </button>
    </div>
    <div v-else-if="part === 'slots'" class="lm-slotbox">
        <div class="lm-slots">
            <span class="lm-cap">Pattern</span>
            <button v-for="s in ['A', 'B', 'C', 'D']" :key="s" type="button" class="hw-cap hw-cap-sm lm-slot" :class="{ 'hw-down': s === 'A' }" tabindex="-1">{{ s }}</button>
        </div>
        <div class="lm-slots">
            <span class="lm-cap">Chain</span>
            <span v-for="(c, i) in chain" :key="i" class="lm-chain" :class="{ filled: c }">{{ c }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { padHue, spectrumColour } from '../lib/padColour';
import { freqX, timeX, ENV_MAX_MS } from '../lib/shapeViews';
import { strongestNoteHz, noteOf } from './spectrumView';
import type { HitPicture } from './hitView';

const props = defineProps<{
    part: 'strip' | 'column' | 'lanes' | 'tabs' | 'slots' | 'overlays';
    variant: string;
    analyser?: AnalyserNode;
    sampleRate?: number;
    steps?: boolean[];
    pitches?: number[];
    velocities?: number[];
    currentStep?: number;
    playing?: boolean;
    muted?: boolean;
    hit?: () => HitPicture | null;
}>();

const chain = ['A', 'A', 'B', 'A', '', '', '', ''];

// Made-up steps for the machines to come, in their pads' colours
function fake(onAt: number[], hz: number) {
    return Array.from({ length: 16 }, (_, i) => onAt.includes(i)
        ? { background: `hsl(${padHue(hz)} 70% 55% / 0.55)` } : {});
}
const rhythmCells = computed(() => (props.steps || []).map((on, i) => on
    ? { background: `hsl(${padHue(props.pitches?.[i] || 220)} 80% ${40 + 25 * (props.velocities?.[i] ?? 1)}%)` } : {}));
const machines = computed(() => [
    { id: 'rhythm', name: 'Rhythm', level: 0.75, ghost: false, cells: rhythmCells.value },
    { id: 'bass', name: 'Bass', level: 0.6, ghost: true, cells: fake([0, 3, 6, 10, 12, 14], 110) },
    { id: 'drums', name: 'Drums', level: 0.7, ghost: true, cells: fake([0, 4, 8, 10, 12], 300) },
    { id: 'drift', name: 'Drift', level: 0.4, ghost: true, cells: [] },
]);

const scopeEl = ref<HTMLCanvasElement | null>(null);
const specEl = ref<HTMLCanvasElement | null>(null);
let frame = 0;
let time: Float32Array<ArrayBuffer> | null = null;
let bytes: Uint8Array<ArrayBuffer> | null = null;
const extra: HTMLElement[] = [];

function fit(c: HTMLCanvasElement) {
    const w = Math.round(c.clientWidth), h = Math.round(c.clientHeight);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return [w, h];
}
function ink(el: Element, name: string, fallback: string) {
    return (getComputedStyle(el).getPropertyValue(name) || fallback).trim();
}

function drawScope(c: HTMLCanvasElement, an: AnalyserNode) {
    const [W, H] = fit(c); const g = c.getContext('2d')!;
    g.fillStyle = ink(c, '--nac-lcd-bg', '#0f141b'); g.fillRect(0, 0, W, H);
    if (!time || time.length !== an.fftSize) time = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(time);
    let start = 0;
    for (let i = 1; i < time.length / 2; i++) if (time[i - 1] < 0 && time[i] >= 0) { start = i; break; }
    g.strokeStyle = ink(c, '--nac-scope-trace', '#c7d6ff'); g.lineWidth = 1.2; g.beginPath();
    const n = Math.min(512, time.length - start);
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * W, y = H / 2 - time[start + i] * (H / 2 - 2) * 1.6;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
}
function drawSpec(c: HTMLCanvasElement, an: AnalyserNode, sr: number) {
    const [W, H] = fit(c); const g = c.getContext('2d')!;
    if (!bytes || bytes.length !== an.frequencyBinCount) bytes = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(bytes);
    const img = g.getImageData(1, 0, W - 1, H); g.putImageData(img, 0, 0);
    g.fillStyle = ink(c, '--nac-lcd-bg', '#0f141b'); g.fillRect(W - 1, 0, 1, H);
    const binHz = sr / an.fftSize;
    for (let y = 0; y < H; y++) {
        const hz = 40 * Math.pow(250, 1 - y / H);
        const v = Math.max(0, bytes[Math.min(bytes.length - 1, Math.round(hz / binHz))] - 60) * 1.4;
        if (v > 4) { g.fillStyle = spectrumColour(hz, v); g.fillRect(W - 1, y, 1, 1); }
    }
}

// The in-card views: a canvas behind each screen's curve
function under(sel: string) {
    const host = document.querySelector(sel) as HTMLElement | null;
    if (!host) return null;
    const c = document.createElement('canvas');
    c.className = 'lm-under';
    host.prepend(c);
    extra.push(c);
    return c;
}
let filterC: HTMLCanvasElement | null = null, envC: HTMLCanvasElement | null = null;
let tuner: HTMLElement | null = null;
let held: Float32Array | null = null;
let tunerHold = 0;
let lastHit: HitPicture | null = null;

function drawFilter(c: HTMLCanvasElement, an: AnalyserNode, sr: number) {
    const [W, H] = fit(c); const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    if (!bytes || bytes.length !== an.frequencyBinCount) bytes = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(bytes);
    const binHz = sr / an.fftSize;
    if (!held || held.length !== W) held = new Float32Array(W);
    for (let x = 0; x < W; x++) {
        const hz = 20 * Math.pow(1000, x / W);
        const b = Math.min(bytes.length - 1, Math.max(1, Math.round(hz / binHz)));
        const v = bytes[b] / 255;
        held[x] = Math.max(v, held[x] * 0.97);
        const h = held[x] * H * 0.9;
        if (h < 1) continue;
        g.fillStyle = `hsl(${padHue(hz)} 80% 60% / 0.38)`;
        g.fillRect(x, H - h, 1, h);
    }
}
function drawEnv(c: HTMLCanvasElement) {
    const h = props.hit?.();
    if (!h || h === lastHit) { if (c.width === Math.round(c.clientWidth)) return; }
    lastHit = h || null;
    const [W, H] = fit(c); const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    if (!h) return;
    const ch = h.channels[0]; const sr = h.sampleRate;
    let peak = 1e-6; for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    g.fillStyle = `hsl(${padHue(h.hz)} 80% 60% / 0.35)`;
    let prevX = 0;
    for (let x = 1; x <= W; x++) {
        // the column's time span on the card's square-root axis
        const t0 = ENV_MAX_MS * Math.pow(prevX / W, 2), t1 = ENV_MAX_MS * Math.pow(x / W, 2);
        const i0 = Math.floor((t0 / 1000) * sr), i1 = Math.max(i0 + 1, Math.floor((t1 / 1000) * sr));
        let m = 0; for (let i = i0; i < i1 && i < ch.length; i++) m = Math.max(m, Math.abs(ch[i]));
        const hh = (m / peak) * (H - 10);
        g.fillRect(prevX, H - hh, 1, hh);
        prevX = x;
    }
    void timeX;
}
function drawTuner(an: AnalyserNode, sr: number) {
    if (!tuner) return;
    if (!bytes || bytes.length !== an.frequencyBinCount) bytes = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(bytes);
    const hz = strongestNoteHz(bytes, sr / an.fftSize);
    const now = performance.now();
    if (hz) {
        const n = noteOf(hz);
        tunerHold = now;
        tuner.innerHTML = `<b>${n.name}</b> ${n.cents > 0 ? '+' : ''}${n.cents}¢<span class="lm-needle"><i style="left:${50 + n.cents}%"></i></span>`;
        tuner.style.opacity = '1';
    } else if (now - tunerHold > 800) {
        tuner.style.opacity = '0.35';
        tuner.innerHTML = `<b>—</b> tuner<span class="lm-needle"><i style="left:50%"></i></span>`;
    }
}

function loop() {
    frame = requestAnimationFrame(loop);
    const an = props.analyser; const sr = props.sampleRate || 48000;
    if (!an) return;
    if (scopeEl.value) drawScope(scopeEl.value, an);
    if (specEl.value) drawSpec(specEl.value, an, sr);
    if (props.part === 'overlays') {
        if (filterC) drawFilter(filterC, an, sr);
        if (envC) drawEnv(envC);
        drawTuner(an, sr);
    }
}

onMounted(() => {
    if (props.part === 'overlays') {
        filterC = under('.ds-sound .filter-card .sp-pad');
        envC = under('.ds-sound section[aria-label="Envelope"] .sp-pad');
        const mm = document.querySelector('.ds-compose .mm-screen') as HTMLElement | null;
        if (mm) {
            tuner = document.createElement('div');
            tuner.className = 'lm-tuner';
            mm.appendChild(tuner);
            extra.push(tuner);
        }
    }
    frame = requestAnimationFrame(loop);
});
onBeforeUnmount(() => { cancelAnimationFrame(frame); extra.forEach((e) => e.remove()); });
</script>

<style>
/* Global: these sit inside other components' screens */
.lm-under {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}
.lm-tuner {
    position: absolute;
    right: 6px;
    bottom: 6px;
    z-index: 3;
    padding: 2px 6px 3px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.55);
    color: #cfe0ff;
    font: 10px ui-monospace, monospace;
    pointer-events: none;
    transition: opacity 0.3s;
}
.lm-tuner b { color: #fff; font-size: 12px; }
.lm-needle { display: block; position: relative; height: 4px; margin-top: 2px; width: 70px; background: linear-gradient(90deg, transparent 49%, #7dffb0 49% 51%, transparent 51%), rgba(255,255,255,0.12); border-radius: 2px; }
.lm-needle i { position: absolute; top: -1px; width: 3px; height: 6px; margin-left: -1px; background: #ffb547; border-radius: 1px; }
</style>

<style scoped>
.lm-strip { display: flex; gap: 6px; }
.lm-strip.is-b { height: 34px; width: 260px; }
.lm-strip.is-col { height: 46px; }
.lm-mini {
    flex: 1 1 0;
    min-width: 0;
    height: 100%;
    border-radius: 5px;
    background: var(--nac-lcd-bg, #0f141b);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), 0 0 0 2px rgba(0, 0, 0, 0.45);
}
.lm-column { display: flex; flex-direction: column; gap: 10px; padding: 12px; align-self: stretch; }
.lm-head { display: flex; align-items: baseline; gap: 8px; font: 700 13px ui-monospace, monospace; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pt-text, #e8e2ff); }
.lm-head small { font-weight: 400; letter-spacing: 0; text-transform: none; opacity: 0.55; font-size: 10px; }
.lm-rail { display: flex; flex-direction: column; gap: 5px; }
.lm-row, .lm-lane {
    display: grid;
    grid-template-columns: 10px 64px 44px 1fr;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--pt-inset, rgba(0, 0, 0, 0.3));
    font: 600 11px ui-monospace, monospace;
    color: var(--pt-text, #e8e2ff);
}
.lm-lane { grid-template-columns: 10px 64px 1fr; padding: 3px 8px; }
.lm-row.on { box-shadow: inset 0 0 0 1px var(--hw-led, #7dffb0); }
.ghost { opacity: 0.45; }
.lm-name small { display: block; font-weight: 400; font-size: 9px; opacity: 0.7; }
.lm-lane .lm-name small { display: inline; margin-left: 6px; }
.lm-led { width: 8px; height: 8px; border-radius: 50%; background: var(--hw-led-off, #2b3a33); }
.lm-led.lit { background: var(--hw-led, #7dffb0); box-shadow: 0 0 6px var(--hw-led, #7dffb0); }
.lm-level { height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.1); overflow: hidden; }
.lm-level i { display: block; height: 100%; background: var(--hw-led, #7dffb0); opacity: 0.7; }
.lm-cells { display: grid; grid-template-columns: repeat(16, 1fr); gap: 2px; height: 14px; }
.lm-lane .lm-cells { height: 10px; }
.lm-cells i { border-radius: 2px; background: rgba(255, 255, 255, 0.07); }
.lm-cells i:nth-child(4n + 1) { background-color: rgba(255, 255, 255, 0.12); }
.lm-cells i.now { outline: 1px solid #fff; }
.lm-cells.bars { grid-template-columns: repeat(4, 1fr); }
.lm-cells.bars i { font: 9px ui-monospace, monospace; font-style: normal; text-align: center; line-height: inherit; background: hsl(280 50% 50% / 0.35); }
.lm-slots { display: flex; align-items: center; gap: 5px; }
.lm-cap { width: 56px; font: 600 10px ui-monospace, monospace; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.7; color: var(--pt-text, #e8e2ff); }
.lm-slot { min-width: 30px; height: 24px; font: 700 11px ui-monospace, monospace; }
.lm-copy { margin-left: auto; padding: 0 8px; }
.lm-chain { flex: 1 1 0; height: 22px; border-radius: 4px; border: 1px dashed rgba(255, 255, 255, 0.2); font: 700 10px/20px ui-monospace, monospace; text-align: center; color: var(--pt-text, #e8e2ff); }
.lm-chain.filled { border-style: solid; background: var(--pt-inset, rgba(0,0,0,.3)); }
.lm-presets { display: flex; flex-direction: column; gap: 10px; flex: 1 1 auto; justify-content: center; }
.lm-note { font: 10px ui-monospace, monospace; opacity: 0.55; color: var(--pt-text, #e8e2ff); }
.lm-lanes { display: flex; flex-direction: column; gap: 3px; margin-top: 26px; }
.lm-tabs { display: flex; gap: 4px; margin-left: 12px; }
.lm-tab { display: flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 5px 5px 0 0; border: 1px solid rgba(255, 255, 255, 0.15); border-bottom: 0; background: var(--pt-inset, rgba(0, 0, 0, .3)); font: 600 11px ui-monospace, monospace; color: var(--pt-text, #e8e2ff); }
.lm-tab.on { border-color: var(--hw-led, #7dffb0); }
.lm-slotbox { display: flex; flex-direction: column; gap: 6px; min-width: 260px; }
</style>

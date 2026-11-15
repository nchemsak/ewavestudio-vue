<!-- src/components/SoundCardsMock.vue -->
<!-- MOCKUPS (?cards=a|b|c): three looks for the plain cards (Envelope, Pitch, Filter; FM; Unison),
     not for shipping as is. DrumSequencer draws this in place of the real cards while the URL
     has ?cards=. `part` is which piece: 'shape' (the Envelope | Pitch | Filter row), 'fm' or
     'unison'. `m` is a reactive object of the real settings, so the mockups play.
       a  Glyphs: the cards as they are, each with a small live picture; ribbons on FM and Unison
       b  Rack: the row as one rack unit with a "hit" display; FM and Unison as rack units
       c  Touch the shape: each card is a screen you drag; mini knobs beside it -->
<template>
    <!-- ───────────── SHAPE ROW ───────────── -->
    <!-- a: three cards, a glyph in each header -->
    <div v-if="part === 'shape' && variant === 'a'" class="scm-row">
        <section v-for="s in SECTIONS" :key="s.id" class="pt-card scm-card" :class="`scm-${s.id}`">
            <div class="scm-head">
                <h2 class="pt-title">{{ s.title }}</h2>
                <svg class="scm-glyph" :viewBox="`0 0 ${s.gw} 26`" preserveAspectRatio="none" aria-hidden="true">
                    <line v-if="s.id === 'pitch'" x1="0" :x2="s.gw" y1="13" y2="13" class="scm-axis" />
                    <path v-if="s.id === 'filter' && ghostFilter(s.gw, 26)" :d="ghostFilter(s.gw, 26)" class="scm-ghost" />
                    <path :d="curve(s.id, s.gw, 26)" class="scm-line" :class="{ fill: s.id === 'env' }" />
                </svg>
                <button v-if="s.id === 'pitch'" type="button" class="scm-pill hw-cap hw-cap-sm hw-led-left" :class="{ on: m.pitchMode === 'random' }"
                    @click="toggleRandom">Random</button>
                <button v-if="s.id === 'filter'" type="button" class="scm-pill hw-cap hw-cap-sm hw-led-left" :class="{ on: m.vel > 0 }"
                    @click="m.vel = m.vel > 0 ? 0 : 75">VEL</button>
            </div>
            <div class="scm-knobs">
                <template v-for="k in s.knobs" :key="k.key">
                    <span v-if="k.rule" class="scm-rule"></span>
                    <Knob v-model="K[k.key].value" :label="k.label" size="small" :min="k.min" :max="k.max" :step="k.step"
                        :taper="k.log ? 'log' : undefined" :bipolar="k.bipolar" />
                </template>
            </div>
        </section>
    </div>

    <!-- b: one rack unit; a "hit" display shows what the three do to a note over time -->
    <div v-else-if="part === 'shape' && variant === 'b'" class="scm-rack scm-rack--row">
        <span class="scm-ear"><i></i><i></i></span>
        <div class="scm-face">
            <div class="scm-window scm-hit" aria-hidden="true">
                <svg :viewBox="`0 0 150 70`" preserveAspectRatio="none">
                    <path :d="curve('env', 150, 70)" class="scm-line fill" />
                    <path :d="hitCutoff(150, 70)" class="scm-line cutoff" />
                    <path :d="hitPitch(150, 70)" class="scm-line pitch" />
                </svg>
                <span class="scm-legend"><b class="l">level</b><b class="p">pitch</b><b class="c">cutoff</b></span>
            </div>
            <div v-for="s in SECTIONS" :key="s.id" class="scm-group" :class="`scm-g-${s.id}`">
                <div class="scm-bracket"><span>{{ s.title }}</span></div>
                <div class="scm-knobs">
                    <template v-for="k in s.knobs" :key="k.key">
                        <span v-if="k.rule" class="scm-rule"></span>
                        <Knob v-model="K[k.key].value" :label="k.label" size="small" :min="k.min" :max="k.max" :step="k.step"
                            :taper="k.log ? 'log' : undefined" :bipolar="k.bipolar" />
                    </template>
                    <button v-if="s.id === 'pitch'" type="button" class="scm-rocker" :class="{ on: m.pitchMode === 'random' }" @click="toggleRandom"><i></i>RND</button>
                    <button v-if="s.id === 'filter'" type="button" class="scm-rocker" :class="{ on: m.vel > 0 }" @click="m.vel = m.vel > 0 ? 0 : 75"><i></i>VEL</button>
                </div>
            </div>
            <span class="scm-badge">EW·3 <em>shaper</em></span>
        </div>
        <span class="scm-ear"><i></i><i></i></span>
    </div>

    <!-- c: each card is a screen you drag; a mini knob for every setting beside it -->
    <div v-else-if="part === 'shape'" class="scm-row">
        <section v-for="s in SECTIONS" :key="s.id" class="pt-card scm-card scm-touch" :class="`scm-${s.id}`">
            <div class="scm-pad" :class="{ dragging: drag === s.id }" @pointerdown="startDrag(s.id, $event)" @pointermove="moveDrag($event)"
                @pointerup="endDrag" @pointercancel="endDrag">
                <svg :viewBox="`0 0 ${PAD_W[s.id]} ${PAD_H}`" preserveAspectRatio="none" aria-hidden="true">
                    <line v-if="s.id === 'pitch'" x1="0" :x2="PAD_W.pitch" :y1="PAD_H / 2" :y2="PAD_H / 2" class="scm-axis" />
                    <path v-if="s.id === 'filter' && ghostFilter(PAD_W.filter, PAD_H)" :d="ghostFilter(PAD_W.filter, PAD_H)" class="scm-ghost" />
                    <path :d="curve(s.id, PAD_W[s.id], PAD_H, true)" class="scm-line" :class="{ fill: s.id !== 'pitch' }" />
                </svg>
                <span v-for="h in handles(s.id)" :key="h.id" class="scm-handle" :class="{ on: drag === s.id && dragHandle === h.id }"
                    :style="{ left: `${(h.x / PAD_W[s.id]) * 100}%`, top: `${(h.y / PAD_H) * 100}%` }"></span>
                <span class="scm-pad-title" :class="{ right: s.id !== 'filter' }">{{ s.title }}<small>{{ readout(s.id) }}</small></span>
            </div>
            <div class="scm-minis" :class="{ four: s.knobs.length > 2 }">
                <div v-for="k in s.knobs" :key="k.key" class="scm-mini">
                    <Knob v-model="K[k.key].value" :label="k.label" hideLabel size="mini" :min="k.min" :max="k.max" :step="k.step"
                        :taper="k.log ? 'log' : undefined" :bipolar="k.bipolar" />
                    <span>{{ k.short }}</span>
                </div>
                <button v-if="s.id === 'pitch'" type="button" class="scm-pill scm-pill--mini hw-cap hw-cap-sm hw-led-left" :class="{ on: m.pitchMode === 'random' }"
                    @click="toggleRandom">RND</button>
                <button v-if="s.id === 'filter'" type="button" class="scm-pill scm-pill--mini hw-cap hw-cap-sm hw-led-left" :class="{ on: m.vel > 0 }"
                    @click="m.vel = m.vel > 0 ? 0 : 75">VEL</button>
            </div>
        </section>
    </div>

    <!-- ───────────── FM and UNISON ───────────── -->
    <div v-else class="scm-unit" :class="[`scm-u-${variant}`, `scm-${part}`, { 'is-off': !on, 'scm-rack': variant === 'b' }]">
        <span v-if="variant === 'b'" class="scm-ear"><i></i><i></i></span>
        <!-- the switch: a ribbon (a, c) or a rocker on the faceplate (b) -->
        <button v-if="variant !== 'b'" type="button" class="scm-ribbon" :class="{ 'is-on': on }" :aria-pressed="on" :aria-label="part === 'fm' ? 'FM' : 'Unison'" role="switch"
            :aria-checked="on" @click="toggleOn"><span class="scm-ribbon-led"></span><span class="scm-ribbon-label">{{ part === 'fm' ? 'FM' : 'UNISON' }}</span></button>
        <div class="scm-face">
            <button v-if="variant === 'b'" type="button" class="scm-power" :class="{ on }" role="switch" :aria-checked="on" :aria-label="part === 'fm' ? 'FM' : 'Unison'" @click="toggleOn">
                <i></i><span>{{ part === 'fm' ? 'FM' : 'UNISON' }}</span></button>

            <!-- the picture: FM's wave, or the unison's voices drifting apart; in c you drag it -->
            <div class="scm-window scm-pic" :class="{ 'scm-pad': variant === 'c', dragging: drag === part }"
                @pointerdown="variant === 'c' && startDrag(part, $event)" @pointermove="moveDrag($event)" @pointerup="endDrag" @pointercancel="endDrag">
                <svg :viewBox="`0 0 ${PIC_W} ${PIC_H}`" preserveAspectRatio="none" aria-hidden="true">
                    <template v-if="part === 'fm'"><path :d="fmWave(PIC_W, PIC_H)" class="scm-line" /></template>
                    <template v-else>
                        <path v-for="(d, i) in voiceWaves(PIC_W, PIC_H)" :key="i" :d="d" class="scm-line voice" />
                        <circle v-for="(x, i) in voiceDots(PIC_W)" :key="'d' + i" :cx="x" :cy="PIC_H - 5" r="2.2" class="scm-dot" />
                    </template>
                </svg>
                <span v-if="variant === 'c'" class="scm-drag-hint">{{ part === 'fm' ? '↕ amount' : '↔ detune  ↕ spread' }}</span>
            </div>

            <template v-if="part === 'fm'">
                <div class="scm-stepper" role="group" aria-label="FM ratio">
                    <button type="button" class="hw-cap hw-cap-sm scm-step" :disabled="!on" @click="stepRatio(-1)">◂</button>
                    <span class="scm-step-name">{{ ratioName }}<small>{{ ratioHint }}</small></span>
                    <button type="button" class="hw-cap hw-cap-sm scm-step" :disabled="!on" @click="stepRatio(1)">▸</button>
                </div>
                <div class="scm-knobs" :class="{ minis: variant === 'c' }">
                    <div class="scm-mini"><Knob v-model="K.fmFreq.value" label="Mod Freq" :hideLabel="variant === 'c'" :size="variant === 'c' ? 'mini' : 'small'" :min="1" :max="5000" :step="1" taper="log"
                            :disabled="!on || m.fmRatio !== null" /><span v-if="variant === 'c'">Freq</span></div>
                    <div class="scm-mini"><Knob v-model="K.fmIndex.value" label="Amount" :hideLabel="variant === 'c'" :size="variant === 'c' ? 'mini' : 'small'" :min="0" :max="50" :step="0.1" :disabled="!on" />
                        <span v-if="variant === 'c'">Amount</span></div>
                </div>
            </template>
            <template v-else>
                <div class="scm-voices">
                    <span class="scm-cap">Voices</span>
                    <div class="pt-seg pt-seg-sm scm-seg" role="radiogroup" aria-label="Voices">
                        <button v-for="n in [2, 3, 4]" :key="n" type="button" class="pt-seg-btn hw-led-top" :class="{ 'is-active': m.voices === n }" :disabled="!on"
                            role="radio" :aria-checked="m.voices === n" @click="m.voices = n">{{ n }}</button>
                    </div>
                </div>
                <div class="scm-knobs" :class="{ minis: variant === 'c' }">
                    <div class="scm-mini"><Knob v-model="K.detune.value" label="Detune" :hideLabel="variant === 'c'" :size="variant === 'c' ? 'mini' : 'small'" :min="0" :max="100" :step="1" :disabled="!on" />
                        <span v-if="variant === 'c'">Detune</span></div>
                    <div class="scm-mini"><Knob v-model="K.spread.value" label="Spread" :hideLabel="variant === 'c'" :size="variant === 'c' ? 'mini' : 'small'" :min="0" :max="100" :step="1" :disabled="!on" />
                        <span v-if="variant === 'c'">Spread</span></div>
                </div>
            </template>
        </div>
        <span v-if="variant === 'b'" class="scm-ear"><i></i><i></i></span>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import Knob from './Knob.vue';

type Model = {
    attack: number; decay: number;
    pitchSemis: number; pitchDecay: number; pitchMode: 'up' | 'down' | 'random';
    cutoff: number; resonance: number; envAmt: number; envDecay: number; vel: number;
    fmOn: boolean; fmRatio: number | null; fmFreq: number; fmIndex: number;
    uniOn: boolean; voices: number; detune: number; spread: number;
};
const props = defineProps<{ variant: string; part: 'shape' | 'fm' | 'unison'; m: Model }>();
const m = props.m;

// The pitch Amount as one two-way knob: right of centre starts above, left below
const pitchAmt = computed<number>({
    get: () => (m.pitchMode === 'down' ? -m.pitchSemis : m.pitchSemis),
    set: (v) => { m.pitchSemis = Math.abs(Math.round(v)); if (m.pitchMode !== 'random' && v !== 0) m.pitchMode = v < 0 ? 'down' : 'up'; },
});
let lastDir: 'up' | 'down' = 'up';
function toggleRandom() {
    if (m.pitchMode === 'random') m.pitchMode = lastDir;
    else { lastDir = m.pitchMode; m.pitchMode = 'random'; }
}
const K = {
    attack: toRef(m, 'attack'), decay: toRef(m, 'decay'), pitchAmt, pitchDecay: toRef(m, 'pitchDecay'),
    cutoff: toRef(m, 'cutoff'), resonance: toRef(m, 'resonance'), envAmt: toRef(m, 'envAmt'), envDecay: toRef(m, 'envDecay'),
    fmFreq: toRef(m, 'fmFreq'), fmIndex: toRef(m, 'fmIndex'), detune: toRef(m, 'detune'), spread: toRef(m, 'spread'),
} as Record<string, { value: number }>;

type KnobDef = { key: string; label: string; short: string; min: number; max: number; step: number; log?: boolean; bipolar?: boolean; rule?: boolean };
const SECTIONS: { id: 'env' | 'pitch' | 'filter'; title: string; gw: number; knobs: KnobDef[] }[] = [
    { id: 'env', title: 'Envelope', gw: 54, knobs: [
        { key: 'attack', label: 'Attack', short: 'Attack', min: 1, max: 500, step: 1, log: true },
        { key: 'decay', label: 'Decay', short: 'Decay', min: 50, max: 2000, step: 1, log: true }] },
    { id: 'pitch', title: 'Pitch', gw: 46, knobs: [
        { key: 'pitchAmt', label: 'Amount', short: 'Amount', min: -48, max: 48, step: 1, bipolar: true },
        { key: 'pitchDecay', label: 'Decay', short: 'Decay', min: 5, max: 2000, step: 1, log: true }] },
    { id: 'filter', title: 'Filter', gw: 110, knobs: [
        { key: 'cutoff', label: 'Cutoff', short: 'Cutoff', min: 100, max: 10000, step: 1, log: true },
        { key: 'resonance', label: 'Resonance', short: 'Reso', min: 0.1, max: 20, step: 0.1 },
        { key: 'envAmt', label: 'Env Amt', short: 'Env', min: -5, max: 5, step: 0.1, bipolar: true, rule: true },
        { key: 'envDecay', label: 'Decay', short: 'Decay', min: 5, max: 2000, step: 1, log: true }] },
];

// ── the pictures ──
// Time runs left to right on a square-root scale over 2.5 s, so a 20 ms attack still shows
const T_MAX = 2500;
const tx = (ms: number, w: number) => Math.sqrt(Math.min(ms, T_MAX) / T_MAX) * w;
const xt = (x: number, w: number) => Math.pow(Math.max(0, Math.min(1, x / w)), 2) * T_MAX;
const path = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');

function envPts(w: number, h: number): [number, number][] {
    const top = 4, base = h - 2;
    const pts: [number, number][] = [[0, base], [tx(m.attack, w), top]];
    for (let i = 1; i <= 40; i++) {
        const t = (i / 40) * m.decay * 1.6;
        pts.push([tx(m.attack + t, w), base - (base - top) * Math.exp(-t / (m.decay / 4))]);
    }
    pts.push([w, base]);
    return pts;
}
function pitchPts(w: number, h: number, sign: number): [number, number][] {
    const mid = h / 2, reach = (m.pitchSemis / 48) * (mid - 3) * sign;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 50; i++) {
        const x = (i / 50) * w;
        pts.push([x, mid - reach * Math.exp(-xt(x, w) / Math.max(1, m.pitchDecay / 4))]);
    }
    return pts;
}
// A low-pass filter's response: frequency left to right (log, 20 Hz–20 kHz), +18 dB at the top
const fx = (hz: number, w: number) => (Math.log(hz / 20) / Math.log(1000)) * w;
const xf = (x: number, w: number) => 20 * Math.pow(1000, Math.max(0, Math.min(1, x / w)));
function filterPts(w: number, h: number, fc: number): [number, number][] {
    const q = Math.max(0.3, m.resonance);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 80; i++) {
        const x = (i / 80) * w, r = xf(x, w) / fc;
        const db = -10 * Math.log10(Math.pow(1 - r * r, 2) + Math.pow(r / q, 2));
        pts.push([x, Math.max(2, Math.min(h + 4, (h * 0.42) - (db / 30) * (h * 0.42 - 2)))]);
    }
    return pts;
}
function curve(id: string, w: number, h: number, closed = false) {
    if (id === 'env') return path(envPts(w, h));
    if (id === 'pitch') return m.pitchMode === 'random'
        ? path(pitchPts(w, h, 1)) + ' ' + path(pitchPts(w, h, -1))
        : path(pitchPts(w, h, m.pitchMode === 'down' ? -1 : 1));
    const pts = filterPts(w, h, m.cutoff);
    return closed ? path([[0, h + 4], ...pts, [w, h + 4]]) : path(pts);
}
// Where each note's cutoff starts, when the filter's envelope is on
function ghostFilter(w: number, h: number) {
    if (Math.abs(m.envAmt) < 0.05) return '';
    return path(filterPts(w, h, Math.min(20000, Math.max(20, m.cutoff * Math.pow(2, m.envAmt)))));
}
// b's display: over one hit, the pitch and the cutoff on the level's time axis
function hitPitch(w: number, h: number) {
    return path(pitchPts(w, h * 0.8, m.pitchMode === 'down' ? -1 : 1).map(([x, y]) => [x, y + h * 0.02] as [number, number]));
}
function hitCutoff(w: number, h: number) {
    const base = h * 0.55 - (Math.log(m.cutoff / 100) / Math.log(100)) * h * 0.4;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 50; i++) {
        const x = (i / 50) * w;
        pts.push([x, Math.max(3, Math.min(h - 3, base - m.envAmt * (h * 0.09) * Math.exp(-xt(x, w) / Math.max(1, m.envDecay / 4))))]);
    }
    return path(pts);
}

// FM: the carrier, bent by the modulator (ratio and amount); a plain sine while off
const PIC_W = 110;
const PIC_H = 70;
const on = computed(() => (props.part === 'fm' ? m.fmOn : m.uniOn));
function toggleOn() { if (props.part === 'fm') m.fmOn = !m.fmOn; else m.uniOn = !m.uniOn; }
function fmWave(w: number, h: number) {
    const ratio = m.fmRatio ?? Math.max(0.25, m.fmFreq / 220);
    const depth = m.fmOn ? Math.min(7, m.fmIndex / 4) : 0;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 220; i++) {
        const p = (i / 220) * 2 * Math.PI * 2;
        pts.push([(i / 220) * w, h / 2 - Math.sin(p + depth * Math.sin(p * ratio)) * (h / 2 - 8)]);
    }
    return path(pts);
}
// Unison: each voice a sine a little off the others (Detune), so they drift apart to the right;
// the dots are where the voices sit between left and right (Spread)
function voiceWaves(w: number, h: number) {
    const n = m.uniOn ? m.voices : 1;
    return Array.from({ length: n }, (_, v) => {
        const off = n === 1 ? 0 : (v / (n - 1) - 0.5) * 2;
        const pts: [number, number][] = [];
        for (let i = 0; i <= 120; i++) {
            const p = (i / 120) * 2 * Math.PI * 2.5 * (1 + off * (m.detune / 100) * 0.22);
            pts.push([(i / 120) * w, (h - 10) / 2 - Math.sin(p) * ((h - 10) / 2 - 7)]);
        }
        return path(pts);
    });
}
function voiceDots(w: number) {
    const n = m.uniOn ? m.voices : 1;
    return Array.from({ length: n }, (_, v) => w / 2 + (n === 1 ? 0 : (v / (n - 1) - 0.5)) * (w - 16) * (m.spread / 100));
}

const RATIOS: { value: number | null; name: string; hint: string }[] = [
    { value: 1, name: 'Lock', hint: '1:1' }, { value: 1.5, name: 'Metal', hint: '3:2' },
    { value: 2, name: 'Bell', hint: '2:1' }, { value: null, name: 'Free', hint: 'Hz' },
];
const ratioAt = computed(() => Math.max(0, RATIOS.findIndex((r) => r.value === m.fmRatio)));
const ratioName = computed(() => RATIOS[ratioAt.value].name);
const ratioHint = computed(() => RATIOS[ratioAt.value].hint);
function stepRatio(d: number) { m.fmRatio = RATIOS[(ratioAt.value + d + RATIOS.length) % RATIOS.length].value; }

// ── c: dragging the pictures ──
const PAD_W: Record<string, number> = { env: 110, pitch: 130, filter: 250 };
const PAD_H = 88;
const drag = ref<string | null>(null);
const dragHandle = ref('');
type Handle = { id: string; x: number; y: number };
function handles(id: string): Handle[] {
    const w = PAD_W[id];
    if (id === 'env') return [{ id: 'attack', x: tx(m.attack, w), y: 4 }, { id: 'decay', x: tx(m.attack + m.decay, w), y: PAD_H - 14 }];
    if (id === 'pitch') {
        const sign = m.pitchMode === 'down' ? -1 : 1;
        return [{ id: 'amount', x: 5, y: PAD_H / 2 - (m.pitchSemis / 48) * (PAD_H / 2 - 3) * sign }, { id: 'decay', x: tx(m.pitchDecay, w), y: PAD_H / 2 }];
    }
    const pts = filterPts(w, PAD_H, m.cutoff);
    const at = Math.round((fx(m.cutoff, w) / w) * 80);
    return [{ id: 'cutoff', x: fx(m.cutoff, w), y: pts[Math.max(0, Math.min(80, at))][1] }];
}
function readout(id: string) {
    if (id === 'env') return `${Math.round(m.attack)} ms · ${Math.round(m.decay)} ms`;
    if (id === 'pitch') return m.pitchMode === 'random' ? `± ${m.pitchSemis} st · ${Math.round(m.pitchDecay)} ms` : `${m.pitchMode === 'down' ? '−' : '+'}${m.pitchSemis} st · ${Math.round(m.pitchDecay)} ms`;
    return `${Math.round(m.cutoff)} Hz · Q ${m.resonance.toFixed(1)}`;
}
function local(e: PointerEvent, w: number, h: number) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
}
function startDrag(id: string, e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.value = id;
    if (id === 'env' || id === 'pitch' || id === 'filter') {
        const p = local(e, PAD_W[id], PAD_H);
        const hs = handles(id);
        dragHandle.value = hs.reduce((a, b) => (Math.hypot(a.x - p.x, a.y - p.y) <= Math.hypot(b.x - p.x, b.y - p.y) ? a : b)).id;
    }
    moveDrag(e);
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function moveDrag(e: PointerEvent) {
    const id = drag.value;
    if (!id) return;
    if (id === 'fm') { const p = local(e, PIC_W, PIC_H); m.fmIndex = Math.round(clamp(1 - p.y / PIC_H, 0, 1) * 500) / 10; return; }
    if (id === 'unison') { const p = local(e, PIC_W, PIC_H); m.detune = Math.round(clamp(p.x / PIC_W, 0, 1) * 100); m.spread = Math.round(clamp(1 - p.y / PIC_H, 0, 1) * 100); return; }
    const w = PAD_W[id], p = local(e, w, PAD_H);
    if (id === 'env') {
        if (dragHandle.value === 'attack') m.attack = Math.round(clamp(xt(p.x, w), 1, 500));
        else m.decay = Math.round(clamp(xt(p.x, w) - m.attack, 50, 2000));
    } else if (id === 'pitch') {
        if (dragHandle.value === 'amount') pitchAmt.value = clamp(((PAD_H / 2 - p.y) / (PAD_H / 2 - 3)) * 48, -48, 48);
        else m.pitchDecay = Math.round(clamp(xt(p.x, w), 5, 2000));
    } else {
        m.cutoff = Math.round(clamp(xf(p.x, w), 100, 10000));
        m.resonance = Math.round(clamp(0.1 * Math.pow(200, clamp(1 - p.y / (PAD_H * 0.55), 0, 1)), 0.1, 20) * 10) / 10;
    }
}
function endDrag() { drag.value = null; }
</script>

<style scoped>
/* ── the row of three (a, c) ── */
.scm-row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 2.2fr) minmax(0, 4.2fr);
    gap: 14px;
    width: 100%;
}

.scm-card {
    height: 115px;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.scm-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.scm-head .pt-title {
    margin: 0;
    flex: none;
}

/* A card's small picture: the shape its knobs make */
.scm-glyph {
    flex: 1 1 0;
    min-width: 0;
    height: 26px;
    overflow: visible;
}

.scm-line {
    fill: none;
    stroke: var(--lfo-mod, #ffc53d);
    stroke-width: 1.6;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
}

.scm-line.fill {
    fill: color-mix(in oklab, var(--lfo-mod, #ffc53d), transparent 80%);
}

.scm-axis {
    stroke: currentColor;
    stroke-opacity: 0.25;
    stroke-dasharray: 2 3;
    vector-effect: non-scaling-stroke;
}

.scm-ghost {
    fill: none;
    stroke: var(--lfo-mod, #ffc53d);
    stroke-opacity: 0.55;
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
}

.scm-pill {
    --hw-led-size: 5px;
    flex: none;
    padding: 1px 6px 1px 5px;
    border-radius: 5px;
    border: 1px solid transparent;
    font: inherit;
    font-size: 9px;
    line-height: 1.4;
    letter-spacing: 0.06em;
}

.scm-knobs {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-evenly;
    gap: 6px;
    min-width: 0;
}

.scm-rule {
    align-self: stretch;
    width: 1px;
    margin: 8px 0;
    background: color-mix(in oklab, currentColor, transparent 80%);
}

/* ── b: rack units ── */
.scm-rack {
    --rack-hi: color-mix(in oklab, var(--cap-hi, #43207a), black 30%);
    --rack-lo: color-mix(in oklab, var(--cap-lo, #2a0f52), black 40%);
    display: flex;
    width: 100%;
    height: 115px;
    border-radius: 5px;
    background:
        repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.022) 0 1px, transparent 1px 3px),
        linear-gradient(180deg, var(--rack-hi), var(--rack-lo));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), inset 0 -2px 0 rgba(0, 0, 0, 0.55), 0 3px 10px rgba(0, 0, 0, 0.45);
}

/* A dark faceplate in every theme: light lettering, the knobs' captions too */
.scm-rack {
    color: #ece8f5;
}

.scm-rack :deep(.knob-label) {
    color: inherit;
}

.scm-rack :deep(.knob-wrapper.disabled .knob-label) {
    opacity: 0.45;
}

/* The ears: a strip each side with two oblong screw slots */
.scm-ear {
    flex: none;
    width: 20px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.22), rgba(255, 255, 255, 0.04));
    box-shadow: inset -1px 0 0 rgba(0, 0, 0, 0.45), inset 1px 0 0 rgba(255, 255, 255, 0.06);
}

.scm-ear:last-child {
    transform: scaleX(-1);
}

.scm-ear i {
    width: 9px;
    height: 15px;
    border-radius: 5px;
    background: radial-gradient(circle at 50% 50%, #9aa0ad 0 2.6px, #23252d 3.2px);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.8), 0 1px 0 rgba(255, 255, 255, 0.08);
}

.scm-rack .scm-face {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 14px;
}

.scm-window {
    position: relative;
    flex: none;
    border-radius: 4px;
    background: #0c1118;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 2px 8px rgba(0, 0, 0, 0.7), 0 0 0 2px rgba(0, 0, 0, 0.5);
    overflow: hidden;
}

.scm-window svg {
    position: absolute;
    inset: 3px;
    width: calc(100% - 6px);
    height: calc(100% - 6px);
}

.scm-hit {
    width: 156px;
    align-self: stretch;
}

.scm-line.pitch {
    stroke: #6fe3ff;
}

.scm-line.cutoff {
    stroke: #ff8fd0;
    stroke-dasharray: 4 3;
}

.scm-legend {
    position: absolute;
    right: 6px;
    top: 4px;
    display: flex;
    gap: 8px;
    font-size: 8px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.scm-legend b { font-weight: 600; }
.scm-legend .l { color: var(--lfo-mod, #ffc53d); }
.scm-legend .p { color: #6fe3ff; }
.scm-legend .c { color: #ff8fd0; }

.scm-group {
    flex: 1 1 0;
    min-width: 0;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.scm-g-filter {
    flex: 2.1 1 0;
}

/* A printed bracket over each group, its name set into the line */
.scm-bracket {
    height: 13px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    border: 1px solid color-mix(in oklab, currentColor, transparent 62%);
    border-bottom: 0;
    border-radius: 3px 3px 0 0;
    margin-top: 5px;
}

.scm-bracket span {
    transform: translateY(-7px);
    padding: 0 7px;
    background: color-mix(in oklab, var(--rack-hi), var(--rack-lo) 12%);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
}

/* A rocker: a small switch with its lamp */
.scm-rocker {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 8px;
    letter-spacing: 0.12em;
    cursor: pointer;
    opacity: 0.85;
}

.scm-rocker i {
    width: 14px;
    height: 22px;
    border-radius: 3px;
    background: linear-gradient(180deg, #14151b 0 50%, #3a3d49 50%);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.scm-rocker.on i {
    background: linear-gradient(180deg, var(--hw-led, #5effb0) 0 50%, #14151b 50%);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.55), 0 0 8px var(--hw-led, #5effb0);
}

.scm-badge {
    position: absolute;
    right: 10px;
    bottom: 4px;
    font-size: 8px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.45;
}

.scm-badge em {
    font-style: normal;
    opacity: 0.8;
}

/* ── c: screens you drag ── */
.scm-touch {
    flex-direction: row;
    align-items: stretch;
    gap: 8px;
    padding: 9px 10px;
}

.scm-pad {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    border-radius: 6px;
    background: #0c1118;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 2px 10px rgba(0, 0, 0, 0.7), 0 0 0 2px rgba(0, 0, 0, 0.45);
    overflow: hidden;
    cursor: grab;
    touch-action: none;
}

.scm-pad.dragging {
    cursor: grabbing;
    box-shadow: inset 0 0 0 1px hsl(var(--pt-accent) 80% 65% / 0.8), inset 0 2px 10px rgba(0, 0, 0, 0.7), 0 0 0 2px rgba(0, 0, 0, 0.45);
}

.scm-pad svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.scm-handle {
    position: absolute;
    width: 11px;
    height: 11px;
    margin: -5.5px 0 0 -5.5px;
    border-radius: 50%;
    background: #0c1118;
    box-shadow: 0 0 0 2px var(--lfo-mod, #ffc53d), 0 0 8px color-mix(in oklab, var(--lfo-mod, #ffc53d), transparent 40%);
    pointer-events: none;
}

.scm-handle.on {
    background: var(--lfo-mod, #ffc53d);
}

.scm-pad-title,
.scm-pad-read,
.scm-drag-hint {
    position: absolute;
    font-size: 8.5px;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #cfe0ff;
    pointer-events: none;
    white-space: nowrap;
}

.scm-pad-title {
    left: 6px;
    top: 5px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
}

.scm-pad-title.right {
    left: auto;
    right: 6px;
    text-align: right;
}

.scm-pad-title small {
    display: block;
    margin-top: 4px;
    font-size: 8px;
    font-weight: 400;
    letter-spacing: 0.06em;
    opacity: 0.8;
}

.scm-drag-hint {
    right: 5px;
    top: 4px;
    font-size: 7.5px;
    opacity: 0.55;
}

.scm-minis {
    flex: none;
    display: grid;
    grid-template-columns: auto;
    align-content: center;
    gap: 3px 6px;
}

.scm-minis.four {
    grid-template-columns: auto auto;
}

.scm-mini {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
}

.scm-mini span {
    font-size: 8.5px;
    letter-spacing: 0.04em;
    color: var(--pt-text, inherit);
    opacity: 0.85;
}

.scm-pill--mini {
    grid-column: 1 / -1;
    justify-self: center;
    font-size: 8px;
}

/* ── FM and Unison ── */
.scm-unit {
    position: relative;
    display: flex;
    width: 100%;
    height: 115px;
    min-width: 0;
}

.scm-unit:not(.scm-rack) {
    border-radius: 12px;
    border: 1px solid color-mix(in oklab, var(--pt-btn-border, #c05cff), transparent 70%);
    background: linear-gradient(145deg, var(--pt-surface-1, #2a0f52), var(--pt-surface-2, #1a0b3a));
    overflow: hidden;
}

.scm-unit:not(.scm-rack) .scm-face {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 14px 10px 12px;
}

.scm-ribbon {
    flex: none;
    position: relative;
    width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    cursor: pointer;
    background: linear-gradient(180deg, var(--pt-surface-3, #26263a), var(--pt-surface-1, #151522));
    color: color-mix(in oklab, var(--pt-text, #e5e9ff), transparent 20%);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 1px 0 0 rgba(0, 0, 0, 0.7);
}

.scm-ribbon.is-on {
    background: linear-gradient(180deg, hsl(var(--pt-accent) 70% 52%), hsl(var(--pt-accent) 70% 36%));
    color: #fff;
    box-shadow: 1px 0 0 rgba(0, 0, 0, 0.85), 0 0 14px hsl(var(--pt-accent) 85% 60% / 0.45);
}

.scm-ribbon-led {
    position: absolute;
    top: 9px;
    left: 50%;
    width: 6px;
    height: 6px;
    margin-left: -3px;
    border-radius: 50%;
    background: var(--hw-led-off, rgb(255 255 255 / 0.2));
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.35);
}

.scm-ribbon.is-on .scm-ribbon-led {
    background: var(--hw-led, #5effb0);
    box-shadow: 0 0 6px var(--hw-led, #5effb0);
}

.scm-ribbon-label {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    letter-spacing: 0.2em;
    font-size: 11px;
    font-weight: 600;
}

.scm-pic {
    width: 116px;
    align-self: stretch;
}

.scm-rack .scm-pic {
    width: 82px;
}

.scm-rack.scm-unit .scm-face {
    gap: 10px;
    padding: 8px 10px;
}

/* On a faceplate the caption is printed over its switch */
.scm-rack .scm-voices {
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
}

.scm-rack .scm-cap {
    align-self: center;
    font-size: 9px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: inherit;
}

.scm-pic.scm-pad {
    flex: none;
}

.is-off .scm-pic .scm-line {
    stroke-opacity: 0.4;
}

.scm-line.voice {
    stroke-opacity: 0.75;
}

.scm-dot {
    fill: #6fe3ff;
}

.is-off .scm-dot {
    fill-opacity: 0.4;
}

/* b's power switch: a lit square button with the unit's name under it */
.scm-power {
    flex: none;
    width: 42px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.16em;
    cursor: pointer;
}

.scm-power i {
    width: 26px;
    height: 26px;
    border-radius: 5px;
    background: linear-gradient(180deg, #3a3d49, #17181e);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.scm-power.on i {
    background: radial-gradient(circle at 50% 40%, color-mix(in oklab, var(--hw-led, #5effb0), white 35%), var(--hw-led, #5effb0) 60%, color-mix(in oklab, var(--hw-led, #5effb0), black 35%));
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.6), 0 0 12px var(--hw-led, #5effb0);
}

.scm-stepper {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
}

.scm-step {
    flex: none;
    width: 24px;
    height: 28px;
    border: 0;
    border-radius: 6px;
    font: inherit;
    font-size: 0.8rem;
}

.scm-step:disabled {
    opacity: 0.4;
}

.scm-step-name {
    flex: 1;
    min-width: 0;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 5px;
    background: #0c1118;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 1px 5px rgba(0, 0, 0, 0.7);
    color: #cfe0ff;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
}

.scm-step-name small {
    font-size: 0.56rem;
    opacity: 0.6;
}

.scm-unit .scm-knobs {
    flex: none;
    gap: 12px;
}

.scm-unit .scm-knobs.minis {
    flex-direction: column;
    gap: 3px;
}

.scm-voices {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
}

.scm-cap {
    flex: none;
    color: var(--pt-muted);
    font-weight: 600;
    font-size: 0.72rem;
}

.scm-seg {
    flex: 1;
    display: flex;
    flex-wrap: nowrap;
    gap: 5px;
}

.scm-seg .pt-seg-btn {
    flex: 1 1 0;
    min-width: 0;
}

.scm-seg .pt-seg-btn:disabled {
    opacity: 0.45;
}
</style>

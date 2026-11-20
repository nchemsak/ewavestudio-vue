<!-- src/components/BassMock.vue -->
<!-- MOCKUPS ONLY (behind ?bass=d|e|f; not for a PR; round 2, after the maintainer's notes on
     a|b|c, which are in git history): the Bass machine chosen in the rail, its pads and its Sound
     section, and the pedals as a chain joined by cables. Nothing here makes sound.
     `part`: 'pads' (the pads, with Accent, Slide and Tie), 'sound' (Bass's Sound section),
     'cables' (the cables over the Sound section: into the pedals, between them, to OUT). -->
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
            <!-- F: slides and ties drawn between the notes' names (an arc glides, a bar holds) -->
            <div v-if="variant === 'f'" class="bm-links" aria-hidden="true">
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
            <template v-if="variant === 'd'">
                <div class="bm-row">
                    <span class="bm-row-cap">Slide</span>
                    <button v-for="(l, i) in links" :key="i" type="button" tabindex="-1"
                        class="bm-tog hw-cap hw-cap-sm" :class="{ 'hw-down': l === 'slide', off: !steps[i] }"><i class="bm-led" :class="{ lit: l === 'slide' }"></i></button>
                </div>
                <div class="bm-row">
                    <span class="bm-row-cap">Tie</span>
                    <button v-for="(l, i) in links" :key="i" type="button" tabindex="-1"
                        class="bm-tog hw-cap hw-cap-sm" :class="{ 'hw-down': l === 'tie', off: !steps[i] }"><i class="bm-led" :class="{ lit: l === 'tie' }"></i></button>
                </div>
            </template>
            <!-- E: one row for both: a click goes none → slide → tie -->
            <div v-else-if="variant === 'e'" class="bm-row">
                <span class="bm-row-cap">Slide ⤳ · Tie ═ <small>(click: none → slide → tie)</small></span>
                <button v-for="(l, i) in links" :key="i" type="button" tabindex="-1"
                    class="bm-tog bm-glyph hw-cap hw-cap-sm" :class="{ 'hw-down': !!l, off: !steps[i] }">{{ l === 'slide' ? '⤳' : l === 'tie' ? '═' : '' }}</button>
            </div>
        </div>
    </div>

    <!-- THE SOUND SECTION -->
    <div v-else-if="part === 'sound'" class="bm-sound" :class="`is-${variant}`">

        <!-- The wave tiles (B's), in every option: Saw, Square, and Sub with its knob -->
        <div v-if="variant !== 'f'" class="pt-card bm-card bm-osc" style="grid-area: osc">
            <div class="bm-tiles" :class="{ col: variant === 'd' }">
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

        <!-- D: one big screen with everything on it, the knobs under it -->
        <div v-if="variant === 'd'" class="pt-card bm-card bm-big" style="grid-area: big">
            <div class="bm-screen bm-screen-big">
                <svg viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true">
                    <path :d="envOutline(400, 150)" class="bm-env" />
                    <path :d="wavePath(400, 150)" class="bm-wave" />
                    <path :d="cutoffPath(400, 150)" class="bm-cutline" />
                </svg>
                <span class="bm-read">SAW + SUB · A1</span>
                <span class="bm-read r"><b class="cut">— CUTOFF 320 HZ, ENV +3 OCT</b> · <b>- - LEVEL, DECAY 260 MS</b></span>
                <i class="bm-grip cut" style="left: 1%; top: 22%" title="Env"></i>
                <i class="bm-grip cut" style="left: 96%; top: 84%" title="Cutoff"></i>
                <i class="bm-grip" style="left: 62%; top: 49%" title="Decay"></i>
            </div>
            <div class="bm-knobrow">
                <Knob v-for="k in KNOBS" :key="k.id" v-model="vals[k.id]" :label="k.label" :min="0" :max="1" :step="0.01"
                    size="small" :useThemeArc="true" />
            </div>
        </div>

        <!-- E: the wave on its own screen, then the filter's and the envelope's -->
        <template v-if="variant === 'e'">
            <div class="pt-card bm-card bm-filt" style="grid-area: wave">
                <div class="bm-screen">
                    <svg viewBox="0 0 300 110" preserveAspectRatio="none" aria-hidden="true">
                        <path :d="wavePath(300, 110)" class="bm-wave" />
                    </svg>
                    <span class="bm-read">SAW + SUB · A1</span>
                </div>
            </div>
            <div class="pt-card bm-card bm-filt" style="grid-area: filt">
                <div class="bm-screen">
                    <svg viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true">
                        <path :d="responsePath(400, 110)" class="bm-fill" />
                    </svg>
                    <span class="bm-read">FILTER</span><span class="bm-read r">320 HZ · Q 8</span>
                    <i class="bm-grip" style="left: 39%; top: 50%"></i>
                </div>
                <div class="bm-knobcol">
                    <Knob v-model="vals.cutoff" label="Cutoff" :min="0" :max="1" :step="0.01" size="mini" :useThemeArc="true" />
                    <Knob v-model="vals.reso" label="Reso" :min="0" :max="1" :step="0.01" size="mini" :useThemeArc="true" />
                </div>
            </div>
            <div class="pt-card bm-card bm-filt" style="grid-area: env">
                <div class="bm-screen">
                    <svg viewBox="0 0 200 110" preserveAspectRatio="none" aria-hidden="true">
                        <path :d="envPath(200, 110)" class="bm-fill" />
                    </svg>
                    <span class="bm-read">ENVELOPE</span><span class="bm-read r">+3 OCT · 260 MS</span>
                    <i class="bm-grip" style="left: 3%; top: 34%"></i>
                </div>
                <div class="bm-knobcol">
                    <Knob v-model="vals.env" label="Env" :min="0" :max="1" :step="0.01" size="mini" :useThemeArc="true" />
                    <Knob v-model="vals.decay" label="Decay" :min="0" :max="1" :step="0.01" size="mini" :useThemeArc="true" />
                </div>
            </div>
        </template>

        <!-- F: a small machine with a painted face: the wave tiles, the big screen and the knobs on it -->
        <div v-if="variant === 'f'" class="bm-unit" style="grid-area: big">
            <div class="bm-unit-name"><i class="bm-led lit"></i><b>BASS</b><small>mono · 30–250 Hz</small></div>
            <div class="bm-unit-face">
                <div class="bm-unit-top">
                    <div class="bm-tiles bm-unit-tiles">
                        <div v-for="t in ['Saw', 'Square']" :key="t" class="bm-tile hw-cap" :class="{ 'hw-down': t === 'Saw' }">
                            <svg viewBox="0 0 60 30" aria-hidden="true"><path :d="t === 'Saw' ? SAW_ICON : SQUARE_ICON" /></svg>
                            <span><i class="bm-led" :class="{ lit: t === 'Saw' }"></i>{{ t.toUpperCase() }}</span>
                        </div>
                    </div>
                    <div class="bm-screen bm-screen-big">
                        <svg viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true">
                            <path :d="envOutline(400, 150)" class="bm-env" />
                            <path :d="wavePath(400, 150)" class="bm-wave" />
                            <path :d="cutoffPath(400, 150)" class="bm-cutline" />
                        </svg>
                        <span class="bm-read">SAW + SUB · A1</span>
                        <span class="bm-read r"><b class="cut">— CUTOFF</b> · <b>- - LEVEL</b></span>
                        <i class="bm-grip cut" style="left: 1%; top: 22%"></i>
                        <i class="bm-grip cut" style="left: 96%; top: 84%"></i>
                        <i class="bm-grip" style="left: 62%; top: 49%"></i>
                    </div>
                </div>
                <div class="bm-unit-knobs">
                    <div v-for="k in [...KNOBS, { id: 'sub', label: 'Sub' }, { id: 'accent', label: 'Accent' }, { id: 'glide', label: 'Slide' }]"
                        :key="k.id" class="bm-unit-knob">
                        <Knob v-model="vals[k.id]" :label="k.label" :min="0" :max="1" :step="0.01" size="small" :useThemeArc="true" />
                    </div>
                </div>
            </div>
        </div>

        <!-- D and E: Accent, Slide and Tie explained, with Accent's and Slide's knobs -->
        <div v-if="variant !== 'f'" class="pt-card bm-card bm-ast" style="grid-area: ast">
            <div v-for="x in AST" :key="x.id" class="bm-ast-col">
                <div class="bm-screen bm-ast-pic">
                    <svg viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true"><path v-for="(d, j) in x.paths" :key="j" :d="d" :class="x.cls[j]" /></svg>
                </div>
                <b>{{ x.title }}</b>
                <p>{{ x.text }}</p>
                <Knob v-if="x.knob" v-model="vals[x.knob]" :label="x.knobLabel" :min="0" :max="1" :step="0.01" size="mini" :useThemeArc="true" />
            </div>
        </div>

        <!-- F: the mixer (C's), each machine's level, how much goes into the pedals, and its cable -->
        <div v-if="variant === 'f'" class="pt-card bm-card bm-mixer" style="grid-area: mix">
            <h3 class="bm-title">Mixer</h3>
            <table>
                <thead><tr><th></th><th>Level</th><th>Pedals</th><th></th></tr></thead>
                <tbody>
                    <tr v-for="m in MIXER" :key="m.name" :class="{ ghost: m.ghost, chosen: m.name === 'Bass' }">
                        <th><i class="bm-led" :class="{ lit: !m.ghost }"></i>{{ m.name }}<small v-if="m.ghost">soon</small></th>
                        <td><Knob :modelValue="m.level" :label="`${m.name} level`" hideLabel :min="0" :max="1" :step="0.01" size="mini" :useThemeArc="true" :disabled="m.ghost" /></td>
                        <td><Knob :modelValue="m.fx" :label="`${m.name} into the pedals`" hideLabel :min="0" :max="1" :step="0.01" size="mini" :useThemeArc="true" :disabled="m.ghost" /></td>
                        <td><span class="bm-sock" :data-mix-jack="m.ghost ? null : m.name"></span></td>
                    </tr>
                </tbody>
            </table>
            <p class="bm-note">Pedals: how much of the machine goes through the pedals; the rest goes straight to OUT.</p>
        </div>
    </div>

    <!-- THE CABLES, over the whole Sound section -->
    <svg v-else-if="part === 'cables'" ref="svgEl" class="bm-cables" :viewBox="`0 0 ${box.w} ${box.h}`" aria-hidden="true">
        <template v-for="(c, i) in cables" :key="i">
            <path :d="c.d" class="bm-cable-shadow" />
            <path :d="c.d" class="bm-cable" :style="{ stroke: c.colour }" />
        </template>
        <!-- Sockets of our own: the board's IN (D: one per machine; E: one), OUT, and lo-fi's -->
        <g v-for="(s, i) in sockets" :key="`s${i}`" class="bm-socket" :class="{ dim: s.dim }">
            <circle :cx="s.x" :cy="s.y" r="6.5" class="ring" />
            <circle :cx="s.x" :cy="s.y" r="3" class="hole" />
            <text v-if="s.label" :x="s.x + (s.lx ?? 0)" :y="s.y + (s.ly ?? -11)" :text-anchor="s.anchor ?? 'middle'">{{ s.label }}</text>
        </g>
        <!-- Plugs where a cable meets a pedal's own jack -->
        <rect v-for="(p, i) in plugs" :key="`p${i}`" :x="p.x - 4" :y="p.y - 9" width="8" height="10" rx="2" class="bm-plug" />
    </svg>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import Knob from './Knob.vue';
import SynthStepGrid from './SynthStepGrid.vue';

const props = defineProps<{
    part: 'pads' | 'sound' | 'cables';
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
    { id: 'cutoff', label: 'Cutoff' }, { id: 'reso', label: 'Reso' }, { id: 'env', label: 'Env' }, { id: 'decay', label: 'Decay' },
];
const vals = reactive<Record<string, number>>({ cutoff: 0.32, reso: 0.55, env: 0.6, decay: 0.4, sub: 0.5, accent: 0.6, glide: 0.35 });
const AST = [
    {
        id: 'accent', title: 'Accent', text: 'Louder and brighter: its filter opens further.', knob: 'accent', knobLabel: 'Amount',
        paths: ['M6 46 L14 26 C 22 40, 30 44, 46 46', 'M54 46 L60 6 C 66 32, 76 42, 94 46'], cls: ['bm-fill', 'bm-fill hot'],
    },
    {
        id: 'slide', title: 'Slide', text: 'Glides into the next note, without starting again.', knob: 'glide', knobLabel: 'Time',
        paths: ['M4 38 L40 38 C 52 38, 52 14, 64 14 L96 14', 'M4 46 L4 34 M50 46 L50 34'], cls: ['bm-line', 'bm-tick'],
    },
    {
        id: 'tie', title: 'Tie', text: 'Holds into the next step: one long note.',
        paths: ['M4 26 L96 26', 'M4 46 L4 34 M50 46 L50 34 M96 46 L96 34'], cls: ['bm-line', 'bm-tick'],
    },
];
const MIXER = [
    { name: 'Rhythm', level: 0.5, fx: 1, ghost: false },
    { name: 'Bass', level: 0.6, fx: 0.4, ghost: false },
    { name: 'Drums', level: 0.7, fx: 0.3, ghost: true },
    { name: 'Drift', level: 0.4, fx: 1, ghost: true },
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
// The level's envelope, dashed above and below the wave
function envOutline(W: number, H: number) {
    const top: string[] = [], bot: string[] = [];
    for (let i = 0; i <= 80; i++) {
        const t = (i / 80) * SECS, x = (i / 80) * W, a = ampAt(t) * H * 0.42 * 1.08;
        top.push(`${i ? 'L' : 'M'}${x.toFixed(1)} ${(H / 2 - a).toFixed(1)}`);
        bot.push(`${i ? 'L' : 'M'}${x.toFixed(1)} ${(H / 2 + a).toFixed(1)}`);
    }
    return `${top.join(' ')} ${bot.join(' ')}`;
}
// The cutoff over the note, its own line: from 3 octaves up, back to Cutoff
function cutoffPath(W: number, H: number) {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
        const t = (i / 60) * SECS;
        pts.push(`${i ? 'L' : 'M'}${((i / 60) * W).toFixed(1)} ${(H * 0.84 - (cutAt(t) / 3) * H * 0.62).toFixed(1)}`);
    }
    return pts.join(' ');
}
function responsePath(W: number, H: number) {
    const pts: string[] = [`M0 ${H}`];
    for (let i = 0; i <= 80; i++) {
        const x = i / 80, f = 20 * Math.pow(1000, x), r = f / 320, q = 8;
        const db = Math.max(-36, Math.min(20, 20 * Math.log10(1 / Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2))));
        pts.push(`L${(x * W).toFixed(1)} ${(H * 0.55 - (db / 36) * H * 0.45).toFixed(1)}`);
    }
    return pts.join(' ') + ` L${W} ${H} Z`;
}
function envPath(W: number, H: number) {
    const pts: string[] = [`M0 ${H}`];
    for (let i = 0; i <= 60; i++) {
        const x = i / 60;
        pts.push(`L${(Math.sqrt(x) * W).toFixed(1)} ${(H - Math.exp(-x * 2.2 / 0.6) * H * 0.85).toFixed(1)}`);
    }
    return pts.join(' ') + ` L${W} ${H} Z`;
}

// THE CABLES: measured from the page. The chain: Overdrive → Delay → Reverb → lo-fi → OUT; a
// pedal that's off is skipped (the cable goes over it). The pedals' own jacks are their
// ::before (IN, 38 px from the left) and ::after (OUT, 12 px from the right), 13 px wide.
const RHYTHM_CABLE = '#ff7eb3';
const BASS_CABLE = '#4fd1c5';
const CHAIN_CABLE = '#9aa3b8';
const svgEl = ref<SVGSVGElement | null>(null);
const box = reactive({ w: 100, h: 100 });
const cables = ref<{ d: string; colour: string }[]>([]);
const sockets = ref<{ x: number; y: number; label?: string; dim?: boolean; lx?: number; ly?: number; anchor?: string }[]>([]);
const plugs = ref<{ x: number; y: number }[]>([]);

type P = { x: number; y: number };
function hang(a: P, b: P, sag: number) {
    return `M${a.x} ${a.y} C${a.x} ${a.y + sag}, ${b.x} ${b.y - sag}, ${b.x} ${b.y}`;
}
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
    const drive = pedal('.drive-pedal'), delay = pedal('.delay-pedal'), reverb = pedal('.reverb-pedal'), deck = pedal('.tape-pedal');
    const jin = (p: typeof drive) => ({ x: p.left + 44.5, y: p.top - 3 });
    const jout = (p: typeof drive) => ({ x: p.right - 18.5, y: p.top - 3 });
    // The delay is off in the mockup, so the cable goes over it
    const out = { x: card.right - 24, y: card.top + 24 };
    const lofiIn = { x: deck.right + 7, y: deck.top + 14 };
    const lofiOut = { x: deck.right + 7, y: deck.bottom - 14 };
    const c: { d: string; colour: string }[] = [];
    const s: typeof sockets.value = [
        { x: out.x, y: out.y, label: 'OUT', lx: -12, ly: 4, anchor: 'end' },
        { x: lofiIn.x, y: lofiIn.y }, { x: lofiOut.x, y: lofiOut.y },
    ];
    c.push({ d: `M${jout(drive).x} ${jout(drive).y} C${jout(drive).x + 10} ${jout(drive).y - 34}, ${jin(reverb).x - 10} ${jin(reverb).y - 34}, ${jin(reverb).x} ${jin(reverb).y}`, colour: CHAIN_CABLE });
    const ro = jout(reverb);
    c.push({ d: `M${ro.x} ${ro.y} C${ro.x + 4} ${ro.y - 26}, ${lofiIn.x + 26} ${ro.y - 10}, ${lofiIn.x + 18} ${lofiIn.y - 40} S${lofiIn.x + 14} ${lofiIn.y}, ${lofiIn.x} ${lofiIn.y}`, colour: CHAIN_CABLE });
    c.push({ d: `M${lofiOut.x} ${lofiOut.y} C${lofiOut.x + 24} ${lofiOut.y}, ${out.x + 30} ${out.y + 70}, ${out.x} ${out.y}`, colour: CHAIN_CABLE });
    const dIn = jin(drive);
    if (props.variant === 'd') {
        // One socket per machine in the card's header: plugged in, it goes through the pedals
        const x0 = card.left + 128;
        ['Rhythm', 'Bass', 'Drums', 'Drift'].forEach((m, i) => {
            const p = { x: x0 + i * 46, y: card.top + 24 };
            s.push({ x: p.x, y: p.y, label: m.toUpperCase(), ly: -11, dim: i > 1 });
            if (i < 2) c.push({ d: hang(p, dIn, 14 + i * 6), colour: i ? BASS_CABLE : RHYTHM_CABLE });
        });
    } else if (props.variant === 'e') {
        // One IN: the rail's FX knobs set how much of each machine comes in
        const p = { x: card.left + 170, y: card.top + 26 };
        s.push({ x: p.x, y: p.y, label: 'IN ← THE RAIL', ly: -11 });
        c.push({ d: hang(p, dIn, 22), colour: CHAIN_CABLE });
    } else {
        // From the mixer's sockets, across to the pedals
        host.querySelectorAll('[data-mix-jack]').forEach((el) => {
            const b = r(el);
            const p = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
            const isBass = el.getAttribute('data-mix-jack') === 'Bass';
            c.push({ d: `M${p.x} ${p.y} C${p.x + 60} ${p.y}, ${dIn.x - 30} ${dIn.y - 60}, ${dIn.x} ${dIn.y}`, colour: isBass ? BASS_CABLE : RHYTHM_CABLE });
        });
    }
    sockets.value = s.filter((x) => x.x > 0);
    cables.value = c;
    plugs.value = [jout(drive), jin(reverb), jout(reverb), dIn];
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
    margin-top: 22px;
}

.is-f .bm-rows {
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

.bm-note {
    font: 10px/1.45 Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
    margin: 6px 0 0;
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

.bm-fill {
    fill: color-mix(in oklab, var(--sp-ink) 22%, transparent);
    stroke: var(--sp-ink);
    stroke-width: 1.4;
    vector-effect: non-scaling-stroke;
}

.bm-fill.hot {
    fill: color-mix(in oklab, var(--bm-cut) 35%, transparent);
    stroke: var(--bm-cut);
}

.bm-line {
    fill: none;
    stroke: var(--bm-cut);
    stroke-width: 2.2;
    vector-effect: non-scaling-stroke;
}

.bm-tick {
    stroke: var(--sp-ink);
    stroke-width: 1;
    opacity: .5;
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

/* The wave tiles (B's) */
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

/* D: the big screen and its knobs */
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

/* E */
.bm-filt {
    min-height: 120px;
}

.bm-knobcol {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
}

.bm-knobcol :deep(.knob-label) {
    font-size: 9px !important;
}

/* Accent, Slide and Tie, explained */
.bm-ast {
    gap: 10px;
    align-items: center;
}

.bm-ast-col {
    height: 200px;
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 4px;
}

.bm-ast-pic {
    flex: none;
    width: 100%;
    min-height: 58px;
    height: 58px;
}

.bm-ast-pic svg {
    inset: 6px 4px;
    width: calc(100% - 8px);
    height: calc(100% - 12px);
}

.bm-ast-col b {
    font: 700 12px Cousine, ui-monospace, monospace;
    color: var(--pt-text, #fff);
    margin-top: 4px;
}

.bm-ast-col p {
    font: 10px/1.35 Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
    margin: 0 0 4px;
}

.bm-ast-col :deep(.knob-label) {
    font-size: 9px !important;
}

/* F: the machine's own painted face, like the pedals' (deep teal) */
.bm-unit {
    display: flex;
    border-radius: 12px;
    overflow: hidden;
    background: linear-gradient(160deg, #2f8f8a, #1d5f62);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .25), inset 0 -2px 0 rgba(0, 0, 0, .3), 0 6px 18px rgba(0, 0, 0, .35);
}

.theme-analog .bm-unit {
    background: linear-gradient(160deg, #6b8f5a, #435f38);
}

.bm-unit-name {
    flex: none;
    width: 34px;
    background: #123c3e;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 0;
    gap: 14px;
}

.bm-unit-name b,
.bm-unit-name small {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font: 700 13px Cousine, ui-monospace, monospace;
    letter-spacing: .25em;
    color: #e8fff9;
}

.bm-unit-name small {
    font-size: 9px;
    letter-spacing: .08em;
    opacity: .7;
    font-weight: 400;
}

.bm-unit-face {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
}

.bm-unit-top {
    display: flex;
    gap: 14px;
}

.bm-unit-tiles {
    flex: none;
    width: 230px;
    grid-template-columns: 1fr 1fr;
    height: auto;
}

.bm-unit-knobs {
    display: flex;
    justify-content: space-between;
}

.bm-unit-knobs :deep(.knob-label) {
    color: #0e2a2b !important;
    font-weight: 700;
}

.bm-mixer {
    flex-direction: column;
}

.bm-mixer table {
    width: 100%;
    border-collapse: collapse;
    font: 10px Cousine, ui-monospace, monospace;
    color: var(--pt-text, #fff);
}

.bm-mixer th,
.bm-mixer td {
    padding: 3px 2px;
    text-align: center;
}

.bm-mixer thead th {
    font-size: 9px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
    font-weight: 700;
}

.bm-mixer tbody th {
    text-align: left;
    white-space: nowrap;
    font-weight: 700;
}

.bm-mixer tbody th .bm-led {
    margin-right: 6px;
}

.bm-mixer tbody th small {
    margin-left: 4px;
    opacity: .6;
    font-weight: 400;
}

.bm-mixer tr.ghost {
    opacity: .45;
}

.bm-mixer tr.chosen th {
    color: var(--hw-led, #5dffb0);
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

.bm-socket.dim {
    opacity: .4;
}

.bm-plug {
    fill: #1b1b1b;
    stroke: #777;
    stroke-width: 1;
}
</style>

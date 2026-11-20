<!-- src/components/BassMock.vue -->
<!-- MOCKUPS ONLY (behind ?bass=a|b|c; not for a PR): the Bass machine chosen in the rail, and
     three ways its pads and its Sound section could look. Nothing here makes sound.
     `part`: 'pads' (the pads with Bass's notes, and A's Accent row or C's Accent and Slide rows),
     'brush' (B's Accent brush in the Step Sequencer header), 'sound' (Bass's Sound section). -->
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
            <!-- B: an accented pad has a mark on its top edge (set with the Accent brush) -->
            <div v-if="variant === 'b'" class="bm-acc-marks" aria-hidden="true">
                <i v-for="(a, i) in accents" :key="i" :class="{ on: a && steps[i] }">{{ a && steps[i] ? 'ACC' : '' }}</i>
            </div>
        </div>
        <!-- A: one row of Accent toggles under the pads; C: Accent and Slide, as a 303's rows -->
        <div v-if="variant !== 'b'" class="bm-rows">
            <div class="bm-row">
                <span class="bm-row-cap">Accent</span>
                <button v-for="(a, i) in accents" :key="i" type="button" tabindex="-1"
                    class="bm-tog hw-cap hw-cap-sm" :class="{ 'hw-down': a, off: !steps[i] }"><i class="bm-led" :class="{ lit: a }"></i></button>
            </div>
            <div v-if="variant === 'c'" class="bm-row">
                <span class="bm-row-cap">Slide</span>
                <button v-for="(s, i) in slides" :key="i" type="button" tabindex="-1"
                    class="bm-tog hw-cap hw-cap-sm" :class="{ 'hw-down': s, off: !steps[i] }"><i class="bm-led" :class="{ lit: s }"></i></button>
            </div>
        </div>
    </div>

    <!-- B: the Accent brush, beside Repeats -->
    <div v-else-if="part === 'brush'" class="bm-brush">
        <button type="button" class="vel-btn hw-cap hw-cap-sm hw-led-left" tabindex="-1">Accent</button>
    </div>

    <!-- THE SOUND SECTION -->
    <div v-else-if="part === 'sound'" class="bm-sound" :class="`is-${variant}`">

        <!-- A: one faceplate, a screen you drag and the six knobs beside it -->
        <template v-if="variant === 'a'">
            <div class="pt-card bm-card bm-face-a" style="grid-area: bass">
                <div class="bm-ribbon"><i class="bm-led lit"></i><span>BASS</span></div>
                <div class="bm-screen bm-screen-a">
                    <svg viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true">
                        <path :d="cutoffPath(400, 150)" class="bm-cut" />
                        <path :d="wavePath(400, 150, 'sawtooth', true)" class="bm-wave" />
                    </svg>
                    <span class="bm-read">SAW + SUB · A1 · 55 HZ</span>
                    <span class="bm-read r">CUTOFF 320 HZ · ENV +3 OCT · 260 MS</span>
                    <i class="bm-grip" style="left: 6%; top: 18%"></i>
                    <i class="bm-grip" style="left: 38%; top: 72%"></i>
                </div>
                <div class="bm-side-a">
                    <div class="bm-keys">
                        <button type="button" class="sp-key hw-cap hw-cap-sm hw-down" tabindex="-1">Saw</button>
                        <button type="button" class="sp-key hw-cap hw-cap-sm" tabindex="-1">Square</button>
                    </div>
                    <div class="bm-knobs3">
                        <Knob v-for="k in knobs" :key="k.id" v-model="vals[k.id]" :label="k.label" :min="0" :max="1"
                            :step="0.01" size="small" :useThemeArc="true" />
                    </div>
                </div>
            </div>
            <div class="pt-card bm-card bm-sends" style="grid-area: sends">
                <h3 class="bm-title">Bass to the pedals</h3>
                <div class="bm-send-row">
                    <div v-for="s in sends" :key="s.id" class="bm-send">
                        <Knob v-if="s.kind === 'send'" v-model="vals[s.id]" :label="s.label" :min="0" :max="1" :step="0.01"
                            size="small" :useThemeArc="true" />
                        <template v-else>
                            <button type="button" class="hw-cap hw-cap-sm hw-led-left bm-thru" :class="{ 'hw-down': s.on }" tabindex="-1">{{ s.label }}</button>
                        </template>
                    </div>
                </div>
                <p class="bm-note">Delay and reverb are sends (how much Bass goes in); the overdrive and lo-fi are
                    inserts, so Bass goes through them or round them.</p>
            </div>
        </template>

        <!-- B: Bass's own cards in Rhythm's rows -->
        <template v-else-if="variant === 'b'">
            <div class="pt-card bm-card bm-osc" style="grid-area: osc">
                <div class="bm-tiles">
                    <div v-for="t in ['Saw', 'Square']" :key="t" class="bm-tile hw-cap" :class="{ 'hw-down': t === 'Saw' }">
                        <svg viewBox="0 0 60 30" aria-hidden="true"><path :d="t === 'Saw' ? 'M2 26 L20 4 L20 26 L39 4 L39 26 L58 4' : 'M2 26 L2 4 L16 4 L16 26 L30 26 L30 4 L44 4 L44 26 L58 26'" /></svg>
                        <span><i class="bm-led" :class="{ lit: t === 'Saw' }"></i>{{ t.toUpperCase() }}</span>
                    </div>
                    <div class="bm-tile bm-subtile">
                        <svg viewBox="0 0 60 30" aria-hidden="true"><path d="M2 15 C 9 2, 23 2, 30 15 S 51 28, 58 15" /></svg>
                        <Knob v-model="vals.sub" label="Sub" :min="0" :max="1" :step="0.01" size="small" :useThemeArc="true" />
                    </div>
                </div>
            </div>
            <div class="pt-card bm-card bm-acc" style="grid-area: acc">
                <h3 class="bm-title">Accent</h3>
                <div class="bm-acc-body">
                    <Knob v-model="vals.accent" label="Amount" :min="0" :max="1" :step="0.01" size="small" :useThemeArc="true" />
                    <p class="bm-note">An accented step is louder, its filter opens further and decays sooner.</p>
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
            <div class="pt-card bm-card bm-env" style="grid-area: env">
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
            <div class="pt-card bm-card bm-drv" style="grid-area: drv">
                <h3 class="bm-title">Drive</h3>
                <Knob v-model="vals.drive" label="Drive" :min="0" :max="1" :step="0.01" size="small" :useThemeArc="true" />
            </div>
            <div class="pt-card bm-card bm-sends" style="grid-area: sends">
                <h3 class="bm-title">Bass to the pedals</h3>
                <div class="bm-send-col">
                    <div v-for="s in sends" :key="s.id" class="bm-send">
                        <Knob v-if="s.kind === 'send'" v-model="vals[s.id]" :label="s.label" :min="0" :max="1" :step="0.01"
                            size="small" :useThemeArc="true" />
                        <button v-else type="button" class="hw-cap hw-cap-sm hw-led-left bm-thru" :class="{ 'hw-down': s.on }" tabindex="-1">{{ s.label }}</button>
                    </div>
                </div>
            </div>
        </template>

        <!-- C: a small machine with a painted face, and a mixer for every machine -->
        <template v-else>
            <div class="bm-unit" style="grid-area: bass">
                <div class="bm-unit-name"><i class="bm-led lit"></i><b>BASS</b><small>mono · 30–250 Hz</small></div>
                <div class="bm-unit-face">
                    <div class="bm-unit-wave">
                        <span class="bm-unit-cap">Wave</span>
                        <div class="bm-unit-switch"><span class="on">SAW</span><i></i><span>SQR</span></div>
                        <div class="bm-screen bm-mini-screen">
                            <svg viewBox="0 0 160 60" preserveAspectRatio="none" aria-hidden="true">
                                <path :d="wavePath(160, 60, 'sawtooth', true)" class="bm-wave" />
                            </svg>
                        </div>
                    </div>
                    <div v-for="k in knobs" :key="k.id" class="bm-unit-knob">
                        <Knob v-model="vals[k.id]" :label="k.label" :min="0" :max="1" :step="0.01" size="medium" :useThemeArc="true" />
                    </div>
                </div>
            </div>
            <div class="pt-card bm-card bm-mixer" style="grid-area: sends">
                <h3 class="bm-title">Mixer</h3>
                <table>
                    <thead>
                        <tr><th></th><th>Level</th><th>Delay</th><th>Reverb</th><th>Drive</th><th>Lo-fi</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="m in mixer" :key="m.name" :class="{ ghost: m.ghost, chosen: m.name === 'Bass' }">
                            <th><i class="bm-led" :class="{ lit: !m.ghost }"></i>{{ m.name }}<small v-if="m.ghost">soon</small></th>
                            <td v-for="(v, j) in m.knobs" :key="j">
                                <Knob :modelValue="v" :label="`${m.name} ${['level', 'delay', 'reverb'][j]}`" hideLabel
                                    :min="0" :max="1" :step="0.01" size="mini" :useThemeArc="true" :disabled="m.ghost" />
                            </td>
                            <td v-for="(on, j) in m.thru" :key="`t${j}`">
                                <span class="bm-thru-dot" :class="{ lit: on && !m.ghost }"></span>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p class="bm-note">The same mixer whichever machine is chosen: every machine's level and how much of
                    it goes to the delay and the reverb; a lit dot plays it through the overdrive or lo-fi.</p>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import Knob from './Knob.vue';
import SynthStepGrid from './SynthStepGrid.vue';

defineProps<{
    part: 'pads' | 'brush' | 'sound';
    variant: string;
    nearestNote?: (hz: number) => string;
}>();

// A made-up bassline in A minor: A1 A1 A2 E2 · A1 G1 C2 E2
const on = [0, 2, 3, 6, 8, 10, 11, 14];
const notes: Record<number, number> = { 0: 55, 2: 55, 3: 110, 6: 82.41, 8: 55, 10: 49, 11: 65.41, 14: 82.41 };
const steps = Array.from({ length: 16 }, (_, i) => on.includes(i));
const velocities = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 1 : 0.7));
// The pads' colours run 100–2000 Hz; Bass's 30–250 Hz are drawn two octaves up, so its notes
// spread across them (their names are Bass's own)
const shownPitches = Array.from({ length: 16 }, (_, i) => (notes[i] ?? 55) * 4);
const waves = Array(16).fill('sawtooth');
const ones = Array(16).fill(1);
const sames = Array(16).fill('same');
const offs = Array(16).fill(false);
const accents = Array.from({ length: 16 }, (_, i) => [0, 6, 11].includes(i));
const slides = Array.from({ length: 16 }, (_, i) => [3, 10].includes(i));

const knobs = [
    { id: 'cutoff', label: 'Cutoff' }, { id: 'reso', label: 'Reso' }, { id: 'env', label: 'Env' },
    { id: 'decay', label: 'Decay' }, { id: 'sub', label: 'Sub' }, { id: 'drive', label: 'Drive' },
];
const vals = reactive<Record<string, number>>({
    cutoff: 0.32, reso: 0.55, env: 0.6, decay: 0.4, sub: 0.5, drive: 0.25, accent: 0.6,
    sDelay: 0.15, sReverb: 0.2,
});
const sends = [
    { id: 'sDelay', label: 'Delay', kind: 'send' }, { id: 'sReverb', label: 'Reverb', kind: 'send' },
    { id: 'tDrive', label: 'Overdrive', kind: 'thru', on: false }, { id: 'tTape', label: 'Lo-fi', kind: 'thru', on: true },
];
const mixer = [
    { name: 'Rhythm', knobs: [0.5, 0.3, 0.35], thru: [true, true], ghost: false },
    { name: 'Bass', knobs: [0.6, 0.15, 0.2], thru: [false, true], ghost: false },
    { name: 'Drums', knobs: [0.7, 0, 0.15], thru: [false, true], ghost: true },
    { name: 'Drift', knobs: [0.4, 0.3, 0.8], thru: [false, true], ghost: true },
];

// A note of the bass as the screen draws it: a saw (and a sine an octave down) through a
// two-pole low-pass whose cutoff starts 3 octaves up and falls back, fading out
function samples(n: number, wave: string, sub: boolean) {
    const sr = 4000, f = 55, secs = 0.32;
    let y1 = 0, y2 = 0;
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
        const t = (k / n) * secs;
        const ph = (t * f) % 1;
        let x = wave === 'sawtooth' ? 1 - 2 * ph : ph < 0.5 ? 1 : -1;
        if (sub) x += 0.6 * Math.sin(2 * Math.PI * (f / 2) * t);
        const cut = 320 * Math.pow(2, 3 * Math.exp(-t / 0.08));
        const a = 1 - Math.exp(-2 * Math.PI * cut / (sr * (n / (secs * sr))));
        for (let r = 0; r < 4; r++) { y1 += a * (x - y1); y2 += a * (y1 - y2); }
        const amp = Math.min(1, t / 0.004) * Math.exp(-t / 0.12);
        out.push(y2 * amp);
    }
    return out;
}
function wavePath(W: number, H: number, wave: string, sub: boolean) {
    const s = samples(600, wave, sub);
    const peak = Math.max(...s.map(Math.abs)) || 1;
    return s.map((v, i) => `${i ? 'L' : 'M'}${((i / (s.length - 1)) * W).toFixed(1)} ${(H / 2 - (v / peak) * H * 0.42).toFixed(1)}`).join(' ');
}
// The cutoff's sweep, dashed over the wave: from 3 octaves up, back to Cutoff
function cutoffPath(W: number, H: number) {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
        const t = (i / 60) * 0.32, oct = 3 * Math.exp(-t / 0.08);
        pts.push(`${i ? 'L' : 'M'}${((i / 60) * W).toFixed(1)} ${(H * 0.86 - (oct / 3) * H * 0.7).toFixed(1)}`);
    }
    return pts.join(' ');
}
function responsePath(W: number, H: number) {
    const pts: string[] = [`M0 ${H}`];
    for (let i = 0; i <= 80; i++) {
        const x = i / 80, f = 20 * Math.pow(1000, x), fc = 320, q = 8;
        const r = f / fc, mag = 1 / Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2);
        const db = Math.max(-36, Math.min(20, 20 * Math.log10(mag)));
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

.bm-acc-marks {
    position: absolute;
    inset: 22px 12px auto 0;
    display: grid;
    grid-template-columns: repeat(16, 1fr);
    pointer-events: none;
}

.bm-acc-marks i {
    justify-self: center;
    font: 700 8px Cousine, ui-monospace, monospace;
    color: #120a1e;
    background: transparent;
    padding: 1px 3px;
    border-radius: 3px;
    transform: translateY(28px);
    font-style: normal;
}

.bm-acc-marks i.on {
    background: var(--hw-led, #5dffb0);
}

.bm-rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 22px;
}

.bm-row {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    row-gap: 2px;
    align-items: center;
    padding-right: 12px;
}

.bm-row .bm-row-cap {
    grid-column: 1 / -1;
    padding-left: 4px;
}

.bm-row-cap {
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.bm-tog {
    justify-self: center;
    width: 30px;
    height: 18px;
    padding: 0;
    display: grid;
    place-items: center;
}

.bm-tog.off {
    opacity: .45;
}

.bm-brush {
    display: inline-flex;
    margin-left: 10px;
}

.bm-brush button {
    font: 700 10px Cousine, ui-monospace, monospace;
    padding: 2px 8px 2px 18px;
}

.bm-knobcol :deep(.knob-label),
.bm-knobcol :deep(label) {
    font-size: 9px !important;
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
    margin: 8px 0 0;
}

.bm-screen {
    --sp-bg: #0c1118;
    --sp-ink: #cfe0ff;
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
    stroke-width: 1.4;
    vector-effect: non-scaling-stroke;
}

.bm-cut {
    fill: none;
    stroke: var(--sp-ink);
    stroke-width: 1;
    stroke-dasharray: 4 4;
    opacity: .55;
    vector-effect: non-scaling-stroke;
}

.bm-fill {
    fill: color-mix(in oklab, var(--sp-ink) 22%, transparent);
    stroke: var(--sp-ink);
    stroke-width: 1.4;
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
    opacity: .7;
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

.bm-ribbon {
    flex: none;
    width: 26px;
    margin: -14px 0 -14px -14px;
    border-radius: var(--pt-radius, 14px) 0 0 var(--pt-radius, 14px);
    background: rgba(0, 0, 0, .35);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 10px;
    gap: 14px;
}

.bm-ribbon span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font: 700 11px Cousine, ui-monospace, monospace;
    letter-spacing: .2em;
    color: var(--pt-text, #fff);
}

.bm-keys {
    display: flex;
    gap: 6px;
}

.bm-keys .sp-key {
    flex: 1;
    font: 700 10px Cousine, ui-monospace, monospace;
    text-transform: uppercase;
    padding: 6px 4px;
}

.bm-keys .hw-down {
    color: var(--hw-led, #5dffb0);
}

/* A */
.bm-face-a {
    min-height: 250px;
}

.bm-side-a {
    flex: none;
    width: 250px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    justify-content: center;
}

.bm-knobs3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px 4px;
    justify-items: center;
}

.bm-sends {
    flex-direction: column;
    justify-content: center;
}

.bm-send-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    align-items: center;
    justify-items: center;
    gap: 8px;
}

.bm-thru {
    font: 700 10px Cousine, ui-monospace, monospace;
}

/* B */
.bm-osc,
.bm-acc,
.bm-drv {
    flex-direction: column;
    justify-content: center;
}

.bm-tiles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    height: 100%;
}

.bm-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border-radius: 10px;
    min-height: 120px;
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

.bm-acc-body {
    display: flex;
    align-items: center;
    gap: 14px;
}

.bm-acc-body .bm-note {
    margin: 0;
}

.bm-filt,
.bm-env {
    min-height: 140px;
}

.bm-knobcol {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
}

.bm-drv {
    align-items: center;
}

.bm-send-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    justify-items: center;
}

/* C: the machine's own painted face, like the pedals' (deep teal) */
.bm-unit {
    display: flex;
    border-radius: 12px;
    overflow: hidden;
    background: linear-gradient(160deg, #2f8f8a, #1d5f62);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .25), inset 0 -2px 0 rgba(0, 0, 0, .3), 0 6px 18px rgba(0, 0, 0, .35);
    min-height: 210px;
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
    display: grid;
    grid-template-columns: 1.5fr repeat(6, 1fr);
    align-items: center;
    justify-items: center;
    padding: 18px 14px;
    gap: 6px;
    --pt-text: #0e2a2b;
}

.bm-unit-face :deep(.knob-label),
.bm-unit-face :deep(label) {
    color: #0e2a2b !important;
    font-weight: 700;
}

.bm-unit-wave {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    align-items: stretch;
}

.bm-unit-cap {
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .1em;
    color: #0e2a2b;
}

.bm-unit-switch {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 700 10px Cousine, ui-monospace, monospace;
    color: rgba(14, 42, 43, .6);
}

.bm-unit-switch .on {
    color: #0e2a2b;
}

.bm-unit-switch i {
    width: 30px;
    height: 14px;
    border-radius: 7px;
    background: #0c2324;
    position: relative;
}

.bm-unit-switch i::after {
    content: "";
    position: absolute;
    left: 2px;
    top: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #d8e4e2;
}

.bm-mini-screen {
    min-height: 70px;
}

.bm-mini-screen svg {
    inset: 6px 0;
    height: calc(100% - 12px);
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

.bm-mixer td :deep(.knob-wrap),
.bm-mixer td>* {
    margin: 0 auto;
}

.bm-thru-dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, .25);
}

.bm-thru-dot.lit {
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 6px var(--hw-led, #5dffb0);
}
</style>

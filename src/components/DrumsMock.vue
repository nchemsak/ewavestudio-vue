<!-- src/components/DrumsMock.vue -->
<!-- MOCKUPS ONLY (?drums=a|b|c; branch only, not for a PR): the Drums machine (the plan's item 5).
     Pictures, no sound: four slots (Kick, Snare, Metal, a sound kept from Rhythm), 16 steps each.
       a: the pads are a grid, a row per slot; Tune, Decay and Level on the slot cards in Sound
       b: one slot at a time on the big pads (voice keys over them), every slot's hits as dots under
       c: the grid, each row starting with its own Tune, Decay and Level; Sound only picks the hits -->
<template>
    <!-- THE PADS -->
    <div v-if="part === 'pads'" class="dm-pads" :data-v="variant">
        <!-- a and c: a row per slot -->
        <template v-if="variant !== 'b'">
            <div class="dm-numbers" aria-hidden="true">
                <span class="dm-head"></span>
                <span v-for="i in 16" :key="i" class="dm-num" :class="{ beat: (i - 1) % 4 === 0 }">{{ i }}</span>
            </div>
            <div v-for="(s, k) in slots" :key="s.id" class="dm-row" :style="{ '--h': s.hue }">
                <div class="dm-head">
                    <button type="button" class="dm-led" :class="{ lit: !s.muted }" :aria-label="`${s.name} on`" @click="s.muted = !s.muted"></button>
                    <span class="dm-name">{{ s.name }}<small>{{ s.src }}</small></span>
                    <template v-if="variant === 'c'">
                        <span class="dm-mk"><Knob v-model="s.tune" :label="`${s.name} tune`" hideLabel size="mini" :min="-12" :max="12" :step="1" bipolar :useThemeArc="true" /><i>Tune</i></span>
                        <span class="dm-mk"><Knob v-model="s.decay" :label="`${s.name} decay`" hideLabel size="mini" :min="0.05" :max="1" :step="0.01" :useThemeArc="true" /><i>Decay</i></span>
                        <span class="dm-mk"><Knob v-model="s.level" :label="`${s.name} level`" hideLabel size="mini" :min="0" :max="1" :step="0.01" :useThemeArc="true" /><i>Level</i></span>
                    </template>
                </div>
                <button v-for="(v, i) in s.vel" :key="i" type="button" class="dm-cell"
                    :class="{ on: v > 0, beat: i % 4 === 0, now: i === nowStep, dim: s.muted }"
                    :style="v > 0 ? { '--v': `${Math.round(v * 100)}%` } : undefined"
                    :aria-pressed="v > 0 ? 'true' : 'false'" :aria-label="`${s.name}, step ${i + 1}`"
                    @click="s.vel[i] = v > 0 ? 0 : 1"><span class="dm-fill"></span></button>
            </div>
        </template>

        <!-- b: voice keys, then the big pads for the chosen slot, then every slot's hits -->
        <template v-else>
            <div class="dm-voices" role="radiogroup" aria-label="Drum voice">
                <button v-for="(s, k) in slots" :key="s.id" type="button" role="radio" class="dm-voice hw-cap hw-cap-sm hw-led-left"
                    :class="{ 'hw-down': k === voice }" :aria-checked="k === voice ? 'true' : 'false'" :style="{ '--h': s.hue }"
                    @click="voice = k"><span class="dm-swatch"></span>{{ s.name }}</button>
                <span class="dm-voices-hint">The pads edit {{ slots[voice].name }}</span>
            </div>
            <SynthStepGrid name="drums" :current-step="nowStep" :min-hz="100" :max-hz="2000"
                :steps="slots[voice].vel.map((v) => v > 0)" @update:steps="(on: boolean[]) => (slots[voice].vel = on.map((o, i) => (o ? (slots[voice].vel[i] || 1) : 0)))"
                :velocities="slots[voice].vel.map((v) => v || 1)" @update:velocities="(v: number[]) => (slots[voice].vel = v.map((x, i) => (slots[voice].vel[i] > 0 ? x : 0)))"
                :pitches="Array(16).fill(slots[voice].hz)" :nearestNote="() => slots[voice].name.toUpperCase()"
                :showVelocity="false" :showPitch="false" :waveforms="Array(16).fill('sine')" :ratchets="Array(16).fill(1)"
                :repeatNotes="Array(16).fill('same')" :repeatBrush="null" defaultWave="sine" :noiseMask="Array(16).fill(false)"
                noiseTint="#fff" noise-mode="static" :noise-alpha="0" :noise-fps="14" :noise-speed="40" :noise-enabled="false"
                :pepper-alpha="0" :pepper-scale="6" :lfoView="null" />
            <div class="dm-overview" aria-hidden="true">
                <span v-for="i in 16" :key="i" class="dm-col">
                    <i v-for="(s, k) in slots" :key="s.id" :class="{ on: s.vel[i - 1] > 0, chosen: k === voice }" :style="{ '--h': s.hue }"></i>
                </span>
            </div>
        </template>
    </div>

    <!-- THE SOUND SECTION: a card per slot (2 × 2 beside the pedals) -->
    <div v-else-if="part === 'sound'" class="dm-sound" :data-v="variant">
        <div v-for="(s, k) in slots" :key="s.id" class="pt-card dm-slot" :style="{ '--h': s.hue }">
            <div class="dm-slot-head">
                <i class="dm-led" :class="{ lit: !s.muted }"></i>
                <span class="dm-slot-n">{{ k + 1 }}</span>
                <div class="dm-stepper" role="group" :aria-label="`Slot ${k + 1} sound`">
                    <button type="button" class="dm-arr" aria-label="Previous sound">◂</button>
                    <span class="dm-val">{{ s.name }}</span>
                    <button type="button" class="dm-arr" aria-label="Next sound">▸</button>
                </div>
            </div>
            <div class="dm-screen">
                <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><path :d="hitPath(s)" /></svg>
                <span class="dm-read">{{ s.src.toUpperCase() }} · {{ Math.round(s.ms * Math.pow(2, -s.tune / 12) * s.decay) }} MS</span>
            </div>
            <div v-if="variant !== 'c'" class="dm-knobs">
                <span class="dm-k"><Knob v-model="s.tune" :label="`${s.name} tune`" hideLabel size="mini" :min="-12" :max="12" :step="1" bipolar :useThemeArc="true" /><i>Tune</i><b>{{ s.tune > 0 ? '+' : '' }}{{ s.tune }} st</b></span>
                <span class="dm-k"><Knob v-model="s.decay" :label="`${s.name} decay`" hideLabel size="mini" :min="0.05" :max="1" :step="0.01" :useThemeArc="true" /><i>Decay</i><b>{{ Math.round(s.decay * 100) }}%</b></span>
                <span class="dm-k"><Knob v-model="s.level" :label="`${s.name} level`" hideLabel size="mini" :min="0" :max="1" :step="0.01" :useThemeArc="true" /><i>Level</i><b>{{ Math.round(s.level * 100) }}%</b></span>
            </div>
            <button type="button" class="hw-cap hw-cap-sm dm-take" :title="`Put Rhythm's sound, as it is now, in slot ${k + 1}`">Take Rhythm's sound</button>
        </div>
    </div>

    <!-- The shelf: the project's sounds a slot can play, the kit's and those kept from Rhythm -->
    <div v-else-if="part === 'shelf'" class="pt-card dm-shelf">
        <div class="dm-shelf-head"><h3 class="pt-title">Sounds</h3><span>A slot's ◂ ▸ steps through them</span></div>
        <div class="dm-shelf-group">
            <span class="dm-shelf-cap">Kit</span>
            <div class="dm-chips">
                <span v-for="c in KIT" :key="c.name" class="dm-chip" :class="{ used: c.used }" :style="{ '--h': c.hue }">
                    <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><path :d="hitPath(c)" /></svg>{{ c.name }}</span>
            </div>
        </div>
        <div class="dm-shelf-group">
            <span class="dm-shelf-cap">Kept from Rhythm <small>2 of 8</small></span>
            <div class="dm-chips">
                <span v-for="c in KEPT" :key="c.name" class="dm-chip" :class="{ used: c.used }" :style="{ '--h': c.hue }">
                    <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><path :d="hitPath(c)" /></svg>{{ c.name }}<button type="button" class="dm-x" :aria-label="`Delete ${c.name}`">✕</button></span>
            </div>
        </div>
        <p class="dm-shelf-note">Keep as drum (on Rhythm's Sound) puts a hit of Rhythm's sound here and in a slot. A lit name is in a slot.</p>
    </div>

    <!-- PHONE: the Pads page's pads (?dphone=a|b|c) -->
    <div v-else-if="part === 'phone-pads'" class="dp-pads" :data-v="variant">
        <!-- b: half a bar at a time -->
        <div v-if="variant === 'b'" class="dp-half" role="radiogroup" aria-label="Steps shown">
            <button v-for="(h, k) in ['1–8', '9–16']" :key="h" type="button" role="radio" class="dp-halfkey" :class="{ on: half === k }"
                :aria-checked="half === k ? 'true' : 'false'" @click="half = k">{{ h }}</button>
            <span class="dp-half-note">follows the playhead while playing</span>
        </div>
        <!-- c: voice keys, then the picked voice on the big pads -->
        <div v-if="variant === 'c'" class="dp-voices" role="radiogroup" aria-label="Drum voice">
            <button v-for="(s, k) in slots" :key="s.id" type="button" role="radio" class="dp-voice" :class="{ on: pick.i === k }"
                :style="{ '--h': s.hue }" :aria-checked="pick.i === k ? 'true' : 'false'" @click="pick.i = k">{{ s.name }}</button>
        </div>
        <div v-if="variant === 'c'" class="dp-big">
            <button v-for="(v, i) in slots[pick.i].vel" :key="i" type="button" class="dp-bigpad" :class="{ on: v > 0, beat: i % 4 === 0 }"
                :style="{ '--h': slots[pick.i].hue, '--v': `${Math.round(v * 100)}%` }" @click="slots[pick.i].vel[i] = v > 0 ? 0 : 1">
                <span class="dp-n">{{ i + 1 }}</span><span class="dp-fill"></span>
                <span class="dp-dots"><i v-for="(s, k) in slots" :key="s.id" :class="{ on: s.vel[i] > 0 }" :style="{ '--h': s.hue }"></i></span>
            </button>
        </div>
        <!-- a and b: a row per voice -->
        <template v-else>
            <div v-for="(s, k) in slots" :key="s.id" class="dp-row" :class="{ picked: pick.i === k }" :style="{ '--h': s.hue }">
                <button type="button" class="dp-name" :aria-pressed="pick.i === k ? 'true' : 'false'" @click="pick.i = k">{{ s.name }}</button>
                <button v-for="i in shownSteps" :key="i" type="button" class="dp-cell"
                    :class="{ on: s.vel[i] > 0, beat: i % 4 === 0 }" :style="s.vel[i] > 0 ? { '--v': `${Math.round(s.vel[i] * 100)}%` } : undefined"
                    @click="s.vel[i] = s.vel[i] > 0 ? 0 : 1"><span class="dp-fill"></span><span v-if="variant === 'b'" class="dp-n">{{ i + 1 }}</span></button>
            </div>
        </template>
    </div>

    <!-- PHONE: the Pads page's knobs, the picked voice's -->
    <div v-else-if="part === 'phone-knobs'" class="dp-knobs" :style="{ '--h': slots[pick.i].hue }">
        <span class="dp-kcap">{{ slots[pick.i].name }}</span>
        <span class="dp-k"><Knob v-model="slots[pick.i].tune" label="Tune" size="small" :min="-12" :max="12" :step="1" bipolar /><b>{{ slots[pick.i].tune > 0 ? '+' : '' }}{{ slots[pick.i].tune }} st</b></span>
        <span class="dp-k"><Knob v-model="slots[pick.i].decay" label="Decay" size="small" :min="0.05" :max="1" :step="0.01" /><b>{{ Math.round(slots[pick.i].decay * 100) }}%</b></span>
        <span class="dp-k"><Knob v-model="slots[pick.i].level" label="Level" size="small" :min="0" :max="1" :step="0.01" /><b>{{ Math.round(slots[pick.i].level * 100) }}%</b></span>
    </div>

    <!-- PHONE: the Sound page: a card per voice (tap the picture to hear it), and Mix -->
    <div v-else-if="part === 'phone-sound'" class="dp-sound">
        <div v-for="(s, k) in slots" :key="s.id" class="pt-card dp-slot" :style="{ '--h': s.hue }">
            <div class="dm-slot-head">
                <i class="dm-led" :class="{ lit: !s.muted }"></i>
                <div class="dm-stepper"><button type="button" class="dm-arr" aria-label="Previous sound">◂</button><span class="dm-val">{{ s.name }}</span><button type="button" class="dm-arr" aria-label="Next sound">▸</button></div>
            </div>
            <button type="button" class="dm-screen dp-screen" :aria-label="`Hear ${s.name}`">
                <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><path :d="hitPath(s)" /></svg>
                <span class="dm-read">{{ s.src.toUpperCase() }} · ▶</span>
            </button>
            <div class="dm-knobs">
                <span class="dm-k"><Knob v-model="s.tune" :label="`${s.name} tune`" hideLabel size="mini" :min="-12" :max="12" :step="1" bipolar /><i>Tune</i></span>
                <span class="dm-k"><Knob v-model="s.decay" :label="`${s.name} decay`" hideLabel size="mini" :min="0.05" :max="1" :step="0.01" /><i>Decay</i></span>
                <span class="dm-k"><Knob v-model="s.level" :label="`${s.name} level`" hideLabel size="mini" :min="0" :max="1" :step="0.01" /><i>Level</i></span>
            </div>
        </div>
        <div class="pt-card dp-mix" role="group" aria-label="Drums mix">
            <span class="dm-shelf-cap">Mix</span>
            <span class="dp-meter"><b v-for="n in 8" :key="n" :class="{ on: n <= 5, hot: n >= 7 }"></b></span>
            <span class="dm-k"><Knob v-model="mix.level" label="Drums level" hideLabel size="mini" :min="0" :max="1" :step="0.01" /><i>Level</i></span>
            <span class="dm-k"><Knob v-model="mix.pedals" label="Drums into the pedals" hideLabel size="mini" :min="0" :max="1" :step="0.01" /><i>Pedals</i></span>
        </div>
    </div>

    <!-- On Rhythm's Sound section: Keep as drum, then a slot -->
    <div v-else-if="part === 'keep'" class="dm-keep" role="group" aria-label="Keep as drum">
        <span class="dm-keep-cap">Keep as drum</span>
        <button v-for="(s, k) in slots" :key="s.id" type="button" class="hw-cap hw-cap-sm dm-keep-slot" :style="{ '--h': s.hue }"
            :title="`Put this sound, as it is now, in Drums slot ${k + 1} (now ${s.name})`">{{ k + 1 }}</button>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import Knob from './Knob.vue';
import SynthStepGrid from './SynthStepGrid.vue';
import { padHue } from '../lib/padColour';

const props = defineProps<{ part: 'pads' | 'sound' | 'keep' | 'shelf' | 'phone-pads' | 'phone-knobs' | 'phone-sound'; variant: string }>();
const g0 = globalThis as any;
const pick = (g0.__drumsPick ??= reactive({ i: 0 }));
const half = ref(0);
const shownSteps = computed(() => (props.variant === 'b' ? Array.from({ length: 8 }, (_, i) => i + half.value * 8) : Array.from({ length: 16 }, (_, i) => i)));
const mix = reactive({ level: 0.7, pedals: 1 });

const nowStep = -1;
const KIT = [
    { id: 'kick', name: 'Kick', shape: 'kick', decay: 0.8, tune: 0, hue: padHue(110), used: true },
    { id: 'snare', name: 'Snare', shape: 'snare', decay: 0.7, tune: 0, hue: padHue(640), used: true },
    { id: 'metal', name: 'Metal', shape: 'metal', decay: 0.4, tune: 0, hue: padHue(1600), used: true },
    { id: 'hat', name: 'Hat', shape: 'metal', decay: 0.15, tune: 7, hue: padHue(1900), used: false },
];
const KEPT = [
    { id: 'kept1', name: 'Kept 1', shape: 'bell', decay: 0.6, tune: 0, hue: padHue(1000), used: true },
    { id: 'kept2x', name: 'Kept 2', shape: 'kick', decay: 0.5, tune: 4, hue: padHue(300), used: false },
];
const voice = ref(0);
const V = (on: number[], vel: Record<number, number> = {}) => Array.from({ length: 16 }, (_, i) => (on.includes(i) ? (vel[i] ?? 1) : 0));

// One shared mock kit, so every part shows the same beat
const slots = mockSlots();
function mockSlots() {
    const g = globalThis as any;
    if (!g.__drumsMock) {
        g.__drumsMock = reactive([
            { id: 'kick', name: 'Kick', src: 'Kit', hz: 110, ms: 420, tune: 0, decay: 0.8, level: 0.9, muted: false, shape: 'kick', vel: V([0, 3, 8, 10], { 3: 0.5, 10: 0.7 }) },
            { id: 'snare', name: 'Snare', src: 'Kit', hz: 640, ms: 260, tune: 0, decay: 0.7, level: 0.75, muted: false, shape: 'snare', vel: V([4, 12, 15], { 15: 0.4 }) },
            { id: 'metal', name: 'Metal', src: 'Kit', hz: 1600, ms: 180, tune: 5, decay: 0.35, level: 0.55, muted: false, shape: 'metal', vel: V([0, 2, 4, 6, 8, 10, 12, 14], { 0: 0.5, 4: 0.5, 8: 0.5, 12: 0.5 }) },
            { id: 'kept', name: 'Kept 1', src: 'From Rhythm', hz: 1000, ms: 520, tune: -2, decay: 0.6, level: 0.6, muted: false, shape: 'bell', vel: V([7, 13], { 7: 0.8, 13: 0.6 }) },
        ].map((s) => ({ ...s, hue: padHue(s.hz) })));
    }
    return g.__drumsMock as any[];
}

// A hit's picture: a few cycles under a decaying envelope (noise for the snare and metal)
function hitPath(s: any) {
    const n = 200, len = s.decay * Math.pow(2, -s.tune / 12);
    let d = 'M0 30';
    let seed = s.id.length * 97;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let x = 0; x <= n; x++) {
        const t = x / n;
        const env = Math.exp(-t / (0.12 + 0.5 * len)) * (t < 0.01 ? t / 0.01 : 1);
        let y = 0;
        if (s.shape === 'kick') y = Math.sin(2 * Math.PI * (6 * t + 8 * (1 - Math.exp(-t * 18)))) * env;
        else if (s.shape === 'snare') y = (0.5 * Math.sin(2 * Math.PI * 24 * t) + 0.6 * rnd()) * env;
        else if (s.shape === 'metal') y = (0.4 * Math.sign(Math.sin(2 * Math.PI * 61 * t)) + 0.6 * rnd()) * env * 0.9;
        else y = Math.sin(2 * Math.PI * 30 * t) * env;
        d += ` L${x} ${(30 - y * 26).toFixed(1)}`;
    }
    return d;
}
</script>

<style scoped>
/* The grid (a and c) */
.dm-pads {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 12px 6px 4px;
}

.dm-numbers,
.dm-row {
    display: grid;
    grid-template-columns: 96px repeat(16, minmax(0, 1fr));
    gap: 4px;
    align-items: center;
}

.dm-pads[data-v="c"] .dm-numbers,
.dm-pads[data-v="c"] .dm-row {
    grid-template-columns: 206px repeat(16, minmax(0, 1fr));
}

.dm-num {
    font: 700 9px Cousine, ui-monospace, monospace;
    text-align: center;
    color: var(--pt-text-dim, #b9a8d8);
}

.dm-num.beat {
    color: var(--pt-text, #fff);
}

.dm-head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.dm-name {
    display: flex;
    flex-direction: column;
    font: 700 11px Cousine, ui-monospace, monospace;
    color: hsl(var(--h) 85% 72%);
    min-width: 52px;
}

.dm-name small {
    font-weight: 400;
    font-size: 8px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.dm-mk {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.dm-mk i {
    font: 700 7px Cousine, ui-monospace, monospace;
    font-style: normal;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.dm-led {
    flex: none;
    width: 9px;
    height: 9px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--hw-led-off, #2c3a33);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, .5);
}

.dm-led.lit {
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 6px var(--hw-led, #5dffb0);
}

.dm-cell {
    position: relative;
    height: 52px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, .08);
    border-radius: 6px;
    background: rgba(0, 0, 0, .28);
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, .5);
    overflow: hidden;
}

.dm-pads[data-v="c"] .dm-cell {
    height: 50px;
}

.dm-cell.beat {
    background: rgba(255, 255, 255, .06);
}

.dm-cell.on {
    border-color: hsl(var(--h) 80% 60% / .8);
    box-shadow: 0 0 10px hsl(var(--h) 90% 60% / .35);
}

.dm-cell.on.dim {
    opacity: .4;
}

.dm-fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--v, 0%);
    background: linear-gradient(to top, hsl(var(--h) 85% 55%), hsl(var(--h) 85% 68%));
}

/* b: the voice keys, the overview */
.dm-voices {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 0 6px 8px;
}

.dm-voice {
    height: 26px;
    padding: 0 10px 0 22px;
    font: 700 10px Cousine, ui-monospace, monospace;
    display: flex;
    align-items: center;
    gap: 6px;
}

.dm-swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: hsl(var(--h) 85% 60%);
}

.dm-voices-hint {
    margin-left: auto;
    margin-right: 12px;
    font: 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
}

.dm-overview {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    gap: 4px;
    padding: 6px 12px 0 0;
}

.dm-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
}

.dm-col i {
    width: 70%;
    height: 7px;
    border-radius: 2px;
    background: rgba(255, 255, 255, .07);
}

.dm-col i.on {
    background: hsl(var(--h) 80% 58%);
}

.dm-col i.chosen:not(.on) {
    background: rgba(255, 255, 255, .16);
}

/* Narrow: a slot's row wraps into two rows of 8 */
@media (max-width: 639.98px) {

    .dm-numbers,
    .dm-row,
    .dm-pads[data-v="c"] .dm-numbers,
    .dm-pads[data-v="c"] .dm-row {
        grid-template-columns: repeat(8, minmax(0, 1fr));
    }

    .dm-numbers .dm-num:nth-child(n + 10) {
        display: none;
    }

    .dm-row .dm-head,
    .dm-numbers .dm-head {
        grid-column: 1 / -1;
    }

    .dm-numbers .dm-head {
        display: none;
    }

    .dm-cell {
        height: 30px;
    }

    .dm-overview {
        grid-template-columns: repeat(8, minmax(0, 1fr));
    }
}

/* The Sound section's slot cards */
.dm-sound {
    grid-area: slots;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
}

.dm-slot {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    border-top: 3px solid hsl(var(--h) 80% 60%);
}

.dm-slot-head {
    display: flex;
    align-items: center;
    gap: 6px;
}

.dm-slot-n {
    font: 700 10px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
}

.dm-stepper {
    flex: 1;
    display: flex;
    align-items: center;
    background: var(--pt-inset, rgba(0, 0, 0, .3));
    border-radius: 6px;
}

.dm-arr {
    border: 0;
    background: none;
    color: var(--pt-text, #fff);
    width: 22px;
    height: 22px;
}

.dm-val {
    flex: 1;
    text-align: center;
    font: 700 11px Cousine, ui-monospace, monospace;
    color: hsl(var(--h) 85% 72%);
}

.dm-screen {
    --sp-bg: #0c1118;
    --sp-ink: #cfe0ff;
    position: relative;
    flex: 1 1 auto;
    min-height: 58px;
    border-radius: 6px;
    background: var(--sp-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07), inset 0 2px 10px rgba(0, 0, 0, .6);
    overflow: hidden;
}


.theme-synthwave .dm-screen {
    --sp-bg: #2a0f52;
}

.theme-analog .dm-screen {
    --sp-bg: #160f05;
}

.dm-screen svg {
    position: absolute;
    inset: 14px 0 2px;
    width: 100%;
    height: calc(100% - 16px);
}

.dm-screen path {
    fill: none;
    stroke: hsl(var(--h) 85% 70%);
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
}

.dm-read {
    position: absolute;
    top: 3px;
    left: 6px;
    font: 700 8px Cousine, ui-monospace, monospace;
    letter-spacing: .06em;
    color: var(--sp-ink);
}

.dm-knobs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    justify-items: center;
}

.dm-k {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.2;
}

.dm-k i,
.dm-k b {
    font: 700 8px Cousine, ui-monospace, monospace;
    font-style: normal;
    color: var(--pt-text-dim, #b9a8d8);
}

.dm-k b {
    color: var(--pt-text, #fff);
}

.dm-take {
    height: 24px;
    font: 700 9px Cousine, ui-monospace, monospace;
}

/* The shelf */
.dm-shelf {
    grid-area: shelf;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
}

.dm-shelf-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
}

.dm-shelf-head span,
.dm-shelf-note {
    font: 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
    margin: 0;
}

.dm-shelf-cap {
    display: block;
    margin-bottom: 4px;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.dm-shelf-cap small {
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
}

.dm-chips {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
}

.dm-chip {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 6px;
    border-radius: 6px;
    background: var(--pt-inset, rgba(0, 0, 0, .3));
    font: 700 10px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
}

.dm-chip.used {
    color: hsl(var(--h) 85% 72%);
    box-shadow: inset 0 0 0 1px hsl(var(--h) 80% 60% / .6);
}

.dm-chip svg {
    width: 100%;
    height: 26px;
}

.dm-chip path {
    fill: none;
    stroke: hsl(var(--h) 85% 70%);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
    opacity: .85;
}

.dm-x {
    position: absolute;
    right: 3px;
    bottom: 2px;
    border: 0;
    background: none;
    color: var(--pt-text-dim, #b9a8d8);
    font-size: 9px;
}

/* PHONE */
.dp-pads {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: 0;
    height: 100%;
}

.dp-row {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 46px repeat(16, minmax(0, 1fr));
    gap: 3px;
}

.dp-pads[data-v="b"] .dp-row {
    grid-template-columns: 52px repeat(8, minmax(0, 1fr));
    gap: 5px;
}

.dp-name {
    border: 0;
    border-radius: 6px;
    padding: 0 4px;
    background: rgba(0, 0, 0, .25);
    color: hsl(var(--h) 85% 72%);
    font: 700 9px Cousine, ui-monospace, monospace;
    text-align: left;
}

.dp-row.picked .dp-name {
    background: hsl(var(--h) 60% 30% / .6);
    box-shadow: inset 0 0 0 1px hsl(var(--h) 80% 60%);
}

.dp-cell,
.dp-bigpad {
    position: relative;
    min-width: 0;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, .08);
    border-radius: 5px;
    background: rgba(0, 0, 0, .28);
    overflow: hidden;
}

.dp-cell.beat,
.dp-bigpad.beat {
    background: rgba(255, 255, 255, .07);
}

.dp-cell.on,
.dp-bigpad.on {
    border-color: hsl(var(--h) 80% 60% / .8);
}

.dp-fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 0;
    background: linear-gradient(to top, hsl(var(--h) 85% 55%), hsl(var(--h) 85% 68%));
}

.dp-cell.on .dp-fill,
.dp-bigpad.on .dp-fill {
    height: var(--v, 0%);
}

.dp-n {
    position: absolute;
    top: 2px;
    left: 4px;
    z-index: 1;
    font: 700 8px Cousine, ui-monospace, monospace;
    color: rgba(255, 255, 255, .55);
}

.dp-half,
.dp-voices {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
}

.dp-halfkey,
.dp-voice {
    height: 24px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: rgba(255, 255, 255, .06);
    color: var(--pt-text-dim, #cbbde6);
    font: 700 10px Cousine, ui-monospace, monospace;
}

.dp-halfkey.on {
    color: #fff;
    box-shadow: inset 0 0 0 1px var(--hw-led, #5dffb0);
    background: rgba(255, 255, 255, .15);
}

.dp-voice {
    flex: 1;
    color: hsl(var(--h) 85% 72%);
}

.dp-voice.on {
    background: hsl(var(--h) 60% 30% / .6);
    box-shadow: inset 0 0 0 1px hsl(var(--h) 80% 60%);
}

.dp-half-note {
    font: 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
    margin-left: 4px;
}

.dp-big {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    grid-template-rows: 1fr 1fr;
    gap: 6px;
}

.dp-dots {
    position: absolute;
    left: 4px;
    right: 4px;
    bottom: 4px;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2px;
}

.dp-dots i {
    height: 4px;
    border-radius: 1px;
    background: rgba(0, 0, 0, .35);
}

.dp-dots i.on {
    background: hsl(var(--h) 80% 70%);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, .4);
}

.dp-knobs {
    display: contents;
}

.dp-kcap {
    font: 700 10px Cousine, ui-monospace, monospace;
    color: hsl(var(--h) 85% 72%);
    text-transform: uppercase;
    letter-spacing: .06em;
}

.dp-k {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.dp-k b {
    font: 700 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text, #fff);
}

.dp-sound {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr)) 72px;
    gap: 6px;
    height: 100%;
    min-height: 0;
}

.dp-slot {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 6px;
    min-height: 0;
    border-top: 3px solid hsl(var(--h) 80% 60%);
}

.dp-screen {
    border: 0;
    padding: 0;
    width: 100%;
}

.dp-mix {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-around;
    padding: 6px 4px;
}

.dp-meter {
    display: flex;
    gap: 2px;
}

.dp-meter b {
    width: 4px;
    height: 10px;
    border-radius: 1px;
    background: rgba(255, 255, 255, .1);
}

.dp-meter b.on {
    background: var(--hw-led, #5dffb0);
}

.dp-meter b.hot.on {
    background: #ffb347;
}

/* Keep as drum (Rhythm's Sound title) */
.dm-keep {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
}

.dm-keep-cap {
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
    margin-right: 4px;
}

.dm-keep-slot {
    width: 24px;
    height: 22px;
    padding: 0;
    font: 700 10px Cousine, ui-monospace, monospace;
    border-bottom: 2px solid hsl(var(--h) 80% 60%);
}


@media (max-width: 719.98px) {
    .dm-sound {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>

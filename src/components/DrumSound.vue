<!-- src/components/DrumSound.vue -->
<!-- The Drums machine's Sound section (the plan's item 5; the mockups' slot cards and shelf): a
     card per slot (its colour along the top, its LED, ◂ name ▸ stepping through the sounds it
     can play, a picture of its hit, which plays it when clicked while stopped, and Tune, Decay
     and Level), then the Sounds shelf beside the pedals: the kit's four, and the sounds kept
     from Rhythm (Keep as drum, on Rhythm's Sound), each to hear with a click, a kept one with ✕
     to delete it. A lit sound is in a slot. `compact` (phone mode's Sound page, PR 121): the four
     cards and the `mix` slot (the machine's meter, Level and Pedals), no shelf. -->
<template>
    <div class="drum-sound" :class="{ compact }">
        <div class="ds-slots" style="grid-area: slots">
            <div v-for="(sl, k) in drums.slots" :key="k" class="pt-card dsl" :class="{ picked: k === picked }"
                :style="{ '--h': hues[k] }" role="group" :aria-label="`Drum slot ${k + 1}`">
                <div class="dsl-head">
                    <button type="button" class="dsl-led" :class="{ lit: !sl.muted }" role="switch" :aria-checked="!sl.muted ? 'true' : 'false'"
                        :aria-label="`${names[k]} on`" @click="sl.muted = !sl.muted"></button>
                    <span class="dsl-n">{{ k + 1 }}</span>
                    <div class="dsl-stepper">
                        <button type="button" class="dsl-arr" :aria-label="`Slot ${k + 1}: previous sound`" @click="step(k, -1)">◂</button>
                        <span class="dsl-val" :title="`Slot ${k + 1} plays ${names[k]}`">{{ names[k] }}</span>
                        <button type="button" class="dsl-arr" :aria-label="`Slot ${k + 1}: next sound`" @click="step(k, 1)">▸</button>
                    </div>
                </div>
                <button type="button" class="dsl-screen" :aria-label="`Hear slot ${k + 1}: ${names[k]}`"
                    :title="playing ? `${names[k]}: ${lengths[k]}` : `Click to hear ${names[k]}`" @click="emit('preview', k)">
                    <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><path :d="pictures[k]" /></svg>
                    <span class="dsl-read">{{ sources[k].toUpperCase() }} · {{ lengths[k] }}</span>
                </button>
                <!-- Written out per slot: MIDI learn's ids must each be on one knob in the source -->
                <div class="dsl-knobs">
                    <span class="dsl-k">
                        <Knob v-if="k === 0" midi-id="drums.1.tune" v-bind="TUNE" v-model="sl.tune" :label="`${names[k]} tune`" :value-text="tuneText(sl.tune)" />
                        <Knob v-else-if="k === 1" midi-id="drums.2.tune" v-bind="TUNE" v-model="sl.tune" :label="`${names[k]} tune`" :value-text="tuneText(sl.tune)" />
                        <Knob v-else-if="k === 2" midi-id="drums.3.tune" v-bind="TUNE" v-model="sl.tune" :label="`${names[k]} tune`" :value-text="tuneText(sl.tune)" />
                        <Knob v-else midi-id="drums.4.tune" v-bind="TUNE" v-model="sl.tune" :label="`${names[k]} tune`" :value-text="tuneText(sl.tune)" />
                        <i>Tune</i><b>{{ tuneText(sl.tune) }}</b>
                    </span>
                    <span class="dsl-k">
                        <Knob v-if="k === 0" midi-id="drums.1.decay" v-bind="DECAY" v-model="sl.decay" :label="`${names[k]} decay`" :value-text="pct(sl.decay)" />
                        <Knob v-else-if="k === 1" midi-id="drums.2.decay" v-bind="DECAY" v-model="sl.decay" :label="`${names[k]} decay`" :value-text="pct(sl.decay)" />
                        <Knob v-else-if="k === 2" midi-id="drums.3.decay" v-bind="DECAY" v-model="sl.decay" :label="`${names[k]} decay`" :value-text="pct(sl.decay)" />
                        <Knob v-else midi-id="drums.4.decay" v-bind="DECAY" v-model="sl.decay" :label="`${names[k]} decay`" :value-text="pct(sl.decay)" />
                        <i>Decay</i><b>{{ pct(sl.decay) }}</b>
                    </span>
                    <span class="dsl-k">
                        <Knob v-if="k === 0" midi-id="drums.1.level" v-bind="LEVEL" v-model="sl.level" :label="`${names[k]} level`" :value-text="pct(sl.level)" />
                        <Knob v-else-if="k === 1" midi-id="drums.2.level" v-bind="LEVEL" v-model="sl.level" :label="`${names[k]} level`" :value-text="pct(sl.level)" />
                        <Knob v-else-if="k === 2" midi-id="drums.3.level" v-bind="LEVEL" v-model="sl.level" :label="`${names[k]} level`" :value-text="pct(sl.level)" />
                        <Knob v-else midi-id="drums.4.level" v-bind="LEVEL" v-model="sl.level" :label="`${names[k]} level`" :value-text="pct(sl.level)" />
                        <i>Level</i><b>{{ pct(sl.level) }}</b>
                    </span>
                </div>
            </div>
            <div v-if="compact && $slots.mix" class="pt-card dsl dsl-mix"><slot name="mix" /></div>
        </div>

        <div v-if="!compact" class="pt-card ds-shelf" style="grid-area: shelf" role="group" aria-label="Drum sounds">
            <div class="ds-shelf-head"><h3 class="pt-title">Sounds</h3><span>Click to hear one. A slot's ◂ ▸ steps through them.</span></div>
            <div class="ds-group">
                <span class="ds-cap">Kit</span>
                <div class="ds-chips">
                    <button v-for="c in kitChips" :key="c.ref" type="button" class="ds-chip" :class="{ used: c.used }" :style="{ '--h': c.hue }"
                        :aria-label="`Hear ${c.name}`" :title="c.used ? `${c.name}: in a slot` : c.name" @click="emit('preview-sound', c.ref)">
                        <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><path :d="c.picture" /></svg>{{ c.name }}</button>
                </div>
            </div>
            <div class="ds-group">
                <span class="ds-cap">Kept from Synth <small>{{ drums.kept.length }} of {{ KEPT_MAX }}</small></span>
                <div class="ds-chips">
                    <span v-for="c in keptChips" :key="c.ref" class="ds-chipwrap">
                        <button type="button" class="ds-chip" :class="{ used: c.used }" :style="{ '--h': c.hue }"
                            :aria-label="`Hear ${c.name}`" :title="c.used ? `${c.name}: in a slot` : c.name" @click="emit('preview-sound', c.ref)">
                            <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><path :d="c.picture" /></svg>{{ c.name }}</button>
                        <button type="button" class="ds-x" :aria-label="`Delete ${c.name}`"
                            :title="c.used ? `Delete ${c.name} (its slot goes back to the kit's sound)` : `Delete ${c.name}`"
                            @click="deleteKept(drums, c.ref)">✕</button>
                    </span>
                    <p v-if="!drums.kept.length" class="ds-empty">None yet. On Synth's Sound, <b>Keep as drum</b> puts a hit of Synth's sound here and in a slot.</p>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Knob from './Knob.vue';
import { drumHitShape, DRUM_RANGES, KIT_IDS, type KitId } from '../audio/drums';
import { decodeSample, type SampleData } from '../audio/sample';
import { deleteKept, KEPT_MAX, kitRef, slotData, slotSound, soundName, stepSound, type Drums } from '../lib/machines/drums';
import { soundHue } from '../lib/machines/drumColours';

const props = defineProps<{
    drums: Drums;
    kit: Record<KitId, SampleData> | null;
    picked: number;
    playing: boolean;
    compact?: boolean;
}>();
const emit = defineEmits<{
    (e: 'preview', slot: number): void;
    (e: 'preview-sound', ref: string): void;
}>();

const TUNE = { hideLabel: true, size: 'mini', min: DRUM_RANGES.tune[0], max: DRUM_RANGES.tune[1], step: 1, bipolar: true, useThemeArc: true } as const;
const DECAY = { hideLabel: true, size: 'mini', min: DRUM_RANGES.decay[0], max: DRUM_RANGES.decay[1], step: 0.01, useThemeArc: true } as const;
const LEVEL = { hideLabel: true, size: 'mini', min: DRUM_RANGES.level[0], max: DRUM_RANGES.level[1], step: 0.01, useThemeArc: true } as const;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const tuneText = (t: number) => `${t > 0 ? '+' : ''}${t} st`;

const refs = computed(() => props.drums.slots.map((_, k) => slotSound(props.drums, k)));
const names = computed(() => refs.value.map((r) => soundName(r, props.drums.kept)));
const sources = computed(() => refs.value.map((r) => (r.startsWith('kit:') ? 'Kit' : 'Kept')));
const hues = computed(() => refs.value.map((r) => soundHue(r)));
const datas = computed(() => props.drums.slots.map((_, k) => slotData(props.drums, k, props.kit)));
const lengths = computed(() => datas.value.map((d, k) => {
    if (!d) return '…';
    const s = props.drums.slots[k];
    return `${Math.round(drumHitShape(seconds(d), s.tune, s.decay).seconds * 1000)} MS`;
}));

function step(k: number, by: 1 | -1) {
    const d = props.drums;
    const next = stepSound(refs.value[k], d.kept, by);
    d.slots = d.slots.map((s, j) => (j === k ? { ...s, sound: next } : s));
}

// The pictures START
const seconds = (d: SampleData) => decodedOf(d).length / d.sampleRate;
const decoded = new Map<string, Float32Array>();
function decodedOf(d: SampleData) {
    const key = `${d.sampleRate}:${d.data.length}:${d.data.slice(0, 40)}`;
    let x = decoded.get(key);
    if (!x) { x = decodeSample(d.data); decoded.set(key, x); }
    return x;
}
// A hit as a filled shape, its peaks over the part a slot plays (Tune, Decay), the fade drawn in
function picture(d: SampleData | null, tune = 0, decay = 1, cols = 100) {
    if (!d) return 'M0 30 L200 30';
    const x = decodedOf(d);
    const { rate, seconds: secs, fade } = drumHitShape(x.length / d.sampleRate, tune, decay);
    const n = Math.max(1, Math.round(secs * rate * d.sampleRate));
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i] ?? 0));
    const h: number[] = [];
    for (let c = 0; c < cols; c++) {
        let m = 0;
        const a = Math.floor((c / cols) * n), b = Math.max(a + 1, Math.floor(((c + 1) / cols) * n));
        for (let i = a; i < b; i++) m = Math.max(m, Math.abs(x[i] ?? 0));
        const t = (c / cols) * secs;
        const g = t > secs - fade ? Math.max(0, (secs - t) / fade) : 1;
        h.push((m / (peak || 1)) * g);
    }
    const w = 200 / cols;
    let top = 'M0 30', bottom = '';
    h.forEach((v, c) => { top += ` L${(c * w).toFixed(1)} ${(30 - v * 27).toFixed(1)}`; });
    for (let c = cols - 1; c >= 0; c--) bottom += ` L${(c * w).toFixed(1)} ${(30 + h[c] * 27).toFixed(1)}`;
    return `${top} L200 30${bottom} Z`;
}
const pictures = computed(() => props.drums.slots.map((s, k) => picture(datas.value[k], s.tune, s.decay)));
// The pictures END

const used = computed(() => new Set(refs.value));
const kitChips = computed(() => KIT_IDS.map((id) => {
    const ref = kitRef(id);
    return { ref, name: soundName(ref, []), hue: soundHue(ref), used: used.value.has(ref), picture: picture(props.kit?.[id] ?? null, 0, 1, 60) };
}));
const keptChips = computed(() => props.drums.kept.map((k) => ({
    ref: k.id, name: k.name, hue: soundHue(k.id), used: used.value.has(k.id), picture: picture(k, 0, 1, 60),
})));
</script>

<style scoped>
.drum-sound {
    display: contents;
}

.ds-slots {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    min-width: 0;
}

.dsl {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    border-top: 3px solid hsl(var(--h) 80% 60%);
    min-width: 0;
}

.dsl.picked {
    box-shadow: inset 0 0 0 1px hsl(var(--h) 80% 60% / .6);
}

.dsl-head {
    display: flex;
    align-items: center;
    gap: 6px;
}

.dsl-led {
    flex: none;
    width: 9px;
    height: 9px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--hw-led-off, #2c3a33);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, .5);
    cursor: pointer;
}

.dsl-led.lit {
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 6px var(--hw-led, #5dffb0);
}

.dsl-n {
    font: 700 10px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
}

.dsl-stepper {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    background: var(--pt-inset, rgba(0, 0, 0, .3));
    border-radius: 6px;
}

.dsl-arr {
    flex: none;
    border: 0;
    background: none;
    color: var(--pt-text, #fff);
    width: 22px;
    height: 22px;
    cursor: pointer;
}

.dsl-val {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
    font: 700 11px Cousine, ui-monospace, monospace;
    color: hsl(var(--h) 85% 72%);
}

.dsl-screen {
    --sp-bg: #0c1118;
    --sp-ink: #cfe0ff;
    position: relative;
    flex: 1 1 auto;
    min-height: 58px;
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: var(--sp-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07), inset 0 2px 10px rgba(0, 0, 0, .6);
    overflow: hidden;
    cursor: pointer;
}

.theme-synthwave .dsl-screen {
    --sp-bg: #2a0f52;
}

.theme-analog .dsl-screen {
    --sp-bg: #160f05;
    --sp-ink: #ffcf8a;
}

.dsl-screen svg {
    position: absolute;
    inset: 14px 0 2px;
    width: 100%;
    height: calc(100% - 16px);
}

.dsl-screen path {
    fill: hsl(var(--h) 85% 62% / .55);
    stroke: hsl(var(--h) 85% 72%);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
}

.dsl-screen:hover path {
    fill: hsl(var(--h) 85% 66% / .75);
}

.dsl-read {
    position: absolute;
    top: 3px;
    left: 6px;
    font: 700 8px Cousine, ui-monospace, monospace;
    letter-spacing: .06em;
    color: var(--sp-ink);
}

.dsl-knobs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    justify-items: center;
}

.dsl-k {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.2;
}

.dsl-k i,
.dsl-k b {
    font: 700 8px Cousine, ui-monospace, monospace;
    font-style: normal;
    color: var(--pt-text-dim, #b9a8d8);
}

.dsl-k b {
    color: var(--pt-text, #fff);
}

/* The shelf */
.ds-shelf {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    min-width: 0;
}

.ds-shelf-head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 10px;
}

.ds-shelf-head span,
.ds-empty {
    font: 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
    margin: 0;
}

.ds-empty {
    grid-column: 1 / -1;
    line-height: 1.5;
}

.ds-cap {
    display: block;
    margin-bottom: 4px;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.ds-cap small {
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
}

.ds-chips {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
}

.ds-chipwrap {
    position: relative;
    display: flex;
    min-width: 0;
}

.ds-chip {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 4px 6px;
    border: 0;
    border-radius: 6px;
    background: var(--pt-inset, rgba(0, 0, 0, .3));
    font: 700 10px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
}

.ds-chip.used {
    color: hsl(var(--h) 85% 72%);
    box-shadow: inset 0 0 0 1px hsl(var(--h) 80% 60% / .6);
}

.ds-chip svg {
    width: 100%;
    height: 22px;
}

.ds-chip path {
    fill: hsl(var(--h) 85% 62% / .45);
    stroke: hsl(var(--h) 85% 70%);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
}

.ds-x {
    position: absolute;
    right: 2px;
    bottom: 1px;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--pt-text-dim, #b9a8d8);
    font-size: 10px;
    cursor: pointer;
}

.ds-x:hover {
    color: #ff7a8a;
}

@media (max-width: 719.98px) {
    .ds-slots {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

/* Compact (phone mode's Sound page): the four cards and Mix across, filling the page's height */
.compact .ds-slots {
    grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
    gap: 6px;
    height: 100%;
}

.compact .dsl {
    padding: 6px;
    gap: 4px;
}

.compact .dsl-screen {
    min-height: 40px;
}

.compact .dsl-arr {
    width: 18px;
}

.compact .dsl-mix {
    border-top-color: transparent;
    justify-content: center;
}
</style>

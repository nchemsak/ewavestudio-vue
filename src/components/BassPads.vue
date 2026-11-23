<!-- src/components/BassPads.vue -->
<!-- The Bass machine's pads (the plan's item 4; option K of four rounds of mockups): the 16
     step pads (SynthStepGrid, its notes drawn in the pads' colours two octaves up, as Bass's
     30–250 Hz would all be blue), with what Slide and Tie do drawn under the notes' names (an
     arc glides into the next note, a bar holds it), then three rows of toggles: Accent, Slide
     and Tie. A step's Slide and Tie are one or the other. Each click is one undo step. -->
<template>
    <div class="bass-pads" :class="look ? `look-${look}` : null">
        <div class="bp-grid-wrap">
            <SynthStepGrid name="bass" :current-step="currentStep" :min-hz="BASS_MIN_HZ * HUE" :max-hz="BASS_MAX_HZ * HUE"
                :steps="lane.steps" @update:steps="(v: boolean[]) => (lane.steps = v)"
                :velocities="lane.velocities" @update:velocities="(v: number[]) => (lane.velocities = v)"
                :pitches="shownPitches" @update:pitches="(v: number[]) => (lane.pitches = v.map((hz) => hz / HUE))"
                :nearestNote="(hz: number) => nearestNote(hz / HUE)" :showVelocity="showVelocity" :showPitch="showPitch"
                :waveforms="waves" :ratchets="ones" :repeatNotes="sames" :repeatBrush="null" :defaultWave="wave === 'square' ? 'square' : 'sawtooth'"
                :noiseMask="offs" noiseTint="#fff" noise-mode="static" :noise-alpha="0" :noise-fps="14" :noise-speed="40"
                :noise-enabled="false" :pepper-alpha="0" :pepper-scale="6" :lfoView="null"
                :look="look" head-name="Bass" :head-sub="wave === 'square' ? 'Square' : 'Saw'"
                @open-pad-settings="(p: any) => emit('open-pad-settings', p)" />
            <div class="bp-links" aria-hidden="true">
                <span v-for="(l, i) in links" :key="i" class="bp-link-cell">
                    <svg v-if="l === 'slide'" class="bp-link slide" viewBox="0 0 100 20" preserveAspectRatio="none">
                        <path :d="slidePath(i)" /><path :d="slideHead(i)" />
                    </svg>
                    <i v-else-if="l === 'tie'" class="bp-link tie"></i>
                </span>
            </div>
        </div>
        <div class="bp-rows">
            <div v-for="row in ROWS" :key="row.id" class="bp-row" role="group" :aria-label="row.label">
                <span class="bp-row-cap">{{ row.label }} <small>{{ row.hint }}</small></span>
                <button v-for="(on, i) in lane[row.id]" :key="i" type="button"
                    class="bp-tog hw-cap hw-cap-sm" :class="{ 'hw-down': on, off: !lane.steps[i] && !carried[i] }"
                    :aria-pressed="on ? 'true' : 'false'" :aria-label="`${row.label} on step ${i + 1}`"
                    :title="`${row.label} on step ${i + 1}: ${row.tip}`" @click="toggle(row.id, i)"><i class="bp-led" :class="{ lit: on }"></i></button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SynthStepGrid from './SynthStepGrid.vue';
import { BASS_MAX_HZ, BASS_MIN_HZ, bassPlan, type BassWave } from '../audio/bass';
import type { BassLane } from '../lib/machines/bass';

const props = defineProps<{
    lane: BassLane;
    wave: BassWave;
    currentStep: number;
    nearestNote: (hz: number) => string;
    showVelocity?: boolean;
    showPitch?: boolean;
    look?: string; // MOCKUPS ONLY: ?pads=a|b|c
}>();
const emit = defineEmits<{
    (e: 'open-pad-settings', payload: { name: string; index: number; anchorRect: DOMRect }): void;
}>();

// The pads' colours run 100–2000 Hz; Bass's notes are drawn two octaves up
const HUE = 4;
const n = computed(() => props.lane.steps.length);
const shownPitches = computed(() => props.lane.pitches.map((hz) => hz * HUE));
const waves = computed(() => Array(n.value).fill(props.wave === 'square' ? 'square' : 'sawtooth'));
const ones = computed(() => Array(n.value).fill(1));
const sames = computed(() => Array(n.value).fill('same'));
const offs = computed(() => Array(n.value).fill(false));

const ROWS = [
    { id: 'accents', label: 'Accent', hint: '', tip: 'louder, the filter opening further' },
    { id: 'slides', label: 'Slide', hint: 'into the next note', tip: 'glides into the next step\'s note, which doesn\'t start again' },
    { id: 'ties', label: 'Tie', hint: 'through the next step', tip: 'holds the note through the next step' },
] as const;

// What each step does to the next: glide into it, hold through it, or nothing (as played)
const links = computed(() => props.lane.steps.map((_, i) => {
    if (props.lane.ties[i]) return 'tie';
    if (props.lane.slides[i] && props.lane.steps[(i + 1) % n.value]) return 'slide';
    return '';
}));
// The steps a note carries into (tied or slid into): their toggles aren't dimmed
const carried = computed(() => {
    const plan = bassPlan(props.lane, n.value);
    const c = Array(n.value).fill(false);
    plan.forEach((h) => { if (h) for (let k = 1; k < h.steps; k++) c[(h.step + k) % n.value] = true; });
    return c;
});

// The arc rises or falls with the note it glides to
function dir(i: number) {
    const a = props.lane.pitches[i], b = props.lane.pitches[(i + 1) % n.value];
    return b > a * 1.001 ? 1 : b < a / 1.001 ? -1 : 0;
}
function slidePath(i: number) {
    const d = dir(i);
    const y0 = d >= 0 ? 16 : 4, y1 = d > 0 ? 4 : d < 0 ? 16 : 10;
    return `M8 ${d === 0 ? 10 : y0} C 35 ${d === 0 ? 10 : y0}, 60 ${y1}, 92 ${y1}`;
}
function slideHead(i: number) {
    const y = dir(i) > 0 ? 4 : dir(i) < 0 ? 16 : 10;
    return `M84 ${y - 3} L93 ${y} L85 ${y + 5}`;
}

// Slide and Tie are one or the other on a step
function toggle(id: 'accents' | 'slides' | 'ties', i: number) {
    const list = [...props.lane[id]];
    list[i] = !list[i];
    props.lane[id] = list;
    const other = id === 'slides' ? 'ties' : id === 'ties' ? 'slides' : null;
    if (other && list[i] && props.lane[other][i]) {
        const o = [...props.lane[other]];
        o[i] = false;
        props.lane[other] = o;
    }
}
</script>

<style scoped>
/* MOCKUPS ONLY: ?pads=a|b|c. The pads shorter, as the rows take the rest of the card */
.bass-pads.look-a :deep(.padTEST),
.bass-pads.look-b :deep(.padTEST),
.bass-pads.look-c :deep(.padTEST) {
    height: 104px;
}

.bass-pads.look-b :deep(.padTEST) {
    height: 92px;
}

.bass-pads.look-c .bp-row,
.bass-pads.look-c .bp-links {
    margin-left: 96px;
}

.bass-pads.look-c .bp-row {
    padding-right: 0;
    column-gap: 6px;
}

.bass-pads.look-c .bp-tog {
    width: 100%;
    max-width: none;
    border-radius: 5px;
}

.bp-grid-wrap {
    position: relative;
}

.bp-links {
    position: absolute;
    left: 0;
    right: 12px;
    bottom: -22px;
    height: 18px;
    display: grid;
    grid-template-columns: repeat(16, 1fr);
    pointer-events: none;
}

.bp-link-cell {
    position: relative;
}

.bp-link {
    position: absolute;
    left: 50%;
    width: 100%;
}

.bp-link.slide {
    top: -2px;
    height: 20px;
    overflow: visible;
}

.bp-link.slide path {
    fill: none;
    stroke: var(--hw-led, #5dffb0);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
}

.bp-link.tie {
    top: 7px;
    height: 4px;
    border-radius: 2px;
    background: var(--hw-led, #5dffb0);
    left: calc(50% + 14px);
    width: calc(100% - 28px);
}

.bp-rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 30px;
}

.bp-row {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    row-gap: 2px;
    align-items: center;
    padding-right: 12px;
}

.bp-row-cap {
    grid-column: 1 / -1;
    padding-left: 4px;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.bp-row-cap small {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    opacity: .8;
    margin-left: 4px;
}

.bp-tog {
    justify-self: center;
    width: 30px;
    max-width: 100%;
    height: 18px;
    padding: 0;
    display: grid;
    place-items: center;
}

.bp-tog.off {
    opacity: .45;
}

.bp-led {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--hw-led-off, #2c3a33);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, .5);
}

.bp-led.lit {
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 6px var(--hw-led, #5dffb0);
}

/* Two rows of 8 pads (a narrow screen): the toggles go two rows of 8 too */
@media (max-width: 639.98px) {
    .bp-links {
        display: none;
    }

    .bp-rows {
        margin-top: 24px;
    }

    .bp-row {
        grid-template-columns: repeat(8, minmax(0, 1fr));
        padding-right: 0;
    }
}
</style>

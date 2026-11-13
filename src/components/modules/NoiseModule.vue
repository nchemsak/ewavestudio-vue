<template>
    <KnobGroup class="noise-group" v-model="enabledLocal" title="Noise" :color="accent" :showToggle="showToggle">
        <div class="noise-main">
            <div class="controls-row">
                <!-- Burst -->
                <div class="control-block knob-wrap">
                    <Knob midi-id="noise.burst" :value-text="Math.round(burstMsLocal) >= 250 ? 'Full decay' : `${Math.round(burstMsLocal)} ms`" v-model="burstMsLocal" label="Burst" :min="5" :max="250" :step="1" size="small"
                        :color="accent" :disabled="!enabledLocal" @knobStart="activeKnob = 'burstMs'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'burstMs'" class="custom-tooltip">
                        {{ Math.round(burstMsLocal) >= 250 ? 'Full decay' : Math.round(burstMsLocal) + ' ms' }}
                    </span>
                </div>

                <!-- Amount -->
                <div class="control-block knob-wrap">
                    <Knob midi-id="noise.amount" :value-text="`${Math.round(amountLocal * 100)}%`" v-model="amountLocal" label="Amount" :min="0" :max="1" :step="0.01" size="small"
                        :color="accent" :disabled="!enabledLocal" @knobStart="activeKnob = 'noiseAmount'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'noiseAmount'" class="custom-tooltip">
                        {{ Math.round(amountLocal * 100) }}%
                    </span>
                </div>

                <!-- Color morph -->
                <div class="control-block color-block knob-wrap">
                    <div class="swatch-wrap" :aria-label="`Noise color swatch: ${colorLabel}`" :title="colorLabel">
                        <div class="swatch" :style="{ backgroundColor: swatchHex }">
                            Color
                        </div>
                    </div>

                    <Knob midi-id="noise.color" v-model="colorLocal" aria-label="Noise color" :value-text="colorLabel" :min="0" :max="1" :step="0.01"
                        :detents="colorDetents"
                        size="small" :color="accent" :disabled="!enabledLocal" />
                </div>
            </div>

            <div v-if="hasMask" class="mask-col">
                <div class="pt-section-title">Apply to Pads</div>

                <!-- Which pads get noise. A click also turns the card on (PR 74): before, the
                     buttons worked while it was off, with nothing to hear. -->
                <div class="mask-stack">
                    <div class="pt-btn-group" role="group" aria-label="Noise mask group 1">
                        <button class="pt-btn" title="Noise on every other pad: 1, 3, 5…" @click="maskEvery2">Every 2</button>
                        <button class="pt-btn" title="Noise on beats 2 and 4 (pads 5 and 13), where a snare sits" @click="maskBackbeat">Backbeat</button>
                        <button class="pt-btn" title="Noise between the beats (pads 3, 7, 11 and 15), where an open hi-hat sits" @click="maskOffbeats">Offbeats</button>
                    </div>
                    <div class="pt-btn-group" role="group" aria-label="Noise mask group 2">
                        <button class="pt-btn" title="Noise on the pattern's loudest hits" @click="maskAccents">Accents</button>
                        <button class="pt-btn" title="Swap the pads that have noise and those that don't" @click="maskInvert">Invert</button>
                        <button class="pt-btn" title="Noise on every pad" @click="maskAll">All</button>
                    </div>
                    <!-- Noise is only heard on steps that are on: say so when a button's pads
                         are all off, over the buttons, so the card doesn't change size -->
                    <span v-if="gapNote" class="mask-note" role="status">{{ gapNote }}</span>
                </div>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';
import { accentMask } from '../../lib/noise/accents';
import { backbeatMask, offbeatMask, noiseGap } from '../../lib/noise/masks';

const props = withDefaults(
    defineProps<{
        enabled: boolean;
        amount: number;
        colorMorph: number;
        mask?: boolean[];
        // The pattern, for Accents (its loudest hits)
        steps?: boolean[];
        velocities?: number[];
        attackBurst?: boolean;
        burstMs?: number;
        color?: string;
        showToggle?: boolean;
    }>(),
    {
        enabled: false,
        amount: 0.25,
        colorMorph: 0.5,
        attackBurst: false,
        burstMs: 80,
        color: '#9C27B0',
        showToggle: true
    }
);

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void;
    (e: 'update:amount', v: number): void;
    (e: 'update:colorMorph', v: number): void;
    (e: 'update:mask', v: boolean[]): void;
    (e: 'update:attackBurst', v: boolean): void;
    (e: 'update:burstMs', v: number): void;
}>();

const enabledLocal = ref<boolean>(props.enabled);
const amountLocal = ref<number>(props.amount);
const colorLocal = ref<number>(props.colorMorph);
const burstMsLocal = ref<number>(props.burstMs ?? 80);

const activeKnob = ref<null | 'noiseAmount' | 'burstMs'>(null);

// Sync props -> local
watch(
    () => props.enabled,
    (v) => {
        enabledLocal.value = v;
    }
);
watch(
    () => props.amount,
    (v) => {
        amountLocal.value = v;
    }
);
watch(
    () => props.colorMorph,
    (v) => {
        colorLocal.value = v;
    }
);
watch(
    () => props.burstMs,
    (v) => {
        if (typeof v === 'number') burstMsLocal.value = v;
    }
);

// Sync local -> parent
watch(enabledLocal, (v) => {
    emit('update:enabled', v);
    emit('update:attackBurst', v);
});
watch(amountLocal, (v) => {
    emit('update:amount', Math.max(0, Math.min(1, v)));
});
watch(colorLocal, (v) => {
    emit('update:colorMorph', Math.max(0, Math.min(1, v)));
});
watch(burstMsLocal, (v) => {
    emit('update:burstMs', Math.max(5, Math.min(250, Math.round(v))));
});

// Ensure attackBurst is initially aligned with enabled
if (props.attackBurst !== props.enabled) {
    emit('update:attackBurst', props.enabled);
}

const accent = computed(() => props.color);

// Color stops for swatch
const stops = [
    { pos: 0.0, name: 'Brown', hex: '#6a4b2f' },
    { pos: 0.25, name: 'Pink', hex: '#f5a3bd' },
    { pos: 0.5, name: 'White', hex: '#ffffff' },
    { pos: 0.75, name: 'Blue', hex: '#7bbcff' },
    { pos: 1.0, name: 'Violet', hex: '#c7a4ff' }
] as const;

// Soft notches on the knob at each named color (the ends stop there anyway)
const colorDetents = stops.map((s) => s.pos);

const colorLabel = computed(() => {
    const t = colorLocal.value;
    let nearest: (typeof stops)[number] = stops[0];
    let best = Infinity;
    for (const s of stops) {
        const d = Math.abs(s.pos - t);
        if (d < best) {
            best = d;
            nearest = s;
        }
    }
    return nearest.name;
});

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '').trim();
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
    const to2 = (n: number) => n.toString(16).padStart(2, '0');
    return `#${to2(Math.round(r))}${to2(Math.round(g))}${to2(Math.round(b))}`;
}

function mixHex(a: string, b: string, w: number): string {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    const ir = ar + (br - ar) * w;
    const ig = ag + (bg - ag) * w;
    const ib = ab + (bb - ab) * w;
    return rgbToHex(ir, ig, ib);
}

const swatchHex = computed(() => {
    const t = Math.min(1, Math.max(0, colorLocal.value));
    let a: (typeof stops)[number] = stops[0];
    let b: (typeof stops)[number] = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
        const s0 = stops[i];
        const s1 = stops[i + 1];
        if (t >= s0.pos && t <= s1.pos) {
            a = s0;
            b = s1;
            break;
        }
    }
    const span = Math.max(1e-6, b.pos - a.pos);
    const w = (t - a.pos) / span;
    return mixHex(a.hex, b.hex, w);
});

// Per-Pad Noise mask
const hasMask = computed(() => Array.isArray(props.mask) && props.mask.length > 0);

// A pad button sets the mask and turns the card on, in one go (one undo step). Noise is only
// heard on steps that are on, so when none of the mask's pads is, a note says so for a moment.
const gapNote = ref('');
let gapTimer: ReturnType<typeof setTimeout> | undefined;
const GAP_NOTE_MS = 3500;
onBeforeUnmount(() => clearTimeout(gapTimer));

const emitMask = (out: boolean[]) => {
    emit('update:mask', out);
    enabledLocal.value = true;

    const gap = noiseGap(out, props.steps ?? []);
    clearTimeout(gapTimer);
    gapNote.value = gap === 'none' ? 'No pad has noise now'
        : gap === 'silent' ? 'Those steps are off' : '';
    if (gapNote.value) gapTimer = setTimeout(() => { gapNote.value = ''; }, GAP_NOTE_MS);
};

function updateMask(make: (i: number, len: number) => boolean): void {
    const len = props.mask?.length ?? 0;
    if (len <= 0) return;
    const out = Array.from({ length: len }, (_, i) => !!make(i, len));
    emitMask(out);
}

function maskAll(): void {
    updateMask(() => true);
}
function maskEvery2(): void {
    updateMask((i) => i % 2 === 0);
}
// Beats 2 and 4, and the steps between the beats (src/lib/noise/masks.ts). They replaced
// Every 4 and Random in PR 74. Backbeat was here before PR 69, when it seemed to do nothing
// for a pattern with no hit on its steps; now the note says why.
function maskBackbeat(): void {
    emitMask(backbeatMask(props.mask?.length ?? 0));
}
function maskOffbeats(): void {
    emitMask(offbeatMask(props.mask?.length ?? 0));
}
function maskInvert(): void {
    if (!props.mask) return;
    emitMask(props.mask.map((v) => !v));
}
// The pattern's loudest hits (src/lib/noise/accents.ts)
function maskAccents(): void {
    const len = props.mask?.length ?? 0;
    if (len <= 0) return;
    const m = accentMask(props.steps ?? [], props.velocities ?? []);
    updateMask((i) => !!m[i]);
}
</script>

<style scoped>
/* The card's width decides the layout (the container query at the end) */
.noise-group {
    container: noise / inline-size;
}

/* The knobs on the left, the mask buttons filling the rest of the card */
.noise-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 14px;
    row-gap: 10px;
    align-items: center;
    width: 100%;
    min-width: 0;
}

.controls-row {
    display: grid;
    grid-auto-flow: column;
    justify-content: start;
    align-items: center;
    gap: 12px;
    min-width: 0;
}

.control-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: auto;
}

.knob-wrap {
    position: relative;
    text-align: center;
}

.swatch-wrap {
    width: 100%;
}

.swatch {
    height: 9px;
    border-radius: 1px;
    border: none;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
    transition: background-color 120ms linear;
    font-size: 10px;
    color: black;
    line-height: 9px;
    text-align: center;
}

.custom-tooltip {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: -22px;
    padding: 2px 6px;
    font-size: 12px;
    line-height: 1.2;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
    z-index: 2;
}

.mask-col {
    min-width: 0;
}

.mask-stack {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* Over the buttons, like a knob's value bubble: it never moves the card's contents */
.mask-note {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 4px);
    transform: translateX(-50%);
    padding: 2px 8px;
    font-size: 11px;
    line-height: 1.3;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    border-radius: 4px;
    width: max-content;
    max-width: 100%;
    text-align: center;
    pointer-events: none;
    user-select: none;
    z-index: 3;
}

.pt-btn-group {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    /* 5 px apart and 0.6rem letters (8 px and 0.65rem until PR 74), so the eight letters of
       Backbeat and Offbeats keep the room Every 4 and Accents had; the card is the same size */
    gap: 5px !important;
}

.pt-btn {
    min-width: 0;
    min-height: auto;
    line-height: 1;
    font-size: 0.6rem;
    width: 100%;
    padding: 4px 2px;
    white-space: nowrap;
    z-index: 2;
}

/* A narrow card: the mask buttons under the knobs */
@container noise (max-width: 320px) {
    .noise-main {
        grid-template-columns: minmax(0, 1fr);
    }

    .controls-row {
        justify-content: space-evenly;
    }
}
</style>

<template>
    <teleport to="body">
        <div v-if="openLocal" class="pt-popover pad-popover" :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
            role="dialog" aria-modal="true" @click.stop ref="rootEl">
            <div class="pt-subheader">
                <strong class="pt-section-title">{{ title || 'Pad' }}</strong>
                <button class="pt-btn pt-btn-sm" @click="close">Close</button>
            </div>

            <div v-if="showWaveRow" class="pad-row">
                <div class="pad-label">Wave</div>
                <div class="pt-seg pt-seg-sm wave-seg" role="group" aria-label="Waveform">
                    <button class="pt-seg-btn" :class="{ 'is-active': waveLocal === 'sine' }"
                        @click="setWave('sine')">Sine</button>
                    <button class="pt-seg-btn" :class="{ 'is-active': waveLocal === 'triangle' }"
                        @click="setWave('triangle')">Triangle</button>
                    <button class="pt-seg-btn" :class="{ 'is-active': waveLocal === 'sawtooth' }"
                        @click="setWave('sawtooth')">Saw</button>
                    <button class="pt-seg-btn" :class="{ 'is-active': waveLocal === 'square' }"
                        @click="setWave('square')">Square</button>
                </div>
            </div>

            <div v-if="showNoiseRow" class="pad-row">
                <div class="pad-label">Noise</div>
                <div class="noise-toggle-wrap">
                    <button class="pt-dot" :class="{ 'is-on': noiseLocal }" :aria-pressed="noiseLocal"
                        :title="noiseLocal ? 'Noise: On' : 'Noise: Off'" @click="noiseLocal = !noiseLocal" />
                    <span class="noise-state">{{ noiseLocal ? 'On' : 'Off' }}</span>
                </div>
            </div>

            <div class="kb" role="group" aria-label="Note selector">
                <div v-for="(key, i) in NATURALS" :key="key.n" class="kb-cell" :class="{ 'has-sharp': key.hasSharp }">
                    <button class="pt-seg-btn kb-white" :class="{ 'is-active': (baseMidi % 12) === key.idx }"
                        :disabled="isNoteDisabled(key.idx, octave)"
                        @click="!isNoteDisabled(key.idx, octave) && setSemitone(key.idx)">{{ key.n }}</button>

                    <button v-if="key.hasSharp" class="pt-seg-btn kb-black"
                        :class="{ 'is-active': (baseMidi % 12) === key.sharpIdx }"
                        :disabled="isNoteDisabled(key.sharpIdx, octave)"
                        @click="!isNoteDisabled(key.sharpIdx, octave) && setSemitone(key.sharpIdx)">{{ key.n
                        }}#</button>
                </div>
            </div>

            <div class="pad-row">
                <div class="pad-label">Octave</div>
                <div class="pt-seg pt-seg-sm octave-seg" role="group" aria-label="Octave">
                    <button v-for="o in availableOctaves" :key="o" class="pt-seg-btn"
                        :class="{ 'is-active': octave === o }" @click="setOctave(o)">{{ o }}</button>
                </div>
            </div>

            <div class="pad-row fine-row">
                <div class="fine">
                    <div class="fine-label">Fine (¢)</div>
                    <div class="position-relative text-center">
                        <Knob v-model="detuneCentsLocal" :min="-100" :max="100" :step="1" size="small" color="#3F51B5"
                            @knobStart="activeKnob = 'fine'" @knobEnd="activeKnob = null" />
                        <span v-if="activeKnob === 'fine'" class="custom-tooltip">{{ detuneCentsLocal }}¢</span>
                    </div>
                </div>

                <div class="hz">
                    <label class="pt-label" for="pad-hz-input">Hz</label>
                    <input id="pad-hz-input" type="number" class="pt-input" v-model.number="hzInput" :min="minHz"
                        :max="maxHz" step="0.01" />
                </div>
            </div>
        </div>
    </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import Knob from './Knob.vue';

type AnchorRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const NATURALS = [
    { n: 'C', idx: 0, hasSharp: true, sharpIdx: 1 },
    { n: 'D', idx: 2, hasSharp: true, sharpIdx: 3 },
    { n: 'E', idx: 4, hasSharp: false, sharpIdx: -1 },
    { n: 'F', idx: 5, hasSharp: true, sharpIdx: 6 },
    { n: 'G', idx: 7, hasSharp: true, sharpIdx: 8 },
    { n: 'A', idx: 9, hasSharp: true, sharpIdx: 10 },
    { n: 'B', idx: 11, hasSharp: false, sharpIdx: -1 }
] as const;

const A4 = 440;

const props = withDefaults(defineProps<{
    open: boolean;
    hz: number;
    minHz: number;
    maxHz: number;
    anchorRect?: AnchorRect;
    title?: string;
    wave?: Wave;
    noiseEnabled?: boolean;
}>(), { title: 'Pad' });

const emit = defineEmits<{
    (e: 'update:open', v: boolean): void;
    (e: 'update:hz', v: number): void;
    (e: 'update:wave', v: Wave): void;
    (e: 'update:noiseEnabled', v: boolean): void;
    (e: 'close'): void;
}>();

// open/close 
const openLocal = ref(props.open);
watch(() => props.open, v => (openLocal.value = v));
watch(openLocal, v => emit('update:open', v));
function close(): void { openLocal.value = false; emit('close'); }

const rootEl = ref<HTMLElement | null>(null);
function onDocClick(e: MouseEvent): void {
    const t = e.target as Node | null;
    if (rootEl.value && t && !rootEl.value.contains(t)) close();
}
function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') close(); }

onMounted(() => {
    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
});
onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
});

// positioning
const POP_W = 380;
const EST_H = 300;
const OFFSET_X = 40;

const pos = computed(() => {
    const r = props.anchorRect;
    const m = 8;

    // Fallback: center in viewport, slightly to the right
    if (!r) {
        let x = (window.innerWidth - POP_W) / 2 + OFFSET_X;
        x = Math.min(window.innerWidth - POP_W - m, Math.max(m, x));

        let y = Math.max(m, (window.innerHeight - EST_H) / 2);
        return { x, y };
    }

    let x = r.left + OFFSET_X;
    x = Math.min(window.innerWidth - POP_W - m, Math.max(m, x));

    let y = r.bottom + m;
    if (y + EST_H > window.innerHeight) {
        y = Math.max(m, r.top - EST_H - m);
    }

    return { x, y };
});

function midiToFreq(m: number): number { return A4 * Math.pow(2, (m - 69) / 12); }
function freqToMidi(f: number): number { return Math.round(69 + 12 * Math.log2(f / A4)); }
function midiToName(m: number): string { const n = m % 12, o = Math.floor(m / 12) - 1; return `${NOTE_NAMES[n]}${o}`; }
const clampHz = (hz: number) => Math.max(props.minHz, Math.min(props.maxHz, hz));

const baseMidi = ref(0);
const detuneCentsLocal = ref(0);
const isFineAdjust = ref(false);
const activeKnob = ref<null | 'fine'>(null);

function syncFromHz(hz: number): void {
    const c = clampHz(hz);
    const m = freqToMidi(c);
    baseMidi.value = m;
    detuneCentsLocal.value = Math.round(1200 * Math.log2(c / midiToFreq(m)));
}
const currentHz = computed(() => clampHz(midiToFreq(baseMidi.value) * Math.pow(2, detuneCentsLocal.value / 1200)));
watch([baseMidi, detuneCentsLocal], () => {
    isFineAdjust.value = true;
    emit('update:hz', currentHz.value);
    queueMicrotask(() => { isFineAdjust.value = false; });
});
watch(() => props.hz, (hz) => {
    if (isFineAdjust.value) return;
    if (Number.isFinite(hz)) syncFromHz(hz);
}, { immediate: true });
watch(openLocal, (isOpen) => { if (isOpen) syncFromHz(props.hz); });

const displayHz = computed(() => (Math.round(currentHz.value * 100) / 100).toFixed(2));
const octave = computed({
    get: () => Math.floor(baseMidi.value / 12) - 1,
    set: (o: number) => { const s = baseMidi.value % 12; baseMidi.value = (o + 1) * 12 + s; detuneCentsLocal.value = 0; }
});
function isFreqInRange(f: number): boolean { return f >= props.minHz && f <= props.maxHz; }
function midiOf(o: number, s: number): number { return (o + 1) * 12 + s; }
function freqOf(o: number, s: number): number { return midiToFreq(midiOf(o, s)); }
function isNoteInRange(o: number, s: number): boolean { return isFreqInRange(freqOf(o, s)); }
const availableOctaves = computed(() => {
    const out: number[] = [];
    for (let o = 0; o <= 8; o++) { for (let s = 0; s < 12; s++) { if (isNoteInRange(o, s)) { out.push(o); break; } } }
    return out;
});
function setSemitone(i: number): void {
    const o = Math.floor(baseMidi.value / 12) - 1;
    baseMidi.value = (o + 1) * 12 + i;
    detuneCentsLocal.value = 0;
}
function setOctave(o: number): void {
    const s = baseMidi.value % 12;
    baseMidi.value = (o + 1) * 12 + s;
    detuneCentsLocal.value = 0;
}
function isNoteDisabled(semi: number, o: number): boolean { return !isNoteInRange(o, semi); }
function nearestNote(hz: number): string { return midiToName(freqToMidi(hz)); }

const hzInput = computed({
    get: () => +displayHz.value,
    set: (v: number) => {
        if (!Number.isFinite(v)) return;
        const c = clampHz(v);
        const m = freqToMidi(c);
        baseMidi.value = m;
        detuneCentsLocal.value = Math.round(1200 * Math.log2(c / midiToFreq(m)));
    }
});

const showWaveRow = computed(() => props.wave !== undefined);
const waveLocal = ref<Wave>(props.wave ?? 'sine');
watch(() => props.wave, (v) => { if (v) waveLocal.value = v; });
watch(waveLocal, (v) => emit('update:wave', v));
function setWave(w: Wave): void { waveLocal.value = w; }

const showNoiseRow = computed(() => typeof props.noiseEnabled === 'boolean');
const noiseLocal = ref<boolean>(props.noiseEnabled ?? false);
watch(() => props.noiseEnabled, (v) => {
    if (typeof v === 'boolean') noiseLocal.value = v;
});
watch(noiseLocal, (v) => emit('update:noiseEnabled', !!v));
</script>

<style scoped>
.pad-popover {
    position: fixed;
    width: clamp(320px, 48vw, 420px);
    padding: 12px 14px;
    max-height: none;
    overflow: visible;
}

.pad-row {
    display: grid;
    grid-template-columns: 74px 1fr;
    align-items: center;
    gap: 8px 10px;
    margin: 8px 0;
}

.pad-label {
    color: var(--pt-muted);
    font-size: var(--pt-label-size);
}

.octave-seg {
    gap: 6px;
}

.fine-row {
    grid-template-columns: 1fr 1fr;
    grid-column: 1 / -1;
}

.fine {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 6px;
}

.fine-label {
    color: var(--pt-muted);
    font-size: var(--pt-label-size);
}

.hz {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 6px;
}

.pt-input {
    width: 100%;
    border: 1px solid transparent;
    border-radius: var(--pt-radius-sm);
    padding: 8px 10px;
    color: var(--pt-text);
    background: linear-gradient(145deg, var(--pt-surface-1), var(--pt-surface-2)) padding-box, linear-gradient(90deg, hsl(var(--pt-accent) 84% 64% / .95), hsl(calc(var(--pt-accent)+10) 84% 64% / .95)) border-box;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / .03), 0 2px 10px rgb(0 0 0 / .25);
    line-height: 1.2;
}

.pt-btn-sm {
    padding: 4px 10px;
    min-height: 28px;
    font-size: .85rem;
}

.wave-seg {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.noise-toggle-wrap {
    display: inline-flex;
    align-items: center;
    gap: 10px;
}

.noise-state {
    font-size: 0.9rem;
    color: var(--pt-text);
    opacity: 0.85;
}

.pt-dot {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 45%);
    background: var(--pt-surface-2);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05);
    cursor: pointer;
    transition: transform .12s ease, filter .2s ease, box-shadow .25s ease;
}

.pt-dot:hover {
    transform: scale(1.06);
}

.pt-dot.is-on {
    background: hsl(var(--pt-accent) 80% 60%);
    box-shadow:
        0 0 0 3px hsl(var(--pt-accent) 90% 60% / .18),
        0 0 12px var(--pt-btn-glow);
}

.kb {
    --gap: 2px;
    --whiteH: 108px;
    --blackH: 66px;
    --radius: 8px;

    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--gap);
    margin: 8px 0 16px;
    padding: 8px 6px 10px;
    border-radius: var(--pt-radius-md);
    background: linear-gradient(180deg, transparent, rgb(0 0 0 / .06));
    position: relative;
    --white1: color-mix(in oklab, white 94%, var(--pt-panel) 6%);
    --white2: color-mix(in oklab, white 82%, var(--pt-panel) 18%);
    --black1: color-mix(in oklab, #0b0f1a 90%, var(--pt-panel) 10%);
    --black2: color-mix(in oklab, #070a12 95%, var(--pt-panel) 5%);
}

@supports not (color: color-mix(in oklab, white, black)) {
    .kb {
        --white1: #eceff4;
        --white2: #cfd6e1;
        --black1: #0c111d;
        --black2: #080b13;
    }
}

.kb-cell {
    position: relative;
    height: var(--whiteH);
}

.kb :where(.pt-seg-btn) {
    all: unset;
    line-height: 1;
    box-sizing: border-box;
    cursor: pointer;
}

.kb-white {
    width: 100%;
    height: 100%;
    border-radius: 0 0 var(--radius) var(--radius);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / .06),
        0 3px 0 rgb(0 0 0 / .55),
        0 8px 18px rgb(0 0 0 / .25);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 6px;
    font-weight: 700;
    color: #000;
    cursor: pointer;
    transition: transform .03s ease, box-shadow .12s ease, filter .12s ease;
    background:
        linear-gradient(180deg, var(--white1), var(--white2)) padding-box,
        linear-gradient(145deg, rgb(0 0 0 / .22), rgb(255 255 255 / .06)) border-box;
    border: 1px solid rgb(0 0 0 / .55);
}

.kb-white:is(:hover, :focus-visible) {
    filter: brightness(1.04);
    outline: none;
}

.kb-white:active {
    transform: translateY(1px);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / .04),
        0 2px 0 rgb(0 0 0 / .55),
        0 6px 14px rgb(0 0 0 / .25);
}

.kb-white.is-active {
    box-shadow:
        inset 0 0 0 2px hsl(var(--pt-accent) 90% 60% / .9),
        inset 0 1px 0 rgb(255 255 255 / .05),
        0 3px 0 rgb(0 0 0 / .55),
        0 10px 20px rgb(0 0 0 / .3);
}

.kb-white:disabled {
    opacity: .35;
    cursor: not-allowed;
}

.kb-black {
    --whiteW: 100%;
    width: calc(0.6 * var(--whiteW));
    height: var(--blackH);
    position: absolute;
    top: 0;
    right: calc(-0.3 * var(--whiteW) - var(--gap) / 2);
    border-radius: 0 0 6px 6px;
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / .05),
        0 2px 0 rgb(0 0 0 / .8),
        0 8px 14px rgb(0 0 0 / .35);
    z-index: 2;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 4px;
    font-size: .75rem;
    font-weight: 700;
    color: #dfe7ff;
    cursor: pointer;
    transition: transform .03s ease, box-shadow .12s ease, filter .12s ease;
    background:
        linear-gradient(180deg, var(--black1), var(--black2)) padding-box,
        linear-gradient(145deg, #1a2334, #0b0f1a) border-box;
    border: 1px solid rgb(0 0 0 / .7);
}

.kb-black:is(:hover, :focus-visible) {
    filter: brightness(1.08);
    outline: none;
}

.kb-black:active {
    transform: translateY(1px);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / .04),
        0 1px 0 rgb(0 0 0 / .8),
        0 6px 12px rgb(0 0 0 / .35);
}

.kb-black.is-active {
    box-shadow:
        0 0 0 2px hsl(var(--pt-accent) 90% 60% / .9),
        inset 0 1px 0 rgb(255 255 255 / .05),
        0 2px 0 rgb(0 0 0 / .8),
        0 10px 18px rgb(0 0 0 / .4);
}

.kb-black:disabled {
    opacity: .45;
    cursor: not-allowed;
}

.kb-cell.has-sharp {
    padding-top: 0;
}

.pad-popover {
    position: fixed;
    width: clamp(320px, 48vw, 420px);
    padding: 12px 14px;
    max-height: none;
    overflow: visible;
}

/* Mobile: center + prevent overflow */
@media (max-width: 720px) {
    .pad-popover {
        left: 50% !important;
        transform: translateX(-50%);
        width: min(100vw - 24px, 420px);
        max-height: calc(100vh - 32px);
        overflow-y: auto;
    }
}
</style>

<template>
    <teleport to="body">
        <div v-if="openLocal" class="pt-popover pad-popover" :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
            role="dialog" aria-modal="true" @click.stop ref="rootEl">
            <!-- Header -->
            <div class="pt-subheader">
                <strong class="pt-section-title">{{ title || 'Pad' }}</strong>
                <button class="pt-btn pt-btn-sm" @click="close">Close</button>
            </div>

            <!-- Keyboard-style selector (no readout above to avoid overlap) -->
            <div class="kb" role="group" aria-label="Note selector">
                <div v-for="(key, i) in NATURALS" :key="key.n" class="kb-cell" :class="{ 'has-sharp': key.hasSharp }">
                    <!-- white key -->
                    <button class="pt-seg-btn kb-white" :class="{ 'is-active': (baseMidi % 12) === key.idx }"
                        :disabled="isNoteDisabled(key.idx, octave)"
                        @click="!isNoteDisabled(key.idx, octave) && setSemitone(key.idx)">{{ key.n }}</button>

                    <!-- black key (floats above, space is reserved by padding) -->
                    <button v-if="key.hasSharp" class="pt-seg-btn kb-black"
                        :class="{ 'is-active': (baseMidi % 12) === key.sharpIdx }"
                        :disabled="isNoteDisabled(key.sharpIdx, octave)"
                        @click="!isNoteDisabled(key.sharpIdx, octave) && setSemitone(key.sharpIdx)">{{ key.n
                        }}#</button>
                </div>
            </div>

            <!-- Octave -->
            <div class="pad-row">
                <div class="pad-label">Octave</div>
                <div class="pt-seg pt-seg-sm octave-seg" role="group" aria-label="Octave">
                    <button v-for="o in availableOctaves" :key="o" class="pt-seg-btn"
                        :class="{ 'is-active': octave === o }" @click="setOctave(o)">{{ o }}</button>
                </div>
            </div>

            <!-- Fine + Hz -->
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
}>(), { title: 'Pad' });

const emit = defineEmits<{
    (e: 'update:open', v: boolean): void;
    (e: 'update:hz', v: number): void;
    (e: 'close'): void;
}>();

/* open/close */
const openLocal = ref(props.open);
watch(() => props.open, v => (openLocal.value = v));
watch(openLocal, v => emit('update:open', v));
function close() { openLocal.value = false; emit('close'); }

const rootEl = ref<HTMLElement | null>(null);
function onDocClick(e: MouseEvent) {
    const t = e.target as Node | null;
    if (rootEl.value && t && !rootEl.value.contains(t)) close();
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }

onMounted(() => {
    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
});
onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
});

/* positioning (no inner scrollbars) */
const POP_W = 380;
const EST_H = 300;
const pos = computed(() => {
    const r = props.anchorRect;
    const m = 8;
    if (!r) {
        const x = Math.max(m, (window.innerWidth - POP_W) / 2);
        const y = Math.max(m, (window.innerHeight - EST_H) / 2);
        return { x, y };
    }
    let x = Math.min(window.innerWidth - POP_W - m, Math.max(m, r.left));
    let y = r.bottom + m;
    if (y + EST_H > window.innerHeight) y = Math.max(m, r.top - EST_H - m);
    return { x, y };
});

/* pitch helpers */
function midiToFreq(m: number) { return A4 * Math.pow(2, (m - 69) / 12); }
function freqToMidi(f: number) { return Math.round(69 + 12 * Math.log2(f / A4)); }
function midiToName(m: number) { const n = m % 12, o = Math.floor(m / 12) - 1; return `${NOTE_NAMES[n]}${o}`; }
const clampHz = (hz: number) => Math.max(props.minHz, Math.min(props.maxHz, hz));

/* internal base+fine */
// const baseMidi = ref(freqToMidi(clampHz(props.hz)));
// const detuneCentsLocal = ref(Math.round(1200 * Math.log2(clampHz(props.hz) / midiToFreq(baseMidi.value))));
// const isFineAdjust = ref(false);
// const activeKnob = ref<null | 'fine'>(null);

// watch(() => props.hz, hz => {
//     if (isFineAdjust.value || !openLocal.value) return;
//     const c = clampHz(hz);
//     const m = freqToMidi(c);
//     baseMidi.value = m;
//     detuneCentsLocal.value = Math.round(1200 * Math.log2(c / midiToFreq(m)));
// });




const baseMidi = ref(0);
const detuneCentsLocal = ref(0);
const isFineAdjust = ref(false);
const activeKnob = ref<null | 'fine'>(null);

function syncFromHz(hz: number) {
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
// Always initialize from the incoming prop and keep it synced,
// but don't fight the user while they're adjusting knobs in the popover.
watch(
    () => props.hz,
    (hz) => {
        if (isFineAdjust.value) return;
        if (Number.isFinite(hz)) syncFromHz(hz);
    },
    { immediate: true }
);

// Also re-sync any time the popover opens (covers any race on open)
watch(openLocal, (isOpen) => {
    if (isOpen) syncFromHz(props.hz);
});

/* UI computeds/actions */
const displayHz = computed(() => (Math.round(currentHz.value * 100) / 100).toFixed(2));

const octave = computed({
    get: () => Math.floor(baseMidi.value / 12) - 1,
    set: (o: number) => { const s = baseMidi.value % 12; baseMidi.value = (o + 1) * 12 + s; detuneCentsLocal.value = 0; }
});

function isFreqInRange(f: number) { return f >= props.minHz && f <= props.maxHz; }
function midiOf(o: number, s: number) { return (o + 1) * 12 + s; }
function freqOf(o: number, s: number) { return midiToFreq(midiOf(o, s)); }
function isNoteInRange(o: number, s: number) { return isFreqInRange(freqOf(o, s)); }

const availableOctaves = computed(() => {
    const out: number[] = [];
    for (let o = 0; o <= 8; o++) { for (let s = 0; s < 12; s++) { if (isNoteInRange(o, s)) { out.push(o); break; } } }
    return out;
});

function setSemitone(i: number) {
    const o = Math.floor(baseMidi.value / 12) - 1;
    baseMidi.value = (o + 1) * 12 + i;
    detuneCentsLocal.value = 0;
}
function setOctave(o: number) {
    const s = baseMidi.value % 12;
    baseMidi.value = (o + 1) * 12 + s;
    detuneCentsLocal.value = 0;
}
function isNoteDisabled(semi: number, o: number) { return !isNoteInRange(o, semi); }
function nearestNote(hz: number) { return midiToName(freqToMidi(hz)); }

/* Hz input */
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
</script>

<style scoped>
.pad-popover {
    position: fixed;
    width: clamp(320px, 48vw, 420px);
    padding: 12px 14px;
    max-height: none;
    overflow: visible;
    /* no inner scrollbar */
}

/* Keyboard grid */
.kb {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 10px;
    margin: 6px 0 16px;
    padding-top: 28px;
    /* reserves space so black keys don't hit the header */
}

.kb-cell {
    position: relative;
}

.kb-white {
    width: 100%;
    min-height: 34px;
    font-weight: 600;
}

/* black keys sit above the white row, centered between columns */
.kb-black {
    position: absolute;
    top: -22px;
    /* floats above the white key */
    right: -14px;
    /* visually centers between this and the next column */
    min-height: 26px;
    padding: 4px 10px;
    font-size: 0.8rem;
    opacity: 0.95;
    z-index: 1;
}

.kb-cell.has-sharp {
    padding-top: 12px;
}

/* Octave + fine rows */
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

/* fine + hz */
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
    background:
        linear-gradient(145deg, var(--pt-surface-1), var(--pt-surface-2)) padding-box,
        linear-gradient(90deg, hsl(var(--pt-accent) 84% 64% / .95), hsl(calc(var(--pt-accent)+10) 84% 64% / .95)) border-box;
    box-shadow:
        inset 0 0 0 1px rgb(255 255 255 / 0.03),
        0 2px 10px rgb(0 0 0 / 0.25);
    line-height: 1.2;
}

.pt-btn-sm {
    padding: 4px 10px;
    min-height: 28px;
    font-size: .85rem;
}
</style>

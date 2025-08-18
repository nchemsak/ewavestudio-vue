<!-- components/PadSettingsPopover.vue -->
<template>
    <teleport to="body">
        <div v-if="openLocal" class="pad-settings-popover card p-2 controls"
            :style="{ left: `${pos.x}px`, top: `${pos.y}px` }" role="dialog" aria-modal="true" @click.stop>
            <div class="d-flex justify-content-between align-items-center mb-2">
                <strong>{{ title || 'Pad' }}</strong>
                <button class="btn btn-sm btn-outline-secondary" @click="close">Close</button>
            </div>

            <!-- Live readout -->
            <div class="mb-2 small">
                {{ nearestNote(currentHz) }} · {{ displayHz }} Hz
            </div>

            <!-- 12 semitones -->
            <div class="d-flex flex-wrap gap-1 mb-2">
                <button v-for="(n, i) in NOTE_NAMES" :key="n" class="btn btn-xs" :disabled="isNoteDisabled(i, octave)"
                    :class="[(baseMidi % 12) === i ? 'btn-primary' : 'btn-outline-primary', isNoteDisabled(i, octave) ? 'disabled' : '']"
                    @click="!isNoteDisabled(i, octave) && setSemitone(i)">
                    {{ n }}
                </button>
            </div>

            <!-- Octaves -->
            <div class="mb-2">
                <div class="btn-group btn-group-sm">
                    <button v-for="o in availableOctaves" :key="o" class="btn"
                        :class="octave === o ? 'btn-primary' : 'btn-outline-primary'" @click="setOctave(o)">{{ o
                        }}</button>
                </div>
            </div>

            <!-- Fine detune -->
            <div class="position-relative mb-2 text-center">
                <Knob v-model="detuneCentsLocal" label="Fine (¢)" :min="-100" :max="100" :step="1" size="small"
                    color="#3F51B5" @knobStart="activeKnob = 'fine'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'fine'" class="custom-tooltip">{{ detuneCentsLocal }}¢</span>
            </div>

            <!-- Direct Hz entry -->
            <div class="input-group input-group-sm">
                <span class="input-group-text">Hz</span>
                <input type="number" class="form-control" v-model.number="hzInput" :min="minHz" :max="maxHz"
                    step="0.01" />
            </div>
        </div>
    </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import Knob from './Knob.vue'

type AnchorRect = {
    left: number; top: number; right: number; bottom: number; width: number; height: number
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const A4 = 440

const props = withDefaults(defineProps<{
    open: boolean
    hz: number
    minHz: number
    maxHz: number
    anchorRect?: AnchorRect
    title?: string
}>(), {
    title: 'Pad',
})

const emit = defineEmits<{
    (e: 'update:open', v: boolean): void
    (e: 'update:hz', v: number): void
    (e: 'close'): void
}>()

/* ----- Local open + outside/ESC handling ----- */
const openLocal = ref(props.open)
watch(() => props.open, v => (openLocal.value = v))
watch(openLocal, v => emit('update:open', v))

function close() {
    openLocal.value = false
    emit('close')
}

function onDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    // close if click is outside the popover
    const el = document.querySelector('.pad-settings-popover')
    if (!el || (target && !el.contains(target))) close()
}
function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close()
}

onMounted(() => {
    document.addEventListener('mousedown', onDocClick, true)
    document.addEventListener('keydown', onKey, true)
})
onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocClick, true)
    document.removeEventListener('keydown', onKey, true)
})

/* ----- Positioning (like your old logic) ----- */
const POP_W = 280
const POP_H = 260
const pos = computed(() => {
    const r = props.anchorRect
    if (!r) {
        // center fallback
        const x = Math.max(8, (window.innerWidth - POP_W) / 2)
        const y = Math.max(8, (window.innerHeight - POP_H) / 2)
        return { x, y }
    }
    const margin = 8
    let x = r.right - POP_W
    let y = r.bottom + margin
    if (y + POP_H > window.innerHeight) y = r.top - POP_H - margin
    x = Math.max(8, Math.min(window.innerWidth - POP_W - 8, x))
    return { x, y }
})

/* ----- Pitch helpers ----- */
function midiToFreq(m: number) { return A4 * Math.pow(2, (m - 69) / 12) }
function freqToMidi(f: number) { return Math.round(69 + 12 * Math.log2(f / A4)) }
function midiToName(m: number) { const n = m % 12, o = Math.floor(m / 12) - 1; return `${NOTE_NAMES[n]}${o}` }

const clampHz = (hz: number) => Math.max(props.minHz, Math.min(props.maxHz, hz))

/* ----- Internal base + fine model ----- */
const baseMidi = ref(freqToMidi(clampHz(props.hz)))
const detuneCentsLocal = ref(Math.round(1200 * Math.log2(clampHz(props.hz) / midiToFreq(baseMidi.value))))
const isFineAdjust = ref(false)
const activeKnob = ref<null | 'fine'>(null)

watch(() => props.hz, (hz) => {
    if (isFineAdjust.value || !openLocal.value) return
    const clamped = clampHz(hz)
    const m = freqToMidi(clamped)
    baseMidi.value = m
    detuneCentsLocal.value = Math.round(1200 * Math.log2(clamped / midiToFreq(m)))
})

const currentHz = computed(() => {
    const hz = midiToFreq(baseMidi.value) * Math.pow(2, detuneCentsLocal.value / 1200)
    return clampHz(hz)
})
watch([baseMidi, detuneCentsLocal], () => {
    isFineAdjust.value = true
    emit('update:hz', currentHz.value)
    queueMicrotask(() => { isFineAdjust.value = false })
})

/* ----- UI computeds/actions ----- */
const displayHz = computed(() => (Math.round(currentHz.value * 100) / 100).toFixed(2))

const octave = computed({
    get: () => Math.floor(baseMidi.value / 12) - 1,
    set: (o: number) => {
        const semi = baseMidi.value % 12
        baseMidi.value = (o + 1) * 12 + semi
        detuneCentsLocal.value = 0
    }
})

function isFreqInRange(f: number) { return f >= props.minHz && f <= props.maxHz }
function midiOf(o: number, s: number) { return (o + 1) * 12 + s }
function freqOf(o: number, s: number) { return midiToFreq(midiOf(o, s)) }
function isNoteInRange(o: number, s: number) { return isFreqInRange(freqOf(o, s)) }

const availableOctaves = computed(() => {
    const out: number[] = []
    for (let o = 0; o <= 8; o++) {
        for (let s = 0; s < 12; s++) {
            if (isNoteInRange(o, s)) { out.push(o); break }
        }
    }
    return out
})

function setSemitone(i: number) {
    const o = Math.floor(baseMidi.value / 12) - 1
    baseMidi.value = (o + 1) * 12 + i
    detuneCentsLocal.value = 0
}
function setOctave(o: number) {
    const semi = baseMidi.value % 12
    baseMidi.value = (o + 1) * 12 + semi
    detuneCentsLocal.value = 0
}
function isNoteDisabled(semi: number, o: number) {
    return !isNoteInRange(o, semi)
}
function nearestNote(hz: number) { return midiToName(freqToMidi(hz)) }

/* Two-way input for Hz field */
const hzInput = computed({
    get: () => +displayHz.value,
    set: (v: number) => {
        if (!Number.isFinite(v)) return
        const clamped = clampHz(v)
        const m = freqToMidi(clamped)
        baseMidi.value = m
        detuneCentsLocal.value = Math.round(1200 * Math.log2(clamped / midiToFreq(m)))
    }
})
</script>

<style scoped>
/* .pad-settings-popover {
    position: absolute;
    width: 280px;
    z-index: 1000;
}

.btn.btn-xs {
    padding: 0.15rem 0.4rem;
    font-size: 0.75rem;
    line-height: 1;
} */
</style>

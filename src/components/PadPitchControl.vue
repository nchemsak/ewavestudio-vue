<!-- PadPitchControl.vue -->
<template>
    <div class="pad-pitch d-flex align-items-center gap-2">
        <!-- Note chip -->
        <button class="note-chip" @click="open = !open">
            {{ noteLabel }}
        </button>

        <!-- Popover -->
        <div v-if="open" class="note-popover card p-2">
            <div class="note-row d-flex flex-wrap gap-1 mb-2">
                <button v-for="(n, i) in NOTE_NAMES" :key="n" class="note-dot"
                    :class="{ active: (baseMidi % 12) === i }" @click="setSemitone(i)">{{ n }}</button>
            </div>
            <div class="octave-row d-flex gap-1">
                <button v-for="o in OCTAVES" :key="o" class="oct-btn" :class="{ active: octave === o }"
                    @click="setOctave(o)">{{ o }}</button>
            </div>
        </div>

        <!-- Note Lock toggle -->
        <label class="form-check d-flex align-items-center gap-1 ms-2">
            <input type="checkbox" class="form-check-input" v-model="noteLocked" />
            <span>Note Lock</span>
        </label>

        <!-- Existing slider: reused as Fine when locked -->
        <div class="flex-grow-1 ms-3" v-if="noteLocked">
            <input type="range" min="-100" max="100" step="1" v-model.number="detuneCents" />
        </div>
        <div class="flex-grow-1 ms-3" v-else>
            <input type="range" min="100" max="1000" step="1" :value="modelValue"
                @input="onFreeHz($event.target.valueAsNumber)" />
        </div>

        <!-- Live readout -->
        <div class="readout">
            {{ noteLabel }} · {{ modelValue.toFixed(2) }} Hz
        </div>
    </div>
</template>

<script setup>
import { computed, reactive, watch, toRefs } from 'vue';

const props = defineProps({
    modelValue: { type: Number, required: true }, // Hz
});
const emit = defineEmits(['update:frequency', 'update:modelValue']);

// --- Music helpers
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4 = 440;

function midiToFreq(m) {
    return A4 * Math.pow(2, (m - 69) / 12);
}
function freqToMidi(f) {
    return Math.round(69 + 12 * Math.log2(f / A4));
}
function midiToName(m) {
    const n = m % 12;
    const o = Math.floor(m / 12) - 1;
    return `${NOTE_NAMES[n]}${o}`;
}

// --- Local state
const state = reactive({
    open: false,
    noteLocked: true,          // default: use musical mode
    baseMidi: freqToMidi(props.modelValue),
    detuneCents: 0,            // -100..+100 around base note
    NOTE_NAMES,
    OCTAVES: [1, 2, 3, 4, 5, 6],    // adjust as desired
});

const { open, noteLocked, baseMidi, detuneCents, OCTAVES } = toRefs(state);

// Derived octave
const octave = computed({
    get: () => Math.floor(baseMidi.value / 12) - 1,
    set: (o) => {
        const semitone = baseMidi.value % 12;
        baseMidi.value = (o + 1) * 12 + semitone;
    },
});

const noteLabel = computed(() => {
    if (!noteLocked.value) {
        // Show nearest note for free Hz mode
        return `${midiToName(freqToMidi(props.modelValue))}`;
    }
    const label = midiToName(baseMidi.value);
    const cents = detuneCents.value;
    const sign = cents === 0 ? '' : (cents > 0 ? ` (+${cents}¢)` : ` (${cents}¢)`);
    return `${label}${sign}`;
});

// When locked: frequency follows baseMidi + detune
const lockedFreq = computed(() => {
    const base = midiToFreq(baseMidi.value);
    return base * Math.pow(2, detuneCents.value / 1200);
});

// Keep parent in sync
watch([noteLocked, baseMidi, detuneCents], () => {
    if (noteLocked.value) {
        emit('update:modelValue', lockedFreq.value);
        emit('update:frequency', lockedFreq.value);
    }
});

// Also react if parent changes Hz (e.g., programmatic load or free mode)
watch(() => props.modelValue, (hz) => {
    if (!noteLocked.value) return; // ignore in free mode
    // Re-anchor base note to nearest MIDI and set cents offset
    const m = freqToMidi(hz);
    const base = midiToFreq(m);
    const cents = Math.round(1200 * Math.log2(hz / base));
    baseMidi.value = m;
    detuneCents.value = Math.max(-100, Math.min(100, cents));
});

// UI handlers
function setSemitone(semi) {
    const o = Math.floor(baseMidi.value / 12) - 1;
    baseMidi.value = (o + 1) * 12 + semi;
}
function setOctave(o) {
    const semi = baseMidi.value % 12;
    baseMidi.value = (o + 1) * 12 + semi;
}
function onFreeHz(hz) {
    emit('update:modelValue', hz);
    emit('update:frequency', hz);
}
</script>

<style scoped>
.pad-pitch {
    position: relative;
}

.note-chip {
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid #888;
    background: #111;
    color: #eee;
    font-weight: 600;
    line-height: 1;
}

.note-popover {
    position: absolute;
    z-index: 10;
    top: 120%;
    left: 0;
    min-width: 220px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, .35);
}

.note-dot {
    padding: 4px 6px;
    border-radius: 8px;
    border: 1px solid #444;
    background: #222;
    color: #ddd;
    font-size: 12px;
}

.note-dot.active {
    border-color: #23CDE8;
    color: #23CDE8;
}

.oct-btn {
    padding: 2px 8px;
    border-radius: 8px;
    border: 1px solid #444;
    background: #222;
    color: #ddd;
    font-size: 12px;
}

.oct-btn.active {
    border-color: #23CDE8;
    color: #23CDE8;
}

.readout {
    min-width: 160px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    opacity: .9;
}
</style>

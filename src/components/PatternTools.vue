<template>
    <div class="pattern-tools p-2">
        <h2 class="mb-2">Pattern Tools</h2>

        <!-- Step Fills -->
        <div class="mb-3">
            <div class="group-title">Step Fills</div>
            <div class="btn-group btn-group-sm" role="group" aria-label="Step fills">
                <button class="btn btn-outline-success" @click="fillAll">All</button>
                <button class="btn btn-outline-success" @click="fillEvery2">Every 2</button>
                <button class="btn btn-outline-success" @click="fillEvery4">Every 4</button>
                <button class="btn btn-outline-success" @click="fillRandom()">Random</button>
                <button class="btn btn-outline-secondary" @click="invert">Invert</button>
                <button class="btn btn-outline-danger" @click="clear">Clear</button>
            </div>
        </div>

        <!-- Velocity Shapes -->
        <div class="mb-3" v-if="props.velocities">
            <!-- <div class="small mb-1">Velocity Shapes</div> -->
            <div class="group-title">Velocity Shapes</div>

            <div class="btn-group btn-group-sm" role="group" aria-label="Velocity shapes">
                <button class="btn btn-outline-primary" @click="shapePeaks">Peaks</button>
                <button class="btn btn-outline-primary" @click="shapeStairs4">Stairs 4</button>
                <button class="btn btn-outline-primary" @click="shapeRamp">Ramp</button>
                <button class="btn btn-outline-primary" @click="shapeBackbeat">Backbeat</button>
                <button class="btn btn-outline-primary" @click="shapeRandom">Random</button>
                <button class="btn btn-outline-secondary" @click="shapeReset">Reset</button>
            </div>

        </div>

        <!-- Random Pitch (applies to ALL pads; quantized to notes) -->
        <div class="pitch-tools border-top pt-3 mt-3" v-if="props.frequencies">
            <div class="d-flex flex-wrap gap-2 align-items-center">
                <label class="form-label mb-0 small">Key</label>
                <select v-model="keyRoot" class="form-select form-select-sm w-auto">
                    <option v-for="r in ROOTS" :key="r" :value="r">{{ r }}</option>
                </select>

                <label class="form-label mb-0 small ms-2">Scale</label>
                <select v-model="keyScale" class="form-select form-select-sm w-auto">
                    <option v-for="(v, name) in SCALES" :key="name" :value="name">
                        {{ SCALE_LABELS[name] ?? name }}
                    </option>
                </select>

                <!-- Register presets -->
                <div class="btn-group btn-group-sm ms-1" role="group" aria-label="Register range">
                    <button v-for="(def, key) in PRESETS" :key="key" type="button" class="btn"
                        :class="rangePreset === key ? 'btn-primary' : 'btn-outline-primary'" @click="rangePreset = key">
                        {{ def.label }}
                    </button>
                </div>

                <!-- Live hint of what the pool actually is -->
                <span class="small ms-2">{{ poolSummary }}</span>

                <button class="btn btn-sm btn-outline-primary ms-2" @click="randomizePitches">
                    Random Pitch
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
    steps: boolean[];
    velocities?: number[];       // 0..1
    frequencies?: number[];      // Hz per pad (required for Random Pitch)
    minFreq?: number;            // defaults to 100
    maxFreq?: number;            // defaults to 2000
}>();

const emit = defineEmits<{
    (e: 'update:steps', v: boolean[]): void;
    (e: 'update:velocities', v: number[]): void;
    (e: 'update:frequencies', v: number[]): void;
}>();

/* ---------- Utils ---------- */
function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
}
function clamp01(x: number): number {
    return clamp(x, 0, 1);
}

/* ---------- Step Fills ---------- */
function clear(): void {
    // Deactivate all pads, keep their current velocity values as-is
    emit('update:steps', props.steps.map(() => false));
    // (Do NOT emit update:velocities here)
}
function invert(): void {
    emit('update:steps', props.steps.map(s => !s));
}

function fillAll(): void {
    emit('update:steps', props.steps.map(() => true));
}

function fillEvery2(): void {
    // 1-indexed: 1,3,5,... => indices 0,2,4,...
    emit('update:steps', props.steps.map((_, i) => i % 2 === 0));
}

function fillEvery4(): void {
    // 1,5,9,13 => indices 0,4,8,12
    emit('update:steps', props.steps.map((_, i) => i % 4 === 0));
}

function fillRandom(arg?: unknown): void {
    const p = (typeof arg === 'number') ? clamp01(arg) : 0.5; // default 50%
    const out = props.steps.map(() => Math.random() < p);
    if (!out.some(Boolean)) {
        out[Math.floor(Math.random() * out.length)] = true; // ensure at least one
    }
    emit('update:steps', out);
}


/* ---------- Velocity Shapes ---------- */
function applyVelocityPattern(fn: (i: number, len: number) => number): void {
    if (!props.velocities) return;
    const len = props.velocities.length; // apply to every pad
    const out = Array.from({ length: len }, (_, i) => clamp01(fn(i, len)));
    emit('update:velocities', out);
}

function shapePeaks(): void {
    // 1.00, 0.75, 0.50, 0.75 (repeat)
    const cycle = [1.0, 0.75, 0.5, 0.75];
    applyVelocityPattern(i => cycle[i % 4]);
}

function shapeStairs4(): void {
    // 1.00, 0.75, 0.50, 0.25 (repeat)
    const cycle = [1.0, 0.75, 0.5, 0.25];
    applyVelocityPattern(i => cycle[i % 4]);
}

function shapeRamp(): void {
    // Ends loud, dip in the middle (valley ramp)
    const minV = 0.2;
    applyVelocityPattern((i, len) => {
        if (len <= 1) return 1;
        const t = i / (len - 1);             // 0..1
        const dist = Math.abs(t - 0.5) * 2;  // 1 at ends -> 0 center
        return minV + (1 - minV) * dist;
    });
}

function shapeBackbeat(): void {
    // Accents on 2 & 4 (1-indexed quarter-notes)
    applyVelocityPattern(i => ((i % 4 === 1) || (i % 4 === 3)) ? 1.0 : 0.7);
}

function shapeRandom(): void {
    // Random musical range for active steps
    const minV = 0.5, maxV = 1.0;
    applyVelocityPattern(() => minV + Math.random() * (maxV - minV));
}

function shapeReset(): void {
    if (!props.velocities) return;
    emit('update:velocities', props.velocities.map(() => 1));
}

/* ---------- Random Pitch (unchanged) ---------- */
const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const SCALES: Record<string, number[]> = {
    major: [0, 2, 4, 5, 7, 9, 11],
    naturalMinor: [0, 2, 3, 5, 7, 8, 10],
    pentMajor: [0, 2, 4, 7, 9],
    pentMinor: [0, 3, 5, 7, 10],
    wholeTone: [0, 2, 4, 6, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    egyptian: [0, 2, 5, 7, 10],
};
const SCALE_LABELS: Record<string, string> = {
    major: 'Major',
    naturalMinor: 'Minor',
    pentMajor: 'Pentatonic Major',
    pentMinor: 'Pentatonic Minor',
    wholeTone: 'Whole-tone',
    dorian: 'Dorian',
    lydian: 'Lydian',
    egyptian: 'Egyptian Pentatonic',
};

const keyRoot = ref<typeof ROOTS[number]>('C');
const keyScale = ref<keyof typeof SCALES>('major');

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiToName = (m: number) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

type PresetKey = 'low' | 'mid' | 'high' | 'wide';
const PRESETS: Record<PresetKey, { minOct: number; maxOct: number; label: string }> = {
    low: { minOct: 2, maxOct: 3, label: 'Low' },
    mid: { minOct: 3, maxOct: 4, label: 'Mid' },
    high: { minOct: 4, maxOct: 5, label: 'High' },
    wide: { minOct: 2, maxOct: 6, label: 'Wide' },
};
const rangePreset = ref<PresetKey>('wide');
const minOctave = ref<number>(3);
const maxOctave = ref<number>(6);

watch(rangePreset, (k) => {
    const p = PRESETS[k];
    minOctave.value = p.minOct;
    maxOctave.value = p.maxOct;
}, { immediate: true });

const NOTE_TO_SEMITONE: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};
const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const freqToMidi = (f: number) => Math.round(69 + 12 * Math.log2(f / 440));

function buildCandidateMidiPool(root: string, scaleName: string, minOct: number, maxOct: number, fMin: number, fMax: number): number[] {
    const steps = SCALES[scaleName] ?? SCALES.major;
    const rootSemi = NOTE_TO_SEMITONE[root] ?? 0;
    const pool: number[] = [];
    const lo = Math.min(minOct, maxOct);
    const hi = Math.max(minOct, maxOct);

    for (let oct = lo; oct <= hi; oct++) {
        const base = 12 * (oct + 1); // C4=60 when oct=4
        for (const step of steps) {
            const semi = (rootSemi + step) % 12;
            const midi = base + semi;
            const f = midiToFreq(midi);
            if (f >= (props.minFreq ?? 100) && f <= (props.maxFreq ?? 2000)) pool.push(midi);
        }
    }
    if (!pool.length) {
        const mid = Math.round((freqToMidi(props.minFreq ?? 100) + freqToMidi(props.maxFreq ?? 2000)) / 2);
        return [mid];
    }
    return pool;
}

const poolSummary = computed(() => {
    const fMin = props.minFreq ?? 100;
    const fMax = props.maxFreq ?? 2000;
    const pool = buildCandidateMidiPool(keyRoot.value, keyScale.value, minOctave.value, maxOctave.value, fMin, fMax);
    if (!pool.length) return '';
    return `${midiToName(pool[0])}–${midiToName(pool[pool.length - 1])} • ${pool.length} notes`;
});

function randomizePitches(): void {
    if (!props.frequencies) return;
    const pool = buildCandidateMidiPool(
        keyRoot.value, keyScale.value, minOctave.value, maxOctave.value,
        props.minFreq ?? 100, props.maxFreq ?? 2000
    );
    const out = props.frequencies.map(() => midiToFreq(pool[Math.floor(Math.random() * pool.length)]));
    emit('update:frequencies', out);
}
</script>

<style scoped>
.pattern-tools {
    max-width: 520px;
}

.pitch-tools :deep(select) {
    min-width: 90px;
}
</style>

<template>
    <div class="melody-maker mm-skin" :class="props.currentTheme">
        <section class="pt-section">

            <!-- ============ TOP: Mini keyboard row ============ -->

            <div class="mm-kb-wrap">
                <div class="mm-field">
                    <!-- Use a non-label element and give it an id -->
                    <div class="mm-label" id="mm-key-label">Key</div>

                    <!-- Link the radiogroup to the label text -->
                    <div class="mm-kb" role="radiogroup" :aria-labelledby="'mm-key-label'">
                        <div v-for="k in NATURALS" :key="k.n" class="kb-cell" :class="{ 'has-sharp': k.hasSharp }">
                            <!-- White key -->
                            <button type="button" class="kb-white" :class="{ 'is-active': keyRoot === k.n }"
                                role="radio" :aria-checked="keyRoot === k.n ? 'true' : 'false'" @click="keyRoot = k.n"
                                :title="`Set key: ${k.n}`">
                                <span class="wlabel">{{ k.n }}</span>
                            </button>

                            <!-- Black key -->
                            <button v-if="k.hasSharp && k.sharp" type="button" class="kb-black"
                                :class="{ 'is-active': keyRoot === k.sharp }" role="radio"
                                :aria-checked="keyRoot === k.sharp ? 'true' : 'false'" @click="keyRoot = k.sharp"
                                :title="`Set key: ${k.sharp}`">
                                <span class="blabel">{{ k.sharp }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>


            <!-- Row 2: Scale + Range at 50% each -->
            <div class="mm-head-row2">
                <label class="mm-field">
                    <span class="mm-label">Scale</span>
                    <PtSelect v-model="keyScale" :options="scaleOptions" aria-label="Scale" />
                </label>

                <label class="mm-field">
                    <span class="mm-label">Range</span>
                    <PtSelect v-model="rangePreset" :options="rangeOptions" aria-label="Register range" />
                </label>
            </div>

            <!-- hint under header -->
            <div class="mm-hint">{{ poolSummary }}</div>

            <div class="mm-primary">
                <button class="mm-btn mm-primary-btn melody-btn" @click="smartGenerate()">
                    Generate melody
                </button>
            </div>

            <!-- ARPEGGIATOR GRID  -->
            <div class="mm-group">
                <div class="mm-grid">
                    <label class="mm-field">
                        <span class="mm-label">Pattern</span>
                        <PtSelect v-model="arpPattern" :options="arpPatternOptions" aria-label="Arp pattern" />
                    </label>

                    <label class="mm-field">
                        <span class="mm-label">Rate</span>
                        <PtSelect v-model="arpRate" :options="arpRateOptions" aria-label="Arp rate" />
                    </label>

                    <label class="mm-field">
                        <span class="mm-label">Octaves</span>
                        <PtSelect v-model="arpOctaves" :options="arpOctaveOptions" aria-label="Arp octaves" />
                    </label>

                    <label class="mm-field">
                        <span class="mm-label">Tones</span>
                        <PtSelect v-model="arpTones" :options="arpToneOptions" aria-label="Arp tones" />
                    </label>
                </div>
                <div class="mm-primary">
                    <button class="mm-btn mm-primary-btn arp-btn" @click="bakeArp()">
                        Generate arpeggio
                    </button>
                </div>
            </div>

            <!-- Advanced menu -->
            <div v-if="advancedOpen" class="mm-menu" @click.stop
                :style="{ left: (advPos?.x ?? 0) + 'px', top: (advPos?.y ?? 0) + 'px' }" role="menu">

                <div class="mm-menu-title">Advanced Options</div>

                <!-- ===== Melody ===== -->
                <div class="mm-subtitle">Melody</div>

                <div class="mm-opt" role="menuitem" @click="applyScope = (applyScope === 'active' ? 'all' : 'active')">
                    <span>Apply to active only</span>
                    <button class="mm-switch" :class="{ on: applyScope === 'active' }"><span class="kn"></span></button>
                </div>

                <div class="mm-opt" role="menuitem" @click="startOnTonic = !startOnTonic">
                    <span>Start on tonic</span>
                    <button class="mm-switch" :class="{ on: startOnTonic }"><span class="kn"></span></button>
                </div>

                <div class="mm-opt" role="menuitem" @click="emphasizeDownbeats = !emphasizeDownbeats">
                    <span>Emphasize downbeats</span>
                    <button class="mm-switch" :class="{ on: emphasizeDownbeats }"><span class="kn"></span></button>
                </div>

                <div class="mm-sep"></div>

                <!-- ===== Arpeggio ===== -->
                <div class="mm-subtitle">Arpeggio</div>

                <div class="mm-opt" role="menuitem" @click="arpSeventhOnDownbeat = !arpSeventhOnDownbeat">
                    <span>Include 7th on downbeats</span>
                    <button class="mm-switch" :class="{ on: arpSeventhOnDownbeat }"><span class="kn"></span></button>
                </div>

                <div class="mm-opt" role="menuitem" @click.stop="
                    arpStart = arpStart === 'low' ? 'center' :
                        arpStart === 'center' ? 'high' :
                            arpStart === 'high' ? 'random' : 'low'
                    ">
                    <span>Arp start: {{ arpStart }}</span>
                </div>

                <div class="mm-opt" role="menuitem"
                    @click.stop="arpRepeat = (arpRepeat === 3 ? 1 : (arpRepeat + 1 as 1 | 2 | 3))">
                    <span>Repeat each note: ×{{ arpRepeat }}</span>
                </div>

                <div class="mm-opt" role="menuitem" @click.stop="arpStride = (arpStride === 1 ? 2 : 1)">
                    <span>Skip every other tone</span>
                    <button class="mm-switch" :class="{ on: arpStride === 2 }"><span class="kn"></span></button>
                </div>

                <div class="mm-opt" role="menuitem" @click.stop="arpHop = !arpHop">
                    <span>Occasional octave hops</span>
                    <button class="mm-switch" :class="{ on: arpHop }"><span class="kn"></span></button>
                </div>

                <div class="mm-sep"></div>

                <!-- ===== Utilities ===== -->
                <div class="mm-subtitle">Utilities</div>

                <div class="mm-opt" role="menuitem" :aria-disabled="!lastFrequencies"
                    :class="{ 'is-disabled': !lastFrequencies }" @click.stop="lastFrequencies && undo()">
                    Undo last melody
                </div>

                <div class="mm-reset" role="menuitem" @click.stop="resetAdvanced">
                    Reset settings to defaults
                </div>
            </div>

            <!-- overlay to close menu -->
            <div v-if="advancedOpen" class="mm-overlay" @click="advancedOpen = false"></div>

        </section>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, defineExpose } from 'vue';
import PtSelect from './PtSelect.vue';

/* ---------- PROPS (added initial* props for persistence) ---------- */
const props = defineProps<{
    frequencies?: number[];
    steps?: boolean[];
    minFreq?: number;
    maxFreq?: number;
    currentTheme?: string;

    initialKeyRoot?: 'C' | 'C#' | 'D' | 'Eb' | 'E' | 'F' | 'F#' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';
    initialKeyScale?: 'major' | 'naturalMinor' | 'pentMajor' | 'pentMinor' | 'wholeTone' | 'dorian' | 'lydian' | 'egyptian';
    initialRangePreset?: 'low' | 'mid' | 'high' | 'wide';

    // Also accept the arp initial props you pass (benign if unused)
    initialArpPattern?: 'up' | 'down' | 'updown' | 'random';
    initialArpRate?: '1/4' | '1/8' | '1/16';
    initialArpOctaves?: 1 | 2 | 3 | 4;
    initialArpTones?: 'chord' | 'scale';
}>();

/* ---------- Defaults ---------- */
const DEFAULTS_MELODY = {
    applyScope: 'active' as 'active' | 'all',
    startOnTonic: false,
    emphasizeDownbeats: true,
};
const DEFAULTS_ARP = {
    pattern: 'up' as 'up' | 'down' | 'updown' | 'random',
    rate: '1/16' as '1/4' | '1/8' | '1/16',
    octaves: 1 as 1 | 2 | 3 | 4,
    tones: 'chord' as 'chord' | 'scale',
    seventhOnDownbeat: false,
    start: 'center' as 'low' | 'center' | 'high' | 'random',
    repeat: 1 as 1 | 2 | 3,
    stride: 1 as 1 | 2,
    hop: false,
};

type Style = 'random' | 'natural' | 'up' | 'down' | 'arch' | 'zigzag';
const style = ref<Style>('random');

const emit = defineEmits<{
    (e: 'update:frequencies', v: number[]): void;
    (e: 'octave-shift', delta: number): void;
    (e: 'key-root-change', root: typeof ROOTS[number]): void;
    // NEW emits so parent can persist:
    (e: 'key-scale-change', scale: keyof typeof SCALES): void;
    (e: 'range-preset-change', preset: PresetKey): void;
}>();

/* ---------- Theory ---------- */
const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
type RootNote = typeof ROOTS[number];

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
    major: 'Major', naturalMinor: 'Minor', pentMajor: 'Pentatonic Major', pentMinor: 'Pentatonic Minor',
    wholeTone: 'Whole-tone', dorian: 'Dorian', lydian: 'Lydian', egyptian: 'Egyptian Pentatonic'
};

/* ---------- PERSISTED UI (Key/Scale/Range) ---------- */
// Initialize from props.* if provided, else your defaults
const keyRoot = ref<RootNote>(props.initialKeyRoot ?? 'A');
const keyScale = ref<keyof typeof SCALES>(props.initialKeyScale ?? 'major');

/* Mini keyboard layout (like PadSettingsPopover but compact) */
const NATURALS: Array<{ n: Extract<RootNote, 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'>; hasSharp: boolean; sharp?: RootNote }> = [
    { n: 'C', hasSharp: true, sharp: 'C#' },
    { n: 'D', hasSharp: true, sharp: 'Eb' },  // project decides Eb over D#
    { n: 'E', hasSharp: false },
    { n: 'F', hasSharp: true, sharp: 'F#' },
    { n: 'G', hasSharp: true, sharp: 'Ab' },  // Ab over G#
    { n: 'A', hasSharp: true, sharp: 'Bb' },  // Bb over A#
    { n: 'B', hasSharp: false },
];

/* Naming helpers used elsewhere */
const SHARP_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
const preferFlat = computed(() => keyRoot.value.includes('b') || FLAT_KEYS.has(keyRoot.value));
const NAMES = computed(() => preferFlat.value ? FLAT_NOTE_NAMES : SHARP_NOTE_NAMES);
const midiToName = (m: number) => `${NAMES.value[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

type PresetKey = 'low' | 'mid' | 'high' | 'wide';
const PRESETS: Record<PresetKey, { minOct: number; maxOct: number; label: string }> = {
    low: { minOct: 2, maxOct: 3, label: 'Low' },
    mid: { minOct: 3, maxOct: 4, label: 'Mid' },
    high: { minOct: 4, maxOct: 5, label: 'High' },
    wide: { minOct: 2, maxOct: 6, label: 'Wide' },
};
// Initialize from props.initialRangePreset if provided
const rangePreset = ref<PresetKey>(props.initialRangePreset ?? 'wide');
const minOctave = ref(3);
const maxOctave = ref(6);
watch(rangePreset, (k) => { const p = PRESETS[k]; minOctave.value = p.minOct; maxOctave.value = p.maxOct; }, { immediate: true });

/* ---------- Freq helpers ---------- */
const NOTE_TO_SEMITONE: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};
const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const freqToMidi = (f: number) => Math.round(69 + 12 * Math.log2(f / 440));

function buildCandidateMidiPool(root: string, scaleName: string, minOct: number, maxOct: number, fMin: number, fMax: number) {
    const steps = SCALES[scaleName] ?? SCALES.major;
    const rootSemi = NOTE_TO_SEMITONE[root] ?? 0;
    const pool: number[] = [];
    const lo = Math.min(minOct, maxOct);
    const hi = Math.max(minOct, maxOct);

    for (let oct = lo; oct <= hi; oct++) {
        const base = 12 * (oct + 1);
        for (const step of steps) {
            const semi = (rootSemi + step) % 12;
            const midi = base + semi;
            const f = midiToFreq(midi);
            if (f >= fMin && f <= fMax) pool.push(midi);
        }
    }
    if (!pool.length) {
        const mid = Math.round((freqToMidi(fMin) + freqToMidi(fMax)) / 2);
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

const keyOptions = ROOTS.map(r => ({ label: r, value: r }));
const scaleOptions = Object.keys(SCALES).map(name => ({ label: SCALE_LABELS[name] ?? name, value: name }));
const rangeOptions = (Object.entries(PRESETS) as [PresetKey, typeof PRESETS[PresetKey]][])
    .map(([value, def]) => ({ label: def.label, value }));
    
// emits for persistence
watch(keyRoot, (v) => emit('key-root-change', v), { immediate: true });
watch(keyScale, (v) => emit('key-scale-change', v), { immediate: true });
watch(rangePreset, (v) => emit('range-preset-change', v), { immediate: true });

// respond to parent pushing new initial props (e.g., after load)
watch(() => props.initialKeyRoot, (v) => { if (v && v !== keyRoot.value) keyRoot.value = v as RootNote; });
watch(() => props.initialKeyScale, (v) => { if (v && v !== keyScale.value) keyScale.value = v as keyof typeof SCALES; });
watch(() => props.initialRangePreset, (v) => { if (v && v !== rangePreset.value) rangePreset.value = v as PresetKey; });

/* ---------- Smart generator ---------- */
function contourAt(i: number, n: number, kind: Style) {
    const t = n > 1 ? i / (n - 1) : 0;
    switch (kind) {
        case 'up': return t;
        case 'down': return 1 - t;
        case 'arch': return 1 - Math.abs(2 * t - 1);
        case 'zigzag': return (i % 2 ? 0.8 : 0.2);
        case 'natural':
        default: {
            const drift = 0.5 + 0.28 * Math.sin(2 * Math.PI * t) + 0.12 * Math.sin(4 * Math.PI * t + 1.1);
            return Math.min(1, Math.max(0, drift));
        }
    }
}
function defaultWeightsFor(scaleLen: number) {
    if (scaleLen >= 7) return [80, 35, 60, 35, 70, 45, 30];
    if (scaleLen === 5) return [80, 60, 70, 60, 65];
    return Array.from({ length: scaleLen }, (_, i) => (i === 0 ? 80 : i % 4 === 0 ? 70 : 45));
}
function degreeIndexFor(semiAbs: number, rootSemi: number, steps: number[]) {
    const rel = (semiAbs - rootSemi + 120) % 12;
    const di = steps.indexOf(rel);
    return di >= 0 ? di : 0;
}
function makeRng(s: number) {
    return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let clickNonce = 0;
const seed = ref(1);
function freshRng() {
    const mixed =
        (seed.value | 0) ^
        (++clickNonce * 0x9e3779b9) ^
        (Date.now() & 0xffffffff);
    return makeRng(mixed);
}

function smartGenerate(): void {
    if (!props.frequencies || !props.frequencies.length) return;

    const freqMin = props.minFreq ?? 100;
    const freqMax = props.maxFreq ?? 2000;
    const pool = buildCandidateMidiPool(
        keyRoot.value, keyScale.value, minOctave.value, maxOctave.value, freqMin, freqMax
    ).sort((a, b) => a - b);
    if (!pool.length) return;

    const out = props.frequencies.slice();

    const stepsMask =
        (applyScope.value === 'active' && props.steps && props.steps.length === out.length)
            ? props.steps
            : out.map(() => true);

    const stepsArr = SCALES[keyScale.value] ?? SCALES.major;
    const rootSemi = NOTE_TO_SEMITONE[keyRoot.value] ?? 0;

    const tonicSemi = (rootSemi + stepsArr[0]) % 12;
    const tonicCandidates = pool.filter(m => (((m % 12) + 12) % 12) === tonicSemi);

    const center = pool[Math.floor(pool.length / 2)];
    const firstActive = stepsMask.findIndex(Boolean);

    if (style.value === 'random') {
        const rand = freshRng();

        if (startOnTonic.value && firstActive >= 0 && tonicCandidates.length) {
            const m = tonicCandidates.reduce(
                (best, cur) => Math.abs(cur - center) < Math.abs(best - center) ? cur : best,
                tonicCandidates[0]
            );
            out[firstActive] = midiToFreq(m);
        }

        for (let i = 0; i < out.length; i++) {
            if (!stepsMask[i]) continue;
            if (startOnTonic.value && i === firstActive && tonicCandidates.length) continue;
            const midi = pool[Math.floor(rand() * pool.length)];
            out[i] = midiToFreq(midi);
        }
        rememberBeforeWrite();
        emit('update:frequencies', out);
        return;
    }

    const baseWeights = defaultWeightsFor(stepsArr.length);
    let prevMidi = center;
    let prevIdx = Math.floor(pool.length / 2);
    const L = out.length;

    for (let i = 0; i < L; i++) {
        if (!stepsMask[i]) continue;

        if (startOnTonic.value && i === firstActive && tonicCandidates.length) {
            const m = tonicCandidates.reduce(
                (best, cur) => Math.abs(cur - center) < Math.abs(best - center) ? cur : best,
                tonicCandidates[0]
            );
            out[i] = midiToFreq(m);
            prevMidi = m; prevIdx = pool.indexOf(m);
            continue;
        }

        const target = contourAt(i, L, 'natural');
        const targetIdx = Math.round(target * (pool.length - 1));

        const spread = Math.max(2, Math.floor(pool.length * 0.12));
        const lo = Math.max(0, targetIdx - spread);
        const hi = Math.min(pool.length - 1, targetIdx + spread);

        let bestMidi = pool[targetIdx];
        let bestScore = -Infinity;
        let bestIdx = targetIdx;
        const desiredDir = Math.sign(targetIdx - prevIdx);

        for (let j = lo; j <= hi; j++) {
            const midi = pool[j];
            const semiAbs = ((midi % 12) + 12) % 12;
            const di = degreeIndexFor(semiAbs, rootSemi, stepsArr);

            let w = baseWeights[di];
            if (emphasizeDownbeats.value && (i % 4 === 0)) {
                const isTonic = di === 0;
                const isFifth = stepsArr[di] === 7;
                if (isTonic || isFifth) w *= 1.3;
            }

            const dMidi = Math.abs(midi - prevMidi);
            let lead = 1 / (1 + dMidi);
            if (dMidi === 0) lead *= 0.6;

            const align = 1 / (1 + Math.abs(j - targetIdx));
            const dir = Math.sign(j - prevIdx);
            const dirAlign = desiredDir === 0 ? 1 : (dir === desiredDir ? 1.12 : 0.94);

            const score = w * (0.60 + 0.25 * lead + 0.15 * align) * dirAlign
                - (j === prevIdx ? w * 0.08 : 0);

            if (score > bestScore) { bestScore = score; bestMidi = midi; bestIdx = j; }
        }
        prevMidi = bestMidi; prevIdx = bestIdx; out[i] = midiToFreq(bestMidi);
    }

    rememberBeforeWrite();
    emit('update:frequencies', out);
}

/* ---------- Arpeggiator ---------- */
// initialize arp UI from optional initial props to keep your parent happy
const arpPattern = ref<'up' | 'down' | 'updown' | 'random'>(props.initialArpPattern ?? 'up');
const arpRate = ref<'1/4' | '1/8' | '1/16'>(props.initialArpRate ?? '1/16');
const arpOctaves = ref<1 | 2 | 3 | 4>(props.initialArpOctaves ?? 1);
const arpTones = ref<'chord' | 'scale'>(props.initialArpTones ?? 'chord');

const arpSeventhOnDownbeat = ref(false);
const arpStart = ref<'low' | 'center' | 'high' | 'random'>('center');
const arpRepeat = ref<1 | 2 | 3>(1);
const arpStride = ref<1 | 2>(1);
const arpHop = ref(false);

const arpPatternOptions = [
    { label: 'Up', value: 'up' },
    { label: 'Down', value: 'down' },
    { label: 'Up/Down', value: 'updown' },
    { label: 'Random', value: 'random' },
] as const;
const arpRateOptions = [
    { label: '1/4', value: '1/4' },
    { label: '1/8', value: '1/8' },
    { label: '1/16', value: '1/16' },
] as const;
const arpOctaveOptions = [
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3', value: 3 },
    { label: '4', value: 4 },
] as const;
const arpToneOptions = [
    { label: 'Chord', value: 'chord' },
    { label: 'Scale', value: 'scale' },
] as const;
// ---------- Arp helpers ----------
function rotate<T>(arr: T[], n: number) {
    if (!arr.length) return arr;
    const k = ((n % arr.length) + arr.length) % arr.length;
    return arr.slice(k).concat(arr.slice(0, k));
}

function indicesWithStride(L: number, stride: number) {
    if (stride <= 1) return Array.from({ length: L }, (_, i) => i);
    const out: number[] = [];
    for (let start = 0; start < stride; start++) {
        for (let i = start; i < L; i += stride) out.push(i);
    }
    return out;
}

function nearestIndexIn(arr: number[], base: number): number | null {
    if (!arr.length) return null;
    let best = 0, d = Math.abs(arr[0] - base);
    for (let i = 1; i < arr.length; i++) {
        const dd = Math.abs(arr[i] - base);
        if (dd < d) { d = dd; best = i; }
    }
    return best;
}

function outwardOffsets(n: number) {
    const out: number[] = [];
    for (let k = 1; k <= n; k++) out.push(k * (k % 2 ? 1 : -1));
    return out;
}

function bakeArp(): void {
    if (!props.frequencies || !props.frequencies.length) return;

    const out = props.frequencies.slice();

    const scopeMask =
        (applyScope.value === 'active' && props.steps && props.steps.length === out.length)
            ? props.steps
            : out.map(() => true);

    const activeIdx = out.map((_, i) => i).filter(i => scopeMask[i]);
    if (!activeIdx.length) { emit('update:frequencies', out); return; }

    const fMin = props.minFreq ?? 100;
    const fMax = props.maxFreq ?? 2000;

    const pool = buildCandidateMidiPool(
        keyRoot.value, keyScale.value, minOctave.value, maxOctave.value, fMin, fMax
    ).sort((a, b) => a - b);
    if (!pool.length) return;

    const stepsArr = SCALES[keyScale.value] ?? SCALES.major;
    const rootSemi = NOTE_TO_SEMITONE[keyRoot.value] ?? 0;
    const center = pool[Math.floor(pool.length / 2)];

    const toneSemitones = (mode: 'chord' | 'scale'): number[] => {
        if (mode === 'scale') return Array.from(new Set(stepsArr.map(s => (rootSemi + s) % 12)));
        const chordIdx = [0, 2, 4]; // 1,3,5
        const semis = chordIdx.filter(i => i < stepsArr.length).map(i => (rootSemi + stepsArr[i]) % 12);
        return Array.from(new Set(semis));
    };
    const toneSemisArr = toneSemitones(arpTones.value);

    const groupsBySemi: Record<number, number[]> = {};
    for (const s of toneSemisArr) groupsBySemi[s] = [];
    for (const m of pool) {
        const s = ((m % 12) + 12) % 12;
        if (groupsBySemi[s]) groupsBySemi[s].push(m);
    }
    for (const s of toneSemisArr) groupsBySemi[s].sort((a, b) => a - b);

    let ladder: number[] = [];
    for (const s of toneSemisArr) {
        const g = groupsBySemi[s] || [];
        if (!g.length) continue;

        const i0 = nearestIndexIn(g, center);
        if (i0 == null) continue;

        const picks: number[] = [g[i0]];
        const need = (arpOctaves.value - 1);
        const offs = outwardOffsets(need);

        for (const off of offs) {
            const idx = i0 + off;
            if (idx >= 0 && idx < g.length) picks.push(g[idx]);
            if (picks.length >= arpOctaves.value) break;
        }

        ladder.push(...picks);
    }
    ladder = [...new Set(ladder)].sort((a, b) => a - b);
    if (!ladder.length) return;

    const baseIdx = indicesWithStride(ladder.length, arpStride.value);

    let startIdx = 0;
    if (arpStart.value === 'low') startIdx = 0;
    else if (arpStart.value === 'high') startIdx = ladder.length - 1;
    else if (arpStart.value === 'center') startIdx = Math.floor(ladder.length / 2);
    else { const r = freshRng(); startIdx = Math.floor(r() * ladder.length); }

    const posOfStart = baseIdx.indexOf(startIdx);
    const rotated = posOfStart >= 0 ? rotate(baseIdx, posOfStart) : baseIdx;

    let orderIdx: number[] = [];
    switch (arpPattern.value) {
        case 'up':
            orderIdx = rotated;
            break;
        case 'down':
            orderIdx = rotated.slice().reverse();
            break;
        case 'updown': {
            const up = rotated;
            const down = rotated.slice().reverse().slice(1, -1);
            orderIdx = up.concat(down.length ? down : []);
            break;
        }
        case 'random':
        default: {
            orderIdx = rotated.slice();
            const r = freshRng();
            for (let i = orderIdx.length - 1; i > 0; i--) {
                const j = Math.floor(r() * (i + 1));
                [orderIdx[i], orderIdx[j]] = [orderIdx[j], orderIdx[i]];
            }
        }
    }
    const order = orderIdx.map(i => ladder[i]);
    if (!order.length) return;

    const RATE_TO_GROUP: Record<string, number> = { '1/4': 4, '1/8': 2, '1/16': 1 };
    const groupSize = RATE_TO_GROUP[arpRate.value] ?? 1;

    const groupsOfIdx: number[][] = [];
    for (let k = 0; k < activeIdx.length; k += groupSize) {
        groupsOfIdx.push(activeIdx.slice(k, k + groupSize));
    }

    const seventhSemi = stepsArr.length >= 7 ? (rootSemi + stepsArr[6]) % 12 : null;
    const seventhCandidates = (seventhSemi != null)
        ? pool.filter(m => (((m % 12) + 12) % 12) === seventhSemi)
        : [];

    const rgen = freshRng();

    function maybeHop(midi: number): number {
        if (!arpHop.value) return midi;
        if (rgen() < 0.2) {
            const s = ((midi % 12) + 12) % 12;
            const g = groupsBySemi[s] || [];
            if (!g.length) return midi;
            const dirUp = rgen() < 0.5;
            if (dirUp) {
                const higher = g.find(x => x > midi);
                if (higher != null) return higher;
            } else {
                const lower = [...g].reverse().find(x => x < midi);
                if (lower != null) return lower;
            }
        }
        return midi;
    }

    let p = 0;
    let repeatsLeft = arpRepeat.value;

    for (const g of groupsOfIdx) {
        if (!g.length) continue;

        const firstStep = g[0];
        let midi: number | undefined;

        if (arpSeventhOnDownbeat.value && seventhCandidates.length && (firstStep % 4 === 0)) {
            const i = nearestIndexIn(seventhCandidates, center);
            if (i != null) midi = seventhCandidates[i];
        }

        if (midi === undefined) {
            if (repeatsLeft <= 0) { p++; repeatsLeft = arpRepeat.value; }
            repeatsLeft--;

            midi = order[p % order.length];
            midi = maybeHop(midi);
        }

        const hz = midiToFreq(midi);
        for (const stepIndex of g) out[stepIndex] = hz;
    }

    rememberBeforeWrite();
    emit('update:frequencies', out);
}

/* ---------- UI state & helpers ---------- */
const advancedOpen = ref(false);
const advPos = ref<{ x: number; y: number } | null>(null);
function openAdvanced(e?: MouseEvent) {
    const target = e?.currentTarget as HTMLElement | null;
    const parent = document.querySelector('.melody-maker') as HTMLElement | null;
    if (target && parent) {
        const r = target.getBoundingClientRect();
        const p = parent.getBoundingClientRect();
        advPos.value = {
            x: Math.round(r.right - p.left + 8),
            y: Math.round(r.top - p.top),
        };
    } else {
        advPos.value = { x: 24, y: 24 };
    }
    advancedOpen.value = true;
}

const applyScope = ref<'all' | 'active'>('active');
const startOnTonic = ref(false);
const emphasizeDownbeats = ref(true);

// Undo buffer
const lastFrequencies = ref<number[] | null>(null);
function rememberBeforeWrite() { if (props.frequencies) lastFrequencies.value = props.frequencies.slice(); }
function undo() { if (lastFrequencies.value) emit('update:frequencies', lastFrequencies.value.slice()); }

// Close menu on ESC
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') advancedOpen.value = false; }
window.addEventListener('keydown', onKey, { capture: true });
onUnmounted(() => window.removeEventListener('keydown', onKey));

function resetAdvanced() {
    applyScope.value = DEFAULTS_MELODY.applyScope;
    startOnTonic.value = DEFAULTS_MELODY.startOnTonic;
    emphasizeDownbeats.value = DEFAULTS_MELODY.emphasizeDownbeats;

    arpPattern.value = DEFAULTS_ARP.pattern;
    arpRate.value = DEFAULTS_ARP.rate;
    arpOctaves.value = DEFAULTS_ARP.octaves;
    arpTones.value = DEFAULTS_ARP.tones;

    arpSeventhOnDownbeat.value = DEFAULTS_ARP.seventhOnDownbeat;
    arpStart.value = DEFAULTS_ARP.start;
    arpRepeat.value = DEFAULTS_ARP.repeat;
    arpStride.value = DEFAULTS_ARP.stride;
    arpHop.value = DEFAULTS_ARP.hop;
}

/* ---------- EXPOSE for parent save/load ---------- */
type UiSnapshot = {
    keyRoot: RootNote;
    keyScale: keyof typeof SCALES;
    rangePreset: PresetKey;
    arpPattern: 'up' | 'down' | 'updown' | 'random';
    arpRate: '1/4' | '1/8' | '1/16';
    arpOctaves: 1 | 2 | 3 | 4;
    arpTones: 'chord' | 'scale';
};

function getUi(): UiSnapshot {
    return {
        keyRoot: keyRoot.value,
        keyScale: keyScale.value,
        rangePreset: rangePreset.value,
        arpPattern: arpPattern.value,
        arpRate: arpRate.value,
        arpOctaves: arpOctaves.value,
        arpTones: arpTones.value,
    };
}

function setUi(u: Partial<UiSnapshot>) {
    if (u.keyRoot) keyRoot.value = u.keyRoot;
    if (u.keyScale) keyScale.value = u.keyScale as keyof typeof SCALES;
    if (u.rangePreset) rangePreset.value = u.rangePreset as PresetKey;

    if (u.arpPattern) arpPattern.value = u.arpPattern;
    if (u.arpRate) arpRate.value = u.arpRate;
    if (u.arpOctaves) arpOctaves.value = u.arpOctaves as 1 | 2 | 3 | 4;
    if (u.arpTones) arpTones.value = u.arpTones;
}

defineExpose({ openAdvanced, getUi, setUi });
</script>

<style scoped>
/* ---- your original styles unchanged ---- */
.melody-maker {
    position: relative;
    width: 100%;
    max-width: none;
    flex: 1 1 0;
}

.mm-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}

.mm-label {
    color: var(--pt-muted);
    font-weight: 600;
    font-size: .9rem;
}

.mm-hint {
    margin-top: 6px;
    color: var(--pt-muted);
}

.mm-head-row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: end;
}

.mm-primary {
    display: block;
    margin-top: 10px;
}

.mm-btn {
    height: 36px;
    padding: 0 14px;
    border-radius: 12px;
    border: 0;
    cursor: pointer;
    font-weight: 700;
    transition: filter .2s ease, box-shadow .2s ease, transform .08s ease;
}

.mm-btn:active {
    transform: translateY(1px) scale(.98);
}

.mm-primary-btn {
    color: var(--pt-text);
    background: linear-gradient(180deg, hsl(var(--pt-accent) 80% 60%), hsl(var(--pt-accent-2, var(--pt-accent)) 80% 60%));
    box-shadow: 0 6px 22px hsl(var(--pt-accent) 90% 60% / .25);
    width: 100%;
    margin: 5px 0px;
}

.mm-ghost-btn {
    color: var(--pt-text);
    background: var(--pt-surface-1);
    border: 1px solid var(--pt-hairline);
}

.mm-group {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--pt-hairline);
}

.mm-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
}

.mm-menu {
    position: absolute;
    min-width: 280px;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgb(0 0 0 / .45);
    padding: 10px;
    z-index: 1000;
    background: var(--pt-panel);
    color: var(--pt-text);
    border: 1px solid var(--pt-hairline);
}

.mm-menu-title {
    font-weight: 700;
    color: #c7cee0;
    opacity: .9;
    padding: 8px 8px 6px;
}

.mm-opt {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    border-radius: 8px;
}

.mm-opt:hover {
    background: rgba(255, 255, 255, .04);
    cursor: pointer;
}

.mm-opt.is-disabled {
    opacity: .5;
    pointer-events: none;
}

.mm-reset {
    text-align: center;
    color: #c7cee0;
    opacity: .9;
    padding: 10px 8px 4px;
    cursor: pointer;
}

.mm-switch {
    --sw: 38px;
    --kn: 18px;
    width: var(--sw);
    height: 22px;
    border-radius: 999px;
    position: relative;
    cursor: pointer;
    background: var(--pt-surface-2);
    border: 1px solid var(--pt-hairline);
}

.mm-switch .kn {
    position: absolute;
    top: 50%;
    left: 2px;
    transform: translateY(-50%);
    width: var(--kn);
    height: var(--kn);
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 2px 8px rgb(0 0 0 / .35);
}

.mm-switch.on {
    background: linear-gradient(180deg, hsl(var(--pt-accent) 80% 60%), hsl(var(--pt-accent-2, var(--pt-accent)) 80% 60%));
}

.mm-switch.on .kn {
    left: calc(100% - var(--kn) - 2px);
}

.mm-overlay {
    position: fixed;
    inset: 0;
    z-index: 999;
}

:deep(.pt-selectbtn),
:deep(select.pt-select) {
    height: 36px;
    border-radius: 12px;
    padding: 8px 36px 8px 12px !important;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .03), 0 2px 10px rgb(0 0 0 / .25) !important;
    font-size: .8rem;
    background: var(--pt-surface-1) !important;
    color: var(--pt-text) !important;
    border: 1px solid var(--pt-hairline) !important;
}

:deep(.pt-caret) {
    filter: none;
    color: #aab0c0;
    opacity: .95;
}

@media (max-width: 720px) {
    .mm-grid {
        grid-template-columns: 1fr 1fr;
    }

    .mm-head-row2 {
        grid-template-columns: 1fr;
    }
}

.arp-btn {
    background: none;
    border: 1px solid white;
}

.melody-btn {
    color: var(--pt-text-strong);
}

.mm-subtitle {
    font-weight: 700;
    font-size: .85rem;
    letter-spacing: .02em;
    color: #c7cee0;
    opacity: .9;
    padding: 8px 8px 4px;
}

.mm-sep {
    height: 1px;
    background: var(--pt-hairline);
    opacity: .6;
    margin: 8px 6px;
    border-radius: 1px;
}

.mm-kb-wrap {
    margin-bottom: 8px;
}

.mm-kb :where(.pt-seg-btn) {
    all: unset;
}

.mm-kb {
    --gap: 1px;
    --whiteH: 88px;
    --blackH: 54px;
    --radius: 7px;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--gap);
    margin: 6px 0 2px;
    padding: 6px 6px 8px;
    border-radius: var(--pt-radius-md);
    background: linear-gradient(180deg, transparent, rgb(0 0 0 / .05));
    --white1: color-mix(in oklab, white 94%, var(--pt-panel) 6%);
    --white2: color-mix(in oklab, white 83%, var(--pt-panel) 17%);
    --black1: color-mix(in oklab, #0b0f1a 90%, var(--pt-panel) 10%);
    --black2: color-mix(in oklab, #070a12 95%, var(--pt-panel) 5%);
}

@supports not (color: color-mix(in oklab, white, black)) {
    .mm-kb {
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

.kb-white {
    width: 100%;
    height: 100%;
    border-radius: 0 0 var(--radius) var(--radius);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 5px;
    font-weight: 700;
    color: #111;
    cursor: pointer;
    transition: transform .03s ease, box-shadow .12s ease, filter .12s ease;
    background:
        linear-gradient(180deg, var(--white1), var(--white2)) padding-box,
        linear-gradient(145deg, rgb(0 0 0 / .18), rgb(255 255 255 / .06)) border-box;
    border: 1px solid rgb(0 0 0 / .48);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / .06),
        0 2px 0 rgb(0 0 0 / .5),
        0 6px 14px rgb(0 0 0 / .22);
}

.kb-white.is-active {
    box-shadow:
        inset 0 0 0 2px hsl(var(--pt-accent) 90% 60% / .85),
        inset 0 1px 0 rgb(255 255 255 / .05),
        0 2px 0 rgb(0 0 0 / .5),
        0 8px 18px rgb(0 0 0 / .28);
    background: radial-gradient(circle at center, #d9a0c3 0%, #9b8cb4 75%, #736c92 100%);
}

.kb-white.is-active .wlabel {
    color: white;
    font-size: 1rem;
}

.kb-white .wlabel {
    position: absolute;
    bottom: 4px;
    left: 6px;
    font-size: .72rem;
    opacity: .9;
}

.kb-black {
    --whiteW: 100%;
    width: calc(0.6 * var(--whiteW));
    height: var(--blackH);
    position: absolute;
    top: 0;
    right: calc(-0.3 * var(--whiteW) - var(--gap) / 2);
    border-radius: 0 0 6px 6px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 2px;
    font-size: .7rem;
    font-weight: 700;
    color: #e7ecff;
    cursor: pointer;
    transition: transform .03s ease, box-shadow .12s ease, filter .12s ease;
    background:
        linear-gradient(180deg, var(--black1), var(--black2)) padding-box,
        linear-gradient(145deg, #1a2334, #0b0f1a) border-box;
    border: 1px solid rgb(0 0 0 / .7);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / .05),
        0 2px 0 rgb(0 0 0 / .78),
        0 6px 12px rgb(0 0 0 / .32);
    z-index: 2;
}

.kb-black.is-active {
    box-shadow:
        0 0 0 2px hsl(var(--pt-accent) 90% 60% / .9),
        inset 0 1px 0 rgb(255 255 255 / .05),
        0 2px 0 rgb(0 0 0 / .8),
        0 8px 16px rgb(0 0 0 / .4);
    background: radial-gradient(circle at center, #d9a0c3 0%, #9b8cb4 75%, #736c92 100%);
}

.kb-black.is-active .blabel {
    color: white;
    font-size: 1rem;
}

.kb-cell.has-sharp {
    padding-top: 0;
}

.mm-kb :where(button) {
    outline: none;
}

@media (max-width: 560px) {
    .mm-kb {
        --whiteH: 50px;
        --blackH: 30px;
    }
}
</style>

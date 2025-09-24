<template>
    <div class="melody-maker mm-skin" :class="props.currentTheme">
        <section class="pt-section">

            <!-- ============ TOP BAR ============ -->
            <div class="mm-head">
                <label class="mm-field">
                    <span class="mm-label">Key</span>
                    <PtSelect v-model="keyRoot" :options="keyOptions" aria-label="Key" />
                </label>

                <label class="mm-field">
                    <span class="mm-label">Scale</span>
                    <PtSelect v-model="keyScale" :options="scaleOptions" aria-label="Scale" />
                </label>

                <label class="mm-field">
                    <span class="mm-label">Range</span>
                    <PtSelect v-model="rangePreset" :options="rangeOptions" aria-label="Register range" />
                </label>

                <!-- 3-dot advanced menu -->
                <!-- <div class="mm-three">
                    <button class="mm-icon" aria-label="Advanced" @click.stop="advancedOpen = !advancedOpen">⋯</button>

                    <div v-if="advancedOpen" class="mm-menu" role="menu">
                        <div class="mm-menu-title">Advanced</div>

                        <div class="mm-opt">
                            <span>Apply to active only</span>
                            <button class="mm-switch" :class="{ on: applyScope === 'active' }"
                                @click="applyScope = (applyScope === 'active' ? 'all' : 'active')">
                                <span class="kn"></span>
                            </button>
                        </div>

                        <div class="mm-opt">
                            <span>Start on tonic</span>
                            <button class="mm-switch" :class="{ on: startOnTonic }"
                                @click="startOnTonic = !startOnTonic">
                                <span class="kn"></span>
                            </button>
                        </div>

                        <div class="mm-opt">
                            <span>Emphasize downbeats</span>
                            <button class="mm-switch" :class="{ on: emphasizeDownbeats }"
                                @click="emphasizeDownbeats = !emphasizeDownbeats">
                                <span class="kn"></span>
                            </button>
                        </div>

                        <div class="mm-opt">
                            <span>Include 7th on downbeats (arp)</span>
                            <button class="mm-switch" :class="{ on: arpSeventhOnDownbeat }"
                                @click="arpSeventhOnDownbeat = !arpSeventhOnDownbeat">
                                <span class="kn"></span>
                            </button>
                        </div>

                        <div class="mm-reset" role="menuitem" @click.stop="resetAdvanced">Reset to defaults</div>
                    </div>
                </div> -->
            </div>

            <!-- hint under header -->
            <div class="mm-hint">{{ poolSummary }}</div>

            <div class="mm-actions">
                <button class="mm-btn mm-ghost-btn" @click="emit('octave-shift', -1)">↓ Octave</button>
                <button class="mm-btn mm-ghost-btn" @click="emit('octave-shift', +1)">↑ Octave</button>
            </div>

            <!-- ============ MODE + PRIMARY ACTIONS ============ -->
            <!-- <div class="mm-line"> -->
                <!-- <div class="mm-mode">
                    <span class="mm-label">Mode</span>
                    <div class="mm-seg">
                        <button :class="{ active: tab === 'gen' }" @click="tab = 'gen'">Melody</button>
                        <button :class="{ active: tab === 'arp' }" @click="tab = 'arp'">Arpeggio</button>
                    </div>
                </div> -->




                <!-- <div class="mm-primary">
                    <button class="mm-btn mm-primary-btn" @click="tab === 'gen' ? smartGenerate() : bakeArp()">
                        {{ tab === 'gen' ? 'Generate melody' : 'Generate arpeggio' }}
                    </button>
                </div> -->
                <div class="mm-primary">
                    <button class="mm-btn mm-primary-btn" @click="smartGenerate()">
                        Generate melody
                    </button>
                </div>
                    <!-- <button class="mm-btn mm-ghost-btn" :disabled="!lastFrequencies" @click="undo()">Undo last</button> -->

            <!-- </div> -->

            <!-- ============ ARPEGGIATOR GRID (shows only in arp mode) ============ -->
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
                    <button class="mm-btn mm-primary-btn" @click="bakeArp()">
                        Generate arpeggio
                    </button>
                </div>
            </div>




            <!-- overlay to close menu when clicking outside -->
            <!-- Advanced menu (now opened from parent header via openAdvanced) -->
            <div v-if="advancedOpen" class="mm-menu" @click.stop
                :style="{ left: (advPos?.x ?? 0) + 'px', top: (advPos?.y ?? 0) + 'px' }" role="menu">
                <div class="mm-menu-title">Advanced</div>

                <div class="mm-opt" role="menuitem" @click="applyScope = (applyScope === 'active' ? 'all' : 'active')">
                    <span>Apply to active only</span>
                    <button class="mm-switch" :class="{ on: applyScope === 'active' }">
                        <span class="kn"></span>
                    </button>
                </div>
                <div class="mm-opt" role="menuitem" @click="startOnTonic = !startOnTonic">
                    <span>Start on tonic</span>
                    <button class="mm-switch" :class="{ on: startOnTonic }"><span class="kn"></span></button>
                </div>

                <div class="mm-opt" role="menuitem" @click="emphasizeDownbeats = !emphasizeDownbeats">
                    <span>Emphasize downbeats</span>
                    <button class="mm-switch" :class="{ on: emphasizeDownbeats }"><span class="kn"></span></button>
                </div>

                <div class="mm-opt" role="menuitem" @click="arpSeventhOnDownbeat = !arpSeventhOnDownbeat">
                    <span>Include 7th on downbeats (arp)</span>
                    <button class="mm-switch" :class="{ on: arpSeventhOnDownbeat }"><span class="kn"></span></button>
                </div>
                <div class="mm-opt" role="menuitem" :aria-disabled="!lastFrequencies"
                    :class="{ 'is-disabled': !lastFrequencies }" @click.stop="lastFrequencies && undo()">
                    Undo last melody (expand later)
                </div>
                <div class="mm-reset" role="menuitem" @click.stop="resetAdvanced">Reset Settings to defaults</div>
            </div>

            <!-- overlay to close menu when clicking outside -->
            <div v-if="advancedOpen" class="mm-overlay" @click="advancedOpen = false"></div>

        </section>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, defineExpose } from 'vue';
import PtSelect from './PtSelect.vue';

const props = defineProps<{
    frequencies?: number[];
    steps?: boolean[];
    minFreq?: number;
    maxFreq?: number;
    currentTheme?: string;
}>();

type Style = 'random' | 'natural' | 'up' | 'down' | 'arch' | 'zigzag';
const style = ref<Style>('random'); // internal (smart melody)

const emit = defineEmits<{
    (e: 'update:frequencies', v: number[]): void;
    (e: 'octave-shift', delta: number): void;
    (e: 'key-root-change', root: typeof ROOTS[number]): void;
}>();

/* ---------- Theory ---------- */
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
    major: 'Major', naturalMinor: 'Minor', pentMajor: 'Pentatonic Major', pentMinor: 'Pentatonic Minor',
    wholeTone: 'Whole-tone', dorian: 'Dorian', lydian: 'Lydian', egyptian: 'Egyptian Pentatonic'
};

const keyRoot = ref<typeof ROOTS[number]>('A');
const keyScale = ref<keyof typeof SCALES>('major');

const SHARP_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
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
const rangePreset = ref<PresetKey>('wide');
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
            if (f >= fMin && f <= fMax) pool.push(midi); // ← use fMin/fMax here
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
const rangeOptions = (Object.entries(PRESETS) as [PresetKey, typeof PRESETS[PresetKey]][]).map(([value, def]) => ({ label: def.label, value }));

watch(keyRoot, (v) => emit('key-root-change', v), { immediate: true });

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

function smartGenerate(): void {
    if (!props.frequencies || !props.frequencies.length) return;

    const freqMin = props.minFreq ?? 100;
    const freqMax = props.maxFreq ?? 2000;
    const pool = buildCandidateMidiPool(
        keyRoot.value, keyScale.value, minOctave.value, maxOctave.value, freqMin, freqMax
    ).sort((a, b) => a - b);
    if (!pool.length) return;

    const out = props.frequencies.slice();

    // steps scope from ADVANCED
    const stepsMask =
        (applyScope.value === 'active' && props.steps && props.steps.length === out.length)
            ? props.steps
            : out.map(() => true);

    // Shared theory bits (used by both branches)
    const stepsArr = SCALES[keyScale.value] ?? SCALES.major;
    const rootSemi = NOTE_TO_SEMITONE[keyRoot.value] ?? 0;

    const tonicSemi = (rootSemi + stepsArr[0]) % 12;
    const tonicCandidates = pool.filter(m => (((m % 12) + 12) % 12) === tonicSemi);

    const center = pool[Math.floor(pool.length / 2)];
    const firstActive = stepsMask.findIndex(Boolean);

    // ===== Random fill (now respects Start on tonic) =====
    if (style.value === 'random') {
        const rand = freshRng();

        // Pin first active step to tonic if requested
        if (startOnTonic.value && firstActive >= 0 && tonicCandidates.length) {
            const m = tonicCandidates.reduce(
                (best, cur) => Math.abs(cur - center) < Math.abs(best - center) ? cur : best,
                tonicCandidates[0]
            );
            out[firstActive] = midiToFreq(m);
        }

        for (let i = 0; i < out.length; i++) {
            if (!stepsMask[i]) continue;
            if (startOnTonic.value && i === firstActive && tonicCandidates.length) continue; // keep pinned tonic
            const midi = pool[Math.floor(rand() * pool.length)];
            out[i] = midiToFreq(midi);
        }
        rememberBeforeWrite();
        emit('update:frequencies', out);
        return;
    }

    // ===== “Natural/smart” contour (unchanged, just uses the shared vars) =====
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
const arpPattern = ref<'up' | 'down' | 'updown' | 'random'>('up');
const arpRate = ref<'1/16' | '1/8'>('1/16');
const arpOctaves = ref<1 | 2>(1);
const arpTones = ref<'chord' | 'scale'>('chord');
const arpSeventhOnDownbeat = ref(false);

const arpPatternOptions = [
    { label: 'Up', value: 'up' },
    { label: 'Down', value: 'down' },
    { label: 'Up/Down', value: 'updown' },
    { label: 'Random', value: 'random' },
] as const;
const arpRateOptions = [
    { label: '1/16', value: '1/16' },
    { label: '1/8', value: '1/8' },
] as const;
const arpOctaveOptions = [{ label: '1', value: 1 }, { label: '2', value: 2 }] as const;
const arpToneOptions = [{ label: 'Chord', value: 'chord' }, { label: 'Scale', value: 'scale' }] as const;

function bakeArp(): void {
    if (!props.frequencies || !props.frequencies.length) return;

    const out = props.frequencies.slice();
    const mask = (props.steps && props.steps.length === out.length) ? props.steps : out.map(() => true);
    const activeIdx = out.map((_, i) => i).filter(i => mask[i]);
    if (!activeIdx.length) { emit('update:frequencies', out); return; }

    const fMin = props.minFreq ?? 100;
    const fMax = props.maxFreq ?? 2000;
    const pool = buildCandidateMidiPool(keyRoot.value, keyScale.value, minOctave.value, maxOctave.value, fMin, fMax).sort((a, b) => a - b);
    if (!pool.length) return;

    const stepsArr = SCALES[keyScale.value] ?? SCALES.major;
    const rootSemi = NOTE_TO_SEMITONE[keyRoot.value] ?? 0;

    const toneSemitones = (mode: 'chord' | 'scale'): number[] => {
        if (mode === 'scale') return Array.from(new Set(stepsArr.map(s => (rootSemi + s) % 12)));
        const chordIdx = [0, 2, 4].filter(i => i < stepsArr.length);
        return chordIdx.map(i => (rootSemi + stepsArr[i]) % 12);
    };
    const toneSemisArr = toneSemitones(arpTones.value);

    const groups: Record<number, number[]> = {};
    for (const s of toneSemisArr) groups[s] = [];
    for (const m of pool) {
        const s = ((m % 12) + 12) % 12;
        if (groups[s]) groups[s].push(m);
    }
    for (const s of toneSemisArr) groups[s].sort((a, b) => a - b);

    const center = pool[Math.floor(pool.length / 2)];
    const nearestIn = (arr: number[], base: number): number | null => {
        if (!arr.length) return null;
        let best = arr[0], d = Math.abs(arr[0] - base);
        for (let i = 1; i < arr.length; i++) { const dd = Math.abs(arr[i] - base); if (dd < d) { d = dd; best = arr[i]; } }
        return best;
    };

    // const pickByRange = (arr: number[], k: number): number | null => {
    //     if (!arr || !arr.length) return null;
    //     switch (rangePreset.value) {
    //         case 'low': return arr[0];
    //         case 'high': return arr[arr.length - 1];
    //         case 'mid': return nearestIn(arr, center)!;
    //         case 'wide':
    //         default: return (k % 2 === 0) ? arr[0] : arr[arr.length - 1]; // alternate extremes
    //     }
    // };


    const baseOct = toneSemisArr.map(s => nearestIn(groups[s] ?? [], center)).filter((x): x is number => x !== null);
    let ladder = [...new Set(baseOct)].sort((a, b) => a - b);

    if (arpOctaves.value === 2) {
        const second: number[] = [];
        for (const s of toneSemisArr) {
            const g = groups[s] || []; const base = nearestIn(g, center);
            if (!g.length || base === null) continue;
            let higher = g.find(m => m > base);
            if (!higher) {
                const lower = g.slice().reverse().find(m => m < base);
                if (lower) higher = lower;
            }
            if (higher) second.push(higher);
        }
        ladder = [...new Set([...ladder, ...second])].sort((a, b) => a - b);
    }
    if (!ladder.length) return;

    const idx = ladder.map((_, i) => i);
    let orderIdx: number[] = [];
    switch (arpPattern.value) {
        case 'up': orderIdx = idx; break;
        case 'down': orderIdx = idx.slice().reverse(); break;
        case 'updown': {
            const up = idx;
            const down = idx.slice().reverse().slice(1, -1);
            orderIdx = up.concat(down.length ? down : []);
            break;
        }
        case 'random':
        default: {
            const rand = freshRng();                   // ⟵ was makeRng(seed.value * 97 + 13)
            // Fisher–Yates with our RNG (stable and unbiased)
            orderIdx = idx.slice();
            for (let i = orderIdx.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                [orderIdx[i], orderIdx[j]] = [orderIdx[j], orderIdx[i]];
            }
            break;
        }
    }
    const order = orderIdx.map(i => ladder[i]);
    if (!order.length) return;

    const groupSize = arpRate.value === '1/8' ? 2 : 1;
    const groupsOfIdx: number[][] = [];
    for (let k = 0; k < activeIdx.length; k += groupSize) groupsOfIdx.push(activeIdx.slice(k, k + groupSize));

    const seventhSemi = stepsArr.length >= 7 ? (rootSemi + stepsArr[6]) % 12 : null;
    const seventhCandidates = (seventhSemi != null) ? pool.filter(m => (((m % 12) + 12) % 12) === seventhSemi) : [];

    let p = 0;
    for (const g of groupsOfIdx) {
        if (!g.length) continue;
        const firstStep = g[0];
        let midi: number | undefined;

        if (arpSeventhOnDownbeat.value && seventhCandidates.length && (firstStep % 4 === 0)) {
            const m7 = nearestIn(seventhCandidates, center);
            if (m7 != null) midi = m7;
        }
        if (midi === undefined) { midi = order[p % order.length]; p++; }

        const hz = midiToFreq(midi);
        for (const stepIndex of g) out[stepIndex] = hz;
    }

    rememberBeforeWrite();
    emit('update:frequencies', out);
}

/* ---------- UI state & helpers ---------- */
// const tab = ref<'gen' | 'arp'>('gen');
const advancedOpen = ref(false);

// position for the header-anchored menu (viewport coords)
const advPos = ref<{ x: number; y: number } | null>(null);

/** Called from parent header button: melodyRef?.openAdvanced($event) */
function openAdvanced(e?: MouseEvent) {
    const r = (e?.currentTarget as HTMLElement | null)?.getBoundingClientRect?.();
    // anchor to right edge of the clicked header button
    advPos.value = r ? { x: Math.round(r.right + 8), y: Math.round(r.top) } : { x: 24, y: 24 };
    advancedOpen.value = true;
}

defineExpose({ openAdvanced });

// Close menu on outside ESC (already present)
// function onKey(e: KeyboardEvent) { if (e.key === 'Escape') advancedOpen.value = false; }
// (rest of your script stays the same)

// advanced options (now only here)
const applyScope = ref<'all' | 'active'>('active');
const startOnTonic = ref(false);
const emphasizeDownbeats = ref(true);
const seed = ref(1); // kept for deterministic “random” internal use

let clickNonce = 0;
// New RNG per click so results change every time
function freshRng() {
    // mix user's base seed with a per-click counter + time
    const mixed =
        (seed.value | 0) ^
        (++clickNonce * 0x9e3779b9) ^            // golden ratio odd constant
        (Date.now() & 0xffffffff);
    return makeRng(mixed);
}

// Undo buffer
const lastFrequencies = ref<number[] | null>(null);
function rememberBeforeWrite() { if (props.frequencies) lastFrequencies.value = props.frequencies.slice(); }
function undo() { if (lastFrequencies.value) emit('update:frequencies', lastFrequencies.value.slice()); }

// Close menu on outside ESC
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') advancedOpen.value = false; }
window.addEventListener('keydown', onKey, { capture: true });
onUnmounted(() => window.removeEventListener('keydown', onKey));

function resetAdvanced() {
    applyScope.value = 'active';
    startOnTonic.value = false;
    emphasizeDownbeats.value = true;
    arpSeventhOnDownbeat.value = false;
    //   advancedOpen.value = false;
}
</script>

<style scoped>
/* ========== LOCAL “MOCKUP SKIN” — only inside .mm-skin ========== */
.melody-maker {
    width: 100%;
    max-width: none;
    flex: 1 1 0;
}

/* Head grid */
.mm-head {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    /* was: 1fr 1fr 1fr auto */
    gap: 10px;
    align-items: end;
}

/* Field stack */
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

/* Hint text under head */
.mm-hint {
    margin-top: 6px;
    color: var(--pt-muted);
}

/* Mode + Generate row */
.mm-line {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 8px;
}

.mm-mode {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 160px;
}

/* Segmented control */
.mm-seg {
    display: flex;
    border-radius: 12px;
    overflow: hidden;
    background: #1d2030;
    border: 1px solid rgba(255, 255, 255, .08);
}

.mm-seg>button {
    min-width: 96px;
    height: 36px;
    padding: 0 12px;
    background: transparent;
    color: #aab0c0;
    border: 0;
    cursor: pointer;
    font-weight: 600;
}

.mm-seg>button.active {
    color: var(--pt-text);
    background: rgba(137, 180, 255, .14);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, .06) inset, 0 0 0 2px hsl(var(--pt-accent) 90% 60% / .18) inset;
}

/* Primary buttons */
.mm-primary {
    /* margin-left: auto;
    display: flex;
    display: inline-block; */
    display: block;
    /* gap: 8px;
    align-items: center;
    white-space: nowrap; */
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
    color: #0b0d12;
    background: linear-gradient(180deg, hsl(var(--pt-accent) 80% 60%), hsl(var(--pt-accent-2, var(--pt-accent)) 80% 60%));
    box-shadow: 0 6px 22px hsl(var(--pt-accent) 90% 60% / .25);
    width: 100%;
}

.mm-ghost-btn {
    color: var(--pt-text);
    background: #1d2030;
    border: 1px solid rgba(255, 255, 255, .08);
}

/* Arp block */
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

/* Footer actions */
.mm-actions {
    display: flex;
    display: inline-block;
    gap: 10px;
    align-items: center;
    margin-top: 12px;
}

/* 3-dot button */
.mm-three {
    position: relative;
    justify-self: end;
}

.mm-icon {
    height: 36px;
    width: 38px;
    border-radius: 12px;
    background: #1d2030;
    color: var(--pt-text);
    border: 1px solid rgba(255, 255, 255, .08);
    display: grid;
    place-items: center;
    cursor: pointer;
    line-height: 1;
    font-size: 18px;
}


/* Only wrap the whole row on small widths; otherwise keep single line */
@media (min-width: 720px) {
    .mm-line {
        flex-wrap: nowrap;
    }
}

/* Advanced menu (iOS switches) */
.mm-menu {
    position: fixed;
    /* right: 0;
    top: calc(100% + 8px); */
    min-width: 280px;
    background: #0e111a;
    color: var(--pt-text);
    border: 1px solid rgba(255, 255, 255, .08);
    border-radius: 12px;
    box-shadow: 0 12px 40px rgb(0 0 0 / .45);
    padding: 10px;
    z-index: 1000;
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

/* iOS-like switch */
.mm-switch {
    --sw: 38px;
    --kn: 18px;
    width: var(--sw);
    height: 22px;
    border-radius: 999px;
    background: #2a2f41;
    border: 1px solid rgba(255, 255, 255, .08);
    position: relative;
    cursor: pointer;
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

/* overlay to close */
.mm-overlay {
    position: fixed;
    inset: 0;
    z-index: 999;
}

/* ---------- Re-skin your PtSelect + buttons just inside this component ---------- */
:deep(.pt-selectbtn),
:deep(select.pt-select) {
    height: 36px;
    border-radius: 12px;
    background: #1d2030 !important;
    color: var(--pt-text) !important;
    border: 1px solid rgba(255, 255, 255, .08) !important;
    padding: 8px 36px 8px 12px !important;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .03), 0 2px 10px rgb(0 0 0 / .25) !important;
    font-size: .9rem;
}

/* Make the caret a simple dim chevron */
:deep(.pt-caret) {
    filter: none;
    color: #aab0c0;
    opacity: .95;
}

/* Ensure disabled ghost button looks right */
.mm-btn[disabled] {
    opacity: .5;
    cursor: not-allowed;
    box-shadow: none;
}

/* Responsive collapse like the mockup */
@media (max-width: 720px) {
    .mm-head {
        grid-template-columns: 1fr 1fr;
    }

    .mm-grid {
        grid-template-columns: 1fr 1fr;
    }
}
</style>

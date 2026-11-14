<!-- src/components/MelodyMaker.vue -->
<!-- The Melody Maker card (PR 76, option E2 of the mockups; no dropdowns). The keyboard picks the
     key, its scale's notes lit. Scale is a stepper (arrows step; a click on the name opens the
     whole list) beside Range (Narrow | Wide). A screen draws the pattern across the bar and
     what Generate would do: the band a melody stays in, or the arpeggio as outlines. Then
     Melody | Arpeggio and the chosen one's settings. Generate itself is in the card's header
     (DrumSequencer's SectionWrap tools; `generate` is exposed). -->
<template>
    <div class="melody-maker mm-skin" :class="props.currentTheme">
        <section class="pt-section mm-card">
            <div class="mm-kb-wrap">
                <div class="mm-field">
                    <div class="mm-label" id="mm-key-label">Key<span v-if="queuedKey" class="mm-queued-note"
                            role="status"> · {{ queuedKey }} at the next bar<span class="mm-shift-hint"> (Shift+click: now)</span></span></div>

                    <div class="mm-kb" role="radiogroup" :aria-labelledby="'mm-key-label'">
                        <div v-for="k in NATURALS" :key="k.n" class="kb-cell" :class="{ 'has-sharp': k.hasSharp }">
                            <!-- White key -->
                            <button type="button" class="kb-white"
                                :class="{ 'is-active': keyRoot === k.n, 'is-queued': queuedKey === k.n, 'in-scale': inScale(k.n) }"
                                role="radio" :aria-checked="keyRoot === k.n ? 'true' : 'false'" @click="chooseKey(k.n, $event)"
                                :title="keyTitle(k.n)">
                                <span class="wlabel">{{ k.n }}</span>
                            </button>

                            <!-- Black key -->
                            <button v-if="k.hasSharp && k.sharp" type="button" class="kb-black"
                                :class="{ 'is-active': keyRoot === k.sharp, 'is-queued': queuedKey === k.sharp, 'in-scale': inScale(k.sharp) }" role="radio"
                                :aria-checked="keyRoot === k.sharp ? 'true' : 'false'" @click="chooseKey(k.sharp, $event)"
                                :title="keyTitle(k.sharp)">
                                <span class="blabel">{{ k.sharp }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Scale (a stepper) and Range (Narrow | Wide: for a melody and an arpeggio alike) -->
            <div class="mm-row mm-scale-row">
                <span class="mm-cap">Scale</span>
                <div class="mm-stepper" role="group" aria-label="Scale" :title="'Scale'">
                    <button type="button" class="hw-cap hw-cap-sm mm-step" aria-label="Previous" @click="stepScale(-1)">◂</button>
                    <button type="button" class="mm-step-name" :aria-label="`Scale: ${scaleShort}`" aria-haspopup="listbox"
                        :aria-expanded="openList === 'scale'" @click.stop="openList = openList === 'scale' ? null : 'scale'">
                        <span>{{ scaleShort }}</span><span class="mm-caret" aria-hidden="true">▾</span></button>
                    <button type="button" class="hw-cap hw-cap-sm mm-step" aria-label="Next" @click="stepScale(1)">▸</button>
                    <div v-if="openList === 'scale'" class="mm-list" role="listbox" aria-label="Scale">
                        <button v-for="o in SCALE_CHOICES" :key="String(o.value)" type="button" role="option" class="mm-list-item" :class="{ on: o.value === keyScale }"
                            :aria-selected="o.value === keyScale" @click.stop="chooseScale(o.value); openList = null">{{ o.long ?? o.label }}</button>
                    </div>
                </div>
                <div class="pt-seg pt-seg-sm mm-seg mm-range" role="radiogroup" aria-label="Range" title="Range">
                    <button type="button" class="pt-seg-btn hw-led-top" :class="{ 'is-active': rangePreset !== 'wide' }" role="radio"
                        :aria-checked="rangePreset !== 'wide' ? 'true' : 'false'" title="Narrow: notes stay within two octaves" @click="rangePreset = 'mid'">Narrow</button>
                    <button type="button" class="pt-seg-btn hw-led-top" :class="{ 'is-active': rangePreset === 'wide' }" role="radio"
                        :aria-checked="rangePreset === 'wide' ? 'true' : 'false'" title="Wide: notes from the pads' whole range" @click="rangePreset = 'wide'">Wide</button>
                </div>
            </div>

            <!-- The screen: the pattern across the bar (each step that's on, at its pitch, in its
                 pad's colour), a line for every octave of the key, and what Generate would do -->
            <div class="mm-screen" role="img" :aria-label="screenLabel">
                <svg class="mm-roll" :viewBox="`0 0 ${ROLL_W} ${ROLL_H}`" preserveAspectRatio="none" aria-hidden="true">
                    <rect v-if="roll.band" x="0" :y="roll.band.y" :width="ROLL_W" :height="roll.band.h" class="mm-band" />
                    <line v-for="y in roll.rows" :key="'r' + y" x1="0" :x2="ROLL_W" :y1="y" :y2="y" class="mm-rowline" />
                    <line v-for="b in [4, 8, 12]" :key="'b' + b" :x1="b * ROLL_W / 16" :x2="b * ROLL_W / 16" y1="0" :y2="ROLL_H" class="mm-beat" />
                    <rect v-for="n in roll.ghost" :key="'g' + n.i" :x="n.x + 1.5" :y="n.y - 2.5" :width="ROLL_W / 16 - 3" height="5" rx="1" class="mm-ghost" />
                    <rect v-for="n in roll.notes" :key="'n' + n.i" :x="n.x + 1.5" :y="n.y - 2.5" :width="ROLL_W / 16 - 3" height="5" rx="1"
                        class="mm-note" :style="{ fill: n.colour }" />
                </svg>
                <span class="mm-read mm-read--l" aria-hidden="true">{{ keyRoot }} {{ scaleShort }}</span>
                <span class="mm-read mm-read--r" aria-hidden="true">{{ screenNote }}</span>
            </div>

            <!-- What Generate makes: random notes, or an arpeggio. Both panels sit in the same
                 place, the one not chosen hidden, so the card is as tall in both modes. -->
            <div class="mm-group">
                <div class="pt-seg pt-seg-sm mm-mode" role="group" aria-label="Generate">
                    <button type="button" class="pt-seg-btn hw-led-top" :class="{ 'is-active': mode === 'random' }"
                        :aria-pressed="mode === 'random'" @click="mode = 'random'">Melody</button>
                    <button type="button" class="pt-seg-btn hw-led-top" :class="{ 'is-active': mode === 'arp' }"
                        :aria-pressed="mode === 'arp'" @click="mode = 'arp'">Arpeggio</button>
                </div>

                <div class="mm-mode-body">
                    <!-- Melody: which pads it fills -->
                    <div class="mm-mode-panel" :class="{ 'is-hidden': mode !== 'random' }">
                        <div class="mm-opts">
                            <button type="button" class="mm-toggle hw-cap hw-cap-sm hw-led-left" :class="{ on: applyScope === 'active' }"
                                :aria-pressed="applyScope === 'active' ? 'true' : 'false'"
                                title="On: Generate gives notes to the pads that are on. Off: to every pad"
                                @click="applyScope = applyScope === 'active' ? 'all' : 'active'">Active Pads Only</button>
                        </div>
                        <p class="mm-mode-note">{{ randomNote }}</p>
                    </div>
                    <!-- Arpeggio: words on steppers (Pattern, Tones), numbers on switches (Rate,
                         Octaves), and Skip -->
                    <div class="mm-mode-panel" :class="{ 'is-hidden': mode !== 'arp' }">
                        <div class="mm-row">
                            <div class="mm-stepper" role="group" aria-label="Arp pattern" :title="'Arp pattern'">
                    <button type="button" class="hw-cap hw-cap-sm mm-step" aria-label="Previous" @click="stepPattern(-1)">◂</button>
                    <button type="button" class="mm-step-name" :aria-label="`Arp pattern: ${patternLabel}`" aria-haspopup="listbox"
                        :aria-expanded="openList === 'pattern'" @click.stop="openList = openList === 'pattern' ? null : 'pattern'">
                        <span>{{ patternLabel }}</span><span class="mm-caret" aria-hidden="true">▾</span></button>
                    <button type="button" class="hw-cap hw-cap-sm mm-step" aria-label="Next" @click="stepPattern(1)">▸</button>
                    <div v-if="openList === 'pattern'" class="mm-list mm-list--up" role="listbox" aria-label="Arp pattern">
                        <button v-for="o in arpPatternOptions" :key="String(o.value)" type="button" role="option" class="mm-list-item" :class="{ on: o.value === arpPattern }"
                            :aria-selected="o.value === arpPattern" @click.stop="setPattern(o.value); openList = null">{{ o.long ?? o.label }}</button>
                    </div>
                </div>
                            <div class="mm-stepper" role="group" aria-label="Arp tones" :title="'Arp tones'">
                    <button type="button" class="hw-cap hw-cap-sm mm-step" aria-label="Previous" @click="stepTones(-1)">◂</button>
                    <button type="button" class="mm-step-name" :aria-label="`Arp tones: ${tonesLabel}`" aria-haspopup="listbox"
                        :aria-expanded="openList === 'tones'" @click.stop="openList = openList === 'tones' ? null : 'tones'">
                        <span>{{ tonesLabel }}</span><span class="mm-caret" aria-hidden="true">▾</span></button>
                    <button type="button" class="hw-cap hw-cap-sm mm-step" aria-label="Next" @click="stepTones(1)">▸</button>
                    <div v-if="openList === 'tones'" class="mm-list mm-list--up" role="listbox" aria-label="Arp tones">
                        <button v-for="o in arpToneOptions" :key="String(o.value)" type="button" role="option" class="mm-list-item" :class="{ on: o.value === arpTones }"
                            :aria-selected="o.value === arpTones" @click.stop="setTones(o.value); openList = null">{{ o.long ?? o.label }}</button>
                    </div>
                </div>
                        </div>
                        <div class="mm-row">
                            <div class="pt-seg pt-seg-sm mm-seg" role="radiogroup" aria-label="Arp rate" title="Arp rate">
                            <button v-for="o in arpRateOptions" :key="String(o.value)" type="button" class="pt-seg-btn hw-led-top" :class="{ 'is-active': arpRate === o.value }"
                                role="radio" :aria-checked="arpRate === o.value ? 'true' : 'false'" @click="arpRate = o.value">{{ o.label }}</button>
                        </div>
                            <span class="mm-cap">Octaves</span>
                            <div class="pt-seg pt-seg-sm mm-seg" role="radiogroup" aria-label="Arp octaves" title="Arp octaves">
                            <button v-for="o in arpOctaveOptions" :key="String(o.value)" type="button" class="pt-seg-btn hw-led-top" :class="{ 'is-active': arpOctaves === o.value }"
                                role="radio" :aria-checked="arpOctaves === o.value ? 'true' : 'false'" @click="arpOctaves = o.value">{{ o.label }}</button>
                        </div>
                            <button type="button" class="mm-toggle hw-cap hw-cap-sm hw-led-left" :class="{ on: arpSkip }"
                                :aria-pressed="arpSkip ? 'true' : 'false'"
                                title="Skip every other tone: 1-5-3-7 instead of 1-3-5-7, wider leaps"
                                @click="arpSkip = !arpSkip">Skip</button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineExpose, onMounted, onBeforeUnmount } from 'vue';
import { padHue } from '../lib/padColour';
import { rollY, rootOctavesHz, rollNotes, ghostNotes, type RollNote } from '../lib/melody/roll';
import { ROOTS, SCALES, NOTE_TO_SEMITONE } from '../lib/melody/theory';
import { arpSlots, arpSequence, arpRateFrom, type ArpRate } from '../lib/melody/arp';

// The arpeggio's tones: Chord (1-3-5), 7th chord (1-3-5-7; PR 68, in place of the ⋯ menu's
// "7th on downbeats", which put the 7th on every beat and sounded repetitive) or the whole scale
type ArpTones = 'chord' | 'seventh' | 'scale';

const props = defineProps<{
    frequencies?: number[];
    steps?: boolean[];
    minFreq?: number;
    maxFreq?: number;
    currentTheme?: string;

    initialKeyRoot?: 'C' | 'C#' | 'D' | 'Eb' | 'E' | 'F' | 'F#' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';
    initialKeyScale?:
    | 'none'
    | 'major'
    | 'naturalMinor'
    | 'pentMajor'
    | 'pentMinor'
    | 'dorian'
    | 'lydian'
    | 'mixolydian';

    initialRangePreset?: 'low' | 'mid' | 'high' | 'wide';

    initialArpPattern?: 'up' | 'down' | 'updown' | 'random';
    initialArpRate?: string;
    initialArpOctaves?: 1 | 2 | 3;
    initialArpTones?: ArpTones;
    initialArpSkip?: boolean;
    initialActiveOnly?: boolean;
    initialMode?: 'random' | 'arp';
    // A key clicked while playing waits for the next bar (DrumSequencer's BAR QUEUE) and blinks
    queuedKey?: string | null;
}>();

/*  Defaults  */

const emit = defineEmits<{
    (e: 'update:frequencies', v: number[]): void;
    (e: 'update:steps', v: boolean[]): void; // an arpeggio sets which steps play (its Rate)
    (e: 'octave-shift', delta: number): void;
    (e: 'key-root-change', root: typeof ROOTS[number]): void;
    (e: 'key-scale-change', scale: KeyScale): void;
    (e: 'range-preset-change', preset: PresetKey): void;
    (e: 'arp-pattern-change', v: 'up' | 'down' | 'updown' | 'random'): void;
    (e: 'arp-rate-change', v: ArpRate): void;
    (e: 'arp-octaves-change', v: 1 | 2 | 3): void;
    (e: 'arp-tones-change', v: ArpTones): void;
    (e: 'arp-skip-change', v: boolean): void;
    (e: 'active-only-change', v: boolean): void;
    (e: 'mode-change', v: 'random' | 'arp'): void;
    // Someone picked a key or a scale (not a project loading): the pads follow it
    (e: 'key-chosen', root: RootNote, now: boolean): void; // now: Shift+click, don't wait for the bar
    (e: 'scale-chosen', change: { from: KeyScale; to: KeyScale }): void;
}>();

/*  Theory (src/lib/melody/theory.ts)  */
type RootNote = typeof ROOTS[number];
const SCALE_STEPS: Record<string, readonly number[]> = SCALES;

const SCALE_LABELS: Record<string, string> = {
    major: 'Major',
    naturalMinor: 'Minor',
    pentMajor: 'Pentatonic Major',
    pentMinor: 'Pentatonic Minor',
    lydian: 'Major / Lydian',
    dorian: 'Minor / Dorian',
    mixolydian: 'Major / Mixolydian'
};

const keyRoot = ref<RootNote>(props.initialKeyRoot ?? 'A');
type KeyScale = 'none' | keyof typeof SCALES;
const keyScale = ref<KeyScale>(props.initialKeyScale ?? 'none');

const NATURALS: Array<{
    n: Extract<RootNote, 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'>;
    hasSharp: boolean;
    sharp?: RootNote;
}> = [
        { n: 'C', hasSharp: true, sharp: 'C#' },
        { n: 'D', hasSharp: true, sharp: 'Eb' },
        { n: 'E', hasSharp: false },
        { n: 'F', hasSharp: true, sharp: 'F#' },
        { n: 'G', hasSharp: true, sharp: 'Ab' },
        { n: 'A', hasSharp: true, sharp: 'Bb' },
        { n: 'B', hasSharp: false }
    ];

const SHARP_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
const preferFlat = computed(
    () => keyRoot.value.includes('b') || FLAT_KEYS.has(keyRoot.value)
);
const NAMES = computed(() =>
    preferFlat.value ? FLAT_NOTE_NAMES : SHARP_NOTE_NAMES
);
const midiToName = (m: number) =>
    `${NAMES.value[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

type PresetKey = 'low' | 'mid' | 'high' | 'wide';
const PRESETS: Record<PresetKey, { minOct: number; maxOct: number; label: string }> = {
    low: { minOct: 2, maxOct: 3, label: 'Low' },
    mid: { minOct: 3, maxOct: 4, label: 'Mid' },
    high: { minOct: 4, maxOct: 5, label: 'High' },
    wide: { minOct: 2, maxOct: 6, label: 'Wide' }
};

const rangePreset = ref<PresetKey>(props.initialRangePreset ?? 'wide');
const minOctave = ref(3);
const maxOctave = ref(6);

watch(
    rangePreset,
    (k) => {
        const p = PRESETS[k];
        minOctave.value = p.minOct;
        maxOctave.value = p.maxOct;
    },
    { immediate: true }
);

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const freqToMidi = (f: number) =>
    Math.round(69 + 12 * Math.log2(f / 440));

function buildCandidateMidiPool(
    root: string,
    scaleName: string,
    minOct: number,
    maxOct: number,
    fMin: number,
    fMax: number
) {
    const steps = SCALE_STEPS[scaleName] ?? SCALES.major;
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

// THE CARD (PR 76) START
type Choice<T> = { value: T; label: string; long?: string };

// The scales, as the stepper's window names them (short) and as its list does (long)
const SCALE_CHOICES: Choice<KeyScale>[] = [
    { value: 'none', label: 'None' },
    { value: 'major', label: 'Major' },
    { value: 'naturalMinor', label: 'Minor' },
    { value: 'pentMajor', label: 'Pent Maj', long: 'Pentatonic Major' },
    { value: 'pentMinor', label: 'Pent Min', long: 'Pentatonic Minor' },
    { value: 'lydian', label: 'Lydian' },
    { value: 'dorian', label: 'Dorian' },
    { value: 'mixolydian', label: 'Mixolyd', long: 'Mixolydian' },
];
const scaleShort = computed(() => SCALE_CHOICES.find((o) => o.value === keyScale.value)?.label ?? '');

// A stepper: its arrows go to the neighbouring choice (round the ends); a click on its name
// opens the whole list (openList), which a click elsewhere or Esc closes
function neighbour<T>(opts: readonly Choice<T>[], cur: T, d: number): T {
    const i = Math.max(0, opts.findIndex((o) => o.value === cur));
    return opts[(i + d + opts.length) % opts.length].value;
}
const openList = ref<null | 'scale' | 'pattern' | 'tones'>(null);
const closeList = () => { openList.value = null; };
const onListKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeList(); };
onMounted(() => { document.addEventListener('click', closeList); window.addEventListener('keydown', onListKey); });
onBeforeUnmount(() => { document.removeEventListener('click', closeList); window.removeEventListener('keydown', onListKey); });

function stepScale(d: number) { chooseScale(neighbour(SCALE_CHOICES, keyScale.value, d)); }
function stepPattern(d: number) { arpPattern.value = neighbour(arpPatternOptions, arpPattern.value, d); }
function stepTones(d: number) { arpTones.value = neighbour(arpToneOptions, arpTones.value, d); }
function setPattern(v: ArpPattern) { arpPattern.value = v; }
function setTones(v: ArpTones) { arpTones.value = v; }
const patternLabel = computed(() => arpPatternOptions.find((o) => o.value === arpPattern.value)?.label ?? '');
const tonesLabel = computed(() => arpToneOptions.find((o) => o.value === arpTones.value)?.label ?? '');

// Is this key's note in the scale? Those keys are lit
function inScale(note: string) {
    if (keyScale.value === 'none') return false;
    const rel = ((NOTE_TO_SEMITONE[note] ?? 0) - (NOTE_TO_SEMITONE[keyRoot.value] ?? 0) + 12) % 12;
    return (SCALE_STEPS[keyScale.value] ?? []).includes(rel);
}

// The screen (src/lib/melody/roll.ts): the pattern, a line for each octave of the key, and
// what Generate would do: for a melody (random, so it can't be drawn) the band of notes it
// picks from, which is what Narrow and Wide change; for an arpeggio the notes it would write,
// as outlines, where they differ from the pattern (the Random pattern is shuffled afresh on
// every Generate, so it has none)
const ROLL_W = 352;
const ROLL_H = 120;
const roll = computed(() => {
    const lo = props.minFreq ?? 100, hi = props.maxFreq ?? 2000;
    const y = (hz: number) => rollY(hz, lo, hi, ROLL_H);
    const place = (notes: RollNote[]) => notes.map((n) => ({ i: n.i, x: (n.i * ROLL_W) / 16, y: y(n.hz), colour: `hsl(${padHue(n.hz)} 90% 62%)` }));
    const now = rollNotes(props.frequencies ?? [], props.steps ?? []);

    let band: { y: number; h: number } | null = null;
    let ghost: RollNote[] = [];
    if (mode.value === 'random') {
        const pool = keyScale.value === 'none' ? []
            : buildCandidateMidiPool(keyRoot.value, keyScale.value, minOctave.value, maxOctave.value, lo, hi);
        if (pool.length) {
            const top = y(midiToFreq(Math.max(...pool))), bottom = y(midiToFreq(Math.min(...pool)));
            band = { y: top - 4, h: bottom - top + 8 };
        }
    } else {
        const next = bakeArp(true);
        if (next) ghost = ghostNotes(now, rollNotes(next.freqs, next.steps));
    }
    return {
        rows: rootOctavesHz(NOTE_TO_SEMITONE[keyRoot.value] ?? 0, lo, hi).map(y),
        notes: place(now),
        ghost: place(ghost),
        band,
    };
});
const screenNote = computed(() => (mode.value === 'arp'
    ? `${patternLabel.value} · ${arpRate.value}${arpPattern.value === 'random' ? ' · shuffled on Generate' : ''}`
    : poolSummary.value));
const screenLabel = computed(() => {
    const on = roll.value.notes.length;
    const what = mode.value === 'arp'
        ? (roll.value.ghost.length ? `Generate would write an arpeggio: ${patternLabel.value}, ${arpRate.value}` : `Arpeggio: ${patternLabel.value}, ${arpRate.value}`)
        : `A melody would use ${poolSummary.value}`;
    return `${keyRoot.value} ${scaleShort.value}. ${on} ${on === 1 ? 'step' : 'steps'} on. ${what}.`;
});
// THE CARD END

const poolSummary = computed(() => {
    const fMin = props.minFreq ?? 100;
    const fMax = props.maxFreq ?? 2000;

    if (keyScale.value === 'none') {
        const pref = preferredOctaveForPreset(rangePreset.value);
        if (pref === 'random') {
            return `${keyRoot.value} • random octaves`;
        }
        const semi = NOTE_TO_SEMITONE[keyRoot.value] ?? 0;
        let oct = pref;
        const inRange = (o: number) => {
            const m = 12 * (o + 1) + semi;
            const f = midiToFreq(m);
            return f >= fMin && f <= fMax;
        };
        if (!inRange(oct)) {
            for (const tryOct of [oct - 1, oct + 1, oct - 2, oct + 2]) {
                if (tryOct >= 0 && inRange(tryOct)) {
                    oct = tryOct;
                    break;
                }
            }
        }
        const m = 12 * (oct + 1) + semi;
        return `${midiToName(m)} only`;
    }

    const pool = buildCandidateMidiPool(
        keyRoot.value,
        keyScale.value,
        minOctave.value,
        maxOctave.value,
        fMin,
        fMax
    );
    if (!pool.length) return '';
    return `${midiToName(pool[0])}–${midiToName(pool[pool.length - 1])} • ${pool.length
        } notes`;
});

watch(
    keyRoot,
    (v) => emit('key-root-change', v),
    { immediate: true }
);
watch(
    keyScale,
    (v) => emit('key-scale-change', v),
    { immediate: true }
);
watch(
    rangePreset,
    (v) => emit('range-preset-change', v),
    { immediate: true }
);

watch(
    () => props.initialKeyRoot,
    (v) => {
        if (v && v !== keyRoot.value) keyRoot.value = v as RootNote;
    }
);
watch(
    () => props.initialKeyScale,
    (v) => {
        if (v && v !== keyScale.value) keyScale.value = v as KeyScale;
    }
);
watch(
    () => props.initialRangePreset,
    (v) => {
        if (v && v !== rangePreset.value) rangePreset.value = v as PresetKey;
    }
);

// A key or scale picked here: the parent moves the pads (key-chosen, scale-chosen) and plays
// the key; a project loading sets keyRoot and keyScale through the initial-* props instead.
// The key lights once the parent has moved to it (initialKeyRoot): while playing, at the next
// bar (it blinks until then, queuedKey), or at once with Shift+click
function chooseKey(root: RootNote | undefined, e?: MouseEvent) {
    if (!root) return;
    emit('key-chosen', root, !!e?.shiftKey);
}
function chooseScale(v: string | number) {
    const to = v as KeyScale;
    if (to === keyScale.value) return;
    emit('scale-chosen', { from: keyScale.value, to });
    keyScale.value = to;
}
const keyTitle = (root: string) => (root === keyRoot.value
    ? `${root}: the key now (click to hear it)`
    : root === props.queuedKey
        ? `Key of ${root}: the pattern moves at the next bar (Shift+click: now)`
        : `Key of ${root}: moves the pattern to ${root} (while playing, at the next bar; Shift+click: now)`);

// What Generate makes, saved with the project like the arpeggio's settings
const mode = ref<'random' | 'arp'>(props.initialMode ?? 'random');
watch(mode, (v) => emit('mode-change', v));
watch(() => props.initialMode, (v) => { if (v) mode.value = v; });
const randomNote = computed(() => (keyScale.value === 'none'
    ? `No scale chosen: every pad gets ${keyRoot.value}, in the range's octaves. Pick a scale for a melody.`
    : 'Random notes from the scale and range above; the first pad that\'s on gets the key.'));
function generate() {
    if (mode.value === 'arp') bakeArp();
    else smartGenerate();
}

// RNG helpers
function makeRng(s: number) {
    return () => {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | s);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let clickNonce = 0;
const seed = ref(1);

function freshRng() {
    const mixed =
        (seed.value | 0) ^
        ++clickNonce * 0x9e3779b9 ^
        (Date.now() & 0xffffffff);
    return makeRng(mixed);
}

// Always-on: start on tonic
const startOnTonic = ref(true);

// Smart generator
function smartGenerate(): void {
    if (!props.frequencies || !props.frequencies.length) return;

    const out = props.frequencies.slice();

    const stepsMask =
        applyScope.value === 'active' &&
            props.steps &&
            props.steps.length === out.length
            ? props.steps
            : out.map(() => true);

    // No scale: lock everything to the key root in some octave(s)
    if (keyScale.value === 'none') {
        const fMin = props.minFreq ?? 100;
        const fMax = props.maxFreq ?? 2000;

        const pickOct = (): number => {
            const pref = preferredOctaveForPreset(rangePreset.value);
            if (pref === 'random') {
                const lo = PRESETS.wide.minOct;
                const hi = PRESETS.wide.maxOct;
                return Math.floor(lo + Math.random() * (hi - lo + 1));
            }
            return pref;
        };

        const semi = NOTE_TO_SEMITONE[keyRoot.value] ?? 0;

        for (let i = 0; i < out.length; i++) {
            if (!stepsMask[i]) continue;

            let oct = pickOct();

            const clampIntoRange = (o: number): number => {
                const midi = 12 * (o + 1) + semi;
                const f = midiToFreq(midi);
                if (f >= fMin && f <= fMax) return o;
                for (const tryOct of [
                    o - 1,
                    o + 1,
                    o - 2,
                    o + 2,
                    o - 3,
                    o + 3
                ]) {
                    if (tryOct < 0) continue;
                    const m = 12 * (tryOct + 1) + semi;
                    const ff = midiToFreq(m);
                    if (ff >= fMin && ff <= fMax) return tryOct;
                }
                return o;
            };

            oct = clampIntoRange(oct);
            const midi = 12 * (oct + 1) + semi;
            const hz = midiToFreq(midi);
            out[i] = Math.max(fMin, Math.min(fMax, hz));
        }

        emit('update:frequencies', out);
        return;
    }

    // Scale modes (random style only)
    const freqMin = props.minFreq ?? 100;
    const freqMax = props.maxFreq ?? 2000;
    const pool = buildCandidateMidiPool(
        keyRoot.value,
        keyScale.value,
        minOctave.value,
        maxOctave.value,
        freqMin,
        freqMax
    ).sort((a, b) => a - b);
    if (!pool.length) return;

    const stepsArr = SCALE_STEPS[keyScale.value] ?? SCALES.major;
    const rootSemi = NOTE_TO_SEMITONE[keyRoot.value] ?? 0;

    const tonicSemi = (rootSemi + stepsArr[0]) % 12;
    const tonicCandidates = pool.filter(
        (m) => (((m % 12) + 12) % 12) === tonicSemi
    );

    const center = pool[Math.floor(pool.length / 2)];
    const firstActive = stepsMask.findIndex(Boolean);

    const rand = freshRng();

    if (startOnTonic.value && firstActive >= 0 && tonicCandidates.length) {
        const m = tonicCandidates.reduce(
            (best, cur) =>
                Math.abs(cur - center) < Math.abs(best - center) ? cur : best,
            tonicCandidates[0]
        );
        out[firstActive] = midiToFreq(m);
    }

    for (let i = 0; i < out.length; i++) {
        if (!stepsMask[i]) continue;
        if (
            startOnTonic.value &&
            i === firstActive &&
            tonicCandidates.length
        ) {
            continue;
        }
        const midi = pool[Math.floor(rand() * pool.length)];
        out[i] = midiToFreq(midi);
    }

    emit('update:frequencies', out);
}

function preferredOctaveForPreset(p: PresetKey): number | 'random' {
    if (p === 'low') return 3;
    if (p === 'mid') return 4;
    if (p === 'high') return 5;
    return 'random'; // 'wide'
}

// helper to clamp arp octaves to 1–3
function clampArpOctaves(v: number | undefined): 1 | 2 | 3 {
    if (!v || v <= 1) return 1;
    if (v >= 3) return 3;
    return 2;
}

// Arpeggiator
const arpPattern = ref<'up' | 'down' | 'updown' | 'random'>(
    props.initialArpPattern ?? 'up'
);
const arpRate = ref<ArpRate>(
    arpRateFrom(props.initialArpRate) ?? '1/16'
);
const arpOctaves = ref<1 | 2 | 3>(
    clampArpOctaves(props.initialArpOctaves)
);
const arpTones = ref<ArpTones>(
    props.initialArpTones ?? 'chord'
);
// Skip every other tone of the ladder (1-5-3-7…): a toggle on the card since PR 68, saved
const arpSkip = ref<boolean>(props.initialArpSkip ?? false);
const arpStride = computed<1 | 2>(() => (arpSkip.value ? 2 : 1));

// Report arp settings to the parent so they're saved with the project, and follow the
// parent's values when a project is loaded (the same pattern as key, scale and range).
watch(arpPattern, (v) => emit('arp-pattern-change', v));
watch(arpRate, (v) => emit('arp-rate-change', v));
watch(arpOctaves, (v) => emit('arp-octaves-change', v));
watch(arpTones, (v) => emit('arp-tones-change', v));

watch(() => props.initialArpPattern, (v) => { if (v) arpPattern.value = v; });
watch(() => props.initialArpRate, (v) => { const r = arpRateFrom(v); if (r) arpRate.value = r; });
watch(() => props.initialArpOctaves, (v) => { if (v) arpOctaves.value = clampArpOctaves(v); });
watch(() => props.initialArpTones, (v) => { if (v) arpTones.value = v; });
watch(arpSkip, (v) => emit('arp-skip-change', v));
watch(() => props.initialArpSkip, (v) => { if (typeof v === 'boolean') arpSkip.value = v; });

type ArpPattern = 'up' | 'down' | 'updown' | 'random';
const arpPatternOptions: Choice<ArpPattern>[] = [
    { label: 'Up', value: 'up' },
    { label: 'Down', value: 'down' },
    { label: 'Up/Down', value: 'updown' },
    { label: 'Random', value: 'random' }
];
const arpRateOptions = [
    { label: '1/8', value: '1/8' },
    { label: '1/16', value: '1/16' }
] as const;
const arpOctaveOptions = [
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3', value: 3 }
] as const;
// The tones name themselves (PR 76: their stepper has no caption, and a bare "Scale" under the
// Scale stepper would confuse)
const arpToneOptions: Choice<ArpTones>[] = [
    { label: 'Chord', long: 'Chord: 1-3-5', value: 'chord' },
    { label: '7th chord', long: '7th chord: 1-3-5-7', value: 'seventh' },
    { label: 'Whole scale', value: 'scale' }
];

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
    let best = 0;
    let d = Math.abs(arr[0] - base);
    for (let i = 1; i < arr.length; i++) {
        const dd = Math.abs(arr[i] - base);
        if (dd < d) {
            d = dd;
            best = i;
        }
    }
    return best;
}

function pickBaseTonicByRange(tonicGroup: number[], centerMidi: number): number {
    if (!tonicGroup.length) return centerMidi;
    switch (rangePreset.value) {
        case 'low':
            return tonicGroup[0];
        case 'high':
            return tonicGroup[tonicGroup.length - 1];
        case 'mid': {
            const idx = Math.min(
                tonicGroup.length - 1,
                Math.ceil((tonicGroup.length - 1) / 2)
            );
            return tonicGroup[idx];
        }
        case 'wide':
        default: {
            const i0 = nearestIndexIn(tonicGroup, centerMidi) ?? 0;
            return tonicGroup[i0];
        }
    }
}

function bakeArp(dry = false): { steps: boolean[]; freqs: number[] } | void {
    if (!props.frequencies || !props.frequencies.length) return;

    // Rate places the notes (src/lib/melody/arp.ts): a note on every step at 1/16, every other
    // at 1/8; the steps between go off. "Active Pads Only" is the Melody
    // mode's: an arpeggio sets its own rhythm.
    const out = props.frequencies.slice();
    const slots = arpSlots(out.length, arpRate.value);

    const fMin = props.minFreq ?? 100;
    const fMax = props.maxFreq ?? 2000;

    const pool = buildCandidateMidiPool(
        keyRoot.value,
        keyScale.value,
        minOctave.value,
        maxOctave.value,
        fMin,
        fMax
    ).sort((a, b) => a - b);
    if (!pool.length) return;

    const stepsArr = SCALE_STEPS[keyScale.value] ?? SCALES.major;
    const rootSemi = NOTE_TO_SEMITONE[keyRoot.value] ?? 0;
    const center = pool[Math.floor(pool.length / 2)];

    const toneSemitones = (mode: ArpTones): number[] => {
        if (mode === 'scale')
            return Array.from(
                new Set(stepsArr.map((s) => (rootSemi + s) % 12))
            );
        const chordIdx = mode === 'seventh' ? [0, 2, 4, 6] : [0, 2, 4]; // 1-3-5(-7)
        const semis = chordIdx
            .filter((i) => i < stepsArr.length)
            .map((i) => (rootSemi + stepsArr[i]) % 12);
        return Array.from(new Set(semis));
    };
    const degreeSemis = toneSemitones(arpTones.value);

    const groupsBySemi: Record<number, number[]> = {};
    for (const s of degreeSemis) groupsBySemi[s] = [];
    for (const m of pool) {
        const s = (((m % 12) + 12) % 12);
        if (groupsBySemi[s]) groupsBySemi[s].push(m);
    }
    for (const s of degreeSemis) groupsBySemi[s].sort((a, b) => a - b);

    const tonicSemi = (rootSemi + (stepsArr[0] ?? 0)) % 12;
    const tonicGroup = groupsBySemi[tonicSemi] || [];

    // ceiling pick helper
    const pickAtOrAbove = (g: number[], targetBase: number): number | null => {
        if (!g.length) return null;
        const idx = g.findIndex((m) => m >= targetBase);
        if (idx !== -1) return g[idx];
        return g[g.length - 1];
    };

    let ladder: number[] = [];
    let startTonicPick: number | null = null;

    if (tonicGroup.length) {
        const baseTonic = pickBaseTonicByRange(tonicGroup, center);

        for (let oct = 0; oct < arpOctaves.value; oct++) {
            const targetBase = baseTonic + 12 * oct;

            for (const s of degreeSemis) {
                const g = groupsBySemi[s] || [];
                if (!g.length) continue;

                const pick = pickAtOrAbove(g, targetBase);
                if (pick == null) continue;

                if (s === tonicSemi && oct === 0 && startTonicPick == null) {
                    startTonicPick = pick;
                }
                ladder.push(pick);
            }
        }

        ladder = [...new Set(ladder)].sort((a, b) => a - b);
        if (!ladder.length) return;
    } else {
        for (const s of degreeSemis) {
            const g = groupsBySemi[s] || [];
            if (!g.length) continue;
            const i0 = nearestIndexIn(g, center);
            if (i0 != null) ladder.push(g[i0]);
        }
        ladder = [...new Set(ladder)].sort((a, b) => a - b);
        if (!ladder.length) return;
    }

    // Stride then rotate to start on tonic
    const baseIdxRaw = indicesWithStride(ladder.length, arpStride.value);

    const tonicIdxInLadder = (() => {
        if (startTonicPick != null) {
            const exact = ladder.indexOf(startTonicPick);
            if (exact !== -1) return exact;
            const near = nearestIndexIn(ladder, startTonicPick);
            return near ?? 0;
        }
        return 0;
    })();

    const posInStrided = baseIdxRaw.indexOf(tonicIdxInLadder);
    const rotateBy =
        posInStrided !== -1
            ? posInStrided
            : nearestIndexIn(baseIdxRaw, tonicIdxInLadder) ?? 0;

    const baseIdx = rotate(baseIdxRaw, rotateBy);

    // Pattern ordering
    let orderIdx: number[] = [];
    switch (arpPattern.value) {
        case 'up': {
            orderIdx = baseIdx;
            break;
        }
        case 'down': {
            orderIdx = baseIdx.slice().reverse();
            break;
        }
        case 'updown': {
            const up = baseIdx;
            const down = baseIdx.slice().reverse().slice(1, -1);
            orderIdx = up.concat(down.length ? down : []);
            break;
        }
        case 'random':
        default: {
            if (dry) return; // shuffled afresh each time: nothing to preview
            orderIdx = baseIdx.slice();
            const r = freshRng();
            for (let i = orderIdx.length - 1; i > 0; i--) {
                const j = Math.floor(r() * (i + 1));
                [orderIdx[i], orderIdx[j]] = [orderIdx[j], orderIdx[i]];
            }
        }
    }
    const order = orderIdx.map((i) => ladder[i]);
    if (!order.length) return;

    // One note per slot: the cycle fitted to the bar (the ⋯ menu's Free cycle went in PR 68)
    const midiOf = (hz: number) => 69 + 12 * Math.log2(hz / 440);
    const seq = arpSequence(order, slots.length, {
        fit: true,
        direction: arpPattern.value,
        lo: Math.ceil(midiOf(fMin)),
        hi: Math.floor(midiOf(fMax)),
    });

    const stepsOut = out.map(() => false);
    slots.forEach((stepIndex, k) => {
        const midi = seq[k];
        out[stepIndex] = 440 * Math.pow(2, (midi - 69) / 12);
        stepsOut[stepIndex] = true;
    });

    if (dry) return { steps: stepsOut, freqs: out };
    emit('update:steps', stepsOut);
    emit('update:frequencies', out);
}

// Melody's Active Pads Only (a toggle on the card since PR 68; saved): Generate fills only the
// pads that are on, or every pad
const applyScope = ref<'all' | 'active'>(props.initialActiveOnly === false ? 'all' : 'active');
watch(applyScope, (v) => emit('active-only-change', v === 'active'));
watch(() => props.initialActiveOnly, (v) => { if (typeof v === 'boolean') applyScope.value = v ? 'active' : 'all'; });


type UiSnapshot = {
    keyRoot: RootNote;
    keyScale: KeyScale;
    rangePreset: PresetKey;
    arpPattern: 'up' | 'down' | 'updown' | 'random';
    arpRate: string;
    arpOctaves: 1 | 2 | 3;
    arpTones: ArpTones;
    mode: 'random' | 'arp';
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
        mode: mode.value
    };
}

function setUi(u: Partial<UiSnapshot>) {
    if (u.keyRoot) keyRoot.value = u.keyRoot;
    if (u.keyScale) keyScale.value = u.keyScale as KeyScale;
    if (u.rangePreset) rangePreset.value = u.rangePreset as PresetKey;

    if (u.arpPattern) arpPattern.value = u.arpPattern;
    { const r = arpRateFrom(u.arpRate); if (r) arpRate.value = r; }
    if (u.arpOctaves) arpOctaves.value = clampArpOctaves(u.arpOctaves);
    if (u.arpTones) arpTones.value = u.arpTones;
    if (u.mode) mode.value = u.mode;
}

defineExpose({ getUi, setUi, generate });
</script>

<style scoped>
.melody-maker {
    position: relative;
    width: 100%;
    max-width: none;
    flex: 1 1 0;
    /* Its card's width decides the layout (the container query below) */
    container: melody / inline-size;
}

.melody-maker {
    display: flex;
    flex-direction: column;
}

/* A wide card (a tablet's Compose tab): the keyboard, Scale, Range and the makers on the left,
   the screen beside them */
@container melody (min-width: 640px) {
    .melody-maker>.mm-card {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
        grid-template-rows: auto auto 1fr;
        grid-template-areas: "kb screen" "scale screen" "group screen";
        column-gap: 24px;
    }

    .mm-kb-wrap {
        grid-area: kb;
    }

    .mm-scale-row {
        grid-area: scale;
    }

    .mm-screen {
        grid-area: screen;
    }

    .mm-group {
        grid-area: group;
    }
}

.mm-field {
    display: flex;
    flex-direction: column;
    /* gap: 6px; */
    min-width: 0;
}

.mm-label {
    color: var(--pt-muted);
    font-weight: 600;
    font-size: 0.9rem;
}

.mm-hint {
    margin-top: 6px;
    color: var(--pt-muted);
    font-style: italic;
    font-size: 13px;
    text-align: center;
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
    font-weight: 700;
}

/* Generate: a big cap in the accent's colours (_hardware.scss has the cap itself) */
.mm-primary-btn {
    --cap-travel: 3px;
    --cap-hi: hsl(var(--pt-accent) 80% 60%);
    --cap-lo: hsl(var(--pt-accent-2, var(--pt-accent)) 80% 60%);
    --cap-edge: color-mix(in oklab, var(--cap-lo), black 60%);
    --cap-ink: var(--pt-text);
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

.mm-mode {
    display: flex;
    margin-bottom: 10px;
}

.mm-mode .pt-seg-btn {
    flex: 1 1 0;
}

/* Melody's note and the arpeggio's settings share one place: as tall as the taller, the one
   not chosen hidden (and out of the Tab order and screen readers) */
.mm-mode-body {
    display: grid;
}

.mm-mode-body > * {
    grid-area: 1 / 1;
}

/* Each mode's panel: its note or settings, then its toggle */
.mm-mode-panel {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
}

.mm-opts {
    display: flex;
    justify-content: center;
    gap: 8px;
}

/* A toggle (a cap with an LED, _hardware.scss), sized like the cards' header pills */
.mm-toggle {
    --hw-led-size: 5px;
    padding: 2px 8px 2px 6px;
    border-radius: 5px;
    border: 1px solid transparent;
    font: inherit;
    font-size: 0.7rem;
    line-height: 1.4;
}

.mm-mode-body > .is-hidden {
    visibility: hidden;
}

.mm-mode-note {
    margin: 0;
    align-self: center;
    color: var(--pt-muted);
    font-size: 13px;
    line-height: 1.4;
    text-align: center;
}

:deep(.pt-selectbtn),
:deep(select.pt-select) {
    height: 36px;
    border-radius: 12px;
    padding: 8px 36px 8px 12px !important;
    box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.03),
        0 2px 10px rgb(0 0 0 / 0.25) !important;
    font-size: 0.8rem;
    background: var(--pt-surface-1) !important;
    color: var(--pt-text) !important;
    border: 1px solid var(--pt-hairline) !important;
}

:deep(.pt-caret) {
    filter: none;
    color: #aab0c0;
    opacity: 0.95;
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
    /* margin: 6px 0 2px; */
    padding: 6px 6px 8px;
    padding-top: 0px;
    border-radius: var(--pt-radius-md);
    background: linear-gradient(180deg, transparent, rgb(0 0 0 / 0.05));
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
    transition:
        transform 0.03s ease,
        box-shadow 0.12s ease,
        filter 0.12s ease;
    background:
        linear-gradient(180deg, var(--white1), var(--white2)) padding-box,
        linear-gradient(145deg, rgb(0 0 0 / 0.18), rgb(255 255 255 / 0.06)) border-box;
    border: 1px solid rgb(0 0 0 / 0.48);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.06),
        0 2px 0 rgb(0 0 0 / 0.5),
        0 6px 14px rgb(0 0 0 / 0.22);
}

.kb-white.is-active {
    box-shadow:
        inset 0 0 0 2px hsl(var(--pt-accent) 90% 60% / 0.85),
        inset 0 1px 0 rgb(255 255 255 / 0.05),
        0 2px 0 rgb(0 0 0 / 0.5),
        0 8px 18px rgb(0 0 0 / 0.28);
    background: var(--pt-wash);
}

.kb-white.is-active .wlabel {
    color: var(--pt-wash-ink);
    font-size: 1rem;
}

.kb-white .wlabel {
    position: absolute;
    bottom: 4px;
    left: 6px;
    font-size: 0.72rem;
    opacity: 0.9;
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
    font-size: 0.7rem;
    font-weight: 700;
    color: #e7ecff;
    cursor: pointer;
    transition:
        transform 0.03s ease,
        box-shadow 0.12s ease,
        filter 0.12s ease;
    background:
        linear-gradient(180deg, var(--black1), var(--black2)) padding-box,
        linear-gradient(145deg, #1a2334, #0b0f1a) border-box;
    border: 1px solid rgb(0 0 0 / 0.7);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.05),
        0 2px 0 rgb(0 0 0 / 0.78),
        0 6px 12px rgb(0 0 0 / 0.32);
    z-index: 2;
}

.kb-black.is-active {
    box-shadow:
        0 0 0 2px hsl(var(--pt-accent) 90% 60% / 0.9),
        inset 0 1px 0 rgb(255 255 255 / 0.05),
        0 2px 0 rgb(0 0 0 / 0.8),
        0 8px 16px rgb(0 0 0 / 0.4);
    background: var(--pt-wash);
}

.kb-black.is-active .blabel {
    color: var(--pt-wash-ink);
    font-size: 1rem;
}

.kb-cell.has-sharp {
    padding-top: 0;
}

.mm-kb :where(button) {
    outline: none;
}

/* A key clicked while playing, waiting for the next bar (DrumSequencer's BAR QUEUE): a ghost of
   the chosen key's colour, pulsing, until the pattern moves there and it lights. (An outline
   wouldn't show: the keys turn theirs off.) */
.kb-white.is-queued::after,
.kb-black.is-queued::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--pt-wash);
    box-shadow: inset 0 0 0 2px hsl(var(--pt-accent) 90% 60% / 0.9);
    pointer-events: none;
    animation: mm-ghost 0.9s ease-in-out infinite;
}

.kb-white.is-queued {
    position: relative;
}

@keyframes mm-ghost {
    0%, 100% { opacity: 0.25; }
    50% { opacity: 0.6; }
}

@media (prefers-reduced-motion: reduce) {
    .kb-white.is-queued::after,
    .kb-black.is-queued::after {
        animation: none;
        opacity: 0.45;
    }
}

/* What's waiting, beside the "Key" caption, and how not to wait */
.mm-queued-note {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 600;
    color: hsl(var(--pt-accent) 85% 65%);
}

.theme-light .mm-queued-note,
.theme-sand .mm-queued-note {
    color: hsl(var(--pt-accent) 80% 32%);
}

/* A touch screen (a phone, a tablet) has no Shift key: the key just waits for the bar */
@media (pointer: coarse) {
    .mm-shift-hint {
        display: none;
    }
}

/* @media (max-width: 560px) {
    .mm-kb {
        --whiteH: 50px;
        --blackH: 30px;
    }
} */
/* THE CARD (PR 76) START */
/* Keyboard, Scale and Range, the screen (which takes the room that's left), the makers */
.mm-card {
    --mm-lcd-bg: #0c1118;
    --mm-lcd-ink: #cfe0ff;
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-height: 0;
}

.theme-analog .mm-card {
    --mm-lcd-bg: #160f05;
    --mm-lcd-ink: #ffcf8a;
}

.theme-slate .mm-card {
    --mm-lcd-bg: #0b181d;
    --mm-lcd-ink: #bfe6e0;
}

.theme-sand .mm-card {
    --mm-lcd-bg: #a9b29a;
    --mm-lcd-ink: #1d2419;
}

.theme-light .mm-card {
    --mm-lcd-bg: #cdd2d5;
    --mm-lcd-ink: #111;
}

.mm-card .mm-kb-wrap {
    margin-bottom: 0;
}

/* The scale's notes, lit on the keys */
.kb-white.in-scale::before,
.kb-black.in-scale::before {
    content: "";
    position: absolute;
    left: 50%;
    width: 6px;
    height: 6px;
    margin-left: -3px;
    border-radius: 50%;
    background: var(--hw-led);
    box-shadow: 0 0 5px var(--hw-led), 0 0 0 1px rgba(0, 0, 0, 0.45);
    pointer-events: none;
}

.kb-white.in-scale::before {
    bottom: 24px;
}

.kb-black.in-scale::before {
    top: 6px;
}

/* A line of controls */
.mm-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}

.mm-cap {
    flex: none;
    color: var(--pt-muted);
    font-weight: 600;
    font-size: 0.72rem;
}

/* A stepper: ◂ name ▸; the name is a window that opens the list */
.mm-stepper {
    position: relative;
    flex: 1 1 0;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}

.mm-scale-row .mm-stepper {
    flex: 1.3 1 0;
}

.mm-step {
    flex: none;
    width: 24px;
    height: 26px;
    border: 0;
    border-radius: 6px;
    font: inherit;
    font-size: 0.8rem;
}

.mm-step-name {
    flex: 1;
    min-width: 0;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 4px;
    border: 0;
    border-radius: 5px;
    background: var(--mm-lcd-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 1px 5px rgba(0, 0, 0, 0.7);
    color: var(--mm-lcd-ink);
    font: inherit;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    cursor: pointer;
}

.mm-step-name:hover,
.mm-step-name[aria-expanded="true"] {
    box-shadow: inset 0 0 0 1px hsl(var(--pt-accent) 80% 65% / 0.7), inset 0 1px 5px rgba(0, 0, 0, 0.7);
}

.theme-sand .mm-step-name,
.theme-light .mm-step-name {
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25), inset 0 1px 4px rgba(0, 0, 0, 0.3);
    font-weight: 600;
}

.mm-caret {
    font-size: 0.6rem;
    opacity: 0.7;
}

.mm-list {
    position: absolute;
    left: 28px;
    top: calc(100% + 4px);
    z-index: 30;
    min-width: calc(100% - 56px);
    width: max-content;
    display: flex;
    flex-direction: column;
    padding: 4px;
    border-radius: 8px;
    background: #0c1118;
    box-shadow: 0 0 0 1px hsl(var(--pt-accent) 80% 65% / 0.6), 0 10px 24px rgba(0, 0, 0, 0.6);
}

/* Near the card's bottom (the arpeggio's steppers): the list opens upwards */
.mm-list--up {
    top: auto;
    bottom: calc(100% + 4px);
}

.mm-list-item {
    padding: 5px 8px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: #cfe0ff;
    font: inherit;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
}

.mm-list-item:hover,
.mm-list-item:focus-visible {
    background: rgba(255, 255, 255, 0.1);
}

.mm-list-item.on {
    color: var(--hw-led, #5effb0);
}

.mm-list-item.on::before {
    content: "● ";
    font-size: 0.5rem;
    vertical-align: middle;
}

/* A switch on a line: its options share its width */
.mm-seg {
    flex: 1 1 0;
    display: flex;
    flex-wrap: nowrap;
    gap: 5px;
    min-width: 0;
}

.mm-seg .pt-seg-btn {
    flex: 1 1 0;
    min-width: 0;
    padding-left: 2px;
    padding-right: 2px;
    white-space: nowrap;
}

.mm-range {
    flex: 0.9 1 0;
}

/* The screen */
.mm-screen {
    position: relative;
    flex: 1 1 0;
    min-height: 64px;
    border-radius: 6px;
    background: var(--mm-lcd-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 2px 10px rgba(0, 0, 0, 0.7), 0 0 0 2px rgba(0, 0, 0, 0.45);
    overflow: hidden;
}

/* Under 1200 px the card isn't stretched beside Sound, so the screen sets its own height */
@media (max-width: 1199px) {
    .mm-screen {
        min-height: 110px;
    }
}

.theme-sand .mm-screen,
.theme-light .mm-screen {
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25), inset 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(0, 0, 0, 0.45);
}

.mm-roll {
    position: absolute;
    inset: 2px;
    width: calc(100% - 4px);
    height: calc(100% - 4px);
}

.mm-rowline {
    stroke: var(--mm-lcd-ink);
    stroke-opacity: 0.3;
    stroke-dasharray: 2 3;
    vector-effect: non-scaling-stroke;
}

.mm-beat {
    stroke: var(--mm-lcd-ink);
    stroke-opacity: 0.14;
    vector-effect: non-scaling-stroke;
}

/* The notes a melody can use */
.mm-band {
    fill: var(--hw-led);
    fill-opacity: 0.13;
}

.theme-sand .mm-band,
.theme-light .mm-band {
    fill: #1d2419;
    fill-opacity: 0.12;
}

/* The arpeggio Generate would write */
.mm-ghost {
    fill: none;
    stroke: var(--mm-lcd-ink);
    stroke-opacity: 0.75;
    stroke-width: 1;
    stroke-dasharray: 2 2;
    vector-effect: non-scaling-stroke;
}

.theme-sand .mm-note,
.theme-light .mm-note {
    filter: brightness(0.62) saturate(1.4);
}

.mm-read {
    position: absolute;
    top: 4px;
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--mm-lcd-ink);
    opacity: 0.9;
    white-space: nowrap;
}

.theme-sand .mm-read,
.theme-light .mm-read {
    opacity: 1;
    font-weight: 600;
}

.mm-read--l {
    left: 7px;
}

.mm-read--r {
    right: 7px;
}

/* The makers */
.mm-card .mm-group {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-top: 0;
    padding-top: 10px;
}

.mm-card .mm-mode {
    margin-bottom: 0;
}

.mm-card .mm-mode-panel {
    min-width: 0;
    justify-content: flex-start;
    gap: 7px;
}

.mm-card .mm-mode-note {
    font-size: 11px;
}

.mm-card .mm-toggle {
    flex: none;
    white-space: nowrap;
}
/* THE CARD END */
</style>

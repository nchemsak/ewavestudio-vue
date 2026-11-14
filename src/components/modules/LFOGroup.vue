<!-- components/LFOGroup.vue -->
<template>
    <KnobGroup v-model="localEnabled" :color="color" :showToggle="showToggle" :showHeader="false">
        <!-- MOCKUPS START (PR 75's options, picked with ?lfo=a|b|c; not for shipping as is) -->
        <!-- A: ribbon + bar display -->
        <div v-if="variant === 'a' || variant === 'ab'" class="lv lva" :class="{ 'is-off': !localEnabled }">
            <button type="button" class="lv-ribbon" :class="{ 'is-on': localEnabled }" :aria-pressed="localEnabled"
                aria-label="LFO on" @click="localEnabled = !localEnabled">
                <span class="lv-ribbon-led" aria-hidden="true"></span>
                <span class="lv-ribbon-label">LFO</span>
            </button>
            <div class="lva-main">
                <div class="lva-screen" aria-hidden="true">
                    <svg class="lva-plot" :viewBox="`0 0 ${PLOT_W} ${PLOT_H}`" preserveAspectRatio="none">
                        <line v-for="b in plot.beats" :key="'b' + b.x" :x1="b.x" y1="0" :x2="b.x" :y2="PLOT_H"
                            class="lva-beat" :class="{ bar: b.bar }" />
                        <line x1="0" :y1="PLOT_H / 2" :x2="PLOT_W" :y2="PLOT_H / 2" class="lva-mid" />
                        <rect v-for="t in plot.ticks" :key="'t' + t.x" :x="t.x + 1" :y="PLOT_H - 4" :width="t.w - 2" height="3"
                            class="lva-step" :class="{ on: t.on }" />
                        <path :d="plot.path" class="lva-wave" />
                    </svg>
                    <span class="lva-read lva-read--l">{{ localEnabled ? rateLabel : 'OFF' }}<template v-if="plot.span > 1"> · {{ plot.span }} bars shown</template></span>
                    <span class="lva-read lva-read--r" :class="{ idle: !!idleText }">{{ idleText || `${targetLabel} ${depthShort}` }}</span>
                </div>
                <div class="lva-row">
                    <div class="pt-knob-row lfo-knobs">
                        <div class="position-relative text-center">
                            <Knob :value-text="rateLabel" v-model="divisionIndex" size="small" :min="0" :max="divisions.length - 1" :step="1"
                                label="Rate" :color="color" :disabled="!localEnabled" :showMarkers="true"
                                :markers="rateMarkers" :markersOnly="true" :markersOffsetDeg="-90" />
                        </div>
                        <div class="position-relative text-center">
                            <Knob :value-text="depthReadout" v-model="localDepth" size="small" :min="0" :max="depthMax" :step="depthStep" label="Depth"
                                :color="color" :disabled="!localEnabled" />
                        </div>
                    </div>
                    <div class="lva-side">
                        <div class="lfo-seg" role="radiogroup" aria-label="LFO Waveform">
                            <button v-for="w in waves" :key="w" type="button" class="lfo-seg-btn hw-cap hw-led-top"
                                :class="{ active: localWaveform === w }" role="radio"
                                :aria-checked="localWaveform === w ? 'true' : 'false'" :aria-label="waveLong(w)"
                                :disabled="!localEnabled" @click="setWave(w)">
                                <svg viewBox="0 0 100 32" focusable="false" aria-hidden="true"><path :d="wavePath(w)" class="wv" /></svg>
                            </button>
                        </div>
                        <button type="button" class="lv-retrig hw-cap hw-cap-sm hw-led-left" :class="{ on: retrigger }"
                            :aria-pressed="retrigger" :disabled="!localEnabled" @click="emit('update:retrigger', !retrigger)">RETRIG</button>
                    </div>
                </div>
                <!-- A + B: the patch bay in place of the target buttons -->
                <div v-if="variant === 'ab'" class="lvb-bay lvb-bay--slim" :class="{ 'is-off': !localEnabled }" role="radiogroup" aria-label="LFO Target">
                    <svg class="lvb-cables" viewBox="0 0 600 48" preserveAspectRatio="none" aria-hidden="true">
                        <path :d="cablePath" class="lvb-cable-shadow" />
                        <path :d="cablePath" class="lvb-cable" />
                    </svg>
                    <div class="lvb-jack lvb-out">
                        <span class="lvb-lab">LFO out</span>
                        <span class="lvb-hole plugged"></span>
                    </div>
                    <button v-for="t in TARGETS" :key="t.value" type="button" class="lvb-jack"
                        :class="{ plugged: currentTarget === t.value, idle: t.idle?.() }" :disabled="!localEnabled"
                        role="radio" :aria-checked="currentTarget === t.value ? 'true' : 'false'" :aria-label="t.aria || t.label" @click="updateTarget(t.value)">
                        <span class="lvb-lab">{{ t.label }}</span>
                        <span class="lvb-hole" :class="{ plugged: currentTarget === t.value }"></span>
                    </button>
                </div>
                <div v-else class="lfo-seg lva-targets" role="radiogroup" aria-label="LFO Target">
                    <button v-for="t in TARGETS" :key="t.value" type="button" class="lfo-seg-btn hw-cap hw-led-top"
                        :class="{ active: currentTarget === t.value, 'no-pulse': t.idle?.() }" :disabled="!localEnabled"
                        role="radio" :aria-checked="currentTarget === t.value ? 'true' : 'false'"
                        @click="updateTarget(t.value)">{{ t.label }}</button>
                </div>
            </div>
        </div>

        <!-- B: patch bay -->
        <div v-else-if="variant === 'b'" class="lfo-root lfo-container lvb">
            <div class="lfo-row">
                <button type="button" class="lfo-power hw-cap" :class="{ on: localEnabled, idle: !!idleText }"
                    :aria-pressed="localEnabled" aria-label="LFO on" @click="localEnabled = !localEnabled">
                    <span class="lfo-status">{{ idleText || (localEnabled ? 'On' : 'Off') }}</span>
                    <svg viewBox="0 0 100 32" focusable="false" aria-hidden="true"><path :d="wavePath(localWaveform || 'sine')" class="wv" /></svg>
                </button>
                <div class="pt-knob-row lfo-knobs">
                    <div class="position-relative text-center">
                        <Knob :value-text="rateLabel" v-model="divisionIndex" size="small" :min="0" :max="divisions.length - 1" :step="1"
                            label="Rate" :color="color" :disabled="!localEnabled" :showMarkers="true"
                            :markers="rateMarkers" :markersOnly="true" :markersOffsetDeg="-90" />
                    </div>
                    <div class="position-relative text-center">
                        <Knob :value-text="depthReadout" v-model="localDepth" size="small" :min="0" :max="depthMax" :step="depthStep" label="Depth"
                            :color="color" :disabled="!localEnabled" />
                    </div>
                </div>
                <div class="lfo-switches">
                    <div class="lfo-switch">
                        <span class="lfo-switch-label" aria-hidden="true">Wave</span>
                        <div class="lfo-seg" role="radiogroup" aria-label="LFO Waveform">
                            <button v-for="w in waves" :key="w" type="button" class="lfo-seg-btn hw-cap hw-led-top"
                                :class="{ active: localWaveform === w }" role="radio"
                                :aria-checked="localWaveform === w ? 'true' : 'false'" :aria-label="waveLong(w)"
                                :disabled="!localEnabled" @click="setWave(w)">
                                <svg viewBox="0 0 100 32" focusable="false" aria-hidden="true"><path :d="wavePath(w)" class="wv" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="lvb-bay" :class="{ 'is-off': !localEnabled }" role="radiogroup" aria-label="LFO Target">
                <svg class="lvb-cables" viewBox="0 0 600 56" preserveAspectRatio="none" aria-hidden="true">
                    <path :d="cablePath" class="lvb-cable-shadow" />
                    <path :d="cablePath" class="lvb-cable" />
                </svg>
                <div class="lvb-jack lvb-out">
                    <span class="lvb-lab">LFO out</span>
                    <span class="lvb-hole plugged"></span>
                </div>
                <button v-for="t in TARGETS" :key="t.value" type="button" class="lvb-jack"
                    :class="{ plugged: currentTarget === t.value, idle: t.idle?.() }" :disabled="!localEnabled"
                    role="radio" :aria-checked="currentTarget === t.value ? 'true' : 'false'" @click="updateTarget(t.value)">
                    <span class="lvb-lab">{{ t.label }}</span>
                    <span class="lvb-hole" :class="{ plugged: currentTarget === t.value }"></span>
                </button>
            </div>
        </div>

        <!-- C: rotary selectors -->
        <div v-else-if="variant === 'c'" class="lv lvc" :class="{ 'is-off': !localEnabled }">
            <button type="button" class="lv-ribbon" :class="{ 'is-on': localEnabled }" :aria-pressed="localEnabled"
                aria-label="LFO on" @click="localEnabled = !localEnabled">
                <span class="lv-ribbon-led" aria-hidden="true"></span>
                <span class="lv-ribbon-label">LFO</span>
            </button>
            <div class="lvc-main">
                <div class="lvc-knobs">
                    <div class="pt-knob-row lfo-knobs">
                        <div class="position-relative text-center">
                            <Knob :value-text="rateLabel" v-model="divisionIndex" size="small" :min="0" :max="divisions.length - 1" :step="1"
                                label="Rate" :color="color" :disabled="!localEnabled" :showMarkers="true"
                                :markers="rateMarkers" :markersOnly="true" :markersOffsetDeg="-90" />
                        </div>
                        <div class="position-relative text-center">
                            <Knob :value-text="depthReadout" v-model="localDepth" size="small" :min="0" :max="depthMax" :step="depthStep" label="Depth"
                                :color="color" :disabled="!localEnabled" />
                        </div>
                    </div>
                    <div class="lvc-readout" :class="{ idle: !!idleText }">{{ idleText || `${rateLabel} · ${depthShort}` }}</div>
                    <button type="button" class="lv-retrig hw-cap hw-cap-sm hw-led-left" :class="{ on: retrigger }"
                        :aria-pressed="retrigger" :disabled="!localEnabled" @click="emit('update:retrigger', !retrigger)">RETRIG</button>
                </div>
                <div class="lvc-sel lvc-sel--wave" role="radiogroup" aria-label="LFO Waveform">
                    <span class="lvc-cap">Wave</span>
                    <button v-for="(w, i) in waves" :key="w" type="button" class="lvc-pos" :class="{ on: localWaveform === w }"
                        :style="posStyle(WAVE_ANGLES[i], 31)" role="radio" :aria-checked="localWaveform === w ? 'true' : 'false'"
                        :aria-label="waveLong(w)" :disabled="!localEnabled" @click="setWave(w)">
                        <svg viewBox="0 0 100 32" focusable="false" aria-hidden="true"><path :d="wavePath(w)" class="wv" /></svg>
                    </button>
                    <span v-for="a in WAVE_ANGLES" :key="a" class="lvc-tick" :style="tickStyle(a)"></span>
                    <button type="button" class="lvc-dial" :disabled="!localEnabled" aria-label="Next wave"
                        @click="setWave(waves[(waves.indexOf(localWaveform as Wave) + 1) % waves.length])">
                        <span class="lvc-rotor" :style="{ transform: `rotate(${waveAngle}deg)` }"></span>
                    </button>
                </div>
                <div class="lvc-sel lvc-sel--target" role="radiogroup" aria-label="LFO Target">
                    <span class="lvc-cap">Target</span>
                    <button v-for="(t, i) in TARGETS" :key="t.value" type="button" class="lvc-pos"
                        :class="{ on: currentTarget === t.value, idle: t.idle?.() }" :style="posStyle(TARGET_ANGLES[i], 33)"
                        role="radio" :aria-checked="currentTarget === t.value ? 'true' : 'false'" :disabled="!localEnabled"
                        @click="updateTarget(t.value)">{{ t.label }}</button>
                    <span v-for="a in TARGET_ANGLES" :key="a" class="lvc-tick" :style="tickStyle(a)"></span>
                    <button type="button" class="lvc-dial" :disabled="!localEnabled" aria-label="Next target"
                        @click="updateTarget(TARGETS[(TARGETS.findIndex((t) => t.value === currentTarget) + 1) % TARGETS.length].value)">
                        <span class="lvc-rotor" :style="{ transform: `rotate(${targetAngle}deg)` }"></span>
                    </button>
                </div>
            </div>
        </div>
        <!-- MOCKUPS END -->

        <div v-else class="lfo-root lfo-container">
            <!-- Option C (PR 61): the power tile, Rate and Depth, and the Wave switch on one line;
                 the Target switch on a line of its own under them (five targets don't fit beside) -->
            <div class="lfo-row">
                <button type="button" class="lfo-power hw-cap" :class="{ on: localEnabled, idle: !!idleText }"
                    :aria-pressed="localEnabled" aria-label="LFO on"
                    :title="idleTitle || 'Toggle LFO'"
                    @click="localEnabled = !localEnabled">
                    <span class="lfo-status">{{ idleText || (localEnabled ? 'On' : 'Off') }}</span>
                    <svg viewBox="0 0 100 32" focusable="false" aria-hidden="true">
                        <path :d="wavePath(localWaveform || 'sine')" class="wv" />
                    </svg>
                </button>

                <div class="pt-knob-row lfo-knobs">
                    <div class="position-relative text-center">
                        <!-- Always locked to the tempo: 4 bars (slowest) to 1/64 (PR 66 dropped the
                             free rate in Hz and the card's ⋯ menu, where it was switched on) -->
                        <Knob midi-id="lfo.rate" :value-text="rateLabel" v-model="divisionIndex" size="small" :min="0" :max="divisions.length - 1" :step="1"
                            label="Rate" :color="color" :disabled="!localEnabled" :showMarkers="true"
                            :markers="rateMarkers" :markersOnly="true" :markersOffsetDeg="-90"
                            @knobStart="activeKnob = 'rate'" @knobEnd="activeKnob = null" />
                        <span v-if="activeKnob === 'rate'" class="custom-tooltip">{{ rateLabel }}</span>
                    </div>

                    <div class="position-relative text-center">
                        <Knob midi-id="lfo.depth" :value-text="depthReadout" v-model="localDepth" size="small" :min="0" :max="depthMax" :step="depthStep" label="Depth"
                            :color="color" :disabled="!localEnabled" @knobStart="activeKnob = 'depth'"
                            @knobEnd="activeKnob = null" />
                        <span v-if="activeKnob === 'depth'" class="custom-tooltip">
                            {{ depthReadout }}
                        </span>
                    </div>
                </div>

                <div class="lfo-switches">
                    <div class="lfo-switch">
                        <span class="lfo-switch-label" aria-hidden="true">Wave</span>
                        <div class="lfo-seg" role="radiogroup" aria-label="LFO Waveform">
                            <button v-for="w in waves" :key="w" type="button" class="lfo-seg-btn hw-cap hw-led-top"
                                :class="{ active: localWaveform === w }" role="radio"
                                :aria-checked="localWaveform === w ? 'true' : 'false'" :aria-label="waveLong(w)"
                                :disabled="!localEnabled" @click="setWave(w)" :title="waveLong(w)">
                                <svg viewBox="0 0 100 32" focusable="false" aria-hidden="true">
                                    <path :d="wavePath(w)" class="wv" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="lfo-switch lfo-target">
                <span class="lfo-switch-label" aria-hidden="true">Target</span>
                <div class="lfo-seg" role="radiogroup" aria-label="LFO Target">
                    <button v-for="t in TARGETS" :key="t.value" type="button" class="lfo-seg-btn hw-cap hw-led-top"
                        :class="{ active: currentTarget === t.value, 'no-pulse': t.idle?.() }" :disabled="!localEnabled"
                        role="radio" :aria-checked="currentTarget === t.value ? 'true' : 'false'"
                        :aria-label="t.aria || t.label" @click="updateTarget(t.value)"
                        :title="t.idle?.() ? t.idleTitle : t.title">{{ t.label }}</button>
                </div>
            </div>

        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';
import { LFO_DIVISIONS, lfoDivisionLabel, type LfoTarget } from '../../audio/lfo';
import { divisionBars } from '../../audio/synthHelpers';

type Target = LfoTarget;
type Wave = 'sine' | 'square';

const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        depth: number;
        target: Target;
        waveform?: Wave;
        division?: string;
        depthMax?: number;
        color?: string;
        waves?: Wave[];
        divisions?: string[];
        showToggle?: boolean;
        retrigger?: boolean;
        bipolar?: boolean;
        // Does any pad (or the main wave) play Pulse? PW only affects those
        pulseInUse?: boolean;
        // Is FM on (with some Amount)? The FM target moves its Amount, so nothing while it's off
        fmInUse?: boolean;
        // MOCKUPS: which option to draw ('' = the card as it is), and the pattern for A's display
        variant?: string;
        steps?: boolean[];
    }>(),
    {
        modelValue: false,
        depth: 0,
        target: 'pitch',
        waveform: 'sine',
        division: '1/8',
        depthMax: 100,
        color: '#00BCD4',
        waves: () => ['sine', 'square'],
        divisions: () => [...LFO_DIVISIONS],
        showToggle: false,
        retrigger: false,
        bipolar: false,
        pulseInUse: true,
        fmInUse: true,
        variant: '',
        steps: () => []
    }
);

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
    (e: 'update:depth', v: number): void;
    (e: 'update:target', v: Target): void;
    (e: 'update:waveform', v: Wave): void;
    (e: 'update:division', v: string): void;
    (e: 'update:retrigger', v: boolean): void;
    (e: 'update:bipolar', v: boolean): void;
}>();

function waveLabel(w: Wave | string): string {
    return w.charAt(0).toUpperCase() + w.slice(1);
}
function waveLong(w: Wave | string): string {
    return waveLabel(w);
}

const localEnabled = ref<boolean>(props.modelValue);
watch(
    () => props.modelValue,
    (v) => {
        localEnabled.value = v;
    }
);
watch(localEnabled, (v) => emit('update:modelValue', v));

const localDepth = ref<number>(props.depth);
watch(
    () => props.depth,
    (v) => {
        localDepth.value = v;
    }
);
watch(localDepth, (v) => emit('update:depth', v));

const currentTarget = computed<Target>(() => props.target);

// The Target switch's buttons. Pulse and FM only do something while something plays Pulse /
// while FM is on: otherwise their button is dimmed, with a title saying why
const TARGETS: { value: Target; label: string; aria?: string; title: string; idle?: () => boolean; idleTitle?: string }[] = [
    { value: 'pitch', label: 'Pitch', title: 'Modulate Pitch' },
    { value: 'filter', label: 'Filter', title: 'Modulate Filter' },
    { value: 'pwm', label: 'Pulse', aria: 'Pulse width', title: "Modulate the pulse wave's width",
        idle: () => !props.pulseInUse, idleTitle: 'Only affects pads playing Pulse. None do right now.' },
    { value: 'amp', label: 'Level', title: 'Modulate the level: tremolo' },
    { value: 'fm', label: 'FM', aria: 'FM amount', title: "Modulate the FM card's Amount",
        idle: () => !props.fmInUse, idleTitle: 'Only affects notes while FM is on. It is off now.' },
];

// Set to a target that does nothing right now (PW with no Pulse, FM with FM off): the LFO
// changes nothing you can hear, so the tile says so
const idleText = computed(() => {
    if (!localEnabled.value) return '';
    if (currentTarget.value === 'pwm' && !props.pulseInUse) return 'No Pulse';
    if (currentTarget.value === 'fm' && !props.fmInUse) return 'FM off';
    return '';
});
const idleTitle = computed(() => idleText.value === 'No Pulse' ? 'The LFO is set to Pulse, but no pads play Pulse'
    : idleText.value === 'FM off' ? 'The LFO is set to FM, but FM is off' : '');
const updateTarget = (t: Target): void => {
    // The parent recalls the new target's own depth (chooseLfoTarget in DrumSequencer.vue)
    emit('update:target', t);
};

const localWaveform = ref<Wave | undefined>(props.waveform);
watch(
    () => props.waveform,
    (v) => {
        localWaveform.value = v;
    }
);
function setWave(w: Wave): void {
    emit('update:waveform', w);
}

const localDivision = ref<string | undefined>(props.division);
watch(
    () => props.division,
    (v) => {
        localDivision.value = v;
    }
);
function setDivision(d: string): void {
    localDivision.value = d;
    emit('update:division', d);
}

const activeKnob = ref<null | 'rate' | 'depth'>(null);

const depthStep = computed<number>(() => {
    switch (currentTarget.value) {
        case 'filter':
            return 10;
        case 'pitch':
        default:
            return 1;
    }
});

const depthReadout = computed<string>(() => {
    const v = localDepth.value;
    switch (currentTarget.value) {
        case 'pitch':
            return `${Math.round(v)} cents`;
        case 'filter':
            return `${Math.round(v)} Hz`;
        case 'pwm':
            return `±${Math.round(v)}% width`;
        case 'amp':
            return `${Math.round(v)}% level`;
        case 'fm':
            return `±${Math.round(v)}% FM`;
    }
});

const rateLabel = computed<string>(() => lfoDivisionLabel(localDivision.value || '1/8'));

const rateMarkers = computed<number[]>(() => {
    const n = props.divisions.length;
    return n <= 1 ? [0.5] : props.divisions.map((_, i) => i / (n - 1));
});

const divisionIndex = computed<number>({
    get() {
        const idx = props.divisions.indexOf(localDivision.value || '');
        return Math.max(0, idx);
    },
    set(v: number) {
        const n = props.divisions.length;
        const i = Math.min(n - 1, Math.max(0, Math.round(v)));
        const d = props.divisions[i] || props.divisions[0];
        setDivision(d);
    }
});

// MOCKUPS START
const targetLabel = computed(() => TARGETS.find((t) => t.value === currentTarget.value)?.label ?? '');

// A: the wave across the bar (or across its whole cycle when that's longer), the pattern's steps
// along the bottom; with RETRIG it starts again at every step that's on
const PLOT_W = 352;
const PLOT_H = 58;
const plot = computed(() => {
    const [p, q] = divisionBars(localDivision.value || '1/8');
    const cycleBars = p / q;
    const span = Math.max(1, Math.ceil(cycleBars - 1e-9));
    const stepsPerBar = 16;
    const total = stepsPerBar * span;
    const on = (i: number) => !!props.steps?.[i % stepsPerBar];
    const amp = localEnabled.value ? Math.min(1, (localDepth.value || 0) / (props.depthMax || 1)) * (PLOT_H / 2 - 13) : 0;
    const mid = PLOT_H / 2;
    const anyOn = Array.from({ length: stepsPerBar }, (_, i) => on(i)).some(Boolean);
    const pts: string[] = [];
    const N = PLOT_W * 2;
    let prev = NaN;
    for (let k = 0; k <= N; k++) {
        const bars = (k / N) * span;
        let t = bars;
        if (props.retrigger && anyOn) {
            // since the last step that's on (wrapping to the bar before)
            const stepPos = bars * stepsPerBar;
            let i = Math.floor(stepPos + 1e-9);
            let back = 0;
            while (!on(((i % stepsPerBar) + stepsPerBar) % stepsPerBar) && back < stepsPerBar) { i--; back++; }
            t = (stepPos - i) / stepsPerBar;
        }
        const ph = (t / cycleBars) % 1;
        const v = localWaveform.value === 'square' ? (ph < 0.5 ? 1 : -1) : Math.sin(2 * Math.PI * ph);
        const x = (k / N) * PLOT_W;
        const y = mid - v * amp;
        if (Math.abs(y - prev) > amp) pts.push(`${x.toFixed(1)} ${prev.toFixed(1)}`); // a square's edge, upright
        pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
        prev = y;
    }
    const w = PLOT_W / total;
    return {
        span,
        path: 'M' + pts.join(' L'),
        ticks: Array.from({ length: total }, (_, i) => ({ x: i * w, w, on: on(i) })),
        beats: Array.from({ length: total / 4 - 1 }, (_, i) => ({ x: (i + 1) * 4 * w, bar: (i + 1) % 4 === 0 })),
    };
});

// B: the cable from "LFO out" (the first of six jacks) to the chosen target's jack, sagging
// under the others; drawn in a 600 × 56 box stretched over the bay
const cablePath = computed(() => {
    const i = Math.max(0, TARGETS.findIndex((t) => t.value === currentTarget.value)) + 1;
    const slim = props.variant === 'ab';
    const x0 = 50, x1 = i * 100 + 50, y = slim ? 29 : 36;
    const sag = (slim ? 8 : 14) + i * 2;
    return `M${x0} ${y} C${x0 + 12} ${y + sag + 10}, ${x1 - 12} ${y + sag + 10}, ${x1} ${y}`;
});

// C: where a selector's positions sit round its dial (0° = straight up)
const WAVE_ANGLES = [-38, 38];
const TARGET_ANGLES = [-100, -50, 0, 50, 100];
// The depth without its unit's long name ("25 cents", "1500 Hz", "15 %")
const depthShort = computed(() => depthReadout.value.replace(/% .*/, ' %').replace('±', '± '));
const waveAngle = computed(() => WAVE_ANGLES[Math.max(0, props.waves.indexOf(localWaveform.value as Wave))]);
const targetAngle = computed(() => TARGET_ANGLES[Math.max(0, TARGETS.findIndex((t) => t.value === currentTarget.value))]);
function posStyle(deg: number, r: number) {
    const a = (deg * Math.PI) / 180;
    // anchored on the side that faces away from the dial, so longer names grow outwards
    const tx = deg < -10 ? '-100%' : deg > 10 ? '0%' : '-50%';
    const ty = Math.abs(deg) < 10 ? '-100%' : '-50%';
    return { left: `calc(50% + ${(Math.sin(a) * r).toFixed(1)}px)`, top: `calc(var(--dial-y) - ${(Math.cos(a) * r).toFixed(1)}px)`, transform: `translate(${tx}, ${ty})` };
}
function tickStyle(deg: number) {
    return { transform: `translate(-50%, -100%) rotate(${deg}deg)` };
}
// MOCKUPS END

function wavePath(w: Wave | string): string {
    switch (w) {
        case 'square':
            // Two even cycles at the sine's height (4..28), starting and ending on the middle
            // line as the sine does (it was a quarter low, a half high, a quarter low: lopsided)
            return 'M1 16 V4 H25 V28 H50 V4 H75 V28 H99 V16';
        case 'sine':
        default:
            return 'M0 16 C12 0 12 0 25 16 C37 32 37 32 50 16 C62 0 62 0 75 16 C87 32 87 32 100 16';
    }
}
</script>

<style scoped>
.lfo-root {
    position: relative;
    width: 100%;
}

.lfo-container {
    width: 100%;
    container: lfo / inline-size;
}

.lfo-row {
    display: flex;
    flex-wrap: wrap; /* safety net: never wider than the card */
    align-items: center;
    gap: 12px;
}

/* A narrow card (beside Noise in the Sound section, phones) has no room for the Wave / Target
   captions; the switches keep their accessible names */
@container lfo (max-width: 440px) {
    .lfo-switch-label {
        display: none;
    }

    /* ...and a little less room between things, so Pitch / Filter / Pulse still fit */
    .lfo-row {
        gap: 8px;
    }

    .lfo-seg-btn {
        padding: 0 6px;
    }
}

/* Power: a small tile with the LFO's wave, a cap that stays down while on (_hardware.scss),
   its LED beside On / Off */
.lfo-power {
    flex: none;
    width: 62px;
    height: 58px;
    border-radius: 12px;
    border: 1px solid transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px;
}

.lfo-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.lfo-status::before {
    content: "";
    flex: none;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--hw-led-off);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.35);
}

.lfo-power.on .lfo-status::before {
    background: var(--hw-led);
    box-shadow: 0 0 6px var(--hw-led);
}

/* On with nothing to move ("No Pulse", "FM off"): the amber words say so, no LED */
.lfo-power.idle .lfo-status::before {
    display: none;
}

.lfo-power.idle .lfo-status {
    color: #ffc107;
    font-size: 9px;
    letter-spacing: 0.04em;
}

/* PW with no pulse pads: still clickable, but looks dimmer (its title says why) */
.lfo-seg-btn.no-pulse:not(.active) {
    opacity: 0.45;
}

.lfo-status {
    font-size: 10px;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.12em;
}

.lfo-power svg {
    width: 44px;
    height: 16px;
}

svg {
    display: block;
}

.wv {
    fill: none;
    stroke: hsl(var(--pt-accent) 80% 65%);
    stroke-width: 2.25;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.lfo-knobs {
    flex: none;
    gap: 10px;
}

/* The Target switch: a line of its own, its buttons sharing the card's width */
.lfo-target {
    margin-top: 10px;
    width: 100%;
}

.lfo-target .lfo-seg {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
}

/* Its caption stays: there's room on its own line */
.lfo-target .lfo-switch-label {
    display: inline;
    flex: none;
}

/* The Wave switch, at the first line's right end */
.lfo-switches {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-end;
}

.lfo-switch {
    display: flex;
    align-items: center;
    gap: 6px;
}

.lfo-switch-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.7;
}

/* A switch: a row of caps, the chosen one down with its LED lit (_hardware.scss) */
.lfo-seg {
    display: inline-flex;
    gap: 4px;
    /* The room its outline took, so the card stays as tall as it was */
    padding: 1px 0;
}

.lfo-seg-btn {
    --hw-led-size: 4px;
    border: 0;
    border-radius: 6px;
    font: inherit;
    font-size: 11px;
    line-height: 1;
    min-width: 34px;
    height: 24px;
    padding: 0 8px;
    gap: 2px;
}

.lfo-seg-btn svg {
    width: 22px;
    height: 11px;
}

.lfo-seg-btn:disabled {
    cursor: default;
    opacity: 0.4;
}

/* MOCKUPS START */
/* The ribbon (A, C): the card's switch, as Noise's */
.lv {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
}

.lv-ribbon {
    flex: none;
    position: relative;
    width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 11px 0 0 11px;
    cursor: pointer;
    background: linear-gradient(180deg, var(--pt-surface-3, #26263a), var(--pt-surface-1, #151522));
    color: color-mix(in oklab, var(--pt-text, #e5e9ff), transparent 20%);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 1px 0 0 rgba(0, 0, 0, 0.7);
}

.lv-ribbon.is-on {
    background: linear-gradient(180deg, color-mix(in oklab, var(--lfo-mod), black 18%), color-mix(in oklab, var(--lfo-mod), black 38%));
    color: #1b1206;
    box-shadow: 1px 0 0 rgba(0, 0, 0, 0.85), 0 0 14px color-mix(in oklab, var(--lfo-mod), transparent 55%);
}

.lv-ribbon-led {
    position: absolute;
    top: 9px;
    left: 50%;
    width: 6px;
    height: 6px;
    margin-left: -3px;
    border-radius: 50%;
    background: var(--hw-led-off);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.35);
}

.lv-ribbon.is-on .lv-ribbon-led {
    background: var(--hw-led);
    box-shadow: 0 0 6px var(--hw-led), 0 0 1px var(--hw-led);
}

.lv-ribbon-label {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    letter-spacing: 0.22em;
    font-size: 11px;
    font-weight: 600;
}

.lv-retrig {
    --hw-led-size: 5px;
    flex: none;
    padding: 2px 6px 2px 5px;
    border-radius: 5px;
    border: 1px solid transparent;
    font: inherit;
    font-size: 9px;
    line-height: 1.4;
    letter-spacing: 0.06em;
}

.lv-retrig:disabled {
    opacity: 0.4;
    cursor: default;
}

/* A: the display, the knobs' row, the targets */
.lva-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 12px 9px 10px;
}

.lva-screen {
    position: relative;
    flex: 1 1 0;
    min-height: 48px;
    border-radius: 6px;
    background: var(--lfo-lcd-bg, #0c1118);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 2px 10px rgba(0, 0, 0, 0.7), 0 0 0 2px rgba(0, 0, 0, 0.45);
    overflow: hidden;
}

.lva-plot {
    position: absolute;
    inset: 2px;
    width: calc(100% - 4px);
    height: calc(100% - 4px);
}

.lva-beat {
    stroke: var(--lfo-lcd-ink, #cfe0ff);
    stroke-opacity: 0.12;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
}

.lva-beat.bar {
    stroke-opacity: 0.4;
}

.lva-mid {
    stroke: var(--lfo-lcd-ink, #cfe0ff);
    stroke-opacity: 0.16;
    stroke-dasharray: 2 4;
    vector-effect: non-scaling-stroke;
}

.lva-step {
    fill: var(--lfo-lcd-ink, #cfe0ff);
    fill-opacity: 0.16;
}

.lva-step.on {
    fill-opacity: 0.85;
}

.lva-wave {
    fill: none;
    stroke: var(--lfo-mod);
    stroke-width: 2;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 3px color-mix(in oklab, var(--lfo-mod), transparent 40%));
}

.is-off .lva-wave {
    stroke-opacity: 0.35;
    filter: none;
}

.lva-read {
    position: absolute;
    top: 4px;
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--lfo-lcd-ink, #cfe0ff);
    opacity: 0.85;
}

.lva-read--l {
    left: 7px;
}

.lva-read--r {
    right: 7px;
}

.lva-read.idle {
    color: #ffc107;
    opacity: 1;
}

.lva-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.lva-side {
    display: flex;
    align-items: center;
    gap: 10px;
}

.lva-targets {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    width: 100%;
}

.lva-targets .lfo-seg-btn {
    padding: 0 4px;
}

/* Sand's screen is a green-grey LCD with dark ink */
.theme-sand .lva-screen,
.theme-sand .lvc-readout {
    --lfo-lcd-bg: #a9b29a;
    --lfo-lcd-ink: #1d2419;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25), inset 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(0, 0, 0, 0.45);
}

.theme-sand .lva-wave {
    stroke: #7a3d00;
    filter: none;
}

.theme-sand .lvc-readout {
    color: #3a2a08;
}

/* B: the patch bay */
.lvb-bay {
    position: relative;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    margin-top: 10px;
    height: 56px;
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.26));
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.lvb-bay--slim {
    flex: none;
    margin-top: 0;
    height: 48px;
}

.lvb-bay--slim .lvb-jack {
    padding-top: 5px;
    gap: 4px;
}

.lvb-jack {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 7px 0 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
}

.lvb-out {
    cursor: default;
    box-shadow: 1px 0 0 rgba(255, 255, 255, 0.08);
}

.lvb-lab {
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.75;
    white-space: nowrap;
}

.lvb-jack.plugged .lvb-lab,
.lvb-out .lvb-lab {
    opacity: 1;
    color: var(--lfo-mod);
}

.lvb-jack.idle:not(.plugged) {
    opacity: 0.45;
}

/* A socket: a metal nut round a dark hole; plugged, the cable's plug sits in it */
.lvb-hole {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: radial-gradient(circle, #05060a 0 32%, #1a1c24 34% 40%, #8d93a3 44% 52%, #d9dce4 58%, #6b7080 70%, #2a2d38 74%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}

.lvb-hole.plugged {
    background: radial-gradient(circle, color-mix(in oklab, var(--lfo-mod), white 25%) 0 22%, var(--lfo-mod) 26% 46%, color-mix(in oklab, var(--lfo-mod), black 45%) 50% 56%, #d9dce4 60%, #6b7080 70%, #2a2d38 74%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.7), 0 0 8px color-mix(in oklab, var(--lfo-mod), transparent 45%);
}

.lvb-jack:not(.lvb-out):hover .lvb-hole:not(.plugged) {
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--lfo-mod), transparent 55%);
}

.lvb-cables {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
    pointer-events: none;
    overflow: visible;
}

.lvb-cable,
.lvb-cable-shadow {
    fill: none;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
}

.lvb-cable {
    stroke: var(--lfo-mod);
    stroke-width: 4;
}

.lvb-cable-shadow {
    stroke: rgba(0, 0, 0, 0.55);
    stroke-width: 7;
    transform: translateY(2px);
}

.lvb-bay.is-off .lvb-cable {
    stroke: color-mix(in oklab, var(--lfo-mod), #555 65%);
}

.lvb-bay.is-off .lvb-hole.plugged {
    filter: saturate(0.3) brightness(0.8);
}

/* C: knobs and two selectors, as on a hardware panel */
.lvc-main {
    position: relative;
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 0.62fr) minmax(0, 1fr);
    align-items: center;
    column-gap: 4px;
    padding: 10px 8px 10px 12px;
}

.lvc-knobs {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
}

.lvc-knobs .lfo-knobs {
    gap: 10px;
}

.lvc-readout {
    min-width: 96px;
    padding: 4px 6px;
    border-radius: 4px;
    background: var(--lfo-lcd-bg, #0c1118);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 1px 5px rgba(0, 0, 0, 0.7);
    color: var(--lfo-mod);
    font-size: 10px;
    line-height: 1.2;
    letter-spacing: 0.04em;
    text-align: center;
    text-transform: uppercase;
    white-space: nowrap;
}

.lvc-readout.idle {
    color: #ffc107;
}

.is-off .lvc-readout {
    color: color-mix(in oklab, var(--lfo-mod), #555 70%);
}

.lvc-sel {
    --dial-y: 84px;
    --dial-r: 17px;
    position: relative;
    height: 150px;
    align-self: center;
}

.lvc-cap {
    position: absolute;
    left: 50%;
    top: calc(var(--dial-y) + var(--dial-r) + 14px);
    transform: translateX(-50%);
    font-size: 11px;
    opacity: 0.85;
}

/* The selector: a pointer knob, a round skirt under a raised bar that points at the choice */
.lvc-dial {
    position: absolute;
    left: 50%;
    top: var(--dial-y);
    width: calc(var(--dial-r) * 2);
    height: calc(var(--dial-r) * 2);
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--knob-face, #222);
    box-shadow:
        inset 0 0 8px rgba(0, 0, 0, 0.55),
        inset -6px -6px 12px rgba(0, 0, 0, 0.6),
        inset 5px 5px 10px rgba(255, 255, 255, 0.06),
        0 2px 5px rgba(0, 0, 0, 0.55);
    transform: translate(-50%, -50%);
    cursor: pointer;
}

.lvc-rotor {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    transition: transform 0.14s ease-out;
}

.lvc-rotor::before {
    content: "";
    position: absolute;
    left: 50%;
    top: -3px;
    bottom: -3px;
    width: 11px;
    margin-left: -5.5px;
    border-radius: 5px;
    background: linear-gradient(90deg, #15151c, #3a3a48 45%, #22222b);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.lvc-rotor::after {
    content: "";
    position: absolute;
    left: 50%;
    top: -1px;
    width: 2.5px;
    height: 12px;
    margin-left: -1.25px;
    border-radius: 2px;
    background: var(--lfo-mod);
    box-shadow: 0 0 5px color-mix(in oklab, var(--lfo-mod), transparent 40%);
}

.is-off .lvc-rotor::after {
    background: #9a9aa6;
    box-shadow: none;
}

.lvc-dial:disabled {
    cursor: default;
}

/* A printed line from the dial towards each position */
.lvc-tick {
    position: absolute;
    left: 50%;
    top: var(--dial-y);
    width: 1.5px;
    height: calc(var(--dial-r) + 11px);
    transform-origin: 50% 100%;
    background: linear-gradient(180deg, color-mix(in oklab, var(--pt-text, #fff), transparent 50%) 0 5px, transparent 5px);
}

.lvc-pos {
    position: absolute;
    padding: 2px 2px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    opacity: 0.6;
    cursor: pointer;
}

.lvc-pos svg {
    width: 22px;
    height: 11px;
}

.lvc-pos.on {
    opacity: 1;
    color: var(--lfo-mod);
    text-shadow: 0 0 8px color-mix(in oklab, var(--lfo-mod), transparent 50%);
}

.lvc-pos.on .wv {
    stroke: var(--lfo-mod);
}

.lvc-pos.idle:not(.on) {
    opacity: 0.3;
}

.lvc-pos:disabled {
    cursor: default;
}

.is-off .lvc-pos.on {
    color: inherit;
    text-shadow: none;
    opacity: 0.75;
}

.is-off .lvc-pos.on .wv {
    stroke: currentColor;
}
/* MOCKUPS END */
</style>

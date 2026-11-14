<!-- src/components/modules/LFOGroup.vue -->
<!-- The LFO card (PR 75, options A + B of the mockups): a ribbon down its left edge is the
     switch (as Noise's); a screen draws the wave across the bar over the pattern's steps; Rate,
     Depth, the Wave switch and RETRIG; and a patch bay, where a cable runs from "LFO out" to the
     target's socket. `classic` (the phone's Mod page) draws the card as it was before. -->
<template>
    <KnobGroup v-model="localEnabled" :color="color" :showToggle="showToggle" :showHeader="false">
        <div v-if="!classic" class="lv" :class="{ 'is-off': !localEnabled }">
            <button type="button" class="lv-ribbon" :class="{ 'is-on': localEnabled }" :aria-pressed="localEnabled"
                aria-label="LFO on" :title="idleTitle || 'Toggle LFO'" @click="localEnabled = !localEnabled">
                <span class="lv-ribbon-led" aria-hidden="true"></span>
                <span class="lv-ribbon-label">LFO</span>
            </button>

            <div class="lv-main">
                <!-- The wave across one bar (or its whole cycle, for the 2- and 4-bar rates), the
                     pattern's steps along the bottom; with RETRIG it starts again at each hit -->
                <div class="lv-screen">
                    <svg class="lv-plot" :viewBox="`0 0 ${PLOT_W} ${PLOT_H}`" preserveAspectRatio="none" aria-hidden="true">
                        <line v-for="b in plot.beats" :key="'b' + b.x" :x1="b.x" y1="0" :x2="b.x" :y2="PLOT_H"
                            class="lv-beat" :class="{ bar: b.bar }" />
                        <line x1="0" :y1="PLOT_H / 2" :x2="PLOT_W" :y2="PLOT_H / 2" class="lv-mid" />
                        <rect v-for="t in plot.ticks" :key="'t' + t.x" :x="t.x + 1" :y="PLOT_H - 4" :width="t.w - 2" height="3"
                            class="lv-step" :class="{ on: t.on }" />
                        <path :d="plot.path" class="lv-wave" />
                    </svg>
                    <span class="lv-read lv-read--l">{{ localEnabled ? rateLabel : 'Off' }}<span v-if="localEnabled && plot.span > 1" class="lv-read-more"> · {{ plot.span }} bars shown</span></span>
                    <span class="lv-read lv-read--r lfo-status" :class="{ idle: !!idleText }" :title="idleTitle || undefined"><template v-if="idleText">{{ idleText }}</template><template v-else><span class="lv-read-more">{{ targetLabel }}&nbsp;</span>{{ depthShort }}</template></span>
                </div>

                <div class="lv-controls">
                    <div class="lfo-row">
                        <div class="pt-knob-row lfo-knobs">
                            <div class="position-relative text-center">
                                <!-- Always locked to the tempo: 4 bars (slowest) to 1/64 -->
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
                                <span v-if="activeKnob === 'depth'" class="custom-tooltip">{{ depthReadout }}</span>
                            </div>
                        </div>
                        <div class="lv-side">
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
                            <!-- RETRIG: each note starts the LFO afresh (src/audio/lfo.ts) -->
                            <PillSwitch :modelValue="retrigger" @update:modelValue="emit('update:retrigger', $event)" label="RETRIG"
                                name="LFO retrigger" tip="Each note starts the LFO from the beginning" :disabled="!localEnabled" />
                        </div>
                    </div>
                </div>

                <!-- The patch bay: one cable from "LFO out" to the target's socket (one target at a
                     time). A socket that does nothing right now (Pulse with no pulse playing, FM
                     while FM is off) is dimmed, with a title saying why. -->
                <div class="lv-bay" role="radiogroup" aria-label="LFO Target">
                    <svg class="lv-cables" :viewBox="`0 0 ${BAY_W} ${BAY_H}`" preserveAspectRatio="none" aria-hidden="true">
                        <path :d="cablePath" class="lv-cable-shadow" />
                        <path :d="cablePath" class="lv-cable" />
                    </svg>
                    <div class="lv-jack lv-out" aria-hidden="true">
                        <span class="lv-lab">LFO out</span>
                        <span class="lv-hole plugged"></span>
                    </div>
                    <button v-for="t in TARGETS" :key="t.value" type="button" class="lv-jack"
                        :class="{ plugged: currentTarget === t.value, 'no-pulse': t.idle?.() }" :disabled="!localEnabled"
                        role="radio" :aria-checked="currentTarget === t.value ? 'true' : 'false'"
                        :aria-label="t.aria || t.label" @click="updateTarget(t.value)"
                        :title="t.idle?.() ? t.idleTitle : t.title">
                        <span class="lv-lab">{{ t.label }}</span>
                        <span class="lv-hole" :class="{ plugged: currentTarget === t.value }"></span>
                    </button>
                </div>
            </div>
        </div>

        <!-- The card as it was until PR 75 (the phone's Mod page keeps it): the power tile, Rate
             and Depth, and the Wave switch on one line; the Target switch under them -->
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
                        <Knob :value-text="rateLabel" v-model="divisionIndex" size="small" :min="0" :max="divisions.length - 1" :step="1"
                            label="Rate" :color="color" :disabled="!localEnabled" :showMarkers="true"
                            :markers="rateMarkers" :markersOnly="true" :markersOffsetDeg="-90"
                            @knobStart="activeKnob = 'rate'" @knobEnd="activeKnob = null" />
                        <span v-if="activeKnob === 'rate'" class="custom-tooltip">{{ rateLabel }}</span>
                    </div>

                    <div class="position-relative text-center">
                        <Knob :value-text="depthReadout" v-model="localDepth" size="small" :min="0" :max="depthMax" :step="depthStep" label="Depth"
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
import PillSwitch from '../PillSwitch.vue';
import { lfoPlotPath, plotSpanBars, STEPS_PER_BAR } from '../../lib/lfoPlot';

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
        // The pattern's steps, for the screen
        steps?: boolean[];
        // The card as it was before PR 75 (the phone's Mod page)
        classic?: boolean;
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
        steps: () => [],
        classic: false
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

// THE SCREEN AND THE PATCH BAY START
const targetLabel = computed(() => TARGETS.find((t) => t.value === currentTarget.value)?.label ?? '');
// The depth for the screen: "25 cents", "1500 Hz", "40 %"
const depthShort = computed(() => depthReadout.value.replace(/% .*/, ' %').replace('±', '± '));

// The screen's drawing (src/lib/lfoPlot.ts), in a box stretched over the screen
const PLOT_W = 352;
const PLOT_H = 58;
const plot = computed(() => {
    const division = localDivision.value || '1/8';
    const span = plotSpanBars(division);
    const total = STEPS_PER_BAR * span;
    const w = PLOT_W / total;
    const amp = localEnabled.value ? (localDepth.value || 0) / (props.depthMax || 1) : 0;
    return {
        span,
        path: lfoPlotPath({ division, wave: localWaveform.value || 'sine', retrigger: props.retrigger, steps: props.steps },
            PLOT_W, PLOT_H, amp, 13),
        ticks: Array.from({ length: total }, (_, i) => ({ x: i * w, w, on: !!props.steps[i % STEPS_PER_BAR] })),
        beats: Array.from({ length: total / 4 - 1 }, (_, i) => ({ x: (i + 1) * 4 * w, bar: (i + 1) % 4 === 0 })),
    };
});

// The cable, from "LFO out" (the first of six sockets) to the target's, hanging under the ones
// between; drawn in a box stretched over the bay
const BAY_W = 600;
const BAY_H = 48;
const cablePath = computed(() => {
    const i = Math.max(0, TARGETS.findIndex((t) => t.value === currentTarget.value)) + 1;
    const x0 = BAY_W / 12, x1 = (i + 0.5) * (BAY_W / 6), y = 29;
    const drop = 18 + i * 2;
    return `M${x0} ${y} C${x0 + 12} ${y + drop}, ${x1 - 12} ${y + drop}, ${x1} ${y}`;
});
// THE SCREEN AND THE PATCH BAY END

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

/* THE CARD (PR 75) START */
/* Ribbon | screen, controls, patch bay */
.lv {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
}

/* The ribbon: the card's switch, as Noise's, in the LFO's own colour (the visualizer's amber) */
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
    transition: filter 120ms ease;
}

.lv-ribbon:hover {
    filter: brightness(1.06);
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

.lv-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 12px 9px 10px;
}

/* The screen: a small LCD in each theme's screen colours */
.lv-screen {
    --lfo-lcd-bg: #0c1118;
    --lfo-lcd-ink: #cfe0ff;
    position: relative;
    flex: 1 1 0;
    min-height: 48px;
    border-radius: 6px;
    container: lfoscreen / inline-size;
    background: var(--lfo-lcd-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 2px 10px rgba(0, 0, 0, 0.7), 0 0 0 2px rgba(0, 0, 0, 0.45);
    overflow: hidden;
}

.theme-analog .lv-screen {
    --lfo-lcd-bg: #160f05;
    --lfo-lcd-ink: #ffcf8a;
}

.theme-slate .lv-screen {
    --lfo-lcd-bg: #0b181d;
    --lfo-lcd-ink: #bfe6e0;
}

/* Sand's screen is a green-grey LCD with dark ink; Light's is pale grey */
.theme-sand .lv-screen,
.theme-light .lv-screen {
    --lfo-lcd-bg: #a9b29a;
    --lfo-lcd-ink: #1d2419;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25), inset 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(0, 0, 0, 0.45);
}

.theme-light .lv-screen {
    --lfo-lcd-bg: #cdd2d5;
    --lfo-lcd-ink: #111;
}

/* Dark ink on a pale screen: full strength and a little heavier, to stay readable at 9 px */
.theme-sand .lv-read,
.theme-light .lv-read {
    opacity: 1;
    font-weight: 600;
}

.lv-plot {
    position: absolute;
    inset: 2px;
    width: calc(100% - 4px);
    height: calc(100% - 4px);
}

.lv-beat {
    stroke: var(--lfo-lcd-ink);
    stroke-opacity: 0.12;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
}

.lv-beat.bar {
    stroke-opacity: 0.4;
}

.lv-mid {
    stroke: var(--lfo-lcd-ink);
    stroke-opacity: 0.16;
    stroke-dasharray: 2 4;
    vector-effect: non-scaling-stroke;
}

.lv-step {
    fill: var(--lfo-lcd-ink);
    fill-opacity: 0.16;
}

.lv-step.on {
    fill-opacity: 0.85;
}

.lv-wave {
    fill: none;
    stroke: var(--lfo-mod);
    stroke-width: 2;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 3px color-mix(in oklab, var(--lfo-mod), transparent 40%));
}

.theme-sand .lv-wave,
.theme-light .lv-wave {
    stroke: #7a3d00;
    filter: none;
}

.is-off .lv-wave {
    stroke-opacity: 0.35;
    filter: none;
}

.lv-read {
    position: absolute;
    top: 4px;
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--lfo-lcd-ink);
    opacity: 0.85;
    white-space: nowrap;
}

/* (the classic card's tile puts an LED before its status) */
.lv-read.lfo-status::before {
    display: none;
}

/* A narrow screen (a small tablet's): the rate and the depth only */
@container lfoscreen (max-width: 200px) {
    .lv-read-more {
        display: none;
    }
}

.lv-read--l {
    left: 7px;
}

.lv-read--r {
    right: 7px;
}

/* On with nothing to move ("No Pulse", "FM off"): amber words say so */
.lv-read.idle {
    color: #ffc107;
    opacity: 1;
}

.theme-sand .lv-read.idle,
.theme-light .lv-read.idle {
    color: #7a3d00;
    font-weight: 700;
}

.lv .lfo-row {
    flex-wrap: nowrap;
    justify-content: space-between;
    gap: 10px;
}

.lv-side {
    display: flex;
    align-items: center;
    gap: 10px;
}

/* The patch bay: a recessed strip of six sockets, their names above them */
.lv-bay {
    position: relative;
    flex: none;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    height: 48px;
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.26));
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.theme-sand .lv-bay,
.theme-light .lv-bay {
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.09));
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.lv-jack {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 5px 0 0;
    border: 0;
    border-radius: 8px;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
}

.lv-jack:disabled {
    cursor: default;
}

.lv-out {
    cursor: default;
    border-radius: 8px 0 0 8px;
    box-shadow: 1px 0 0 color-mix(in oklab, currentColor, transparent 88%);
}

.lv-lab {
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.75;
    white-space: nowrap;
}

.lv-jack.plugged .lv-lab,
.lv-out .lv-lab {
    opacity: 1;
    color: var(--lfo-mod);
}

/* A target that does nothing right now: still clickable, but dimmer (its title says why) */
.lv-jack.no-pulse:not(.plugged) {
    opacity: 0.45;
}

/* A socket: a metal nut round a dark hole; plugged, the cable's plug sits in it */
.lv-hole {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: radial-gradient(circle, #05060a 0 32%, #1a1c24 34% 40%, #8d93a3 44% 52%, #d9dce4 58%, #6b7080 70%, #2a2d38 74%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}

.lv-hole.plugged {
    background: radial-gradient(circle, color-mix(in oklab, var(--lfo-mod), white 25%) 0 22%, var(--lfo-mod) 26% 46%, color-mix(in oklab, var(--lfo-mod), black 45%) 50% 56%, #d9dce4 60%, #6b7080 70%, #2a2d38 74%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.7), 0 0 8px color-mix(in oklab, var(--lfo-mod), transparent 45%);
}

button.lv-jack:not(:disabled):hover .lv-hole:not(.plugged) {
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--lfo-mod), transparent 55%);
}

.lv-cables {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
    pointer-events: none;
    overflow: visible;
}

.lv-cable,
.lv-cable-shadow {
    fill: none;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
}

.lv-cable {
    stroke: var(--lfo-mod);
    stroke-width: 4;
    transition: d 0.18s ease-out;
}

.lv-cable-shadow {
    stroke: rgba(0, 0, 0, 0.5);
    stroke-width: 7;
    transform: translateY(2px);
    transition: d 0.18s ease-out;
}

@media (prefers-reduced-motion: reduce) {
    .lv-cable,
    .lv-cable-shadow {
        transition: none;
    }
}

/* Off: the cable and its plugs go dull */
.is-off .lv-cable {
    stroke: color-mix(in oklab, var(--lfo-mod), #555 65%);
}

.is-off .lv-hole.plugged {
    filter: saturate(0.3) brightness(0.8);
}

.is-off .lv-jack.plugged .lv-lab,
.is-off .lv-out .lv-lab {
    color: inherit;
    opacity: 0.6;
}

/* Under 1200 px the card isn't stretched (154 px tall, beside Noise in the Sound tab or in one
   column): the knobs over the Wave switch and RETRIG, beside the screen, so the card is no
   taller than it was before PR 75. The window decides, not the card's width: the desktop's
   card is narrower than a tablet's but 189 px tall. */
@media (max-width: 1199px) {
    .lv-main {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-rows: minmax(0, 1fr) auto;
        gap: 7px 12px;
        padding-top: 7px;
        padding-bottom: 7px;
    }

    .lv-screen {
        min-height: 0;
    }

    .lv .lfo-row {
        flex-direction: column;
        justify-content: center;
        gap: 4px;
    }

    .lv-bay {
        grid-column: 1 / -1;
    }
}
/* THE CARD END */
</style>

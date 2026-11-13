<!-- components/LFOGroup.vue -->
<template>
    <KnobGroup v-model="localEnabled" :color="color" :showToggle="showToggle" :showHeader="false">
        <div class="lfo-root lfo-container">
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
        fmInUse: true
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

</style>

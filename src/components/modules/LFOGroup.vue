<!-- components/LFOGroup.vue -->
<template>
    <KnobGroup v-model="localEnabled" :color="color" :showToggle="showToggle" :showHeader="false">
        <div class="lfo-root lfo-container">
            <!-- One compact row: power tile, Rate and Depth, then the Wave and Target switches -->
            <div class="lfo-row">
                <button type="button" class="lfo-power" :class="{ on: localEnabled, idle: pwIdle }"
                    :aria-pressed="localEnabled" aria-label="LFO on"
                    :title="pwIdle ? 'The LFO is set to PW, but no pads play Pulse' : 'Toggle LFO'"
                    @click="localEnabled = !localEnabled">
                    <span class="lfo-status">{{ pwIdle ? 'No Pulse' : localEnabled ? 'On' : 'Off' }}</span>
                    <svg viewBox="0 0 100 32" focusable="false" aria-hidden="true">
                        <path :d="wavePath(localWaveform || 'sine')" class="wv" />
                    </svg>
                </button>

                <div class="pt-knob-row lfo-knobs">
                    <div class="position-relative text-center">
                        <Knob midi-id="lfo.rate" :value-text="localSync ? String(localDivision) : `${Number(localRate).toFixed(1)} Hz`" v-model="rateKnobModel" size="small" :min="rateMin" :max="rateMax" :step="rateStep"
                            label="Rate" :color="color" :disabled="!localEnabled" :showMarkers="localSync"
                            :markers="rateMarkers" :markersOnly="localSync" :markersOffsetDeg="-90"
                            @knobStart="activeKnob = 'rate'" @knobEnd="activeKnob = null" />
                        <span v-if="activeKnob === 'rate'" class="custom-tooltip">
                            <template v-if="localSync">{{ localDivision }}</template>
                            <template v-else>{{ Number(localRate).toFixed(1) }} Hz</template>
                        </span>
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
                            <button v-for="w in waves" :key="w" type="button" class="lfo-seg-btn"
                                :class="{ active: localWaveform === w }" role="radio"
                                :aria-checked="localWaveform === w ? 'true' : 'false'" :aria-label="waveLong(w)"
                                :disabled="!localEnabled" @click="setWave(w)" :title="waveLong(w)">
                                <svg viewBox="0 0 100 32" focusable="false" aria-hidden="true">
                                    <path :d="wavePath(w)" class="wv" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div class="lfo-switch">
                        <span class="lfo-switch-label" aria-hidden="true">Target</span>
                        <div class="lfo-seg" role="radiogroup" aria-label="LFO Target">
                            <button type="button" class="lfo-seg-btn"
                                :class="{ active: currentTarget === 'pitch' }" :disabled="!localEnabled" role="radio"
                                :aria-checked="currentTarget === 'pitch' ? 'true' : 'false'"
                                @click="updateTarget('pitch')" title="Modulate Pitch">Pitch</button>
                            <button type="button" class="lfo-seg-btn"
                                :class="{ active: currentTarget === 'filter' }" :disabled="!localEnabled" role="radio"
                                :aria-checked="currentTarget === 'filter' ? 'true' : 'false'"
                                @click="updateTarget('filter')" title="Modulate Filter">Filter</button>
                            <button type="button" class="lfo-seg-btn"
                                :class="{ active: currentTarget === 'pwm', 'no-pulse': !pulseInUse }" :disabled="!localEnabled" role="radio"
                                :aria-checked="currentTarget === 'pwm' ? 'true' : 'false'" aria-label="Pulse width"
                                @click="updateTarget('pwm')"
                                :title="pulseInUse ? 'Modulate the pulse wave\'s width' : 'Only affects pads playing Pulse. None do right now.'">Pulse</button>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="advancedOpen" class="mm-menu" role="menu" @click.stop :style="{
                left: (advPos?.x ?? 0) + 'px',
                top: (advPos?.y ?? 0) + 'px'
            }">
                <div class="mm-menu-title">Advanced Options</div>

                <div class="mm-opt" role="menuitem" @click="setSync(!localSync)">
                    <span>Free rate (Hz)</span>
                    <button class="mm-switch" :class="{ on: !localSync }">
                        <span class="kn"></span>
                    </button>
                </div>
                <div class="mm-reset" role="menuitem" @click.stop="resetAdvanced">
                    Reset Settings to defaults
                </div>
            </div>

            <div v-if="advancedOpen" class="mm-overlay" @click="advancedOpen = false"></div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';

type Target = 'pitch' | 'filter' | 'pwm';
type Wave = 'sine' | 'square';

const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        rate: number;
        depth: number;
        target: Target;
        waveform?: Wave;
        syncEnabled?: boolean;
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
    }>(),
    {
        modelValue: false,
        rate: 2,
        depth: 0,
        target: 'pitch',
        waveform: 'sine',
        syncEnabled: true,
        division: '1/8',
        depthMax: 100,
        color: '#00BCD4',
        waves: () => ['sine', 'square'],
        divisions: () => ['1/1', '1/2', '1/4', '1/8.', '1/8', '1/8T', '1/16', '1/32'],
        showToggle: false,
        retrigger: false,
        bipolar: false,
        pulseInUse: true
    }
);

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
    (e: 'update:rate', v: number): void;
    (e: 'update:depth', v: number): void;
    (e: 'update:target', v: Target): void;
    (e: 'update:waveform', v: Wave): void;
    (e: 'update:syncEnabled', v: boolean): void;
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

const advancedOpen = ref(false);
const advPos = ref<{ x: number; y: number } | null>(null);

function openAdvanced(e?: MouseEvent): void {
    const target = e?.currentTarget as HTMLElement | null;
    // Prefer the LFO container that actually owns the trigger
    const parent =
        (target?.closest('.lfo-container') as HTMLElement | null) ||
        (document.querySelector('.lfo-container') as HTMLElement | null);

    // Fallback defaults
    let x = 24;
    let y = 24;

    if (target && parent) {
        const triggerRect = target.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();

        // Initial "open to the right of trigger" position (desktop behavior)
        x = Math.round(triggerRect.right - parentRect.left + 8);
        y = Math.round(triggerRect.top - parentRect.top);

        // On small screens only, clamp inside the LFO container
        if (typeof window !== 'undefined' && window.innerWidth <= 720) {
            const MENU_WIDTH = 280;
            const PADDING = 8;

            const maxX = Math.max(PADDING, parentRect.width - MENU_WIDTH - PADDING);
            if (x > maxX) x = maxX;
            if (x < PADDING) x = PADDING;
        }
    }

    advPos.value = { x, y };
    advancedOpen.value = true;
}

function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') advancedOpen.value = false;
}

onMounted(() => {
    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onKey, { capture: true });
    }
});

onUnmounted(() => {
    if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKey, { capture: true });
    }
});

defineExpose({ openAdvanced });

const localEnabled = ref<boolean>(props.modelValue);
watch(
    () => props.modelValue,
    (v) => {
        localEnabled.value = v;
    }
);
watch(localEnabled, (v) => emit('update:modelValue', v));

const localRate = ref<number>(props.rate);
watch(
    () => props.rate,
    (v) => {
        localRate.value = v;
    }
);
watch(localRate, (v) => emit('update:rate', v));

const localDepth = ref<number>(props.depth);
watch(
    () => props.depth,
    (v) => {
        localDepth.value = v;
    }
);
watch(localDepth, (v) => emit('update:depth', v));

const currentTarget = computed<Target>(() => props.target);
// Set to PW with nothing playing Pulse: the LFO changes nothing you can hear, so the tile says so
const pwIdle = computed(() => localEnabled.value && currentTarget.value === 'pwm' && !props.pulseInUse);
const updateTarget = (t: Target): void => {
    emit('update:target', t);
    // Reset depth when changing target
    localDepth.value = 0;
    emit('update:depth', 0);
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

const localSync = ref<boolean>(props.syncEnabled);
watch(
    () => props.syncEnabled,
    (v) => {
        localSync.value = v;
    }
);
function setSync(v: boolean): void {
    localSync.value = v;
    emit('update:syncEnabled', v);
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
    }
});

const rateMin = computed<number>(() => (localSync.value ? 0 : 0.1));
const rateMax = computed<number>(() => (localSync.value ? props.divisions.length - 1 : 20));
const rateStep = computed<number>(() => (localSync.value ? 1 : 0.1));

const rateMarkers = computed<number[]>(() => {
    if (!localSync.value) return [];
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

const rateKnobModel = computed<number>({
    get() {
        return localSync.value ? divisionIndex.value : localRate.value;
    },
    set(v: number) {
        if (localSync.value) {
            divisionIndex.value = v;
        } else {
            localRate.value = v;
        }
    }
});

function resetAdvanced(): void {
    // Reset core motion parameters
    localRate.value = 2;
    localDepth.value = 0;
    localSync.value = true;
    localDivision.value = '1/8';

    emit('update:rate', 2);
    emit('update:depth', 0);
    emit('update:syncEnabled', true);
    emit('update:division', '1/8');

    advancedOpen.value = false;
}

function wavePath(w: Wave | string): string {
    switch (w) {
        case 'square':
            return 'M0 16 L25 16 L25 0 L75 0 L75 32 L100 32';
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

/* Power: a small tile with the LFO's wave, lit when on */
.lfo-power {
    flex: none;
    width: 62px;
    height: 58px;
    border-radius: 12px;
    border: 1px solid var(--pt-hairline);
    background: var(--pt-surface-2);
    color: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px;
    cursor: pointer;
    opacity: 0.75;
}

.lfo-power.on {
    opacity: 1;
    border-color: hsl(var(--pt-accent) 80% 62% / 0.8);
    background: radial-gradient(circle at 0% 0%, hsl(var(--pt-accent) 70% 30% / 0.42), transparent),
        var(--pt-surface-2);
}

.lfo-power.idle {
    border-color: rgb(255 193 7 / 0.8);
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

.lfo-power:active {
    transform: translateY(1px);
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

/* Wave and Target: two small segmented switches, stacked */
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

.lfo-seg {
    display: inline-flex;
    border: 1px solid var(--pt-hairline);
    border-radius: 999px;
    overflow: hidden;
    background: var(--pt-surface-2);
}

.lfo-seg-btn {
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 11px;
    line-height: 1;
    min-width: 34px;
    height: 24px;
    padding: 0 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.75;
}

.lfo-seg-btn + .lfo-seg-btn {
    border-left: 1px solid var(--pt-hairline);
}

.lfo-seg-btn svg {
    width: 22px;
    height: 12px;
}

.lfo-seg-btn.active {
    opacity: 1;
    background: linear-gradient(135deg,
            hsl(var(--pt-accent) 70% 26% / 0.55),
            hsl(var(--pt-accent) 70% 10% / 0.15));
    box-shadow: inset 0 0 0 1px hsl(var(--pt-accent) 75% 62% / 0.8);
}

.lfo-seg-btn:disabled {
    cursor: default;
    opacity: 0.4;
}

.lfo-seg-btn:focus-visible,
.lfo-power:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 62%);
    outline-offset: 2px;
}

.mm-menu {
    position: absolute;
    min-width: 280px;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
    padding: 10px;
    z-index: 1000;
    background: var(--pt-panel);
    color: var(--pt-text);
    border: 1px solid var(--pt-hairline);
}

.mm-menu-title {
    font-weight: 700;
    color: #c7cee0;
    opacity: 0.9;
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
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
}

.mm-reset {
    text-align: center;
    color: #c7cee0;
    opacity: 0.9;
    padding: 10px 8px 4px;
    cursor: pointer;
}

.mm-switch {
    --sw: 38px;
    --kn: 18px;
    width: var(--sw);
    height: 22px;
    border-radius: 999px;
    background: var(--pt-surface-2);
    border: 1px solid var(--pt-hairline);
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
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.35);
}

.mm-switch.on {
    background: linear-gradient(180deg,
            hsl(var(--pt-accent) 80% 60%),
            hsl(var(--pt-accent-2, var(--pt-accent)) 80% 60%));
}

.mm-switch.on .kn {
    left: calc(100% - var(--kn) - 2px);
}

.mm-overlay {
    position: fixed;
    inset: 0;
    z-index: 999;
}

</style>

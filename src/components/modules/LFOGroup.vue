<!-- components/LFOGroup.vue -->
<template>
    <KnobGroup v-model="localEnabled" :color="color" :showToggle="showToggle" :showHeader="false">
        <div class="lfo-root lfo-container">
            <div class="pt-stack">
                <div class="lfo-header" role="group" aria-label="LFO Header">
                    <button class="lfo-power-tile" :class="{ on: localEnabled }" :aria-pressed="localEnabled"
                        title="Toggle LFO" @click="localEnabled = !localEnabled" @contextmenu.prevent="openAdvanced">
                        <span class="lfo-power-wave">
                            <svg viewBox="0 0 100 32" focusable="false" aria-hidden="true">
                                <path :d="wavePath(localWaveform || 'sine')" class="wv" />
                            </svg>
                        </span>
                        <span class="lfo-power-label">LFO</span>
                    </button>

                    <div class="lfo-waves" role="radiogroup" aria-label="LFO Waveform">
                        <button v-for="w in waves" :key="w" class="lfo-wave-btn"
                            :class="{ active: localWaveform === w, disabled: !localEnabled }" role="radio"
                            :aria-checked="localWaveform === w ? 'true' : 'false'" :disabled="!localEnabled"
                            @click="setWave(w)" :title="waveLong(w)">
                            <svg viewBox="0 0 100 32" focusable="false" aria-hidden="true">
                                <path :d="wavePath(w)" class="wv" />
                            </svg>
                            <span class="label">{{ waveLabel(w) }}</span>
                        </button>
                    </div>
                </div>

                <div class="lfo-target-quick" role="radiogroup" aria-label="LFO Target">
                    <button class="mm-pill" :class="{ active: currentTarget === 'pitch', disabled: !localEnabled }"
                        :disabled="!localEnabled" role="radio"
                        :aria-checked="currentTarget === 'pitch' ? 'true' : 'false'" @click="updateTarget('pitch')"
                        title="Modulate Pitch">
                        Pitch
                    </button>
                    <button class="mm-pill" :class="{ active: currentTarget === 'filter', disabled: !localEnabled }"
                        :disabled="!localEnabled" role="radio"
                        :aria-checked="currentTarget === 'filter' ? 'true' : 'false'" @click="updateTarget('filter')"
                        title="Modulate Filter">
                        Filter
                    </button>
                </div>

                <div class="pt-knob-row">
                    <div class="position-relative text-center">
                        <Knob v-model="rateKnobModel" size="small" :min="rateMin" :max="rateMax" :step="rateStep"
                            label="Rate" :color="color" :disabled="!localEnabled" :showMarkers="localSync"
                            :markers="rateMarkers" :markersOnly="localSync" :markersOffsetDeg="-90"
                            @knobStart="activeKnob = 'rate'" @knobEnd="activeKnob = null" />
                        <span v-if="activeKnob === 'rate'" class="custom-tooltip">
                            <template v-if="localSync">{{ localDivision }}</template>
                            <template v-else>{{ Number(localRate).toFixed(1) }} Hz</template>
                        </span>
                    </div>

                    <div class="position-relative text-center">
                        <Knob v-model="localDepth" size="small" :min="0" :max="depthMax" :step="depthStep" label="Depth"
                            :color="color" :disabled="!localEnabled" @knobStart="activeKnob = 'depth'"
                            @knobEnd="activeKnob = null" />
                        <span v-if="activeKnob === 'depth'" class="custom-tooltip">{{ depthReadout }}</span>
                    </div>
                </div>
            </div>
       
            <div v-if="advancedOpen" class="mm-menu" role="menu" @click.stop
                :style="{ left: (advPos?.x ?? 0) + 'px', top: (advPos?.y ?? 0) + 'px' }">
                <div class="mm-menu-title">Advanced Options</div>

                <div class="mm-opt" role="menuitem" @click="setSync(!localSync)">
                    <span>Free rate (Hz)</span>
                    <button class="mm-switch" :class="{ on: !localSync }"><span class="kn"></span></button>
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
import { ref, watch, computed, onUnmounted } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';

type Target = 'pitch' | 'filter';
type Wave = 'sine' | 'square';

const props = withDefaults(defineProps<{
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
}>(), {
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
    bipolar: false
});

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

/* Labels */
function waveLabel(w: Wave | string): string {
    return w.charAt(0).toUpperCase() + w.slice(1);
}
function waveLong(w: Wave | string): string {
    return waveLabel(w);
}

/* Advanced menu state */
const advancedOpen = ref(false);
const advPos = ref<{ x: number; y: number } | null>(null);

function openAdvanced(e?: MouseEvent): void {
    const target = e?.currentTarget as HTMLElement | null;
    const parent = document.querySelector('.lfo-container') as HTMLElement | null;
    if (target && parent) {
        const r = target.getBoundingClientRect();
        const p = parent.getBoundingClientRect();
        advPos.value = { x: Math.round(r.right - p.left + 8), y: Math.round(r.top - p.top) };
    } else {
        advPos.value = { x: 24, y: 24 };
    }
    advancedOpen.value = true;
}

function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') advancedOpen.value = false;
}
window.addEventListener('keydown', onKey, { capture: true });
onUnmounted(() => window.removeEventListener('keydown', onKey));

defineExpose({ openAdvanced });

const localEnabled = ref<boolean>(props.modelValue);
watch(() => props.modelValue, v => { localEnabled.value = v; });
watch(localEnabled, v => emit('update:modelValue', v));

const localRate = ref<number>(props.rate);
watch(() => props.rate, v => { localRate.value = v; });
watch(localRate, v => emit('update:rate', v));

const localDepth = ref<number>(props.depth);
watch(() => props.depth, v => { localDepth.value = v; });
watch(localDepth, v => emit('update:depth', v));

const currentTarget = computed<Target>(() => props.target);
const updateTarget = (t: Target): void => {
    emit('update:target', t);
    localDepth.value = 0;
    emit('update:depth', 0);
};

const localWaveform = ref<Wave | undefined>(props.waveform);
watch(() => props.waveform, v => { localWaveform.value = v; });
function setWave(w: Wave): void { emit('update:waveform', w); }

const localSync = ref<boolean>(props.syncEnabled);
watch(() => props.syncEnabled, v => { localSync.value = v; });
function setSync(v: boolean): void { emit('update:syncEnabled', v); }

const localDivision = ref<string | undefined>(props.division);
watch(() => props.division, v => { localDivision.value = v; });
function setDivision(d: string): void { emit('update:division', d); }

const activeKnob = ref<null | 'rate' | 'depth'>(null);

const depthStep = computed<number>(() => {
    switch (currentTarget.value) {
        case 'filter': return 10;     
        case 'pitch':
        default: return 1;            
    }
});
const depthReadout = computed<string>(() => {
    const v = localDepth.value;
    switch (currentTarget.value) {
        case 'pitch': return `${Math.round(v)} cents`;
        case 'filter': return `${Math.round(v)} Hz`;
    }
});

/* Rate controls */
const rateMin = computed<number>(() => (localSync.value ? 0 : 0.1));
const rateMax = computed<number>(() => (localSync.value ? (props.divisions.length - 1) : 20));
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
        if (localSync.value) divisionIndex.value = v;
        else localRate.value = v;
    }
});

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
}

.lfo-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
}

.lfo-power-tile {
    --sz: 72px;
    width: var(--sz);
    height: var(--sz);
    border-radius: 14px;
    border: 1px solid var(--pt-hairline);
    background: var(--pt-surface-2);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .03);
    transition: box-shadow .2s, transform .05s;
}

.lfo-power-tile.on {
    box-shadow: 0 8px 24px rgb(0 0 0 / .35), inset 0 0 0 1px rgba(255, 255, 255, .08);
    outline: 2px solid hsl(var(--pt-accent) 70% 60% / .6);
}

.lfo-power-tile:active {
    transform: translateY(1px);
}

.lfo-power-wave {
    width: 52px;
    height: 20px;
    display: block;
}

.lfo-power-label {
    font-weight: 700;
    font-size: 12px;
    color: #c7cee0;
    opacity: .9;
}

svg {
    display: block;
    width: 100%;
    height: 100%;
}

.wv {
    fill: none;
    stroke: hsl(var(--pt-accent) 80% 65%);
    stroke-width: 2.25;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.lfo-waves {
    display: flex;
    align-items: center;
    gap: 8px;
}

.lfo-wave-btn {
    --w: 94px;
    --h: 40px;
    width: var(--w);
    height: var(--h);
    border-radius: 12px;
    background: var(--pt-surface-2);
    border: 1px solid var(--pt-hairline);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
}

.lfo-wave-btn .label {
    font-size: 12px;
    color: #c7cee0;
    opacity: .95;
}

.lfo-wave-btn svg {
    width: 56px;
    height: 20px;
}

.lfo-wave-btn.active {
    background: linear-gradient(180deg, hsl(var(--pt-accent) 70% 18% / .35), transparent);
    border-color: hsl(var(--pt-accent) 70% 55% / .65);
}

.lfo-wave-btn.disabled {
    opacity: .5;
    pointer-events: none;
}

.lfo-wave-btn:active {
    transform: translateY(1px);
}

.lfo-target-quick {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
    margin-top: 4px;
}

.mm-pill {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid var(--pt-hairline);
    background: var(--pt-surface-2);
    color: #c7cee0;
    font-size: 12px;
}

.mm-pill.active {
    border-color: hsl(var(--pt-accent) 70% 55% / .7);
    background: linear-gradient(180deg, hsl(var(--pt-accent) 70% 18% / .35), transparent);
}

.mm-pill.disabled {
    opacity: .5;
    pointer-events: none;
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
</style>

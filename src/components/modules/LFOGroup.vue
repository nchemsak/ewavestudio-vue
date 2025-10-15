<!-- components/LFOGroup.vue -->
<template>
    <KnobGroup v-model="localEnabled" :color="color" :showToggle="showToggle" :showHeader="false">
        <!-- LFO body -->
        <div class="lfo-root lfo-container">
            <!-- (kept) simple inline info popover -->
            <InfoPopover title="LFO" aria-label="What is the LFO?">
                A Low Frequency Oscillator (LFO) is a slow modulation source that changes a target parameter.
            </InfoPopover>

            <div class="pt-stack">
                <div class="lfo-controls" role="group" aria-label="LFO Controls">
                    <!-- Sync / Free -->
                    <div class="pt-seg pt-seg-sm" role="group" aria-label="LFO Rate Mode"
                        :class="{ disabled: !localEnabled }">
                        <button class="pt-seg-btn" :class="{ 'is-active': localSync }" :disabled="!localEnabled"
                            @click="setSync(true)">Sync</button>
                        <button class="pt-seg-btn" :class="{ 'is-active': !localSync }" :disabled="!localEnabled"
                            @click="setSync(false)">Free</button>
                    </div>

                    <!-- Waveform -->
                    <div class="pt-seg pt-seg-sm" role="group" aria-label="LFO Wave"
                        :class="{ disabled: !localEnabled }">
                        <button v-for="w in waves" :key="w" class="pt-seg-btn"
                            :class="{ 'is-active': localWaveform === w }" :aria-pressed="localWaveform === w"
                            :disabled="!localEnabled" @click="setWave(w)">
                            {{ waveLabel(w) }}
                            <span class="selector-tooltip">{{ waveLong(w) }}</span>
                        </button>
                    </div>

                    <!-- Target dots -->
                    <div class="lfo-target-selector" role="group" aria-label="LFO Target">
                        <span v-for="t in targets" :key="t" class="lfo-type-dot"
                            :class="{ selected: currentTarget === t, disabled: !localEnabled }"
                            @click="localEnabled && updateTarget(t)">
                            <span class="selector-tooltip">{{ labelFor(t) }}</span>
                        </span>
                    </div>
                </div>

                <!-- Knobs -->
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

            <!-- ===== Advanced menu (positioned like Melody) ===== -->
            <div v-if="advancedOpen" class="mm-menu" role="menu" @click.stop
                :style="{ left: (advPos?.x ?? 0) + 'px', top: (advPos?.y ?? 0) + 'px' }">
                <div class="mm-menu-title">Advanced Options</div>

                <!-- Retrigger -->
                <div class="mm-opt" role="menuitem" @click="retriggerLocal = !retriggerLocal">
                    <span>Retrigger on note-on</span>
                    <button class="mm-switch" :class="{ on: retriggerLocal }"><span class="kn"></span></button>
                </div>

                <!-- Bipolar -->
                <div class="mm-opt" role="menuitem" @click="bipolarLocal = !bipolarLocal">
                    <span>Bipolar depth</span>
                    <button class="mm-switch" :class="{ on: bipolarLocal }"><span class="kn"></span></button>
                </div>

                <div class="mm-reset" role="menuitem" @click.stop="resetAdvanced">
                    Reset Settings to defaults
                </div>
            </div>

            <!-- overlay to close -->
            <div v-if="advancedOpen" class="mm-overlay" @click="advancedOpen = false"></div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';
import InfoPopover from '../InfoPopover.vue';

type Target = 'pitch' | 'gain' | 'filter' | 'pan';
type Wave = 'sine' | 'square' | 'random';

/* --------------------------------
   Type-based props (withDefaults OK)
----------------------------------- */
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
    targets?: Target[];
    waves?: Wave[];
    divisions?: string[];
    showToggle?: boolean;
    retrigger?: boolean;   // NEW
    bipolar?: boolean;     // NEW
}>(), {
    modelValue: false,
    rate: 2,
    depth: 0,
    target: 'gain',
    waveform: 'sine',
    syncEnabled: true,
    division: '1/8',
    depthMax: 100,
    color: '#00BCD4',
    targets: () => ['pitch', 'gain', 'filter', 'pan'],
    waves: () => ['sine', 'square', 'random'],
    divisions: () => ['1/1', '1/2', '1/4', '1/8', '1/16', '1/8T', '1/8.'],
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
    (e: 'update:retrigger', v: boolean): void; // NEW
    (e: 'update:bipolar', v: boolean): void;   // NEW
}>();

/* ------------- labels ------------- */
function waveLabel(w: Wave | string): string {
    return w === 'random' ? 'Rnd' : w.charAt(0).toUpperCase() + w.slice(1);
}
function waveLong(w: Wave | string): string {
    return w === 'random' ? 'Random (Sample & Hold)' : waveLabel(w);
}
function labelFor(t: Target | string): string {
    return t === 'gain' ? 'Amplitude' : t.charAt(0).toUpperCase() + t.slice(1);
}

/* ------------- Advanced menu ------------- */
const advancedOpen = ref(false);
const advPos = ref<{ x: number; y: number } | null>(null);

// Local mirrors for advanced toggles → emit outwards
const retriggerLocal = ref<boolean>(props.retrigger);
watch(() => props.retrigger, v => { retriggerLocal.value = v; });
watch(retriggerLocal, v => emit('update:retrigger', v));

const bipolarLocal = ref<boolean>(props.bipolar);
watch(() => props.bipolar, v => { bipolarLocal.value = v; });
watch(bipolarLocal, v => emit('update:bipolar', v));

function openAdvanced(e?: MouseEvent): void {
    const target = e?.currentTarget as HTMLElement | null;
    const parent = document.querySelector('.lfo-container') as HTMLElement | null; // anchor to this section
    if (target && parent) {
        const r = target.getBoundingClientRect();
        const p = parent.getBoundingClientRect();
        advPos.value = {
            x: Math.round(r.right - p.left + 8),
            y: Math.round(r.top - p.top)
        };
    } else {
        advPos.value = { x: 24, y: 24 };
    }
    advancedOpen.value = true;
}

function resetAdvanced(): void {
    retriggerLocal.value = false;
    bipolarLocal.value = false;
}

function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') advancedOpen.value = false;
}
window.addEventListener('keydown', onKey, { capture: true });
onUnmounted(() => window.removeEventListener('keydown', onKey));

// Expose so parent can call lfoRef.openAdvanced($event) from its ⋯ button
defineExpose({ openAdvanced });

/* ------------- Locals (snappy knobs) ------------- */
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
        case 'pitch': return 1;
        case 'gain': return 1;
        case 'pan': return 1;
        case 'filter': return 10;
        default: return 1;
    }
});
const depthReadout = computed<string>(() => {
    const v = localDepth.value;
    switch (currentTarget.value) {
        case 'pitch': return `${Math.round(v)} cents`;
        case 'gain': return `${Math.round(v)}%`;
        case 'pan': return `${Math.round(v)}%`;
        case 'filter': return `${Math.round(v)} Hz`;
        default: return String(v);
    }
});

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
</script>

<style scoped>
.lfo-header {
    display: flex;
    align-items: center;
}

.lfo-info-wrap {
    margin-left: auto;
}

.lfo-controls {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
}

.lfo-target-selector {
    display: flex;
    gap: 8px;
    align-items: center;
}

.pt-seg.disabled,
.lfo-type-dot.disabled {
    opacity: .5;
    pointer-events: none;
}

/* anchor container for absolute menu math */
.lfo-root {
    position: relative;
}

/* Reuse Melody Maker’s menu styles for pixel-perfect match */
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

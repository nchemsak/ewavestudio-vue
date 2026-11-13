<template>
    <KnobGroup class="noise-group" v-model="enabledLocal" title="Noise" :color="accent" :showToggle="showToggle">
        <div class="noise-main">
            <div class="controls-row">
                <!-- Burst -->
                <div class="control-block knob-wrap">
                    <Knob midi-id="noise.burst" :value-text="Math.round(burstMsLocal) >= 250 ? 'Full decay' : `${Math.round(burstMsLocal)} ms`" v-model="burstMsLocal" label="Burst" :min="5" :max="250" :step="1" size="small"
                        :color="accent" :disabled="!enabledLocal" @knobStart="activeKnob = 'burstMs'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'burstMs'" class="custom-tooltip">
                        {{ Math.round(burstMsLocal) >= 250 ? 'Full decay' : Math.round(burstMsLocal) + ' ms' }}
                    </span>
                </div>

                <!-- Amount -->
                <div class="control-block knob-wrap">
                    <Knob midi-id="noise.amount" :value-text="`${Math.round(amountLocal * 100)}%`" v-model="amountLocal" label="Amount" :min="0" :max="1" :step="0.01" size="small"
                        :color="accent" :disabled="!enabledLocal" @knobStart="activeKnob = 'noiseAmount'"
                        @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'noiseAmount'" class="custom-tooltip">
                        {{ Math.round(amountLocal * 100) }}%
                    </span>
                </div>

                <!-- Color morph -->
                <div class="control-block color-block knob-wrap">
                    <div class="swatch-wrap" :aria-label="`Noise color swatch: ${colorLabel}`" :title="colorLabel">
                        <div class="swatch" :style="{ backgroundColor: swatchHex }">
                            Color
                        </div>
                    </div>

                    <Knob midi-id="noise.color" v-model="colorLocal" aria-label="Noise color" :value-text="colorLabel" :min="0" :max="1" :step="0.01"
                        :detents="colorDetents"
                        size="small" :color="accent" :disabled="!enabledLocal" />
                </div>
            </div>

            <div v-if="hasMask" class="mask-col">
                <div class="pt-section-title">Apply to Pads</div>

                <div class="mask-stack">
                    <div class="pt-btn-group" role="group" aria-label="Noise mask group 1">
                        <button class="pt-btn" @click="maskEvery2">Every 2</button>
                        <button class="pt-btn" @click="maskEvery4">Every 4</button>
                        <button class="pt-btn" title="Noise on the pattern's loudest hits" @click="maskAccents">Accents</button>
                    </div>
                    <div class="pt-btn-group" role="group" aria-label="Noise mask group 2">
                        <button class="pt-btn" @click="maskRandom">Random</button>
                        <button class="pt-btn" @click="maskInvert">Invert</button>
                        <button class="pt-btn" @click="maskAll">All</button>
                    </div>
                </div>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';
import { accentMask } from '../../lib/noise/accents';

const props = withDefaults(
    defineProps<{
        enabled: boolean;
        amount: number;
        colorMorph: number;
        mask?: boolean[];
        // The pattern, for Accents (its loudest hits)
        steps?: boolean[];
        velocities?: number[];
        attackBurst?: boolean;
        burstMs?: number;
        color?: string;
        showToggle?: boolean;
    }>(),
    {
        enabled: false,
        amount: 0.25,
        colorMorph: 0.5,
        attackBurst: false,
        burstMs: 80,
        color: '#9C27B0',
        showToggle: true
    }
);

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void;
    (e: 'update:amount', v: number): void;
    (e: 'update:colorMorph', v: number): void;
    (e: 'update:mask', v: boolean[]): void;
    (e: 'update:attackBurst', v: boolean): void;
    (e: 'update:burstMs', v: number): void;
}>();

const enabledLocal = ref<boolean>(props.enabled);
const amountLocal = ref<number>(props.amount);
const colorLocal = ref<number>(props.colorMorph);
const burstMsLocal = ref<number>(props.burstMs ?? 80);

const activeKnob = ref<null | 'noiseAmount' | 'burstMs'>(null);

// Sync props -> local
watch(
    () => props.enabled,
    (v) => {
        enabledLocal.value = v;
    }
);
watch(
    () => props.amount,
    (v) => {
        amountLocal.value = v;
    }
);
watch(
    () => props.colorMorph,
    (v) => {
        colorLocal.value = v;
    }
);
watch(
    () => props.burstMs,
    (v) => {
        if (typeof v === 'number') burstMsLocal.value = v;
    }
);

// Sync local -> parent
watch(enabledLocal, (v) => {
    emit('update:enabled', v);
    emit('update:attackBurst', v);
});
watch(amountLocal, (v) => {
    emit('update:amount', Math.max(0, Math.min(1, v)));
});
watch(colorLocal, (v) => {
    emit('update:colorMorph', Math.max(0, Math.min(1, v)));
});
watch(burstMsLocal, (v) => {
    emit('update:burstMs', Math.max(5, Math.min(250, Math.round(v))));
});

// Ensure attackBurst is initially aligned with enabled
if (props.attackBurst !== props.enabled) {
    emit('update:attackBurst', props.enabled);
}

const accent = computed(() => props.color);

// Color stops for swatch
const stops = [
    { pos: 0.0, name: 'Brown', hex: '#6a4b2f' },
    { pos: 0.25, name: 'Pink', hex: '#f5a3bd' },
    { pos: 0.5, name: 'White', hex: '#ffffff' },
    { pos: 0.75, name: 'Blue', hex: '#7bbcff' },
    { pos: 1.0, name: 'Violet', hex: '#c7a4ff' }
] as const;

// Soft notches on the knob at each named color (the ends stop there anyway)
const colorDetents = stops.map((s) => s.pos);

const colorLabel = computed(() => {
    const t = colorLocal.value;
    let nearest: (typeof stops)[number] = stops[0];
    let best = Infinity;
    for (const s of stops) {
        const d = Math.abs(s.pos - t);
        if (d < best) {
            best = d;
            nearest = s;
        }
    }
    return nearest.name;
});

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '').trim();
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
    const to2 = (n: number) => n.toString(16).padStart(2, '0');
    return `#${to2(Math.round(r))}${to2(Math.round(g))}${to2(Math.round(b))}`;
}

function mixHex(a: string, b: string, w: number): string {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    const ir = ar + (br - ar) * w;
    const ig = ag + (bg - ag) * w;
    const ib = ab + (bb - ab) * w;
    return rgbToHex(ir, ig, ib);
}

const swatchHex = computed(() => {
    const t = Math.min(1, Math.max(0, colorLocal.value));
    let a: (typeof stops)[number] = stops[0];
    let b: (typeof stops)[number] = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
        const s0 = stops[i];
        const s1 = stops[i + 1];
        if (t >= s0.pos && t <= s1.pos) {
            a = s0;
            b = s1;
            break;
        }
    }
    const span = Math.max(1e-6, b.pos - a.pos);
    const w = (t - a.pos) / span;
    return mixHex(a.hex, b.hex, w);
});

// Per-Pad Noise mask
const hasMask = computed(() => Array.isArray(props.mask) && props.mask.length > 0);

const emitMask = (out: boolean[]) => {
    emit('update:mask', out);
};

function updateMask(make: (i: number, len: number) => boolean): void {
    const len = props.mask?.length ?? 0;
    if (len <= 0) return;
    const out = Array.from({ length: len }, (_, i) => !!make(i, len));
    emitMask(out);
}

function maskAll(): void {
    updateMask(() => true);
}
function maskEvery2(): void {
    updateMask((i) => i % 2 === 0);
}
function maskEvery4(): void {
    updateMask((i) => i % 4 === 0);
}
function maskInvert(): void {
    if (!props.mask) return;
    emitMask(props.mask.map((v) => !v));
}
function maskRandom(): void {
    updateMask(() => Math.random() < 0.5);
}
// The pattern's loudest hits (src/lib/noise/accents.ts). It replaced Backbeat in PR 69, whose
// steps 5 and 13 often had no hit, so the button seemed to do nothing.
function maskAccents(): void {
    const len = props.mask?.length ?? 0;
    if (len <= 0) return;
    const m = accentMask(props.steps ?? [], props.velocities ?? []);
    updateMask((i) => !!m[i]);
}
</script>

<style scoped>
/* The card's width decides the layout (the container query at the end) */
.noise-group {
    container: noise / inline-size;
}

/* The knobs on the left, the mask buttons filling the rest of the card */
.noise-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 14px;
    row-gap: 10px;
    align-items: center;
    width: 100%;
    min-width: 0;
}

.controls-row {
    display: grid;
    grid-auto-flow: column;
    justify-content: start;
    align-items: center;
    gap: 12px;
    min-width: 0;
}

.control-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: auto;
}

.knob-wrap {
    position: relative;
    text-align: center;
}

.swatch-wrap {
    width: 100%;
}

.swatch {
    height: 9px;
    border-radius: 1px;
    border: none;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
    transition: background-color 120ms linear;
    font-size: 10px;
    color: black;
    line-height: 9px;
    text-align: center;
}

.custom-tooltip {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: -22px;
    padding: 2px 6px;
    font-size: 12px;
    line-height: 1.2;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
    z-index: 2;
}

.mask-col {
    min-width: 0;
}

.mask-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.pt-btn-group {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px !important;
}

.pt-btn {
    min-width: 0;
    min-height: auto;
    line-height: 1;
    font-size: 0.65rem;
    width: 100%;
    padding: 4px 2px;
    white-space: nowrap;
    z-index: 2;
}

/* A narrow card: the mask buttons under the knobs */
@container noise (max-width: 320px) {
    .noise-main {
        grid-template-columns: minmax(0, 1fr);
    }

    .controls-row {
        justify-content: space-evenly;
    }
}
</style>

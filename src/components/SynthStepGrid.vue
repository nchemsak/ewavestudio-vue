<!-- src/components/SynthStepGrid.vue -->
<template>
    <div class="d-flex pad-row">
        <div class="padTEST-grid" data-equal-cols>
            <div v-for="(active, index) in steps" :key="index" class="pad-col" @mouseleave="hovered = null">
                <div class="pad-head">
                    <button class="pad-settings-dot" @mousedown.stop @click.stop="emitOpenSettings(index, $event)"
                        aria-label="Pad settings">⋮</button>

                    <div v-if="showIndices" class="pad-step-num">{{ index + 1 }}</div>
                </div>

                <!-- body -->
                <div class="padTESTwrap" @mouseenter="hovered = index" @mouseleave="hovered = null">
                    <div :class="[
                        'padTEST', 'liquid',
                        { selected: active },
                        { playing: index === currentStep },
                        // { 'has-noise': !!noiseMask?.[index] }
                        { 'has-noise': noiseOn(index) }
                    ]" @mousedown="onMouseDown($event, index)" @mouseenter="onMouseEnter(index)" @dragstart.prevent
                        :style="padStyle(index)">
                        <div v-if="noiseOn(index)" class="noise-overlay" :class="[`mode-${noiseMode}`]"
                            :style="noiseStyle(index)" aria-hidden="true">
                            <div v-if="noiseMode === 'static'" class="grain" />

                            <!-- SVG turbulence TV static -->
                            <div v-else-if="noiseMode === 'svg'" class="svg-noise">
                                <svg class="svg-filter" width="0" height="0" aria-hidden="true" focusable="false">
                                    <filter :id="`tvNoise-${uid}-${index}`">
                                        <feTurbulence type="fractalNoise" :baseFrequency="svgBase" numOctaves="2"
                                            stitchTiles="stitch" seed="2" result="noise">
                                            <animate attributeName="baseFrequency" :dur="svgDur"
                                                values="0.65;0.8;0.7;0.9;0.65" repeatCount="indefinite" />
                                            <animate attributeName="seed" :dur="svgDur" values="2;3;4;5;6;7;8;2"
                                                repeatCount="indefinite" />
                                        </feTurbulence>
                                        <feColorMatrix type="matrix" values="0 0 0 0 1
                              0 0 0 0 1
                              0 0 0 0 1
                              0 0 0 1 0" result="noisergb" />
                                    </filter>
                                </svg>
                                <div class="svg-noise-fill" :style="{ filter: `url(#tvNoise-${uid}-${index})` }" />
                            </div>

                            <!-- GIF / video -->
                            <img v-else-if="noiseMode === 'gif' && noiseGifUrl" class="noise-gif" :src="noiseGifUrl"
                                alt="" aria-hidden="true" decoding="async" loading="lazy" />

                            <div class="pepper" />
                        </div>
                    </div>

                    <!-- waveform badge -->
                    <div class="wave-badge" :class="{ 'is-off': !active }" :data-wave="waveFor(index)"
                        :title="waveFor(index)">
                        <svg class="wave-ico" viewBox="0 0 12 12" width="12" height="12" fill="none"
                            stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"
                            aria-hidden="true" preserveAspectRatio="xMidYMid meet">
                            <circle v-if="waveFor(index) === 'sine'" cx="6" cy="6" r="3.6" />
                            <path v-else-if="waveFor(index) === 'triangle'" d="M2 10 L6 2 L10 10 Z" fill="none" />
                            <path v-else-if="waveFor(index) === 'sawtooth'" d="M2 10 L2 2 L10 10 Z" fill="none" />
                            <rect v-else-if="waveFor(index) === 'square'" x="2.2" y="2.2" width="7.6" height="7.6"
                                rx="0.3" ry="0.3" fill="none" />
                            <circle v-else cx="6" cy="6" r="3.6" />
                        </svg>
                    </div>

                    <!-- per-step note chip -->
                    <div v-if="active" class="note-chip">
                        {{ nearestNote(pitches[index]) }}
                    </div>

                    <!-- hover sliders -->
                    <div v-if="active && hovered === index && props.showVelocity" class="hover-slider volume-slider">
                        <input type="range" min="0" max="1" step="0.01" :value="velocities[index]"
                            @input="updateVelocity(index, $event)" @mousedown="activeVol = index"
                            @mouseup="activeVol = null" @touchstart="activeVol = index" @touchend="activeVol = null" />
                        <span v-if="activeVol === index" class="custom-tooltip">
                            {{ Math.round(velocities[index] * 100) }}%
                        </span>
                    </div>

                    <div v-if="active && hovered === index && props.showPitch" class="hover-slider pitch-slider">
                        <input :min="minHz" :max="maxHz" step="1" type="range" :value="pitches[index]"
                            @input="updatePitch(index, $event)" @mousedown="activePitch = index"
                            @mouseup="activePitch = null" @touchstart="activePitch = index"
                            @touchend="activePitch = null" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

type NoteNameFn = (hz: number) => string;
type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

const props = withDefaults(defineProps<{
    name: string;
    currentStep: number;
    minHz: number;
    maxHz: number;

    steps: boolean[];
    velocities: number[];
    pitches: number[];

    nearestNote: NoteNameFn;

    showIndices?: boolean;
    showVelocity?: boolean;
    showPitch?: boolean;

    /** Optional per-step waveforms + global default (used for the badge) */
    waveforms?: Wave[];
    defaultWave?: Wave;

    /** per-step noise participation + tint controls */
    noiseMask?: boolean[];
    noiseTint?: string;     // e.g. '#3ec2cc'
    noiseAlpha?: number;    // 0..1

    noiseEnabled?: boolean;
    noiseMode?: 'wash' | 'static' | 'svg' | 'gif';

    /** for noiseMode='gif' */
    noiseGifUrl?: string;

    /** animation tuning */
    noiseFps?: number;      // for CSS static (steps)
    noiseSpeed?: number;    // for CSS static (px/sec)


    pepperAlpha?: number;  // 0..1 opacity of black speckles
    pepperScale?: number;  // px density cell for the repeating micro-speck layer

}>(), {
    showIndices: true,
    showVelocity: true,
    showPitch: true,
    noiseMode: 'wash',
    noiseFps: 12,
    noiseSpeed: 60,
    noiseEnabled: true,
    pepperAlpha: 0.16,
    pepperScale: 6,

});

const emit = defineEmits<{
    (e: 'update:steps', v: boolean[]): void;
    (e: 'update:velocities', v: number[]): void;
    (e: 'update:pitches', v: number[]): void;
    (e: 'open-pad-settings', payload: { name: string; index: number; anchorRect: DOMRect }): void;
}>();

/* local UI state, independent of parent */
const isMouseDown = ref(false);
const dragMode = ref<'on' | 'off' | null>(null);
const hovered = ref<number | null>(null);
const activeVol = ref<number | null>(null);
const activePitch = ref<number | null>(null);

/** simple uid so multiple grids can coexist without filter id collisions */
const uid = Math.random().toString(36).slice(2);

/* interactions */
function clone<T>(arr: T[]): T[] { return arr.slice(); }

function onMouseDown(evt: MouseEvent, index: number) {
    if ((evt.target as HTMLElement).closest('.hover-slider input')) return;
    evt.preventDefault();
    isMouseDown.value = true;

    const next = !props.steps[index];
    dragMode.value = next ? 'on' : 'off';

    const out = clone(props.steps);
    out[index] = next;
    emit('update:steps', out);

    window.addEventListener('mouseup', onMouseUp, { once: true });
}
function onMouseEnter(index: number) {
    if (!isMouseDown.value || !dragMode.value) return;
    const out = clone(props.steps);
    out[index] = dragMode.value === 'on';
    emit('update:steps', out);
}
function onMouseUp() {
    isMouseDown.value = false;
    dragMode.value = null;
}

function updateVelocity(i: number, e: Event) {
    const v = Math.min(1, Math.max(0, Number((e.target as HTMLInputElement).value)));
    const out = clone(props.velocities);
    out[i] = v;
    emit('update:velocities', out);
}
function updatePitch(i: number, e: Event) {
    const v = Math.min(props.maxHz, Math.max(props.minHz, Number((e.target as HTMLInputElement).value)));
    const out = clone(props.pitches);
    out[i] = v;
    emit('update:pitches', out);
}

function emitOpenSettings(index: number, evt: MouseEvent) {
    const r = (evt.currentTarget as HTMLElement).getBoundingClientRect();
    emit('open-pad-settings', { name: props.name, index, anchorRect: r });
}

/* --- visuals --- */
function hueFor(hz: number, lo = props.minHz, hi = props.maxHz) {
    const t = Math.min(1, Math.max(0, (hz - lo) / (hi - lo)));
    return Math.round(220 * (1 - t));
}

function padStyle(index: number) {
    if (!props.steps[index]) return { '--pad-on': 0 } as any;
    const pct = Math.round((props.velocities[index] ?? 0) * 100);
    const hue = hueFor(props.pitches[index] || props.minHz);

    return {
        '--vol': pct,
        '--heat-h': hue,
        '--pad-on': 1,
        '--noise-alpha': String(typeof props.noiseAlpha === 'number' ? props.noiseAlpha : 0.28) // boosted default
    } as any;
}

/** per-step noise overlay styling */
function noiseStyle(index: number) {
    const tint = props.noiseTint || '#9bf3ff'; // brighter default so it "reads"
    const a = typeof props.noiseAlpha === 'number' ? props.noiseAlpha : 0.28;
    const fps = Math.max(1, props.noiseFps || 12);
    const speed = Math.max(1, props.noiseSpeed || 60); // px/sec

    return {
        '--noise-tint': tint,
        '--noise-alpha': String(a),
        '--noise-fps': String(fps),
        '--noise-speed': String(speed),
        '--pepper-alpha': String(
            typeof (props as any).pepperAlpha === 'number' ? (props as any).pepperAlpha : 0.16
        ),
        '--pepper-scale': String(
            Math.max(2, (props as any).pepperScale ?? 6)
        ),

    } as any;
}

function noiseOn(i: number) {
    return !!props.noiseEnabled && !!props.steps?.[i] && !!props.noiseMask?.[i];
    // (optional) also gate by velocity if you want: && (props.velocities?.[i] ?? 0) > 0
}

/* SVG noise timing */
const svgDur = '0.6s';
const svgBase = 0.8;

function waveFor(i: number): Wave {
    return (props.waveforms?.[i] ?? props.defaultWave ?? 'sine') as Wave;
}
const nearestNote = props.nearestNote;
</script>

<style scoped>
/* =================== badge (unchanged) =================== */
.wave-badge {
    --wb-pad-x: 3px;
    --wb-pad-y: 2px;
    --wb-radius: 6px;
    position: absolute;
    bottom: 3px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: var(--wb-pad-y) var(--wb-pad-x);
    border-radius: var(--wb-radius);
    background: linear-gradient(145deg, rgba(0, 0, 0, .55), rgba(0, 0, 0, .35));
    color: #fff;
    line-height: 1;
    pointer-events: none;
    user-select: none;
    opacity: .95;
    z-index: 2;
}

.wave-ico {
    width: 11px;
    height: 11px;
    display: block;
}

.wave-badge.is-off {
    opacity: .55;
}

.wave-badge[data-wave="sine"] {
    color: #7bd0ff;
}

.wave-badge[data-wave="triangle"] {
    color: #b47aff;
}

.wave-badge[data-wave="sawtooth"] {
    color: #ffd06b;
}

.wave-badge[data-wave="square"] {
    color: #a2f5a6;
}

/* =================== note chip (unchanged) =================== */
.note-chip {
    position: absolute;
    left: 50%;
    bottom: -6px;
    transform: translate(-50%, 100%);
    padding: 2px 6px;
    font-size: 10px;
    line-height: 1;
    border-radius: 6px;
    background: rgba(0, 0, 0, .65);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, .12);
    pointer-events: none;
    white-space: nowrap;
    z-index: 1000;
}

/* =================== head (unchanged) =================== */
.pad-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-height: 26px;
}

.pad-head .pad-step-num {
    position: static;
    transform: none;
    top: auto;
    left: auto;
    font-size: 10px;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(0, 0, 0, .65);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, .12);
    pointer-events: none;
}

.pad-head .pad-settings-dot {
    position: static;
    width: 18px;
    height: 18px;
    border-radius: 8px;
    border: 1px solid #2a2f42;
    background: rgba(15, 18, 26, .78);
    color: #c9d4ff;
    font-size: 13px;
    line-height: 1;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: opacity .15s ease, transform .15s ease, background .15s ease;
}

.pad-col:hover .pad-settings-dot,
.pad-settings-dot:focus-visible {
    opacity: 1;
}

.padTESTwrap {
    position: relative;
}

/* =================== NOISE OVERLAY ===================
   Layer order: padTEST::before (volume hue wash, z=1) -> .noise-overlay (z=1, drawn after) -> padTEST::after (bevel z=2) */
/* .padTEST .noise-overlay{
  position:absolute; inset:0; border-radius:inherit; z-index:1; pointer-events:none;
  opacity:1;
} */
.padTEST .noise-overlay {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    z-index: 1;
    pointer-events: none;

    /* Tweakables */
    --grain-unit: 8px;
    /* ↑ Bigger = chunkier grain (try 10px, 12px) */
    --grain-alpha: var(--noise-alpha, 0.24);

    background:
        /* angled wash */
        linear-gradient(135deg,
            color-mix(in oklab, var(--noise-tint, #3ec2cc), transparent calc(100% - (var(--grain-alpha) * 100%))) 0%,
            transparent 60%),
        /* “static” grain — thicker stripes now */
        repeating-linear-gradient(0deg,
            color-mix(in oklab, var(--noise-tint, #3ec2cc), transparent 92%) 0px,
            color-mix(in oklab, var(--noise-tint, #3ec2cc), transparent 92%) 3px,
            transparent 6px,
            transparent 9px);

    /* Make the grain tiles larger on the second background only */
    background-size:
        auto,
        var(--grain-unit) var(--grain-unit);

    mix-blend-mode: screen;
    opacity: 1;

    /* Optional: a little punch */
    /* filter: contrast(130%) brightness(105%); */
    animation: noise-shift 700ms steps(6) infinite;
    background-position:
        0 0,
        /* wash layer stays put */
        0 0;
    /* grain layer animates via keyframes */
}

/* Mode: wash (your original subtle gradient + faint lines, cranked slightly) */
.padTEST .noise-overlay.mode-wash {
    background:
        linear-gradient(135deg,
            color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent calc(100% - (var(--noise-alpha, .28) * 100%))) 0%,
            transparent 60%),
        repeating-linear-gradient(0deg,
            color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent 88%) 0px,
            color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent 88%) 1px,
            transparent 2px, transparent 3px);
    mix-blend-mode: screen;
}

/* Mode: static (CSS-only animated grain) */
.padTEST .noise-overlay.mode-static {
    mix-blend-mode: screen;
}

.padTEST .noise-overlay.mode-static .grain {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    /* stack 3 noisy layers with different scales so it feels organic */
    background:
        radial-gradient(1px 1px at 20% 30%, color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent calc(100% - (var(--noise-alpha, .28) * 100%))) 40%, transparent 41%),
        radial-gradient(1px 1px at 60% 80%, color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent calc(100% - (var(--noise-alpha, .28) * 100%))) 45%, transparent 46%),
        radial-gradient(1px 1px at 80% 10%, color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent calc(100% - (var(--noise-alpha, .28) * 100%))) 35%, transparent 36%),
        repeating-conic-gradient(from 0deg,
            color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent calc(100% - (var(--noise-alpha, .28) * 100%))) 0% 1%,
            transparent 1% 2%);
    background-size: 60px 60px, 90px 90px, 120px 120px, 6px 6px;
    animation:
        noise-shift var(--noise-anim-dur, 1s) steps(var(--noise-fps, 12)) infinite,
        noise-pan calc(1000ms * (60 / var(--noise-speed, 60))) linear infinite;
    filter: contrast(110%) brightness(105%);
    opacity: 1;
}

/* jittery frame stepping */
@keyframes noise-shift {
    0% {
        transform: translate3d(0, 0, 0) scale(1.0);
    }

    25% {
        transform: translate3d(-1px, 1px, 0) scale(1.01);
    }

    50% {
        transform: translate3d(1px, -1px, 0) scale(0.99);
    }

    75% {
        transform: translate3d(0.5px, -0.5px, 0) scale(1.0);
    }

    100% {
        transform: translate3d(0, 0, 0) scale(1.0);
    }
}

/* slow pan for parallax */
@keyframes noise-pan {
    from {
        background-position: 0 0, 0 0, 0 0, 0 0;
    }

    to {
        background-position: 60px 30px, -40px 60px, 80px -30px, 12px -12px;
    }
}

/* Mode: svg (procedural TV static) */
.padTEST .noise-overlay.mode-svg {
    mix-blend-mode: screen;
}

.padTEST .noise-overlay.mode-svg .svg-noise {
    position: absolute;
    inset: 0;
    border-radius: inherit;
}

.padTEST .noise-overlay.mode-svg .svg-filter {
    position: absolute;
    width: 0;
    height: 0;
}

.padTEST .noise-overlay.mode-svg .svg-noise-fill {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent calc(100% - (var(--noise-alpha, .28) * 100%)));
    /* paint a layer then distort it with turbulence filter */
    filter: none;
    /* the actual filter url() is injected inline to avoid scoping issues */
    /* apply the filter via style attr to ensure correct URL scoping */
}

/* Mode: gif (bring your own loop) */
.padTEST .noise-overlay.mode-gif {
    mix-blend-mode: screen;
}

.padTEST .noise-overlay.mode-gif .noise-gif {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    opacity: calc(var(--noise-alpha, .28) + 0.08);
}

/* Black “pepper” speckles that read on any background */
.padTEST .noise-overlay .pepper {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;

    /* Darken underlying content without killing color */
    mix-blend-mode: multiply;

    /* Overall strength */
    opacity: var(--pepper-alpha, 0.16);

    /* A few larger, pseudo-random dots + a very fine repeating bed */
    background:
        radial-gradient(1px 1px at 18% 22%, rgba(0, 0, 0, 0.85) 40%, transparent 41%),
        radial-gradient(1px 1px at 36% 76%, rgba(0, 0, 0, 0.85) 42%, transparent 43%),
        radial-gradient(1px 1px at 66% 48%, rgba(0, 0, 0, 0.85) 38%, transparent 39%),
        radial-gradient(1px 1px at 84% 16%, rgba(0, 0, 0, 0.85) 40%, transparent 41%),
        /* micro-speck bed */
        repeating-conic-gradient(from 0deg,
            rgba(0, 0, 0, 0.7) 0% 0.5%,
            transparent 0.5% 1.6%);

    /* Scale the larger dots independently from the micro-bed */
    background-size:
        80px 80px,
        110px 110px,
        140px 140px,
        170px 170px,
        var(--pepper-scale, 6px) var(--pepper-scale, 6px);

    /* Animate subtly with the same jitter so it feels alive */
    animation:
        noise-shift var(--noise-anim-dur, 1s) steps(var(--noise-fps, 12)) infinite,
        noise-pan calc(1000ms * (60 / var(--noise-speed, 60))) linear infinite;

    /* Slight clarity bump so specks don’t blur out on light pads */
    filter: contrast(115%);
}



/* keep all other visuals in your SCSS (_drumSequencer.scss) */
</style>

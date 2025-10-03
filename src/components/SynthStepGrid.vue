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
                    <div :class="['padTEST', 'liquid', { selected: active }, { playing: index === currentStep }]"
                        @mousedown="onMouseDown($event, index)" @mouseenter="onMouseEnter(index)" @dragstart.prevent
                        :style="padStyle(index)" />

                    <!-- waveform badge (uniform bg; colored icon via currentColor) -->
                    <div class="wave-badge" :class="{ 'is-off': !active }" :data-wave="waveFor(index)"
                        :title="waveFor(index)">
                        <svg class="wave-ico" viewBox="0 0 12 12" width="12" height="12" fill="none"
                            stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"
                            aria-hidden="true" preserveAspectRatio="xMidYMid meet">
                            <!-- SINE = circle -->
                            <circle v-if="waveFor(index) === 'sine'" cx="6" cy="6" r="3.6" />

                            <!-- TRIANGLE = peak up -->
                            <path v-else-if="waveFor(index) === 'triangle'" d="M2 10 L6 2 L10 10 Z" fill="none" />

                            <!-- SAW = right angle bottom-left -->
                            <!-- Points: bottom-left (right angle) -> top-left -> bottom-right -->
                            <path v-else-if="waveFor(index) === 'sawtooth'" d="M2 10 L2 2 L10 10 Z" fill="none" />

                            <!-- SQUARE = perfect square -->
                            <rect v-else-if="waveFor(index) === 'square'" x="2.2" y="2.2" width="7.6" height="7.6"
                                rx="0.3" ry="0.3" fill="none" />

                            <!-- Fallback (shouldn't hit, but safe) -->
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
}>(), {
    showIndices: true,
    showVelocity: true,
    showPitch: true
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
    if (!props.steps[index]) return { '--pad-on': 0 };
    const pct = Math.round(props.velocities[index] * 100);
    const hue = hueFor(props.pitches[index] || props.minHz);
    return {
        '--vol': pct,
        '--heat-h': hue,
        '--pad-on': 1
    } as any;
}

/* waveform indicator helpers */
function waveFor(i: number): Wave {
    return (props.waveforms?.[i] ?? props.defaultWave ?? 'sine') as Wave;
}

const nearestNote = props.nearestNote;
</script>

<style scoped>
/* badges stay compact even at 32 steps */
.wave-badge {
    --wb-pad-x: 3px;
    --wb-pad-y: 2px;
    --wb-radius: 6px;

    position: absolute;
    top: 3px;
    left: 3px;

    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;

    padding: var(--wb-pad-y) var(--wb-pad-x);
    border-radius: var(--wb-radius);

    /* Uniform background for all waves */
    background: linear-gradient(145deg, rgba(0, 0, 0, .55), rgba(0, 0, 0, .35));
    border: 1px solid rgba(255, 255, 255, .14);
    box-shadow:
        0 1px 2px rgba(0, 0, 0, .25),
        inset 0 0 0 1px rgba(255, 255, 255, .04);

    color: #fff;
    /* default; overridden per-wave below */
    line-height: 1;
    pointer-events: none;
    user-select: none;
    opacity: .95;
    z-index: 2;
}

/* mini icon */
.wave-ico {
    width: 11px;
    height: 11px;
    display: block;
}

/* Dim when pad is off */
.wave-badge.is-off {
    opacity: .55;
}

/* Icon colors per wave (background stays uniform) */
.wave-badge[data-wave="sine"] {
    color: #7bd0ff;
}

/* cool blue */
.wave-badge[data-wave="triangle"] {
    color: #b47aff;
}

/* purple */
.wave-badge[data-wave="sawtooth"] {
    color: #ffd06b;
}

/* amber */
.wave-badge[data-wave="square"] {
    color: #a2f5a6;
}

/* mint */

/* --- the rest is unchanged from your file --- */
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
</style>

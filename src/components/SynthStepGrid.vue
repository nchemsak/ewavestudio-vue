<template>
    <div class="d-flex pad-row">
        <div class="padTEST-grid">
            <div v-for="(active, index) in steps" :key="index" class="padTESTwrap" @mouseenter="hovered = index"
                @mouseleave="hovered = null">
                <!-- NEW: step number -->
                <div v-if="showIndices" class="pad-step-num">{{ index + 1 }}</div>

                <div :class="['padTEST', 'liquid', { selected: active }, { playing: index === currentStep }]"
                    @mousedown="onMouseDown($event, index)" @mouseenter="onMouseEnter(index)" @dragstart.prevent
                    :style="padStyle(index)" />

                <!-- settings (unchanged) -->
                <button class="pad-settings-dot" @mousedown.stop @click.stop="emitOpenSettings(index, $event)"
                    aria-label="Pad settings">⋮</button>

                <!-- per-step note chip (unchanged) -->
                <div v-if="active" class="note-chip">
                    {{ nearestNote(pitches[index]) }}
                </div>

                <!-- hover sliders (unchanged) -->
                <div v-if="active && hovered === index" class="hover-slider volume-slider">
                    <input type="range" min="0" max="1" step="0.01" :value="velocities[index]"
                        @input="updateVelocity(index, $event)" @mousedown="activeVol = index"
                        @mouseup="activeVol = null" @touchstart="activeVol = index" @touchend="activeVol = null" />
                    <span v-if="activeVol === index" class="custom-tooltip">
                        {{ Math.round(velocities[index] * 100) }}%
                    </span>
                </div>

                <div v-if="active && hovered === index" class="hover-slider pitch-slider">
                    <input :min="minHz" :max="maxHz" step="1" type="range" :value="pitches[index]"
                        @input="updatePitch(index, $event)" @mousedown="activePitch = index"
                        @mouseup="activePitch = null" @touchstart="activePitch = index"
                        @touchend="activePitch = null" />
                </div>
            </div>
        </div>
    </div>
</template>


<script setup lang="ts">
import { ref } from 'vue';

type NoteNameFn = (hz: number) => string;

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
}>(), {
    showIndices: true
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

// function padStyle(index: number) {
//     if (!props.steps[index]) return {};
//     const percent = Math.round(props.velocities[index] * 100);
//     return { background: `linear-gradient(to top, pink ${percent}%, #fff ${percent}%)` };
// }



function hueFor(hz: number, lo = props.minHz, hi = props.maxHz) {
    // map min Hz → 220° (blue), max Hz → 0° (red)
    const t = Math.min(1, Math.max(0, (hz - lo) / (hi - lo)));
    return Math.round(220 * (1 - t));
}

function padStyle(index: number) {
    if (!props.steps[index]) return { '--pad-on': 0 }; // let CSS show “off” state
    const pct = Math.round(props.velocities[index] * 100);
    const hue = hueFor(props.pitches[index] || props.minHz);
    return {
        '--vol': pct,           // 0..100 (no % sign; CSS uses calc(var(--vol)*1%))
        '--heat-h': hue,        // 0..360
        '--pad-on': 1
    } as any;
}

const nearestNote = props.nearestNote;
</script>

<style scoped>
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

/* nicer 3-dot settings; hidden until hover */
.pad-settings-dot {
    position: absolute;
    top: 4px;
    right: 4px;
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
    opacity: 0;
    transform: scale(.9);
    transition: opacity .15s ease, transform .15s ease, background .15s ease;
}

.padTESTwrap:hover .pad-settings-dot,
.pad-settings-dot:focus-visible {
    opacity: 1;
    transform: scale(1);
}

.pad-settings-dot:hover {
    background: rgba(15, 18, 26, .9)
}
</style>

<template>
    <div class="d-flex pad-row">
        <div class="padTEST-grid">
            <div v-for="(active, index) in steps" :key="index" class="padTESTwrap" @mouseenter="hovered = index"
                @mouseleave="hovered = null">
                <div :class="['padTEST', 'liquid', { selected: active }, { playing: index === currentStep }]"
                    @mousedown="onMouseDown($event, index)" @mouseenter="onMouseEnter(index)" @dragstart.prevent
                    :style="padStyle(index)" />
                <!-- per-step menu -->
                <button class="pad-settings-dot" @mousedown.stop @click.stop="emitOpenSettings(index, $event)"
                    aria-label="Pad settings">•</button>

                <!-- hover sliders -->
                <div v-if="active && hovered === index" class="hover-slider volume-slider">
                    <input type="range" min="0" max="1" step="0.01" :value="velocities[index]"
                        @input="updateVelocity(index, $event)" @mousedown="activeVol = index"
                        @mouseup="activeVol = null" @touchstart="activeVol = index" @touchend="activeVol = null" />
                    <span v-if="activeVol === index" class="custom-tooltip">
                        {{ Math.round(velocities[index] * 100) }}%
                    </span>
                </div>

                <div v-if="active && hovered === index" class="hover-slider pitch-slider">
                    <input type="range" :min="minHz" :max="maxHz" step="1" :value="pitches[index]"
                        @input="updatePitch(index, $event)" @mousedown="activePitch = index"
                        @mouseup="activePitch = null" @touchstart="activePitch = index"
                        @touchend="activePitch = null" />
                    <span v-if="activePitch === index" class="custom-tooltip">
                        {{ nearestNote(pitches[index]) }} · {{ Math.round(pitches[index]) }} Hz
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

type NoteNameFn = (hz: number) => string;

const props = defineProps<{
    name: string;
    currentStep: number;
    minHz: number;
    maxHz: number;

    /* v-models */
    steps: boolean[];
    velocities: number[];
    pitches: number[];

    /* util from parent */
    nearestNote: NoteNameFn;
}>();

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

function padStyle(index: number) {
    if (!props.steps[index]) return {};
    const percent = Math.round(props.velocities[index] * 100);
    return { background: `linear-gradient(to top, pink ${percent}%, #fff ${percent}%)` };
}

const nearestNote = props.nearestNote; // just to use directly in template
</script>

<style scoped>
/* inherits your existing padTEST / hover-slider styles */
</style>

<!-- src/components/SynthStepGrid.vue -->
<template>
    <div class="d-flex pad-row">
        <!-- One Tab stop for all pads: the arrow keys move between them, Enter turns one on or off -->
        <div class="padTEST-grid" :class="{ brushing: !!repeatBrush }" :data-brush="repeatBrush || null" data-equal-cols role="group" aria-label="Steps">
            <div v-for="(active, index) in steps" :key="index" class="pad-col" @mouseleave="hovered = null">
                <div class="pad-head">
                    <button class="pad-settings-dot" @mousedown.stop @click.stop="emitOpenSettings(index, $event)"
                        aria-label="Pad settings">
                        ⋮
                    </button>
                    <div v-if="showIndices" class="pad-step-num">{{ index + 1 }}</div>
                </div>

                <div class="padTESTwrap" @mouseenter="hovered = index" @mouseleave="hovered = null">
                    <div :class="[
                        'padTEST',
                        'liquid',
                        { selected: active },
                        { playing: index === currentStep },
                        { 'has-noise': noiseOn(index) }
                    ]" @pointerdown="onPointerDown($event, index)" @dragstart.prevent :data-pad="index"
                        :style="padStyle(index)" role="button" :aria-pressed="active ? 'true' : 'false'"
                        :aria-label="padLabel(index, active)" :tabindex="index === focusIndex ? 0 : -1"
                        :ref="(el) => { padEls[index] = el as HTMLElement }" @keydown="onPadKeydown($event, index)"
                        @focus="focusIndex = index" :title="active ? `Drag up or down: ${Math.round((velocities[index] ?? 1) * 100)}%` : undefined">
                        <div v-if="noiseOn(index)" class="noise-overlay" :class="[`mode-${noiseMode}`]"
                            :style="noiseStyle(index)" aria-hidden="true">
                            <div v-if="noiseMode === 'static'" class="grain" />
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

                            <img v-else-if="noiseMode === 'gif' && noiseGifUrl" class="noise-gif" :src="noiseGifUrl"
                                alt="" aria-hidden="true" decoding="async" loading="lazy" />

                            <div class="pepper" />
                        </div>
                    </div>

                    <!-- A ratchet: the step plays this many quick hits; with the Repeats brush, the
                         pad under the mouse shows what a click would give it -->
                    <div v-if="brushPreview(index) !== null" class="ratchet-badge is-preview" aria-hidden="true">
                        ×{{ brushPreview(index) }}</div>
                    <div v-else-if="ratchetFor(index) > 1" class="ratchet-badge" :class="{ 'is-off': !active }"
                        aria-hidden="true">×{{ ratchetFor(index) }}{{ notesArrow(index) }}</div>

                    <div class="wave-badge" :class="{ 'is-off': !active }" :data-wave="waveFor(index)"
                        :title="waveFor(index)">
                        <WaveIcon :wave="waveFor(index)" />
                    </div>

                    <!-- The LFO bending this note's pitch (LFO target Pitch) -->
                    <LfoBendMark v-if="active && lfoView" :view="lfoView" />

                    <!-- While its velocity is dragged: how loud -->
                    <div v-if="velDrag === index" class="vel-readout" aria-hidden="true">{{ Math.round((velocities[index] ?? 1) * 100) }}%</div>

                    <div v-if="active" class="note-chip">
                        {{ nearestNote(pitches[index]) }}
                    </div>

                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { padHue } from '../lib/padColour';

type NoteNameFn = (hz: number) => string;
import WaveIcon from './WaveIcon.vue';
import LfoBendMark from './LfoBendMark.vue';
import type { PadWave } from '../audio/waves';
import type { LfoView } from '../lib/lfoVisual';

const props = withDefaults(
    defineProps<{
        name: string;
        currentStep: number;
        minHz: number;
        maxHz: number;

        steps: boolean[];
        velocities: number[];
        pitches: number[];

        nearestNote: NoteNameFn;

        showIndices?: boolean;

        waveforms?: PadWave[];
        defaultWave?: PadWave;

        // Hits per step: 1, or 2–4 quick hits (a ratchet; src/audio/ratchet.ts)
        ratchets?: number[];
        // What the hits play: 'same', or 'up' / 'down' the key's chord (shown as ↑ / ↓ on the badge)
        repeatNotes?: string[];
        // The Repeats brush: while set (2–4), a click or drag gives pads that many hits
        // instead of turning them on or off; a pad that already has it goes back to one hit
        repeatBrush?: number | null;

        noiseMask?: boolean[];
        noiseTint?: string;
        noiseAlpha?: number;

        noiseEnabled?: boolean;
        noiseMode?: 'wash' | 'static' | 'svg' | 'gif';

        noiseGifUrl?: string;

        noiseFps?: number;
        noiseSpeed?: number;

        pepperAlpha?: number;
        pepperScale?: number;

        // The LFO visualizer (LfoBendMark on each lit pad)
        lfoView?: LfoView | null;
    }>(),
    {
        showIndices: true,
        noiseMode: 'wash',
        noiseFps: 12,
        noiseSpeed: 60,
        noiseEnabled: true,
        pepperAlpha: 0.16,
        pepperScale: 6,
    },
);

const emit = defineEmits<{
    (e: 'update:steps', v: boolean[]): void;
    (e: 'update:velocities', v: number[]): void;
    (e: 'update:pitches', v: number[]): void;
    (e: 'update:ratchets', v: number[]): void;
    (e: 'open-pad-settings', payload: { name: string; index: number; anchorRect: DOMRect }): void;
}>();

const isMouseDown = ref(false);
// A drag paints every pad it crosses the way the first one went: on or off, or with the
// Repeats brush, the brush's hits or back to one
const dragMode = ref<'on' | 'off' | 'brush' | 'unbrush' | null>(null);
const hovered = ref<number | null>(null);

const uid = Math.random().toString(36).slice(2);

function clone<T>(arr: T[]): T[] {
    return arr.slice();
}

// A press on a pad (PR 127, the plan's item 9): the first move decides. Up or down on a lit pad
// sets its velocity (VEL_DRAG_PX, a pad's height, the whole range), its fill following; sideways paints every pad
// the pointer crosses the way the first one went, on or off; no move at all is a click, which
// turns the pad on or off. With the Repeats brush, a press paints at once, as before.
const VEL_DRAG_PX = 80;
const velDrag = ref<number | null>(null);
let press: { index: number; x: number; y: number; lit: boolean; from: number; mode: 'vel' | 'paint' | null; last: number } | null = null;

function onPointerDown(evt: PointerEvent, index: number) {
    if (evt.button !== 0) return;
    if ((evt.target as HTMLElement).closest('.pad-settings-dot')) return;
    evt.preventDefault();
    isMouseDown.value = true;
    focusIndex.value = index; // Tab comes back to the last pad used
    try { (evt.currentTarget as HTMLElement).releasePointerCapture?.(evt.pointerId); } catch { /* */ }

    if (props.repeatBrush) {
        dragMode.value = ratchetFor(index) === props.repeatBrush ? 'unbrush' : 'brush';
        paintRepeats(index);
        press = { index, x: evt.clientX, y: evt.clientY, lit: false, from: 0, mode: 'paint', last: index };
    } else {
        press = { index, x: evt.clientX, y: evt.clientY, lit: !!props.steps[index], from: props.velocities[index] ?? 1, mode: null, last: index };
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    window.addEventListener('pointercancel', onPointerCancel, { once: true });
}

function padAt(x: number, y: number): number | null {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-pad]') as HTMLElement | null;
    if (!el || !padEls.includes(el)) return null;
    return Number(el.dataset.pad);
}

function setStep(i: number, on: boolean) {
    if (props.steps[i] === on) return;
    const out = clone(props.steps);
    out[i] = on;
    emit('update:steps', out);
}

function onPointerMove(ev: PointerEvent) {
    if (!press) return;
    if (ev.buttons === 0) { onPointerUp(); return; } // a release the page never heard
    if (!press.mode) {
        const dx = ev.clientX - press.x, dy = ev.clientY - press.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) return;
        if (press.lit && Math.abs(dy) > Math.abs(dx)) {
            press.mode = 'vel';
            velDrag.value = press.index;
        } else {
            press.mode = 'paint';
            dragMode.value = press.lit ? 'off' : 'on';
            setStep(press.index, dragMode.value === 'on');
        }
    }
    if (press.mode === 'vel') {
        const v = Math.round(Math.min(1, Math.max(0.05, press.from + (press.y - ev.clientY) / VEL_DRAG_PX)) * 100) / 100;
        if (v !== props.velocities[press.index]) {
            const out = clone(props.velocities);
            out[press.index] = v;
            emit('update:velocities', out);
        }
        return;
    }
    const i = padAt(ev.clientX, ev.clientY);
    if (i === null || i === press.last) return;
    press.last = i;
    if (dragMode.value === 'brush' || dragMode.value === 'unbrush') paintRepeats(i);
    else setStep(i, dragMode.value === 'on');
}

// The browser took the touch (a scroll): nothing was clicked
function onPointerCancel() {
    if (press && !press.mode) press = null;
    onPointerUp();
}

function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    if (press && !press.mode) setStep(press.index, !props.steps[press.index]);
    press = null;
    velDrag.value = null;
    isMouseDown.value = false;
    dragMode.value = null;
}

// The Repeats brush on one pad: the brush's hits, turning the pad on (a repeat on a silent step
// would do nothing), or back to one hit
function paintRepeats(index: number) {
    const brush = props.repeatBrush;
    if (!brush || !props.ratchets) return;
    const n = dragMode.value === 'unbrush' ? 1 : brush;
    if (ratchetFor(index) !== n) {
        const out = clone(props.ratchets);
        out[index] = n;
        emit('update:ratchets', out);
    }
    if (n > 1 && !props.steps[index]) {
        const steps = clone(props.steps);
        steps[index] = true;
        emit('update:steps', steps);
    }
}

// What a click with the Repeats brush would give the pad under the mouse (null: nothing to show)
function brushPreview(index: number): number | null {
    const brush = props.repeatBrush;
    if (!brush || hovered.value !== index || isMouseDown.value) return null;
    return ratchetFor(index) === brush ? 1 : brush;
}

// keyboard
// The pads are one Tab stop (only the pad at focusIndex has tabindex 0). Left/Right move between
// pads, Home/End go to the first/last, Enter turns the focused pad on or off. Space is left
// alone: it plays and stops the sequencer everywhere (onGlobalKeydown in DrumSequencer.vue).
const focusIndex = ref(0);
const padEls: HTMLElement[] = [];

function ratchetFor(i: number) {
    return props.ratchets?.[i] ?? 1;
}

function notesArrow(i: number) {
    const m = props.repeatNotes?.[i];
    return m === 'up' ? '↑' : m === 'down' ? '↓' : '';
}

function padLabel(i: number, active: boolean) {
    const m = props.repeatNotes?.[i];
    const way = m === 'up' ? ' up the chord' : m === 'down' ? ' down the chord' : '';
    const repeats = ratchetFor(i) > 1 ? `, ${ratchetFor(i)} hits${way}` : '';
    if (props.repeatBrush) {
        const n = ratchetFor(i) === props.repeatBrush ? 1 : props.repeatBrush;
        return `Step ${i + 1}${active ? `, ${props.nearestNote(props.pitches[i])}` : ''}${repeats}: give it ${n} ${n === 1 ? 'hit' : 'hits'}`;
    }
    return active ? `Step ${i + 1}, ${props.nearestNote(props.pitches[i])}${repeats}` : `Step ${i + 1}`;
}

function onPadKeydown(e: KeyboardEvent, index: number) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const last = props.steps.length - 1;
    let to: number;
    switch (e.key) {
        case 'Enter':
            e.preventDefault();
            if (!e.repeat && props.repeatBrush) {
                dragMode.value = ratchetFor(index) === props.repeatBrush ? 'unbrush' : 'brush';
                paintRepeats(index);
                dragMode.value = null;
            } else if (!e.repeat) {
                const out = clone(props.steps);
                out[index] = !out[index];
                emit('update:steps', out);
            }
            return;
        case 'ArrowUp':
        case 'ArrowDown': {
            // A lit pad's velocity, 5 % a press (Shift: 25 %)
            e.preventDefault();
            if (!props.steps[index]) return;
            const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.25 : 0.05);
            const out = clone(props.velocities);
            out[index] = Math.round(Math.min(1, Math.max(0.05, (out[index] ?? 1) + d)) * 100) / 100;
            emit('update:velocities', out);
            return;
        }
        case 'ArrowRight': to = Math.min(last, index + 1); break;
        case 'ArrowLeft': to = Math.max(0, index - 1); break;
        case 'Home': to = 0; break;
        case 'End': to = last; break;
        default: return;
    }
    e.preventDefault();
    focusIndex.value = to;
    padEls[to]?.focus();
}

function emitOpenSettings(index: number, evt: MouseEvent) {
    const r = (evt.currentTarget as HTMLElement).getBoundingClientRect();
    emit('open-pad-settings', { name: props.name, index, anchorRect: r });
}

// visuals
// The pads' colour for a pitch, blue→red; the spectrogram uses the same (src/lib/padColour.ts)
function hueFor(hz: number, lo = props.minHz, hi = props.maxHz) {
    return padHue(hz, lo, hi);
}

function padStyle(index: number) {
    if (!props.steps[index]) return { '--pad-on': 0 } as any;
    const pct = Math.round((props.velocities[index] ?? 0) * 100);
    const hue = hueFor(props.pitches[index] || props.minHz);

    return {
        '--vol': pct,
        '--heat-h': hue,
        '--pad-on': 1,
        '--noise-alpha': String(
            typeof props.noiseAlpha === 'number' ? props.noiseAlpha : 0.28,
        ), // boosted default
    } as any;
}

// per-step noise overlay styling
function noiseStyle(index: number) {
    const tint = props.noiseTint || '#9bf3ff';
    const a = typeof props.noiseAlpha === 'number' ? props.noiseAlpha : 0.28;
    const fps = Math.max(1, props.noiseFps || 12);
    const speed = Math.max(1, props.noiseSpeed || 60);

    return {
        '--noise-tint': tint,
        '--noise-alpha': String(a),
        '--noise-fps': String(fps),
        '--noise-speed': String(speed),
        '--pepper-alpha': String(
            typeof (props as any).pepperAlpha === 'number'
                ? (props as any).pepperAlpha
                : 0.16,
        ),
        '--pepper-scale': String(Math.max(2, (props as any).pepperScale ?? 6)),
    } as any;
}

function noiseOn(i: number) {
    return !!props.noiseEnabled && !!props.steps?.[i] && !!props.noiseMask?.[i];
}

// SVG noise timing
const svgDur = '0.6s';
const svgBase = 0.8;

function waveFor(i: number): PadWave {
    return (props.waveforms?.[i] ?? props.defaultWave ?? 'sine') as PadWave;
}

const nearestNote = props.nearestNote;
</script>

<style scoped>
/* A finger on a lit pad drags its velocity (the page doesn't scroll from it); on an unlit one it
   scrolls the page up and down, and paints sideways */
.padTEST {
    touch-action: pan-y;
}

.padTEST.selected {
    touch-action: none;
}

/* Keyboard focus only (a mouse click doesn't show it), like the app's buttons */
.padTEST:focus {
    outline: none;
}

.padTEST:focus-visible {
    outline: 2px solid hsl(var(--pt-accent) 80% 60%);
    outline-offset: 2px;
}

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

.wave-badge :deep(.wave-ico) {
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

.wave-badge[data-wave="pulse"] {
    color: #ff7eb3;
}

.wave-badge[data-wave="organ"] {
    color: #ffb86b;
}

.wave-badge[data-wave="hollow"] {
    color: #7cf3c9;
}

.wave-badge[data-wave="glass"] {
    color: #e6c6ff;
}

/* A ratchet's hit count, at the top of the pad (the wave badge is at the bottom) */
.ratchet-badge {
    position: absolute;
    top: 3px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    padding: 1px 4px;
    border-radius: 6px;
    font-size: 9px;
    line-height: 1.1;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(145deg, rgba(0, 0, 0, .55), rgba(0, 0, 0, .35));
    border: 1px solid rgba(255, 255, 255, .14);
    pointer-events: none;
    white-space: nowrap;
}

.ratchet-badge.is-off {
    opacity: .45;
}

/* The Repeats brush: what a click would give the pad under the mouse */
.ratchet-badge.is-preview {
    border: 1px dashed hsl(var(--pt-accent) 80% 70%);
    background: hsl(var(--pt-accent) 60% 20% / .85);
}

/* The brush's cursor carries its count ("×3"), so it can't be mistaken for the pointer that
   turns pads on and off (PR 74; it was `copy`, an arrow with a small plus) */
.brushing .padTEST {
    cursor: copy;
}

.brushing[data-brush="1"] .padTEST {
    cursor: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M3 2v15.5l4.2-3.8 2.9 6.8 2.7-1.2-2.9-6.6H15z' fill='%23fff' stroke='%23000' stroke-width='1.2' stroke-linejoin='round'/%3E%3Crect x='12.5' y='17.5' width='19' height='13' rx='4' fill='%2315101f' stroke='%23fff' stroke-width='1.2'/%3E%3Ctext x='22' y='27.6' font-family='Arial%2CHelvetica%2Csans-serif' font-size='10' font-weight='700' fill='%23fff' text-anchor='middle'%3E%C3%971%3C/text%3E%3C/svg%3E") 3 2, copy;
}

.brushing[data-brush="2"] .padTEST {
    cursor: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M3 2v15.5l4.2-3.8 2.9 6.8 2.7-1.2-2.9-6.6H15z' fill='%23fff' stroke='%23000' stroke-width='1.2' stroke-linejoin='round'/%3E%3Crect x='12.5' y='17.5' width='19' height='13' rx='4' fill='%2315101f' stroke='%23fff' stroke-width='1.2'/%3E%3Ctext x='22' y='27.6' font-family='Arial%2CHelvetica%2Csans-serif' font-size='10' font-weight='700' fill='%23fff' text-anchor='middle'%3E%C3%972%3C/text%3E%3C/svg%3E") 3 2, copy;
}

.brushing[data-brush="3"] .padTEST {
    cursor: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M3 2v15.5l4.2-3.8 2.9 6.8 2.7-1.2-2.9-6.6H15z' fill='%23fff' stroke='%23000' stroke-width='1.2' stroke-linejoin='round'/%3E%3Crect x='12.5' y='17.5' width='19' height='13' rx='4' fill='%2315101f' stroke='%23fff' stroke-width='1.2'/%3E%3Ctext x='22' y='27.6' font-family='Arial%2CHelvetica%2Csans-serif' font-size='10' font-weight='700' fill='%23fff' text-anchor='middle'%3E%C3%973%3C/text%3E%3C/svg%3E") 3 2, copy;
}

.brushing[data-brush="4"] .padTEST {
    cursor: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M3 2v15.5l4.2-3.8 2.9 6.8 2.7-1.2-2.9-6.6H15z' fill='%23fff' stroke='%23000' stroke-width='1.2' stroke-linejoin='round'/%3E%3Crect x='12.5' y='17.5' width='19' height='13' rx='4' fill='%2315101f' stroke='%23fff' stroke-width='1.2'/%3E%3Ctext x='22' y='27.6' font-family='Arial%2CHelvetica%2Csans-serif' font-size='10' font-weight='700' fill='%23fff' text-anchor='middle'%3E%C3%974%3C/text%3E%3C/svg%3E") 3 2, copy;
}

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

/* A finger's ⋮ (PR 107): the desktop view on a phone held upright */
@media (pointer: coarse) and (max-width: 719.98px) {
    .pad-head .pad-settings-dot {
        width: 100%;
        max-width: 32px;
        height: 28px;
        font-size: 16px;
    }
}

.pad-col:hover .pad-settings-dot,
.pad-settings-dot:focus-visible {
    opacity: 1;
}

.padTESTwrap {
    position: relative;
}

/* NOISE OVERLAY Layer order: padTEST::before (volume hue wash, z=1) -> .noise-overlay (z=1, drawn after) -> padTEST::after (bevel z=2) */

.padTEST .noise-overlay {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    z-index: 1;
    pointer-events: none;
    --grain-unit: 8px;
    --grain-alpha: var(--noise-alpha, 0.24);

    background:
        linear-gradient(135deg,
            color-mix(in oklab, var(--noise-tint, #3ec2cc), transparent calc(100% - (var(--grain-alpha) * 100%))) 0%,
            transparent 60%),
        repeating-linear-gradient(0deg,
            color-mix(in oklab, var(--noise-tint, #3ec2cc), transparent 92%) 0px,
            color-mix(in oklab, var(--noise-tint, #3ec2cc), transparent 92%) 3px,
            transparent 6px,
            transparent 9px);

    background-size:
        auto,
        var(--grain-unit) var(--grain-unit);

    mix-blend-mode: screen;
    opacity: 1;
    animation: noise-shift 700ms steps(6) infinite;
    background-position:
        0 0,
        0 0;
}

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

.padTEST .noise-overlay.mode-static {
    mix-blend-mode: screen;
}

.padTEST .noise-overlay.mode-static .grain {
    position: absolute;
    inset: 0;
    border-radius: inherit;
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

@keyframes noise-shift {
    0% {
        transform: translate3d(0, 0, 0) scale(1.0);
    }

    25% {
        transform: translate3d(-0.5px, 0.5px, 0) scale(1.01);
    }

    50% {
        transform: translate3d(0.5px, -0.5px, 0) scale(0.99);
    }

    75% {
        transform: translate3d(0px, -0px, 0) scale(1.0);
    }

    100% {
        transform: translate3d(0, 0, 0) scale(1.0);
    }
}

@keyframes noise-pan {
    from {
        background-position: 0 0, 0 0, 0 0, 0 0;
    }

    to {
        background-position: 60px 30px, -40px 60px, 80px -30px, 12px -12px;
    }
}

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
    filter: none;
}

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

.padTEST .noise-overlay .pepper {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;

    mix-blend-mode: multiply;

    opacity: var(--pepper-alpha, 0.16);

    background:
        radial-gradient(1px 1px at 18% 22%, rgba(0, 0, 0, 0.85) 40%, transparent 41%),
        radial-gradient(1px 1px at 36% 76%, rgba(0, 0, 0, 0.85) 42%, transparent 43%),
        radial-gradient(1px 1px at 66% 48%, rgba(0, 0, 0, 0.85) 38%, transparent 39%),
        radial-gradient(1px 1px at 84% 16%, rgba(0, 0, 0, 0.85) 40%, transparent 41%),
        repeating-conic-gradient(from 0deg,
            rgba(0, 0, 0, 0.7) 0% 0.5%,
            transparent 0.5% 1.6%);

    background-size:
        80px 80px,
        110px 110px,
        140px 140px,
        170px 170px,
        var(--pepper-scale, 6px) var(--pepper-scale, 6px);

    animation:
        noise-shift var(--noise-anim-dur, 1s) steps(var(--noise-fps, 12)) infinite,
        noise-pan calc(1000ms * (60 / var(--noise-speed, 60))) linear infinite;
    filter: contrast(115%);
}


/* While a pad's velocity is dragged: how loud */
.vel-readout {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 5;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(0, 0, 0, .75);
    color: #fff;
    font: 700 11px ui-monospace, monospace;
    pointer-events: none;
}

/* all other visuals in SCSS (_drumSequencer.scss) */
</style>

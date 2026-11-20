<!-- src/components/MachineRail.vue -->
<!-- The machine rail (PR 108, option A of three mockups): the column beside the transport and
     the Step Sequencer where the big screen was. On top, the monitor: the output's scope and
     spectrogram (monitorViews.ts; the big screen's F1 and F3). Under it, one row per machine:
     its LED (a click mutes it), its name, its level and a tiny row of its 16 steps. There's one
     machine for now, Rhythm (the synth lane); Bass, Drums and Drift (the plan's items 4–6) add
     rows, and patterns A–D (PR 109) and the chain (item 2) go under them, so the screens shrink
     to a strip as they come. A row will pick which machine the pads and the Sound section show.
     Patterns A–D: a cap per slot (the current one down, a slot waiting for the bar pulsing, an
     empty slot's letter dim) and Copy (then a slot: it gets a copy of the current pattern).
     The chain (PR 110) under them: a Chain toggle and eight cells, each a slot or empty (a click
     steps it through — A B C D, Shift+click back); while it plays, the cell playing is lit. -->
<template>
    <aside class="pt-card machine-rail" aria-label="Machines">
        <div class="mr-monitor">
            <div class="mr-screen">
                <canvas ref="scopeEl" aria-hidden="true"></canvas>
                <span class="mr-label" aria-hidden="true">Scope</span>
            </div>
            <div class="mr-screen">
                <canvas ref="specEl" aria-hidden="true"></canvas>
                <span class="mr-label" aria-hidden="true">Spectrogram</span>
            </div>
        </div>

        <div class="mr-rows" :class="mixMock ? ['mock-fx', `m-${mockBass}`] : null" role="list">
            <div v-if="mixMock" class="mr-heads" aria-hidden="true"><span></span><span></span><span v-if="mockBass !== 'k'"></span><span>Level</span><span>Pedals</span><span>Steps</span></div>
            <div class="mr-row" :class="{ 'is-chosen': !mockBass || mockChosen === 'rhythm' }" role="listitem">
                <button type="button" class="mr-led" :class="{ lit: !muted }" role="switch" :aria-checked="!muted"
                    :aria-label="`${name} on`" :title="muted ? `${name} is muted: click to hear it` : `Mute ${name}`"
                    @click="emit('toggle-mute')"></button>
                <span class="mr-name">{{ name }}</span>
                <span v-if="mixMock" class="mr-meter" :class="`m-${mockBass}`" aria-hidden="true"><i :style="{ '--lv': 0.62 }"></i><b v-for="n in 8" :key="n" :class="{ on: n <= Math.round(0.62 * 8), hot: n >= 7 }"></b></span>
                <div class="mr-level">
                    <Knob midi-id="synth.volume" v-model="levelModel" :label="`${name} level`" hideLabel size="mini"
                        :value-text="`${Math.round(level * 100)}%`" :min="0" :max="1" :step="0.01" :useThemeArc="true" />
                </div>
                <div v-if="mixMock" class="mr-level">
                    <Knob :modelValue="1" :label="`${name} into the pedals`" hideLabel size="mini" :min="0" :max="1" :step="0.01" :useThemeArc="true" />
                </div>
                <div class="mr-cells" aria-hidden="true">
                    <i v-for="(c, i) in cells" :key="i" :style="c.style"
                        :class="{ on: c.on, beat: i % 4 === 0, now: playing && i === currentStep }"></i>
                </div>
            </div>
            <!-- MOCKUPS ONLY: Bass's row -->
            <div v-if="mockBass" class="mr-row" :class="{ 'is-chosen': mockChosen === 'bass' }" role="listitem">
                <button type="button" class="mr-led lit" role="switch" aria-checked="true" aria-label="Bass on"></button>
                <span class="mr-name">Bass</span>
                <span v-if="mixMock" class="mr-meter" :class="`m-${mockBass}`" aria-hidden="true"><i :style="{ '--lv': 0.78 }"></i><b v-for="n in 8" :key="n" :class="{ on: n <= Math.round(0.78 * 8), hot: n >= 7 }"></b></span>
                <div class="mr-level">
                    <Knob :modelValue="0.6" label="Bass level" hideLabel size="mini" :min="0" :max="1" :step="0.01" :useThemeArc="true" />
                </div>
                <div v-if="mixMock" class="mr-level">
                    <Knob :modelValue="0.4" label="Bass into the pedals" hideLabel size="mini" :min="0" :max="1" :step="0.01" :useThemeArc="true" />
                </div>
                <div class="mr-cells" aria-hidden="true">
                    <i v-for="(c, i) in bassCells" :key="i" :style="c" :class="{ on: !!c, beat: i % 4 === 0 }"></i>
                </div>
            </div>
            <div v-for="g in (mixMock ? ['Drums', 'Drift'] : [])" :key="g" class="mr-row mr-ghost" role="listitem">
                <button type="button" class="mr-led" aria-label="soon" disabled></button>
                <span class="mr-name">{{ g }}<small> soon</small></span>
                <span v-if="mixMock" class="mr-meter" :class="`m-${mockBass}`" aria-hidden="true"><i :style="{ '--lv': 0 }"></i><b v-for="n in 8" :key="n" :class="{ on: n <= Math.round(0 * 8), hot: n >= 7 }"></b></span>
                <div class="mr-level"><Knob :modelValue="0.5" :label="`${g} level`" hideLabel size="mini" :min="0" :max="1" :step="0.01" :disabled="true" /></div>
                <div class="mr-level"><Knob :modelValue="0.5" :label="`${g} to the pedals`" hideLabel size="mini" :min="0" :max="1" :step="0.01" :disabled="true" /></div>
                <div class="mr-cells" aria-hidden="true"><i v-for="i in 16" :key="i" :class="{ beat: (i - 1) % 4 === 0 }"></i></div>
            </div>
        </div>

        <div ref="slotsEl" class="mr-slots" role="group" aria-label="Patterns">
            <span class="mr-cap" aria-hidden="true">{{ copyArmed ? `Copy ${slots[currentSlot]?.name} to` : 'Pattern' }}</span>
            <button v-for="(s, i) in slots" :key="s.name" type="button" class="hw-cap hw-cap-sm mr-slot"
                :class="{ 'hw-down': i === currentSlot, 'is-queued': i === queuedSlot, empty: !s.filled, target: copyArmed && i !== currentSlot }"
                :aria-pressed="i === currentSlot ? 'true' : 'false'" :aria-label="`Pattern ${s.name}`" :title="slotTitle(i)"
                @click="emit('choose-slot', i, $event.shiftKey)">{{ s.name }}</button>
            <button type="button" class="hw-cap hw-cap-sm mr-copy" :class="{ 'hw-down': copyArmed }" :aria-pressed="copyArmed ? 'true' : 'false'"
                :title="copyArmed ? 'Click a pattern to copy into it (Esc: cancel)' : `Copy pattern ${slots[currentSlot]?.name} into another`"
                @click="emit('update:copyArmed', !copyArmed)">Copy</button>
        </div>
        <div class="mr-chain" role="group" aria-label="Chain">
            <button type="button" class="hw-cap hw-cap-sm hw-led-left mr-chain-on" :class="{ 'hw-down': chainOn }"
                role="switch" :aria-checked="chainOn ? 'true' : 'false'" aria-label="Chain" :disabled="!chainUsable"
                :title="!chainUsable ? 'Fill a cell to chain patterns' : chainOn ? 'Playing follows the chain: click to stop following it' : 'Play the cells in order, a bar each'"
                @click="emit('toggle-chain')">Chain</button>
            <button v-for="(c, i) in chain" :key="i" type="button" class="mr-cell"
                :class="{ filled: c != null, now: i === chainPlaying }"
                :aria-label="`Chain cell ${i + 1}: ${c == null ? 'empty' : `pattern ${slots[c]?.name}`}`"
                :title="`Cell ${i + 1}: click for the next pattern, Shift+click for the one before`"
                @click="emit('chain-cell', i, $event.shiftKey)">{{ c == null ? '' : slots[c]?.name }}</button>
        </div>
        <p v-if="queuedSlot != null" class="visually-hidden" role="status">Pattern {{ slots[queuedSlot]?.name }} at the next bar</p>
    </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Knob from './Knob.vue';
import { padHue } from '../lib/padColour';
import { startScope, startSpectrogram } from './monitorViews';

const props = defineProps<{
    analyser: AnalyserNode;
    sampleRate: number;
    active: () => boolean;  // whether anything sounds (the screens rest otherwise)
    name: string;
    steps: boolean[];
    pitches: number[];
    velocities: number[];
    muted: boolean;
    level: number;          // the lane's channelVolume
    currentStep: number;
    playing: boolean;
    slots: { name: string; filled: boolean }[]; // patterns A–D
    currentSlot: number;
    queuedSlot: number | null;  // waiting for the bar
    copyArmed: boolean;
    chain: (number | null)[];   // the chain's eight cells (PR 110)
    chainOn: boolean;
    chainUsable: boolean;       // a cell is filled
    chainPlaying: number;       // the cell playing, −1 for none
    mockBass?: string;          // MOCKUPS ONLY
    mockChosen?: string;
}>();
// MOCKUPS ONLY (?bass=j|k|l): the rows as the mixer, with a tiny level meter in three styles
const mixMock = ['j', 'k', 'l'].includes(props.mockBass || '');
// MOCKUPS ONLY: Bass's made-up steps (A1 A1 A2 E2 · A1 G1 C2 E2), drawn two octaves up
const bassNotes: Record<number, number> = { 0: 55, 2: 55, 3: 110, 6: 82.41, 8: 55, 10: 49, 11: 65.41, 14: 82.41 };
const bassCells = Array.from({ length: 16 }, (_, i) => bassNotes[i]
    ? { background: `hsl(${padHue(bassNotes[i] * 4)} 80% ${i % 4 === 0 ? 62 : 55}%)` } : null);
const emit = defineEmits<{
    (e: 'toggle-mute'): void;
    (e: 'update:level', v: number): void;
    (e: 'choose-slot', index: number, now: boolean): void;
    (e: 'update:copyArmed', v: boolean): void;
    (e: 'chain-cell', index: number, back: boolean): void;
    (e: 'toggle-chain'): void;
}>();

function slotTitle(i: number) {
    const s = props.slots[i];
    if (props.copyArmed && i !== props.currentSlot) return `Copy pattern ${props.slots[props.currentSlot]?.name} into ${s.name}`;
    if (i === props.currentSlot) return `Pattern ${s.name} is playing`;
    if (i === props.queuedSlot) return `Pattern ${s.name} at the next bar (Shift+click: now)`;
    return `Pattern ${s.name}${s.filled ? '' : ' (empty)'}${props.playing ? ': at the next bar (Shift+click: now)' : ''}`;
}

// While Copy is down, Esc or a click anywhere but the patterns puts it back up
const slotsEl = ref<HTMLElement | null>(null);
function onDownElsewhere(e: PointerEvent) {
    if (!slotsEl.value?.contains(e.target as Node)) emit('update:copyArmed', false);
}
function onEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') emit('update:copyArmed', false);
}
function listen(on: boolean) {
    const f = on ? window.addEventListener : window.removeEventListener;
    f('pointerdown', onDownElsewhere as any, true);
    f('keydown', onEsc as any);
}
watch(() => props.copyArmed, (on) => listen(on));
onBeforeUnmount(() => listen(false));

const levelModel = computed({ get: () => props.level, set: (v: number) => emit('update:level', v) });

// Each step: off, or its pad's colour (the note), brighter when louder (the velocity)
const cells = computed(() => props.steps.map((on, i) => ({
    on,
    style: on ? { background: `hsl(${padHue(props.pitches[i] || 220)} 80% ${38 + 24 * (props.velocities[i] ?? 1)}%)` } : undefined,
})));

const scopeEl = ref<HTMLCanvasElement | null>(null);
const specEl = ref<HTMLCanvasElement | null>(null);
const stops: (() => void)[] = [];
onMounted(() => {
    if (scopeEl.value) stops.push(startScope(scopeEl.value, props.analyser, props.active));
    if (specEl.value) stops.push(startSpectrogram(specEl.value, props.analyser, props.sampleRate, props.active));
});
onBeforeUnmount(() => stops.forEach((s) => s()));
</script>

<style scoped>
.machine-rail {
    --mr-lcd-bg: #0f141b;
    --mr-ink: #c7d6ff;
    display: flex;
    flex-direction: column;
    gap: 8px; /* 10 until PR 110 */
    padding: 12px;
    min-height: 0;
}

.theme-analog .machine-rail {
    --mr-lcd-bg: #1a1208;
    --mr-ink: #ffb547;
}

.theme-synthwave .machine-rail {
    --mr-lcd-bg: #2a0f52;
    --mr-ink: #e8dcff;
}

/* The monitor takes whatever the rows leave: two screens, the scope over the spectrogram */
.mr-monitor {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mr-screen {
    position: relative;
    flex: 1 1 0;
    min-height: 32px; /* 44 until PR 110: the chain's row takes the room beside the tablet's transport */
    border-radius: 6px;
    background: var(--mr-lcd-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 2px 10px rgba(0, 0, 0, 0.6), 0 0 0 2px rgba(0, 0, 0, 0.45);
    overflow: hidden;
}

.mr-screen canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.mr-label {
    position: absolute;
    top: 4px;
    left: 7px;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--mr-ink);
    opacity: 0.6;
    pointer-events: none;
}

.mr-rows {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.mr-row {
    display: grid;
    grid-template-columns: 14px 64px 30px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--pt-inset, rgba(0, 0, 0, 0.3));
}

/* MOCKUPS ONLY (?bass=j|k|l): the rows as a mixer: LED, name, a level meter, Level, Pedals,
   the steps. J: a thin upright bar; K: a line along the row's foot; L: eight LEDs */
.mock-fx .mr-row,
.mr-heads {
    grid-template-columns: 14px 50px 6px 30px 30px minmax(0, 1fr);
}

.mock-fx.m-k .mr-row,
.m-k .mr-heads {
    grid-template-columns: 14px 56px 30px 30px minmax(0, 1fr);
}

.mock-fx.m-l .mr-row,
.m-l .mr-heads {
    grid-template-columns: 14px 46px 30px 30px 30px minmax(0, 1fr);
}

.mr-heads {
    display: grid;
    gap: 8px;
    padding: 0 8px;
    font: 700 8px Cousine, ui-monospace, monospace;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
    text-align: center;
}

.mock-fx .mr-row {
    position: relative;
}

.mr-meter {
    --meter: linear-gradient(0deg, #3ddc97 0 60%, #ffd166 60% 85%, #ff6b6b 85%);
}

.mr-meter b {
    display: none;
}

/* J: a thin upright bar, filling from the bottom */
.mr-meter.m-j {
    position: relative;
    width: 6px;
    height: 22px;
    border-radius: 2px;
    background: rgba(0, 0, 0, .55);
    overflow: hidden;
}

.mr-meter.m-j i {
    position: absolute;
    inset: auto 0 0;
    height: calc(var(--lv) * 100%);
    background: var(--meter);
    background-size: 100% 22px;
    background-position: bottom;
}

/* K: a line along the row's foot, as wide as the row */
.mr-meter.m-k {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 1px;
    height: 3px;
    border-radius: 2px;
    background: rgba(0, 0, 0, .45);
    overflow: hidden;
}

.mr-meter.m-k i {
    display: block;
    height: 100%;
    width: calc(var(--lv) * 100%);
    background: linear-gradient(90deg, #3ddc97, #3ddc97 60%, #ffd166 80%, #ff6b6b);
    background-size: 330px 100%;
}

/* L: eight LEDs, green to red */
.mr-meter.m-l {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 1px;
    width: 30px;
    height: 10px;
}

.mr-meter.m-l i {
    display: none;
}

.mr-meter.m-l b {
    display: block;
    border-radius: 1px;
    background: rgba(0, 0, 0, .5);
}

.mr-meter.m-l b.on {
    background: #3ddc97;
    box-shadow: 0 0 3px #3ddc97;
}

.mr-meter.m-l b.on.hot {
    background: #ffd166;
    box-shadow: 0 0 3px #ffd166;
}

.mr-ghost {
    opacity: .45;
}

.mr-ghost small {
    font-weight: 400;
    font-size: 9px;
    opacity: .8;
}

.mr-row.is-chosen {
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--hw-led, #7dffb0), transparent 35%);
}

/* The LED: a 12 px light on a 22 px button, so a finger can hit it */
.mr-led {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin: -4px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
}

.mr-led::before {
    content: "";
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--hw-led-off, #2b3a33);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}

.mr-led.lit::before {
    background: var(--hw-led, #7dffb0);
    box-shadow: 0 0 6px var(--hw-led, #7dffb0);
}

.mr-led:focus-visible {
    outline: 2px solid var(--pt-accent, #ff4fd8);
    outline-offset: 2px;
}

.mr-name {
    font: 700 12px Cousine, ui-monospace, monospace;
    letter-spacing: 0.04em;
    color: var(--pt-text, #e8e2ff);
}

.mr-level {
    display: flex;
    justify-content: center;
}

.mr-cells {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    gap: 2px;
    height: 16px;
}

.mr-cells i {
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.07);
}

.mr-cells i.beat:not(.on) {
    background: rgba(255, 255, 255, 0.13);
}

.mr-cells i.now {
    outline: 1px solid #fff;
    outline-offset: 0;
}

/* Patterns A–D (PR 109; option A of PR 108's mockups): a caption, four caps and Copy */
.mr-slots {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--pt-inset, rgba(0, 0, 0, 0.3));
}

.mr-cap {
    min-width: 0;
    flex: 1 1 auto;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--pt-text, #e8e2ff);
    opacity: 0.75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mr-slot {
    position: relative;
    min-width: 30px;
    height: 24px;
    padding: 0;
    font: 700 11px Cousine, ui-monospace, monospace;
}

.mr-copy {
    height: 24px;
    padding: 0 8px;
    margin-left: 4px;
    font: 700 10px Cousine, ui-monospace, monospace;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

/* An empty slot: its letter dim (until it's the one playing) */
.mr-slot.empty:not(.hw-down) {
    color: color-mix(in oklab, var(--cap-ink, #e8e2ff), transparent 50%);
}

/* The current one is down with its letter in the LEDs' colour, as every switch */
.mr-slot.hw-down {
    color: var(--hw-led, #7dffb0);
}

/* Waiting for the bar: a pulsing ghost of the LEDs' colour, as a Melody Maker key's */
.mr-slot.is-queued::after,
.mr-slot.target::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: color-mix(in oklab, var(--hw-led, #7dffb0), transparent 70%);
    box-shadow: inset 0 0 0 2px var(--hw-led, #7dffb0);
    pointer-events: none;
    animation: mr-ghost 0.9s ease-in-out infinite;
}

/* Copy is down: the slots it could go to are outlined, steady */
.mr-slot.target::after {
    background: none;
    box-shadow: inset 0 0 0 1px var(--hw-led, #7dffb0);
    animation: none;
    opacity: 0.7;
}

/* The chain (PR 110): Chain (a toggle) and eight cells */
.mr-chain {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--pt-inset, rgba(0, 0, 0, 0.3));
}

.mr-chain-on {
    height: 24px;
    padding: 0 8px;
    margin-right: 4px;
    font: 700 10px Cousine, ui-monospace, monospace;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.mr-chain-on:disabled {
    opacity: 0.55;
    cursor: default;
}

.mr-cell {
    flex: 1 1 0;
    min-width: 0;
    height: 24px;
    padding: 0;
    border: 1px dashed rgba(255, 255, 255, 0.22);
    border-radius: 4px;
    background: none;
    font: 700 11px Cousine, ui-monospace, monospace;
    color: var(--pt-text, #e8e2ff);
    cursor: pointer;
}

.mr-cell.filled {
    border-style: solid;
    border-color: rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.28);
}

/* The cell playing: its letter and outline in the LEDs' colour */
.mr-cell.now {
    color: var(--hw-led, #7dffb0);
    border-color: var(--hw-led, #7dffb0);
    box-shadow: 0 0 6px color-mix(in oklab, var(--hw-led, #7dffb0), transparent 55%);
}

.mr-cell:focus-visible {
    outline: 2px solid var(--pt-accent, #ff4fd8);
    outline-offset: 1px;
}

@keyframes mr-ghost {
    0%, 100% { opacity: 0.25; }
    50% { opacity: 0.6; }
}

@media (prefers-reduced-motion: reduce) {
    .mr-slot.is-queued::after {
        animation: none;
        opacity: 0.45;
    }
}
</style>

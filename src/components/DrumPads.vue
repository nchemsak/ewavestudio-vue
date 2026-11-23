<!-- src/components/DrumPads.vue -->
<!-- The Drums machine's pads (the plan's item 5; option A of the mockups): a row per slot, its
     LED (a click mutes the slot), its name (a click picks the row: Pattern Tools' Step Fills and
     Humanize, and the slot's card, work on it) and its 16 steps. A click turns a step on or off;
     a lit step dragged up or down sets its velocity, its fill showing how loud; a drag sideways
     paints the row's steps on or off (PR 127). Each change is
     one undo step (a drag too: the pointer is held). Under 640 px a row's steps are two rows of 8. -->
<template>
    <div class="drum-pads">
        <div class="dp-numbers" aria-hidden="true">
            <span class="dp-head"></span>
            <span v-for="i in n" :key="i" class="dp-num" :class="{ beat: (i - 1) % 4 === 0 }">{{ i }}</span>
        </div>
        <div v-for="(row, k) in rows" :key="k" class="dp-row" :class="{ picked: k === picked }" :style="{ '--h': hues[k] }"
            role="group" :aria-label="`${names[k]} steps`">
            <div class="dp-head">
                <button type="button" class="dp-led" :class="{ lit: !slots[k].muted }" role="switch" :aria-checked="!slots[k].muted ? 'true' : 'false'"
                    :aria-label="`${names[k]} on`" :title="slots[k].muted ? `${names[k]} is muted: click to hear it` : `Mute ${names[k]}`"
                    @click="emit('toggle-mute', k)"></button>
                <button type="button" class="dp-name" :aria-pressed="k === picked ? 'true' : 'false'" :aria-label="`Pick ${names[k]}`"
                    :title="k === picked ? `${names[k]}: Step Fills and Humanize work on this row` : `Pick ${names[k]} for Step Fills and Humanize`"
                    @click="emit('pick', k)">{{ names[k] }}<small>{{ sources[k] }}</small></button>
            </div>
            <button v-for="(on, i) in row.steps" :key="i" type="button" class="dp-cell"
                :class="{ on, beat: i % 4 === 0, now: i === currentStep, dim: slots[k].muted }"
                :style="on ? { '--v': `${Math.round((row.velocities[i] ?? 1) * 100)}%` } : undefined"
                :aria-pressed="on ? 'true' : 'false'" :aria-label="`${names[k]}, step ${i + 1}`"
                :title="on ? `${names[k]}, step ${i + 1}: ${Math.round((row.velocities[i] ?? 1) * 100)}% (drag up or down)` : `${names[k]}, step ${i + 1}`"
                @pointerdown="down(k, i, $event)" @keydown.enter.prevent="toggle(k, i)"
                @keydown.up.prevent="nudge(k, i, $event.shiftKey ? 0.25 : 0.05)" @keydown.down.prevent="nudge(k, i, $event.shiftKey ? -0.25 : -0.05)" @keydown.space.stop
                @click.prevent><span class="dp-fill"></span></button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DrumRow } from '../audio/drums';
import type { DrumSlot } from '../lib/machines/drums';

const props = defineProps<{
    rows: DrumRow[];
    slots: DrumSlot[];
    names: string[];   // each slot's sound's name
    sources: string[]; // where it came from: "Kit", "Kept"
    hues: number[];    // each slot's colour
    picked: number;
    currentStep: number;
}>();
const emit = defineEmits<{
    (e: 'update:rows', rows: DrumRow[]): void;
    (e: 'pick', slot: number): void;
    (e: 'toggle-mute', slot: number): void;
}>();

const n = computed(() => props.rows[0]?.steps.length ?? 16);

function setRow(k: number, f: (r: DrumRow) => DrumRow) {
    emit('update:rows', props.rows.map((r, j) => (j === k ? f(r) : r)));
}
function toggle(k: number, i: number) {
    setRow(k, (r) => ({ ...r, steps: r.steps.map((s, j) => (j === i ? !s : s)) }));
}

// Up and down on a focused lit step: its velocity, 5 % a press (Shift: 25 %)
function nudge(k: number, i: number, d: number) {
    if (!props.rows[k].steps[i]) return;
    const v = Math.round(Math.min(1, Math.max(0.05, (props.rows[k].velocities[i] ?? 1) + d)) * 100) / 100;
    setRow(k, (r) => ({ ...r, velocities: r.velocities.map((x, j) => (j === i ? v : x)) }));
}

// A press on a step (PR 127): the first move decides. Up or down on a lit step sets its velocity
// (60 px: the whole range); sideways paints the steps of its row the pointer crosses the way the
// first one went, on or off (it stays in its row); no move at all is a click, which toggles.
const DRAG_PX = 60;
function down(k: number, i: number, e: PointerEvent) {
    if (e.button !== 0) return;
    const row = props.rows[k];
    const lit = row.steps[i];
    const from = row.velocities[i] ?? 1;
    const x0 = e.clientX, y0 = e.clientY;
    let mode: 'vel' | 'paint' | null = null;
    let paintOn = false;
    let last = i;
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* */ }
    const setStep = (j: number, on: boolean) => {
        if (props.rows[k].steps[j] !== on) setRow(k, (r) => ({ ...r, steps: r.steps.map((s, m) => (m === j ? on : s)) }));
    };
    const move = (ev: PointerEvent) => {
        const dx = ev.clientX - x0, dy = y0 - ev.clientY;
        if (!mode) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) return;
            if (lit && Math.abs(dy) > Math.abs(dx)) mode = 'vel';
            else {
                mode = 'paint';
                paintOn = !lit;
                setStep(i, paintOn);
            }
        }
        if (mode === 'vel') {
            const v = Math.round(Math.min(1, Math.max(0.05, from + dy / DRAG_PX)) * 100) / 100;
            if (v !== props.rows[k].velocities[i]) setRow(k, (r) => ({ ...r, velocities: r.velocities.map((x, j) => (j === i ? v : x)) }));
            return;
        }
        // The step of this row under the pointer, by its column
        const cells = el.parentElement?.querySelectorAll<HTMLElement>('.dp-cell');
        if (!cells) return;
        let j = -1;
        cells.forEach((c, m) => {
            const r = c.getBoundingClientRect();
            if (ev.clientX >= r.left - 2 && ev.clientX <= r.right + 2) j = m;
        });
        if (j < 0 || j === last) return;
        last = j;
        setStep(j, paintOn);
    };
    const up = (ev: PointerEvent) => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (!mode && ev.type === 'pointerup') toggle(k, i);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
}
</script>

<style scoped>
.drum-pads {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 12px 6px 4px;
}

.dp-numbers,
.dp-row {
    display: grid;
    grid-template-columns: 96px repeat(16, minmax(0, 1fr));
    gap: 4px;
    align-items: center;
}

.dp-num {
    font: 700 9px Cousine, ui-monospace, monospace;
    text-align: center;
    color: var(--pt-text-dim, #b9a8d8);
}

.dp-num.beat {
    color: var(--pt-text, #fff);
}

.dp-head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.dp-led {
    flex: none;
    width: 9px;
    height: 9px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--hw-led-off, #2c3a33);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, .5);
    cursor: pointer;
}

.dp-led.lit {
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 6px var(--hw-led, #5dffb0);
}

.dp-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 3px 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    font: 700 11px Cousine, ui-monospace, monospace;
    color: hsl(var(--h) 85% 72%);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    cursor: pointer;
}

.dp-name small {
    font-weight: 400;
    font-size: 8px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.dp-row.picked .dp-name {
    background: hsl(var(--h) 60% 30% / .45);
    box-shadow: inset 0 0 0 1px hsl(var(--h) 80% 60%);
}

.dp-cell {
    position: relative;
    height: 52px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, .08);
    border-radius: 6px;
    background: rgba(0, 0, 0, .28);
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, .5);
    overflow: hidden;
    cursor: pointer;
    touch-action: none;
}

.dp-cell.beat {
    background: rgba(255, 255, 255, .06);
}

.dp-cell.on {
    border-color: hsl(var(--h) 80% 60% / .8);
    box-shadow: 0 0 10px hsl(var(--h) 90% 60% / .35);
    cursor: ns-resize;
}

.dp-cell.now {
    outline: 2px solid rgba(255, 255, 255, .8);
    outline-offset: 1px;
}

.dp-cell.on.dim {
    opacity: .4;
}

.dp-fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 0;
    background: linear-gradient(to top, hsl(var(--h) 85% 55%), hsl(var(--h) 85% 68%));
}

.dp-cell.on .dp-fill {
    height: var(--v, 100%);
}

.dp-cell:focus-visible {
    outline: 2px solid var(--pt-accent, #ff4fd8);
    outline-offset: 1px;
}

/* Narrow: a slot's row wraps into two rows of 8 */
@media (max-width: 639.98px) {

    .dp-numbers,
    .dp-row {
        grid-template-columns: repeat(8, minmax(0, 1fr));
    }

    .dp-numbers .dp-num:nth-child(n + 10),
    .dp-numbers .dp-head {
        display: none;
    }

    .dp-row .dp-head {
        grid-column: 1 / -1;
    }

    .dp-cell {
        height: 30px;
    }
}
</style>

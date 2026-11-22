<!-- MOCKUPS ONLY (branch only, not for a PR): the Drift machine on the phone, ?driftphone=a|b|c.
     A: the desktop's plates over its bars (a tap on a bar picks it, a plate holds it there).
     B: a grid, a row per plate and a column per bar (a tap holds a plate in that bar; no picking).
     C: big plates, 3 × 2, over the bars, and the side's knobs become an X/Y pad (Filter × Spread).
     It reads and writes the real Drift machine (ctx), so every mockup plays. -->
<template>
    <!-- The Pads page's left side -->
    <div v-if="part === 'pads'" class="dpm" :class="[`v-${variant}`, { narrow }]">
        <template v-if="variant === 'b'">
            <div class="dpm-grid" :style="{ '--n': ctx.drift.length }" role="grid" aria-label="Drift chords">
                <span class="dpm-corner">Bar</span>
                <button v-for="b in ctx.drift.length" :key="`h${b}`" type="button" class="dpm-head"
                    :class="{ now: b - 1 === ctx.driftPlaying }" :aria-label="`Hear bar ${b}`" @click="ctx.previewDrift(b - 1)">
                    <b>{{ b }}</b><span>{{ ctx.driftLabels[b - 1] || '—' }}</span>
                </button>
                <template v-for="k in [5, 4, 3, 2, 1, 0]" :key="`r${k}`">
                    <span class="dpm-rowname" :style="{ '--h': ctx.driftPlates[k].hue }">{{ ctx.driftPlates[k].name }}<small>{{ ctx.driftPlates[k].deg }}</small></span>
                    <button v-for="b in ctx.drift.length" :key="`c${k}-${b}`" type="button" class="dpm-cell"
                        :class="{ on: ctx.drift.chords[b - 1]?.[k], now: b - 1 === ctx.driftPlaying, join: ctx.drift.chords[b - 1]?.[k] && ctx.drift.chords[b % ctx.drift.length]?.[k] && b < ctx.drift.length }"
                        :style="{ '--h': ctx.driftPlates[k].hue }" :aria-pressed="ctx.drift.chords[b - 1]?.[k] ? 'true' : 'false'"
                        :aria-label="`${ctx.driftPlates[k].name} in bar ${b}`" @click="ctx.toggleDriftPlate(b - 1, k)"></button>
                </template>
            </div>
        </template>
        <template v-else>
            <div class="dpm-plates" role="group" :aria-label="`Plates, bar ${ctx.driftPick + 1}`">
                <button v-for="(p, k) in ctx.driftPlates" :key="k" type="button" class="dpm-plate"
                    :class="{ held: ctx.drift.chords[ctx.driftPick]?.[k] }" :style="{ '--h': p.hue }"
                    :aria-pressed="ctx.drift.chords[ctx.driftPick]?.[k] ? 'true' : 'false'"
                    :aria-label="`${p.name} (${p.deg}) in bar ${ctx.driftPick + 1}`" @click="ctx.toggleDriftPlate(ctx.driftPick, k)">
                    <span class="dpm-deg">{{ p.deg }}</span>
                    <span class="dpm-glow" aria-hidden="true"></span>
                    <span class="dpm-name">{{ p.name }}<small>{{ p.octave }}</small></span>
                    <span class="dpm-led" aria-hidden="true"></span>
                </button>
            </div>
            <div class="dpm-bars" :style="{ '--n': ctx.drift.length }" role="radiogroup" aria-label="Bar the plates edit">
                <button v-for="i in ctx.drift.length" :key="i" type="button" role="radio" class="dpm-bar"
                    :class="{ picked: i - 1 === ctx.driftPick, now: i - 1 === ctx.driftPlaying }"
                    :aria-checked="i - 1 === ctx.driftPick ? 'true' : 'false'"
                    :aria-label="`Bar ${i}: ${ctx.driftLabels[i - 1] || 'nothing held'}`" @click="ctx.pickDriftBar(i - 1)">
                    <span class="dpm-bn">{{ i }}</span>
                    <span class="dpm-dots" aria-hidden="true"><i v-for="(p, k) in ctx.driftPlates" :key="k" :class="{ on: ctx.drift.chords[i - 1]?.[k] }" :style="{ '--h': p.hue }"></i></span>
                    <span class="dpm-chord">{{ ctx.driftLabels[i - 1] || '—' }}</span>
                </button>
            </div>
        </template>
    </div>

    <!-- The side's row that holds Oct, Move and Humanize for the step machines -->
    <div v-else-if="part === 'side'" class="dpm-side">
        <div class="pl-mini dpm-len" role="radiogroup" aria-label="Drift bars">
            <span>Bars</span>
            <button v-for="n in [4, 8]" :key="n" type="button" role="radio" :class="{ on: ctx.drift.length === n }"
                :aria-checked="ctx.drift.length === n ? 'true' : 'false'" @click="ctx.drift.length = n">{{ n }}</button>
        </div>
        <button type="button" class="pl-mini dpm-hear" :disabled="ctx.isPlaying"
            @click="ctx.previewDrift(ctx.driftPick)">{{ variant === 'b' ? 'Hear bar 1' : `Hear bar ${ctx.driftPick + 1}` }}</button>
    </div>

    <!-- The side's knobs: Filter, Spread, Attack, Release (A, B), or an X/Y pad (C) -->
    <div v-else-if="part === 'macros'" class="pl-macros" :class="{ 'dpm-xybox': variant === 'c' }">
        <template v-if="variant === 'c'">
            <div ref="xyEl" class="dpm-xy" aria-hidden="true" @pointerdown="xyDown" @pointermove="xyMove" @pointerup="xyUp" @pointercancel="xyUp">
                <span class="dpm-xy-grid"></span>
                <span class="dpm-xy-cross v" :style="{ left: dot.left }"></span>
                <span class="dpm-xy-cross h" :style="{ bottom: dot.bottom }"></span>
                <span class="dpm-xy-dot" :style="dot"></span>
                <span class="dpm-xy-lab x">FILTER {{ hzText(ctx.drift.cutoff).toUpperCase() }} →</span>
                <span class="dpm-xy-lab y">SPREAD {{ pct(ctx.drift.spread) }}</span>
            </div>
        </template>
        <template v-else>
            <div class="pl-macro">
                <Knob v-model="ctx.drift.cutoff" label="Filter" :min="CUT[0]" :max="CUT[1]" :step="1" taper="log" size="small" :value-text="hzText(ctx.drift.cutoff)" />
                <span class="pl-mv">{{ hzText(ctx.drift.cutoff) }}</span>
            </div>
            <div class="pl-macro">
                <Knob v-model="ctx.drift.spread" label="Spread" :min="0" :max="1" :step="0.01" size="small" :value-text="pct(ctx.drift.spread)" />
                <span class="pl-mv">{{ pct(ctx.drift.spread) }}</span>
            </div>
            <div class="pl-macro">
                <Knob v-model="ctx.drift.attack" label="Attack" :min="0.25" :max="4" :step="0.25" :detents="[1, 2]" size="small" :value-text="barsText(ctx.drift.attack)" />
                <span class="pl-mv">{{ barsShort(ctx.drift.attack) }}</span>
            </div>
            <div class="pl-macro">
                <Knob v-model="ctx.drift.release" label="Release" :min="0.25" :max="4" :step="0.25" :detents="[1, 2]" size="small" :value-text="barsText(ctx.drift.release)" />
                <span class="pl-mv">{{ barsShort(ctx.drift.release) }}</span>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Knob from './Knob.vue';
import { DRIFT_RANGES } from '../audio/drift';

const props = defineProps<{ ctx: any; variant: string; part: 'pads' | 'side' | 'macros' }>();
const CUT = DRIFT_RANGES.cutoff;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const hzText = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`);
const barsText = (b: number) => (b === 1 ? '1 bar' : b < 1 ? `${b * 4}/4 bar` : `${b} bars`);
const barsShort = (b: number) => (b < 1 ? `${b * 4}/4 bar` : `${b} bar${b === 1 ? '' : 's'}`);

const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 699.98px)') : null;
const narrow = ref(!!q?.matches);
const onQ = (e: MediaQueryListEvent) => { narrow.value = e.matches; };
onMounted(() => q?.addEventListener('change', onQ));
onBeforeUnmount(() => q?.removeEventListener('change', onQ));

// C's X/Y pad, as DriftSound's
const logPos = (hz: number) => Math.log(hz / CUT[0]) / Math.log(CUT[1] / CUT[0]);
const dot = computed(() => ({
    left: `${(logPos(props.ctx.drift.cutoff) * 100).toFixed(2)}%`,
    bottom: `${(props.ctx.drift.spread * 100).toFixed(2)}%`,
}));
const xyEl = ref<HTMLElement | null>(null);
let dragging = false;
function xySet(e: PointerEvent) {
    const r = xyEl.value?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    props.ctx.drift.cutoff = Math.round(CUT[0] * (CUT[1] / CUT[0]) ** x);
    props.ctx.drift.spread = Math.round(y * 100) / 100;
}
function xyDown(e: PointerEvent) { dragging = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); xySet(e); }
function xyMove(e: PointerEvent) { if (dragging) xySet(e); }
function xyUp() { dragging = false; }
</script>

<style scoped>
.dpm {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    min-width: 0;
}

/* A and C: the plates */
.dpm-plates {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
    min-height: 0;
}

.v-c .dpm-plates,
.narrow .dpm-plates {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.dpm-plate {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    min-width: 0;
    min-height: 0;
    padding: 7px 9px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, .16);
    background:
        repeating-linear-gradient(90deg, rgba(255, 255, 255, .025) 0 1px, transparent 1px 3px),
        linear-gradient(160deg, #3c4150, #1d2029 70%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18), inset 0 -3px 8px rgba(0, 0, 0, .45), 0 2px 0 rgba(0, 0, 0, .5);
    color: #dfe4f2;
    overflow: hidden;
    text-align: left;
    touch-action: manipulation;
}

.dpm-glow {
    position: absolute;
    inset: 0;
    opacity: 0;
    background: radial-gradient(ellipse at 50% 85%, hsl(var(--h) 90% 60% / .75), transparent 70%);
    transition: opacity .5s;
    pointer-events: none;
}

.dpm-plate.held {
    border-color: hsl(var(--h) 90% 66%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .25), 0 0 14px hsl(var(--h) 90% 60% / .55), 0 2px 0 rgba(0, 0, 0, .5);
}

.dpm-plate.held .dpm-glow { opacity: 1; }

.dpm-deg {
    position: relative;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .08em;
    color: rgba(223, 228, 242, .65);
}

.dpm-name {
    position: relative;
    display: flex;
    flex-direction: column;
    font: 700 20px Cousine, ui-monospace, monospace;
    line-height: 1;
}

.v-c .dpm-name { font-size: 24px; }

.dpm-name small {
    font-size: 9px;
    font-weight: 400;
    margin-top: 3px;
    opacity: .75;
}

.dpm-led {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--hw-led-off, #2c3a33);
}

.dpm-plate.held .dpm-led {
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 6px var(--hw-led, #5dffb0);
}

/* A and C: the bars */
.dpm-bars {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 5px;
    flex: none;
}

.narrow .dpm-bars[style*="--n: 8"],
.v-c .dpm-bars[style*="--n: 8"] {
    grid-template-columns: repeat(4, minmax(0, 1fr));
}

.dpm-bar {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 34px;
    padding: 0 6px;
    border-radius: 7px;
    border: 1px solid rgba(255, 255, 255, .1);
    background: var(--pt-inset, #14101f);
    color: var(--pt-text, #fff);
    min-width: 0;
}

.dpm-bars[style*="--n: 8"] .dpm-bar { height: 30px; }

.dpm-bar.picked {
    border-color: var(--hw-led, #5dffb0);
    box-shadow: 0 0 0 1px var(--hw-led, #5dffb0);
}

.dpm-bar.now { background: color-mix(in oklab, var(--pt-inset, #14101f) 70%, #fff); }

.dpm-bn {
    font: 700 9px Cousine, ui-monospace, monospace;
    color: var(--pt-muted, #b9a8d8);
}

.dpm-dots {
    display: flex;
    flex-direction: column-reverse;
    gap: 1px;
    flex: none;
}

.dpm-dots i {
    width: 10px;
    height: 3px;
    border-radius: 1px;
    background: rgba(255, 255, 255, .1);
}

.dpm-dots i.on { background: hsl(var(--h) 85% 62%); }

.dpm-chord {
    font: 700 11px Cousine, ui-monospace, monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}

/* B: the grid */
.dpm-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 38px repeat(var(--n), minmax(0, 1fr));
    grid-template-rows: 30px repeat(6, minmax(0, 1fr));
    gap: 4px;
    min-height: 0;
}

.dpm-corner {
    align-self: center;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--pt-muted);
}

.dpm-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    min-width: 0;
    padding: 0 2px;
    border: 0;
    border-radius: 6px;
    background: var(--pt-inset);
    color: var(--pt-text);
    font: 700 11px Cousine, ui-monospace, monospace;
    overflow: hidden;
}

.dpm-head b { font-size: 8px; color: var(--pt-muted); }
.dpm-head span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.dpm-head.now { outline: 2px solid var(--pl-now, #fff); outline-offset: -2px; }

.dpm-rowname {
    display: flex;
    align-items: center;
    gap: 3px;
    font: 700 13px Cousine, ui-monospace, monospace;
    color: hsl(var(--h) 85% 72%);
}

.dpm-rowname small { font-size: 8px; color: var(--pt-muted); font-weight: 400; }

.dpm-cell {
    position: relative;
    min-width: 0;
    min-height: 0;
    border: 0;
    border-radius: 6px;
    background:
        repeating-linear-gradient(90deg, rgba(255, 255, 255, .025) 0 1px, transparent 1px 3px),
        linear-gradient(160deg, #2e323e, #1b1e26 70%);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07);
    touch-action: manipulation;
}

.dpm-cell.on {
    background: linear-gradient(180deg, hsl(var(--h) 85% 62%), hsl(var(--h) 85% 48%));
    box-shadow: 0 0 10px hsl(var(--h) 90% 60% / .5);
}

/* A note held into the next bar carries on: a bridge across the gap */
.dpm-cell.join::after {
    content: "";
    position: absolute;
    top: 35%;
    bottom: 35%;
    right: -5px;
    width: 6px;
    background: hsl(var(--h) 85% 55%);
}

.dpm-cell.now { filter: brightness(1.25); outline: 2px solid var(--pl-now, #fff); outline-offset: -2px; }

/* PhoneLayout's own (scoped there) */
.pl-mini {
    display: grid;
    grid-template-columns: 28px 1fr 28px;
    align-items: center;
    gap: 2px;
    height: 27px;
    border-radius: 8px;
    background: var(--pt-inset);
    font-size: 10px;
    text-align: center;
    color: var(--pt-muted);
    white-space: nowrap;
}

.pl-mini button {
    height: 23px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--pt-text);
    font: 700 13px Cousine, ui-monospace, monospace;
    padding: 0;
}

.pl-macros {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    place-items: center;
    background: var(--pt-inset);
    border-radius: 10px;
    padding: 4px;
    min-height: 0;
}

.pl-macro {
    display: grid;
    justify-items: center;
    gap: 0;
}

.pl-mv {
    font-size: 10px;
    color: var(--pt-text);
    white-space: nowrap;
}

/* The side row */
.dpm-side {
    display: flex;
    gap: 5px;
    min-width: 0;
}

.dpm-len {
    flex: 1;
    grid-template-columns: 1fr 34px 34px;
    padding-right: 2px;
}

.dpm-len button.on {
    background: rgba(255, 255, 255, .15);
    box-shadow: inset 0 0 0 1px var(--hw-led, #5dffb0);
}

.dpm-hear {
    display: block;
    background: var(--pt-inset);
    height: 27px;
    border-radius: 8px;
    flex: 1;
    border: 0;
    padding: 0 6px;
    font: inherit;
    font-size: 11px;
    color: var(--pt-text);
}

.dpm-hear:disabled { opacity: .45; }

/* C: the X/Y pad in the knobs' place */
.pl-macros.dpm-xybox {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    place-items: stretch;
    padding: 4px;
}

.dpm-xy {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    border-radius: 8px;
    background: #0c1118;
    overflow: hidden;
    touch-action: none;
}

.dpm-xy-grid {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgba(207, 224, 255, .07) 1px, transparent 1px), linear-gradient(90deg, rgba(207, 224, 255, .07) 1px, transparent 1px);
    background-size: 25% 33.3%;
}

.dpm-xy-cross {
    position: absolute;
    background: rgba(93, 255, 176, .3);
}

.dpm-xy-cross.v { top: 0; bottom: 0; width: 1px; }
.dpm-xy-cross.h { left: 0; right: 0; height: 1px; }

.dpm-xy-dot {
    position: absolute;
    width: 16px;
    height: 16px;
    margin: 0 0 -8px -8px;
    border-radius: 50%;
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 12px var(--hw-led, #5dffb0);
}

.dpm-xy-lab {
    position: absolute;
    font: 700 8px Cousine, ui-monospace, monospace;
    letter-spacing: .08em;
    color: rgba(207, 224, 255, .7);
}

.dpm-xy-lab.x { right: 6px; bottom: 4px; }
.dpm-xy-lab.y { left: 6px; top: 4px; }
</style>

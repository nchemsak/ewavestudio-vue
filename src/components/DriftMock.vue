<!-- src/components/DriftMock.vue -->
<!-- MOCKUPS ONLY (?drift=a|b|c; branch only, not for a PR): the Drift machine (the plan's item 6).
     Pictures, no sound. A minor; the six plates are the key's chord in thirds (A C E G B D:
     1 3 5 7 9 11), so a bar's plates make a chord (A C E = Am, C E G = C, E G B = Em...).
       a: the plates across the pads card, the bars under them (a click picks the bar the plates
          edit); Sound: the X/Y pad, the swarm's screen, the knobs
       b: the pads card is a grid, a row per plate and a column per bar, a held note a long bar
          fading in and out; the plates are in Sound beside the X/Y pad, to play (no swarm screen)
       c: the plates are six chords of the key (i III iv v VI VII), not six notes; a chord per
          bar; the X/Y pad beside the plates on the pads card -->
<template>
    <!-- THE PADS CARD -->
    <div v-if="part === 'pads'" class="dr-pads" :data-v="variant">
        <!-- a: the plates, then the bars -->
        <template v-if="variant === 'a'">
            <div class="dr-plates">
                <button v-for="(p, k) in PLATES" :key="p.name" type="button" class="dr-plate" :class="{ held: bars[mock.pick].held[k] }"
                    :style="{ '--h': p.hue }" :aria-pressed="bars[mock.pick].held[k] ? 'true' : 'false'" :aria-label="`${p.name} plate`"
                    @click="bars[mock.pick].held[k] = !bars[mock.pick].held[k]">
                    <span class="dr-plate-deg">{{ p.deg }}</span>
                    <span class="dr-plate-glow" aria-hidden="true"></span>
                    <span class="dr-plate-name">{{ p.name }}<small>{{ p.oct }}</small></span>
                    <span class="dr-plate-led" aria-hidden="true"></span>
                </button>
            </div>
            <div class="dr-barrow">
                <div class="dr-len" role="radiogroup" aria-label="Bars">
                    <span class="dr-cap">Bars</span>
                    <button v-for="n in [4, 8]" :key="n" type="button" role="radio" class="hw-cap hw-cap-sm hw-led-top dr-lenbtn"
                        :class="{ 'hw-down': mock.length === n }" :aria-checked="mock.length === n ? 'true' : 'false'"
                        @click="mock.length = n">{{ n }}</button>
                </div>
                <div class="dr-bars" :style="{ '--n': mock.length }">
                    <button v-for="(b, i) in bars" :key="i" type="button" class="dr-bar" :class="{ picked: i === mock.pick, now: i === mock.now }"
                        :aria-label="`Bar ${i + 1}: ${chordName(b.held)}`" @click="mock.pick = i">
                        <span class="dr-bar-n">{{ i + 1 }}</span>
                        <span class="dr-bar-dots" aria-hidden="true"><i v-for="(h, k) in b.held" :key="k" :class="{ on: h }" :style="{ '--h': PLATES[k].hue }"></i></span>
                        <span class="dr-bar-chord">{{ chordName(b.held) }}</span>
                    </button>
                </div>
            </div>
            <p class="dr-hint">The plates edit bar {{ mock.pick + 1 }} · a touched plate latches · the chords play a bar each, across the chain</p>
        </template>

        <!-- b: a row per plate, a column per bar; a held note is one long bar -->
        <template v-else-if="variant === 'b'">
            <div class="dr-grid" :style="{ '--n': mock.length }">
                <span class="dr-ghead">
                    <span class="dr-len" role="radiogroup" aria-label="Bars">
                        <button v-for="n in [4, 8]" :key="n" type="button" role="radio" class="hw-cap hw-cap-sm dr-lenbtn"
                            :class="{ 'hw-down': mock.length === n }" :aria-checked="mock.length === n ? 'true' : 'false'"
                            @click="mock.length = n">{{ n }} bars</button>
                    </span>
                </span>
                <span v-for="(b, i) in bars" :key="`c${i}`" class="dr-gchord" :class="{ now: i === mock.now }">{{ i + 1 }} · {{ chordName(b.held) }}</span>
                <template v-for="(p, k) in PLATES_DOWN" :key="p.name">
                    <span class="dr-gname" :style="{ '--h': p.hue }"><i></i>{{ p.name }}<small>{{ p.oct }} · {{ p.deg }}</small></span>
                    <span class="dr-glane" :style="{ '--h': p.hue }">
                        <button v-for="(b, i) in bars" :key="i" type="button" class="dr-gcell" :class="{ now: i === mock.now }"
                            :aria-pressed="b.held[p.k] ? 'true' : 'false'" :aria-label="`${p.name}, bar ${i + 1}`"
                            @click="b.held[p.k] = !b.held[p.k]"></button>
                        <span v-for="(s, j) in spans(p.k)" :key="`s${j}`" class="dr-gspan"
                            :style="{ left: `calc(${s.from} / var(--n) * 100%)`, width: `calc(${s.to - s.from} / var(--n) * 100%)` }">
                            <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path :d="spanPath(s)" /></svg>
                        </span>
                    </span>
                </template>
            </div>
            <p class="dr-hint">A click holds a note through a bar · a held note fades in over Attack and out over Release · the plates (in Sound) write into the bar playing</p>
        </template>

        <!-- c: six chords of the key, the X/Y pad beside them, a chord per bar under -->
        <template v-else>
            <div class="dr-c">
                <div class="dr-cleft">
                    <div class="dr-plates chords">
                        <button v-for="(c, k) in CHORDS" :key="c.name" type="button" class="dr-plate" :class="{ held: bars[mock.pick].chord === k }"
                            :style="{ '--h': c.hue }" :aria-pressed="bars[mock.pick].chord === k ? 'true' : 'false'" :aria-label="`${c.name} plate`"
                            @click="bars[mock.pick].chord = k">
                            <span class="dr-plate-deg">{{ c.deg }}</span>
                            <span class="dr-plate-glow" aria-hidden="true"></span>
                            <span class="dr-plate-name">{{ c.name }}<small>{{ c.notes }}</small></span>
                            <span class="dr-plate-led" aria-hidden="true"></span>
                        </button>
                    </div>
                    <div class="dr-barrow">
                        <div class="dr-len" role="radiogroup" aria-label="Bars">
                            <span class="dr-cap">Bars</span>
                            <button v-for="n in [4, 8]" :key="n" type="button" role="radio" class="hw-cap hw-cap-sm hw-led-top dr-lenbtn"
                                :class="{ 'hw-down': mock.length === n }" :aria-checked="mock.length === n ? 'true' : 'false'"
                                @click="mock.length = n">{{ n }}</button>
                        </div>
                        <div class="dr-bars" :style="{ '--n': mock.length }">
                            <button v-for="(b, i) in bars" :key="i" type="button" class="dr-bar slim" :class="{ picked: i === mock.pick, now: i === mock.now }"
                                :style="{ '--h': CHORDS[b.chord].hue }" @click="mock.pick = i">
                                <span class="dr-bar-n">{{ i + 1 }}</span>
                                <span class="dr-bar-chord big">{{ CHORDS[b.chord].name }}</span>
                            </button>
                        </div>
                    </div>
                </div>
                <XyPad class="dr-cxy" />
            </div>
        </template>
    </div>

    <!-- THE SOUND SECTION -->
    <div v-else-if="part === 'sound'" class="dr-sound" :data-v="variant">
        <!-- b: the plates to play, beside the X/Y pad -->
        <div v-if="variant === 'b'" class="pt-card dr-card dr-playcard" style="grid-area: plates">
            <div class="dr-cardhead"><h3 class="pt-title">Plates</h3><span>bar {{ mock.now + 1 }} playing</span></div>
            <div class="dr-plates tall">
                <button v-for="(p, k) in PLATES" :key="p.name" type="button" class="dr-plate" :class="{ held: bars[mock.now].held[k] }"
                    :style="{ '--h': p.hue }" @click="bars[mock.now].held[k] = !bars[mock.now].held[k]">
                    <span class="dr-plate-deg">{{ p.deg }}</span>
                    <span class="dr-plate-glow" aria-hidden="true"></span>
                    <span class="dr-plate-name">{{ p.name }}<small>{{ p.oct }}</small></span>
                    <span class="dr-plate-led" aria-hidden="true"></span>
                </button>
            </div>
        </div>
        <div v-if="variant !== 'c'" class="pt-card dr-card dr-xycard" style="grid-area: xy">
            <XyPad />
        </div>
        <div v-if="variant !== 'b'" class="pt-card dr-card dr-swarmcard" style="grid-area: swarm">
            <div class="dr-swarm">
                <svg viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true">
                    <path v-for="(l, i) in swarmLines" :key="i" :d="l.d" class="dr-sline" :style="{ stroke: `hsl(${l.hue} 85% 70%)`, opacity: l.o }" />
                    <path :d="envPath" class="dr-senv" />
                </svg>
                <span class="dr-read">SWARM · {{ mock.voices }} VOICES A NOTE · {{ variant === 'c' ? CHORDS[bars[mock.now].chord].name : chordName(bars[mock.now].held) }}</span>
                <span class="dr-read r"><b>- - ATTACK {{ fmtBars(mock.attack) }}, RELEASE {{ fmtBars(mock.release) }}</b></span>
            </div>
        </div>
        <div class="pt-card dr-card dr-knobcard" style="grid-area: knobs">
            <div class="dr-kgroup">
                <span class="dr-kcap">Swarm</span>
                <div class="dr-kgrid">
                    <div class="dr-kcell">
                        <Knob v-model="mock.voices" label="Voices" :min="3" :max="7" :step="1" size="medium" :useThemeArc="true" markersOnly :markers="[3, 4, 5, 6, 7]" />
                        <span class="dr-kval">{{ mock.voices }}</span>
                    </div>
                    <div class="dr-kcell">
                        <Knob v-model="mock.drift" label="Drift" :min="0" :max="1" :step="0.01" size="medium" :useThemeArc="true" />
                        <span class="dr-kval">{{ Math.round(mock.drift * 100) }}%</span>
                    </div>
                    <div class="dr-kcell">
                        <Knob v-model="mock.tone" label="Wave" :min="0" :max="1" :step="0.01" size="medium" :useThemeArc="true" />
                        <span class="dr-kval">{{ mock.tone < 0.34 ? 'Soft' : mock.tone < 0.67 ? 'Warm' : 'Bright' }}</span>
                    </div>
                </div>
            </div>
            <div class="dr-kgroup">
                <span class="dr-kcap">In bars</span>
                <div class="dr-kgrid">
                    <div class="dr-kcell">
                        <Knob v-model="mock.attack" label="Attack" :min="0.25" :max="4" :step="0.25" size="medium" :useThemeArc="true" />
                        <span class="dr-kval">{{ fmtBars(mock.attack) }}</span>
                    </div>
                    <div class="dr-kcell">
                        <Knob v-model="mock.release" label="Release" :min="0.25" :max="4" :step="0.25" size="medium" :useThemeArc="true" />
                        <span class="dr-kval">{{ fmtBars(mock.release) }}</span>
                    </div>
                    <div class="dr-kcell">
                        <Knob v-model="mock.space" label="Reverb" :min="0" :max="1" :step="0.01" size="medium" :useThemeArc="true" />
                        <span class="dr-kval">{{ Math.round(mock.space * 100) }}%</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h } from 'vue';
import Knob from './Knob.vue';
import { padHue } from '../lib/padColour';
import { chordName, mock, NOTES } from './driftMockState';

const props = defineProps<{ part: 'pads' | 'sound'; variant: string }>();

const PLATES = NOTES.map((n) => ({ ...n, hue: padHue(n.hz * 2) }));
const PLATES_DOWN = PLATES.map((p, k) => ({ ...p, k })).reverse();
const CHORDS = [
    { name: 'Am', deg: 'i', notes: 'A C E', hz: 220 },
    { name: 'C', deg: 'III', notes: 'C E G', hz: 261.6 },
    { name: 'Dm', deg: 'iv', notes: 'D F A', hz: 293.7 },
    { name: 'Em', deg: 'v', notes: 'E G B', hz: 329.6 },
    { name: 'F', deg: 'VI', notes: 'F A C', hz: 349.2 },
    { name: 'G', deg: 'VII', notes: 'G B D', hz: 392 },
].map((c) => ({ ...c, hue: padHue(c.hz * 2.5) }));

const bars = computed(() => mock.bars.slice(0, mock.length));

function fmtBars(v: number) { return v === 1 ? '1 bar' : v < 1 ? `${v * 4}/4 bar` : `${v} bars`; }

// b: a plate's held stretches across the bars
function spans(k: number) {
    const out: { from: number; to: number; start: boolean; end: boolean }[] = [];
    let i = 0;
    while (i < bars.value.length) {
        if (!bars.value[i].held[k]) { i++; continue; }
        const from = i;
        while (i < bars.value.length && bars.value[i].held[k]) i++;
        out.push({ from, to: i, start: true, end: true });
    }
    return out;
}
function spanPath(s: { from: number; to: number }) {
    // Fades in over Attack, holds, fades out over Release (into the next bar, drawn cut at the span's end)
    const len = s.to - s.from, a = Math.min(1, mock.attack / len), r = Math.min(0.5, mock.release / len / 2);
    return `M0 10 C ${a * 40} 10 ${a * 70} 1 ${a * 100} 1 L ${100 - r * 100} 1 C ${100 - r * 60} 1 ${100 - r * 20} 7 100 10 Z`;
}

// The swarm's screen: each held note's voices as slowly drifting lines
const swarmLines = computed(() => {
    const held = bars.value[mock.now].held;
    const out: { d: string; hue: number; o: number }[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    PLATES.forEach((p, k) => {
        if (!held[k]) return;
        const base = 128 - (Math.log2(p.hz / 220) / 1.5) * 110;
        for (let v = 0; v < mock.voices; v++) {
            const ph = rnd() * 6.28, f = 1.5 + rnd() * 2, amp = 4 + mock.drift * 14 * (0.4 + rnd());
            const off = (v - (mock.voices - 1) / 2) * (1.5 + mock.drift * 3);
            let d = '';
            for (let x = 0; x <= 400; x += 8) {
                const fade = Math.min(1, x / (90 * mock.attack));
                const y = base + off + Math.sin(ph + (x / 400) * f * 6.28) * amp * fade + (1 - fade) * 18;
                d += `${x ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
            }
            out.push({ d, hue: p.hue, o: 0.35 + 0.5 * (1 - Math.abs(off) / 12) });
        }
    });
    return out;
});
const envPath = computed(() => {
    const a = Math.min(380, 90 * mock.attack);
    return `M0 148 C ${a * 0.4} 148 ${a * 0.7} 12 ${a} 12 L 400 12`;
});

// The X/Y pad: Filter across, the swarm's Spread up; a drag moves the dot
const XyPad = defineComponent({
    setup() {
        let el: HTMLElement | null = null;
        const move = (e: PointerEvent) => {
            if (!el) return;
            const r = el.getBoundingClientRect();
            mock.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            mock.y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
        };
        return () => h('div', {
            class: 'dr-xy', role: 'group', 'aria-label': 'Filter and spread',
            ref: (r: any) => { el = r; },
            onPointerdown: (e: PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); move(e); },
            onPointermove: (e: PointerEvent) => { if (e.buttons) move(e); },
        }, [
            h('span', { class: 'dr-xy-grid' }),
            h('span', { class: 'dr-xy-trail', style: { left: `${mock.x * 100}%`, bottom: `${mock.y * 100}%` } }),
            h('span', { class: 'dr-xy-cross v', style: { left: `${mock.x * 100}%` } }),
            h('span', { class: 'dr-xy-cross h', style: { bottom: `${mock.y * 100}%` } }),
            h('span', { class: 'dr-xy-dot', style: { left: `${mock.x * 100}%`, bottom: `${mock.y * 100}%` } }),
            h('span', { class: 'dr-xy-lab x' }, `FILTER ${Math.round(200 * Math.pow(40, mock.x))} HZ →`),
            h('span', { class: 'dr-xy-lab y' }, `SPREAD ${Math.round(mock.y * 100)}% →`),
            h('span', { class: 'dr-xy-lab t' }, 'X/Y'),
        ]);
    },
});
void props;
</script>

<style scoped>
.dr-pads {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 12px 6px 4px;
    height: 100%;
}

/* The plates: brushed metal, a touched one lit in its note's colour */
.dr-plates {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
    flex: 1 1 auto;
    min-height: 96px;
}

.dr-plate {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, .16);
    background:
        repeating-linear-gradient(90deg, rgba(255, 255, 255, .025) 0 1px, transparent 1px 3px),
        linear-gradient(160deg, #3c4150, #1d2029 70%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18), inset 0 -3px 8px rgba(0, 0, 0, .45), 0 2px 0 rgba(0, 0, 0, .5);
    color: #dfe4f2;
    overflow: hidden;
    cursor: pointer;
    text-align: left;
}

.dr-plate-glow {
    position: absolute;
    inset: 0;
    opacity: 0;
    background: radial-gradient(ellipse at 50% 85%, hsl(var(--h) 90% 60% / .75), transparent 70%);
    transition: opacity .6s;
    pointer-events: none;
}

.dr-plate.held {
    border-color: hsl(var(--h) 90% 66%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .25), 0 0 14px hsl(var(--h) 90% 60% / .55), 0 2px 0 rgba(0, 0, 0, .5);
}

.dr-plate.held .dr-plate-glow {
    opacity: 1;
}

.dr-plate-deg {
    position: relative;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .08em;
    color: rgba(223, 228, 242, .6);
}

.dr-plate-name {
    position: relative;
    display: flex;
    flex-direction: column;
    font: 700 20px Cousine, ui-monospace, monospace;
    line-height: 1;
}

.dr-plate-name small {
    font-size: 9px;
    font-weight: 400;
    letter-spacing: .06em;
    margin-top: 3px;
    opacity: .75;
}

.dr-plate-led {
    position: absolute;
    top: 9px;
    right: 9px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--hw-led-off, #2c3a33);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, .5);
}

.dr-plate.held .dr-plate-led {
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 6px var(--hw-led, #5dffb0);
}

.dr-plates.chords .dr-plate-name {
    font-size: 18px;
}

.dr-plates.tall {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    min-height: 0;
    height: 100%;
}

/* The bars under the plates */
.dr-barrow {
    display: flex;
    gap: 10px;
    align-items: stretch;
}

.dr-len {
    display: flex;
    align-items: center;
    gap: 4px;
}

.dr-cap {
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
    margin-right: 2px;
}

.dr-lenbtn {
    min-width: 30px;
    font: 700 10px Cousine, ui-monospace, monospace;
}

.dr-bars {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 5px;
}

.dr-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 7px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, .1);
    background: var(--pt-inset, #14101f);
    color: var(--pt-text, #fff);
    min-width: 0;
    cursor: pointer;
}

.dr-bar.picked {
    border-color: var(--hw-led, #5dffb0);
    box-shadow: 0 0 0 1px var(--hw-led, #5dffb0);
}

.dr-bar.now {
    background: color-mix(in oklab, var(--pt-inset, #14101f) 80%, #fff);
}

.dr-bar-n {
    font: 700 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
}

.dr-bar-dots {
    display: flex;
    flex-direction: column-reverse;
    gap: 1px;
}

.dr-bar-dots i {
    width: 14px;
    height: 3px;
    border-radius: 1px;
    background: rgba(255, 255, 255, .1);
}

.dr-bar-dots i.on {
    background: hsl(var(--h) 85% 62%);
}

.dr-bar-chord {
    font: 700 12px Cousine, ui-monospace, monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.dr-bar.slim {
    border-left: 3px solid hsl(var(--h) 85% 62%);
}

.dr-bar-chord.big {
    font-size: 15px;
}

.dr-hint {
    margin: 0;
    font: 400 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
    letter-spacing: .04em;
}

/* b: the grid */
.dr-grid {
    display: grid;
    grid-template-columns: 74px minmax(0, 1fr);
    grid-template-rows: auto;
    gap: 3px 8px;
    flex: 1;
}

.dr-ghead {
    grid-column: 1;
}

.dr-gchord {
    display: none;
}

.dr-grid {
    grid-template-columns: 74px repeat(var(--n), minmax(0, 1fr));
}

.dr-gchord {
    display: block;
    font: 700 10px Cousine, ui-monospace, monospace;
    color: var(--pt-text, #fff);
    padding: 2px 4px;
    border-bottom: 1px solid rgba(255, 255, 255, .12);
}

.dr-gchord.now {
    color: var(--hw-led, #5dffb0);
}

.dr-ghead .dr-len {
    gap: 2px;
}

.dr-ghead .dr-lenbtn {
    min-width: 0;
    padding: 1px 5px;
    font-size: 8px;
}

.dr-gname {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 700 12px Cousine, ui-monospace, monospace;
    color: hsl(var(--h) 85% 72%);
}

.dr-gname i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: hsl(var(--h) 85% 60%);
}

.dr-gname small {
    font-size: 8px;
    font-weight: 400;
    color: var(--pt-text-dim, #b9a8d8);
}

.dr-glane {
    grid-column: 2 / -1;
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 0;
    min-height: 15px;
}

.dr-gcell {
    border: 0;
    border-right: 1px solid rgba(255, 255, 255, .08);
    background: rgba(255, 255, 255, .03);
    padding: 0;
    cursor: pointer;
}

.dr-gcell.now {
    background: rgba(255, 255, 255, .07);
}

.dr-gspan {
    position: absolute;
    top: 2px;
    bottom: 2px;
    pointer-events: none;
}

.dr-gspan svg {
    width: 100%;
    height: 100%;
    display: block;
}

.dr-gspan path {
    fill: hsl(var(--h) 85% 58% / .85);
    stroke: hsl(var(--h) 90% 75%);
    stroke-width: .6;
    vector-effect: non-scaling-stroke;
}

/* c: plates and bars, the X/Y pad beside */
.dr-c {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 150px;
    gap: 10px;
    flex: 1;
}

.dr-cleft {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* THE SOUND SECTION */
.dr-sound {
    display: contents;
}

.dr-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 8px;
}

.dr-cardhead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
}

.dr-cardhead span {
    font: 400 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
}

.dr-swarm {
    --sp-bg: #0c1118;
    --sp-ink: #cfe0ff;
    position: relative;
    flex: 1 1 auto;
    min-height: 170px;
    border-radius: 6px;
    background: var(--sp-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07), inset 0 2px 10px rgba(0, 0, 0, .6);
    overflow: hidden;
}

.theme-analog .dr-swarm,
.theme-analog .dr-xy {
    --sp-bg: #160f05;
    --sp-ink: #ffcf8a;
}

.theme-synthwave .dr-swarm,
.theme-synthwave .dr-xy {
    --sp-bg: #2a0f52;
    --sp-ink: #e8dcff;
}

.dr-swarm svg {
    position: absolute;
    inset: 22px 0 6px;
    width: 100%;
    height: calc(100% - 28px);
}

.dr-sline {
    fill: none;
    stroke-width: 1.1;
    vector-effect: non-scaling-stroke;
}

.dr-senv {
    fill: none;
    stroke: var(--sp-ink);
    stroke-width: 1;
    stroke-dasharray: 3 4;
    opacity: .6;
    vector-effect: non-scaling-stroke;
}

.dr-read {
    position: absolute;
    top: 5px;
    left: 8px;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .06em;
    color: var(--sp-ink);
    white-space: nowrap;
}

.dr-read.r {
    top: auto;
    bottom: 5px;
    left: auto;
    right: 8px;
}

.dr-read b {
    opacity: .75;
}

.dr-knobcard {
    justify-content: center;
    gap: 14px;
}

.dr-kgroup {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.dr-kcap {
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--pt-text-dim, #b9a8d8);
}

.dr-kgrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    justify-items: center;
    gap: 4px;
}

.dr-kcell {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.dr-kval {
    font: 700 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text, #fff);
    opacity: .8;
    margin-top: 2px;
}

.dr-xycard {
    align-items: stretch;
}
</style>

<style>
/* The X/Y pad (a render function's elements: not scoped) */
.dr-xy {
    --sp-bg: #0c1118;
    --sp-ink: #cfe0ff;
    position: relative;
    flex: 1 1 auto;
    min-height: 140px;
    border-radius: 8px;
    background: var(--sp-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), inset 0 2px 12px rgba(0, 0, 0, .6);
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
}

.theme-analog .dr-xy { --sp-bg: #160f05; --sp-ink: #ffcf8a; }
.theme-synthwave .dr-xy { --sp-bg: #2a0f52; --sp-ink: #e8dcff; }

.dr-xy-grid {
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(to right, color-mix(in oklab, var(--sp-ink) 12%, transparent) 1px, transparent 1px),
        linear-gradient(to top, color-mix(in oklab, var(--sp-ink) 12%, transparent) 1px, transparent 1px);
    background-size: 25% 25%;
}

.dr-xy-cross {
    position: absolute;
    background: color-mix(in oklab, var(--sp-ink) 40%, transparent);
}

.dr-xy-cross.v { top: 0; bottom: 0; width: 1px; }
.dr-xy-cross.h { left: 0; right: 0; height: 1px; }

.dr-xy-trail {
    position: absolute;
    width: 70px;
    height: 70px;
    margin: 0 0 -35px -35px;
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in oklab, var(--hw-led, #5dffb0) 35%, transparent), transparent 70%);
}

.dr-xy-dot {
    position: absolute;
    width: 16px;
    height: 16px;
    margin: 0 0 -8px -8px;
    border-radius: 50%;
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 10px var(--hw-led, #5dffb0), inset 0 -2px 3px rgba(0, 0, 0, .3);
}

.dr-xy-lab {
    position: absolute;
    font: 700 8px Cousine, ui-monospace, monospace;
    letter-spacing: .06em;
    color: var(--sp-ink);
    opacity: .8;
    white-space: nowrap;
}

.dr-xy-lab.x { bottom: 4px; right: 6px; }
.dr-xy-lab.y { top: 50%; left: 6px; transform-origin: 0 0; transform: rotate(-90deg) translate(-50%, 0); }
.dr-xy-lab.t { top: 5px; left: 7px; opacity: 1; }
</style>

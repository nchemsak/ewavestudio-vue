<!-- src/components/DriftPhonePads.vue -->
<!-- Phone mode's Pads page for the Drift machine (the plan's item 6, part 3; option C of the
     mockups): the six plates, 3 × 2 at every size so they're big enough to play, over the bars.
     As on the desktop (DriftPads.vue) a tap on a bar picks the bar the plates edit (and plays it
     while stopped), and a tap on a plate holds it there or lets it go. Each bar shows its plates
     as dashes, lowest at the bottom, and its chord's name; a dash that runs off a bar's right edge
     is a note that carries on into the next bar without starting again (the last bar's, round
     into bar 1). The bar playing is lighter. With 8 bars on a short screen the bars are shown
     four at a time (1–4 | 5–8), so the plates keep their size. -->
<template>
    <div class="pl-drift" :class="{ halves }">
        <div class="pdr-plates" role="group" :aria-label="`Plates, bar ${picked + 1}`">
            <button v-for="(p, k) in plates" :key="k" type="button" class="pdr-plate" :class="{ held: chords[picked]?.[k] }"
                :style="{ '--h': p.hue }" :aria-pressed="chords[picked]?.[k] ? 'true' : 'false'"
                :aria-label="`${p.name} (${p.deg}) in bar ${picked + 1}`" @click="emit('toggle', picked, k)">
                <span class="pdr-deg">{{ p.deg }}</span>
                <span class="pdr-glow" aria-hidden="true"></span>
                <span class="pdr-name">{{ p.name }}<small>{{ p.octave }}</small></span>
                <span class="pdr-led" aria-hidden="true"></span>
            </button>
        </div>
        <div class="pdr-strip">
            <div v-if="halves" class="pdr-halves" role="radiogroup" aria-label="Bars shown">
                <button v-for="h in [0, 1]" :key="h" type="button" role="radio" class="pdr-half"
                    :class="{ on: half === h, now: playing >= 0 && Math.floor(playing / 4) === h }"
                    :aria-checked="half === h ? 'true' : 'false'" @click="half = h">{{ h ? '5–8' : '1–4' }}</button>
            </div>
            <div class="pdr-bars" :class="{ eight: length > 4 && !halves }" role="radiogroup" aria-label="Bar the plates edit">
                <button v-for="b in shownBars" :key="b" type="button" role="radio" class="pdr-bar"
                    :class="{ picked: b === picked, now: b === playing }" :aria-checked="b === picked ? 'true' : 'false'"
                    :aria-label="`Bar ${b + 1}: ${labels[b] || 'nothing held'}`" @click="emit('pick', b)">
                    <span class="pdr-bn">{{ b + 1 }}</span>
                    <span class="pdr-chord" :class="{ empty: !labels[b] }">{{ labels[b] || (b === picked ? 'tap a plate' : '—') }}</span>
                    <span class="pdr-dots" aria-hidden="true"><i v-for="(p, k) in plates" :key="k"
                        :class="{ on: chords[b]?.[k], carry: carry[b]?.[k] }" :style="{ '--h': p.hue }"></i></span>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { carriesOn } from '../lib/machines/drift';

const props = defineProps<{
    plates: { name: string; octave: string; deg: string; hue: number }[];
    chords: boolean[][];
    length: number;
    labels: string[];   // each bar's chord name ('' for nothing held)
    picked: number;     // the bar the plates edit
    playing: number;    // the bar playing, −1 while stopped
}>();
const emit = defineEmits<{
    (e: 'toggle', bar: number, plate: number): void;
    (e: 'pick', bar: number): void;
}>();

// Short screens (the first iPhone SE, 320 px tall): 8 bars in two rows would squash the plates
const shortQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-height: 359.98px)') : null;
const short = ref(!!shortQuery?.matches);
const onShort = (e: MediaQueryListEvent) => { short.value = e.matches; };
onMounted(() => shortQuery?.addEventListener('change', onShort));
onBeforeUnmount(() => shortQuery?.removeEventListener('change', onShort));
const halves = computed(() => short.value && props.length > 4);
const half = ref(0);
// The half shown follows the picked bar (a progression picks bar 1, Copy the next bar)
watch(() => props.picked, (b) => { half.value = b >= 4 ? 1 : 0; }, { immediate: true });
const shownBars = computed(() => {
    const all = Array.from({ length: props.length }, (_, b) => b);
    return halves.value ? all.slice(half.value * 4, half.value * 4 + 4) : all;
});
const carry = computed(() => Array.from({ length: props.length }, (_, b) => carriesOn(props.chords, props.length, b)));
</script>

<style scoped>
.pl-drift {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    min-width: 0;
}

/* The plates: brushed metal, a held one lit in its note's colour (DriftPads' look) */
.pdr-plates {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 6px;
    min-height: 0;
}

.pdr-plate {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    min-width: 0;
    min-height: 0;
    padding: 6px 9px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, .16);
    background:
        repeating-linear-gradient(90deg, rgba(255, 255, 255, .025) 0 1px, transparent 1px 3px),
        linear-gradient(160deg, #3c4150, #1d2029 70%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18), inset 0 -3px 8px rgba(0, 0, 0, .45), 0 2px 0 rgba(0, 0, 0, .5);
    color: #dfe4f2;
    font: inherit;
    overflow: hidden;
    text-align: left;
    touch-action: manipulation;
    transition: transform .06s;
}

.pdr-plate:active {
    transform: translateY(1px);
}

.pdr-glow {
    position: absolute;
    inset: 0;
    opacity: 0;
    background: radial-gradient(ellipse at 50% 85%, hsl(var(--h) 90% 60% / .75), transparent 70%);
    transition: opacity .5s;
    pointer-events: none;
}

.pdr-plate.held {
    border-color: hsl(var(--h) 90% 66%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .25), 0 0 14px hsl(var(--h) 90% 60% / .55), 0 2px 0 rgba(0, 0, 0, .5);
}

.pdr-plate.held .pdr-glow {
    opacity: 1;
}

.pdr-deg {
    position: relative;
    font: 700 9px Cousine, ui-monospace, monospace;
    letter-spacing: .08em;
    color: rgba(223, 228, 242, .65);
}

.pdr-name {
    position: relative;
    display: flex;
    flex-direction: column;
    font: 700 24px Cousine, ui-monospace, monospace;
    line-height: 1;
}

.pdr-name small {
    font-size: 9px;
    font-weight: 400;
    margin-top: 3px;
    opacity: .75;
}

.pdr-led {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--hw-led-off, #2c3a33);
}

.pdr-plate.held .pdr-led {
    background: var(--hw-led, #5dffb0);
    box-shadow: 0 0 6px var(--hw-led, #5dffb0);
}

@media (prefers-reduced-motion: reduce) {
    .pdr-glow {
        transition: none;
    }
}

/* The bars */
.pdr-strip {
    display: flex;
    gap: 5px;
    flex: none;
    min-width: 0;
}

.pdr-halves {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: rgba(0, 0, 0, .35);
}

.pdr-half {
    position: relative;
    flex: 1;
    min-width: 36px;
    border: 0;
    border-radius: 6px;
    padding: 0 4px;
    background: rgba(255, 255, 255, .05);
    color: var(--pt-text-dim, #cbbde6);
    font: 700 9px Cousine, ui-monospace, monospace;
}

.pdr-half.on {
    color: var(--pt-text, #fff);
    background: rgba(255, 255, 255, .15);
    box-shadow: inset 0 0 0 1px var(--hw-led, #5dffb0);
}

/* The half the playing bar is in: a dot */
.pdr-half.now::after {
    content: "";
    position: absolute;
    top: 3px;
    right: 3px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--pl-now, #fff);
}

.pdr-bars {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
    min-width: 0;
}

.pdr-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 36px;
    padding: 0 0 0 6px;
    border-radius: 7px;
    border: 1px solid rgba(255, 255, 255, .1);
    background: var(--pt-inset, #14101f);
    color: var(--pt-text, #fff);
    font: inherit;
    min-width: 0;
    text-align: left;
    touch-action: manipulation;
}

.pdr-bars.eight .pdr-bar {
    height: 30px;
}

.pdr-bar.picked {
    border-color: var(--hw-led, #5dffb0);
    box-shadow: 0 0 0 1px var(--hw-led, #5dffb0);
}

.pdr-bar.now {
    background: color-mix(in oklab, var(--pt-inset, #14101f) 70%, #fff);
}

.pdr-bn {
    font: 700 9px Cousine, ui-monospace, monospace;
    color: var(--pt-muted, #b9a8d8);
}

.pdr-chord {
    flex: 1;
    font: 700 12px Cousine, ui-monospace, monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}

/* The picked bar while it holds nothing: what to do, quieter */
.pdr-bar.picked .pdr-chord.empty {
    font-weight: 400;
    font-size: 10px;
    color: var(--pt-muted, #b9a8d8);
}

/* Its plates as dashes at its right edge, lowest at the bottom; a note that carries on into the
   next bar runs off the edge, across the gap */
.pdr-dots {
    display: flex;
    flex-direction: column-reverse;
    gap: 1px;
    flex: none;
    align-items: flex-start;
    padding-right: 5px;
}

.pdr-dots i {
    width: 10px;
    height: 3px;
    border-radius: 1px;
    background: rgba(255, 255, 255, .1);
}

.pdr-dots i.on {
    background: hsl(var(--h) 85% 62%);
}

.pdr-dots i.carry {
    width: 21px;
    margin-right: -11px;
    border-radius: 1px 0 0 1px;
    background: linear-gradient(90deg, hsl(var(--h) 85% 62%) 50%, hsl(var(--h) 85% 62% / .35));
}

/* A narrow phone (the bars about 60 px wide): the bar's number tucked into its corner, so the
   chord's name has the room ("Cmaj7"), and the dashes narrower */
@media (max-width: 699.98px) {
    .pdr-bar {
        padding-left: 5px;
        gap: 3px;
    }

    .pdr-bn {
        position: absolute;
        top: 1px;
        left: 4px;
        font-size: 7px;
    }

    .pdr-chord {
        padding-top: 6px;
        font-size: 11px;
    }

    .pdr-bar.picked .pdr-chord.empty {
        font-size: 8px;
        white-space: normal;
        line-height: 1.05;
    }

    .pdr-dots {
        padding-right: 4px;
    }

    .pdr-dots i {
        width: 8px;
    }

    .pdr-dots i.carry {
        width: 18px;
        margin-right: -10px;
    }

    .pdr-half {
        min-width: 32px;
    }
}
</style>

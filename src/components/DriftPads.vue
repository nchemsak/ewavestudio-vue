<!-- src/components/DriftPads.vue -->
<!-- The Drift machine's pads (the plan's item 6; option A of the mockups): six touch plates, one
     per note of the key's chord in thirds (1 3 5 7 9 11), and under them its bars (4 or 8), each
     the chord it holds. A click on a bar picks the bar the plates edit; a click on a plate holds
     it in that bar or lets it go (one undo step). While stopped, either plays the picked bar's
     chord. While playing, the bar playing is lit. Each bar shows its plates as dashes, lowest at
     the bottom, and its chord's name. -->
<template>
    <div class="drift-pads">
        <div class="dr-plates" role="group" :aria-label="`Plates, bar ${picked + 1}`">
            <button v-for="(p, k) in plates" :key="k" type="button" class="dr-plate" :class="{ held: chords[picked]?.[k] }"
                :style="{ '--h': p.hue }" :aria-pressed="chords[picked]?.[k] ? 'true' : 'false'"
                :aria-label="`${p.name} (${p.deg}) in bar ${picked + 1}`"
                :title="chords[picked]?.[k] ? `${p.name}: held in bar ${picked + 1} (click to let it go)` : `Hold ${p.name} in bar ${picked + 1}`"
                @click="emit('toggle', picked, k)">
                <span class="dr-plate-deg">{{ p.deg }}</span>
                <span class="dr-plate-glow" aria-hidden="true"></span>
                <span class="dr-plate-name">{{ p.name }}<small>{{ p.octave }}</small></span>
                <span class="dr-plate-led" aria-hidden="true"></span>
            </button>
        </div>
        <div class="dr-barrow">
            <div class="dr-len" role="radiogroup" aria-label="Drift bars">
                <span class="dr-cap" aria-hidden="true">Bars</span>
                <button v-for="n in DRIFT_LENGTHS" :key="n" type="button" role="radio" class="hw-cap hw-cap-sm hw-led-top dr-lenbtn"
                    :class="{ 'hw-down': length === n }" :aria-checked="length === n ? 'true' : 'false'" :aria-label="`${n} bars`"
                    @click="emit('length', n)">{{ n }}</button>
            </div>
            <div class="dr-bars" :style="{ '--n': length }" role="radiogroup" aria-label="Bar the plates edit">
                <button v-for="i in length" :key="i" type="button" role="radio" class="dr-bar"
                    :class="{ picked: i - 1 === picked, now: i - 1 === playing }" :aria-checked="i - 1 === picked ? 'true' : 'false'"
                    :aria-label="`Bar ${i}: ${labels[i - 1] || 'nothing held'}`" @click="emit('pick', i - 1)">
                    <span class="dr-bar-n">{{ i }}</span>
                    <span class="dr-bar-dots" aria-hidden="true"><i v-for="(p, k) in plates" :key="k" :class="{ on: chords[i - 1]?.[k] }" :style="{ '--h': p.hue }"></i></span>
                    <span class="dr-bar-chord">{{ labels[i - 1] || '—' }}</span>
                </button>
            </div>
        </div>
        <p class="dr-hint">The plates edit bar {{ picked + 1 }}<span class="dr-hint-more"> · a chord a bar, from Play, round the chain · a note two bars share carries on</span></p>
    </div>
</template>

<script setup lang="ts">
import { DRIFT_LENGTHS } from '../audio/drift';

defineProps<{
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
    (e: 'length', n: number): void;
}>();
</script>

<style scoped>
.drift-pads {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 12px 6px 4px;
}

/* The plates: brushed metal, a held one lit in its note's colour */
.dr-plates {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
    min-height: 96px;
}

.dr-plate {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    min-width: 0;
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
    transition: transform .06s;
}

.dr-plate:active {
    transform: translateY(1px);
}

.dr-plate-glow {
    position: absolute;
    inset: 0;
    opacity: 0;
    background: radial-gradient(ellipse at 50% 85%, hsl(var(--h) 90% 60% / .75), transparent 70%);
    transition: opacity .5s;
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
    color: rgba(223, 228, 242, .65);
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
    min-width: 0;
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
    background: color-mix(in oklab, var(--pt-inset, #14101f) 78%, #fff);
}

.dr-bar-n {
    font: 700 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
}

.dr-bar-dots {
    display: flex;
    flex-direction: column-reverse;
    gap: 1px;
    flex: none;
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
    min-width: 0;
}

.dr-hint {
    margin: 0;
    font: 400 9px Cousine, ui-monospace, monospace;
    color: var(--pt-text-dim, #b9a8d8);
    letter-spacing: .04em;
}

/* 8 bars on a narrow card: two rows of 4 */
@container (max-width: 700px) {
    .dr-bars[style*="--n: 8"] {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
}

@media (max-width: 639.98px) {
    .dr-plates {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        min-height: 0;
    }

    .dr-plate {
        min-height: 58px;
    }

    .dr-barrow {
        flex-direction: column;
        gap: 6px;
    }

    .dr-bars {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .dr-hint-more {
        display: none;
    }
}
</style>

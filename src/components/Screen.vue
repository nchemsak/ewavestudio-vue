<template>
    <div class="mpc-screen">
        <div class="mpc-screen__bezel">
            <div class="mpc-screen__lcd">
                <!-- LCD text (hidden when any canvas is shown) -->
                <span v-show="view === 'text'">{{ text }}</span>

                <!-- Oscilloscope canvas -->
                <canvas v-show="view === 'scope'" ref="lcdScope" aria-hidden="true"></canvas>

                <!-- Spectrogram canvas -->
                <canvas v-show="view === 'spec'" ref="lcdSpec" aria-hidden="true"></canvas>

                <!-- Tuner canvas -->
                <canvas v-show="view === 'tuner'" ref="lcdTuner" aria-hidden="true"></canvas>
            </div>
        </div>

        <div class="mpc-screen__fkeys">
            <button v-for="n in 6" :key="n" class="fkey" :class="{ active: activeKey === n }" :aria-label="`F${n}`"
                @click="$emit('fkey', n)">
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref, defineExpose } from 'vue'

const props = defineProps({
    text: { type: String, default: 'HARP  2' },
    view: { type: String, default: 'scope' }, // 'text' | 'scope' | 'spec' | 'tuner'
    activeKey: { type: Number, default: 1 }
})

const lcdScope = ref(null)
const lcdSpec = ref(null)
const lcdTuner = ref(null)
defineExpose({ scopeCanvas: lcdScope, specCanvas: lcdSpec, tunerCanvas: lcdTuner })


</script>


<style scoped>
.mpc-screen {
    /* --screen-w: 22rem; */

    /* --screen-w: min(22rem, 100%); */
    /* width: var(--screen-w);*/

    width: min(22rem, 100%);
    max-width: 100%;
    box-sizing: border-box;

    --mpc-bezel-bg: #171a21;
    --mpc-bezel-rim: rgba(255, 255, 255, .06);

    /* LCD — darker base for high contrast */
    --mpc-lcd-bg: #0f141b;

    --mpc-lcd-vignette: rgba(0, 0, 0, .42);
    --mpc-lcd-gloss: rgba(255, 255, 255, .10);
    --mpc-lcd-scanline: #7aa2ff;
    --mpc-lcd-fg: #e6edf3;

    /* Spectrogram palette (bright on dark) */
    --mpc-spec-low: #00e5ff;
    --mpc-spec-mid: #2eff9a;
    --mpc-spec-high: #ffd54f;
    --mpc-spec-peak: #ffffff;

    --mpc-scope-trace: #c7d6ff;

    width: var(--screen-w);
    display: grid;
    grid-template-rows: auto 2.2rem;
    gap: .6rem;
    user-select: none;
    font-family: Cousine, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    --mpc-scope-trace: #c7d6ff;
    /* bright for dark LCDs */
    --mpc-scope-width: 2;
}

/* THEME OVERRIDES (inherits from ancestor .theme-*) */
.theme-light .mpc-screen {
    --mpc-bezel-bg: #e9edf3;
    --mpc-bezel-rim: rgba(0, 0, 0, .06);
    --mpc-lcd-bg: #cdd2d5;
    --mpc-lcd-vignette: rgba(0, 0, 0, .12);
    --mpc-lcd-gloss: rgba(255, 255, 255, .35);
    --mpc-lcd-scanline: #b37a30;
    --mpc-spec-low: #2196f3;
    --mpc-spec-mid: #43a047;
    --mpc-spec-high: #ff9800;
    --mpc-spec-peak: #000;
    --mpc-lcd-fg: #111;
    --mpc-scope-trace: #1f2937;
    --mpc-scope-width: 2.5;
}

.theme-synthwave .mpc-screen {
    --mpc-bezel-bg: #160b2e;
    --mpc-bezel-rim: rgba(255, 255, 255, .08);
    --mpc-lcd-bg: #2a0f52;
    --mpc-lcd-vignette: rgba(0, 0, 0, .22);
    --mpc-lcd-gloss: rgba(255, 255, 255, .20);
    --mpc-lcd-scanline: #e91e63;
    --mpc-spec-low: #00e5ff;
    /* neon cyan */
    --mpc-spec-mid: #7c4dff;
    /* violet */
    --mpc-spec-high: #ff4081;
    /* pink */
    --mpc-spec-peak: #ffffff;
    --mpc-lcd-fg: #fff;
}

/* bezel block */
.mpc-screen__bezel {
    background:
        linear-gradient(180deg, color-mix(in oklab, var(--mpc-bezel-bg) 92%, black 8%), var(--mpc-bezel-bg));
    border-radius: .6rem;
    padding: 1rem;
    box-shadow:
        inset 0 0 0 1px var(--mpc-bezel-rim),
        0 10px 24px rgba(0, 0, 0, .35);
}

/* LCD window */
.mpc-screen__lcd {
    position: relative;
    background: var(--mpc-lcd-bg);
    width: clamp(60%, 82%, 92%);
    /* height: calc(var(--screen-w) * 0.30); */
    aspect-ratio: 10 / 3;
    margin: 0 auto;
    border-radius: .35rem;
    box-shadow:
        inset 0 0 0 1px rgba(0, 0, 0, .18),
        inset 0 0 .9rem var(--mpc-lcd-vignette);
    display: grid;
    place-items: center;
    overflow: hidden;
}

/* subtle gloss */
.mpc-screen__lcd::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--mpc-lcd-gloss), transparent 55%);
    mix-blend-mode: soft-light;
    pointer-events: none;
}

/* thin amber/copper scanline at the bottom */
.mpc-screen__lcd::after {
    content: "";
    position: absolute;
    left: 9%;
    right: 9%;
    bottom: .28rem;
    height: .12rem;
    border-radius: .12rem;
    background: linear-gradient(90deg,
            transparent,
            color-mix(in oklab, var(--mpc-lcd-scanline) 60%, black 40%),
            transparent);
    opacity: .28;
}

@supports not (color: color-mix(in oklab, #000, #fff)) {
    .mpc-screen__lcd::after {
        background: linear-gradient(90deg, transparent, var(--mpc-lcd-scanline), transparent);
    }
}

/* text readout */
.mpc-screen__lcd>span {
    font-size: clamp(.85rem, 1.4vw, 1.05rem);
    letter-spacing: .08em;
    color: var(--mpc-lcd-fg, #111)
}

/* canvas fills the LCD */
.mpc-screen__lcd>canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.mpc-screen__fkeys {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: .4rem;
    padding: 0 .75rem;
}

.fkey {
    height: .9rem;
    border-radius: .2rem;
    background: #f9f4ec;
    border: 1px solid #b7b9b6;
    box-shadow: .12rem .12rem rgba(130, 128, 128, .9);
    cursor: pointer;
}

.fkey:active {
    transform: translate(.06rem, .12rem);
    box-shadow: inset .08rem .08rem .35rem rgba(0, 0, 0, .25);
}
</style>

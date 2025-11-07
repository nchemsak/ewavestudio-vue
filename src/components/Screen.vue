<template>
    <div class="nac-screen">
        <div class="nac-screen__bezel">
            <div class="nac-screen__lcd">
                <!-- LCD text (hidden when any canvas is shown) -->
                <!-- <span v-show="view === 'text'">{{ text }}</span> -->

                <!-- Oscilloscope canvas -->
                <canvas v-show="view === 'scope'" ref="lcdScope" aria-hidden="true"></canvas>

                <!-- Spectrogram canvas -->
                <canvas v-show="view === 'spec'" ref="lcdSpec" aria-hidden="true"></canvas>

                <!-- Tuner canvas -->
                <canvas v-show="view === 'tuner'" ref="lcdTuner" aria-hidden="true"></canvas>

                <!-- Envelope canvas -->
                <canvas v-show="view === 'env'" ref="lcdEnv" aria-hidden="true"></canvas>
            </div>
        </div>

        <div class="nac-screen__fkeys">
            <button v-for="btn in fkeyDefs" :key="btn.id" class="fkey" :class="{ active: activeKey === btn.id }"
                :data-kind="btn.title.toLowerCase()" type="button" :title="btn.title"
                :aria-pressed="activeKey === btn.id ? 'true' : 'false'" :aria-label="btn.title"
                @click="$emit('fkey', btn.id)">

                <span v-if="btn.title !== 'Spectrogram'" class="ico" aria-hidden="true" v-html="btn.svg" />
                <span v-else class="heatmap-fill" aria-hidden="true" />
                <span class="sr-only">{{ btn.title }}</span>
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref, defineExpose, defineEmits, defineProps, computed } from 'vue';

const props = defineProps({
    // text: { type: String, default: 'HARP  2' },
    view: { type: String, default: 'scope' },
    activeKey: { type: Number, default: 1 },
    fkeys: { type: Array, default: null }
});

defineEmits(['fkey']);

const lcdScope = ref(null);
const lcdSpec = ref(null);
const lcdTuner = ref(null);
const lcdEnv = ref(null);

defineExpose({
    scopeCanvas: lcdScope,
    specCanvas: lcdSpec,
    tunerCanvas: lcdTuner,
    envCanvas: lcdEnv
});

const ICONS = {
    scope: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="2" ry="2" fill="none"
                  stroke="currentColor" stroke-width="1.6"/>
            <path d="M3 12
                     C5 6, 7 6, 9 12
                     s4 6, 6 0
                     s4-6, 4-6"
                  fill="none" stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>`,

    spec: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"></svg>`,

    tuner: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M8 5v5a4 4 0 0 0 8 0V5"
                  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M12 14v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="20.5" r="1" fill="currentColor"/>
          </svg>`,

    env: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M3 18V6h6l4 6h8v6H3z"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>`,

    // text: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    //        <path d="M4 6h16M4 12h10M4 18h14"
    //              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    //      </svg>`,

    // info: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    //        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
    //        <path d="M12 10v6m0-9h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    //      </svg>`
};

const defaultDefs = [
    { id: 1, title: 'Oscilloscope', svg: ICONS.scope },
    { id: 2, title: 'Spectrogram', svg: ICONS.spec },
    { id: 3, title: 'Tuner', svg: ICONS.tuner },
    { id: 4, title: 'Envelope', svg: ICONS.env },
    // { id: 5, title: 'Text', svg: ICONS.text },
    // { id: 6, title: 'Info', svg: ICONS.info }
];

const fkeyDefs = computed(() => {
    if (Array.isArray(props.fkeys) && props.fkeys.length === 6) {
        return props.fkeys.map((x, i) => ({
            id: x.id ?? (i + 1),
            title: x.title ?? defaultDefs[i].title,
            svg: x.svg ?? defaultDefs[i].svg
        }));
    }
    return defaultDefs;
});
</script>

<style scoped>
.nac-screen {
    width: min(22rem, 100%);
    max-width: 100%;
    box-sizing: border-box;

    --nac-bezel-bg: #171a21;
    --nac-bezel-rim: rgba(255, 255, 255, .06);

    --nac-lcd-bg: #0f141b;

    --nac-lcd-vignette: rgba(0, 0, 0, .42);
    --nac-lcd-gloss: rgba(255, 255, 255, .10);
    --nac-lcd-scanline: #7aa2ff;
    --nac-lcd-fg: #e6edf3;

    --nac-spec-low: #00e5ff;
    --nac-spec-mid: #2eff9a;
    --nac-spec-high: #ffd54f;
    --nac-spec-peak: #ffffff;

    --nac-scope-trace: #c7d6ff;
    --nac-scope-width: 2;

    --fkey-ico: #2b303a;

    width: var(--screen-w);
    display: grid;
    grid-template-rows: auto 2.2rem;
    gap: .6rem;
    user-select: none;
    font-family: Cousine, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}

.theme-light .nac-screen {
    --nac-bezel-bg: #e9edf3;
    --nac-bezel-rim: rgba(0, 0, 0, .06);
    --nac-lcd-bg: #cdd2d5;
    --nac-lcd-vignette: rgba(0, 0, 0, .12);
    --nac-lcd-gloss: rgba(255, 255, 255, .35);
    --nac-lcd-scanline: #b37a30;
    --nac-spec-low: #2196f3;
    --nac-spec-mid: #43a047;
    --nac-spec-high: #ff9800;
    --nac-spec-peak: #000;
    --nac-lcd-fg: #111;
    --nac-scope-trace: #1f2937;
    --nac-scope-width: 2.5;
    --fkey-ico: #1f2937;
}

.theme-synthwave .nac-screen {
    --nac-bezel-bg: #160b2e;
    --nac-bezel-rim: rgba(255, 255, 255, .08);
    --nac-lcd-bg: #2a0f52;
    --nac-lcd-vignette: rgba(0, 0, 0, .22);
    --nac-lcd-gloss: rgba(255, 255, 255, .20);
    --nac-lcd-scanline: #e91e63;
    --nac-spec-low: #00e5ff;
    --nac-spec-mid: #7c4dff;
    --nac-spec-high: #ff4081;
    --nac-spec-peak: #ffffff;
    --nac-lcd-fg: #fff;
    --fkey-ico: #1b1e27;
}

.nac-screen__bezel {
    background:
        linear-gradient(180deg, color-mix(in oklab, var(--nac-bezel-bg) 92%, black 8%), var(--nac-bezel-bg));
    border-radius: .6rem;
    padding: 1rem;
    box-shadow:
        inset 0 0 0 1px var(--nac-bezel-rim),
        0 10px 24px rgba(0, 0, 0, .35);
}

.nac-screen__lcd {
    position: relative;
    background: var(--nac-lcd-bg);
    width: clamp(60%, 82%, 92%);
    aspect-ratio: 10 / 3;
    margin: 0 auto;
    border-radius: .35rem;
    box-shadow:
        inset 0 0 0 1px rgba(0, 0, 0, .18),
        inset 0 0 .9rem var(--nac-lcd-vignette);
    display: grid;
    place-items: center;
    overflow: hidden;
}

.nac-screen__lcd::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--nac-lcd-gloss), transparent 55%);
    mix-blend-mode: soft-light;
    pointer-events: none;
}

.nac-screen__lcd::after {
    content: "";
    position: absolute;
    left: 9%;
    right: 9%;
    bottom: .28rem;
    height: .12rem;
    border-radius: .12rem;
    background: linear-gradient(90deg,
            transparent,
            color-mix(in oklab, var(--nac-lcd-scanline) 60%, black 40%),
            transparent);
    opacity: .28;
}

@supports not (color: color-mix(in oklab, #000, #fff)) {
    .nac-screen__lcd::after {
        background: linear-gradient(90deg, transparent, var(--nac-lcd-scanline), transparent);
    }
}

.nac-screen__lcd>span {
    font-size: clamp(.85rem, 1.4vw, 1.05rem);
    letter-spacing: .08em;
    color: var(--nac-lcd-fg, #111);
}

.nac-screen__lcd>canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.nac-screen__fkeys {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: .4rem;
    padding: 0 .75rem;
}

.fkey {
    position: relative;
    height: 1.1rem;
    border-radius: .25rem;
    background: linear-gradient(180deg, #f3f5f7, #e6eaef);
    border: 1px solid color-mix(in oklab, #000 12%, transparent);
    box-shadow:
        0 .12rem .25rem rgba(0, 0, 0, .25),
        inset 0 0 0 1px rgba(255, 255, 255, .6);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
}

.fkey .ico {
    display: inline-grid;
    place-items: center;
    line-height: 0;
    height: 100%;
    color: black;

}

.fkey .ico svg {
    width: 18px;
    height: 18px;
    color: black;
    opacity: .95;
    transform: translateY(-1px);
}

.fkey[data-kind="spectrogram"] {
    border-color: rgba(0, 0, 0, .18);
    background:
        linear-gradient(90deg,
            #00204d 0%,
            #0050a4 18%,
            #00a4ff 33%,
            #00e676 50%,
            #ffd54f 67%,
            #ff7043 82%,
            #b71c1c 100%);
    box-shadow:
        0 .12rem .25rem rgba(0, 0, 0, .25),
        inset 0 0 0 1px rgba(255, 255, 255, .25);
}

.fkey .heatmap-fill {
    width: 100%;
    height: 100%;
}

.fkey:active {
    transform: translate(.06rem, .12rem);
    box-shadow: inset .08rem .08rem .35rem rgba(0, 0, 0, .25);
}

.fkey.active,
.fkey:active {
    transform: translateY(1px);
    box-shadow:
        inset .08rem .08rem .35rem rgba(0, 0, 0, .25),
        0 0 0 rgba(0, 0, 0, 0);
}

.fkey:focus-visible {
    outline: none;
    box-shadow:
        0 0 0 3px hsl(var(--pt-accent, 276) 90% 60% / .35),
        inset 0 0 0 1px rgba(255, 255, 255, .7);
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
</style>

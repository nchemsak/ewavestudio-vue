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
    view: { type: String, default: 'scope' }, // 'text' | 'scope' | 'spec'
    activeKey: { type: Number, default: 1 }     // highlight which F-key is active
})

const lcdScope = ref(null)
const lcdSpec = ref(null)

defineExpose({
    scopeCanvas: lcdScope,
    specCanvas: lcdSpec,
})
</script>

<style scoped>
/* If you want the Cousine font, load it globally or:
@import url('https://fonts.googleapis.com/css2?family=Cousine:wght@400;700&display=swap');
*/

/* wrapper: scale everything by changing --screen-w */
.mpc-screen {
    --screen-w: 22rem;
    --bezel: #252525;
    --lcd: #b9bcba;
    --off-white: #f9f4ec;
    --mid-gray: #b7b9b6;

    width: var(--screen-w);
    display: grid;
    grid-template-rows: auto 2.2rem;
    gap: .6rem;
    user-select: none;
    font-family: Cousine, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}

/* bezel block */
.mpc-screen__bezel {
    background: var(--bezel);
    border-radius: .25rem;
    padding: 1rem;
    box-shadow: 0 0 1.2rem .12rem rgba(0, 0, 0, .25);
}

/* LCD window */
.mpc-screen__lcd {
    position: relative;
    background: var(--lcd);
    width: 60%;
    height: calc(var(--screen-w) * 0.27);
    margin: 0 auto;
    border-radius: .2rem;
    box-shadow:
        inset 0 0 0 1px rgba(0, 0, 0, .20),
        inset 0 0 .6rem rgba(0, 0, 0, .18);
    display: grid;
    place-items: center;
    overflow: hidden;
}

/* text readout */
.mpc-screen__lcd>span {
    font-size: clamp(.8rem, 1.4vw, 1rem);
    letter-spacing: .08em;
    color: #111;
}

/* canvas fills the LCD */
.mpc-screen__lcd>canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

/* function keys */
.mpc-screen__fkeys {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: .4rem;
    padding: 0 .75rem;
}

.fkey {
    height: .9rem;
    border-radius: .2rem;
    background: var(--off-white);
    border: 1px solid var(--mid-gray);
    box-shadow: .12rem .12rem rgba(130, 128, 128, .9);
    cursor: pointer;
}

.fkey:active {
    transform: translate(.06rem, .12rem);
    box-shadow: inset .08rem .08rem .35rem rgba(0, 0, 0, .25);
}
</style>

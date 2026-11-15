<!-- components/modules/PitchEnvModule.vue -->
<!-- Pitch envelope card ("Pitch"), in the Envelope / Filter row. Since PR 77 a screen that draws
     the sweep and can be dragged (ShapePad.vue), with mini knobs and the Random toggle beside
     it; `classic` is the card as it was, which the phone keeps: a short
     title, two knobs and a small Random toggle (labelled RND until PR 74, which could be read as "Round"; its VEL switch went in PR 67). Amount is one bipolar knob: right of
     centre the note starts above its pitch and drops into it (mode 'up'), left of centre it
     starts below and rises (mode 'down'). Random (mode 'random') gives each note its own offset
     within ±Amount. The saved settings stay `semitones` (0–48) and `mode`. -->
<template>
    <SectionWrap v-if="classic" id="pitch-env" title="Pitch" aria-label="Pitch envelope">
        <template #tools>
            <button type="button" class="pe-rnd hw-cap hw-cap-sm hw-led-left" :class="{ on: isRandom }" :aria-pressed="isRandom"
                :disabled="!enabled" aria-label="Random sweep"
                title="Random: each note starts at its own offset within ±Amount"
                @click="toggleRandom">Random</button>
        </template>

        <div class="pt-subblock">
            <div class="pt-knob-row">
                <div class="position-relative text-center">
                    <Knob v-model="signedAmount" bipolar label="Amount" size="small" :min="-AMOUNT_MAX" :max="AMOUNT_MAX"
                        :step="1" :value-text="amountText" :disabled="!enabled" :color="color"
                        @knobStart="knobStart('amt')" @knobEnd="knobEnd" />
                    <span v-if="activeKnob === 'amt'" class="custom-tooltip">{{ amountTip }}</span>
                </div>

                <div class="position-relative text-center">
                    <Knob v-model="decay" label="Decay" size="small" :min="5" :max="2000" :step="1" taper="log"
                        :value-text="`${Math.round(decay)} ms`" :disabled="!enabled" :color="color"
                        @knobStart="knobStart('decay')" @knobEnd="knobEnd" />
                    <span v-if="activeKnob === 'decay'" class="custom-tooltip">{{ Math.round(decay) }} ms</span>
                </div>
            </div>
        </div>
    </SectionWrap>

    <section v-else id="pitch-env" class="pt-card sp-card" aria-label="Pitch envelope">
        <div class="sp-body">
            <ShapePad :w="PAD_W" :h="PAD_H" title="Pitch" titleRight :readout="readout" :handles="handles" :active="grip"
                :disabled="!enabled" @start="onPadStart" @move="onPadMove" @end="knobEnd">
                <line x1="0" :x2="PAD_W" :y1="PAD_H / 2" :y2="PAD_H / 2" class="sp-axis" />
                <path v-for="(d, i) in shapes" :key="i" :d="d" class="sp-line" />
            </ShapePad>
            <div class="sp-minis">
                <div class="sp-mini">
                    <Knob midi-id="pitchEnv.amount" v-model="signedAmount" bipolar label="Amount" hideLabel size="mini" :min="-AMOUNT_MAX" :max="AMOUNT_MAX"
                        :step="1" :value-text="amountText" :disabled="!enabled" :color="color"
                        @knobStart="knobStart('amt')" @knobEnd="knobEnd" />
                    <span>Amount</span>
                </div>
                <div class="sp-mini">
                    <Knob midi-id="pitchEnv.decay" v-model="decay" label="Decay" hideLabel size="mini" :min="5" :max="2000" :step="1" taper="log"
                        :value-text="`${Math.round(decay)} ms`" :disabled="!enabled" :color="color"
                        @knobStart="knobStart('decay')" @knobEnd="knobEnd" />
                    <span>Decay</span>
                </div>
                <button type="button" class="sp-pill hw-cap hw-cap-sm hw-led-left" :class="{ on: isRandom }" :aria-pressed="isRandom"
                    :disabled="!enabled" aria-label="Random sweep"
                    title="Random: each note starts at its own offset within ±Amount"
                    @click="toggleRandom">Random</button>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Knob from '../Knob.vue'
import SectionWrap from '../SectionWrap.vue'
import ShapePad, { nearestHandle, type PadPoint } from '../ShapePad.vue'
import { PITCH_MAX_MS, pitchPts, pitchY, timeX, toPath, xTime, yPitch } from '../../lib/shapeViews'

type Mode = 'up' | 'down' | 'random'

const AMOUNT_MAX = 48

const props = withDefaults(defineProps<{
    enabled: boolean
    semitones: number
    decayMs: number
    mode: Mode
    color?: string
    classic?: boolean  // the card as it was (a title, two knobs), which the phone keeps
}>(), {
    color: '#3F51B5',
    classic: false,
})

const emit = defineEmits<{
    (e: 'update:semitones', v: number): void
    (e: 'update:decayMs', v: number): void
    (e: 'update:mode', v: Mode): void
    // A knob turned and let go: DrumSequencer shows the envelope view, the sweep on top (PR 70)
    (e: 'knob-start'): void
    (e: 'knob-end'): void
}>()

const activeKnob = ref<null | 'amt' | 'decay'>(null)
function knobStart(k: 'amt' | 'decay') {
    activeKnob.value = k
    emit('knob-start')
}
function knobEnd() {
    activeKnob.value = null
    emit('knob-end')
}
const isRandom = computed(() => props.mode === 'random')

// The knob's signed position. In random mode the sign has no meaning, so the knob keeps
// whichever side it was on, and turning Random off goes back to that direction.
const clampAmount = (v: number) => Math.max(0, Math.min(AMOUNT_MAX, Math.round(Math.abs(v))))
const signed = ref(props.mode === 'down' ? -clampAmount(props.semitones) : clampAmount(props.semitones))

// Follow settings set from outside (a project, undo)
watch(() => [props.semitones, props.mode] as const, ([s, m]) => {
    const n = clampAmount(s)
    if (m === 'down') signed.value = -n
    else if (m === 'up') signed.value = n
    else signed.value = signed.value < 0 ? -n : n
})

const signedAmount = computed<number>({
    get: () => signed.value,
    set: (v: number) => {
        const n = Math.max(-AMOUNT_MAX, Math.min(AMOUNT_MAX, Math.round(v)))
        signed.value = n
        if (!isRandom.value && n !== 0) {
            const dir: Mode = n < 0 ? 'down' : 'up'
            if (dir !== props.mode) emit('update:mode', dir)
        }
        if (Math.abs(n) !== props.semitones) emit('update:semitones', Math.abs(n))
    },
})

function toggleRandom() {
    emit('update:mode', isRandom.value ? (signed.value < 0 ? 'down' : 'up') : 'random')
}

const decay = computed<number>({
    get: () => props.decayMs,
    set: (v: number) => emit('update:decayMs', Math.max(5, Math.min(2000, Math.round(v)))),
})

const amountTip = computed(() => {
    const n = Math.abs(signed.value)
    if (n === 0) return 'Off'
    if (isRandom.value) return `±${n} st, random`
    return signed.value > 0 ? `+${n} st, drops` : `−${n} st, rises`
})
const amountText = computed(() => {
    const n = Math.abs(signed.value)
    if (n === 0) return 'off'
    if (isRandom.value) return `random, up to ${n} semitones`
    return signed.value > 0 ? `starts ${n} semitones above, drops into the note` : `starts ${n} semitones below, rises into the note`
})

// The screen: the sweep (both ways for Random), and its two grips: where it starts (up and
// down: Amount) and where it has settled (sideways: Decay)
const PAD_W = 130
const PAD_H = 88
const shapes = computed(() => {
    const n = Math.abs(signed.value)
    return (isRandom.value ? [n, -n] : [signed.value]).map((st) => toPath(pitchPts(st, props.decayMs, PAD_W, PAD_H)))
})
const handles = computed(() => [
    { id: 'amt', x: 8, y: pitchY(signed.value, PAD_H) },
    { id: 'decay', x: timeX(props.decayMs, PAD_W, PITCH_MAX_MS), y: PAD_H / 2 },
])
const readout = computed(() => {
    const n = Math.abs(signed.value)
    return `${isRandom.value ? '±' : signed.value < 0 ? '−' : '+'}${n} st · ${Math.round(props.decayMs)} ms`
})
const grip = ref('')
function onPadStart(p: PadPoint) {
    grip.value = nearestHandle(handles.value, p)
    knobStart(grip.value as 'amt' | 'decay')
}
function onPadMove(p: PadPoint) {
    if (grip.value === 'amt') signedAmount.value = yPitch(p.y, PAD_H)
    else decay.value = xTime(p.x, PAD_W, PITCH_MAX_MS)
}
</script>

<style scoped>
/* Room for the title and the pill on one line in a narrow card */
.pt-card :deep(.pt-subheader) {
    gap: 6px;
}

/* A toggle like the VEL switch beside it (PillSwitch.vue): a small cap with an LED */
.pe-rnd {
    --hw-led-size: 5px;
    flex: none;
    padding: 1px 5px 1px 4px;
    border-radius: 5px;
    border: 1px solid transparent;
    font: inherit;
    font-size: 9px;
    line-height: 1.4;
    letter-spacing: 0.06em;
}

.pe-rnd:disabled {
    cursor: default;
    opacity: 0.35;
}
</style>

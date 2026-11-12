<!-- components/modules/PitchEnvModule.vue -->
<!-- Pitch envelope card ("Pitch"), in the Envelope / Filter row: three narrow cards, so the
     title is short and the controls are two knobs and small VEL and RND pills. Amount is one bipolar knob: right of
     centre the note starts above its pitch and drops into it (mode 'up'), left of centre it
     starts below and rises (mode 'down'). RND (mode 'random') gives each note its own offset
     within ±Amount. The saved settings stay `semitones` (0–48) and `mode`. -->
<template>
    <SectionWrap id="pitch-env" title="Pitch" aria-label="Pitch envelope">
        <template #tools>
            <!-- The card's VEL switch (DrumSequencer passes it in) -->
            <slot name="vel" />
            <button type="button" class="pe-rnd hw-cap hw-cap-sm hw-led-left" :class="{ on: isRandom }" :aria-pressed="isRandom"
                :disabled="!enabled" aria-label="Random sweep"
                title="Random: each note starts at its own offset within ±Amount"
                @click="toggleRandom">RND</button>
        </template>

        <div class="pt-subblock">
            <div class="pt-knob-row">
                <div class="position-relative text-center">
                    <Knob midi-id="pitchEnv.amount" v-model="signedAmount" bipolar label="Amount" size="small" :min="-AMOUNT_MAX" :max="AMOUNT_MAX"
                        :step="1" :value-text="amountText" :disabled="!enabled" :color="color"
                        @knobStart="activeKnob = 'amt'" @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'amt'" class="custom-tooltip">{{ amountTip }}</span>
                </div>

                <div class="position-relative text-center">
                    <Knob midi-id="pitchEnv.decay" v-model="decay" label="Decay" size="small" :min="5" :max="2000" :step="1" taper="log"
                        :value-text="`${Math.round(decay)} ms`" :disabled="!enabled" :color="color"
                        @knobStart="activeKnob = 'decay'" @knobEnd="activeKnob = null" />
                    <span v-if="activeKnob === 'decay'" class="custom-tooltip">{{ Math.round(decay) }} ms</span>
                </div>
            </div>
        </div>
    </SectionWrap>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Knob from '../Knob.vue'
import SectionWrap from '../SectionWrap.vue'

type Mode = 'up' | 'down' | 'random'

const AMOUNT_MAX = 48

const props = withDefaults(defineProps<{
    enabled: boolean
    semitones: number
    decayMs: number
    mode: Mode
    color?: string
}>(), {
    color: '#3F51B5',
})

const emit = defineEmits<{
    (e: 'update:semitones', v: number): void
    (e: 'update:decayMs', v: number): void
    (e: 'update:mode', v: Mode): void
}>()

const activeKnob = ref<null | 'amt' | 'decay'>(null)
const isRandom = computed(() => props.mode === 'random')

// The knob's signed position. In random mode the sign has no meaning, so the knob keeps
// whichever side it was on, and turning RND off goes back to that direction.
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

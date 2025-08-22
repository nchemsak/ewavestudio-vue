<template>
    <KnobGroup v-model="enabledLocal" title="Noise" :color="color" :showToggle="showToggle">
        <div class="noise-row">
            <!-- type chips -->
            <div class="noise-chips" role="group" aria-label="Noise type">
                <button v-for="t in types" :key="t" type="button" class="pt-chip"
                    :class="{ 'is-active': enabledLocal && typeLocal === t }" @click="onSelectType(t)">
                    {{ label(t) }}
                </button>
            </div>

            <!-- amount knob -->
            <div class="noise-knob">
                <Knob v-model="amountLocal" label="Amount" :min="0" :max="1" :step="0.01" size="small" :color="color"
                    :disabled="!enabledLocal" @knobStart="activeKnob = 'noiseAmount'" @knobEnd="activeKnob = null" />
                <span v-if="activeKnob === 'noiseAmount'" class="custom-tooltip">
                    {{ Math.round(amountLocal * 100) }}%
                </span>
            </div>
        </div>
    </KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Knob from '../Knob.vue'
import KnobGroup from '../KnobGroup.vue'

type NoiseType = 'white' | 'pink' | 'brown'

const props = withDefaults(defineProps<{
    enabled: boolean
    type: NoiseType
    amount: number
    color?: string
    showToggle?: boolean
}>(), {
    enabled: false,
    type: 'white',
    amount: 0.25,
    color: '#9C27B0',
    showToggle: true   // default to visible toggle
})

const emit = defineEmits<{
    (e: 'update:enabled', v: boolean): void
    (e: 'update:type', v: NoiseType): void
    (e: 'update:amount', v: number): void
}>()

const enabledLocal = ref(props.enabled)
const typeLocal = ref<NoiseType>(props.type)
const amountLocal = ref(props.amount)

watch(() => props.enabled, v => (enabledLocal.value = v))
watch(() => props.type, v => (typeLocal.value = v))
watch(() => props.amount, v => (amountLocal.value = v))

watch(enabledLocal, v => emit('update:enabled', v))
watch(typeLocal, v => emit('update:type', v))
watch(amountLocal, v => emit('update:amount', Math.max(0, Math.min(1, v))))

const types: NoiseType[] = ['white', 'pink', 'brown']
const label = (t: NoiseType) => t.charAt(0).toUpperCase() + t.slice(1)

function onSelectType(t: NoiseType) {
    if (!enabledLocal.value) enabledLocal.value = true; // smart enable
    typeLocal.value = t;
}

const activeKnob = ref<null | 'noiseAmount'>(null)
</script>

<style scoped>
.noise-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: var(--pt-gap);
}

.noise-chips {
    display: flex;
    gap: 8px;
    flex-wrap: nowrap;
}

@media (max-width: 560px) {
    .noise-row {
        grid-template-columns: 1fr;
    }

    .noise-chips {
        flex-wrap: wrap;
    }

    .noise-knob {
        margin-top: 6px;
    }
}
</style>

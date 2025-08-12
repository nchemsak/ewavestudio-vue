<template>
    <KnobGroup v-model="enabledLocal" title="Noise" :color="color" :showToggle="showToggle">
        <template #header-content>
            <div class="noise-dot-wrap d-flex justify-content-center gap-2 ms-2">
                <span v-for="type in types" :key="type" class="noise-dot"
                    :class="[type, { selected: typeLocal === type, disabled: !enabledLocal }]"
                    @click="enabledLocal && setType(type)">
                    <span class="selector-tooltip">{{ label(type) }} Noise</span>
                </span>
            </div>
        </template>

        <div class="position-relative text-center mt-2">
            <Knob v-model="amountLocal" label="Amount" :min="0" :max="1" :step="0.01" size="medium" :color="color"
                :disabled="!enabledLocal" @knobStart="activeKnob = 'noiseAmount'" @knobEnd="activeKnob = null" />
            <span v-if="activeKnob === 'noiseAmount'" class="custom-tooltip">
                {{ Math.round(amountLocal * 100) }}%
            </span>
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
    showToggle: false
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
const setType = (t: NoiseType) => { typeLocal.value = t }

const activeKnob = ref<null | 'noiseAmount'>(null)
</script>

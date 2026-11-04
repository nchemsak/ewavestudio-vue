<template>
    <!-- "MIDI Controller": an Enable MIDI button, then a list of the connected MIDI inputs -->
    <div class="midi-toolbar">
        <label class="midi-label" for="midi-input-select">MIDI Controller</label>

        <button v-if="!midi.initialized" type="button" class="pt-btn pt-btn-sm" @click="midi.enable()">
            {{ midi.initInProgress ? 'Enabling…' : 'Enable MIDI' }}
        </button>

        <template v-else>
            <select id="midi-input-select" class="pt-select pt-select-sm" v-model="selectedId">
                <option value="">None</option>
                <option v-for="m in midi.inputs" :key="m.id" :value="m.id">
                    {{ m.name }}
                </option>
            </select>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MidiInput } from '../composables/useMidiInput'

// The state and actions come from useMidiInput(), which DrumSequencer owns
const props = defineProps<{ midi: MidiInput }>()

const selectedId = computed({
    get: () => props.midi.selectedId,
    set: (id: string) => props.midi.select(id),
})
</script>

<style scoped>
.midi-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
}

.midi-toolbar>.pt-btn-sm,
.midi-toolbar>.pt-select-sm {
    flex: 0 0 160px;
    max-width: 160px;
}

.midi-toolbar>.pt-select-sm {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.midi-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
    opacity: 0.8;

    white-space: nowrap;
    flex-shrink: 0;
    text-align: right;
}

.midi-led {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #3a3a4d;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.7);
}

.midi-led.on {
    background: #4caf50;
    box-shadow: 0 0 8px rgba(76, 175, 80, 0.9);
}

@media (max-width: 720px) {
    .midi-label {
        display: none;
    }
}

/* DrumSequencer.vue gives its buttons this padding on wide screens; the Enable MIDI button got
   it too while it lived there */
@media (min-width: 1280px) {
    .pt-btn {
        padding: 4px 8px;
        line-height: 1.1;
    }
}
</style>

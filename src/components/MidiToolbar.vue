<template>
    <!-- "MIDI Controller": an Enable MIDI button, then a list of the connected MIDI inputs and
         the Learn button (MIDI learn, src/composables/useMidiLearn.ts), whose bar sits at the
         bottom of the screen while it's on -->
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
            <button type="button" class="pt-btn pt-btn-sm midi-learn-btn" :class="{ 'is-active': learn.state.learning }"
                :aria-pressed="learn.state.learning" :disabled="!midi.selectedId && !learn.state.learning"
                :title="midi.selectedId ? 'MIDI learn: link your controller\'s knobs to the knobs here' : 'Choose your controller in the list first'"
                @click="toggleLearn">Learn</button>
        </template>

        <teleport to="body">
            <div v-if="learn.state.learning" class="midi-learn-bar" role="region" aria-label="MIDI learn">
                <strong class="midi-learn-title">MIDI learn</strong>
                <span class="midi-learn-msg" aria-live="polite">{{ learn.state.message }}</span>
                <button v-if="linkCount" type="button" class="pt-btn pt-btn-sm" @click="learn.clearAll()">Clear all</button>
                <button type="button" class="pt-btn pt-btn-sm midi-learn-done" @click="learn.stop()">Done</button>
            </div>
            <!-- Room under the page, so its last knobs can scroll clear of the bar -->
            <div v-if="learn.state.learning" class="midi-learn-spacer" aria-hidden="true"></div>
        </teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import type { MidiInput } from '../composables/useMidiInput'
import { useMidiLearn } from '../composables/useMidiLearn'

// The state and actions come from useMidiInput(), which DrumSequencer owns
const props = defineProps<{ midi: MidiInput }>()

const selectedId = computed({
    get: () => props.midi.selectedId,
    set: (id: string) => props.midi.select(id),
})

const learn = useMidiLearn()
const linkCount = computed(() => Object.keys(learn.state.mappings).length)

function toggleLearn() {
    if (learn.state.learning) learn.stop()
    else learn.start()
}

// Escape ends learn mode (capture, so it doesn't also close a menu behind it)
function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    learn.stop()
}
watch(() => learn.state.learning, (on) => {
    if (on) window.addEventListener('keydown', onKeydown, true)
    else window.removeEventListener('keydown', onKeydown, true)
})
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, true)
    learn.stop()
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

.midi-toolbar>.midi-learn-btn {
    flex: 0 0 auto;
    max-width: none;
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

/* On Sand's warm grey page the caption needs its full ink */
.theme-sand .midi-label {
    opacity: 1;
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

/* While learning: a bar at the bottom of the screen, above the page, below dialogs */
.midi-learn-bar {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    z-index: 1050;
    display: flex;
    align-items: center;
    gap: 10px;
    width: max-content;
    max-width: calc(100vw - 32px);
    padding: 8px 10px 8px 14px;
    border: 1px solid transparent;
    border-radius: var(--pt-radius-sm);
    background:
        linear-gradient(145deg, var(--pt-panel), var(--pt-surface-2)) padding-box,
        linear-gradient(90deg, hsl(var(--pt-accent) 84% 64% / 0.95), hsl(calc(var(--pt-accent) + 10) 84% 64% / 0.95)) border-box;
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.45);
    color: var(--pt-text);
    font-size: 0.85rem;
}

.midi-learn-spacer {
    height: 80px;
}

.midi-learn-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--pt-text-strong);
    white-space: nowrap;
}

.midi-learn-msg {
    min-width: 0;
}

.midi-learn-bar .pt-btn {
    flex: 0 0 auto;
    white-space: nowrap;
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

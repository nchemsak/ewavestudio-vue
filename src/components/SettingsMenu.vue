<!-- src/components/SettingsMenu.vue -->
<!-- The top bar's gear (PR 92, option A of three mockups): it opens Theme and MIDI, which were in
     a row above the frame. An LED on the gear shows a MIDI controller is chosen. Under 576 px,
     where the logo (the link back to the main site) is hidden, the panel has that link instead.
     The panel stays mounted while closed (v-show): MidiToolbar ends MIDI learn when it's
     unmounted, and learn mode closes the panel so the knobs can be clicked. -->
<template>
    <div class="sm" ref="wrap">
        <button type="button" class="sm-btn hw-cap" :class="{ 'hw-down': open }" aria-label="Settings"
            title="Theme and MIDI" aria-haspopup="dialog" :aria-expanded="open ? 'true' : 'false'" @click="open = !open">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
            </svg>
            <span v-if="midi?.selectedId" class="sm-dot" aria-hidden="true"></span>
        </button>

        <div v-show="open" class="sm-panel" role="dialog" aria-label="Settings">
            <div class="sm-cap">Theme</div>
            <ThemeToggle />
            <div class="sm-rule"></div>
            <MidiToolbar v-if="midi?.supported" :midi="midi" />
            <template v-else>
                <div class="sm-cap">MIDI Controller</div>
                <div class="sm-note">This browser has no Web MIDI (Chrome and Edge have it).</div>
            </template>
            <div class="sm-home">
                <div class="sm-rule"></div>
                <a class="sm-link" href="/" :target="pwa.state.standalone ? '_blank' : undefined"
                    :rel="pwa.state.standalone ? 'noopener' : undefined">Return to Ephemeral Wave</a>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import ThemeToggle from './ThemeToggle.vue';
import MidiToolbar from './MidiToolbar.vue';
import type { MidiInput } from '../composables/useMidiInput';
import { useMidiLearn } from '../composables/useMidiLearn';
import { usePwa } from '../composables/usePwa';

defineProps<{ midi?: MidiInput }>();

const pwa = usePwa();
const open = ref(false);
const wrap = ref<HTMLElement | null>(null);

// Learn mode works on the knobs under the panel: close it
const learn = useMidiLearn();
watch(() => learn.state.learning, (on) => { if (on) open.value = false; });

// A click outside or Esc closes it
function onDown(e: Event) {
    if (open.value && wrap.value && !wrap.value.contains(e.target as Node)) open.value = false;
}
function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open.value) open.value = false;
}
onMounted(() => {
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
});
onUnmounted(() => {
    document.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.sm {
    position: relative;
    display: inline-flex;
}

/* A cap (_hardware.scss), as tall as Undo and Redo */
.sm-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: .35rem .45rem;
    border-radius: .5rem;
    border: 1px solid transparent;
}

.sm-btn svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}

/* A controller is chosen: the LEDs' colour */
.sm-dot {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--hw-led, #7dffb2);
    box-shadow: 0 0 6px var(--hw-led, #7dffb2);
}

.sm-panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 1001;
    width: 268px;
    max-width: calc(100vw - 24px);
    padding: 12px;
    border: 1px solid var(--pt-hairline, #2b2f3b);
    border-radius: .5rem;
    background: var(--pt-panel, #171a21);
    color: var(--pt-text);
    box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
    text-align: left;
}

/* Captions: Theme, and MidiToolbar's "MIDI Controller" (which it hides in narrow windows when
   it stands in a row; here it has a line of its own) */
.sm-cap,
.sm-panel :deep(.midi-label) {
    display: block;
    flex: 0 0 100%;
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .1em;
    text-transform: uppercase;
    text-align: left;
    color: var(--pt-menu-caption, #c7cee0);
    opacity: 1;
}

.sm-panel :deep(.pt-btn-group) {
    display: flex;
    gap: 6px;
}

.sm-panel :deep(.pt-btn-group .pt-btn) {
    flex: 1 1 0;
}

.sm-panel :deep(.midi-toolbar) {
    flex-wrap: wrap;
    gap: 0 8px;
}

.sm-panel :deep(.midi-toolbar > .pt-btn-sm),
.sm-panel :deep(.midi-toolbar > .pt-select-sm) {
    flex: 1 1 0;
    max-width: none;
    min-width: 0;
}

.sm-panel :deep(.midi-toolbar > .midi-learn-btn) {
    flex: 0 0 auto;
}

.sm-rule {
    height: 1px;
    margin: 12px -12px;
    background: var(--pt-hairline, #2b2f3b);
}

.sm-note {
    font-size: .8rem;
    opacity: .8;
}

/* The link back to the main site: only where the logo is hidden */
.sm-home {
    display: none;
}

.sm-link {
    color: var(--pt-text);
    font-size: .85rem;
}

@media (max-width: 575.98px) {
    .sm-home {
        display: block;
    }

    .sm-panel {
        right: -8px;
    }

    .sm-btn {
        padding: .3rem .35rem;
    }
}
</style>

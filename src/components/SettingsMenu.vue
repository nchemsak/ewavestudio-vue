<!-- MOCKUP (plan item 1): the top bar's settings button and its panel.
     kind="gear": a gear that opens Theme, MIDI and the link back to the main site.
     kind="midi": a MIDI cap with an LED (lit once a controller is chosen) that opens MIDI only.
     The panel stays mounted while closed (v-show): MidiToolbar ends MIDI learn when unmounted. -->
<template>
    <div class="sm" ref="wrap">
        <button v-if="kind === 'gear'" type="button" class="sm-btn hw-cap" :class="{ 'hw-down': open }"
            aria-label="Settings" title="Settings: theme, MIDI" aria-haspopup="dialog" :aria-expanded="open" @click="open = !open">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
            </svg>
            <span v-if="midi?.selectedId" class="sm-dot" aria-hidden="true"></span>
        </button>
        <button v-else type="button" class="sm-btn sm-midi hw-cap hw-led-left" :class="{ 'hw-down': open, on: !!midi?.selectedId }"
            title="MIDI controller" aria-haspopup="dialog" :aria-expanded="open" @click="open = !open">MIDI</button>

        <div v-show="open" class="sm-panel" :class="`sm-${align}`" role="dialog" :aria-label="kind === 'gear' ? 'Settings' : 'MIDI'">
            <template v-if="kind === 'gear'">
                <div class="sm-cap">Theme</div>
                <ThemeToggle />
                <div class="sm-rule"></div>
            </template>
            <div class="sm-midi-box">
                <MidiToolbar v-if="midi?.supported" :midi="midi" />
                <template v-else>
                    <div class="sm-cap">MIDI Controller</div>
                    <div class="sm-note">This browser has no Web MIDI (Chrome and Edge do).</div>
                </template>
            </div>
            <template v-if="kind === 'gear'">
                <div class="sm-rule"></div>
                <a class="sm-link" href="/">Ephemeral Wave ↗<span>the main site</span></a>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import ThemeToggle from './ThemeToggle.vue';
import MidiToolbar from './MidiToolbar.vue';
import { useMidiLearn } from '../composables/useMidiLearn';

withDefaults(defineProps<{ midi?: any; kind?: 'gear' | 'midi'; align?: 'left' | 'right' }>(), { kind: 'gear', align: 'right' });

const open = ref(false);
const wrap = ref<HTMLElement | null>(null);

// Learn mode needs the panel: close, so the knobs can be clicked
const learn = useMidiLearn();
watch(() => learn.state.learning, (on) => { if (on) open.value = false; });

function onDown(e: Event) {
    if (open.value && wrap.value && !wrap.value.contains(e.target as Node)) open.value = false;
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') open.value = false; }
onMounted(() => { document.addEventListener('pointerdown', onDown, true); window.addEventListener('keydown', onKey); });
onUnmounted(() => { document.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey); });
</script>

<style scoped>
.sm {
    position: relative;
    display: inline-flex;
}

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

.sm-midi {
    font-size: .8rem;
    letter-spacing: .08em;
    padding: .35rem .6rem .35rem 1.35rem;
}

/* A controller is chosen: a small LED on the gear */
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
    z-index: 1001;
    width: 268px;
    padding: 12px;
    border: 1px solid var(--pt-hairline, #2b2f3b);
    border-radius: .5rem;
    background: var(--pt-panel, #171a21);
    color: var(--pt-text);
    box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
    text-align: left;
}

.sm-right { right: 0; }
.sm-left { left: 0; }

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

.sm-link {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    color: var(--pt-text);
    text-decoration: none;
    font-size: .85rem;
}

.sm-link span {
    font-size: .72rem;
    opacity: .65;
}

.sm-link:hover {
    text-decoration: underline;
}

@media (max-width: 575.98px) {
    .sm-right { right: -8px; }
}
</style>

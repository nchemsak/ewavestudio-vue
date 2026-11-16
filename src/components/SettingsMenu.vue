<!-- components/SettingsMenu.vue -->
<!-- MOCKUP (src/lib/gearMock.ts): the gear at the top bar's right end, which opens Theme and
     MIDI (they sat in a row above the frame). Three designs to pick from:
     a: a small panel dropping from the gear, like the File menu;
     b: a drawer from the right, the themes as preview tiles;
     c: a strip that slides out under the top bar, everything on one line. -->
<template>
    <div class="gm" :class="`gm-${variant}`" ref="root">
        <button type="button" class="gm-gear hw-cap" :class="{ 'hw-down': open }" :aria-expanded="open ? 'true' : 'false'"
            aria-haspopup="dialog" aria-label="Settings: theme and MIDI" title="Theme and MIDI" @click="open = !open">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z" />
                <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.4Z" />
            </svg>
        </button>

        <!-- a: a panel under the gear -->
        <div v-if="variant === 'a'" v-show="open" class="gm-pop" role="dialog" aria-label="Theme and MIDI">
            <section>
                <h3 class="gm-cap">Theme</h3>
                <ThemeToggle />
            </section>
            <section>
                <h3 class="gm-cap">MIDI controller</h3>
                <MidiToolbar v-if="midi?.supported" :midi="midi" />
                <p v-else class="gm-note">This browser has no Web MIDI (Chrome and Edge have it).</p>
            </section>
        </div>

        <!-- b: a drawer from the right, over a dimmed page -->
        <Teleport v-if="variant === 'b'" to="body">
            <div v-show="open" class="gm-scrim" @click="open = false"></div>
            <aside v-show="open" class="gm-drawer" role="dialog" aria-label="Theme and MIDI">
                <header class="gm-drawer-head">
                    <span>Settings</span>
                    <button type="button" class="gm-x" aria-label="Close" @click="open = false">✕</button>
                </header>
                <h3 class="gm-cap">Theme</h3>
                <div class="gm-swatches" role="group" aria-label="Theme">
                    <button v-for="t in SWATCHES" :key="t.id" type="button" class="gm-swatch"
                        :class="{ on: theme === t.id }" :aria-pressed="theme === t.id" @click="setTheme(t.id)">
                        <span class="gm-swatch-art" :style="{ background: t.page }" aria-hidden="true">
                            <span class="gm-swatch-panel" :style="{ background: t.panel }">
                                <span class="gm-swatch-screen" :style="{ background: t.screen, color: t.ink }">~</span>
                                <span class="gm-swatch-knob" :style="{ borderColor: t.accent }"></span>
                            </span>
                        </span>
                        <span class="gm-swatch-name">{{ t.label }}</span>
                    </button>
                </div>
                <h3 class="gm-cap">MIDI controller</h3>
                <p class="gm-note">Play the synth from a MIDI keyboard, and turn its knobs from a controller's (Learn).</p>
                <MidiToolbar v-if="midi?.supported" :midi="midi" />
                <p v-else class="gm-note">This browser has no Web MIDI (Chrome and Edge have it).</p>
            </aside>
        </Teleport>

        <!-- c: a strip under the top bar, over the panel (nothing moves) -->
        <div v-if="variant === 'c'" v-show="open" class="gm-strip" :style="stripStyle" role="dialog" aria-label="Theme and MIDI">
            <span class="gm-cap">Theme</span>
            <ThemeToggle />
            <span class="gm-sep" aria-hidden="true"></span>
            <MidiToolbar v-if="midi?.supported" :midi="midi" />
            <p v-else class="gm-note">This browser has no Web MIDI.</p>
            <button type="button" class="pt-btn pt-btn-sm gm-done" @click="open = false">Done</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import ThemeToggle from './ThemeToggle.vue';
import MidiToolbar from './MidiToolbar.vue';
import { useTheme, type ThemeName } from '../composables/useTheme';
import type { MidiInput } from '../composables/useMidiInput';
import type { GearMock } from '../lib/gearMock';

defineProps<{ variant: GearMock; midi: MidiInput | null }>();

const { theme, setTheme } = useTheme();
const open = ref(false);
// c: the strip spans the top bar, just under it (in the gear's own coordinates)
const stripStyle = ref<Record<string, string>>({});
watch(open, (on) => {
    if (!on || !root.value) return;
    const bar = root.value.closest('.ds-topbar') as HTMLElement | null;
    if (!bar) return;
    const b = bar.getBoundingClientRect(), g = root.value.getBoundingClientRect();
    stripStyle.value = {
        top: `${b.bottom - g.top - 4}px`,
        right: `${g.right - b.right + 14}px`,
        width: `${b.width - 28}px`,
    };
});
const root = ref<HTMLElement | null>(null);

// Each theme drawn small: its page, panel, screen and accent
const SWATCHES: { id: ThemeName; label: string; page: string; panel: string; screen: string; ink: string; accent: string }[] = [
    { id: 'synthwave', label: 'Synthwave', page: 'radial-gradient(circle, #c58ac8, #7b5aa6)', panel: '#160b2e', screen: '#2a0f52', ink: '#f3c6ff', accent: 'hsl(305 80% 62%)' },
    { id: 'dark', label: 'Dark', page: 'radial-gradient(circle, #23252c, #0b0c0f)', panel: '#171a21', screen: '#0f141b', ink: '#9fe7ff', accent: 'hsl(276 80% 62%)' },
    { id: 'analog', label: 'Analog', page: 'radial-gradient(circle, #6b4b34, #2e1f15)', panel: '#1d1b18', screen: '#1a1208', ink: '#ffb547', accent: 'hsl(30 80% 56%)' },
];

// A click elsewhere or Esc closes it (the drawer's scrim takes its own clicks)
function onDown(e: PointerEvent) {
    const t = e.target as HTMLElement;
    if (root.value?.contains(t) || t.closest('.gm-drawer, .midi-learn-bar')) return;
    open.value = false;
}
function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open.value = false;
}
watch(open, (on) => {
    if (on) {
        window.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey);
    } else {
        window.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('keydown', onKey);
    }
});
onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.gm {
    position: relative;
    display: flex;
    align-items: center;
}

.gm-gear {
    width: 36px;
    height: 34px;
    padding: 0;
    border-radius: 8px;
    border: 1px solid transparent;
    display: grid;
    place-items: center;
}

.gm-gear svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linejoin: round;
}

.gm-cap {
    margin: 0;
    font: 700 10px/1.2 ui-monospace, Menlo, Consolas, monospace;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: var(--pt-muted);
}

.gm-note {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--pt-muted);
}

/* The MIDI toolbar's own caption: the section names it */
.gm :deep(.midi-label),
.gm-drawer :deep(.midi-label) {
    display: none;
}

/* a: a panel under the gear, like the File menu */
.gm-pop {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    z-index: 1200;
    width: 300px;
    display: grid;
    gap: 14px;
    padding: 14px;
    border-radius: 12px;
    background: var(--pt-panel);
    border: 1px solid var(--pt-hairline);
    box-shadow: 0 14px 34px rgba(0, 0, 0, .55);
}

.gm-pop section {
    display: grid;
    gap: 8px;
}

/* c: a strip under the top bar, over the panel, the bar's width */
.gm-strip {
    position: absolute;
    z-index: 1200;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 0 0 12px 12px;
    background: var(--pt-panel);
    border: 1px solid var(--pt-hairline);
    border-top: 2px solid hsl(var(--pt-accent) 80% 60% / .7);
    box-shadow: 0 14px 30px rgba(0, 0, 0, .5);
}

.gm-sep {
    width: 1px;
    align-self: stretch;
    background: var(--pt-hairline);
}

.gm-done {
    margin-left: 4px;
}
</style>

<style>
/* b: the drawer (teleported to <body>, so not scoped) */
.gm-scrim {
    position: fixed;
    inset: 0;
    z-index: 2600;
    background: rgba(0, 0, 0, .45);
}

.gm-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 2601;
    width: 320px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px;
    background: var(--pt-panel);
    border-left: 1px solid var(--pt-hairline);
    box-shadow: -18px 0 40px rgba(0, 0, 0, .5);
    color: var(--pt-text);
}

.gm-drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font: 700 16px/1 ui-monospace, Menlo, Consolas, monospace;
    margin-bottom: 6px;
}

.gm-x {
    border: 0;
    background: none;
    color: var(--pt-muted);
    font-size: 18px;
    cursor: pointer;
}

.gm-swatches {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
}

.gm-swatch {
    display: grid;
    gap: 6px;
    padding: 6px;
    border-radius: 10px;
    border: 1px solid var(--pt-hairline);
    background: transparent;
    color: var(--pt-text);
    cursor: pointer;
    font: 600 11px/1 ui-monospace, Menlo, Consolas, monospace;
}

.gm-swatch.on {
    border-color: hsl(var(--pt-accent) 80% 62%);
    box-shadow: 0 0 0 2px hsl(var(--pt-accent) 80% 62% / .45);
}

.gm-swatch-art {
    display: grid;
    place-items: center;
    height: 58px;
    border-radius: 7px;
}

.gm-swatch-panel {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    border-radius: 5px;
}

.gm-swatch-screen {
    width: 30px;
    height: 20px;
    border-radius: 3px;
    display: grid;
    place-items: center;
    font: 700 13px/1 monospace;
}

.gm-swatch-knob {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 3px solid;
    background: #111;
}

.gm-drawer .midi-toolbar {
    flex-wrap: wrap;
}
</style>

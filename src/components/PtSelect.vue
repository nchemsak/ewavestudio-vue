<template>
    <div class="pt-selectbox" ref="root" @keydown="onKeyDownRoot">
        <!-- Trigger -->
        <button ref="buttonEl" type="button" class="pt-selectbtn" :aria-label="ariaLabel" aria-haspopup="listbox"
            :aria-expanded="open ? 'true' : 'false'" @click="toggle">
            <span class="pt-select-value">{{ selectedLabel }}</span>
            <svg class="pt-caret" viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        </button>

        <!-- Popover -->
        <teleport to="body">
            <div v-if="open" class="pt-select-overlay" @pointerdown.self="close">
                <ul ref="listEl" class="pt-menu" role="listbox" :style="menuStyle"
                    :aria-activedescendant="optionId(activeIndex)" @keydown="onKeyDownList">
                    <li v-for="(opt, i) in options" :key="String(opt.value)" :id="optionId(i)" role="option"
                        :aria-selected="i === currentIndex" :class="['pt-option', {
                            'is-active': i === activeIndex,
                            'is-selected': i === currentIndex,
                            'is-disabled': !!opt.disabled
                        }]" @mousedown.prevent="!opt.disabled && selectIndex(i)"
                        @mousemove="!opt.disabled && (activeIndex = i)">
                        {{ opt.label }}
                    </li>
                </ul>
            </div>
        </teleport>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';

type Opt = { label: string; value: string | number; disabled?: boolean };

const props = defineProps<{
    modelValue: string | number;
    options: Opt[];
    ariaLabel?: string;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string | number): void }>();

const root = ref<HTMLElement | null>(null);
const buttonEl = ref<HTMLButtonElement | null>(null);
const listEl = ref<HTMLUListElement | null>(null);

const open = ref(false);
const activeIndex = ref(0);
const currentIndex = computed(() => props.options.findIndex(o => o.value === props.modelValue));

watch(() => props.modelValue, () => {
    const idx = currentIndex.value;
    if (idx >= 0) activeIndex.value = idx;
});

const selectedLabel = computed(() => {
    const found = props.options.find(o => o.value === props.modelValue);
    return found ? found.label : '';
});

function optionId(i: number) {
    return `pt-opt-${Math.abs(hash)}-${i}`;
}
const hash = Math.floor(Math.random() * 1e6);

const menuStyle = ref<Record<string, string>>({});

function updateMenuPosition() {
    const btn = buttonEl.value!;
    const rect = btn.getBoundingClientRect();
    const gap = 6;

    // Viewport coords for position: fixed
    let top = rect.bottom + gap;
    let left = rect.left;
    const minWidth = rect.width;

    menuStyle.value = {
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        minWidth: `${minWidth}px`,
    };

    nextTick(() => {
        const el = listEl.value;
        if (!el) return;

        const menuH = el.offsetHeight;
        const menuW = el.offsetWidth;

        // If it would overflow the bottom of the viewport, open above
        const viewportBottom = window.innerHeight - 8;
        if (top + menuH > viewportBottom) {
            top = rect.top - gap - menuH;
            if (top < 8) top = 8; // clamp
            menuStyle.value.top = `${top}px`;
        }

        // Clamp horizontally too
        const vw = window.innerWidth;
        if (left + menuW > vw - 8) left = Math.max(8, vw - 8 - menuW);
        menuStyle.value.left = `${left}px`;
    });
}


function openMenu() {
    if (open.value) return;
    open.value = true;
    // sync active index to current selection
    const idx = currentIndex.value;
    activeIndex.value = idx >= 0 ? idx : 0;
    updateMenuPosition();
    nextTick(() => listEl.value?.focus({ preventScroll: true }));
}

function close() {
    if (!open.value) return;
    open.value = false;
    nextTick(() => buttonEl.value?.focus({ preventScroll: true }));
}

function toggle() { open.value ? close() : openMenu(); }

function selectIndex(i: number) {
    const opt = props.options[i];
    if (!opt || opt.disabled) return;
    emit('update:modelValue', opt.value);
    close();
}

/* Keyboard: button */
function onKeyDownRoot(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
    }
}

/* Keyboard: listbox */
let typeBuffer = '';
let typeTimer: number | null = null;

function onKeyDownList(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectIndex(activeIndex.value); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
    if (e.key === 'Home') { e.preventDefault(); activeIndex.value = 0; return; }
    if (e.key === 'End') { e.preventDefault(); activeIndex.value = props.options.length - 1; return; }

    // typeahead
    const ch = e.key.length === 1 ? e.key : '';
    if (ch) {
        typeBuffer += ch.toLowerCase();
        if (typeTimer) window.clearTimeout(typeTimer);
        typeTimer = window.setTimeout(() => (typeBuffer = ''), 500);
        const i = props.options.findIndex(o => o.label.toLowerCase().startsWith(typeBuffer) && !o.disabled);
        if (i >= 0) activeIndex.value = i;
    }
}

function move(delta: number) {
    const n = props.options.length;
    let i = activeIndex.value;
    for (let step = 0; step < n; step++) {
        i = (i + delta + n) % n;
        if (!props.options[i].disabled) { activeIndex.value = i; break; }
    }
}

function onWindowResizeScroll() { if (open.value) updateMenuPosition(); }
onMounted(() => {
    window.addEventListener('scroll', onWindowResizeScroll, true);
    window.addEventListener('resize', onWindowResizeScroll);
});
onBeforeUnmount(() => {
    window.removeEventListener('scroll', onWindowResizeScroll, true);
    window.removeEventListener('resize', onWindowResizeScroll);
});
</script>

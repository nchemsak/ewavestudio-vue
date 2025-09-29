<template>
    <section class="pt-card collapsible" :class="{ 'is-collapsed': !open }">
        <div class="pt-subheader">
            <button class="pt-collapse-btn" type="button" :id="btnId" :aria-controls="panelId"
                :aria-expanded="String(open)" @click="open = !open" @keydown.space.prevent="open = !open"
                @keydown.enter.prevent="open = !open">
                <!-- <svg class="chev" :class="{ open }" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                        d="M8.12 9.29a1 1 0 0 1 1.41 0L12 11.76l2.47-2.47a1 1 0 1 1 1.41 1.41l-3.18 3.18a1 1 0 0 1-1.41 0L8.12 10.7a1 1 0 0 1 0-1.41z" />
                </svg> -->
                <h2 class="pt-title">{{ title }}</h2>
            </button>

            <div class="pt-header-tools">
                <slot name="tools" />
            </div>
        </div>

        <transition @enter="onEnter" @after-enter="onAfterEnter" @leave="onLeave" @after-leave="onAfterLeave">
            <div v-show="open" class="pt-collapse-body" :id="panelId" :aria-labelledby="btnId" role="region"
                ref="bodyEl">
                <slot />
            </div>
        </transition>
    </section>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';

const props = withDefaults(defineProps<{
    id: string;            // unique per section (used for localStorage + aria ids)
    title: string;
    remember?: boolean;    // persist state
    defaultOpen?: boolean; // used when no saved state
    modelValue?: boolean;  // optional v-model if you want external control
}>(), {
    remember: true,
    defaultOpen: true
});

const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const storageKey = computed(() => `collapse:${props.id}`);
const saved = props.remember ? localStorage.getItem(storageKey.value) : null;

const open = ref<boolean>(
    props.modelValue ??
    (saved !== null ? saved !== 'false' : props.defaultOpen)
);

watch(open, v => {
    if (props.remember) localStorage.setItem(storageKey.value, String(v));
    emit('update:modelValue', v);
});

watch(
    () => props.modelValue,
    (v) => {
        // only sync when parent provides a boolean, and avoid needless loops
        if (typeof v === 'boolean' && v !== open.value) {
            open.value = v;
        }
    }
);

const panelId = computed(() => `${props.id}-panel`);
const btnId = computed(() => `${props.id}-button`);

const bodyEl = ref<HTMLElement | null>(null);

// Smooth height animation
function onEnter(el: HTMLElement) {
    el.style.height = '0px';
    // force reflow
    void el.offsetHeight;
    el.style.height = `${el.scrollHeight}px`;
}
function onAfterEnter(el: HTMLElement) {
    el.style.height = 'auto';
}
function onLeave(el: HTMLElement) {
    el.style.height = `${el.scrollHeight}px`;
    // force reflow
    void el.offsetHeight;
    el.style.height = '0px';
}
function onAfterLeave(el: HTMLElement) {
    el.style.height = '';
}

onMounted(() => {
    if (open.value && bodyEl.value) bodyEl.value.style.height = 'auto';
});
</script>

<style scoped>
.collapsible .pt-subheader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .75rem;
}

.pt-collapse-btn {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: .5rem;
    cursor: pointer;
}

.pt-collapse-btn:focus-visible {
    outline: 2px solid var(--pt-focus, #6cf);
    outline-offset: 2px;
    border-radius: .5rem;
}

.chev {
    inline-size: 1.1rem;
    block-size: 1.1rem;
    transform: rotate(-90deg);
    transition: transform .18s ease;
    opacity: .85;
    color: var(--cc-chevron, currentColor);
    opacity: .95;
}

.chev.open {
    transform: rotate(0deg);
}

.v-enter-active,
.v-leave-active {
    transition: height .18s ease;
    overflow: hidden;
}

.is-collapsed .pt-title {
    opacity: .8;
}

.pt-collapse-body {
    margin-top: 15px;
}

.chev path {
    fill: currentColor;
}
</style>

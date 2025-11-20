<template>
    <!-- Activator button lives inline where you place the component -->
    <button ref="btnRef" class="pt-info-icon" :class="[{ 'is-active': open }, btnClass]" @click.stop="toggle"
        :aria-label="ariaLabel || `What is ${title}?`" :title="ariaLabel || `What is ${title}?`"
        :aria-expanded="open ? 'true' : 'false'" :aria-controls="popoverId">
        <slot name="activator">ⓘ</slot>
    </button>

    <teleport to="body">
        <div v-if="open" ref="popRef" class="pt-popover info-popover"
            :class="[popoverClass, { 'is-dragging': dragging }]" :data-side="sideResolved"
            :style="{ top: pos.top + 'px', left: pos.left + 'px', width: computedWidth }" role="dialog" :id="popoverId"
            @click.stop>
            <!-- Header becomes the drag handle when draggable -->
            <div v-if="title || showClose" ref="dragRef" class="info-popover__header"
                :class="{ 'is-draggable': draggable, 'is-dragging': dragging }" @pointerdown="onHeaderPointerDown"
                title="Drag to move">
                <span class="drag-grip" aria-hidden="true"></span>
                <strong v-if="title" class="pt-section-title">{{ title }}</strong>

                <!-- Make sure drags don't start from the close button -->
                <button v-if="showClose" class="pt-seg-btn pt-seg-sm close-btn" @pointerdown.stop
                    @click.stop="open = false">
                    X
                </button>
            </div>

            <slot />
        </div>
    </teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';

const props = withDefaults(
    defineProps<{
        title?: string;
        ariaLabel?: string;
        btnClass?: string;
        popoverClass?: string;
        side?: 'auto' | 'left' | 'right';
        offset?: number;
        maxWidth?: number | string; // e.g., 420 or '28rem'
        draggable?: boolean;
        showClose?: boolean;
    }>(),
    {
        side: 'auto',
        offset: 10,
        maxWidth: 420,
        draggable: true,
        showClose: true
    }
);

const open = ref(false);
const btnRef = ref<HTMLElement | null>(null);
const popRef = ref<HTMLElement | null>(null);
const dragRef = ref<HTMLElement | null>(null);
const sideResolved = ref<'left' | 'right'>('right');
const pos = ref({ top: 0, left: 0 });
const popoverId = `info-${Math.random().toString(36).slice(2)}`;

// Drag state
const dragging = ref(false);
let startX = 0;
let startY = 0;
let startTop = 0;
let startLeft = 0;
let hasBeenDragged = false;

const computedWidth = computed(() => {
    if (typeof props.maxWidth === 'number') return `min(${props.maxWidth}px, 76vw)`;
    return props.maxWidth;
});

function clampToViewport(top: number, left: number) {
    const el = popRef.value?.getBoundingClientRect();
    const margin = 8;
    const w = el?.width ?? 300;
    const h = el?.height ?? 150;
    const maxLeft = window.innerWidth - w - margin;
    const maxTop = window.innerHeight - h - margin;
    return {
        top: Math.max(margin, Math.min(top, maxTop)),
        left: Math.max(margin, Math.min(left, maxLeft))
    };
}

function position() {
    // If user dragged it, keep their position
    if (hasBeenDragged) return;

    const btn = btnRef.value?.getBoundingClientRect();
    const el = popRef.value?.getBoundingClientRect();
    if (!btn || !el) return;

    const gap = props.offset ?? 10;

    // Side: auto or forced
    if (props.side === 'left' || props.side === 'right') {
        sideResolved.value = props.side;
    } else {
        const spaceRight = window.innerWidth - btn.right;
        sideResolved.value = spaceRight >= el.width + gap ? 'right' : 'left';
    }

    // Anchor next to button
    let top = btn.top + btn.height / 2 - el.height / 2;
    let left =
        sideResolved.value === 'right' ? btn.right + gap : btn.left - el.width - gap;

    // Clamp
    const clamped = clampToViewport(top, left);
    pos.value = clamped;
}

function toggle() {
    open.value = !open.value;
    if (open.value) {
        hasBeenDragged = false; // reset anchor each time it opens
        nextTick(position);
    }
}

function onViewport() {
    if (open.value && !dragging.value && !hasBeenDragged) position();
}

function onDocClick(e: MouseEvent) {
    if (!open.value) return;
    const t = e.target as Node;
    if (
        popRef.value &&
        !popRef.value.contains(t) &&
        btnRef.value &&
        !btnRef.value.contains(t)
    ) {
        open.value = false;
    }
}

function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open.value = false;
}

// Dragging
function onDragStart(e: PointerEvent) {
    if (!popRef.value) return;
    dragging.value = true;
    hasBeenDragged = true;

    // Starting positions
    startX = e.clientX;
    startY = e.clientY;
    startTop = pos.value.top;
    startLeft = pos.value.left;

    // Capture pointer on header for robust dragging
    dragRef.value?.setPointerCapture(e.pointerId);

    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd, { once: true });
}

function onDragMove(e: PointerEvent) {
    if (!dragging.value) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const nextTop = startTop + dy;
    const nextLeft = startLeft + dx;
    pos.value = clampToViewport(nextTop, nextLeft);
}

function onDragEnd(e: PointerEvent) {
    dragging.value = false;
    dragRef.value?.releasePointerCapture(e.pointerId);
    document.removeEventListener('pointermove', onDragMove);
}

function isInteractive(el: HTMLElement | null) {
    if (!el) return false;
    const sel =
        'button,a,input,textarea,select,label,[role="button"],[contenteditable="true"],.no-drag,[data-no-drag]';
    return !!el.closest(sel);
}

function onHeaderPointerDown(e: PointerEvent) {
    if (!props.draggable) return;
    const target = e.target as HTMLElement;

    // Don’t treat clicks on buttons/links/etc as drag starts
    if (isInteractive(target)) return;

    e.preventDefault();
    onDragStart(e);
}

onMounted(() => {
    window.addEventListener('resize', onViewport);
    window.addEventListener('scroll', onViewport, { passive: true });
    document.addEventListener('click', onDocClick, { capture: true });
    document.addEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', onViewport);
    window.removeEventListener('scroll', onViewport);
    document.removeEventListener('click', onDocClick, { capture: true });
    document.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.info-popover {
    position: fixed;
    font-size: 12px;
}

.info-popover__header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-right: 30px;
    user-select: none;
    margin-bottom: 8px;
}

.info-popover__header.is-draggable {
    cursor: grab;
}

.info-popover__header.is-dragging,
.info-popover.is-dragging .info-popover__header {
    cursor: grabbing;
}

.info-popover.is-dragging {
    user-select: none;
}

.close-btn {
    position: absolute;
    right: 12px;
    top: 8px;
}

.drag-grip {
    width: 13px;
    height: 13px;
    margin-right: 8px;
    opacity: 0.6;
    background-image:
        radial-gradient(currentColor 1.5px, transparent 1.5px),
        radial-gradient(currentColor 1.5px, transparent 1.5px),
        radial-gradient(currentColor 1.5px, transparent 1.5px),
        radial-gradient(currentColor 1.5px, transparent 1.5px),
        radial-gradient(currentColor 1.5px, transparent 1.5px),
        radial-gradient(currentColor 1.5px, transparent 1.5px);
    background-size: 6px 6px;
    background-position:
        0px 0px,
        6px 0px,
        0px 6px,
        6px 6px,
        0px 12px,
        6px 12px;
    flex: 0 0 auto;
    background-repeat: no-repeat;
}
</style>

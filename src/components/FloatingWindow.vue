<template>
    <div class="floating-panel" :style="{ top: y + 'px', left: x + 'px' }" @mousedown.self="bringToFront">
        <div class="floating-header" @mousedown="startDrag">
            <span>
                <slot name="title">Panel</slot>
            </span>
            <button class="close-btn" @click="$emit('close')">&times;</button>
        </div>
        <div class="floating-body">
            <slot />
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

const x = ref(100);
const y = ref(100);
const isDragging = ref(false);
const offset = { x: 0, y: 0 };
const zIndex = ref(1000);

const startDrag = (e) => {
    isDragging.value = true;
    offset.x = e.clientX - x.value;
    offset.y = e.clientY - y.value;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e) => {
    if (isDragging.value) {
        x.value = e.clientX - offset.x;
        y.value = e.clientY - offset.y;
    }
};

const stopDrag = () => {
    isDragging.value = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
};

const bringToFront = () => {
    zIndex.value = Date.now();
};

onBeforeUnmount(() => {
    stopDrag();
});
</script>

<style scoped>
.floating-panel {
    position: fixed;
    width: 250px;
    border: 1px solid #666;
    border-radius: 8px;
    background-color: #111;
    color: #fff;
    z-index: 1000;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

.floating-header {
    background-color: #333;
    padding: 0.5em;
    cursor: move;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #555;
    border-radius: 8px 8px 0 0;
}

.floating-body {
    padding: 1em;
    max-height: 400px;
    overflow-y: auto;
}

.close-btn {
    background: transparent;
    color: #fff;
    border: none;
    font-size: 1.2em;
    cursor: pointer;
}
</style>

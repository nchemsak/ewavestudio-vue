<template>
    <div class="pattern-tools" :class="props.currentTheme">
        <!-- Step Fills -->
        <section class="pt-section">
            <div class="pt-section-title">Step Fills</div>
            <div class="pt-btn-group" role="group" aria-label="Step fills">
                <button class="pt-btn" @click="fillAll">All</button>
                <button class="pt-btn" @click="fillEvery2">Every 2</button>
                <button class="pt-btn" @click="fillEvery4">Every 4</button>
                <button class="pt-btn" @click="fillRandom()">Random</button>
                <button class="pt-btn" @click="invert">Invert</button>
                <button class="pt-btn pt-danger" @click="clear">Clear</button>
            </div>
        </section>

        <!-- Velocity Shapes -->
        <section class="pt-section" v-if="props.velocities">
            <div class="pt-section-title">Humanize Presets</div>
            <div class="pt-btn-group" role="group" aria-label="Velocity shapes">
                <button class="pt-btn" @click="shapePeaks">Peaks</button>
                <button class="pt-btn" @click="shapeStairs4">Stairs</button>
                <button class="pt-btn" @click="shapeRamp">Ramp</button>
                <button class="pt-btn" @click="shapeBackbeat">Backbeat</button>
                <button class="pt-btn" @click="shapeRandom">Random</button>
                <button class="pt-btn pt-danger" @click="shapeReset">Reset</button>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { } from 'vue';

const props = defineProps<{
    steps: boolean[];
    velocities?: number[];       // 0..1
    currentTheme?: string;
}>();

const emit = defineEmits<{
    (e: 'update:steps', v: boolean[]): void;
    (e: 'update:velocities', v: number[]): void;
}>();

/* ---------- Utils ---------- */
function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
}
function clamp01(x: number): number {
    return clamp(x, 0, 1);
}

/* ---------- Step Fills ---------- */
function clear(): void {
    emit('update:steps', props.steps.map(() => false));
}
function invert(): void {
    emit('update:steps', props.steps.map(s => !s));
}
function fillAll(): void {
    emit('update:steps', props.steps.map(() => true));
}
function fillEvery2(): void {
    emit('update:steps', props.steps.map((_, i) => i % 2 === 0));
}
function fillEvery4(): void {
    emit('update:steps', props.steps.map((_, i) => i % 4 === 0));
}
function fillRandom(arg?: unknown): void {
    const p = (typeof arg === 'number') ? clamp01(arg) : 0.5; // default 50%
    const out = props.steps.map(() => Math.random() < p);
    if (!out.some(Boolean)) out[Math.floor(Math.random() * out.length)] = true;
    emit('update:steps', out);
}

/* ---------- Velocity Shapes ---------- */
function applyVelocityPattern(fn: (i: number, len: number) => number): void {
    if (!props.velocities) return;
    const len = props.velocities.length;
    const out = Array.from({ length: len }, (_, i) => clamp01(fn(i, len)));
    emit('update:velocities', out);
}
function shapePeaks(): void {
    const cycle = [1.0, 0.55, 0.25, 0.55];
    applyVelocityPattern(i => cycle[i % 4]);
}
function shapeStairs4(): void {
    const cycle = [1.0, 0.75, 0.5, 0.25];
    applyVelocityPattern(i => cycle[i % 4]);
}
function shapeRamp(): void {
    const minV = 0.2;
    applyVelocityPattern((i, len) => {
        if (len <= 1) return 1;
        const t = i / (len - 1);
        const dist = Math.abs(t - 0.5) * 2;
        return minV + (1 - minV) * dist;
    });
}
function shapeBackbeat(): void {
    applyVelocityPattern(i => ((i % 4 === 1) || (i % 4 === 3)) ? 1.0 : 0.5);
}
function shapeRandom(): void {
    const minV = 0.15, maxV = 1.0;
    applyVelocityPattern(() => minV + Math.random() * (maxV - minV));
}
function shapeReset(): void {
    if (!props.velocities) return;
    emit('update:velocities', props.velocities.map(() => 1));
}
</script>

<style scoped>
.pattern-tools {
    max-width: 520px;
}

.pattern-tools .pattern-tools {
    display: flex;
}

.pt-btn {
    min-height: auto;
    line-height: 1;
    font-size: 0.65rem;
    width: 75px;
    padding: 5px;
}
</style>

<template>
  <div class="pattern-tools" :class="props.currentTheme">
    <!-- 3-up grid -->
    <div class="pt-tools-grid">
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

      <!-- Humanize Presets -->
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

      <!-- Tuning -->
      <section class="pt-section">
        <div class="pt-section-title">Tuning</div>
        <div class="pt-btn-group" role="group" aria-label="Tuning">
          <button class="pt-btn octave-btn" @click="shiftOctave(-1)">↓ Octave</button>
          <button class="pt-btn octave-btn" @click="shiftOctave(+1)">↑ Octave</button>
        </div>
        <div class="pt-inline">
          <label class="pt-inline-check">
            <input type="checkbox" v-model="applyActiveOnly" />
            Active only
          </label>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  steps: boolean[];
  velocities?: number[];       // 0..1
  currentTheme?: string;
}>();

const emit = defineEmits<{
  (e: 'update:steps', v: boolean[]): void;
  (e: 'update:velocities', v: number[]): void;
  (e: 'octave-shift', payload: number | { delta: number; onlyActive?: boolean }): void;
}>();

/* ---------- NEW: tuning helpers ---------- */
const applyActiveOnly = ref(false);
function shiftOctave(delta: number): void {
  emit('octave-shift', { delta, onlyActive: applyActiveOnly.value });
}

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
  max-width: none;
}

/* 3-up grid for the three sections */
.pt-tools-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

/* Responsive: stack on narrow screens */
@media (max-width: 720px) {
  .pt-tools-grid {
    grid-template-columns: 1fr;
  }
}

/* Make button groups wrap nicely inside each third */
.pt-btn-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
}

.pt-btn {
  min-height: auto;
  line-height: 1;
  font-size: 0.65rem;
  width: 56px;
  padding: 4px;

}

.octave-btn {
  height: 50px;
}

/* small inline checkbox row */
.pt-inline {
  margin-top: 6px;
  color: var(--pt-muted);
  font-size: 0.8rem;
}

.pt-inline-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>

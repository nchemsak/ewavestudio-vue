<template>
  <svg class="drive-icon" viewBox="0 0 100 100" role="img" aria-label="Drive">
    <defs>
      <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"  :stop-color="colors[0]" />
        <stop offset="55%" :stop-color="colors[1]" />
        <stop offset="100%" :stop-color="colors[2]" />
      </linearGradient>
    </defs>

    <!-- Soft-clipping transfer curve (no background tile) -->
    <path
      :d="curvePath"
      fill="none"
      :stroke="`url(#${gid})`"
      :stroke-width="enabled ? 3 : 2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      :opacity="enabled ? 1 : 0.95"
    />

    <!-- Optional tiny end caps to hint at "flattening" near ±1 -->
    <path
      :d="endCapsPath"
      fill="none"
      :stroke="enabled ? colors[1] : 'currentColor'"
      :opacity="enabled ? 0.55 : 0.35"
      stroke-width="1.6"
      stroke-linecap="round"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  enabled?: boolean;
  palette?: string[];
}>(), {
  enabled: true,
  palette: () => ['#ff8a7a', '#ffce6a', '#ff7edb']
});

const colors = computed(() =>
  (props.palette?.length ?? 0) >= 3 ? props.palette! : ['#f99', '#fd9', '#fb8']
);

// Geometry
const left = 12;
const right = 88;
const top = 14;
const bottom = 86;
const midX = (left + right) / 2;
const midY = (top + bottom) / 2;

// Transfer curve: y = tanh(g*x) normalized to ±1
// This creates a clear "soft clip" look (linear center, rolled-off ends).
const gain = 1.9;        // increase for squarer / harder clip look
const height = 30;       // vertical scale of the curve
const steps = 80;

function buildCurvePath(): string {
  let d = '';
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;                 // 0..1
    const xNorm = t * 2 - 1;             // -1..1 input
    const yNorm = Math.tanh(gain * xNorm) / Math.tanh(gain); // -1..1 output
    const x = left + t * (right - left); // map to svg
    const y = midY - yNorm * height;

    d += s === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}`
                 : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

// Small horizontal caps at the ends to emphasize the flattening/clipping
function buildEndCaps(): string {
  const pad = 3;
  const capLen = 6;

  // left end (x ≈ left), y from curve at x=-1
  const yLeft = midY - (Math.tanh(-gain) / Math.tanh(gain)) * height;
  // right end (x ≈ right), y from curve at x=+1
  const yRight = midY - (Math.tanh(gain) / Math.tanh(gain)) * height;

  const l1 = `M ${left + pad} ${yLeft.toFixed(2)} L ${(left + pad + capLen).toFixed(2)} ${yLeft.toFixed(2)}`;
  const l2 = `M ${(right - pad - capLen).toFixed(2)} ${yRight.toFixed(2)} L ${(right - pad).toFixed(2)} ${yRight.toFixed(2)}`;
  return `${l1} ${l2}`;
}

const curvePath = computed(buildCurvePath);
const endCapsPath = computed(buildEndCaps);

const uid = Math.random().toString(36).slice(2);
const gid = `grad-drive-${uid}`;
</script>

<style scoped>
.drive-icon {
  display: block;
  width: 72px;
  height: 72px;
}
</style>

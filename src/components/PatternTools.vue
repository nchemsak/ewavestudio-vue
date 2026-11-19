<!-- components/PatternTools.vue -->
<template>
	<div class="pattern-tools" :class="props.currentTheme">
		<div class="pt-tools-grid">
			<!-- Step Fills -->
			<section class="pt-section">
				<div class="pt-section-title">Step Fills</div>
				<div class="pt-btn-group pt-btn-grid-6" role="group" aria-label="Step fills">
					<button class="pt-btn" @click="fillAll">All</button>
					<button class="pt-btn" @click="fillEvery2">Every 2</button>
					<button class="pt-btn" @click="fillEvery4">Every 4</button>
					<button class="pt-btn" @click="invert">Invert</button>
					<button class="pt-btn" @click="fillRandom()">Random</button>
					<button class="pt-btn pt-danger" @click="clear">Clear</button>
				</div>
			</section>

			<!-- Humanize -->
			<!-- `nudge`: a card's VEL switch was turned on while every step is at full velocity,
				 so these buttons glow for a moment: they make the softer steps VEL needs -->
			<section class="pt-section" :class="{ 'pt-nudged': nudged }" v-if="props.velocities">
				<div class="pt-section-title">Humanize</div>
				<div class="pt-btn-group pt-btn-grid-6" role="group" aria-label="Velocity shapes">
					<button class="pt-btn" @click="shapePeaks">Peaks</button>
					<button class="pt-btn" @click="shapeStairs4">Stairs</button>
					<button class="pt-btn" @click="shapeRamp">Ramp</button>
					<button class="pt-btn" @click="shapeDnb">dNb</button>
					<button class="pt-btn" @click="shapeRandom">Random</button>
					<button class="pt-btn pt-danger" @click="shapeReset">Reset</button>
				</div>
			</section>

			<!-- Move (PR 88; Octave until then): the octave arrows, then shift one step either way
				 (round the bar's end) and reverse; each pad's note, velocity, wave, repeats and noise
				 move with it (src/lib/patterns/move.ts). Labelled caps two by two, Reverse across
				 the bottom (option A of three mockups, after PR 100): the three rows line up with
				 Step Fills' and Humanize's; until then bare arrows, and "rotate" -->
			<section class="pt-section pt-section-move">
				<div class="pt-section-title">Move</div>
				<div class="pt-btn-group pt-btn-move" role="group" aria-label="Move">
					<button class="pt-btn" aria-label="Octave down" title="Every pad an octave down" @click="shiftOctave(-1)">↓ Oct</button>
					<button class="pt-btn" aria-label="Octave up" title="Every pad an octave up" @click="shiftOctave(+1)">Oct ↑</button>
					<button class="pt-btn" aria-label="Shift earlier"
						title="Shift earlier: every step one to the left; step 1 comes round to the end"
						@click="emit('move', 'left')">◂ Shift</button>
					<button class="pt-btn" aria-label="Shift later"
						title="Shift later: every step one to the right; step 16 comes round to the start"
						@click="emit('move', 'right')">Shift ▸</button>
					<button class="pt-btn pt-btn-wide" aria-label="Reverse" title="Reverse: the pattern backwards"
						@click="emit('move', 'reverse')">⇄ Reverse</button>
				</div>
			</section>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { velocityShape, type VelocityShapeId } from '../lib/patterns/velocityShapes';

const props = defineProps<{
	steps: boolean[];
	velocities?: number[];
	currentTheme?: string;
	nudge?: number; // a new value makes Humanize glow for a moment
}>();

const nudged = ref(false);
let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => props.nudge, () => {
	nudged.value = false;
	if (nudgeTimer) clearTimeout(nudgeTimer);
	// One frame off, so a second nudge restarts the glow
	requestAnimationFrame(() => {
		nudged.value = true;
		nudgeTimer = setTimeout(() => { nudged.value = false; }, 2400);
	});
});
onBeforeUnmount(() => { if (nudgeTimer) clearTimeout(nudgeTimer); });

const emit = defineEmits<{
	(e: 'update:steps', v: boolean[]): void;
	(e: 'update:velocities', v: number[]): void;
	(e: 'octave-shift', delta: number): void;
	(e: 'move', kind: 'left' | 'right' | 'reverse'): void;
}>();

// The octave arrows move every pad, as the phone's do (PR 98: their Active Pads Only toggle,
// which moved only the pads that are on and read as if it applied to rotate and reverse too,
// went)
function shiftOctave(delta: number): void {
	emit('octave-shift', delta);
}

// Utils 
function clamp(x: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, x));
}
function clamp01(x: number): number {
	return clamp(x, 0, 1);
}

// Step Fills 
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

// Velocity shapes (Humanize), shared with the phone (src/lib/patterns/velocityShapes.ts)
function applyShape(id: VelocityShapeId): void {
	if (!props.velocities) return;
	emit('update:velocities', velocityShape(id, props.velocities.length));
}
const shapePeaks = () => applyShape('peaks');
const shapeStairs4 = () => applyShape('stairs');
const shapeRamp = () => applyShape('ramp');
const shapeDnb = () => applyShape('dnb');
const shapeRandom = () => applyShape('random');
const shapeReset = () => applyShape('reset');
</script>

<style scoped>
/* Humanize, nudged by a VEL switch: its buttons glow in the accent, twice */
.pt-nudged .pt-btn {
	animation: pt-nudge 1.2s ease-in-out 2;
}

@keyframes pt-nudge {
	50% {
		box-shadow: 0 0 0 2px hsl(var(--pt-accent) 80% 62% / 0.9), 0 0 14px hsl(var(--pt-accent) 80% 62% / 0.7);
	}
}

@media (prefers-reduced-motion: reduce) {
	.pt-nudged .pt-btn {
		animation: none;
		box-shadow: 0 0 0 2px hsl(var(--pt-accent) 80% 62% / 0.9);
	}
}

/* The card's width decides the layout (container queries), not the window's */
.pattern-tools {
	max-width: none;
	container: pattern-tools / inline-size;
}

/* Three sections side by side, the same height, two buttons across */
.pt-tools-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 10px;
	align-items: stretch;
}

.pt-section {
	display: flex;
	flex-direction: column;
	padding-bottom: 10px;
	background-color: var(--pt-inset);
	border-radius: var(--pt-radius);
}

.pt-section-title {
	text-align: center;
}

.pt-btn-group {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px 6px;
	padding: 0 6px;
}

.pt-btn {
	min-height: auto;
	line-height: 1;
	font-size: 0.65rem;
	width: 100%;
	padding: 4px 2px;
	white-space: nowrap;
}

/* Move: labelled caps two by two, Reverse the full width under them */
.pt-btn-move .pt-btn-wide {
	grid-column: 1 / -1;
}

/* A narrow card (phones): the sections one under another, three buttons across */
@container pattern-tools (max-width: 340px) {
	.pt-tools-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.pt-btn-group {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px 10px;
	}

	/* Move's five caps on one row */
	.pt-btn-group.pt-btn-move {
		grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(0, 1.3fr);
		gap: 8px 5px;
	}

	.pt-btn-move .pt-btn-wide {
		grid-column: auto;
	}
}
</style>

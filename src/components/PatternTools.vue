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

			<!-- Octave -->
			<section class="pt-section">
				<div class="pt-section-title">Octave</div>
				<div class="pt-btn-group pt-btn-octave" role="group" aria-label="Octave">
					<button class="pt-btn octave-btn" aria-label="Octave up" @click="shiftOctave(+1)">↑</button>
					<button class="pt-btn octave-btn" aria-label="Octave down" @click="shiftOctave(-1)">↓</button>
				</div>
				<!-- A toggle (a cap with an LED, _hardware.scss), not a web checkbox (PR 67): the
					 octave arrows move only the pads that are on while it's lit -->
				<div class="pt-inline">
					<button type="button" class="pt-inline-check hw-cap hw-cap-sm hw-led-left"
						:class="{ on: applyActiveOnly }" :aria-pressed="applyActiveOnly ? 'true' : 'false'"
						title="The octave arrows move only the pads that are on"
						@click="applyActiveOnly = !applyActiveOnly">Active Pads Only</button>
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
	(e: 'octave-shift', payload: number | { delta: number; onlyActive?: boolean }): void;
}>();

// tuning helpers 
const applyActiveOnly = ref(true);
function shiftOctave(delta: number): void {
	emit('octave-shift', { delta, onlyActive: applyActiveOnly.value });
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

/* Octave: up, then down, side by side */
.pt-btn-octave {
	display: flex;
	flex-wrap: nowrap;
	justify-content: center;
	gap: 8px;
}

.octave-btn {
	width: 42px;
	height: 44px;
	padding: 0;
	font-size: 22px;
}

.pt-inline {
	display: block;
	margin-top: auto;
	padding: 8px 4px 0;
	text-align: center;
	color: var(--pt-muted);
	font-size: 0.64rem;
	line-height: normal;
	white-space: nowrap;
}

/* Sized like the cards' header pills (PillSwitch): a small cap, the LED beside its label */
.pt-inline-check {
	--hw-led-size: 5px;
	padding: 2px 6px 2px 5px;
	border-radius: 5px;
	border: 1px solid transparent;
	font: inherit;
	font-size: inherit;
	line-height: 1.4;
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

	.pt-inline {
		display: none;
	}
}
</style>

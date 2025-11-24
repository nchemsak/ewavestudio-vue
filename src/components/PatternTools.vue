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
			<section class="pt-section" v-if="props.velocities">
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
					<button class="pt-btn octave-btn" @click="shiftOctave(-1)">↓</button>
					<button class="pt-btn octave-btn" @click="shiftOctave(+1)">↑</button>
				</div>
				<div class="pt-inline">
					<label class="pt-inline-check">
						<input type="checkbox" v-model="applyActiveOnly" />
						Active Pads Only
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
	velocities?: number[];
	currentTheme?: string;
}>();

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

function applyVelocityPattern(fn: (i: number, len: number) => number): void {
	if (!props.velocities) return;
	const len = props.velocities.length;
	const out = Array.from({ length: len }, (_, i) => clamp01(fn(i, len)));
	emit('update:velocities', out);
}

function applyCycle(cycle: number[]): void {
	applyVelocityPattern((i, len) => {
		if (len <= 1) return cycle[0] ?? 1;
		const t = i / (len - 1); // 0..1
		const idx = Math.round(t * (cycle.length - 1));
		return cycle[idx];
	});
}

// Velocity Shapes
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

function shapeDnb(): void {
	const dnb16 = [
		0.60, 0.32, 0.50, 0.32,
		0.50, 0.50, 0.90, 0.22,
		0.50, 0.32, 0.60, 0.40,
		0.40, 0.30, 0.60, 0.40
	];
	applyCycle(dnb16);
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

.pt-tools-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 12px;
}

@media (max-width: 720px) {
	.pt-tools-grid {
		grid-template-columns: 1fr;
	}

	.pattern-tools .pt-btn-group {
		justify-content: space-evenly;
	}
}

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
	font-size: 30px;
}

.pt-inline {
	display: block;
	margin-top: 12px;
	color: var(--pt-muted);
	font-size: 0.7rem;
	line-height: normal;
}

.pt-inline-check {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.pt-section-title {
	text-align: center;
}

.pt-section {
	background-color: rgba(15, 18, 26, .70);
	border-radius: var(--pt-radius);

}

@media (max-width: 720px) {
	.pt-inline {
		display: none;
	}

	.pt-tools-grid {
		grid-template-columns: 1fr;
	}

	/* Step Fills / Humanize: 2 rows of 3 */
	.pattern-tools .pt-btn-grid-6 {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px 10px;
		justify-content: stretch;
	}

	.pattern-tools .pt-btn-grid-6 .pt-btn {
		width: 100%;
	}

	/* Octave: keep just 2 buttons, centered, not stretched */
	.pattern-tools .pt-btn-octave {
		display: flex;
		justify-content: center;
		gap: 12px;
	}

}

</style>

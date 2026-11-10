<!-- components/PresetButtons.vue -->
<!-- A box of preset buttons in the transport card, used twice, side by side: Sounds (one per
	 built-in sound, src/lib/presets/) and Patterns (one per built-in pattern,
	 src/lib/patterns/). DrumSequencer applies the choice; this only shows the buttons and which
	 one is lit (the one the sound or pattern matches). Styled like Pattern Tools' buttons, three
	 across. The dice in the top-right corner (like the wave tiles' dice badges) asks for a
	 random one. -->
<template>
	<div class="preset-bar">
		<div class="preset-box" role="group" :aria-labelledby="titleId">
			<div :id="titleId" class="pt-section-title">{{ title }}</div>
			<button type="button" class="preset-dice" :class="{ rolling }" :aria-label="diceLabel"
				:title="`${diceLabel} (Ctrl+Z goes back)`" @click="roll" @animationend="rolling = false">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<rect x="3.5" y="3.5" width="17" height="17" rx="4" />
					<circle cx="8" cy="8" r="1.6" />
					<circle cx="12" cy="12" r="1.6" />
					<circle cx="16" cy="16" r="1.6" />
				</svg>
			</button>
			<div class="pt-btn-group preset-grid">
				<button v-for="p in presets" :key="p.id" type="button" class="pt-btn"
					:class="{ 'is-active': p.id === active }" :aria-pressed="p.id === active" :title="p.description"
					@click="emit('choose', p.id)">{{ p.label }}</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
	title: string; // the box's caption: Sound presets or Pattern presets
	diceLabel: string; // the dice's name: Random sound, Random pattern
	presets: ReadonlyArray<{ id: string; label: string; description: string }>;
	active: string | null; // the lit button's id
}>();

const titleId = `preset-box-${props.title.toLowerCase().replace(/\W+/g, '-')}`;

const emit = defineEmits<{
	(e: 'choose', id: string): void;
	(e: 'random'): void;
}>();

// A quick spin of the dice on each roll (nothing lights up after one)
const rolling = ref(false);
function roll() {
	rolling.value = false;
	requestAnimationFrame(() => { rolling.value = true; });
	emit('random');
}
</script>

<style scoped>
/* A compact panel, three across (DrumSequencer places the two boxes) */
.preset-bar {
	min-width: 0;
}

/* Pattern Tools' section look: an inset panel (dark, or a light tint in the light theme)
   with a centered title */
.preset-box {
	position: relative;
	width: fit-content;
	margin: 0 auto;
	padding: 6px 8px 8px;
	border-radius: var(--pt-radius);
	background-color: var(--pt-inset);
}

.preset-box .pt-section-title {
	text-align: center;
}

.preset-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(56px, 1fr));
	gap: 8px 6px;
}

/* Pattern Tools' button size; a long name (Bassline) stays on one line */
.preset-grid .pt-btn {
	min-height: auto;
	line-height: 1;
	font-size: 0.65rem;
	width: 100%;
	padding: 4px 2px;
	white-space: nowrap;
}

/* The dice: the wave tiles' badge, with its pips showing */
.preset-dice {
	position: absolute;
	top: 4px;
	right: 4px;
	width: 22px;
	height: 22px;
	padding: 0;
	border-radius: 8px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	background: hsl(var(--pt-accent) 80% 60% / .15);
	border: 1px solid hsl(var(--pt-accent) 80% 60% / .55);
	box-shadow: 0 2px 8px rgb(0 0 0 / .25);
	transition: box-shadow .2s ease, transform .12s ease;
}

.preset-dice:hover {
	box-shadow: 0 0 10px var(--pt-btn-glow);
}

.preset-dice:active {
	transform: scale(.92);
}

.preset-dice:focus-visible {
	outline: 2px solid hsl(var(--pt-accent) 80% 60%);
	outline-offset: 2px;
}

.preset-dice svg {
	width: 18px;
	height: 18px;
}

.preset-dice svg rect {
	fill: none;
	stroke: color-mix(in oklab, var(--pt-text) 90%, transparent);
	stroke-width: 1.6px;
}

.preset-dice svg circle {
	fill: color-mix(in oklab, var(--pt-text) 92%, transparent);
}

.preset-dice.rolling svg {
	animation: dice-roll .35s ease-out;
}

@keyframes dice-roll {
	from {
		transform: rotate(0deg);
	}

	to {
		transform: rotate(360deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.preset-dice.rolling svg {
		animation: none;
	}
}

/* Lit: the preset the sound matches, filled with the button's own color */
.preset-grid .pt-btn.is-active {
	color: #fff;
	background: linear-gradient(145deg,
			hsl(var(--btn-hue) 84% 58% / .95),
			hsl(calc(var(--btn-hue) + 10) 84% 58% / .95));
	box-shadow:
		0 0 0 3px hsl(var(--btn-hue) 90% 60% / .18),
		0 0 14px hsl(var(--btn-hue) 90% 60% / .35);
}

/* Narrower than 1200 px the two boxes share a row of their own under the knobs, each filling
   its half */
@media (max-width: 1199.98px) {
	.preset-box {
		width: auto;
	}
}
</style>

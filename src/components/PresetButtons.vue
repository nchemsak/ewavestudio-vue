<!-- components/PresetButtons.vue -->
<!-- The preset buttons in the transport card: one per built-in sound (src/lib/presets/).
	 DrumSequencer applies the preset; this only shows the buttons and which one is lit (the
	 preset the sound matches). Styled like Pattern Tools' buttons. Three across beside the
	 knobs (from 1280 px) and on phones, six in a row of its own in between. -->
<template>
	<div class="preset-bar">
		<div class="preset-box" role="group" aria-labelledby="preset-bar-title">
			<div id="preset-bar-title" class="pt-section-title">Presets</div>
			<div class="pt-btn-group preset-grid">
				<button v-for="p in presets" :key="p.id" type="button" class="pt-btn"
					:class="{ 'is-active': p.id === active }" :aria-pressed="p.id === active" :title="p.description"
					@click="emit('choose', p.id)">{{ p.label }}</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	presets: ReadonlyArray<{ id: string; label: string; description: string }>;
	active: string | null; // the lit preset's id
}>();

const emit = defineEmits<{
	(e: 'choose', id: string): void;
}>();
</script>

<style scoped>
/* Beside the knobs (from 1280 px; DrumSequencer places it): a compact panel, three across */
.preset-bar {
	min-width: 0;
}

/* Pattern Tools' section look: an inset panel (dark, or a light tint in the light theme)
   with a centered title */
.preset-box {
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
	grid-template-columns: repeat(3, 56px);
	gap: 8px 6px;
}

/* Pattern Tools' button size */
.preset-grid .pt-btn {
	min-height: auto;
	line-height: 1;
	font-size: 0.65rem;
	width: 100%;
	padding: 4px;
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

/* A row of its own under the knobs: six across, filling it */
@media (max-width: 1279.98px) {
	.preset-box {
		width: auto;
	}

	.preset-grid {
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 8px 10px;
	}
}

/* A phone: three across, two rows (as Pattern Tools on a phone) */
@media (max-width: 720px) {
	.preset-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
}
</style>

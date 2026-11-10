<!-- components/modules/UnisonEffect.vue -->
<template>
	<KnobGroup class="uni-group" v-model="localEnabled" :showHeader="false">
		<!-- One line: the on/off tile, then the three knobs spread over the rest -->
		<div class="uni-line">
		<div class="uni-top">
			<UnisonButton v-model="localEnabled" :voices="localVoices" :detune="localDetune" :spread="localSpread"
				label="Unison" showState />
		</div>

		<div class="pt-knob-row" :class="{ 'is-unison-off': !localEnabled }">
			<div class="position-relative text-center">
				<Knob midi-id="unison.voices" v-model="localVoices" size="small" :min="UNISON_VOICES_MIN" :max="maxVoices" :step="1" label="Voices"
					:color="color" @knobStart="activeKnob = 'voices'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'voices'" class="custom-tooltip">
					{{ localVoices }}
				</span>
			</div>

			<div class="position-relative text-center">
				<Knob midi-id="unison.detune" :value-text="`${localDetune} cents`" v-model="localDetune" size="small" :min="0" :max="100" :step="1" :detents="[UNISON_DETUNE_DEFAULT]" label="Detune" :color="color"
					@knobStart="activeKnob = 'detune'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'detune'" class="custom-tooltip">
					{{ localDetune }}¢
				</span>
			</div>

			<div class="position-relative text-center">
				<Knob midi-id="unison.spread" :value-text="`${localSpread}%`" v-model="localSpread" size="small" :min="0" :max="100" :step="1" label="Spread" :color="color"
					@knobStart="activeKnob = 'spread'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'spread'" class="custom-tooltip">
					{{ localSpread }}%
				</span>
			</div>
		</div>
		</div>
	</KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';
import UnisonButton from '../UnisonButton.vue';
import { UNISON_DETUNE_DEFAULT, UNISON_SPREAD_DEFAULT, UNISON_VOICES_DEFAULT, UNISON_VOICES_MAX, UNISON_VOICES_MIN } from '../../audio/unison';

const props = withDefaults(
	defineProps<{
		enabled: boolean;
		voices: number;
		detune: number;
		spread: number;
		color?: string;
		showToggle?: boolean;
	}>(),
	{
		enabled: false,
		voices: UNISON_VOICES_DEFAULT,
		detune: UNISON_DETUNE_DEFAULT,
		spread: UNISON_SPREAD_DEFAULT,
		color: '#27fcff',
		showToggle: true
	}
);

const emit = defineEmits<{
	(e: 'update:enabled', v: boolean): void;
	(e: 'update:voices', v: number): void;
	(e: 'update:detune', v: number): void;
	(e: 'update:spread', v: number): void;
}>();

const activeKnob = ref<null | 'voices' | 'detune' | 'spread'>(null);

const localEnabled = ref<boolean>(props.enabled);
const localVoices = ref<number>(props.voices);
const localDetune = ref<number>(props.detune);
const localSpread = ref<number>(props.spread);

/* emit updates (clamped just in case) */
watch(localEnabled, (v) => emit('update:enabled', v));

watch(localVoices, (v) => {
	const cap = maxVoices.value;
	const clamped = Math.max(UNISON_VOICES_MIN, Math.min(cap, Math.round(v)));
	if (clamped !== v) localVoices.value = clamped;
	emit('update:voices', clamped);
});

watch(localDetune, (v) =>
	emit('update:detune', Math.max(0, Math.min(100, Math.round(v))))
);
watch(localSpread, (v) =>
	emit('update:spread', Math.max(0, Math.min(100, Math.round(v))))
);

// sync down from parent
watch(
	() => props.enabled,
	(v) => {
		localEnabled.value = v;
	}
);

watch(
	() => props.voices,
	(v) => {
		const cap = maxVoices.value;
		localVoices.value = Math.max(UNISON_VOICES_MIN, Math.min(cap, v));
	}
);

watch(
	() => props.detune,
	(v) => {
		localDetune.value = v;
	}
);
watch(
	() => props.spread,
	(v) => {
		localSpread.value = v;
	}
);


const isMobile = ref(false);

watch(isMobile, () => {
	const cap = maxVoices.value;
	if (localVoices.value > cap) {
		localVoices.value = cap;
		emit('update:voices', cap);
	}
});

function updateIsMobile() {
	if (typeof window === 'undefined') return;
	isMobile.value = window.matchMedia('(max-width: 768px)').matches;
}

onMounted(() => {
	updateIsMobile();
	if (typeof window !== 'undefined') {
		window.addEventListener('resize', updateIsMobile);
	}
});

onBeforeUnmount(() => {
	if (typeof window !== 'undefined') {
		window.removeEventListener('resize', updateIsMobile);
	}
});

// 2–4 voices (src/audio/unison.ts), 3 at most on a small screen
const maxVoices = computed(() => (isMobile.value ? 3 : UNISON_VOICES_MAX));

</script>

<style scoped>
.uni-group {
	padding: 0;
}

.uni-line {
	display: flex;
	align-items: center;
	gap: 12px;
	width: 100%;
}

.uni-line>.pt-knob-row {
	flex: 1 1 auto;
	justify-content: space-evenly;
	flex-wrap: nowrap;
}

/* The tile: small, like the LFO's */
.uni-top {
	flex: none;
	display: flex;
}

.uni-top :deep(.wave-btn) {
	--w: 58px;
	height: 52px;
	padding: 3px;
	justify-content: center;
	gap: 1px;
}

.uni-top :deep(.wave-svg) {
	width: 30px;
	height: 30px;
}

.uni-top :deep(.wave-label) {
	font-size: .62rem;
	text-transform: uppercase;
}

.is-unison-off :deep(.knob-label),
.is-unison-off :deep(.knob-readout),
.is-unison-off :deep(.knob-value) {
	opacity: 0.7;
}
</style>

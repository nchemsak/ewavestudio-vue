<!-- components/modules/UnisonEffect.vue -->
<template>
	<KnobGroup class="pitch-col" v-model="localEnabled" :showHeader="false">
		<div class="uni-top">
			<UnisonButton v-model="localEnabled" :voices="localVoices" :detune="localDetune" :spread="localSpread"
				label="Unison" />
		</div>

		<div class="pt-knob-row" :class="{ 'is-unison-off': !localEnabled }">
			<div class="position-relative text-center">
				<Knob v-model="localVoices" size="small" :min="1" :max="maxVoices" :step="1" label="Voices"
					:color="color" @knobStart="activeKnob = 'voices'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'voices'" class="custom-tooltip">
					{{ localVoices }}
				</span>
			</div>

			<div class="position-relative text-center">
				<Knob v-model="localDetune" size="small" :min="0" :max="100" :step="1" label="Detune" :color="color"
					@knobStart="activeKnob = 'detune'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'detune'" class="custom-tooltip">
					{{ localDetune }}¢
				</span>
			</div>

			<div class="position-relative text-center">
				<Knob v-model="localSpread" size="small" :min="0" :max="100" :step="1" label="Spread" :color="color"
					@knobStart="activeKnob = 'spread'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'spread'" class="custom-tooltip">
					{{ localSpread }}%
				</span>
			</div>
		</div>
	</KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';
import UnisonButton from '../UnisonButton.vue';

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
		voices: 3,
		detune: 10,
		spread: 50,
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
	const clamped = Math.max(1, Math.min(cap, Math.round(v)));
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
		localVoices.value = Math.max(1, Math.min(cap, v));
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

const maxVoices = computed(() => (isMobile.value ? 3 : 6));

</script>

<style scoped>
.uni-top {
	display: flex;
	justify-content: center;
	margin: 0px 0 4px;
}

.is-unison-off :deep(.knob-label),
.is-unison-off :deep(.knob-readout),
.is-unison-off :deep(.knob-value) {
	opacity: 0.7;
}
</style>

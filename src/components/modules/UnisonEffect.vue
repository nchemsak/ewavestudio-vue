<!-- components/modules/UnisonEffect.vue -->
<!-- The Unison card (PR 77): a ribbon down its left edge is its name and switch; a screen draws
     the voices drifting apart (Detune) and where they sit left to right (Spread), and can be
     dragged: sideways for Detune, up and down for Spread (ShapePad.vue); the number of voices
     is a row of keys under the screen (a knob until PR 77); Detune and Spread are mini knobs
     on the right. The phone's Sound page has it `compact` (PR 106): no screen. -->
<template>
	<section class="pt-card sp-unit uni-unit" :class="{ 'is-off': !localEnabled, 'sp-compact': compact }" aria-label="Unison">
		<div class="sp-body">
			<button type="button" class="sp-ribbon" :class="{ 'is-on': localEnabled }" role="switch" :aria-checked="localEnabled" aria-label="Unison"
				:title="localEnabled ? 'Unison: on' : 'Unison: off'" @click="localEnabled = !localEnabled">
				<span class="sp-ribbon-led" aria-hidden="true"></span>
				<span class="sp-ribbon-label">UNISON</span>
			</button>
			<div class="sp-face">
				<div class="sp-screencol">
					<ShapePad v-if="!compact" :w="PAD_W" :h="PAD_H" :readout="`${localDetune}¢ · ${localSpread}%`" hint="↔ detune  ↕ spread" :touchGrip="unisonGrip" :disabled="!localEnabled"
						@start="activeKnob = 'pad'" @move="onPadMove" @end="activeKnob = null">
						<path v-for="(d, i) in waves" :key="i" :d="d" class="sp-line sp-voice" />
						<circle v-for="(x, i) in dots" :key="'d' + i" :cx="x" :cy="PAD_H - 5" r="2.2" class="sp-dot" />
					</ShapePad>
					<div class="sp-keys" role="radiogroup" aria-label="Voices">
						<button v-for="n in voiceChoices" :key="n" type="button" class="sp-key" :class="{ on: localVoices === n }" role="radio" :aria-label="`${n} voices`"
							:aria-checked="localVoices === n" @click="localVoices = n">{{ n }}<span class="sp-key-unit"> voices</span></button>
					</div>
				</div>
				<div class="sp-minis">
					<div class="sp-mini">
						<Knob midi-id="unison.detune" :value-text="`${localDetune} cents`" v-model="localDetune" hideLabel size="mini" :min="0" :max="100" :step="1" :detents="[UNISON_DETUNE_DEFAULT]" label="Detune" :color="color"
							@knobStart="activeKnob = 'detune'" @knobEnd="activeKnob = null" />
						<span>Detune</span>
					</div>
					<div class="sp-mini">
						<Knob midi-id="unison.spread" :value-text="`${localSpread}%`" v-model="localSpread" hideLabel size="mini" :min="0" :max="100" :step="1" label="Spread" :color="color"
							@knobStart="activeKnob = 'spread'" @knobEnd="activeKnob = null" />
						<span>Spread</span>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import Knob from '../Knob.vue';
import ShapePad, { type PadPoint } from '../ShapePad.vue';
import { toPath, voiceDots, voicePts } from '../../lib/shapeViews';
import { UNISON_DETUNE_DEFAULT, UNISON_SPREAD_DEFAULT, UNISON_VOICES_DEFAULT, UNISON_VOICES_MAX, UNISON_VOICES_MIN } from '../../audio/unison';

const props = withDefaults(
	defineProps<{
		enabled: boolean;
		voices: number;
		detune: number;
		spread: number;
		color?: string;
		showToggle?: boolean;
		// Phone mode's Sound page (PR 106): the ribbon, the keys and the mini knobs, no screen
		compact?: boolean;
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

const activeKnob = ref<null | 'pad' | 'detune' | 'spread'>(null);

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
const voiceChoices = computed(() => Array.from({ length: maxVoices.value - UNISON_VOICES_MIN + 1 }, (_, i) => UNISON_VOICES_MIN + i));

// The screen: a wave per voice (one while unison is off) and a dot for where each sits
const PAD_W = 200;
const PAD_H = 60;
const shown = computed(() => (localEnabled.value ? localVoices.value : 1));
const waves = computed(() => voicePts(shown.value, localDetune.value, PAD_W, PAD_H).map(toPath));
const dots = computed(() => voiceDots(shown.value, localSpread.value, PAD_W));
// Where a finger takes hold on a touch screen: Detune across, Spread up (onPadMove's inverse)
const unisonGrip = computed(() => ({ x: (localDetune.value / 100) * PAD_W, y: (1 - localSpread.value / 100) * PAD_H }));
function onPadMove(p: PadPoint) {
	localDetune.value = Math.round(Math.max(0, Math.min(1, p.x / PAD_W)) * 100);
	localSpread.value = Math.round(Math.max(0, Math.min(1, 1 - p.y / PAD_H)) * 100);
}

</script>


<template>
	<KnobGroup v-model="localEnabled" title="Reverb" :color="color" :showToggle="showToggle" :showHeader="false">
		<div class="reverb-pedal" :class="{ 'is-rev': reverse }">
			<div class="panel-top">
				<span class="check-led" :class="{ on: localEnabled }" aria-hidden="true"></span>

				<div class="knob-cell mix">
					<Knob midi-id="reverb.mix" :value-text="`${Math.round(localMix * 100)}%`" v-model="localMix" label="MIX" :min="0" :max="1" :step="0.01" size="small"
						:disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'mix'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'mix'" class="custom-tooltip">
						{{ Math.round(localMix * 100) }}%
					</span>
				</div>

				<!-- DECAY, or while REV is on SWELL: how long each swell lasts (Next hit, 1 step … 2 beats,
				     one position each). One knob, so a MIDI controller linked to it sets either. -->
				<div class="knob-cell decay">
					<Knob midi-id="reverb.decay" v-model="decayKnob" :label="reverse ? 'SWELL' : 'DECAY'"
						:value-text="decayText" :min="reverse ? 0 : 0.2" :max="reverse ? 1 : 4.0" :step="reverse ? swellStep : 0.05" size="small"
						:disabled="!localEnabled" :color="color" :showMarkers="reverse" :markers="reverse ? swellMarkers : []"
						:markersOnly="reverse" :markersOffsetDeg="reverse ? -90 : -6" @knobStart="activeKnob = 'decay'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'decay'" class="custom-tooltip">
						{{ decayText }}
					</span>
				</div>

				<div class="knob-cell tone">
					<Knob midi-id="reverb.tone" :value-text="toneLabel" v-model="localTone" label="TONE" :min="0" :max="1" :step="0.01" size="small"
						:disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'tone'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'tone'" class="custom-tooltip">
						{{ toneLabel }}
					</span>
				</div>

				<!-- REV (PR 126): in the corner beside TONE, where PRE was (the delay's and the
				     overdrive's switches sit there too). PR 105 had it on the ribbon, under the LED. -->
				<PedalSwitch :model-value="reverse" label="REV" aria-label="Reverse reverb" class="rev-switch"
					title="Reverse: each hit's reverb swells into the next hit" :disabled="!localEnabled"
					@update:model-value="emit('update:reverse', $event)" />
			</div>

			<div class="panel-seam" aria-hidden="true"></div>

			<div class="panel-bottom">
				<div class="effect-label">reverb</div>
				<button class="footswitch" type="button" :aria-pressed="localEnabled" aria-label="Reverb pedal"
					@click="localEnabled = !localEnabled" @keydown.space.prevent="localEnabled = !localEnabled"
					@keydown.enter.prevent="localEnabled = !localEnabled" />
			</div>
		</div>
	</KnobGroup>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Knob from '../Knob.vue';
import KnobGroup from '../KnobGroup.vue';
import PedalSwitch from './PedalSwitch.vue';
import { DEFAULT_SWELL, SWELLS } from '../../audio/reverb/reverse';

const props = withDefaults(defineProps<{
	showToggle?: boolean;
	enabled: boolean;
	mix: number;
	decay: number;
	tone: number;          // 0 = dark, 1 = bright
	reverse?: boolean;     // REV: the reverb backwards (src/audio/reverb/reverse.ts)
	swell?: string;        // REV's length: 'next' or a fixed one
	audioCtx?: AudioContext;
	color?: string;
}>(), {
	showToggle: true,
	color: '#7c9bff',
	tone: 0.5,
	reverse: false,
	swell: DEFAULT_SWELL
});

const emit = defineEmits<{
	(e: 'update:enabled', v: boolean): void;
	(e: 'update:mix', v: number): void;
	(e: 'update:decay', v: number): void;
	(e: 'update:tone', v: number): void;
	(e: 'update:reverse', v: boolean): void;
	(e: 'update:swell', v: string): void;
}>();

const localEnabled = ref<boolean>(props.enabled);
const localMix = ref<number>(props.mix);
const localDecay = ref<number>(props.decay);
const localTone = ref<number>(props.tone);

const activeKnob = ref<null | 'mix' | 'decay' | 'tone'>(null);

// SWELL (DECAY while REV is on): one knob position per length
const swellMarkers = SWELLS.map((_, i) => i / (SWELLS.length - 1));
const swellStep = 1 / (SWELLS.length - 1);
const swellIndex = computed(() => Math.max(0, SWELLS.findIndex((d) => d.id === props.swell)));
const swellKnob = computed<number>({
	get: () => swellIndex.value / (SWELLS.length - 1),
	set: (v: number) => {
		const i = Math.max(0, Math.min(SWELLS.length - 1, Math.round(v * (SWELLS.length - 1))));
		if (i !== swellIndex.value) emit('update:swell', SWELLS[i].id);
	},
});
const swellText = computed(() => SWELLS[swellIndex.value].label);
// The knob: DECAY's seconds, or SWELL's position while REV is on
const decayKnob = computed<number>({
	get: () => (props.reverse ? swellKnob.value : localDecay.value),
	set: (v: number) => {
		if (props.reverse) swellKnob.value = v;
		else localDecay.value = v;
	},
});
const decayText = computed(() => (props.reverse ? swellText.value : `${localDecay.value.toFixed(2)} s`));

const toneLabel = computed(() => {
	const t = localTone.value;
	if (t <= 0.25) return 'Dark';
	if (t >= 0.75) return 'Bright';
	return 'Neutral';
});

watch(localEnabled, v => emit('update:enabled', v));
watch(localMix, v => emit('update:mix', Math.max(0, Math.min(1, v))));
watch(localDecay, v => emit('update:decay', Math.max(0.2, Math.min(4.0, v))));
watch(localTone, v => emit('update:tone', Math.max(0, Math.min(1, v))));

watch(() => props.enabled, v => (localEnabled.value = v));
watch(() => props.mix, v => { if (v !== localMix.value) localMix.value = v; });
watch(() => props.decay, v => { if (v !== localDecay.value) localDecay.value = v; });
watch(() => props.tone, v => { if (v !== localTone.value) localTone.value = v; });
</script>

<style scoped>
.reverb-pedal {
	display: grid;
	grid-template-rows: auto 8px auto;
	width: 100%;
	opacity: .9;
}

.panel-top {
	position: relative;
	border-radius: 8px 8px 0 0;
	padding: 12px 0px 2px;

	background: linear-gradient(var(--pedal-hi, #ccc5b4), var(--pedal-lo, #a39277));

	box-shadow:
		inset 0 1px 0 rgba(255, 255, 255, .35),
		0 1px 0 rgba(0, 0, 0, .35);

	display: grid;
	grid-template-columns: 1fr 1fr;
	grid-template-rows: auto auto auto;
	grid-template-areas:
		"led   led"
		"decay   mix"
		"tone  sw";
	row-gap: 4px;
	align-items: center;
	justify-items: center;
}

.check-led {
	grid-area: led;
	width: 12px;
	height: 12px;
	border-radius: 50%;
	background: #7a1f19;
	box-shadow: 0 0 0 1px rgba(0, 0, 0, .55) inset;
	margin-top: 2px;
}

.check-led.on {
	background: #e53935;
	box-shadow:
		0 0 0 1px rgba(0, 0, 0, .55) inset,
		0 0 8px 3px rgba(229, 57, 53, .6),
		0 0 18px 6px rgba(229, 57, 53, .35);
}

.mix {
	grid-area: mix;
}

.decay {
	grid-area: decay;
}

.tone {
	grid-area: tone;
}

/* REV: in TONE's row, beside it */
.reverb-pedal .rev-switch {
	position: static;
	grid-area: sw;
}

.knob-cell {
	width: min-content;
	text-align: center;
	position: relative;
	justify-self: center;
}

.custom-tooltip {
	position: absolute;
	left: 50%;
	transform: translateX(-50%);
	top: -22px;
	padding: 2px 6px;
	font-size: 12px;
	line-height: 1.2;
	background: rgba(0, 0, 0, .85);
	color: #fff;
	border-radius: 4px;
	white-space: nowrap;
	pointer-events: none;
	user-select: none;
}

.tone .custom-tooltip {
	top: initial;
	bottom: -18px;
}

.panel-seam {
	height: 25px;
	border-radius: 2px;

	background: linear-gradient(var(--pedal-hi, #ccc5b4), var(--pedal-lo, #a39277));
	box-shadow: inset 0 1px 0 rgba(255, 255, 255, .35);
}

.panel-bottom {
	border-radius: 8px;
	padding: 8px;
	background: linear-gradient(var(--pedal-foot-hi, var(--pedal-hi, #ccc5b4)), var(--pedal-foot-lo, var(--pedal-lo, #a39277)));
	box-shadow:
		inset 0 1px 0 rgba(255, 255, 255, .3),
		0 1px 0 rgba(0, 0, 0, .35);
}

.footswitch {
	display: block;
	width: 100%;
	height: 75px;
	border: 0;
	border-radius: 8px;
	background: linear-gradient(var(--pedal-switch-hi, #3f3c3f), var(--pedal-switch-lo, #2d2b2f));
	box-shadow:
		inset 0 1px 0 rgba(255, 255, 255, .06),
		inset 0 -10px 16px rgba(0, 0, 0, .35);
	cursor: pointer;
	position: relative;
}

.footswitch::before {
	content: "";
	position: absolute;
	inset: 8px;
	border-radius: 8px;
	box-shadow: 0 0 0 2px #2d2b2f inset;
	opacity: .8;
	pointer-events: none;
}

.footswitch:active {
	transform: translateY(1px);
	filter: brightness(.96);
}

.effect-label {
	text-align: center;
	line-height: 1;
	padding-bottom: 8px;
	text-shadow: var(--pedal-name-shadow, 0px 0px 8px black);
	color: var(--pedal-name, white);
}
</style>

<template>
	<KnobGroup v-model="localEnabled" title="Reverb" :color="color" :showToggle="showToggle" :showHeader="false">
		<div class="reverb-pedal">
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

				<div class="knob-cell decay">
					<Knob midi-id="reverb.decay" :value-text="`${localDecay.toFixed(2)} s`" v-model="localDecay" label="DECAY" :min="0.2" :max="4.0" :step="0.05" size="small"
						:disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'decay'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'decay'" class="custom-tooltip">
						{{ localDecay.toFixed(2) }} s
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

				<!-- PRE: the pre-delay, ms before the tail starts; notches at 1/64 and 1/32 of a bar -->
				<div class="knob-cell pre">
					<Knob midi-id="reverb.preDelay" :value-text="preLabel" v-model="localPreDelay" label="PRE" :min="0" :max="PRE_DELAY_MAX_MS" :step="1" size="small"
						:detents="preDetents" :disabled="!localEnabled" :color="color" @knobStart="activeKnob = 'pre'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'pre'" class="custom-tooltip">
						{{ preLabel }}
					</span>
				</div>
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
import { clampPreDelayMs, preDelayDetents, preDelayLabel, PRE_DELAY_MAX_MS } from '../../audio/reverb/preDelay';

const props = withDefaults(defineProps<{
	showToggle?: boolean;
	enabled: boolean;
	mix: number;
	decay: number;
	tone: number;          // 0 = dark, 1 = bright
	preDelay?: number;     // ms, 0–250
	tempo?: number;        // BPM, for PRE's notches
	audioCtx?: AudioContext;
	color?: string;
}>(), {
	showToggle: true,
	color: '#7c9bff',
	tone: 0.5,
	preDelay: 0,
	tempo: 120
});

const emit = defineEmits<{
	(e: 'update:enabled', v: boolean): void;
	(e: 'update:mix', v: number): void;
	(e: 'update:decay', v: number): void;
	(e: 'update:tone', v: number): void;
	(e: 'update:preDelay', v: number): void;
}>();

const localEnabled = ref<boolean>(props.enabled);
const localMix = ref<number>(props.mix);
const localDecay = ref<number>(props.decay);
const localTone = ref<number>(props.tone);
const localPreDelay = ref<number>(props.preDelay);

const activeKnob = ref<null | 'mix' | 'decay' | 'tone' | 'pre'>(null);

const preDetents = computed(() => preDelayDetents(props.tempo).map((d) => d.ms));
const preLabel = computed(() => preDelayLabel(localPreDelay.value, props.tempo));

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
watch(localPreDelay, v => emit('update:preDelay', clampPreDelayMs(v)));

watch(() => props.enabled, v => (localEnabled.value = v));
watch(() => props.mix, v => { if (v !== localMix.value) localMix.value = v; });
watch(() => props.decay, v => { if (v !== localDecay.value) localDecay.value = v; });
watch(() => props.tone, v => { if (v !== localTone.value) localTone.value = v; });
watch(() => props.preDelay, v => { if (v !== localPreDelay.value) localPreDelay.value = v; });
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
	padding: 12px 0px 2px; /* 10px before PRE; the four knobs need the room */

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
		"tone  pre";
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

.pre {
	grid-area: pre;
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

.tone .custom-tooltip,
.pre .custom-tooltip {
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

<!-- components/modules/EnvelopeModule.vue -->
<!-- The Envelope card (PR 77): a screen that draws the amp envelope and can be dragged (the
     peak sideways for Attack, the end point for Decay; ShapePad.vue), with a mini knob for
     each beside it. `classic` is the card as it was, two knobs, which the phone's Sound page
     keeps (inside its own SectionWrap). -->
<template>
	<div v-if="classic" class="pt-subblock">
		<div class="pt-knob-row">
			<div class="position-relative text-center">
				<Knob :value-text="`${Math.round(attackMsLocal)} ms`" v-model="attackNorm" label="Attack" size="small" :min="0" :max="100" :step="1"
					:disabled="!localEnabled" :color="color" @knobStart="onAttackStart" @knobEnd="onAttackEnd" />
				<span v-if="activeKnob === 'attack'" class="custom-tooltip">
					{{ Math.round(attackMsLocal) }} ms
				</span>
			</div>
			<div class="position-relative text-center">
				<Knob :value-text="`${Math.round(decayMsLocal)} ms`" v-model="decayNorm" label="Decay" size="small" :min="0" :max="100" :step="1"
					:disabled="!localEnabled" :color="color" @knobStart="onDecayStart" @knobEnd="onDecayEnd" />
				<span v-if="activeKnob === 'decay'" class="custom-tooltip">
					{{ Math.round(decayMsLocal) }} ms
				</span>
			</div>
		</div>
	</div>

	<section v-else class="pt-card sp-card" aria-label="Envelope">
		<div class="sp-body">
			<ShapePad :w="PAD_W" :h="PAD_H" title="Envelope" titleRight :readout="`${Math.round(attackMsLocal)} ms · ${Math.round(decayMsLocal)} ms`"
				:handles="handles" :active="grip" :disabled="!localEnabled" @start="onPadStart" @move="onPadMove" @end="onPadEnd">
				<path :d="shape" class="sp-line sp-fill" />
			</ShapePad>
			<div class="sp-minis">
				<div class="sp-mini">
					<Knob midi-id="env.attack" :value-text="`${Math.round(attackMsLocal)} ms`" v-model="attackNorm" label="Attack" hideLabel size="mini" :min="0" :max="100" :step="1"
						:disabled="!localEnabled" :color="color" @knobStart="onAttackStart" @knobEnd="onAttackEnd" />
					<span>Attack</span>
				</div>
				<div class="sp-mini">
					<Knob midi-id="env.decay" :value-text="`${Math.round(decayMsLocal)} ms`" v-model="decayNorm" label="Decay" hideLabel size="mini" :min="0" :max="100" :step="1"
						:disabled="!localEnabled" :color="color" @knobStart="onDecayStart" @knobEnd="onDecayEnd" />
					<span>Decay</span>
				</div>
			</div>
		</div>
	</section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Knob from '../Knob.vue';
import ShapePad, { nearestHandle, type PadPoint } from '../ShapePad.vue';
import { ENV_MAX_MS, ENV_TOP, envelopePts, timeX, toPath, xTime } from '../../lib/shapeViews';

const props = withDefaults(
	defineProps<{
		enabled: boolean;
		attackMs: number;
		decayMs: number;
		title?: string;
		color?: string;
		showToggle?: boolean;
		attackMinMs?: number;
		attackMaxMs?: number;
		decayMinMs?: number;
		decayMaxMs?: number;
		attackLog?: boolean;
		decayLog?: boolean;
		classic?: boolean;
	}>(),
	{
		title: 'Envelope',
		color: '#4CAF50',
		showToggle: false,
		attackMinMs: 1,
		attackMaxMs: 100,
		decayMinMs: 50,
		decayMaxMs: 2000,
		attackLog: true,
		decayLog: false,
		classic: false
	}
);

const emit = defineEmits<{
	(e: 'update:enabled', v: boolean): void;
	(e: 'update:attackMs', v: number): void;
	(e: 'update:decayMs', v: number): void;
	// surface knob press/release so parent can react
	(e: 'attack-knob-start'): void;
	(e: 'attack-knob-end'): void;
	(e: 'decay-knob-start'): void;
	(e: 'decay-knob-end'): void;
}>();

const localEnabled = ref<boolean>(props.enabled);

const attackNorm = ref<number>(
	msToNorm(props.attackMs ?? 20, props.attackMinMs, props.attackMaxMs, props.attackLog)
);
const decayNorm = ref<number>(
	msToNorm(props.decayMs ?? 400, props.decayMinMs, props.decayMaxMs, props.decayLog)
);

const attackMsLocal = ref<number>(
	normToMs(attackNorm.value, props.attackMinMs, props.attackMaxMs, props.attackLog)
);
const decayMsLocal = ref<number>(
	normToMs(decayNorm.value, props.decayMinMs, props.decayMaxMs, props.decayLog)
);

watch(
	() => props.enabled,
	(v) => {
		localEnabled.value = v;
	}
);

watch(
	() => props.attackMs,
	(v) => {
		const ms = clampMs(v ?? 20, props.attackMinMs, props.attackMaxMs);
		attackNorm.value = msToNorm(ms, props.attackMinMs, props.attackMaxMs, props.attackLog);
		attackMsLocal.value = ms;
	}
);

watch(
	() => props.decayMs,
	(v) => {
		const ms = clampMs(v ?? 400, props.decayMinMs, props.decayMaxMs);
		decayNorm.value = msToNorm(ms, props.decayMinMs, props.decayMaxMs, props.decayLog);
		decayMsLocal.value = ms;
	}
);

watch(localEnabled, (v) => emit('update:enabled', v));

watch(attackNorm, (n) => {
	const ms = normToMs(n, props.attackMinMs, props.attackMaxMs, props.attackLog);
	attackMsLocal.value = ms;
	emit('update:attackMs', Math.round(ms));
});

watch(decayNorm, (n) => {
	const ms = normToMs(n, props.decayMinMs, props.decayMaxMs, props.decayLog);
	decayMsLocal.value = ms;
	emit('update:decayMs', Math.round(ms));
});

const activeKnob = ref<null | 'attack' | 'decay'>(null);

// Emitters that also manage the tooltip state
function onAttackStart() {
	activeKnob.value = 'attack';
	emit('attack-knob-start');
}

function onAttackEnd() {
	activeKnob.value = null;
	emit('attack-knob-end');
}

function onDecayStart() {
	activeKnob.value = 'decay';
	emit('decay-knob-start');
}

function onDecayEnd() {
	activeKnob.value = null;
	emit('decay-knob-end');
}

// The screen: the envelope's shape, and its two grips
const PAD_W = 110;
const PAD_H = 88;
const shape = computed(() => toPath(envelopePts(attackMsLocal.value, decayMsLocal.value, PAD_W, PAD_H)));
const handles = computed(() => [
	{ id: 'attack', x: timeX(attackMsLocal.value, PAD_W, ENV_MAX_MS), y: ENV_TOP },
	{ id: 'decay', x: timeX(attackMsLocal.value + decayMsLocal.value, PAD_W, ENV_MAX_MS), y: PAD_H - 14 },
]);
const grip = ref('');
function onPadStart(p: PadPoint) {
	grip.value = nearestHandle(handles.value, p);
	if (grip.value === 'attack') onAttackStart(); else onDecayStart();
}
function onPadMove(p: PadPoint) {
	const ms = xTime(p.x, PAD_W, ENV_MAX_MS);
	if (grip.value === 'attack') attackNorm.value = msToNorm(Math.round(ms), props.attackMinMs, props.attackMaxMs, props.attackLog);
	else decayNorm.value = msToNorm(Math.round(ms - attackMsLocal.value), props.decayMinMs, props.decayMaxMs, props.decayLog);
}
function onPadEnd() {
	if (grip.value === 'attack') onAttackEnd(); else onDecayEnd();
}

// helpers
function clampMs(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}

function normToMs(norm: number, min: number, max: number, log: boolean): number {
	const t = Math.max(0, Math.min(100, norm)) / 100;
	if (!log) return min + (max - min) * t;
	const ratio = max / min;
	return min * Math.pow(ratio, t);
}

function msToNorm(ms: number, min: number, max: number, log: boolean): number {
	const x = clampMs(ms, min, max);
	if (!log) return ((x - min) / (max - min)) * 100;
	const ratio = max / min;
	return (Math.log(x / min) / Math.log(ratio)) * 100;
}
</script>

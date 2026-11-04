<!-- components/Knob.vue -->
<template>
	<!-- A slider for keyboards and screen readers: Tab to it, then the arrow keys (see onKeydown) -->
	<div class="knob-wrapper" :class="[`knob-${props.size}`, { disabled: props.disabled }]" role="slider"
		:tabindex="props.disabled ? -1 : 0" :aria-label="label" :aria-valuemin="props.min"
		:aria-valuemax="props.max" :aria-valuenow="props.modelValue" :aria-valuetext="props.valueText"
		:aria-disabled="props.disabled" @mousedown="startDrag" @touchstart.prevent="startDrag($event, true)"
		@keydown="onKeydown" @blur="endKeyboardTurn">
		<div class="knob-label">{{ label }}</div>

		<div class="knob-dial">
			<div class="dial-grip"
				:style="{ backgroundColor: props.disabled ? 'rgba(34,34,34,.2)' : 'var(--knob-face, #222)' }">
				<div class="dial-rotor" :style="{ transform: `rotate(${rotation}deg)` }"></div>
			</div>

			<svg class="dial-svg" viewBox="0 0 100 100" aria-hidden="true">
				<defs>
					<linearGradient :id="gradId" x1="20" y1="76" x2="80" y2="76" gradientUnits="userSpaceOnUse">
						<stop offset="0%" :stop-color="arcStartColor" />
						<stop offset="100%" :stop-color="arcEndColor" />
					</linearGradient>
				</defs>

				<!-- Dots only when requested -->
				<g v-if="showMarkers && markers.length" class="dial-markers">
					<circle v-for="(m, i) in markers" :key="i" :cx="polarXY(m).x" :cy="polarXY(m).y" :r="markerR" :fill="props.disabled
						? 'var(--knob-arc-disabled, #555)'
						: i === activeMarkerIndex
							? 'var(--knob-marker-active, #e6c6ff)'
							: 'var(--knob-marker, rgba(192,120,255,.55))'
						" />
				</g>

				<!-- Hide the solid arc when markersOnly is true -->
				<path v-if="showArcPaths" d="M20,76 A 40 40 0 1 1 80 76" fill="none" :stroke="trackColor"
					stroke-width="6" />
				<path v-if="showArcPaths" d="M20,76 A 40 40 0 1 1 80 76" fill="none" :stroke="activeStroke"
					stroke-width="6" :style="{ strokeDashoffset: 184 - 184 * ((rotation + 132) / 264) }" />
			</svg>
		</div>
	</div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
	modelValue: Number,
	min: { type: Number, default: 0 },
	max: { type: Number, default: 1 },
	step: { type: Number, default: 0.01 },
	label: String,
	// What a screen reader says for the value, such as "120 ms", when the knob's own number
	// isn't the real value (a 0..1 position, an index); otherwise it reads the number
	valueText: { type: String, default: undefined },

	color: { type: String, default: '#23CDE8' },
	useThemeArc: { type: Boolean, default: true },

	arcStart: { type: String, default: null },
	arcEnd: { type: String, default: null },

	size: { type: String, default: 'large' },
	disabled: { type: Boolean, default: false },

	showMarkers: { type: Boolean, default: false },
	markers: { type: Array, default: () => [] },
	markersOnly: { type: Boolean, default: false },
	// small rotation to line up with tick
	markersOffsetDeg: { type: Number, default: -6 }
});

const emit = defineEmits(['update:modelValue', 'knobStart', 'knobEnd']);

// rotation math (−132°..+132° sweep)
const rotation = computed(() => {
	const percent = (props.modelValue - props.min) / (props.max - props.min);
	return percent * 264 - 132;
});

// Markers
const norm = computed(() => {
	const pct = (props.modelValue - props.min) / (props.max - props.min);
	return Math.min(1, Math.max(0, pct || 0));
});

const activeMarkerIndex = computed(() => {
	if (!props.markers?.length) return -1;
	let best = -1;
	let dmin = Infinity;
	props.markers.forEach((m, i) => {
		const d = Math.abs(m - norm.value);
		if (d < dmin) {
			dmin = d;
			best = i;
		}
	});
	return best;
});

const markerR = computed(() =>
	props.size === 'small' ? 2 : props.size === 'medium' ? 2.6 : 3
);

const SWEEP = 264;
const START = -132;
function polarXY(t /* 0..1 */) {
	const a = ((START + props.markersOffsetDeg + t * SWEEP) * Math.PI) / 180;
	const R = 44;
	const CX = 50;
	const CY = 50;
	return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
}

// ids for gradient (avoid collisions)
const gradId = `kgrad-${Math.random().toString(36).slice(2)}`;
const showArcPaths = computed(() => !props.markersOnly);

const trackColor = computed(() =>
	props.disabled ? 'var(--knob-track-disabled, #555)' : 'var(--knob-track, #333)'
);

const arcStartColor = computed(
	() => props.arcStart || 'var(--knob-arc-start, #74d0ff)'
);
const arcEndColor = computed(
	() => props.arcEnd || 'var(--knob-arc-end,   #c471ff)'
);

// active arc stroke: theme gradient or single color
const activeStroke = computed(() => {
	if (props.disabled) return 'var(--knob-arc-disabled, #555)';
	if (props.useThemeArc || (props.arcStart && props.arcEnd)) return `url(#${gradId})`;
	return props.color;
});

// drag behavior
let startY = 0;
let startVal = 0;

function startDrag(e, isTouch = false) {
	if (props.disabled) return;
	const move = isTouch ? 'touchmove' : 'mousemove';
	const end = isTouch ? 'touchend' : 'mouseup';

	startY = isTouch ? e.touches[0].pageY : e.pageY;
	startVal = props.modelValue;
	emit('knobStart');

	function onMove(ev) {
		const currentY = isTouch ? ev.touches[0].pageY : ev.pageY;
		const deltaY = startY - currentY;
		const sensitivity = 0.005 * (props.max - props.min);
		let newVal = startVal + deltaY * sensitivity;
		newVal = Math.min(
			props.max,
			Math.max(
				props.min,
				Math.round(newVal / props.step) * props.step
			)
		);
		emit('update:modelValue', newVal);
	}

	function onUp() {
		window.removeEventListener(move, onMove);
		window.removeEventListener(end, onUp);
		emit('knobEnd');
	}

	window.addEventListener(move, onMove);
	window.addEventListener(end, onUp);
}

// keyboard
// Arrow keys: one step, or about 1% of the range on a knob with more than 300 steps.
// Shift+arrow, Page Up/Down: about 10%. Home/End: minimum/maximum. Up and Right turn it up.
// Space is left alone: it plays and stops the sequencer everywhere.
const FINE_STEPS_MAX = 300;
let keyboardTurning = false;

function snap(v) {
	return Math.min(props.max, Math.max(props.min, Math.round(v / props.step) * props.step));
}

function onKeydown(e) {
	if (props.disabled || e.altKey || e.ctrlKey || e.metaKey) return;
	const range = props.max - props.min;
	const step = props.step > 0 ? props.step : range / 100;
	const small = range / step <= FINE_STEPS_MAX ? step : Math.max(step, range / 100);
	const big = Math.max(small, range / 10);
	const value = props.modelValue;

	let next;
	switch (e.key) {
		case 'ArrowUp':
		case 'ArrowRight': next = value + (e.shiftKey ? big : small); break;
		case 'ArrowDown':
		case 'ArrowLeft': next = value - (e.shiftKey ? big : small); break;
		case 'PageUp': next = value + big; break;
		case 'PageDown': next = value - big; break;
		case 'Home': next = props.min; break;
		case 'End': next = props.max; break;
		default: return;
	}
	e.preventDefault(); // don't scroll the page

	// Like a drag: knobStart before the first change (parents show the value, or the envelope
	// view), knobEnd when the knob loses focus
	if (!keyboardTurning) {
		keyboardTurning = true;
		emit('knobStart');
	}
	next = snap(next);
	if (next !== value) emit('update:modelValue', next);
}

function endKeyboardTurn() {
	if (!keyboardTurning) return;
	keyboardTurning = false;
	emit('knobEnd');
}
</script>

<style scoped>
/* Keyboard focus only (a mouse click doesn't show it), like the app's buttons */
.knob-wrapper:focus {
	outline: none;
}

.knob-wrapper:focus-visible {
	outline: 2px solid hsl(var(--pt-accent) 80% 60%);
	outline-offset: 2px;
	border-radius: 8px;
}

.drive-pedal .level .knob-label,
.drive-pedal .drive .knob-label {
	position: absolute;
	bottom: -10px;
	width: 40px;
}

.drive-pedal .knob-label,
.reverb-pedal .knob-label,
.delay-pedal .knob-label {
	color: black;
	font-weight: bold;
}

.drive-pedal .tone .knob-label,
.reverb-pedal .tone .knob-label,
.delay-pedal .tone .knob-label {
	position: absolute;
	top: -14px;
	width: 40px;
}

.reverb-pedal .mix .knob-label,
.reverb-pedal .decay .knob-label {
	position: absolute;
	bottom: -10px;
	width: 40px;
}

.delay-pedal .time .knob-label,
.delay-pedal .mix .knob-label {
	position: absolute;
	bottom: -10px;
	width: 40px;
}
</style>

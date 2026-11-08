<!-- components/Knob.vue -->
<template>
	<!-- A slider for keyboards and screen readers: Tab to it, then the arrow keys (see onKeydown) -->
	<!-- In MIDI learn mode (useMidiLearn.ts) a knob with a midi-id is outlined, a click or Enter
		 arms it, and a badge says which controller knob it follows -->
	<div class="knob-wrapper"
		:class="[`knob-${props.size}`, { disabled: props.disabled, 'midi-learnable': learnable, 'midi-armed': armed, 'at-detent': onDetent }]"
		role="slider" :tabindex="props.disabled ? -1 : 0" :aria-label="label" :aria-valuemin="props.min"
		:aria-valuemax="props.max" :aria-valuenow="props.modelValue" :aria-valuetext="props.valueText"
		:aria-disabled="props.disabled" :aria-description="learnable ? (midiLabel ? `Follows ${midiLabel}` : 'Not linked') : undefined"
		:data-midi-id="props.midiId || undefined"
		@mousedown="onPress($event)" @touchstart.prevent="onPress($event, true)"
		@keydown="onKeydown" @blur="endKeyboardTurn">
		<div v-if="!props.hideLabel" class="knob-label">{{ label }}</div>

		<div class="knob-dial">
			<span v-if="learnable && midiLabel" class="knob-midi-badge" aria-hidden="true">{{ midiLabel }}</span>
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
				<path v-if="showArcPaths && !props.bipolar" d="M20,76 A 40 40 0 1 1 80 76" fill="none" :stroke="activeStroke"
					stroke-width="6" :style="{ strokeDashoffset: 184 - 184 * ((rotation + 132) / 264) }" />
				<!-- Bipolar: the arc grows from the top (zero) towards either side, and a tick marks zero -->
				<template v-if="showArcPaths && props.bipolar">
					<path v-if="bipolarArc" :d="bipolarArc" fill="none" :stroke="activeStroke" stroke-width="6" />
					<line x1="50" y1="3" x2="50" y2="8" class="dial-zero"
						:class="{ 'dial-detent': zeroIsDetent, 'is-on': zeroIsDetent && onDetent && props.modelValue === 0 }" />
				</template>
				<!-- Soft notches (`detents`): a tick at each in the notch colour, lit while the knob is on it -->
				<line v-for="(t, i) in detentTicks" :key="`detent-${i}`" :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2"
					class="dial-zero dial-detent" :class="{ 'is-on': t.on }" />

				<!-- Something else moving this setting (the LFO): its range as a faint outer arc, and
					 where it is now as a dot on the ring. The knob itself stays where it was set. -->
				<path v-if="modArc" :d="modArc" fill="none" :stroke="props.modColor" stroke-width="2.5"
					stroke-linecap="round" class="dial-mod-range" />
				<circle v-if="modDot" :cx="modDot.x" :cy="modDot.y" r="5" :fill="props.modColor"
					class="dial-mod-dot" />
			</svg>
		</div>
	</div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { useMidiLearn } from '../composables/useMidiLearn';
import { detentTravel, CONTROLLER_DETENT_HOLD } from '../lib/knobDetents';

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
	markersOffsetDeg: { type: Number, default: -6 },
	// How the turn maps to the value. 'linear': evenly. 'log': each part of the turn multiplies
	// the value by the same amount (min must be above 0), so short times or low frequencies get
	// as much of the turn as long or high ones; for example 5–2000 ms has 100 ms at half a turn.
	taper: { type: String, default: 'linear' },
	// Zero is in the middle of the turn (min = −max): the arc is drawn from the top
	bipolar: { type: Boolean, default: false },
	// Soft notches: values where a drag (or a MIDI controller's knob) holds for a moment, so
	// they're easy to land on, each with a tick on the ring (src/lib/knobDetents.ts). A bipolar
	// knob has one at zero unless given others; [] for none.
	detents: { type: Array, default: null },
	// No visible label (the label is still the knob's accessible name), for a knob sitting on
	// something that already says what it is, such as the mini knob on the Pulse tile
	hideLabel: { type: Boolean, default: false },
	// The LFO visualizer: where something else (the LFO) moves this setting right now, drawn as
	// a dot on the ring, and its whole range [low, high] as a faint outer arc. Values outside
	// min..max are drawn at the end. null: nothing drawn.
	modValue: { type: Number, default: null },
	modRange: { type: Array, default: null },
	// Amber: every theme's knob arcs are blue to purple or pink, so it stands apart from them
	modColor: { type: String, default: 'var(--lfo-mod, #ffc53d)' },
	// MIDI learn: this knob's id in MIDI_KNOBS (src/lib/midiLearn.ts), so a knob on a MIDI
	// controller can turn it. null: it can't be learned.
	midiId: { type: String, default: null }
});

const emit = defineEmits(['update:modelValue', 'knobStart', 'knobEnd']);

// Value ↔ position along the turn (0..1), by the taper
const isLog = computed(() => props.taper === 'log' && props.min > 0 && props.max > props.min);
function toPos(v) {
	if (isLog.value) return Math.log(Math.max(v, props.min) / props.min) / Math.log(props.max / props.min);
	return (v - props.min) / (props.max - props.min);
}
function fromPos(p) {
	const t = Math.min(1, Math.max(0, p));
	if (isLog.value) return props.min * Math.pow(props.max / props.min, t);
	return props.min + t * (props.max - props.min);
}

// rotation math (−132°..+132° sweep)
const rotation = computed(() => toPos(props.modelValue) * 264 - 132);

// Soft notches: a drag moves along their travel (see knobDetents.ts), slightly longer than the
// turn, and lands on the notch's exact value while it holds
const detentValues = computed(() => (props.detents ?? (props.bipolar ? [0] : []))
	.filter((v) => v > props.min && v < props.max));
const detentPoints = computed(() => detentValues.value.map((v) => ({ pos: toPos(v), value: v })));
const travel = computed(() => detentTravel(detentPoints.value));
// A MIDI controller's knob: the same notches, a lighter hold (its turn is short)
const controllerTravel = computed(() => detentTravel(detentPoints.value, CONTROLLER_DETENT_HOLD));
function valueAtTravel(t, along = travel.value) {
	const k = along.toKnob(t);
	return k.value ?? snap(fromPos(k.pos));
}
// On a notch now: the knob's pointer and that notch's tick light up in the notch colour
const onDetent = computed(() => detentValues.value.some((v) => Math.abs(v - props.modelValue) < 1e-9));
const zeroIsDetent = computed(() => props.bipolar && detentValues.value.includes(0));
// Ticks on the ring (a bipolar knob's zero already has one)
const detentTicks = computed(() => detentValues.value
	.filter((v) => !(props.bipolar && v === 0))
	.map((v) => {
		const a = ((toPos(v) * 264 - 132) * Math.PI) / 180;
		const at = (r) => [50 + r * Math.sin(a), 50 - r * Math.cos(a)];
		const [x1, y1] = at(42);
		const [x2, y2] = at(47);
		return { x1, y1, x2, y2, on: Math.abs(v - props.modelValue) < 1e-9 };
	}));

// Bipolar arc: from the top of the dial (radius 40 around 50,50, as the track) to the pointer
const bipolarArc = computed(() => {
	const deg = rotation.value;
	if (Math.abs(deg) < 0.5) return '';
	const a = (deg * Math.PI) / 180;
	const x = 50 + 40 * Math.sin(a);
	const y = 50 - 40 * Math.cos(a);
	return `M50,10 A 40 40 0 0 ${deg > 0 ? 1 : 0} ${x.toFixed(2)} ${y.toFixed(2)}`;
});

// LFO visualizer drawing: points on the dial's circle (the track: radius 40; the range arc
// just outside it, radius 47)
function dialPoint(v, r) {
	const deg = Math.min(1, Math.max(0, toPos(v) || 0)) * 264 - 132;
	const a = (deg * Math.PI) / 180;
	return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a), deg };
}
const modDot = computed(() => (props.modValue == null || props.disabled ? null : dialPoint(props.modValue, 40)));
const modArc = computed(() => {
	const r = props.modRange;
	if (!r || r.length !== 2 || props.disabled) return '';
	const a = dialPoint(Math.min(r[0], r[1]), 47);
	const b = dialPoint(Math.max(r[0], r[1]), 47);
	if (b.deg - a.deg < 0.5) return '';
	return `M${a.x.toFixed(2)},${a.y.toFixed(2)} A 47 47 0 ${b.deg - a.deg > 180 ? 1 : 0} 1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
});

// Markers
const norm = computed(() => Math.min(1, Math.max(0, toPos(props.modelValue) || 0)));

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
let startTravel = 0;

function startDrag(e, isTouch = false) {
	if (props.disabled) return;
	const move = isTouch ? 'touchmove' : 'mousemove';
	const end = isTouch ? 'touchend' : 'mouseup';

	startY = isTouch ? e.touches[0].pageY : e.pageY;
	startTravel = travel.value.toTravel(toPos(props.modelValue));
	emit('knobStart');

	function onMove(ev) {
		const currentY = isTouch ? ev.touches[0].pageY : ev.pageY;
		const deltaY = startY - currentY;
		// 200 px of drag is the whole turn, plus 14 px at each notch
		emit('update:modelValue', valueAtTravel(startTravel + deltaY * 0.005));
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
	// In MIDI learn mode, Enter arms the knob and Delete or Backspace unlinks it
	if (learnable.value && !e.altKey && !e.ctrlKey && !e.metaKey) {
		if (e.key === 'Enter') { e.preventDefault(); midiLearn.arm(props.midiId); return; }
		if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); midiLearn.clear(props.midiId); return; }
	}
	if (props.disabled || e.altKey || e.ctrlKey || e.metaKey) return;
	const range = props.max - props.min;
	const step = props.step > 0 ? props.step : range / 100;
	const small = range / step <= FINE_STEPS_MAX ? step : Math.max(step, range / 100);
	const big = Math.max(small, range / 10);
	const value = props.modelValue;

	let next;
	if (isLog.value) {
		// Steps along the turn: about 1% (Shift, Page Up/Down: 10%), at least one step of value
		const pos = toPos(value);
		const along = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1 }[e.key];
		if (along !== undefined) {
			const d = e.shiftKey && Math.abs(along) < 0.1 ? along * 10 : along;
			next = snap(fromPos(pos + d));
			if (next === value) next = snap(value + Math.sign(d) * step);
		}
	}
	if (next === undefined) switch (e.key) {
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

// MIDI learn (src/composables/useMidiLearn.ts)
const midiLearn = useMidiLearn();
const learnable = computed(() => !!props.midiId && midiLearn.state.learning);
const armed = computed(() => learnable.value && midiLearn.state.armed === props.midiId);
const midiLabel = computed(() => (props.midiId ? midiLearn.labelFor(props.midiId) : ''));

// A controller knob turns it as a drag would: knobStart first (the value tooltip, the
// envelope or filter view), the value along this knob's own curve and step, and knobEnd once
// the controller knob has rested a moment. A disabled knob ignores it, as it ignores the mouse.
const MIDI_REST_MS = 600;
let midiTurning = null;
function setPosition(position) {
	if (props.disabled) return;
	if (midiTurning) clearTimeout(midiTurning);
	else emit('knobStart');
	midiTurning = setTimeout(() => { midiTurning = null; emit('knobEnd'); }, MIDI_REST_MS);
	// Along the notches' travel too (with their lighter hold), so a controller can land on them
	const next = valueAtTravel(position * controllerTravel.value.length, controllerTravel.value);
	if (next !== props.modelValue) emit('update:modelValue', next);
}

let leaveMidiLearn = null;
onMounted(() => {
	if (props.midiId) leaveMidiLearn = midiLearn.register(props.midiId, { setPosition, disabled: () => props.disabled });
});
onBeforeUnmount(() => {
	leaveMidiLearn?.();
	if (midiTurning) clearTimeout(midiTurning);
});

// In learn mode a press arms the knob for the next controller knob turned, instead of turning it
function onPress(e, isTouch = false) {
	if (learnable.value) {
		e.preventDefault();
		midiLearn.arm(props.midiId);
		return;
	}
	startDrag(e, isTouch);
}
</script>

<style scoped>
/* The LFO visualizer's range arc and dot */
.dial-mod-range {
	opacity: 0.65;
	stroke-dasharray: none; /* the dial's paths are dashed for the value arc; not this one */
}

.dial-mod-dot {
	stroke: rgb(0 0 0 / 0.55);
	stroke-width: 1.5;
	stroke-dasharray: none;
}

/* Bipolar knobs: the tick at zero (top of the dial) */
.dial-zero {
	stroke: var(--knob-marker, rgba(192, 120, 255, .55));
	stroke-width: 3;
	stroke-linecap: round;
}

/* Soft notches: their ticks in the notch colour (each theme's --knob-detent, mint: apart from
   the blue-to-pink arcs and the LFO's amber); on a notch, its tick lights up and the pointer
   takes the colour too. Not on a greyed-out knob. */
.dial-zero.dial-detent {
	stroke: var(--knob-detent, rgba(94, 255, 176, 0.65));
}

.dial-zero.dial-detent.is-on {
	stroke: var(--knob-detent-on, #5effb0);
	stroke-width: 4.5;
	filter: drop-shadow(0 0 2.5px var(--knob-detent-on, #5effb0));
}

.knob-wrapper.at-detent:not(.disabled) {
	--knob-pointer: var(--knob-detent-on, #5effb0);
}

.knob-wrapper.disabled .dial-zero.dial-detent {
	stroke: var(--knob-arc-disabled, #555);
	filter: none;
}

/* MIDI learn mode: a learnable knob is outlined; the armed one glows; the badge names the
   controller knob it follows. Outlines don't move anything. */
.knob-wrapper.midi-learnable {
	outline: 1px dashed hsl(var(--pt-accent) 80% 62% / 0.75);
	outline-offset: 3px;
	border-radius: 8px;
	cursor: pointer;
}

.knob-wrapper.midi-armed {
	outline: 2px solid hsl(var(--pt-accent) 85% 62%);
	box-shadow: 0 0 14px hsl(var(--pt-accent) 90% 60% / 0.55);
	animation: midi-armed 0.9s ease-in-out infinite alternate;
}

@keyframes midi-armed {
	to {
		box-shadow: 0 0 4px hsl(var(--pt-accent) 90% 60% / 0.25);
	}
}

@media (prefers-reduced-motion: reduce) {
	.knob-wrapper.midi-armed {
		animation: none;
	}
}

.knob-midi-badge {
	position: absolute;
	top: -4px;
	right: -12px;
	z-index: 3;
	padding: 1px 4px;
	border-radius: 6px;
	font-size: 9px;
	line-height: 1.2;
	font-weight: 700;
	white-space: nowrap;
	color: #fff;
	background: hsl(var(--pt-accent) 70% 42%);
	box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
	pointer-events: none;
}

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

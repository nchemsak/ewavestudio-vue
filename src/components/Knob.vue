<!-- components/Knob.vue -->
<template>
	<div class="knob-wrapper" :class="[`knob-${props.size}`, { disabled: props.disabled }]"
		:aria-disabled="props.disabled" @mousedown="startDrag" @touchstart.prevent="startDrag($event, true)">
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
						: (i === activeMarkerIndex
							? 'var(--knob-marker-active, #e6c6ff)'
							: 'var(--knob-marker, rgba(192,120,255,.55))')" />
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
import { computed } from 'vue'

const props = defineProps({
	modelValue: Number,
	min: { type: Number, default: 0 },
	max: { type: Number, default: 1 },
	step: { type: Number, default: 0.01 },
	label: String,

	color: { type: String, default: '#23CDE8' },

	/** Use theme gradient for the arc by default */
	useThemeArc: { type: Boolean, default: true },

	/** Optional per-knob override gradient (keeps other knobs customizable) */
	arcStart: { type: String, default: null },   // e.g. "#74d0ff"
	arcEnd: { type: String, default: null },   // e.g. "#c471ff"

	size: { type: String, default: 'large' },
	disabled: { type: Boolean, default: false },

	/* Stepped marker mode */
	showMarkers: { type: Boolean, default: false },
	markers: { type: Array, default: () => [] },  // array of 0..1 positions
	markersOnly: { type: Boolean, default: false },     // if true: hide solid arc entirely
	markersOffsetDeg: { type: Number, default: -6 },        // small rotation to line up with tick
})


const emit = defineEmits(['update:modelValue', 'knobStart', 'knobEnd'])

/* rotation math (−132°..+132° sweep) */
const rotation = computed(() => {
	const percent = (props.modelValue - props.min) / (props.max - props.min)
	return percent * 264 - 132
})

/* Markers */
const norm = computed(() => {
	const pct = (props.modelValue - props.min) / (props.max - props.min)
	return Math.min(1, Math.max(0, pct || 0))
})
const activeMarkerIndex = computed(() => {
	if (!props.markers?.length) return -1
	let best = -1, dmin = Infinity
	props.markers.forEach((m, i) => {
		const d = Math.abs(m - norm.value)
		if (d < dmin) { dmin = d; best = i }
	})
	return best
})

const markerR = computed(() =>
	props.size === 'small' ? 2 : props.size === 'medium' ? 2.6 : 3
)
const SWEEP = 264
const START = -132
function polarXY(t /*0..1*/) {
	const a = (START + props.markersOffsetDeg + t * SWEEP) * Math.PI / 180
	const R = 44, CX = 50, CY = 50
	return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) }
}

/* ids for gradient (avoid collisions) */
const gradId = `kgrad-${Math.random().toString(36).slice(2)}`
const showArcPaths = computed(() => !props.markersOnly)

/* colors */
const trackColor = computed(() =>
	props.disabled ? 'var(--knob-track-disabled, #555)' : 'var(--knob-track, #333)'
)

const arcStartColor = computed(() =>
	props.arcStart || 'var(--knob-arc-start, #74d0ff)'
)
const arcEndColor = computed(() =>
	props.arcEnd || 'var(--knob-arc-end,   #c471ff)'
)

/* active arc stroke: theme gradient or single color */
const activeStroke = computed(() => {
	if (props.disabled) return 'var(--knob-arc-disabled, #555)'
	if (props.useThemeArc || (props.arcStart && props.arcEnd)) return `url(#${gradId})`
	return props.color
})


/* drag behavior */
let startY = 0
let startVal = 0
function startDrag(e, isTouch = false) {
	if (props.disabled) return
	const move = isTouch ? 'touchmove' : 'mousemove'
	const end = isTouch ? 'touchend' : 'mouseup'

	startY = isTouch ? e.touches[0].pageY : e.pageY
	startVal = props.modelValue
	emit('knobStart')

	function onMove(ev) {
		const currentY = isTouch ? ev.touches[0].pageY : ev.pageY
		const deltaY = startY - currentY
		const sensitivity = 0.005 * (props.max - props.min)
		let newVal = startVal + deltaY * sensitivity
		newVal = Math.min(props.max, Math.max(props.min, Math.round(newVal / props.step) * props.step))
		emit('update:modelValue', newVal)
	}
	function onUp() {
		window.removeEventListener(move, onMove)
		window.removeEventListener(end, onUp)
		emit('knobEnd')
	}
	window.addEventListener(move, onMove)
	window.addEventListener(end, onUp)
}
</script>

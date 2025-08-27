<!-- components/Knob.vue -->
<template>
	<div class="knob-wrapper" :class="[`knob-${props.size}`, { disabled: props.disabled }]"
		:aria-disabled="props.disabled" @mousedown="startDrag" @touchstart.prevent="startDrag($event, true)">
		<div class="knob-label">{{ label }}</div>

		<div class="knob-dial">
			<!-- Stationary face (carries the highlight) -->
			<div class="dial-grip" :style="{
				backgroundColor: props.disabled ? 'rgba(34,34,34,.2)' : 'var(--knob-face, #222)'
			}">
				<!-- Rotating inner rotor (carries the tick/pointer) -->
				<div class="dial-rotor" :style="{ transform: `rotate(${rotation}deg)` }"></div>
			</div>

			<!-- Arc -->
			<svg class="dial-svg" viewBox="0 0 100 100" aria-hidden="true">
				<defs>
					<linearGradient :id="gradId" x1="20" y1="76" x2="80" y2="76" gradientUnits="userSpaceOnUse">
						<stop offset="0%" :stop-color="arcStartColor" />
						<stop offset="100%" :stop-color="arcEndColor" />
					</linearGradient>
				</defs>

				<path d="M20,76 A 40 40 0 1 1 80 76" fill="none" :stroke="trackColor" stroke-width="6" />
				<path d="M20,76 A 40 40 0 1 1 80 76" fill="none" :stroke="activeStroke" stroke-width="6"
					:style="{ strokeDashoffset: 184 - 184 * ((rotation + 132) / 264) }" />
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

	/** Old behavior (single color) still supported */
	color: { type: String, default: '#23CDE8' },

	/** NEW: use theme gradient for the arc by default */
	useThemeArc: { type: Boolean, default: true },

	/** Optional per-knob override gradient (keeps other knobs customizable) */
	arcStart: { type: String, default: null },   // e.g. "#74d0ff"
	arcEnd: { type: String, default: null },   // e.g. "#c471ff"

	size: { type: String, default: 'large' },
	disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'knobStart', 'knobEnd'])

/* rotation math (−132°..+132° sweep) */
const rotation = computed(() => {
	const percent = (props.modelValue - props.min) / (props.max - props.min)
	return percent * 264 - 132
})

/* ids for gradient (avoid collisions) */
const gradId = `kgrad-${Math.random().toString(36).slice(2)}`

/* colors */
const trackColor = computed(() =>
	props.disabled ? 'var(--knob-track-disabled, #555)'
		: 'var(--knob-track, #333)'
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
	return props.color // legacy single-color arc
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

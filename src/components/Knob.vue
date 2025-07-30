<!-- components/Knob.vue -->
<template>
	<div class="knob-wrapper" :class="`knob-${props.size}`" @mousedown="startDrag"
		@touchstart.prevent="startDrag($event, true)">
		<div class="knob-dial">
			<div class="dial-grip" :style="{
				transform: `rotate(${rotation}deg)`,
				borderColor: color,
			}"></div>
			<svg class="dial-svg" viewBox="0 0 100 100">
				<path d="M20,76 A 40 40 0 1 1 80 76" fill="none" stroke="#333" stroke-width="6" />
				<path d="M20,76 A 40 40 0 1 1 80 76" fill="none" :stroke="color" stroke-width="6"
					:style="{ strokeDashoffset: 184 - 184 * ((rotation + 132) / 264) }" />
			</svg>
		</div>
		<div class="knob-label">{{ label }}</div>
	</div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';

const props = defineProps({
	modelValue: Number,
	min: { type: Number, default: 0 },
	max: { type: Number, default: 1 },
	step: { type: Number, default: 0.01 },
	label: String,
	color: { type: String, default: '#23CDE8' },
	size: { type: String, default: 'large' }, // new size prop
	disabled: { type: Boolean, default: false },
});


const emit = defineEmits(['update:modelValue']);

const rotation = computed(() => {
	const percent = (props.modelValue - props.min) / (props.max - props.min);
	return percent * 264 - 132;
});

let startY = 0;
let startVal = 0;

function startDrag(e, isTouch = false) {
	if (props.disabled) return;
	const move = isTouch ? 'touchmove' : 'mousemove';
	const end = isTouch ? 'touchend' : 'mouseup';

	startY = isTouch ? e.touches[0].pageY : e.pageY;
	startVal = props.modelValue;

	function onMove(ev) {
		const currentY = isTouch ? ev.touches[0].pageY : ev.pageY;
		const deltaY = startY - currentY;
		const sensitivity = 0.005 * (props.max - props.min); // increase to make knob more sensitive
		let newVal = startVal + deltaY * sensitivity;
		newVal = Math.min(props.max, Math.max(props.min, Math.round(newVal / props.step) * props.step));
		emit('update:modelValue', newVal);
	}

	function onUp() {
		window.removeEventListener(move, onMove);
		window.removeEventListener(end, onUp);
	}

	window.addEventListener(move, onMove);
	window.addEventListener(end, onUp);
}

</script>

<style scoped>
.knob-wrapper {
	margin: 10px;
	text-align: center;
	user-select: none;
}

.knob-large {
	width: 100px;
}

.knob-medium {
	width: 60px;
}

.knob-small {
	width: 40px;
}

.knob-dial {
	position: relative;
	width: 100%;
	aspect-ratio: 1;
}

.dial-grip {
	position: absolute;
	inset: 20%;
	width: auto;
	height: auto;
	background-color: #222;
	border-radius: 50%;
	transform: translate(-50%, -50%);
	box-shadow: inset 0 0 4px #000;
}

.dial-grip::after {
	content: "";
	position: absolute;
	top: 6%;
	left: 50%;
	width: 5%;
	height: 20%;
	background-color: #23CDE8;
	transform: translateX(-50%);
	border-radius: 2px;
}

.dial-svg {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	stroke-width: 8;
	stroke-dasharray: 184;
	stroke-linecap: round;
}

.knob-label {
	/* margin-top: 10px; */
	color: #ccc;
	font-size: 0.75rem;
	text-align: center;
}

.knob-stack {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 32px;
	padding: 20px;
}

.knob-wrapper.knob-small .knob-label {
	font-size: 0.65rem;
}

.knob-wrapper.knob-medium .knob-label {
	font-size: 0.75rem;
}

.knob-wrapper.knob-large .knob-label {
	font-size: 0.85rem;
}

.knob-wrapper:has(.disabled) {
  opacity: 0.5;
  pointer-events: none;
}
</style>

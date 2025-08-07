<!-- components/Knob.vue -->
<template>
	<div class="knob-wrapper" :class="`knob-${props.size}`" @mousedown="startDrag"
		@touchstart.prevent="startDrag($event, true)">
		<div class="knob-label">{{ label }}</div>
		<div class="knob-dial">
			<div class="dial-grip" :style="{
				transform: `rotate(${rotation}deg)`,
				borderColor: strokeColor,
				// backgroundColor: props.disabled ? '#444' : '#222',
				backgroundColor: props.disabled ? 'rgba(34, 34, 34, 0.2)' : '#222',
			}"></div>
			<svg class="dial-svg" viewBox="0 0 100 100">
				<path d="M20,76 A 40 40 0 1 1 80 76" fill="none" stroke="#333" stroke-width="6" />
				<path d="M20,76 A 40 40 0 1 1 80 76" fill="none" :stroke="strokeColor" stroke-width="6"
					:style="{ strokeDashoffset: 184 - 184 * ((rotation + 132) / 264) }" /> 
			</svg>
		</div>

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
	size: { type: String, default: 'large' },
	disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'knobStart', 'knobEnd']);


const rotation = computed(() => {
	const percent = (props.modelValue - props.min) / (props.max - props.min);
	return percent * 264 - 132;
});
const strokeColor = computed(() =>
	props.disabled ? '#666' : props.color
);

let startY = 0;
let startVal = 0;

function startDrag(e, isTouch = false) {
	if (props.disabled) return;
	const move = isTouch ? 'touchmove' : 'mousemove';
	const end = isTouch ? 'touchend' : 'mouseup';

	startY = isTouch ? e.touches[0].pageY : e.pageY;
	startVal = props.modelValue;
	emit('knobStart')
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
		emit('knobEnd');
	}

	window.addEventListener(move, onMove);
	window.addEventListener(end, onUp);
}

</script>

<style scoped></style>

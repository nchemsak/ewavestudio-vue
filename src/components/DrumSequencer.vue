<template>
	<div class="drum-sequencer container py-4">
		<div class="controls d-flex flex-wrap align-items-center justify-content-between mb-4">
			<div>
				<label class="form-label">Volume</label>
				<input type="range" min="0" max="1" step="0.01" v-model="volume" class="form-range seqOptin" />
			</div>
			<div>
				<label class="form-label">Tempo</label>
				<div class="d-flex align-items-center gap-2">
					<input type="number" v-model.number="tempo" class="form-control w-auto" />
					<button class="btn btn-secondary" @click="tempo -= 1">-1</button>
					<button class="btn btn-secondary" @click="tempo += 1">+1</button>
					<button class="btn btn-secondary" @click="tempo -= 5">-5</button>
					<button class="btn btn-secondary" @click="tempo += 5">+5</button>
				</div>
			</div>
			<button class="btn btn-primary" @click="togglePlay">
				<span v-if="isPlaying">Stop</span>
				<span v-else>Play</span>
			</button>
		</div>

		<div class="instrument-grid">
			<div v-for="instrument in instruments" :key="instrument.name" class="mb-3">
				<div class="d-flex align-items-center gap-2 mb-1">
					<div class="mute-indicator" :class="{ muted: instrument.muted }"
						@click="toggleMute(instrument.name)" role="button" aria-label="Toggle Mute"
						:title="instrument.muted ? 'Muted' : 'Playing'"></div>
					<strong>{{ instrument.label }}</strong>
				</div>


				<div class="d-flex pad-row">
					<div v-for="(active, index) in instrument.steps" :key="index"
						class="d-flex flex-column align-items-center me-1">
						<div :class="[
							'pad',
							{ selected: active },
							{ playing: index === currentStep }
						]" @mousedown="handleMouseDown($event, instrument.name, index)"
							@mouseenter="handleMouseEnter(instrument.name, index)" @dragstart.prevent>
						</div>
						<input v-if="active" type="range" min="0" max="1" step="0.05"
							v-model.number="instrument.velocities[index]" class="velocity-slider" />
					</div>


				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';


// Reuse shared AudioContext
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const volume = ref(0.75);
const tempo = ref(100);
const isPlaying = ref(false);
const currentStep = ref(-1);

const masterGain = audioCtx.createGain();
masterGain.gain.value = volume.value;
masterGain.connect(audioCtx.destination);

const instruments = ref([
	// { name: 'kick', label: 'Kick', buffer: null, steps: Array(16).fill(false) },
	{ name: 'kick', label: 'Kick', buffer: null, muted: false, steps: Array(16).fill(false), velocities: Array(16).fill(1.0) },
	{ name: 'snare', label: 'Snare', buffer: null, muted: false, steps: Array(16).fill(false), velocities: Array(16).fill(1.0) },
	{ name: 'hihat', label: 'Hi-Hat', buffer: null, muted: false, steps: Array(16).fill(false), velocities: Array(16).fill(1.0) },
]);

let loopId = null;
let startTime = 0;
let stepIndex = 0;

function togglePad(instrumentName, index) {
	const instrument = instruments.value.find(i => i.name === instrumentName);
	if (instrument) instrument.steps[index] = !instrument.steps[index];
}

function playBuffer(buffer, time, velocity = 1) {
	const source = audioCtx.createBufferSource();
	source.buffer = buffer;
	const gain = audioCtx.createGain();
	gain.gain.value = volume.value * velocity;
	source.connect(gain).connect(masterGain);
	source.start(time);
}

function schedule() {
	const now = audioCtx.currentTime;
	const stepDuration = 60 / tempo.value / 4; // 16 steps per bar

	while (startTime < now + 0.1) {
		instruments.value.forEach(inst => {
			if (!inst.muted && inst.steps[stepIndex] && inst.buffer) {

				playBuffer(inst.buffer, startTime, inst.velocities[stepIndex]);
			}
		});
		currentStep.value = stepIndex;
		stepIndex = (stepIndex + 1) % 16;
		startTime += stepDuration;
	}

	loopId = requestAnimationFrame(schedule);
}

function togglePlay() {
	if (isPlaying.value) {
		cancelAnimationFrame(loopId);
		isPlaying.value = false;
		currentStep.value = -1;
	} else {
		if (audioCtx.state === 'suspended') audioCtx.resume();
		startTime = audioCtx.currentTime;
		stepIndex = 0;
		isPlaying.value = true;
		schedule();
	}
}

function loadSample(url) {
	return fetch(url)
		.then(res => res.arrayBuffer())
		.then(data => audioCtx.decodeAudioData(data));
}

function toggleMute(instrumentName) {
	const inst = instruments.value.find(i => i.name === instrumentName);
	if (inst) inst.muted = !inst.muted;
}



// click and drag
// import { ref, onMounted, onBeforeUnmount } from 'vue';

const isMouseDown = ref(false);
const dragMode = ref(null); // 'on' or 'off'

function handleMouseDown(event, instrumentName, index) {
	event.preventDefault(); // <-- prevents browser drag behavior
	isMouseDown.value = true;
	const inst = instruments.value.find(i => i.name === instrumentName);
	if (inst) {
		dragMode.value = !inst.steps[index] ? 'on' : 'off';
		inst.steps[index] = dragMode.value === 'on';
	}
}

function handleMouseEnter(instrumentName, index) {
	if (!isMouseDown.value) return;
	const inst = instruments.value.find(i => i.name === instrumentName);
	if (inst) inst.steps[index] = dragMode.value === 'on';
}

function handleMouseUp() {
	isMouseDown.value = false;
	dragMode.value = null;
}
// click and drag end

async function loadAllSamples() {
	for (const instrument of instruments.value) {
		const path = `audio/${instrument.name}.mp3`; // adjust path if needed
		instrument.buffer = await loadSample(path);
	}
}

watch(volume, val => {
	masterGain.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
});

onMounted(() => {
	loadAllSamples();
	window.addEventListener('mouseup', handleMouseUp);

});

onBeforeUnmount(() => {
	cancelAnimationFrame(loopId);
	window.removeEventListener('mouseup', handleMouseUp);

});



</script>

<style scoped>
.pad {
	width: 30px;
	height: 30px;
	border: 1px solid #555;
	margin: 2px;
	background-color: #222;
	cursor: pointer;
	transition: background-color 0.2s;
}

.pad.selected {
	background-color: #0cf;
}

.pad.playing {
	border: 2px solid #fff;
	box-shadow: 0 0 6px #0ff;
}

.instrument-grid {
	max-width: 650px;
	margin: auto;
}

.pad.selected.playing {
	background-color: #0ff;
	/* or a slightly different tone */
}

.velocity-slider {
	width: 30px;
	margin-top: 2px;
}

.pad-row {
	overflow-x: auto;
	flex-wrap: nowrap;
}

.instrument-grid .d-flex::-webkit-scrollbar {
	height: 6px;
}

.instrument-grid .d-flex::-webkit-scrollbar-thumb {
	background-color: rgba(255, 255, 255, 0.3);
	border-radius: 3px;
}

.pad-row {
	padding-bottom: 4px;
	padding-right: 12px;
}


.mute-indicator {
	width: 14px;
	height: 14px;
	border-radius: 50%;
	background-color: #0f0;
	/* green */
	box-shadow: 0 0 4px #0f0;
	cursor: pointer;
	transition: background-color 0.2s, box-shadow 0.2s;
}

.mute-indicator.muted {
	background-color: #555;
	box-shadow: none;
}
</style>

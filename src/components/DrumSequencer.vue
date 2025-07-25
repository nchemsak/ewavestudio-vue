<template>
	<div class="drum-sequencer container py-4">
		<div class="controls d-flex flex-wrap align-items-center justify-content-between mb-4">
			<div>
				<label class="form-label">Volume</label>
				<input type="range" min="0" max="1" step="0.01" v-model="volume" class="styled-slider" />
			</div>

			<div>
				<label class="form-label">Tempo</label>
				<div class="d-flex align-items-center gap-2">
					<input type="number" v-model.number="tempo" class="form-control w-auto"
						@mousedown="handleTempoMouseDown" @wheel="handleTempoWheel"
						:title="'Scroll or drag to change tempo, or type a number'" />
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

					<div class="channel-label d-flex align-items-center gap-1" @click="editLabel(instrument)">
						<template v-if="!instrument.isEditingName">
							<strong @mouseenter="hoveredLabel = instrument.name" @mouseleave="hoveredLabel = null"
								class="position-relative">
								{{ instrument.label }}
								<span v-if="hoveredLabel === instrument.name" class="custom-tooltip">
									Click to rename
								</span>
							</strong>
						</template>

						<template v-else>
							<input v-model="instrument.label" @blur="stopEditingLabel(instrument)"
								@keydown.enter.prevent="stopEditingLabel(instrument)"
								class="form-control form-control-sm" style="max-width: 150px;"
								:ref="el => instrument.inputRef = el" />
						</template>
					</div>

					<!-- Only show for custom channels -->
					<span v-if="instrument.name.startsWith('custom')" class="">
						<label class="upload-icon" :title="`Load sample for ${instrument.label}`">
							📁
							<input type="file" accept="audio/*" @change="e => loadUserSample(e, instrument)"
								style="display: none" />
						</label>
					</span>

				</div>

				<div class="channel-volume mb-2">
					<input type="range" min="0" max="1" step="0.01" v-model.number="instrument.channelVolume"
						class="styled-slider" :aria-label="`${instrument.label} Channel Volume`" />
				</div>

				<div class="d-flex pad-row">

					<div v-for="(active, index) in instrument.steps" :key="index" class="pad-wrapper"
						@mouseenter="hoveredPad = `${instrument.name}-${index}`" @mouseleave="hoveredPad = null">
						<div :class="['pad', { selected: active }, { playing: index === currentStep }]"
							@mousedown="handleMouseDown($event, instrument.name, index)"
							@mouseenter="handleMouseEnter(instrument.name, index)" @dragstart.prevent
							:style="getPadStyle(instrument, index)"></div>
						<!-- Floating slider -->
						<div v-if="active && hoveredPad === `${instrument.name}-${index}`" class="hover-slider">
							<input type="range" min="0" max="1" step="0.01"
								v-model.number="instrument.velocities[index]" />
						</div>
					</div>


				</div>
			</div>
			<button class="btn btn-success mb-3" @click="addCustomChannel">
				+ Add Channel
			</button>
		</div>
	</div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';

let isScrubbing = false;
let startY = 0;
let startTempo = 0;
const hoveredPad = ref(null);
const hoveredLabel = ref(null);

import { nextTick } from 'vue';

function editLabel(instrument) {
	instrument.isEditingName = true;

	nextTick(() => {
		const el = instrument.inputRef;
		if (el) {
			el.focus();
			const val = el.value;
			el.setSelectionRange(val.length, val.length);
		}
	});
}


function stopEditingLabel(instrument) {
	instrument.isEditingName = false;
	hoveredLabel.value = null;
}

function handleTempoMouseDown(e) {
	isScrubbing = true;
	startY = e.clientY;
	startTempo = tempo.value;

	window.addEventListener('mousemove', handleTempoMouseMove);
	window.addEventListener('mouseup', handleTempoMouseUp);
}

function handleTempoMouseMove(e) {
	if (!isScrubbing) return;
	const delta = startY - e.clientY;
	tempo.value = Math.max(20, Math.min(300, Math.round(startTempo + delta)));
}

function handleTempoMouseUp() {
	isScrubbing = false;
	window.removeEventListener('mousemove', handleTempoMouseMove);
	window.removeEventListener('mouseup', handleTempoMouseUp);
}

// --- Scroll Wheel ---
function handleTempoWheel(e) {
	e.preventDefault();
	const delta = Math.sign(e.deltaY);
	tempo.value = Math.max(20, Math.min(300, tempo.value - delta)); // scroll up increases
}

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
	{
		name: 'kick',
		label: 'Kick',
		isEditingName: false,
		buffer: null,
		muted: false,
		channelVolume: 1.0,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0)
	}, {
		name: 'snare',
		label: 'Snare',
		isEditingName: false,
		buffer: null,
		muted: false,
		channelVolume: 1.0,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0)
	},
	{
		name: 'hihat',
		label: 'Hi-Hat',
		isEditingName: false,
		buffer: null,
		muted: false,
		channelVolume: 1.0,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0)
	},
]);

function addCustomChannel() {
	const id = Date.now();
	instruments.value.push({
		name: `custom-${id}`,
		label: `Custom ${instruments.value.length + 1}`,
		buffer: null,
		muted: false,
		channelVolume: 1.0,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0),
	});
}


function loadUserSample(event, instrument) {
	const file = event.target.files[0];
	if (!file) return;

	// Auto-set label based on file name (remove extension)
	const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
	instrument.label = nameWithoutExt;

	const reader = new FileReader();
	reader.onload = function (e) {
		audioCtx.decodeAudioData(e.target.result, decoded => {
			instrument.buffer = decoded;
		}, err => {
			console.error("Error decoding audio", err);
		});
	};
	reader.readAsArrayBuffer(file);
}


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

				const padVol = inst.velocities[stepIndex];
				const chanVol = inst.channelVolume ?? 1.0;
				playBuffer(inst.buffer, startTime, padVol * chanVol);
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
		const path = `audio/${instrument.name}.mp3`;
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

if (isScrubbing) document.body.classList.add('scrubbing');
else document.body.classList.remove('scrubbing');

function getPadStyle(instrument, index) {
	if (!instrument.steps[index]) return {};

	const velocity = instrument.velocities[index];
	const percent = Math.round(velocity * 100);

	return {
		background: `linear-gradient(to top, pink ${percent}%, #fff ${percent}%)`
	};
}

</script>

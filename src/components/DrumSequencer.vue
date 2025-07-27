<template>
	<div class="drum-sequencer">
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
			<!-- <div v-for="instrument in instruments" :key="instrument.name" class="mb-3"> -->
			<div v-for="instrument in instruments.filter(i => i.name !== 'synth-voice')" :key="instrument.name"
				class="mb-3">

				<div class="d-flex align-items-center gap-2 mb-1">
					<div class="mute-indicator" :class="{ muted: instrument.muted }"
						@click="toggleMute(instrument.name)" role="button" aria-label="Toggle Mute"
						:title="instrument.muted ? 'Muted' : 'Playing'"></div>

					<div class="channel-label d-flex align-items-center gap-1">

						<template v-if="!instrument.isEditingName">
							<strong @click="editLabel(instrument)" @mouseenter="hoveredLabel = instrument.name"
								@mouseleave="hoveredLabel = null" class="position-relative">

								{{ instrument.label }}
								<span v-if="hoveredLabel === instrument.name && instrument.name !== 'synth-voice'"
									class="custom-tooltip">
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

						<!-- Waveform Selector for Synth Voice -->
						<div v-if="instrument.name === 'synth-voice'" class="btn-group ms-3" role="group">
							<button v-for="wave in ['sine', 'square', 'triangle', 'sawtooth']" :key="wave" type="button"
								class="btn btn-sm"
								:class="wave === selectedWaveform ? 'btn-primary' : 'btn-outline-primary'"
								@click="selectedWaveform = wave">
								{{ wave.charAt(0).toUpperCase() + wave.slice(1) }}
							</button>
						</div>
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
						<div v-if="active && hoveredPad === `${instrument.name}-${index}`"
							class="hover-slider volume-slider">
							<input type="range" min="0" max="1" step="0.01"
								v-model.number="instrument.velocities[index]" />
						</div>
						<!-- Pitch Slider for Synth Voice -->
						<div v-if="instrument.name === 'synth-voice' && active && hoveredPad === `${instrument.name}-${index}`"
							class="hover-slider pitch-slider">
							<input type="range" min="100" max="1000" step="1"
								v-model.number="instrument.pitches[index]" />
						</div>
					</div>


				</div>
			</div>
			<button class="btn btn-success mb-3" @click="addCustomChannel">
				+ Add Channel
			</button>
		</div>
	</div>
	<div class="drum-sequencer" id="percussion-synth">
		<div class="controls d-flex flex-wrap align-items-center justify-content-between mb-4">
			<div>
				<div>
					<label>Attack </label> <span class="text-muted">{{ (synthAttack * 1000).toFixed(1) }} ms</span>
				</div>
				<input type="range" min="0" max="100" step="1" v-model.number="attackSliderVal" class="styled-slider"
					:aria-valuetext="`${(synthAttack * 1000).toFixed(1)} milliseconds`" />
			</div>
			<div>
				<label class="form-label">Decay <span class="text-muted">{{ (synthDecay * 1000).toFixed(0) }} ms</span>
				</label>
				<input type="range" min="0.05" max="2" step="0.01" v-model.number="synthDecay" class="styled-slider" />
			</div>
			<div>
				<label class="form-label">
					Pitch Env Amount
					<span class="text-muted">{{ Math.round(pitchEnvAmt) }} Hz</span>
				</label>
				<input type="range" min="0" max="100" step="1" v-model.number="pitchEnvAmtSliderVal"
					class="styled-slider" :aria-valuetext="`${Math.round(pitchEnvAmt)} Hz`" />
			</div>
			<div>
				<label class="form-label">
					Pitch Env Decay
					<span class="text-muted">{{ (pitchEnvDecay * 1000).toFixed(0) }} ms</span>
				</label>
				<input type="range" min="0" max="100" step="1" v-model.number="pitchEnvDecaySliderVal"
					class="styled-slider" :aria-valuetext="`${(pitchEnvDecay * 1000).toFixed(0)} milliseconds`" />

			</div>

		</div>



		<div v-if="synthInstrument" class="mb-3">
			<div class="d-flex align-items-center gap-2 mb-1">
				<div class="mute-indicator" :class="{ muted: synthInstrument.muted }"
					@click="toggleMute(synthInstrument.name)" role="button" aria-label="Toggle Mute"
					:title="synthInstrument.muted ? 'Muted' : 'Playing'"></div>

				<div class="channel-label d-flex align-items-center gap-1">
					<template v-if="!synthInstrument.isEditingName">
						<strong @click="editLabel(synthInstrument)" @mouseenter="hoveredLabel = synthInstrument.name"
							@mouseleave="hoveredLabel = null" class="position-relative">
							{{ synthInstrument.label }}
							<span v-if="hoveredLabel === synthInstrument.name" class="custom-tooltip">
								Click to rename
							</span>
						</strong>
					</template>
					<template v-else>
						<input v-model="synthInstrument.label" @blur="stopEditingLabel(synthInstrument)"
							@keydown.enter.prevent="stopEditingLabel(synthInstrument)"
							class="form-control form-control-sm" style="max-width: 150px;"
							:ref="el => synthInstrument.inputRef = el" />
					</template>

					<!-- Waveform Selector -->
					<div class="btn-group ms-3" role="group">
						<button v-for="wave in ['sine', 'square', 'triangle', 'sawtooth']" :key="wave" type="button"
							class="btn btn-sm"
							:class="wave === selectedWaveform ? 'btn-primary' : 'btn-outline-primary'"
							@click="selectedWaveform = wave">
							{{ wave.charAt(0).toUpperCase() + wave.slice(1) }}
						</button>
					</div>
				</div>
			</div>

			<div class="channel-volume mb-2">
				<input type="range" min="0" max="1" step="0.01" v-model.number="synthInstrument.channelVolume"
					class="styled-slider" :aria-label="`${synthInstrument.label} Channel Volume`" />
			</div>

			<div class="d-flex pad-row">
				<div v-for="(active, index) in synthInstrument.steps" :key="index" class="pad-wrapper"
					@mouseenter="hoveredPad = `${synthInstrument.name}-${index}`" @mouseleave="hoveredPad = null">
					<div :class="['pad', { selected: active }, { playing: index === currentStep }]"
						@mousedown="handleMouseDown($event, synthInstrument.name, index)"
						@mouseenter="handleMouseEnter(synthInstrument.name, index)" @dragstart.prevent
						:style="getPadStyle(synthInstrument, index)">
					</div>
					<!-- Volume Slider -->
					<div v-if="active && hoveredPad === `${synthInstrument.name}-${index}`"
						class="hover-slider volume-slider">
						<input type="range" min="0" max="1" step="0.01"
							v-model.number="synthInstrument.velocities[index]" />
					</div>
					<!-- Pitch Slider -->
					<div v-if="active && hoveredPad === `${synthInstrument.name}-${index}`"
						class="hover-slider pitch-slider">
						<input type="range" min="100" max="1000" step="1"
							v-model.number="synthInstrument.pitches[index]" />
					</div>
				</div>
			</div>
		</div>





	</div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';

let isScrubbing = false;
let startY = 0;
let startTempo = 0;
const hoveredPad = ref(null);
const hoveredLabel = ref(null);
const synthDecay = ref(0.4);
const selectedWaveform = ref("sine");
const attackSliderVal = ref(20); // Initial slider value (0–100)
const synthInstrument = computed(() => instruments.value.find(i => i.name === 'synth-voice'));
// const pitchEnvAmt = ref(0);   // Hz
const pitchEnvAmtSliderVal = ref(0); // Slider from 0–100
const pitchEnvAmt = computed(() => {
	const min = 1;     // ~1 Hz
	const max = 2000;  // 2 kHz bend
	const normalized = pitchEnvAmtSliderVal.value / 100;
	return min * Math.pow(max / min, normalized);
});
// const pitchEnvDecay = ref(0.2); // seconds
const pitchEnvDecaySliderVal = ref(30); // Slider 0–100, start near short decay
const pitchEnvDecay = computed(() => {
	const min = 0.01; // 10ms
	const max = 1.0;  // 1000ms
	const normalized = pitchEnvDecaySliderVal.value / 100;
	return min * Math.pow(max / min, normalized);
});
// Logarithmic mapping: attack time in seconds
const synthAttack = computed(() => {
	const min = 0.001; // 1ms
	const max = 0.1;   // 100ms
	const normalized = attackSliderVal.value / 100; // 0–1 range
	return min * Math.pow(max / min, normalized);
});

// import { nextTick } from 'vue';

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
	{
		name: 'synth-voice',
		label: 'Synth Voice',
		isEditingName: false,
		type: 'synth', // <-- custom flag
		muted: false,
		channelVolume: 1.0,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0),
		pitches: Array(16).fill(220), // default A3 pitch
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
			if (!inst.muted && inst.steps[stepIndex]) {
				const velocity = inst.velocities[stepIndex];
				const volume = inst.channelVolume ?? 1.0;

				if (inst.type === 'synth') {
					const pitch = inst.pitches[stepIndex] || 220;
					const safeDecay = isFinite(synthDecay.value) && synthDecay.value > 0 ? synthDecay.value : 0.1;
					playSynthNote(pitch, velocity * volume, safeDecay, startTime);
				} else if (inst.buffer) {
					playBuffer(inst.buffer, startTime, velocity * volume);
				}
			}

		});
		currentStep.value = stepIndex;
		stepIndex = (stepIndex + 1) % 16;
		startTime += stepDuration;
	}

	loopId = requestAnimationFrame(schedule);
}



function playSynthNote(freq, velocity, decayTime, startTime) {
	const attackTime = isFinite(synthAttack.value) && synthAttack.value > 0 ? synthAttack.value : 0.01;
	const decay = isFinite(decayTime) && decayTime > 0 ? decayTime : 0.1;
	const osc = audioCtx.createOscillator();
	const gain = audioCtx.createGain();

	const attackEnd = startTime + attackTime;
	const decayEnd = attackEnd + decay;

	// Setup oscillator
	// osc.type = 'sawtooth'; // or square/triangle later
	osc.type = selectedWaveform.value;
	// osc.frequency.setValueAtTime(freq, startTime);
	const startFreq = freq + pitchEnvAmt.value;
	osc.frequency.setValueAtTime(startFreq, startTime);
	osc.frequency.exponentialRampToValueAtTime(freq, startTime + pitchEnvDecay.value);


	// Gain envelope
	gain.gain.setValueAtTime(0.0001, startTime);
	gain.gain.exponentialRampToValueAtTime(velocity, attackEnd);
	gain.gain.exponentialRampToValueAtTime(0.001, decayEnd);

	// Connect and play
	osc.connect(gain).connect(masterGain);
	osc.start(startTime);
	osc.stop(decayEnd);
}


async function togglePlay() {
	if (isPlaying.value) {
		cancelAnimationFrame(loopId);
		isPlaying.value = false;
		currentStep.value = -1;
	} else {
		if (audioCtx.state === 'suspended') {
			await audioCtx.resume();
		}
		startTime = audioCtx.currentTime;
		stepIndex = 0;
		isPlaying.value = true;
		schedule();
	}
}


async function loadSample(url) {
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.arrayBuffer();
		return await audioCtx.decodeAudioData(data);
	} catch (err) {
		console.error(`Failed to load or decode sample: ${url}`, err);
		return null;
	}
}

function toggleMute(instrumentName) {
	const inst = instruments.value.find(i => i.name === instrumentName);
	if (inst) inst.muted = !inst.muted;
}



// click and drag START

const isMouseDown = ref(false);
const dragMode = ref(null); // 'on' or 'off'

function handleMouseDown(event, instrumentName, index) {
	if (event.target.closest('.hover-slider input[type="range"]')) {
		return; // Don't toggle pad if user is adjusting the slider
	}
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
// click and drag END

async function loadAllSamples() {
	for (const instrument of instruments.value) {
		// Skip instruments that don't require audio samples
		if (instrument.type === 'synth') continue;

		const path = `audio/${instrument.name}.mp3`;
		try {
			instrument.buffer = await loadSample(path);
		} catch (err) {
			console.warn(`Sample load failed for ${instrument.name}:`, err);
		}
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

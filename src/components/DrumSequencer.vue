<template>
	<div class="drum-sequencer">
		<div class="controls d-flex flex-wrap align-items-center justify-content-between mb-4">
			<div>
				<label>Volume</label>
				<input type="range" min="0" max="1" step="0.01" v-model="volume" class="styled-slider" />
			</div>
			<div>
				<label>Tempo</label>
				<div class="d-flex align-items-center gap-2">
					<input type="number" v-model.number="tempo" class="form-control w-auto"
						@mousedown="handleTempoMouseDown" @wheel="handleTempoWheel"
						:title="'Scroll or drag to change tempo, or type a number'" />
				</div>
			</div>
			<div>
				<label>Swing <span class="text-muted">{{ Math.round(swing * 100) }}%</span></label>
				<input type="range" min="0" max="0.5" step="0.01" v-model.number="swing" class="styled-slider" />
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
						<!-- Delete Button (not for synth-voice) -->
						<button v-if="instrument.name !== 'synth-voice'" @click="deleteChannel(instrument.name)"
							class="btn btn-sm btn-outline-danger ms-2" title="Delete Channel"
							aria-label="Delete Channel">
							&times;
						</button>

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
		<div class="controls">



			<div class="row">
				<div class="col-12 col-md-6">
					<h5>LFO Modulation</h5>

					<div>
						<label>LFO Rate <span class="text-muted">{{ lfoRate }} Hz</span></label>
						<input type="range" min="0.1" max="20" step="0.1" v-model.number="lfoRate"
							class="styled-slider" />
					</div>

					<div>
						<label>LFO Depth <span class="text-muted">{{ lfoDepth }}</span></label>
						<!-- <input type="range" min="0" max="1000" step="1" v-model.number="lfoDepth"
							class="styled-slider" /> -->
						<input type="range" :min="0" :max="lfoDepthMax" step="1" v-model.number="lfoDepth"
							class="styled-slider" />
					</div>

					<div>
						<label>LFO Target</label>
						<select v-model="lfoTarget" class="form-select w-auto">
							<option value="pitch">Pitch</option>
							<option value="gain">Amplitude</option>
							<option value="filter">Filter Cutoff</option>
						</select>
					</div>
				</div>
			</div>






			<div class="row">
				<div class="col-12 col-md-6">
					<div class="slider-label-row">
						<label>Attack</label> <span class="text-muted">{{ (synthAttack * 1000).toFixed(1) }} ms</span>
					</div>
					<input type="range" min="0" max="100" step="1" v-model.number="attackSliderVal"
						class="styled-slider" :aria-valuetext="`${(synthAttack * 1000).toFixed(1)} milliseconds`" />
				</div>

				<div class="col-12 col-md-6">
					<div class="slider-label-row">
						<label>Decay</label> <span class="text-muted">{{ (synthDecay * 1000).toFixed(0)
						}}
							ms</span>
					</div>
					<input type="range" min="0.05" max="2" step="0.01" v-model.number="synthDecay"
						class="styled-slider" />
				</div>
			</div>
			<div class="row">
				<div class="col-12 col-md-6">
					<label class="form-label">Pitch Env Mode</label>
					<div class="btn-group" role="group" aria-label="Pitch Env Mode">
						<button class="btn btn-sm" :class="pitchMode === 'up' ? 'btn-primary' : 'btn-outline-primary'"
							@click="pitchMode = 'up'">
							<i class="bi bi-arrow-up"></i>
						</button>
						<button class="btn btn-sm" :class="pitchMode === 'down' ? 'btn-primary' : 'btn-outline-primary'"
							@click="pitchMode = 'down'">
							<i class="bi bi-arrow-down"></i>
						</button>
						<button class="btn btn-sm"
							:class="pitchMode === 'random' ? 'btn-primary' : 'btn-outline-primary'"
							@click="pitchMode = 'random'">
							<i class="bi bi-shuffle"></i>
						</button>
					</div>
				</div>
			</div>
			<div class="row">
				<div class="col-12 col-md-6">
					<div class="slider-label-row">
						<label>Pitch Env Amount </label><span class="text-muted">{{ pitchEnvSemitones }}
							semitones</span>
					</div>
					<input type="range" min="0" max="48" step="1" v-model.number="pitchEnvSemitones"
						class="styled-slider" />
				</div>

				<div class="col-12 col-md-6">
					<div class="slider-label-row">
						<label>
							Pitch Env Decay</label><span class="text-muted">{{ (pitchEnvDecay * 1000).toFixed(0) }}
							ms</span>

					</div>
					<input type="range" min="0" max="100" step="1" v-model.number="pitchEnvDecaySliderVal"
						class="styled-slider" :aria-valuetext="`${(pitchEnvDecay * 1000).toFixed(0)} milliseconds`" />
				</div>
			</div>
			<div class="row">
				<div class="col-12 col-md-6">
					<div class="slider-label-row">
						<label>Filter Cutoff</label><span class="text-muted">{{ filterCutoff }} Hz</span>
					</div>

					<input type="range" min="100" max="10000" step="1" v-model.number="filterCutoff"
						class="styled-slider" />

				</div>
				<div class="col-12 col-md-6">
					<div class="slider-label-row">
						<label>Resonance (Q)

						</label><span class="text-muted">{{ filterResonance }}</span>
					</div>
					<input type="range" min="0.1" max="20" step="0.1" v-model.number="filterResonance"
						class="styled-slider" />
				</div>
			</div>
		</div>

		<canvas ref="oscilloscopeCanvas" class="oscilloscopeDrumSynth" width="600" height="100"></canvas>

	</div>

</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';
// Reuse shared AudioContext
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isScrubbing = false;
let startY = 0;
let startTempo = 0;
const hoveredPad = ref(null);
const hoveredLabel = ref(null);
const synthDecay = ref(0.4);
const selectedWaveform = ref("sine");
const attackSliderVal = ref(20); // Initial slider value (0–100)
const synthInstrument = computed(() => instruments.value.find(i => i.name === 'synth-voice'));
// const pitchEnvAmtSliderVal = ref(0); // Slider from 0–100
const filterCutoff = ref(5000); // Hz, default cutoff
const filterResonance = ref(0.5); // Q factor
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
const pitchEnvSemitones = ref(0); // Default = 1 octave up

const pitchMode = ref('up'); // or 'down', 'random'
const oscilloscopeCanvas = ref(null);

// LFO START
const lfoRate = ref(5); // Hz
const lfoDepth = ref(0); // Varies by target
const lfoTarget = ref('pitch'); // 'pitch' | 'gain' | 'filter'

const lfoOsc = audioCtx.createOscillator();
const lfoGain = audioCtx.createGain();
const lfoDepthMax = computed(() => {
	return lfoTarget.value === 'gain' ? 200 : 1000;
});
lfoOsc.type = 'sine';
lfoOsc.frequency.setValueAtTime(lfoRate.value, audioCtx.currentTime);
lfoGain.gain.setValueAtTime(lfoDepth.value, audioCtx.currentTime);

// Connect dynamically later
lfoOsc.connect(lfoGain);
lfoOsc.start();

watch(lfoRate, rate => {
	lfoOsc.frequency.setValueAtTime(rate, audioCtx.currentTime);
});

watch(lfoDepth, depth => {
	lfoGain.gain.setValueAtTime(depth, audioCtx.currentTime);
});
// LFO END

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



const volume = ref(0.75);
const tempo = ref(100);
const swing = ref(0);
const isPlaying = ref(false);
const currentStep = ref(-1);

const masterGain = audioCtx.createGain();
masterGain.gain.value = volume.value;
masterGain.connect(audioCtx.destination);


// Oscilloscope
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 2048;

const dataArray = new Uint8Array(analyser.fftSize);
masterGain.connect(analyser);


const instruments = ref([
	{
		name: 'kick',
		label: 'Kick',
		isEditingName: false,
		buffer: null,
		muted: false,
		channelVolume: 0.5,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0)
	}, {
		name: 'snare',
		label: 'Snare',
		isEditingName: false,
		buffer: null,
		muted: false,
		channelVolume: 0.5,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0)
	},
	{
		name: 'hihat',
		label: 'Hi-Hat',
		isEditingName: false,
		buffer: null,
		muted: false,
		channelVolume: 0.5,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0)
	},
	{
		name: 'synth-voice',
		label: 'Percussion Synth',
		isEditingName: false,
		type: 'synth', // <-- custom flag
		muted: false,
		channelVolume: 0.5,
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
		channelVolume: 0.5,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0),
	});
}

function deleteChannel(name) {
	if (name === 'synth-voice') return; // safeguard

	const index = instruments.value.findIndex(i => i.name === name);
	if (index !== -1) {
		const label = instruments.value[index].label || name;
		const confirmed = confirm(`Are you sure you want to delete "${label}"?`);
		if (confirmed) {
			instruments.value.splice(index, 1);
		}
	}
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

// function schedule() {
// 	const now = audioCtx.currentTime;
// 	const stepDuration = 60 / tempo.value / 4; // 16 steps per bar

// 	while (startTime < now + 0.1) {
// 		instruments.value.forEach(inst => {
// 			if (!inst.muted && inst.steps[stepIndex]) {
// 				const velocity = inst.velocities[stepIndex];
// 				const volume = inst.channelVolume ?? 1.0;

// 				if (inst.type === 'synth') {
// 					const pitch = inst.pitches[stepIndex] || 220;
// 					const safeDecay = isFinite(synthDecay.value) && synthDecay.value > 0 ? synthDecay.value : 0.1;
// 					playSynthNote(pitch, velocity * volume, safeDecay, startTime);
// 				} else if (inst.buffer) {
// 					playBuffer(inst.buffer, startTime, velocity * volume);
// 				}
// 			}
// 		});
// 		currentStep.value = stepIndex;
// 		stepIndex = (stepIndex + 1) % 16;
// 		startTime += stepDuration;
// 	}
// 	loopId = requestAnimationFrame(schedule);
// }
function schedule() {
	const now = audioCtx.currentTime;
	const stepDuration = 60 / tempo.value / 4; // 16 steps per bar

	while (startTime < now + 0.1) {
		instruments.value.forEach(inst => {
			if (!inst.muted && inst.steps[stepIndex]) {
				const velocity = inst.velocities[stepIndex];
				const volume = inst.channelVolume ?? 1.0;
				const pitch = inst.pitches?.[stepIndex] || 220;
				const safeDecay = isFinite(synthDecay.value) && synthDecay.value > 0 ? synthDecay.value : 0.1;

				// 🎵 SWING: apply offset to every 2nd step (i.e., 1, 3, 5...)
				const isEvenStep = stepIndex % 2 === 1;
				const swingOffset = isEvenStep ? stepDuration * swing.value : 0;
				const scheduledTime = startTime + swingOffset;

				if (inst.type === 'synth') {
					playSynthNote(pitch, velocity * volume, safeDecay, scheduledTime);
				} else if (inst.buffer) {
					playBuffer(inst.buffer, scheduledTime, velocity * volume);
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
	const filter = audioCtx.createBiquadFilter();

	// Pitch envelope handling
	let semitoneOffset = pitchEnvSemitones.value;
	if (pitchMode.value === 'down') {
		semitoneOffset = -pitchEnvSemitones.value;
	} else if (pitchMode.value === 'random') {
		semitoneOffset = (Math.random() * 2 - 1) * pitchEnvSemitones.value; // random between -n and +n
	}
	const semitoneRatio = Math.pow(2, semitoneOffset / 12);
	const startFreq = freq * semitoneRatio;

	osc.type = selectedWaveform.value;
	osc.frequency.setValueAtTime(startFreq, startTime);
	osc.frequency.exponentialRampToValueAtTime(freq, startTime + pitchEnvDecay.value);

	// Filter config
	filter.type = 'lowpass';
	filter.frequency.setValueAtTime(filterCutoff.value, startTime);
	filter.Q.setValueAtTime(filterResonance.value, startTime);

	// Gain envelope
	const attackEnd = startTime + attackTime;
	const decayEnd = attackEnd + decay;
	gain.gain.setValueAtTime(0.0001, startTime);
	// gain.gain.exponentialRampToValueAtTime(velocity, attackEnd);
	const safeVelocity = Math.max(0.0001, velocity);
	gain.gain.exponentialRampToValueAtTime(safeVelocity, attackEnd);

	gain.gain.exponentialRampToValueAtTime(0.001, decayEnd);

	// Routing
	osc.connect(filter);
	filter.connect(gain);
	gain.connect(masterGain);

	// LFO
	if (lfoTarget.value === 'pitch') {
		lfoGain.connect(osc.frequency);
	} else if (lfoTarget.value === 'gain') {
		// lfoGain.connect(gain.gain);
		// Clamp LFO depth for gain mod to a safe musical range
		const lfoModGain = audioCtx.createGain();
		lfoModGain.gain.value = lfoDepth.value * 0.005; // scale depth to a small gain range (e.g., 0 to 0.5)

		// Offset node (adds a base gain level)
		const lfoOffset = audioCtx.createConstantSource();
		lfoOffset.offset.value = velocity * 0.75; // 75% of velocity as base volume

		// Sum LFO + Offset
		const lfoSum = audioCtx.createGain();
		lfoGain.connect(lfoModGain).connect(lfoSum);
		lfoOffset.connect(lfoSum);
		lfoSum.connect(gain.gain);

		lfoOffset.start();

	} else if (lfoTarget.value === 'filter') {
		lfoGain.connect(filter.frequency);
	}

	// Start/stop
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
	const canvas = oscilloscopeCanvas.value;
	const canvasCtx = canvas.getContext('2d');

	function drawOscilloscope() {
		requestAnimationFrame(drawOscilloscope);

		analyser.getByteTimeDomainData(dataArray);

		canvasCtx.fillStyle = '#111';
		canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

		canvasCtx.lineWidth = 2;
		canvasCtx.strokeStyle = '#0ff';
		canvasCtx.beginPath();

		const sliceWidth = canvas.width / analyser.fftSize;
		let x = 0;

		for (let i = 0; i < analyser.fftSize; i++) {
			const v = dataArray[i] / 128.0;
			const y = (v * canvas.height) / 2;

			if (i === 0) {
				canvasCtx.moveTo(x, y);
			} else {
				canvasCtx.lineTo(x, y);
			}
			x += sliceWidth;
		}

		canvasCtx.lineTo(canvas.width, canvas.height / 2);
		canvasCtx.stroke();
	}

	drawOscilloscope();


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

<template>
	<div class="drum-sequencer">
		<div class="controls d-flex flex-wrap align-items-center justify-content-between mb-4">

			<div class="position-relative text-center">
				<Knob v-model="volume" label="Volume" :min="0" :max="1" :step="0.01" size="medium" color="#23CDE8"
					@knobStart="activeKnob = 'volume'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'volume'" class="custom-tooltip">
					{{ Math.round(volume * 100) }}%
				</span>
			</div>


			<div class="position-relative text-center">
				<Knob v-model="tempo" label="Tempo" :min="20" :max="300" :step="1" size="medium" color="#F39C12"
					@knobStart="activeKnob = 'tempo'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'tempo'" class="custom-tooltip">
					{{ tempo }} BPM
				</span>
			</div>


			<div class="position-relative text-center">
				<Knob v-model="swing" label="Swing" :min="0" :max="0.5" :step="0.01" size="medium" color="#E91E63"
					@knobStart="activeKnob = 'swing'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'swing'" class="custom-tooltip">
					{{ Math.round(swing * 100) }}%
				</span>
			</div>

			<button class="btn btn-primary" @click="togglePlay">
				<span v-if="isPlaying">Stop</span>
				<span v-else>Play</span>
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


			<div class="position-relative text-center">
				<Knob v-model="synthInstrument.channelVolume" :min="0" :max="1" :step="0.01" size="small" label="Vol"
					color="#8E44AD" @knobStart="activeKnob = 'synthVolume'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'synthVolume'" class="custom-tooltip">
					{{ Math.round(synthInstrument.channelVolume * 100) }}%
				</span>
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
			<KnobGroup title="Noise" :color="'#9C27B0'" :modelValue="true" :showToggle="false">
				<template #header-content>
					<!-- Noise selector dots go here -->
					<div class="noise-dot-wrap d-flex justify-content-center gap-2 ms-2">
						<span v-for="type in ['white', 'pink', 'brown']" :key="type" class="noise-dot"
							:class="[type, { selected: noiseType === type }]" @click="toggleNoise(type)">
							<span class="selector-tooltip">
								{{ type.charAt(0).toUpperCase() + type.slice(1) }} Noise
							</span>
						</span>
					</div>
				</template>

				<!-- Noise Amount knob -->
				<div class="position-relative text-center mt-2" :disabled="noiseType === 'none'">
					<Knob v-model="noiseAmount" label="Amount" :min="0" :max="1" :step="0.01" size="medium"
						color="#9C27B0" @knobStart="activeKnob = 'noiseAmount'" @knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'noiseAmount'" class="custom-tooltip">
						{{ Math.round(noiseAmount * 100) }}%
					</span>
				</div>
			</KnobGroup>

			<KnobGroup v-model="envelopeEnabled" title="Envelope" color="#4CAF50" :showToggle="false">
				<!-- Attack -->
				<div class="position-relative">
					<Knob v-model="attackSliderVal" label="Attack" size="medium" :min="0" :max="100" :step="1"
						color="#4CAF50" :disabled="!envelopeEnabled" @knobStart="activeKnob = 'attack'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'attack'" class="custom-tooltip">
						{{ (synthAttack * 1000).toFixed(1) }} ms
					</span>
				</div>

				<!-- Decay -->
				<div class="position-relative">
					<Knob v-model="synthDecay" label="Decay" size="medium" :min="0.05" :max="2" :step="0.01"
						color="#4CAF50" :disabled="!envelopeEnabled" @knobStart="activeKnob = 'decay'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'decay'" class="custom-tooltip">
						{{ (synthDecay * 1000).toFixed(0) }} ms
					</span>
				</div>
			</KnobGroup>




			<KnobGroup v-model="pitchEnvEnabled" title="Pitch Env" color="#3F51B5">
				<!-- Inject Pitch Env Mode selector into the header -->
				<template #header-content>
					<div class="btn-group ms-auto" role="group" aria-label="Pitch Env Mode">
						<!-- Up -->
						<button class="btn btn-sm" :disabled="!pitchEnvEnabled"
							:class="pitchMode === 'up' ? 'btn-primary' : 'btn-outline-primary'"
							@click="pitchMode = 'up'">
							<i class="bi bi-arrow-up"></i>
						</button>

						<!-- Down -->
						<button class="btn btn-sm" :disabled="!pitchEnvEnabled"
							:class="pitchMode === 'down' ? 'btn-primary' : 'btn-outline-primary'"
							@click="pitchMode = 'down'">
							<i class="bi bi-arrow-down"></i>
						</button>

						<!-- Random -->
						<button class="btn btn-sm" :disabled="!pitchEnvEnabled"
							:class="pitchMode === 'random' ? 'btn-primary' : 'btn-outline-primary'"
							@click="pitchMode = 'random'">
							<i class="bi bi-shuffle"></i>
						</button>
					</div>
				</template>


				<!-- Knobs -->
				<div class="position-relative">
					<Knob v-model="pitchEnvSemitones" label="Amount" size="medium" :min="0" :max="48" :step="1"
						color="#3F51B5" :disabled="!pitchEnvEnabled" @knobStart="activeKnob = 'pitchAmt'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'pitchAmt'" class="custom-tooltip">
						{{ pitchEnvSemitones }} semitones
					</span>
				</div>

				<div class="position-relative">
					<Knob v-model="pitchEnvDecaySliderVal" label="Decay" size="medium" :min="0" :max="100" :step="1"
						color="#3F51B5" :disabled="!pitchEnvEnabled" @knobStart="activeKnob = 'pitchDecay'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'pitchDecay'" class="custom-tooltip">
						{{ (pitchEnvDecay * 1000).toFixed(0) }} ms
					</span>
				</div>
			</KnobGroup>



			<KnobGroup v-model="filterEnabled" title="Filter" color="#FF5722">
				<!-- Cutoff -->
				<div class="position-relative">
					<Knob v-model="filterCutoff" label="Cutoff" size="medium" :min="100" :max="10000" :step="1"
						color="#FF5722" :disabled="!filterEnabled" @knobStart="activeKnob = 'filterCutoff'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'filterCutoff'" class="custom-tooltip">
						{{ Math.round(filterCutoff) }} Hz
					</span>
				</div>

				<!-- Resonance -->
				<div class="position-relative">
					<Knob v-model="filterResonance" label="Resonance" size="medium" :min="0.1" :max="20" :step="0.1"
						color="#FF5722" :disabled="!filterEnabled" @knobStart="activeKnob = 'filterResonance'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'filterResonance'" class="custom-tooltip">
						Q: {{ filterResonance.toFixed(1) }}
					</span>
				</div>
			</KnobGroup>
			<KnobGroup v-model="lfoEnabled" title="LFO" color="#00BCD4">
				<!--  Inject selector into the header -->
				<template #header-content>
					<div class="lfo-target-selector d-flex justify-content-center gap-2 ms-2">
						<span v-for="type in ['pitch', 'gain', 'filter']" :key="type" class="lfo-type-dot"
							:class="{ selected: lfoTarget === type, disabled: !lfoEnabled }"
							@click="lfoEnabled && (lfoTarget = type)">
							<span class="selector-tooltip">
								{{ type === 'gain' ? 'Amplitude' : type.charAt(0).toUpperCase() + type.slice(1)
								}}
							</span>
						</span>
					</div>
				</template>


				<!-- LFO Rate -->
				<div class="position-relative">
					<Knob v-model="lfoRate" size="medium" :min="0.1" :max="20" :step="0.1" label="Rate" color="#00BCD4"
						:disabled="!lfoEnabled" @knobStart="activeKnob = 'lfoRate'" @knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'lfoRate'" class="custom-tooltip">
						{{ lfoRate.toFixed(1) }} Hz
					</span>
				</div>

				<!-- LFO Depth -->
				<div class="position-relative">
					<Knob v-model="lfoDepth" size="medium" :min="0" :max="lfoDepthMax" :step="1" label="Depth"
						color="#00BCD4" :disabled="!lfoEnabled" @knobStart="activeKnob = 'lfoDepth'"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === 'lfoDepth'" class="custom-tooltip">
						{{ lfoDepth }}
					</span>
				</div>
			</KnobGroup>

		</div>

		<canvas ref="oscilloscopeCanvas" class="oscilloscopeDrumSynth" width="600" height="100"></canvas>

	</div>

</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';
import Knob from './Knob.vue';
import KnobGroup from './KnobGroup.vue';

// Reuse shared AudioContext
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isScrubbing = false;
let startY = 0;
let startTempo = 0;

const activeKnob = ref(null);
const hoveredPad = ref(null);
const hoveredLabel = ref(null);
const synthDecay = ref(0.4);
const selectedWaveform = ref("sine");

const pitchEnvEnabled = ref(true);
const envelopeEnabled = ref(true);
const filterEnabled = ref(true);

const attackSliderVal = ref(20); // Initial slider value (0–100)
const synthInstrument = computed(() => instruments.value.find(i => i.name === 'synth-voice'));
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

// Noise
const noiseType = ref('none'); // 'none' | 'white' | 'pink' | 'brown'
const noiseAmount = ref(0.5); // 0 = no noise, 1 = full noise


// LFO START
const lfoEnabled = ref(true); // toggle knob group
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


function toggleNoise(type) {
	noiseType.value = noiseType.value === type ? 'none' : type;
}

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
	const oscEnvGain = audioCtx.createGain(); // NEW
	const noiseEnvGain = audioCtx.createGain(); // NEW
	const filter = audioCtx.createBiquadFilter();

	// Pitch envelope handling
	osc.type = selectedWaveform.value;

	if (pitchEnvEnabled.value) {
		// Pitch envelope enabled
		let semitoneOffset = pitchEnvSemitones.value;
		if (pitchMode.value === 'down') {
			semitoneOffset = -pitchEnvSemitones.value;
		} else if (pitchMode.value === 'random') {
			semitoneOffset = (Math.random() * 2 - 1) * pitchEnvSemitones.value;
		}
		const semitoneRatio = Math.pow(2, semitoneOffset / 12);
		const startFreq = freq * semitoneRatio;

		osc.frequency.setValueAtTime(startFreq, startTime);
		osc.frequency.exponentialRampToValueAtTime(freq, startTime + pitchEnvDecay.value);
	} else {
		// No pitch envelope, just set frequency
		osc.frequency.setValueAtTime(freq, startTime);
	}



	// Filter config
	filter.type = 'lowpass';
	if (filterEnabled.value) {
		filter.frequency.setValueAtTime(filterCutoff.value, startTime);
		filter.Q.setValueAtTime(filterResonance.value, startTime);
	}


	// Gain envelope
	const attackEnd = startTime + attackTime;
	const decayEnd = attackEnd + decay;

	// Crossfade values
	const blend = Math.min(Math.max(noiseAmount.value, 0), 1); // clamp 0–1
	const oscBlend = 1 - blend;
	const noiseBlend = blend;

	const safeOscGain = Math.max(0.0001, velocity * oscBlend);
	const safeNoiseGain = Math.max(0.0001, velocity * noiseBlend);

	oscEnvGain.gain.setValueAtTime(0.0001, startTime);
	oscEnvGain.gain.exponentialRampToValueAtTime(safeOscGain, attackEnd);
	oscEnvGain.gain.exponentialRampToValueAtTime(0.001, decayEnd);


	// Routing
	osc.connect(filter).connect(oscEnvGain).connect(masterGain);


	// LFO
	if (lfoEnabled.value) {
		if (lfoTarget.value === 'pitch') {
			lfoGain.connect(osc.frequency);
		} else if (lfoTarget.value === 'gain') {
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
			lfoSum.connect(oscEnvGain.gain);

			lfoOffset.start();

		} else if (lfoTarget.value === 'filter') {
			lfoGain.connect(filter.frequency);
		}
	}
	// Noise

	if (noiseType.value !== 'none' && noiseAmount.value > 0) {
		const noiseBuffer = noiseBuffers[noiseType.value];
		if (noiseBuffer) {
			const noiseSource = audioCtx.createBufferSource();
			noiseSource.buffer = noiseBuffer;

			noiseEnvGain.gain.setValueAtTime(0.0001, startTime);
			noiseEnvGain.gain.exponentialRampToValueAtTime(safeNoiseGain, attackEnd);
			noiseEnvGain.gain.exponentialRampToValueAtTime(0.001, decayEnd);

			const noiseFilter = audioCtx.createBiquadFilter();
			noiseFilter.type = 'bandpass';
			noiseFilter.frequency.setValueAtTime(8000, startTime);
			noiseFilter.Q.setValueAtTime(1, startTime);

			noiseSource.connect(noiseFilter).connect(noiseEnvGain).connect(masterGain);
			noiseSource.start(startTime);
			noiseSource.stop(decayEnd);

		}
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
	generateNoiseBuffers();

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

const noiseBuffers = {
	white: null,
	pink: null,
	brown: null,
};


// Noise Generator for Percussion Synth
function generateNoiseBuffers() {
	const length = audioCtx.sampleRate * 2; // 2 seconds
	const createBuffer = () => audioCtx.createBuffer(1, length, audioCtx.sampleRate);

	// White Noise
	const white = createBuffer();
	const whiteData = white.getChannelData(0);
	for (let i = 0; i < length; i++) {
		whiteData[i] = Math.random() * 2 - 1;
	}
	noiseBuffers.white = white;

	// Pink Noise
	const pink = createBuffer();
	const pinkData = pink.getChannelData(0);
	let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
	for (let i = 0; i < length; i++) {
		const white = Math.random() * 2 - 1;
		b0 = 0.99886 * b0 + white * 0.0555179;
		b1 = 0.99332 * b1 + white * 0.0750759;
		b2 = 0.96900 * b2 + white * 0.1538520;
		b3 = 0.86650 * b3 + white * 0.3104856;
		b4 = 0.55000 * b4 + white * 0.5329522;
		b5 = -0.7616 * b5 - white * 0.0168980;
		pinkData[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
		b6 = white * 0.115926;
	}
	noiseBuffers.pink = pink;

	// Brown Noise
	const brown = createBuffer();
	const brownData = brown.getChannelData(0);
	let lastOut = 0;
	for (let i = 0; i < length; i++) {
		const white = Math.random() * 2 - 1;
		lastOut = (lastOut + (0.02 * white)) / 1.02;
		brownData[i] = lastOut * 3.5;
	}
	noiseBuffers.brown = brown;
}


</script>

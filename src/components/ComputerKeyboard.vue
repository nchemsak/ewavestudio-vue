<template>
	<div class="outer-wrapper">
		<!-- Volume Slider -->
		<!-- <div class="mb-4">
			<label for="volume" class="form-label">Volume</label><br />
			<input type="range" min="0" max="1" step="0.01" class="form-range styled-slider" id="volume"
				v-model="volume" :aria-valuetext="`${Math.round(volume * 100)} percent`" />
			<div class="slider-percentage" id="label-volume">{{ volumeLabel }}</div>
		</div> -->
		<div>
			<!-- <Knob v-model="volume" label="Volume" :min="0" :max="1" :step="0.01" color="#23CDE8" /> -->
			<Knob v-model="volume" label="Volume" :min="0" :max="1" :step="0.01" color="#23CDE8" />
			
		</div>
		<div class="waveformGroupWrapper">
			<div class="visualizer-stack d-flex flex-column gap-3 mb-4">
				<div class="row">
					<div class="col-md-6">
						<canvas id="oscilloscope1" width="600" height="200" class="waveform-visual"></canvas>
					</div>
					<div class="col-md-6">
						<canvas id="oscilloscope2" width="600" height="200" class="waveform-visual"></canvas>
					</div>
				</div>
			</div>
			<div class="row">
				<div class="col-md-6">
					<div class="mb-4 waveformgroup">
						<label class="form-label d-block">Waveform Group 1</label>
						<div class="waveform-selector d-flex flex-wrap">
							<div v-for="wave in waveforms" :key="wave + '-1'" class="waveform-option"
								:class="{ selected: selectedWave1 === wave, disabled: selectedWave2 === wave }"
								@click="selectedWave2 !== wave && selectWave1(wave)">


								<template v-if="wave !== 'custom'">
									<img :src="`images/${wave}1.png`" :alt="`${wave} waveform`" />
								</template>
								<template v-else>
									<div class="custom-wave-box text-center">
										<canvas id="waveformPreview1"></canvas>
									</div>
								</template>
							</div>
						</div>
						<div class="unison-controls">
							<div class="slider-label-row">
								<label>Unison Count</label>
								<span>{{ unisonCount1 }}</span>
							</div>
							<input type="range" class="styled-slider" min="1" max="15" v-model="unisonCount1" />

							<div class="slider-label-row">
								<label>Detune</label>
								<span>{{ detuneCents1 }} cents</span>
							</div>
							<input type="range" class="styled-slider" min="0" max="50" step="1"
								v-model="detuneCents1" />

							<div class="slider-label-row">
								<label>Stereo Spread</label>
								<span>{{ stereoSpread1 }} </span>
							</div>
							<input type="range" class="styled-slider" min="0" max="1" step="0.01"
								v-model="stereoSpread1" />
						</div>
					</div>
				</div>
				<div class="col-md-6">
					<div class="mb-4 waveformgroup">
						<label class="form-label d-block">Waveform Group 2</label>
						<div class="waveform-selector d-flex flex-wrap">
							<div v-for="wave in waveforms" :key="wave + '-2'" class="waveform-option"
								:class="{ selected: selectedWave2 === wave, disabled: selectedWave1 === wave }"
								@click="selectedWave1 !== wave && selectWave2(wave)">
								<!-- @click="selectWave2(wave)"> -->
								<template v-if="wave !== 'custom'">
									<img :src="`images/${wave}1.png`" :alt="`${wave} waveform`" />
								</template>
								<template v-else>
									<div class="custom-wave-box text-center">
										<canvas id="waveformPreview2"></canvas>
									</div>
								</template>
							</div>
						</div>
						<div class="unison-controls">
							<div class="slider-label-row">
								<label>Unison Count</label>
								<span>{{ unisonCount2 }}</span>
							</div>
							<input type="range" class="styled-slider" min="1" max="15" v-model="unisonCount2" />

							<div class="slider-label-row">
								<label>Detune</label>
								<span>{{ detuneCents2 }} cents</span>
							</div>
							<input type="range" class="styled-slider" min="0" max="50" step="1"
								v-model="detuneCents2" />


							<div class="slider-label-row">
								<label>Stereo Spread</label>
								<span>{{ stereoSpread2 }} </span>
							</div>
							<input type="range" class="styled-slider" min="0" max="1" step="0.01"
								v-model="stereoSpread2" />
						</div>
					</div>
				</div>
			</div>
			<!-- Custom Waveform Controls -->
			<div v-if="selectedWave1 === 'custom' || selectedWave2 === 'custom'" id="custom-waveform-controls"
				class="mt-4">
				<h4>Custom Waveform Harmonics</h4>
				<div class="d-flex gap-4 align-items-start">
					<div>
						<div v-for="i in 8" :key="'real-' + i" class="mb-2">
							<label>H{{ i }}</label>
							<input type="range" min="-1" max="1" step="0.01" :value="customReal[i]"
								@input="updateHarmonic(i, $event.target.value)"
								:aria-valuetext="`Harmonic ${i} amplitude: ${customReal[i]}`" />
						</div>
					</div>
				</div><br />
				<button type="button" class="btn btn-outline-secondary mt-3" @click="resetHarmonics">Reset
					Harmonics</button>
			</div>
			<div class="row">
				<div class="col-md-12">
					<div class="mb-4 waveMixWrapper">

						<label for="waveMix" class="form-label">Wave Mix</label><br />
						<input type="range" min="0" max="1" step="0.01" class="styled-slider" id="waveMix"
							v-model="waveMix"
							:aria-valuetext="`Wave 1: ${waveMixDisplay.wave1}%, Wave 2: ${waveMixDisplay.wave2}%`" />
						<div class="slider-percentage">
							<span class="wave1percent">Wave 1: {{ waveMixDisplay.wave1 }}%</span>&nbsp; ⇄
							&nbsp;<span class="wave2percent">Wave 2: {{ waveMixDisplay.wave2 }}%</span>
						</div>
					</div>
				</div>

			</div>
		</div>
		<!-- <div class="mb-3 mt-3 midiModeWrapper">
					<select id="midiMode" v-model="midiMode" @change="onMidiModeChange" class="form-select w-auto">
						<option disabled selected value="">MIDI Mode</option>
						<option value="osc">MIDI Keyboard (Synth)</option>
						<option value="sample" disabled>Sampler (Coming Soon)</option>
					</select>
				</div> -->
		<div class="waveformGroupWrapper">
			<div class="mb-4 waveformgroup">
				<label class="form-label d-block">Effects</label>

				<!-- Effect Selector Icons -->

				<div class="waveform-selector d-flex flex-wrap">
					<div v-for="effect in effects" :key="effect.id" class="waveform-option"
						:class="{ selected: selectedEffect === effect.id }"
						@click="selectedEffect === effect.id ? selectedEffect = null : selectedEffect = effect.id">
						<img :src="`images/${effect.icon}`" :alt="effect.name" />
					</div>
				</div>

				<!-- Effect Controls (only Delay for now) -->
				<div class="unison-controls mt-3" v-if="selectedEffect === 'delay'">
					<div class="form-check mb-3">
						<input class="form-check-input" type="checkbox" id="delayEnabled" v-model="delayEnabled" />
						<label class="form-check-label" for="delayEnabled">Enable Delay</label>
					</div>

					<div class="slider-label-row">
						<label>Delay Time</label>
						<span>{{ delayTime }} ms</span>
					</div>
					<input type="range" min="0" max="1000" step="10" v-model="delayTime" class="styled-slider" />

					<div class="slider-label-row">
						<label>Feedback</label>
						<span>{{ delayFeedback }}</span>
					</div>
					<input type="range" min="0" max="0.95" step="0.01" v-model="delayFeedback" class="styled-slider" />

					<!-- Wet/Dry Mix Label Row -->
					<div class="d-flex justify-content-between align-items-center slider-label-row">
						<small>Dry</small>
						<strong>{{ Math.round(delayWetMix * 100) }}%</strong>
						<small>Wet</small>
					</div>

					<!-- Wet/Dry Mix Slider -->
					<input type="range" min="0" max="1" step="0.01" v-model="delayWetMix" class="styled-slider" />

				</div>

				<!-- Placeholder for future effects -->
				<div class="mt-3" v-else>
					<p>Effect not yet available.</p>
				</div>
			</div>
		</div>
		<ul class="keyboard">
			<li v-for="note in keyboardNotes" :key="note.note || note.id" class="keyboard-key">

				<!-- Mouse-only key -->
				<template v-if="!note.id">
					<div class="key mouse-only" :data-note="note.note" role="button" tabindex="0"
						:aria-label="`Note ${note.note}`" @mousedown="playNote(note.note)"
						@mouseup="stopNote(note.note)" @mouseleave="stopNote(note.note)"
						@mouseenter="onMouseEnter(note.note)">
						<span class="note">{{ note.note }}</span>
					</div>

					<div v-if="note.sharp" class="upper-key mouse-only" :data-note="note.sharp" role="button"
						tabindex="0" :aria-label="`Note ${note.sharp}`" @mousedown="playNote(note.sharp)"
						@mouseup="stopNote(note.sharp)" @mouseleave="stopNote(note.sharp)"
						@mouseenter="onMouseEnter(note.sharp)">
						<span><small>{{ note.sharp }}</small></span>
					</div>
				</template>

				<!-- Keyboard and Mouse key -->
				<template v-else>
					<div class="key" :id="note.id" :data-note="note.note" role="button" tabindex="0"
						:aria-label="`Key ${note.label}, note ${note.note}`" @mousedown="onKeyMouseDown(note.id)"
						@mouseup="onKeyMouseUp(note.id)" @mouseleave="onKeyMouseUp(note.id)"
						@mouseenter="onKeyMouseEnter(note.id)">
						<span class="kbd">{{ note.label }}</span>
						<span class="note">{{ note.note }}</span>
					</div>

					<div v-if="note.sharp" class="upper-key" :id="note.sharpId" :data-note="note.sharp" role="button"
						tabindex="0" :aria-label="`Key ${note.sharpLabel}, note ${note.sharp}`"
						@mousedown="onKeyMouseDown(note.sharpId)" @mouseup="onKeyMouseUp(note.sharpId)"
						@mouseleave="onKeyMouseUp(note.sharpId)" @mouseenter="onKeyMouseEnter(note.sharpId)">
						<span>{{ note.sharpLabel }}<br /><small>{{ note.sharp }}</small></span>
					</div>
				</template>

			</li>
		</ul>
	</div>
	<div class="mb-3 mt-3 midiModeWrapper">
		<select id="midiMode" v-model="midiMode" @change="onMidiModeChange" class="form-select w-auto">
			<option disabled selected value="">MIDI Mode</option>
			<option value="osc">MIDI Keyboard (Synth)</option>
			<option value="sample" disabled>Sampler (Coming Soon)</option>
		</select>
	</div>
	<div class="text-center mt-4">
		<div id="active-notes-display">
			<span class="active-note-label-label">Active Notes:</span>
			<span id="active-notes">
				<span v-if="activeNotes.length === 0" class="active-note-label inactive">
					<span class="note-icon">🎵</span>
					<span class="note-text">None</span>
				</span>
				<span v-else>
					<span v-for="note in activeNotes" :key="note" class="active-note-label">
						<span class="note-icon">🎵</span><span class="note-text">{{ note }}</span>
					</span>
				</span>
			</span>
		</div>
	</div>
	<!-- <FloatingWindow v-if="showPresets" @close="showPresets = false">
			<template #title>Presets</template>
			<PresetBankPanel :banks="banks" :activeBankIndex="activeBankIndex" :isTyping="isTyping" @save="saveToBank"
				@load="loadFromBank" @clear="clearBank" @edit="startEditingBank" :bankHasData="bankHasData"
				@update:isTyping="val => isTyping = val" />
		</FloatingWindow> -->

</template>

<script setup>
const isDisabled = (wave) => selectedWave2.value === wave;

import { ref, watch, onMounted, onBeforeUnmount, watchEffect } from 'vue';
import { nextTick } from 'vue';
import FloatingWindow from './FloatingWindow.vue';
import PresetBankPanel from './PresetBankPanel.vue';
import { computed } from 'vue';
import Knob from './Knob.vue';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Visualizer
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 1024;

const masterGain = audioCtx.createGain();
masterGain.gain.value = 1;


const waveMixDisplay = computed(() => ({
	wave1: Math.round((1 - waveMix.value) * 100),
	wave2: Math.round(waveMix.value * 100)
}));

const showPresets = ref(true);



// Final output	
masterGain.connect(analyser);
analyser.connect(audioCtx.destination);
// analyser.connect(masterGain);

const volume = ref(0.5);
const volumeLabel = ref('50%');
watch(volume, (val) => {
	volumeLabel.value = `${Math.round(val * 100)}%`;
});

const waveforms = ['sine', 'square', 'sawtooth', 'triangle', 'custom'];

const selectedWave1 = ref('sine');
const selectedWave2 = ref(null);

// Effects Selector
const effects = [
	{ id: 'delay', name: 'Delay', icon: 'sine1.png' },
	{ id: 'chorus', name: 'Chorus', icon: 'square1.png' },
	{ id: 'flanger', name: 'Flanger', icon: 'triangle1.png' },
	{ id: 'reverb', name: 'Reverb', icon: 'sawtooth1.png' }
];

const selectedEffect = ref('null');


const waveMix = ref(0.5); // 0 = all wave1, 1 = all wave2

const unisonCount1 = ref(1);
const detuneCents1 = ref(0);
const stereoSpread1 = ref(0);

const unisonCount2 = ref(1);
const detuneCents2 = ref(0);
const stereoSpread2 = ref(0);


const analyser1 = audioCtx.createAnalyser();
const analyser2 = audioCtx.createAnalyser();

analyser1.fftSize = 1024;
analyser2.fftSize = 1024;

const selectWave1 = (wave) => {
	if (selectedWave1.value === wave) {
		selectedWave1.value = null; // toggle off
	} else {
		selectedWave1.value = wave;
		if (selectedWave2.value === wave) {
			selectedWave2.value = null;
		}
	}
};


const selectWave2 = (wave) => {
	if (selectedWave2.value === wave) {
		selectedWave2.value = null; // toggle off
	} else {
		selectedWave2.value = wave;
		if (selectedWave1.value === wave) {
			selectedWave1.value = null;
		}
	}
};

const preloadImages = () => {
	// Preload waveform icons
	waveforms.forEach(w => {
		if (w !== 'custom') {
			const img = new Image();
			img.src = `images/${w}1.png`;
			// img.onload = () => console.log(`${img.src} loaded`);
		}
	});

};



onMounted(preloadImages);


const waveformType = ref('sine');
const selectWave = (wave) => {
	waveformType.value = wave;
};

const customReal = ref(new Array(9).fill(0));
customReal.value[1] = 1; // set H1 as the default active harmonic

const resetHarmonics = () => {
	customReal.value = new Array(9).fill(0);
	customReal.value[1] = 1; // restore default H1
};

const noteFrequencies = {
	F3: 174.61, 'F#3': 185.00,
	G3: 196.00, 'G#3': 207.65,
	A3: 220.00, 'A#3': 233.08,
	B3: 246.94,
	C4: 261.63, 'C#4': 277.18,
	D4: 293.66, 'D#4': 311.13,
	E4: 329.63,
	F4: 349.23, 'F#4': 369.99,
	G4: 392.00, 'G#4': 415.30,
	A4: 440.00, 'A#4': 466.16,
	B4: 493.88,
	C5: 523.25, 'C#5': 554.37,
	D5: 587.33, 'D#5': 622.25,
	E5: 659.25,
	F5: 698.46, 'F#5': 739.99,
	G5: 783.99, 'G#5': 830.61,
	A5: 880.00, 'A#5': 932.33, B5: 987.77,
	C6: 1046.50
};

function midiToNoteName(midiNote) {
	const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
	const octave = Math.floor(midiNote / 12) - 1;
	const note = noteNames[midiNote % 12] + octave;
	return noteFrequencies[note] ? note : null;
}

const pitchBend = ref(0); // in semitones, -2 to +2 default
const modulationDepth = ref(0); // 0.0 to 1.0

const keyboardNotes = [
	// Mouse-only lower keys (with sharps defined inline)
	{ note: 'G3', sharp: 'G#3' },
	{ note: 'A3', sharp: 'A#3' },
	{ note: 'B3' },

	// Keyboard and Mouse keys
	{ id: 'KeyA', label: 'A', note: 'C4', sharp: 'C#4', sharpId: 'KeyW', sharpLabel: 'W' },
	{ id: 'KeyS', label: 'S', note: 'D4', sharp: 'D#4', sharpId: 'KeyE', sharpLabel: 'E' },
	{ id: 'KeyD', label: 'D', note: 'E4' },
	{ id: 'KeyF', label: 'F', note: 'F4', sharp: 'F#4', sharpId: 'KeyT', sharpLabel: 'T' },
	{ id: 'KeyG', label: 'G', note: 'G4', sharp: 'G#4', sharpId: 'KeyY', sharpLabel: 'Y' },
	{ id: 'KeyH', label: 'H', note: 'A4', sharp: 'A#4', sharpId: 'KeyU', sharpLabel: 'U' },
	{ id: 'KeyJ', label: 'J', note: 'B4' },
	{ id: 'KeyK', label: 'K', note: 'C5', sharp: 'C#5', sharpId: 'KeyO', sharpLabel: 'O' },
	{ id: 'KeyL', label: 'L', note: 'D5', sharp: 'D#5', sharpId: 'KeyP', sharpLabel: 'P' },
	{ id: 'Semicolon', label: ';', note: 'E5' },

	// Mouse-only upper keys
	{ note: 'F5', sharp: 'F#5' },
	{ note: 'G5' }
];

const midiMode = ref(''); // starts blank. TODO: add 'sample' option


const activeOscillators = new Map();
const activeNotes = ref([]);


function retriggerActiveNotes() {
	const notesToRetrigger = [...activeNotes.value];

	for (const note of notesToRetrigger) {
		stopNote(note);
	}

	setTimeout(() => {
		for (const note of notesToRetrigger) {
			if (heldNotes.has(note)) {
				playNote(note); // only retrigger if physically held
			}
		}
	}, 50);
}


function playNote(note) {
	const groupGainNodes = [];
	const freq = noteFrequencies[note];
	if (!freq) return;

	const el = document.querySelector(`[data-note="${note}"]`);
	if (el) el.classList.add('active');

	const gainNode = audioCtx.createGain();
	gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime); // silent start
	gainNode.connect(masterGain);


	// Move this to *after* all connections are established
	gainNode.gain.setTargetAtTime(volume.value, audioCtx.currentTime, 0.01);


	const oscillators = [];
	const panners = [];

	const waveGroups = [
		{
			wave: selectedWave1.value,
			unison: unisonCount1.value,
			detune: detuneCents1.value,
			spread: stereoSpread1.value,
			gainValue: 1 - waveMix.value,
			analyser: analyser1,
		},
		{
			wave: selectedWave2.value,
			unison: unisonCount2.value,
			detune: detuneCents2.value,
			spread: stereoSpread2.value,
			gainValue: waveMix.value,
			analyser: analyser2,
		},
	];

	const wave = waveformType.value;

	for (const group of waveGroups) {
		if (!group.wave) continue;
		const groupGainNode = audioCtx.createGain(); // Create a gain node for each group
		groupGainNode.gain.value = Number.isFinite(group.gainValue) ? group.gainValue : 0;

		groupGainNode.gain.value = group.gainValue;
		groupGainNode.connect(gainNode);

		// New: intermediary gain node to avoid clipping in analyser
		const analyserGain = audioCtx.createGain();
		analyserGain.gain.value = 0.25; // reduce signal strength to visualizer
		groupGainNode.connect(analyserGain);
		analyserGain.connect(group.analyser);


		groupGainNodes.push(groupGainNode);
		for (let u = 0; u < group.unison; u++) {
			const osc = audioCtx.createOscillator();
			const gain = audioCtx.createGain();
			const pan = audioCtx.createStereoPanner();

			// Oscillator config
			if (group.wave === 'custom') {
				const real = new Float32Array(customReal.value);
				const imag = new Float32Array(customReal.value.length);
				osc.setPeriodicWave(audioCtx.createPeriodicWave(real, imag));
				osc.isCustom = true;
			} else {
				osc.type = group.wave;
			}

			const detuneOffset = (group.unison === 1)
				? 0
				: ((u - Math.floor(group.unison / 2)) * group.detune);
			osc.frequency.setValueAtTime(freq * Math.pow(2, pitchBend.value / 12), audioCtx.currentTime);
			osc.detune.value = detuneOffset;

			// Panning
			let panVal = 0;

			if (group.unison > 1 && Number.isFinite(group.spread)) {
				panVal = ((u - Math.floor(group.unison / 2)) / (group.unison - 1)) * group.spread;
			}

			if (!Number.isFinite(panVal)) {
				console.warn('Invalid panVal:', panVal, 'unison:', group.unison, 'spread:', group.spread);
				panVal = 0;
			}

			pan.pan.value = panVal;


			// Volume per group
			// gain.gain.value = (volume.value * group.gainValue) / (group.unison || 1);
			gain.gain.value = 1 / (group.unison || 1);



			osc.connect(gain).connect(pan).connect(groupGainNode);
			osc.start();

			oscillators.push(osc);
			panners.push(pan);
		}
	}


	let lfo = null, lfoGain = null;
	if (modulationDepth.value > 0 && oscillators[0]) {
		lfo = audioCtx.createOscillator();
		lfo.frequency.value = 6;
		lfoGain = audioCtx.createGain();
		lfoGain.gain.value = modulationDepth.value * 10;
		lfo.connect(lfoGain).connect(oscillators[0].frequency);
		lfo.start();
	}

	activeOscillators.set(note, {
		oscillators,
		panners,
		gainNode,
		groupGainNodes,
		startedAt: audioCtx.currentTime,
		baseFreq: freq,
		lfo,
		lfoGain
	});

	if (!activeNotes.value.includes(note)) activeNotes.value.push(note);
}

function stopNote(note) {
	heldNotes.delete(note);
	const active = activeOscillators.get(note);
	if (active) {
		// Stop audio
		const now = audioCtx.currentTime;
		active.gainNode.gain.setValueAtTime(active.gainNode.gain.value, now);
		active.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.05);
		active.oscillators.forEach(osc => osc.stop(now + 0.05));
		setTimeout(() => active.gainNode.disconnect(), 100);
		if (active.lfo) active.lfo.stop();

		activeOscillators.delete(note);
		activeNotes.value = activeNotes.value.filter(n => n !== note);
	}

	// Remove visual highlight if exists
	const el = document.querySelector(`[data-note="${note}"]`);
	if (el) el.classList.remove('active');
}

const isMouseDown = ref(false);
const keyMap = Object.fromEntries(keyboardNotes.flatMap(k => k.sharp ? [[k.id, k.note], [k.sharpId, k.sharp]] : [[k.id, k.note]]));

function handleMIDIMessage(event) {
	const [status, data1, data2] = event.data;
	const NOTE_ON = 0x90, NOTE_OFF = 0x80, CC = 0xB0, PITCH_BEND = 0xE0;

	if (midiMode.value !== 'osc') return;

	const noteName = midiToNoteName(data1);

	//  Note On/Off
	if (status >= NOTE_ON && status < NOTE_ON + 16 && data2 > 0 && noteName) {
		if (!isNoteActive(noteName)) playNote(noteName);
	} else if ((status >= NOTE_OFF && status < NOTE_OFF + 16) || (status >= NOTE_ON && data2 === 0)) {
		if (noteName) stopNote(noteName);
	}

	// Volume CC
	if (status >= CC && status < CC + 16 && data1 === 7) {
		const normalized = data2 / 127;
		volume.value = parseFloat(normalized.toFixed(2));
	}

	// Modulation Wheel (CC #1)
	if (status >= CC && status < CC + 16 && data1 === 1) {
		const modDepth = data2 / 127;
		modulationDepth.value = modDepth;
	}

	// Pitch Bend
	if (status >= PITCH_BEND && status < PITCH_BEND + 16) {
		const lsb = data1;
		const msb = data2;
		const bendValue = ((msb << 7) | lsb) - 8192; // 14-bit signed
		const bendRange = 2; // semitones
		pitchBend.value = bendValue / 8192 * bendRange; // -2 to +2
	}
}



function onKeyMouseDown(id) {
	isMouseDown.value = true;
	const note = keyMap[id];
	if (note) {
		heldNotes.add(note);
		if (!isNoteActive(note)) {
			playNote(note);
			document.getElementById(id)?.classList.add('active');
		}
	}
}

function onKeyMouseUp(id) {
	const note = keyMap[id];
	if (note) {
		heldNotes.delete(note);
		stopNote(note);
		document.getElementById(id)?.classList.remove('active');
	}
}


function onKeyMouseEnter(id) {
	if (!isMouseDown.value) return;
	const note = keyMap[id];
	if (note && !isNoteActive(note)) {
		playNote(note);
		document.getElementById(id)?.classList.add('active');
	}
}

function onMouseEnter(note) {
	if (!isMouseDown.value) return;
	if (!isNoteActive(note)) {
		heldNotes.add(note);
		playNote(note);
	}
}


onMounted(() => {
	drawWaveformFromReal(customReal.value);
	drawWaveformFromReal(customReal.value, 'waveformPreview1');
	drawWaveformFromReal(customReal.value, 'waveformPreview2');

	drawOscilloscope(analyser1, 'oscilloscope1', '#27fcff');
	drawOscilloscope(analyser2, 'oscilloscope2', 'pink');
	// Set up MIDI immediately
	if (navigator.requestMIDIAccess) {
		navigator.requestMIDIAccess().then((access) => {
			for (let input of access.inputs.values()) {
				input.addEventListener('midimessage', handleMIDIMessage);
			}
		}).catch(err => {
			console.warn('MIDI Access failed:', err);
		});
	}

	// Existing listeners
	window.addEventListener('keydown', e => {
		if (isTyping.value) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;

		const note = keyMap[e.code];
		if (note && !isNoteActive(note)) {
			playNote(note);
			document.getElementById(e.code)?.classList.add('active');
		}
	});

	window.addEventListener('keyup', e => {
		const note = keyMap[e.code];
		if (note) stopNote(note);
		document.getElementById(e.code)?.classList.remove('active');
	});

	window.addEventListener('mousedown', () => isMouseDown.value = true);
	window.addEventListener('mouseup', () => isMouseDown.value = false);
	// drawOscilloscope();
	// drawRainbowVisualizer();
	connectEffects();

});



onBeforeUnmount(() => {
	window.removeEventListener('mousedown', () => isMouseDown.value = true);
	window.removeEventListener('mouseup', () => isMouseDown.value = false);
});


function isNoteActive(note) {
	return activeOscillators.has(note);
}

function drawWaveformFromReal(real, canvasId = 'waveformPreview1') {
	const canvas = document.getElementById(canvasId);
	if (!canvas) return;

	const dpr = window.devicePixelRatio || 1;
	const width = 15;
	const height = 15;
	canvas.width = width * dpr;
	canvas.height = height * dpr;
	canvas.style.width = width + 'px';
	canvas.style.height = height + 'px';

	const ctx = canvas.getContext('2d');
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

	const midY = height / 2;
	const samples = 512;
	const waveform = new Array(samples).fill(0);

	// Build waveform from harmonics
	for (let i = 1; i < real.length; i++) {
		const amp = real[i];
		for (let j = 0; j < samples; j++) {
			const t = j / samples;
			waveform[j] += amp * Math.cos(2 * Math.PI * i * t);
		}
	}

	// Normalize
	const max = Math.max(...waveform.map(Math.abs)) || 1;
	const normalized = waveform.map(v => v / max);

	// Draw
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.beginPath();
	ctx.moveTo(0, midY - normalized[0] * midY);
	for (let x = 1; x < samples; x++) {
		const y = midY - normalized[x] * midY;
		ctx.lineTo((x / samples) * width, y);
	}
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 1.5;
	ctx.stroke();
}


// Re-render waveform whenever harmonics change
watchEffect(() => {
	drawWaveformFromReal(customReal.value, 'waveformPreview1');
	drawWaveformFromReal(customReal.value, 'waveformPreview2');
});

function updateHarmonic(index, value) {
	customReal.value[index] = parseFloat(value);
	customReal.value = [...customReal.value]; // force Vue to detect update
}

const banks = ref([
	{ name: 'Bank 1', data: null, editing: false },
	{ name: 'Bank 2', data: null, editing: false },
	{ name: 'Bank 3', data: null, editing: false }
]);

function saveToBank(index) {
	banks.value[index].name = `Preset ${index + 1}`;
	banks.value[index].timestamp = Date.now();

	banks.value[index].data = {
		selectedWave1: selectedWave1.value,
		selectedWave2: selectedWave2.value,
		waveMix: waveMix.value,

		customReal: [...customReal.value],

		unisonCount1: unisonCount1.value,
		detuneCents1: detuneCents1.value,
		stereoSpread1: stereoSpread1.value,

		unisonCount2: unisonCount2.value,
		detuneCents2: detuneCents2.value,
		stereoSpread2: stereoSpread2.value,

		delayTime: delayTime.value,
		delayFeedback: delayFeedback.value,
		delayWetMix: delayWetMix.value,
		delayEnabled: delayEnabled.value
	};
}


function loadFromBank(index) {
	const data = banks.value[index].data;
	if (!data) return;

	selectedWave1.value = data.selectedWave1 || null;
	selectedWave2.value = data.selectedWave2 || null;
	waveMix.value = data?.waveMix ?? 0.5;


	customReal.value = data.customReal ? [...data.customReal] : [0, 0, 0, 0, 0];
	drawWaveformFromReal();

	unisonCount1.value = data.unisonCount1 ?? 1;
	detuneCents1.value = data.detuneCents1 ?? 0;
	stereoSpread1.value = data.stereoSpread1 ?? 0;

	unisonCount2.value = data.unisonCount2 ?? 1;
	detuneCents2.value = data.detuneCents2 ?? 0;
	stereoSpread2.value = data.stereoSpread2 ?? 0;

	delayTime.value = data.delayTime ?? 250;
	delayFeedback.value = data.delayFeedback ?? 0.35;
	delayWetMix.value = data.delayWetMix ?? 0.5;
	delayEnabled.value = data.delayEnabled ?? true;
}


function renameBank(index) {
	const newName = prompt('Enter new name for this bank:', banks.value[index].name);
	if (newName) banks.value[index].name = newName;
}

function clearBank(index) {
	banks.value[index].data = null;
	banks.value[index].name = `Bank ${index + 1}`;
}
function startEditingBank(index) {
	banks.value.forEach((b, i) => b.editing = i === index); // Only one editable at a time
}

const isTyping = ref(false);
function bankHasData(index) {
	const bank = banks.value[index];
	return bank && bank.data !== null;
}
const activeBankIndex = ref(null);




function onMidiModeChange() {
	if (audioCtx.state === 'suspended') {
		audioCtx.resume().then(() => console.log('AudioContext resumed'));
	}
}

// Smooth live updates for active notes without retriggering

watch(volume, (val) => {
	activeOscillators.forEach(({ gainNode }) => {
		gainNode.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
	});
});


watch(pitchBend, (bend) => {
	activeOscillators.forEach(({ oscillators, baseFreq }) => {
		oscillators.forEach(osc => {
			osc.frequency.setTargetAtTime(baseFreq * Math.pow(2, bend / 12), audioCtx.currentTime, 0.01);
		});
	});
});

watch(modulationDepth, (depth) => {
	activeOscillators.forEach((oscData) => {
		const { oscillators, lfo, lfoGain } = oscData;

		if (depth > 0) {
			// Create LFO if it doesn't exist yet
			if (!lfo || !lfoGain) {
				const newLFO = audioCtx.createOscillator();
				const newLFOGain = audioCtx.createGain();
				newLFO.frequency.value = 6;
				newLFOGain.gain.value = depth * 10;

				newLFO.connect(newLFOGain).connect(oscillators[0].frequency);
				newLFO.start();

				oscData.lfo = newLFO;
				oscData.lfoGain = newLFOGain;
			} else {
				lfoGain.gain.setTargetAtTime(depth * 10, audioCtx.currentTime, 0.01);
			}
		} else {
			// Stop and disconnect LFO if modulation set to zero
			if (lfo) {
				try { lfo.stop(); } catch { }
				lfo.disconnect();
				oscData.lfo = null;
			}
			if (lfoGain) {
				lfoGain.disconnect();
				oscData.lfoGain = null;
			}
		}
	});
});


let retriggerTimeout = null;

const heldNotes = new Set();


const retriggerActiveNotesDebounced = (() => {
	let timeout = null;
	return () => {
		clearTimeout(timeout);
		timeout = setTimeout(retriggerActiveNotes, 100);
	};
})();

watch(detuneCents1, retriggerActiveNotesDebounced);
watch(unisonCount1, retriggerActiveNotesDebounced);
watch(stereoSpread1, retriggerActiveNotesDebounced);

watch(detuneCents2, retriggerActiveNotesDebounced);
watch(unisonCount2, retriggerActiveNotesDebounced);
watch(stereoSpread2, retriggerActiveNotesDebounced);





watch(waveMix, (val) => {
	activeOscillators.forEach(({ groupGainNodes }) => {
		if (groupGainNodes?.length === 2) {
			groupGainNodes[0].gain.setTargetAtTime(1 - val, audioCtx.currentTime, 0.01);
			groupGainNodes[1].gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
		}
	});
});

watch(customReal, (newReal) => {
	const real = new Float32Array(newReal);
	const imag = new Float32Array(real.length); // keep imaginary part zeroed

	for (const { oscillators } of activeOscillators.values()) {
		for (const osc of oscillators) {
			if (osc.isCustom) {
				const wave = audioCtx.createPeriodicWave(real, imag);
				osc.setPeriodicWave(wave);
			}
		}
	}
});


const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

function drawOscilloscope(analyser, canvasId = 'oscilloscope1', color = 'cyan') {
	const canvas = document.getElementById(canvasId);
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	const width = canvas.width;
	const height = canvas.height;

	const bufferLength = analyser.frequencyBinCount;
	const dataArray = new Uint8Array(bufferLength);

	function draw() {
		requestAnimationFrame(draw);
		analyser.getByteTimeDomainData(dataArray);

		ctx.fillStyle = '#121212';
		ctx.fillRect(0, 0, width, height);

		ctx.lineWidth = 2;
		ctx.strokeStyle = color;
		ctx.beginPath();

		const sliceWidth = width / bufferLength;
		let x = 0;

		for (let i = 0; i < bufferLength; i++) {
			const v = dataArray[i] / 128.0;
			const y = v * height / 2;

			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
			x += sliceWidth;
		}
		ctx.lineTo(width, height / 2);
		ctx.stroke();
	}

	draw();
}


//EFFECTS

// DELAY Nodes
const delayEnabled = ref(true);
const delayNode = audioCtx.createDelay();
delayNode.delayTime.value = 0.25; // 250ms

const feedbackGain = audioCtx.createGain();
feedbackGain.gain.value = 0.35;

const wetGain = audioCtx.createGain();
wetGain.gain.value = 0.5;

const dryGain = audioCtx.createGain();
dryGain.gain.value = 0.8;

const delayTime = ref(250);
const delayFeedback = ref(0.35);
const delayWetMix = ref(0.5);

watch(delayTime, val => delayNode.delayTime.setTargetAtTime(val / 1000, audioCtx.currentTime, 0.01));
watch(delayFeedback, val => feedbackGain.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01));
watch(delayWetMix, val => {
	wetGain.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
	dryGain.gain.setTargetAtTime(1 - val, audioCtx.currentTime, 0.01);
});
watch(delayEnabled, () => {
	connectEffects();
});



// CONNECT EFFECTS
function connectEffects() {
	masterGain.disconnect();
	dryGain.disconnect();
	wetGain.disconnect();
	delayNode.disconnect();
	feedbackGain.disconnect();
	masterGain.connect(dryGain);
	if (delayEnabled.value) {
		masterGain.connect(delayNode);
		delayNode.connect(feedbackGain);
		feedbackGain.connect(delayNode);
		delayNode.connect(wetGain);
		wetGain.connect(analyser);
	}
	dryGain.connect(analyser);
}


</script>
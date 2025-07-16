<template>
	<div id="darkWorkOne" class="p-3 computer-keyboard">
		<!-- Volume Slider -->
		<div class="mb-4">
			<label for="volume" class="form-label">Volume</label><br />
			<input type="range" min="0" max="1" step="0.01" class="form-range styled-slider" id="volume"
				v-model="volume" :aria-valuetext="`${Math.round(volume * 100)} percent`" />
			<div class="slider-percentage" id="label-volume">{{ volumeLabel }}</div>
		</div>

		<!-- Waveform Selection -->
		<div class="mb-4">
			<label class="form-label d-block">Wave Shape:</label>
			<div class="waveform-selector d-flex flex-wrap gap-3 mb-4">
				<div v-for="wave in waveforms" :key="wave" class="waveform-option"
					:class="{ selected: selectedWaves.includes(wave) }" :data-wave="wave" @click="toggleWave(wave)">
					<template v-if="wave !== 'custom'">
						<img :src="`images/${wave}1.png`" :alt="`${wave} waveform`" />
					</template>
					<!-- Inside waveform-option for 'custom' -->
					<template v-else>
						<div class="custom-wave-box text-center">
							<canvas id="waveformPreview" width="27" height="27"
								style="max-width: 27px; max-height: 27px;"></canvas>
						</div>
					</template>
				</div>
			</div>
		</div>


		<!-- Custom Waveform Controls -->
		<div v-if="selectedWaves.includes('custom')" id="custom-waveform-controls" class="mt-4">
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


		<!-- Waveform Mix Sliders -->
		<div id="waveformMixSliders">
			<h4>Waveform Mix</h4>
			<div class="outer-slider-wrapper border p-3 border rounded">
				<div v-for="wave in waveformMixes" :key="wave.id" class="mb-3 slider-wrapper">
					<label :for="`mix-${wave.id}`" class="form-label">{{ wave.label }}</label>
					<input type="range" min="0" max="1" step="0.01"
						:class="['form-range styled-slider', { 'disabled-slider': !selectedWaves.includes(wave.id) }]"
						:id="`mix-${wave.id}`" v-model="wave.value" :disabled="!selectedWaves.includes(wave.id)"
						:aria-valuetext="`${Math.round(wave.value * 100)} percent mix for ${wave.label}`" />

					<div class="slider-percentage" :id="`label-mix-${wave.id}`">{{ Math.round(wave.value * 100) }}%
					</div>
				</div>
			</div>
		</div>

		<!-- Preset Banks -->
		<!-- <div class="preset-banks">
			<h4>Presets</h4>
			<div class="d-flex flex-column gap-4">
				<div v-for="(bank, index) in banks" :key="'bank-' + index" class="bank-card p-3 border rounded"
					:class="{ 'active-bank': activeBankIndex === index }" style="width: 120px;">
					<div class="mb-2">
						<div class="bank-name-wrapper" style="width: 100%;">
							<input v-if="bank.editing" v-model="bank.name" @focus="isTyping = true"
								@blur="() => { isTyping = false; bank.editing = false }"
								@keydown.enter="() => { isTyping = false; bank.editing = false }"
								class="form-control form-control-sm w-100" />
							<span v-else @click="startEditingBank(index)" style="cursor: pointer;">
								<strong>{{ bank.name }}</strong>
								<i class="ms-1 bi bi-pencil-fill text-muted"></i>
							</span>
						</div>
					</div>
					<div class="d-flex flex-column gap-2">
						<button class="btn btn-sm btn-primary" @click="saveToBank(index)">Save</button>
						<button class="btn btn-sm btn-success" @click="loadFromBank(index)"
							:disabled="!bankHasData(index)">Load</button>
						<button class="btn btn-sm btn-danger" @click="clearBank(index)"
							:disabled="!bankHasData(index)">Clear</button>
					</div>
				</div>

			</div>
		</div> -->



		<!-- Keyboard Interface -->
		<div class="mt-5 keyboard-container">
			<!-- <canvas id="oscilloscope" width="600" height="200" class="waveform-visual"></canvas>
			<canvas id="rainbow-visualizer" width="600" height="200" class="waveform-visual mt-3"></canvas> -->


			<div class="visualizer-stack d-flex flex-column gap-3 mb-4">
				<canvas id="oscilloscope" width="600" height="200" class="waveform-visual"></canvas>
				<canvas id="rainbow-visualizer" width="600" height="350" class="waveform-visual mt-3"></canvas>
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

						<div v-if="note.sharp" class="upper-key" :id="note.sharpId" :data-note="note.sharp"
							role="button" tabindex="0" :aria-label="`Key ${note.sharpLabel}, note ${note.sharp}`"
							@mousedown="onKeyMouseDown(note.sharpId)" @mouseup="onKeyMouseUp(note.sharpId)"
							@mouseleave="onKeyMouseUp(note.sharpId)" @mouseenter="onKeyMouseEnter(note.sharpId)">
							<span>{{ note.sharpLabel }}<br /><small>{{ note.sharp }}</small></span>
						</div>
					</template>

				</li>
			</ul>



		</div>
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

	<div class="mb-3 mt-3 midiModeWrapper">
		<!-- <label for="midiMode" class="form-label">MIDI Mode:</label> -->
		<select id="midiMode" v-model="midiMode" @change="onMidiModeChange" class="form-select w-auto">

			<option disabled selected value="">MIDI Mode</option>
			<option value="osc">MIDI Keyboard (Synth)</option>
			<option value="sample" disabled>Sampler (Coming Soon)</option>
		</select>
	</div>
	<FloatingWindow v-if="showPresets" @close="showPresets = false">
		<template #title>Presets</template>
		<PresetBankPanel :banks="banks" :activeBankIndex="activeBankIndex" :isTyping="isTyping" @save="saveToBank"
			@load="loadFromBank" @clear="clearBank" @edit="startEditingBank" :bankHasData="bankHasData"
			@update:isTyping="val => isTyping = val" />
	</FloatingWindow>

	<div class="mt-3 p-3 bg-light rounded">
		<h5 class="mb-3">Unison Controls</h5>

		<!-- Unison Count -->
		<label class="form-label">Unison Voices</label>
		<select class="form-select mb-3" v-model="unisonCount">
			<option :value="1">1 (Mono)</option>
			<option :value="3">3</option>
			<option :value="5">5</option>
		</select>

		<!-- Detune Cents -->
		<label class="form-label">Detune Amount (cents)</label>
		<!-- <input type="range" min="0" max="50" step="1" v-model="detuneCents" :key="`detune-${detuneCents}`" class="
			form-range mb-2" :disabled="unisonCount === 1"> -->
		<input type="range" v-model="detuneCents" class="form-range detune-slider" min="0" max="50" step="1"
			:aria-valuetext="`${detuneCents} cents detune`">

		<div class="small text-muted">{{ detuneCents }} cents</div>

		<!-- Stereo Spread -->
		<label class="form-label mt-3">Stereo Spread</label>
		<!-- <input type="range" min="0" max="1" step="0.01" v-model="stereoSpread" :key="`spread-${stereoSpread}`" class="
			form-range" :disabled="unisonCount === 1"> -->
		<input type="range" v-model="stereoSpread" class="form-range spread-slider" min="0" max="1" step="0.01"
			:aria-valuetext="`${Math.round(stereoSpread * 100)} percent stereo spread`">

		<div class="small text-muted">{{ stereoSpread }}</div>
	</div>

</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, watchEffect } from 'vue';
import { nextTick } from 'vue';
import FloatingWindow from './FloatingWindow.vue';
import PresetBankPanel from './PresetBankPanel.vue';

const unisonCount = ref(1);       // Options: 1, 3, 5
const detuneCents = ref(0);       // Range: 0–50
const stereoSpread = ref(0);       // Range: 0–1
const showPresets = ref(true);



const volume = ref(0.5);
const volumeLabel = ref('50%');
watch(volume, (val) => {
	volumeLabel.value = `${Math.round(val * 100)}%`;
});

const waveforms = ['sine', 'square', 'sawtooth', 'triangle', 'custom'];
const selectedWaves = ref(['sine']);
const toggleWave = (wave) => {
	selectedWaves.value.includes(wave)
		? selectedWaves.value = selectedWaves.value.filter(w => w !== wave)
		: selectedWaves.value.push(wave);
};

const waveformMixes = ref([
	{ id: 'sine', label: 'Sine', value: 0.5 },
	{ id: 'square', label: 'Square', value: 0.5 },
	{ id: 'sawtooth', label: 'Sawtooth', value: 0.5 },
	{ id: 'triangle', label: 'Triangle', value: 0.5 },
	{ id: 'custom', label: 'Custom', value: 0.5 }
]);

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


const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const activeOscillators = new Map();
const activeNotes = ref([]);



function playNote(note) {
	const panners = [];
	const freq = noteFrequencies[note];
	if (!freq) return;

	const el = document.querySelector(`[data-note="${note}"]`);
	if (el) el.classList.add('active');

	// === Detune & Stereo Spread Settings ===
	const UNISON_COUNT = unisonCount.value;
	const DETUNE_CENTS = detuneCents.value;
	const STEREO_SPREAD = stereoSpread.value;

	const gainNode = audioCtx.createGain();
	gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
	gainNode.gain.linearRampToValueAtTime(volume.value, audioCtx.currentTime + 0.02);
	gainNode.connect(analyser);

	gainNode.connect(audioCtx.destination);

	const oscillators = [];
	const gains = {};



	waveformMixes.value.forEach((wave) => {
		if (wave.value > 0 && selectedWaves.value.includes(wave.id)) {
			for (let u = 0; u < UNISON_COUNT; u++) {
				const osc = audioCtx.createOscillator();

				if (wave.id === 'custom') {
					const real = new Float32Array(customReal.value);
					const imag = new Float32Array(customReal.value.length);
					osc.setPeriodicWave(audioCtx.createPeriodicWave(real, imag));
				} else {
					osc.type = wave.id;
				}

				// Detune logic
				const detuneOffset = (UNISON_COUNT === 1)
					? 0
					: ((u - Math.floor(UNISON_COUNT / 2)) * DETUNE_CENTS);
				osc.frequency.setValueAtTime(freq * Math.pow(2, pitchBend.value / 12), audioCtx.currentTime);
				osc.detune.value = detuneOffset;

				// Gain node per unison voice
				const g = audioCtx.createGain();
				g.gain.value = wave.value / UNISON_COUNT;

				// Stereo panning
				const p = audioCtx.createStereoPanner();
				const panVal = (UNISON_COUNT === 1)
					? 0
					: ((u - Math.floor(UNISON_COUNT / 2)) / (UNISON_COUNT - 1)) * STEREO_SPREAD;
				p.pan.value = panVal;
				panners.push(p);
				osc.connect(g).connect(p).connect(gainNode);
				osc.start();
				oscillators.push(osc);

			}

			// Optional: store gain per wave type (not per unison)
			gains[wave.id] = wave.value;
		}
	});

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
		gainNode,
		gains,
		baseFreq: freq,
		lfo,
		lfoGain,
		panners
	});

	if (!activeNotes.value.includes(note)) activeNotes.value.push(note);
}



function stopNote(note) {
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
	if (note && !isNoteActive(note)) {
		playNote(note);
		document.getElementById(id)?.classList.add('active');
	}
}

function onKeyMouseUp(id) {
	const note = keyMap[id];
	if (note) stopNote(note);
	document.getElementById(id)?.classList.remove('active');
}

function onKeyMouseEnter(id) {
	if (!isMouseDown.value) return;
	const note = keyMap[id];
	if (note && !isNoteActive(note)) {
		playNote(note);
		document.getElementById(id)?.classList.add('active');
	}
}


onMounted(() => {
	drawWaveformFromReal(customReal.value);

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
	drawOscilloscope();
	drawRainbowVisualizer();


});



onBeforeUnmount(() => {
	window.removeEventListener('mousedown', () => isMouseDown.value = true);
	window.removeEventListener('mouseup', () => isMouseDown.value = false);
});


function isNoteActive(note) {
	return activeOscillators.has(note);
}

function drawWaveformFromReal(real, canvasId = 'waveformPreview') {
	const canvas = document.getElementById(canvasId);
	if (!canvas) return;

	const dpr = window.devicePixelRatio || 1;
	const width = 27;
	const height = 27;
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
	drawWaveformFromReal(customReal.value);
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
	banks.value[index].data = {
		selectedWaves: [...selectedWaves.value],
		waveformMixes: waveformMixes.value.map(w => ({ ...w })),
		customReal: [...customReal.value],
		unisonCount: unisonCount.value,
		detuneCents: detuneCents.value,
		stereoSpread: stereoSpread.value
	};
	banks.value[index].timestamp = Date.now();
	console.log('Saved data:', banks.value[index].data);
}

function loadFromBank(index) {
	const data = banks.value[index].data;
	if (!data) return;

	selectedWaves.value = [...data.selectedWaves];
	waveformMixes.value = data.waveformMixes.map(w => ({ ...w }));
	customReal.value = [...data.customReal];


	unisonCount.value = Number(data.unisonCount ?? 1);
	detuneCents.value = Number(data.detuneCents ?? 0);
	stereoSpread.value = Number(data.stereoSpread ?? 0);


	console.log('Loaded:', {
		unison: unisonCount.value,
		detune: detuneCents.value,
		spread: stereoSpread.value
	});

	console.log('Bank raw data:', data);
	activeBankIndex.value = index;
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


function onMouseEnter(note) {
	if (!isMouseDown.value) return;
	if (!isNoteActive(note)) {
		playNote(note);
	}
}

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

watch(waveformMixes, () => {
	activeOscillators.forEach(({ gains }) => {
		if (!gains) return;
		waveformMixes.value.forEach(w => {
			const g = gains[w.id];
			if (g) g.gain.setTargetAtTime(w.value, audioCtx.currentTime, 0.01);
		});
	});
}, { deep: true });

watch(pitchBend, (bend) => {
	activeOscillators.forEach(({ oscillators, baseFreq }) => {
		oscillators.forEach(osc => {
			osc.frequency.setTargetAtTime(baseFreq * Math.pow(2, bend / 12), audioCtx.currentTime, 0.01);
		});
	});
});

watch(modulationDepth, (depth) => {
	activeOscillators.forEach(({ lfoGain }) => {
		if (lfoGain) lfoGain.gain.setTargetAtTime(depth * 10, audioCtx.currentTime, 0.01);
	});
});


// Real-time Detune Adjustment
watch(detuneCents, (val) => {
	activeOscillators.forEach(({ oscillators }) => {
		const unison = unisonCount.value;
		if (unison === 1) return;

		let idx = 0;
		for (const wave of selectedWaves.value) {
			for (let u = 0; u < unison; u++) {
				const detuneOffset = (u - Math.floor(unison / 2)) * val;
				const osc = oscillators[idx++];
				if (osc && osc.detune) {
					osc.detune.setTargetAtTime(detuneOffset, audioCtx.currentTime, 0.01);
				}
			}
		}
	});
});

// Real-time Stereo Spread Adjustment
watch(stereoSpread, (val) => {
	activeOscillators.forEach(({ panners }) => {
		const unison = unisonCount.value;
		if (!panners || unison === 1) return;

		let idx = 0;
		for (const wave of selectedWaves.value) {
			for (let u = 0; u < unison; u++) {
				const panVal = ((u - Math.floor(unison / 2)) / (unison - 1 || 1)) * val;
				const panner = panners[idx++];
				if (panner) {
					panner.pan.setTargetAtTime(panVal, audioCtx.currentTime, 0.01);
				}
			}
		}
	});
});

// Visualizer
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 1024;

const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);
function drawOscilloscope() {
	const canvas = document.getElementById('oscilloscope');
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	const width = canvas.width;
	const height = canvas.height;

	function draw() {
		requestAnimationFrame(draw);
		analyser.getByteTimeDomainData(dataArray);

		ctx.fillStyle = '#121212';
		ctx.fillRect(0, 0, width, height);

		ctx.lineWidth = 2;
		ctx.strokeStyle = 'rgba(0,255,255,0.8)';
		ctx.beginPath();

		const sliceWidth = width * 1.0 / bufferLength;
		let x = 0;

		for (let i = 0; i < bufferLength; i++) {
			const v = dataArray[i] / 128.0; // 0 to 2
			const y = v * height / 2;

			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
			x += sliceWidth;
		}
		ctx.lineTo(canvas.width, canvas.height / 2);
		ctx.stroke();
	}
	draw();
}
function drawRainbowVisualizer() {
	const canvas = document.getElementById('rainbow-visualizer');
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	const width = canvas.width;
	const height = canvas.height;

	const layers = 9; // More layers = thicker band
	const spacing = 4.5; // px between each line
	const baseY = height / 2;
	const colors = [
		'#24D7BF', '#54FACA', '#FCCF34',
		'#FF9065', '#FF88A2', '#F45FA8',
		'#B957C6', '#995CD1', '#3E48A7'

	];
	// analyser.fftSize = 1024;
	analyser.fftSize = 2048;

	const bufferLength = analyser.fftSize;
	const dataArray = new Uint8Array(bufferLength);

	function draw() {
		requestAnimationFrame(draw);
		analyser.getByteTimeDomainData(dataArray);

		ctx.clearRect(0, 0, width, height);
		ctx.fillRect(0, 0, width, height);

		const sliceWidth = width / bufferLength;

		for (let l = 0; l < layers; l++) {
			const offsetY = baseY + (l - layers / 2) * spacing;
			const amplitude = 10;

			ctx.beginPath();
			ctx.strokeStyle = colors[l % colors.length];
			ctx.lineWidth = 3.5;
			ctx.lineCap = 'round';
			ctx.shadowColor = colors[l % colors.length];
			ctx.shadowBlur = 12;
			let x = 0;
			for (let i = 0; i < bufferLength; i++) {
				const v = dataArray[i] / 128.0;
				const y = offsetY + (v - 1) * amplitude * spacing * 2;

				if (i === 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, y);
				}
				x += sliceWidth;
			}
			ctx.stroke();
		}
	}
	draw();
}


</script>
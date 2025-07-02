<template>
	<div id="piano" class="p-3 computer-keyboard">
		<!-- Volume Slider -->
		<div class="mb-4">
			<label for="volume" class="form-label">Volume</label>
			<input type="range" min="0" max="1" step="0.01" class="form-range styled-slider" id="volume"
				v-model="volume" />
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
					<template v-else>
						<div class="text-center px-3 py-2">Custom</div>
					</template>
				</div>
			</div>
		</div>

		<!-- Custom Waveform Controls -->
		<div v-if="selectedWaves.includes('custom')" id="custom-waveform-controls" class="mt-4">
			<h4>Custom Waveform Harmonics</h4>
			<div class="d-flex gap-4 align-items-start">
				<div>
					<strong>Real:</strong><br />
					<div v-for="(val, i) in customReal" :key="'real-' + i" class="mb-2">
						<input type="range" min="-1" max="1" step="0.01" v-model.number="customReal[i]" />
					</div>
				</div>
				<div>
					<strong>Imag:</strong><br />
					<div v-for="(val, i) in customImag" :key="'imag-' + i" class="mb-2">
						<input type="range" min="-1" max="1" step="0.01" v-model.number="customImag[i]" />
					</div>
				</div>
			</div>
			<button type="button" class="btn btn-outline-secondary mt-3" @click="resetHarmonics">Reset
				Harmonics</button>
		</div>

		<!-- Waveform Mix Sliders -->
		<div v-for="wave in waveformMixes" :key="wave.id" class="mb-3 slider-wrapper">
			<label :for="`mix-${wave.id}`" class="form-label">{{ wave.label }}</label>
			<input type="range" min="0" max="1" step="0.01" class="form-range styled-slider" :id="`mix-${wave.id}`"
				v-model="wave.value" />
			<div class="slider-percentage" :id="`label-mix-${wave.id}`">{{ Math.round(wave.value * 100) }}%</div>
		</div>

		<!-- Keyboard Interface -->
		<div class="mt-5">
			<ul class="keyboard">
				<li v-for="note in keyboardNotes" :key="note.id">
					<div class="key" :id="note.id" :data-note="note.note" role="button" tabindex="0"
						:aria-label="`Key ${note.label}, note ${note.note}`" @mousedown="onKeyMouseDown(note.id)"
						@mouseup="onKeyMouseUp(note.id)" @mouseleave="onKeyMouseUp(note.id)"
						@mouseenter="onKeyMouseEnter(note.id)">
						<span class="kbd">{{ note.label }}</span><span class="note">{{ note.note }}</span>
					</div>
					<div v-if="note.sharp" class="upper-key" :id="note.sharpId" :data-note="note.sharp" role="button"
						tabindex="0" :aria-label="`Key ${note.sharpLabel}, note ${note.sharp}`"
						@mousedown="onKeyMouseDown(note.sharpId)" @mouseup="onKeyMouseUp(note.sharpId)"
						@mouseleave="onKeyMouseUp(note.sharpId)" @mouseenter="onKeyMouseEnter(note.sharpId)">
						<span>{{ note.sharpLabel }}<br /><small>{{ note.sharp }}</small></span>
					</div>
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
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';

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
	{ id: 'triangle', label: 'Triangle', value: 0.5 }
]);

const customReal = ref(new Array(16).fill(0));
const customImag = ref(new Array(16).fill(0));
const resetHarmonics = () => {
	customReal.value.fill(0);
	customImag.value.fill(0);
};

const noteFrequencies = {
	C4: 261.63, 'C#4': 277.18, D4: 293.66, 'D#4': 311.13, E4: 329.63,
	F4: 349.23, 'F#4': 369.99, G4: 392.00, 'G#4': 415.30,
	A4: 440.00, 'A#4': 466.16, B4: 493.88,
	C5: 523.25, 'C#5': 554.37, D5: 587.33, 'D#5': 622.25, E5: 659.25
};

const keyboardNotes = [
	{ id: 'KeyA', label: 'A', note: 'C4', sharp: 'C#4', sharpId: 'KeyW', sharpLabel: 'W' },
	{ id: 'KeyS', label: 'S', note: 'D4', sharp: 'D#4', sharpId: 'KeyE', sharpLabel: 'E' },
	{ id: 'KeyD', label: 'D', note: 'E4' },
	{ id: 'KeyF', label: 'F', note: 'F4', sharp: 'F#4', sharpId: 'KeyT', sharpLabel: 'T' },
	{ id: 'KeyG', label: 'G', note: 'G4', sharp: 'G#4', sharpId: 'KeyY', sharpLabel: 'Y' },
	{ id: 'KeyH', label: 'H', note: 'A4', sharp: 'A#4', sharpId: 'KeyU', sharpLabel: 'U' },
	{ id: 'KeyJ', label: 'J', note: 'B4' },
	{ id: 'KeyK', label: 'K', note: 'C5', sharp: 'C#5', sharpId: 'KeyO', sharpLabel: 'O' },
	{ id: 'KeyL', label: 'L', note: 'D5', sharp: 'D#5', sharpId: 'KeyP', sharpLabel: 'P' },
	{ id: 'Semicolon', label: ';', note: 'E5' }
];

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const activeOscillators = new Map();
const activeNotes = ref([]);

function playNote(note) {
	const freq = noteFrequencies[note];
	if (!freq) return;

	const gainNode = audioCtx.createGain();
	gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
	gainNode.gain.linearRampToValueAtTime(volume.value, audioCtx.currentTime + 0.02);
	gainNode.connect(audioCtx.destination);

	const oscillators = [];
	waveformMixes.value.forEach((wave) => {
		if (wave.value > 0 && selectedWaves.value.includes(wave.id)) {
			const osc = audioCtx.createOscillator();
			if (wave.id === 'custom') {
				const real = new Float32Array(customReal.value);
				const imag = new Float32Array(customImag.value);
				osc.setPeriodicWave(audioCtx.createPeriodicWave(real, imag));
			} else {
				osc.type = wave.id;
			}
			osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
			const individualGain = audioCtx.createGain();
			individualGain.gain.value = wave.value;
			osc.connect(individualGain).connect(gainNode);
			osc.start();
			oscillators.push(osc);
		}
	});

	activeOscillators.set(note, { oscillators, gainNode });
	if (!activeNotes.value.includes(note)) activeNotes.value.push(note);
}

function stopNote(note) {
	const active = activeOscillators.get(note);
	if (active) {
		const now = audioCtx.currentTime;
		active.gainNode.gain.setValueAtTime(active.gainNode.gain.value, now);
		active.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.05);
		active.oscillators.forEach(osc => osc.stop(now + 0.05));
		setTimeout(() => active.gainNode.disconnect(), 100);
		activeOscillators.delete(note);
		activeNotes.value = activeNotes.value.filter(n => n !== note);
	}
}

const isMouseDown = ref(false);
const keyMap = Object.fromEntries(keyboardNotes.flatMap(k => k.sharp ? [[k.id, k.note], [k.sharpId, k.sharp]] : [[k.id, k.note]]));

function onKeyMouseDown(id) {
	isMouseDown.value = true;
	const note = keyMap[id];
	if (note) playNote(note);
}
function onKeyMouseUp(id) {
	const note = keyMap[id];
	if (note) stopNote(note);
}
function onKeyMouseEnter(id) {
	if (!isMouseDown.value) return;
	const note = keyMap[id];
	if (note) playNote(note);
}

onMounted(() => {
	window.addEventListener('keydown', e => {
		if (!['Tab', 'Enter', ' '].includes(e.key)) {
			const note = keyMap[e.code];
			if (note && !activeOscillators.has(note)) playNote(note);
		}
	});
	window.addEventListener('keyup', e => {
		const note = keyMap[e.code];
		if (note) stopNote(note);
	});
	window.addEventListener('mousedown', () => isMouseDown.value = true);
	window.addEventListener('mouseup', () => isMouseDown.value = false);
});

onBeforeUnmount(() => {
	window.removeEventListener('mousedown', () => isMouseDown.value = true);
	window.removeEventListener('mouseup', () => isMouseDown.value = false);
});
</script>

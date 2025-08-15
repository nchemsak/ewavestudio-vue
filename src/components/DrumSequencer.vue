<template>
	<div class="drum-sequencer controls">
		<div class="d-flex flex-wrap align-items-center justify-content-between mb-4">

			<div class="position-relative text-center knobWrap">
				<Knob v-model="volume" label="Volume" :min="0" :max="1" :step="0.01" size="medium" color="#23CDE8"
					@knobStart="activeKnob = 'volume'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'volume'" class="custom-tooltip">
					{{ Math.round(volume * 100) }}%
				</span>
			</div>


			<div class="position-relative text-center knobWrap">
				<Knob v-model="tempo" label="Tempo" :min="20" :max="300" :step="1" size="medium" color="#F39C12"
					@knobStart="activeKnob = 'tempo'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'tempo'" class="custom-tooltip">
					{{ tempo }} BPM
				</span>
			</div>


			<div class="position-relative text-center knobWrap">
				<Knob v-model="swing" label="Swing" :min="0" :max="0.5" :step="0.01" size="medium" color="#E91E63"
					@knobStart="activeKnob = 'swing'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'swing'" class="custom-tooltip">
					{{ Math.round(swing * 100) }}%
				</span>
			</div>
			<div class="position-relative text-center knobWrap">
				<button class="btn btn-primary" @click="togglePlay">
					<span v-if="isPlaying">Stop</span>
					<span v-else>Play</span>
				</button>
			</div>
			<div class="position-relative text-center knobWrap">
				<div class="btn-group ms-2">
					<button class="btn btn-sm btn-outline-secondary" @click="octaveShiftAllSkip(-1)">
						Octave −
					</button>
					<button class="btn btn-sm btn-outline-secondary" @click="octaveShiftAllSkip(1)">
						Octave +
					</button>
				</div>
			</div>
			<div class="position-relative text-center knobWrap">

				<MpcScreen ref="screen" :text="lcdText" :view="lcdView" :activeKey="activeFKey" @fkey="handleFKey" />
			</div>
			<div class="position-relative text-center knobWrap">

				<!-- <div class="padTEST-grid"> -->
				<!-- pick ONE of: neon, gel, bevel, donut, pixel, flat, nick1, liquid -->
				<!-- <button class="padTEST liquid" aria-label="padTEST"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
					<button class="padTEST liquid"></button>
				</div> -->
			</div>
		</div>

		<!-- </div>


	<div class="drum-sequencer" id="percussion-synth"> -->
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
				<!-- <div v-for="(active, index) in synthInstrument.steps" :key="index" class="pad-wrapper"
					@mouseenter="hoveredPad = `${synthInstrument.name}-${index}`" @mouseleave="hoveredPad = null">
					<div :class="['pad', { selected: active }, { playing: index === currentStep }]"
						@mousedown="handleMouseDown($event, synthInstrument.name, index)"
						@mouseenter="handleMouseEnter(synthInstrument.name, index)" @dragstart.prevent
						:style="getPadStyle(synthInstrument, index)">
					</div> -->
				<div class="padTEST-grid">
					<div v-for="(active, index) in synthInstrument.steps" :key="index" class="padTESTwrap"
						@mouseenter="hoveredPad = `${synthInstrument.name}-${index}`" @mouseleave="hoveredPad = null">
						<div :class="['padTEST liquid', { selected: active }, { playing: index === currentStep }]"
							@mousedown="handleMouseDown($event, synthInstrument.name, index)"
							@mouseenter="handleMouseEnter(synthInstrument.name, index)" @dragstart.prevent
							:style="getPadStyle(synthInstrument, index)">
						</div>
						<!-- Settings dot (top-right) -->
						<button class="pad-settings-dot" @mousedown.stop
							@click.stop="openPadSettings(synthInstrument.name, index, $event)"
							aria-label="Pad settings">
							•
						</button>

						<!-- Volume Slider -->
						<div v-if="active && hoveredPad === `${synthInstrument.name}-${index}`"
							class="hover-slider volume-slider">
							<input type="range" min="0" max="1" step="0.01"
								v-model.number="synthInstrument.velocities[index]"
								@mousedown="activeVolumePad = `${synthInstrument.name}-${index}`"
								@mouseup="activeVolumePad = null"
								@touchstart="activeVolumePad = `${synthInstrument.name}-${index}`"
								@touchend="activeVolumePad = null" />
							<span v-if="activeVolumePad === `${synthInstrument.name}-${index}`" class="custom-tooltip">
								{{ Math.round(synthInstrument.velocities[index] * 100) }}%
							</span>
						</div>


						<!-- Pitch Slider -->
						<div v-if="active && hoveredPad === `${synthInstrument.name}-${index}`"
							class="hover-slider pitch-slider">
							<input type="range" :min="MIN_PAD_HZ" :max="MAX_PAD_HZ" step="1"
								v-model.number="synthInstrument.pitches[index]"
								@mousedown="activePitchPad = `${synthInstrument.name}-${index}`"
								@mouseup="activePitchPad = null"
								@touchstart="activePitchPad = `${synthInstrument.name}-${index}`"
								@touchend="activePitchPad = null" />
							<span v-if="activePitchPad === `${synthInstrument.name}-${index}`" class="custom-tooltip">
								{{ nearestNote(synthInstrument.pitches[index]) }} · {{
									Math.round(synthInstrument.pitches[index]) }} Hz
							</span>
						</div>

					</div>
				</div>
			</div>
		</div>
		<div class="controlsWrapper">
			<div class="controls">
				<PatternTools :steps="synthInstrument.steps" :velocities="synthInstrument.velocities"
					@update:steps="synthInstrument.steps = $event"
					@update:velocities="synthInstrument.velocities = $event" />
			</div>
			<div class="controls">

				<h2>Generators</h2>
				<!-- Waveform Selector -->
				<span class="group-title">Oscillators</span><br />
				<div class="btn-group ms-3" role="group">
					<button v-for="wave in ['sine', 'triangle', 'sawtooth', 'square']" :key="wave" type="button"
						class="btn btn-sm" :class="wave === selectedWaveform ? 'btn-primary' : 'btn-outline-primary'"
						@click="selectedWaveform = wave">
						{{ wave.charAt(0).toUpperCase() + wave.slice(1) }}
					</button>
				</div>
				<hr />
				<NoiseModule :showToggle="false" v-model:enabled="noiseEnabled" v-model:type="noiseType"
					v-model:amount="noiseAmount" :color="'#9C27B0'" />

			</div>
			<div class="controls">
				<h2>Sound Shaping</h2>

				<EnvelopeModule :color="'#4CAF50'" :showToggle="false" v-model:enabled="envelopeEnabled"
					v-model:attackMs="ampEnvAttackMs" v-model:decayMs="ampEnvDecayMs" />
				<hr />
				<FilterModule :color="'#FF5722'" :showToggle="false" v-model:enabled="filterEnabled"
					v-model:cutoff="filterCutoff" v-model:resonance="filterResonance" />

			</div>

			<div class="controls">
				<h2>Pitch & Harmonics</h2>
				<PitchEnvModule :color="'#3F51B5'" :showToggle="false" v-model:enabled="pitchEnvEnabled"
					v-model:semitones="pitchEnvSemitones" v-model:decayMs="pitchEnvDecayMs" v-model:mode="pitchMode" />
				<hr />
				<FMModule :color="'#3F51B5'" :showToggle="false" v-model:enabled="fmEnabled" v-model:modFreq="fmModFreq"
					v-model:index="fmIndex" v-model:ratio="fmRatio" />
				<hr />
				<UnisonEffect v-model:enabled="unisonEnabled" v-model:voices="unisonVoices" v-model:detune="detuneCents"
					v-model:spread="stereoSpread" />
			</div>
			<div class="controls">
				<h2>Movement & Modulation</h2>

				<LFOGroup :showToggle="false" v-model="lfoEnabled" v-model:rate="lfoRate" v-model:depth="lfoDepth"
					v-model:target="lfoTarget" :depthMax="lfoDepthMax" color="#00BCD4"
					:targets="['pitch', 'gain', 'filter']" />

			</div>
			<div class="controls">

				<h2>Effects</h2>
				<DelayEffect :audioCtx="audioCtx" v-model:enabled="delayEnabled" v-model:syncEnabled="delaySync"
					:tempo="tempo" :maxSeconds="5" v-model:delayTime="delayTime" v-model:delayFeedback="delayFeedback"
					v-model:delayMix="delayMix" />
				<hr />
				<DriveEffect :showToggle="false" v-model:enabled="driveEnabled" v-model:driveType="driveType"
					v-model:driveAmount="driveAmount" v-model:driveTone="driveTone" v-model:driveMix="driveMix" />
			</div>
		</div>

	</div>
	<!-- Teleported pad settings popover -->
	<!-- <teleport to="body">
		<div v-if="padSettings.open" class="pad-settings-popover card p-2 controls"
			:style="{ left: padSettings.pos.x + 'px', top: padSettings.pos.y + 'px' }" @keydown.esc="closePadSettings"
			role="dialog" aria-modal="true">
			<div class="d-flex justify-content-between align-items-center mb-2">
				<strong>Pad {{ padSettings.index + 1 }}</strong>
				<button class="btn btn-sm btn-outline-secondary" @click="closePadSettings">Close</button>
			</div>

			<div class="mb-2 small">
				{{ nearestNote(currentPadHz) }} · {{ displayHz }} Hz
			</div>

			<div class="d-flex flex-wrap gap-1 mb-2">
				<button v-for="(n, i) in NOTE_NAMES" :key="n" class="btn btn-xs" :disabled="isNoteDisabled(i, octave)"
					:class="[
						(selectedMidi % 12) === i ? 'btn-primary' : 'btn-outline-primary',
						isNoteDisabled(i, octave) ? 'disabled' : ''
					]" @click="!isNoteDisabled(i, octave) && setSemitone(i)">
					{{ n }}
				</button>
			</div>

			<div class="mb-2">
				<div class="btn-group btn-group-sm">
					<button v-for="o in availableOctaves" :key="o" class="btn"
						:class="octave === o ? 'btn-primary' : 'btn-outline-primary'" @click="setOctave(o)">
						{{ o }}
					</button>
				</div>
			</div>

			<div class="position-relative mb-2">
				<Knob v-model="padDetuneCents" label="Fine (¢)" :min="-100" :max="100" :step="1" size="small"
					color="#3F51B5" @knobStart="activeKnob = 'padFine'" @knobEnd="activeKnob = null" />
				<span v-if="activeKnob === 'padFine'" class="custom-tooltip">
					{{ padDetuneCents }}¢
				</span>
			</div>

			<div class="input-group input-group-sm">
				<span class="input-group-text">Hz</span>
				<input type="number" class="form-control" v-model.number="currentPadHzDisplay" :min="MIN_PAD_HZ"
					:max="MAX_PAD_HZ" step="0.01">

			</div>
		</div>
	</teleport> -->
	<PadSettingsPopover v-model:open="padPopover.open" v-model:hz="currentPadHz" :minHz="MIN_PAD_HZ" :maxHz="MAX_PAD_HZ"
		:anchorRect="padPopover.anchorRect" :title="padPopover.title" @close="padPopover.open = false" />
</template>

<script setup lang="ts">
// IMPORTS START
import { ref, reactive, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';
import Knob from './Knob.vue';
import DelayEffect from './modules/DelayEffect.vue';
import DriveEffect from './modules/DriveEffect.vue';
import UnisonEffect from './modules/UnisonEffect.vue';
import LFOGroup from './modules/LFOGroup.vue';
import MpcScreen from './Screen.vue';
import PitchEnvModule from './modules/PitchEnvModule.vue';
import { applyPitchEnv } from '../audio/pitchEnv';
import FMModule from './modules/FMModule.vue';
import { startFM } from '../audio/fm';
import FilterModule from './modules/FilterModule.vue';
import EnvelopeModule from './modules/EnvelopeModule.vue';
import NoiseModule from './modules/NoiseModule.vue';
import PadSettingsPopover from './PadSettingsPopover.vue';
import PatternTools from './PatternTools.vue';

// IMPORTS END

//PatternTools BEGIN
const randomizeAmt = ref(0.5);
const humanizeAmt = ref(0.08);

// DrumSequencer.vue – keep only this for Randomize:
function onRandomize(amt: number): void {
	const inst = synthInstrument.value;
	if (!inst) return;
	for (let i = 0; i < inst.steps.length; i++) {
		inst.steps[i] = Math.random() < amt; // only steps
	}
}


function onHumanize(amt: number): void {
	const inst = synthInstrument.value;
	if (!inst) return;
	for (let i = 0; i < inst.steps.length; i++) {
		if (!inst.steps[i]) continue;
		const v = inst.velocities[i];
		inst.velocities[i] = Math.max(0, Math.min(1, v * (1 + (Math.random() * 2 - 1) * amt)));
	}
}

function clear(): void {
	const inst = synthInstrument.value;
	if (!inst) return;
	inst.steps = inst.steps.map(() => false);
	// Optional: also reset velocities
	// inst.velocities = inst.velocities.map(() => 1);
}

function invert(): void {
	const inst = synthInstrument.value;
	if (!inst) return;
	inst.steps = inst.steps.map(v => !v);
}

function shift(delta: number): void {
	const inst = synthInstrument.value;
	if (!inst) return;
	const len = inst.steps.length;
	if (!len) return;

	const n = ((delta % len) + len) % len;

	const rot = <T>(arr: T[]) =>
		n === 0 ? arr.slice() : arr.slice(len - n).concat(arr.slice(0, len - n));

	inst.steps = rot(inst.steps);
	inst.velocities = rot(inst.velocities);
}

//Patterntools END

// FM Synthesis START
const fmEnabled = ref(false);
const fmModFreq = ref(200);     // Hz when not using ratio
const fmIndex = ref(0);       // 0..50 typical range
const fmRatio = ref<number | null>(1); // start as 1:1, or null for Hz mode
// FM Synthesis END


const A4 = 440;
const MIN_PAD_HZ = 100;
const MAX_PAD_HZ = 2000;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// MPC Screen BEGIN
const lcdText = ref('HARP  2');
const activeFKey = ref<number>(1);
const lcdView = ref<'text' | 'scope' | 'spec'>('scope'); // default F1
const screen = ref<InstanceType<typeof MpcScreen> | null>(null);

/** Fit a canvas to its CSS size (crisp on HiDPI) */
function fitCanvasToBox(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();
	const w = Math.max(1, Math.round(rect.width * dpr));
	const h = Math.max(1, Math.round(rect.height * dpr));
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w;
		canvas.height = h;
	}
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	// draw in CSS pixels but with DPR backing store:
	ctx.scale(dpr, dpr);
}

/** Toggle by F-keys */
function handleFKey(n: number) {
	activeFKey.value = n;
	if (n === 1) lcdView.value = 'scope';
	else if (n === 2) lcdView.value = 'spec';
	else lcdView.value = 'text'; // placeholders for F3–F6
}

/** OSCILLOSCOPE (inside LCD) */
function startScope() {
	const canvas = screen.value!.scopeCanvas as HTMLCanvasElement;
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	function draw() {
		requestAnimationFrame(draw);
		if (lcdView.value !== 'scope') return;

		fitCanvasToBox(canvas, ctx);
		const W = canvas.clientWidth;
		const H = canvas.clientHeight;

		analyser.getByteTimeDomainData(dataArray);

		ctx.fillStyle = '#b9bcba';   // LCD bg
		ctx.fillRect(0, 0, W, H);

		ctx.lineWidth = 2;
		ctx.strokeStyle = '#111';
		ctx.beginPath();

		const slice = W / analyser.fftSize;
		let x = 0;
		for (let i = 0; i < analyser.fftSize; i++) {
			const v = dataArray[i] / 128;
			const y = (v * H) / 2;
			i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
			x += slice;
		}
		ctx.lineTo(W, H / 2);
		ctx.stroke();
	}
	draw();
}




function startSpectrogram() {
	const scr = screen.value;
	if (!scr) return;

	const canvas = scr.specCanvas as HTMLCanvasElement;
	if (!canvas) return;

	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	// Keep pixels crisp when we shift 1px columns
	ctx.imageSmoothingEnabled = false;

	const freqBins = new Uint8Array(analyser.frequencyBinCount);

	// Colors (from your palette)
	const LCD_BG = '#b9bcba'; // same bg as oscilloscope
	const PALETTE: Array<{ threshold: number; color: string }> = [
		{ threshold: 64, color: '#c4a291' }, // low
		{ threshold: 128, color: '#8b4513' }, // mid
		{ threshold: 192, color: '#27fcff' }, // high
		{ threshold: 256, color: '#000000' }  // peak
	];

	const colorFor = (v: number) => {
		for (let i = 0; i < PALETTE.length; i++) {
			if (v < PALETTE[i].threshold) return PALETTE[i].color;
		}
		return PALETTE[PALETTE.length - 1].color;
	};

	function draw() {
		requestAnimationFrame(draw);
		if (lcdView.value !== 'spec') return;

		// Fit backing store to CSS size (HiDPI‑safe)
		fitCanvasToBox(canvas, ctx);

		const W = canvas.clientWidth;
		const H = canvas.clientHeight;

		// Scroll existing image left by 1px
		ctx.drawImage(canvas, 1, 0, W - 1, H, 0, 0, W - 1, H);

		// Fetch spectrum
		analyser.getByteFrequencyData(freqBins);

		// New column background first (so silence is grey)
		const x = W - 1;
		ctx.fillStyle = LCD_BG;
		ctx.fillRect(x, 0, 1, H);

		// Paint energy using log frequency mapping
		for (let y = 0; y < H; y++) {
			const logY = 1 - y / H;
			const bin = Math.min(
				freqBins.length - 1,
				Math.floor(Math.pow(logY, 2.0) * freqBins.length)
			);
			const v = freqBins[bin]; // 0..255
			if (v <= 2) continue;     // skip near-silence pixels

			ctx.fillStyle = colorFor(v);
			ctx.fillRect(x, y, 1, 1);
		}
	}

	draw();
}



onMounted(() => {
	loadAllSamples();
	generateNoiseBuffers();
	initDriveNow();

	// nicer visuals
	analyser.smoothingTimeConstant = 0.8;
	analyser.minDecibels = -90;
	analyser.maxDecibels = -10;

	window.addEventListener('mouseup', handleMouseUp);

	// start both loops; each only draws when its view is active
	startScope();
	startSpectrogram();
});
onBeforeUnmount(() => {
	cancelAnimationFrame(loopId);
	window.removeEventListener('mouseup', handleMouseUp);
});
// MPC Screen END

// Pad settings popover BEGIN
const padPopover = ref({
	open: false,
	title: '',
	anchorRect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
});

function openPadSettings(name: string, index: number, evt: MouseEvent) {
	// set which pad we’re editing (so currentPadHz points to the right cell)
	padSettings.name = name;
	padSettings.index = index;

	const r = (evt.currentTarget as HTMLElement).getBoundingClientRect();
	padPopover.value.anchorRect = {
		left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height
	}
	padPopover.value.title = `Pad ${index + 1}`;
	padPopover.value.open = true;
}

function closePadSettings() {
	padPopover.value.open = false;
}

const padSettings = reactive({
	name: null as null | string,
	index: -1
})
// Pad settings popover END


// Reuse shared AudioContext
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isScrubbing = false;
let startY = 0;
let startTempo = 0;

const activeKnob = ref(null);
const hoveredPad = ref(null);
const hoveredLabel = ref(null);
// const synthDecay = ref(0.4);

const selectedWaveform = ref("sine");

const isFineAdjust = ref(false);


function nearestNote(hz) { return midiToName(freqToMidi(hz)); }

function midiOf(octave, semitone) {
	return (octave + 1) * 12 + semitone; // same scheme you're using
}
function freqOf(octave, semitone) {
	return midiToFreq(midiOf(octave, semitone));
}
function isFreqInRange(f) {
	return f >= MIN_PAD_HZ && f <= MAX_PAD_HZ;
}
function isNoteInRange(octave, semitone) {
	return isFreqInRange(freqOf(octave, semitone));
}


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

const synthInstrument = computed(() => instruments.value.find(i => i.name === 'synth-voice'));

const currentPadHz = computed({
	get() {
		const inst = instruments.value.find(i => i.name === padSettings.name);
		if (!inst) return 220;
		return inst.pitches?.[padSettings.index] ?? 220;
	},
	set(hz) { setPadHz(hz); }
});

const currentPadHzDisplay = computed({
	get: () => Number(currentPadHz.value).toFixed(2),
	set: v => {
		const parsed = parseFloat(v);
		if (!isNaN(parsed)) {
			currentPadHz.value = parsed;
		}
	}
});


const availableOctaves = computed(() => {
	const octs = [];
	for (let o = 0; o <= 8; o++) {
		for (let s = 0; s < 12; s++) {
			if (isNoteInRange(o, s)) { octs.push(o); break; }
		}
	}
	return octs; // let MIN_PAD_HZ/MAX_PAD_HZ drive it
});

// Global Octave controls
function canShiftOctave(hz, deltaOct) {
	const factor = Math.pow(2, deltaOct);
	const target = hz * factor;
	return target >= MIN_PAD_HZ && target <= MAX_PAD_HZ;
}

function octaveShiftAllSkip(deltaOct, { onlyActive = false } = {}) {
	const inst = synthInstrument.value;
	if (!inst) return;

	let moved = 0, skipped = 0;

	for (let i = 0; i < inst.pitches.length; i++) {
		if (onlyActive && !inst.steps[i]) continue;

		const before = inst.pitches[i];
		if (canShiftOctave(before, deltaOct)) {
			inst.pitches[i] = before * Math.pow(2, deltaOct);
			moved++;
		} else {
			skipped++;
		}
	}

	// Optional: dev log so you can see behavior while testing
	console.info(
		`Octave ${deltaOct > 0 ? '+' : '-'} (skip mode): moved=${moved}, skipped=${skipped}`
	);
}


// Disable specific note buttons that would be out of range
function isNoteDisabled(semitone, octave) {
	return !isNoteInRange(octave, semitone);
}


function midiToFreq(m) { return A4 * Math.pow(2, (m - 69) / 12); }
function freqToMidi(f) { return Math.round(69 + 12 * Math.log2(f / A4)); }
function midiToName(m) {
	const n = m % 12, o = Math.floor(m / 12) - 1;
	return `${NOTE_NAMES[n]}${o}`;
}

// Pad pitch and volume sliders
const activeVolumePad = ref(null); // format: `${instrumentName}-${index}`
const activePitchPad = ref(null);

const pitchEnvEnabled = ref(true);
const envelopeEnabled = ref(true);
const filterEnabled = ref(true);

const filterCutoff = ref(5000); // Hz, default cutoff
const filterResonance = ref(0.5); // Q factor


const ampEnvAttackMs = ref(20)   // ~20 ms default (feel free to tweak)
const ampEnvDecayMs = ref(400)  // ~400 ms

const synthAttack = computed(() => ampEnvAttackMs.value / 1000)
const synthDecay = computed(() => ampEnvDecayMs.value / 1000)

const pitchEnvSemitones = ref(0); // Default = 1 octave up
const pitchEnvDecayMs = ref(300);

// const pitchMode = ref('up'); // or 'down', 'random'
const pitchMode = ref<'up' | 'down' | 'random'>('up')
const pitchEnvDecay = computed(() => pitchEnvDecayMs.value / 1000)  // seconds

// Noise START
type NoiseType = 'white' | 'pink' | 'brown'
const noiseBuffers: Record<NoiseType, AudioBuffer | null> = {
	white: null, pink: null, brown: null
}
const noiseType = ref<NoiseType>('white') // default selection

const noiseAmount = ref(0); // 0 = no noise, 1 = full noise
const noiseEnabled = ref(false)
// Noise END

// Delay Start
const delayEnabled = ref(false);
const delaySync = ref(false);        // NEW
const delayTime = ref(0.2);          // seconds (0.01 to 1.0)
const delayFeedback = ref(0.3);      // 0–0.95
const delayMix = ref(0.3);           // 0–1


const delayNode = audioCtx.createDelay(5.0); // max delay time = 5s
delayNode.delayTime.setValueAtTime(delayTime.value, audioCtx.currentTime);

const feedbackGain = audioCtx.createGain();
feedbackGain.gain.value = delayFeedback.value;

const delayWet = audioCtx.createGain();
const delayDry = audioCtx.createGain();
applyDelayEnabled(delayEnabled.value);

// feedback loop
delayNode.connect(feedbackGain);
feedbackGain.connect(delayNode);

// dry + wet summing nodes connect to master output
delayNode.connect(delayWet);
watch(delayTime, val => {
	const t = audioCtx.currentTime;
	// cancel any pending ramps, set current, then glide ~30ms
	const current = delayNode.delayTime.value;
	delayNode.delayTime.cancelScheduledValues(t);
	delayNode.delayTime.setValueAtTime(current, t);
	delayNode.delayTime.linearRampToValueAtTime(val, t + 0.03);
});
watch(delayFeedback, val => {
	feedbackGain.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
});
watch(delayMix, val => {
	const t = audioCtx.currentTime;
	if (delayEnabled.value) {
		delayWet.gain.setTargetAtTime(val, t, 0.02);
		delayDry.gain.setTargetAtTime(1 - val, t, 0.02);
	} else {
		// keep fully dry when disabled
		delayWet.gain.setValueAtTime(0, t);
		delayDry.gain.setValueAtTime(1, t);
	}
});

watch(delayEnabled, on => {
	applyDelayEnabled(on);
});

function applyDelayEnabled(on) {
	const t = audioCtx.currentTime;
	if (on) {
		delayWet.gain.setValueAtTime(delayMix.value, t);
		delayDry.gain.setValueAtTime(1 - delayMix.value, t);
	} else {
		delayWet.gain.setValueAtTime(0, t);
		delayDry.gain.setValueAtTime(1, t);
	}
}
//Delay END

// Drive START
const driveEnabled = ref(false);
const driveType = ref('overdrive');
const driveAmount = ref(0.4);  // 0 to 1
const driveTone = ref(5000);   // Hz
const driveMix = ref(0.5);     // 0 to 1

// Drive node chain
const driveShaper = audioCtx.createWaveShaper();
const driveToneFilter = audioCtx.createBiquadFilter();
driveToneFilter.type = 'lowpass';

const driveDry = audioCtx.createGain();
const driveWet = audioCtx.createGain();


// NEW: sum both drive paths before delay
const driveSum = audioCtx.createGain();     // summed output of dry+wet drive
// OPTIONAL: simple make-up gain after shaper/tone (tune if you want)
const driveMakeup = audioCtx.createGain();
driveMakeup.gain.value = 1.0; // start neutral; you can bump with 'amount'

// connections inside Drive
driveShaper.connect(driveToneFilter);
driveToneFilter.connect(driveMakeup);
driveMakeup.connect(driveWet);

// gains set by mix
driveWet.gain.value = driveMix.value;
driveDry.gain.value = 1 - driveMix.value;

// —— IMPORTANT: feed the sum, not the delay directly —— //
driveDry.connect(driveSum);
driveWet.connect(driveSum);

// Now feed delay chain **from the sum** (same for all cases)
driveSum.connect(delayDry);
driveSum.connect(delayNode);

watch([driveType, driveAmount], ([type, amount]) => {
	driveShaper.curve = generateDriveCurve(type, amount);
	// OPTIONAL make-up (very mild): ~ +0..+0.8 dB
	driveMakeup.gain.setTargetAtTime(1 + amount * 0.1, audioCtx.currentTime, 0.01);
});

watch(driveTone, hz => {
	driveToneFilter.frequency.setValueAtTime(hz, audioCtx.currentTime);
});

watch(driveMix, val => {
	driveWet.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
	driveDry.gain.setTargetAtTime(1 - val, audioCtx.currentTime, 0.01);
});

//Drive END


// Unison / Detune START
const unisonEnabled = ref(false);
const unisonVoices = ref(3);   // 1–6
const detuneCents = ref(12);  // 0–100 cents per step
const stereoSpread = ref(50);  // 0–100 %
// Unison / Detune END

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

// === Pad Settings START ===

function setPadHz(hz) {
	const inst = instruments.value.find(i => i.name === padSettings.name);
	if (!inst) return;
	const clamped = Math.max(MIN_PAD_HZ, Math.min(MAX_PAD_HZ, hz));
	inst.pitches[padSettings.index] = clamped;
}

// === Pad Settings END

const displayHz = computed(() =>
	(Math.round(currentPadHz.value * 100) / 100).toFixed(2)
);

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

const phaseDitherCents = 0.3; // ±0.3 cents per hit, inaudible, fixes overlap dips


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
	const stepDuration = 60 / tempo.value / 4; // 16th

	while (startTime < now + 0.1) {
		instruments.value.forEach(inst => {
			if (!inst.muted && inst.steps[stepIndex]) {
				const velocity = inst.velocities[stepIndex];
				const chanVol = inst.channelVolume ?? 1.0;
				const pitch = inst.pitches?.[stepIndex] || 220;
				const safeDecay = (isFinite(synthDecay.value) && synthDecay.value > 0) ? synthDecay.value : 0.1;

				const isEvenStep = stepIndex % 2 === 1;
				const swingOffset = isEvenStep ? stepDuration * swing.value : 0;
				const t = startTime + swingOffset;

				if (inst.type === 'synth') {
					playSynthNote(pitch, velocity * chanVol, safeDecay, t);
				} else if (inst.buffer) {
					playBuffer(inst.buffer, t, velocity * chanVol);
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

	// ENV sums all unison voices
	const oscEnvGain = audioCtx.createGain();
	const noiseEnvGain = audioCtx.createGain();

	// Shared envelope timings
	const attackEnd = startTime + attackTime;
	const naturalEnd = attackEnd + decay;
	const gateEnd = startTime + Math.max(0.02, ampEnvDecayMs.value / 1000);
	const noteEnd = envelopeEnabled.value ? naturalEnd : gateEnd;

	// Compute blends BEFORE using safeOscGain
	const blend = noiseEnabled.value ? Math.min(Math.max(noiseAmount.value, 0), 1) : 0;
	const oscBlend = 1 - blend;
	const noiseBlend = blend;
	const safeOscGain = Math.max(0.0001, velocity * oscBlend);
	const safeNoiseGain = Math.max(0.0001, velocity * noiseBlend);

	// Single amplitude envelope (remove the duplicate block you had)
	if (envelopeEnabled.value) {
		oscEnvGain.gain.setValueAtTime(0.0001, startTime);
		oscEnvGain.gain.exponentialRampToValueAtTime(safeOscGain, attackEnd);
		oscEnvGain.gain.exponentialRampToValueAtTime(0.001, noteEnd);
	} else {
		oscEnvGain.gain.setValueAtTime(Math.max(0.0001, velocity), startTime);
		oscEnvGain.gain.setTargetAtTime(0.0001, noteEnd - 0.01, 0.005);
	}

	// ===== UNISON =====
	const voices = unisonEnabled.value ? Math.max(1, Math.min(6, unisonVoices.value)) : 1;
	const detuneStep = (voices > 1) ? detuneCents.value : 0;
	const spreadPct = (voices > 1) ? stereoSpread.value : 0;
	const normIndex = (i, n) => (n === 1) ? 0 : ((i / (n - 1)) * 2 - 1);

	for (let i = 0; i < voices; i++) {
		const osc = audioCtx.createOscillator();
		const voiceFilter = audioCtx.createBiquadFilter();
		const voiceGain = audioCtx.createGain();
		const panner = audioCtx.createStereoPanner();

		osc.type = selectedWaveform.value;

		applyPitchEnv(osc, freq, startTime, {
			enabled: pitchEnvEnabled.value,
			semitones: pitchEnvSemitones.value,
			mode: pitchMode.value,
			decay: pitchEnvDecay.value
		});

		const fmHandle = startFM(audioCtx, osc, freq, startTime, {
			enabled: fmEnabled.value,
			modFreqHz: fmModFreq.value,
			index: fmIndex.value,
			ratio: fmRatio.value
		});

		const dNorm = normIndex(i, voices);
		const detuneC = dNorm * detuneStep;
		osc.detune.setValueAtTime(detuneC, startTime);

		voiceFilter.type = 'lowpass';
		if (filterEnabled.value) {
			voiceFilter.frequency.setValueAtTime(filterCutoff.value, startTime);
			voiceFilter.Q.setValueAtTime(filterResonance.value, startTime);
		} else {
			voiceFilter.frequency.setValueAtTime(20000, startTime);
			voiceFilter.Q.setValueAtTime(0.0001, startTime);
		}

		voiceGain.gain.setValueAtTime(1 / voices, startTime);
		panner.pan.setValueAtTime((dNorm * spreadPct) / 100, startTime);

		if (lfoEnabled.value) {
			if (lfoTarget.value === 'pitch') {
				const lfoTap = audioCtx.createGain();
				lfoTap.gain.value = 1;
				lfoGain.connect(lfoTap).connect(osc.frequency);
			} else if (lfoTarget.value === 'gain') {
				const lfoModGain = audioCtx.createGain();
				lfoModGain.gain.value = lfoDepth.value * 0.005;

				const lfoOffset = audioCtx.createConstantSource()
				lfoOffset.offset.value = velocity * 0.75;

				const lfoSum = audioCtx.createGain();
				lfoGain.connect(lfoModGain).connect(lfoSum);
				lfoOffset.connect(lfoSum);
				lfoSum.connect(voiceGain.gain);

				lfoOffset.start(startTime);
				lfoOffset.stop(noteEnd + 0.05); // was decayEnd
			} else if (lfoTarget.value === 'filter') {
				const lfoTap = audioCtx.createGain();
				lfoTap.gain.value = 1;
				lfoGain.connect(lfoTap).connect(voiceFilter.frequency);
			}
		}

		osc.connect(voiceFilter).connect(voiceGain).connect(panner).connect(oscEnvGain);

		osc.start(startTime);
		osc.stop(noteEnd);
		if (fmHandle) fmHandle.stop(noteEnd);
	}

	if (driveEnabled.value) {
		oscEnvGain.connect(driveDry)
		oscEnvGain.connect(driveShaper)
	} else {
		oscEnvGain.connect(driveSum)
	}

	// ===== Noise =====
	if (noiseEnabled.value && noiseAmount.value > 0) {
		const noiseBuffer = noiseBuffers[noiseType.value]
		if (noiseBuffer) {
			const noiseSource = audioCtx.createBufferSource()
			noiseSource.buffer = noiseBuffer

			noiseEnvGain.gain.setValueAtTime(0.0001, startTime)
			noiseEnvGain.gain.exponentialRampToValueAtTime(safeNoiseGain, attackEnd)
			noiseEnvGain.gain.exponentialRampToValueAtTime(0.001, noteEnd)

			const noiseFilter = audioCtx.createBiquadFilter()
			noiseFilter.type = 'bandpass'
			noiseFilter.frequency.setValueAtTime(8000, startTime)
			noiseFilter.Q.setValueAtTime(1, startTime)

			noiseSource.connect(noiseFilter).connect(noiseEnvGain).connect(masterGain)
			noiseSource.start(startTime)
			noiseSource.stop(noteEnd)
		}
	}
}


delayDry.connect(masterGain);
delayWet.connect(masterGain);

async function togglePlay() {
	if (isPlaying.value) {

		cancelAnimationFrame(loopId);
		isPlaying.value = false;
		currentStep.value = -1;
		return;
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

//DRIVE
function generateDriveCurve(type, amount = 0.5) {
	const samples = 1024;
	const curve = new Float32Array(samples);
	const deg = Math.PI / 180;

	for (let i = 0; i < samples; ++i) {
		const x = (i * 2) / samples - 1;
		switch (type) {
			case 'distortion':
				curve[i] = (3 + amount * 30) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
				break;
			case 'overdrive':
			default:
				curve[i] = Math.tanh(x * (1 + amount * 25));
				break;
		}

	}
	return curve;
}
function initDriveNow() {
	const t = audioCtx.currentTime;

	// Ensure the shaper actually has a curve before any audio hits it
	driveShaper.curve = generateDriveCurve(driveType.value, driveAmount.value);
	driveShaper.oversample = '2x'; // optional

	// Anchor params so setTargetAtTime works consistently in all browsers
	driveToneFilter.frequency.setValueAtTime(driveTone.value, t);

	// Make sure wet/dry reflect current mix
	driveWet.gain.setValueAtTime(driveMix.value, t);
	driveDry.gain.setValueAtTime(1 - driveMix.value, t);
}

// run once when the component mounts
// onMounted(() => {
// 	initDriveNow();
// });

// when the user turns Drive on during playback, pre-warm everything
watch(driveEnabled, on => {
	if (on) initDriveNow();
});
driveShaper.curve = (() => {
	const n = 2 ** 10;
	const c = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const x = (i * 2) / n - 1;
		c[i] = x; // linear passthrough
	}
	return c;
})();



</script>

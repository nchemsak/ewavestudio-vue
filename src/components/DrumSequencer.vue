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
			<div class="btn-group ms-2">
				<button class="btn btn-sm btn-outline-secondary" @click="octaveShiftAllSkip(-1)">
					Octave −
				</button>
				<button class="btn btn-sm btn-outline-secondary" @click="octaveShiftAllSkip(1)">
					Octave +
				</button>
			</div>

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
					<!-- Settings dot (top-right) -->
					<button class="pad-settings-dot" @mousedown.stop
						@click.stop="openPadSettings(synthInstrument.name, index, $event)" aria-label="Pad settings">
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
		<div class="controlsWrapper">
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
			</div>
			<div class="controls">
				<h2>Sound Shaping</h2>
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

				<KnobGroup v-model="filterEnabled" title="Filter" color="#FF5722" :showToggle="false">
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
			</div>

			<div class="controls">
				<h2>Pitch & Harmonics</h2>

				<KnobGroup v-model="pitchEnvEnabled" title="Pitch Env" color="#3F51B5" :showToggle="false">
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
				<DelayEffect :showToggle="false" :audioCtx="audioCtx" v-model:enabled="delayEnabled"
					v-model:delayTime="delayTime" v-model:delayFeedback="delayFeedback" v-model:delayMix="delayMix" />

				<DriveEffect :showToggle="false" v-model:enabled="driveEnabled" v-model:driveType="driveType"
					v-model:driveAmount="driveAmount" v-model:driveTone="driveTone" v-model:driveMix="driveMix" />
			</div>
		</div>
		<canvas ref="oscilloscopeCanvas" class="oscilloscopeDrumSynth" width="600" height="100"></canvas>

	</div>
	<!-- Teleported pad settings popover -->
	<teleport to="body">
		<div v-if="padSettings.open" class="pad-settings-popover card p-2 controls"
			:style="{ left: padSettings.pos.x + 'px', top: padSettings.pos.y + 'px' }" @keydown.esc="closePadSettings"
			role="dialog" aria-modal="true">
			<div class="d-flex justify-content-between align-items-center mb-2">
				<strong>Pad {{ padSettings.index + 1 }}</strong>
				<button class="btn btn-sm btn-outline-secondary" @click="closePadSettings">Close</button>
			</div>

			<!-- Live readout -->
			<div class="mb-2 small">
				{{ nearestNote(currentPadHz) }} · {{ displayHz }} Hz
			</div>

			<!-- Note selector (12 semitones) -->
			<div class="d-flex flex-wrap gap-1 mb-2">
				<button v-for="(n, i) in NOTE_NAMES" :key="n" class="btn btn-xs" :disabled="isNoteDisabled(i, octave)"
					:class="[
						(selectedMidi % 12) === i ? 'btn-primary' : 'btn-outline-primary',
						isNoteDisabled(i, octave) ? 'disabled' : ''
					]" @click="!isNoteDisabled(i, octave) && setSemitone(i)">
					{{ n }}
				</button>
			</div>

			<!-- Octave -->
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
	</teleport>

</template>

<script setup>
import { ref, reactive, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';
import Knob from './Knob.vue';
import KnobGroup from './KnobGroup.vue';
import DelayEffect from './DelayEffect.vue';
import DriveEffect from './DriveEffect.vue';
import UnisonEffect from './UnisonEffect.vue';
import LFOGroup from './LFOGroup.vue';


const A4 = 440;
const MIN_PAD_HZ = 100;
const MAX_PAD_HZ = 2000;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];



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


const attackSliderVal = ref(20); // Initial slider value (0–100)
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
const noiseAmount = ref(0.25); // 0 = no noise, 1 = full noise

// Delay Start
const delayEnabled = ref(false);
const delayTime = ref(0.2);      // seconds (0.01 to 1.0)
const delayFeedback = ref(0.3);  // 0–0.95 recommended
const delayMix = ref(0.3);       // 0–1


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

// === Pad Settings START: state + computeds ===
const padSettings = reactive({
	open: false,
	name: null,         // instrument name
	index: -1,          // step index
	pos: { x: 0, y: 0 },// screen position for popover
	// snapEnabled: true,
	baseMidi: 69,       // A4
	detuneCents: 0,     // -100..+100
});

const padDetuneCents = computed({
	get: () => padSettings.detuneCents,
	set: v => {
		isFineAdjust.value = true;

		// start from proposed cents
		let cents = Math.max(-200, Math.min(200, v)); // soft guard to avoid huge jumps

		// helper: can we move baseMidi up/down and still be inside the Hz range?
		const canBump = (dir) => {
			const nextMidi = padSettings.baseMidi + dir;
			const nextHz = midiToFreq(nextMidi);
			return nextHz >= MIN_PAD_HZ && nextHz <= MAX_PAD_HZ;
		};

		// rollover upward across semitones
		while (cents > 100 && canBump(+1)) {
			padSettings.baseMidi += 1;
			cents -= 100;
		}
		// rollover downward across semitones
		while (cents < -100 && canBump(-1)) {
			padSettings.baseMidi -= 1;
			cents += 100;
		}

		// final clamp to +/-100 so we're strictly within adjacent notes
		cents = Math.max(-100, Math.min(100, cents));
		// additional clamp if we’re at the absolute top/bottom edge
		if (cents > 0 && !canBump(+1)) cents = Math.min(cents, 100);
		if (cents < 0 && !canBump(-1)) cents = Math.max(cents, -100);

		padSettings.detuneCents = cents;

		// apply base + cents → Hz
		applySnapped();

		// release the guard on the next microtask so UI can settle
		queueMicrotask(() => { isFineAdjust.value = false; });
	},
});




const selectedMidi = computed(() => padSettings.baseMidi);

const octave = computed({
	get: () => Math.floor(padSettings.baseMidi / 12) - 1,
	set: o => {
		const semi = padSettings.baseMidi % 12;
		padSettings.baseMidi = (o + 1) * 12 + semi;
		padSettings.detuneCents = 0;  // reset fine
		applySnapped();
	}
});




function setPadHz(hz) {
	const inst = instruments.value.find(i => i.name === padSettings.name);
	if (!inst) return;
	const clamped = Math.max(MIN_PAD_HZ, Math.min(MAX_PAD_HZ, hz));
	inst.pitches[padSettings.index] = clamped;
}

function setSemitone(i) {
	const o = Math.floor(padSettings.baseMidi / 12) - 1;
	padSettings.baseMidi = (o + 1) * 12 + i;
	padSettings.detuneCents = 0;
	applySnapped();
}
function setOctave(o) {
	const semi = padSettings.baseMidi % 12;
	padSettings.baseMidi = (o + 1) * 12 + semi;
	padSettings.detuneCents = 0;
	applySnapped();
}

function applySnapped() {
	const base = midiToFreq(padSettings.baseMidi);
	const hz = base * Math.pow(2, padSettings.detuneCents / 1200);
	setPadHz(hz);
}

watch(currentPadHz, (hz) => {
	// If user is actively fine-adjusting or popover is closed, don't re-anchor
	if (isFineAdjust.value || !padSettings.open) return;

	const m = freqToMidi(hz);
	padSettings.baseMidi = m;
	padSettings.detuneCents = Math.round(1200 * Math.log2(hz / midiToFreq(m)));
});

function openPadSettings(name, index, evt) {
	padSettings.open = true;
	padSettings.name = name;
	padSettings.index = index;

	const r = evt.currentTarget.getBoundingClientRect();
	const popW = 280, popH = 260, margin = 8;
	let x = r.right - popW;
	let y = r.bottom + margin;
	x = Math.max(8, Math.min(window.innerWidth - popW - 8, x));
	y = (y + popH > window.innerHeight) ? r.top - popH - margin : y;
	padSettings.pos.x = x;
	padSettings.pos.y = y;

	// Preserve the existing frequency exactly
	const hz = currentPadHz.value;
	const m = freqToMidi(hz);
	padSettings.baseMidi = m;
	padSettings.detuneCents = Math.round(1200 * Math.log2(hz / midiToFreq(m)));

	document.addEventListener('mousedown', onOutsideClick, true);
	document.addEventListener('keydown', onEscape, true);
}


function closePadSettings() {
	padSettings.open = false;
	document.removeEventListener('mousedown', onOutsideClick, true);
	document.removeEventListener('keydown', onEscape, true);
}

function onOutsideClick(e) {
	const pop = document.querySelector('.pad-settings-popover');
	if (pop && !pop.contains(e.target)) closePadSettings();
}
function onEscape(e) { if (e.key === 'Escape') closePadSettings(); }

// clean up if component is destroyed while popover is open
onBeforeUnmount(() => { if (padSettings.open) closePadSettings(); });


// === Pad Settings END

const displayHz = computed(() =>
	(Math.round(currentPadHz.value * 100) / 100).toFixed(2)
);

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
	const decayEnd = attackEnd + decay;

	// Crossfade osc/noise from your existing noiseAmount
	const blend = Math.min(Math.max(noiseAmount.value, 0), 1);
	const oscBlend = 1 - blend;
	const noiseBlend = blend;

	const safeOscGain = Math.max(0.0001, velocity * oscBlend);
	const safeNoiseGain = Math.max(0.0001, velocity * noiseBlend);

	oscEnvGain.gain.setValueAtTime(0.0001, startTime);
	oscEnvGain.gain.exponentialRampToValueAtTime(safeOscGain, attackEnd);
	oscEnvGain.gain.exponentialRampToValueAtTime(0.001, decayEnd);

	// ===== UNISON =====
	const voices = unisonEnabled.value ? Math.max(1, Math.min(6, unisonVoices.value)) : 1;
	const detuneStep = (voices > 1) ? detuneCents.value : 0;  // cents-per-step
	const spreadPct = (voices > 1) ? stereoSpread.value : 0; // 0–100

	// helper to map voice index to -1..1
	const normIndex = (i, n) => (n === 1) ? 0 : ((i / (n - 1)) * 2 - 1);

	// Create per-voice chain then sum → oscEnvGain
	for (let i = 0; i < voices; i++) {
		const osc = audioCtx.createOscillator();
		const voiceFilter = audioCtx.createBiquadFilter();
		const voiceGain = audioCtx.createGain();
		const panner = audioCtx.createStereoPanner();

		// Waveform
		osc.type = selectedWaveform.value;

		// Pitch envelope / base frequency
		if (pitchEnvEnabled.value) {
			let semitoneOffset = pitchEnvSemitones.value;
			if (pitchMode.value === 'down') semitoneOffset = -pitchEnvSemitones.value;
			else if (pitchMode.value === 'random') semitoneOffset = (Math.random() * 2 - 1) * pitchEnvSemitones.value;

			const startFreqRatio = Math.pow(2, semitoneOffset / 12);
			const startFreq = freq * startFreqRatio;
			osc.frequency.setValueAtTime(startFreq, startTime);
			osc.frequency.exponentialRampToValueAtTime(freq, startTime + pitchEnvDecay.value);
		} else {
			osc.frequency.setValueAtTime(freq, startTime);
		}

		// Per-voice detune (cents)
		const dNorm = normIndex(i, voices);        // -1..1
		const detuneC = dNorm * detuneStep;        // unison spread
		osc.detune.setValueAtTime(detuneC, startTime);




		// Filter settings (clone per voice so stereo spread isn’t collapsed)
		voiceFilter.type = 'lowpass';
		if (filterEnabled.value) {
			voiceFilter.frequency.setValueAtTime(filterCutoff.value, startTime);
			voiceFilter.Q.setValueAtTime(filterResonance.value, startTime);
		} else {
			// if filter off, set high freq so it’s neutral
			voiceFilter.frequency.setValueAtTime(20000, startTime);
			voiceFilter.Q.setValueAtTime(0.0001, startTime);
		}

		// Per-voice gain (normalize to avoid clipping)
		voiceGain.gain.setValueAtTime(1 / voices, startTime);

		// Stereo spread
		const pan = (dNorm * spreadPct) / 100; // -1..1
		panner.pan.setValueAtTime(pan, startTime);

		// LFO routing (optional, respects your existing targets)
		if (lfoEnabled.value) {
			if (lfoTarget.value === 'pitch') {
				const lfoTap = audioCtx.createGain();
				lfoTap.gain.value = 1;
				lfoGain.connect(lfoTap).connect(osc.frequency);
				// no need to disconnect explicitly; GC when osc stops
			} else if (lfoTarget.value === 'gain') {
				const lfoModGain = audioCtx.createGain();
				lfoModGain.gain.value = lfoDepth.value * 0.005;

				const lfoOffset = audioCtx.createConstantSource();
				lfoOffset.offset.value = velocity * 0.75;

				const lfoSum = audioCtx.createGain();
				lfoGain.connect(lfoModGain).connect(lfoSum);
				lfoOffset.connect(lfoSum);
				lfoSum.connect(voiceGain.gain);

				lfoOffset.start(startTime);
				lfoOffset.stop(decayEnd + 0.05);
			} else if (lfoTarget.value === 'filter') {
				const lfoTap = audioCtx.createGain();
				lfoTap.gain.value = 1;
				lfoGain.connect(lfoTap).connect(voiceFilter.frequency);
			}
		}

		// Connect: osc → voiceFilter → voiceGain → panner → (sum) oscEnvGain
		osc.connect(voiceFilter).connect(voiceGain).connect(panner).connect(oscEnvGain);

		// Start/stop per-voice osc
		osc.start(startTime);
		osc.stop(decayEnd);
	}


	if (driveEnabled.value) {
		// through drive
		oscEnvGain.connect(driveDry);
		oscEnvGain.connect(driveShaper);
	} else {
		// bypass drive straight into the sum
		oscEnvGain.connect(driveSum);
	}

	// ===== Noise (unchanged) =====
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
onMounted(() => {
	initDriveNow();
});

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

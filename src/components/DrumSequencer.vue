<template>
	<!-- <div class="drum-sequencer controls"> -->
	<div class="drum-sequencer" :class="currentTheme">
		<!-- Transport & Mix -->
		<!-- Transport & Mix -->
		<section class="pt-card transport-card">
			<div class="transport-layout">
				<!-- Left: title + knobs + play -->
				<div class="transport-left">
					<h2 class="pt-title mb-2">Ephemeral Wave</h2>

					<div class="pt-knob-row transport-row">
						<!-- Volume -->
						<div class="position-relative text-center">
							<Knob v-model="volume" label="Volume" :min="0" :max="1" :step="0.01" size="medium"
								:useThemeArc="true" @knobStart="activeKnob = 'volume'" @knobEnd="activeKnob = null" />
							<span v-if="activeKnob === 'volume'" class="custom-tooltip">{{ Math.round(volume * 100)
							}}%</span>
						</div>

						<!-- Tempo -->
						<div class="position-relative text-center">
							<Knob v-model="tempo" label="Tempo" :min="20" :max="300" :step="1" size="medium"
								:useThemeArc="true" @knobStart="activeKnob = 'tempo'" @knobEnd="activeKnob = null" />
							<span v-if="activeKnob === 'tempo'" class="custom-tooltip">{{ tempo }} BPM</span>
						</div>

						<!-- Swing -->
						<div class="position-relative text-center">
							<Knob v-model="swing" label="Swing" :min="0" :max="0.5" :step="0.01" size="medium"
								:useThemeArc="true" @knobStart="activeKnob = 'swing'" @knobEnd="activeKnob = null" />
							<span v-if="activeKnob === 'swing'" class="custom-tooltip">{{ Math.round(swing * 100)
							}}%</span>
						</div>





						<!-- Play/Stop -->
						<div class="transport-actions">
							<button class="pt-btn" @click="togglePlay">
								<span v-if="isPlaying">Stop</span>
								<span v-else>Play</span>
							</button>
						</div>
					</div>
				</div>

				<!-- Right: screen -->
				<div class="transport-right">
					<div class="mpc-wrap">
						<MpcScreen ref="screen" :text="lcdText" :view="lcdView" :activeKey="activeFKey"
							@fkey="handleFKey" />
					</div>
				</div>
			</div>
		</section>



		<!-- Percussion Synth -->
		<section class="pt-card" v-if="synthInstrument">

			<div class="pt-subheader step-sequencer-subheader">
				<div class="channel-caption d-flex align-items-center gap-2">

					<div class="mute-dot" :class="{ muted: synthInstrument.muted }"
						@click="toggleMute(synthInstrument.name)" role="button"
						:title="synthInstrument.muted ? 'Muted' : 'Playing'">
					</div>
					<h2 class="pt-title">Step Sequencer</h2>
					<Knob v-model="synthInstrument.channelVolume" :min="0" :max="1" :step="0.01" size="small"
						label="Vol" color="#8E44AD" @knobStart="activeKnob = `vol-${synthInstrument.name}`"
						@knobEnd="activeKnob = null" />
					<span v-if="activeKnob === `vol-${synthInstrument.name}`" class="custom-tooltip">
						{{ Math.round(synthInstrument.channelVolume * 100) }}%
					</span>
				</div>
				<div class="pt-header-tools">
					<div class="d-flex gap-2">

						<button class="pt-btn pt-btn-sm" :disabled="allOpen" @click="setAllCollapsibles(true)">Expand
							all</button>
						<button class="pt-btn pt-btn-sm" :disabled="allClosed"
							@click="setAllCollapsibles(false)">Collapse all</button>

					</div>
				</div>
			</div>


			<SynthStepGrid :name="synthInstrument.name" :current-step="currentStep" :min-hz="MIN_PAD_HZ"
				:max-hz="MAX_PAD_HZ" v-model:steps="synthInstrument.steps"
				v-model:velocities="synthInstrument.velocities" v-model:pitches="synthInstrument.pitches"
				:nearestNote="nearestNote"
				@open-pad-settings="({ name, index, anchorRect }) => openPadSettings(name, index, { currentTarget: { getBoundingClientRect: () => anchorRect } } as any)" />


			<!-- Pattern tools  -->
			<div class="controlsWrapper pt-cards">
				<CollapsibleCard id="pattern-tools" title="Pattern Tools" v-model="collapsibleState['pattern-tools']">
					<PatternTools :steps="steps" :velocities="velocities" :frequencies="padFrequencies" :min-freq="100"
						:max-freq="2000" :currentTheme="currentTheme" @update:steps="steps = $event"
						@update:velocities="velocities = $event" @update:frequencies="padFrequencies = $event"
						@octave-shift="octaveShiftAllSkip($event)" />
				</CollapsibleCard>

				<!-- Generators -->
				<CollapsibleCard id="generators" title="Generators" v-model="collapsibleState['generators']">
					<!-- Oscillators -->
					<section class="pt-section">
						<div class="pt-section-title">Oscillators</div>
						<div class="pt-btn-group" role="group" aria-label="Waveforms">
							<button v-for="wave in waves" :key="wave" class="pt-btn"
								:class="{ 'is-active': selectedWaveform === wave }"
								:aria-pressed="selectedWaveform === wave" @click="selectedWaveform = wave">
								{{ waveLabel(wave) }}
							</button>
						</div>
					</section>

					<div class="pt-rule" aria-hidden="true"></div>

					<!-- Noise -->
					<NoiseModule :showToggle="false" v-model:enabled="noiseEnabled" v-model:type="noiseType"
						v-model:amount="noiseAmount" :color="'#9C27B0'" />
				</CollapsibleCard>



				<CollapsibleCard id="sound" title="Sound Shaping" v-model="collapsibleState['sound']">
					<EnvelopeModule :color="'#4CAF50'" :showToggle="false" v-model:enabled="envelopeEnabled"
						v-model:attackMs="ampEnvAttackMs" v-model:decayMs="ampEnvDecayMs" />

					<div class="pt-rule"></div>

					<FilterModule :color="'#FF5722'" :showToggle="false" v-model:enabled="filterEnabled"
						v-model:cutoff="filterCutoff" v-model:resonance="filterResonance" />
				</CollapsibleCard>
				<!-- Pitch & Harmonics -->
				<CollapsibleCard id="pitch" title="Pitch & Harmonics" v-model="collapsibleState['pitch']">
					<PitchEnvModule :color="'#3F51B5'" :showToggle="false" v-model:enabled="pitchEnvEnabled"
						v-model:semitones="pitchEnvSemitones" v-model:decayMs="pitchEnvDecayMs"
						v-model:mode="pitchMode" />

					<div class="pt-rule" aria-hidden="true"></div>

					<FMModule :color="'#3F51B5'" :showToggle="false" v-model:enabled="fmEnabled"
						v-model:modFreq="fmModFreq" v-model:index="fmIndex" v-model:ratio="fmRatio" />

					<div class="pt-rule" aria-hidden="true"></div>

					<UnisonEffect :showToggle="false" v-model:enabled="unisonEnabled" v-model:voices="unisonVoices"
						v-model:detune="detuneCents" v-model:spread="stereoSpread" />
				</CollapsibleCard>


				<!-- Movement & Modulation -->
				<CollapsibleCard id="mod" title="Movement & Modulation" v-model="collapsibleState['mod']">
					<LFOGroup :showToggle="false" v-model="lfoEnabled" v-model:rate="lfoRate" v-model:depth="lfoDepth"
						v-model:target="lfoTarget" :depthMax="lfoDepthMax" color="#00BCD4"
						:targets="['pitch', 'gain', 'filter']" />
				</CollapsibleCard>

				<!-- Effects -->
				<CollapsibleCard id="fx" title="Effects" v-model="collapsibleState['fx']">
					<DelayEffect :showToggle="false" :audioCtx="audioCtx" v-model:enabled="delayEnabled"
						v-model:syncEnabled="delaySync" :tempo="tempo" :maxSeconds="5" v-model:delayTime="delayTime"
						v-model:delayFeedback="delayFeedback" v-model:delayMix="delayMix"
						v-model:toneEnabled="delayToneEnabled" v-model:toneHz="delayToneHz"
						v-model:toneType="delayToneType" />

					<div class="pt-rule" aria-hidden="true"></div>

					<DriveEffect :showToggle="false" v-model:enabled="driveEnabled" v-model:driveType="driveType"
						v-model:driveAmount="driveAmount" v-model:driveTone="driveTone" v-model:driveMix="driveMix" />
				</CollapsibleCard>

			</div>

		</section>

		<!-- Sequencer -->
		<section class="pt-panel">
			<h2 class="pt-title">Sequencer</h2>

			<!-- Keep your bootstrap accordion if you like -->
			<div class="accordion" id="seqAccordion">
				<div class="accordion-item">
					<h2 class="accordion-header">
						<button type="button" class="accordion-button" :class="{ collapsed: !seqOpen }"
							@click="seqOpen = !seqOpen" :aria-expanded="seqOpen ? 'true' : 'false'"
							aria-controls="seqPanel">
							Pattern
						</button>
					</h2>

					<div id="seqPanel" class="accordion-collapse collapse" :class="{ show: seqOpen }">
						<div class="accordion-body p-3">
							<!-- ===== Sampler Channels ===== -->
							<section class="channels-section">
								<div v-for="inst in orderedChannels" :key="inst.key || inst.name"
									class="mb-3 channel-wrap">

									<!-- Add Channel row -->
									<template v-if="inst.isAddButton">
										<div class="d-flex align-items-center">
											<button class="pt-btn pt-accent-cool" @click="addCustomChannel">+ Add
												Channel</button>
										</div>
									</template>

									<!-- Regular channels (unchanged inner logic) -->
									<template v-else>
										<div class="d-flex align-items-center gap-2 mb-1">
											<div class="mute-dot" :class="{ muted: inst.muted }"
												@click="toggleMute(inst.name)" role="button"
												:title="inst.muted ? 'Muted' : 'Playing'"></div>

											<div class="channel-label d-flex align-items-center gap-1">
												<template v-if="!inst.isEditingName">
													<strong @click="editLabel(inst)"
														@mouseenter="hoveredLabel = inst.name"
														@mouseleave="hoveredLabel = null" class="position-relative">
														{{ inst.label }}
														<span v-if="hoveredLabel === inst.name"
															class="custom-tooltip">Click to rename</span>
													</strong>
												</template>
												<template v-else>
													<input v-model="inst.label" @blur="stopEditingLabel(inst)"
														@keydown.enter.prevent="stopEditingLabel(inst)"
														class="form-control form-control-sm" style="max-width: 150px;"
														:ref="el => inst.inputRef = el" />
												</template>
											</div>

											<div class="ms-auto d-flex align-items-center gap-2 channel-actions">
												<button v-if="inst.isCustom" class="pt-btn pt-btn-sm"
													@click="triggerFilePicker(inst)">Upload</button>
												<input class="d-none" :id="`file-${inst.name}`" type="file"
													accept="audio/*" @change="loadUserSample($event, inst)" />
												<button v-if="canDelete(inst.name)" class="pt-btn pt-btn-sm pt-danger"
													@click="deleteChannel(inst.name)">Delete</button>
											</div>
										</div>

										<div class="position-relative text-center mb-2">
											<Knob v-model="inst.channelVolume" :min="0" :max="1" :step="0.01"
												size="small" label="Vol" color="#8E44AD"
												@knobStart="activeKnob = `vol-${inst.name}`"
												@knobEnd="activeKnob = null" />
											<span v-if="activeKnob === `vol-${inst.name}`" class="custom-tooltip">
												{{ Math.round(inst.channelVolume * 100) }}%
											</span>
										</div>

										<div class="d-flex pad-row">
											<div class="padTEST-grid">
												<!-- your pad cells + volume slider kept verbatim -->
												<div v-for="(active, index) in inst.steps" :key="index"
													class="padTESTwrap"
													@mouseenter="hoveredPad = `${inst.name}-${index}`"
													@mouseleave="hoveredPad = null">
													<div :class="['padTEST', 'liquid', { selected: active }, { playing: index === currentStep }]"
														@mousedown="handleMouseDown($event, inst.name, index)"
														@mouseenter="handleMouseEnter(inst.name, index)"
														@dragstart.prevent :style="getPadStyle(inst, index)"></div>

													<div v-if="active && hoveredPad === `${inst.name}-${index}`"
														class="hover-slider volume-slider">
														<input type="range" min="0" max="1" step="0.01"
															v-model.number="inst.velocities[index]"
															@mousedown="activeVolumePad = `${inst.name}-${index}`"
															@mouseup="activeVolumePad = null"
															@touchstart="activeVolumePad = `${inst.name}-${index}`"
															@touchend="activeVolumePad = null" />
														<span v-if="activeVolumePad === `${inst.name}-${index}`"
															class="custom-tooltip">
															{{ Math.round(inst.velocities[index] * 100) }}%
														</span>
													</div>
												</div>
											</div>
										</div>
									</template>
								</div>
							</section>
						</div>
					</div>
				</div>
			</div>
		</section>


	</div>
	<PadSettingsPopover :key="padSettings.name ? `${padSettings.name}-${padSettings.index}` : 'pad-popover'"
		v-model:open="padPopover.open" v-model:hz="currentPadHz" :minHz="MIN_PAD_HZ" :maxHz="MAX_PAD_HZ"
		:anchorRect="padPopover.anchorRect" :title="padPopover.title" />

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
import SynthStepGrid from './SynthStepGrid.vue'
import CollapsibleCard from './CollapsibleCard.vue';
// import SequencerKeyboard from './SequencerKeyboard.vue';


// IMPORTS END

// -----------------------------------------------------------------------------------------------------------------------------------------

//Sequencer Accordian BEGIN
// const seqOpen = ref(true); // start open so current behavior doesn't change
const seqOpen = ref(localStorage.getItem('seqOpen') !== 'false');
watch(seqOpen, v => localStorage.setItem('seqOpen', String(v)));

//Sequencer Accordian END

// -----------------------------------------------------------------------------------------------------------------------------------------

//Collapsible Cards BEGIN

// Which collapsibles exist on this page (keep ids in one place)
const collapseIds = ['pattern-tools', 'generators', 'sound', 'pitch', 'mod', 'fx'] as const;
type CollapseId = typeof collapseIds[number];

// Parent-held open state for each card. Start as `undefined` so each card
// can use its own saved localStorage value on first render.
const collapsibleState = reactive<Record<CollapseId, boolean | undefined>>({
	'pattern-tools': undefined,
	'generators': undefined,
	'sound': undefined,
	'pitch': undefined,
	'mod': undefined,
	'fx': undefined,
});

// Expand/collapse all at once (also persists because each card writes to localStorage)
function setAllCollapsibles(open: boolean) {
	collapseIds.forEach(id => { collapsibleState[id] = open; });
}

const allOpen = computed(() => collapseIds.every(id => collapsibleState[id] === true));
const allClosed = computed(() => collapseIds.every(id => collapsibleState[id] === false));

//Collapsible Cards END

// -----------------------------------------------------------------------------------------------------------------------------------------


// Theming START
const currentTheme = ref(''); // '', 'theme-light', or 'theme-synthwave'
// Theming END

// -----------------------------------------------------------------------------------------------------------------------------------------

// FM Synthesis START
const fmEnabled = ref(false);
const fmModFreq = ref(200);     // Hz when not using ratio
const fmIndex = ref(0);       // 0..50 typical range
const fmRatio = ref<number | null>(1); // start as 1:1, or null for Hz mode
// FM Synthesis END

// -----------------------------------------------------------------------------------------------------------------------------------------

const A4 = 440;
const MIN_PAD_HZ = 100;
const MAX_PAD_HZ = 2000;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// -----------------------------------------------------------------------------------------------------------------------------------------

// MPC Screen BEGIN
const lcdText = ref('HARP  2');
const activeFKey = ref<number>(1);
const lcdView = ref<'text' | 'scope' | 'spec' | 'tuner'>('scope');
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
	else if (n === 3) lcdView.value = 'tuner';
	else lcdView.value = 'text'; // F4–F6 placeholders
}


function startScope() {
	const canvas = screen.value!.scopeCanvas as HTMLCanvasElement;
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const readVar = (name: string, fallback: string) =>
		(getComputedStyle(canvas).getPropertyValue(name) || fallback).trim();

	function draw() {
		requestAnimationFrame(draw);
		if (lcdView.value !== 'scope') return;

		fitCanvasToBox(canvas, ctx);
		const W = canvas.clientWidth;
		const H = canvas.clientHeight;

		// theme-aware background + trace style
		const bg = readVar('--mpc-lcd-bg', '#b9bcba');
		const trace = readVar('--mpc-scope-trace', '#111');
		const width = parseFloat(readVar('--mpc-scope-width', '2')) || 2;

		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, W, H);

		ctx.lineWidth = width;
		ctx.lineCap = 'round';
		ctx.strokeStyle = trace;

		analyser.getByteTimeDomainData(dataArray);

		const slice = W / analyser.fftSize;
		ctx.beginPath();
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

	const canvas = scr.specCanvas as unknown as HTMLCanvasElement;
	if (!canvas) return;

	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	ctx.imageSmoothingEnabled = false;

	const freqBins = new Uint8Array(analyser.frequencyBinCount);

	// Helper to read current theme vars from CSS
	const readTheme = () => {
		const s = getComputedStyle(canvas);
		const bg = (s.getPropertyValue('--mpc-lcd-bg') || '#b9bcba').trim();
		const low = (s.getPropertyValue('--mpc-spec-low') || '#4fc3f7').trim();
		const mid = (s.getPropertyValue('--mpc-spec-mid') || '#00e676').trim();
		const high = (s.getPropertyValue('--mpc-spec-high') || '#ffc400').trim();
		const peak = (s.getPropertyValue('--mpc-spec-peak') || '#ffffff').trim();
		return { bg, low, mid, high, peak };
	};

	// Make a tiny signature so we can detect when theme vars change
	const signatureOf = (t: ReturnType<typeof readTheme>) =>
		`${t.bg}|${t.low}|${t.mid}|${t.high}|${t.peak}`;

	let theme = readTheme();
	let lastSig = signatureOf(theme);

	const colorFor = (v: number, t = theme) =>
		v < 64 ? t.low :
			v < 128 ? t.mid :
				v < 192 ? t.high : t.peak;

	function draw() {
		requestAnimationFrame(draw);
		if (lcdView.value !== 'spec') return;

		fitCanvasToBox(canvas, ctx);
		const W = canvas.clientWidth;
		const H = canvas.clientHeight;

		// Refresh theme if it changed (e.g., you switched .theme-* class)
		const maybeNew = readTheme();
		const sig = signatureOf(maybeNew);
		const themeChanged = sig !== lastSig;
		if (themeChanged) {
			theme = maybeNew;
			lastSig = sig;
			// wipe so old colors don't smear across after the palette swap
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0); // ensure fillRect uses CSS px after fitCanvasToBox
			ctx.fillStyle = theme.bg;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.restore();
		} else {
			// Scroll existing image left by 1px
			ctx.drawImage(canvas, 1, 0, W - 1, H, 0, 0, W - 1, H);
		}

		// Fetch spectrum
		analyser.getByteFrequencyData(freqBins);

		// Noise floor suppression (removes the “always-on” bottom line)
		const MIN_BIN = 3;
		const FLOOR_TAP = 8;
		let floor = 0;
		for (let i = 0; i < FLOOR_TAP; i++) floor += freqBins[i];
		floor = floor / FLOOR_TAP + 3;

		// Column background (silence color)
		const x = W - 1;
		ctx.fillStyle = theme.bg;
		ctx.fillRect(x, 0, 1, H);

		// Draw new column with current palette
		for (let y = 0; y < H; y++) {
			const logY = 1 - (y + 0.5) / H;
			const idxRaw = Math.floor(Math.pow(logY, 2.0) * (freqBins.length - MIN_BIN)) + MIN_BIN;
			const bin = Math.min(freqBins.length - 1, Math.max(MIN_BIN, idxRaw));

			const v = Math.max(0, freqBins[bin] - floor);
			if (v < 6) continue;

			ctx.fillStyle = colorFor(v, theme);
			ctx.fillRect(x, y, 1, 1);
		}
	}

	draw();
}

function startTuner() {
	const scr = screen.value;
	if (!scr) return;

	const canvas = scr.tunerCanvas as unknown as HTMLCanvasElement;
	if (!canvas) return;

	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	// LATCH: persist last played note until a new one plays
	let latchedHz = 0;
	let latchedNote = '—';
	let prevStep = -999; // track step changes so we only update once per step

	function draw() {
		requestAnimationFrame(draw);
		if (lcdView.value !== 'tuner') return;

		fitCanvasToBox(canvas, ctx);
		const W = canvas.clientWidth, H = canvas.clientHeight;

		const css = getComputedStyle(canvas);
		const bg = (css.getPropertyValue('--mpc-lcd-bg') || '#0f141b').trim();
		const ink = (css.getPropertyValue('--mpc-scope-trace') || '#c7d6ff').trim();

		// --- update latch ONLY when we advance to a new step that actually plays ---
		const inst = synthInstrument.value;
		const step = currentStep.value;

		if (inst && step >= 0 && step !== prevStep) {
			prevStep = step;
			if (!inst.muted && inst.steps[step]) {
				const hz = inst.pitches?.[step] ?? 0;
				if (hz > 0) {
					latchedHz = hz;
					latchedNote = midiToName(freqToMidi(hz));
				}
			}
			// if the step is empty or muted, keep the existing latched values
		}

		// --- draw using latched values ---
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, W, H);

		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = ink;

		const fsNote = Math.max(12, Math.floor(H * 0.30));
		const fsFreq = Math.max(10, Math.floor(H * 0.16));

		ctx.font = `700 ${fsNote}px Cousine, ui-monospace, monospace`;
		ctx.fillText(latchedHz > 0 ? latchedNote : '—', W / 2, H * 0.46);

		ctx.font = `700 ${fsFreq}px Cousine, ui-monospace, monospace`;
		ctx.fillText(latchedHz > 0 ? `${latchedHz.toFixed(1)} Hz` : '', W / 2, H * 0.70);
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
	startTuner();

	// window.addEventListener('keydown', onGlobalKeydown);
	window.addEventListener('keydown', onGlobalKeydown, { capture: true });
	window.addEventListener('keyup', onGlobalKeyup, { capture: true });

});
onBeforeUnmount(() => {
	cancelAnimationFrame(loopId);
	window.removeEventListener('mouseup', handleMouseUp);
	window.removeEventListener('keydown', onGlobalKeydown, { capture: true } as any);
	window.removeEventListener('keyup', onGlobalKeyup, { capture: true } as any);

});
// MPC Screen END

// -----------------------------------------------------------------------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------------------------------------------------------------------

// Reuse shared AudioContext
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const activeKnob = ref(null);
const hoveredPad = ref(null);
const hoveredLabel = ref(null);
// const synthDecay = ref(0.4);

const selectedWaveform = ref("sine");
const waves = ['sine', 'triangle', 'sawtooth', 'square'] as const;
const waveLabel = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);


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
		type: 'sample',
		isCustom: false,
		isEditingName: false,
		buffer: null,
		muted: false,
		channelVolume: 0.5,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0)
	},
	{
		name: 'snare',
		label: 'Snare',
		type: 'sample',
		isCustom: false,
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
		type: 'sample',
		isCustom: false,
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
		type: 'synth',
		isCustom: false,
		isEditingName: false,
		muted: false,
		channelVolume: 0.5,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0),
		pitches: Array(16).fill(220),
	},
]);


const DEFAULT_CHANNELS = new Set(['kick', 'snare', 'hihat', 'synth-voice']);
function canDelete(name: string) { return !DEFAULT_CHANNELS.has(name); }

function triggerFilePicker(inst: any) {
	const input = document.getElementById(`file-${inst.name}`) as HTMLInputElement | null;
	input?.click();
}


const synthInstrument = computed(() => instruments.value.find(i => i.name === 'synth-voice'));
const steps = computed<boolean[]>({
	get: () => synthInstrument.value?.steps ?? [],
	set: v => { if (synthInstrument.value) synthInstrument.value.steps = v; }
});

const velocities = computed<number[]>({
	get: () => synthInstrument.value?.velocities ?? [],
	set: v => { if (synthInstrument.value) synthInstrument.value.velocities = v; }
});

const padFrequencies = computed<number[]>({
	get: () => synthInstrument.value?.pitches ?? [],
	set: v => { if (synthInstrument.value) synthInstrument.value.pitches = v; }
});


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
	return octs;
});


//  sampler channels only (kick/snare/hihat + customs) with the “Add Channel” row
const ADD_ROW = { key: 'add-row', isAddButton: true } as const;

const orderedChannels = computed(() => {
	const byName = (n: string) => instruments.value.find(i => i.name === n);
	const kick = byName('kick');
	const snare = byName('snare');
	const hihat = byName('hihat');
	const customs = instruments.value.filter(i => i.isCustom);

	const rows: any[] = [];
	if (kick) rows.push(kick);
	if (snare) rows.push(snare);
	if (hihat) rows.push(hihat);
	rows.push(...customs);
	rows.push(ADD_ROW); // Add Channel always after customs
	return rows;
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

const pitchMode = ref<'up' | 'down' | 'random'>('up')
const pitchEnvDecay = computed(() => pitchEnvDecayMs.value / 1000)  // seconds

// -----------------------------------------------------------------------------------------------------------------------------------------

// Noise START
type NoiseType = 'white' | 'pink' | 'brown'
const noiseBuffers: Record<NoiseType, AudioBuffer | null> = {
	white: null, pink: null, brown: null
}
const noiseType = ref<NoiseType>('white') // default selection

const noiseAmount = ref(0); // 0 = no noise, 1 = full noise
const noiseEnabled = ref(false)
// Noise END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Delay Start
const delayEnabled = ref(false);
const delaySync = ref(true);
const delayTime = ref(0.2);          // seconds (0.01 to 1.0)
const delayFeedback = ref(0.3);      // 0–0.95
const delayMix = ref(0.3);           // 0–1
const delayToneHz = ref(5000);
const delayToneEnabled = ref(true);
const delayToneType = ref<'lowpass' | 'highpass'>('lowpass');

const delayNode = audioCtx.createDelay(5.0); // max delay time = 5s
delayNode.delayTime.setValueAtTime(delayTime.value, audioCtx.currentTime);

const feedbackGain = audioCtx.createGain();
feedbackGain.gain.value = delayFeedback.value;

const delayWet = audioCtx.createGain();
const delayDry = audioCtx.createGain();
applyDelayEnabled(delayEnabled.value);

const fbTone = audioCtx.createBiquadFilter();
fbTone.type = 'lowpass';
fbTone.frequency.value = 5000;

// wet path tone (colors first echo)
const wetTone = audioCtx.createBiquadFilter();
wetTone.type = 'lowpass';
wetTone.frequency.value = 5000;

delayNode.connect(fbTone);
fbTone.connect(feedbackGain);
feedbackGain.connect(delayNode);

delayNode.connect(wetTone);
wetTone.connect(delayWet);

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

function applyDelayToneState() {
	const type = delayToneEnabled.value
		? (delayToneType.value === 'highpass' ? 'highpass' : 'lowpass')
		: 'allpass'; // simple, click-free bypass

	fbTone.type = type;
	wetTone.type = type;

	const targetHz = delayToneEnabled.value ? delayToneHz.value : 20000;
	const t = audioCtx.currentTime;
	fbTone.frequency.setTargetAtTime(targetHz, t, 0.02);
	wetTone.frequency.setTargetAtTime(targetHz, t, 0.02);
}

watch([delayToneEnabled, delayToneType, delayToneHz], applyDelayToneState);
onMounted(applyDelayToneState);


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

// -----------------------------------------------------------------------------------------------------------------------------------------

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

//  sum both drive paths before delay
const driveSum = audioCtx.createGain();
const driveMakeup = audioCtx.createGain();
driveMakeup.gain.value = 1.0;

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

// -----------------------------------------------------------------------------------------------------------------------------------------


// Unison / Detune START
const unisonEnabled = ref(false);
const unisonVoices = ref(3);   // 1–6
const detuneCents = ref(12);  // 0–100 cents per step
const stereoSpread = ref(50);  // 0–100 %
// Unison / Detune END

// -----------------------------------------------------------------------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------------------------------------------------------------------

// Pad Settings START

function setPadHz(hz) {
	const inst = instruments.value.find(i => i.name === padSettings.name);
	if (!inst) return;
	const clamped = Math.max(MIN_PAD_HZ, Math.min(MAX_PAD_HZ, hz));
	inst.pitches[padSettings.index] = clamped;
}

// Pad Settings END

// -----------------------------------------------------------------------------------------------------------------------------------------


// Space Bar play/stop controls BEGIN

function isTypingTarget(el: EventTarget | null): boolean {
	const t = el as HTMLElement | null;
	if (!t) return false;
	return !!t.closest('input, textarea, select, [contenteditable], [contenteditable="true"]');
}

function onGlobalKeydown(e: KeyboardEvent) {
	const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
	if (!isSpace) return;

	if (e.repeat) {
		e.preventDefault();
		return;
	}
	const el = e.target as HTMLElement | null;

	// If typing, ignore
	if (isTypingTarget(el)) return;

	// If focus is on a button (or role=button), hijack the spacebar
	const onButton = el?.closest('button, [role="button"]');
	if (onButton) {
		e.preventDefault();
		e.stopPropagation();
		togglePlay();
		return;
	}

	// Global toggle elsewhere
	e.preventDefault(); // avoid page scroll
	togglePlay();
}

// Prevent the button’s default "space => click" on keyup too
function onGlobalKeyup(e: KeyboardEvent) {
	const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
	if (!isSpace) return;
	const el = e.target as HTMLElement | null;
	if (el?.closest('button, [role="button"]')) {
		e.preventDefault();
		e.stopPropagation();
	}
}

// Space Bar play/stop controls END

// -----------------------------------------------------------------------------------------------------------------------------------------


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

const volume = ref(0.75);
const tempo = ref(80);
const swing = ref(0);
const isPlaying = ref(false);
const currentStep = ref(-1);

const masterGain = audioCtx.createGain();
masterGain.gain.value = volume.value;
masterGain.connect(audioCtx.destination);

// -----------------------------------------------------------------------------------------------------------------------------------------

// Oscilloscope BEGIN

// --- scope/spectrogram analyser ---
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 2048;
const dataArray = new Uint8Array(analyser.fftSize);
masterGain.connect(analyser);


// Oscilloscope END
// -----------------------------------------------------------------------------------------------------------------------------------------

function addCustomChannel() {
	const id = Date.now();
	const customIndex = instruments.value.filter(i => i.isCustom).length + 1;

	instruments.value.push({
		name: `custom-${id}`,
		label: `Custom ${customIndex}`,
		type: 'sample',
		isCustom: true,
		isEditingName: false,
		buffer: null,
		muted: false,
		channelVolume: 0.5,
		steps: Array(16).fill(false),
		velocities: Array(16).fill(1.0),
	});

	// Prompt for a file right away
	nextTick(() => {
		const input = document.getElementById(`file-custom-${id}`) as HTMLInputElement | null;
		input?.click();
	});
}

function deleteChannel(name: string) {
	if (!canDelete(name)) return; // protect defaults + synth
	const index = instruments.value.findIndex(i => i.name === name);
	if (index !== -1) {
		const label = instruments.value[index].label || name;
		const confirmed = confirm(`Delete "${label}"?`);
		if (confirmed) instruments.value.splice(index, 1);
	}
}

function loadUserSample(event: Event, instrument: any) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;

	instrument.label = file.name.replace(/\.[^/.]+$/, '');

	const reader = new FileReader();
	reader.onload = async () => {
		try {
			const arr = reader.result as ArrayBuffer;
			instrument.buffer = await audioCtx.decodeAudioData(arr);
		} catch (err) {
			console.error('Error decoding audio', err);
		} finally {
			input.value = ''; // allow reselection of same file
		}
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
	const stepDuration = 60 / tempo.value / 4;

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
				if (inst.type === 'synth') playSynthNote(pitch, velocity * chanVol, safeDecay, t);
				else if (inst.buffer) playBuffer(inst.buffer, t, velocity * chanVol);
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

// -----------------------------------------------------------------------------------------------------------------------------------------

// click and drag START
const isMouseDown = ref(false);
const dragMode = ref(null); // 'on' or 'off'

function handleMouseDown(event, instrumentName, index) {
	if (event.target.closest('.hover-slider input[type="range"]')) {
		return; // Don't toggle pad if user is adjusting the slider
	}
	event.preventDefault(); // prevents browser drag behavior
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
// -----------------------------------------------------------------------------------------------------------------------------------------


async function loadAllSamples() {
	for (const instrument of instruments.value) {
		if (instrument.type === 'synth' || instrument.isCustom) continue; // << skip customs
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

// function getPadStyle(instrument, index) {
// 	if (!instrument.steps[index]) return {};

// 	const velocity = instrument.velocities[index];
// 	const percent = Math.round(velocity * 100);

// 	return {
// 		background: `linear-gradient(to top, pink ${percent}%, #fff ${percent}%)`
// 	};
// }
function hueFor(hz: number, lo = MIN_PAD_HZ, hi = MAX_PAD_HZ) {
	const t = Math.min(1, Math.max(0, (hz - lo) / (hi - lo)));
	return Math.round(220 * (1 - t)); // blue→red
}

function getPadStyle(instrument: any, index: number) {
	if (!instrument.steps[index]) return { '--pad-on': 0 };

	const pct = Math.round(instrument.velocities[index] * 100);
	// samples don't have pitch; use a calm neutral hue (210 = blue-ish)
	const hue = instrument.pitches ? hueFor(instrument.pitches[index] || MIN_PAD_HZ)
		: 210;

	return { '--vol': pct, '--heat-h': hue, '--pad-on': 1 };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

// Noise Generator START
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
// Noise Generator END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Drive effect START
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
// Drive effect END
// -----------------------------------------------------------------------------------------------------------------------------------------

</script>



<style scoped>
.transport-row .transport-actions {
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 96px;
}

.mpc-wrap {
	margin-top: 10px;
}


.mute-dot {
	width: 12px;
	height: 12px;
	border-radius: 50%;
	background: var(--pt-btn-border);
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08);
	cursor: pointer;
	transition: transform .15s ease, filter .15s ease;
}

.mute-dot:hover {
	transform: scale(1.1);
}

.mute-dot.muted {
	filter: grayscale(.7) brightness(.7);
}

/* Top card two-column layout */
.transport-card {
	/* nothing special, inherits pt-card look */
}

.transport-layout {
	display: grid;
	grid-template-columns: minmax(420px, 1fr) auto;
	align-items: center;
	gap: 1.25rem;
}

.transport-left .pt-title {
	margin: 0 0 .35rem;
}

/* Keep your existing knob row; ensure play button area
   doesn’t collapse narrower than the button */
.transport-row .transport-actions {
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 96px;
}

/* Let the screen hug the right edge neatly */
.transport-right {
	justify-self: end;
}

/* Remove extra spacing above the screen in this context */
.mpc-wrap {
	margin-top: 0;
}

/* Responsive: stack on smaller widths */
@media (max-width: 980px) {
	.transport-layout {
		grid-template-columns: 1fr;
		align-items: start;
	}

	.transport-right {
		justify-self: start;
	}
}
</style>
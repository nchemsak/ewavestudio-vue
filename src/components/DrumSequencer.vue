<template>
	<div class="drum-sequencer" :class="currentTheme" :style="padSizeStyle">
		<!-- Save/Open/Import/Export toolbar -->
		<section class="pt-card" style="margin-bottom:12px">
			<ProjectControls :exporting="isExporting" :can-undo="canUndo" :can-redo="canRedo"
				@export-wav="exportCurrentPattern" @undo="undo" @redo="redo" />
		</section>
		<div class="ds-grid">

			<!-- Visualizer Screen -->
			<aside class="pt-card ds-visualizer">
				<div class="nac-wrap">
					<nacScreen ref="screen" :text="lcdText" :view="lcdView" :activeKey="activeFKey"
						@fkey="handleFKey" />
				</div>
			</aside>

			<!-- Transport -->
			<section class="pt-card transport-card ds-transport">
				<div class="transport-left">
					<div class="pt-knob-row transport-row">
						<!-- Volume -->
						<div class="position-relative text-center knob-wrap">
							<Knob v-model="volume" label="Volume" :value-text="`${Math.round(volume * 100)}%`" :min="0" :max="1" :step="0.01" size="medium"
								:useThemeArc="true" @knobStart="activeKnob = 'volume'" @knobEnd="activeKnob = null" />
							<div class="stepper-value" aria-live="polite" :title="`${Math.round(volume * 100)}%`">
								{{ Math.round(volume * 100) }}%
							</div>
						</div>

						<!-- Tempo -->
						<div class="position-relative text-center tempo-wrap">
							<Knob v-model="tempo" label="Tempo" :min="20" :max="300" :step="1" size="medium"
								:useThemeArc="true" @knobStart="activeKnob = 'tempo'" @knobEnd="activeKnob = null" />
							<div class="tempo-stepper" role="group" aria-label="Tempo">
								<button class="stepper-btn" type="button" title="Tempo −1"
									@mousedown.prevent="startTempoRepeat(-1)" @touchstart.prevent="startTempoRepeat(-1)"
									@mouseup.prevent="stopTempoRepeat" @mouseleave="stopTempoRepeat">−</button>

								<div class="stepper-value" aria-live="polite" :title="`${tempo} BPM`">{{ tempo }}</div>

								<button class="stepper-btn" type="button" title="Tempo +1"
									@mousedown.prevent="startTempoRepeat(1)" @touchstart.prevent="startTempoRepeat(1)"
									@mouseup.prevent="stopTempoRepeat" @mouseleave="stopTempoRepeat">+</button>
							</div>
						</div>

						<!-- Swing -->
						<div class="position-relative text-center knob-wrap">
							<Knob v-model="swing" label="Swing" :value-text="`${Math.round(swing * 100)}%`" :min="0" :max="0.5" :step="0.01" size="medium"
								:useThemeArc="true" @knobStart="activeKnob = 'swing'" @knobEnd="activeKnob = null" />
							<div class="stepper-value" aria-live="polite" :title="`${Math.round(swing * 100)}% swing`">
								{{ Math.round(swing * 100) }}%
							</div>
						</div>

						<!-- Right cluster: play + logo (+ MIDI fallback) -->
						<div class="transport-right">
							<img class="transport-logo" src="../assets/eWaveLogo1.png" alt="Ephemeral logo">
							<!-- Play/Stop -->
							<!-- <button type="button" class="pt-btn btn-lg btn3d" @click="togglePlay"
								:aria-label="isPlaying ? 'Stop' : 'Play'" :title="isPlaying ? 'Stop' : 'Play'"
								:aria-pressed="isPlaying"> -->
							<button type="button" class="pt-btn btn-lg btn3d" @click="onPlayClick"
								:aria-label="isPlaying ? 'Stop' : 'Play'" :title="isPlaying ? 'Stop' : 'Play'"
								:aria-pressed="isPlaying">
								<span class="btn-face">
									<svg v-if="!isPlaying" viewBox="0 0 24 24" aria-hidden="true">
										<path d="M8 6v12l10-6-10-6z" />
									</svg>
									<svg v-else viewBox="0 0 24 24" aria-hidden="true">
										<rect x="7" y="7" width="10" height="10" rx="1.5" />
									</svg>
								</span>
								<span class="visually-hidden">{{ isPlaying ? 'Stop' : 'Play' }}</span>
							</button>

							<!-- MIDI fallback lives in the right cluster -->
							<MidiToolbar v-if="midi.supported && !hasMidiTarget" :midi="midi" />
						</div>
					</div>
				</div>

				<!-- MIDI toolbar Teleport stays outside; only used when a slot exists -->
				<template v-if="midi.supported && hasMidiTarget">
					<Teleport to="#midi-toolbar-slot">
						<MidiToolbar :midi="midi" />
					</Teleport>
				</template>
			</section>

			<!-- Step Sequencer -->
			<section class="pt-card step-card ds-steps" v-if="synthInstrument">
				<div class="pt-subheader step-sequencer-subheader">
					<div class="channel-caption d-flex align-items-center gap-2">
						<div class="mute-dot" :class="{ muted: synthInstrument.muted }"
							@click="toggleMute(synthInstrument.name)" role="button"
							:title="synthInstrument.muted ? 'Muted' : 'Playing'"></div>
						<h2 class="pt-title">Step Sequencer</h2>

						<Knob v-model="synthInstrument.channelVolume" :min="0" :max="1" :step="0.01" size="small"
							label="Vol" aria-label="Synth volume"
							:value-text="`${Math.round(synthInstrument.channelVolume * 100)}%`" color="#8E44AD" @knobStart="activeKnob = `vol-${synthInstrument.name}`"
							@knobEnd="activeKnob = null" />
						<span v-if="activeKnob === `vol-${synthInstrument.name}`" class="custom-tooltip">
							{{ Math.round(synthInstrument.channelVolume * 100) }}%
						</span>

						<!-- Velocity routing: what a step's velocity does besides its loudness -->
						<button type="button" class="vel-btn" :class="{ on: velRoutingOn }" :aria-expanded="velOpen"
							:title="velRoutingOn ? 'Velocity routing is on' : 'Let velocity shape decay, cutoff, pitch and noise'"
							@click.stop="velOpen = !velOpen">Vel →</button>
						<VelocityRouting v-if="velOpen" v-model:decay="velocityRouting.decay.value"
							v-model:cutoff="velocityRouting.cutoff.value" v-model:pitchEnv="velocityRouting.pitchEnv.value"
							v-model:noise="velocityRouting.noise.value" @close="velOpen = false" />
					</div>
					<div v-if="velOpen" class="mm-overlay" @click="velOpen = false"></div>

					<div class="pt-header-tools step-menu-anchor">
						<button class="pt-info-icon" aria-label="Advanced options"
							@click="stepsAdvanced.open = !stepsAdvanced.open">⋯</button>
						<div v-if="stepsAdvanced.open" class="mm-menu is-local" @click.stop>
							<div class="mm-menu-title">Advanced Options</div>
							<div class="mm-opt" role="menuitem" @click="togglePadSliders()">
								<span>Individual Pad Sliders</span>
								<button class="mm-switch" :class="{ on: padSlidersOn }"><span
										class="kn"></span></button>
							</div>
							<div class="pt-rule" aria-hidden="true"></div>
							<div class="mm-reset" role="menuitem" @click.stop="resetSynthPadsToDefaults()">
								Reset Pads
							</div>
						</div>
					</div>
					<div v-if="stepsAdvanced.open" class="mm-overlay" @click="stepsAdvanced.open = false"></div>
				</div>

				<div class="step-card__grid">
					<SynthStepGrid :name="synthInstrument.name" :current-step="currentStep" :min-hz="MIN_PAD_HZ"
						:max-hz="MAX_PAD_HZ" v-model:steps="synthInstrument.steps"
						v-model:velocities="synthInstrument.velocities" v-model:pitches="synthInstrument.pitches"
						:nearestNote="nearestNote" :showVelocity="showVelocity" :showPitch="showPitch"
						:waveforms="(synthInstrument as any).waveforms"
						:defaultWave="selectedWaveform" :noiseMask="noiseMask"
						:noiseTint="noiseHexFromMorph(noiseColor)" noise-mode="static" :noise-alpha="0.32"
						:noise-fps="14" :noise-speed="40" :noise-enabled="noiseEnabled" :pepper-alpha="0.2"
						:pepper-scale="6" :lfoView="lfoView" @open-pad-settings="({ name, index, anchorRect }) =>
							openPadSettings(name, index, { currentTarget: { getBoundingClientRect: () => anchorRect } } as any)" />

				</div>
			</section>

			<!-- Modules grid (two compact rows) -->
			<section class="pt-cards controlsWrapper ds-modules">

				<div class="module pattern-tools">
					<!-- Pattern Tools -->
					<SectionWrap id="pattern-tools" title="Pattern Tools" v-model="collapsibleState['pattern-tools']">
						<PatternTools :steps="steps" :velocities="velocities" :currentTheme="currentTheme"
							@update:steps="steps = $event" @update:velocities="velocities = $event"
							@octave-shift="onPatternOctaveShift" />
					</SectionWrap>
				</div>

				<!-- Melody Maker -->
				<div class="module melody">
					<SectionWrap id="melody" title="Melody Maker" v-model="collapsibleState['melody']">
						<template #tools>
							<button class="pt-info-icon" aria-label="Advanced options"
								@click="melodyRef?.openAdvanced($event)">⋯</button>
						</template>
						<MelodyMaker :key="`melody-${resetNonce}`" ref="melodyRef" :frequencies="padFrequencies"
							:steps="steps" :min-freq="100" :max-freq="2000" :currentTheme="currentTheme"
							:initial-key-root="melodyUi.keyRoot" :initial-key-scale="melodyUi.keyScale"
							:initial-range-preset="melodyUi.rangePreset" :initial-arp-pattern="melodyUi.arpPattern"
							:initial-arp-rate="melodyUi.arpRate" :initial-arp-octaves="melodyUi.arpOctaves"
							:initial-arp-tones="melodyUi.arpTones" @update:frequencies="padFrequencies = $event"
							@octave-shift="octaveShiftAllSkip($event)"
							@key-root-change="(r) => { onKeyRootChange(r); melodyUi.keyRoot = r as any; }"
							@key-scale-change="(s) => { melodyUi.keyScale = s as any }"
							@range-preset-change="(p) => { melodyUi.rangePreset = p as any }"
							@arp-pattern-change="(v) => { melodyUi.arpPattern = v as any }"
							@arp-rate-change="(v) => { melodyUi.arpRate = v as any }"
							@arp-octaves-change="(v) => { melodyUi.arpOctaves = v as any }"
							@arp-tones-change="(v) => { melodyUi.arpTones = v as any }" />
					</SectionWrap>
				</div>

				<div class="module generators">
					<SectionWrap id="generators" title="" v-model="collapsibleState['generators']">

						<!-- Oscillators -->
						<div class="gen-panel osc-panel">
							<div class="wave-row" role="radiogroup" aria-label="Waveforms">
								<div v-for="t in WAVE_TILES" :key="t.value" class="wave-cell">
									<WaveButton :modelValue="selectedWaveform" :value="t.value" :label="t.label"
										:palette="t.palette" :pulseWidth="pulseWidth"
										:lfoView="t.value === 'pulse' ? lfoView : null"
										:randomIncluded="randomPool[t.value]" @toggle-random="onToggleRandom"
										@update:modelValue="() => applyWaveToAll(t.value)" />
									<!-- The pulse's width: a mini knob in the Pulse tile's corner (beside the tile's
										 button, not inside it, so turning it doesn't pick the wave). The LFO's PW
										 target moves it too. -->
									<div v-if="t.value === 'pulse'" class="pulse-width-knob">
										<Knob v-model="pulseWidth" label="Pulse Width" hideLabel size="mini"
											:min="PULSE_WIDTH_MIN" :max="PULSE_WIDTH_MAX" :step="1"
											:value-text="`${pulseWidth}%`" color="#ff7eb3"
											@knobStart="pulseWidthTip = true" @knobEnd="pulseWidthTip = false" />
										<span v-if="pulseWidthTip" class="custom-tooltip">Width {{ pulseWidth }}%</span>
									</div>
								</div>
							</div>
							<div class="pt-btn-group" style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
								<button class="pt-btn pt-btn-sm" :disabled="!randomPoolArray.length"
									:title="randomTooltip" @click="applyRandomWaves()">
									Random
								</button>
							</div>
						</div>
					</SectionWrap>
				</div>

				<div class="module noise">
					<div class="noise-tv-bg" :class="{ on: noiseEnabled }" :style="noiseModuleStyle">
						<!-- vertical ribbon toggle -->
						<button type="button" class="noise-ribbon" :class="{ 'is-on': noiseEnabled }"
							:aria-pressed="noiseEnabled" aria-label="Toggle noise"
							:style="{ '--noise-ribbon-accent': '#9C27B0' }" @click="noiseEnabled = !noiseEnabled">
							<span class="noise-ribbon-label">NOISE</span>
						</button>

						<div v-if="noiseEnabled" class="noise-overlay mode-static" aria-hidden="true">
							<div class="grain"></div>
						</div>

						<SectionWrap id="noise" title="" v-model="collapsibleState['noise']">
							<div class="gen-panel noise-panel">
								<div class="noise-inline">
									<NoiseModule :showToggle="false" v-model:enabled="noiseEnabled"
										v-model:amount="noiseAmount" v-model:colorMorph="noiseColor"
										v-model:mask="noiseMask" v-model:attackBurst="noiseAttackBurst"
										v-model:burstMs="noiseBurstMs" :color="'#9C27B0'" />
								</div>
							</div>
						</SectionWrap>
					</div>
				</div>

				<!-- Envelope and Pitch stacked on the left, Filter (2×2 knobs: Cutoff, Resonance, then its
					 envelope's Env Amt and Decay) on the right -->
				<div class="module sound">
					<div class="sound-grid">
						<SectionWrap id="envelope" title="Envelope" v-model="collapsibleState['envelope']">
							<EnvelopeModule :color="'#4CAF50'" :showToggle="false" v-model:enabled="envelopeEnabled"
								v-model:attackMs="ampEnvAttackMs" v-model:decayMs="ampEnvDecayMs"
								@attack-knob-start="onEnvKnobStart" @attack-knob-end="onScreenKnobEnd"
								@decay-knob-start="onEnvKnobStart" @decay-knob-end="onScreenKnobEnd" />
						</SectionWrap>

						<SectionWrap class="filter-card" id="filter" title="Filter" v-model="collapsibleState['filter']">
							<FilterModule :color="'#FF5722'" :showToggle="false" v-model:enabled="filterEnabled"
								v-model:cutoff="filterCutoff" v-model:resonance="filterResonance"
								v-model:envAmount="filterEnvAmount" v-model:envDecayMs="filterEnvDecayMs"
								:lfoView="lfoView" @knob-start="onFilterKnobStart" @knob-end="onScreenKnobEnd" />
						</SectionWrap>

						<PitchEnvModule :enabled="pitchEnvEnabled" v-model:semitones="pitchEnvSemitones"
							v-model:decayMs="pitchEnvDecayMs" v-model:mode="pitchMode" />
					</div>
				</div>

				<!-- LFO -->
				<div class="module mod">
					<SectionWrap id="mod" title="LFO" v-model="collapsibleState['mod']">
						<template #tools>
							<button class="pt-info-icon" aria-label="Advanced options"
								@click="lfoRef?.openAdvanced($event)">⋯</button>
						</template>
						<LFOGroup ref="lfoRef" :showToggle="false" :pulseInUse="pulseInUse" v-model="lfoEnabled" v-model:rate="lfoRate"
							v-model:depth="lfoDepth" v-model:target="lfoTarget" v-model:waveform="lfoWaveform"
							v-model:syncEnabled="lfoSync" v-model:division="lfoDivision"
							v-model:retrigger="lfoRetrigger" v-model:bipolar="lfoBipolar" :depthMax="lfoDepthMax"
							color="#00BCD4" :divisions="['1/1', '1/2', '1/4', '1/8.', '1/8', '1/8T', '1/16', '1/32']" />
					</SectionWrap>
				</div>

				<div class="module pitch">
					<SectionWrap id="pitch" title="Pitch & Harmonics" v-model="collapsibleState['pitch']">
						<FMModule :color="'#3F51B5'" :showToggle="false" v-model:enabled="fmEnabled"
							v-model:modFreq="fmModFreq" v-model:index="fmIndex" v-model:ratio="fmRatio" />
						<UnisonEffect :showToggle="false" v-model:enabled="unisonEnabled" v-model:voices="unisonVoices"
							v-model:detune="detuneCents" v-model:spread="stereoSpread" />
					</SectionWrap>
				</div>

				<div class="module fx fx-adv-anchor" ref="fxAnchor">
					<SectionWrap id="fx" title="Effects" v-model="collapsibleState['fx']">

						<section class="pt-section">
							<div class="fx-pair">
								<DelayEffect :showToggle="false" :audioCtx="audioCtx" v-model:enabled="delayEnabled"
									:tempo="tempo" v-model:division="delayDivision" v-model:delayTime="delayTime"
									v-model:delayFeedback="delayFeedback"
									v-model:delayMix="delayMix" v-model:toneEnabled="delayToneEnabled"
									v-model:toneHz="delayToneHz" v-model:toneType="delayToneType" />
								<DriveEffect :showToggle="false" v-model:enabled="driveEnabled" :driveType="'overdrive'"
									v-model:driveAmount="driveAmount" v-model:driveTone="driveTone"
									v-model:driveMix="driveMix" />

								<ReverbEffect :showToggle="true" :audioCtx="audioCtx" v-model:enabled="reverbEnabled"
									v-model:mix="reverbMix" v-model:decay="reverbDecay" v-model:tone="reverbTone" />

							</div>
						</section>
						<!-- Effects — Advanced -->
						<!-- <Teleport to="body">
							<div v-if="fxAdvanced.open">
								<div class="mm-overlay" @click="fxAdvanced.open = false"></div>

								<div class="mm-menu" :style="{ left: fxAdvanced.x + 'px', top: fxAdvanced.y + 'px' }"
									@click.stop>
									<div class="mm-menu-title">Advanced Options</div>

									<div class="mm-opt" role="menuitem" @click="delaySync = !delaySync">
										<span>Delay: Sync with tempo</span>
										<button class="mm-switch" :class="{ on: delaySync }"><span
												class="kn"></span></button>
									</div>

									<div class="mm-reset" role="menuitem" @click.stop="resetDelayDrive()">
										Reset to defaults
									</div>
								</div>
							</div>
						</Teleport> -->
						<!-- overlay to close -->
						<!-- <div v-if="fxAdvanced.open" class="mm-overlay" @click="fxAdvanced.open = false"></div> -->
					</SectionWrap>
				</div>

			</section>

			<!-- Bottom Sequencer -->
			<!-- <section class="pt-panel ds-sequencer">
				<h2 class="pt-title">Sequencer</h2>
				<div class="accordion" id="seqAccordion">
					<div class="accordion-item">
						<h2 class="accordion-header">
							<button type="button" class="accordion-button" :class="{ collapsed: !seqOpen }"
								@click="seqOpen = !seqOpen" :aria-expanded="seqOpen ? 'true' : 'false'"
								aria-controls="seqPanel">Pattern</button>
						</h2>

						<div id="seqPanel" class="accordion-collapse collapse" :class="{ show: seqOpen }">
							<div class="accordion-body p-3">
								<section class="channels-section">
									<div v-for="inst in orderedChannels" :key="inst.key || inst.name"
										class="mb-3 channel-wrap">
										<template v-if="inst.isAddButton">
											<div class="d-flex align-items-center">
												<button class="pt-btn pt-accent-cool" @click="addCustomChannel">+ Add
													Channel</button>
											</div>
										</template>

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
															class="form-control form-control-sm"
															style="max-width: 150px;" :ref="el => inst.inputRef = el" />
													</template>
												</div>

												<div class="ms-auto d-flex align-items-center gap-2 channel-actions">
													<button v-if="inst.isCustom" class="pt-btn pt-btn-sm"
														@click="triggerFilePicker(inst)">Upload</button>
													<input class="d-none" :id="`file-${inst.name}`" type="file"
														accept="audio/*" @change="loadUserSample($event, inst)" />
													<button v-if="canDelete(inst.name)"
														class="pt-btn pt-btn-sm pt-danger"
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
													<div v-for="(active, index) in inst.steps" :key="index"
														class="padTESTwrap"
														@mouseenter="hoveredPad = `${inst.name}-${index}`"
														@mouseleave="hoveredPad = null">
														<div class="pad-step-num">{{ index + 1 }}</div>

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
			</section> -->
		</div>
		<PadSettingsPopover :key="padSettings.name ? `${padSettings.name}-${padSettings.index}` : 'pad-popover'"
			v-model:open="padPopover.open" v-model:hz="currentPadHz" v-model:wave="currentPadWave"
			v-model:noiseEnabled="padNoiseEnabled" :minHz="MIN_PAD_HZ" :maxHz="MAX_PAD_HZ"
			:anchorRect="padPopover.anchorRect" :title="padPopover.title" />
	</div>
</template>

<script setup lang="ts">
// IMPORTS START
import { ref, reactive, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';
import Knob from './Knob.vue';
import DelayEffect from './modules/DelayEffect.vue';
import { DEFAULT_DELAY_DIVISION, DEFAULT_DELAY_TIME, followDelaySync } from '../lib/delaySync';
import DriveEffect from './modules/DriveEffect.vue';
import UnisonEffect from './modules/UnisonEffect.vue';
import LFOGroup from './modules/LFOGroup.vue';
import nacScreen from './Screen.vue';
import { startFilterView } from './filterView';
import PitchEnvModule from './modules/PitchEnvModule.vue';
import FMModule from './modules/FMModule.vue';
import FilterModule from './modules/FilterModule.vue';
import EnvelopeModule from './modules/EnvelopeModule.vue';
import NoiseModule from './modules/NoiseModule.vue';
import PadSettingsPopover from './PadSettingsPopover.vue';
import PatternTools from './PatternTools.vue';
import SynthStepGrid from './SynthStepGrid.vue'
import SectionWrap from './SectionWrap.vue';
import WaveButton from './WaveButton.vue'
import VelocityRouting from './VelocityRouting.vue';
import { velocityRoutingActive } from '../audio/velocity';
import { PULSE_WIDTH_DEFAULT, PULSE_WIDTH_MIN, PULSE_WIDTH_MAX, WAVE_IDS, WAVE_LABELS } from '../audio/waves';
import MelodyMaker from './MelodyMaker.vue';
import MidiToolbar from './MidiToolbar.vue';
import { useMidiInput } from '../composables/useMidiInput';

// Saving Imports
import { storageKey } from "../lib/storage/namespace";
import ProjectControls from './ProjectControls.vue';
import {
	buildSnapshot,
	applySnapshot,
	resetToFactoryDefaults,
	type ProjectState,
	type Instrument,
	type MelodyUi,
	type Wave,
	type KeyRoot,
} from '../lib/project/snapshot';
import { useProjectSync } from '../composables/useProjectSync';
import { useUndoHistory } from '../composables/useUndoHistory';

// WAV Export
import { scheduleStepSequencer, type StepSequencerState } from '../audio/export/scheduleStepSequencer';
import { audioBufferToWavFloat32 } from '../audio/export/encodeWav';

// Reverb
import ReverbEffect from './modules/ReverbEffect.vue';

// Live sound engine
import { useLiveEngine } from '../audio/liveEngine';
import { useLfoVisual } from '../composables/useLfoVisual';
import {
	lfoCutoffAt, lfoCutoffSwing, lfoPulseWidthAt, lfoPulseWidthRange, lfoBendAt, lfoBendRange, type LfoView,
} from '../lib/lfoVisual';
import { divisionToHz, NOISE_STOPS, type NoiseKey } from '../audio/synthHelpers';

// IMPORTS END

const resetNonce = ref(0);
const isMobile = ref(false);

// GOOGLE ANALYTICS BEGIN
function trackEvent(event: string, params: Record<string, any> = {}) {
	if (typeof window === 'undefined') return;
	const w = window as any;
	if (typeof w.gtag === 'function') {
		w.gtag('event', event, params);
	}
}
// GOOGLE ANALYTICS END

function updateIsMobile() {
	if (typeof window === 'undefined') return;
	isMobile.value = window.matchMedia('(max-width: 768px)').matches;
}

onMounted(() => {
	updateIsMobile();
	if (typeof window !== 'undefined') {
		window.addEventListener('resize', updateIsMobile);
	}
});

onBeforeUnmount(() => {
	if (typeof window !== 'undefined') {
		window.removeEventListener('resize', updateIsMobile);
	}
});

const unisonMaxVoices = computed(() => (isMobile.value ? 3 : 6));

// -----------------------------------------------------------------------------------------------------------------------------------------

//SEQUENCER TOOLS START

const STEP_COUNT = 16 as const;
const stepLength = ref<typeof STEP_COUNT>(STEP_COUNT);

const showVelocity = ref(false);
const showPitch = ref(false);

const melodyRef = ref<(InstanceType<typeof MelodyMaker> & {
	getUi?: () => any;
	setUi?: (u: any) => void;
}) | null>(null);

const melodyUi = reactive<MelodyUi>({
	keyRoot: 'A',
	keyScale: 'none',
	rangePreset: 'wide',
	arpPattern: 'up',
	arpRate: '1/16',
	arpOctaves: 1,
	arpTones: 'chord',
});

function setStepLength() {
	const target = STEP_COUNT;

	const resize = <T,>(arr: T[], fill: T) =>
	(arr.length === target
		? arr
		: (arr.length < target
			? [...arr, ...Array(target - arr.length).fill(fill)]
			: arr.slice(0, target)));

	instruments.value.forEach(inst => {
		inst.steps = resize(inst.steps, false);
		inst.velocities = resize(inst.velocities, 1.0);

		if (inst.pitches) inst.pitches = resize(inst.pitches, currentDefaultHz.value);
		if ((inst as any).waveforms)
			(inst as any).waveforms = resize((inst as any).waveforms, selectedWaveform.value as any);
	});

	noiseMask.value = resize(noiseMask.value, true);
	stepLength.value = target;
}


const padSizeStyle = computed(() => ({ '--padTEST-size': '41px' }));


//SEQUENCER TOOLS END

// -----------------------------------------------------------------------------------------------------------------------------------------

const lfoRef = ref<InstanceType<typeof LFOGroup> | null>(null);
const lfoRetrigger = ref(false)
const lfoBipolar = ref(false)

// -----------------------------------------------------------------------------------------------------------------------------------------

//Effects Panel Advanced Menu BEGIN

const fxAdvanced = reactive({ open: false, x: 0, y: 0 });
const velOpen = ref(false); // the Velocity routing panel (Step Sequencer header)
const fxAnchor = ref<HTMLElement | null>(null);

function onFxEsc(e: KeyboardEvent) {
	if (e.key === 'Escape') {
		if (fxAdvanced.open) fxAdvanced.open = false;
		if (stepsAdvanced.open) stepsAdvanced.open = false;
		if (velOpen.value) velOpen.value = false;
	}
}

onMounted(() => window.addEventListener('keydown', onFxEsc, { capture: true }));
onBeforeUnmount(() => window.removeEventListener('keydown', onFxEsc, { capture: true } as any));

function resetDelayDrive() {
	// Delay defaults
	delayFeedback.value = 0.3;
	delayMix.value = 0.3;
	if (!delaySync.value) delayTime.value = 0.2;

	// Drive defaults
	driveAmount.value = 0.4;
	driveMix.value = 0.5;
	driveTone.value = 5000;
}

//Effects Panel Advanced Menu END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Step Sequencer — Advanced BEGIN

const stepsAdvanced = reactive({ open: false, x: 0, y: 0 });

function openStepsAdvanced(e: MouseEvent) {
	const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
	stepsAdvanced.x = Math.round(r.right + 8);
	stepsAdvanced.y = Math.round(r.bottom + 8);
	stepsAdvanced.open = true;
}

function resetSynthPadsToDefaults() {
	const inst = synthInstrument.value as any;
	if (!inst) return;

	selectedKeyRoot.value = 'A';
	globalOctaveOffset.value = 0;

	const len = stepLength.value;
	const baseHz = freqForRootAtOct('A', defaultOctaveForPads);

	// Clear selection, reset per-pad volume, melody, and waveform
	inst.steps = Array(len).fill(false);
	inst.velocities = Array(len).fill(1.0);
	inst.pitches = Array(len).fill(baseHz);
	inst.waveforms = Array(len).fill('sine' as OscillatorType);

	// Keep the global waveform selector consistent with pad defaults
	selectedWaveform.value = 'sine';

	// Close the menu after resetting
	stepsAdvanced.open = false;
}

// Step Sequencer — Advanced END

// -----------------------------------------------------------------------------------------------------------------------------------------

// PANEL MENU START

// UI state for header tabs + menus
const ui = reactive({
	generatorsTab: 'osc' as 'osc' | 'noise',
	soundTab: 'env' as 'env' | 'filter',
	movementTab: 'lfo' as 'lfo' | 'unison',
	fxTab: 'delay' as 'delay' | 'drive',
	menus: {
		fx: { open: false, x: 0, y: 0 },
	} as Record<string, { open: boolean; x: number; y: number }>
});

// Generators tab
ui.generatorsTab ??= 'osc';

ui.menus.gen = ui.menus.gen ?? { open: false, x: 0, y: 0 };
const info = reactive({
	gen: { open: false, x: 0, y: 0 }
});

function closeOverlays() {
	for (const k in ui.menus) (ui.menus as any)[k].open = false;
	for (const k in info) (info as any)[k].open = false;
}

const padSlidersOn = computed({
	get: () => showVelocity.value && showPitch.value,
	set: (v: boolean) => { showVelocity.value = v; showPitch.value = v; }
});
function togglePadSliders() { padSlidersOn.value = !padSlidersOn.value; }

// PANEL MENU END

// -----------------------------------------------------------------------------------------------------------------------------------------

//Sequencer Accordian BEGIN

const seqOpen = ref(localStorage.getItem(storageKey('seqOpen')) === 'true');
watch(seqOpen, v => localStorage.setItem(storageKey('seqOpen'), String(v)));

//Sequencer Accordian END

// -----------------------------------------------------------------------------------------------------------------------------------------

//Collapsible Cards BEGIN

// Which collapsibles exist on this page (keep ids in one place)
const collapseIds = [
	'pattern-tools',
	'melody',
	'generators',
	'envelope',
	'filter',
	'pitch',
	'mod',
	'fx',
] as const;

type CollapseId = typeof collapseIds[number];

const collapsibleState = reactive<Record<CollapseId, boolean | undefined>>({
	'pattern-tools': undefined,
	'melody': undefined,
	'generators': undefined,
	'envelope': undefined,
	'filter': undefined,
	'pitch': undefined,
	'mod': undefined,
	'fx': undefined,
});

const allOpen = computed(() => collapseIds.every(id => collapsibleState[id] === true));
const allClosed = computed(() => collapseIds.every(id => collapsibleState[id] === false));

//Collapsible Cards END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Theming START

const currentTheme = ref('');

// Theming END

// -----------------------------------------------------------------------------------------------------------------------------------------

// FM Synthesis START

const fmEnabled = ref(false);
const fmModFreq = ref(200);
const fmIndex = ref(4.0);
const fmRatio = ref<number | null>(1);

// FM Synthesis END

// -----------------------------------------------------------------------------------------------------------------------------------------

const A4 = 440;
const MIN_PAD_HZ = 100;
const MAX_PAD_HZ = 2000;

const ROOT_TO_SEMITONE: Record<string, number> = {
	'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
	'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

const defaultOctaveForPads = 3;
const selectedKeyRoot = ref<KeyRoot>('A');

function midiToFreq(m: number) { return A4 * Math.pow(2, (m - 69) / 12); }
function freqForRootAtOct(root: string, oct: number) {
	const semi = ROOT_TO_SEMITONE[root] ?? 9; // fallback 'A'
	return midiToFreq((oct + 1) * 12 + semi);
}
const defaultPadHz = computed(() => freqForRootAtOct(selectedKeyRoot.value, defaultOctaveForPads));

const globalOctaveOffset = ref(0);

const currentDefaultHz = computed(() =>
	defaultPadHz.value * Math.pow(2, globalOctaveOffset.value)
);

const SHARP_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
const SHARP_KEYS = new Set(['G', 'D', 'A', 'E', 'B', 'F#', 'C#']);

type AccidentalMode = 'sharp' | 'flat';
const accidentalMode = computed<AccidentalMode>(() => {
	const r = selectedKeyRoot.value;
	if (r.includes('b') || FLAT_KEYS.has(r)) return 'flat';
	if (r.includes('#') || SHARP_KEYS.has(r)) return 'sharp';
	return 'sharp';
});

function midiToNamePref(m: number, mode: AccidentalMode = accidentalMode.value) {
	const names = mode === 'flat' ? FLAT_NOTE_NAMES : SHARP_NOTE_NAMES;
	const n = ((m % 12) + 12) % 12;
	const o = Math.floor(m / 12) - 1;
	return `${names[n]}${o}`;
}


// -----------------------------------------------------------------------------------------------------------------------------------------

// nac Screen BEGIN

const lcdText = ref('HARP  2');
const activeFKey = ref<number>(1);
const lcdView = ref<'text' | 'scope' | 'spec' | 'tuner' | 'env' | 'filter'>('scope');
const screen = ref<InstanceType<typeof nacScreen> | null>(null);

// While a knob is turned, the screen shows what it changes (Attack/Decay: the envelope view,
// F4; Cutoff/Resonance: the filter view, no F-key), then goes back to the view it was on.
// If the user picks another view while turning, that view stays.
const prevScreen = ref<{ view: typeof lcdView.value; fkey: number } | null>(null);
let screenHoldCount = 0;
let heldView: typeof lcdView.value | null = null;
let userOverrodeWhileHeld = false;

function holdScreen(view: typeof lcdView.value, fkey: number) {
	if (screenHoldCount > 0 && lcdView.value !== heldView) userOverrodeWhileHeld = true;
	screenHoldCount++;
	if (!prevScreen.value) prevScreen.value = { view: lcdView.value, fkey: activeFKey.value };
	heldView = view;
	activeFKey.value = fkey;
	lcdView.value = view;
}

function onEnvKnobStart() {
	holdScreen('env', 4);
}

function onFilterKnobStart() {
	holdScreen('filter', 0); // 0: no F-key lit
}

function onScreenKnobEnd() {
	screenHoldCount = Math.max(0, screenHoldCount - 1);
	if (screenHoldCount === 0) {
		const prev = prevScreen.value;
		// Restore, unless the user picked another view meanwhile (an F-key or 1–4)
		if (prev && !userOverrodeWhileHeld && lcdView.value === heldView) {
			lcdView.value = prev.view;
			activeFKey.value = prev.fkey;
		}
		prevScreen.value = null;
		heldView = null;
		userOverrodeWhileHeld = false;
	}
}

function fitCanvasToBox(canvas, ctx) {
	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();
	const w = Math.max(1, Math.round(rect.width * dpr));
	const h = Math.max(1, Math.round(rect.height * dpr));

	// Only resize when it actually changed.
	if (canvas.width !== w || canvas.height !== h) {
		const prev = document.createElement('canvas');
		prev.width = canvas.width;
		prev.height = canvas.height;
		if (prev.width && prev.height) {
			const pctx = prev.getContext('2d');
			pctx && pctx.drawImage(canvas, 0, 0);
		}

		canvas.width = w;
		canvas.height = h;

		// Restore transform for DPR drawing
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);

		if (prev.width && prev.height) ctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, canvas.clientWidth, canvas.clientHeight);
	} else {
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
	}
}

// Toggle by F-keys
function handleFKey(n: number) {
	activeFKey.value = n;
	if (n === 1) lcdView.value = 'scope';
	else if (n === 2) lcdView.value = 'spec';
	else if (n === 3) lcdView.value = 'tuner';
	else if (n === 4) lcdView.value = 'env';
	else lcdView.value = 'text';
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
		const W = Math.round(canvas.clientWidth);
		const H = Math.round(canvas.clientHeight);

		const bg = readVar('--nac-lcd-bg', '#b9bcba');
		const trace = readVar('--nac-scope-trace', '#111');
		const width = parseFloat(readVar('--nac-scope-width', '2')) || 2;

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
		const bg = (s.getPropertyValue('--nac-lcd-bg') || '#b9bcba').trim();
		const low = (s.getPropertyValue('--nac-spec-low') || '#4fc3f7').trim();
		const mid = (s.getPropertyValue('--nac-spec-mid') || '#00e676').trim();
		const high = (s.getPropertyValue('--nac-spec-high') || '#ffc400').trim();
		const peak = (s.getPropertyValue('--nac-spec-peak') || '#ffffff').trim();
		return { bg, low, mid, high, peak };
	};

	// Make a tiny signature to detect when theme vars change
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

		// Refresh theme if it changed
		const maybeNew = readTheme();
		const sig = signatureOf(maybeNew);
		const themeChanged = sig !== lastSig;
		if (themeChanged) {
			theme = maybeNew;
			lastSig = sig;
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.fillStyle = theme.bg;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.restore();
		} else {

			const dpr = window.devicePixelRatio || 1;

			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(
				canvas,
				1 * dpr, 0,
				canvas.width - 1 * dpr, canvas.height,
				0, 0,
				canvas.width - 1 * dpr, canvas.height
			);
			ctx.restore();
		}

		// Fetch spectrum
		analyser.getByteFrequencyData(freqBins);

		// Noise floor suppression
		const MIN_BIN = 3;
		const FLOOR_TAP = 8;
		let floor = 0;
		for (let i = 0; i < FLOOR_TAP; i++) floor += freqBins[i];
		floor = floor / FLOOR_TAP + 3;

		// Column background (silence color)
		const x = (W - 1) | 0;
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
	let prevStep = -999; // track step changes - only update once per step

	function draw() {
		requestAnimationFrame(draw);
		if (lcdView.value !== 'tuner') return;

		fitCanvasToBox(canvas, ctx);
		const W = canvas.clientWidth, H = canvas.clientHeight;

		const css = getComputedStyle(canvas);
		const bg = (css.getPropertyValue('--nac-lcd-bg') || '#0f141b').trim();
		const ink = (css.getPropertyValue('--nac-scope-trace') || '#c7d6ff').trim();

		//  update latch ONLY when we advance to a new step that actually plays 
		const inst = synthInstrument.value;
		const step = currentStep.value;

		if (inst && step >= 0 && step !== prevStep) {
			prevStep = step;
			if (!inst.muted && inst.steps[step]) {
				const hz = inst.pitches?.[step] ?? 0;
				if (hz > 0) {
					latchedHz = hz;
					latchedNote = midiToNamePref(freqToMidi(hz));

				}
			}
		}

		//  draw using latched values 
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

function startEnvViz() {
	const scr = screen.value;
	if (!scr) return;

	const canvas = scr.envCanvas as HTMLCanvasElement;
	if (!canvas) return;

	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	ctx.imageSmoothingEnabled = false;

	function draw() {
		requestAnimationFrame(draw);
		if (lcdView.value !== 'env') return;

		fitCanvasToBox(canvas, ctx);
		const W = Math.round(canvas.clientWidth);
		const H = Math.round(canvas.clientHeight);
		ctx.clearRect(0, 0, W, H);

		// Theme
		const css = getComputedStyle(canvas);
		const bg = (css.getPropertyValue('--nac-lcd-bg') || '#0f141b').trim();
		const ink = (css.getPropertyValue('--nac-scope-trace') || '#c7d6ff').trim();

		const L = 14, R = 10, T = 25, B = 16;
		const plotW = Math.max(1, W - L - R);
		const plotH = Math.max(1, H - T - B);

		// Fixed time axis (log scale)
		const AXIS_MIN_MS = 1, AXIS_MAX_MS = 2000;
		const logMin = Math.log10(AXIS_MIN_MS);
		const logMax = Math.log10(AXIS_MAX_MS);
		const logSpan = logMax - logMin;
		const timeToX = (ms: number) => {
			const t = Math.max(AXIS_MIN_MS, Math.min(ms, AXIS_MAX_MS));
			const n = (Math.log10(t) - logMin) / logSpan;
			return L + n * plotW;
		};

		// Values (ms)
		const A = Math.max(1, Math.round(ampEnvAttackMs.value));
		const D = Math.max(1, Math.round(ampEnvDecayMs.value));

		// Axes
		ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
		ctx.strokeStyle = ink; ctx.globalAlpha = 0.25; ctx.lineWidth = 1;
		ctx.beginPath(); ctx.moveTo(L, T + plotH); ctx.lineTo(L + plotW, T + plotH); ctx.stroke();
		ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L + plotW, T); ctx.stroke();
		ctx.globalAlpha = 1;

		const tau = D / Math.log(1000);

		ctx.lineWidth = 2;
		ctx.strokeStyle = ink;
		ctx.beginPath();

		// Attack
		const ax = timeToX(A);
		ctx.moveTo(L, T + plotH);
		ctx.lineTo(ax, T);

		// Decay
		const STEP_MS = Math.max(0.25, AXIS_MAX_MS / (plotW * 4));
		for (let ms = A; ms <= AXIS_MAX_MS; ms += STEP_MS) {
			const t = ms - A;
			const amp = Math.exp(-t / tau);
			const x = timeToX(ms);
			const y = T + (1 - Math.min(1, Math.max(0, amp))) * plotH;
			ctx.lineTo(x, y);
		}
		ctx.stroke();

		// Labels & tick
		ctx.font = `700 11px Cousine, ui-monospace, monospace`;
		ctx.fillStyle = ink; ctx.globalAlpha = 0.9; ctx.textAlign = 'left';
		ctx.fillText('Amplitude Envelope (Attack → Decay)', L, 12);

		ctx.globalAlpha = 0.85; ctx.textAlign = 'center';
		ctx.fillText(`${A} ms`, ax, H - 4);
		ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(ax, T); ctx.lineTo(ax, T + plotH); ctx.stroke();
		ctx.globalAlpha = 1;

		// time scale labels
		ctx.textAlign = 'left'; ctx.fillText('1 ms', L, H - 4);
		ctx.textAlign = 'right'; ctx.fillText('2000 ms', L + plotW, H - 4);
	}
	draw();
}

onMounted(() => {
	loadAllSamples();

	window.addEventListener('mouseup', handleMouseUp);

	// start both loops; each only draws when its view is active
	startScope();
	startSpectrogram();
	startTuner();
	startEnvViz();
	const filterCanvas = screen.value?.filterCanvas as unknown as HTMLCanvasElement | null;
	if (filterCanvas) startFilterView({
		canvas: filterCanvas,
		audioCtx,
		analyser,
		isActive: () => lcdView.value === 'filter',
		fit: fitCanvasToBox,
		settings: {
			filterEnabled: () => filterEnabled.value,
			cutoff: () => filterCutoff.value,
			resonance: () => filterResonance.value,
			envAmount: () => filterEnvAmount.value,
			lfo: () => ({ enabled: lfoEnabled.value, target: lfoTarget.value, depth: lfoDepth.value }),
		},
	});
	window.addEventListener('keydown', onGlobalKeydown, { capture: true });
	window.addEventListener('keyup', onGlobalKeyup, { capture: true });
	window.addEventListener('mouseup', stopTempoRepeat);
	window.addEventListener('touchend', stopTempoRepeat);

});
onBeforeUnmount(() => {
	window.removeEventListener('mouseup', handleMouseUp);
	window.removeEventListener('keydown', onGlobalKeydown, { capture: true } as any);
	window.removeEventListener('keyup', onGlobalKeyup, { capture: true } as any);

	window.removeEventListener('mouseup', stopTempoRepeat as any);
	window.removeEventListener('touchend', stopTempoRepeat as any);
	clearTempoRepeat();

});

// nac Screen END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Pad settings popover BEGIN

const padPopover = ref({
	open: false,
	title: '',
	anchorRect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
});

function openPadSettings(name: string, index: number, evt: MouseEvent) {
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
});

// Pad settings popover END

// -----------------------------------------------------------------------------------------------------------------------------------------

const volume = ref(0.75);
const tempo = ref(80);
const swing = ref(0);
const activeKnob = ref(null);
const hoveredPad = ref(null);
const hoveredLabel = ref(null);

const selectedWaveform = ref<Wave>("sine");
const waves = WAVE_IDS;

// The Waveforms panel's tiles (src/audio/waves.ts lists the waves)
const WAVE_PALETTES: Record<Wave, string[]> = {
	sine: ['#fff', '#7bd0ff', '#666'],
	triangle: ['#7cf3c9', '#b47aff', '#ffd06b'],
	sawtooth: ['#ff9a62', '#ffd06b', '#75f0ff'],
	square: ['#a2f5a6', '#7bd0ff', '#ff7eb3'],
	pulse: ['#ff7eb3', '#ffd06b', '#b47aff'],
	organ: ['#ffb86b', '#ff7eb3', '#7bd0ff'],
	hollow: ['#7cf3c9', '#7bd0ff', '#a2f5a6'],
	glass: ['#e6c6ff', '#7bd0ff', '#fff'],
};
const WAVE_TILES = WAVE_IDS.map(value => ({
	value, label: WAVE_LABELS[value].toUpperCase(), palette: WAVE_PALETTES[value],
}));

const randomPool = reactive<Record<Wave, boolean>>(
	Object.fromEntries(WAVE_IDS.map(w => [w, true])) as Record<Wave, boolean>
);

const randomPoolArray = computed<Wave[]>(() => WAVE_IDS.filter(w => randomPool[w]));

function onToggleRandom(w: Wave, next: boolean, only = false) {
	if (only) {
		WAVE_IDS.forEach(k => randomPool[k] = false);
		randomPool[w] = true;
	} else {
		randomPool[w] = next;
	}
}

const randomTooltip = computed(() =>
	randomPoolArray.value.length
		? `Random from: ${randomPoolArray.value.map(w => WAVE_LABELS[w]).join(', ')}`
		: 'Select at least one wave using the little dice badges'
);

const waveLabel = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

// const perPadWavesActive = computed(() => {
// 	const inst = synthInstrument.value as any;
// 	return !!(inst && inst.waveforms && Array.isArray(inst.waveforms));
// });

// function randomizeSynthPadWaves() {
// 	const inst = synthInstrument.value as any;
// 	if (!inst) return;
// 	const len = stepLength.value;
// 	inst.waveforms = Array.from({ length: len }, () => waves[Math.floor(Math.random() * waves.length)]) as any;
// }

// function clearSynthPadWaves() {
// 	const inst = synthInstrument.value as any;
// 	if (!inst) return;
// 	inst.waveforms = Array(stepLength.value).fill(selectedWaveform.value as any);
// }

function applyWaveToAll(w: Wave) {
	selectedWaveform.value = w;
	const inst = synthInstrument.value as any;
	if (!inst) return;
	inst.waveforms = Array(stepLength.value).fill(w);
}

function applyRandomWaves() {
	const inst = synthInstrument.value as any;
	if (!inst) return;

	const pool = randomPoolArray.value.length
		? randomPoolArray.value
		: [...WAVE_IDS]; // fallback

	inst.waveforms = Array.from({ length: stepLength.value }, () =>
		pool[Math.floor(Math.random() * pool.length)]
	) as any;
}

const isFineAdjust = ref(false);

function nearestNote(hz) { return midiToNamePref(freqToMidi(hz)); }

function midiOf(octave, semitone) {
	return (octave + 1) * 12 + semitone;
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

const instruments = ref<Instrument[]>([
	{
		name: 'kick',
		label: 'Kick',
		type: 'sample',
		isCustom: false,
		isEditingName: false,
		buffer: null,
		muted: false,
		channelVolume: 0.5,
		steps: Array(stepLength.value).fill(false),
		velocities: Array(stepLength.value).fill(1.0),
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
		steps: Array(stepLength.value).fill(false),
		velocities: Array(stepLength.value).fill(1.0),
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
		steps: Array(stepLength.value).fill(false),
		velocities: Array(stepLength.value).fill(1.0),
	},
	{
		name: 'synth-voice',
		label: 'Percussion Synth',
		type: 'synth',
		isCustom: false,
		isEditingName: false,
		muted: false,
		channelVolume: 0.5,
		steps: Array(stepLength.value).fill(false),
		velocities: Array(stepLength.value).fill(1.0),
		pitches: Array(stepLength.value).fill(currentDefaultHz.value),
		waveforms: Array(stepLength.value).fill('sine' as OscillatorType),
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

const currentPadWave = computed<Wave>({
	get() {
		const inst = instruments.value.find(i => i.name === padSettings.name) as any;
		if (!inst) return selectedWaveform.value as Wave;
		const i = padSettings.index;
		return (inst.waveforms?.[i] ?? selectedWaveform.value) as Wave;
	},
	set(w) {
		const inst = instruments.value.find(i => i.name === padSettings.name) as any;
		if (!inst) return;
		if (!Array.isArray(inst.waveforms) || inst.waveforms.length !== stepLength.value) {
			inst.waveforms = Array(stepLength.value).fill(selectedWaveform.value as Wave);
		}
		inst.waveforms[padSettings.index] = w;
	}
});

// Per-pad Noise toggle for the pad settings popover
const padNoiseEnabled = computed<boolean>({
	get() {
		const i = padSettings.index;
		// default "true" (noise allowed) if out of range or not set yet
		return (i >= 0 && i < noiseMask.value.length)
			? (noiseMask.value[i] ?? true)
			: true;
	},
	set(v: boolean) {
		const i = padSettings.index;
		if (i < 0) return;
		if (!Array.isArray(noiseMask.value) || noiseMask.value.length !== stepLength.value) {
			noiseMask.value = Array(stepLength.value).fill(true);
		}
		noiseMask.value[i] = !!v;
	}
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

	// Advance the global default so untouched pads keep tracking the octave.
	if (!onlyActive) {
		globalOctaveOffset.value += deltaOct;
	}

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

function freqToMidi(f) { return Math.round(69 + 12 * Math.log2(f / A4)); }

function onPatternOctaveShift(payload: number | { delta: number; onlyActive?: boolean }) {
	const delta = typeof payload === 'number' ? payload : payload.delta;
	const onlyActive = typeof payload === 'object' && !!payload.onlyActive;
	octaveShiftAllSkip(delta, { onlyActive });
}

// Called when PatternTools reports a new key root
function onKeyRootChange(root: typeof selectedKeyRoot.value) {
	const inst = synthInstrument.value;
	if (!inst) { selectedKeyRoot.value = root; return; }

	const oldBaseline = currentDefaultHz.value;
	selectedKeyRoot.value = root;
	const newBaseline = currentDefaultHz.value;

	const EPS = 0.5; // Hz

	inst.pitches = inst.pitches.map((hz, i) =>
		(!inst.steps[i] && Math.abs(hz - oldBaseline) <= EPS) ? newBaseline : hz
	);
}

// Pad pitch and volume sliders
const activeVolumePad = ref(null);
const activePitchPad = ref(null);

const pitchEnvEnabled = ref(true);
const envelopeEnabled = ref(true);
const filterEnabled = ref(true);

const filterCutoff = ref(5000);
const filterResonance = ref(0.5);
// Filter envelope: the cutoff starts filterEnvAmount octaves away and returns within
// filterEnvDecayMs (0 octaves: off)
const filterEnvAmount = ref(0);
const filterEnvDecayMs = ref(200);

const ampEnvAttackMs = ref(20);
const ampEnvDecayMs = ref(400);

const synthDecay = computed(() => ampEnvDecayMs.value / 1000);

const pitchEnvSemitones = ref(0);
const pitchEnvDecayMs = ref(300);

const pitchMode = ref<'up' | 'down' | 'random'>('up');
// The pulse wave's width, % (src/audio/waves.ts); 50 is a square
const pulseWidth = ref(PULSE_WIDTH_DEFAULT);
const pulseWidthTip = ref(false);
// Velocity routing amounts, % −100..100 (src/audio/velocity.ts; 0 = off): what a step's
// velocity does besides its loudness
const velocityRouting = {
	decay: ref(0),
	cutoff: ref(0),
	pitchEnv: ref(0),
	noise: ref(0),
};
const velRoutingOn = computed(() => velocityRoutingActive({
	decay: velocityRouting.decay.value, cutoff: velocityRouting.cutoff.value,
	pitchEnv: velocityRouting.pitchEnv.value, noise: velocityRouting.noise.value,
}));

// -----------------------------------------------------------------------------------------------------------------------------------------

// Noise START

// Visual swatch colors for each noise key (match NoiseModule’s swatch look)
const NOISE_HEX: Record<NoiseKey, string> = {
	brown: '#6a4b2f',
	pink: '#f5a3bd',
	white: '#ffffff',
	blue: '#7bbcff',
	violet: '#c7a4ff',
};

// tiny local util (unique name to avoid collisions)
function __mixHex(a: string, b: string, w: number) {
	const toRgb = (h: string) => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
	const pad = (n: number) => Math.round(n).toString(16).padStart(2, '0');
	const [ar, ag, ab] = toRgb(a.replace('#', ''));
	const [br, bg, bb] = toRgb(b.replace('#', ''));
	const r = ar + (br - ar) * w, g = ag + (bg - ag) * w, b2 = ab + (bb - ab) * w;
	return `#${pad(r)}${pad(g)}${pad(b2)}`;
};

// Given morph t (0..1), pick adjacent NOISE_STOPS and blend their hexes.
// Uses existing NOISE_STOPS and noise keys.
function noiseHexFromMorph(t: number) {
	t = Math.max(0, Math.min(1, t));
	let a = NOISE_STOPS[0], b = NOISE_STOPS[NOISE_STOPS.length - 1];
	for (let i = 0; i < NOISE_STOPS.length - 1; i++) {
		const s0 = NOISE_STOPS[i], s1 = NOISE_STOPS[i + 1];
		if (t >= s0.pos && t <= s1.pos) { a = s0; b = s1; break; }
	}
	const span = Math.max(1e-6, b.pos - a.pos);
	const w = (t - a.pos) / span;
	return __mixHex(NOISE_HEX[a.key], NOISE_HEX[b.key], w);
};

const noiseModuleStyle = computed(() => {
	const tint = noiseHexFromMorph(noiseColor.value);
	const alpha = 0.32;
	const fps = 14;
	const speed = 40;
	const pepperA = 0.20;
	const pepperScale = 6;
	return {
		'--noise-tint': tint,
		'--noise-alpha': String(alpha),
		'--noise-fps': String(fps),
		'--noise-speed': String(speed),
		'--pepper-alpha': String(pepperA),
		'--pepper-scale': String(pepperScale)
	} as Record<string, string>;
});


// continuous color morph 0..1  (0=brown → 1=violet)
const noiseColor = ref(0.5);

const noiseAmount = ref(0.25); // 0 = no noise, 1 = full noise
const noiseEnabled = ref(false);

const noiseMask = ref<boolean[]>(Array(stepLength.value).fill(true));

const noiseAttackBurst = ref(false);
const noiseBurstMs = ref(80);

// Noise END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Delay Start

const delayEnabled = ref(false);
const delaySync = ref(true);
// The TIME knob's note division; with sync on, the delay time follows it and the tempo
// (followDelaySync, just below). Starting values match the defaults in snapshot.ts.
const delayDivision = ref(DEFAULT_DELAY_DIVISION);
const delayTime = ref(DEFAULT_DELAY_TIME);
const delayFeedback = ref(0.3);
const delayMix = ref(0.3);
const delayToneHz = ref(5000);
const delayToneEnabled = ref(true);
const delayToneType = ref<'lowpass' | 'highpass'>('lowpass');
followDelaySync({ tempo, division: delayDivision, sync: delaySync, time: delayTime });

//Delay END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Drive START

const driveEnabled = ref(false);
const driveType = ref('overdrive');
const driveAmount = ref(0.4);
const driveTone = ref(5000);
const driveMix = ref(0.5);

//Drive END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Reverb START
const reverbEnabled = ref(false);
const reverbMix = ref(0.18);
const reverbDecay = ref(1.4);

// 0 = dark, 1 = bright
const reverbTone = ref(0.6);      // normalized tone control

// Reverb END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Unison / Detune START

const unisonEnabled = ref(false);
const unisonVoices = ref(3);   // 1–6
const detuneCents = ref(12);  // 0–100 cents per step
const stereoSpread = ref(50);  // 0–100 %

watch(unisonVoices, (v) => {
	const cap = unisonMaxVoices.value;
	let clamped = v;
	if (v < 1) clamped = 1;
	if (v > cap) clamped = cap;
	if (clamped !== v) unisonVoices.value = clamped;
});

watch(unisonMaxVoices, (cap) => {
	if (unisonVoices.value > cap) {
		unisonVoices.value = cap;
	}
});

// Unison / Detune END

// -----------------------------------------------------------------------------------------------------------------------------------------

// TEMPO Controls START

//  Tempo helpers (whole-number BPM only) 
const MIN_BPM = 20;
const MAX_BPM = 300;

function setTempoClamp(v: number) {
	// force integers, clamp to range
	tempo.value = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v)));
}

function nudgeTempo(delta: number) {
	setTempoClamp(tempo.value + delta);
}

// Hold-to-repeat (click-and-hold on +/-)
let tempoRepeatTimer: number | null = null;
let tempoRepeatInterval: number | null = null;

function startTempoRepeat(delta: number) {
	// immediate nudge for a single tap
	nudgeTempo(delta);

	// start repeating after a brief delay, then repeat quickly
	clearTempoRepeat();
	tempoRepeatTimer = window.setTimeout(() => {
		tempoRepeatInterval = window.setInterval(() => nudgeTempo(delta), 60);
	}, 350);
}

function stopTempoRepeat() {
	clearTempoRepeat();
}

function clearTempoRepeat() {
	if (tempoRepeatTimer != null) { clearTimeout(tempoRepeatTimer); tempoRepeatTimer = null; }
	if (tempoRepeatInterval != null) { clearInterval(tempoRepeatInterval); tempoRepeatInterval = null; }
}

// Guard: if something ever sets a non-integer, normalize it.
watch(tempo, (v) => {
	if (!Number.isInteger(v)) setTempoClamp(v);
});

// TEMPO Controls END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Export to wav file START

//  Export: state 
const isExporting = ref(false);

//  Export: computed StepSequencer state (pure data for offline render) 
const exportState = computed<StepSequencerState>(() => {
	const inst = synthInstrument.value!;
	const stepsCount = stepLength.value;

	const wf = (idx: number) =>
		(inst as any).waveforms?.[idx] ?? selectedWaveform.value;

	// Derive LFO rate in Hz if synced
	const rateHz = lfoSync.value
		? divisionToHz(lfoDivision.value, tempo.value)
		: lfoRate.value;

	// Clamp unison voices here (can't use const inside an object literal)
	const cappedVoices = Math.max(
		1,
		Math.min(unisonMaxVoices.value, unisonVoices.value)
	);

	return {
		bpm: tempo.value,
		stepsCount: stepsCount as 16 | 32,
		swing: swing.value,
		masterVolume: volume.value,
		channelVolume: inst.channelVolume,

		pattern: {
			active: [...inst.steps],
			velocities: [...inst.velocities],
			pitches: [
				...(inst.pitches ?? Array(stepsCount).fill(currentDefaultHz.value)),
			],
			waveforms: Array.from({ length: stepsCount }, (_, i) => wf(i)),
		},

		synth: {
			envelope: {
				enabled: envelopeEnabled.value,
				attackMs: ampEnvAttackMs.value,
				decayMs: ampEnvDecayMs.value,
			},
			filter: {
				enabled: filterEnabled.value,
				cutoff: filterCutoff.value,
				resonance: filterResonance.value,
				envAmount: filterEnvAmount.value,
				envDecayMs: filterEnvDecayMs.value,
			},
			noise: {
				enabled: noiseEnabled.value,
				color: noiseColor.value,
				type: (() => {
					const t = noiseColor.value;
					if (t < 0.125) return "brown";
					if (t < 0.375) return "pink";
					if (t < 0.625) return "white";
					if (t < 0.875) return "blue";
					return "violet";
				})(),
				amount: noiseAmount.value,
				mask: [...noiseMask.value],
				attackBurst: noiseAttackBurst.value,
				burstMs: noiseBurstMs.value,
			} as any,

			unison: {
				enabled: unisonEnabled.value,
				voices: cappedVoices,
				detuneCents: detuneCents.value,
				stereoSpread: stereoSpread.value,
			},

			lfo: {
				enabled: lfoEnabled.value,
				target: lfoTarget.value as any,
				waveform: lfoWaveform.value as any,
				depth: lfoDepth.value,
				rateHz,
				division: lfoDivision.value,
				retrigger: lfoRetrigger.value,
				bipolar: lfoBipolar.value,
			},

			fm: {
				enabled: fmEnabled.value,
				modFreq: fmModFreq.value,
				index: fmIndex.value,
				ratio: fmRatio.value,
			},

			pitchEnv: {
				enabled: pitchEnvEnabled.value,
				semitones: pitchEnvSemitones.value,
				decayMs: pitchEnvDecayMs.value,
				mode: pitchMode.value,
			},
			pulse: { width: pulseWidth.value },
			velocity: {
				decay: velocityRouting.decay.value,
				cutoff: velocityRouting.cutoff.value,
				pitchEnv: velocityRouting.pitchEnv.value,
				noise: velocityRouting.noise.value,
			},
		},

		fx: {
			delay: {
				enabled: delayEnabled.value,
				sync: delaySync.value,
				time: delayTime.value,
				feedback: delayFeedback.value,
				mix: delayMix.value,
				toneEnabled: delayToneEnabled.value,
				toneHz: delayToneHz.value,
				toneType: delayToneType.value,
			},
			drive: {
				enabled: driveEnabled.value,
				type: "overdrive",
				amount: driveAmount.value,
				tone: driveTone.value,
				mix: driveMix.value,
			},
			reverb: {
				enabled: reverbEnabled.value,
				mix: reverbMix.value,
				decay: reverbDecay.value,
				tone: reverbTone.value,
			},
		},

		sampleRate: audioCtx?.sampleRate || 48000,
		tailSeconds: 5.0,
	};
});


// Export to wav file END

// -----------------------------------------------------------------------------------------------------------------------------------------

// LFO START

const lfoEnabled = ref(true);
const lfoRate = ref(5);
const lfoDepth = ref(0);
const lfoTarget = ref<'pitch' | 'filter' | 'pwm'>('pitch');

// Does anything play the pulse wave? (the LFO's PW target only affects pulse notes): the main
// wave (MIDI notes play it), or any step that's on, in an unmuted lane, set to Pulse
const pulseInUse = computed(() => {
	if (selectedWaveform.value === 'pulse') return true;
	const inst = synthInstrument.value as any;
	if (!inst || inst.muted) return false;
	return (inst.steps as boolean[]).some((on, i) => on && (inst.waveforms?.[i] ?? selectedWaveform.value) === 'pulse');
});

const lfoWaveform = ref<'sine' | 'square'>('sine');
const lfoSync = ref(true);
const lfoDivision = ref('1/8');

// sensible depth caps per target
const lfoDepthMax = computed(() => {
	switch (lfoTarget.value) {
		case 'pitch': return 1200;

		case 'filter': return 5000;
		case 'pwm': return 45; // % of width
		default: return 100;
	}
});

// LFO END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Project settings START

// Every setting a project saves, grouped like a saved project (see ProjectState in
// src/lib/project/snapshot.ts). Saving and loading use it, and the live engine gets its groups.
const projectState: ProjectState = {
	ui: { currentTheme, stepLength, collapsibleState, seqOpen },
	transport: { volume, tempo, swing },
	synth: {
		envelope: { enabled: envelopeEnabled, attackMs: ampEnvAttackMs, decayMs: ampEnvDecayMs },
		filter: { enabled: filterEnabled, cutoff: filterCutoff, resonance: filterResonance, envAmount: filterEnvAmount, envDecayMs: filterEnvDecayMs },
		noise: {
			enabled: noiseEnabled,
			color: noiseColor,
			amount: noiseAmount,
			mask: noiseMask,
			attackBurst: noiseAttackBurst,
			burstMs: noiseBurstMs,
		},
		unison: {
			enabled: unisonEnabled,
			voices: unisonVoices,
			detuneCents,
			stereoSpread,
			maxVoices: unisonMaxVoices,
		},
		lfo: {
			enabled: lfoEnabled,
			rate: lfoRate,
			depth: lfoDepth,
			target: lfoTarget,
			waveform: lfoWaveform,
			sync: lfoSync,
			division: lfoDivision,
			retrigger: lfoRetrigger,
			bipolar: lfoBipolar,
		},
		fm: { enabled: fmEnabled, modFreq: fmModFreq, index: fmIndex, ratio: fmRatio },
		pitchEnv: { enabled: pitchEnvEnabled, semitones: pitchEnvSemitones, decayMs: pitchEnvDecayMs, mode: pitchMode },
		pulse: { width: pulseWidth },
		velocity: velocityRouting,
		tuning: { selectedKeyRoot, globalOctaveOffset, currentDefaultHz },
	},
	fx: {
		delay: {
			enabled: delayEnabled,
			sync: delaySync,
			division: delayDivision,
			time: delayTime,
			feedback: delayFeedback,
			mix: delayMix,
			toneEnabled: delayToneEnabled,
			toneHz: delayToneHz,
			toneType: delayToneType,
		},
		drive: { enabled: driveEnabled, type: driveType, amount: driveAmount, tone: driveTone, mix: driveMix },
		reverb: { enabled: reverbEnabled, mix: reverbMix, decay: reverbDecay, tone: reverbTone },
	},
	instruments,
	melody: melodyUi,
	selectedWaveform,
	setStepLength,
};

// Project settings END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Live sound engine START

// The AudioContext, effects graph, LFO, synth voices and sequencer clock live in
// src/audio/liveEngine.ts. It reads the settings above and follows their changes.
const {
	audioCtx,
	analyser,
	isPlaying,
	currentStep,
	playSynthNote,
	startLfoIfNeeded,
	togglePlay,
	hardStopSequencer,
	loadSample,
	lfoNow,
	soundingRecently,
} = useLiveEngine({
	transport: projectState.transport,
	pattern: { lanes: instruments, stepLength, selectedWaveform, noiseMask },
	envelope: projectState.synth.envelope,
	filter: projectState.synth.filter,
	noise: projectState.synth.noise,
	unison: projectState.synth.unison,
	lfo: projectState.synth.lfo,
	fm: projectState.synth.fm,
	pitchEnv: projectState.synth.pitchEnv,
	pulse: projectState.synth.pulse,
	velocity: projectState.synth.velocity,
	delay: projectState.fx.delay,
	drive: projectState.fx.drive,
	reverb: projectState.fx.reverb,
});

// Oscilloscope samples (the scope view reads the analyser into this every frame)
const dataArray = new Uint8Array(analyser.fftSize);

// Live sound engine END

// -----------------------------------------------------------------------------------------------------------------------------------------

// LFO visualizer START

// Shows what the LFO is doing on the control it moves, without turning that control (so it can
// still be turned while the LFO runs): a dot and range arc on the Cutoff knob, the Pulse tile's
// bar, or a bar on the lit step pads. The arithmetic is in src/lib/lfoVisual.ts, the frame clock
// in src/composables/useLfoVisual.ts. `lfoView` is passed down as one object, so only the
// components that read it redraw every frame (not this one).
const lfoMoving = computed(() => lfoEnabled.value && lfoDepth.value > 0);
const { lfoPos } = useLfoVisual({ lfoNow, soundingRecently, active: lfoMoving });
const lfoAt = (target: string) => lfoMoving.value && lfoTarget.value === target;
const lfoView: LfoView = reactive({
	cutoff: computed(() => (lfoAt('filter') && filterEnabled.value && lfoPos.value != null
		? lfoCutoffAt(filterCutoff.value, lfoDepth.value, audioCtx.sampleRate, lfoPos.value) : null)),
	cutoffRange: computed(() => (lfoAt('filter') && filterEnabled.value
		? lfoCutoffSwing(filterCutoff.value, lfoDepth.value, audioCtx.sampleRate) : null)),
	// The Pulse target only moves pulse notes, so the tile rests while nothing plays Pulse
	pulseWidth: computed(() => (lfoAt('pwm') && pulseInUse.value && lfoPos.value != null
		? lfoPulseWidthAt(pulseWidth.value, lfoDepth.value, lfoPos.value) : null)),
	pulseRange: computed(() => (lfoAt('pwm') && pulseInUse.value ? lfoPulseWidthRange(pulseWidth.value, lfoDepth.value) : null)),
	bend: computed(() => (lfoAt('pitch') && lfoPos.value != null ? lfoBendAt(lfoDepth.value, lfoPos.value) : null)),
	bendRange: computed(() => (lfoAt('pitch') ? lfoBendRange(lfoDepth.value) : null)),
});

// LFO visualizer END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Web MIDI (live keyboard input) START

// Device access and note input live in src/composables/useMidiInput.ts, the toolbar in
// MidiToolbar.vue. This decides what a MIDI note plays: the synth lane's sound at the note's
// pitch, with the global waveform, scaled by velocity and the synth channel volume.
const midi = useMidiInput({
	audioCtx,
	noteToPlay(note, velocity) {
		const freq = midiToFreq(note);
		const decayTime = synthDecay.value; // seconds, as for sequencer notes
		const wf = selectedWaveform.value;

		// Only if the synth lane exists and isn't muted
		const inst = synthInstrument.value;
		if (!inst || inst.muted) return null;

		const chanVol = inst.channelVolume ?? 1;
		const amp = Math.min(1, velocity * chanVol);

		// Play "now" (slightly ahead to avoid a tiny click)
		return () => {
			startLfoIfNeeded();
			playSynthNote(freq, amp, decayTime, audioCtx.currentTime + 0.003, wf, {
				addNoise: true,
				vel: velocity, // the key's velocity also goes through velocity routing
			});
		};
	},
});

// The toolbar goes into App.vue's #midi-toolbar-slot when there is one, else into the
// transport row
const hasMidiTarget = ref(false);

onMounted(() => {
	if (typeof window !== 'undefined') {
		hasMidiTarget.value = !!document.querySelector('#midi-toolbar-slot');
	}
});

// Web MIDI (live keyboard input) END

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
	// Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo. A text box keeps its own undo.
	const key = e.key.toLowerCase();
	if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'z' || key === 'y')) {
		if (isTypingTarget(e.target)) return;
		e.preventDefault();
		if (key === 'y' || e.shiftKey) redo(); else undo();
		return;
	}

	// Number keys 1–4 switch the screen view, like the four buttons under the screen
	if (/^[1-4]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
		// Leave digits alone while typing, or while a dropdown list is open
		if (isTypingTarget(e.target) || document.querySelector('[role="listbox"]')) return;
		e.preventDefault();
		if (!e.repeat) handleFKey(Number(e.key));
		return;
	}

	const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
	if (!isSpace) return;

	if (e.repeat) {
		e.preventDefault();
		return;
	}
	const el = e.target as HTMLElement | null;

	// If typing, ignore
	if (isTypingTarget(el)) return;

	const onButton = el?.closest('button, [role="button"]');
	if (onButton) {
		e.preventDefault();
		e.stopPropagation();
		togglePlay();
		return;
	}

	e.preventDefault();
	togglePlay();
}

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
		steps: Array(stepLength.value).fill(false),
		velocities: Array(stepLength.value).fill(1.0),
	});

	// Prompt for a file right away
	nextTick(() => {
		const input = document.getElementById(`file-custom-${id}`) as HTMLInputElement | null;
		input?.click();
	});
}

function deleteChannel(name: string) {
	if (!canDelete(name)) return;
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


function togglePad(instrumentName, index) {
	const instrument = instruments.value.find(i => i.name === instrumentName);
	if (instrument) instrument.steps[index] = !instrument.steps[index];
}

// GOOGLE ANALYTICS BEGIN
function onPlayClick() {
	// We want to log what the user *is about to do* based on current state.
	const nextAction = isPlaying.value ? 'stop' : 'play';

	trackEvent('play_toggle_click', {
		action: nextAction,          // 'play' or 'stop'
		bpm: tempo.value,
		swing: swing.value,
		steps: stepLength.value,
	});

	togglePlay();
}
// GOOGLE ANALYTICS END
async function exportCurrentPattern() {
	if (!synthInstrument.value) return;

	// Compute safe render length
	const bpm = tempo.value;
	const steps = stepLength.value;
	const bars = steps / 16;
	const secondsPerBeat = 60 / bpm;
	const patternDuration = bars * secondsPerBeat * 4;
	const tail = exportState.value.tailSeconds;
	const renderSeconds = patternDuration + tail;

	// Guard against extreme cases
	if (renderSeconds > 30) {
		const ok = confirm(`This export will be ~${renderSeconds.toFixed(1)}s long. Continue?`);
		if (!ok) return;
	}

	try {
		isExporting.value = true;

		// Prepare OfflineAudioContext
		const sampleRate = Math.max(3000, Math.min(192000, exportState.value.sampleRate || 48000));
		const totalFrames = Math.ceil(renderSeconds * sampleRate);
		const OfflineAC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
		const off = new OfflineAC(2, totalFrames, sampleRate);

		// Schedule the step sequencer synth only
		scheduleStepSequencer(off, exportState.value, 0);

		// Render
		const rendered: AudioBuffer = await off.startRendering();

		// Encode to 32-bit float WAV
		const wav = audioBufferToWavFloat32(rendered);
		const blob = new Blob([wav], { type: "audio/wav" });

		// Filename
		const nameGuess = (project as any)?.name || (project as any)?.projectName || "Untitled";
		const pad = (n: number) => String(n).padStart(2, "0");
		const d = new Date();
		const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
		const fname = `${nameGuess}_stepseq_${steps}stp_${bpm}bpm_${stamp}.wav`;

		// Download
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = fname;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 5000);

	} catch (err) {
		console.error("Export failed:", err);
		alert("Export failed. See console for details.");
	} finally {
		isExporting.value = false;
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
		if (instrument.type === 'synth' || instrument.isCustom) continue;
		const path = `audio/${instrument.name}.mp3`;
		try {
			instrument.buffer = await loadSample(path);
		} catch (err) {
			console.warn(`Sample load failed for ${instrument.name}:`, err);
		}
	}
}

function hueFor(hz: number, lo = MIN_PAD_HZ, hi = MAX_PAD_HZ) {
	const t = Math.min(1, Math.max(0, (hz - lo) / (hi - lo)));
	return Math.round(220 * (1 - t)); // blue→red
}

function getPadStyle(instrument: any, index: number) {
	if (!instrument.steps[index]) return { '--pad-on': 0 };

	const pct = Math.round(instrument.velocities[index] * 100);
	const hue = instrument.pitches ? hueFor(instrument.pitches[index] || MIN_PAD_HZ)
		: 210;
	return { '--vol': pct, '--heat-h': hue, '--pad-on': 1 };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

// SAVING BEGIN

// Turning settings into a project snapshot and back, and factory defaults, are in
// src/lib/project/snapshot.ts; keeping them in step with the project store (and File → New)
// is in src/composables/useProjectSync.ts.

// File → New: every saved setting back to its factory default, plus the parts of the screen
// that aren't saved
function resetUiToFactoryDefaults() {
	hardStopSequencer();

	resetToFactoryDefaults(projectState);

	showVelocity.value = false;
	showPitch.value = false;

	// Close any open menus/popovers
	fxAdvanced.open = false;
	stepsAdvanced.open = false;
	closeOverlays?.();

	// Force-reset components that hold local state (e.g., Melody Maker)
	resetNonce.value++;
}

const { project } = useProjectSync({
	settings: projectState,
	buildSnapshot: () => buildSnapshot(projectState),
	applySnapshot: (s) => applySnapshot(projectState, s),
	resetUiToFactoryDefaults,
});

// Undo/redo of settings changes (Ctrl/Cmd+Z and the buttons in ProjectControls); see
// src/composables/useUndoHistory.ts
const { canUndo, canRedo, undo, redo } = useUndoHistory({
	buildSnapshot: () => buildSnapshot(projectState),
	applySnapshot: (s) => applySnapshot(projectState, s),
});

// SAVING END
</script>

<style scoped>
.ds-grid {
	display: grid;
	gap: 12px;
	grid-template-columns: 1fr;
}

.pt-card .pt-section {
	margin-bottom: 8px;
}

.pt-card .pt-rule {
	margin: 10px 0;
}

@media (max-width: 768px) {
	.ds-modules {
		columns: auto;
	}

	.ds-modules .module {
		margin: 0 0 12px;
	}
}

/* lg: 8-col grid */
@media (min-width: 992px) {
	.ds-grid {
		grid-template-columns: repeat(8, minmax(0, 1fr));
		gap: 14px;
	}

	.ds-transport {
		grid-column: 1 / span 5;
	}

	.ds-steps {
		grid-column: 1 / span 5;
	}

	.ds-visualizer {
		grid-column: 6 / -1;
		grid-row: 1 / span 2;
		position: relative;
		align-self: start;
	}

	.ds-modules {
		column-width: 340px;
		column-gap: 14px;
		column-fill: balance;
		grid-column: 1 / -1;
	}

	.ds-modules .module {
		break-inside: avoid;
		display: inline-block;
		width: 100%;
		margin: 0 0 14px;
	}

	.ds-sequencer {
		grid-column: 1 / -1;
	}
}

/* xl: 12-col grid */
@media (min-width: 1280px) {
	.ds-grid {
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 16px;
	}

	.ds-transport {
		grid-column: 1 / span 9;
	}

	.ds-steps {
		grid-column: 1 / span 9;
	}

	.ds-visualizer {
		grid-column: 10 / -1;
		grid-row: 1 / span 2;
		position: relative;
	}

	.pt-card,
	.pt-panel {
		padding: 10px 12px;
	}

	.pt-title {
		font-size: 14px;
		margin-bottom: .3rem;
	}

	.pt-btn {
		padding: 4px 8px;
		line-height: 1.1;
	}

	.pt-btn-group .pt-btn {
		min-height: 28px;
	}

	.pt-knob-row {
		gap: 10px;
	}
}

.ds-modules .module>.pt-card,
.ds-modules .module>* {
	height: auto;
	display: block;
}

.pt-card,
.pt-panel {
	padding: 12px 14px;
}

.pt-title {
	margin: 0 0 .35rem;
}

.nac-wrap {
	margin-top: 0;
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

.ds-visualizer {
	overflow: hidden;
	align-self: start;
}

/* OVERRIDES */
@media (min-width: 992px) {
	.ds-visualizer {
		display: flex;
		min-height: 0;
	}

	.ds-visualizer .nac-wrap {
		flex: 1 1 auto;
		display: flex;
		min-height: 0;
	}

	.ds-visualizer :deep(.nac-screen),
	.ds-visualizer ::v-deep(.nac-screen) {
		display: grid;
		grid-template-rows: auto 1fr auto;
		width: 100%;
		height: 100%;
		min-height: 0;
	}

	.ds-visualizer :deep(.nac-screen__lcd),
	.ds-visualizer ::v-deep(.nac-screen__lcd) {
		height: auto !important;
		min-height: 0;
	}
}

@media (min-width: 1280px) {
	.ds-transport {
		grid-column: 1 / span 8 !important;
	}

	.ds-steps {
		grid-column: 1 / span 8 !important;
	}

	.ds-visualizer {
		grid-column: 9 / -1 !important;
		grid-row: 1 / span 2 !important;
		position: relative;
		align-self: start;
	}

	.ds-modules {
		display: grid !important;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 16px;
		column-width: auto !important;
		column-gap: 0 !important;
	}

	.ds-sequencer {
		grid-column: 10 / span 3 !important;
	}
}

@media (min-width: 992px) {
	.ds-visualizer {
		display: flex;
		align-items: stretch;
		position: relative;
	}

	.ds-visualizer .nac-wrap {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
	}

	.ds-visualizer .nac-wrap>* {
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
	}

	.ds-visualizer :deep([class*="lcd"]) {
		flex: 1 1 auto;
		min-height: 0;
		height: auto !important;
	}

	.ds-visualizer :deep(canvas) {
		display: block;
		width: 100%;
		height: 100% !important;
	}
}

@media (min-width: 992px) {
	.ds-modules {
		display: block !important;
		column-width: 340px !important;
		column-gap: 14px !important;
		column-fill: balance !important;
	}

	.ds-modules .module {
		display: inline-block !important;
		width: 100% !important;
		margin: 0 0 14px !important;
		break-inside: avoid !important;
	}

	.ds-sequencer {
		grid-column: 1 / -1 !important;
	}
}

@media (min-width: 1280px) {
	.ds-modules {
		display: block !important;
		column-width: 360px !important;
		column-gap: 16px !important;
	}

	.ds-sequencer {
		grid-column: 1 / -1 !important;
	}
}

@media (min-width: 992px) {
	.ds-visualizer {
		align-self: stretch !important;
		position: relative;
		display: flex;
		min-height: 0;
		z-index: 999;
	}

	.ds-visualizer .nac-wrap {
		display: flex;
		height: 100%;
		min-height: 0;
		width: 100%;
	}

	.ds-visualizer :deep(.nac-screen) {
		display: grid !important;
		grid-template-rows: 1fr auto;
		height: 100%;
		min-height: 0;
		width: 100%;
	}

	.ds-visualizer :deep(.nac-screen__lcd) {
		height: 100% !important;
		aspect-ratio: auto !important;
		min-height: 0;
	}

	.ds-visualizer :deep(.nac-screen__lcd canvas) {
		width: 100%;
		height: 100% !important;
		display: block;
	}

	.ds-visualizer :deep(.nac-screen__fkeys) {
		display: grid !important;
		grid-template-columns: repeat(4, 1fr);
		gap: .4rem;
		padding: 0 .75rem;
	}
}

.gen-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	margin: 4px 0 0;
}

.gen-divider {
	margin: 10px 0 12px;
}

.gen-panel {
	min-width: 0;
}

.noise-inline {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}

.pt-dot {
	width: 14px;
	height: 14px;
	border-radius: 999px;
	border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 45%);
	background: var(--pt-surface-2);
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05);
	cursor: pointer;
	transition: transform .12s ease, filter .2s ease, box-shadow .25s ease;
}

.pt-dot:hover {
	transform: scale(1.06);
}

.pt-dot.is-on {
	background: hsl(var(--pt-accent) 80% 60%);
	box-shadow: 0 0 0 3px hsl(var(--pt-accent) 90% 60% / .18), 0 0 12px var(--pt-btn-glow);
}

.noise-panel :deep(.pt-section-title),
.noise-panel :deep(.pt-title),
.noise-panel :deep(.group-title) {
	display: none !important;
}

.noise-inline :deep(.pt-subblock),
.noise-inline :deep(.pt-section) {
	margin: 0;
	padding: 0;
}

.gen-divider {
	margin: 10px 0 12px;
}

.osc-panel .pt-btn-group {
	margin-top: 6px;
}

.noise-inline {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}

.noise-inline> :not(.pt-dot) {
	flex: 1 1 auto;
	width: auto !important;
	min-width: 0;
}

.noise-panel :deep(.knob-group),
.noise-panel :deep(.pt-subblock),
.noise-panel :deep(.pt-section) {
	width: auto !important;
	padding: 0 !important;
	margin: 0 !important;
	align-items: center;
	min-width: 0;
}

.noise-panel :deep(.knob-group-header),
.noise-panel :deep(.group-title),
.noise-panel :deep(.pt-section-title),
.noise-panel :deep(.pt-title) {
	display: none !important;
}

.module.noise .noise-tv-bg {
	position: relative;
}

.noise-ribbon {
	--noise-ribbon-accent: #9C27B0;
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	width: 40px;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 8px 0;
	border: 0;
	cursor: pointer;
	background: linear-gradient(180deg, color-mix(in oklab, var(--pt-surface-3, #26263a), transparent 0%), color-mix(in oklab, var(--pt-surface-1, #151522), transparent 0%));
	color: color-mix(in oklab, var(--pt-text, #e5e9ff), transparent 20%);
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.7);
	z-index: 2;
	isolation: isolate;
	transition: background-color 140ms ease, box-shadow 140ms ease, color 140ms ease, filter 120ms ease;
}

.noise-ribbon.is-on {
	background: linear-gradient(180deg, color-mix(in oklab, var(--noise-ribbon-accent), black 6%), color-mix(in oklab, var(--noise-ribbon-accent), black 20%));
	color: #fff;
	box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.85), 0 0 16px var(--pt-btn-glow, rgba(156, 39, 176, 0.65));
}

.noise-ribbon:hover {
	filter: brightness(1.05) contrast(1.02);
}

.noise-ribbon-label {
	writing-mode: vertical-rl;
	text-orientation: mixed;
	text-transform: uppercase;
	letter-spacing: 0.14em;
	font-size: 11px;
	font-weight: 600;
	transform: rotate(180deg);
}

.module.noise .noise-panel {
	padding-left: 35px;
}

.pt-dot {
	width: 14px;
	height: 14px;
	border-radius: 999px;
	border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 45%);
	background: var(--pt-surface-2);
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05);
	cursor: pointer;
	transition: transform .12s ease, filter .2s ease, box-shadow .25s ease;
}

.pt-dot:hover {
	transform: scale(1.06);
}

.pt-dot.is-on {
	background: hsl(var(--pt-accent) 80% 60%);
	box-shadow: 0 0 0 3px hsl(var(--pt-accent) 90% 60% / .18), 0 0 12px var(--pt-btn-glow);
}

.step-toolbar {
	margin-top: 4px;
	margin-bottom: 6px;
	align-items: center;
	gap: 8px;
}

.step-toolbar .pt-seg-btn {
	min-height: 26px;
}

.step-toolbar .step-dot {
	opacity: .4;
	margin: 0 2px;
}

.ds-steps {
	position: relative;
}

.step-menu-anchor {
	position: relative;
}

.pt-menu-title {
	font-weight: 600;
	padding: 6px 10px;
	opacity: .9;
}

.pt-menu .pt-option.is-disabled {
	opacity: .5;
	pointer-events: none;
}

/* One tile per cell; the Pulse cell also holds the width knob in the tile's top-left corner
   (the dice badge is top-right) */
.wave-cell {
	position: relative;
	width: 100%;
	max-width: 84px;
}

.pulse-width-knob {
	position: absolute;
	top: 2px;
	left: 3px;
	z-index: 3;
}

.pulse-width-knob .custom-tooltip {
	white-space: nowrap;
	/* open to the right: the knob sits at the panel's left edge */
	left: 0;
	right: auto;
	transform: none;
}

.wave-row {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 8px;
	justify-items: center;
}

/* Eight tiles in two rows: smaller than the four used to be */
.wave-row :deep(.wave-btn) {
	--w: 100%;
	max-width: 84px;
	padding: 4px 4px 5px;
}

.wave-row :deep(.wave-svg) {
	width: 44px;
	height: 44px;
}

.wave-row :deep(.wave-label) {
	font-size: .62rem;
}

.wave-row :deep(.dice-badge) {
	top: 3px;
	right: 3px;
	width: 18px;
	height: 18px;
}

.wave-row :deep(.dice-badge svg) {
	width: 16px;
	height: 16px;
}

@media (min-width: 992px) {
	.ds-modules {
		display: block !important;
		column-width: 340px;
		column-gap: 14px;
		column-fill: balance;
		grid-column: 1 / -1;
	}

	.ds-modules .module {
		display: inline-block;
		width: 100%;
		margin: 0 0 14px;
		break-inside: avoid;
	}
}

@media (min-width: 1280px) {
	.ds-modules {
		column-width: 360px;
		column-gap: 16px;
	}
}

.mm-menu {
	position: absolute;
	min-width: 330px;
	border-radius: 12px;
	box-shadow: 0 12px 40px rgb(0 0 0 / .45);
	padding: 10px;
	z-index: 2001;
	background: var(--pt-panel);
	color: var(--pt-text);
	border: 1px solid var(--pt-hairline);
}

.mm-menu-title {
	font-weight: 700;
	color: #c7cee0;
	opacity: .9;
	padding: 8px 8px 6px;
}



.mm-opt {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 8px;
	border-radius: 8px;
}

.mm-opt:hover {
	background: rgba(255, 255, 255, .04);
	cursor: pointer;
}

.mm-reset {
	text-align: center;
	color: #c7cee0;
	opacity: .9;
	padding: 10px 8px 4px;
	cursor: pointer;
}

.mm-switch {
	--sw: 38px;
	--kn: 18px;
	width: var(--sw);
	height: 22px;
	border-radius: 999px;
	background: var(--pt-surface-2);
	border: 1px solid var(--pt-hairline);
	position: relative;
	cursor: pointer;
}

.mm-switch .kn {
	position: absolute;
	top: 50%;
	left: 2px;
	transform: translateY(-50%);
	width: var(--kn);
	height: var(--kn);
	border-radius: 999px;
	background: #fff;
	box-shadow: 0 2px 8px rgb(0 0 0 / .35);
}

.mm-switch.on {
	background: linear-gradient(180deg, hsl(var(--pt-accent) 80% 60%), hsl(var(--pt-accent-2, var(--pt-accent)) 80% 60%));
}

.mm-switch.on .kn {
	left: calc(100% - var(--kn) - 2px);
}

.mm-menu.is-local {
	left: calc(100% + 8px);
	top: 0;
	right: auto;
	bottom: auto;
}

.mm-overlay {
	position: fixed;
	inset: 0;
	z-index: 2000;
}

/* Step Sequencer header: the Velocity routing button, and the panel opens under the header */
.step-sequencer-subheader .channel-caption {
	position: relative;
}

.vel-btn {
	padding: 2px 8px;
	border-radius: 999px;
	border: 1px solid rgba(255, 255, 255, 0.16);
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 10px;
	line-height: 1.4;
	letter-spacing: 0.06em;
	opacity: 0.7;
	cursor: pointer;
	white-space: nowrap;
}

.vel-btn.on {
	opacity: 1;
	border-color: hsl(var(--pt-accent) 80% 62% / 0.9);
	background: hsl(var(--pt-accent) 80% 60% / 0.18);
}

.vel-btn:focus-visible {
	outline: 2px solid hsl(var(--pt-accent) 80% 62%);
	outline-offset: 2px;
}

@media (max-width: 768px) {
	.mm-menu {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: calc(100vw - 32px);
		/* 16px padding on each side */
		max-width: 360px;
		max-height: 80vh;
		overflow-y: auto;
		right: auto;
		bottom: auto;
	}

	/* Override the "anchor to right" behavior just for mobile */
	.mm-menu.is-local {
		left: 50%;
		top: 50%;
		right: auto;
		bottom: auto;
	}
}


.fx-adv-anchor {
	position: relative;
}

.nac-screen__lcd>canvas {
	image-rendering: pixelated;
}

/* PLAY BUTTON BEGIN */

.pt-btn.btn3d {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 78px;
	min-height: 58px;
	padding: 0;
	border: 0;
	border-radius: 12px;

	--btn3d-h: var(--pt-accent, 210);
	--btn3d-h2: var(--pt-accent-2, var(--btn3d-h));
	--btn3d-top: hsl(var(--btn3d-h) 78% 66%);
	--btn3d-mid: hsl(var(--btn3d-h2) 82% 58%);
	--btn3d-bot: hsl(var(--btn3d-h2) 90% 46%);

	background: radial-gradient(circle at 30% 20%,
			color-mix(in oklab, var(--btn3d-top), white 16%) 0,
			var(--btn3d-top) 38%,
			var(--btn3d-mid) 80%,
			var(--btn3d-bot) 100%);
	color: #fff;
	box-shadow:
		0 10px 24px rgba(0, 0, 0, 0.55),
		0 0 0 1px rgba(0, 0, 0, 0.75),
		inset 0 1px 0 rgba(255, 255, 255, 0.28);

	cursor: pointer;
	box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.85), inset 0 2px 6px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.35);
	transition:
		transform 120ms ease,
		filter 140ms ease,
		background 160ms ease;
}

.pt-btn.btn3d::before {
	content: "";
	position: absolute;
	inset: 3px;
	border-radius: inherit;
	background:
		radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.55), transparent 55%),
		linear-gradient(180deg,
			color-mix(in oklab, #ffffff, rgba(0, 0, 0, 0.35) 38%),
			color-mix(in oklab, #b9c0d5, rgba(0, 0, 0, 0.6) 80%));
	mix-blend-mode: screen;
	opacity: 0.26;
	pointer-events: none;
	transition: opacity 160ms ease;
}

.pt-btn.btn3d .btn-face {
	position: relative;
	z-index: 1;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 14px 20px;
	line-height: 1;
}

.pt-btn.btn3d svg {
	width: 2.2em;
	height: 2.2em;
	fill: currentColor;
}

.pt-btn.btn3d:active {
	transform: translateY(1px);
	box-shadow:
		0 8px 18px rgba(0, 0, 0, 0.6),
		0 0 0 1px rgba(0, 0, 0, 0.85),
		inset 0 2px 4px rgba(0, 0, 0, 0.45);
	filter: brightness(0.98);
}

.pt-btn.btn3d:focus {
	outline: none;
}

.pt-btn.btn3d:focus-visible {
	outline: 2px solid #fff;
	outline-offset: 3px;
}

.pt-btn.btn3d[aria-pressed="true"] {
	box-shadow:
		0 10px 24px rgba(0, 0, 0, 0.6),
		0 0 0 1px rgba(0, 0, 0, 0.85),
		inset 0 2px 6px rgba(0, 0, 0, 0.6),
		inset 0 1px 0 rgba(255, 255, 255, 0.35);
	filter: saturate(1.1) brightness(1.02);
}

.pt-btn.btn3d[aria-pressed="true"] .btn-face {
	background: radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.18), transparent 60%);
	border-radius: inherit;
}

/* PLAY BUTTON END */

.tempo-wrap {
	display: inline-flex;
	flex-direction: column;
	align-items: center;
}

.tempo-stepper {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-top: 2px;
	user-select: none;
}

.stepper-btn {
	min-width: 26px;
	border-radius: 8px;
	border: 1px solid var(--pt-hairline, #2a2f3a);
	background: var(--pt-surface-2, #1c202b);
	color: var(--pt-text, #e9e9ef);
	line-height: 1;
	font-weight: 700;
	cursor: pointer;
}

.stepper-value {
	min-width: 42px;
	padding: 2px 8px;
	border-radius: 8px;
	border: 1px solid var(--pt-hairline, #2a2f3a);
	background: var(--pt-surface-1, #232733);
	color: var(--pt-text, #e9e9ef);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
	font-weight: 700;
	font-size: 13px;
	line-height: 1.2;
	text-align: center;
}

.knob-wrap {
	display: inline-flex;
	flex-direction: column;
	align-items: center;
}

.knob-wrap .stepper-value {
	font-variant-numeric: tabular-nums;
	min-width: 42px;
}

.module.pitch :deep(.knob-group.pitch-col) {
	margin-top: 0;
	width: 50%;
	display: inline-block;
	vertical-align: top;
}

@media (max-width: 900px) {
	.module.pitch :deep(.knob-group.pitch-col) {
		width: 100%;
		display: block;
	}
}

.module.noise .noise-tv-bg {
	border-radius: var(--pt-card-radius, 12px);
	overflow: hidden;
}

.module.noise .noise-tv-bg>*:not(.noise-overlay) {
	z-index: 1;
}

.module.noise .noise-overlay {
	position: absolute;
	inset: 0;
	border-radius: inherit;
	z-index: 0;
	pointer-events: none;
	--grain-unit: 8px;
	--grain-alpha: var(--noise-alpha, 0.24);
	background: linear-gradient(135deg, color-mix(in oklab, var(--noise-tint, #3ec2cc), transparent calc(100% - (var(--grain-alpha) * 100%))) 0%, transparent 60%), repeating-linear-gradient(0deg, color-mix(in oklab, var(--noise-tint, #3ec2cc), transparent 92%) 0px, color-mix(in oklab, var(--noise-tint, #3ec2cc), transparent 92%) 3px, transparent 6px, transparent 9px);
	background-size: auto, var(--grain-unit) var(--grain-unit);
	mix-blend-mode: screen;
	opacity: 1;
	background-position: 0 0, 0 0;
}

.module.noise .noise-overlay.mode-static {
	mix-blend-mode: screen;
}

.module.noise .noise-overlay.mode-static .grain {
	position: absolute;
	inset: 0;
	border-radius: inherit;
	background: radial-gradient(1px 1px at 20% 30%, color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent calc(100% - (var(--noise-alpha, .28) * 100%))) 40%, transparent 41%), radial-gradient(1px 1px at 60% 80%, color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent calc(100% - (var(--noise-alpha, .28) * 100%))) 45%, transparent 46%), radial-gradient(1px 1px at 80% 10%, color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent calc(100% - (var(--noise-alpha, .28) * 100%))) 35%, transparent 36%), repeating-conic-gradient(from 0deg, color-mix(in oklab, var(--noise-tint, #9bf3ff), transparent calc(100% - (var(--noise-alpha, .28) * 100%))) 0% 1%, transparent 1% 2%);
	background-size: 60px 60px, 90px 90px, 120px 120px, 6px 6px;
	animation: noise-pan calc(1000ms * (60 / var(--noise-speed, 60))) linear infinite;
	filter: contrast(110%) brightness(105%);
	opacity: 1;
}

/* Black “pepper” speckles */
.module.noise .noise-overlay .pepper {
	position: absolute;
	inset: 0;
	border-radius: inherit;
	pointer-events: none;
	mix-blend-mode: multiply;
	opacity: var(--pepper-alpha, 0.16);
	background: radial-gradient(1px 1px at 18% 22%, rgba(0, 0, 0, 0.85) 40%, transparent 41%), radial-gradient(1px 1px at 36% 76%, rgba(0, 0, 0, 0.85) 42%, transparent 43%), radial-gradient(1px 1px at 66% 48%, rgba(0, 0, 0, 0.85) 38%, transparent 39%), radial-gradient(1px 1px at 84% 16%, rgba(0, 0, 0, 0.85) 40%, transparent 41%), repeating-conic-gradient(from 0deg, rgba(0, 0, 0, 0.7) 0% 0.5%, transparent 0.5% 1.6%);
	background-size: 80px 80px, 110px 110px, 140px 140px, 170px 170px, var(--pepper-scale, 6px) var(--pepper-scale, 6px);
	animation: noise-shift var(--noise-anim-dur, 1s) steps(var(--noise-fps, 12)) infinite, noise-pan calc(1000ms * (60 / var(--noise-speed, 60))) linear infinite;
	filter: contrast(115%);
}

/* Animations */
@keyframes noise-shift {
	0% {
		transform: translate3d(0, 0, 0) scale(1.0);
	}

	25% {
		transform: translate3d(-1px, 1px, 0) scale(1.01);
	}

	50% {
		transform: translate3d(1px, -1px, 0) scale(0.99);
	}

	75% {
		transform: translate3d(0.5px, -0.5px, 0) scale(1.0);
	}

	100% {
		transform: translate3d(0, 0, 0) scale(1.0);
	}
}

@keyframes noise-pan {
	from {
		background-position: 0 0, 0 0, 0 0, 0 0;
	}

	to {
		background-position: 60px 30px, -40px 60px, 80px -30px, 12px -12px;
	}
}

.module.sound .sound-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	grid-template-areas: "env filter" "pitch filter";
	gap: 12px;
}

.module.sound .sound-grid> :nth-child(1) {
	grid-area: env;
}

.module.sound .sound-grid> :nth-child(2) {
	grid-area: filter;
}

.module.sound .sound-grid> :nth-child(3) {
	grid-area: pitch;
}

/* Filter: Cutoff and Resonance, then Env Amt and Decay below them */
.module.sound :deep(.filter-card .pt-knob-row) {
	display: grid;
	grid-template-columns: repeat(2, 40px);
	row-gap: 14px;
	column-gap: var(--pt-gap, 10px);
}

/* Narrow cards: the knobs take the card's whole width (pt-subblock is half width from 992px) */
.module.sound :deep(.pt-subblock) {
	width: 100%;
}

.module.sound :deep(.pt-card) {
	padding-left: 10px;
	padding-right: 10px;
}

.fx-pair {
	display: grid;
	grid-template-columns: 1fr 1fr 1fr;
	gap: 12px;
	align-items: start;
}

@media (max-width: 720px) {
	.fx-pair {
		grid-template-columns: 1fr;
	}
}

.generators .pt-btn {
	width: 100%;
}

.transport-row {
	display: flex;
	align-items: center;
	gap: 14px;
}

.transport-right {
	margin-left: auto;
	display: flex;
	align-items: center;
	gap: 18px;
}

.transport-logo {
	max-width: 130px;
	height: auto;
	display: block;
}

@media (max-width: 720px) {
	.transport-row {
		flex-wrap: wrap;
		row-gap: 10px;
		justify-content: space-evenly;
	}

	.transport-right {
		margin-left: 0;
		width: 100%;
		justify-content: space-evenly;
	}

	.drum-sequencer {
		background: none;
		box-shadow: none;
	}

	.module.sound .sound-grid {
		gap: 8px;
	}
}

</style>

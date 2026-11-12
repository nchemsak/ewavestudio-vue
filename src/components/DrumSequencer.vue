<template>
	<div class="drum-sequencer" :class="currentTheme" :style="padSizeStyle">
		<!-- PHONE START
			 Phone mode (usePhoneMode.ts): a phone held sideways gets its own layout instead of the
			 one below. Its Sound, FX and Key pages show the same panels again. -->
		<PhoneLayout v-if="phoneActive" :ctx="phoneCtx">
			<template #sound>
				<div class="pl-sound">
					<div class="pl-sound-row">
						<div class="module envelope">
							<SectionWrap id="pl-envelope" title="Envelope" :modelValue="true">
								<template #tools>
									<VelSwitch v-model="velocityRouting.decay.value" :name="VEL_SWITCHES.decay.label" :tip="VEL_SWITCHES.decay.tip"
									:note="velNote.key === 'decay' ? velNote.text : ''" @switched-on="onVelSwitchedOn('decay')" />
								</template>
								<EnvelopeModule :color="'#4CAF50'" :showToggle="false" v-model:enabled="envelopeEnabled"
									v-model:attackMs="ampEnvAttackMs" v-model:decayMs="ampEnvDecayMs" />
							</SectionWrap>
						</div>
						<div class="module pitch-env">
							<PitchEnvModule :enabled="pitchEnvEnabled" v-model:semitones="pitchEnvSemitones"
								v-model:decayMs="pitchEnvDecayMs" v-model:mode="pitchMode">
								<template #vel>
									<VelSwitch v-model="velocityRouting.pitchEnv.value" :name="VEL_SWITCHES.pitchEnv.label" :tip="VEL_SWITCHES.pitchEnv.tip" :disabled="!pitchEnvEnabled"
									:note="velNote.key === 'pitchEnv' ? velNote.text : ''" @switched-on="onVelSwitchedOn('pitchEnv')" />
								</template>
							</PitchEnvModule>
						</div>
						<div class="module filter">
							<SectionWrap class="filter-card" id="pl-filter" title="Filter" :modelValue="true">
								<template #tools>
									<VelSwitch v-model="velocityRouting.cutoff.value" :name="VEL_SWITCHES.cutoff.label" :tip="VEL_SWITCHES.cutoff.tip" :disabled="!filterEnabled"
									:note="velNote.key === 'cutoff' ? velNote.text : ''" @switched-on="onVelSwitchedOn('cutoff')" />
								</template>
								<FilterModule :color="'#FF5722'" :showToggle="false" v-model:enabled="filterEnabled"
									v-model:cutoff="filterCutoff" v-model:resonance="filterResonance"
									v-model:envAmount="filterEnvAmount" v-model:envDecayMs="filterEnvDecayMs" :lfoView="lfoView" />
							</SectionWrap>
						</div>
					</div>
					<div class="pl-sound-row">
						<section class="pt-card pl-waves" aria-label="Wave">
							<h2 class="pt-title">Wave</h2>
							<div class="pl-wave-grid">
								<button v-for="t in WAVE_TILES" :key="t.value" type="button" class="pt-btn"
									:aria-pressed="selectedWaveform === t.value" @click="applyWaveToAll(t.value)">{{ t.label }}</button>
							</div>
						</section>
						<section class="pt-card pl-gens" aria-label="Noise, FM and Unison">
							<div class="pl-gen">
								<button type="button" class="pt-btn" :aria-pressed="noiseEnabled" @click="noiseEnabled = !noiseEnabled">Noise</button>
								<Knob v-model="noiseAmount" label="Amount" aria-label="Noise amount" :min="0" :max="1" :step="0.01" size="small"
									:disabled="!noiseEnabled" :value-text="`${Math.round(noiseAmount * 100)}%`" />
							</div>
							<div class="pl-gen">
								<button type="button" class="pt-btn" :aria-pressed="fmEnabled" @click="fmEnabled = !fmEnabled">FM</button>
								<Knob v-model="fmIndex" label="Amount" aria-label="FM amount" :min="0" :max="50" :step="0.1" size="small"
									:disabled="!fmEnabled" :value-text="fmIndex.toFixed(1)" />
							</div>
							<div class="pl-gen">
								<button type="button" class="pt-btn" :aria-pressed="unisonEnabled" @click="unisonEnabled = !unisonEnabled">Unison</button>
								<Knob v-model="unisonVoices" label="Voices" aria-label="Unison voices" :min="UNISON_VOICES_MIN" :max="unisonMaxVoices" :step="1" size="small"
									:disabled="!unisonEnabled" :value-text="`${unisonVoices} voices`" />
							</div>
						</section>
					</div>
				</div>
			</template>
			<template #fx>
				<div class="fx-pair pl-fx">
					<DelayEffect :showToggle="false" :audioCtx="audioCtx" v-model:enabled="delayEnabled"
						:tempo="tempo" v-model:division="delayDivision" v-model:delayTime="delayTime"
						v-model:delayFeedback="delayFeedback"
						v-model:delayMix="delayMix" v-model:toneEnabled="delayToneEnabled"
						v-model:toneHz="delayToneHz" v-model:toneType="delayToneType" v-model:pingPong="delayPingPong" />
					<DriveEffect :showToggle="false" v-model:enabled="driveEnabled" :driveType="'overdrive'"
						v-model:driveAmount="driveAmount" v-model:driveTone="driveTone"
						v-model:driveMix="driveMix" v-model:crush="driveCrush" />
					<ReverbEffect :showToggle="true" :audioCtx="audioCtx" v-model:enabled="reverbEnabled"
						v-model:mix="reverbMix" v-model:decay="reverbDecay" v-model:tone="reverbTone" />
				</div>
			</template>
			<template #key>
				<div class="module melody pl-melody">
					<SectionWrap id="pl-melody" title="Melody Maker" :modelValue="true">
						<MelodyMaker :key="`pl-melody-${resetNonce}`" :frequencies="padFrequencies"
							:steps="steps" :min-freq="100" :max-freq="2000" :currentTheme="currentTheme"
							:initial-key-root="melodyUi.keyRoot" :initial-key-scale="melodyUi.keyScale"
							:initial-range-preset="melodyUi.rangePreset" :initial-arp-pattern="melodyUi.arpPattern"
							:initial-arp-rate="melodyUi.arpRate" :initial-arp-octaves="melodyUi.arpOctaves"
							:initial-arp-tones="melodyUi.arpTones" :initial-mode="melodyUi.mode"
							@update:frequencies="padFrequencies = $event" @update:steps="steps = $event"
							@octave-shift="octaveShiftAllSkip($event)"
							:queued-key="queuedKey" @key-chosen="onKeyChosen" @scale-chosen="onScaleChosen"
							@mode-change="(v) => { melodyUi.mode = v }"
							@key-root-change="(r) => { onKeyRootChange(r); melodyUi.keyRoot = r as any; }"
							@key-scale-change="(s) => { melodyUi.keyScale = s as any }"
							@range-preset-change="(p) => { melodyUi.rangePreset = p as any }"
							@arp-pattern-change="(v) => { melodyUi.arpPattern = v as any }"
							@arp-rate-change="(v) => { melodyUi.arpRate = v as any }"
							@arp-octaves-change="(v) => { melodyUi.arpOctaves = v as any }"
							@arp-tones-change="(v) => { melodyUi.arpTones = v as any }" />
					</SectionWrap>
				</div>
			</template>
		</PhoneLayout>
		<!-- PHONE END -->

		<!-- Top bar: the logo, then Save/Open/Import/Export and Undo/Redo. In phone mode the same
			 bar moves into the phone layout's menu (PhoneLayout.vue). It comes after the phone layout,
			 so the menu exists before the bar moves in, and its target changes with the mode, as a
			 Teleport looks its target up again only then (not when `disabled` changes). -->
		<Teleport defer :to="phoneActive ? '#phone-menu-slot' : 'body'" :disabled="!phoneActive">
			<section class="pt-card ds-topbar">
				<ProjectControls :exporting="isExporting" :can-undo="canUndo" :can-redo="canRedo"
					@export-audio="openExportDialog" @undo="undo" @redo="redo">
					<template #brand>
						<img class="topbar-logo" src="../assets/eWaveLogo1.png" alt="Ephemeral Wave">
					</template>
				</ProjectControls>
			</section>
		</Teleport>

		<!-- LAYOUT START
			 Laid out like one piece of hardware: the transport and the Step Sequencer, with the
			 screen beside them; under them Sound (three rows, each filled edge to edge) and Compose,
			 ending on one line. Under 1200 px, Sound, Effects and Compose are tabs under the steps
			 (data-tab says which one shows). -->
		<div v-show="!phoneActive" class="ds-grid" :data-tab="activeTab">

			<!-- Visualizer Screen -->
			<aside class="pt-card ds-visualizer">
				<div class="nac-wrap">
					<nacScreen ref="screen" :text="lcdText" :view="lcdView" :activeKey="activeFKey"
						@fkey="handleFKey" />
				</div>
			</aside>

			<!-- Transport: Volume, Tempo, Swing, then Sounds and Patterns side by side, then Play -->
			<section class="pt-card transport-card ds-transport">
				<div class="transport-row">
					<div class="transport-knobs">
						<!-- Volume -->
						<div class="position-relative text-center knob-wrap">
							<Knob midi-id="transport.volume" v-model="volume" label="Volume" :value-text="`${Math.round(volume * 100)}%`" :min="0" :max="1" :step="0.01" size="medium"
								:useThemeArc="true" @knobStart="activeKnob = 'volume'" @knobEnd="activeKnob = null" />
							<div class="stepper-value" aria-live="polite" :title="`${Math.round(volume * 100)}%`">
								{{ Math.round(volume * 100) }}%
							</div>
						</div>

						<!-- Tempo -->
						<div class="position-relative text-center tempo-wrap">
							<Knob midi-id="transport.tempo" v-model="tempo" label="Tempo" :min="20" :max="300" :step="1" size="medium"
								:detents="TEMPO_DETENTS"
								:useThemeArc="true" @knobStart="activeKnob = 'tempo'" @knobEnd="activeKnob = null" />
							<div class="tempo-stepper" role="group" aria-label="Tempo">
								<button class="stepper-btn" type="button" title="Tempo −1"
									@mousedown.prevent="startTempoRepeat(-1)" @touchstart.prevent="startTempoRepeat(-1)"
									@mouseup.prevent="stopTempoRepeat" @mouseleave="stopTempoRepeat">−</button>

								<div class="stepper-value" :class="{ 'on-stop': TEMPO_DETENTS.includes(tempo) }" aria-live="polite"
									:title="`${tempo} BPM`">{{ tempo }}</div>

								<button class="stepper-btn" type="button" title="Tempo +1"
									@mousedown.prevent="startTempoRepeat(1)" @touchstart.prevent="startTempoRepeat(1)"
									@mouseup.prevent="stopTempoRepeat" @mouseleave="stopTempoRepeat">+</button>
							</div>
						</div>

						<!-- Swing -->
						<div class="position-relative text-center knob-wrap">
							<Knob midi-id="transport.swing" v-model="swing" label="Swing" :value-text="swingText" :min="0" :max="0.5" :step="0.01" size="medium"
								:detents="SWING_DETENTS"
								:useThemeArc="true" @knobStart="activeKnob = 'swing'" @knobEnd="activeKnob = null" />
							<div class="stepper-value" :class="{ 'on-stop': SWING_DETENTS.includes(swing) }" aria-live="polite"
								:title="`${swingText} swing`">
								{{ Math.round(swing * 100) }}%
							</div>
						</div>
					</div>

					<!-- Sounds and Patterns, side by side: ready-made sounds (src/lib/presets/) and
						 patterns (src/lib/patterns/), each with a dice. Between the knobs and Play from
						 1200 px; a row of their own under them narrower. -->
					<div class="transport-presets">
						<PresetButtons title="Sound presets" dice-label="Random sound" :presets="PRESETS" :active="activePresetId"
							@choose="choosePreset" @random="rollRandomSound" />
						<PresetButtons title="Pattern presets" dice-label="Random pattern" :presets="PATTERNS"
							:active="activePatternId" @choose="choosePattern"
							@random="rollRandomPattern" />
					</div>

					<!-- Play (+ the MIDI fallback) -->
					<div class="transport-right">
						<button type="button" class="pt-btn btn-lg btn3d" data-keeps-pad-settings @click="onPlayClick"
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

						<Knob midi-id="synth.volume" v-model="synthInstrument.channelVolume" :min="0" :max="1" :step="0.01" size="small"
							label="Vol" aria-label="Synth volume"
							:value-text="`${Math.round(synthInstrument.channelVolume * 100)}%`" color="#8E44AD" @knobStart="activeKnob = `vol-${synthInstrument.name}`"
							@knobEnd="activeKnob = null" />
						<span v-if="activeKnob === `vol-${synthInstrument.name}`" class="custom-tooltip">
							{{ Math.round(synthInstrument.channelVolume * 100) }}%
						</span>

						<!-- The Repeats brush: pick ×2–×4, then click or drag across pads to give them that
						     many quick hits (a pad that has them already goes back to one) -->
						<div class="repeat-brush" role="group" aria-label="Repeats brush"
							title="Pick a number, then click or drag across pads to give them that many quick hits. Click a pad again for one hit; Esc or the lit button to stop.">
							<span class="repeat-brush__label" aria-hidden="true">Repeats</span>
							<button v-for="n in BRUSH_COUNTS" :key="n" type="button" class="vel-btn"
								:class="{ on: repeatBrush === n }" :aria-pressed="repeatBrush === n"
								:aria-label="`Repeats brush ×${n}`" @click="toggleRepeatBrush(n)">×{{ n }}</button>
						</div>
					</div>

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
							<div class="mm-opt" role="menuitem" @click.stop="clearRepeats()">
								<span>Clear Repeats</span>
							</div>
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
						:waveforms="(synthInstrument as any).waveforms" v-model:ratchets="synthInstrument.ratchets"
						:repeatNotes="synthInstrument.repeatNotes" :repeatBrush="repeatBrush"
						:defaultWave="selectedWaveform" :noiseMask="noiseMask"
						:noiseTint="noiseHexFromMorph(noiseColor)" noise-mode="static" :noise-alpha="0.32"
						:noise-fps="14" :noise-speed="40" :noise-enabled="noiseEnabled" :pepper-alpha="0.2"
						:pepper-scale="6" :lfoView="lfoView" @open-pad-settings="({ name, index, anchorRect }) =>
							openPadSettings(name, index, { currentTarget: { getBoundingClientRect: () => anchorRect } } as any)" />

				</div>
			</section>

			<!-- Tabs (under 1200 px): which of Sound, Effects and Compose shows -->
			<div class="ds-tabs" role="tablist" aria-label="Panels" @keydown="onTabKeydown">
				<button v-for="t in PANEL_TABS" :key="t.id" :id="`tab-${t.id}`" type="button" role="tab" class="ds-tab"
					:class="{ on: activeTab === t.id }" :aria-selected="activeTab === t.id"
					:aria-controls="t.panel" :tabindex="activeTab === t.id ? 0 : -1" @click="activeTab = t.id">
					{{ t.label }}
				</button>
			</div>

			<!-- Sound: three rows, each filled edge to edge -->
			<section id="sound-panel" class="ds-section ds-sound" aria-labelledby="sound-title">
				<h2 id="sound-title" class="ds-section-title">Sound</h2>

				<!-- Row 1: the waves, beside FM and Unison -->
				<div class="sound-row sound-row-1">
					<div class="module generators">
						<SectionWrap id="generators" title="" v-model="collapsibleState['generators']">
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
											<Knob midi-id="pulse.width" v-model="pulseWidth" label="Pulse Width" hideLabel size="mini"
												:min="PULSE_WIDTH_MIN" :max="PULSE_WIDTH_MAX" :step="1"
												:value-text="`${pulseWidth}%`" color="#ff7eb3"
												@knobStart="pulseWidthTip = true" @knobEnd="pulseWidthTip = false" />
											<span v-if="pulseWidthTip" class="custom-tooltip">Width {{ pulseWidth }}%</span>
										</div>
									</div>
								</div>
								<div class="pt-btn-group wave-random">
									<button class="pt-btn pt-btn-sm" :disabled="!randomPoolArray.length"
										:title="randomTooltip" @click="applyRandomWaves()">
										Random
									</button>
								</div>
							</div>
						</SectionWrap>
					</div>

					<div class="sound-stack">
						<!-- FM: its tile switches it on and off -->
						<div class="module fm">
							<SectionWrap id="fm" title="FM" v-model="collapsibleState['fm']">
								<FMModule :color="'#3F51B5'" :showToggle="false" v-model:enabled="fmEnabled"
									v-model:modFreq="fmModFreq" v-model:index="fmIndex" v-model:ratio="fmRatio" />
							</SectionWrap>
						</div>

						<!-- Unison: its tile switches it on and off -->
						<div class="module unison">
							<SectionWrap id="unison" title="Unison" v-model="collapsibleState['unison']">
								<UnisonEffect :showToggle="false" v-model:enabled="unisonEnabled" v-model:voices="unisonVoices"
									v-model:detune="detuneCents" v-model:spread="stereoSpread" />
							</SectionWrap>
						</div>
					</div>
				</div>

				<!-- Row 2: Envelope, Pitch and Filter, their knobs on one line -->
				<div class="sound-row sound-row-2">
					<div class="module envelope">
						<SectionWrap id="envelope" title="Envelope" v-model="collapsibleState['envelope']">
							<!-- VEL: a step's velocity also shapes Decay -->
							<template #tools>
								<VelSwitch v-model="velocityRouting.decay.value" :name="VEL_SWITCHES.decay.label" :tip="VEL_SWITCHES.decay.tip"
								:note="velNote.key === 'decay' ? velNote.text : ''" @switched-on="onVelSwitchedOn('decay')" />
							</template>
							<EnvelopeModule :color="'#4CAF50'" :showToggle="false" v-model:enabled="envelopeEnabled"
								v-model:attackMs="ampEnvAttackMs" v-model:decayMs="ampEnvDecayMs"
								@attack-knob-start="onEnvKnobStart" @attack-knob-end="onScreenKnobEnd"
								@decay-knob-start="onEnvKnobStart" @decay-knob-end="onScreenKnobEnd" />
						</SectionWrap>
					</div>

					<div class="module pitch-env">
						<PitchEnvModule :enabled="pitchEnvEnabled" v-model:semitones="pitchEnvSemitones"
							v-model:decayMs="pitchEnvDecayMs" v-model:mode="pitchMode">
							<template #vel>
								<VelSwitch v-model="velocityRouting.pitchEnv.value" :name="VEL_SWITCHES.pitchEnv.label" :tip="VEL_SWITCHES.pitchEnv.tip" :disabled="!pitchEnvEnabled"
								:note="velNote.key === 'pitchEnv' ? velNote.text : ''" @switched-on="onVelSwitchedOn('pitchEnv')" />
							</template>
						</PitchEnvModule>
					</div>

					<div class="module filter">
						<SectionWrap class="filter-card" id="filter" title="Filter" v-model="collapsibleState['filter']">
							<template #tools>
								<VelSwitch v-model="velocityRouting.cutoff.value" :name="VEL_SWITCHES.cutoff.label" :tip="VEL_SWITCHES.cutoff.tip" :disabled="!filterEnabled"
								:note="velNote.key === 'cutoff' ? velNote.text : ''" @switched-on="onVelSwitchedOn('cutoff')" />
							</template>
							<FilterModule :color="'#FF5722'" :showToggle="false" v-model:enabled="filterEnabled"
								v-model:cutoff="filterCutoff" v-model:resonance="filterResonance"
								v-model:envAmount="filterEnvAmount" v-model:envDecayMs="filterEnvDecayMs"
								:lfoView="lfoView" @knob-start="onFilterKnobStart" @knob-end="onScreenKnobEnd" />
						</SectionWrap>
					</div>
				</div>

				<!-- Row 3: Noise over the LFO, beside Effects (Effects is its own tab under 1200 px) -->
				<div class="sound-row sound-row-3">
					<div class="sound-stack">
						<div class="module noise">
							<div class="noise-tv-bg" :class="{ on: noiseEnabled }" :style="noiseModuleStyle">
								<!-- vertical ribbon toggle -->
								<button type="button" class="noise-ribbon" :class="{ 'is-on': noiseEnabled }"
									:aria-pressed="noiseEnabled" aria-label="Toggle noise"
									@click="noiseEnabled = !noiseEnabled">
									<span class="noise-ribbon-label">NOISE</span>
								</button>

								<!-- VEL, in the card's top-right corner (the card has no header) -->
								<div class="noise-vel">
									<VelSwitch v-model="velocityRouting.noise.value" :name="VEL_SWITCHES.noise.label" :tip="VEL_SWITCHES.noise.tip" :disabled="!noiseEnabled"
									:note="velNote.key === 'noise' ? velNote.text : ''" @switched-on="onVelSwitchedOn('noise')" />
								</div>

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
					</div>

					<div id="effects-panel" class="module fx">
						<SectionWrap id="fx" title="Effects" v-model="collapsibleState['fx']">
							<div class="fx-pair">
								<DelayEffect :showToggle="false" :audioCtx="audioCtx" v-model:enabled="delayEnabled"
									:tempo="tempo" v-model:division="delayDivision" v-model:delayTime="delayTime"
									v-model:delayFeedback="delayFeedback"
									v-model:delayMix="delayMix" v-model:toneEnabled="delayToneEnabled"
									v-model:toneHz="delayToneHz" v-model:toneType="delayToneType" v-model:pingPong="delayPingPong" />
								<DriveEffect :showToggle="false" v-model:enabled="driveEnabled" :driveType="'overdrive'"
									v-model:driveAmount="driveAmount" v-model:driveTone="driveTone"
									v-model:driveMix="driveMix" v-model:crush="driveCrush" />
								<ReverbEffect :showToggle="true" :audioCtx="audioCtx" v-model:enabled="reverbEnabled"
									v-model:mix="reverbMix" v-model:decay="reverbDecay" v-model:tone="reverbTone" />
							</div>
						</SectionWrap>
					</div>
				</div>
			</section>

			<!-- Compose: Pattern Tools and Melody Maker -->
			<section id="compose-panel" class="ds-section ds-compose" aria-labelledby="compose-title">
				<h2 id="compose-title" class="ds-section-title">Compose</h2>

				<div class="module pattern-tools">
					<SectionWrap id="pattern-tools" title="Pattern Tools" v-model="collapsibleState['pattern-tools']">
						<PatternTools :steps="steps" :velocities="velocities" :currentTheme="currentTheme" :nudge="humanizeNudge"
							@update:steps="steps = $event" @update:velocities="velocities = $event"
							@octave-shift="onPatternOctaveShift" />
					</SectionWrap>
				</div>

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
							:initial-arp-tones="melodyUi.arpTones" :initial-mode="melodyUi.mode"
							@update:frequencies="padFrequencies = $event" @update:steps="steps = $event"
							@octave-shift="octaveShiftAllSkip($event)"
							:queued-key="queuedKey" @key-chosen="onKeyChosen" @scale-chosen="onScaleChosen"
							@mode-change="(v) => { melodyUi.mode = v }"
							@key-root-change="(r) => { onKeyRootChange(r); melodyUi.keyRoot = r as any; }"
							@key-scale-change="(s) => { melodyUi.keyScale = s as any }"
							@range-preset-change="(p) => { melodyUi.rangePreset = p as any }"
							@arp-pattern-change="(v) => { melodyUi.arpPattern = v as any }"
							@arp-rate-change="(v) => { melodyUi.arpRate = v as any }"
							@arp-octaves-change="(v) => { melodyUi.arpOctaves = v as any }"
							@arp-tones-change="(v) => { melodyUi.arpTones = v as any }" />
					</SectionWrap>
				</div>
			</section>
			<!-- LAYOUT END -->

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
		<!-- File → Export audio… (src/audio/export/exportFiles.ts makes the files) -->
		<ExportDialog :open="exportOpen" :options="exportOptions" :notes="oneShotNotes" :bpm="tempo"
			:effectsOn="exportEffectsOn" :busy="isExporting" :progress="exportProgress" :simple="phoneActive"
			@export="runExport" @close="exportOpen = false" />
		<PadSettingsPopover :key="padSettings.name ? `${padSettings.name}-${padSettings.index}` : 'pad-popover'"
			v-model:open="padPopover.open" v-model:hz="currentPadHz" v-model:wave="currentPadWave"
			v-model:noiseEnabled="padNoiseEnabled" v-model:ratchet="currentPadRatchet" v-model:repeatNotes="currentPadRepeatNotes" :minHz="MIN_PAD_HZ" :maxHz="MAX_PAD_HZ"
			:anchorRect="padPopover.anchorRect" :title="padPopover.title" @audition="hz => auditionPad(padSettings.index, hz)" />
	</div>
</template>

<script setup lang="ts">
// IMPORTS START
import { ref, reactive, watch, onMounted, onBeforeUnmount, nextTick, computed, markRaw, shallowRef } from 'vue';
import Knob from './Knob.vue';
import DelayEffect from './modules/DelayEffect.vue';
import { DEFAULT_DELAY_DIVISION, DEFAULT_DELAY_TIME, DEFAULT_TEMPO, followDelaySync } from '../lib/delaySync';
import { TEMPO_DETENTS, SWING_DETENTS, TRIPLET_SWING } from '../lib/knobDetents';
import { shortestInterval, transposePitches, remapScale, nearestRootHz, patternCenterHz, chordPitchClasses } from '../lib/melody/theory';
import DriveEffect from './modules/DriveEffect.vue';
import UnisonEffect from './modules/UnisonEffect.vue';
import LFOGroup from './modules/LFOGroup.vue';
import nacScreen from './Screen.vue';
import { startFilterView } from './filterView';
import PitchEnvModule from './modules/PitchEnvModule.vue';
import PhoneLayout from './PhoneLayout.vue';
import { usePhoneMode } from '../composables/usePhoneMode';
import FMModule from './modules/FMModule.vue';
import FilterModule from './modules/FilterModule.vue';
import EnvelopeModule from './modules/EnvelopeModule.vue';
import NoiseModule from './modules/NoiseModule.vue';
import PadSettingsPopover from './PadSettingsPopover.vue';
import PatternTools from './PatternTools.vue';
import SynthStepGrid from './SynthStepGrid.vue'
import SectionWrap from './SectionWrap.vue';
import WaveButton from './WaveButton.vue'
import VelSwitch from './VelSwitch.vue';
import { VELOCITY_FAN, routeVelocity } from '../audio/velocity';
import { clampRatchet, ratchetHits, ratchetPitches, clampRepeatNotes, type RepeatNotes } from '../audio/ratchet';
import { UNISON_DETUNE_DEFAULT, UNISON_SPREAD_DEFAULT, UNISON_VOICES_DEFAULT, UNISON_VOICES_MAX, UNISON_VOICES_MIN } from '../audio/unison';
import { PULSE_WIDTH_DEFAULT, PULSE_WIDTH_MIN, PULSE_WIDTH_MAX, WAVE_IDS, WAVE_LABELS } from '../audio/waves';
import MelodyMaker from './MelodyMaker.vue';
import MidiToolbar from './MidiToolbar.vue';
import { useMidiInput } from '../composables/useMidiInput';
import { useMidiLearn } from '../composables/useMidiLearn';

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
	resetSoundToFactoryDefaults,
} from '../lib/project/snapshot';
import { useProjectSync } from '../composables/useProjectSync';
import { useUndoHistory } from '../composables/useUndoHistory';

// WAV Export
import type { StepSequencerState } from '../audio/export/scheduleStepSequencer';

// Reverb
import ReverbEffect from './modules/ReverbEffect.vue';

// Live sound engine
import { useLiveEngine } from '../audio/liveEngine';
import { useLfoVisual } from '../composables/useLfoVisual';
import PresetButtons from './PresetButtons.vue';
import ExportDialog from './ExportDialog.vue';
import { buildExportFiles, DEFAULT_EXPORT_OPTIONS, type ExportOptions } from '../audio/export/exportFiles';
import { midiNoteOf, midiToHz, notesInRange } from '../lib/export/midi';
import { exportNames, keyLabel } from '../lib/export/names';
import { zipFiles } from '../lib/export/zip';
import { PRESETS } from '../lib/presets/library';
import { applyPreset, soundKey } from '../lib/presets/presets';
import { randomPreset } from '../lib/presets/random';
import { PATTERNS } from '../lib/patterns/library';
import { applyPattern, patternKey } from '../lib/patterns/patterns';
import { padHue, spectrumColour, spectrumHue } from '../lib/padColour';
import { randomPattern } from '../lib/patterns/random';
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

// Unison voices: 2–4 (src/audio/unison.ts), 3 at most on a small screen
const unisonMaxVoices = computed(() => (isMobile.value ? 3 : UNISON_VOICES_MAX));

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
	mode: 'random',
});

// The key's chord (pitch classes), which a pad's Up or Down repeats step through
// (src/audio/ratchet.ts, ratchetPitches): the Melody Maker's key and scale, as its arpeggio's
// Chord tones
const repeatChord = computed(() => chordPitchClasses(melodyUi.keyRoot, melodyUi.keyScale));

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
		if (inst.ratchets) inst.ratchets = resize(inst.ratchets, 1);
		if (inst.repeatNotes) inst.repeatNotes = resize(inst.repeatNotes, 'same');
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
const fxAnchor = ref<HTMLElement | null>(null);

function onFxEsc(e: KeyboardEvent) {
	if (e.key === 'Escape') {
		// Esc puts the Repeats brush down, unless it's closing a pad's settings first
		if (repeatBrush.value && !padPopover.value.open) repeatBrush.value = null;
		if (fxAdvanced.open) fxAdvanced.open = false;
		if (stepsAdvanced.open) stepsAdvanced.open = false;
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

// The Repeats brush (Step Sequencer header): while set, clicking or dragging across pads gives
// them that many hits (SynthStepGrid). Not saved; File → New puts it down.
const BRUSH_COUNTS = [2, 3, 4] as const;
const repeatBrush = ref<number | null>(null);
function toggleRepeatBrush(n: number) {
	repeatBrush.value = repeatBrush.value === n ? null : n;
}

// Every pad back to one hit (the Step Sequencer's ⋯ menu); one undo step
function clearRepeats() {
	const inst = synthInstrument.value;
	if (inst?.ratchets) inst.ratchets = inst.ratchets.map(() => 1);
	if (inst?.repeatNotes) inst.repeatNotes = inst.repeatNotes.map(() => 'same');
	stepsAdvanced.open = false;
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
	inst.ratchets = Array(len).fill(1);
	inst.repeatNotes = Array(len).fill('same');

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
	'fm',
	'unison',
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
	'fm': undefined,
	'unison': undefined,
	'mod': undefined,
	'fx': undefined,
});

const allOpen = computed(() => collapseIds.every(id => collapsibleState[id] === true));
const allClosed = computed(() => collapseIds.every(id => collapsibleState[id] === false));

//Collapsible Cards END

// Panel tabs START
// Under 1200 px, Sound, Effects and Compose are tabs under the Step Sequencer; the grid's
// data-tab says which shows (from 1200 px all three show and the tabs are hidden). Not saved.
type PanelTab = 'sound' | 'fx' | 'compose';
const PANEL_TABS: { id: PanelTab; label: string; panel: string }[] = [
	{ id: 'sound', label: 'Sound', panel: 'sound-panel' },
	{ id: 'fx', label: 'Effects', panel: 'effects-panel' },
	{ id: 'compose', label: 'Compose', panel: 'compose-panel' },
];
const activeTab = ref<PanelTab>('sound');

// Left/Right (and Home/End) move between the tabs, as in any tab list
function onTabKeydown(e: KeyboardEvent) {
	const i = PANEL_TABS.findIndex(t => t.id === activeTab.value);
	const next = e.key === 'ArrowRight' ? (i + 1) % PANEL_TABS.length
		: e.key === 'ArrowLeft' ? (i + PANEL_TABS.length - 1) % PANEL_TABS.length
			: e.key === 'Home' ? 0 : e.key === 'End' ? PANEL_TABS.length - 1 : -1;
	if (next < 0) return;
	e.preventDefault();
	activeTab.value = PANEL_TABS[next].id;
	nextTick(() => document.getElementById(`tab-${PANEL_TABS[next].id}`)?.focus());
}
// Panel tabs END

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

// Shows a view for a moment, as a knob turned and let go would (a VEL switch turned on)
function flashScreen(view: typeof lcdView.value, fkey: number) {
	holdScreen(view, fkey);
	setTimeout(onScreenKnobEnd, VEL_FLASH_MS);
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

	// The colours: each frequency in the colour its pad would have, brighter when louder
	// (src/lib/padColour.ts), so a note shows in its pad's colour. 'loudness' brings back the
	// theme's four loudness colours (--nac-spec-low/mid/high/peak in Screen.vue).
	const SPEC_COLOURS = 'note' as 'note' | 'loudness';
	const binHz = audioCtx.sampleRate / analyser.fftSize;
	// The theme's screen is light (the light theme): louder notes are darker there
	const isLightScreen = (bg: string) => {
		const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bg);
		if (!m) return false;
		const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
		return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
	};
	// One colour string per hue and level step, made once
	const noteColours = new Map<string, string>();
	const colorFor = (v: number, bin: number, t = theme): string => {
		if (SPEC_COLOURS === 'loudness') return v < 64 ? t.low : v < 128 ? t.mid : v < 192 ? t.high : t.peak;
		const level = Math.min(255, Math.round(v / 8) * 8);
		const hz = Math.round(bin * binHz);
		const key = `${spectrumHue(hz)}|${level}|${t.bg}`;
		let c = noteColours.get(key);
		if (!c) {
			c = spectrumColour(hz, level, isLightScreen(t.bg));
			noteColours.set(key, c);
		}
		return c;
	};

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

			ctx.fillStyle = colorFor(v, bin, theme);
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

		const ax = timeToX(A);
		const STEP_MS = Math.max(0.25, AXIS_MAX_MS / (plotW * 4));
		// One envelope: the attack, then the decay (Decay `dec` ms)
		const strokeEnv = (dec: number) => {
			const tau = dec / Math.log(1000);
			ctx.beginPath();
			ctx.moveTo(L, T + plotH);
			ctx.lineTo(ax, T);
			for (let ms = A; ms <= AXIS_MAX_MS; ms += STEP_MS) {
				const amp = Math.exp(-(ms - A) / tau);
				ctx.lineTo(timeToX(ms), T + (1 - Math.min(1, Math.max(0, amp))) * plotH);
			}
			ctx.stroke();
		};

		// Decay's VEL switch: softer steps' envelopes, dashed and fainter (as the engines route them)
		const velDecay = velocityRouting.decay.value;
		if (velDecay !== 0) {
			ctx.strokeStyle = ink;
			ctx.lineWidth = 1.5;
			ctx.setLineDash([5, 4]);
			VELOCITY_FAN.forEach((v, i) => {
				ctx.globalAlpha = i === 0 ? 0.6 : 0.4;
				strokeEnv(D * routeVelocity({ decay: velDecay }, v).decayFactor);
			});
			ctx.setLineDash([]);
			ctx.globalAlpha = 1;
		}

		ctx.lineWidth = 2;
		ctx.strokeStyle = ink;
		strokeEnv(D);

		// Labels & tick
		ctx.font = `700 11px Cousine, ui-monospace, monospace`;
		ctx.fillStyle = ink; ctx.globalAlpha = 0.9; ctx.textAlign = 'left';
		ctx.fillText(velDecay !== 0 ? 'Amplitude Envelope (dashed: softer steps)' : 'Amplitude Envelope (Attack → Decay)', L, 12);

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
			velCutoff: () => velocityRouting.cutoff.value,
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
	// The ⋮ of the pad whose settings are open closes them
	if (padPopover.value.open && padSettings.name === name && padSettings.index === index) {
		padPopover.value.open = false;
		return;
	}
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
const tempo = ref(DEFAULT_TEMPO);
const swing = ref(0);
// The Swing knob's readout; its notch at 33 % is a triplet feel (src/lib/knobDetents.ts)
const swingText = computed(() => `${Math.round(swing.value * 100)}%${Math.abs(swing.value - TRIPLET_SWING) < 1e-9 ? ' (triplet)' : ''}`);
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
		ratchets: Array(stepLength.value).fill(1), // hits per step (src/audio/ratchet.ts)
		repeatNotes: Array(stepLength.value).fill('same'), // what the hits play (ratchet.ts)
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

// Per-pad repeat notes (what the hits play: Same, Up or Down the key's chord) for the pad
// settings popover; undefined (no row) for a lane without them
const currentPadRepeatNotes = computed<RepeatNotes | undefined>({
	get() {
		const inst = instruments.value.find(i => i.name === padSettings.name);
		if (!inst?.repeatNotes) return undefined;
		return clampRepeatNotes(inst.repeatNotes[padSettings.index]);
	},
	set(m) {
		const inst = instruments.value.find(i => i.name === padSettings.name);
		if (!inst?.repeatNotes || padSettings.index < 0) return;
		const next = [...inst.repeatNotes];
		next[padSettings.index] = clampRepeatNotes(m);
		inst.repeatNotes = next;
	}
});

// Per-pad ratchet (Repeats: 1–4 quick hits within the step) for the pad settings popover;
// undefined (no row) for a lane without ratchets
const currentPadRatchet = computed<number | undefined>({
	get() {
		const inst = instruments.value.find(i => i.name === padSettings.name);
		if (!inst?.ratchets) return undefined;
		return inst.ratchets[padSettings.index] ?? 1;
	},
	set(n) {
		const inst = instruments.value.find(i => i.name === padSettings.name);
		if (!inst?.ratchets || padSettings.index < 0) return;
		const next = [...inst.ratchets];
		next[padSettings.index] = clampRatchet(n);
		inst.ratchets = next;
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

// The Melody Maker's key, whoever set it (a click, a project loading, undo). The pads only
// move when someone picks a key (onKeyChosen); loading or undoing brings its own pads.
function onKeyRootChange(root: typeof selectedKeyRoot.value) {
	selectedKeyRoot.value = root;
}

// Someone clicked a key on the Melody Maker's keyboard: the pattern moves to it, the shorter
// way round (the same melody, src/lib/melody/theory.ts). Stopped, at once, and the key plays;
// while playing, at the next bar's step 1 (the key blinks until then; Shift+click: at once),
// without the key's note, which would clash with the old key still playing (see BAR QUEUE)
function onKeyChosen(root: typeof selectedKeyRoot.value, now = false) {
	const audition = !isPlaying.value;
	if (root === selectedKeyRoot.value && !now) {
		cancelQueued('key'); // back to the key it's in: nothing to wait for, and it plays
		moveToKey(root, true);
		return;
	}
	atNextBar('key', root, () => moveToKey(root, audition), now);
}
function moveToKey(root: typeof selectedKeyRoot.value, audition: boolean) {
	const inst = synthInstrument.value;
	const semitones = shortestInterval(selectedKeyRoot.value, root);
	if (inst && semitones) inst.pitches = transposePitches(inst.pitches, semitones, MIN_PAD_HZ, MAX_PAD_HZ);
	selectedKeyRoot.value = root;
	melodyUi.keyRoot = root;
	if (inst && audition) auditionNote(nearestRootHz(root, patternCenterHz(inst.pitches, inst.steps)));
}

// Someone picked a scale: each pad keeps its place in the scale (or goes to the nearest note
// of the new one); to "None", nothing moves
function onScaleChosen({ from, to }: { from: MelodyUi['keyScale']; to: MelodyUi['keyScale'] }) {
	const inst = synthInstrument.value;
	if (inst) inst.pitches = remapScale(inst.pitches, selectedKeyRoot.value, from, to, MIN_PAD_HZ, MAX_PAD_HZ);
	melodyUi.keyScale = to;
}

// One note of the synth lane's sound, now, as a MIDI key would play it (not while the lane is
// muted). The click that asks for it lets audio start. opts: with the noise or not (a pad's
// noise switch), and as a pad's repeats (2–4 quick hits within a step at the tempo, as the
// sequencer plays them, ratchet.ts)
function auditionNote(hz: number, wave?: string, opts: { noise?: boolean; repeats?: number; repeatNotes?: string } = {}) {
	const inst = synthInstrument.value;
	if (!inst || inst.muted) return;
	const play = () => {
		startLfoIfNeeded();
		const step = 60 / tempo.value / 4;
		const hitHz = ratchetPitches(hz, opts.repeats ?? 1, opts.repeatNotes, repeatChord.value);
		ratchetHits(audioCtx.currentTime + 0.003, step, opts.repeats ?? 1).forEach((hit, k) => {
			playSynthNote(hitHz[k] ?? hz, Math.min(1, 0.8 * (inst.channelVolume ?? 1)), synthDecay.value, hit.time,
				wave ?? selectedWaveform.value, { addNoise: opts.noise ?? true, vel: 0.8, maxDuration: hit.maxDuration });
		});
	};
	if (audioCtx.state === 'running') play();
	else audioCtx.resume().then(play, () => { });
}

// A pad's note picked (its ⋮ settings, the phone's note picker): it plays as that pad does,
// on its wave, with its noise switch and its repeats, but only while stopped; while playing,
// the pattern plays it (a second note on top would clash)
function auditionPad(index: number, hz: number) {
	const inst = synthInstrument.value;
	if (!inst || index < 0 || isPlaying.value) return;
	auditionNote(hz, inst.waveforms?.[index] ?? selectedWaveform.value, {
		noise: noiseMask.value?.[index] ?? true,
		repeats: inst.ratchets?.[index] ?? 1,
		repeatNotes: inst.repeatNotes?.[index],
	});
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

// VEL SWITCHES START
// Each of the four cards has a VEL switch (VelSwitch.vue) for its amount above. Turning one on
// shows what it does: the screen's envelope or filter view for a moment, where softer steps are
// drawn dashed (VELOCITY_FAN), and, if every step that's on is at full velocity (so the switch
// can't change anything yet), a note under it and a glow on Pattern Tools' Humanize.
type VelKey = keyof typeof velocityRouting;
const VEL_SWITCHES: Record<VelKey, { label: string; tip: string }> = {
	decay: { label: 'Velocity shapes Decay', tip: 'Softer steps decay sooner' },
	cutoff: { label: 'Velocity shapes Cutoff', tip: 'Softer steps are darker' },
	pitchEnv: { label: 'Velocity shapes the pitch sweep', tip: 'Softer steps sweep less' },
	noise: { label: 'Velocity shapes the noise', tip: 'Softer steps have less noise' },
};
const VEL_FLASH_MS = 1500;
const VEL_NOTE_MS = 3500;
const velNote = reactive<{ key: VelKey | null; text: string }>({ key: null, text: '' });
const humanizeNudge = ref(0);
let velNoteTimer: ReturnType<typeof setTimeout> | null = null;

function onVelSwitchedOn(key: VelKey) {
	if (key === 'decay') flashScreen('env', 4);
	else if (key === 'cutoff') flashScreen('filter', 0);

	const lit = steps.value.map((on, i) => (on ? velocities.value[i] ?? 1 : null)).filter((v) => v != null);
	if (lit.length && lit.every((v) => v >= 1)) {
		velNote.key = key;
		velNote.text = 'Every step is at full velocity: try Humanize';
		humanizeNudge.value++;
		if (velNoteTimer) clearTimeout(velNoteTimer);
		velNoteTimer = setTimeout(() => { velNote.key = null; velNote.text = ''; }, VEL_NOTE_MS);
	}
}
onBeforeUnmount(() => { if (velNoteTimer) clearTimeout(velNoteTimer); });
// VEL SWITCHES END

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
const delayPingPong = ref(false); // the PING PONG switch: echoes alternate left and right
followDelaySync({ tempo, division: delayDivision, sync: delaySync, time: delayTime });

//Delay END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Drive START

const driveEnabled = ref(false);
const driveType = ref('overdrive');
const driveAmount = ref(0.4);
const driveTone = ref(5000);
const driveMix = ref(0.5);
const driveCrush = ref(false); // the CRUSH switch: a bit crusher in the driven path

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
const unisonVoices = ref(UNISON_VOICES_DEFAULT);   // 2–4
const detuneCents = ref(UNISON_DETUNE_DEFAULT);  // 0–100 cents per step
const stereoSpread = ref(UNISON_SPREAD_DEFAULT);  // 0–100 %

watch(unisonVoices, (v) => {
	const cap = unisonMaxVoices.value;
	let clamped = v;
	if (v < UNISON_VOICES_MIN) clamped = UNISON_VOICES_MIN;
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
		UNISON_VOICES_MIN,
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
			ratchets: Array.from({ length: stepsCount }, (_, i) => inst.ratchets?.[i] ?? 1),
			repeatNotes: Array.from({ length: stepsCount }, (_, i) => inst.repeatNotes?.[i] ?? 'same'),
			repeatChord: repeatChord.value,
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
				pingPong: delayPingPong.value,
			},
			drive: {
				enabled: driveEnabled.value,
				type: "overdrive",
				amount: driveAmount.value,
				tone: driveTone.value,
				mix: driveMix.value,
				crush: driveCrush.value,
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
			pingPong: delayPingPong,
		},
		drive: { enabled: driveEnabled, type: driveType, amount: driveAmount, tone: driveTone, mix: driveMix, crush: driveCrush },
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
	pattern: { lanes: instruments, stepLength, selectedWaveform, noiseMask, repeatChord },
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
	onBarStart: () => runQueued(),
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
// pitch, with the global waveform, scaled by velocity and the synth channel volume. A
// controller's knobs (control changes) go to MIDI learn (src/composables/useMidiLearn.ts),
// which turns the knobs they're linked to.
const midi = useMidiInput({
	audioCtx,
	onControlChange: useMidiLearn().handleControlChange,
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

	if (isPlaying.value) runQueued(); // stopping: what was waiting for the bar happens now
	togglePlay();
}
// GOOGLE ANALYTICS END
// EXPORT AUDIO START

// File → Export audio…: the dialog (ExportDialog.vue) picks the files, exportFiles.ts renders
// them, and they download as one file or one .zip. The dialog starts from the last export's
// choices (in memory only, not saved); File → New puts back the defaults
// (resetUiToFactoryDefaults)
const exportOpen = ref(false);
const exportOptions = reactive<ExportOptions>({ ...DEFAULT_EXPORT_OPTIONS, oneShotHz: 220 });
const exportProgress = ref('');

// The one-shot's notes: the pads' range, each "A3 (220 Hz)"
const oneShotNotes = computed(() => notesInRange(MIN_PAD_HZ, MAX_PAD_HZ).map((n) => {
	const hz = midiToHz(n);
	return { hz, label: `${nearestNote(hz)} (${Math.round(hz)} Hz)` };
}));

// Which effects stems would have sound in them
const exportEffectsOn = computed(() => ({
	delay: delayEnabled.value && delayMix.value > 0,
	reverb: reverbEnabled.value && reverbMix.value > 0,
	noise: noiseEnabled.value && noiseAmount.value > 0,
}));

function openExportDialog() {
	// The one-shot starts on the key's root in the pads' octave (A3 unless the key or octave
	// changed), as an exact note of the list
	exportOptions.oneShotHz = midiToHz(midiNoteOf(currentDefaultHz.value));
	exportOpen.value = true;
}

function downloadFile(name: string, data: Uint8Array, type: string) {
	const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function runExport(options: ExportOptions) {
	if (!synthInstrument.value || isExporting.value) return;
	// The next export starts from these choices (from phone mode's shorter dialog, only its bars
	// and ending, so the desktop's file choices stay as they were)
	Object.assign(exportOptions, phoneActive.value ? { bars: options.bars, ending: options.ending } : options);
	isExporting.value = true;
	try {
		const files = await buildExportFiles(exportState.value, options, {
			project: project.name || 'Untitled',
			key: keyLabel(melodyUi.keyRoot, melodyUi.keyScale),
			oneShotWave: selectedWaveform.value,
			noteName: (hz) => nearestNote(hz),
		}, (done, total) => { exportProgress.value = `${done} of ${total}`; });
		if (!files.length) return;
		if (files.length === 1) {
			downloadFile(files[0].name, files[0].data, files[0].type);
		} else {
			const names = exportNames({
				project: project.name || 'Untitled', bpm: tempo.value,
				key: keyLabel(melodyUi.keyRoot, melodyUi.keyScale), bars: options.bars, ending: options.ending,
			});
			downloadFile(names.zip, zipFiles(files), 'application/zip');
		}
		exportOpen.value = false;
		trackEvent('export_audio', {
			bars: options.bars, ending: options.ending, mix: options.mix, stems: options.stems,
			midi: options.midi, one_shot: options.oneShot, normalize: options.normalize, files: files.length,
		});
	} catch (err) {
		console.error('Export failed:', err);
		alert('Export failed. See console for details.');
	} finally {
		isExporting.value = false;
		exportProgress.value = '';
	}
}

// EXPORT AUDIO END

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

// The pads' colour for a pitch, blue→red (src/lib/padColour.ts)
function hueFor(hz: number, lo = MIN_PAD_HZ, hi = MAX_PAD_HZ) {
	return padHue(hz, lo, hi);
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
	cancelQueued();
	hardStopSequencer();

	resetToFactoryDefaults(projectState);

	showVelocity.value = false;
	showPitch.value = false;

	// Close any open menus/popovers, and put the Repeats brush down
	fxAdvanced.open = false;
	stepsAdvanced.open = false;
	repeatBrush.value = null;
	closeOverlays?.();

	// The Export audio dialog starts from its defaults again (it keeps the last export's
	// choices otherwise, also when another project is opened)
	exportOpen.value = false;
	Object.assign(exportOptions, DEFAULT_EXPORT_OPTIONS);

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
const history = useUndoHistory({
	buildSnapshot: () => buildSnapshot(projectState),
	applySnapshot: (s) => applySnapshot(projectState, s),
});
const { canUndo, canRedo } = history;
// A change still waiting for the bar is thrown away: undo goes back from what's playing
function undo() { cancelQueued(); history.undo(); }
function redo() { cancelQueued(); history.redo(); }
// Opening or importing a project: nothing from the last one waits for its bar
watch(() => project.projectId, () => { if (!project.isContinued) cancelQueued(); }); // Save as… keeps it

// SAVING END

// -----------------------------------------------------------------------------------------------------------------------------------------

// PRESETS START

// Built-in presets (src/lib/presets/): a click sets the sound (synth, effects, the main wave
// and every pad's), never the pattern. It's one undo step, as any change is
// (useUndoHistory records once the settings have settled).
//
// The button of the preset the sound matches is lit, as soon as it's clicked. Its sound is
// noted once the panels have followed it (they may round a value), and compared with the
// project store's copy, so turning any sound knob afterwards unlights it, and undoing back to
// it lights it again. A preset not clicked yet on this page has no sound noted, so an opened
// project that happens to match it lights nothing.
const presetKeys = reactive<Record<string, string>>({});
const choosingPreset = ref<string | null>(null);
const activePresetId = computed<string | null>(() => {
	if (choosingPreset.value) return choosingPreset.value;
	const key = soundKey(project.data);
	if (!key) return null;
	return PRESETS.find(p => presetKeys[p.id] === key)?.id ?? null;
});

async function choosePreset(id: string) {
	const preset = PRESETS.find(p => p.id === id);
	if (!preset) return;
	applyPreset(projectState, preset);
	choosingPreset.value = id;
	trackEvent('preset_select', { preset: id });
	// Let the panels follow (props, their watchers and what they emit back), as undo does
	await nextTick();
	await nextTick();
	project.flushPending();
	presetKeys[id] = soundKey(project.data);
	if (choosingPreset.value === id) choosingPreset.value = null;
}

// The dice: a new sound from random settings (src/lib/presets/random.ts), applied like a
// preset. Nothing lights up; undo goes back to the sound before.
function rollRandomSound() {
	applyPreset(projectState, randomPreset());
	trackEvent('preset_random');
}

// Built-in patterns (src/lib/patterns/), beside Sounds: a click sets the synth lane's pattern
// (steps, velocities, pitches from the key's root, repeats), never the sound. One undo step.
// Its button is lit while the pattern matches, the same way as a preset's.
const patternKeys = reactive<Record<string, string>>({});
const choosingPattern = ref<string | null>(null);
const activePatternId = computed<string | null>(() => {
	if (choosingPattern.value) return choosingPattern.value;
	const key = patternKey(project.data);
	if (!key) return null;
	return PATTERNS.find(p => patternKeys[p.id] === key)?.id ?? null;
});

// A pattern changes at once, playing or not (the maintainer's call after PR 55: a key waits
// for the bar, a pattern doesn't)
async function choosePattern(id: string) {
	const pattern = PATTERNS.find(p => p.id === id);
	if (!pattern) return;
	trackEvent('pattern_select', { pattern: id });
	applyPattern(projectState, pattern, { min: MIN_PAD_HZ, max: MAX_PAD_HZ });
	choosingPattern.value = id;
	await nextTick();
	await nextTick();
	project.flushPending();
	patternKeys[id] = patternKey(project.data);
	if (choosingPattern.value === id) choosingPattern.value = null;
}

// The Patterns dice: a new pattern from random choices (src/lib/patterns/random.ts), applied
// like a built-in one. Nothing lights up; undo goes back to the pattern before.
function rollRandomPattern() {
	applyPattern(projectState, randomPattern(), { min: MIN_PAD_HZ, max: MAX_PAD_HZ });
	trackEvent('pattern_random');
}

// BAR QUEUE START
// While playing, a key clicked in the Melody Maker waits for the next bar's step 1, as a
// hardware sequencer queues a change, so the bar that's playing finishes as it was. The key
// shows a pulsing ghost meanwhile, and the Melody Maker says so (queuedKey). The engine calls
// runQueued() just before it builds step 1 (onBarStart), so the bar starts with the new
// pitches. Stopped, or with Shift+click, it happens at once. One waiting change per kind: a
// new one replaces it. Stop applies what's waiting; undo, redo, opening a project and File →
// New throw it away. Each change is one undo step, as before. (Patterns waited too in PR 55;
// they change at once since, the maintainer's call: only 'key' is queued now.)
type QueueKind = 'key';
const queued = shallowRef<{ kind: QueueKind; id: string; run: () => void }[]>([]);
const queuedKey = computed(() => queued.value.find(q => q.kind === 'key')?.id ?? null);

function atNextBar(kind: QueueKind, id: string, run: () => void, now = false) {
	cancelQueued(kind);
	if (now || !isPlaying.value) run();
	else queued.value = [...queued.value, { kind, id, run }];
}
function cancelQueued(kind?: QueueKind) {
	queued.value = kind ? queued.value.filter(q => q.kind !== kind) : [];
}
// In the order they were asked for
function runQueued() {
	const due = queued.value;
	if (!due.length) return;
	queued.value = [];
	for (const q of due) q.run();
}
// BAR QUEUE END

// PRESETS END

// PHONE START
// Phone mode (usePhoneMode.ts, PhoneLayout.vue): the phone layout reads and writes the same
// settings as the desktop's, so a project sounds the same on both. Its four big knobs:
// Decay (the amp envelope's), Tone (the filter's cutoff), Sweep (the pitch envelope's amount,
// both ways, like the Pitch card's knob) and Space (the reverb's mix, which turns the reverb on
// above 0 and off at 0, and the delay's mix at 0.6 times it while the delay is on).
const { active: phoneActive, setFull: setPhoneFull } = usePhoneMode();
const SCALE_LABELS: Record<string, string> = {
	none: '(no scale)', major: 'major', naturalMinor: 'minor', pentMajor: 'pentatonic major',
	pentMinor: 'pentatonic minor', dorian: 'dorian', lydian: 'lydian', mixolydian: 'mixolydian',
};
const phoneCtx = reactive({
	inst: synthInstrument,
	currentStep, isPlaying, tempo, canUndo,
	presets: PRESETS, patterns: PATTERNS, activePresetId, activePatternId,
	keyRoot: computed(() => melodyUi.keyRoot),
	keyScale: computed(() => melodyUi.keyScale),
	keyScaleLabel: computed(() => SCALE_LABELS[melodyUi.keyScale] ?? melodyUi.keyScale),
	minHz: MIN_PAD_HZ, maxHz: MAX_PAD_HZ,
	decayMs: ampEnvDecayMs,
	cutoff: computed({
		get: () => filterCutoff.value,
		set: (v: number) => { filterCutoff.value = v; filterEnabled.value = true; },
	}),
	sweep: computed({
		get: () => (pitchMode.value === 'down' ? -pitchEnvSemitones.value : pitchEnvSemitones.value),
		set: (v: number) => {
			const n = Math.max(-48, Math.min(48, Math.round(v)));
			pitchEnvSemitones.value = Math.abs(n);
			if (pitchMode.value !== 'random' && n !== 0) pitchMode.value = n < 0 ? 'down' : 'up';
		},
	}),
	space: computed({
		get: () => (reverbEnabled.value ? reverbMix.value : 0),
		set: (v: number) => {
			reverbMix.value = v;
			reverbEnabled.value = v > 0;
			if (delayEnabled.value) delayMix.value = Math.round(v * 0.6 * 100) / 100;
		},
	}),
	togglePlay: onPlayClick,
	undo,
	choosePreset, randomSound: rollRandomSound, choosePattern, randomPattern: rollRandomPattern,
	audition: auditionNote,
	auditionPad,
	noteName: nearestNote,
	hue: padHue,
	fullLayout: () => setPhoneFull(true),
	// Every pad an octave up or down (Pattern Tools' octave arrows)
	octave: (delta: number) => onPatternOctaveShift(delta),
	// The menu's Reset: the pads as File → New has them (the Step Sequencer's Reset Pads), and
	// with `sound` the factory sound too (as File → New, presets' starting point)
	reset: (sound: boolean) => {
		resetSynthPadsToDefaults();
		if (sound) resetSoundToFactoryDefaults(projectState as any);
	},
	// For the top bar's tiny oscilloscope (not made reactive: a Web Audio node)
	analyser: markRaw(analyser),
});
// PHONE END
</script>

<style scoped>
.pt-card .pt-section {
	margin-bottom: 8px;
}

.pt-card .pt-rule {
	margin: 10px 0;
}

@media (min-width: 1280px) {
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

/* LAYOUT START
   Like one piece of hardware (see the template's LAYOUT comment). From 1200 px: the transport
   and the Step Sequencer on the left two thirds, the screen beside them; under them Sound (two
   thirds) and Compose (one third), which end on one line: Sound's last row and Melody Maker
   take up any difference. Inside Sound each row is filled edge to edge, and a card stretched
   taller than its controls keeps them centred. Under 1200 px: the screen beside the transport,
   the steps across, then the tabs (Sound, Effects, Compose) and the one they show. Under
   720 px (phones) everything is one column. */

.ds-topbar {
	margin-bottom: 12px;
}

/* The logo, at the top bar's left end (ProjectControls' brand slot) */
.topbar-logo {
	display: block;
	height: 44px;
	width: auto;
	margin: -4px 6px -4px 0;
	border-radius: 4px;
}

/* Phones: the project name needs the room (phone mode, planned, will place the logo) */
@media (max-width: 575.98px) {
	.topbar-logo {
		display: none;
	}
}

.ds-grid {
	display: grid;
	gap: 14px;
	grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
	grid-template-areas:
		"transport screen"
		"steps screen"
		"sound compose";
	align-items: start;
}

.ds-transport {
	grid-area: transport;
}

.ds-steps {
	grid-area: steps;
}

.ds-visualizer {
	grid-area: screen;
	align-self: stretch;
	display: flex;
	min-height: 0;
	overflow: hidden;
	position: relative;
}

.ds-sound {
	grid-area: sound;
	align-self: stretch;
}

.ds-compose {
	grid-area: compose;
	align-self: stretch;
}

.ds-tabs {
	display: none;
}

/* The screen fills its cell: the LCD takes all the height the F-keys leave */
.ds-visualizer .nac-wrap {
	flex: 1 1 auto;
	display: flex;
	min-height: 0;
	width: 100%;
}

.ds-visualizer .nac-wrap>* {
	flex: 1 1 auto;
	min-height: 0;
	width: 100%;
}

.ds-visualizer :deep(.nac-screen) {
	display: grid !important;
	grid-template-rows: 1fr auto;
	width: 100%;
	height: 100%;
	min-height: 0;
}

.ds-visualizer :deep(.nac-screen__lcd) {
	height: 100% !important;
	aspect-ratio: auto !important;
	min-height: 0;
}

.ds-visualizer :deep(.nac-screen__lcd canvas) {
	display: block;
	width: 100%;
	height: 100% !important;
}

.ds-visualizer :deep(.nac-screen__fkeys) {
	display: grid !important;
	grid-template-columns: repeat(4, 1fr);
	gap: .4rem;
	padding: 0 .75rem;
}

/* Transport: the knobs, Sounds and Patterns side by side, Play */
.transport-row {
	display: flex;
	align-items: center;
	gap: 18px;
}

.transport-knobs {
	display: flex;
	align-items: center;
	gap: 14px;
}

.transport-presets {
	display: flex;
	gap: 12px;
	margin: 0 auto;
	min-width: 0;
}

.transport-right {
	display: flex;
	align-items: center;
	gap: 18px;
}

/* Sections: a recessed panel with its name */
.ds-section {
	display: flex;
	flex-direction: column;
	gap: 14px;
	min-width: 0;
	padding: 10px;
	border: 1px solid var(--pt-hairline);
	border-radius: 16px;
	background: color-mix(in oklab, var(--pt-inset) 55%, transparent);
}

.ds-section-title {
	margin: 2px 6px 0;
	font-size: 13px;
	font-weight: 700;
	line-height: 1.3;
	letter-spacing: .2em;
	text-transform: uppercase;
	color: var(--pt-text);
	opacity: .85;
}

/* Sound: three rows, each filled edge to edge */
.sound-row {
	display: grid;
	gap: 14px;
	align-items: stretch;
	min-width: 0;
}

.sound-row-1 {
	grid-template-columns: minmax(0, 1fr) minmax(0, 1.12fr);
}

.sound-row-2 {
	grid-template-columns: minmax(0, 2fr) minmax(0, 2.2fr) minmax(0, 4.2fr);
}

.sound-row-3 {
	grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	flex: 1 1 auto;
}

.sound-stack {
	display: flex;
	flex-direction: column;
	gap: 14px;
	min-width: 0;
}

.sound-stack>.module {
	flex: 1 1 auto;
}

/* Every module fills its cell; a stretched card keeps its controls centred */
.ds-section .module {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.ds-section .module> :deep(.pt-card),
.ds-section .module>.noise-tv-bg,
.ds-section .module>.noise-tv-bg> :deep(.pt-card) {
	flex: 1 1 auto;
	display: flex;
	flex-direction: column;
}

.ds-section .module :deep(.pt-collapse-body) {
	flex: 1 1 auto;
	display: flex;
	flex-direction: column;
	justify-content: center;
}

/* Envelope, Pitch and Filter: knobs spread evenly across each card */
.sound-row-2 :deep(.pt-subblock) {
	width: 100%;
	margin: 0;
}

.sound-row-2 :deep(.pt-knob-row) {
	justify-content: space-evenly;
	flex-wrap: nowrap;
}

/* Compose: Melody Maker takes up any difference with Sound */
.ds-compose .module.melody {
	flex: 1 1 auto;
}

/* Tablets: the tabs, and the panel they show */
@media (max-width: 1199.98px) {
	.ds-grid {
		grid-template-areas:
			"transport screen"
			"steps steps"
			"tabs tabs"
			"panel panel";
	}

	.ds-visualizer {
		min-height: 170px;
	}

	.ds-sound,
	.ds-compose {
		grid-area: panel;
	}

	.ds-tabs {
		grid-area: tabs;
		display: flex;
		gap: 8px;
		margin-bottom: -4px;
	}

	.ds-tab {
		flex: 1;
		padding: 10px 14px;
		border-radius: 12px 12px 4px 4px;
		border: 1px solid var(--pt-hairline);
		background: var(--pt-surface-2);
		color: var(--pt-text);
		font: inherit;
		font-size: .8rem;
		font-weight: 700;
		letter-spacing: .14em;
		text-transform: uppercase;
		opacity: .7;
		cursor: pointer;
	}

	.ds-tab.on {
		opacity: 1;
		border-color: hsl(var(--pt-accent) 80% 62% / .8);
		background: radial-gradient(circle at 50% 0%, hsl(var(--pt-accent) 70% 40% / .45), transparent 70%), var(--pt-surface-2);
		box-shadow: 0 0 14px hsl(var(--pt-accent) 80% 60% / .25);
	}

	.ds-tab:focus-visible {
		outline: 2px solid hsl(var(--pt-accent) 80% 62%);
		outline-offset: 2px;
	}

	/* The tab names the panel */
	.ds-section-title {
		display: none;
	}

	.ds-grid[data-tab="sound"] .ds-compose,
	.ds-grid[data-tab="sound"] .module.fx,
	.ds-grid[data-tab="fx"] .ds-compose,
	.ds-grid[data-tab="fx"] .sound-row-1,
	.ds-grid[data-tab="fx"] .sound-row-2,
	.ds-grid[data-tab="fx"] .sound-row-3>.sound-stack,
	.ds-grid[data-tab="compose"] .ds-sound {
		display: none;
	}

	/* Sound tab: Noise and the LFO side by side under Envelope, Pitch and Filter */
	.sound-row-3 {
		grid-template-columns: minmax(0, 1fr);
	}

	.sound-row-3>.sound-stack {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	/* Effects tab: the pedals at a size that suits them, centred */
	.module.fx .fx-pair {
		grid-template-columns: repeat(3, minmax(0, 190px));
		justify-content: center;
	}

	/* The transport: Sounds and Patterns on a row of their own under the knobs */
	.transport-row {
		flex-wrap: wrap;
		row-gap: 12px;
		justify-content: space-between;
	}

	.transport-presets {
		order: 3;
		flex: 1 1 100%;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin: 0;
	}
}

/* Phones: one column, the screen on top */
@media (max-width: 719.98px) {
	.ds-grid {
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas:
			"screen"
			"transport"
			"steps"
			"tabs"
			"panel";
		gap: 12px;
	}

	.drum-sequencer {
		background: none;
		box-shadow: none;
	}

	/* The tabs frame the panel: no recessed section around it, so the cards keep the width */
	.ds-section {
		padding: 0;
		border: 0;
		background: none;
	}

	.transport-row {
		justify-content: space-evenly;
	}

	.transport-right {
		justify-content: space-evenly;
	}

	.transport-presets {
		grid-template-columns: minmax(0, 1fr);
	}

	.sound-row-1,
	.sound-row-3>.sound-stack {
		grid-template-columns: minmax(0, 1fr);
	}

	.sound-row-2 {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.sound-row-2>.module.filter {
		grid-column: 1 / -1;
	}

	/* Effects tab: the pedals one under another, as before */
	.module.fx .fx-pair {
		grid-template-columns: minmax(0, 1fr);
	}

	.ds-tab {
		padding: 10px 6px;
		letter-spacing: .08em;
	}
}

/* LAYOUT END */

/* PHONE START: the phone layout's Sound, FX and Key pages (PhoneLayout.vue's slots) */
.pl-sound {
	display: grid;
	gap: 8px;
}

.pl-sound-row {
	display: flex;
	gap: 8px;
	align-items: stretch;
}

.pl-sound-row > * {
	flex: 1 1 0;
	min-width: 0;
}

.pl-sound-row > .filter {
	flex-grow: 1.6;
}

.pl-waves {
	flex-grow: 1.6;
	display: grid;
	gap: 6px;
	align-content: start;
}

.pl-wave-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 6px;
}

.pl-wave-grid .pt-btn {
	min-height: 34px;
	font-size: 12px;
	padding: 4px;
}

.pl-gens {
	display: flex;
	justify-content: space-around;
	align-items: center;
	gap: 6px;
}

.pl-gen {
	display: grid;
	justify-items: center;
	gap: 4px;
}

.pl-gen .pt-btn {
	min-height: 32px;
	padding: 4px 10px;
	font-size: 12px;
}

.pl-waves .pt-btn[aria-pressed="true"],
.pl-gen .pt-btn[aria-pressed="true"] {
	box-shadow: 0 0 0 2px hsl(var(--pt-accent) 90% 60% / .35), 0 0 12px var(--pt-btn-glow);
	font-weight: 700;
}

.pl-fx {
	display: flex;
	justify-content: center;
	gap: 12px;
	height: 100%;
	align-items: center;
}

.pl-melody {
	height: 100%;
}
/* PHONE END */

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

/* Noise's VEL switch, in the card's top-right corner, where the other cards have theirs */
.noise-vel {
	position: absolute;
	top: 10px;
	right: 12px;
	z-index: 4;
}

.noise-ribbon {
	--noise-ribbon-accent: var(--pt-noise-on, #9C27B0);
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
	color: var(--pt-menu-caption);
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
	color: var(--pt-menu-caption);
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
	/* On a narrow screen the Repeats brush goes on a line of its own */
	flex-wrap: wrap;
	min-width: 0;
	row-gap: 4px;
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

.repeat-brush {
	display: inline-flex;
	align-items: center;
	gap: 3px;
}

.repeat-brush__label {
	font-size: 10px;
	letter-spacing: 0.06em;
	opacity: 0.7;
	margin-right: 2px;
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

/* The Tempo or Swing knob sits on one of its notches (src/lib/knobDetents.ts) */
.stepper-value.on-stop {
	color: var(--knob-detent-on, #5effb0);
	border-color: var(--knob-detent, rgba(94, 255, 176, 0.65));
	box-shadow: 0 0 8px var(--knob-detent, rgba(94, 255, 176, 0.65));
}

.module.noise .noise-tv-bg {
	border-radius: var(--pt-card-radius, 12px);
	overflow: hidden;
}

/* The ribbon (the switch) above the TV static (z 0), which shows over the card. Only the
   ribbon: the card has no z-index, or, as a flex item of the stretched panel, it would be
   drawn over both (PR 41 hid the switch that way) */
.module.noise .noise-tv-bg>.noise-ribbon {
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


</style>

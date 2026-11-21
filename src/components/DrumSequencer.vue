<template>
	<div class="drum-sequencer" :class="currentTheme" :style="padSizeStyle">
		<!-- PHONE START
			 Phone mode (usePhoneMode.ts): a phone held sideways gets its own layout instead of the
			 one below. Its Sound, FX and Key pages show the same panels again. -->
		<PhoneLayout v-if="phoneActive" :ctx="phoneCtx">
			<template #sound>
				<!-- Bass shown (PR 118): its Sound section, compact, with a Mix group (Level, Pedals, the meter) -->
				<div v-if="bassChosen" class="pl-bass-sound">
					<BassSound compact :sound="bass" :noteHz="bassScreenHz" :noteName="nearestNote(bassScreenHz)">
						<template #mix>
							<div class="bs-kgroup pl-mix" role="group" aria-label="Bass mix">
								<span class="bs-kcap">Mix <LevelMeter :read="() => machineLevel('bass')" :active="viewSource.active" label="Bass level meter" /></span>
								<div class="pl-mix-knobs">
									<Knob v-model="bassLane.level" label="Level" :min="0" :max="1" :step="0.01" size="small"
										:value-text="`${Math.round(bassLane.level * 100)}%`" />
									<Knob v-model="bassLane.pedals" label="Pedals" :min="0" :max="1" :step="0.01" size="small"
										:value-text="`${Math.round(bassLane.pedals * 100)}%`" />
								</div>
							</div>
						</template>
					</BassSound>
				</div>
				<div v-else class="pl-sound">
					<div class="pl-sound-row">
						<div class="module envelope">
							<SectionWrap id="pl-envelope" title="Envelope" :modelValue="true">
								<EnvelopeModule classic :color="'#4CAF50'" :showToggle="false" v-model:enabled="envelopeEnabled"
									v-model:attackMs="ampEnvAttackMs" v-model:decayMs="ampEnvDecayMs" />
							</SectionWrap>
						</div>
						<div class="module pitch-env">
							<PitchEnvModule classic :enabled="pitchEnvEnabled" v-model:semitones="pitchEnvSemitones"
								v-model:decayMs="pitchEnvDecayMs" v-model:mode="pitchMode"" />
						</div>
						<div class="module filter">
							<SectionWrap class="filter-card" id="pl-filter" title="Filter" :modelValue="true">
								<template #tools>
									<VelSwitch v-model="velocityRouting.cutoff.value" :name="VEL_SWITCHES.cutoff.label" :tip="VEL_SWITCHES.cutoff.tip" :disabled="!filterEnabled"
									:note="velNote.key === 'cutoff' ? velNote.text : ''" @switched-on="onVelSwitchedOn('cutoff')" />
								</template>
								<FilterModule classic :color="'#FF5722'" :showToggle="false" v-model:enabled="filterEnabled"
									v-model:cutoff="filterCutoff" v-model:resonance="filterResonance"
									v-model:envAmount="filterEnvAmount" v-model:envDecayMs="filterEnvDecayMs" :lfoView="lfoView" />
							</SectionWrap>
						</div>
					</div>
					<div class="pl-sound-row">
						<!-- The waves (PR 106): the eight, Random (as the desktop's tile, in the accent:
							 it rolls the pads' waves again), and the desktop's Sample strip under them
							 (REC, the recording, its dice and Length). A wave is lit only while every
							 pad plays it (litWave), as on the desktop. -->
						<section class="pt-card pl-waves" aria-label="Wave">
							<div class="pl-wave-grid">
								<button v-for="t in WAVE_TILES" :key="t.value" type="button" class="pt-btn"
									:aria-pressed="litWave === t.value" :aria-label="t.label" @click="applyWaveToAll(t.value)">{{ t.value === 'triangle' ? 'TRI' : t.label }}</button>
								<button type="button" class="hw-cap pl-random" :disabled="!randomPoolArray.length" :title="randomTooltip"
									:aria-label="wavesMixed ? 'Random waves: the pads play a mix, roll again' : 'Random waves'"
									@click="applyRandomWaves()">
									<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" />
										<circle cx="8" cy="8" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="16" cy="16" r="1.6" /></svg>
									<span>RANDOM</span>
								</button>
							</div>
							<div class="st-strip pl-sample">
								<SampleTile :sample="sample" :state="recorder.state.value" :level="recorder.level.value"
									:lit="litWave === 'sample'" v-model:length="sampleLength"
									:randomIncluded="randomPool.sample" @toggle-random="onToggleRandom"
									@pick="applyWaveToAll('sample')" @record="recordSample()" />
							</div>
						</section>
						<!-- Noise is on the Mod page since PR 73, as its whole card. FM and Unison: the
							 desktop's cards, compact (PR 106: the ribbon, the keys, the mini knobs; no screen) -->
						<div class="pl-gens">
							<div class="module fm">
								<FMModule compact :color="'#3F51B5'" :showToggle="false" :lfoView="lfoView" v-model:enabled="fmEnabled"
									v-model:modFreq="fmModFreq" v-model:index="fmIndex" v-model:ratio="fmRatio" />
							</div>
							<div class="module unison">
								<UnisonEffect compact :showToggle="false" v-model:enabled="unisonEnabled" v-model:voices="unisonVoices"
									v-model:detune="detuneCents" v-model:spread="stereoSpread" />
							</div>
						</div>
					</div>
				</div>
			</template>
			<!-- Mod (PR 73): the LFO and the Noise card, which didn't fit on Sound (one screen, no
				 scrolling, from 568 × 320) -->
			<template #mod>
				<!-- The desktop's cards since PR 106: the LFO's ribbon, screen and patch bay, and
					 Noise's ribbon (the classic LFO card and Noise's ON pill before) -->
				<div class="pl-mod">
					<div class="module mod lfo-card">
						<SectionWrap id="pl-lfo" title="LFO" :modelValue="true">
							<LFOGroup :showToggle="false" :pulseInUse="pulseInUse" :fmInUse="fmInUse" v-model="lfoEnabled"
								v-model:depth="lfoDepth" :target="lfoTarget" @update:target="chooseLfoTarget" v-model:waveform="lfoWaveform"
								v-model:division="lfoDivision"
								v-model:retrigger="lfoRetrigger" v-model:bipolar="lfoBipolar" :depthMax="lfoDepthMax"
								:steps="steps" color="#00BCD4" />
						</SectionWrap>
					</div>
					<div class="module noise">
						<div class="noise-tv-bg" :class="{ on: noiseEnabled }" :style="noiseModuleStyle">
							<button type="button" class="noise-ribbon" :class="{ 'is-on': noiseEnabled }"
								:aria-pressed="noiseEnabled" aria-label="Toggle noise"
								@click="noiseEnabled = !noiseEnabled">
								<span class="noise-ribbon-led" aria-hidden="true"></span>
								<span class="noise-ribbon-label">NOISE</span>
							</button>
							<div v-if="noiseEnabled" class="noise-overlay mode-static" aria-hidden="true">
								<div class="grain"></div>
							</div>
							<SectionWrap id="pl-noise" title="" :modelValue="true">
								<div class="gen-panel noise-panel">
									<div class="noise-inline">
										<NoiseModule :showToggle="false" v-model:enabled="noiseEnabled"
											v-model:amount="noiseAmount" v-model:colorMorph="noiseColor"
											v-model:mask="noiseMask" :steps="steps" :velocities="velocities" v-model:attackBurst="noiseAttackBurst"
											v-model:burstMs="noiseBurstMs" :color="'#9C27B0'" />
									</div>
								</div>
							</SectionWrap>
						</div>
					</div>
				</div>
			</template>
			<template #fx>
				<div class="fx-pair pedalboard pl-fx">
					<DelayEffect :showToggle="false" :audioCtx="audioCtx" v-model:enabled="delayEnabled"
						:tempo="tempo" v-model:division="delayDivision" v-model:delayTime="delayTime"
						v-model:delayFeedback="delayFeedback"
						v-model:delayMix="delayMix" v-model:toneEnabled="delayToneEnabled"
						v-model:toneHz="delayToneHz" v-model:toneType="delayToneType" v-model:pingPong="delayPingPong" />
					<DriveEffect :showToggle="false" v-model:enabled="driveEnabled" :driveType="'overdrive'"
						v-model:driveAmount="driveAmount" v-model:driveTone="driveTone"
						v-model:driveMix="driveMix" v-model:crush="driveCrush" />
					<ReverbEffect :showToggle="true" :audioCtx="audioCtx" v-model:enabled="reverbEnabled"
						v-model:mix="reverbMix" v-model:decay="reverbDecay" v-model:tone="reverbTone"
						v-model:pre-division="reverbPreDivision" v-model:reverse="reverbReverse"
						v-model:swell="reverbSwell" :tempo="tempo" />
					<TapeEffect v-model:enabled="tapeEnabled" v-model:age="tapeAge" v-model:wobble="tapeWobble"
						v-model:mode="tapeMode" :playing="isPlaying" />
				</div>
			</template>
			<template #key>
				<div class="module melody pl-melody">
					<SectionWrap id="pl-melody" title="Melody Maker" :modelValue="true">
						<!-- What Generate makes; Generate is the card's last line (PR 82) -->
						<template #tools>
							<MelodyModeSwitch v-model="melodyUi.mode" />
						</template>
						<MelodyMaker compact :key="`pl-melody-${resetNonce}`" :frequencies="editPitches"
							:steps="editSteps" :min-freq="editMinHz" :max-freq="editMaxHz" :octave-shift="bassChosen ? -2 : 0" :currentTheme="currentTheme"
							:ratchets="bassChosen ? undefined : synthInstrument?.ratchets" :repeat-notes="bassChosen ? undefined : synthInstrument?.repeatNotes" :repeat-chord="repeatChord"
							:swing="swing" :note-steps="bassChosen ? bassNoteSteps : noteSteps" :playView="playView" :tuner="viewSource"
							:initial-key-root="melodyUi.keyRoot" :initial-key-scale="melodyUi.keyScale"
							:initial-range-preset="melodyUi.rangePreset" :initial-arp-pattern="melodyUi.arpPattern"
							:initial-arp-rate="melodyUi.arpRate" :initial-arp-octaves="melodyUi.arpOctaves"
							:initial-arp-tones="melodyUi.arpTones" :initial-arp-skip="melodyUi.arpSkip"
							:initial-mode="melodyUi.mode"
							@update:frequencies="editPitches = $event" @update:steps="editSteps = $event"
							@octave-shift="onEditOctaveShift($event)"
							:queued-key="queuedKey" @key-chosen="onKeyChosen" @scale-chosen="onScaleChosen"
							@mode-change="(v) => { melodyUi.mode = v }"
							@key-root-change="(r) => { onKeyRootChange(r); melodyUi.keyRoot = r as any; }"
							@key-scale-change="(s) => { melodyUi.keyScale = s as any }"
							@range-preset-change="(p) => { melodyUi.rangePreset = p as any }"
							@arp-pattern-change="(v) => { melodyUi.arpPattern = v as any }"
							@arp-rate-change="(v) => { melodyUi.arpRate = v as any }"
							@arp-octaves-change="(v) => { melodyUi.arpOctaves = v as any }"
							@arp-tones-change="(v) => { melodyUi.arpTones = v as any }"
							@arp-skip-change="(v) => { melodyUi.arpSkip = v }" />
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
					<!-- The logo is the link back to the main site (PR 92; it was a link under the frame).
						 In the installed app it opens in the browser, not in the app's window. -->
					<template #brand>
						<a class="topbar-home" href="/" title="Return to Ephemeral Wave"
							:target="pwa.state.standalone ? '_blank' : undefined"
							:rel="pwa.state.standalone ? 'noopener' : undefined">
							<img class="topbar-logo" src="../assets/eWaveLogo1.png" alt="Ephemeral Wave: return to the main site">
						</a>
					</template>
					<!-- The gear: Theme and MIDI (SettingsMenu.vue; PR 92, option A of three mockups).
						 Not in phone mode, where themes are in the ☰ menu and MIDI isn't offered. -->
					<template v-if="!phoneActive" #tools-right>
						<SettingsMenu :midi="midi" />
					</template>
				</ProjectControls>
			</section>
		</Teleport>

		<!-- LAYOUT START
			 Laid out like one piece of hardware: the transport and the Step Sequencer, with the
			 machine rail beside them (the big screen until PR 108); under them Sound (three rows, each filled edge to edge) and Compose,
			 ending on one line. Under 1200 px, Sound, Effects and Compose are tabs under the steps
			 (data-tab says which one shows). -->
		<div v-show="!phoneActive" class="ds-grid" :data-tab="activeTab">

			<!-- The machine rail (PR 108, where the big screen was): the scope and the spectrogram,
				 then a row per machine (only Rhythm, the synth lane, so far: its LED mutes it, its
				 level is the lane's volume, its steps in their colours) -->
			<MachineRail v-if="synthInstrument" class="ds-rail" :analyser="analyser" :sampleRate="audioCtx.sampleRate"
				:active="viewSource.active" :machines="railMachines" :chosen="machine"
				:currentStep="currentStep" :playing="isPlaying" @toggle-mute="onRailMute" @update:level="onRailLevel"
				@update:pedals="(id: string, v: number) => { if (id === 'bass') bassLane.pedals = v; else rhythmPedals = v; }" :meter="machineLevel"
				@choose="(id: string) => { machine = id as any; }"
				:slots="slotView" :currentSlot="currentSlot" :queuedSlot="queuedSlot" v-model:copyArmed="copyArmed"
				@choose-slot="chooseSlot"
				:chain="chain" :chainOn="chainOn" :chainUsable="chainUsable" :chainPlaying="chainPlaying"
				@chain-cell="setChainCell" @toggle-chain="toggleChain" />

			<!-- Transport: Volume, Tempo, Swing, then Sounds and Patterns side by side, then Play -->
			<section class="pt-card transport-card ds-transport">
				<div class="transport-row">
					<div class="transport-knobs">
						<!-- Volume -->
						<div class="position-relative text-center knob-wrap">
							<!-- The LFO's Level target shows on it (a dot and an arc; LfoModKnob reads the view) -->
							<LfoModKnob :lfoView="lfoView" valueKey="level" rangeKey="levelRange" midi-id="transport.volume" v-model="volume" label="Volume" :value-text="`${Math.round(volume * 100)}%`" :min="0" :max="1" :step="0.01" size="medium"
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
							<!-- Tap tempo (PR 88): in the knob's top-right corner, so nothing moves -->
							<button type="button" class="tap-btn hw-cap hw-cap-sm" :class="{ 'is-counting': tapCount > 0 && tapCount < 4 }"
								:aria-label="tapLabel" :title="tapLabel" @pointerdown.prevent="onTap"
								@keydown.enter.prevent="onTap">TAP</button>
							<div class="tempo-stepper" role="group" aria-label="Tempo">
								<button class="stepper-btn hw-cap hw-cap-sm" type="button" title="Tempo −1"
									@mousedown.prevent="startTempoRepeat(-1)" @touchstart.prevent="startTempoRepeat(-1)"
									@mouseup.prevent="stopTempoRepeat" @mouseleave="stopTempoRepeat">−</button>

								<div class="stepper-value" :class="{ 'on-stop': TEMPO_DETENTS.includes(tempo) }" aria-live="polite"
									:title="`${tempo} BPM`">{{ tempo }}</div>

								<button class="stepper-btn hw-cap hw-cap-sm" type="button" title="Tempo +1"
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
						<!-- While Bass is chosen they're Bass's (src/lib/machines/bassPresets.ts, PR 117) -->
						<PresetButtons v-if="!bassChosen" title="Sound presets" dice-label="Random sound" :presets="PRESETS" :active="activePresetId"
							@choose="choosePreset" @random="rollRandomSound" />
						<PresetButtons v-else title="Bass sounds" dice-label="Random bass sound" :presets="BASS_SOUNDS" :active="activeBassSoundId"
							@choose="chooseBassSound" @random="rollBassSound" />
						<PresetButtons v-if="!bassChosen" title="Pattern presets" dice-label="Random pattern" :presets="PATTERNS"
							:active="activePatternId" @choose="choosePattern"
							@random="rollRandomPattern" />
						<PresetButtons v-else title="Bass patterns" dice-label="Random bass pattern" :presets="BASS_PATTERNS"
							:active="activeBassPatternId" @choose="chooseBassPattern" @random="rollBassPattern" />
					</div>

					<!-- Play (+ the MIDI fallback) -->
					<div class="transport-right">
						<button type="button" class="pt-btn btn-lg btn3d" data-keeps-pad-settings data-keeps-brush @click="onPlayClick"
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
					</div>
				</div>
			</section>

			<!-- Step Sequencer -->
			<section class="pt-card step-card ds-steps" v-if="synthInstrument">
				<div class="pt-subheader step-sequencer-subheader">
					<div class="channel-caption d-flex align-items-center gap-2">
						<div class="mute-dot" :class="{ muted: bassChosen ? bassLane.muted : synthInstrument.muted }"
							@click="onRailMute(machine)" role="button"
							:title="(bassChosen ? bassLane.muted : synthInstrument.muted) ? 'Muted' : 'Playing'"></div>
						<h2 class="pt-title">Step Sequencer<span class="ds-which"> · {{ bassChosen ? 'Bass' : 'Rhythm' }}</span></h2>

						<!-- No Vol knob while there's one lane (PR 92): the Volume knob is enough. The lane's
							 volume (channelVolume) is still saved and played; it comes back as each
							 machine's level in the machines' rail. -->

						<!-- The Repeats brush: pick ×2–×4, then click or drag across pads to give them that
						     many quick hits (a pad that has them already goes back to one). It stays
						     picked until Esc, its lit button, or a click outside the pads' frame. -->
						<div v-if="!bassChosen" class="repeat-brush" role="group" aria-label="Repeats brush"
							title="Pick a number, then click or drag across pads to give them that many quick hits. Click a pad again for one hit. Esc, the lit button or a click elsewhere puts the brush down.">
							<span class="repeat-brush__label" aria-hidden="true">Repeats</span>
							<button v-for="n in BRUSH_COUNTS" :key="n" type="button" class="vel-btn hw-cap hw-cap-sm hw-led-left"
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
							<div v-if="!bassChosen" class="mm-opt" role="menuitem" @click.stop="clearRepeats()">
								<span>Clear Repeats</span>
							</div>
							<div class="mm-reset" role="menuitem" @click.stop="bassChosen ? resetBassPads() : resetSynthPadsToDefaults()">
								Reset Pads
							</div>
						</div>
					</div>
					<div v-if="stepsAdvanced.open" class="mm-overlay" @click="stepsAdvanced.open = false"></div>
				</div>

				<!-- While the Repeats brush is picked: a dashed frame round the pads, and a tag on
				     it saying so and how to finish (neither changes the layout) -->
				<div class="step-card__grid" :class="{ 'is-brushing': !!repeatBrush }">
					<div v-if="repeatBrush" class="brush-note" role="status">
						Painting ×{{ repeatBrush }} repeats<span class="brush-note__how"> · Esc or click elsewhere to finish</span>
					</div>
					<BassPads v-if="bassChosen" :lane="bassLane" :wave="bass.wave.value" :current-step="currentStep"
						:nearestNote="nearestNote" :showVelocity="showVelocity" :showPitch="showPitch"
						@open-pad-settings="({ index, anchorRect }) => openBassPad(index, anchorRect)" />
					<SynthStepGrid v-else :name="synthInstrument.name" :current-step="currentStep" :min-hz="MIN_PAD_HZ"
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
			<section id="sound-panel" class="ds-section ds-sound" aria-labelledby="sound-title" :data-bass="bassChosen ? '' : undefined">
				<h2 id="sound-title" class="ds-section-title">Sound<span class="ds-which"> · {{ bassChosen ? 'Bass' : 'Rhythm' }}</span></h2>
				<!-- The Bass machine's: wave tiles and Sub, its screen, its knobs; the pedals stay (the Effects card) -->
				<BassSound v-show="bassChosen" :sound="bass" :noteHz="bassScreenHz" :noteName="nearestNote(bassScreenHz)" />

				<!-- Row 1: the waves, beside FM and Unison -->
				<div class="sound-row sound-row-1">
					<div class="module generators">
						<SectionWrap id="generators" title="" v-model="collapsibleState['generators']">
							<div class="gen-panel osc-panel">
								<div class="wave-row" role="radiogroup" aria-label="Waveforms">
									<div v-for="t in WAVE_TILES" :key="t.value" class="wave-cell">
										<WaveButton :modelValue="litWave" :value="t.value" :label="t.label"
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
									<!-- Random (PR 83, option B of two mockups): a tall tile in a narrow ninth
										 column. It never stays down; while the pads play a mix it shows it -->
									<div class="wave-cell rw-cell">
										<RandomWaveTile :waves="padWaves" :palettes="WAVE_PALETTES" :mixed="wavesMixed"
											:disabled="!randomPoolArray.length" :title="randomTooltip" @roll="applyRandomWaves()" />
									</div>
								</div>
								<!-- Sample: a sound recorded from the microphone, a strip under the tiles (PR 95,
									 option B of two mockups; A was a tall tile beside Random) -->
								<div class="st-strip">
									<SampleTile :sample="sample" :state="recorder.state.value" :level="recorder.level.value"
										:lit="litWave === 'sample'" v-model:length="sampleLength"
										:randomIncluded="randomPool.sample" @toggle-random="onToggleRandom"
										@pick="applyWaveToAll('sample')" @record="recordSample()" />
								</div>
							</div>
						</SectionWrap>
					</div>

					<div class="sound-stack">
						<!-- FM and Unison: a ribbon switch, a screen you drag, keys and mini knobs (PR 77) -->
						<div class="module fm">
							<FMModule :color="'#3F51B5'" :showToggle="false" :lfoView="lfoView" v-model:enabled="fmEnabled"
								v-model:modFreq="fmModFreq" v-model:index="fmIndex" v-model:ratio="fmRatio" />
						</div>

						<div class="module unison">
							<UnisonEffect :showToggle="false" v-model:enabled="unisonEnabled" v-model:voices="unisonVoices"
								v-model:detune="detuneCents" v-model:spread="stereoSpread" />
						</div>
					</div>
				</div>

				<!-- Row 2: Envelope, Pitch and Filter, each a screen you drag with mini knobs beside it (PR 77) -->
				<div class="sound-row sound-row-2">
					<div class="module envelope">
						<EnvelopeModule :color="'#4CAF50'" :showToggle="false" v-model:enabled="envelopeEnabled"
							v-model:attackMs="ampEnvAttackMs" v-model:decayMs="ampEnvDecayMs"
							:hit="hitPicture" :hitText="hitText" />
					</div>

					<div class="module pitch-env">
						<PitchEnvModule :enabled="pitchEnvEnabled" v-model:semitones="pitchEnvSemitones"
							v-model:decayMs="pitchEnvDecayMs" v-model:mode="pitchMode"" />
					</div>

					<div class="module filter">
						<FilterModule :color="'#FF5722'" :showToggle="false" v-model:enabled="filterEnabled"
							v-model:cutoff="filterCutoff" v-model:resonance="filterResonance"
							v-model:envAmount="filterEnvAmount" v-model:envDecayMs="filterEnvDecayMs"
							:lfoView="lfoView" :spectrum="viewSource">
							<template #tools>
								<VelSwitch v-model="velocityRouting.cutoff.value" :name="VEL_SWITCHES.cutoff.label" :tip="VEL_SWITCHES.cutoff.tip" :disabled="!filterEnabled"
								:note="velNote.key === 'cutoff' ? velNote.text : ''" @switched-on="onVelSwitchedOn('cutoff')" />
							</template>
						</FilterModule>
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
									<!-- An LED, so the ribbon reads as the card's switch, not a label (PR 74) -->
									<span class="noise-ribbon-led" aria-hidden="true"></span>
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
												v-model:mask="noiseMask" :steps="steps" :velocities="velocities" v-model:attackBurst="noiseAttackBurst"
												v-model:burstMs="noiseBurstMs" :color="'#9C27B0'" />
										</div>
									</div>
								</SectionWrap>
							</div>
						</div>

						<!-- LFO -->
						<!-- No header: the card's ribbon is its name and its switch, and RETRIG is on the
						     card (LFOGroup.vue, PR 75). SectionWrap stays for the card's frame. -->
						<div class="module mod lfo-card">
							<SectionWrap id="mod" title="LFO" v-model="collapsibleState['mod']">
								<LFOGroup :showToggle="false" :pulseInUse="pulseInUse" :fmInUse="fmInUse" v-model="lfoEnabled"
									v-model:depth="lfoDepth" :target="lfoTarget" @update:target="chooseLfoTarget" v-model:waveform="lfoWaveform"
									v-model:division="lfoDivision"
									v-model:retrigger="lfoRetrigger" v-model:bipolar="lfoBipolar" :depthMax="lfoDepthMax"
									:steps="steps" color="#00BCD4" />
							</SectionWrap>
						</div>
					</div>

					<div id="effects-panel" class="module fx">
						<SectionWrap id="fx" title="Effects" v-model="collapsibleState['fx']">
							<div class="fx-pair pedalboard">
								<DelayEffect :showToggle="false" :audioCtx="audioCtx" v-model:enabled="delayEnabled"
									:tempo="tempo" v-model:division="delayDivision" v-model:delayTime="delayTime"
									v-model:delayFeedback="delayFeedback"
									v-model:delayMix="delayMix" v-model:toneEnabled="delayToneEnabled"
									v-model:toneHz="delayToneHz" v-model:toneType="delayToneType" v-model:pingPong="delayPingPong" />
								<DriveEffect :showToggle="false" v-model:enabled="driveEnabled" :driveType="'overdrive'"
									v-model:driveAmount="driveAmount" v-model:driveTone="driveTone"
									v-model:driveMix="driveMix" v-model:crush="driveCrush" />
								<ReverbEffect :showToggle="true" :audioCtx="audioCtx" v-model:enabled="reverbEnabled"
									v-model:mix="reverbMix" v-model:decay="reverbDecay" v-model:tone="reverbTone"
									v-model:pre-division="reverbPreDivision" v-model:reverse="reverbReverse"
									v-model:swell="reverbSwell" :tempo="tempo" />
								<!-- The tape pedal, last in the chain: a low deck under the three pedals
								     (option C of three mockups; the phone's FX page has it as a pedal) -->
								<TapeEffect v-model:enabled="tapeEnabled" v-model:age="tapeAge" v-model:wobble="tapeWobble"
									v-model:mode="tapeMode" :playing="isPlaying" layout="deck" />
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
						<PatternTools :steps="editSteps" :velocities="editVelocities" :currentTheme="currentTheme" :nudge="humanizeNudge"
							@update:steps="editSteps = $event" @update:velocities="editVelocities = $event"
							@octave-shift="onEditOctaveShift" @move="onEditMove" />
					</SectionWrap>
				</div>

				<div class="module melody">
					<!-- Its options are on the card since PR 68 (no ⋯ menu) -->
					<SectionWrap id="melody" title="Melody Maker" v-model="collapsibleState['melody']">
							<!-- What Generate makes; Generate is the card's last line (PR 82) -->
							<template #tools>
								<MelodyModeSwitch v-model="melodyUi.mode" />
							</template>
						<MelodyMaker :key="`melody-${resetNonce}`" ref="melodyRef" :frequencies="editPitches"
							:steps="editSteps" :min-freq="editMinHz" :max-freq="editMaxHz" :octave-shift="bassChosen ? -2 : 0" :currentTheme="currentTheme"
							:ratchets="bassChosen ? undefined : synthInstrument?.ratchets" :repeat-notes="bassChosen ? undefined : synthInstrument?.repeatNotes" :repeat-chord="repeatChord"
							:swing="swing" :note-steps="bassChosen ? bassNoteSteps : noteSteps" :playView="playView" :tuner="viewSource"
							:initial-key-root="melodyUi.keyRoot" :initial-key-scale="melodyUi.keyScale"
							:initial-range-preset="melodyUi.rangePreset" :initial-arp-pattern="melodyUi.arpPattern"
							:initial-arp-rate="melodyUi.arpRate" :initial-arp-octaves="melodyUi.arpOctaves"
							:initial-arp-tones="melodyUi.arpTones" :initial-arp-skip="melodyUi.arpSkip"
							:initial-mode="melodyUi.mode"
							@update:frequencies="editPitches = $event" @update:steps="editSteps = $event"
							@octave-shift="onEditOctaveShift($event)"
							:queued-key="queuedKey" @key-chosen="onKeyChosen" @scale-chosen="onScaleChosen"
							@mode-change="(v) => { melodyUi.mode = v }"
							@key-root-change="(r) => { onKeyRootChange(r); melodyUi.keyRoot = r as any; }"
							@key-scale-change="(s) => { melodyUi.keyScale = s as any }"
							@range-preset-change="(p) => { melodyUi.rangePreset = p as any }"
							@arp-pattern-change="(v) => { melodyUi.arpPattern = v as any }"
							@arp-rate-change="(v) => { melodyUi.arpRate = v as any }"
							@arp-octaves-change="(v) => { melodyUi.arpOctaves = v as any }"
							@arp-tones-change="(v) => { melodyUi.arpTones = v as any }"
							@arp-skip-change="(v) => { melodyUi.arpSkip = v }" />
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
		<!-- A share link's project just opened: press Play (ShareNotice.vue) -->
		<ShareNotice :playing="isPlaying" @play="onSharePlay" />
		<!-- File → Export audio… (src/audio/export/exportFiles.ts makes the files) -->
		<ExportDialog :open="exportOpen" :options="exportOptions" :notes="oneShotNotes" :bpm="tempo"
			:effectsOn="exportEffectsOn" :lfoBars="exportLfoBars" :chain="exportChain?.letters ?? null" :slotName="SLOT_NAMES[currentSlot]" :bassOn="!!exportState.bass" :bending="driveEnabled || tapeEnabled" :busy="isExporting" :progress="exportProgress" :simple="phoneActive"
			@export="runExport" @close="exportOpen = false" />
		<PadSettingsPopover :key="padSettings.name ? `${padSettings.name}-${padSettings.index}` : 'pad-popover'"
			v-model:open="padPopover.open" v-model:hz="currentPadHz" v-model:wave="currentPadWave" :hasSample="!!sample"
			v-model:noiseEnabled="padNoiseEnabled" :noiseCardOff="!noiseEnabled" v-model:ratchet="currentPadRatchet" v-model:repeatNotes="currentPadRepeatNotes" :minHz="MIN_PAD_HZ" :maxHz="MAX_PAD_HZ"
			:anchorRect="padPopover.anchorRect" :title="padPopover.title" @audition="hz => auditionPad(padSettings.index, hz)" />
		<!-- A Bass pad's ⋮: its note only -->
		<PadSettingsPopover :key="`bass-${bassPad.index}`" v-model:open="bassPad.open" v-model:hz="bassPadHz"
			:minHz="BASS_MIN_HZ" :maxHz="BASS_MAX_HZ" :anchorRect="bassPad.anchorRect" :title="`Bass step ${bassPad.index + 1}`"
			@audition="hz => auditionBass(hz)" />
	</div>
</template>

<script setup lang="ts">
// IMPORTS START
import { ref, reactive, watch, onMounted, onBeforeUnmount, nextTick, computed, markRaw, shallowRef } from 'vue';
import Knob from './Knob.vue';
import DelayEffect from './modules/DelayEffect.vue';
import { DEFAULT_DELAY_DIVISION, DEFAULT_DELAY_TIME, DEFAULT_TEMPO, followDelaySync } from '../lib/delaySync';
import { DEFAULT_PRE_DIVISION, followPreDelay } from '../audio/reverb/preDelay';
import { DEFAULT_SWELL } from '../audio/reverb/reverse';
import { TEMPO_DETENTS, SWING_DETENTS, TRIPLET_SWING } from '../lib/knobDetents';
import { shortestInterval, transposePitches, remapScale, nearestRootHz, patternCenterHz, chordPitchClasses } from '../lib/melody/theory';
import DriveEffect from './modules/DriveEffect.vue';
import UnisonEffect from './modules/UnisonEffect.vue';
import LFOGroup from './modules/LFOGroup.vue';
import MachineRail from './MachineRail.vue';
import type { ViewSource } from './cardViews';
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
import LfoModKnob from './LfoModKnob.vue';
import SettingsMenu from './SettingsMenu.vue';
import { usePwa } from '../composables/usePwa';
import { LFO_DEPTH_MAX, LFO_DEFAULT_DEPTH, type LfoTarget } from '../audio/lfo';
import { clampRatchet, ratchetHits, ratchetPitches, clampRepeatNotes, type RepeatNotes } from '../audio/ratchet';
import { UNISON_VOICES_MAX, UNISON_VOICES_MIN } from '../audio/unison';
import { PULSE_WIDTH_MIN, PULSE_WIDTH_MAX, RANDOM_WAVE_IDS, WAVE_IDS, WAVE_LABELS, padWaveLabel, type PadWave } from '../audio/waves';
import { encodeSample, sampleSeconds, SAMPLE_LENGTH_DEFAULT, SAMPLE_ROOT_HZ, SAMPLE_WAVE } from '../audio/sample';
import MelodyMaker from './MelodyMaker.vue';
import RandomWaveTile from './RandomWaveTile.vue';
import SampleTile from './SampleTile.vue';
import { useSampleRecorder } from '../composables/useSampleRecorder';
import MelodyModeSwitch from './MelodyModeSwitch.vue';
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
import TapeEffect from './modules/TapeEffect.vue';
import { TAPE_DEFAULTS, type TapeMode } from '../audio/tape';

// Live sound engine
import { useLiveEngine } from '../audio/liveEngine';
import { createRhythm, rhythmVoice } from '../lib/machines/rhythm';
import { bassVoice, createBass, createBassLane } from '../lib/machines/bass';
import { useLfoVisual } from '../composables/useLfoVisual';
import { usePlayhead } from '../composables/usePlayhead';
import PresetButtons from './PresetButtons.vue';
import { BASS_PATTERNS, BASS_SOUNDS, bassPatternFrom, bassPatternKey, bassSoundKey, bassSoundOf, randomBassPattern, randomBassSound, type BassStep } from '../lib/machines/bassPresets';
import BassPads from './BassPads.vue';
import BassSound from './BassSound.vue';
import LevelMeter from './LevelMeter.vue';
import ExportDialog from './ExportDialog.vue';
import ShareNotice from './ShareNotice.vue';
import { buildExportFiles, renderHit, DEFAULT_EXPORT_OPTIONS, type ExportOptions } from '../audio/export/exportFiles';
import { hitSeconds, formatLength, formatPeak, type HitPicture } from './hitView';
import { peakOf } from '../lib/export/audio';
import { midiNoteOf, midiToHz, notesInRange } from '../lib/export/midi';
import { exportNames, keyLabel } from '../lib/export/names';
import { zipFiles } from '../lib/export/zip';
import { PRESETS } from '../lib/presets/library';
import { applyPreset, soundKey } from '../lib/presets/presets';
import { randomPreset } from '../lib/presets/random';
import { PATTERNS } from '../lib/patterns/library';
import { applyPattern, patternKey } from '../lib/patterns/patterns';
import { moveList, MOVED_LANE_FIELDS, type MoveKind } from '../lib/patterns/move';
import { bassOf, emptyBass, loadBassIntoLane } from '../lib/patterns/slots';
import { bassDefaultHz } from '../lib/project/snapshot';
import { BASS_MAX_HZ, BASS_MIN_HZ } from '../audio/bass';
import { chainCells, cycleCell, emptyChain, emptyRhythm, emptySlots, loadIntoLane, mapSlotPitches, nextChainCell, rhythmOf, slotFromLane, slotHasSteps, SLOT_NAMES, type Chain, type Slots } from '../lib/patterns/slots';
import { addTap, tapBpm } from '../lib/tapTempo';
import { padHue, spectrumColour, spectrumHue } from '../lib/padColour';
import { randomPattern } from '../lib/patterns/random';
import {
	lfoCutoffAt, lfoCutoffSwing, lfoPulseWidthAt, lfoPulseWidthRange, lfoBendAt, lfoBendRange,
	lfoFmAmountAt, lfoFmAmountRange, lfoLevelAt, lfoLevelRange, type LfoView,
} from '../lib/lfoVisual';
import { lfoAlignBars, NOISE_STOPS, type NoiseKey } from '../audio/synthHelpers';

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

// RHYTHM MACHINE START
// The synth lane's sound settings, as refs (src/lib/machines/rhythm.ts), under the names
// this file has always used for them
const rhythm = createRhythm({ maxVoices: unisonMaxVoices, steps: stepLength.value });
const {
	envelope: { enabled: envelopeEnabled, attackMs: ampEnvAttackMs, decayMs: ampEnvDecayMs },
	filter: { enabled: filterEnabled, cutoff: filterCutoff, resonance: filterResonance, envAmount: filterEnvAmount, envDecayMs: filterEnvDecayMs },
	noise: { enabled: noiseEnabled, color: noiseColor, amount: noiseAmount, mask: noiseMask, attackBurst: noiseAttackBurst, burstMs: noiseBurstMs },
	unison: { enabled: unisonEnabled, voices: unisonVoices, detuneCents, stereoSpread },
	lfo: {
		enabled: lfoEnabled, rate: lfoRate, depth: lfoDepth, depths: lfoDepths, target: lfoTarget, waveform: lfoWaveform,
		sync: lfoSync, division: lfoDivision, retrigger: lfoRetrigger, bipolar: lfoBipolar,
	},
	fm: { enabled: fmEnabled, modFreq: fmModFreq, index: fmIndex, ratio: fmRatio },
	pitchEnv: { enabled: pitchEnvEnabled, semitones: pitchEnvSemitones, decayMs: pitchEnvDecayMs, mode: pitchMode },
	pulse: { width: pulseWidth },
	sample,
	sampleLength,
	randomWaves,
	velocity: velocityRouting,
} = rhythm;
// RHYTHM MACHINE END

// BASS MACHINE START
// The Bass machine (the plan's item 4; src/lib/machines/bass.ts, src/audio/bass.ts): its
// sound, and its lane (the current slot's Bass track as it's being edited, with its mute and
// level). `machine` is the one the pads and the Sound section show (not saved).
const bass = createBass();
const bassLane = createBassLane(STEP_COUNT, 55);
const machine = ref<'rhythm' | 'bass'>('rhythm');
const bassChosen = computed(() => machine.value === 'bass');
// The rail's mixer (PR 116): how much of Rhythm goes through the pedals (Bass's is bassLane.pedals)
const rhythmPedals = ref(1);

// The rail's rows (MachineRail.vue): Rhythm (the synth lane) and Bass
const railMachines = computed(() => {
	const r = synthInstrument.value;
	return [
		...(r ? [{ id: 'rhythm', name: 'Rhythm', steps: r.steps, pitches: r.pitches ?? [], velocities: r.velocities, muted: r.muted, level: r.channelVolume, pedals: rhythmPedals.value }] : []),
		{ id: 'bass', name: 'Bass', steps: bassLane.steps, pitches: bassLane.pitches, velocities: bassLane.velocities, hueScale: 4, muted: bassLane.muted, level: bassLane.level, pedals: bassLane.pedals },
	];
});
function onRailMute(id: string) {
	if (id === 'bass') bassLane.muted = !bassLane.muted;
	else if (synthInstrument.value) toggleMute(synthInstrument.value.name);
}
// A Bass pad's ⋮: its note (PadSettingsPopover with no wave, noise or repeats)
const bassPad = reactive({ open: false, index: 0, anchorRect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } });
function openBassPad(index: number, r: DOMRect) {
	if (bassPad.open && bassPad.index === index) { bassPad.open = false; return; }
	bassPad.index = index;
	bassPad.anchorRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
	bassPad.open = true;
}
const bassPadHz = computed({
	get: () => bassLane.pitches[bassPad.index] ?? 55,
	set: (hz: number) => {
		if (!bassPad.open) return; // the popover settles its value as it mounts
		const p = [...bassLane.pitches];
		p[bassPad.index] = hz;
		bassLane.pitches = p;
	},
});
// A Bass note, now, as its pads play it (only while stopped: playing, the pattern plays it)
function auditionBass(hz: number) {
	if (bassLane.muted || isPlaying.value) return;
	const play = () => playBassNow(hz, 0.8);
	if (audioCtx.state === 'running') play();
	else audioCtx.resume().then(play, () => { });
}
// The note Bass's screen draws: its first note that's on, or the key's root
const bassScreenHz = computed(() => {
	const i = bassLane.steps.findIndex(Boolean);
	return i >= 0 ? bassLane.pitches[i] : bassDefaultHz(currentDefaultHz.value);
});
// The ⋯ menu's Reset Pads, for Bass: every step off, full velocity, the key's root, no accent, slide or tie
function resetBassPads() {
	stepsAdvanced.open = false;
	const n = stepLength.value, hz = bassDefaultHz(currentDefaultHz.value);
	Object.assign(bassLane, {
		steps: Array(n).fill(false), velocities: Array(n).fill(1), pitches: Array(n).fill(hz),
		accents: Array(n).fill(false), slides: Array(n).fill(false), ties: Array(n).fill(false),
	});
}
function onRailLevel(id: string, v: number) {
	if (id === 'bass') bassLane.level = v;
	else if (synthInstrument.value) synthInstrument.value.channelVolume = v;
}
// BASS MACHINE END

const showVelocity = ref(false);
const showPitch = ref(false);

const melodyRef = ref<(InstanceType<typeof MelodyMaker> & {
	getUi?: () => any;
	setUi?: (u: any) => void;
	generate?: () => void;
}) | null>(null);
// The phone's Key page has a Melody Maker of its own

const melodyUi = reactive<MelodyUi>({
	keyRoot: 'A',
	keyScale: 'naturalMinor', // so the first Generate makes a melody (None gave every pad the key)
	rangePreset: 'mid',
	arpPattern: 'up',
	arpRate: '1/16',
	arpOctaves: 1,
	arpTones: 'chord',
	arpSkip: false,
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

// A click anywhere else puts the brush down (PR 74), so pads go back to turning on and off
// without having to find the lit button: anywhere but the pads' frame, the brush's own
// buttons, and what goes with painting (data-keeps-brush): Play / Stop, to hear it, and Undo /
// Redo, to take a stroke back and carry on. The click still does its own job.
function onBrushPointerDown(e: PointerEvent) {
	if (!repeatBrush.value) return;
	const t = e.target as Element | null;
	if (!t?.closest || t === document.documentElement) return; // the page's scrollbar
	if (t.closest('.step-card__grid, .repeat-brush, [data-keeps-brush]')) return;
	repeatBrush.value = null;
}
onMounted(() => document.addEventListener('pointerdown', onBrushPointerDown, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onBrushPointerDown, true));

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

// The settings are the Rhythm machine's (RHYTHM MACHINE, above)

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

// Window listeners START
// (The big screen and its views lived here until PR 108: its scope and spectrogram are the
// machine rail's now, MachineRail.vue; the spectrum, the hit and the tuner are drawn in the
// Filter, Envelope and Melody Maker cards, cardViews.ts.)

onMounted(() => {

	window.addEventListener('mouseup', handleMouseUp);

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

// Window listeners END

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

const selectedWaveform = ref<PadWave>("sine");
const waves = WAVE_IDS;

// The Waveforms panel's tiles (src/audio/waves.ts lists the waves)
const WAVE_PALETTES: Record<PadWave, string[]> = {
	sine: ['#fff', '#7bd0ff', '#666'],
	triangle: ['#7cf3c9', '#b47aff', '#ffd06b'],
	sawtooth: ['#ff9a62', '#ffd06b', '#75f0ff'],
	square: ['#a2f5a6', '#7bd0ff', '#ff7eb3'],
	pulse: ['#ff7eb3', '#ffd06b', '#b47aff'],
	organ: ['#ffb86b', '#ff7eb3', '#7bd0ff'],
	hollow: ['#7cf3c9', '#7bd0ff', '#a2f5a6'],
	glass: ['#e6c6ff', '#7bd0ff', '#fff'],
	sample: ['#ff6b6b', '#ffd06b', '#fff'],
};
const WAVE_TILES = WAVE_IDS.map(value => ({
	value, label: WAVE_LABELS[value].toUpperCase(), palette: WAVE_PALETTES[value],
}));

// The waves Random picks from (the tiles' dice badges, `randomWaves`, the Rhythm machine's).
// Saved with the project since PR 85 (synth.randomWaves), so File → New, a sound preset and
// opening a project set it; before, it was the page's own and carried over from project to
// project. The recording can be in it too (PR 100; the Sample strip's dice badge, shown once
// there's a recording): 'sample' after the eight, in the pool only while there is a recording.
const randomPool = computed<Record<PadWave, boolean>>(() =>
	Object.fromEntries(RANDOM_WAVE_IDS.map(w => [w, randomWaves.value.includes(w)])) as Record<PadWave, boolean>
);

const randomPoolArray = computed<PadWave[]>(() =>
	RANDOM_WAVE_IDS.filter(w => randomPool.value[w] && (w !== SAMPLE_WAVE || !!sample.value)));

function onToggleRandom(w: PadWave, next: boolean, only = false) {
	if (only) randomWaves.value = [w];
	else randomWaves.value = RANDOM_WAVE_IDS.filter(k => (k === w ? next : randomPool.value[k]));
}

const randomTooltip = computed(() =>
	randomPoolArray.value.length
		? `Random from: ${randomPoolArray.value.map(w => padWaveLabel(w)).join(', ')}`
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

function applyWaveToAll(w: PadWave) {
	selectedWaveform.value = w;
	const inst = synthInstrument.value as any;
	if (!inst) return;
	inst.waveforms = Array(stepLength.value).fill(w);
}

// The wave every pad plays, or null while they play a mix (after Random, or a pad's wave
// changed in its ⋮ menu). Only that wave's tile is lit; with a mix, Random is. The main wave
// (selectedWaveform) stays as it was: MIDI notes and the one-shot export play it.
const litWave = computed<PadWave | null>(() => {
	const inst = synthInstrument.value as any;
	const fallback = selectedWaveform.value;
	if (!inst) return fallback;
	const waves = inst.waveforms as PadWave[] | undefined;
	if (!Array.isArray(waves)) return fallback;
	let first: PadWave | null = null;
	for (let i = 0; i < stepLength.value; i++) {
		const w = (waves[i] ?? fallback) as PadWave;
		if (first === null) first = w;
		else if (w !== first) return null;
	}
	return first ?? fallback;
});
const wavesMixed = computed(() => litWave.value === null);
// Each pad's wave, which the Random tile shows while they play a mix
const padWaves = computed<PadWave[]>(() => {
	const inst = synthInstrument.value as any;
	const fallback = selectedWaveform.value;
	return Array.from({ length: stepLength.value }, (_, i) => (inst?.waveforms?.[i] ?? fallback) as PadWave);
});

function applyRandomWaves() {
	const inst = synthInstrument.value as any;
	if (!inst) return;

	const pool: PadWave[] = randomPoolArray.value.length
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

// Patterns A–D (saved; see PATTERN SLOTS): the four slots, and which one plays. The synth lane
// is the current slot as it's being edited.
const patternSlots = ref<Slots>(emptySlots());
const currentSlot = ref(0);
// The chain (saved; see PATTERN SLOTS): eight cells, each a slot or null, and whether it plays
const chain = ref<Chain>(emptyChain());
const chainOn = ref(false);
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

const currentPadWave = computed<PadWave>({
	get() {
		const inst = instruments.value.find(i => i.name === padSettings.name) as any;
		if (!inst) return selectedWaveform.value as PadWave;
		const i = padSettings.index;
		return (inst.waveforms?.[i] ?? selectedWaveform.value) as PadWave;
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

// Per-pad Noise switch for the pad settings popover. It shows what's heard: Off while the
// Noise card is off, whatever the pad's own mask says. Turned on while the card is off, it
// turns the card on with only this pad's noise on (the mask before couldn't be heard, and
// the pads that had it would otherwise start hissing too); one undo step, as any change.
const padNoiseEnabled = computed<boolean>({
	get() {
		const i = padSettings.index;
		if (!noiseEnabled.value) return false;
		// default "true" (noise allowed) if out of range or not set yet
		return (i >= 0 && i < noiseMask.value.length)
			? (noiseMask.value[i] ?? true)
			: true;
	},
	set(v: boolean) {
		const i = padSettings.index;
		if (i < 0) return;
		if (v && !noiseEnabled.value) {
			noiseMask.value = Array.from({ length: stepLength.value }, (_, j) => j === i);
			if (!(noiseAmount.value > 0)) noiseAmount.value = 0.25;
			noiseEnabled.value = true;
			return;
		}
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

// Every pad an octave up or down (Pattern Tools' arrows, the Melody Maker, the phone's Octave)
function octaveShiftAllSkip(deltaOct) {
	const inst = synthInstrument.value;
	if (!inst) return;

	// Advance the global default so new pads keep tracking the octave.
	globalOctaveOffset.value += deltaOct;

	let moved = 0, skipped = 0;

	for (let i = 0; i < inst.pitches.length; i++) {
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

// Pattern Tools' Move (PR 88): rotate the pattern one step (round the bar's end) or reverse it.
// Each pad's step, velocity, pitch, wave, repeats and noise move together; one undo step (the
// undo history records it like any change). The phone's Pads page has the same.
function movePattern(kind: MoveKind) {
	const inst = synthInstrument.value as any;
	if (!inst) return;
	for (const f of MOVED_LANE_FIELDS) {
		if (Array.isArray(inst[f])) inst[f] = moveList(inst[f], kind);
	}
	noiseMask.value = moveList(noiseMask.value, kind) as boolean[];
	trackEvent('pattern_move', { kind });
}

function onPatternOctaveShift(delta: number) {
	octaveShiftAllSkip(delta);
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
	// The Bass machine follows the key too
	if (semitones) bassLane.pitches = transposePitches(bassLane.pitches, semitones, BASS_MIN_HZ, BASS_MAX_HZ);
	// The other pattern slots move with it: the key is the project's, not one pattern's
	if (semitones) mapOtherSlots((p) => transposePitches(p, semitones, MIN_PAD_HZ, MAX_PAD_HZ),
		(p) => transposePitches(p, semitones, BASS_MIN_HZ, BASS_MAX_HZ));
	selectedKeyRoot.value = root;
	melodyUi.keyRoot = root;
	if (inst && audition) auditionNote(nearestRootHz(root, patternCenterHz(inst.pitches, inst.steps)));
}

// Someone picked a scale: each pad keeps its place in the scale (or goes to the nearest note
// of the new one); to "None", nothing moves
function onScaleChosen({ from, to }: { from: MelodyUi['keyScale']; to: MelodyUi['keyScale'] }) {
	const inst = synthInstrument.value;
	if (inst) inst.pitches = remapScale(inst.pitches, selectedKeyRoot.value, from, to, MIN_PAD_HZ, MAX_PAD_HZ);
	bassLane.pitches = remapScale(bassLane.pitches, selectedKeyRoot.value, from, to, BASS_MIN_HZ, BASS_MAX_HZ);
	mapOtherSlots((p) => remapScale(p, selectedKeyRoot.value, from, to, MIN_PAD_HZ, MAX_PAD_HZ),
		(p) => remapScale(p, selectedKeyRoot.value, from, to, BASS_MIN_HZ, BASS_MAX_HZ));
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

const synthDecay = computed(() => ampEnvDecayMs.value / 1000);

const pulseWidthTip = ref(false);

// VEL SWITCHES START
// The Filter card has a VEL switch (VelSwitch.vue) for the cutoff's amount above (Envelope's,
// Pitch's and Noise's went in PR 67: hard to hear; their amounts stay at 0). Turning it on shows
// what it does: if every step that's on is at full velocity (so the switch can't change anything
// yet), a note under it and a glow on Pattern Tools' Humanize. (Until PR 108 it also showed the
// big screen's filter view for a moment, softer steps dashed.)
type VelKey = 'cutoff';
const VEL_SWITCHES: Record<VelKey, { label: string; tip: string }> = {
	cutoff: { label: 'Velocity shapes Cutoff', tip: 'Softer steps are darker' },
};
const VEL_NOTE_MS = 3500;
const velNote = reactive<{ key: VelKey | null; text: string }>({ key: null, text: '' });
const humanizeNudge = ref(0);
let velNoteTimer: ReturnType<typeof setTimeout> | null = null;

function onVelSwitchedOn(key: VelKey) {
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


// The settings (noiseColor: a continuous morph 0..1, brown → violet) are the Rhythm machine's

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
// PRE: a note value at the tempo ('Off', '1/16' …) and its time in ms, which follows the tempo
// (src/audio/reverb/preDelay.ts)
const reverbPreDivision = ref(DEFAULT_PRE_DIVISION);
const reverbPreDelay = ref(0);
followPreDelay({ tempo, division: reverbPreDivision, ms: reverbPreDelay });
// REV: the reverb backwards, each swell SWELL long (src/audio/reverb/reverse.ts)
const reverbReverse = ref(false);
const reverbSwell = ref(DEFAULT_SWELL);

// Reverb END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Tape START

// The tape pedal, last in the chain (src/audio/tape.ts). Starting values match snapshot.ts.
const tapeEnabled = ref(false);
const tapeAge = ref(TAPE_DEFAULTS.age);       // 0..1: saturation, a duller top, hiss
const tapeWobble = ref(TAPE_DEFAULTS.wobble); // 0..1: wow and flutter
const tapeMode = ref<TapeMode>(TAPE_DEFAULTS.mode); // 'tape' | 'vinyl'

// Tape END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Unison / Detune START


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

// Tap tempo (src/lib/tapTempo.ts): four taps on the beat set the tempo, each one after that
// updates it; a pause of 2 s starts again. On pointerdown, not click, so a tap lands when the
// finger does.
const tapTimes = ref<number[]>([]);
const tapCount = computed(() => tapTimes.value.length);
const tapLabel = computed(() => {
	const n = tapCount.value;
	return n > 0 && n < 4 ? `Tap tempo: ${4 - n} more` : 'Tap tempo: tap four times on the beat';
});
function onTap() {
	tapTimes.value = addTap(tapTimes.value, performance.now());
	const bpm = tapBpm(tapTimes.value, MIN_BPM, MAX_BPM);
	if (bpm != null) setTempoClamp(bpm);
	if (tapTimes.value.length === 4) trackEvent('tap_tempo', { bpm });
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

	// The voice, as the live engine plays it (rhythmVoice: the LFO's rate is its division at
	// the tempo, unison's voices capped as on this screen)
	const voice = rhythmVoice(rhythm, tempo.value);

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
			...voice,
			noise: { ...voice.noise, mask: [...noiseMask.value] },
			sample: sample.value,
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
				preDivision: reverbPreDivision.value,
				preDelay: reverbPreDelay.value,
				reverse: reverbReverse.value,
				swell: reverbSwell.value,
			},
			tape: {
				enabled: tapeEnabled.value,
				age: tapeAge.value,
				wobble: tapeWobble.value,
				mode: tapeMode.value,
			},
		},

		// The Bass machine, unless it's muted or has no step on
		bass: bassLane.muted || !bassLane.steps.some(Boolean) ? undefined : {
			voice: bassVoice(bass),
			level: bassLane.level,
			pedals: bassLane.pedals,
			pattern: bassPatternOf(bassLane),
		},
		// The rail's mixer: how much of Rhythm goes through the pedals
		rhythmPedals: rhythmPedals.value,

		sampleRate: audioCtx?.sampleRate || 48000,
		tailSeconds: 5.0,
	};
});

// A Bass pattern's lists, copied
function bassPatternOf(t: { steps: boolean[]; velocities: number[]; pitches: number[]; accents: boolean[]; slides: boolean[]; ties: boolean[] }) {
	return {
		steps: [...t.steps], velocities: [...t.velocities], pitches: [...t.pitches],
		accents: [...t.accents], slides: [...t.slides], ties: [...t.ties],
	};
}


// Export to wav file END

// -----------------------------------------------------------------------------------------------------------------------------------------

// LFO START

// The settings are the Rhythm machine's (lfoDepths: each target's depth as last set, the
// current target's is lfoDepth)

// A new target picked: the depth set for the old one is kept, and the new one's comes back
// (the first time, LFO_DEFAULT_DEPTH: a little, so the LFO doesn't seem to turn off). Before
// PR 65 the depth went to 0 on every change. One undo step, target and depth together.
function chooseLfoTarget(t: LfoTarget) {
	const from = lfoTarget.value;
	if (t === from) return;
	lfoDepths.value = { ...lfoDepths.value, [from]: lfoDepth.value };
	lfoTarget.value = t;
	lfoDepth.value = lfoDepths.value[t] ?? LFO_DEFAULT_DEPTH[t];
}

// Does anything play the pulse wave? (the LFO's PW target only affects pulse notes): the main
// wave (MIDI notes play it), or any step that's on, in an unmuted lane, set to Pulse
const pulseInUse = computed(() => {
	if (selectedWaveform.value === 'pulse') return true;
	const inst = synthInstrument.value as any;
	if (!inst || inst.muted) return false;
	return (inst.steps as boolean[]).some((on, i) => on && (inst.waveforms?.[i] ?? selectedWaveform.value) === 'pulse');
});


// Does anything use FM? (the LFO's FM target moves the FM card's Amount: nothing while FM is off)
const fmInUse = computed(() => fmEnabled.value && fmIndex.value > 0);

// The Depth knob's range for each target (src/audio/lfo.ts)
const lfoDepthMax = computed(() => LFO_DEPTH_MAX[lfoTarget.value] ?? 100);

// LFO END

// -----------------------------------------------------------------------------------------------------------------------------------------

// Project settings START

// Every setting a project saves, grouped like a saved project (see ProjectState in
// src/lib/project/snapshot.ts). Saving and loading use it, and the live engine gets its groups.
const projectState: ProjectState = {
	ui: { currentTheme, stepLength, collapsibleState, seqOpen },
	transport: { volume, tempo, swing },
	synth: {
		...rhythm,
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
		reverb: { enabled: reverbEnabled, mix: reverbMix, decay: reverbDecay, tone: reverbTone, preDivision: reverbPreDivision, preDelay: reverbPreDelay, reverse: reverbReverse, swell: reverbSwell },
		tape: { enabled: tapeEnabled, age: tapeAge, wobble: tapeWobble, mode: tapeMode },
	},
	instruments,
	bass: { sound: bass, lane: bassLane },
	mixer: { rhythmPedals },
	patterns: { slots: patternSlots, current: currentSlot, chain, chainOn },
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
	fineAnalyser,
	isPlaying,
	currentStep,
	playSynthNote,
	playBassNow,
	machineLevel,
	startLfoIfNeeded,
	togglePlay,
	hardStopSequencer,
	loadSample,
	lfoNow,
	soundingRecently,
	barPosition,
} = useLiveEngine({
	transport: projectState.transport,
	pattern: { lanes: instruments, stepLength, selectedWaveform, noiseMask, repeatChord },
	rhythm,
	bass: projectState.bass,
	rhythmPedals,
	delay: projectState.fx.delay,
	drive: projectState.fx.drive,
	reverb: projectState.fx.reverb,
	tape: projectState.fx.tape,
	onBarStart: () => { chainBar(); runQueued(); },
});

// What the views in the cards read (cardViews.ts): the fine analyser, while anything sounds
// (playing, or a note in the last 1.5 s: MIDI, a preview)
const viewSource: ViewSource = markRaw({
	analyser: fineAnalyser,
	sampleRate: audioCtx.sampleRate,
	active: () => isPlaying.value || soundingRecently(1500),
});

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
	fmAmount: computed(() => (lfoAt('fm') && fmInUse.value && lfoPos.value != null
		? lfoFmAmountAt(fmIndex.value, lfoDepth.value, lfoPos.value) : null)),
	fmAmountRange: computed(() => (lfoAt('fm') && fmInUse.value ? lfoFmAmountRange(fmIndex.value, lfoDepth.value) : null)),
	level: computed(() => (lfoAt('amp') && lfoPos.value != null
		? lfoLevelAt(volume.value, lfoDepth.value, lfoPos.value) : null)),
	levelRange: computed(() => (lfoAt('amp') ? lfoLevelRange(volume.value, lfoDepth.value) : null)),
});

// The installed app opens the main site in the browser (the logo's link)
const pwa = usePwa();

// LFO visualizer END

// -----------------------------------------------------------------------------------------------------------------------------------------

// MELODY MAKER'S PLAYHEAD START

// While playing, the Melody Maker's screen draws a line where the bar is and lights the note
// that sounds (PR 80). `playView` is passed down as one object, like `lfoView`: don't read its
// fields here. `noteSteps` is how long a note sounds, in steps at the tempo: Attack + Decay
// (the engine's naturalEnd), or Decay alone with the envelope off (its gate).
const playView = usePlayhead({ barPosition, isPlaying });
const noteSteps = computed(() => {
	const ms = envelopeEnabled.value ? ampEnvAttackMs.value + ampEnvDecayMs.value : ampEnvDecayMs.value;
	return (ms / 1000) / (60 / tempo.value / 4);
});

// MELODY MAKER'S PLAYHEAD END


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

		// With Bass chosen, the keys play Bass (one note at a time), unless it's muted
		if (bassChosen.value) {
			if (bassLane.muted) return null;
			return () => playBassNow(freq, velocity);
		}

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
// The share notice's Play: the tap that lets audio start (only starts, never stops)
function onSharePlay() {
	if (!isPlaying.value) onPlayClick();
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
// After how many bars the LFO's cycle starts again on a bar line, for the Export dialog's loop
// lengths; 0 while it moves nothing, or with RETRIG (each note starts its own, so any loop fits)
const exportLfoBars = computed(() => (lfoEnabled.value && lfoDepth.value > 0 && !lfoRetrigger.value)
	? lfoAlignBars(lfoDivision.value) : 0);

const exportEffectsOn = computed(() => ({
	delay: delayEnabled.value && delayMix.value > 0,
	reverb: reverbEnabled.value && reverbMix.value > 0,
	noise: noiseEnabled.value && noiseAmount.value > 0,
	tape: tapeEnabled.value && tapeAge.value > 0,
}));

// The chain for the Export dialog (PR 111): each filled cell's pattern, in order (the slot
// showing from the lane; a slot never used is an empty bar), with the pads' shared waves and
// the key's chord; and its cells' letters ("A A B A")
const exportChain = computed(() => {
	const lane = synthInstrument.value;
	if (!lane || !chainUsable.value) return null;
	const n = stepLength.value;
	const cells = chain.value.filter((c): c is number => c != null);
	const bassPatterns = cells.map((slotIdx) => bassPatternOf(slotIdx === currentSlot.value ? bassLane
		: bassOf(patternSlots.value[slotIdx]) ?? emptyBass(n, bassHz())));
	const patterns = cells.map((slotIdx) => {
		const t = rhythmOf(slotIdx === currentSlot.value ? slotFromLane(lane, laneHz()) : patternSlots.value[slotIdx])
			?? emptyRhythm(n, laneHz());
		return {
			active: [...t.steps], velocities: [...t.velocities], pitches: [...t.pitches],
			waveforms: Array.from({ length: n }, (_, i) => (lane as any).waveforms?.[i] ?? selectedWaveform.value),
			ratchets: [...t.ratchets], repeatNotes: [...t.repeatNotes], repeatChord: repeatChord.value,
		};
	});
	return { patterns, bassPatterns, letters: cells.map((c) => SLOT_NAMES[c]) };
});

function openExportDialog() {
	// The chain when it plays in the app (Chain on), else the pattern showing
	exportOptions.play = chainOn.value && exportChain.value ? 'chain' : 'pattern';
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
	Object.assign(exportOptions, phoneActive.value ? { play: options.play, bars: options.bars, ending: options.ending } : options);
	isExporting.value = true;
	try {
		const chainNow = options.play === 'chain' ? exportChain.value : null;
		// With the chain, Bass plays each cell's pattern too
		const bassChain = chainNow && !bassLane.muted && chainNow.bassPatterns.some((p) => p.steps.some(Boolean))
			? { voice: bassVoice(bass), level: bassLane.level, pedals: bassLane.pedals, pattern: chainNow.bassPatterns[0], barPatterns: chainNow.bassPatterns }
			: undefined;
		const files = await buildExportFiles({ ...exportState.value, barPatterns: chainNow?.patterns,
			bass: chainNow ? bassChain : exportState.value.bass }, options, {
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
				key: keyLabel(melodyUi.keyRoot, melodyUi.keyScale), bars: chainNow ? chainNow.patterns.length : options.bars,
				ending: options.ending, chain: !!chainNow,
			});
			downloadFile(names.zip, zipFiles(files), 'application/zip');
		}
		exportOpen.value = false;
		trackEvent('export_audio', {
			bars: chainNow ? chainNow.patterns.length : options.bars, chain: !!chainNow, ending: options.ending, mix: options.mix, stems: options.stems,
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

// The hidden drum lanes' samples (public/audio/*.mp3) are fetched only once one of those lanes
// has a step on (an older project), not on every visit: their UI is hidden, so normally none has.
let samplesRequested = false;
watch(() => instruments.value.some(i => i.type !== 'synth' && !i.isCustom && i.steps?.some(Boolean)), (needed) => {
	if (!needed || samplesRequested) return;
	samplesRequested = true;
	loadAllSamples();
}, { immediate: true });

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
	copyArmed.value = false;
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
	startFirstVisit,
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

async function choosePreset(id: string, track = true) {
	const preset = PRESETS.find(p => p.id === id);
	if (!preset) return;
	applyPreset(projectState, preset);
	choosingPreset.value = id;
	if (track) trackEvent('preset_select', { preset: id });
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
async function choosePattern(id: string, track = true) {
	const pattern = PATTERNS.find(p => p.id === id);
	if (!pattern) return;
	if (track) trackEvent('pattern_select', { pattern: id });
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

// The Bass machine's Sounds and Patterns (PR 117; src/lib/machines/bassPresets.ts): while Bass
// is chosen the boxes are its. A sound sets Bass's sound from its factory sound up; a pattern
// Bass's pattern, from the key's root in its octave. One undo step each. A button is lit while
// Bass's sound or pattern is exactly the preset's (Bass's knobs don't round what they're given).
const activeBassSoundId = computed<string | null>(() => {
	const key = bassSoundKey(bassVoice(bass));
	return BASS_SOUNDS.find((p) => bassSoundKey(bassSoundOf(p.sound)) === key)?.id ?? null;
});
const activeBassPatternId = computed<string | null>(() => {
	const key = bassPatternKey(bassLane);
	return BASS_PATTERNS.find((p) => bassPatternKey(bassPatternFrom(p.steps, bassHz())) === key)?.id ?? null;
});
function applyBassVoice(v: ReturnType<typeof bassSoundOf>) {
	for (const k of ['wave', 'sub', 'cutoff', 'resonance', 'envAmount', 'decayMs', 'accent', 'slideMs'] as const) (bass[k] as any).value = v[k];
}
function chooseBassSound(id: string) {
	const p = BASS_SOUNDS.find((x) => x.id === id);
	if (!p) return;
	applyBassVoice(bassSoundOf(p.sound));
	trackEvent('bass_sound_select', { sound: id });
}
function rollBassSound() {
	applyBassVoice(randomBassSound());
	trackEvent('bass_sound_random');
}
function applyBassSteps(steps: BassStep[]) {
	Object.assign(bassLane, bassPatternFrom(steps, bassHz(), stepLength.value));
}
function chooseBassPattern(id: string) {
	const p = BASS_PATTERNS.find((x) => x.id === id);
	if (!p) return;
	applyBassSteps(p.steps);
	trackEvent('bass_pattern_select', { pattern: id });
}
function rollBassPattern() {
	applyBassSteps(randomBassPattern());
	trackEvent('bass_pattern_random');
}

// Pattern Tools and the Melody Maker edit the machine shown (PR 117): Rhythm's lane, or Bass's
// (its own range, 30–250 Hz). The phone's pages still edit Rhythm's (the phone is part 3).
const editSteps = computed<boolean[]>({
	get: () => (bassChosen.value ? bassLane.steps : steps.value),
	set: (v) => { if (bassChosen.value) bassLane.steps = v; else steps.value = v; },
});
const editVelocities = computed<number[]>({
	get: () => (bassChosen.value ? bassLane.velocities : velocities.value),
	set: (v) => { if (bassChosen.value) bassLane.velocities = v; else velocities.value = v; },
});
const editPitches = computed<number[]>({
	get: () => (bassChosen.value ? bassLane.pitches : padFrequencies.value),
	set: (v) => { if (bassChosen.value) bassLane.pitches = v; else padFrequencies.value = v; },
});
const editMinHz = computed(() => (bassChosen.value ? BASS_MIN_HZ : MIN_PAD_HZ));
const editMaxHz = computed(() => (bassChosen.value ? BASS_MAX_HZ : MAX_PAD_HZ));
// How long a Bass note sounds, in steps, for the Melody Maker's screen
const bassNoteSteps = computed(() => (bass.decayMs.value * 1.6 / 1000) / (60 / tempo.value / 4));

function onEditOctaveShift(delta: number) {
	if (!bassChosen.value) { onPatternOctaveShift(delta); return; }
	// Every Bass pad that stays in its range moves (as Rhythm's arrows do theirs)
	bassLane.pitches = bassLane.pitches.map((hz) => {
		const to = hz * 2 ** delta;
		return to >= BASS_MIN_HZ && to <= BASS_MAX_HZ ? to : hz;
	});
}
function onEditMove(kind: MoveKind) {
	if (!bassChosen.value) { movePattern(kind); return; }
	const n = bassLane.steps.length;
	for (const f of ['steps', 'velocities', 'pitches', 'accents'] as const) (bassLane as any)[f] = moveList(bassLane[f] as any[], kind);
	// A slide or tie joins a step to the next; reversed, it joins the step before (which comes after)
	for (const f of ['slides', 'ties'] as const) {
		const list = bassLane[f];
		bassLane[f] = kind === 'reverse' ? list.map((_, i) => list[(2 * n - 2 - i) % n]) : moveList(list, kind)!;
	}
	trackEvent('pattern_move', { kind, machine: 'bass' });
}

// The very first visit in this browser (useProjectSync) opens a starter beat, so the first
// Play makes a sound: a built-in sound and a built-in pattern, picked at random, their buttons
// lit as if clicked. File → New stays empty (the maintainer's call).
async function startFirstVisit() {
	const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
	const preset = pick(PRESETS), pattern = pick(PATTERNS);
	await choosePreset(preset.id, false);
	await choosePattern(pattern.id, false);
	trackEvent('first_visit', { preset: preset.id, pattern: pattern.id });
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
type QueueKind = 'key' | 'slot';
const queued = shallowRef<{ kind: QueueKind; id: string; run: () => void }[]>([]);
const queuedKey = computed(() => queued.value.find(q => q.kind === 'key')?.id ?? null);
// A pattern slot waiting for the bar (PATTERN SLOTS), as its index
const queuedSlot = computed(() => { const id = queued.value.find(q => q.kind === 'slot')?.id; return id == null ? null : Number(id); });

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

// PATTERN SLOTS START
// Patterns A–D (the plan's item 2, part 1; src/lib/patterns/slots.ts): four patterns per
// project, under the machine rail's rows (option A of PR 108's mockups). A slot holds the
// steps, velocities, pitches and repeats; the sound, the pads' waves and the noise mask are
// shared. The synth lane is always the current slot being edited, so everything that reads or
// changes the pattern (the pads, Pattern Tools, Generate, the pattern presets, the engines,
// the export) works on the current slot as it did on the one pattern.
//
// A slot clicked while playing waits for the next bar's step 1 (the bar queue, with a pulsing
// ghost on its button), as a key does; stopped, or with Shift+click, at once. Copy, then a
// slot: that slot gets a copy of the current pattern and becomes the current one (at once: it
// sounds the same). Each is one undo step. A key or scale picked moves every slot.
const copyArmed = ref(false);

const slotView = computed(() => SLOT_NAMES.map((name, i) => ({
	name,
	// The current slot's steps are the lane's (its stored copy may be behind)
	filled: i === currentSlot.value ? !!synthInstrument.value?.steps.some(Boolean) || bassLane.steps.some(Boolean) : slotHasSteps(patternSlots.value[i]),
})));

function laneHz() { return currentDefaultHz.value; }
function bassHz() { return bassDefaultHz(currentDefaultHz.value); }

// The lane's pattern into the current slot, then the slot `to` into the lane
function switchToSlot(to: number) {
	const lane = synthInstrument.value;
	if (!lane || to === currentSlot.value) return;
	const slots = [...patternSlots.value];
	slots[currentSlot.value] = slotFromLane(lane, laneHz(), bassLane);
	loadIntoLane(lane, slots[to], stepLength.value, laneHz());
	loadBassIntoLane(bassLane, slots[to], stepLength.value, bassHz());
	patternSlots.value = slots;
	currentSlot.value = to;
}

function chooseSlot(to: number, now = false) {
	if (copyArmed.value) { copySlotTo(to); return; }
	// A slot picked by hand while the chain plays takes over: the chain stops following
	if (chainOn.value && isPlaying.value) chainOn.value = false;
	if (to === currentSlot.value) { cancelQueued('slot'); return; } // nothing to wait for
	atNextBar('slot', String(to), () => switchToSlot(to), now);
	trackEvent('pattern_slot', { slot: SLOT_NAMES[to] });
}

function copySlotTo(to: number) {
	copyArmed.value = false;
	const lane = synthInstrument.value;
	if (!lane || to === currentSlot.value) return;
	cancelQueued('slot');
	const from = currentSlot.value;
	const slots = [...patternSlots.value];
	slots[from] = slotFromLane(lane, laneHz(), bassLane);
	slots[to] = slotFromLane(lane, laneHz(), bassLane);
	patternSlots.value = slots;
	currentSlot.value = to; // the lane already holds the copy
	trackEvent('pattern_copy', { from: SLOT_NAMES[from], to: SLOT_NAMES[to] });
}

// The slots other than the current one (the lane is moved by the caller) with their pitches
// passed through f: a key or scale picked moves every pattern
function mapOtherSlots(f: (pitches: number[]) => number[], fBass?: (pitches: number[]) => number[]) {
	patternSlots.value = patternSlots.value.map((slot, i) => (i === currentSlot.value ? slot : mapSlotPitches(slot, f, fBass)));
}
// The chain (PR 110, part 2 of the plan's item 2): eight cells under the slots. While Chain is
// on and a cell is filled, each bar plays the next filled cell's slot (round again after the
// last), from the first cell on Play; the slot switches at the bar line, as a slot clicked does
// (chainBar() from the engine's onBarStart, before the bar queue). A slot picked by hand while
// it plays turns Chain off. A cell clicked steps through — A B C D (Shift+click: back); each
// change is one undo step. The chain playing isn't an edit (comparableProject() in slots.ts).
const chainCell = ref(-1); // the cell playing; −1 before the first bar
const chainPlaying = computed(() => (isPlaying.value && chainOn.value ? chainCell.value : -1));
const chainUsable = computed(() => chainCells(chain.value).length > 0);

function chainBar() {
	if (!chainOn.value) return;
	const cell = nextChainCell(chain.value, chainCell.value);
	if (cell == null) return;
	chainCell.value = cell;
	const slot = chain.value[cell]!;
	cancelQueued('slot');
	if (slot !== currentSlot.value) switchToSlot(slot);
}
watch(isPlaying, () => { chainCell.value = -1; }, { flush: 'sync' }); // before the engine builds the first bar

function setChainCell(i: number, back: boolean) {
	const next = [...chain.value];
	next[i] = cycleCell(next[i], back);
	chain.value = next;
	if (!chainUsable.value) chainOn.value = false;
}
function toggleChain() {
	if (!chainUsable.value) return;
	chainOn.value = !chainOn.value;
	if (chainOn.value) cancelQueued('slot');
	chainCell.value = -1; // from the first cell: at the next bar while playing, or on Play
	trackEvent('pattern_chain', { on: chainOn.value, cells: chainCells(chain.value).length });
}
// PATTERN SLOTS END

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
	// The machine the phone shows (PR 118; the top bar's RHY | BASS), and its lane
	machine: computed({ get: () => machine.value, set: (m: 'rhythm' | 'bass') => { machine.value = m; } }),
	lane: computed(() => (bassChosen.value ? bassLane : synthInstrument.value)),
	bass,
	currentStep, isPlaying, tempo, swing, canUndo, canRedo,
	// The Sounds and Patterns steppers: the machine's own (Bass's while Bass is shown)
	presets: computed(() => (bassChosen.value ? BASS_SOUNDS : PRESETS)),
	patterns: computed(() => (bassChosen.value ? BASS_PATTERNS : PATTERNS)),
	activePresetId: computed(() => (bassChosen.value ? activeBassSoundId.value : activePresetId.value)),
	activePatternId: computed(() => (bassChosen.value ? activeBassPatternId.value : activePatternId.value)),
	keyRoot: computed(() => melodyUi.keyRoot),
	keyScale: computed(() => melodyUi.keyScale),
	keyScaleLabel: computed(() => SCALE_LABELS[melodyUi.keyScale] ?? melodyUi.keyScale),
	minHz: editMinHz, maxHz: editMaxHz,
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
	redo,
	choosePreset: (id: string) => (bassChosen.value ? chooseBassSound(id) : choosePreset(id)),
	randomSound: () => (bassChosen.value ? rollBassSound() : rollRandomSound()),
	choosePattern: (id: string) => (bassChosen.value ? chooseBassPattern(id) : choosePattern(id)),
	randomPattern: () => (bassChosen.value ? rollBassPattern() : rollRandomPattern()),
	audition: auditionNote,
	auditionPad: (i: number, hz: number) => (bassChosen.value ? auditionBass(hz) : auditionPad(i, hz)),
	noteName: nearestNote,
	// The pads' colour of a note: Bass's drawn two octaves up, as on the desktop
	hue: (hz: number) => padHue(bassChosen.value ? hz * 4 : hz),
	fullLayout: () => setPhoneFull(true),
	// Every pad an octave up or down (Pattern Tools' octave arrows)
	octave: (delta: number) => onEditOctaveShift(delta),
	// Shift or reverse the pattern (Pattern Tools' Move), the machine shown's
	move: (kind: MoveKind) => onEditMove(kind),
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

// -----------------------------------------------------------------------------------------------------------------------------------------

// THE HIT START

// One hit of the current sound (PR 94: the screen at rest; since PR 108 drawn behind the
// Envelope card's curve, EnvelopeModule): the one-shot the Export dialog would make
// (renderHit() in exportFiles.ts), rendered offline again whenever the sound changes, one render
// at a time (a change during one renders once more after it), once the settings have been
// still for HIT_SETTLE_MS. Not in phone mode, whose Sound
// page has the classic Envelope card; it renders on leaving phone mode.

// The hit: the one-shot's note (the key's root in the pads' octave) on the main wave
const hitHz = computed(() => midiToHz(midiNoteOf(currentDefaultHz.value)));
const hitPicture = shallowRef<HitPicture | null>(null);
// What it shows, for screen readers (the picture is hidden from them): "Hit: A3 Sine, 420 ms, peak −11.7 dB"
const hitText = ref('');
const hitWanted = computed(() => !phoneActive.value);
let hitDirty = true;
let hitBusy = false;
let hitAgain = false;

async function renderHitNow() {
	if (!synthInstrument.value) return;
	if (hitBusy) { hitAgain = true; return; }
	hitBusy = true;
	hitDirty = false;
	try {
		const state = exportState.value;
		const hz = hitHz.value;
		const wave = selectedWaveform.value;
		const channels = await renderHit(state, hz, wave, hitSeconds(state, wave, hz));
		const name = `${nearestNote(hz)} ${padWaveLabel(wave)}`;
		hitPicture.value = { channels, sampleRate: state.sampleRate, hz, title: name };
		hitText.value = `Hit: ${name}, ${formatLength((channels[0].length / state.sampleRate) * 1000)}, peak ${formatPeak(peakOf(channels))}`;
	} catch (err) {
		console.warn('The hit could not be rendered:', err);
	} finally {
		hitBusy = false;
		if (hitAgain) {
			hitAgain = false;
			if (hitWanted.value) renderHitNow(); else hitDirty = true;
		}
	}
}

// Rendered once the settings have been still for HIT_SETTLE_MS, so a knob drag doesn't render
// it on every step
const HIT_SETTLE_MS = 120;
let hitTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => [synthInstrument.value ? exportState.value : null, selectedWaveform.value, hitHz.value], () => {
	hitDirty = true;
	if (hitTimer) clearTimeout(hitTimer);
	hitTimer = setTimeout(() => { hitTimer = null; if (hitWanted.value) renderHitNow(); }, HIT_SETTLE_MS);
});
onBeforeUnmount(() => { if (hitTimer) clearTimeout(hitTimer); });
watch(hitWanted, (wanted) => { if (wanted && hitDirty) renderHitNow(); });
onMounted(() => { if (hitWanted.value) renderHitNow(); });

// THE HIT END

// -----------------------------------------------------------------------------------------------------------------------------------------

// SAMPLE START

// A sound recorded from the microphone, played by the pads as the 'sample' wave (sample.ts,
// useSampleRecorder.ts, SampleTile.vue). A recording is one undo step, and puts the recording
// on every pad (as a wave tile's click does) and plays it once on A3, as recorded.
const recorder = useSampleRecorder(audioCtx);

const sampleBusy = computed(() => ['asking', 'listening', 'recording'].includes(recorder.state.value));
// What the phone's REC button says while it's busy, or after nothing was heard
const sampleStatus = computed(() => ({
	asking: 'Allow mic', listening: 'Listening', recording: 'Rec…', denied: 'No mic', silent: 'Nothing', unsupported: 'No mic',
} as Record<string, string>)[recorder.state.value] ?? '');

async function recordSample() {
	const rec = await recorder.record();
	if (!rec) return;
	sample.value = { data: encodeSample(rec), sampleRate: audioCtx.sampleRate };
	// A new recording plays whole, and Random may pick it (its dice badge lit)
	sampleLength.value = SAMPLE_LENGTH_DEFAULT;
	if (!randomWaves.value.includes(SAMPLE_WAVE)) randomWaves.value = RANDOM_WAVE_IDS.filter(w => w === SAMPLE_WAVE || randomWaves.value.includes(w));
	applyWaveToAll('sample');
	auditionNote(SAMPLE_ROOT_HZ, 'sample', { noise: false });
	trackEvent('sample_record', { seconds: Math.round(sampleSeconds(sample.value) * 100) / 100 });
}

// SAMPLE END
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

/* An LED: the LEDs' colour while the lane plays (PR 93; the accent until then) */
.mute-dot {
	width: 12px;
	height: 12px;
	border-radius: 50%;
	background: var(--hw-led);
	box-shadow: 0 0 6px var(--hw-led), inset 0 0 0 1px rgba(255, 255, 255, .08);
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
   and the Step Sequencer on the left two thirds, the machine rail beside them; under them Sound (two
   thirds) and Compose (one third), which end on one line: Sound's last row and Melody Maker
   take up any difference. Inside Sound each row is filled edge to edge, and a card stretched
   taller than its controls keeps them centred. Under 1200 px: the rail beside the transport,
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

/* The logo's link back to the main site */
.topbar-home {
	display: block;
	border-radius: 6px;
	transition: filter .15s;
}

.topbar-home:hover {
	filter: brightness(1.25);
}

/* Narrow windows: the project name needs the room (the gear's panel has the link instead) */
@media (max-width: 575.98px) {
	.topbar-home {
		display: none;
	}
}

.ds-grid {
	display: grid;
	gap: 14px;
	grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
	grid-template-areas:
		"transport rail"
		"steps rail"
		"sound compose";
	align-items: start;
}

.ds-transport {
	grid-area: transport;
}

.ds-steps {
	grid-area: steps;
}

.ds-rail {
	grid-area: rail;
	align-self: stretch;
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
			"transport rail"
			"steps steps"
			"tabs tabs"
			"panel panel";
	}

	.ds-rail {
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

	/* Effects tab: the pedals at their desktop size (118 px wide at 1600 px), centred, the tape
	   deck under them as wide as the three: wider, they looked stretched (190 px) */
	.module.fx .fx-pair {
		grid-template-columns: repeat(3, minmax(0, 120px));
		justify-content: center;
		column-gap: 28px;
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
			"rail"
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

	/* Effects tab: the three pedals still across (about 110 px each), the deck under them */
	.module.fx .fx-pair {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		column-gap: 8px;
		row-gap: 16px;
	}

	.ds-tab {
		padding: 10px 6px;
		letter-spacing: .08em;
	}
}

/* THE BASS MACHINE CHOSEN (option K of the mockups): the Sound section is Bass's wave tiles
   and Sub, its screen, then its knobs beside the Effects card. The Rhythm machine's rows are
   hidden (v-show would unmount nothing either way: these are display rules). */
.ds-which { color: var(--hw-led, #5dffb0); font-size: 0.85em; }
.ds-sound[data-bass] {
	display: grid;
	gap: 12px;
	align-content: stretch;
	grid-template-columns: minmax(0, .5fr) minmax(0, .5fr) minmax(0, 1fr);
	grid-template-rows: auto 1fr auto;
	grid-template-areas: "title title title" "osc big big" "knobs knobs fx";
}
.ds-sound[data-bass] > .ds-section-title { grid-area: title; }
.ds-sound[data-bass] .sound-row-1,
.ds-sound[data-bass] .sound-row-2,
.ds-sound[data-bass] .sound-row-3 > .sound-stack { display: none; }
.ds-sound[data-bass] .sound-row-3 { display: contents; }
.ds-sound[data-bass] #effects-panel { grid-area: fx; }
/* Under 1200 px the pedals are the Effects tab's: the knobs take the row */
@media (max-width: 1199.98px) {
	.ds-sound[data-bass] { grid-template-areas: "title title title" "osc big big" "knobs knobs knobs"; }
}
/* One column: the tiles across, the screen, the knobs */
@media (max-width: 719.98px) {
	.ds-sound[data-bass] { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; grid-template-areas: "title" "osc" "big" "knobs"; }
}
/* LAYOUT END */

/* PHONE START: the phone layout's Sound, FX and Key pages (PhoneLayout.vue's slots) */
/* Bass's Sound page (PR 118): the tiles, the screen, the knobs and Mix in one row */
.pl-bass-sound {
	display: grid;
	grid-template-columns: minmax(96px, 0.7fr) minmax(0, 1.6fr) minmax(170px, 1fr);
	grid-template-areas: "osc big knobs";
	gap: 8px;
	height: 100%;
	min-height: 0;
}
.pl-bass-sound .pl-mix-knobs { display: flex; justify-content: space-evenly; }
.pl-bass-sound .pl-mix { display: flex; flex-direction: column; gap: 2px; }
.pl-bass-sound .pl-mix .bs-kcap { display: flex; align-items: center; gap: 6px; font: 700 9px Cousine, ui-monospace, monospace;
	letter-spacing: .1em; text-transform: uppercase; color: var(--pt-text-dim, #b9a8d8); }
.pl-sound {
	display: grid;
	gap: 8px;
	height: 100%;
	align-content: center;
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

.pl-sound-row > .pl-waves {
	flex-grow: 1.35;
	display: grid;
	align-content: center;
	gap: 6px;
	padding: 8px;
}

/* The eight waves and Random (two keys wide), five across */
.pl-wave-grid {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 6px;
}

.pl-wave-grid .pt-btn {
	min-height: 28px;
	font-size: 10.5px;
	padding: 3px 2px;
	overflow: hidden;
	text-overflow: ellipsis;
}

.pl-waves .pt-btn[aria-pressed="true"] {
	box-shadow: 0 0 0 2px hsl(var(--pt-accent) 90% 60% / .35), 0 0 12px var(--pt-btn-glow);
	font-weight: 700;
}

/* Random: filled in the accent, as the desktop's tile (it makes something); it never stays down */
.pl-random {
	--cap-hi: hsl(var(--pt-accent) 78% 58%);
	--cap-lo: hsl(var(--pt-accent) 74% 46%);
	--cap-edge: color-mix(in oklab, var(--cap-lo), black 60%);
	--cap-ink: #fff;
	grid-column: span 2;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 5px;
	min-height: 28px;
	border: 0;
	border-radius: 8px;
	font: inherit;
	font-size: 10.5px;
	font-weight: 700;
	letter-spacing: 0.04em;
}

.pl-random svg {
	width: 15px;
	height: 15px;
	fill: none;
	stroke: currentColor;
	stroke-width: 1.7px;
}

.pl-random svg circle {
	fill: currentColor;
	stroke: none;
}

.pl-random:disabled {
	opacity: 0.5;
}

/* The desktop's Sample strip, a little lower */
.st-strip.pl-sample {
	height: 36px;
	margin-top: 0;
}

/* FM over Unison, the desktop's cards without their screens */
.pl-gens {
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 8px;
}

.pl-gens > .module {
	flex: 1 1 0;
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.pl-gens > .module > :deep(.pt-card) {
	flex: 1;
}

/* Mod: the desktop's LFO and Noise cards (PR 106) side by side, or one over the other on a
   narrow phone (568 px: side by side, the LFO's screen and patch bay were squeezed) */
.pl-mod {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	align-items: stretch;
	align-content: center;
	height: 100%;
}

@media (max-width: 699.98px) {
	.pl-mod {
		grid-template-columns: minmax(0, 1fr);
		gap: 6px;
	}
}

.pl-mod>.module {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.pl-mod>.module.noise>.noise-tv-bg> :deep(.pt-card) {
	padding-top: 8px;
	padding-bottom: 14px;
}

.pl-mod>.module.noise :deep(.pt-collapse-body) {
	margin-top: 0;
}

.pl-mod>.module.noise>.noise-tv-bg,
.pl-mod>.module.noise>.noise-tv-bg> :deep(.pt-card) {
	flex: 1 1 auto;
	display: flex;
	flex-direction: column;
	justify-content: center;
}

/* The pedals near their desktop proportions (118 × 239 there), centred: stretched across the
   phone's width they were 262 px wide and looked fat */
.fx-pair.pl-fx {
	grid-template-columns: repeat(4, minmax(0, 150px));
	justify-content: center;
	align-content: center;
	align-items: start;
	column-gap: 20px;
	height: 100%;
}

/* Key: the Melody Maker, compact (PR 106), filling the page: nothing scrolls at 568 × 320 */
.pl-melody {
	height: 100%;
}

.pl-melody> :deep(.pt-card) {
	height: 100%;
	display: flex;
	flex-direction: column;
	padding: 8px 12px 10px;
}

.pl-melody :deep(.pt-collapse-body) {
	flex: 1;
	min-height: 0;
	margin-top: 6px;
	display: flex;
}

.pl-melody :deep(.pt-title) {
	font-size: 1rem;
}

/* Taller keys where the phone has the height (844 × 390) */
.pl-melody {
	--mm-compact-white: 60px;
}

@media (min-height: 370px) {
	.pl-melody {
		--mm-compact-white: 84px;
	}
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

/* The LFO card (PR 75): no header (its ribbon is the title and the switch), filled edge to
   edge by LFOGroup */
.module.mod.lfo-card :deep(.pt-card) {
	padding: 0;
	overflow: hidden;
}

.module.mod.lfo-card :deep(.pt-subheader) {
	display: none;
}

.module.mod.lfo-card :deep(.pt-card),
.module.mod.lfo-card :deep(.pt-collapse-body),
.module.mod.lfo-card :deep(.knob-group),
.module.mod.lfo-card :deep(.knob-stack) {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	margin: 0;
	padding: 0;
	min-height: 0;
}

/* Beside Effects the card is stretched to 189 px, which the screen fills; its own height
   counts as the 154 px it had before PR 75, so the Noise card above keeps its 119 */
@media (min-width: 1200px) {
	.sound-stack>.module.mod.lfo-card {
		flex: 1 1 154px;
		min-height: 0;
	}
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

/* The switch's LED, at the ribbon's top (the caps' LED colours, _hardware.scss) */
.noise-ribbon-led {
	position: absolute;
	top: 9px;
	left: 50%;
	width: 6px;
	height: 6px;
	margin-left: -3px;
	border-radius: 50%;
	background: var(--hw-led-off);
	box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.35);
}

.noise-ribbon.is-on .noise-ribbon-led {
	background: var(--hw-led);
	box-shadow: 0 0 6px var(--hw-led), 0 0 1px var(--hw-led);
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

/* The Pulse tile is a cap that sits 2 px lower while it's chosen or pressed (_hardware.scss):
   its knob goes down with it */
.wave-cell :deep(.wave-btn.is-active)+.pulse-width-knob,
.wave-cell :deep(.wave-btn:active)+.pulse-width-knob {
	transform: translateY(2px);
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

/* Random (PR 83): a narrow ninth column beside the 4×2 tiles, as tall as both rows */
.wave-row {
	grid-template-columns: repeat(4, minmax(0, 1fr)) 58px;
}

.wave-row .rw-cell {
	grid-column: 5;
	grid-row: 1 / span 2;
	align-self: stretch;
}

/* Sample (SampleTile.vue, PR 95): a strip under the tiles, as wide as them */
.st-strip {
	height: 40px;
	margin-top: 10px;
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

/* The Repeats brush's buttons: toggles, small caps with an LED (_hardware.scss) */
.vel-btn {
	padding: 2px 7px 2px 6px;
	border-radius: 5px;
	border: 1px solid transparent;
	font: inherit;
	font-size: 10px;
	line-height: 1.4;
	letter-spacing: 0.06em;
	white-space: nowrap;
}

.repeat-brush {
	display: inline-flex;
	align-items: center;
	gap: 5px;
}

/* The Repeats brush is picked: a dashed frame round the pads (an outline, so nothing moves)
   and a tag on its top edge */
.step-card__grid {
	position: relative;
}

/* Drawn past the grid's bottom, round the pads' note chips; a pseudo-element, so nothing moves */
.step-card__grid.is-brushing::after {
	content: "";
	position: absolute;
	inset: -2px -2px -9px;
	border: 1px dashed hsl(var(--pt-accent) 80% 68%);
	border-radius: 10px;
	pointer-events: none;
}

.brush-note {
	position: absolute;
	top: -2px;
	left: 50%;
	transform: translate(-50%, -50%);
	z-index: 1001; /* over the pad numbers (1000) */
	padding: 1px 9px;
	border-radius: 999px;
	border: 1px solid hsl(var(--pt-accent) 80% 68%);
	background: hsl(var(--pt-accent) 55% 16%);
	color: #fff;
	font-size: 10px;
	line-height: 1.5;
	letter-spacing: 0.04em;
	white-space: nowrap;
	pointer-events: none;
}

/* A narrow screen: only what it's doing */
@media (max-width: 480px) {
	.brush-note__how {
		display: none;
	}
}

.repeat-brush__label {
	font-size: 10px;
	letter-spacing: 0.06em;
	opacity: 0.7;
	margin-right: 2px;
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

/* PLAY BUTTON BEGIN */

/* A big cap in the accent's colours (_hardware.scss has the cap itself): it sinks when
   pressed, and stays down while playing */
.pt-btn.btn3d {
	--cap-travel: 4px;
	--btn3d-h: var(--pt-accent, 210);
	--btn3d-h2: var(--pt-accent-2, var(--btn3d-h));
	--btn3d-top: hsl(var(--btn3d-h) 78% 66%);
	--btn3d-mid: hsl(var(--btn3d-h2) 82% 58%);
	--btn3d-bot: hsl(var(--btn3d-h2) 90% 46%);
	--cap-edge: color-mix(in oklab, var(--btn3d-bot), black 62%);

	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 78px;
	min-height: 58px;
	padding: 0;
	border: 0;
	border-radius: 12px;
	color: #fff;
	background: radial-gradient(circle at 30% 20%,
			color-mix(in oklab, var(--btn3d-top), white 16%) 0,
			var(--btn3d-top) 38%,
			var(--btn3d-mid) 80%,
			var(--btn3d-bot) 100%);
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

.pt-btn.btn3d:focus-visible {
	outline: 2px solid #fff;
	outline-offset: 3px;
}

/* Playing: down, a little darker */
.pt-btn.btn3d[aria-pressed="true"] {
	background: radial-gradient(circle at 30% 20%,
			var(--btn3d-top) 0,
			var(--btn3d-mid) 60%,
			var(--btn3d-bot) 100%);
	box-shadow: inset 0 3px 8px rgb(0 0 0 / 0.55);
}

/* PLAY BUTTON END */

.tempo-wrap {
	display: inline-flex;
	flex-direction: column;
	align-items: center;
}

.tap-btn {
	position: absolute;
	top: 14px;
	right: -2px;
	padding: 2px 4px;
	border-radius: 5px;
	border: 1px solid transparent;
	font-size: 9px;
	font-weight: 700;
	letter-spacing: 0.04em;
	line-height: 1.2;
}

/* Between the first tap and the fourth: lettering in the notch colour */
.tap-btn.is-counting {
	color: var(--knob-detent-on, #5effb0);
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
	border-radius: 6px;
	border: 1px solid transparent;
	line-height: 1;
	font-weight: 700;
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
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 12px;
	align-items: start;
}

/* EFFECTS PEDALS (PR 99, option D1 of four rounds of mockups) START
   Delay, overdrive and reverb across, the lo-fi deck under them, as wide as the three
   (TapeEffect's `deck` layout); the phone's FX page (.pl-fx) keeps four tall pedals. Each pedal
   is 183 px tall, as before, so the card keeps its size:
   - its name runs down a painted ribbon on its left edge, with its LED at the top;
   - its face has corner screws and a bevel, two jack sockets stand on its top edge;
   - the knobs and its mini switch sit two by two, every caption under its own knob (before,
     TONE's caption sat between the top knobs and its knob ran into their captions);
   - the footswitch is a ribbed rubber treadle across the foot of the face.
   The deck has the same ribbon (across its left end), screws and treadle. */
.module.fx .fx-pair> :last-child {
	grid-column: 1 / -1;
}

.fx-pair.pedalboard :deep(.knob-group) {
	padding: 0;
}

.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal)) {
	position: relative;
	grid-template-columns: 24px minmax(0, 1fr);
	grid-template-rows: 1fr;
	height: 183px;
}

/* Two jack sockets on the top edge, as on a pedal */
.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal)::before),
.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal)::after) {
	content: '';
	position: absolute;
	top: -5px;
	width: 13px;
	height: 6px;
	border-radius: 2px 2px 0 0;
	background: linear-gradient(#6a6a6a, #2a2a2a);
	box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal)::before) {
	left: 38px;
}

.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal)::after) {
	right: 12px;
}

.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal) .panel-seam) {
	display: none;
}

/* The ribbon: the pedal's colour, darker, with its name in light letters, bottom to top */
.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal) .panel-bottom) {
	grid-column: 1;
	grid-row: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	border-radius: 8px 0 0 8px;
	background: linear-gradient(color-mix(in oklab, var(--pedal-lo) 62%, black), color-mix(in oklab, var(--pedal-lo) 48%, black));
	box-shadow: inset -2px 0 3px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal) .effect-label) {
	writing-mode: vertical-rl;
	transform: rotate(180deg);
	padding: 0;
	font-size: 0.95rem;
	letter-spacing: 0.08em;
	color: rgba(255, 255, 255, 0.93);
	text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
}

/* The face: screws in its corners, a bevel, room at its foot for the treadle */
.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal) .panel-top) {
	grid-column: 2;
	grid-row: 1;
	border-radius: 0 8px 8px 0;
	padding: 4px 0 42px;
	grid-template-rows: auto 1fr 1fr;
	align-items: center;
	background:
		radial-gradient(circle at 8px 8px, #ededed 0 1.4px, #8c8c8c 2.2px, #3a3a3a 3px, transparent 3.6px),
		radial-gradient(circle at calc(100% - 8px) 8px, #ededed 0 1.4px, #8c8c8c 2.2px, #3a3a3a 3px, transparent 3.6px),
		radial-gradient(circle at 8px calc(100% - 8px), #ededed 0 1.4px, #8c8c8c 2.2px, #3a3a3a 3px, transparent 3.6px),
		radial-gradient(circle at calc(100% - 8px) calc(100% - 8px), #ededed 0 1.4px, #8c8c8c 2.2px, #3a3a3a 3px, transparent 3.6px),
		linear-gradient(var(--pedal-hi), var(--pedal-lo));
	box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 0 rgba(0, 0, 0, 0.22), inset -1px 0 0 rgba(0, 0, 0, 0.15);
}

.fx-pair.pedalboard :deep(.delay-pedal .panel-top) {
	grid-template-areas: 'led led' 'time mix' 'tone sw';
}

.fx-pair.pedalboard :deep(.drive-pedal .panel-top) {
	grid-template-areas: 'led led' 'drive level' 'tone sw';
}

/* The LED at the top of the ribbon */
.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal) .check-led) {
	position: absolute;
	left: -18px;
	top: 8px;
	z-index: 1;
}

.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal) .pedal-switch) {
	position: static;
	grid-area: sw;
}

/* Every caption under its own knob */
.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal) .knob-cell .knob-wrapper) {
	display: flex;
	flex-direction: column-reverse;
	align-items: center;
}

.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal) .knob-cell .knob-wrapper .knob-label) {
	position: static;
	width: auto;
	margin-top: 2px;
	line-height: 1;
}

/* The footswitch: a ribbed rubber treadle across the foot of the face (the deck's at its end) */
.fx-pair.pedalboard :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal) .footswitch) {
	position: absolute;
	left: 40px;
	bottom: 9px;
	width: calc(100% - 56px);
	height: 28px;
}

.fx-pair.pedalboard :deep(.footswitch) {
	border-radius: 6px;
	background: repeating-linear-gradient(90deg, #26252a 0 3px, #3a383f 3px 6px);
	box-shadow:
		inset 0 2px 0 rgba(255, 255, 255, 0.12),
		inset 0 -3px 4px rgba(0, 0, 0, 0.5),
		0 2px 3px rgba(0, 0, 0, 0.45);
}

.fx-pair.pedalboard :deep(.footswitch::before) {
	display: none;
}

.fx-pair.pedalboard :deep(.footswitch:active) {
	transform: translateY(1px);
	filter: none;
}

/* The lo-fi deck: the same screws and bevel, its name and treadle on a painted stripe */
.fx-pair.pedalboard :deep(.tape-pedal.is-deck) {
	background:
		radial-gradient(circle at 8px 8px, #ededed 0 1.4px, #8c8c8c 2.2px, #3a3a3a 3px, transparent 3.6px),
		radial-gradient(circle at calc(100% - 8px) 8px, #ededed 0 1.4px, #8c8c8c 2.2px, #3a3a3a 3px, transparent 3.6px),
		radial-gradient(circle at 8px calc(100% - 8px), #ededed 0 1.4px, #8c8c8c 2.2px, #3a3a3a 3px, transparent 3.6px),
		radial-gradient(circle at calc(100% - 8px) calc(100% - 8px), #ededed 0 1.4px, #8c8c8c 2.2px, #3a3a3a 3px, transparent 3.6px),
		linear-gradient(var(--pedal-hi), var(--pedal-lo));
	box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 0 rgba(0, 0, 0, 0.22);
}

.fx-pair.pedalboard :deep(.tape-pedal.is-deck .panel-bottom) {
	padding-left: 14px;
	padding-right: 10px;
	border-radius: 8px 0 0 8px;
	background: linear-gradient(color-mix(in oklab, var(--pedal-lo) 62%, black), color-mix(in oklab, var(--pedal-lo) 48%, black));
	box-shadow: inset -2px 0 3px rgba(0, 0, 0, 0.3);
}

.fx-pair.pedalboard :deep(.tape-pedal.is-deck .effect-label) {
	color: rgba(255, 255, 255, 0.93);
	text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
}

.fx-pair.pedalboard :deep(.tape-pedal.is-deck .footswitch) {
	width: 44px;
	height: 24px;
	border-radius: 5px;
}

/* Its LED on the stripe, as the pedals' are on their ribbons (placed against the deck itself) */
.fx-pair.pedalboard :deep(.tape-pedal.is-deck) {
	position: relative;
}

.fx-pair.pedalboard :deep(.tape-pedal.is-deck .panel-top) {
	position: static;
}

.fx-pair.pedalboard :deep(.tape-pedal.is-deck .check-led) {
	grid-area: auto; /* not the pedal layout's 'led' area, which the deck's grid hasn't got */
	left: 4px;
	right: auto;
	top: 5px;
	width: 8px;
	height: 8px;
	z-index: 1;
}

/* A narrow deck (under 400 px: the desktop's, and phones'): TAPE over the lever over VINYL,
   the lever upright, so VINYL no longer runs off the deck's edge at phone width */
.fx-pair.pedalboard :deep(.tape-pedal.is-deck) {
	container-type: inline-size;
}

@container (max-width: 400px) {
	.fx-pair.pedalboard :deep(.is-deck .mode-switch) {
		grid-template-columns: auto;
		grid-template-rows: auto auto auto;
		justify-items: center;
		row-gap: 3px;
		width: auto;
	}

	.fx-pair.pedalboard :deep(.is-deck .ms-tape) {
		grid-column: 1;
		grid-row: 1;
		justify-self: center;
	}

	.fx-pair.pedalboard :deep(.is-deck .ms-slot) {
		grid-column: 1;
		grid-row: 2;
		transform: rotate(90deg);
		margin: 4px 0;
	}

	.fx-pair.pedalboard :deep(.is-deck .ms-vinyl) {
		grid-column: 1;
		grid-row: 3;
		justify-self: center;
	}
}

/* REV (option A of three mockups: B was beside a shorter treadle, C between the knobs): a mini
   switch on the ribbon, under the LED, its caption in the ribbon's light letters; the name
   moves down to make room */
.fx-pair.pedalboard :deep(.reverb-pedal .pedal-switch.rev-switch) {
	position: absolute;
	left: 0;
	top: 26px;
	right: auto;
	width: 24px;
	z-index: 1;
}

.fx-pair.pedalboard :deep(.reverb-pedal .pedal-switch.rev-switch .ps-label) {
	color: rgba(255, 255, 255, 0.93);
	min-height: 0;
}

.fx-pair.pedalboard :deep(.reverb-pedal .pedal-switch.rev-switch:disabled .ps-label) {
	color: rgba(255, 255, 255, 0.6);
}

.fx-pair.pedalboard :deep(.reverb-pedal .effect-label) {
	margin-top: 30px;
}

/* The phone's FX page (PR 106): the same pedals, kept tall (236 px; it has the height to
   spare at 568 × 320), with a taller treadle for a thumb, and the lo-fi pedal too (its stomp
   box, TapeEffect's `pedal` layout), whose reels or record turn in a window over its treadle */
.fx-pair.pl-fx :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal)) {
	height: 236px;
}

.fx-pair.pl-fx :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal) .panel-top) {
	padding-bottom: 66px;
}

.fx-pair.pl-fx :deep(:is(.delay-pedal, .drive-pedal, .reverb-pedal, .tape-pedal.is-pedal) .footswitch) {
	height: 48px;
}

.fx-pair.pl-fx :deep(.tape-pedal.is-pedal .panel-top) {
	padding-bottom: 96px;
	grid-template-rows: auto 1fr auto;
}

.fx-pair.pl-fx :deep(.tape-pedal.is-pedal .panel-seam) {
	display: grid;
	position: absolute;
	left: 24px;
	right: 0;
	bottom: 64px;
	height: 26px;
	background: none;
	box-shadow: none;
}

.fx-pair.pl-fx :deep(.tape-pedal.is-pedal .tape-window) {
	display: flex;
	width: 80%;
	height: 24px;
}

.fx-pair.pl-fx :deep(.tape-pedal.is-pedal .tape-window .reel) {
	width: 17px;
	height: 17px;
}

.fx-pair.pl-fx :deep(.tape-pedal.is-pedal .tape-window .record) {
	width: 20px;
	height: 20px;
	margin: 0 auto;
}

.fx-pair.pl-fx :deep(.tape-pedal.is-pedal .tape-window .tape-run) {
	margin-top: 12px;
}

.fx-pair.pl-fx :deep(.tape-pedal.is-pedal .name-spin) {
	display: none;
}

.fx-pair.pl-fx :deep(.tape-pedal.is-pedal .effect-label) {
	height: auto;
}

/* EFFECTS PEDALS END */

</style>

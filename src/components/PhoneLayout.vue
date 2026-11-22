<template>
	<!-- Phone mode (usePhoneMode.ts): a phone held sideways. One screen without scrolling (Play:
		 16 pads in two rows of 8, Play and tempo, four big knobs; Sound and Pattern steppers in the
		 top bar), and Sound, FX and Key a swipe or a tab away. DrumSequencer.vue passes the state
		 in `ctx` and the desktop's own panels for the other pages as slots. -->
	<div class="phone-layout" @pointerdown="swipeStart" @pointerup="swipeEnd" @pointercancel="swipe = null">
		<header class="pl-top">
			<!-- A tiny oscilloscope of what's playing, on every page -->
			<canvas ref="scopeEl" class="pl-scope" aria-hidden="true"></canvas>
			<!-- A tiny copy of the 16 pads, on every page (PR 73): the steps that are on, in their
				 notes' colours, the beats marked and the playing step outlined. Only to look at -->
			<div class="pl-minipads" aria-hidden="true">
				<span v-for="(h, i) in minis" :key="i" class="pl-mp"
					:class="{ on: h !== null, beat: i % 4 === 0, now: ctx.isPlaying && i === ctx.currentStep }"
					:style="h !== null ? { '--h': h } : undefined"></span>
			</div>
			<!-- The machine the pages show (PR 118, option P of the mockups): RHY | BASS | DRUM (PR 121) -->
			<div class="pl-machines" role="radiogroup" aria-label="Machine">
				<button v-for="m in MACHINES" :key="m.id" type="button" role="radio" class="pl-mkey"
					:class="{ on: ctx.machine === m.id }" :aria-checked="ctx.machine === m.id ? 'true' : 'false'"
					:aria-label="m.name" @click="ctx.machine = m.id"><i class="pl-mled" aria-hidden="true"></i>{{ m.short }}</button>
			</div>
			<div class="pl-tabs" role="tablist" aria-label="Pages">
				<button v-for="p in PAGES" :key="p.id" type="button" role="tab" class="pl-tab"
					:class="{ on: page === p.id }" :aria-selected="page === p.id" :aria-label="p.label" @click="page = p.id"><span
						class="pl-tl">{{ p.label }}</span><span class="pl-ts" aria-hidden="true">{{ p.label[0] }}</span></button>
			</div>
			<span class="pl-grow"></span>
			<!-- Play / Stop, on every page -->
			<button type="button" class="pl-go" :class="{ playing: ctx.isPlaying }" :aria-label="ctx.isPlaying ? 'Stop' : 'Play'"
				:aria-pressed="ctx.isPlaying" @click="ctx.togglePlay()">
				<svg v-if="!ctx.isPlaying" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12l10-6-10-6z" /></svg>
				<svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>
				<span aria-hidden="true">{{ ctx.isPlaying ? 'Stop' : 'Play' }}</span>
			</button>
			<button type="button" class="pl-icon" aria-label="Undo" title="Undo" :disabled="!ctx.canUndo" @click="ctx.undo()">↶</button>
			<button type="button" class="pl-icon" aria-label="Redo" title="Redo" :disabled="!ctx.canRedo" @click="ctx.redo()">↷</button>
			<button type="button" class="pl-icon" aria-label="Menu" title="Menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">☰</button>
		</header>

		<div class="pl-pages">
			<!-- Play -->
			<section v-show="page === 'play'" class="pl-frame pl-play" aria-label="Play">
				<!-- Drums (PR 121, option D1 of the mockups, D2's halves on a narrow phone): a row per
					 slot, its LED (mutes the slot) and its name (a tap picks the row: Humanize and the
					 knobs work on it), then its steps; under 700 px eight at a time, 1–8 | 9–16 -->
				<div v-if="drums" class="pl-drums" :class="{ narrow }" role="group" aria-label="Drum steps" @pointermove="padMove">
					<div v-if="narrow" class="pl-halves" role="radiogroup" aria-label="Steps shown">
						<button v-for="h in [0, 1]" :key="h" type="button" role="radio" class="pl-half"
							:class="{ on: half === h, now: ctx.isPlaying && Math.floor(ctx.currentStep / 8) === h }"
							:aria-checked="half === h ? 'true' : 'false'" @click="half = h">{{ h ? '9–16' : '1–8' }}</button>
					</div>
					<div v-for="(row, k) in ctx.drumRows" :key="k" class="pl-drow" :class="{ picked: k === ctx.drumPick }"
						:style="{ '--h': ctx.drumHues[k] }" role="group" :aria-label="`${ctx.drumNames[k]} steps`">
						<div class="pl-dhead">
							<button type="button" class="pl-dled" :class="{ lit: !ctx.drumSlots[k].muted }" role="switch"
								:aria-checked="!ctx.drumSlots[k].muted ? 'true' : 'false'" :aria-label="`${ctx.drumNames[k]} on`"
								@click="ctx.toggleDrumMute(k)"><i aria-hidden="true"></i></button>
							<button type="button" class="pl-dname" :aria-pressed="k === ctx.drumPick ? 'true' : 'false'"
								:aria-label="`Pick ${ctx.drumNames[k]}`" @click="ctx.drumPick = k">{{ ctx.drumNames[k] }}</button>
						</div>
						<button v-for="i in shownSteps" :key="i" type="button" class="pl-dcell"
							:class="{ on: row.steps[i], beat: i % 4 === 0, now: ctx.isPlaying && i === ctx.currentStep, dim: ctx.drumSlots[k].muted }"
							:style="row.steps[i] ? { '--v': `${Math.round((row.velocities[i] ?? 1) * 100)}%` } : undefined"
							:aria-pressed="row.steps[i] ? 'true' : 'false'" :aria-label="`${ctx.drumNames[k]}, step ${i + 1}`"
							:data-r="k" :data-i="i" @pointerdown="padDown(i, $event, +k)" @click.prevent @contextmenu.prevent
							@keydown.enter.prevent="setOn(+k, i, !row.steps[i])"><span class="pl-dfill"></span><span class="pl-dnum">{{ i + 1 }}</span></button>
					</div>
				</div>
				<div v-else class="pl-pads" role="group" aria-label="Steps" @pointermove="padMove">
					<button v-for="(on, i) in (lane.steps as boolean[])" :key="i" type="button" class="pl-pad"
						:class="{ on, beat: i % 4 === 0, now: ctx.isPlaying && i === ctx.currentStep }"
						:aria-pressed="!!on" :aria-label="padLabel(i)" :data-i="i"
						:style="on ? padStyle(i) : undefined"
						@pointerdown="padDown(i, $event)" @click.prevent
						@contextmenu.prevent @keydown.enter.prevent="toggleStep(i)">
						<span class="pl-num">{{ i + 1 }}</span>
						<span v-if="on && bass && lane.accents[i]" class="pl-rat pl-acc">ACC</span>
						<span v-if="bass && lane.ties[i]" class="pl-link" title="Held through the next step">═</span>
						<span v-else-if="bass && lane.slides[i] && lane.steps[(i + 1) % lane.steps.length]" class="pl-link" title="Slides into the next note">⤳</span>
						<span v-if="on && !bass && (ctx.inst.ratchets?.[i] ?? 1) > 1" class="pl-rat">×{{ ctx.inst.ratchets[i] }}{{ ctx.inst.repeatNotes?.[i] === 'up' ? '↑' : ctx.inst.repeatNotes?.[i] === 'down' ? '↓' : '' }}</span>
						<span v-if="on" class="pl-fill"></span>
						<span v-if="on" class="pl-note">{{ ctx.noteName(lane.pitches[i]) }}</span>
					</button>
				</div>
				<div class="pl-side">
					<!-- Sound and Pattern: step through the six, a tap on the name lists them, a dice -->
					<div class="pl-pick">
						<div class="pl-stepper" role="group" aria-label="Sound">
							<button type="button" class="pl-arr" aria-label="Previous sound" @click="stepSound(-1)">◂</button>
							<button type="button" class="pl-val" aria-label="All sounds" @click="list = 'sound'"><span class="pl-cap" aria-hidden="true">{{ drums ? 'Kit' : 'Sound' }}</span>{{ soundName }}</button>
							<button type="button" class="pl-arr" aria-label="Next sound" @click="stepSound(1)">▸</button>
						</div>
						<button type="button" class="pl-icon pl-dice" aria-label="Random sound" title="Random sound" @click="rollSound">
							<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" /><circle cx="5" cy="5" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="11" cy="11" r="1.2" /></svg>
						</button>
					</div>
					<div class="pl-pick">
						<div class="pl-stepper" role="group" aria-label="Pattern">
							<button type="button" class="pl-arr" aria-label="Previous pattern" @click="stepPattern(-1)">◂</button>
							<button type="button" class="pl-val" aria-label="All patterns" @click="list = 'pattern'"><span class="pl-cap" aria-hidden="true">Pattern</span>{{ patternName }}</button>
							<button type="button" class="pl-arr" aria-label="Next pattern" @click="stepPattern(1)">▸</button>
						</div>
						<button type="button" class="pl-icon pl-dice" aria-label="Random pattern" title="Random pattern" @click="rollPattern">
							<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" /><circle cx="5" cy="5" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="11" cy="11" r="1.2" /></svg>
						</button>
					</div>
					<div class="pl-pick">
						<div class="pl-mini" role="group" aria-label="Tempo">
							<button type="button" aria-label="Tempo −1" @click="ctx.tempo = Math.max(20, ctx.tempo - 1)">−</button>
							<span><b>{{ ctx.tempo }}</b> BPM</span>
							<button type="button" aria-label="Tempo +1" @click="ctx.tempo = Math.min(300, ctx.tempo + 1)">+</button>
						</div>
						<!-- Swing (PR 73): − / + by the Swing knob's notches, 0 to 50 % -->
						<div class="pl-mini" role="group" aria-label="Swing">
							<button type="button" aria-label="Less swing" @click="ctx.swing = nextStop(ctx.swing, SWING_STOPS, -1)">−</button>
							<span :title="ctx.swing === TRIPLET_SWING ? 'Triplet swing' : undefined"><b>{{ Math.round(ctx.swing * 100) }}%</b> Swing</span>
							<button type="button" aria-label="More swing" @click="ctx.swing = nextStop(ctx.swing, SWING_STOPS, 1)">+</button>
						</div>
					</div>
					<div class="pl-pick">
						<div class="pl-mini" role="group" aria-label="Octave">
							<button type="button" aria-label="Octave down" title="Every pad an octave down" :disabled="drums" @click="ctx.octave(-1)">↓</button>
							<span>Oct</span>
							<button type="button" aria-label="Octave up" title="Every pad an octave up" :disabled="drums" @click="ctx.octave(1)">↑</button>
						</div>
						<!-- Move (PR 88): Pattern Tools' rotate and reverse -->
						<div class="pl-mini pl-move" role="group" aria-label="Shift and reverse">
							<button type="button" aria-label="Shift earlier" title="Shift earlier: every step one to the left" @click="ctx.move('left')">◂</button>
							<button type="button" aria-label="Reverse" title="The pattern backwards" @click="ctx.move('reverse')">⇄</button>
							<button type="button" aria-label="Shift later" title="Shift later: every step one to the right" @click="ctx.move('right')">▸</button>
						</div>
						<!-- Humanize (PR 73): Pattern Tools' velocity shapes, in a list like the steppers' -->
						<button type="button" class="pl-mini pl-hum" aria-haspopup="dialog"
							title="Shape the steps' velocities (the Filter's VEL switch needs softer steps)"
							@click="list = 'humanize'">Humanize</button>
					</div>
					<!-- Drums (PR 121): the picked row's name, then its slot's Tune, Decay and Level -->
					<div v-if="drums" class="pl-macros pl-dmacros" :style="{ '--h': ctx.drumHues[ctx.drumPick] }">
						<div class="pl-macro pl-dpicked"><span class="pl-cap">Row</span><b>{{ ctx.drumNames[ctx.drumPick] }}</b></div>
						<div class="pl-macro">
							<Knob v-model="ctx.drumSlot.tune" label="Tune" :min="DRUM_RANGES.tune[0]" :max="DRUM_RANGES.tune[1]" :step="1" bipolar size="small"
								:value-text="`${ctx.drumSlot.tune > 0 ? '+' : ''}${ctx.drumSlot.tune} st`" />
							<span class="pl-mv">{{ ctx.drumSlot.tune > 0 ? '+' : '' }}{{ ctx.drumSlot.tune }} st</span>
						</div>
						<div class="pl-macro">
							<Knob v-model="ctx.drumSlot.decay" label="Decay" :min="DRUM_RANGES.decay[0]" :max="DRUM_RANGES.decay[1]" :step="0.01" size="small"
								:value-text="`${Math.round(ctx.drumSlot.decay * 100)}%`" />
							<span class="pl-mv">{{ Math.round(ctx.drumSlot.decay * 100) }}%</span>
						</div>
						<div class="pl-macro">
							<Knob v-model="ctx.drumSlot.level" label="Level" :min="DRUM_RANGES.level[0]" :max="DRUM_RANGES.level[1]" :step="0.01" size="small"
								:value-text="`${Math.round(ctx.drumSlot.level * 100)}%`" />
							<span class="pl-mv">{{ Math.round(ctx.drumSlot.level * 100) }}%</span>
						</div>
					</div>
					<!-- Bass's four (PR 118): Cutoff, Reso, Env, Decay -->
					<div v-else-if="bass" class="pl-macros">
						<div class="pl-macro">
							<Knob v-model="ctx.bass.cutoff" label="Cutoff" :min="40" :max="4000" :step="1" taper="log" size="small"
								:value-text="hzText(ctx.bass.cutoff)" />
							<span class="pl-mv">{{ hzText(ctx.bass.cutoff) }}</span>
						</div>
						<div class="pl-macro">
							<Knob v-model="ctx.bass.resonance" label="Reso" :min="0" :max="1" :step="0.01" size="small"
								:value-text="`${Math.round(ctx.bass.resonance * 100)}%`" />
							<span class="pl-mv">{{ Math.round(ctx.bass.resonance * 100) }}%</span>
						</div>
						<div class="pl-macro">
							<Knob v-model="ctx.bass.envAmount" label="Env" :min="0" :max="5" :step="0.1" size="small"
								:value-text="`+${ctx.bass.envAmount.toFixed(1)} octaves`" />
							<span class="pl-mv">+{{ ctx.bass.envAmount.toFixed(1) }} oct</span>
						</div>
						<div class="pl-macro">
							<Knob v-model="ctx.bass.decayMs" label="Decay" :min="30" :max="2000" :step="1" taper="log" size="small"
								:value-text="`${Math.round(ctx.bass.decayMs)} ms`" />
							<span class="pl-mv">{{ Math.round(ctx.bass.decayMs) }} ms</span>
						</div>
					</div>
					<div v-else class="pl-macros">
						<div class="pl-macro">
							<Knob v-model="ctx.decayMs" label="Decay" :min="50" :max="2000" :step="1" taper="log" size="small"
								:value-text="`${Math.round(ctx.decayMs)} ms`" />
							<span class="pl-mv">{{ Math.round(ctx.decayMs) }} ms</span>
						</div>
						<div class="pl-macro">
							<Knob v-model="ctx.cutoff" label="Tone" :min="100" :max="10000" :step="1" taper="log" size="small"
								:value-text="hzText(ctx.cutoff)" />
							<span class="pl-mv">{{ hzText(ctx.cutoff) }}</span>
						</div>
						<div class="pl-macro">
							<Knob v-model="ctx.sweep" label="Sweep" :min="-48" :max="48" :step="1" bipolar size="small"
								:value-text="`${ctx.sweep > 0 ? '+' : ''}${ctx.sweep} st`" />
							<span class="pl-mv">{{ ctx.sweep > 0 ? '+' : '' }}{{ ctx.sweep }} st</span>
						</div>
						<div class="pl-macro">
							<Knob v-model="ctx.space" label="Space" :min="0" :max="1" :step="0.01" size="small"
								:value-text="`${Math.round(ctx.space * 100)}%`" />
							<span class="pl-mv">{{ Math.round(ctx.space * 100) }}%</span>
						</div>
					</div>
				</div>
			</section>

			<section v-show="page === 'sound'" class="pl-frame pl-page" aria-label="Sound"><slot name="sound" /></section>
			<section v-show="page === 'mod'" class="pl-frame pl-page" aria-label="Mod"><slot name="mod" /></section>
			<section v-show="page === 'fx'" class="pl-frame pl-page" aria-label="FX"><slot name="fx" /></section>
			<section v-show="page === 'key'" class="pl-frame pl-page" aria-label="Key"><slot name="key" /></section>
		</div>

		<!-- All six sounds or patterns (a tap on the stepper's name), or Humanize's shapes -->
		<div v-if="list" class="pl-scrim" @click="list = null"></div>
		<div v-if="list === 'humanize'" class="pl-sheet pl-list" role="dialog" aria-label="Humanize">
			<button v-for="v in VELOCITY_SHAPES" :key="v.id" type="button" class="pt-btn" :class="{ 'pt-danger': v.id === 'reset' }"
				@click="humanize(v.id); list = null">{{ v.label }}</button>
		</div>
		<div v-else-if="list" class="pl-sheet pl-list" role="dialog" :aria-label="list === 'sound' ? 'Sounds' : 'Patterns'">
			<button v-for="p in (list === 'sound' ? ctx.presets : ctx.patterns)" :key="p.id" type="button" class="pt-btn"
				:aria-pressed="(list === 'sound' ? ctx.activePresetId : ctx.activePatternId) === p.id"
				@click="list === 'sound' ? chooseSound(p.id) : choosePattern(p.id); list = null">{{ p.label }}</button>
		</div>

		<!-- A held pad: its note (the key's scale over two octaves), velocity and repeats -->
		<div v-if="held !== null" class="pl-scrim" @click="held = null"></div>
		<!-- A held drum step (PR 121): its velocity -->
		<div v-if="held !== null && heldRow >= 0" class="pl-sheet pl-picker" role="dialog" :aria-label="`${ctx.drumNames[heldRow]}, step ${held + 1}`">
			<div class="pl-row">
				<span class="pl-cap pl-grow">{{ ctx.drumNames[heldRow] }} · Step {{ held + 1 }}</span>
				<button type="button" class="pt-btn pl-small" @click="setOn(heldRow, held, false); held = null">Off</button>
				<button type="button" class="pt-btn pl-small" @click="held = null">Done</button>
			</div>
			<div class="pl-row">
				<label class="pl-cap" for="pl-dvel">Velocity</label>
				<input id="pl-dvel" class="pl-vel" type="range" min="0.05" max="1" step="0.01"
					:value="ctx.drumRows[heldRow].velocities[held]" @input="ctx.setDrumVelocity(heldRow, held, +($event.target as HTMLInputElement).value)">
			</div>
		</div>
		<div v-if="held !== null && heldRow < 0" class="pl-sheet pl-picker" role="dialog" :aria-label="`Step ${held + 1}`">
			<div class="pl-row">
				<span class="pl-cap pl-grow">Step {{ held + 1 }} · {{ scaleText }}</span>
				<button type="button" class="pt-btn pl-small" @click="setStepOn(held, false); held = null">Off</button>
				<button type="button" class="pt-btn pl-small" @click="held = null">Done</button>
			</div>
			<div class="pl-notes">
				<button v-for="n in pickerNotes" :key="n.hz" type="button" class="pl-n"
					:class="{ cur: lane.steps[held] && Math.abs(n.hz - lane.pitches[held]) < 0.5 }"
					:style="{ '--h': ctx.hue(n.hz) }" @click="pickNote(held, n.hz)">{{ n.name }}</button>
			</div>
			<div class="pl-row">
				<label class="pl-cap" :for="`pl-vel`">Velocity</label>
				<input id="pl-vel" class="pl-vel" type="range" min="0.05" max="1" step="0.01"
					:value="lane.velocities[held]" @input="setVelocity(held, +($event.target as HTMLInputElement).value)">
				<!-- Bass: Accent, Slide and Tie (a step's Slide and Tie are one or the other) -->
				<template v-if="bass">
					<button v-for="t in BASS_FLAGS" :key="t.id" type="button" class="pt-btn pl-small"
						:aria-pressed="lane[t.id][held] ? 'true' : 'false'" :title="t.tip" @click="toggleFlag(t.id, held)">{{ t.label }}</button>
				</template>
				<template v-else>
				<span class="pl-cap">Repeats</span>
				<button v-for="r in [1, 2, 3, 4]" :key="r" type="button" class="pt-btn pl-small"
					:aria-pressed="(ctx.inst.ratchets?.[held] ?? 1) === r" @click="setRatchet(held, r)">×{{ r }}</button>
				<!-- What the repeats play: a tap goes Same → Up → Down (the key's chord) -->
				<button v-if="ctx.inst.repeatNotes" type="button" class="pt-btn pl-small"
					:aria-label="`Repeat notes: ${notesName(held)}`" :disabled="(ctx.inst.ratchets?.[held] ?? 1) < 2"
					title="What the repeats play: the pad's note, or up or down the key's chord"
					@click="cycleNotes(held)">{{ notesName(held) }}</button>
				</template>
			</div>
		</div>

		<!-- The menu, a panel from the left (PR 72's layout): a header with ✕; Project, the File bar
			 itself (moved here by DrumSequencer; its Undo and Redo hidden, they're in the top bar);
			 Theme; and at the bottom Desktop View and Reset… side by side -->
		<div v-show="menuOpen" class="pl-scrim" @click="menuOpen = false"></div>
		<div v-show="menuOpen" class="pl-menu" role="dialog" aria-label="Menu">
			<div class="pl-menu-head">
				<span class="pl-menu-title">Menu</span>
				<button type="button" class="pl-icon" aria-label="Close menu" title="Close" @click="menuOpen = false">✕</button>
			</div>
			<div class="pl-menu-sec">
				<span class="pl-cap">Project</span>
				<div id="phone-menu-slot"></div>
			</div>
			<div class="pl-menu-sec">
				<span class="pl-cap">Theme</span>
				<ThemeToggle />
			</div>
			<!-- Start over: two taps (Reset…, then what to reset), and Undo brings it all back -->
			<div class="pl-menu-foot">
				<template v-if="!resetAsk">
					<button type="button" class="pt-btn" @click="menuOpen = false; ctx.fullLayout()">Desktop View</button>
					<button type="button" class="pt-btn pt-danger" title="Start over with blank pads (Undo brings them back)"
						@click="resetAsk = true">Reset…</button>
				</template>
				<template v-else>
					<span class="pl-reset-q">Start over? Every pad off, at full velocity, on A, one hit each.</span>
					<button type="button" class="pt-btn pt-danger" @click="doReset(false)">Reset pads</button>
					<button type="button" class="pt-btn pt-danger" @click="doReset(true)">Pads and sound</button>
					<button type="button" class="pt-btn" @click="resetAsk = false">Cancel</button>
				</template>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, provide, watch, onMounted, onBeforeUnmount } from 'vue';
import Knob from './Knob.vue';
import ThemeToggle from './ThemeToggle.vue';
import { SCALES, NOTE_TO_SEMITONE, midiToFreq, freqToMidiExact } from '../lib/melody/theory';
import { VELOCITY_SHAPES, velocityShape, type VelocityShapeId } from '../lib/patterns/velocityShapes';
import { SWING_STOPS, TRIPLET_SWING, nextStop } from '../lib/knobDetents';
import { DRUM_RANGES } from '../audio/drums';

const props = defineProps<{ ctx: any }>();
const ctx = props.ctx;
// The machine shown (PR 118): its lane is what the pads, the tiny pads, the hold sheet and
// Humanize read and write (Rhythm's synth lane, or Bass's); repeats are Rhythm's only
const bass = computed(() => ctx.machine === 'bass');
// Drums (PR 121): its rows instead of the pads; `lane` is then its picked row (Humanize)
const drums = computed(() => ctx.machine === 'drums');
const lane = computed<any>(() => ctx.lane);

// The tiny pads: each step's colour, or null while it's off (Drums: its first unmuted row that's on)
const minis = computed<(number | null)[]>(() => {
	if (drums.value) {
		const rows = ctx.drumRows as { steps: boolean[] }[];
		return (rows[0]?.steps ?? []).map((_, i) => {
			const k = rows.findIndex((r, j) => r.steps[i] && !ctx.drumSlots[j]?.muted);
			return k < 0 ? null : ctx.drumHues[k];
		});
	}
	return (lane.value.steps as boolean[]).map((on, i) => (on ? ctx.hue(lane.value.pitches[i]) : null));
});

// Drums' steps on a narrow phone (under 700 px): eight at a time, 1–8 | 9–16
const narrowQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 699.98px)') : null;
const narrow = ref(!!narrowQuery?.matches);
const onNarrow = (e: MediaQueryListEvent) => { narrow.value = e.matches; };
onMounted(() => narrowQuery?.addEventListener('change', onNarrow));
onBeforeUnmount(() => narrowQuery?.removeEventListener('change', onNarrow));
const half = ref(0);
const shownSteps = computed(() => {
	const n = (ctx.drumRows?.[0]?.steps.length ?? 16) as number;
	const all = Array.from({ length: n }, (_, i) => i);
	return narrow.value ? all.slice(half.value * 8, half.value * 8 + 8) : all;
});

// The desktop's panels shown here again must not take MIDI learn's links from the desktop's
provide('noMidiLearn', true);

const MACHINES = [
	{ id: 'rhythm', name: 'Rhythm', short: 'RHY' },
	{ id: 'bass', name: 'Bass', short: 'BASS' },
	{ id: 'drums', name: 'Drums', short: 'DRUM' },
] as const;
const BASS_FLAGS = [
	{ id: 'accents', label: 'Accent', tip: 'Louder, the filter opening further' },
	{ id: 'slides', label: 'Slide', tip: 'Glides into the next step\'s note' },
	{ id: 'ties', label: 'Tie', tip: 'Holds the note through the next step' },
] as const;
// A Bass step's Accent, Slide or Tie; Slide and Tie are one or the other
function toggleFlag(id: 'accents' | 'slides' | 'ties', i: number) {
	const l = lane.value;
	l[id] = replace(l[id], i, !l[id][i]);
	const other = id === 'slides' ? 'ties' : id === 'ties' ? 'slides' : null;
	if (other && l[id][i] && l[other][i]) l[other] = replace(l[other], i, false);
}

const PAGES = [
	{ id: 'play', label: 'Pads' },
	{ id: 'sound', label: 'Sound' },
	{ id: 'mod', label: 'Mod' },
	{ id: 'fx', label: 'FX' },
	{ id: 'key', label: 'Key' },
] as const;
type PageId = typeof PAGES[number]['id'];
const page = ref<PageId>('play');
const menuOpen = ref(false);
// The menu's Reset: asked first, then pads only or pads and sound
const resetAsk = ref(false);
// Closing the menu drops a question left open, so it opens on Desktop View and Reset… again
watch(menuOpen, (open) => { if (!open) resetAsk.value = false; });
function doReset(sound: boolean) {
	ctx.reset(sound);
	resetAsk.value = false;
	menuOpen.value = false;
}
const list = ref<null | 'sound' | 'pattern' | 'humanize'>(null);
// Humanize: a velocity shape for all 16 steps, one undo step
function humanize(id: VelocityShapeId) { lane.value.velocities = velocityShape(id, lane.value.velocities.length); }

// Swipe left or right between pages (not from a knob, a slider or an open sheet)
let swipe: null | { x: number; y: number } = null;
function swipeStart(e: PointerEvent) {
	const t = e.target as HTMLElement;
	swipe = t.closest('[role="slider"], input, .pl-sheet, .pl-menu, .pl-pads, .pl-drums') ? null : { x: e.clientX, y: e.clientY };
}
function swipeEnd(e: PointerEvent) {
	if (!swipe) return;
	const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
	swipe = null;
	if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) / 2) return;
	const i = PAGES.findIndex((p) => p.id === page.value) + (dx < 0 ? 1 : -1);
	if (i >= 0 && i < PAGES.length) page.value = PAGES[i].id;
}

// Sounds and Patterns: step through the six, or a dice
const soundRolled = ref(false);
const patternRolled = ref(false);
const lastSound = ref(-1);
const lastPattern = ref(-1);
const soundName = computed(() => {
	const p = ctx.presets.find((x: any) => x.id === ctx.activePresetId);
	return p ? p.label : soundRolled.value ? 'Random' : 'Sound';
});
const patternName = computed(() => {
	const p = ctx.patterns.find((x: any) => x.id === ctx.activePatternId);
	return p ? p.label : patternRolled.value ? 'Random' : 'Pattern';
});
function chooseSound(id: string) {
	soundRolled.value = false;
	lastSound.value = ctx.presets.findIndex((p: any) => p.id === id);
	ctx.choosePreset(id);
}
function choosePattern(id: string) {
	patternRolled.value = false;
	lastPattern.value = ctx.patterns.findIndex((p: any) => p.id === id);
	ctx.choosePattern(id);
}
function stepSound(d: number) {
	const cur = ctx.presets.findIndex((p: any) => p.id === ctx.activePresetId);
	const from = cur >= 0 ? cur : lastSound.value;
	const n = ctx.presets.length;
	chooseSound(ctx.presets[((from < 0 ? (d > 0 ? -1 : 0) : from) + d + n) % n].id);
}
function stepPattern(d: number) {
	const cur = ctx.patterns.findIndex((p: any) => p.id === ctx.activePatternId);
	const from = cur >= 0 ? cur : lastPattern.value;
	const n = ctx.patterns.length;
	choosePattern(ctx.patterns[((from < 0 ? (d > 0 ? -1 : 0) : from) + d + n) % n].id);
}
function rollSound() { soundRolled.value = true; ctx.randomSound(); }
function rollPattern() { patternRolled.value = true; ctx.randomPattern(); }

// Pads: a tap turns a step on or off; a hold (400 ms) opens its note; a finger drawn across
// pads paints them all the way the first one went (on, or off), as a drag does on the desktop.
// A touch keeps sending its moves to the pad it began on, so that pad lets go of it.
const HOLD_MS = 400;
// A drum step is a row's (r ≥ 0); the other machines' pads have r = −1. Painting stays in its row.
const held = ref<number | null>(null);
const heldRow = ref(-1);
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let press: null | { r: number; i: number; x: number; y: number; held: boolean; paint: boolean | null; last: number } = null;
const isOn = (r: number, i: number) => !!(r < 0 ? lane.value.steps[i] : ctx.drumRows[r].steps[i]);
function setOn(r: number, i: number, on: boolean) {
	if (r < 0) setStepOn(i, on);
	else ctx.setDrumStep(r, i, on);
}
function padDown(i: number, e: PointerEvent, r = -1) {
	(e.target as Element).releasePointerCapture?.(e.pointerId);
	press = { r, i, x: e.clientX, y: e.clientY, held: false, paint: null, last: i };
	holdTimer = setTimeout(() => {
		if (!press || press.paint !== null) return;
		press.held = true;
		heldRow.value = r;
		held.value = i;
		navigator.vibrate?.(10);
	}, HOLD_MS);
	window.addEventListener('pointerup', padUp);
	window.addEventListener('pointercancel', padCancel);
}
function padMove(e: PointerEvent) {
	if (!press || press.held) return;
	if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) stopHold();
	const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pl-pad, .pl-dcell') as HTMLElement | null;
	const i = el ? Number(el.dataset.i) : -1;
	const r = el?.dataset.r != null ? Number(el.dataset.r) : -1;
	if (i < 0 || i === press.last || r !== press.r) return;
	if (press.paint === null) {
		press.paint = !isOn(press.r, press.i);
		setOn(press.r, press.i, press.paint);
	}
	press.last = i;
	if (isOn(r, i) !== press.paint) setOn(r, i, press.paint);
}
function padUp() {
	stopHold();
	if (press && !press.held && press.paint === null) setOn(press.r, press.i, !isOn(press.r, press.i));
	padCancel();
}
function stopHold() {
	if (holdTimer) clearTimeout(holdTimer);
	holdTimer = null;
}
function padCancel() {
	stopHold();
	press = null;
	window.removeEventListener('pointerup', padUp);
	window.removeEventListener('pointercancel', padCancel);
}
onBeforeUnmount(padCancel);

// The tiny oscilloscope: the output's waveform, started at a rising zero crossing so it stands
// still on a steady note, in the theme's accent (the canvas's CSS colour)
const scopeEl = ref<HTMLCanvasElement | null>(null);
let scopeFrame = 0;
let scopeData: Float32Array<ArrayBuffer> | null = null;
let scopeColour = '';
let scopeTick = 0;
function drawScope() {
	scopeFrame = requestAnimationFrame(drawScope);
	const c = scopeEl.value;
	const an = ctx.analyser as AnalyserNode | null;
	if (!c || !an || !c.clientWidth) return;
	const dpr = window.devicePixelRatio || 1;
	const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
	if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
	if (!scopeColour || ++scopeTick % 60 === 0) scopeColour = getComputedStyle(c).color;
	if (!scopeData || scopeData.length !== an.fftSize) scopeData = new Float32Array(an.fftSize);
	an.getFloatTimeDomainData(scopeData);
	const d = scopeData;
	let start = 0;
	for (let i = 1; i < d.length / 2; i++) if (d[i - 1] < 0 && d[i] >= 0) { start = i; break; }
	const n = Math.floor(d.length / 2);
	const g = c.getContext('2d')!;
	g.clearRect(0, 0, w, h);
	g.strokeStyle = scopeColour;
	g.lineWidth = 1.5 * dpr;
	g.lineJoin = 'round';
	g.beginPath();
	for (let k = 0; k < n; k++) {
		const v = Math.max(-1, Math.min(1, d[start + k] * 1.6));
		const x = (k / (n - 1)) * w, y = h / 2 - v * (h / 2 - 2 * dpr);
		if (k) g.lineTo(x, y); else g.moveTo(x, y);
	}
	g.stroke();
}
onMounted(() => { scopeFrame = requestAnimationFrame(drawScope); });
onBeforeUnmount(() => cancelAnimationFrame(scopeFrame));

const replace = (arr: any[], i: number, v: any) => arr.map((x, j) => (j === i ? v : x));
function setStepOn(i: number, on: boolean) { lane.value.steps = replace(lane.value.steps, i, on); }
function toggleStep(i: number) { setStepOn(i, !lane.value.steps[i]); }
function setVelocity(i: number, v: number) { lane.value.velocities = replace(lane.value.velocities, i, v); }
function setRatchet(i: number, r: number) {
	const cur = ctx.inst.ratchets ?? Array(lane.value.steps.length).fill(1);
	ctx.inst.ratchets = replace(cur, i, r);
}
const NOTES_CYCLE = ['same', 'up', 'down'] as const;
const NOTES_NAME: Record<string, string> = { same: 'Same', up: 'Up ↑', down: 'Down ↓' };
function notesName(i: number) { return NOTES_NAME[ctx.inst.repeatNotes?.[i]] ?? 'Same'; }
function cycleNotes(i: number) {
	const cur = NOTES_CYCLE.indexOf(ctx.inst.repeatNotes?.[i] ?? 'same');
	ctx.inst.repeatNotes = replace(ctx.inst.repeatNotes, i, NOTES_CYCLE[(Math.max(0, cur) + 1) % 3]);
}
function pickNote(i: number, hz: number) {
	lane.value.pitches = replace(lane.value.pitches, i, hz);
	if (!lane.value.steps[i]) setStepOn(i, true);
	ctx.auditionPad(i, hz); // as the pad plays it (its wave, noise, repeats), only while stopped
}

// The notes offered for a held pad: the Melody Maker's key and scale (every semitone with no
// scale), 16 of them around the pad's own note, within the pads' range
const scaleSteps = computed<readonly number[]>(() =>
	ctx.keyScale && ctx.keyScale !== 'none' ? (SCALES as any)[ctx.keyScale] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
const scaleText = computed(() => `${ctx.keyRoot} ${ctx.keyScaleLabel}`);
const pickerNotes = computed(() => {
	if (held.value === null) return [];
	const root = NOTE_TO_SEMITONE[ctx.keyRoot] ?? 9;
	const center = Math.round(freqToMidiExact(lane.value.pitches[held.value] || 220));
	const all: number[] = [];
	for (let m = center - 24; m <= center + 24; m++) {
		const hz = midiToFreq(m);
		if (hz < ctx.minHz - 0.01 || hz > ctx.maxHz + 0.01) continue;
		if (scaleSteps.value.includes((((m - root) % 12) + 12) % 12)) all.push(m);
	}
	// 16 notes, the pad's own as near the middle as the range allows
	let at = all.findIndex((m) => m >= center);
	if (at < 0) at = all.length;
	const start = Math.max(0, Math.min(all.length - 16, at - 7));
	return all.slice(start, start + 16).map((m) => ({ hz: midiToFreq(m), name: ctx.noteName(midiToFreq(m)) }));
});

function padStyle(i: number) {
	return { '--h': ctx.hue(lane.value.pitches[i]), '--v': `${Math.round((lane.value.velocities[i] ?? 1) * 100)}%` };
}
function padLabel(i: number) {
	return lane.value.steps[i] ? `Step ${i + 1}, ${ctx.noteName(lane.value.pitches[i])}` : `Step ${i + 1}`;
}
function hzText(hz: number) {
	return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
}
</script>

<style scoped>
.phone-layout {
	--pp-sat: 82%;
	--pp-lit: 58%;
	--pl-now: #fff;
	position: fixed;
	inset: 0;
	z-index: 50;
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 6px max(10px, env(safe-area-inset-right, 0px)) max(8px, env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 0px));
	background: var(--pt-page);
	color: var(--pt-text);
	font-family: monospace;
	touch-action: manipulation;
	user-select: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
}

/* The machine switch (PR 118): two keys, the chosen one lit */
.pl-machines {
	display: flex;
	gap: 2px;
	padding: 2px;
	border-radius: 9px;
	background: rgba(0, 0, 0, .35);
	flex: none;
}

.pl-mkey {
	display: flex;
	align-items: center;
	gap: 4px;
	height: 30px;
	padding: 0 7px;
	border: 0;
	border-radius: 7px;
	font: 700 10px Cousine, ui-monospace, monospace;
	letter-spacing: .05em;
	color: var(--pt-text-dim, #cbbde6);
	background: rgba(255, 255, 255, .05);
}

.pl-mkey.on {
	color: var(--pt-text, #fff);
	background: rgba(255, 255, 255, .15);
	box-shadow: inset 0 0 0 1px var(--hw-led, #5dffb0);
}

.pl-mled {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--hw-led-off, #2c3a33);
}

.pl-mkey.on .pl-mled {
	background: var(--hw-led, #5dffb0);
	box-shadow: 0 0 5px var(--hw-led, #5dffb0);
}

/* A tab's short name (its first letter) on a narrow phone, so the machine switch fits */
.pl-ts {
	display: none;
}

@media (max-width: 719.98px) {
	.pl-tl {
		display: none;
	}

	.pl-ts {
		display: inline;
	}
}

/* Bass's marks on its pads: ACC on an accented step; ⤳ a slide into the next, ═ a tie */
.pl-acc {
	background: var(--hw-led, #5dffb0) !important;
	color: #10091c !important;
}

.pl-link {
	position: absolute;
	right: 4px;
	bottom: 4px;
	z-index: 3;
	min-width: 22px;
	padding: 0 3px;
	border-radius: 5px;
	background: rgba(0, 0, 0, .55);
	font: 700 13px/1.15 Cousine, ui-monospace, monospace;
	text-align: center;
	color: var(--hw-led, #5dffb0);
	pointer-events: none;
}

/* The machine keys lose their LEDs on a small phone (PR 121), so three fit */
@media (max-width: 599.98px) {
	.pl-mled {
		display: none;
	}

	.pl-mkey {
		padding: 0 6px;
	}
}

/* Drums' rows (PR 121): its LED and name, then its steps */
.pl-drums {
	display: flex;
	flex-direction: column;
	gap: 5px;
	min-height: 0;
	min-width: 0;
}

.pl-halves {
	display: flex;
	gap: 2px;
	align-self: flex-end;
	padding: 2px;
	border-radius: 8px;
	background: rgba(0, 0, 0, .3);
	flex: none;
}

.pl-half {
	height: 22px;
	padding: 0 10px;
	border: 0;
	border-radius: 6px;
	font: 700 10px Cousine, ui-monospace, monospace;
	color: var(--pt-text-dim, #cbbde6);
	background: transparent;
}

.pl-half.on {
	color: var(--pt-text, #fff);
	background: rgba(255, 255, 255, .15);
	box-shadow: inset 0 0 0 1px var(--hw-led, #5dffb0);
}

/* The half the playing step is in: a dot after its name */
.pl-half.now::after {
	content: "";
	display: inline-block;
	width: 5px;
	height: 5px;
	margin-left: 5px;
	border-radius: 50%;
	vertical-align: middle;
	background: var(--pl-now);
}

.pl-drow {
	flex: 1;
	min-height: 0;
	display: grid;
	grid-template-columns: 74px repeat(16, minmax(0, 1fr));
	gap: 3px;
}

.pl-drums.narrow .pl-drow {
	grid-template-columns: 74px repeat(8, minmax(0, 1fr));
	gap: 5px;
}

.pl-dhead {
	display: flex;
	align-items: stretch;
	min-width: 0;
	border-radius: 7px;
	background: var(--pt-inset);
	box-shadow: inset 3px 0 0 hsl(var(--h) 80% 60%);
}

.pl-drow.picked .pl-dhead {
	box-shadow: inset 3px 0 0 hsl(var(--h) 80% 60%), inset 0 0 0 1px hsl(var(--h) 80% 60% / .8);
}

.pl-dled {
	flex: none;
	width: 22px;
	display: grid;
	place-items: center;
	padding: 0 0 0 3px;
	border: 0;
	background: none;
}

.pl-dled i {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--hw-led-off, #2c3a33);
}

.pl-dled.lit i {
	background: var(--hw-led, #5dffb0);
	box-shadow: 0 0 5px var(--hw-led, #5dffb0);
}

.pl-dname {
	flex: 1;
	min-width: 0;
	padding: 0 4px 0 0;
	border: 0;
	background: none;
	text-align: left;
	font: 700 10px Cousine, ui-monospace, monospace;
	color: hsl(var(--h) 85% 72%);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pl-dcell {
	position: relative;
	overflow: hidden;
	min-width: 0;
	padding: 0;
	border: 0;
	border-radius: 5px;
	background: var(--pad-bg, var(--pt-surface-2));
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06);
	touch-action: none;
}

.pl-dcell.beat {
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16);
}

.pl-dcell.dim {
	opacity: .45;
}

.pl-dfill {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 0;
}

.pl-dcell.on .pl-dfill {
	height: var(--v, 100%);
	background: linear-gradient(180deg, hsl(var(--h) var(--pp-sat) var(--pp-lit)), hsl(var(--h) var(--pp-sat) calc(var(--pp-lit) - 12%)));
}

.pl-dcell.now {
	outline: 2px solid var(--pl-now);
	outline-offset: -2px;
	filter: brightness(1.3);
}

/* Step numbers on the 8-step halves only, where they say which half shows */
.pl-dnum {
	display: none;
}

.pl-drums.narrow .pl-dnum {
	display: block;
	position: absolute;
	top: 2px;
	left: 4px;
	z-index: 1;
	font-size: 8px;
	color: var(--pt-muted);
}

.pl-drums.narrow .pl-dcell.on .pl-dnum {
	color: rgba(255, 255, 255, .8);
}

/* The picked row's name, before its knobs */
.pl-dpicked {
	align-content: center;
	gap: 2px;
	min-width: 0;
	max-width: 100%;
}

.pl-dpicked b {
	font-size: 11px;
	color: hsl(var(--h) 85% 72%);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 100%;
}

.pl-mini button:disabled {
	opacity: .35;
}

/* top bar */
.pl-top {
	display: flex;
	align-items: center;
	gap: 5px;
	height: 34px;
	flex: none;
}

/* The tiny pads: two rows of eight, as on the Pads page, on the scope's screen */
.pl-minipads {
	flex: none;
	display: grid;
	grid-template-columns: repeat(8, 6px);
	grid-template-rows: repeat(2, 1fr);
	gap: 2px;
	height: 30px;
	padding: 3px 4px;
	border-radius: 7px;
	background: var(--nac-lcd-bg, #0f141b);
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08), inset 0 0 8px rgba(0, 0, 0, .5);
	pointer-events: none;
}

.pl-mp {
	border-radius: 2px;
	background: rgba(255, 255, 255, .1);
}

/* Each beat's first step a little brighter, as the Pads page marks them */
.pl-mp.beat {
	background: rgba(255, 255, 255, .22);
}

.pl-mp.on {
	background: hsl(var(--h) var(--pp-sat, 85%) var(--pp-lit, 60%));
}

.pl-mp.now {
	box-shadow: 0 0 0 1.5px #fff;
}

/* The mini scope and pads: each theme's screen colours (the machine rail's are its own) */

.theme-analog .pl-minipads { background: #1a1208; }
.theme-analog .pl-scope { background: #1a1208; color: #ffb547; }

.theme-synthwave .pl-minipads { background: #2a0f52; }
.theme-synthwave .pl-scope { background: #2a0f52; color: #f3c6ff; }

.pl-scope {
	width: 64px;
	height: 30px;
	flex: none;
	border-radius: 7px;
	background: var(--nac-lcd-bg, #0f141b);
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08), inset 0 0 8px rgba(0, 0, 0, .5);
	color: var(--nac-scope-trace, hsl(var(--pt-accent) 85% 68%));
}

.pl-tabs {
	display: flex;
	gap: 3px;
	padding: 3px;
	border-radius: 11px;
	background: var(--pt-inset);
	box-shadow: inset 0 0 0 1px var(--pt-hairline);
}

.pl-tab {
	border: 0;
	background: transparent;
	color: var(--pt-header-fg);
	opacity: .75;
	font: inherit;
	font-size: 11px;
	letter-spacing: .08em;
	text-transform: uppercase;
	padding: 7px 12px;
	min-width: 58px;
	border-radius: 8px;
}

/* The chosen tab: filled, outlined in the accent, like a pressed segment */
.pl-tab.on {
	opacity: 1;
	font-weight: 700;
	background: hsl(var(--pt-accent) 70% 50% / .28);
	color: var(--pt-text);
	box-shadow: inset 0 0 0 1px hsl(var(--pt-accent) 75% 60% / .8);
}

/* Play / Stop in the top bar */
.pl-go {
	flex: none;
	display: inline-flex;
	align-items: center;
	gap: 5px;
	height: 32px;
	padding: 0 12px 0 9px;
	border: 0;
	border-radius: 9px;
	color: #fff;
	font: inherit;
	font-size: 12px;
	font-weight: 700;
	letter-spacing: .06em;
	text-transform: uppercase;
	background: linear-gradient(135deg, hsl(var(--pt-accent) 78% 62%), hsl(var(--pt-accent-2) 82% 48%));
	box-shadow: 0 3px 10px rgba(0, 0, 0, .4), inset 0 1px 0 rgba(255, 255, 255, .3);
}

.pl-go svg {
	width: 16px;
	height: 16px;
	fill: currentColor;
}

.pl-go.playing {
	box-shadow: 0 0 0 2px hsl(var(--pt-accent) 90% 70% / .6), 0 0 14px hsl(var(--pt-accent) 90% 60% / .7);
}

.pl-grow {
	flex: 1;
	min-width: 0;
}

.pl-stepper {
	display: flex;
	align-items: center;
	height: 32px;
	border-radius: 9px;
	background: var(--pt-panel);
	border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 55%);
}

.pl-cap {
	font-size: 8px;
	letter-spacing: .14em;
	text-transform: uppercase;
	color: var(--pt-muted);
}

.pl-arr,
.pl-val {
	border: 0;
	background: transparent;
	color: inherit;
	font: inherit;
	height: 100%;
}

.pl-arr {
	color: hsl(var(--pt-accent) 75% 62%);
	padding: 0 6px;
	font-size: 12px;
}

/* The name, its caption (Sound, Pattern) small above it */
.pl-val {
	display: grid;
	align-content: center;
	line-height: 1.1;
	font-weight: 700;
	font-size: 12px;
	width: 64px;
	color: var(--pt-text);
	padding: 0;
	white-space: nowrap;
}

.pl-val .pl-cap {
	font-size: 7px;
	font-weight: 400;
}

.pl-icon {
	width: 32px;
	height: 32px;
	border-radius: 9px;
	flex: none;
	display: grid;
	place-items: center;
	background: var(--pt-panel);
	color: var(--pt-text);
	border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 55%);
	font-size: 15px;
	padding: 0;
}

.pl-icon:disabled {
	opacity: .4;
}

.pl-dice svg {
	width: 16px;
	height: 16px;
	fill: none;
	stroke: currentColor;
	stroke-width: 1.4;
}

.pl-dice svg circle {
	fill: currentColor;
	stroke: none;
}

/* pages */
.pl-pages {
	flex: 1;
	min-height: 0;
	display: flex;
}

.pl-frame {
	flex: 1;
	min-width: 0;
	min-height: 0;
	border-radius: 14px;
	padding: 8px;
	background: linear-gradient(145deg, var(--pt-surface-1), var(--pt-surface-2));
	box-shadow: inset 0 0 5px rgba(0, 0, 0, .35), 0 8px 20px rgba(0, 0, 0, .35);
}

.pl-page {
	overflow-y: auto;
	overscroll-behavior: contain;
}

.pl-play {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 236px;
	gap: 8px;
}

.pl-pads {
	display: grid;
	grid-template-columns: repeat(8, minmax(0, 1fr));
	grid-template-rows: 1fr 1fr;
	gap: 6px;
	min-height: 0;
}

.pl-pad {
	position: relative;
	overflow: hidden;
	border: 0;
	padding: 0;
	border-radius: 8px;
	background: var(--pad-bg, var(--pt-surface-2));
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06), 0 3px 8px rgba(0, 0, 0, .35);
	color: #fff;
	font: inherit;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	touch-action: none;
}

.pl-pad.beat::after {
	content: "";
	position: absolute;
	top: 5px;
	right: 6px;
	width: 4px;
	height: 4px;
	border-radius: 50%;
	background: currentColor;
	opacity: .35;
	z-index: 1;
}

/* The playing step: a thick bright outline, a glowing bar along its top, and its colour
   brightened, so it shows on a full pad as well as on an empty one */
.pl-pad.now {
	outline: 3px solid var(--pl-now);
	outline-offset: -3px;
	box-shadow: 0 0 16px var(--pl-now);
	filter: brightness(1.3) saturate(1.1);
}

.pl-pad.now .pl-num,
.pl-pad.now .pl-rat {
	top: 8px;
}

.pl-pad.now::before {
	content: "";
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	height: 6px;
	z-index: 2;
	background: var(--pl-now);
	box-shadow: 0 0 10px var(--pl-now);
}

.pl-num {
	position: absolute;
	top: 3px;
	left: 6px;
	font-size: 9px;
	z-index: 1;
	color: var(--pt-muted);
}

.pl-pad.on .pl-num {
	color: rgba(255, 255, 255, .8);
}

.pl-rat {
	position: absolute;
	top: 3px;
	right: 4px;
	z-index: 1;
	font-size: 9px;
	font-weight: 700;
	padding: 1px 3px;
	border-radius: 4px;
	background: rgba(0, 0, 0, .45);
	color: #fff;
}

.pl-fill {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: var(--v);
	background: linear-gradient(180deg, hsl(var(--h) var(--pp-sat) var(--pp-lit)), hsl(var(--h) var(--pp-sat) calc(var(--pp-lit) - 12%)));
}

.pl-note {
	position: relative;
	z-index: 1;
	font-size: 11px;
	font-weight: 700;
	margin-bottom: 5px;
	text-shadow: 0 1px 2px rgba(0, 0, 0, .6);
}

.pl-side {
	display: grid;
	grid-template-rows: auto auto auto auto minmax(0, 1fr);
	gap: 6px;
	min-height: 0;
}

.pl-pick {
	display: flex;
	align-items: center;
	gap: 5px;
	min-width: 0;
}

.pl-pick > .pl-stepper,
.pl-pick > .pl-mini {
	flex: 1;
	min-width: 0;
}

.pl-pick .pl-val {
	flex: 1;
	width: auto;
	min-width: 0;
}

.pl-mini {
	display: grid;
	grid-template-columns: 28px 1fr 28px;
	align-items: center;
	gap: 2px;
	height: 27px;
	border-radius: 8px;
	background: var(--pt-inset);
	font-size: 10px;
	text-align: center;
	color: var(--pt-muted);
	white-space: nowrap;
}

.pl-mini b {
	font-size: 14px;
	color: var(--pt-text);
}

/* Move: three buttons, no caption */
.pl-mini.pl-move {
	grid-template-columns: repeat(3, 1fr);
}

/* Humanize: a button as tall as the steppers beside it */
.pl-mini.pl-hum {
	display: block;
	border: 0;
	padding: 0 6px;
	font: inherit;
	font-size: 11px;
	letter-spacing: .06em;
	color: var(--pt-text);
}

.pl-mini button {
	height: 27px;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--pt-text);
	font-size: 15px;
	padding: 0;
}

.pl-macros {
	display: grid;
	/* One line of four since PR 73, which added a row of steppers above */
	grid-template-columns: repeat(4, minmax(0, 1fr));
	place-items: center;
	background: var(--pt-inset);
	border-radius: 10px;
	padding: 4px;
	min-height: 0;
}

.pl-macro {
	display: grid;
	justify-items: center;
	gap: 0;
}

.pl-mv {
	font-size: 10px;
	color: var(--pt-text);
}

/* sheets: the stepper's list, the held pad, the menu */
.pl-scrim {
	position: fixed;
	inset: 0;
	z-index: 60;
	background: rgba(5, 2, 15, .5);
}

.pl-sheet {
	position: fixed;
	z-index: 61;
	left: 50%;
	top: 50%;
	transform: translate(-50%, -50%);
	width: min(620px, calc(100vw - 40px));
	max-height: calc(100vh - 24px);
	overflow-y: auto;
	padding: 10px;
	border-radius: 14px;
	background: var(--pt-panel);
	color: var(--pt-text);
	border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 40%);
	box-shadow: 0 10px 30px rgba(0, 0, 0, .55);
	display: grid;
	gap: 8px;
}

.pl-list {
	width: min(420px, calc(100vw - 40px));
	grid-template-columns: repeat(3, 1fr);
}

.pl-row {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.pl-small {
	min-height: 30px;
	padding: 4px 10px;
}

.pt-btn[aria-pressed="true"] {
	box-shadow: 0 0 0 2px hsl(var(--pt-accent) 90% 60% / .35), 0 0 12px var(--pt-btn-glow);
	font-weight: 700;
}

.pl-notes {
	display: grid;
	grid-template-columns: repeat(8, 1fr);
	gap: 5px;
}

.pl-n {
	height: 38px;
	border: 0;
	border-radius: 7px;
	font: inherit;
	font-size: 12px;
	font-weight: 700;
	color: #fff;
	text-shadow: 0 1px 2px rgba(0, 0, 0, .5);
	background: hsl(var(--h) var(--pp-sat) calc(var(--pp-lit) - 6%));
}

.pl-n.cur {
	outline: 3px solid var(--pt-text);
	outline-offset: -3px;
}

.pl-vel {
	flex: 1;
	min-width: 120px;
	accent-color: hsl(var(--pt-accent) 75% 55%);
}

/* The menu: a panel from the left, as tall as the screen, so the File menu opens in it without
   scrolling (its rows tighter than on a computer; Open's list of projects beside the panel) */
.pl-menu {
	--pl-menu-w: min(400px, 62vw);
	position: fixed;
	z-index: 61;
	left: 0;
	top: 0;
	bottom: 0;
	width: var(--pl-menu-w);
	overflow-y: auto;
	padding: 10px max(10px, env(safe-area-inset-left, 0px)) 10px 10px;
	padding-left: max(10px, env(safe-area-inset-left, 0px));
	border-radius: 0 14px 14px 0;
	background: var(--pt-panel);
	color: var(--pt-text);
	border-right: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 40%);
	box-shadow: 10px 0 30px rgba(0, 0, 0, .5);
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.pl-menu-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.pl-menu-title {
	font-size: 12px;
	font-weight: 700;
	letter-spacing: .14em;
	text-transform: uppercase;
}

.pl-menu-sec {
	display: flex;
	flex-direction: column;
	gap: 5px;
}

/* At the bottom: Desktop View and Reset…, the same size; Reset's question wraps over its
   buttons */
.pl-menu-foot {
	margin-top: auto;
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	padding-top: 10px;
	border-top: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 60%);
}

.pl-menu-foot .pt-btn {
	flex: 1 1 0;
	min-height: 32px;
	padding: 4px 8px;
	white-space: nowrap;
}

.pl-reset-q {
	flex: 1 0 100%;
	font-size: 12px;
	color: var(--pt-muted);
}

.pl-menu :deep(.pt-card) {
	margin: 0;
	padding: 6px;
}

/* The File bar: File, the name, Save. Its Undo and Redo are in the top bar (here they landed on
   the name box), and the name takes the room between */
.pl-menu :deep(.pc-history) {
	display: none;
}

.pl-menu :deep(.pc-toolbar) {
	grid-template-columns: auto minmax(0, 1fr) auto;
	gap: 8px;
	padding: 6px 8px;
}

.pl-menu :deep(.pc-center) {
	justify-self: stretch;
}

.pl-menu :deep(.pc-name) {
	width: 100%;
	max-width: none;
	min-width: 0;
}

.pl-menu :deep(.topbar-home) {
	display: none;
}

.pl-menu :deep(.pc-file-menu) {
	inline-size: 230px;
	padding: 4px;
}

.pl-menu :deep(.pc-file-menu > .pc-menu-row),
.pl-menu :deep(.pc-file-menu .pc-sub-btn) {
	padding: .38rem .6rem;
	font-size: 13px;
}

.pl-menu :deep(.pc-open-submenu) {
	position: fixed;
	top: 8px;
	bottom: auto;
	left: calc(var(--pl-menu-w) + 8px);
	right: 8px;
	transform: none;
	inline-size: auto;
	max-height: calc(100vh - 16px);
	overflow-y: auto;
	z-index: 70;
}

/* Small phones (an iPhone SE is 667 px wide sideways; the first one 568). Last in the file, so
   they win over the rules they change (until PR 73 they came first, and the 720 px ones never
   applied) */
@media (max-width: 720px) {
	.pl-scope {
		width: 48px;
	}

	.pl-tab {
		padding: 7px 8px;
		min-width: 0;
	}
}

@media (max-width: 600px) {
	.pl-go span {
		display: none;
	}

	.pl-arr {
		display: none;
	}
}
</style>

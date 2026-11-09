<template>
	<!-- Phone mode (usePhoneMode.ts): a phone held sideways. One screen without scrolling (Play:
		 16 pads in two rows of 8, Play and tempo, four big knobs; Sound and Pattern steppers in the
		 top bar), and Sound, FX and Key a swipe or a tab away. DrumSequencer.vue passes the state
		 in `ctx` and the desktop's own panels for the other pages as slots. -->
	<div class="phone-layout">
		<header class="pl-top">
			<img class="pl-logo" src="../assets/eWaveLogo1.png" alt="Ephemeral Wave">
			<div class="pl-tabs" role="tablist" aria-label="Pages">
				<button v-for="p in PAGES" :key="p.id" type="button" role="tab" class="pl-tab"
					:class="{ on: page === p.id }" :aria-selected="page === p.id" @click="page = p.id">{{ p.label }}</button>
			</div>
			<span class="pl-grow"></span>
			<template v-if="page === 'play'">
				<div class="pl-stepper" role="group" aria-label="Sound">
					<span class="pl-cap">Sound</span>
					<button type="button" class="pl-arr" aria-label="Previous sound" @click="stepSound(-1)">◂</button>
					<button type="button" class="pl-val" aria-label="All sounds" @click="list = 'sound'">{{ soundName }}</button>
					<button type="button" class="pl-arr" aria-label="Next sound" @click="stepSound(1)">▸</button>
				</div>
				<button type="button" class="pl-icon pl-dice" aria-label="Random sound" title="Random sound" @click="rollSound">
					<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" /><circle cx="5" cy="5" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="11" cy="11" r="1.2" /></svg>
				</button>
				<div class="pl-stepper" role="group" aria-label="Pattern">
					<span class="pl-cap">Pattern</span>
					<button type="button" class="pl-arr" aria-label="Previous pattern" @click="stepPattern(-1)">◂</button>
					<button type="button" class="pl-val" aria-label="All patterns" @click="list = 'pattern'">{{ patternName }}</button>
					<button type="button" class="pl-arr" aria-label="Next pattern" @click="stepPattern(1)">▸</button>
				</div>
				<button type="button" class="pl-icon pl-dice" aria-label="Random pattern" title="Random pattern" @click="rollPattern">
					<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" /><circle cx="5" cy="5" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="11" cy="11" r="1.2" /></svg>
				</button>
			</template>
			<button v-if="page === 'play'" type="button" class="pl-clear" title="Turn every step off (Undo brings them back)"
				@click="clearSteps">Clear</button>
			<button type="button" class="pl-icon" aria-label="Undo" title="Undo" :disabled="!ctx.canUndo" @click="ctx.undo()">↶</button>
			<button type="button" class="pl-icon" aria-label="Menu" title="Menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">☰</button>
		</header>

		<div class="pl-pages" @pointerdown="swipeStart" @pointerup="swipeEnd" @pointercancel="swipe = null">
			<!-- Play -->
			<section v-show="page === 'play'" class="pl-frame pl-play" aria-label="Play">
				<div class="pl-pads" role="group" aria-label="Steps">
					<button v-for="(on, i) in (ctx.inst.steps as boolean[])" :key="i" type="button" class="pl-pad"
						:class="{ on, beat: i % 4 === 0, now: ctx.isPlaying && i === ctx.currentStep }"
						:aria-pressed="!!on" :aria-label="padLabel(i)"
						:style="on ? padStyle(i) : undefined"
						@pointerdown="padDown(i, $event)" @pointermove="padMove($event)" @pointerup="padUp(i)"
						@pointercancel="padCancel" @contextmenu.prevent @keydown.enter.prevent="toggleStep(i)">
						<span class="pl-num">{{ i + 1 }}</span>
						<span v-if="on && (ctx.inst.ratchets?.[i] ?? 1) > 1" class="pl-rat">×{{ ctx.inst.ratchets[i] }}</span>
						<span v-if="on" class="pl-fill"></span>
						<span v-if="on" class="pl-note">{{ ctx.noteName(ctx.inst.pitches[i]) }}</span>
					</button>
				</div>
				<div class="pl-side">
					<div class="pl-transport">
						<button type="button" class="pl-play-btn" :aria-label="ctx.isPlaying ? 'Stop' : 'Play'"
							:aria-pressed="ctx.isPlaying" @click="ctx.togglePlay()">
							<svg v-if="!ctx.isPlaying" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12l10-6-10-6z" /></svg>
							<svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>
						</button>
						<div class="pl-tempo" role="group" aria-label="Tempo">
							<button type="button" aria-label="Tempo −1" @click="ctx.tempo = Math.max(20, ctx.tempo - 1)">−</button>
							<b>{{ ctx.tempo }}</b><span>BPM</span>
							<button type="button" aria-label="Tempo +1" @click="ctx.tempo = Math.min(300, ctx.tempo + 1)">+</button>
						</div>
					</div>
					<div class="pl-macros">
						<div class="pl-macro">
							<Knob v-model="ctx.decayMs" label="Decay" :min="50" :max="2000" :step="1" taper="log" size="medium"
								:value-text="`${Math.round(ctx.decayMs)} ms`" />
							<span class="pl-mv">{{ Math.round(ctx.decayMs) }} ms</span>
						</div>
						<div class="pl-macro">
							<Knob v-model="ctx.cutoff" label="Tone" :min="100" :max="10000" :step="1" taper="log" size="medium"
								:value-text="hzText(ctx.cutoff)" />
							<span class="pl-mv">{{ hzText(ctx.cutoff) }}</span>
						</div>
						<div class="pl-macro">
							<Knob v-model="ctx.sweep" label="Sweep" :min="-48" :max="48" :step="1" bipolar size="medium"
								:value-text="`${ctx.sweep > 0 ? '+' : ''}${ctx.sweep} st`" />
							<span class="pl-mv">{{ ctx.sweep > 0 ? '+' : '' }}{{ ctx.sweep }} st</span>
						</div>
						<div class="pl-macro">
							<Knob v-model="ctx.space" label="Space" :min="0" :max="1" :step="0.01" size="medium"
								:value-text="`${Math.round(ctx.space * 100)}%`" />
							<span class="pl-mv">{{ Math.round(ctx.space * 100) }}%</span>
						</div>
					</div>
				</div>
			</section>

			<section v-show="page === 'sound'" class="pl-frame pl-page" aria-label="Sound"><slot name="sound" /></section>
			<section v-show="page === 'fx'" class="pl-frame pl-page" aria-label="FX"><slot name="fx" /></section>
			<section v-show="page === 'key'" class="pl-frame pl-page" aria-label="Key"><slot name="key" /></section>
		</div>

		<!-- All six sounds or patterns (a tap on the stepper's name) -->
		<div v-if="list" class="pl-scrim" @click="list = null"></div>
		<div v-if="list" class="pl-sheet pl-list" role="dialog" :aria-label="list === 'sound' ? 'Sounds' : 'Patterns'">
			<button v-for="p in (list === 'sound' ? ctx.presets : ctx.patterns)" :key="p.id" type="button" class="pt-btn"
				:aria-pressed="(list === 'sound' ? ctx.activePresetId : ctx.activePatternId) === p.id"
				@click="list === 'sound' ? chooseSound(p.id) : choosePattern(p.id); list = null">{{ p.label }}</button>
		</div>

		<!-- A held pad: its note (the key's scale over two octaves), velocity and repeats -->
		<div v-if="held !== null" class="pl-scrim" @click="held = null"></div>
		<div v-if="held !== null" class="pl-sheet pl-picker" role="dialog" :aria-label="`Step ${held + 1}`">
			<div class="pl-row">
				<span class="pl-cap pl-grow">Step {{ held + 1 }} · {{ scaleText }}</span>
				<button type="button" class="pt-btn pl-small" @click="setStepOn(held, false); held = null">Off</button>
				<button type="button" class="pt-btn pl-small" @click="held = null">Done</button>
			</div>
			<div class="pl-notes">
				<button v-for="n in pickerNotes" :key="n.hz" type="button" class="pl-n"
					:class="{ cur: ctx.inst.steps[held] && Math.abs(n.hz - ctx.inst.pitches[held]) < 0.5 }"
					:style="{ '--h': ctx.hue(n.hz) }" @click="pickNote(held, n.hz)">{{ n.name }}</button>
			</div>
			<div class="pl-row">
				<label class="pl-cap" :for="`pl-vel`">Velocity</label>
				<input id="pl-vel" class="pl-vel" type="range" min="0.05" max="1" step="0.01"
					:value="ctx.inst.velocities[held]" @input="setVelocity(held, +($event.target as HTMLInputElement).value)">
				<span class="pl-cap">Repeats</span>
				<button v-for="r in [1, 2, 3, 4]" :key="r" type="button" class="pt-btn pl-small"
					:aria-pressed="(ctx.inst.ratchets?.[held] ?? 1) === r" @click="setRatchet(held, r)">×{{ r }}</button>
			</div>
		</div>

		<!-- The menu, a panel from the left: the File bar (moved here by DrumSequencer), themes,
			 back to the full layout -->
		<div v-show="menuOpen" class="pl-scrim" @click="menuOpen = false"></div>
		<div v-show="menuOpen" class="pl-menu" role="dialog" aria-label="Menu">
			<div id="phone-menu-slot"></div>
			<div class="pl-row">
				<span class="pl-cap">Theme</span>
				<ThemeToggle />
			</div>
			<div class="pl-row">
				<button type="button" class="pt-btn" @click="menuOpen = false; ctx.fullLayout()">Full layout</button>
				<span class="pl-cap pl-grow">The whole synth, as on a computer. Its Phone layout button comes back here.</span>
			</div>
			<div class="pl-row">
				<span class="pl-grow"></span>
				<button type="button" class="pt-btn pl-small" @click="menuOpen = false">Close</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, provide, onBeforeUnmount } from 'vue';
import Knob from './Knob.vue';
import ThemeToggle from './ThemeToggle.vue';
import { SCALES, NOTE_TO_SEMITONE, midiToFreq, freqToMidiExact } from '../lib/melody/theory';

const props = defineProps<{ ctx: any }>();
const ctx = props.ctx;

// The desktop's panels shown here again must not take MIDI learn's links from the desktop's
provide('noMidiLearn', true);

const PAGES = [
	{ id: 'play', label: 'Play' },
	{ id: 'sound', label: 'Sound' },
	{ id: 'fx', label: 'FX' },
	{ id: 'key', label: 'Key' },
] as const;
type PageId = typeof PAGES[number]['id'];
const page = ref<PageId>('play');
const menuOpen = ref(false);
const list = ref<null | 'sound' | 'pattern'>(null);

// Swipe left or right between pages (not from a knob, a slider or an open sheet)
let swipe: null | { x: number; y: number } = null;
function swipeStart(e: PointerEvent) {
	const t = e.target as HTMLElement;
	swipe = t.closest('[role="slider"], input, .pl-sheet') ? null : { x: e.clientX, y: e.clientY };
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

// Pads: a tap turns a step on or off; a hold (400 ms) opens its note
const HOLD_MS = 400;
const held = ref<number | null>(null);
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let press: null | { i: number; x: number; y: number; held: boolean } = null;
function padDown(i: number, e: PointerEvent) {
	press = { i, x: e.clientX, y: e.clientY, held: false };
	holdTimer = setTimeout(() => {
		if (!press) return;
		press.held = true;
		held.value = i;
		navigator.vibrate?.(10);
	}, HOLD_MS);
}
function padMove(e: PointerEvent) {
	if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) padCancel();
}
function padUp(i: number) {
	if (holdTimer) clearTimeout(holdTimer);
	holdTimer = null;
	if (press && press.i === i && !press.held) toggleStep(i);
	press = null;
}
function padCancel() {
	if (holdTimer) clearTimeout(holdTimer);
	holdTimer = null;
	press = null;
}
onBeforeUnmount(padCancel);

const replace = (arr: any[], i: number, v: any) => arr.map((x, j) => (j === i ? v : x));
// Clear: a new pattern from scratch, every step off (one undo step)
function clearSteps() { ctx.inst.steps = ctx.inst.steps.map(() => false); }
function setStepOn(i: number, on: boolean) { ctx.inst.steps = replace(ctx.inst.steps, i, on); }
function toggleStep(i: number) { setStepOn(i, !ctx.inst.steps[i]); }
function setVelocity(i: number, v: number) { ctx.inst.velocities = replace(ctx.inst.velocities, i, v); }
function setRatchet(i: number, r: number) {
	const cur = ctx.inst.ratchets ?? Array(ctx.inst.steps.length).fill(1);
	ctx.inst.ratchets = replace(cur, i, r);
}
function pickNote(i: number, hz: number) {
	ctx.inst.pitches = replace(ctx.inst.pitches, i, hz);
	if (!ctx.inst.steps[i]) setStepOn(i, true);
	ctx.audition(hz);
}

// The notes offered for a held pad: the Melody Maker's key and scale (every semitone with no
// scale), 16 of them around the pad's own note, within the pads' range
const scaleSteps = computed<readonly number[]>(() =>
	ctx.keyScale && ctx.keyScale !== 'none' ? (SCALES as any)[ctx.keyScale] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
const scaleText = computed(() => `${ctx.keyRoot} ${ctx.keyScaleLabel}`);
const pickerNotes = computed(() => {
	if (held.value === null) return [];
	const root = NOTE_TO_SEMITONE[ctx.keyRoot] ?? 9;
	const center = Math.round(freqToMidiExact(ctx.inst.pitches[held.value] || 220));
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
	return { '--h': ctx.hue(ctx.inst.pitches[i]), '--v': `${Math.round((ctx.inst.velocities[i] ?? 1) * 100)}%` };
}
function padLabel(i: number) {
	return ctx.inst.steps[i] ? `Step ${i + 1}, ${ctx.noteName(ctx.inst.pitches[i])}` : `Step ${i + 1}`;
}
function hzText(hz: number) {
	return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
}
</script>

<style scoped>
.phone-layout {
	--pp-sat: 82%;
	--pp-lit: 58%;
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

.theme-sand .phone-layout,
.theme-light .phone-layout {
	--pp-sat: 52%;
	--pp-lit: 50%;
}

/* top bar */
.pl-top {
	display: flex;
	align-items: center;
	gap: 6px;
	height: 34px;
	flex: none;
}

.pl-logo {
	width: 30px;
	height: 30px;
	border-radius: 8px;
	object-fit: cover;
	flex: none;
}

.pl-tabs {
	display: flex;
	gap: 2px;
}

.pl-tab {
	border: 0;
	background: transparent;
	color: var(--pt-header-fg);
	opacity: .7;
	font: inherit;
	font-size: 10px;
	letter-spacing: .1em;
	text-transform: uppercase;
	padding: 8px 7px;
	border-radius: 8px;
}

.pl-tab.on {
	opacity: 1;
	background: var(--pt-inset);
	color: var(--pt-text);
	box-shadow: inset 0 -2px 0 hsl(var(--pt-accent) 80% 60%);
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
	padding-left: 7px;
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
	padding: 0 7px;
	font-size: 12px;
}

.pl-val {
	font-weight: 700;
	font-size: 12px;
	min-width: 62px;
	color: var(--pt-text);
	padding: 0;
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

.pl-pad.now {
	outline: 2px solid hsl(var(--pt-accent) 90% 75%);
	outline-offset: -2px;
	box-shadow: 0 0 14px hsl(var(--pt-accent) 90% 65% / .8);
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
	grid-template-rows: auto 1fr;
	gap: 8px;
	min-height: 0;
}

.pl-transport {
	display: flex;
	gap: 8px;
	align-items: center;
}

.pl-play-btn {
	flex: 1;
	height: 58px;
	border: 0;
	border-radius: 14px;
	display: grid;
	place-items: center;
	color: #fff;
	background: radial-gradient(circle at 30% 20%, hsl(var(--pt-accent) 78% 74%) 0, hsl(var(--pt-accent) 78% 66%) 38%, hsl(var(--pt-accent-2) 82% 58%) 80%, hsl(var(--pt-accent-2) 90% 46%) 100%);
	box-shadow: 0 8px 18px rgba(0, 0, 0, .45), 0 0 0 1px rgba(0, 0, 0, .7), inset 0 2px 6px rgba(0, 0, 0, .4);
}

.pl-play-btn[aria-pressed="true"] {
	box-shadow: 0 0 0 3px hsl(var(--pt-accent) 90% 70% / .5), 0 8px 18px rgba(0, 0, 0, .45);
}

.pl-play-btn svg {
	width: 28px;
	height: 28px;
	fill: currentColor;
}

.pl-tempo {
	display: grid;
	grid-template-columns: 26px auto 26px;
	grid-template-rows: auto auto;
	align-items: center;
	justify-items: center;
	line-height: 1;
}

.pl-tempo b {
	font-size: 18px;
}

.pl-tempo span {
	grid-column: 2;
	font-size: 8px;
	letter-spacing: .14em;
	color: var(--pt-muted);
}

.pl-tempo button {
	grid-row: 1 / span 2;
	width: 26px;
	height: 40px;
	border: 0;
	border-radius: 8px;
	background: var(--pt-inset);
	color: var(--pt-text);
	font-size: 16px;
	padding: 0;
}

.pl-tempo button:last-of-type {
	grid-column: 3;
}

.pl-macros {
	display: grid;
	grid-template-columns: 1fr 1fr;
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

.pl-clear {
	height: 32px;
	padding: 0 9px;
	border-radius: 9px;
	flex: none;
	background: var(--pt-panel);
	color: var(--pt-text);
	border: 1px solid color-mix(in oklab, var(--pt-btn-border), transparent 55%);
	font: inherit;
	font-size: 11px;
	letter-spacing: .06em;
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

.pl-menu :deep(.pt-card) {
	margin: 0;
	padding: 6px;
}

.pl-menu :deep(.pc-toolbar) {
	flex-wrap: wrap;
	row-gap: 6px;
}

.pl-menu :deep(.topbar-logo) {
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
</style>

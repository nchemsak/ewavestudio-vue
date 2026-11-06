<!-- components/ExportDialog.vue -->
<!-- File → Export audio…: what to export (src/audio/export/exportFiles.ts makes the files;
	 DrumSequencer downloads them). Length in bars, loop or with tail, and which files: the mix,
	 effects stems, a MIDI file, a one-shot at a chosen note; normalize. Several files come as
	 one .zip. -->
<template>
	<teleport to="body">
		<div v-if="open" class="export-overlay" @mousedown.self="close">
			<div ref="panel" class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title"
				tabindex="-1" @keydown.esc.stop="close">
				<div class="export-head">
					<h2 id="export-title" class="export-title">Export audio</h2>
					<button class="pt-btn export-close" type="button" :disabled="busy" @click="close">Close</button>
				</div>

				<div class="export-row">
					<div class="export-label">Bars</div>
					<div class="pt-seg pt-seg-sm" role="group" aria-label="Bars">
						<button v-for="b in EXPORT_BARS" :key="b" type="button" class="pt-seg-btn"
							:class="{ 'is-active': o.bars === b }" :aria-pressed="o.bars === b" @click="o.bars = b">{{ b }}</button>
					</div>
					<span class="export-hint">{{ lengthText }}</span>
				</div>

				<div class="export-row">
					<div class="export-label">Ending</div>
					<div class="pt-seg pt-seg-sm" role="group" aria-label="Ending">
						<button type="button" class="pt-seg-btn" :class="{ 'is-active': o.ending === 'loop' }"
							:aria-pressed="o.ending === 'loop'" @click="o.ending = 'loop'">Loop</button>
						<button type="button" class="pt-seg-btn" :class="{ 'is-active': o.ending === 'tail' }"
							:aria-pressed="o.ending === 'tail'" @click="o.ending = 'tail'">With tail</button>
					</div>
				</div>
				<p class="export-note">{{ endingText }}</p>

				<fieldset class="export-files">
					<legend class="export-label">Files</legend>
					<label class="export-check">
						<input type="checkbox" v-model="o.mix" />
						<span>Mix</span>
						<span class="export-hint">the pattern as you hear it</span>
					</label>
					<label class="export-check">
						<input type="checkbox" v-model="o.stems" />
						<span>Effects stems</span>
						<span class="export-hint">{{ stemsText }}</span>
					</label>
					<label class="export-check">
						<input type="checkbox" v-model="o.midi" />
						<span>MIDI file</span>
						<span class="export-hint">the pattern's notes, to play on any instrument</span>
					</label>
					<div class="export-check">
						<input id="export-one-shot" type="checkbox" v-model="o.oneShot" />
						<span class="export-one-shot">
							<label for="export-one-shot">One-shot at</label>
							<select v-model.number="o.oneShotHz" class="pt-select export-select" aria-label="One-shot note"
								:disabled="!o.oneShot">
								<option v-for="n in notes" :key="n.hz" :value="n.hz">{{ n.label }}</option>
							</select>
						</span>
						<span class="export-hint">one hit of the sound, for a sampler or drum rack</span>
					</div>
				</fieldset>

				<label class="export-check export-normalize">
					<input type="checkbox" v-model="o.normalize" />
					<span>Normalize</span>
					<span class="export-hint">louder: peaks at −1 dB, the mix and stems by the same amount</span>
				</label>

				<div class="export-actions">
					<span class="export-hint export-status" aria-live="polite">{{ statusText }}</span>
					<button class="pt-btn" type="button" :disabled="busy" @click="close">Cancel</button>
					<button class="pt-btn export-go" type="button" :disabled="busy || fileCount === 0"
						@click="emit('export', { ...o })">{{ busy ? 'Exporting…' : 'Export' }}</button>
				</div>
			</div>
		</div>
	</teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { EXPORT_BARS, type ExportOptions } from '../audio/export/exportFiles';

const props = defineProps<{
	open: boolean;
	options: ExportOptions;                     // starting choices (the last ones used)
	notes: { hz: number; label: string }[];     // the one-shot's note choices
	bpm: number;
	effectsOn: { delay: boolean; reverb: boolean; noise: boolean };
	busy: boolean;
	progress: string;                           // "2 of 5" while rendering
}>();

const emit = defineEmits<{
	(e: 'export', options: ExportOptions): void;
	(e: 'close'): void;
}>();

const o = reactive<ExportOptions>({ ...props.options });
const panel = ref<HTMLElement | null>(null);

// Each time it opens: the starting choices, and focus in the dialog
watch(() => props.open, async (isOpen) => {
	if (!isOpen) return;
	Object.assign(o, props.options);
	await nextTick();
	panel.value?.focus();
}, { immediate: true });

function close() {
	if (!props.busy) emit('close');
}

const lengthText = computed(() => {
	const s = (o.bars * 4 * 60) / props.bpm;
	return `${s < 10 ? s.toFixed(1) : Math.round(s)} s at ${props.bpm} BPM`;
});

const endingText = computed(() => o.ending === 'loop'
	? `Exactly ${o.bars} bar${o.bars === 1 ? '' : 's'}. The reverb and echoes ringing at the end are added onto the start, so it repeats seamlessly in a DAW.`
	: 'Starts clean, and the reverb and echoes ring out after the last bar: for a part\'s first entrance, or the end of a song.');

const stems = computed(() => ['dry', ...(['delay', 'reverb', 'noise'] as const).filter((p) => props.effectsOn[p])]);
// "a, b and c"
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const stemsText = computed(() => {
	const off = (['delay', 'reverb', 'noise'] as const).filter((p) => !props.effectsOn[p]);
	if (stems.value.length === 1) return `dry only: ${list([...off])} are off`;
	return `${list(stems.value)}: they add up to the mix${off.length ? `; ${list([...off])} ${off.length === 1 ? 'is' : 'are'} off` : ''}`;
});

const fileCount = computed(() =>
	(o.mix ? 1 : 0) + (o.stems ? stems.value.length : 0) + (o.midi ? 1 : 0) + (o.oneShot ? 1 : 0));

const statusText = computed(() => {
	if (props.busy) return `Rendering ${props.progress}…`;
	const n = fileCount.value;
	return n === 0 ? 'Choose at least one file' : n === 1 ? '1 file' : `${n} files, in one .zip`;
});
</script>

<style scoped>
.export-overlay {
	position: fixed;
	inset: 0;
	z-index: 1100;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgb(0 0 0 / 0.45);
}

/* The pad menu's look (.pt-popover), centered */
.export-dialog {
	width: min(470px, 100%);
	max-height: calc(100vh - 32px);
	overflow-y: auto;
	padding: 14px 16px;
	border: 1px solid transparent;
	border-radius: var(--pt-radius-sm);
	background:
		linear-gradient(145deg, var(--pt-panel), var(--pt-surface-2)) padding-box,
		linear-gradient(90deg, hsl(var(--pt-accent) 84% 64% / 0.95), hsl(calc(var(--pt-accent) + 10) 84% 64% / 0.95)) border-box;
	box-shadow: 0 12px 40px rgb(0 0 0 / 0.45), inset 0 0 0 1px rgb(255 255 255 / 0.03);
	color: var(--pt-text);
	outline: none;
}

.export-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 10px;
}

.export-title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	color: var(--pt-text-strong);
}

.export-close,
.export-actions .pt-btn {
	min-height: 30px;
	padding: 4px 12px;
	font-size: 0.8rem;
}

.export-row {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
	margin: 8px 0;
}

.export-label {
	width: 64px;
	color: var(--pt-muted);
	font-size: 0.85rem;
	padding: 0;
}

.export-hint {
	color: var(--pt-muted);
	font-size: 0.75rem;
}

.export-note {
	margin: 0 0 6px 74px;
	color: var(--pt-muted);
	font-size: 0.75rem;
	line-height: 1.35;
}

.export-files {
	margin: 10px 0 4px;
	padding: 0;
	border: 0;
	display: grid;
	gap: 8px;
}

.export-files legend {
	float: left;
	margin-bottom: 4px;
}

/* A checkbox, its name, and a hint on the line below the name */
.export-check {
	display: grid;
	grid-template-columns: 15px 1fr;
	align-items: center;
	gap: 2px 8px;
	font-size: 0.85rem;
	clear: both;
}

.export-check .export-hint {
	grid-column: 2;
}

.export-one-shot {
	display: inline-flex;
	align-items: center;
	gap: 8px;
}

.export-check input[type="checkbox"] {
	accent-color: hsl(var(--pt-accent) 80% 60%);
	width: 15px;
	height: 15px;
	margin: 0;
}

.export-select {
	width: auto;
	min-height: 28px;
	padding: 2px 8px;
	font-size: 0.8rem;
}

.export-select:disabled {
	opacity: 0.5;
}

.export-normalize {
	margin-top: 10px;
}

.export-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 14px;
}

.export-status {
	margin-right: auto;
}

.export-go {
	min-width: 96px;
}

@media (max-width: 480px) {
	.export-note {
		margin-left: 0;
	}
}
</style>

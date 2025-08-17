<template>
  <div class="sequencer-kbd outer-wrapper">
    <ul
      ref="kbdRef"
      class="keyboard"
      @pointerdown="onPointerDown"
      @pointerover="onPointerOver"
      @pointerup="onPointerUp"
      @pointerleave="onPointerLeave"
    >
      <li v-for="n in keyboardNotes" :key="n.note || n.id" class="keyboard-key">
        <!-- mouse-only lower keys -->
        <template v-if="!n.id">
          <div
            class="key mouse-only"
            :class="{ active: activeNotes.has(n.note) }"
            :data-note="n.note"
            role="button"
            tabindex="0"
            :aria-label="`Note ${n.note}`"
          >
            <span class="note">{{ n.note }}</span>
          </div>
          <div
            v-if="n.sharp"
            class="upper-key mouse-only"
            :class="{ active: activeNotes.has(n.sharp) }"
            :data-note="n.sharp"
            role="button"
            tabindex="0"
            :aria-label="`Note ${n.sharp}`"
          >
            <span><small>{{ n.sharp }}</small></span>
          </div>
        </template>

        <!-- qwerty + mouse keys -->
        <template v-else>
          <div
            class="key"
            :class="{ active: activeNotes.has(n.note) }"
            :id="n.id"
            :data-note="n.note"
            role="button"
            tabindex="0"
            :aria-label="`Key ${n.label}, note ${n.note}`"
          >
            <span class="kbd">{{ n.label }}</span>
            <span class="note">{{ n.note }}</span>
          </div>
          <div
            v-if="n.sharp"
            class="upper-key"
            :class="{ active: activeNotes.has(n.sharp) }"
            :id="n.sharpId"
            :data-note="n.sharp"
            role="button"
            tabindex="0"
            :aria-label="`Key ${n.sharpLabel}, note ${n.sharp}`"
          >
            <span>{{ n.sharpLabel }}<br /><small>{{ n.sharp }}</small></span>
          </div>
        </template>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';

type NoteOn = { note: string; freq: number; velocity: number };
type NoteOff = { note: string };
const emit = defineEmits<{ 'note-on': [NoteOn]; 'note-off': [NoteOff] }>();

const props = withDefaults(defineProps<{
  enableQwerty?: boolean;
  enableMidi?: boolean;
  qwertyVelocity?: number;
}>(), {
  enableQwerty: true,
  enableMidi: false,
  qwertyVelocity: 1
});

// --- notes/layout (same as yours) ---
const keyboardNotes = [
  { note: 'G3', sharp: 'G#3' },
  { note: 'A3', sharp: 'A#3' },
  { note: 'B3' },
  { id: 'KeyA', label: 'A', note: 'C4', sharp: 'C#4', sharpId: 'KeyW', sharpLabel: 'W' },
  { id: 'KeyS', label: 'S', note: 'D4', sharp: 'D#4', sharpId: 'KeyE', sharpLabel: 'E' },
  { id: 'KeyD', label: 'D', note: 'E4' },
  { id: 'KeyF', label: 'F', note: 'F4', sharp: 'F#4', sharpId: 'KeyT', sharpLabel: 'T' },
  { id: 'KeyG', label: 'G', note: 'G4', sharp: 'G#4', sharpId: 'KeyY', sharpLabel: 'Y' },
  { id: 'KeyH', label: 'H', note: 'A4', sharp: 'A#4', sharpId: 'KeyU', sharpLabel: 'U' },
  { id: 'KeyJ', label: 'J', note: 'B4' },
  { id: 'KeyK', label: 'K', note: 'C5', sharp: 'C#5', sharpId: 'KeyO', sharpLabel: 'O' },
  { id: 'KeyL', label: 'L', note: 'D5', sharp: 'D#5', sharpId: 'KeyP', sharpLabel: 'P' },
  { id: 'Semicolon', label: ';', note: 'E5' },
  { note: 'F5', sharp: 'F#5' },
  { note: 'G5' }
] as const;

// id -> note (for QWERTY)
const keyMap: Record<string, string> = Object.fromEntries(
  (keyboardNotes as any).flatMap((k: any) =>
    k.sharp ? [[k.id, k.note], [k.sharpId, k.sharp]] : [[k.id, k.note]]
  ).filter(Boolean)
);

// precompute frequencies (no regex at runtime)
const A4 = 440;
const IDX: Record<string, number> = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11 };
const freqCache = new Map<string, number>();
function nameToHzFast(name: string): number {
  const sharp = name[1] === '#';
  const letter = sharp ? (name[0] + '#') : name[0];
  const octave = +name[sharp ? 2 : 1];
  const midi = (octave + 1) * 12 + IDX[letter];
  return A4 * Math.pow(2, (midi - 69) / 12);
}
for (const row of keyboardNotes as any[]) {
  if (row.note)  freqCache.set(row.note,  nameToHzFast(row.note));
  if (row.sharp) freqCache.set(row.sharp, nameToHzFast(row.sharp));
}

// --- state ---
const kbdRef = ref<HTMLElement|null>(null);
const isDown = ref(false);
const activeNotes = reactive(new Set<string>()); // reactive so :class updates
const pressedKeys = new Set<string>();          // de-dupe repeats
let midiInputs: WebMidi.MIDIInput[] = [];

// --- core emitters ---
function trigger(note: string, velocity: number) {
  if (!note || activeNotes.has(note)) return;
  const f = freqCache.get(note); if (!f) return;
  activeNotes.add(note);
  emit('note-on', { note, freq: f, velocity });
}
function release(note: string) {
  if (!note || !activeNotes.has(note)) return;
  activeNotes.delete(note);
  emit('note-off', { note });
}

// --- event delegation on <ul> ---
function noteFromTarget(t: EventTarget|null): string|null {
  if (!(t instanceof HTMLElement)) return null;
  const el = t.closest<HTMLElement>('[data-note]');
  return el?.dataset.note ?? null;
}
function onPointerDown(e: PointerEvent) {
  isDown.value = true;
  const n = noteFromTarget(e.target);
  if (n) { e.preventDefault(); trigger(n, props.qwertyVelocity); }
}
function onPointerOver(e: PointerEvent) {
  if (!isDown.value) return;
  const n = noteFromTarget(e.target);
  if (n) { e.preventDefault(); trigger(n, props.qwertyVelocity); }
}
function onPointerUp(e: PointerEvent) {
  isDown.value = false;
  const n = noteFromTarget(e.target);
  if (n) { e.preventDefault(); release(n); }
}
function onPointerLeave() {
  // safety: release any still-active notes started by pointer
  for (const n of Array.from(activeNotes)) release(n);
}

// --- QWERTY ---
function onKeyDown(e: KeyboardEvent) {
  if (!props.enableQwerty) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const n = keyMap[e.code]; if (!n) return;
  if (pressedKeys.has(e.code)) return; // no repeats
  pressedKeys.add(e.code);
  e.preventDefault();
  trigger(n, props.qwertyVelocity);
}
function onKeyUp(e: KeyboardEvent) {
  if (!props.enableQwerty) return;
  const n = keyMap[e.code]; if (!n) return;
  pressedKeys.delete(e.code);
  e.preventDefault();
  release(n);
}

// --- MIDI (optional) ---
function midiToName(m: number): string | null {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const o = Math.floor(m/12)-1;
  const n = names[m%12] + o;
  return freqCache.has(n) ? n : null;
}
function onMidi(ev: WebMidi.MIDIMessageEvent) {
  const [status, d1, d2] = ev.data;
  const kind = status & 0xF0;
  const NOTE_ON = 0x90, NOTE_OFF = 0x80;
  const name = midiToName(d1); if (!name) return;
  if (kind === NOTE_ON && d2 > 0) trigger(name, Math.max(0.1, d2/127));
  else if (kind === NOTE_OFF || (kind === NOTE_ON && d2 === 0)) release(name);
}

// --- mount/cleanup ---
onMounted(async () => {
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });

  if (props.enableMidi && 'requestMIDIAccess' in navigator) {
    try {
      const access = await (navigator as any).requestMIDIAccess();
      midiInputs = Array.from(access.inputs.values());
      midiInputs.forEach(inp => inp.addEventListener('midimessage', onMidi as any));
    } catch { /* ignore */ }
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  midiInputs.forEach(inp => inp.removeEventListener('midimessage', onMidi as any));
  midiInputs = [];
  // safety: release everything
  for (const n of Array.from(activeNotes)) release(n);
});
</script>

<!-- <style scoped>
.sequencer-kbd { user-select: none; }
.keyboard { list-style: none; padding: 0; margin: 0; display: flex; gap: 4px; flex-wrap: wrap; touch-action: none; }
.keyboard-key { position: relative; }
.key, .upper-key {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 120px; border: 1px solid #333; border-radius: 6px;
  background: #fff; cursor: pointer; position: relative;
}
.upper-key {
  position: absolute; left: 24px; top: -12px; width: 30px; height: 80px;
  background: #111; color: #fff; border-color: #000; z-index: 2;
}
.key.active, .upper-key.active { outline: 2px solid #27fcff; }
.kbd { font-size: 12px; display:block; opacity: .6; }
.note { font-size: 12px; display:block; }
</style> -->

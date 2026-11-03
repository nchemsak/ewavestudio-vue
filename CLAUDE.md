# Ephemeral Wave Studio

Browser-based 16-step percussion synthesizer and step sequencer, live at
https://www.ephemeralwave.com/studio/. Everything runs client-side with the Web Audio API;
there is no backend. Features: a synth voice with per-step pitch, velocity and waveform;
sample drum lanes (kick, snare, hihat, plus user-loaded custom samples); amp envelope, pitch
envelope, filter, noise, FM, unison and LFO; delay, overdrive and reverb; Web MIDI note input;
a random melody and arpeggio maker; an oscilloscope, spectrogram, tuner and envelope display;
WAV export; and projects saved in IndexedDB with JSON import and export.

History: the app began as an Angular app (about 2015) and was rewritten in Vue 3 + Vite in 2025.
Some files and assets left over from earlier versions are unused (see "Dead code" below).

## Commands

Tested with Node 22.19 on Windows (Git Bash). Vite 7 needs Node 20.19+ or 22.12+.

```bash
npm install        # or `npm ci` for an exact install from package-lock.json
npm run dev        # dev server → open http://localhost:5173/studio/
npm run build      # production build into dist/
npm run preview    # serve dist/ locally → http://localhost:4173/studio/
```

There are no tests, linter or type-checker yet. `npm run build` does **not** type-check:
Vite strips the TypeScript types without checking them, and there is no `tsconfig.json`.
The build prints hundreds of Sass deprecation warnings that come from Bootstrap's SCSS.
They are expected, and the build still succeeds.

## Deploy (manual, FTP)

`vite.config.js` sets `base: '/studio/'`, so the built `index.html` loads its files from
`/studio/assets/...`, `/studio/audio/...` and so on. The site must therefore be served from
the `/studio/` folder of the web root. Deploy steps:

1. `git pull` and make sure the working tree is the version you want to ship.
2. `npm ci` (only needed when `package-lock.json` changed).
3. `npm run build`
4. Optional: `npm run preview`, open http://localhost:4173/studio/, and check that sound plays.
5. In FileZilla, open the remote `/studio/` folder (the one served as
   `https://www.ephemeralwave.com/studio/`).
6. Upload the **contents** of local `dist/` (not the `dist` folder itself) into remote
   `/studio/`, overwriting existing files. After uploading, the remote folder holds
   `index.html`, `assets/`, `audio/`, `images/` and `ephemeral-wave-128.png`.
7. Optional cleanup: remove old `assets/index-*.js`, `assets/index-*.css` and `assets/*.png` files
   on the server that the new `index.html` no longer references. File names are content-hashed,
   so old files do no harm but pile up.
8. Hard-refresh https://www.ephemeralwave.com/studio/ (Ctrl+F5) and press Play.

Notes:
- If the base path ever changes (for example to serve from the domain root), change `base` in
  `vite.config.js` and the hard-coded `/studio/` mentions here.
- `index.html` includes the Google Analytics (gtag) snippet, so `npm run dev` also sends
  analytics events.
- The "Return to Ephemeral Wave" link points to `/`, the main site, which is not part of this repo.

## Architecture

```
index.html               Entry HTML + Google Analytics tag
src/main.ts              createApp + Pinia, imports the global SCSS (Bootstrap + theme)
src/App.vue              Toolbar (ThemeToggle, #midi-toolbar-slot) + <DrumSequencer/>
src/components/
  DrumSequencer.vue      ~4800 lines; holds nearly all app state and the live audio engine
  modules/*.vue          Synth and effect panels: Envelope, Filter, PitchEnv, Noise, FM,
                         Unison, LFOGroup, Delay, Drive, Reverb (UI only; mostly v-model)
  SynthStepGrid.vue      16 synth step pads with velocity and pitch sliders
  MelodyMaker.vue        Scale, key and range; random melody and arpeggio generator
  PatternTools.vue       Synth-lane tools: step fills (all, every 2/4, invert, random, clear),
                         velocity shapes ("Humanize") and octave shift
  ProjectControls.vue    File menu: new, open, save, rename, delete, import/export JSON, WAV
  Screen.vue             "LCD" with F-key buttons; DrumSequencer draws its canvas views
  Knob.vue, KnobGroup.vue, WaveButton.vue, PtSelect.vue, InfoPopover.vue, SectionWrap.vue, ...
src/audio/
  pitchEnv.ts, fm.ts     Per-note helpers shared by the live and offline engines
  reverb/generateIr.ts   Algorithmic impulse response for the ConvolverNode
  export/scheduleStepSequencer.ts  Separate offline engine used for WAV export
  export/encodeWav.ts    AudioBuffer → 32-bit float WAV
src/stores/projectStore.ts  Pinia store: current projectId, name, data snapshot
src/lib/storage/         IndexedDB via `idb` (db.ts, projects.ts), JSON import/export
src/lib/schema/projectSchema.ts  zod schema + v1→v2 migration (CURRENT_VERSION = 2)
src/composables/useTheme.ts      synthwave | dark | light theme, stored in localStorage
src/assets/styles/       Bootstrap overrides + all global SCSS (themes are in _themes.scss)
public/audio/            kick.mp3, snare.mp3, hihat.mp3 (loaded at runtime)
public/images/           Background textures/GIFs referenced from SCSS via ../images/
```

### Audio engine (live), in `DrumSequencer.vue`
- One `AudioContext` is created when the component's script first runs. It is resumed on the
  first Play click.
- Graph: per-note synth voices → drive (dry + shaper → `driveSum`). From `driveSum` two paths
  run in parallel: delay (dry + wet, with a feedback loop and tone filters) and a reverb send
  (tone filter → convolver → wet gain). Both go to `masterGain` → destination. An
  `AnalyserNode` is tapped from `masterGain` for the scope, spectrogram and tuner. The noise layer and sample lanes go
  straight to `masterGain`, so they bypass drive, delay and reverb.
- Scheduler: `schedule()` runs every 25 ms, driven by a ticker in a small Web Worker
  (`src/audio/ticker.ts`), so playback keeps going in background tabs; it falls back to
  `setInterval` if a worker can't be created. Each run schedules the steps that start within
  the next 100 ms (`SCHEDULE_AHEAD_S`), using `audioCtx.currentTime`. If the clock falls more
  than a step behind (computer asleep, page busy), it skips ahead instead of playing every
  missed step at once. Swing delays every second step (steps 2, 4, 6, ... counting from 1).
- `playSynthNote()` builds a new set of nodes for every note (oscillator per unison voice,
  biquad filter, panner, FM modulator, noise buffer sources, envelope gain). Pitch envelope and
  FM come from `src/audio/pitchEnv.ts` and `src/audio/fm.ts`.
- The LFO is one shared oscillator → `lfoGain`. Each note connects a tap from it to the voice's
  `detune` or filter frequency, and `releaseLfoTap()` disconnects it when the note ends.
  Anything else per-note that connects to a long-lived node needs the same cleanup.
- WAV export uses a **separate** offline engine (`scheduleStepSequencer.ts`), fed by the
  `exportState` computed. It renders only the synth lane. Changes to the live sound (new
  parameters, changed gain staging) must be mirrored there, or exports will sound different.

### MIDI
- Web MIDI (`navigator.requestMIDIAccess`), opt-in through an "Enable MIDI" button. The device
  selector is teleported into `#midi-toolbar-slot` in `App.vue`.
- Only note-on messages are handled. Each one plays `playSynthNote()` with the global waveform
  and current synth settings, scaled by velocity and the synth channel volume. Note-off, CC,
  pitch bend and MIDI clock are ignored.

### Keyboard shortcuts
- Space: play/stop (`onGlobalKeydown` in `DrumSequencer.vue`, ignored while typing).
- 1–4: screen view (Oscilloscope, Spectrogram, Tuner, Envelope), same handler; ignored while
  typing or while a dropdown list is open.
- Ctrl/Cmd+S: save (`ProjectControls.vue`). Escape closes menus and popovers.

### Saving / projects
- `buildSnapshot()` turns all UI and synth state into a plain object; `applySnapshot()` restores
  it. Shape: `{ meta, ui, transport, synth, fx, instruments[], melody, selectedWaveform }`.
- A deep watcher copies the snapshot into `projectStore.data`. Edits are written to IndexedDB
  (`ewave-db` database, `projects` store) only on an explicit Save in `ProjectControls` (the
  Save menu item or Ctrl/Cmd+S); creating a project also writes an initial record. A status
  dot shows unsaved changes.
- `localStorage` keys: `ewave:lastProjectId` (reopened on load), `ewave:reset-ui-next`
  (one-shot flag that ProjectControls sets to reset the UI on New Project), `seqOpen`, `ui-theme`.
- Custom sample audio is **not** saved: only the lane's metadata and steps are stored.
- Melody Maker settings (key, scale, range, and arp pattern, rate, octaves and tones) live in
  `melodyUi`. `MelodyMaker.vue` reports each change with an event, and follows `melodyUi`
  through its `initial-*` props when a project loads. Its Advanced-menu toggles are not saved.
- The JSON import/export format is `{ version, projectId, meta, data }`, validated by
  `validateAndMigrate()`.
- If you add a parameter: add it to `buildSnapshot`, `applySnapshot`,
  `resetUiToFactoryDefaults`, and (if it affects sound) `exportState` and
  `scheduleStepSequencer.ts`. Treat a missing field in an older snapshot as "use the default",
  so existing saved projects still load.

## Conventions
- Vue 3 `<script setup>` SFCs, a mix of `lang="ts"` and plain JS. Composition API with
  `ref`/`reactive`/`computed`. Pinia is only used for the project store.
- Indentation is mostly tabs in `DrumSequencer.vue` and 4 spaces elsewhere. Match the
  surrounding file.
- Large files are split into sections with `// X START` / `// X END` banner comments. Keep them.
- Styling: Bootstrap 5 (full SCSS import) + custom SCSS in `src/assets/styles/`. There are
  three themes, selected by a `theme-*` class on `<html>`. Keep the current look and feel
  unless a change is requested.
- Reference runtime assets in `public/` relative to the page (for example `audio/kick.mp3`)
  or through `import.meta.env.BASE_URL`. Never start the path with `/`, or it breaks under
  the `/studio/` base.
- Analytics: `trackEvent(name, params)` calls `window.gtag`. Copies of this helper exist in
  DrumSequencer and ProjectControls; `src/lib/analytics.ts` is unused.

## Dead code (not imported anywhere)
`ComputerKeyboard.vue`, `SequencerKeyboard.vue`, `PadPitchControl.vue`, `PresetBankPanel.vue`,
`src/lib/generators/seed.ts` (imports `seedrandom`, which is not a dependency),
`src/lib/analytics.ts`, `src/style.css`, `src/assets/vue.svg`, `src/assets/eWaveLogo.svg`,
`public/vite.svg`, and most of `public/images/` (only `black-thread.png`, `circleWave.gif`
and `retroSpeaker.gif` are referenced). Confirm before deleting.

## Working on this repo
- Sound can't be verified automatically (Claude can't hear audio), so every PR description must
  include a short **manual test checklist** of what to listen for and what to click
  (for example: "press Play: kick, snare and hihat on steps 1/5/9/13; turn Reverb mix up:
  the tail gets longer, with no clicks").
- Don't break existing saved projects: snapshot changes must stay backward compatible.
- Before pushing, run `npm run build` and confirm it succeeds.

## Testing a PR locally
Pushing a branch or opening a PR changes nothing on the live site, and `main` only changes
when the PR is merged. To try a PR before merging (Git Bash, in the project folder):

```bash
git fetch origin
git checkout <branch-name>   # the branch named on the PR page
git pull                     # make sure you have its latest commits
npm install                  # in case dependencies changed
npm run dev                  # then open http://localhost:5173/studio/
```

To test the exact build that would be uploaded: `npm run build`, then `npm run preview`, and open
http://localhost:4173/studio/. Afterwards, `git checkout main`. (Use `git checkout`, not
`git switch`: the maintainer's Git predates `switch`.) Saved projects are stored per
address, so the live site, `localhost:5173` and `localhost:4173` each have their own; to test
with a real project, use File → Export file on the live site and File → Import file locally.

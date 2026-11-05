# Ephemeral Wave Studio

Browser-based 16-step percussion synthesizer and step sequencer. This repo is **version 2**,
served from https://www.ephemeralwave.com/studio2/. The original version stays at
https://www.ephemeralwave.com/studio/ and is never updated or overwritten, so the two can
be compared; never deploy this code to `/studio/`. Everything runs client-side with the Web
Audio API; there is no backend. Features: one 16-step synth lane with per-step pitch,
velocity and waveform; amp envelope, pitch envelope (a drum-style sweep), filter, noise, FM,
unison and LFO; delay, overdrive and reverb; Web MIDI note
input; a random melody and arpeggio maker; an oscilloscope, spectrogram, tuner and envelope
display; WAV export; projects saved in IndexedDB with JSON import and export; and undo/redo.
Earlier versions also had sample drum lanes (kick, snare, hihat and user-loaded samples).
Their UI is commented out and they are no longer part of the app, but some of their code
remains (see "Dead code").

Design intent: a percussion synthesizer in the spirit of the Moog DFAM and Behringer Edge
(sounds shaped by short envelopes on pitch, filter and level, played by a step sequencer), but
not a copy of either. The maintainer wants it to stand on its own without drifting far from
that idea; weigh new features against it.

History: the app began as an Angular app (about 2015) and was rewritten in Vue 3 + Vite in 2025.
Some files and assets left over from earlier versions are unused (see "Dead code" below).

## Commands

Tested with Node 22.19 on Windows (Git Bash). Vite 7 needs Node 20.19+ or 22.12+.

```bash
npm install        # or `npm ci` for an exact install from package-lock.json
npm run dev        # dev server → open http://localhost:5173/studio2/
npm run build      # production build into dist/
npm run preview    # serve dist/ locally → http://localhost:4173/studio2/
npm run typecheck  # vue-tsc type check (the build itself doesn't type-check)
npm test           # unit tests (Vitest): src/**/*.test.ts
npm run test:e2e   # build, then browser tests (Playwright): e2e/
```

Checks (GitHub runs the same ones on every PR and before every deploy, see
`.github/workflows/checks.yml`):
- **Type check:** `tsconfig.json` is deliberately lenient (`strict` and `noImplicitAny` off),
  because the code was written without a type checker. It must stay at zero errors.
- **Unit tests** (Vitest, in Node): pure logic such as loading and upgrading saved projects,
  WAV encoding, storage names, the playback clock, synth helpers, MIDI input (with a fake
  MIDI system), the undo history and project snapshots (save → load round trip, older
  projects, factory defaults). `vitest.config.js` reuses `vite.config.js` and sets `BASE_URL`
  to the real base, so code sees `/studio2/` as in the app.
- **Browser tests** (Playwright, Chromium), `e2e/app.spec.ts`: build, serve with
  `vite preview`, then drive the app. An init script keeps a handle on the app's AudioContext
  (`__ctx`), records every scheduled note and the per-note LFO taps, measures the output
  level (`__peakOver(ms)`, and `__swingOver(ms)`, which ignores a steady offset), tracks keydown
  listeners on `window` (`__keydown`), and can pause
  `requestAnimationFrame` the way hidden tabs do. The MIDI test installs a fake MIDI keyboard.
  Google Analytics is stubbed out. Before the first local run: `npx playwright install chromium`.
- **No linter yet.** Current ESLint and typescript-eslint releases depend on `minimatch` 10,
  which has a moderate advisory (GHSA-g3hv-75wg-m249) that only `minimatch` 11 fixes. Adding
  them now would make `npm install` report 14 vulnerabilities. Add ESLint once they move to
  `minimatch` 11.

npm 10 (bundled with Node 22) crashes with "Cannot read properties of null (reading
'edgesOut')" when *adding* Vitest 4.1, because of Vitest's optional peer dependencies.
Installing from the lockfile (`npm ci`, or `npm install` with nothing new) works. To add or
upgrade Vitest, run that one install with npm 11 (`npx npm@11 install -D vitest@...`), then
confirm `npm ci` still works with npm 10.

Sass deprecation warnings from Bootstrap's own SCSS are silenced in `vite.config.js`
(`quietDeps`, plus `import` for our `@import` of Bootstrap, which Bootstrap 5.3 needs). Warnings
from our other SCSS still show, so a clean build prints none. In our SCSS, use the `sass:`
modules (`@use "sass:color"` and `color.mix()`, `map.get()`), not the global functions
(`mix()`, `map-get()`), which Dart Sass deprecates.

## Deploy (automatic, to /studio2/)

`vite.config.js` sets `base: '/studio2/'`, so the built `index.html` loads its files from
`/studio2/assets/...`, `/studio2/audio/...` and so on. On the server that folder is
`/public_html/studio2/` (the WordPress site lives in `/public_html/`; version 1 in
`/public_html/studio/`).

Every push to `main` (for example merging a PR) runs `.github/workflows/deploy-studio2.yml`.
It first runs the Checks workflow (type check, unit and browser tests) and stops if any fail.
Then it runs `npm ci` and `npm run build`, checks the build is for `/studio2/`, and makes
`/public_html/studio2/` an exact copy of `dist/` with `lftp`:
- It uploads every file on every deploy (`--transfer-all`), overwriting in place
  (`mirror:overwrite`). It never trusts sizes or timestamps, because `index.html` changes
  without changing size.
- It uploads new assets before `index.html`, then deletes anything that's no longer part of
  the build, except names starting with a dot (`.ftpquota`, `.htaccess`, `.well-known/`).

Secrets:
- `FTP_HOST` is the name on the server's TLS certificate: currently `dfw-s05.nixihost.com`,
  not `ftp.ephemeralwave.com`. If the host moves the account to another server, the deploy
  stops with "certificate common name doesn't match". Get the new name with
  `openssl s_client -starttls ftp -connect ftp.ephemeralwave.com:21 </dev/null 2>/dev/null | openssl x509 -noout -subject`
  and update the secret.
- `FTP_USER` (`deploy@ephemeralwave.com`) is a dedicated FTP account whose directory is
  `public_html/studio2` (cPanel → FTP Accounts), so the paths in the workflow are relative to
  that folder and the job can't reach anything else.
- `FTP_PASSWORD` is that account's password.

The job refuses a login that can see `public_html` or WordPress files (such as the main
hosting login), a server without TLS (FTP over TLS), and a certificate that doesn't match
`FTP_HOST`. The Actions tab shows each run; its "Re-run jobs" and "Run workflow" buttons
re-deploy by hand. After a deploy, hard-refresh https://www.ephemeralwave.com/studio2/
(Ctrl+F5).

Manual fallback with FileZilla: `npm run build`, then upload the **contents** of `dist/` (not
the folder itself) into `/public_html/studio2/`. Never upload to `/public_html/studio/`.

Notes:
- `base` also decides where saved projects are stored (see "Saving / projects"), so changing
  it gives the app a fresh, empty set of saved projects.
- The Google Analytics (gtag) tag is added to `index.html` by the build only
  (`build-plugins/googleAnalytics.js`, a Vite plugin with `apply: 'build'`), so `npm run dev`
  sends no analytics events. The deployed site, `npm run preview` and the browser tests (which
  stub it out) have it.
- The "Return to Ephemeral Wave" link points to `/`, the main site, which is not part of this repo.

## Architecture

```
index.html               Entry HTML (the build adds the Google Analytics tag)
build-plugins/googleAnalytics.js  Vite plugin: the gtag snippet, in builds only
src/main.ts              createApp + Pinia, imports the global SCSS (Bootstrap + theme)
src/App.vue              Toolbar (ThemeToggle, #midi-toolbar-slot) + <DrumSequencer/>
src/components/
  DrumSequencer.vue      ~3400 lines; holds nearly all app state (as refs) and the screen
                         views; groups the saved settings as `projectState` for saving and
                         the live engine, and decides what a MIDI note plays
  modules/*.vue          Synth and effect panels: Envelope, Filter, PitchEnv, Noise, FM,
                         Unison, LFOGroup, Delay, Drive, Reverb (UI only; mostly v-model)
  SynthStepGrid.vue      16 synth step pads with velocity and pitch sliders
  MelodyMaker.vue        Scale, key and range; random melody and arpeggio generator
  PatternTools.vue       Synth-lane tools: step fills (all, every 2/4, invert, random, clear),
                         velocity shapes ("Humanize") and octave shift
  ProjectControls.vue    File menu: new, open, save, rename, delete, import/export JSON, WAV;
                         Undo/Redo buttons
  MidiToolbar.vue        "MIDI Controller": Enable MIDI button, then the input list
  Screen.vue             "LCD" with F-key buttons; DrumSequencer draws its canvas views
  Knob.vue, KnobGroup.vue, WaveButton.vue, PtSelect.vue, InfoPopover.vue, SectionWrap.vue, ...
src/audio/
  liveEngine.ts          The live sound engine (`useLiveEngine`), see "Audio engine (live)"
  synthHelpers.ts        Pure helpers: noise colors and buffers, drive curves, waveform
                         loudness, LFO division → Hz
  ticker.ts              Worker-driven timer for the sequencer clock
  pitchEnv.ts, fm.ts     Per-note helpers shared by the live and offline engines
  reverb/generateIr.ts   Algorithmic impulse response for the ConvolverNode
  export/scheduleStepSequencer.ts  Separate offline engine used for WAV export
  export/encodeWav.ts    AudioBuffer → 32-bit float WAV
src/stores/projectStore.ts  Pinia store: current projectId, name, data snapshot
src/lib/project/snapshot.ts  Settings ↔ project snapshot, and factory defaults (see "Saving")
src/lib/project/history.ts   Undo/redo history of snapshots (pure; see "Undo / redo")
src/lib/delaySync.ts     Tempo-synced delay: divisions, synced time, followDelaySync (see
                         "Delay time")
src/lib/storage/         IndexedDB via `idb` (db.ts, projects.ts), JSON import/export,
                         namespace.ts (storage names, one set per site folder)
src/lib/schema/projectSchema.ts  Project file check (hand-written, no library) + v1→v2
                         migration (CURRENT_VERSION = 2)
src/composables/useTheme.ts      synthwave | dark | light theme, stored in localStorage
src/composables/useMidiInput.ts  Web MIDI note input (see "MIDI")
src/composables/useProjectSync.ts  Keeps the settings and the project store in step (see "Saving")
src/composables/useUndoHistory.ts  When to record an undo step, and applying undo/redo
src/assets/styles/       _bootstrap-custom.scss (the Bootstrap parts in use, then main.scss),
                         and all global SCSS (themes are in _themes.scss). _sequencer.scss and
                         _keyboard.scss are not built (main.scss doesn't load them)
public/audio/            kick.mp3, snare.mp3, hihat.mp3: still fetched at startup, but only
                         used by the hidden drum lanes
public/images/           Background textures/GIFs referenced from SCSS via ../images/
.github/workflows/deploy-studio2.yml  Builds `main` and uploads it to /studio2/ (see Deploy)
.github/workflows/checks.yml  Type check, unit tests and browser tests (every PR, every deploy)
src/**/*.test.ts         Unit tests (Vitest; vitest.config.js)
e2e/app.spec.ts          Browser tests (Playwright; playwright.config.ts)
```

### Audio engine (live), in `src/audio/liveEngine.ts`
- `DrumSequencer.vue` calls `useLiveEngine(settings)` once during setup. `settings` holds the
  component's own refs: the transport, synth and effect groups of `projectState` (see
  "Saving / projects"), plus the pattern lanes. The engine only reads them, and follows
  changes with watchers. It returns `audioCtx`, `analyser`, `isPlaying`,
  `currentStep`, `playSynthNote`, `startLfoIfNeeded`, `togglePlay`, `hardStopSequencer` and
  `loadSample`. A new sound setting is passed in here (see "If you add a parameter").
- One `AudioContext` is created when `useLiveEngine` runs. It is resumed on the first Play
  click.
- Graph: per-note synth voices → drive (dry + shaper → `driveSum`). From `driveSum` two paths
  run in parallel: delay (dry + wet, with a feedback loop and tone filters) and a reverb send
  (tone filter → convolver → wet gain). Both go to `masterGain` → destination. An
  `AnalyserNode` is tapped from `masterGain` for the scope, spectrogram and tuner. The noise
  layer (and the hidden sample lanes) go straight to `masterGain`, so they bypass drive, delay
  and reverb.
- Scheduler: `schedule()` runs every 25 ms, driven by a ticker in a small Web Worker
  (`src/audio/ticker.ts`), so playback keeps going in background tabs; it falls back to
  `setInterval` if a worker can't be created. Each run schedules the steps that start within
  the next 100 ms (`SCHEDULE_AHEAD_S`), using `audioCtx.currentTime`. If the clock falls more
  than a step behind (computer asleep, page busy), it skips ahead instead of playing every
  missed step at once. Swing delays every second step (steps 2, 4, 6, ... counting from 1).
- `playSynthNote()` builds a new set of nodes for every note (oscillator per unison voice,
  biquad filter, panner, FM modulator, noise buffer sources, envelope gain). Pitch envelope and
  FM come from `src/audio/pitchEnv.ts` and `src/audio/fm.ts`.
- Pitch envelope (`pitchEnv.ts`; panel `PitchEnvModule.vue`, the "Pitch" card next to Envelope
  and Filter): each note starts Amount semitones up, down or at a random offset, as an offset in cents on the
  oscillator's `detune` that decays exponentially (`setTargetAtTime`, time constant Decay / 4,
  so after Decay it's about 2% of where it started) to the voice's unison detune. That's the
  curve of an analog decay envelope into an exponential oscillator: fast, then settling. The
  frequency itself stays at the note's pitch. The offset is picked once per note
  (`pitchEnvStartCents`), so unison voices sweep together. Amount 0 (the default) is off.
  In the panel, Amount is one bipolar knob (−48…+48): right of centre is mode `up` (starts
  above, drops), left is `down`; the RND pill is `random`. Saved as before: `semitones` (0–48)
  and `mode`.
- Envelope: the on/off switch is hidden in the interface (`EnvelopeModule` with
  `:showToggle="false"`), but saved or imported projects can have the envelope off. A note
  then holds the level the envelope would peak at (waveform balance and noise mix included),
  in both the live and the export engine.
- The LFO is one shared oscillator → `lfoGain`. Each note connects a tap from it to the voice's
  `detune` or filter frequency, and `releaseLfoTap()` disconnects it when the note ends.
  Anything else per-note that connects to a long-lived node needs the same cleanup.
- WAV export uses a **separate** offline engine (`scheduleStepSequencer.ts`), fed by the
  `exportState` computed. It renders only the synth lane. Changes to the live sound (new
  parameters, changed gain staging) must be mirrored there, or exports will sound different.

### MIDI
- `src/composables/useMidiInput.ts` handles Web MIDI (`navigator.requestMIDIAccess`): access,
  the input list, the chosen input, note-on parsing (`parseNoteOn`) and waking the audio
  engine. It doesn't know about the synth: `DrumSequencer.vue` calls
  `useMidiInput({ audioCtx, noteToPlay })`, and `noteToPlay(note, velocity)` returns what to
  play, or `null` to ignore the note (a muted synth lane), before audio is woken.
- Opt-in through an "Enable MIDI" button. `MidiToolbar.vue` (button, then the input list) is
  teleported into `#midi-toolbar-slot` in `App.vue`, or shown in the transport row if there
  is no slot. At 768 px wide or less, `App.vue` hides its toolbar, MIDI controls included.
- Only note-on messages are handled. Each one plays `playSynthNote()` with the global waveform
  and current synth settings, scaled by velocity and the synth channel volume. Note-off, CC,
  pitch bend and MIDI clock are ignored.
- The AudioContext starts suspended. Clicking "Enable MIDI" resumes it, and a note that arrives
  while it's suspended resumes it and then plays (or is dropped if resuming takes more than
  250 ms, so it's never played late). MIDI notes also start the LFO, as Play does.

### Keyboard shortcuts
- Space: play/stop (`onGlobalKeydown` in `DrumSequencer.vue`, ignored while typing). It does
  this everywhere, even on a focused button, knob or pad, on purpose: that's how music apps
  work. Enter presses a focused button.
- 1–4: screen view (Oscilloscope, Spectrogram, Tuner, Envelope), same handler; ignored while
  typing or while a dropdown list is open.
- Ctrl/Cmd+S: save (`ProjectControls.vue`). Escape closes menus and popovers.
- Ctrl/Cmd+Z: undo; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y: redo (same handler as Space). Ignored in
  a text box, which keeps its own undo (the project name).
- Knobs (`Knob.vue`, `role="slider"`): Tab to one, then arrows (Up/Right turn it up) move one
  step, or about 1% of the range on a knob with more than 300 steps; Shift+arrow and Page
  Up/Down about 10%; Home/End minimum/maximum. The first key emits `knobStart`, as a drag
  does (value tooltip, envelope view), and leaving the knob emits `knobEnd`.
- Step pads (`SynthStepGrid.vue`): one Tab stop for the grid (only the last used pad has
  `tabindex="0"`). Left/Right move between pads, Home/End to the first/last, Enter turns
  the focused pad on or off. Each pad is a toggle button named "Step 3", plus its note when on.
- Focus rings show for keyboard focus only (`:focus-visible`), in the theme's accent color.

### Undo / redo
- `src/composables/useUndoHistory.ts` (called once from `DrumSequencer.vue`) keeps a history of
  snapshots (`src/lib/project/history.ts`, up to 100 steps, in memory only, not saved). Each
  entry is the whole snapshot except `ui`, so the theme and which panels are open are never
  undone. A new saved parameter is covered automatically.
- It watches `projectStore.data` (replaced by `useProjectSync.ts` after each change, once the
  settings have been still for 100 ms) and records a step once the settings have stayed the
  same for 400 ms (`SETTLE_MS`) and no pointer is held
  down, so a knob drag or a burst of arrow keys is one step. Undo first records anything still
  pending (it compares the settings themselves, so a change too recent to be in the store
  counts), so it always goes back past the latest change. The page's (or a newly opened
  project's) first 400 ms are its starting point.
- Opening, importing or creating a project (a new `projectId`) starts a fresh history; File →
  New and Open can't be undone.
- While an undo/redo is applied (two ticks), changes that follow by themselves (a panel
  reacting to its props, or the synced delay time following the tempo) are folded into that
  entry, so they don't count as a new change that throws away the redo side. A browser test
  covers this.
- Undo changes the project like any edit, so the unsaved dot shows; it doesn't stop playback.

### Delay time
- The Delay panel's TIME knob picks a note division (`fx.delay.division`, default dotted 1/8,
  `'1/8.'`); the time is saved as `fx.delay.time` in seconds. With sync on (`fx.delay.sync`;
  its switch is in the commented-out Advanced menu, so only a project can turn it off), the time is the division at the
  tempo: 0.5625 s at 80 BPM. `src/lib/delaySync.ts` works it out (`syncedDelaySeconds`), and
  `followDelaySync()` in `DrumSequencer.vue` keeps the time in step whenever the tempo,
  division or sync changes (synchronously, so every snapshot already has the matching time).
- `applySnapshot()` recomputes the time from the division when sync is on, so a time set from
  outside (a project, a preset, a share link) can't disagree with the knob. A project saved
  before the division was saved gets the division whose time matches its saved time (within
  1%), else the default. With sync off the saved time is kept.
- `DelayEffect.vue` only shows the division and time; turning its knob emits both. It never
  sets the time or tone by itself, so loading a project doesn't change them.

### Saving / projects
- The settings stay refs in `DrumSequencer.vue`. It groups every saved one into `projectState`
  (type `ProjectState`), shaped like a snapshot:
  `{ meta, ui, transport, synth, fx, instruments[], melody, selectedWaveform }`.
- `src/lib/project/snapshot.ts`: `buildSnapshot(state)` turns the settings into a plain object,
  `applySnapshot(state, s)` restores them (a missing or wrongly typed field keeps its current
  value), and `resetToFactoryDefaults(state)` is File → New. They only touch refs, so
  `snapshot.test.ts` tests them in Node. `resetUiToFactoryDefaults()` in `DrumSequencer.vue`
  wraps the last one with what isn't saved (stop playback, pad sliders, menus, Melody Maker).
- `src/composables/useProjectSync.ts` connects them to the project store (below).
- Storage names come from `src/lib/storage/namespace.ts` and include the site folder, because
  browsers share storage across a whole website: `/studio2/` uses the IndexedDB database
  `ewave-studio2-db` and `localStorage` keys `ewave-studio2:*`. Version 1 on `/studio/` uses
  `ewave-db`, `ewave:*`, `seqOpen` and `ui-theme`, so the two never see each other's projects
  or settings. Always go through `STORAGE_NS` / `storageKey()`; never hard-code a name.
- `useProjectSync.ts` copies the settings into `projectStore.data` (a new snapshot object each
  time), but not on every change: a deep watch on `projectState` (it only reads the refs)
  notices a change, and the snapshot is built and compared as JSON once the settings have been
  still for 100 ms (`SYNC_MS`). A burst of 30 knob steps used to turn the snapshot into JSON
  about 150 times; now it's about 3 (a browser test counts). `projectStore.flushPending()`
  copies a pending change at once: `store.save()` calls it, and `ProjectControls` before
  Export file and the unsaved-changes check, so a change made just before them is included.
  Read `projectStore.data` for anything the user asked for only after `flushPending()`.
  `buildSnapshot()` must read only `projectState`, or its changes would go unnoticed. A
  project put into the store (opened, imported, new) is applied back to the settings; the
  store's own copies of the settings are not. What
  `applySnapshot()` corrects while loading (for example an older project's delay time) is
  stored straight back, before `ProjectControls` notes the project as saved, so the export
  and undo history match the settings and the dot stays "saved". Edits are written to IndexedDB
  (`projects` store) only on an explicit Save in `ProjectControls` (the Save menu item or
  Ctrl/Cmd+S); creating a project also writes an initial record. A status dot shows unsaved
  changes.
- A saved project that fails the project check (damaged, or unreadable by this version) is
  never opened: `loadProject()` throws a `BrokenProjectError` (with the project's name). At
  startup, `useProjectSync.ts` then starts a new project and says so in an alert; from
  File → Open, `ProjectControls` says so and keeps the current project. The broken record is
  left in IndexedDB untouched (it still shows in the Open list).
- While the dot shows unsaved changes, `ProjectControls` asks before the page is closed or
  reloaded (`beforeunload`). A project made with File → New counts as unsaved until it's saved.
- `localStorage` keys (all prefixed): `lastProjectId` (reopened on load), `reset-ui-next`
  (one-shot flag that ProjectControls sets to reset the UI on New Project), `seqOpen`, `ui-theme`.
- `instruments[]` still contains the hidden kick, snare and hihat lanes (normally with no
  steps on). Keep them so saved projects stay compatible.
- Melody Maker settings (key, scale, range, and arp pattern, rate, octaves and tones) live in
  `melodyUi`. `MelodyMaker.vue` reports each change with an event, and follows `melodyUi`
  through its `initial-*` props when a project loads. Its Advanced-menu toggles are not saved.
- The JSON import/export format is `{ version, projectId, meta, data }`, validated by
  `validateAndMigrate()`, which also checks every project loaded from IndexedDB. It only
  checks the types of `data.meta.name`, `data.selectedWaveform` and each lane's fields
  (`LANE_FIELDS`); other sections are free-form, and unknown fields are kept, so a new
  parameter needs no change there. A file that fails the check is refused as a whole
  ("Import failed"), and the console says which field was wrong.
- If you add a parameter: add its ref to `projectState` in `DrumSequencer.vue` (and the
  `ProjectState` type), to `buildSnapshot`, `applySnapshot` and `resetToFactoryDefaults` in
  `snapshot.ts` (the default must match the ref's starting value; a browser test compares
  File → New with a fresh page), and to `changeEverything()` in `snapshot.test.ts` (the
  round-trip test names any setting it doesn't cover). If it affects sound, also to
  `liveEngine.ts`, `exportState` and `scheduleStepSequencer.ts`. Treat a missing field in an
  older snapshot as "use the default", so existing saved projects still load.

## Conventions
- Vue 3 `<script setup>` SFCs, a mix of `lang="ts"` and plain JS. Composition API with
  `ref`/`reactive`/`computed`. Pinia is only used for the project store.
- Indentation is mostly tabs in `DrumSequencer.vue` and 4 spaces elsewhere. Match the
  surrounding file.
- Large files are split into sections with `// X START` / `// X END` banner comments. Keep them.
- Styling: Bootstrap 5 + custom SCSS in `src/assets/styles/`. There are three themes, selected
  by a `theme-*` class on `<html>`. Keep the current look and feel unless a change is
  requested.
- Only the Bootstrap parts the app uses are built (`_bootstrap-custom.scss`): root variables and
  reboot, the grid's `.container`, `.row` and `.col-12`, `.visually-hidden`, and the utilities
  `.d-flex`, `.position-relative`, `.align-items-center`, `.gap-2` and `.text-center`. Any other
  Bootstrap class (`mb-3`, `btn`, `form-control`, ...) does nothing until you add its part
  there: a utility to the `$utilities` map, anything else as an `@import` of its file, in
  Bootstrap's order (see `node_modules/bootstrap/scss/bootstrap.scss`).
- Reference runtime assets in `public/` relative to the page (for example `audio/kick.mp3`)
  or through `import.meta.env.BASE_URL`. Never start the path with `/`, or it breaks under
  the `/studio2/` base.
- Knobs: `taper="log"` makes a knob logarithmic (each part of the turn multiplies the value
  by the same amount; min must be above 0), for times and frequencies with a wide range. The
  pitch envelope's Decay uses it (5–2000 ms, 100 ms at half a turn); Cutoff could too.
  `bipolar` (min = −max) draws the arc from a zero tick at the top, for amounts that go both
  ways (the pitch envelope's Amount).
- Layout: the module cards flow in CSS columns from 992 px (`.ds-modules`), so a module that
  grows taller reshuffles the columns and can leave a gap. Envelope, Filter and Pitch share one
  row of three narrow cards (`.split-three`): at 1280 px and on phones each has about 90 px
  inside, room for two small knobs (40 px) and a five-letter title. A browser test checks that
  they stay on one row with one-line titles. The look is meant to be one piece of hardware
  that fills its frame: check a layout change at several widths (1600, 1280, 1100, 900, 390)
  against the build before it.
- Knobs: give every `<Knob>` a `label` (or an `aria-label`), and a `value-text` (what a
  screen reader says, such as "120 ms") when its number isn't the real value, for example a
  0..1 position. The text is usually the knob's tooltip.
- Analytics: `trackEvent(name, params)` calls `window.gtag` (missing under `npm run dev`, so
  it does nothing there). Separate copies of this helper
  live in DrumSequencer and ProjectControls.

## Dead code
The old drum and custom-sample lanes are hidden but their code remains: the commented-out
"Bottom Sequencer" block in `DrumSequencer.vue`'s template, and script code that only served
it, such as `orderedChannels`, `addCustomChannel`, `deleteChannel`, `loadUserSample`, and
`loadAllSamples` (which still downloads `public/audio/*.mp3` on every visit). The maintainer
may bring the drums back, so keep this code unless asked to remove it.

Old components, scripts and images that nothing used were deleted in the cleanup batch; if one
is ever needed again (for example `ComputerKeyboard.vue`'s computer-keyboard note map), get it
back from git history.

## Working on this repo
- **Every change goes live only at `/studio2/`, through the deploy workflow.** `/studio/` is the
  frozen original: never upload to it, never point `base`, the workflow or any FTP account at
  it, and never suggest overwriting it.
- Sound can't be verified automatically (Claude can't hear audio), so every PR description must
  include a short **manual test checklist** of what to listen for and what to click
  (for example: "turn on synth pads 1, 5, 9 and 13 and press Play; turn Reverb mix up:
  the tail gets longer, with no clicks").
- Don't break existing saved projects: snapshot changes must stay backward compatible.
- Before pushing, run `npm run typecheck`, `npm test` and `npm run test:e2e`, and confirm
  they pass.
- When fixing a bug, add a test that fails without the fix where practical. The browser tests
  can count scheduled notes and audio connections; see the helpers in `e2e/app.spec.ts`.

## Planned work

The maintainer's to-do list, agreed in earlier sessions. Rules:
- Do one item at a time, as one PR.
- Start the next item only when the maintainer says so. They usually start a new chat for
  each item, and "do the next item" means the first one under "Next, in this order".
- The PR that finishes an item also updates this list: move the item to "Done".

Next, in this order (agreed after PR 15; the maintainer changes it as ideas come up): fixes
that later features depend on, then sound features in the spirit of the design intent (top of
this file), then presets that can use them. Everything drum-related waits until the maintainer
brings the drum lanes back.
1. **Filter envelope, and a filter view on the screen.** Each note's lowpass cutoff is fixed
   for the whole note; only the LFO moves it. Add a DFAM-style filter envelope (Decay and
   Amount: the cutoff starts higher by the amount and decays back), in the live and export
   engines. Add a screen view that draws the filter's real response curve
   (`BiquadFilterNode.getFrequencyResponse()`) on a log-frequency axis, with the live spectrum
   faintly behind it, and shows the envelope's sweep. Like the envelope view, it appears while
   Cutoff, Resonance or the new knobs are turned (`knobStart`/`knobEnd`). Ask the maintainer
   whether it also gets its own F-key (the screen has four, keys 1–4). Layout: the Filter card
   sits in a row of three narrow cards (see "Layout" under Conventions) with room for two
   knobs, so two more need a layout the maintainer agrees to (propose with screenshots).
2. **Pulse wave with pulse-width modulation, and a few custom waveforms.** Pulse width is how
   much of each cycle the wave spends up versus down; 50% is the current square. Web Audio has
   no pulse oscillator with an adjustable width: feed a sawtooth into a comparator
   (`WaveShaperNode`, with `oversample` to reduce aliasing) whose threshold is moved by a
   `ConstantSourceNode`, or use an AudioWorklet if that sounds too harsh. Add a Width knob, and
   "Pulse width" as a third LFO target next to Pitch and Filter. Add 2–3 custom harmonic shapes
   (`createPeriodicWave`: for example organ-like, hollow, bell-like). The engines set
   `osc.type` from the wave name (type `Wave` in `snapshot.ts`), and `synthHelpers.ts`
   balances each wave's loudness, so both need the new waves. The project check accepts any
   wave name (it only checks that it's a string), so saved projects need no migration. The
   global and per-pad wave buttons need room for the new choices, especially on phones.
3. **Velocity routing.** Each pad's velocity slider only sets its loudness. Let it also drive
   other settings, as DFAM does by patching its velocity sequence: for example velocity to
   filter cutoff or filter envelope amount, to decay, to pitch envelope amount and to FM index,
   each with an amount knob. That gives per-step variety from a slider that's already there,
   and is a first step toward parameter locks (item 12).
4. **Built-in preset library of synth patches.** Planned shape (confirm the open questions
   before starting): a preset sets only the sound (the synth and fx groups of the snapshot, and
   the waveform), not the pattern, tempo, swing or volume; presets live in `src/lib/presets/`
   as partial snapshots applied with `applySnapshot()`; 8 to 12 of them, picked from a
   "Preset" dropdown; one undo step each. It comes after items 1–3 so presets can use them
   (kicks and toms use the pitch envelope, done in PR 21; plucks the filter envelope). Open questions: sound
   only, or also starter patterns? What happens to per-pad waveforms? User-saved presets now or
   later? Which sounds? Dropdown above the synth panels or in the toolbar?
5. **Play the synth from the computer keyboard.** `ComputerKeyboard.vue` in git history has a
   key-to-note map. Space, 1–4 and the Ctrl/Cmd shortcuts must keep working (see "Keyboard
   shortcuts").
6. **Master limiter/compressor** (louder output without clipping), together with the **DC
   offset** fix: the drive shaper's curve has an even number of points (1024), so silence
   maps to about −0.011 instead of 0. Even with Drive off, that reaches the speakers through
   the drive wet gain, at about 0.004 with the default settings. It can't be heard, but it
   shows up in measurements (the browser tests use `__swingOver` to ignore it) and wastes a
   little headroom. Both change the sound slightly, so they are listen-tested together. The
   export engine has the same curve and needs the same changes.
7. **Share a project as a link** (the project encoded in the URL). It sets the delay time from
   outside, which works since PR 17.
8. **Stage view for TVs, and an audio output picker.** Casting already works without code
   (Chrome or Edge "Cast tab", AirPlay screen mirroring, Windows Cast, HDMI), picture and
   sound together, but with a noticeable lag when turning knobs. A Cast button of our own
   isn't practical: the web's casting APIs are made for media files, not sound made live in
   the page, and a Google Cast receiver app would really be the shared session (see "On
   hold"). Instead: a full-screen version of the screen (scope or spectrogram, with the steps
   lighting up) designed for a TV, to cast with the browser; and optionally an "Audio output"
   picker (`AudioContext.setSinkId()`, which not every browser supports; check before
   building).
9. **Step probability, ratchets** (quick repeats within a step) **and timing humanize.**
10. **Several patterns (A/B/C/D) chained into a song.**
11. **32 steps, or per-lane lengths** (the export code's types already allow 32).
12. **Per-step parameter locks** (for example a different filter cutoff on each step). Each
    note is built from scratch, so per-note settings (FM, unison, filter, envelopes, noise) can
    vary per step. Delay and reverb are shared by every note, so per step they become send
    amounts (how much of the step goes into them), not per-step effect settings, which would
    cut off the previous note's tail; per-step drive would mean moving drive into each note.
    UI idea: select a step with its settings dot, then the knobs you turn change that step
    only; locked steps are marked, with a way to clear them. Build on item 3 (velocity
    routing).
13. **More sound sources, part 2:** plucked string (Karplus–Strong: a noise burst circulating
    in a short delay loop that loses brightness each time round; the original paper also has a
    drum variant), metallic (several square waves at odd ratios, as the 808 makes cymbals and
    cowbell) and struck (a click ringing tuned resonant filters: wood block, marimba, toms,
    bells). Karplus–Strong needs an AudioWorklet: a `DelayNode` in a feedback loop can't be
    shorter than one render quantum (128 samples, about 3 ms), which caps the pitch around the
    F above middle C. AudioWorklets also run in the `OfflineAudioContext` used for WAV export.
14. **Export options:** N bars or loops, stems, MIDI file.
15. **More MIDI:** MIDI learn for knobs, MIDI clock sync, MIDI out.
16. **Install as an app (PWA)** that works offline.
17. **ESLint**, once ESLint and typescript-eslint move to `minimatch` 11 (see "No linter yet").
18. **Major-version upgrades** (Vite 8, Pinia 4), if wanted, each as its own PR. Left out on
    purpose so far.

On hold until the drum lanes come back (ask the maintainer before starting any of them):
- Drum lanes through drive, delay and reverb, with per-lane pitch, decay and pan.
- Store custom samples in the browser, and load them by drag-and-drop.
- Drum kits in the preset library, and drum lanes played by MIDI notes.
- **WAV export renders only the synth lane.**
- **Drum sample paths depend on the trailing slash.** They are relative to the page
  (`audio/kick.mp3`), so they break if `/studio2` is opened without its trailing slash and the
  server doesn't redirect.
- **Shared session ("jam"):** several people on one URL, for example one phone playing the
  drum lanes and another the synth. It needs a realtime relay between devices; the site is
  static files on shared hosting, so that means a third-party service (not decided yet).
  Design: one device (a laptop, or a TV with the Stage view) makes all the sound, and the
  phones are remote controls that each show their own part, so network lag only delays when a
  change takes effect, never the beat. Phones that each made the sound would drift apart and
  flam. Also to decide: who can join (a room code), and what undo means with several people.
  Share links (item 7) build part of it (the project packed into a compact message).

Done:

| PR | What it did |
|---|---|
| 1 | This guide. |
| 2 | First fixes: npm audit fixes and minor updates, playback in background tabs, LFO tap cleanup, Melody Maker arp settings saved, 1–4 view keys. |
| 3 | Moved to `/studio2/` with automatic deploys. |
| 4 | Removed unused files, and made each deploy an exact copy of the build. |
| 5 | Checks on every PR and deploy: type check, unit tests, browser tests. |
| 6 | Unsaved-changes warning, MIDI before Play, envelope-off loudness, Melody Maker listener leak. |
| 7 | Replaced zod with a hand-written project check. |
| 9 | Split `DrumSequencer.vue`, part 1 of 3: the live sound engine moved to `src/audio/liveEngine.ts` (helpers in `synthHelpers.ts`). |
| 10 | Fixed a race between File → New and an import right after it, which emptied the name box and made a deploy's checks fail now and then. |
| 11 | Split `DrumSequencer.vue`, part 2 of 3: MIDI moved to `src/composables/useMidiInput.ts` (with unit tests) and `MidiToolbar.vue`. |
| 12 | Split `DrumSequencer.vue`, part 3 of 3: saving and loading moved to `src/lib/project/snapshot.ts` (with unit tests) and `src/composables/useProjectSync.ts`. Finishes the split. |
| 13 | Accessibility: knobs are sliders that work from the keyboard (arrows, Shift, Home/End) and tell screen readers their value; the step pads are one Tab stop (arrows move, Enter switches a pad). Space stays Play everywhere, on purpose (the planned "Space presses the focused button" was dropped). |
| 14 | Trimmed the CSS from 334 kB to 119 kB (gzip 51 kB → 23 kB) by building only the Bootstrap parts in use, and silenced Bootstrap's Sass deprecation warnings (our own `mix()` calls moved to `color.mix()`). The look is unchanged: every element's computed style and every screenshot matched the old build in all three themes at five widths (before/after screenshots linked from the PR). |
| 15 | Undo/redo: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y, and Undo/Redo buttons next to File. A knob drag is one step; theme and panel layout aren't undone; opening a project starts a fresh history. |
| 17 | Synced delay time: the Delay panel's division is saved, and the delay time is always the division at the tempo (after File → New, in reopened and older projects, and after undo); worked out in one place, `src/lib/delaySync.ts`. |
| 18 | A saved project that fails the project check is no longer opened silently: at startup a new project is started with a message (so Save works); from File → Open a message says so and the current project stays. |
| 19 | Lighter change tracking: the project snapshot is built and compared once the settings have been still for 100 ms, not on every change (a burst of 30 knob steps: about 150 JSON conversions of the snapshot → 3). Save, Export file and the leave-page warning include a change made just before them. |
| 20 | Housekeeping: a real `README.md` (what the app is, running it, checks, deploy), and the Google Analytics tag is added by the build only, so `npm run dev` sends no analytics events. |
| 21 | Pitch envelope back on screen (under "Pitch & Harmonics" at first), with a drum-style sweep: an exponentially decaying offset on `detune` (fast, then settling) instead of a glide of the frequency, in the live and export engines, the same for every unison voice of a note. Its Decay knob is logarithmic (new `taper="log"` knob option), so 10–100 ms is a third of the turn. |
| 22 | Pitch envelope panel redesigned to fit the synth's frame: a compact "Pitch" card in a row of three with Envelope and Filter (instead of under "Pitch & Harmonics", which grew 149 px and left a gap on the left), a bipolar Amount knob instead of the ↑/↓ buttons, and an RND pill. Every module is back at its earlier size and place at all widths. |

## Testing a PR
Pushing a branch or opening a PR changes nothing on the website. GitHub runs the Checks on
every PR, and the result (a green check or a red ✗) shows on the PR page; merge only when it's
green. **Merging a PR into `main`
deploys it to `/studio2/` within a few minutes** (`/studio/` is never touched), so the usual
way to test is: merge, wait for the Actions run to finish, then try it on
https://www.ephemeralwave.com/studio2/ (on any device). If something is wrong, fix it in a
new PR.

To try a PR on your own computer before merging (Git Bash, in the project folder):

```bash
git fetch origin
git checkout <branch-name>   # the branch named on the PR page
git pull                     # make sure you have its latest commits
npm install                  # in case dependencies changed
npm run dev                  # then open http://localhost:5173/studio2/
```

To test the exact build that would be uploaded: `npm run build`, then `npm run preview`, and open
http://localhost:4173/studio2/. Afterwards, `git checkout main`. (Use `git checkout`, not
`git switch`: the maintainer's Git predates `switch`.) Saved projects are stored per website
and folder, so the live `/studio/`, the live `/studio2/`, `localhost:5173` and
`localhost:4173` each have their own. To test with a real project, use File → Export file
where it lives and File → Import file where you're testing.

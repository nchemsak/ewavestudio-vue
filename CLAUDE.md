# Ephemeral Wave Studio

Browser-based 16-step percussion synthesizer and step sequencer. This repo is **version 2**,
served from https://www.ephemeralwave.com/studio2/. The original version stays at
https://www.ephemeralwave.com/studio/ and is never updated or overwritten, so the two can
be compared; never deploy this code to `/studio/`. Everything runs client-side with the Web
Audio API; there is no backend. Features: one 16-step synth lane with per-step pitch,
velocity and waveform (sine, triangle, saw, square, a pulse with adjustable width, and three
harmonic shapes); amp envelope, pitch envelope (a drum-style sweep), filter with its own
envelope, noise, FM,
unison and LFO; delay, overdrive and reverb; Web MIDI note
input; a random melody and arpeggio maker; an oscilloscope, spectrogram, tuner and envelope
display; six built-in presets that set the sound (not the pattern); WAV export; projects
saved in IndexedDB with JSON import and export; and undo/redo.
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
  WAV encoding, storage names, the playback clock, synth helpers, the LFO visualizer's
  arithmetic, MIDI input (with a fake MIDI system), the undo history, project snapshots (save → load round trip, older
  projects, factory defaults) and presets (exact values, knob ranges, pattern untouched).
  `src/lib/project/testState.ts` builds the settings those tests use (`makeState`,
  `changeEverything`). `vitest.config.js` reuses `vite.config.js` and sets `BASE_URL`
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
  LfoBendMark.vue        The LFO's pitch bend drawn on a lit pad (see "LFO visualizer")
  MelodyMaker.vue        Scale, key and range; random melody and arpeggio generator
  PatternTools.vue       Synth-lane tools: step fills (all, every 2/4, invert, random, clear),
                         velocity shapes ("Humanize") and octave shift
  ProjectControls.vue    File menu: new, open, save, rename, delete, import/export JSON, WAV;
                         Undo/Redo buttons
  PresetButtons.vue      The Presets buttons in the transport card (see "Presets")
  MidiToolbar.vue        "MIDI Controller": Enable MIDI button, then the input list
  Screen.vue             "LCD" with F-key buttons; DrumSequencer draws its canvas views
  WaveButton.vue, WaveIcon.vue  A wave's big tile (Waveforms panel) and small line icon (pads)
  VelocityRouting.vue    The "Vel →" panel (Step Sequencer header): four velocity amounts
  filterView.ts          The screen's filter view (drawing loop and its pure helpers)
  Knob.vue, KnobGroup.vue, WaveButton.vue, PtSelect.vue, InfoPopover.vue, SectionWrap.vue, ...
src/audio/
  liveEngine.ts          The live sound engine (`useLiveEngine`), see "Audio engine (live)"
  synthHelpers.ts        Pure helpers: noise colors and buffers, drive curves, waveform
                         loudness, LFO division → Hz
  ticker.ts              Worker-driven timer for the sequencer clock
  pitchEnv.ts, filterEnv.ts, fm.ts  Per-note helpers shared by the live and offline engines
  waves.ts               The eight waves: names, loudness balance, and each voice's source
                         (the pulse network, the harmonic shapes)
  velocity.ts            Velocity routing: what a step's velocity does besides loudness
  reverb/generateIr.ts   Algorithmic impulse response for the ConvolverNode
  export/scheduleStepSequencer.ts  Separate offline engine used for WAV export
  export/encodeWav.ts    AudioBuffer → 32-bit float WAV
src/stores/projectStore.ts  Pinia store: current projectId, name, data snapshot
src/lib/project/snapshot.ts  Settings ↔ project snapshot, and factory defaults (see "Saving")
src/lib/project/history.ts   Undo/redo history of snapshots (pure; see "Undo / redo")
src/lib/project/testState.ts  Settings for unit tests (not used by the app)
src/lib/presets/         Built-in presets: library.ts (the sounds), presets.ts (applying one,
                         and matching the sound to one; see "Presets")
src/lib/delaySync.ts     Tempo-synced delay: divisions, synced time, followDelaySync (see
                         "Delay time")
src/lib/lfoVisual.ts     What the LFO visualizer shows (pure; see "LFO visualizer")
src/lib/storage/         IndexedDB via `idb` (db.ts, projects.ts), JSON import/export,
                         namespace.ts (storage names, one set per site folder)
src/lib/schema/projectSchema.ts  Project file check (hand-written, no library) + v1→v2
                         migration (CURRENT_VERSION = 2)
src/composables/useTheme.ts      synthwave | dark | light theme, stored in localStorage
src/composables/useMidiInput.ts  Web MIDI note input (see "MIDI")
src/composables/useProjectSync.ts  Keeps the settings and the project store in step (see "Saving")
src/composables/useUndoHistory.ts  When to record an undo step, and applying undo/redo
src/composables/useLfoVisual.ts  The LFO visualizer's frame clock
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
  `currentStep`, `playSynthNote`, `startLfoIfNeeded`, `togglePlay`, `hardStopSequencer`,
  `loadSample`, and for the LFO visualizer `lfoNow` and `soundingRecently`. A new sound setting is passed in here (see "If you add a parameter").
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
- Waves (`waves.ts`, shared by both engines): `createVoiceSource()` builds each voice's
  source; the engines set its `osc` (frequency, detune, FM, LFO pitch) and connect its `output`
  to the voice's filter. sine, triangle, sawtooth and square are the oscillator's own; `pulse`
  is the voice's sawtooth through a steep, oversampled tanh comparator whose threshold a
  `ConstantSourceNode` sets from Pulse Width (`synth.pulse.width`, 5–50 %, default 50 = a
  square; a width w and 100 − w sound the same, the wave upside down, so the knob covers one
  side: 5 % thinnest to 50 % fullest, and `foldPulseWidth()` mirrors an older project's width
  above 50 %), and the same source cancels the pulse's DC; `organ`, `hollow` and `glass` are fixed
  harmonic recipes (`createPeriodicWave`). `waveGain()` balances their loudness (the harmonic
  shapes are RMS-matched to the sine). An unknown wave name plays as a sine. The LFO's third
  target, `pwm` (labelled "Pulse" in the LFO's Target switch; "PW" meant little to a
  newcomer; depth in % width), moves the pulse's threshold, kept within 5–95 %
  (past 50 % the sound comes back the way it went).
- Velocity routing (`velocity.ts`, both engines; panel `VelocityRouting.vue`, opened by the
  Step Sequencer's "Vel →" button, lit while any amount isn't 0): a step's velocity (its pad
  slider; a MIDI note's velocity) also shapes Decay, Cutoff (up to 2 octaves), the pitch
  envelope's Amount and the noise mix, each by a bipolar amount (−100…+100 %, 0 = off, the
  default). A full-velocity step plays the panel's settings exactly; right of centre softer
  steps get less, left more (`routeVelocity()`). `playSynthNote()` takes the step's own
  velocity as `opts.vel` (its `velocity` argument is the loudness, with the lane volume).
  Saved as `synth.velocity` { decay, cutoff, pitchEnv, noise }; older projects get none.
- Filter envelope (`filterEnv.ts`; the Filter card's Env Amt and Decay knobs): each note's
  cutoff starts Env Amt octaves away (−5…+5; right of centre above, so the filter closes;
  left below, so it opens) and returns to Cutoff within Decay, as a decaying offset in cents
  on the filter's `detune` (time constant Decay / 4, like the pitch envelope). Saved as
  `synth.filter.envAmount` (octaves, 0 = off, the default) and `envDecayMs` (default 200);
  older projects get none. The filter view draws where each note's cutoff starts.
- Envelope: the on/off switch is hidden in the interface (`EnvelopeModule` with
  `:showToggle="false"`), but saved or imported projects can have the envelope off. A note
  then holds the level the envelope would peak at (waveform balance and noise mix included),
  in both the live and the export engine.
- The LFO is one shared oscillator → `lfoGain`. Each note connects a tap from it to the voice's
  `detune` or filter frequency, and `releaseLfoTap()` disconnects it when the note ends.
  Anything else per-note that connects to a long-lived node needs the same cleanup.
  The oscillator also feeds a tiny `AnalyserNode` (`lfoProbe`, not connected onward), which
  `lfoNow()` reads: where the LFO is now, −1..1 (null while it isn't running).
- WAV export uses a **separate** offline engine (`scheduleStepSequencer.ts`), fed by the
  `exportState` computed. It renders only the synth lane. Changes to the live sound (new
  parameters, changed gain staging) must be mirrored there, or exports will sound different.

### LFO visualizer
- While the LFO moves something, its movement is drawn on the control it moves, in amber
  (`--lfo-mod`, darker in the light theme; every theme's knob arcs are blue to purple or pink),
  without turning that control, so it can still be turned while the LFO runs:
  - Filter: an amber dot on the Cutoff knob's ring at the cutoff the LFO has now, over a faint
    outer arc for its whole swing (`Knob.vue`'s `modValue` and `modRange`). The swing is the
    engine's own, shrunk to its safe band (`lfoFilterTapGain`).
  - Pulse: the Pulse tile's bar is drawn at the width the pulse plays at now, over a dashed
    ghost of the widest (`WaveButton.vue`). Only while something plays Pulse (`pulseInUse`).
    The Pulse Width mini knob doesn't get a dot (too small to read).
  - Pitch: on each lit step pad, an amber bar slides up (sharper) and down (flatter) along a
    faint track for the whole bend; an octave fills the track (`LfoBendMark.vue`).
- The ranges (arc, ghost, track) show whenever the LFO is on with depth above 0 on that
  target; the moving parts only while something sounds (`soundingRecently()`: playing, or a
  note in the last 1.5 s, for MIDI). With `prefers-reduced-motion` only the ranges show.
- `src/composables/useLfoVisual.ts` reads `lfoNow()` every frame (requestAnimationFrame, so it
  stops in hidden tabs), or four times a second while nothing sounds; it doesn't run at all
  while the LFO is off or at depth 0. `src/lib/lfoVisual.ts` turns the position into what each
  indicator shows, with the engines' own limits (unit-tested against them).
- `DrumSequencer.vue` passes one reactive object, `lfoView` (type `LfoView`), down to
  `FilterModule`, the Pulse tile's `WaveButton` and `SynthStepGrid`. Only components that read
  its fields redraw every frame; `DrumSequencer` itself must never read them in its template,
  or its whole template would re-render 60 times a second.

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
  typing or while a dropdown list is open. While Attack/Decay or Cutoff/Resonance is turned,
  the screen shows the envelope view (F4) or the filter view (no F-key), then goes back
  (`holdScreen`/`onScreenKnobEnd` in `DrumSequencer.vue`); a view picked meanwhile stays.
- Ctrl/Cmd+S: save (`ProjectControls.vue`). Escape closes menus and popovers.
- Ctrl/Cmd+Z: undo; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y: redo (same handler as Space). Ignored in
  a text box, which keeps its own undo (the project name).
- Knobs (`Knob.vue`, `role="slider"`): Tab to one, then arrows (Up/Right turn it up) move one
  step, or about 1% of the range on a knob with more than 300 steps; Shift+arrow and Page
  Up/Down about 10%; Home/End minimum/maximum. The first key emits `knobStart`, as a drag
  does (value tooltip, envelope or filter view), and leaving the knob emits `knobEnd`.
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

### Presets
- Six buttons in the transport card (`PresetButtons.vue`): Kick, Snare, Metal / Pluck, Acid,
  Bell. From 1280 px they sit between Swing and the logo, three across, without making the
  card taller; narrower, they get a row of their own under the knobs (six across; three across
  under Play on phones), and the screen beside grows with the card.
- A preset sets the sound only: the synth and effect settings, the main wave and every pad's
  wave (as clicking a wave tile does). Never the pattern (steps, velocities, pitches, the noise
  mask), the key and octave, tempo, swing, volume or Melody Maker.
- `src/lib/presets/library.ts` lists each preset as only what it changes from the factory
  sound. `applyPreset()` (`presets.ts`) first puts the whole sound back to factory
  (`resetSoundToFactoryDefaults()` in `snapshot.ts`, which File → New uses too), then applies
  the preset's settings with `applySnapshot()`. So a preset that doesn't mention the delay has
  it off, and a preset sounds the same whatever was set before it (a unit test checks this
  from a state with every setting changed). A new sound setting must go into
  `resetSoundToFactoryDefaults()`, or presets would keep whatever it was.
- Its values must stay within the knobs' ranges (a unit test checks) and survive the panels
  unrounded (a browser test checks each preset lands exactly and stays lit). The delay's
  feedback has no knob, so presets leave it at 0.3. The drive saturates to near full scale,
  so its mix sets the level: keep it low (Kick 0.3, Acid 0.35), or that preset is much louder
  than the others. WAV exports of pads 1, 5, 9, 13 peak between about 0.2 (Pluck) and 0.5
  (Acid).
- A click is one undo step (the undo history records it like any change). The button of the
  preset the sound matches is lit (`aria-pressed`): `DrumSequencer.vue` notes each preset's
  sound once it has been applied and the panels have followed (`soundKey()`: the sound part of
  a snapshot, without the synced delay time), and compares it with the project store's copy.
  Turning a sound knob unlights it; undo back to it lights it again; a tempo change doesn't
  unlight it. A preset not clicked on this page has no sound noted, so a project that happens
  to match it lights nothing.
- Analytics: `preset_select` with the preset's id.

### Saving / projects
- The settings stay refs in `DrumSequencer.vue`. It groups every saved one into `projectState`
  (type `ProjectState`), shaped like a snapshot:
  `{ meta, ui, transport, synth, fx, instruments[], melody, selectedWaveform }`.
- `src/lib/project/snapshot.ts`: `buildSnapshot(state)` turns the settings into a plain object,
  `applySnapshot(state, s)` restores them (a missing or wrongly typed field keeps its current
  value), and `resetToFactoryDefaults(state)` is File → New (its synth and effects part is
  `resetSoundToFactoryDefaults(state)`, which presets use too). They only touch refs, so
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
  `ProjectState` type), to `buildSnapshot`, `applySnapshot` and the factory defaults in
  `snapshot.ts` (a sound setting in `resetSoundToFactoryDefaults`, see "Presets"; the default
  must match the ref's starting value; a browser test compares File → New with a fresh page),
  and to `changeEverything()` in `testState.ts` (the round-trip test names any setting it
  doesn't cover). If it affects sound, also to
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
  requested. The Light theme's button is commented out in `ThemeToggle.vue`, so only a choice
  saved before that applies it; it still has rough spots (for example FM's Lock button and the
  effect pedals' names are hard to read). Theme colors are CSS variables set per theme in
  `_themes.scss`; use them rather than a fixed color that only suits the dark themes. For
  example `--pt-inset` is the background of an inset panel inside a card (Pattern Tools'
  sections, the Presets box): dark, or a light tint in the light theme. A browser test checks
  that those panels' captions are readable in all three themes.
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
  ways (the pitch envelope's Amount). `size="mini"` (26 px) with `hideLabel` is for a knob on a
  tile (Pulse Width); the label is still its accessible name. `modValue` (a dot on the ring)
  and `modRange` ([low, high], a faint outer arc) draw where something else, the LFO, moves
  the setting, without moving the knob (see "LFO visualizer").
- Layout: the module cards flow in CSS columns from 992 px (`.ds-modules`), so a module that
  grows taller reshuffles the columns and can leave a gap. Envelope and Pitch are stacked on
  the left of `.sound-grid` with Filter beside them as a 2×2 block (Cutoff, Resonance, Env Amt,
  Decay); at 1280 px and on phones each card has room for two small knobs (40 px) across and a
  five-letter title. The LFO is one compact row (on/off tile, Rate, Depth, Wave and Target
  switches), 118 px tall, which made room for the Filter's second row. A browser test checks
  the arrangement and one-line titles. The Waveforms panel shows its eight tiles as a 4×2 grid;
  Pulse Width is a mini knob in the Pulse tile's top-left corner (the dice badge is top-right),
  placed beside the tile's button, not inside it, so turning it doesn't pick the wave; the
  tile's bar is drawn as wide as the pulse. (It first sat under Unison, which looked tied to
  Unison and greyed out with it.) The LFO hides its Wave / Target captions when its card is
  under 352 px (a container query), and tightens its gaps there, so it stays one row (a
  browser test checks it at 1280 px and on a phone). When the LFO's target is Pulse and
  nothing plays Pulse (`pulseInUse`: the main wave, or any step that's on in an unmuted lane),
  the Pulse target button is dimmed with a title saying why, and the LFO's tile reads
  "No Pulse".
  The look is meant to be one piece of hardware
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
this file), then presets that can use them (the first six presets came in PR 30; more can come
with new sound features). Everything drum-related waits until the maintainer brings the drum
lanes back.

1. **Share a project as a link** (the project encoded in the URL). It sets the delay time from
   outside, which works since PR 17.
2. **Stage view for TVs, and an audio output picker.** Casting already works without code
   (Chrome or Edge "Cast tab", AirPlay screen mirroring, Windows Cast, HDMI), picture and
   sound together, but with a noticeable lag when turning knobs. A Cast button of our own
   isn't practical: the web's casting APIs are made for media files, not sound made live in
   the page, and a Google Cast receiver app would really be the shared session (see "On
   hold"). Instead: a full-screen version of the screen (scope or spectrogram, with the steps
   lighting up) designed for a TV, to cast with the browser; and optionally an "Audio output"
   picker (`AudioContext.setSinkId()`, which not every browser supports; check before
   building).
3. **Step probability, ratchets** (quick repeats within a step) **and timing humanize.**
4. **Several patterns (A/B/C/D) chained into a song.**
5. **32 steps, or per-lane lengths** (the export code's types already allow 32).
6. **Per-step parameter locks** (for example a different filter cutoff on each step). Each
   note is built from scratch, so per-note settings (FM, unison, filter, envelopes, noise) can
   vary per step. Delay and reverb are shared by every note, so per step they become send
   amounts (how much of the step goes into them), not per-step effect settings, which would
   cut off the previous note's tail; per-step drive would mean moving drive into each note.
   UI idea: select a step with its settings dot, then the knobs you turn change that step
   only; locked steps are marked, with a way to clear them. Build on velocity routing
   (PR 28).
7. **More sound sources, part 2:** plucked string (Karplus–Strong: a noise burst circulating
   in a short delay loop that loses brightness each time round; the original paper also has a
   drum variant), metallic (several square waves at odd ratios, as the 808 makes cymbals and
   cowbell) and struck (a click ringing tuned resonant filters: wood block, marimba, toms,
   bells). Karplus–Strong needs an AudioWorklet: a `DelayNode` in a feedback loop can't be
   shorter than one render quantum (128 samples, about 3 ms), which caps the pitch around the
   F above middle C. AudioWorklets also run in the `OfflineAudioContext` used for WAV export.
8. **Export options:** N bars or loops, stems, MIDI file.
9. **More MIDI:** MIDI learn for knobs, MIDI clock sync, MIDI out.
10. **Install as an app (PWA)** that works offline.
11. **ESLint**, once ESLint and typescript-eslint move to `minimatch` 11 (see "No linter yet").
12. **Major-version upgrades** (Vite 8, Pinia 4), if wanted, each as its own PR. Left out on
    purpose so far.
13. **User-saved presets, and more built-in ones.** Left out of PR 30 on purpose. A user
    preset could be the sound part of a snapshot (`soundKey()`'s parts) kept in IndexedDB
    next to the projects; more built-in ones as new sound features arrive (toms, hats, organ
    and hollow sounds).

Dropped after PR 30 (the maintainer and Claude agreed they add little): playing the synth
from the computer keyboard (the synth is played by its sequencer, as a DFAM is, and a MIDI
keyboard already works), and a master limiter/compressor together with the drive's DC offset
fix. The DC offset stays: the drive shaper's curve has an even number of points (1024), so
silence maps to about −0.011 instead of 0, which reaches the speakers through the drive wet
gain at about 0.004 with the default settings, in the live and export engines. It can't be
heard, and the presets peak well below clipping (0.2–0.5), but measurements see it: the
browser tests use `__swingOver` to ignore it.

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
  Share links (item 1) build part of it (the project packed into a compact message).

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
| 23 | Filter view on the screen: while Cutoff or Resonance is turned (no F-key), the screen draws the filter's real response curve (log frequency, dB) with the live spectrum faintly behind, and dashed curves for the LFO's swing when it targets the filter. Picking another view while a knob is held now keeps that view. The LFO's filter depth limit is one helper shared by both engines. |
| 24 | Filter envelope (Env Amt ±5 octaves, Decay; DFAM-style, in the live and export engines, drawn on the filter view), and room for it: the LFO redesigned as one compact row (284 → 118 px), Envelope and Pitch stacked beside a 2×2 Filter. |
| 25 | Eight waves: Pulse (Pulse Width knob 5–95 %, and "PW" as a third LFO target: pulse-width modulation), and three harmonic shapes, Organ, Hollow and Glass, balanced in loudness; in the live and export engines (`waves.ts`). The Waveforms panel shows eight tiles (4×2); pads and the pad settings offer all eight. |
| 26 | Pulse Width moved to a mini knob on the Pulse tile (it sat under Unison and greyed out with it), and the tile's bar shows the width. The LFO's PW target says when nothing plays Pulse: PW is dimmed with an explanation, and the LFO tile reads "No Pulse". |
| 27 | Pulse Width covers one side only, 5 % (thinnest) to 50 % (the square, fullest): a width and its mirror (25 % and 75 %) sound the same, so half the knob repeated the other. Older projects' widths above 50 % become their mirror, which sounds the same. The LFO's third target is labelled "Pulse" instead of "PW", and the LFO visualizer idea added to the plan.
| 28 | Velocity routing: a step's velocity (or a MIDI note's) also shapes Decay, Cutoff, the pitch envelope and the noise mix, each by a bipolar amount in the Step Sequencer's "Vel →" panel; full-velocity steps play as set; in the live and export engines (`velocity.ts`). |
| 29 | LFO visualizer: while the LFO plays, an amber dot on the Cutoff knob (over an arc for the swing), the Pulse tile's bar widening and narrowing (over a ghost of the widest), or a bar sliding on each lit pad (pitch) shows what it's doing, without turning any knob; ranges only with reduced motion. |
| 30 | Built-in presets: six buttons (Kick, Snare, Metal, Pluck, Acid, Bell) in the transport card, between Swing and the logo (a row of their own on narrower screens). A preset sets the sound from the factory sound up (synth, effects, the main wave and every pad's), never the pattern, tempo or key; one undo step; its button is lit while the sound matches. `src/lib/presets/`. |
| 31 | The Pattern Tools section titles (and "Active Pads Only") are readable in the light theme: inset panels take their background from a theme variable, `--pt-inset`, instead of a fixed dark color. A browser test measures the captions' contrast in all three themes. The plan's next two items (computer keyboard, limiter and DC offset fix) dropped. |

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

# Ephemeral Wave Studio

Browser-based 16-step percussion synthesizer and step sequencer. This repo is **version 2**,
served from https://www.ephemeralwave.com/studio2/. The original version stays at
https://www.ephemeralwave.com/studio/ and is never updated or overwritten, so the two can
be compared; never deploy this code to `/studio/`. Everything runs client-side with the Web
Audio API; there is no backend. Features: one 16-step synth lane with per-step pitch,
velocity, waveform (sine, triangle, saw, square, a pulse with adjustable width, and three
harmonic shapes) and ratchet (2–4 quick hits within the step); amp envelope, pitch envelope (a drum-style sweep), filter with its own
envelope, noise, FM,
unison and LFO; delay (with a ping-pong switch), overdrive (with a bit-crusher switch) and reverb; Web MIDI note
input, and MIDI learn (a controller's knobs turn the app's); a melody maker (random notes or an
arpeggio in a key and scale; a new key or scale moves the pattern with it); a screen with an oscilloscope, spectrum,
spectrogram and tuner, and envelope and filter views while their knobs are turned; six built-in sounds that set the sound (not the pattern) and six built-in patterns
that set the pattern (not the sound), each with a dice for a random one; audio export (seamless N-bar loops, effects stems, a MIDI file and a one-shot); projects
saved in IndexedDB with JSON import and export; undo/redo; it installs as an app that
works offline (a PWA); and a phone held sideways gets a layout of its own (phone mode).
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
  arithmetic, MIDI input (with a fake MIDI system), MIDI learn (and that every learnable knob
  is in the app), the undo history, project snapshots (save → load round trip, older
  projects, factory defaults), presets (exact values, knob ranges, pattern untouched),
  patterns (from the key, sound untouched, the dice's rolls), pad colours,
  ratchet timing, the bit crusher, knob notches, the Melody Maker's theory (moving a pattern to another key or
  scale) and arpeggio layout (Rate, fitting the bar), and the export helpers (loop folding, MIDI and zip files read
  back, names).
  `src/lib/project/testState.ts` builds the settings those tests use (`makeState`,
  `changeEverything`). `vitest.config.js` reuses `vite.config.js` and sets `BASE_URL`
  to the real base, so code sees `/studio2/` as in the app.
- **Browser tests** (Playwright, Chromium), `e2e/app.spec.ts`: build, serve with
  `vite preview`, then drive the app. An init script keeps a handle on the app's AudioContext
  (`__ctx`), records every scheduled note and the per-note LFO taps, measures the output
  level (`__peakOver(ms)`, and `__swingOver(ms)`, which ignores a steady offset), tracks keydown
  listeners on `window` (`__keydown`), and can pause
  `requestAnimationFrame` the way hidden tabs do. The MIDI tests install a fake MIDI keyboard
  or controller. Service workers are blocked (`playwright.config.ts`), so every test loads
  the build itself, except the PWA tests, which turn them on; the update test stages a deploy
  by editing `dist/sw.js` and `dist/index.html` (the preview server reads files on every
  request) and puts them back afterwards.
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
re-deploy by hand. After a deploy, open https://www.ephemeralwave.com/studio2/ (or the installed
app): within a moment "A new version of the app is ready" shows; click Reload (see "Install
as an app"). Ctrl+F5 loads the new files too, but for that one load only.

The build includes `sw.js` (the service worker) and `manifest.json`. The upload order needs
no care for them: an installed copy only takes a new version once every file matches the
checksums in the new `sw.js`, so a deploy caught halfway is ignored until it's complete.

Manual fallback with FileZilla: `npm run build`, then upload the **contents** of `dist/` (not
the folder itself) into `/public_html/studio2/`. Never upload to `/public_html/studio/`.

Notes:
- `base` also decides where saved projects are stored (see "Saving / projects"), so changing
  it gives the app a fresh, empty set of saved projects.
- The Google Analytics (gtag) tag is added to `index.html` by the build only
  (`build-plugins/googleAnalytics.js`, a Vite plugin with `apply: 'build'`), so `npm run dev`
  sends no analytics events. The deployed site, `npm run preview` and the browser tests (which
  stub it out) have it.
- The "Return to Ephemeral Wave" link points to `/`, the main site, which is not part of this
  repo. In the installed app it opens in the browser (`target="_blank"`), not in the app's
  window.

## Architecture

```
index.html               Entry HTML (the build adds the Google Analytics tag)
build-plugins/googleAnalytics.js  Vite plugin: the gtag snippet, in builds only
build-plugins/serviceWorker.js  Vite plugin: writes dist/sw.js (builds only), the service worker
                         (serviceWorkerSource.js) with the build's files and checksums; see
                         "Install as an app"
src/main.ts              createApp + Pinia, imports the global SCSS (Bootstrap + theme)
src/App.vue              Toolbar (ThemeToggle, #midi-toolbar-slot) + <DrumSequencer/> +
                         <PwaNotice/> (the "new version" notice)
src/components/
  DrumSequencer.vue      ~3900 lines; holds nearly all app state (as refs) and the screen
                         views; groups the saved settings as `projectState` for saving and
                         the live engine, and decides what a MIDI note plays; its template's
                         LAYOUT section lays out the panel (see "Layout" under Conventions)
  modules/*.vue          Synth and effect panels: Envelope, Filter, PitchEnv, Noise, FM,
                         Unison, LFOGroup, Delay, Drive, Reverb (UI only; mostly v-model);
                         PedalSwitch.vue, a pedal's mini toggle (CRUSH, PING PONG)
  SynthStepGrid.vue      16 synth step pads with velocity and pitch sliders
  PhoneLayout.vue        Phone mode's layout (see "Phone mode"): pads, Play, steppers, macros;
                         its Sound, FX and Key pages are DrumSequencer's slots
  LfoBendMark.vue        The LFO's pitch bend drawn on a lit pad (see "LFO visualizer")
  MelodyMaker.vue        Key, scale and range; one Generate (Melody or Arpeggio); a key or scale
                         picked moves the pattern (see "Melody Maker")
  PatternTools.vue       Synth-lane tools: step fills (all, every 2/4, invert, random, clear),
                         velocity shapes ("Humanize") and octave shift (with the Active Pads
                         Only toggle)
  ProjectControls.vue    The top bar: the logo (its `brand` slot), File menu (new, open, Save as…,
                         delete, import/export JSON, Export audio…), the name box (rename),
                         Save, Undo/Redo buttons
  ExportDialog.vue       The Export audio dialog (see "Export audio")
  PresetButtons.vue      A box of preset buttons and a dice, used twice in the transport card:
                         Sounds and Patterns (see "Sounds and Patterns")
  MidiToolbar.vue        "MIDI Controller": Enable MIDI button, then the input list and Learn
                         (and the MIDI learn bar, at the bottom of the screen)
  Screen.vue             "LCD" with F-key buttons; DrumSequencer draws its canvas views
  WaveButton.vue, WaveIcon.vue  A wave's big tile (Waveforms panel) and small line icon (pads)
  VelSwitch.vue          The Filter card's VEL switch: velocity routing (the only one since PR 67)
  PillSwitch.vue         The small on/off pill with an LED in a card's header (VEL, RETRIG)
  filterView.ts          The screen's filter view (drawing loop and its pure helpers)
  spectrumView.ts        The screen's Spectrum view, F2 (drawing loop and its pure helpers)
  LfoModKnob.vue         A Knob that draws the LFO visualizer's dot and arc itself (the Vol knob)
  Knob.vue, KnobGroup.vue, WaveButton.vue, PtSelect.vue, InfoPopover.vue, SectionWrap.vue, ...
src/audio/
  liveEngine.ts          The live sound engine (`useLiveEngine`), see "Audio engine (live)"
  synthHelpers.ts        Pure helpers: noise colors and buffers, drive curves, waveform
                         loudness, LFO division → bars, Hz and where it restarts
  ticker.ts              Worker-driven timer for the sequencer clock
  pitchEnv.ts, filterEnv.ts, fm.ts  Per-note helpers shared by the live and offline engines
  lfo.ts                 The LFO's targets and Depth ranges, a note's own LFO (Retrigger), Level
                         and FM amounts (see "Audio engine (live)")
  waves.ts               The eight waves: names, loudness balance, and each voice's source
                         (the pulse network, the harmonic shapes)
  velocity.ts            Velocity routing: what a step's velocity does besides loudness
  ratchet.ts             Ratchets: when a step's 2–4 quick hits start and end, and what they
                         play (the pad's note, or up or down the key's chord)
  crusher.ts             The bit crusher (an AudioWorklet built from a Blob URL), see
                         "Effect switches"
  pingPong.ts            The ping-pong delay network, see "Effect switches"
  unison.ts              Unison: 2–4 voices, where each sits and starts in its cycle (see
                         "Audio engine (live)")
  reverb/generateIr.ts   Algorithmic impulse response for the ConvolverNode
  export/scheduleStepSequencer.ts  Separate offline engine used for audio export
  export/exportFiles.ts  The Export audio dialog's files: renders, loops, stems, one-shot
  export/encodeWav.ts    AudioBuffer (or plain channels) → 32-bit float WAV
src/stores/projectStore.ts  Pinia store: current projectId, name, data snapshot
src/lib/project/snapshot.ts  Settings ↔ project snapshot, and factory defaults (see "Saving")
src/lib/project/history.ts   Undo/redo history of snapshots (pure; see "Undo / redo")
src/lib/project/testState.ts  Settings for unit tests (not used by the app)
src/lib/presets/         Built-in sounds: library.ts (the sounds), presets.ts (applying one,
                         and matching the sound to one), random.ts (the dice's random sound);
                         see "Sounds and Patterns"
src/lib/patterns/        Built-in patterns: library.ts (the patterns), patterns.ts (applying
                         one from the key, and matching the pattern to one), random.ts (the
                         dice's random pattern); see "Sounds and Patterns"
src/lib/export/          Export helpers (pure, unit-tested): audio.ts (loop folding, tail
                         trimming, normalizing), midi.ts (MIDI file), zip.ts, names.ts
src/lib/random.ts        Seeded random numbers (export stems; tests)
src/lib/noise/accents.ts  The Noise card's Accents: noise on the pattern's loudest hits (pure)
src/lib/delaySync.ts     Tempo-synced delay: divisions, synced time, followDelaySync (see
                         "Delay time")
src/lib/lfoVisual.ts     What the LFO visualizer shows (pure; see "LFO visualizer")
src/lib/padColour.ts     The pads' colours, which the spectrogram uses too (see "Pad and
                         spectrogram colours")
src/lib/melody/theory.ts  Keys and scales; moving a pattern to another key or scale (pure)
src/lib/melody/arp.ts    The arpeggio on the pads: where Rate puts notes, the cycle fitted to
                         the bar (pure; see "Melody Maker")
src/lib/knobDetents.ts   Knob notches: the drag's travel with a hold at each, and the Tempo and
                         Swing notches (pure; see "Knobs" under Conventions)
src/lib/midiLearn.ts     MIDI learn's bookkeeping (pure): the learnable knobs (MIDI_KNOBS) and
                         which controller knob drives which
src/lib/storage/         IndexedDB via `idb` (db.ts, projects.ts), JSON import/export,
                         namespace.ts (storage names, one set per site folder)
src/lib/schema/projectSchema.ts  Project file check (hand-written, no library) + v1→v2
                         migration (CURRENT_VERSION = 2)
src/composables/useTheme.ts      synthwave | dark | sand | analog | slate | light theme, in localStorage
src/composables/useMidiInput.ts  Web MIDI note input (see "MIDI")
src/composables/useMidiLearn.ts  MIDI learn mode and the controller's links (see "MIDI learn")
src/composables/usePwa.ts  Installing the app, offline use and updates, the page's side
src/composables/usePhoneMode.ts  When phone mode is on (a phone held sideways), the upright hint
src/composables/useProjectSync.ts  Keeps the settings and the project store in step (see "Saving")
src/composables/useUndoHistory.ts  When to record an undo step, and applying undo/redo
src/composables/useLfoVisual.ts  The LFO visualizer's frame clock
src/assets/styles/       _bootstrap-custom.scss (the Bootstrap parts in use, then main.scss),
                         and all global SCSS (themes are in _themes.scss, the buttons' look in
                         _hardware.scss: see "Buttons" under Conventions). _sequencer.scss and
                         _keyboard.scss are not built (main.scss doesn't load them)
public/audio/            kick.mp3, snare.mp3, hihat.mp3: still fetched at startup, but only
                         used by the hidden drum lanes
public/images/           Background textures/GIFs referenced from SCSS via ../images/
                         (circleWave.gif and retroSpeaker.gif only from the unbuilt _sequencer.scss)
public/manifest.json, public/icons/  The web app manifest and its icons (the sun from
                         src/assets/eWaveLogo1.png: 192, 512, maskable 512, iPhone 180)
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
- Graph: per-note synth voices → drive (dry + shaper → tone → [bit crusher] → `driveSum`).
  From `driveSum` two paths run in parallel: delay (dry + wet, with a feedback loop and tone
  filters; the plain delay or the ping-pong one, each with its own send) and a reverb send
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
  Just before it builds a bar's step 1 it calls `onBarStart` (see "Changes at the bar").
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
- Velocity routing (`velocity.ts`, both engines): a step's velocity (its pad slider; a MIDI
  note's velocity) also shapes Decay, Cutoff (up to 2 octaves), the pitch envelope's Amount
  and the noise mix, each by an amount (−100…+100 %, 0 = off, the default). A full-velocity
  step plays the card's settings exactly; above 0 softer steps get less, below 0 more
  (`routeVelocity()`). `playSynthNote()` takes the step's own velocity as `opts.vel` (its
  `velocity` argument is the loudness, with the lane volume). Saved as `synth.velocity`
  { decay, cutoff, pitchEnv, noise }; older projects get none.
  **VEL switches** (PR 59, replacing PR 28's "Vel →" pop-up of four knobs, which people didn't
  find and whose effect was hard to hear): a pill with an LED in the top-right corner of the
  Envelope, Pitch (before RND) and Filter cards' headers and of the Noise card
  (`VelSwitch.vue`, `role="switch"`; greyed out while its card is off). On sets one fixed
  amount, `VELOCITY_SWITCH_AMOUNT` (+75 %: a half-velocity step gets about 60 % of the
  Decay, sweep or noise, and its cutoff ¾ octave lower), off 0. Mini knobs beside the targets
  were mocked up first and turned down (the maintainer's call: they pushed the knob rows
  apart and overflowed Noise's buttons). So the reverse direction and in-between amounts are
  gone from the panel; a project that has one plays it as saved, its switch lit, until
  switched off. Presets and the Sounds dice use the switch's amount. Not MIDI-learnable
  (switches). The tooltip is one line ("Softer steps decay sooner"). Turning one on shows
  what it does (`VEL SWITCHES` section of `DrumSequencer.vue`): Decay's and Cutoff's show the
  envelope or filter view for 1.5 s (`flashScreen()`), where softer steps (70 % and 40 %,
  `VELOCITY_FAN`) are drawn dashed whenever the switch is on; and if every step that's on is
  at full velocity (so it can't change anything yet), a note under the switch says "Every
  step is at full velocity: try Humanize" and Pattern Tools' Humanize buttons glow
  (`PatternTools`' `nudge`). The phone's Sound page has the three cards' switches too.
  **Only Filter's is left** (PR 67, the maintainer's call): Decay's and the pitch sweep's were
  hard to hear, and Noise's seemed to do what its Amount knob does (it lowers the noise mix on
  softer steps, which are already quieter). Velocity still shapes the cutoff, from the Filter
  card's switch (and on the phone's Sound page). The engines still route all four
  (`velocity.ts`), but `applySnapshot()` sets the other three to 0 on every load
  (`VELOCITY_SWITCHED`), so no amount plays that no switch shows: an older project's or a
  preset's amount for them is dropped. Presets Kick, Snare, Metal and Bell lost theirs; the
  Sounds dice still draws two destinations, as before (so the rest of a seeded roll stays the
  same), and turns Cutoff's on when either is the cutoff. The Pitch card's `vel` slot went
  with its switch.
- Ratchets (`ratchet.ts`, both engines; "Repeats" ×1–×4 in each pad's ⋮ menu, a "×3" badge
  at the top of the pad): the step plays that many quick hits, evenly spaced from its start
  to the next step's start (`stepSpan()`: swing makes an on-beat step longer and a swung one
  shorter). Each hit is a whole note (its own pitch and filter sweeps, the step's velocity,
  noise mask and wave), but it ends where the next hit begins (`opts.maxDuration` →
  `cutNoteEnd()`, never before its attack is done), the way a single-voice synth retriggers,
  so a long sound repeated doesn't pile up into a louder smear; the last hit rings out as
  usual. Saved per step as the synth lane's `ratchets` (1–4; projects saved before get 1s,
  other values are clamped by `clampRatchet()`); Reset Pads, the ⋯ menu's Clear Repeats and
  File → New put them back to 1.
  The **Repeats brush** (PR 50; `×2 ×3 ×4` beside Vol in the Step Sequencer header,
  `repeatBrush` in `DrumSequencer.vue`, not saved): while one is lit, a click or a drag across
  pads (`SynthStepGrid.vue`'s `paintRepeats()`, like painting steps) gives them that many hits
  and turns them on; a pad that has the brush's count already goes back to one (the first pad
  decides, as with steps). The pad under the mouse shows what a click would give (a dashed
  badge), and its velocity and pitch sliders hide. Enter on a focused pad paints it; Esc, the
  lit button or File → New puts the brush down. A drag is one undo step.
  Ratchets are part of the pattern: sounds (presets) and their dice leave them alone; patterns
  set them.
  **Repeat notes** (PR 58; the pad's ⋮ menu, "Notes" under Repeats: Same / Up ↑ / Down ↓,
  only with ×2–×4): the hits play the pad's note each time (Same, the default and how every
  step played before), or step up or down the key's chord from the pad's own note, an arpeggio
  within the step (a ×4 on the root: 1-3-5-8). The chord is the Melody Maker's key and scale's
  1st, 3rd and 5th (`chordPitchClasses()` in `theory.ts`, as the arpeggio's "Chord" tones; no
  scale: major), passed to both engines as `repeatChord`; `ratchetPitches()` in `ratchet.ts`
  works out each hit's pitch (keeping the pad's fine tuning, inside the pads' range), for the
  live engine, the export engine, the MIDI file and the pad's preview. Saved per step as the
  synth lane's `repeatNotes` (projects saved before get Same; unknown values are Same,
  `clampRepeatNotes()`); a pattern, Reset Pads, Clear Repeats and File → New put them back to
  Same. The pad's badge shows ×3↑ or ×3↓; the phone's hold sheet has a button that goes
  Same → Up → Down.
- Unison (`unison.ts`, both engines; the Unison card: its tile, Voices, Detune, Spread):
  2–4 voices (3 at most on a small screen), spread from left (lowest) to right (highest) by
  Detune (default 12 cents, a notch on the knob) and Spread (pan; default 100 % since PR 52,
  was 50). Since PR 52 the voices also start at different points of their cycle, as far as
  ±0.12 cycles at full Spread and less with less (`unisonPhase()`, in steps of 0.02), so a
  hit is wide from its first moment: started in step, the voices drifted apart only as the
  detune built up, and a short hit's loud start was nearly mono whatever Spread was (side/mid
  of an exported hit's first 50 ms at 100 %: 0.35 before, 0.87 after, for 0.9 dB of level).
  Further measured worse: at 0.2 two voices nearly cancel summed to mono. A shifted voice's
  wave is the same shape moved in time: `waves.ts` rebuilds the oscillator's own shapes from
  the Web Audio spec's series (`waveSeries()`; a browser test checks they match Chrome's
  built-ins) and turns each harmonic (`shiftSeries()`), keeping up to 64 such waves per
  context; the live engine builds them when the setting changes (`prepareVoiceWave()`), not
  on the first note. Spread 0 plays exactly as before. One voice with unison on sounded the
  same as off and six measured narrower than three, so a project saved with 1 voice opens with
  unison off (and 3 voices for when it's turned on), with 5 or 6 as 4 (`applySnapshot()`).
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
- The LFO is one shared oscillator → `lfoGain` (its wave times Depth, in the target's units).
  Each note connects a tap from it to what it moves, and `releaseLfoTap()` disconnects it when
  the note ends. Anything else per-note that connects to a long-lived node needs the same
  cleanup. The oscillator also feeds a tiny `AnalyserNode` (`lfoProbe`, not connected onward),
  which `lfoNow()` reads: where the LFO is now, −1..1 (null while it isn't running).
  - **Targets** (PR 61; `src/audio/lfo.ts`, both engines; `LFO_DEPTH_MAX` per target): Pitch
    (cents on `detune`), Filter (Hz), Pulse (`pwm`, % width), **Level** (`amp`: the note,
    tone and noise, through a tremolo gain that swings between full and 100 − Depth %) and
    **FM** (`fm`: the FM card's Amount, the modulator's deviation that `startFM()` returns,
    ±Depth %; nothing while FM is off, so its button is dimmed and the LFO's tile reads
    "FM off", as Pulse's reads "No Pulse"). Pan was turned down (the maintainer's call).
  - **Retrigger** (PR 61; `synth.lfo.retrigger`, saved since long before but read by neither
    engine until then; the **RETRIG** pill in the LFO card's header, `PillSwitch.vue`, greyed
    out while the LFO is off; off by default): each note gets its own LFO, started with it
    (`startNoteLfo()`), so every hit gets the same movement, which is what makes an LFO
    useful on drums; off, each note hears whichever part of the free-running wave comes along.
    The note's LFO sets its rate and depth as plain values, not events at its start: Chrome
    applies an event for a start partway through a 128-sample block late, and the wave began
    at 440 Hz (each hit's LFO started somewhere else; a browser test measures the exported
    hits: under 3 % apart with Retrigger, over 30 % without). The LFO visualizer, with
    Retrigger, shows where the latest note's LFO is (`lfoWaveAt()`), not the shared one.
    `synth.lfo.bipolar` is saved but still unused.
  - **Each target remembers its depth** (PR 65): `lfoDepth` is the current target's (what the
    engines read), and `lfoDepths` (saved as `synth.lfo.depths`, one per target) keeps the
    others. Picking a target (`chooseLfoTarget()` in `DrumSequencer.vue`; `LFOGroup` only
    emits the target) stores the old one's depth and recalls the new one's; a target picked
    for the first time gets `LFO_DEFAULT_DEPTH` (Pitch 25 cents, Filter 1500 Hz, Pulse 15 %,
    Level 40 %, FM 40 %), so the LFO doesn't seem to switch off (until PR 65 every change set
    Depth to 0). The snapshot's `depths` always shows the knob's own depth for the current
    target; a project without them gets the defaults (`lfoDepthsFrom()` in `lfo.ts`, which
    clamps each to its range). Presets and File → New put them back to the defaults. One undo
    step puts the target and its depth back together.
  - **Rates locked to the bar** (PR 66): the Rate knob steps through `LFO_DIVISIONS` (`lfo.ts`):
    4 bars, 2 bars, 1 bar, 1/2 … 1/32, 1/64 (saved as `'4/1'`, `'2/1'`, `'1/1'`…; the knob
    reads "4 bars"…, `lfoDivisionLabel()`), always the division at the tempo
    (`divisionToHz()`, which reads `p/q` with a dot or T as a fraction of a bar,
    `divisionBars()`). The free rate in Hz and the LFO card's ⋯ menu (its only option) are
    gone; `synth.lfo.rate` and `sync` are still saved, but nothing reads them, and a project's
    division that the knob doesn't have is ignored. While playing, the shared LFO starts its
    cycle with bar 1 and again on each bar line where a cycle begins (`lfoAlignBars()`: every
    bar for a division of the bar, every 2 or 4 bars for the long rates, every 3 for a dotted
    1/8): `restartLfoAt()` in `liveEngine.ts`, from `schedule()` as it builds step 1, starts a
    new oscillator there and stops the old one, so the wave moves with the pattern and comes
    back into step after a tempo change. Before PR 66 it ran free from whenever it first
    started. The export's LFO starts with its first bar, as before. With RETRIG each note's own
    LFO is unchanged (a 4-bar rate barely moves within a hit).
  - The card (option C of three mockups, PR 61): the power tile, Rate, Depth and the Wave
    switch on one line, the Target switch's five buttons on a full-width line under them (its
    caption shown); five didn't fit beside the knobs.
- Audio export uses a **separate** offline engine (`scheduleStepSequencer.ts`), fed by the
  `exportState` computed. It renders only the synth lane. Changes to the live sound (new
  parameters, changed gain staging) must be mirrored there, or exports will sound different.
  (Until PR 34 it sent the noise layer through drive, delay and reverb, unfiltered; now it
  matches the live engine: 40 Hz–16 kHz, straight to the master.) See "Export audio".

### Pad settings (the ⋮ popover)
- `PadSettingsPopover.vue`, opened by a pad's ⋮ (`openPadSettings()` in `DrumSequencer.vue`):
  the pad's wave, noise, Repeats, note (a keyboard and octaves), Fine and Hz. The same ⋮ again
  closes it, another pad's moves it there (the popover ignores mouse-downs on a ⋮ and leaves
  that to `openPadSettings()`), and a click elsewhere or Esc closes it.
- It's placed beside its pad and kept inside the window by its real width
  (`clamp(320px, 48vw, 420px)`, the window less its scrollbar); under 720 px it's centred.
  Before PR 50 it assumed 380 px and ran off the right edge for the last pads.
- A click on a key or an octave sets the pad's note at once, playing or not, and previews it
  as the pad plays it (`auditionPad(index, hz)` → `auditionNote()`): its own wave, its noise
  switch (before PR 56 the preview always had noise) and its repeats (2–4 hits within a step
  at the tempo, Up or Down stepping through the chord). Only while stopped: while playing, the pattern plays it, and a preview on top
  clashed (PR 56). Not while the synth lane is muted. The phone's note picker does the same.
- Its Noise switch shows what's heard (PR 64): Off while the Noise card is off, whatever the
  pad's own mask says, with "Noise card is off" beside it. Turned on then, it turns the card on
  with only that pad's noise on (`padNoiseEnabled` in `DrumSequencer.vue`; the mask before
  couldn't be heard); one undo step. It emits only on a click, never from a watcher, so the
  card switching while it's open can't write the mask. The phone's hold sheet has no noise
  switch.
- Play / Stop (`data-keeps-pad-settings`) can be pressed without closing it, to hear the pad
  in the pattern; any other click outside closes it (PR 56).

### The Noise card's pad buttons
- Every 2, Every 4, **Accents**, Random, Invert, All (`NoiseModule.vue`) set which pads get
  noise (the noise mask). **Accents** (PR 69, replacing Backbeat, whose steps 5 and 13 often
  had no hit, so the button seemed to do nothing) puts noise on the pattern's loudest hits:
  the steps that are on within 10 % of the loudest one's velocity; when every hit is as loud
  (more than four), only those on a beat; with nothing on, the beats (`accentMask()` in
  `src/lib/noise/accents.ts`, unit-tested). `DrumSequencer` passes the pattern's steps and
  velocities to `NoiseModule` for it.

### Effect switches
- Two pedals have a mini toggle (`PedalSwitch.vue`, `role="switch"`, in the corner right of
  the TONE knob; greyed out while its pedal is off, like the knobs). Saved as
  `fx.drive.crush` and `fx.delay.pingPong` (default off; a project saved before them gets off,
  not the current value). Sound settings, so presets reset them (`resetSoundToFactoryDefaults`)
  and the Sounds dice turns them on sometimes (ping-pong in 40 % of rolls with the delay, crush
  in 30 % of rolls with the overdrive). Not MIDI-learnable (they're switches, not knobs).
- **CRUSH** (`src/audio/crusher.ts`): the overdrive's driven path goes shaper → TONE → bit
  crusher → makeup → MIX. It rounds to fewer bits (quiet tails fall to silence) and holds each
  sample (a lower sample rate: aliasing). DRIVE sets how hard: 8 bits at 12 kHz to 4 bits at
  3 kHz (`crushSettings()`). After TONE, not before it: a filter after the hard steps
  overshoots them (peaks 1.26 instead of 0.83 at full DRIVE and MIX). Sample-and-hold needs an
  AudioWorklet; its processor is built from `crushBlock()` (pure, unit-tested, so it must use
  no outside names) and loaded from a Blob URL (`loadCrusher()`, once per context), so the build
  has no extra file. Live, the crusher joins once loaded (a moment after the page opens) and the
  switch crossfades it in; the export's `render()` loads it before scheduling.
- **PING PONG** (`src/audio/pingPong.ts`): the sound, summed to mono, goes into a left delay;
  its echo plays left, then crosses to a right delay (one pass of the feedback and its tone
  filter), and back: left, right, left... Each echo is as loud and as dark as the plain
  delay's same echo. The switch moves the send between the two delays, so echoes already
  ringing in the other carry on. Browser tests check the echoes' sides live (per-channel
  probes, `__channelPeaksOver`) and in the export, and that the crusher quantizes live.

### LFO visualizer
- While the LFO moves something, its movement is drawn on the control it moves, in amber
  (`--lfo-mod`, darker in the light themes; the dark themes' knob arcs are blue to purple or
  pink, Sand's teal to orange),
  without turning that control, so it can still be turned while the LFO runs:
  - Filter: an amber dot on the Cutoff knob's ring at the cutoff the LFO has now, over a faint
    outer arc for its whole swing (`Knob.vue`'s `modValue` and `modRange`). The swing is the
    engine's own, shrunk to its safe band (`lfoFilterTapGain`).
  - Pulse: the Pulse tile's bar is drawn at the width the pulse plays at now, over a dashed
    ghost of the widest (`WaveButton.vue`). Only while something plays Pulse (`pulseInUse`).
    The Pulse Width mini knob doesn't get a dot (too small to read).
  - Pitch: on each lit step pad, an amber bar slides up (sharper) and down (flatter) along a
    faint track for the whole bend; an octave fills the track (`LfoBendMark.vue`).
  - FM (PR 62): a dot and an arc on the FM card's Amount knob, as on Cutoff (`FMModule`'s
    `lfoView`); only while FM is on (with it off, the LFO moves nothing).
  - Level (PR 62): a dot and an arc on the Step Sequencer's Vol knob, from full down to
    (100 − Depth) % of it. Not on the pads (the maintainer agreed): a lit pad's fill height is
    its velocity, so a level shown there would look like the velocities moving. The Vol knob
    is in DrumSequencer's own template, so it's an `LfoModKnob` (a `Knob` that reads the view
    itself; DrumSequencer must never read `lfoView`'s fields, see below). No meter on the LFO
    tile (the maintainer's call).
- The ranges (arc, ghost, track) show whenever the LFO is on with depth above 0 on that
  target; the moving parts only while something sounds (`soundingRecently()`: playing, or a
  note in the last 1.5 s, for MIDI). With `prefers-reduced-motion` only the ranges show.
- `src/composables/useLfoVisual.ts` reads `lfoNow()` every frame (requestAnimationFrame, so it
  stops in hidden tabs), or four times a second while nothing sounds; it doesn't run at all
  while the LFO is off or at depth 0. `src/lib/lfoVisual.ts` turns the position into what each
  indicator shows, with the engines' own limits (unit-tested against them).
- `DrumSequencer.vue` passes one reactive object, `lfoView` (type `LfoView`), down to
  `FilterModule`, `FMModule`, the Pulse tile's `WaveButton`, the Vol knob's `LfoModKnob` and
  `SynthStepGrid`. Only components that read
  its fields redraw every frame; `DrumSequencer` itself must never read them in its template,
  or its whole template would re-render 60 times a second.

### The screen's views
- PR 70: **F1 Scope, F2 Spectrum, F3 Spectrogram, F4 Tuner** (`Screen.vue`'s F-keys, 1–4 on the
  keyboard, `handleFKey()`); the Envelope view lost F4 and, like the filter view, shows only
  while its knobs are turned. Its canvases keep their order (`.nac-screen__lcd canvas`: scope,
  spectrogram, tuner, envelope, filter, then the spectrum, added last so the others' places
  stay).
- **Spectrum** (`src/components/spectrumView.ts`; pure helpers unit-tested): the output's live
  frequency curve on the filter view's log axis (20 Hz–20 kHz), filled column by column in each
  frequency's pad colour (`spectrumColour()`, as the spectrogram), an outline, a peak-hold line
  that falls about 14 dB a second (`holdPeaks()`), the strongest note marked with a dashed line
  and named top right with its cents and Hz ("A3 −4¢ · 219 Hz"; `strongestNoteHz()`, refined
  between the analyser's ~23 Hz bins by a parabola; only between 50 Hz and 4 kHz and loud
  enough, held 0.6 s; sharps or flats as the key, `noteOf()`), and every C ticked along the
  bottom. The bottom three bins are skipped (the drive's DC offset).
- **Envelope view** (`startEnvViz()` in `DrumSequencer.vue`): the amp envelope, and the pitch
  sweep (the Pitch card: how far from the note it starts, as a share of Amount, falling with
  time constant Decay / 4 as the engines' `setTargetAtTime`) in the screen's second colour
  (`--nac-spec-high`). Attack/Decay show it with the amp envelope first (the sweep dashed,
  "┄ pitch sweep"); the Pitch card's Amount and Decay (`PitchEnvModule`'s `knob-start` /
  `knob-end`, `onPitchKnobStart()`) with the sweep first and its numbers in the title
  ("Pitch sweep +24 st → note in 300 ms"). The "1 ms" axis label steps aside for Attack's own.

### Pad and spectrogram colours
- A lit pad's colour shows its note: blue for the lowest pad pitch (100 Hz) to red for the
  highest (2 kHz), linear in Hz (`padHue()` in `src/lib/padColour.ts`); its fill height shows
  its velocity. The screen's spectrogram (F3) draws each frequency in that same colour,
  brighter when louder (`spectrumColour()`; darker when louder on a light theme's pale
  screen), so a note shows in its pad's colour; above the pads' range, harmonics go on from
  red toward magenta. Since PR 41 (the maintainer's call: the spectrogram in the pads'
  colours, not the reverse). Before, the spectrogram coloured loudness in four colours per
  theme (`--nac-spec-low/mid/high/peak` in `Screen.vue`, still defined); `SPEC_COLOURS` in
  `startSpectrogram()` (`DrumSequencer.vue`) switches back to them in one line. A unit test
  checks the colours; a browser test checks a played A3 is drawn in its pad's blue.

### MIDI
- `src/composables/useMidiInput.ts` handles Web MIDI (`navigator.requestMIDIAccess`): access,
  the input list, the chosen input, note-on and control change parsing (`parseNoteOn`,
  `parseControlChange`) and waking the audio engine. It doesn't know about the synth:
  `DrumSequencer.vue` calls `useMidiInput({ audioCtx, noteToPlay, onControlChange })`, and
  `noteToPlay(note, velocity)` returns what to play, or `null` to ignore the note (a muted
  synth lane), before audio is woken. Control changes go to MIDI learn (below).
- Opt-in through an "Enable MIDI" button. `MidiToolbar.vue` (button, then the input list) is
  teleported into `#midi-toolbar-slot` in `App.vue`, or shown in the transport row if there
  is no slot. At 768 px wide or less, `App.vue` hides its toolbar, MIDI controls included.
- Only note-on and control change (CC) messages are handled. Each note-on plays
  `playSynthNote()` with the global waveform and current synth settings, scaled by velocity
  and the synth channel volume. Note-off, pitch bend and MIDI clock are ignored, and so are
  CC 120–127 (channel mode messages such as All Notes Off).
- The AudioContext starts suspended. Clicking "Enable MIDI" resumes it, and a note that arrives
  while it's suspended resumes it and then plays (or is dropped if resuming takes more than
  250 ms, so it's never played late). MIDI notes also start the LFO, as Play does.

### MIDI learn
- A controller's knobs turn the app's knobs. Learn (in the MIDI toolbar, once an input is
  chosen) starts learn mode: the 32 learnable knobs get a dashed outline and a badge ("CC 21",
  or "CC 7 ch 3" off channel 1) for the controller knob they follow, and a bar at the bottom of
  the screen says what to do (with Clear all and Done; a spacer under the page lets the last
  knobs scroll clear of it). Click a knob (or Enter on it) to arm it, then turn a controller
  knob: they're linked, and the app's knob jumps to where the controller's is. Delete or
  Backspace on a knob unlinks it; Done or Escape ends learn mode.
- One controller knob drives one knob, and a knob follows one controller knob: a new link
  replaces the old (`assign()` in `src/lib/midiLearn.ts`).
- A controller knob turns its knob as a drag does: `Knob.vue`'s `setPosition()` maps 0–127 to
  the knob's turn (its own taper, step and notches), and emits `knobStart`, then `knobEnd` once the
  controller knob has rested 600 ms, so the tooltip and the screen's envelope or filter view
  work as with the mouse. Undo, saving and the engines need nothing new: a sweep is one undo
  step. It jumps (no pickup). A greyed-out knob (its module off) ignores it, as it ignores the
  mouse; it can still be linked, and the bar says it follows once its module is on.
- The links belong to the controller, not to a song: they're kept in this browser
  (`localStorage` `midi-map`, `{ "1:21": "filter.cutoff" }`, channel 1–16 : controller), not
  in projects, and File → New doesn't clear them.
- Learnable knobs: each `<Knob midi-id="...">` whose id is in `MIDI_KNOBS` (with the name the
  bar uses). The ids are saved, so never rename one. The pop-up knobs (a pad's Fine) aren't
  learnable: they'd only follow while open. A unit test checks every id is
  on exactly one knob.

### Melody Maker
- `MelodyMaker.vue`, with its music theory in `src/lib/melody/theory.ts` (unit-tested).
- Clicking a key on its keyboard moves the whole pattern to that key, every pad (on or off)
  by the same interval, the shorter way round (`shortestInterval()`: C → D up 2, C → A down 3,
  a tritone up), so it's the same melody in the same register (`transposePitches()`). If that
  would take a pad outside the pads' 100–2000 Hz, the whole pattern goes the other way round
  when that fits, else that pad moves an octave. Then the key plays: its root in the octave
  nearest the pattern (`nearestRootHz()` of `patternCenterHz()`), with the synth lane's sound,
  not while the lane is muted (`auditionNote()` in `DrumSequencer.vue`; the click lets audio
  start). People click the keyboard expecting a sound. While playing, the key waits for the
  next bar instead (see "Changes at the bar"), and doesn't play (it would clash with the old
  key still playing); the key it's in already plays at once.
- Picking a scale moves each pad to the same degree of the new scale when both have as many
  notes (minor → major: the 3rd, 6th and 7th go up a semitone), otherwise to the nearest note
  of the new scale, the lower when two are as near (`remapScale()`). From "None", every pad
  goes to the nearest scale note; to "None", nothing moves. Pads keep their fine tuning (their
  cents off the nearest note) through both.
- Only a person's choice moves pads: the component emits `key-chosen` and `scale-chosen` from
  the click and the select; `key-root-change` and `key-scale-change` (from watchers, also when
  a project loads, on undo and File → New) only record the setting (`onKeyRootChange()`).
  A project or an undo step brings its own pads and key together (`synth.tuning`). A key click
  is one undo step, pads and key together. (Before PR 39, a key change moved only the pads that
  were off and still on the old default note.)
- One Generate button: a Melody / Arpeggio switch (`mode`, saved as `random` or `arp`; the
  Melody button read "Random" until PR 57, which clashed with the arpeggio's Random order).
  Melody keeps its old behaviour (random notes from the scale and range on the pads that are
  on, with "Active Pads Only", the first one gets the key; with no scale, the key's note in the
  range's octaves, which the note under the switch says). The arpeggio's Pattern, Rate, Octaves
  and Tones show only for Arpeggio. Melody's note and the arpeggio's settings sit in one grid
  cell, the other hidden (`visibility`), so the card is as tall in both modes and the module
  columns around it never move.
- The arpeggio (PR 57; `bakeArp()` builds the notes, `src/lib/melody/arp.ts` lays them out,
  unit-tested): **Rate places the notes**, as a hardware arpeggiator plays them: a note on
  every step at 1/16, every other step at 1/8 (`arpSlots()`), and the steps
  between go off (it emits `update:steps` with the pitches, one undo step). Before, Rate only
  grouped the pads that were on (1/4: four pads in a row one note), and every pad still played.
  "Active Pads Only" is Melody's: an arpeggio sets its own rhythm. **Fitted to the bar** by
  default: the cycle becomes a block of 2, 4, 8 or 16 notes, which divides the bar, carrying on
  into the next octave when rising (a triad 1-3-5 → 1-3-5-8, a 7-note scale up to the octave),
  the octave below when falling, round again otherwise (`arpSequence()`; notes kept in the pads'
  range by octaves). Before, a triad's 3-note cycle ended mid-bar and jumped at the bar line.
  **1/4 was dropped** (PR 71: four notes a bar sounded like a slow bassline, not an arpeggio);
  a project saved with it gets 1/8 (`arpRateFrom()`). A 1/32 made from Repeats was turned
  down: a pad's repeats only stay or climb the key's chord, so it would be right only for Up
  or Down on chord tones, and each repeat is cut short where the next begins.
  The Pattern list's Random (the chord's notes shuffled once) stays.
- **Options on the card, no ⋯ menu** (PR 68; the menu was "Advanced Options", in the card's
  header): each mode's panel ends with its toggle (a cap with an LED, `.mm-toggle`), in the
  space that was empty at the card's bottom, so the card is as tall as before and the same in
  both modes. Melody: **Active Pads Only** (`applyScope`; on by default: Generate fills the
  pads that are on, off: every pad). Arpeggio: **Skip** (every other tone of the ladder,
  1-5-3-7). Both saved now (`melody.activeOnly`, `melody.arpSkip`; older projects get on and
  off). Tones has a third choice, **7th** (`'seventh'`: the 7th chord, 1-3-5-7; "7th chord"
  wrapped in the narrow box), which replaced the menu's "7th on downbeats" (the 7th on every
  beat sounded repetitive). Dropped: Free cycle (the cycle is always fitted to the bar),
  Occasional octave hops (random, so chaotic) and the menu's Reset.

### Changes at the bar
- PR 55, changed in PR 56. While playing, a key clicked in the Melody Maker waits for the next
  bar's step 1, as a hardware sequencer queues a change, so the bar that's playing finishes as
  it was. Stopped, it happens at once, as before. Shift+click: at once while playing too.
  Patterns (a Pattern preset, its dice, the phone's stepper) waited too in PR 55; since PR 56
  they change at once, playing or not (the maintainer's call).
- The `BAR QUEUE` section of `DrumSequencer.vue`: `atNextBar(kind, id, run, now)` keeps one
  waiting change per kind (only `key` now; a new one replaces it), and `runQueued()` applies
  it. The live engine calls it through `onBarStart` just before it builds a bar's step 1
  (`schedule()`, about 100 ms before it sounds), so the bar starts with the new pitches. Each
  change is one undo step.
- While it waits, the key shows a ghost of the chosen key's colour, pulsing (`.is-queued::after`
  in `MelodyMaker.vue`; steady with `prefers-reduced-motion`), and the "Key" caption says
  "· D at the next bar (Shift+click: now)" (`.mm-queued-note`), which is also how anyone finds
  Shift+click. In PR 55 it was an outline ring, which never showed: the keyboard's
  `.mm-kb :where(button) { outline: none }` hid it, so the key seemed not to respond. The key
  lights (`aria-checked`) once the pads have moved: `MelodyMaker` follows `melodyUi.keyRoot`
  instead of lighting the key it emitted.
- Stop applies what's waiting (`onPlayClick`). Undo, redo, opening a project and File → New
  throw it away (`cancelQueued()`). Clicking the key the pattern is in drops a waiting key.
- Not waiting for the bar: a scale picked, Generate, Pattern Tools, patterns, sounds.
- A browser test plays bars and checks the key changes just before the next bar's step 1 (not
  during the bar, no audition note), its ghost and caption, Shift+click, Undo and Stop, and
  that a pattern changes at once while playing.

### Install as an app (PWA)
- In Chrome and Edge, the address bar's install button or File → Install app… (shown while
  the browser offers it: `beforeinstallprompt`) installs the app: its own window and icon,
  starting from its saved copy, offline too. It is the same site underneath: it shares saved
  projects, MIDI links and theme with the `/studio2/` tab, and MIDI and audio work the same
  (installing doesn't make MIDI faster). Android installs it full screen; an iPhone can add
  it to the home screen, but has no Web MIDI.
- `public/manifest.json`: name "Ephemeral Wave Synth 2" (the page title), short name
  "Ephemeral Wave", `start_url` and `scope` `./` (so `/studio2/`), standalone, `#050713` (the
  page's `theme-color`). Paths in it are relative to it, never starting with `/`.
- The service worker (`build-plugins/serviceWorkerSource.js`; `build-plugins/serviceWorker.js`
  writes it into the build as `sw.js`, with every built file and its SHA-256 in front):
  - Its scope is `/studio2/` only; the main site and `/studio/` are never touched. It
    ignores other sites' requests (Google Analytics).
  - Install saves every built file in Cache Storage (`ewave-studio2-app-<version>`; the
    version is a hash of the file list and the worker's code, so any change makes a new one).
    A file the previous version saved, unchanged, is copied instead of downloaded, so an update
    downloads only what changed. Every file must match its checksum, or the install fails and
    the browser tries again later. Not saved: source maps, dot files, and the two unused GIFs
    (`SKIP`; 1.8 MB).
  - It serves the app's files from the cache, falling back to the network; opening the app
    gets the cached `index.html`. On the very first visit it takes the page over at once
    (`clients.claim()`), so it works offline from then on.
  - A new version waits (no `skipWaiting()` on its own) until the page asks.
- `src/composables/usePwa.ts` (the page's side, created once from `App.vue`): registers
  `sw.js` after the page has loaded, in builds only (never under `npm run dev`); `updateReady`
  shows `PwaNotice.vue` in the bottom-right corner ("A new version of the app is ready." Later
  / Reload): Reload sends `skip-waiting` and reloads once the new version has taken over
  (with the unsaved-changes prompt as usual); Later leaves it for the next time the app is
  opened. The first install shows nothing. An open app checks for a new version every hour.
  `keepProjects()` asks for persistent storage (`navigator.storage.persist()`), so the browser
  doesn't clear saved projects when the disk runs low: when the installed app opens, and after
  the first Save of a visit (Chrome decides without asking; Firefox asks once). It's still
  no backup: File → Export file is.
- No dependency: `vite-plugin-pwa` (→ `workbox-build` → `glob` → `minimatch` 10) would bring
  the advisory that keeps ESLint out (see "No linter yet").
- Analytics: `pwa_install` (with `outcome`, from File → Install app…) and `pwa_launch` (the
  installed app opened).

### Phone mode
- Picked from mockups (PR 45, option B of three). On a touch phone held sideways
  (`usePhoneMode.ts`: `pointer: coarse` and a short side of 500 px or less, so tablets keep the
  normal layout), `DrumSequencer.vue` hides its layout (`v-show`, so the screen's canvases and
  the desktop panels stay mounted) and shows `PhoneLayout.vue`, fixed over the whole page: one
  screen, no scrolling.
  - **Pads** page (the tab was "Play" until PR 48, which read like a play button): the 16 pads in two rows of 8 (a tap turns a step on or off; a finger drawn
    across pads paints them all the way the first one went, on or off, as a drag does on the
    desktop: the pad a touch began on lets go of its pointer capture, and the pads' container
    finds the pad under the finger; a hold, 400 ms, opens its note: 16 notes of the Melody
    Maker's key and scale around the pad's own, every semitone with no scale, within
    100–2000 Hz, plus Off, velocity and repeats; picking a note turns the step on and plays
    it; the playing step has a thick outline, a glowing bar along its top and a brighter
    colour); beside them the Sound and Pattern steppers (◂ name ▸ steps through the six, the
    caption small above the name, a tap on the name lists them, a dice beside each; the name
    reads Random after a roll; Clear beside Pattern: every step off, one undo step), the tempo
    (− / +) and Octave (↓ / ↑: every pad, as Pattern Tools' arrows), and four knobs (small, so
    they fit under the rest on a 320 px tall screen):
    **Decay** (`ampEnvDecayMs`, 50–2000 ms, log), **Tone** (`filterCutoff`, 100 Hz–10 kHz, log;
    turns the filter on), **Sweep** (the pitch envelope's amount, −48…+48, as the Pitch card's
    knob) and **Space** (`reverbMix`, turning the reverb on above 0 and off at 0, and the delay's
    mix at 0.6 times it while the delay is on). The top bar: a tiny oscilloscope of the output
    (on every page; the analyser's waveform from a rising zero crossing, in each theme's screen
    colours), the tabs as one segmented bar (Pads, Sound, FX, Key; the chosen one filled and
    outlined in the accent; a horizontal swipe of 70 px moves between them too, not from a
    knob, slider or the pads), **Play / Stop** (on every page, PR 48), Undo and ☰. It fits on
    one line from 568 px (the first iPhone SE) up (Play's word hidden under 600 px).
  - **Sound**, **FX** and **Key** pages are the desktop's own panels again (slots in
    DrumSequencer's `PHONE` section: Envelope, Pitch and Filter cards, the eight waves, Noise,
    FM and Unison as a switch and one knob each; the three pedals; the Melody Maker), so they
    write the same settings. Their knobs don't take MIDI learn's links: `PhoneLayout` provides
    `noMidiLearn`, which `Knob.vue` checks (a second registration would steal the desktop
    knob's link). MIDI isn't offered in phone mode.
  - ☰ opens a menu with the File bar itself (`ProjectControls`, moved there by a `Teleport`
    whose `to` changes with the mode, since a Teleport looks its target up again only when `to`
    changes), the theme buttons, **Reset…** and **Desktop View**. Reset asks first, then
    offers **Reset pads** (the Step Sequencer's Reset Pads: every pad off, full velocity, on A,
    one hit, sine) or **Pads and sound** (also `resetSoundToFactoryDefaults()`); one undo
    step, so Undo brings it back. Two taps in a menu, so it isn't hit by accident.
  - File → Export audio… in phone mode is shorter (`ExportDialog`'s `simple`): Bars and
    Ending only, and it exports one normalized mix; stems, MIDI, the one-shot and Normalize
    stay in the desktop view, whose remembered choices it doesn't change (only bars and
    ending).
- Desktop View is remembered on that phone (`localStorage` `phone-layout` = `full`). A
  "Phone view" button in the bottom-right corner (a pill in the accent, with a phone icon,
  above everything: z-index 2500, over the pad numbers' 1000) (`App.vue`, on a phone only, while it shows
  the desktop view) brings phone mode back, and so does File → Phone view (PR 46: the
  maintainer didn't find the File item alone).
- ☰'s menu is a panel from the left as tall as the screen, so the File menu opens in it
  without scrolling (tighter rows there; Open's list of projects beside the panel). The top
  bar's **Clear** (Play page) turns every step off: a new pattern in one tap, one undo step.
- A phone held upright shows "Turn your phone" (`App.vue`), with "Use the desktop view
  instead". The app is hidden under it (`v-show`) and the page can't scroll (`html.phone-mode`
  in `_general.scss`, as in phone mode), and it sits above everything (the desktop's pad
  numbers are at z-index 1000) and is `100lvh` tall, so nothing shows through and no gap opens
  at the bottom while a phone's address bar slides away (PR 47).
  A page can't turn itself; Android's installed app could (the manifest's `orientation`, not
  set yet: it would turn tablets too).
- `App.vue` hides its toolbar (themes, MIDI) and the return link in phone mode.
- Browser tests run on an emulated iPhone (844 × 390, touch) in landscape and portrait: the
  layout, tap and hold, steppers, the knobs, swipes, the menu and its File menu, Full layout
  and back, the upright hint.

### Keyboard shortcuts
- Space: play/stop (`onGlobalKeydown` in `DrumSequencer.vue`, ignored while typing). It does
  this everywhere, even on a focused button, knob or pad, on purpose: that's how music apps
  work. Enter presses a focused button.
- 1–4: screen view (Oscilloscope, Spectrum, Spectrogram, Tuner), same handler; ignored while
  typing or while a dropdown list is open. While Attack/Decay, the Pitch card's Amount/Decay
  or Cutoff/Resonance is turned, the screen shows the envelope view or the filter view (neither
  has an F-key), then goes back (`holdScreen`/`onScreenKnobEnd` in `DrumSequencer.vue`); a view
  picked meanwhile stays.
- Under 1200 px, the Sound / Effects / Compose tabs are one Tab stop: Left/Right (Home/End)
  move between them (`onTabKeydown` in `DrumSequencer.vue`).
- Shift+click on a Melody Maker key: at once, without waiting for the bar while playing (see
  "Changes at the bar"; the caption says so while a key waits).
- Ctrl/Cmd+S: save; Ctrl/Cmd+Shift+S: Save as… (`ProjectControls.vue`). Escape closes menus and popovers, and ends MIDI
  learn mode (where Enter arms the focused knob and Delete unlinks it).
- Ctrl/Cmd+Z: undo; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y: redo (same handler as Space). Ignored in
  a text box, which keeps its own undo (the project name).
- Knobs (`Knob.vue`, `role="slider"`): Tab to one, then arrows (Up/Right turn it up) move one
  step, or about 1% of the range on a knob with more than 300 steps; Shift+arrow and Page
  Up/Down about 10%; Home/End minimum/maximum. The first key emits `knobStart`, as a drag
  does (value tooltip, envelope or filter view), and leaving the knob emits `knobEnd`.
- Step pads (`SynthStepGrid.vue`): one Tab stop for the grid (only the last used pad has
  `tabindex="0"`). Left/Right move between pads, Home/End to the first/last, Enter turns
  the focused pad on or off (with the Repeats brush, gives it the brush's hits; Esc puts the
  brush down). Each pad is a toggle button named "Step 3", plus its note when on.
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
  New and Open can't be undone. File → Save as… doesn't: it's the same work under a new name.
- While an undo/redo is applied (two ticks), changes that follow by themselves (a panel
  reacting to its props, or the synced delay time following the tempo) are folded into that
  entry, so they don't count as a new change that throws away the redo side. A browser test
  covers this.
- Undo changes the project like any edit, so the unsaved dot shows; it doesn't stop playback.

### Delay time
- The Delay panel's TIME knob picks a note division (`fx.delay.division`, default dotted 1/8,
  `'1/8.'`); the time is saved as `fx.delay.time` in seconds. With sync on (`fx.delay.sync`;
  its switch is in the commented-out Advanced menu, so only a project can turn it off), the time is the division at the
  tempo: 0.375 s at 120 BPM, the starting tempo. `src/lib/delaySync.ts` works it out (`syncedDelaySeconds`), and
  `followDelaySync()` in `DrumSequencer.vue` keeps the time in step whenever the tempo,
  division or sync changes (synchronously, so every snapshot already has the matching time).
- `applySnapshot()` recomputes the time from the division when sync is on, so a time set from
  outside (a project, a preset, a share link) can't disagree with the knob. A project saved
  before the division was saved gets the division whose time matches its saved time (within
  1%), else the default. With sync off the saved time is kept.
- `DelayEffect.vue` only shows the division and time; turning its knob emits both. It never
  sets the time or tone by itself, so loading a project doesn't change them.

### Sounds and Patterns
- Two boxes side by side in the transport card (`PresetButtons.vue`, used twice), each six
  buttons three across with a dice in its top-right corner: **Sound presets** (Kick, Snare,
  Metal / Pluck, Acid, Bell; the presets below) and **Pattern presets** (Tresillo, Halftime,
  Gallop / Rolls, Bassline, Breaks). Their captions were "Sounds" and "Patterns" until PR 51,
  which didn't say they were presets. From 1200 px they sit between Swing and Play without making the card
  taller; narrower, they share a row of their own under the knobs; on phones one is under the
  other. Sounds were called Presets until PR 41; the code still calls them presets.
- A pattern sets the synth lane's pattern only: which steps are on, their velocities, pitches
  and repeats (ratchets). Never the sound, the pads' waves, which steps get noise, the key,
  tempo, swing, volume or Melody Maker. Its notes are semitones from the key's root in the
  pads' octave (`currentDefaultHz`: A3 by default), folded by octaves into the pads' 100–2000
  Hz (`applyPattern()` in `src/lib/patterns/patterns.ts`); off steps get the root, full
  velocity and one hit. The built-in ones (`library.ts`, names and notes a first try, to be
  changed once heard; **Tresillo**, 3-3-2 twice, replaced Pulse in PR 51: Pulse's hit on every
  beat was Pattern Tools' Every 4 again; **Halftime** and **Breaks** replaced Offbeat, which had
  no downbeat and seemed to float, and Broken, which had no clear groove, in PR 69: the root as
  the kick and the octave up as the snare, on beat 3 for Halftime, on 2 and 4 for Breaks, with
  ghost notes; the labels are 8 characters at most, so "Half-time" and "Breakbeat" became
  these) use only the root, its fifth and octaves (0, 7, 12, −5), which are in
  every scale the Melody Maker offers. A pattern changes at once, also while playing (it
  waited for the bar in PR 55 only). A click is one undo step, and the button of the
  pattern the lane matches is lit, the same way as a sound's (`patternKey()`). File → New
  still starts with no steps on (the maintainer's call, for now).
- The Patterns dice rolls a random pattern (`randomPattern()` in `src/lib/patterns/random.ts`),
  built like a beat (PR 51; before, each hit was placed on its own, which gave clumps and long
  gaps): a one- or two-beat idea (`CELLS_4`, `CELLS_8`: off-beats, 3-3-2, syncopations; or
  two one-beat ideas side by side), repeated across the bar with its notes and accents; now
  and then (15 %) a whole-bar idea instead, 5 or 7 hits spread as evenly as possible
  (`euclid()`), started on one of its hits. About half the rolls change the last beat into a
  fill (`FILLS`), which may end an octave or a fifth up and may have a roll (2–4 repeats) off
  the beat; rolls come only there. Step 1 always plays, as the root; the idea's other hits are
  mostly the root, some octaves and fifths; beats accented, the rest softer. Never more than
  four empty steps in a row, round the end of the bar too (`longestGap()`, `MAX_GAP`). One undo
  step, nothing lit. Unit tests check 500 seeded rolls (the idea repeats, the gaps, the fills,
  variety); a browser test checks the patterns, the dice and undo.
- Analytics: `pattern_select` with the pattern's id; `pattern_random` for a roll of the dice.

### Presets (the Sounds box)
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
- The dice in the Sounds box's top-right corner (`Random sound`, like the wave tiles' dice
  badges) rolls a new sound: `randomPreset()` in `src/lib/presets/random.ts` builds a preset
  from random settings, applied like any other (from the factory sound up, one undo step, the
  pattern untouched, one wave on every pad). Nothing lights up after a roll. It's a recipe,
  not every knob at random (that mostly gives noise or silence): always a short amp envelope
  and a filter; some of the time a pitch sweep, a filter envelope, noise, FM, unison, the LFO,
  velocity routing (at the VEL switches' amount) and each effect. Its limits keep rolls usable: resonance up to 10, drive
  mix up to 0.35, an opening filter envelope starts at 150 Hz or above and opens within
  the note (one roll without that limit was nearly silent), and a pitch sweep that starts above
  Cutoff (from A3) falls back within 30 % of Decay (PR 54: a slow 33-semitone drop onto a
  435 Hz cutoff peaked at 0.04). Values sit on the knobs' steps.
  Unit tests check 500 seeded rolls (ranges, steps, variety); a browser test exports eight
  seeded rolls (the dice's `Math.random` seeded per click, so every run rolls the same sounds,
  the quietest and loudest of 800 among them) and checks none is silent or clipping. 200 rolls of pads 1, 5, 9, 13 peaked between 0.10 and
  0.65 (median 0.26, the same as the factory sound).
- Analytics: `preset_select` with the preset's id; `preset_random` for a roll of the dice.

### Export audio
- File → **Export audio…** opens `ExportDialog.vue`; `buildExportFiles()` in
  `src/audio/export/exportFiles.ts` makes the files and `runExport()` in `DrumSequencer.vue`
  downloads them: one file as itself, several as one `.zip` (`src/lib/export/zip.ts`, stored,
  not compressed: WAV audio hardly compresses, and it needs no library). The dialog starts from
  the last export's choices (in memory, not saved), also after opening another project; File →
  New puts back the defaults (1 bar, Loop, the mix only, Normalize on), as it does everything
  else (`resetUiToFactoryDefaults()`). The one-shot's note starts on the key's root each time.
- **Bars** 1, 2, 4 or 8 (the pattern played that many times, `bars` in the engine's state).
  **Loop** (the default): exactly N bars, to the sample (`barFrames()`), with whatever rings
  past the end (reverb, echoes, a long decay) added onto the start (`foldLoop()`, wrapping as
  often as needed), so it repeats in a DAW as it loops in the app; only its very first play
  from silence has a faint tail of a bar that never played. **With tail**: a clean start, and
  the sound rings out after the bars until it fades below −80 dBFS (`trimTail()`, 5 s at most).
- **Files**: the **mix**; **effects stems** (dry, delay, reverb, noise; the engine renders one
  `part` at a time, each through its own gate to the master, so they add up to the mix: a
  browser test sums them sample for sample. A stem that's silent, its effect off, is left out;
  dry is always there. With the tail, every file ends where the last of them fades, so they
  line up); a **MIDI file** (`src/lib/export/midi.ts`: type 0, 480 ticks a quarter, tempo and
  4/4, each step's nearest note and velocity, swing and ratchets timed as the audio, a note
  lasting until the next hit less a tick; fine tuning in cents is lost); a **one-shot**: one
  full-velocity hit of the sound on the main wave at a chosen note, effects included, trimmed
  where it fades (6 s at most), for a sampler or drum rack. Its note defaults to the key's root
  in the pads' octave (A3 unless the key or Octave changed), picked from the pads' range.
- The mix and stems are rendered with the same seed (`seededRandom()`, `src/lib/random.ts`),
  which the engine uses for its noise buffers and the pitch envelope's random mode
  (`state.random`), so every stem has the same noise and sweeps as the mix (unseeded, the
  stems missed the mix by more than 1). The reverb's impulse response has its own fixed seed.
- **Normalize** (on by default): the mix and stems get one gain, so the loudest sample of any
  of them is −1 dBFS and the stems still add up; the one-shot is normalized on its own.
- **Names** (`src/lib/export/names.ts`): `Project_120bpm_Amin_4bars_mix.wav` (the key only
  when the Melody Maker has a scale; `4bars-tail` with the tail), `..._dry.wav` and so on,
  `Project_120bpm_Amin_4bars.mid`, `Project_120bpm_Amin_4bars.zip`, `Project_oneshot_A3.wav`.
  The note names are the app's (A3 = 220 Hz, which Ableton and Logic call A2).
- **The LFO and loops** (PR 66): a loop repeats smoothly only if it holds whole LFO cycles.
  While the LFO moves something without RETRIG, `DrumSequencer` passes `lfoBars`
  (`lfoAlignBars()` of its division) to the dialog: a loop shorter than that, or not a
  multiple of it, gets a note ("The LFO's cycle takes 4 bars, so a 1-bar loop won't repeat
  smoothly.") and a **Use 4 bars** button; and on opening, a remembered loop length that
  doesn't fit is raised to the shortest one that does (none fits a dotted 1/8's 3 bars: the
  note suggests With tail or RETRIG).
- Files are 32-bit float WAV at the AudioContext's sample rate, as before.
- Analytics: `export_audio_click` (the menu item) and `export_audio` (the choices).
- Browser tests drive the dialog with `exportAudio(page, choices)`; `exportWav(page)` asks for
  what the old Export WAV item made (1 bar with its tail, the mix only, not normalized), so the
  sound tests keep measuring real levels.

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
- The starting tempo (a fresh page, File → New) is 120 BPM, most DAWs' default, so an export
  drops into a new DAW project at its tempo: `DEFAULT_TEMPO` in `src/lib/delaySync.ts`, which
  the `tempo` ref, `resetToFactoryDefaults()` and the default delay time use. It was 80 until
  PR 40; browser tests whose timings were worked out at 80 set it first (`setTempo(page, 80)`).
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
- **File → Save as…** (PR 60; Ctrl/Cmd+Shift+S; `SAVE AS` section of `ProjectControls.vue`,
  `saveAs()` in the project store): asks for a name (suggesting "Name copy"), saves the
  settings as they are now, unsaved changes included, as a new project, and makes it the open
  one; the project open before stays as it was last saved. Renaming (the name box) stays a
  rename: a typo fixed shouldn't leave copies. The plan's "maybe ask, on Save after a rename,
  rename or save as new" wasn't built: a question on every such Save would interrupt, and
  Save as… is there. A name another saved project has asks "already exists. Replace it?" and
  saves over that one (its id); the project's own name is a plain Save. It's the same work
  under a new name, so the undo history carries on (the store's `continuedId` /
  `isContinued`, which `useUndoHistory` and the bar queue check; opening or creating a
  project clears it), and a key waiting for the bar still comes. File → New with Shift held
  (an older, hidden way to copy) still makes an unnamed copy.
- A saved project that fails the project check (damaged, or unreadable by this version) is
  never opened: `loadProject()` throws a `BrokenProjectError` (with the project's name). At
  startup, `useProjectSync.ts` then starts a new project and says so in an alert; from
  File → Open, `ProjectControls` says so and keeps the current project. The broken record is
  left in IndexedDB untouched (it still shows in the Open list).
- While the dot shows unsaved changes, `ProjectControls` asks before the page is closed or
  reloaded (`beforeunload`). A project made with File → New counts as unsaved until it's saved.
- `localStorage` keys (all prefixed): `lastProjectId` (reopened on load), `reset-ui-next`
  (one-shot flag that ProjectControls sets to reset the UI on New Project), `seqOpen`, `ui-theme`,
  `midi-map` (MIDI learn's links, see "MIDI learn").
- `instruments[]` still contains the hidden kick, snare and hihat lanes (normally with no
  steps on). Keep them so saved projects stay compatible.
- Melody Maker settings (key, scale, range, what Generate makes (`mode`: `random` or `arp`;
  older projects keep the current one), arp pattern, rate, octaves, tones and Skip, and
  Melody's Active Pads Only) live in
  `melodyUi`. `MelodyMaker.vue` reports each change with an event, and follows `melodyUi`
  through its `initial-*` props when a project loads. Since PR 68 that includes its two toggles
  (`arpSkip`, `activeOnly`), which were the ⋯ menu's and weren't saved.
- The JSON import/export format is `{ version, projectId, meta, data }`, validated by
  `validateAndMigrate()`, which also checks every project loaded from IndexedDB. It only
  checks the types of `data.meta.name`, `data.selectedWaveform` and each lane's fields
  (`LANE_FIELDS`, including the synth lane's `ratchets`, a list of numbers, and `repeatNotes`, a
  list of strings); other sections are free-form, and unknown fields are kept, so a new
  parameter needs no change there. A file that fails the check is refused as a whole
  ("Import failed"), and the console says which field was wrong.
- If you add a parameter: add its ref to `projectState` in `DrumSequencer.vue` (and the
  `ProjectState` type), to `buildSnapshot`, `applySnapshot` and the factory defaults in
  `snapshot.ts` (a sound setting in `resetSoundToFactoryDefaults`, see "Presets (the Sounds box)"; the default
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
- Styling: Bootstrap 5 + custom SCSS in `src/assets/styles/`. There are six themes, selected
  by a `theme-*` class on `<html>` (`useTheme.ts`, `THEMES`): **Synthwave** (the default),
  **Dark**, **Analog** and **Slate**, and two light ones, **Sand** and **Light**. Five have a
  button (Dark, Synthwave, Sand, Analog, Slate); the maintainer may cut some once they've used
  them (PR 44). Keep the current look and feel unless a change is requested.
  - **Sand** (PR 43, replacing Light as the third button: the maintainer found its white harsh
    on the eyes): matte warm greys instead of white, dark knob caps as on a hardware panel, a
    teal-to-orange knob arc, an orange accent, a green-grey reflective LCD with dark ink in a
    dark bezel, softer pad colours (still one per note), a taupe page and an apricot wash.
    Its tiles (the waves, FM, Unison, the LFO's switch) are dark caps with light lettering
    (PR 44: their pastel icons, made for dark tiles, vanished on light ones), and since PR 63
    so are all its buttons (see "Buttons").
  - **Analog** (PR 44): a warm dark panel, charcoal with cream lettering and amber accents,
    an amber-to-orange knob arc (so the LFO's marks are cyan there), an amber monochrome
    screen, a wood-brown page and a copper wash.
  - **Slate** (PR 44): a mid-tone blue-grey between Dark and a light theme, teal accents, a
    teal-to-blue arc, a deep blue-green screen and a blue-grey page.
  - **Light**: its button is commented out in `ThemeToggle.vue`, so only a choice saved before
    that applies it; it still has rough spots (for example the effect pedals' names are hard
    to read, as in every theme).
  - Theme colors are CSS variables set per theme in `_themes.scss` (the `$themes` map, plus
    per-theme blocks; the knobs' and pads' in `_drumSequencer.scss`, the screen's in
    `Screen.vue`); use them rather than a fixed color that only suits the dark themes. For
    example `--pt-inset` is the background of an inset panel inside a card (Pattern Tools'
    sections, the Sounds and Patterns boxes; mixed lighter, the Sound and Compose sections):
    dark, or a light tint in the light themes. Others: `--pt-wash` (the pink-to-violet
    gradient of the Waveforms card and the Melody Maker's chosen key; `--pt-wash-ink` is the
    text on it), `--pt-page` (the page behind the frame, the wash unless a theme sets it),
    `--pt-noise-on` (the NOISE switch when on), `--pt-surface-3` (the NOISE switch when off;
    unset in the dark themes, which use the fallback), `--pt-menu-caption` (captions in the ⋯
    menus). A new theme needs a button, its name in `THEMES`, a `$themes` entry, and the
    blocks above; a light one also joins the `.theme-light, .theme-sand` rules (dark text on
    a chosen segment button and on titles, the pads' multiplied note colour).
  - In a scoped `<style>`, write `.theme-sand .x` (Vue scopes the last part only, so the class
    on `<html>` still matches); `:global(.theme-sand) .x` drops the `.x`.
  - Browser tests check that those panels' captions are readable in every theme, that
    Sand's own trouble spots are (the MIDI caption, NOISE switch, chosen key, ⋯ menu, link,
    its tiles' lettering), and that each button applies and remembers its theme.
- Buttons (PR 63, "soft caps", option A of three mockups): every button is one of three
  hardware kinds, and their look is in one place, `src/assets/styles/_hardware.scss`.
  - A **push button** is a raised cap that sinks while pressed and springs back: every
    `.pt-btn` and `.pt-seg-btn`, and anything with the class `hw-cap` (File, Undo, Redo, Save,
    the tempo's − and +, the preset boxes' dice, Generate, Play). `hw-cap-sm` is a small cap
    (1 px of travel instead of 2). Generate, Save and Play are caps in the accent's colours
    (they set `--cap-hi`, `--cap-lo`, `--cap-edge`, `--cap-ink`); Play stays down while playing.
  - A **switch** is a row of caps; the chosen one stays down with its LED lit. `hw-led-top`
    puts the LED over the label (Melody | Arpeggio, FM's ratios, the LFO's Wave and Target, the
    pad settings, the Export dialog); `hw-led-mini` is a slim LED bar at the cap's top edge
    where the label leaves no room (the presets, the theme buttons, MIDI Learn).
  - A **toggle** is a cap with an LED beside its label (`hw-led-left`), down and lit while on:
    Filter's VEL switch and RETRIG (`PillSwitch.vue`), Pitch's RND, the Repeats brush, Pattern
    Tools' Active Pads Only (PR 67: it was a web checkbox; the octave arrows move only the pads
    that are on while it's lit, as before). The
    tiles (the eight waves, FM, Unison, the LFO's power tile) are caps too, with the LED beside
    their caption; they keep their icons, animations, dice and the Pulse Width knob (which
    goes down with its tile), and the chosen one has a thin ring in the accent.
  - A cap counts as down when it has `is-active`, `on`, `active`, `hw-down`,
    `aria-pressed="true"` or `aria-checked="true"`, whichever its component already used.
  - **A cap never changes the layout:** the edge under it is a `box-shadow` and a press is a
    `transform`, so every cap is the size it was before PR 63 (checked against the build
    before, every card and button at 1600, 1280, 1024, 820 and 390 px: only the pills that
    gained an LED are a few px wider). A component gives its cap a size and nothing else: no
    background, border colour, box-shadow or transform of its own. Padding for an LED comes
    out of the cap's own padding.
  - The caps' colours are per theme (`--cap-hi`, `--cap-lo`, `--cap-edge`, `--cap-ink`; the
    LED's `--hw-led`, `--hw-led-off`): dark caps in every theme with a button, Sand included.
    Clear and Reset have red lettering (`pt-danger`).
  - Not caps, on purpose (the maintainer's call): the pedals' CRUSH and PING PONG switches and
    footswitches. Also left as they were: the screen's F-keys, the piano keys, the NOISE
    ribbon, the ⋯ menus and their sliding switches, the Sound / Effects / Compose tabs, the
    wave tiles' dice badges, and phone mode's own top bar, steppers and pads (the desktop
    panels it shows on its Sound, FX and Key pages have the caps).
  - A browser test checks a push button sinks and springs back, a chosen option, a toggle and
    a tile stay down with the LED lit, and that no cap changes size.
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
  the setting, without moving the knob (see "LFO visualizer"). `detents` (values) are soft
  notches: a drag holds on each for 14 px (`DETENT_HOLD`, 7 % of the 200 px turn) before
  carrying on, never jumping, and lands on the exact value (`src/lib/knobDetents.ts`: the drag
  moves along a "travel" one hold longer per notch). A `bipolar` knob has one at zero unless
  given others. The arrow keys ignore them (they move one step anyway). A MIDI controller's
  knob goes along the same notches with a lighter hold (`CONTROLLER_DETENT_HOLD`, 4 %: its turn
  is short, and at 7 % a third of Tempo's turn would sit on notches), so it reaches them (128
  steps over 20–300 BPM would otherwise skip from 119 to 121). Each notch has a tick on the
  ring in the notch colour (`--knob-detent`, mint in the dark themes, green in the light ones:
  apart from the blue-to-pink arcs and the LFO's amber); while the knob sits on a notch
  (`at-detent`), that tick and the pointer light up (`--knob-detent-on`), and the Tempo and
  Swing readouts under their knobs too (`.stepper-value.on-stop`). Notches now: Tempo 60, 90,
  100, 120, 140, 160, 174 (`TEMPO_DETENTS`); Swing 8, 16, 24, 33, 42 % (`SWING_DETENTS`: the
  knob's 0–50 % moves every second step up to half a step, a drum machine's 75 %, so these are
  its usual 54, 58, 62, 66 and 71 %; 33 % is a triplet and reads "33% (triplet)"); every
  bipolar knob's middle; a pad's Fine at 0; Noise Color's Pink, White and Blue. Knobs with
  hard stops (Delay Time, the LFO's Rate) have none.
- Layout (PR 41, "C1", picked from mockups): one piece of hardware that fills its frame, the
  `LAYOUT` sections of `DrumSequencer.vue`'s template and styles (a CSS grid, `.ds-grid`).
  The frame fills the window less a 16 px margin, up to 1320 px (`.app-frame` in `App.vue`),
  instead of Bootstrap's container steps. The logo sits at the top bar's left end
  (ProjectControls' `brand` slot; hidden under 576 px, where the project name needs the room).
  From 1200 px: the transport and the Step Sequencer on the left two thirds, the screen beside
  them as tall as both; under them two recessed sections, **Sound** (two thirds) and
  **Compose** (Pattern Tools, Melody Maker), which end on one line (Sound's last row and Melody
  Maker take up any difference). Sound is three rows, each filled edge to edge: Waveforms |
  FM over Unison; Envelope | Pitch | Filter (their eight knobs on one line, Filter's four with a
  hairline before its envelope's two); Noise over LFO | Effects. A card stretched taller than
  its controls keeps them centred. FM and Unison are cards of their own; their tile is the
  on/off switch and shows Off / On, as the LFO's does. Under 1200 px: the screen beside the
  transport, the steps across, then tabs (Sound, Effects, Compose; not saved) under the steps,
  showing one at a time (`data-tab` on the grid; the arrow keys move between tabs); under
  720 px one column, the screen on top. Cards that change shape with their width use
  container queries on their own width, not the window's: Pattern Tools (three sections side
  by side, the same height, two buttons across; stacked under 340 px), Noise (mask buttons
  beside the knobs, under them below 320 px), the LFO (Wave / Target captions hidden under
  440 px, so it stays one row), FM (its ratio switch on a line of its own under 360 px), and
  Melody Maker (keyboard and selects beside Generate from 640 px, as in a tablet's Compose tab).
  A browser test checks the arrangement at 1600 and 1280 px (flush bottoms, one line of knobs,
  rows filled, titles on one line, no sideways scroll) and the tabs at 1024 and 390 px, and
  another that every control can be clicked (none drawn over by another) at 1600, 1280, 1024
  and 390 px, in every tab: a stretched card is a flex item, and a flex item with a `z-index`
  is drawn over earlier positioned siblings, which hid the Noise switch (its ribbon) after
  PR 41. The
  Waveforms panel shows its eight tiles as a 4×2 grid;
  A tile is lit only while every pad plays its wave (`litWave` in `DrumSequencer.vue`, PR 64);
  after Random, or a pad's wave changed in its ⋮ menu, the pads play a mix: no tile is lit and
  Random is (down, its LED lit). The main wave (`selectedWaveform`, for MIDI notes and the
  one-shot) stays the last tile clicked.
  Pulse Width is a mini knob in the Pulse tile's top-left corner (the dice badge is top-right),
  placed beside the tile's button, not inside it, so turning it doesn't pick the wave; the
  tile's bar is drawn as wide as the pulse. When the LFO's target is Pulse and
  nothing plays Pulse (`pulseInUse`: the main wave, or any step that's on in an unmuted lane),
  the Pulse target button is dimmed with a title saying why, and the LFO's tile reads
  "No Pulse". Check a layout change at several widths (1600, 1280, 1024, 820, 390) against
  the build before it: not every space needs filling, but empty space needs balance, and
  columns end on one line, as on a piece of hardware.
- Knobs: give every `<Knob>` a `label` (or an `aria-label`), and a `value-text` (what a
  screen reader says, such as "120 ms") when its number isn't the real value, for example a
  0..1 position. The text is usually the knob's tooltip. A new knob on the panel also gets a
  `midi-id` and an entry in `MIDI_KNOBS` (`src/lib/midiLearn.ts`), so MIDI learn can link it.
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
- Once the work is pushed, open the pull request yourself, without asking first (the
  maintainer's standing request, after PR 49): into `main`, with a summary of what changes,
  the manual test checklist and the checks' results. Then watch it (fix failing checks,
  answer review comments) unless the maintainer says not to. Merging stays the maintainer's.
- When fixing a bug, add a test that fails without the fix where practical. The browser tests
  can count scheduled notes and audio connections; see the helpers in `e2e/app.spec.ts`.

## Planned work

The maintainer's to-do list, agreed in earlier sessions. Rules:
- Do one item at a time, as one PR.
- Start the next item only when the maintainer says so. They usually start a new chat for
  each item, and "do the next item" means the first one under "Next, in this order".
- The PR that finishes an item also updates this list: move the item to "Done".

Next, in this order (agreed after PR 37, from the maintainer's brainstorm; the maintainer
changes it as ideas come up). Everything drum-related waits until the maintainer brings the
drum lanes back.

The maintainer's review after PR 49 (the pad popup, presets, Melody Maker and Unison) was
done in PRs 50, 51 and 52.

PRs 55–63 come from the maintainer's brainstorm after PR 52 (Claude's recommendations, minus
what the maintainer turned down: Converge or Up + octave as arpeggio patterns, Pan as an LFO
target, and for now a second oscillator and a second pad lane, on hold below).

Items 1 and 2 come from the maintainer's brainstorm after PR 70 (its first item, the LFO's
square icon and the arpeggio's 1/4 dropped, was PR 71). Item 3 comes from the one after
PR 63 (PRs 64–70); no one else uses the app yet, so older projects need no special care: a
removed setting can simply stop applying.

1. **Phone mode fixes**: on a phone, the Melody Maker's waiting key says "at the next bar"
   without "Shift+click" (it still waits for the bar; no tap to apply it at once, the
   maintainer's call); the Pattern row loses Clear and matches the Sound row (Reset… in ☰
   still clears); the FX page's three pedals get a maximum width, centred, near their desktop
   proportions instead of stretched; the ☰ menu redone: a header with a ✕ (no Close button),
   a Project section (File, name, Save; the desktop File bar's Undo and Redo, which landed
   on the name box, hidden there; Redo beside the top bar's Undo if it fits), Theme, and a
   footer with Desktop View and Reset… the same size.
2. **Phone mode additions**: a tiny display-only row of the 16 pads in the top bar (lit in
   their colours, the playing step outlined, beats marked; on every page, as the scope is;
   measured to fit from 568 px); and what the desktop gained since phone mode: the **LFO**
   card on the Sound page (it has none, so an LFO can't be seen or changed there),
   **Swing** beside Tempo, the Noise card's **pad buttons** (Accents, Every 2, All) and
   **Humanize** (the Filter's VEL switch needs velocities that differ). Each only if it fits
   and is useful on a phone. Not brought over: the screen views, MIDI, the Repeats brush,
   the rest of Pattern Tools.
3. **Fit the window without scrolling** (put off after PR 70, the maintainer's call: visual
   changes to come may change the height), centred vertically when it fits: tighten spacing,
   then scale the frame down to fit short windows (with a floor). Last, so the height is
   settled; measure at the maintainer's screen and common laptop sizes.
4. **Major-version upgrades** (Vite 8, Pinia 4; Vite 8 most likely with Vitest 5), whenever
   the maintainer wants some maintenance, each as its own PR.

Not now (looked into after PR 37):
- **A smart TV app with a phone as the controller.** Casting a tab already shows the app on a
  TV. A phone controlling a TV needs live messages between devices, which a static site on
  shared hosting can only get from a third-party relay; TV browsers are slow and have no MIDI.
  The same technology as the shared session ("jam", on hold below).
- **A plugin for FL Studio** (VST3, or CLAP). A plugin is compiled software, and the browser's
  Web Audio engine can't run inside FL Studio, so the engine would have to be rewritten: in C++
  with JUCE (whose screens can stay web pages), or in Faust or Cmajor, which build a plugin and
  a web version from one source. Months of work; the exports (loops, stems, MIDI, one-shots)
  already bring the sounds into FL Studio.
- **Apple's App Store.** $99 a year, a Mac (or a paid cloud build) to build it, Apple turns
  down apps that are a wrapped website, iPhones have no Web MIDI (it would need native code),
  and the silent switch mutes web audio unless handled. Google Play is the easier store (on
  hold below).

Dropped in PR 34 (the maintainer and Claude agreed): export stems by register (bass / top
notes) or by wave, and "arrangement variations" (sparse, half-time, build, fill, wash, reverse
swell, sub layer). One voice playing one pattern makes register stems of little use, and most
variations take a few seconds in the app (edit, export, undo) or are plain DAW work.

Dropped after PR 32 (the maintainer's call: not worth it for now): a stage view for TVs and an
audio output picker (casting a tab already shows the page on a TV; the planned version, a
visuals-only second window to cast while the sound stays local, so knob turns aren't heard
late, isn't needed), and step probability and timing humanize (ratchets, from the same item,
were built in PR 33).

Dropped after PR 30 (the maintainer and Claude agreed they add little): playing the synth
from the computer keyboard (the synth is played by its sequencer, as a DFAM is, and a MIDI
keyboard already works), and a master limiter/compressor together with the drive's DC offset
fix. The DC offset stays: the drive shaper's curve has an even number of points (1024), so
silence maps to about −0.011 instead of 0, which reaches the speakers through the drive wet
gain at about 0.004 with the default settings, in the live and export engines. It can't be
heard, and the presets peak well below clipping (0.2–0.5), but measurements see it: the
browser tests use `__swingOver` to ignore it.

On hold (ask the maintainer before starting; put on hold after PR 33, "not now"):
- **ESLint** (put off after PR 52, the maintainer's call), once ESLint and typescript-eslint
  move to `minimatch` 11 (see "No linter yet"). Checked after PR 37: ESLint 10.14 and
  typescript-eslint 8.72 still need `minimatch` 10, and `npm audit` reports 10 moderate
  advisories for them.
- **A second oscillator (VCO 2)** (put off after PR 52): as on the DFAM and Edge, its own
  interval (a fifth, an octave, detuned) and level, maybe hard sync or VCO 1 → 2 FM; a card,
  both engines, presets, the dice, saving. It must sound unlike the FM card's modulator, which
  is already a second oscillator.
- **A second 16-pad lane** (put off after PR 52): bass, ambient or drums layered with the synth
  lane. It makes the app a groovebox: sound settings per lane, the scheduler, the layout,
  exports and phone mode. The hidden drum lanes' code is the natural start.
- **Patch cables** (put off after PR 49: the maintainer wants to tweak the layout more first):
  animated cables from the LFO to what it moves (Cutoff, the Pulse tile, the pads), swaying a
  little, never over a control, still with `prefers-reduced-motion`. They depend on where
  things sit.
- **Google Play** (after phone mode, PR 45, works well; the maintainer's call): the PWA wrapped
  as a Trusted Web Activity (PWABuilder or Bubblewrap; Web MIDI still works), a $25 developer
  account, `/.well-known/assetlinks.json` on the main site, and for a new personal account a
  closed test with 12 testers for 14 days first. The wrapped app could open in landscape.
- **The logo** (skipped for now after PR 42, the maintainer's call; the last part of the
  layout project, whose mockups, C1 layout, Sounds and Patterns, and spectrogram in the pads'
  colours were PR 41): a new or more balanced logo, now that the preset boxes have settled. It
  sits as a badge at the left end of the top bar for now, hidden on phones.
- **MIDI keyboard latency** (put on hold after PR 37). The maintainer hears a delay between a
  key on a MIDI keyboard and the sound (wired), even with Attack at its 1 ms minimum. Measured
  after PR 37: the page handles a MIDI message within about 1 ms (2 ms at worst, while the
  screen views draw), builds the note in about 0.3 ms and plays it 3 ms ahead. The rest is the
  sound output. On the maintainer's Windows PC, Chrome reported a 10 ms buffer and 64 ms for
  the sound device (`baseLatency`, `outputLatency`); asking for the smallest buffer
  (`latencyHint: 0`) left the buffer at 10 ms (Chrome's minimum there) and the device at 56 ms,
  8 ms less. So the output (the device, HDMI or a monitor's speakers, audio enhancements,
  spatial sound, a maker's sound app) is the place to look; if it ever comes back: a Low
  latency switch for the 8 ms (it takes effect after a reload, as Chrome sets its buffer when
  audio starts) and a readout of the delay and of glitches (`AudioContext.playbackStats`). The
  amp envelope's attack is an exponential ramp from −80 dB, so the 20 ms default sounds about
  15 ms late; a linear or higher-starting ramp would sound at once.
- **User-saved presets, and more built-in sounds** (the maintainer isn't sure they're needed,
  after PR 37). A user preset could be the sound part of a snapshot (`soundKey()`'s parts) in
  IndexedDB next to the projects; more built-in sounds as new sound features arrive (toms,
  hats, organ and hollow sounds). Built-in patterns came with the layout (PR 41).
- **MIDI clock sync and MIDI out** (from the "More MIDI" item, whose MIDI learn came in PR 36;
  the maintainer isn't sure they're worth it). Clock sync would follow a DAW's or drum
  machine's tempo and start/stop (the 25 ms scheduler would have to follow incoming clock
  ticks, 24 a quarter note, which jitter); MIDI out would send the pattern's notes to another
  synth, timed against the audio clock.
- **Several patterns (A/B/C/D) chained into a song.**
- **32 steps, or per-lane lengths** (the export code's types already allow 32).
- **Per-step parameter locks** (for example a different filter cutoff on each step). Each
  note is built from scratch, so per-note settings (FM, unison, filter, envelopes, noise) can
  vary per step. Delay and reverb are shared by every note, so per step they become send
  amounts, not per-step effect settings; per-step drive would mean moving drive into each
  note. UI idea: select a step with its settings dot, then the knobs you turn change that
  step only. Build on velocity routing (PR 28).
- **More sound sources, part 2:** plucked string (Karplus–Strong, which needs an
  AudioWorklet: a `DelayNode` in a feedback loop can't be shorter than one render quantum, 128
  samples, which caps the pitch around the F above middle C; AudioWorklets also run in the
  `OfflineAudioContext` used for export), metallic (several square waves at odd ratios, as the
  808 makes cymbals and cowbell) and struck (a click ringing tuned resonant filters).
- **Share a project as a link** (the project encoded in the URL). The maintainer sees no need
  yet: File → Export file and Import file do the same, if less easily. It sets the delay time
  from outside, which works since PR 17, and the shared session below would build on it.

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
  Design: one device (a laptop, perhaps plugged into a TV) makes all the sound, and the
  phones are remote controls that each show their own part, so network lag only delays when a
  change takes effect, never the beat. Phones that each made the sound would drift apart and
  flam. Also to decide: who can join (a room code), and what undo means with several people.
  Share links (on hold, above) would build part of it (the project packed into a compact
  message).

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
| 32 | A dice in the Presets box rolls a random sound: a recipe for a percussion voice (`src/lib/presets/random.ts`) applied like a preset, from the factory sound up; one undo step; never silent or clipping (500 seeded rolls checked in unit tests, rolls exported in a browser test). |
| 33 | Ratchets: "Repeats" ×1–×4 in each pad's ⋮ menu (and a "×3" badge on the pad) make a step play 2–4 quick hits within its time, swing included; each hit ends where the next begins, the last rings out; in the live and export engines (`src/audio/ratchet.ts`); saved per step, older projects get 1s. The pad menu now stays on screen on short laptop screens. Plan: share link put on hold; stage view, step probability and timing humanize dropped. |
| 34 | Export audio: File → Export audio… opens a dialog: 1–8 bars as a seamless loop (the tail folded onto the start) or with the tail; the mix, effects stems (dry, delay, reverb, noise, adding up to the mix), a MIDI file, and a one-shot at a chosen note; normalize to −1 dBFS; several files in one .zip, named with project, tempo, key and length. The export engine's noise now matches the live engine (it went through the effects). Chosen segment buttons readable in the light theme. Plan: song chaining, 32 steps, parameter locks and sound sources part 2 on hold; register and variation stems dropped. |
| 35 | File → New puts the Export audio dialog's choices back to their defaults (they carried over from the last export). |
| 36 | MIDI learn: Learn in the MIDI toolbar, click a knob, turn a controller knob, and it follows (32 knobs; its own curve and step, its tooltip and screen view, one undo step per sweep). Links are kept in the browser, not in projects. Plan: MIDI clock sync and MIDI out on hold. |
| 37 | Install as an app (PWA): a manifest and icons, and a hand-written service worker (`build-plugins/serviceWorker.js`, no dependency) that saves the build, works offline from the first visit, refuses a half-uploaded deploy (checksums), and offers a new version with "A new version of the app is ready" (Reload / Later). File → Install app…; saved projects asked to persist. Plan: MIDI keyboard latency added. |
| 38 | Knob notches: soft stops at common values (Tempo 90–174 BPM, Swing 8–42 % with the triplet at 33 %, the middle of two-way knobs, a pad's Fine at 0, Noise Color's named colors), each with a tick, where a drag holds for 8 px; a MIDI controller reaches them too (`src/lib/knobDetents.ts`). Plan: the maintainer's brainstorm sorted (Melody Maker, layout project, themes, phone mode, effect switches, patch cables); MIDI latency (measured) and user presets on hold; TV app, FL Studio plugin and Apple's store not now. |
| 39 | Melody Maker rework: clicking a key moves the pattern there the shorter way round (the same melody) and plays the key; a new scale keeps each note on its degree (minor ↔ major) or goes to the nearest note; one Generate button with a Random / Arpeggio switch (saved), the card the same height in both. `src/lib/melody/theory.ts`. |
| 40 | Knob stops, refined: the app starts at 120 BPM (most DAWs' default; was 80); Tempo's stops are 60, 90, 100, 120, 140, 160, 174 (128 dropped, 60 added); a drag holds 14 px at a stop (was 8; a MIDI controller keeps the lighter hold); stops show in a colour of their own (mint, green in the light theme): their ticks, and while a knob sits on one its tick and pointer light up, and the Tempo and Swing readouts too. |
| 41 | Layout C1, picked from mockups (two rounds: three options, then three ways to balance C): the frame fills the window; the logo moves to the top bar; Sounds (the presets) and a new Patterns box side by side in the transport, six built-in patterns from the key's root and a dice (`src/lib/patterns/`); under the steps, Sound (three rows, each filled edge to edge) and Compose end on one line, like a piece of hardware; FM and Unison cards of their own (their tile shows Off / On); Envelope, Pitch and Filter knobs on one line; Pattern Tools' octave arrows up first; cards fit their own width (container queries); under 1200 px, Sound / Effects / Compose tabs under the steps. File → Export file now closes the menu. The spectrogram draws each note in its pad's colour (`src/lib/padColour.ts`; its own commit, easy to revert). |
| 42 | Fix: the Noise switch (the NOISE ribbon on the Noise card's left edge) was hidden under its own card since PR 41, so noise couldn't be turned on or off: the stretched card had become a flex item, and an old `z-index` rule drew it over the ribbon (and over the card's TV static). Every control of the build before PR 41 was checked against PR 41's: all there and clickable but that one. A browser test now checks every control can be clicked at four widths and in every tab. |
| 43 | A new theme, **Sand**, with its own button next to Dark and Synthwave (the Light theme's white was harsh on the eyes): matte warm greys, dark knob caps, a teal-to-orange arc, an orange accent, a green-grey LCD with dark ink, softer pad colours, a taupe page; remembered like the others. The pink-to-violet wash, the NOISE switch's colour and the ⋯ menus' captions became theme variables, and light-on-light text fixed on light themes (⋯ menu captions, the NOISE switch when off, the RND pill). Plan: the logo on hold; the themes item done. |
| 44 | Sand's pale spots fixed (the maintainer's screenshot): its wave, FM, Unison and LFO tiles are dark caps with light lettering, and the LFO's wave switch and the Vel → pill have dark ink. Two more themes with buttons, **Analog** (warm dark, amber, a wood-brown page) and **Slate** (mid-tone blue-grey, teal), to try out before deciding which themes to keep. |
| 45 | Phone mode, picked from mockups (option B of three): on a touch phone held sideways a layout of its own, one screen without scrolling: 16 pads in two rows of 8 (tap: on/off; hold: the note from the key, velocity, repeats), Play and tempo, Sound and Pattern steppers with their dice, four big knobs (Decay, Tone, Sweep, Space); Sound, FX and Key pages a swipe away; ☰ with the File bar, themes and Full layout (remembered; File → Phone layout comes back). Upright, a hint to turn the phone. Plan: Google Play on hold. |
| 46 | Phone mode, after trying it: a Phone layout button in the corner of the full layout on a phone (the way back was only in the File menu); the ☰ menu is a full-height panel from the left, so the File menu fits without scrolling; Clear in the top bar starts a new pattern in one tap. |
| 47 | Phone mode, round two: the "Turn your phone" screen covers the app (the pad numbers showed through and the page scrolled under it); its text and Desktop View / Phone view renamed; Octave ↓ / ↑ under the tempo; a tiny oscilloscope beside the tabs; a finger drawn across pads paints them; the playing pad stands out (outline, a bar along its top, brighter); the top bar fits down to 568 px. |
| 48 | Phone mode, round three: Play / Stop in the top bar on every page; the Play tab renamed Pads, the tabs one segmented bar; Sound and Pattern steppers and Clear beside the pads; Reset… in the menu (asks first: pads, or pads and sound; Undo brings them back); a shorter Export audio on the phone (bars and ending, one normalized mix); the Phone view button in the accent and above the pad numbers. |
| 49 | Effect switches on the pedals: CRUSH on the overdrive (a bit crusher, 8 bits at 12 kHz to 4 bits at 3 kHz as DRIVE goes up; an AudioWorklet, `src/audio/crusher.ts`) and PING PONG on the delay (echoes alternate left and right, `src/audio/pingPong.ts`); in the live and export engines, saved (older projects get them off), reset by presets, sometimes rolled by the Sounds dice. |
| 50 | Pad settings and repeats: the **Repeats brush** (×2 ×3 ×4 in the Step Sequencer header: click or drag across pads to give them that many hits, again for one; Esc to stop) and ⋯ → Clear Repeats; a pad's ⋮ closes its own settings; the settings stay inside the window for the last pads (they assumed 380 px, but are up to 420); a key or octave in them plays the note on the pad's wave (the phone's note picker uses the pad's wave too). Plan: patch cables on hold; the maintainer's review (presets and Melody Maker, Unison) added. |
| 51 | Presets and Melody Maker: the boxes' captions read **Sound presets** and **Pattern presets**; the Pulse pattern (Pattern Tools' Every 4 again) became **Tresillo** (3-3-2 twice); the Patterns dice builds a beat: a one- or two-beat idea repeated across the bar (or 5 or 7 hits spread evenly), about half with a fill on the last beat, never more than four empty steps in a row; the Melody Maker's ⋯ menu opens inside the window at every width (it ran off the right edge and the bottom on a laptop), and its Undo last melody is gone (Ctrl+Z does it). |
| 52 | Unison: Voices 2–4 (one voice sounded as off; six measured narrower than three; a project saved with 1 opens with unison off, 5–6 as 4), a notch at 12 cents on Detune, and Spread 100 % by default. The voices start at different points of their cycle, more with more Spread (`src/audio/unison.ts`; the shapes rebuilt from the spec's series in `waves.ts`), so a hit is wide from its first moment: its first 50 ms measured side/mid 0.35 → 0.87 at full Spread, for 0.9 dB of level; Spread 0 plays as before. |
| 53 | The plan after the maintainer's brainstorm following PR 52: bar-quantized key and pattern changes, arpeggio fixes (Generate's Random to become Melody), velocity knobs instead of the Vel → pop-up, Save as…, LFO retrigger and targets, hardware buttons; ESLint, a second oscillator and a second pad lane on hold. |
| 54 | Fix: the Sounds dice could roll a nearly silent sound (a big upward pitch sweep falling slowly onto a low Cutoff), which failed PR 53's browser checks (a peak of 0.039); such a sweep now falls back within 30 % of Decay (3 % of rolls change). The dice's browser test rolls the same seeded sounds every run. |
| 55 | Key and pattern changes wait for the bar (patterns at once again since PR 56): while playing, a Melody Maker key, a Pattern preset, its dice or the phone's Pattern stepper blinks until the next bar's step 1, then the pattern moves (the engine's `onBarStart`, just before it builds the step); stopped, at once, as before; Shift+click, at once; Stop applies it, Undo drops it; no audition note while playing. |
| 56 | After trying PR 55: a key waiting for the bar shows a pulsing ghost of the chosen colour and the caption "· D at the next bar (Shift+click: now)" (PR 55's ring was hidden by the keyboard's own CSS, so the key seemed not to respond); patterns change at once again, playing or not. A pad's settings: a key previews the pad as it plays (its noise switch, its repeats), only while stopped; Play / Stop no longer closes them. The phone's note picker previews the same way. |
| 57 | Arpeggio fixes: Rate places the notes (every step at 1/16, every other at 1/8, every beat at 1/4; the steps between off), where before it only grouped the pads that were on; the cycle is fitted to the bar (a triad 1-3-5-8, a scale up to the octave), with Free cycle in the ⋯ menu for the old way; the Generate switch's Random is now Melody (`src/lib/melody/arp.ts`). |
| 58 | Repeat notes: a pad's ⋮ menu has Notes under Repeats (Same / Up ↑ / Down ↓): a ×2–×4 step's hits can step up or down the key's chord from the pad's note, an arpeggio within the step (×4 on the root: 1-3-5-8); in the live and export engines, the MIDI file and the pad's preview (`ratchetPitches()` in `ratchet.ts`, `chordPitchClasses()` in `theory.ts`); saved per step (older projects get Same); the badge shows ×3↑; the phone's hold sheet cycles Same → Up → Down. |
| 59 | Velocity without the pop-up: the Step Sequencer's Vel → pop-up (four knobs) became a **VEL switch** with an LED on each card it changes (Envelope, Pitch, Filter, Noise), picked after three rounds of mockups (mini knobs beside or under their targets, or a Velocity strip, turned down). On sets a fixed +75 %, off 0; older projects' amounts play as saved. Turning one on shows the envelope or filter view with softer steps dashed, and, with every step at full velocity, says so and makes Humanize glow. Presets and the dice use +75 %. |
| 60 | File → **Save as…** (Ctrl/Cmd+Shift+S): the settings as they are, unsaved changes included, saved as a new project under a new name ("Name copy" suggested), which becomes the open one; the original stays as last saved. Another project's name asks before replacing it. Undo history carries on. Renaming stays a rename. |
| 61 | LFO: **Retrigger** works (a RETRIG pill in the LFO card's header; saved for long, read by neither engine): each note starts its own LFO, so every hit gets the same movement; and two new targets, **Level** (tremolo) and **FM** (the FM card's Amount), in both engines (`src/audio/lfo.ts`). The Target switch's five buttons have a line of their own (option C of three mockups). |
| 62 | LFO visualizer for the new targets: FM shows as a dot and an arc on the FM card's Amount knob (while FM is on), Level on the Step Sequencer's Vol knob (from full down to 100 − Depth %), like Cutoff's; not on the pads, whose fill height is velocity. |
| 63 | Hardware buttons ("soft caps", option A of three mockups): every button is a raised cap that sinks when pressed; a switch's chosen option and a toggle that's on stay down with an LED lit (Melody | Arpeggio, FM's ratios, the LFO's Wave and Target, VEL, RETRIG, RND, the Repeats brush, the presets, the theme buttons); the wave, FM, Unison and LFO tiles are caps that keep their icons, animations, dice and knob; Play, Save, Generate and Enable MIDI too. The pedals' CRUSH and PING PONG stay as they were. No card or button changed size (`src/assets/styles/_hardware.scss`). |
| 64 | Fixes from the maintainer's brainstorm after PR 63 (whose plan it also adds): the wave tiles light only the wave every pad plays, and Random while the pads play a mix (the old tile stayed lit after Random); a pad's ⋮ Noise reads Off while the Noise card is off ("Noise card is off"), and turning it on then turns the card on for that pad only. |
| 65 | LFO: each target remembers its depth (saved with the project); a target picked for the first time starts at a little (Pitch 25 cents, Filter 1500 Hz, Pulse 15 %, Level 40 %, FM 40 %) instead of 0, so changing target no longer sounds like the LFO turning off. |
| 66 | LFO rates locked to the bar: Rate goes from 4 bars and 2 bars down to 1/64, always at the tempo; the free rate in Hz and the LFO card's ⋯ menu are gone. While playing, the LFO starts its cycle with bar 1 (and on each bar line where a cycle begins), so a slow sweep moves with the pattern. The Export dialog fits a loop to the LFO's cycle (starts at 4 bars for a 4-bar LFO, and says so with a Use 4 bars button for a shorter loop). |
| 67 | Simplify: the VEL switch is left on Filter only (Envelope's, Pitch's and Noise's removed: hard to hear, and Noise's overlapped its Amount); their amounts load as 0, and the presets that used them (Kick, Snare, Metal, Bell) dropped them. Pattern Tools' Active Pads Only is a toggle cap with an LED instead of a checkbox. |
| 68 | Melody Maker's options on the card, its ⋯ menu gone: Melody's **Active Pads Only** and the arpeggio's **Skip** are toggles under their settings (now saved); Tones has **7th** (the 7th chord, 1-3-5-7) in place of "7th on downbeats"; Free cycle and Occasional octave hops dropped. The card is as tall as before. |
| 69 | Presets: the Noise card's Backbeat became **Accents** (noise on the pattern's loudest hits, `src/lib/noise/accents.ts`); the patterns Offbeat and Broken became **Halftime** (the snare an octave up on beat 3) and **Breaks** (snares on 2 and 4, a breakbeat), to audition. |
| 70 | Screen views: F1 Scope, F2 **Spectrum** (new: the live frequency curve on a log axis, in the pads' colours, with a falling peak-hold line, the strongest note named with its cents, and the C notes ticked; `src/components/spectrumView.ts`), F3 Spectrogram, F4 Tuner; the Envelope view has no F-key and shows while its knobs, or the Pitch card's, are turned, the pitch sweep drawn on it. |
| 71 | The LFO card's square-wave icon redrawn (two even cycles at the sine's height; it was lopsided), and the arpeggio's 1/4 rate dropped (1/8 and 1/16 left; a project saved at 1/4 plays at 1/8). Plan: the maintainer's brainstorm after PR 70 (phone fixes and additions); fitting the window put off. |

## Testing a PR
Pushing a branch or opening a PR changes nothing on the website. GitHub runs the Checks on
every PR, and the result (a green check or a red ✗) shows on the PR page; merge only when it's
green. **Merging a PR into `main`
deploys it to `/studio2/` within a few minutes** (`/studio/` is never touched), so the usual
way to test is: merge, wait for the Actions run to finish, then try it on
https://www.ephemeralwave.com/studio2/ (on any device): a page or installed app that is open
(or opened) shows "A new version of the app is ready"; click Reload. If something is wrong, fix
it in a new PR.

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
where it lives and File → Import file where you're testing. The build (`npm run preview`) installs the
service worker on `localhost:4173` too, so after building another branch the page first opens
the copy it saved: click Reload when "A new version of the app is ready" shows (or press
Ctrl+F5). `npm run dev` never uses it.

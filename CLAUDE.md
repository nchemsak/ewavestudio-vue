# Ephemeral Wave Studio

Browser-based 16-step percussion synthesizer and step sequencer. This repo is **version 2**,
served from https://www.ephemeralwave.com/studio2/. The original version stays at
https://www.ephemeralwave.com/studio/ and is never updated or overwritten, so the two can
be compared; never deploy this code to `/studio/`. Everything runs client-side with the Web
Audio API; there is no backend. Features: one 16-step synth lane with per-step pitch,
velocity, waveform (sine, triangle, saw, square, a pulse with adjustable width, and three
harmonic shapes, and a sound recorded from the microphone) and ratchet (2–4 quick hits within the step); amp envelope, pitch envelope (a drum-style sweep), filter with its own
envelope, noise, FM,
unison and LFO; delay (with a ping-pong switch), overdrive (with a bit-crusher switch), reverb and a lo-fi pedal (wear, wobble, tape or vinyl); Web MIDI note
input, and MIDI learn (a controller's knobs turn the app's); a melody maker (random notes or an
arpeggio in a key and scale; a new key or scale moves the pattern with it); a screen with an oscilloscope, spectrum,
spectrogram and tuner, and envelope and filter views while their knobs are turned; six built-in sounds that set the sound (not the pattern) and six built-in patterns
that set the pattern (not the sound), each with a dice for a random one; audio export (seamless N-bar loops, effects stems, a MIDI file and a one-shot); projects
saved in IndexedDB with JSON import and export, and share links (the project in the URL); undo/redo; it installs as an app that
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
  arithmetic, the Melody Maker's screen (note lengths, the playing note), the cards' screens (`shapeViews.ts`), MIDI input (with a fake MIDI system), MIDI learn (and that every learnable knob
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
- The logo at the top bar's left end is the link back to `/`, the main site, which is not part
  of this repo (PR 92; until then a "Return to Ephemeral Wave" link under the frame). Under
  576 px, where the logo is hidden, the gear's panel has that link. In the installed app it
  opens in the browser (`target="_blank"`), not in the app's window.

## Architecture

```
index.html               Entry HTML (the build adds the Google Analytics tag)
build-plugins/googleAnalytics.js  Vite plugin: the gtag snippet, in builds only
build-plugins/serviceWorker.js  Vite plugin: writes dist/sw.js (builds only), the service worker
                         (serviceWorkerSource.js) with the build's files and checksums; see
                         "Install as an app"
src/main.ts              createApp + Pinia, imports the global SCSS (Bootstrap + theme)
src/App.vue              The frame: <DrumSequencer/> +
                         <PwaNotice/> (the "new version" notice)
src/components/
  DrumSequencer.vue      ~3900 lines; holds nearly all app state (as refs) and the screen
                         views; groups the saved settings as `projectState` for saving and
                         the live engine, and decides what a MIDI note plays; its template's
                         LAYOUT section lays out the panel (see "Layout" under Conventions)
  modules/*.vue          Synth and effect panels: Envelope, Filter, PitchEnv, Noise, FM,
                         Unison, LFOGroup, Delay, Drive, Reverb, Tape (UI only; mostly v-model);
                         PedalSwitch.vue, a pedal's mini toggle (CRUSH, PING PONG)
  SynthStepGrid.vue      16 synth step pads with velocity and pitch sliders
  PhoneLayout.vue        Phone mode's layout (see "Phone mode"): pads, Play, steppers, macros;
                         its Sound, FX and Key pages are DrumSequencer's slots
  LfoBendMark.vue        The LFO's pitch bend drawn on a lit pad (see "LFO visualizer")
  RollPlayhead.vue       The Melody Maker screen's playhead line (it alone redraws every frame)
  MelodyMaker.vue        Key, scale and range, a screen, the makers' settings and Generate (the
                         card's last line); a key or scale picked moves the pattern (see "Melody Maker");
                         `compact` on the phone's Key page
  MelodyModeSwitch.vue   Melody | Arpeggio, in the Melody Maker card's header (desktop and phone)
  PatternTools.vue       Synth-lane tools: step fills (all, every 2/4, invert, random, clear),
                         velocity shapes ("Humanize") and Move: octave shift, shift and
                         reverse (see "Tap tempo and Move")
  ProjectControls.vue    The top bar: the logo (its `brand` slot), File menu (new, open, Save as…,
                         delete, import/export JSON, Share link…, Export audio…), the name box
                         (rename), Save, Undo/Redo buttons
  ShareNotice.vue        "Shared pattern: press Play", once a share link's project has opened
  ExportDialog.vue       The Export audio dialog (see "Export audio")
  PresetButtons.vue      A box of preset buttons and a dice, used twice in the transport card:
                         Sounds and Patterns (see "Sounds and Patterns")
  SettingsMenu.vue       The top bar's gear: Theme and MIDI (see "MIDI"), and the link home
                         under 576 px
  ThemeToggle.vue        The three theme buttons, lightest to darkest (in the gear)
  MidiToolbar.vue        "MIDI Controller": Enable MIDI button, then the input list and Learn
                         (and the MIDI learn bar, at the bottom of the screen)
  Screen.vue             "LCD" with F-key buttons; DrumSequencer draws its canvas views
  WaveButton.vue, WaveIcon.vue  A wave's big tile (Waveforms panel) and small line icon (pads)
  RandomWaveTile.vue     The Waveforms card's Random: a tall tile that rolls the pads' waves and
                         shows their mix (see "Layout" under Conventions)
  SampleTile.vue         The Waveforms card's Sample strip: REC, the recording to pick, its dice
                         badge and Length (see
                         "Sample a sound")
  VelSwitch.vue          The Filter card's VEL switch: velocity routing (the only one since PR 67)
  PillSwitch.vue         The small on/off pill with an LED in a card's header (VEL, RETRIG)
  ShapePad.vue           A card's screen that you drag (Envelope, Pitch, Filter, FM, Unison), and
                         those cards' shared styles (see "The shape cards")
  filterView.ts          The screen's filter view (drawing loop and its pure helpers)
  spectrumView.ts        The screen's Spectrum view, F2 (drawing loop and its pure helpers)
  hitView.ts             The screen at rest: one hit of the sound (drawing loop, pure helpers)
  LfoModKnob.vue         A Knob that draws the LFO visualizer's dot and arc itself (the Volume knob)
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
  tape.ts                The tape pedal: what its knobs mean, its nodes, its hiss and crackle
                         (see "The tape pedal")
  unison.ts              Unison: 2–4 voices, where each sits and starts in its cycle (see
                         "Audio engine (live)")
  sample.ts              The recorded sound, the 'sample' wave: kept as base64 PCM, trimmed, and
                         played at a note's pitch (see "Sample a sound")
  reverb/generateIr.ts   Algorithmic impulse response for the ConvolverNode
  reverb/preDelay.ts     The reverb's pre-delay (PRE): its note values, their time at the tempo
                         (followPreDelay), its label (see "Effect switches")
  reverb/reverse.ts      REV, the reverb backwards: SWELL's lengths, the gap to the next hit,
                         the reversed impulse response (see "Effect switches")
  export/scheduleStepSequencer.ts  Separate offline engine used for audio export
  export/exportFiles.ts  The Export audio dialog's files: renders, loops, stems, one-shot; and
                         renderHit(), the screen's hit at rest
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
src/lib/noise/masks.ts   The Noise card's Backbeat and Offbeats, and whether a mask is heard (pure)
src/lib/patterns/velocityShapes.ts  Humanize's velocity shapes (Pattern Tools, the phone; pure)
src/lib/patterns/move.ts  Pattern Tools' shift and reverse: which lists move, and where (pure)
src/lib/tapTempo.ts      The TAP cap: four taps set the tempo (pure)
src/lib/delaySync.ts     Tempo-synced delay: divisions, synced time, followDelaySync (see
                         "Delay time")
src/lib/lfoVisual.ts     What the LFO visualizer shows (pure; see "LFO visualizer")
src/lib/lfoPlot.ts       What the LFO card's screen draws: the wave across the bar (pure)
src/lib/shapeViews.ts    What the Envelope, Pitch, Filter, FM and Unison cards' screens draw, and
                         what a drag on one sets (pure; see "The shape cards")
src/lib/padColour.ts     The pads' colours, which the spectrogram uses too (see "Pad and
                         spectrogram colours")
src/lib/melody/theory.ts  Keys and scales; moving a pattern to another key or scale (pure)
src/lib/melody/roll.ts   What the Melody Maker's screen draws: the pattern (each note as long as it
                         sounds), what Generate would change, the note that's playing (pure)
src/lib/melody/arp.ts    The arpeggio on the pads: where Rate puts notes, the cycle fitted to
                         the bar (pure; see "Melody Maker")
src/lib/knobDetents.ts   Knob notches: the drag's travel with a hold at each, and the Tempo and
                         Swing notches (pure; see "Knobs" under Conventions)
src/lib/midiLearn.ts     MIDI learn's bookkeeping (pure): the learnable knobs (MIDI_KNOBS) and
                         which controller knob drives which
src/lib/storage/         IndexedDB via `idb` (db.ts, projects.ts), JSON import/export,
                         namespace.ts (storage names, one set per site folder), share.ts (share
                         links, see "Share links")
src/lib/schema/projectSchema.ts  Project file check (hand-written, no library) + v1→v2
                         migration (CURRENT_VERSION = 2)
src/composables/useTheme.ts      synthwave | dark | analog theme, in localStorage
src/composables/useMidiInput.ts  Web MIDI note input (see "MIDI")
src/composables/useMidiLearn.ts  MIDI learn mode and the controller's links (see "MIDI learn")
src/composables/usePwa.ts  Installing the app, offline use and updates, the page's side
src/composables/usePhoneMode.ts  When phone mode is on (a phone held sideways), the upright hint
src/composables/useProjectSync.ts  Keeps the settings and the project store in step (see "Saving")
src/composables/useUndoHistory.ts  When to record an undo step, and applying undo/redo
src/composables/useLfoVisual.ts  The LFO visualizer's frame clock
src/composables/useFirstGenerate.ts  Whether Generate has been pressed in this browser (the hint)
src/composables/usePlayhead.ts  The Melody Maker screen's playhead: where the bar is, each frame
src/composables/useSampleRecorder.ts  Recording from the microphone (see "Sample a sound")
src/assets/styles/       _bootstrap-custom.scss (the Bootstrap parts in use, then main.scss),
                         and all global SCSS (themes are in _themes.scss, the buttons' look in
                         _hardware.scss: see "Buttons" under Conventions). _sequencer.scss and
                         _keyboard.scss are not built (main.scss doesn't load them)
public/audio/            kick.mp3, snare.mp3, hihat.mp3: only used by the hidden drum lanes,
                         fetched only once one of them has a step on (since PR 87)
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
  `loadSample`, for the LFO visualizer `lfoNow` and `soundingRecently`, and for the Melody
  Maker's playhead `barPosition`. A new sound setting is passed in here (see "If you add a parameter").
- One `AudioContext` is created when `useLiveEngine` runs. It is resumed on the first Play
  click.
- Graph: per-note synth voices → drive (dry + shaper → tone → [bit crusher] → `driveSum`).
  From `driveSum` two paths run in parallel: delay (dry + wet, with a feedback loop and tone
  filters; the plain delay or the ping-pong one, each with its own send) and a reverb send
  (tone filter → pre-delay → convolver → wet gain; with REV, after the pre-delay a gate and a
  reversed convolver per swell length → its own wet gain). Both go to `preMaster`, and so do the noise layer (and
  the hidden sample lanes), which bypass drive, delay and reverb. From `preMaster` everything
  goes through the tape pedal, or round it while it's off (see "The tape pedal"), to
  `masterGain` → destination. An `AnalyserNode` is tapped from `masterGain` for the scope,
  spectrogram and tuner.
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
  above, drops), left is `down`; the **Random** toggle (labelled RND until PR 74, which could
  be read as "Round") is `random`. Saved as before: `semitones` (0–48)
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
  Envelope, Pitch (before Random) and Filter cards' headers and of the Noise card
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
  The **Repeats brush** (PR 50; `×2 ×3 ×4` beside the title in the Step Sequencer header,
  `repeatBrush` in `DrumSequencer.vue`, not saved): while one is lit, a click or a drag across
  pads (`SynthStepGrid.vue`'s `paintRepeats()`, like painting steps) gives them that many hits
  and turns them on; a pad that has the brush's count already goes back to one (the first pad
  decides, as with steps). The pad under the mouse shows what a click would give (a dashed
  badge), and its velocity and pitch sliders hide. Enter on a focused pad paints it; Esc, the
  lit button or File → New puts the brush down. A drag is one undo step.
  **It stays picked, and says so** (PR 74; the maintainer's worry: someone who wants to turn
  pads on and off doesn't realise the brush is still picked). It stays picked from pad to pad
  on purpose, so repeats on every other pad are one click each (a brush that put itself down
  after one stroke was turned down for that). While it's picked: a dashed frame round the pads
  (`.step-card__grid.is-brushing::after`) with a tag on its top edge, "Painting ×3 repeats ·
  Esc or click elsewhere to finish" (`.brush-note`; neither moves anything), and the cursor
  over a pad is an arrow carrying "×3" (an SVG data URL per count in `SynthStepGrid.vue`,
  from the grid's `data-brush`; it was `copy`). **A click elsewhere puts it down** and still
  does its own job (`onBrushPointerDown()` in `DrumSequencer.vue`): anywhere but the pads'
  frame, the brush's buttons, and what goes with painting (`data-keeps-brush`): Play / Stop,
  to hear it, and Undo / Redo, to take a stroke back and carry on. The brush still turns an off pad on: a repeat on a silent step can't be heard, so
  leaving pads as they are would make a click seem to do nothing.
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
- Unison (`unison.ts`, both engines; the Unison card: its ribbon, the Voices keys, Detune, Spread):
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
  - **The card** (PR 75, options A + B of four mockups; `LFOGroup.vue`; the same size as
    before, 189 px beside Effects, and Noise above it unchanged). No header: a **ribbon** down
    its left edge names it and is its switch, as Noise's (amber, `--lfo-mod`, while on; an LED
    at its top). A **screen** (`.lv-screen`, in each theme's screen colours) draws the wave
    across one bar over the pattern's 16 steps, the ones that are on marked along the bottom:
    Rate shows as cycles per bar, Depth as the wave's height, and with RETRIG the wave starts
    again at each step that's on (`src/lib/lfoPlot.ts`, unit-tested; a 2- or 4-bar rate shows
    its whole cycle, "4 bars · 4 bars shown"). Its readout names the rate, and the target and
    depth ("Pitch 25 cents"), or in amber why the LFO moves nothing ("No Pulse", "FM off":
    `.lfo-status`). Under it Rate, Depth, the wave and RETRIG (`PillSwitch`, now inside
    the card) on one line (the wave: two **keys** with the wave drawn on them, the chosen one
    down with its wave in the LEDs' colour like FM's ratio keys (in the accent until PR 93), `.lk-key`, PR 83, option 1 of two mockups; the other lit them
    in amber with the names; 52 × 36 px, 46 × 26 under 1200 px so the card stays 154 px; a
    small switch with LEDs before), and a **patch bay** (`.lv-bay`): an "LFO out" socket and the five
    targets' sockets (still `role="radio"` buttons, named as before), with one cable from LFO
    out to the target's, hanging under the sockets between (`cablePath`); a click on a socket
    moves it. One cable, because the LFO has one target; the plugged socket is where the patch
    cables (on hold) would leave from. A target that does nothing right now is dimmed, with a
    title saying why. Rotary selectors for Wave and Target (option C) were turned down.
    Under 1200 px the card isn't stretched (154 px), so the knobs sit over the Wave switch and
    RETRIG beside the screen (a media query, not a container query: the desktop's card is
    narrower than a tablet's but taller); a narrow screen shows the rate and depth only. On
    the desktop its own height counts as 154 px (`.sound-stack>.module.mod.lfo-card`), so Noise
    keeps its 119. The phone's Mod page has this card too since PR 106 (until then the card as
    it was, `classic`: the power tile, the Target switch's five buttons on a line of their own,
    option C of PR 61's mockups; `classic` is unused since).
- Audio export uses a **separate** offline engine (`scheduleStepSequencer.ts`), fed by the
  `exportState` computed. It renders only the synth lane. Changes to the live sound (new
  parameters, changed gain staging) must be mirrored there, or exports will sound different.
  (Until PR 34 it sent the noise layer through drive, delay and reverb, unfiltered; now it
  matches the live engine: 40 Hz–16 kHz, straight to the master.) See "Export audio".

### The shape cards
- PR 77 (option C of three mockups, "touch the shape", with the third of three ideas for FM's
  and Unison's middle): Envelope, Pitch, Filter, FM and Unison are each a **screen that draws
  what the card does and can be dragged** (`ShapePad.vue`), with a **mini knob** (26 px, its
  caption under it) for every setting beside it. Every card is the size it was (115 px tall at
  every width; FM was 153 at 390 px, where its ratio buttons wrapped).
  - **Envelope**: the amp envelope; drag the peak sideways for Attack, the end point for Decay.
  - **Pitch**: the sweep against the note (the dashed middle line; both ways for Random); drag
    the start up or down for Amount (above the line: starts above and drops), the settle point
    sideways for Decay. Random is a small toggle under the mini knobs.
  - **Filter**: the low-pass response on a log axis, dashed where the filter's envelope starts
    each note; drag the point sideways for Cutoff and up for Resonance. Env Amt and Decay are
    mini knobs only. The VEL switch is under the mini knobs (FilterModule's `tools` slot).
  - **FM**: a **ribbon** down the left edge is its name and switch (`role="switch"`, as
    Noise's and the LFO's; its LED lights while on, and until PR 93 the whole ribbon was the accent); the screen draws the carrier bent by the
    modulator (a plain sine while off), drag up and down for Amount; the ratio is four **keys**
    under the screen (Lock, Metal, Bell, Free; `.sp-key`, the chosen one down with its label in the LEDs' colour, as every switch; in the accent until PR 93); Freq (Mod Freq,
    for Free) and Amount are mini knobs on the right.
  - **Unison**: a ribbon; the screen draws a wave per voice drifting apart (Detune) and dots
    for where they sit left to right (Spread), drag sideways for Detune and up for Spread;
    **Voices is keys** (2 | 3 | 4 voices; 2 | 3 on a small screen), a knob until PR 77, so
    `unison.voices` is no longer MIDI-learnable (a link saved to it is dropped on load).
- A grip is taken by the nearest one to where the drag starts (`nearestHandle()`). A drag
  emits the same `knob-start` / `knob-end` as the card's knobs, so the main screen shows the
  envelope or filter view meanwhile, and it's one undo step (the pointer is held). FM's and
  Unison's screens don't take a drag while the card is off. The pad takes no focus and is
  hidden from screen readers: the mini knobs are the keyboard's and MIDI learn's way in, with
  the names and value texts the knobs had. The numbers are printed in the screen (the
  readout under the title), so these knobs have no tooltip, except Env Amt, Decay and Freq.
- Time runs on a square-root scale (`timeX()`), so a 20 ms attack shows beside a 2 s decay.
  `src/lib/shapeViews.ts` has the curves and the drag's inverse maps (unit-tested).
- Colours: the screens are each theme's screen colours (as the LFO card's), the curves in the
  screen's own ink (`--sp-line` is `--sp-ink`; the accent until PR 93), not amber: amber stays the LFO's. When
  the LFO moves the cutoff, the Filter screen shows its swing as an amber band and where it is
  now as an amber line; on FM's Amount, the wave as the LFO has it now in amber (from
  `lfoView`; the mini knobs keep their dot and arc).
- The phone's Sound page keeps Envelope, Pitch and Filter as they were: `classic` on
  EnvelopeModule, PitchEnvModule and FilterModule (knobs with a title; no `midi-id`, since each
  id must be on one knob in the source). FM and Unison are the desktop's cards there since
  PR 106, `compact`: the ribbon, the keys and the mini knobs, no screen (`.sp-compact` in
  ShapePad.vue; Unison's keys read 2, 3 there, named "2 voices"...); until then its own FM and
  Unison buttons and knobs. The FM and Unison tiles (`FmTowerButton.vue`, `UnisonButton.vue`)
  were deleted; they're in git history.
- A browser test drags each screen and checks the knobs' values, one undo step for a filter
  drag, the keys, and the cards' heights.

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
- Every 2, **Backbeat**, **Offbeats**, **Accents**, Invert, All (`NoiseModule.vue`) set which
  pads get noise (the noise mask). **A click also turns the card on** (PR 74; one undo step):
  before, the buttons worked while the card was off, with nothing to hear. The card still
  starts off with noise on every pad, so the ribbon alone gives noise on every hit; "on by
  default with no pads" and a Clear button were turned down (a lit switch that does nothing).
  **Backbeat** (beats 2 and 4: pads 5 and 13, where a snare sits) and **Offbeats** (pads 3, 7,
  11 and 15, where an open hi-hat sits) replaced Every 4 and Random in PR 74 (`backbeatMask()`,
  `offbeatMask()` in `src/lib/noise/masks.ts`, unit-tested). Noise is part of a step's note,
  so it's only heard on steps that are on: when none of a button's pads is, a bubble over the
  buttons says "Those steps are off" for 3.5 s ("No pad has noise now" after an Invert that
  leaves none; `noiseGap()`), which is what Backbeat lacked before PR 69. The buttons' letters
  are 0.6rem, 5 px apart (0.65rem and 8 px before), so the two eight-letter names fit; the
  card is the same size.
- The **ribbon** (the NOISE strip on the card's left edge, the card's on/off switch) has an
  LED at its top since PR 74 (`.noise-ribbon-led`, the caps' LED colours), so it reads as a
  switch, not a label.
- **Accents** (PR 69, replacing Backbeat, whose steps 5 and 13 often
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
- **PRE** on the reverb (PR 103; note values since PR 104; `src/audio/reverb/preDelay.ts`,
  both engines): a `DelayNode` on the reverb send, between its tone filter and the convolver,
  so the hit stays dry and clear before the tail starts. It's inside the reverb's stem, so the
  stems still add up. The knob (`reverb.preDelay`, "Reverb pre-delay", MIDI-learnable; 34
  learnable knobs) is the pedal's fourth, in the grid's corner that was empty beside TONE
  (`'tone pre'`), so the pedal keeps its size.
  **Note values at the tempo** (PR 104, the maintainer's call: PR 103's knob was 0–250 ms with
  soft notches at 1/64 and 1/32, whose mint ticks hardly showed on the pale pedals): like the
  delay's TIME, one position per value with a dot each (`markersOnly`), **Off, 1/64, 1/32,
  1/16T, 1/16, 1/16., 1/8** (`PRE_DIVISIONS`; 0, 31, 63, 83, 125, 188 and 250 ms at 120 BPM),
  reading "1/16 · 125 ms". Longer than 1/8 sounds like an echo. Saved as
  `fx.reverb.preDivision`, with its time as `fx.reverb.preDelay` in ms (what the engines read):
  `followPreDelay()` in `DrumSequencer.vue` keeps the time at the value and the tempo,
  synchronously, and `applySnapshot()` works it out on every load, so a saved time can't
  disagree with the knob. A project from before PR 103 gets Off; one from PR 103, with only ms,
  the nearest value at its tempo (`preDivisionForMs()`). The DelayNodes are 1.5 s long (1/8 at
  20 BPM). `soundKey()` leaves the ms out (it follows the tempo), so a tempo change keeps a
  preset lit. A sound setting: presets and File → New put it back to Off, and the Sounds dice
  picks 1/64–1/16 in two of five rolls with the reverb (drawn after the tape, so earlier rolls
  are the same sound). The screen's hit at rest renders that much longer. Live, a change glides
  the delay time (30 ms), bending the send's pitch for a moment, as a delay's TIME does.
  **Notches and dots on the pedals** (PR 104): a knob's notch ticks and position dots are in
  dark ink on the pedals' pale faces (`--knob-detent`, `--knob-marker` and their `-on` /
  `-active` colours, set with the pedals' ink in `_themes.scss`); the panel's mint and violet
  all but vanished there. The delay's TIME keeps its own violet and yellow dots.
  A browser test checks the knob (its values, greyed out while off, saved, following the tempo,
  one undo step) and the export (the reverb stem starts 250 ms later at 1/8, 120 BPM, the dry
  one doesn't move, the stems add up).

- **REV** on the reverb (PR 105; the plan's item after PR 104; `src/audio/reverb/reverse.ts`,
  both engines): the reverb backwards. After each hit the reverb rises instead of decaying,
  then cuts off, so the hit is "sucked into" the next one. The swell comes after its hit, so it
  needs no look-ahead: it works live, in the export, with MIDI notes and inside the reverb's
  stem (the stems still add up). The "pre-reverb" that swells *before* a hit stays a Maybe.
  - **The switch** (option A of three mockups: B beside a shorter treadle, C between the
    knobs): a `PedalSwitch` ("REV", "Reverse reverb") on the ribbon under the LED, its caption
    in the ribbon's light letters, the name moved down 30 px; greyed out while the pedal is
    off. The phone's tall pedal has it on the ribbon too since PR 106 (in the face's top-right
    corner before).
  - **SWELL**: while REV is on the DECAY knob reads SWELL (the maintainer's call) and steps
    through **Next hit, 1 step, 2 steps, 1 beat, 2 beats** (`SWELLS`; saved as
    `fx.reverb.swell`: `'next'`, `'1/16'`, `'1/8'`, `'1/4'`, `'1/2'`), one position each with a
    dot; DECAY keeps its own value meanwhile. One `<Knob midi-id="reverb.decay">` whose range
    switches, so a controller linked to DECAY sets SWELL while REV is on.
  - **Next hit** (the default): each hit's swell lasts until the next step that's on, round
    the bar's end (a lone hit a bar swells for the bar), swing included (`nextHitGaps()`, from
    the pattern as it is when the step is scheduled; a step's repeats share its one swell). The
    engines keep one reversed impulse response per length in whole ms (`revKey()`), each
    behind a gate after PRE; a hit opens its own gate (3 ms glide) as it reaches it (its time
    plus PRE) and shuts the others, and a convolver whose gate shuts plays on, so a swell
    already rising finishes. Live, `revForStep()` from `schedule()`; up to 10 chains, the
    longest-unused dropped. A note with no next hit swells for a beat (`FALLBACK_STEPS`): MIDI
    notes and previews while stopped (that gate is open at rest, `openRevAtRest()`), the
    one-shot and the screen's hit at rest (the export state's `oneShot`).
  - **Fixed lengths**: one gate open all the time.
  - **PRE is taken off** the impulse response's length (`revIrSeconds()`, 20 ms to 6 s), so the
    swell still ends on time.
  - **The impulse response** (`reverseIrChannels()`): smoothed noise rising from −60 dB to full
    over its length, its last 4 ms faded (no click), two channels, fixed random numbers, the
    same energy whatever its length, times `REV_LEVEL` (0.075), measured against the plain
    reverb, whose convolver normalizes its response (this one's doesn't): hits on steps 1 and
    5 at 120 BPM, REV's reverb stem 0.023 RMS, the plain one's 0.023.
  - Saved as `fx.reverb.reverse` (older projects off) and `fx.reverb.swell` (unknown: Next
    hit); a sound setting, so presets and File → New put it off; the Sounds dice turns it on in
    two of five rolls with the reverb (mostly Next hit; drawn last). MIX, TONE and PRE apply
    as to the plain reverb; DECAY's value is kept but unused while REV is on.
  - Browser tests: the switch on the ribbon, SWELL's values, saving and undo; the export (each
    swell rising into the next hit where the plain reverb decays, about as loud, the stems
    adding up); live (a hit's swell stopping where the next hit would be).

### The tape pedal (named lo-fi since PR 99)
- **Named lo-fi** (PR 99, the maintainer's call: it has a vinyl mode, and "tape" reads as a tape
  delay; "Worn" was the other idea): its name on the panel, its title, its switch ("Lo-fi pedal")
  and MIDI learn's names ("Lo-fi age", "Lo-fi wobble"). The code, the CSS and the saved
  `fx.tape` keep "tape", and TAPE | VINYL is still its mode switch.
- The fourth pedal, last in the chain (`src/audio/tape.ts`, both engines; `TapeEffect.vue`):
  the synth with its drive, the echoes, the reverb and the noise layer all go through it.
  Saved as `fx.tape` { enabled, age, wobble, mode } (off, 0.4, 0.3, `'tape'`; a project saved
  before it gets it off at those values; knobs kept within 0–1, an unknown mode is tape). A
  sound setting: presets and File → New reset it (`resetSoundToFactoryDefaults`), and the
  Sounds dice turns it on in a quarter of its rolls (age 0.15–0.7, wobble 0.1–0.6, vinyl in
  30 % of them; drawn last, so every roll from before the pedal is the same sound). AGE and
  WOBBLE are MIDI-learnable (`tape.age`, `tape.wobble`, named "Lo-fi age" and "Lo-fi wobble" since
  PR 99; 33 learnable knobs then, 32 since PR 92).
- **AGE** (`tapeSettings()`): soft saturation (k from 0 to 3; a makeup gain keeps a level of
  0.4 where it was, so quieter sounds come up and louder ones are squeezed), a duller top (a
  12 dB/octave low-pass from 20 kHz down to 3.2 kHz, flat below its cutoff) and the tape's own
  noise (its gain 0.03 × age^1.5). At 0 the pedal changes next to nothing.
- **The saturation is a gain, not a curve the sound passes through**: a WaveShaper reads the
  level of the whole mix (`sidechain`) and adds to a GainNode's `gain` what makes it
  `makeup · tanh(k·x) / (k·x)` (`tapeGainCurve()`, an odd number of points, 0 at silence, so
  no offset). The mix comes out as `tanh(k·mix) / k`, a plain soft saturation, and any part of
  the mix gets the very same gain, which is what lets the export's stems still add up to the
  mix (a curve on each stem wouldn't). Both channels get one gain (the two channels' average).
- **WOBBLE**: a `DelayNode` whose time three sines move (`WOBBLE_PARTS`: for tape a 0.8 Hz wow
  that bends the pitch 1 % at full, a 0.31 Hz drift, 0.4 %, and a 7.5 Hz flutter, 0.2 %; for
  vinyl 33⅓ turns a minute, 0.9 %, and twice that, 0.3 %, no flutter), by `wobble^1.5` so the
  knob's first half stays subtle. The delay rests in the middle of its swing (4 ms at most, so
  a MIDI note is that much later while it wobbles) and is 0 with WOBBLE at 0.
- **TAPE | VINYL** (`mode`): what the noise is (hiss: white noise through 2–11 kHz; or a
  record's crackle, about nine ticks a second and the odd pop, `fillCrackle()`, over hiss at
  20 %) and how the pitch sways. The noise loops in 4 s and 11 s buffers. The crackle's gain
  is 0.3 × age^0.75 (0.15 at the starting AGE), so it's heard sooner than the hiss. **PR 97**:
  each tick is a burst of noise 0.1–0.4 ms long, falling away fast; until then it was a spike
  flipping sign every sample, all its energy at half the sample rate (about 24 kHz), at a gain
  of 0.12 × age^1.5 (0.03), so only the rare pops could be heard (the maintainer heard hiss
  and no crackle). A unit test checks the ticks' energy is in the clicks' band.
- **Live** (`liveEngine.ts`, the `Tape` section): the switch crossfades between round the
  pedal and through it. The noise plays only while something does: while the sequencer plays,
  and for a note played by hand (MIDI, a preview) until 1 s after it ends; then it fades and is
  gone 2 s later (`holdTapeNoise()`), so the app is silent at rest. Its buffers are made when
  the pedal is first switched on.
- **Export** (`scheduleStepSequencer.ts`): the parts' gates meet in `partBus`, which goes
  through the tape; `fullBus` gets every part whatever is rendered, for the saturation. The
  tape's noise is a part of its own, `'tape'` (a fifth stem, `..._tape.wav`, left out while
  the pedal is off or AGE is 0); it takes its random numbers last, so the notes' are the same
  with the pedal on or off. Each sway's rate is moved to the nearest one with whole cycles in
  the bars (`tapeSettings()`'s `loopSeconds`), so a loop repeats without a jump in pitch. The
  noise plays for the bars and stops there (a loop then has no doubled stretch of it where the
  tail is folded on); with the tail it fades for 1.5 s (`tapeNoise.fade`). A **one-shot**
  can't be trimmed where it fades, since hiss never does: it ends where the hit has faded
  under the hiss (the mix less the `'tape'` part, rendered with the same seed), with a 40 ms
  fade (`subtract()`, `fadeOut()` in `src/lib/export/audio.ts`).
- **The panel** (`TapeEffect.vue`): AGE and WOBBLE knobs and a little slide switch between the
  words TAPE and VINYL (a radio group; either word picks it, the lever flips it), greyed out
  while the pedal is off. Green, shaded per theme (`.tape-pedal` in `_themes.scss`). Two reels,
  or a record under its arm, turn while the pattern plays (not with `prefers-reduced-motion`).
- **Where it sits** (PR 90, option C of three mockups; A was four pedals at 87 px in the card
  as it was, too tight, B a wider Effects card that squeezed Noise and the LFO's screen): on the
  desktop a low **deck** across the bottom of the Effects card, under the three pedals and as
  wide as them (`layout="deck"`: a short footswitch and its name on the left, a window with the
  reels, the knobs, the switch, the LED in the corner). The three pedals keep their width and
  knobs, and their footswitch is a 19 px bar (75 px tall before), the name's half in the
  pedal's lighter shade (the `.module.fx .fx-pair` rules at the end of `DrumSequencer.vue`'s
  styles), so the card is the size it was. Under 1200 px (the Effects tab) the same, three
  pedals across at 120 px (about 110 under 720 px; they were one under another there). The
  phone's FX page keeps four tall pedals across, the tape as a stomp box (`layout="pedal"`;
  since PR 106 its reels or record turn in a window over its treadle, beside its name until
  then).
- **The pedals' look** (PR 99, option D1 after four rounds of mockups: A tidied the old
  layout, B three knobs in a row, C the name on a ribbon that was the switch; then C with a
  chrome stomp, hardware, or both (C3); then C3 with a rubber treadle (D1), a rocker, the app's
  cap or a hex footswitch). PR 90's pedals were squashed: TONE's caption sat between the two
  top knobs and its knob ran into their captions. Now (the `EFFECTS PEDALS` section at the end
  of `DrumSequencer.vue`'s styles, `.fx-pair.pedalboard`: the Effects card's and, since PR 106,
  the phone's FX page's, whose pedals stay tall, 236 px, with a 48 px treadle, and include the
  lo-fi stomp box; the Effects card's own rules are `.module.fx .fx-pair`), each pedal is still 183 px tall and the card the size it was
  (407 × 321 px at 1600): its **name runs down a painted ribbon** on its left edge (the pedal's
  colour, darker, light letters) with its **LED at the top**; its face has **corner screws** and
  a bevel, with **two jack sockets** on its top edge; the knobs and its mini switch sit **two by
  two, every caption under its own knob**; and its footswitch is a **ribbed rubber treadle**
  across the foot of the face. The three footswitches have names now ("Delay pedal",
  "Overdrive pedal", "Reverb pedal"). The **deck** has the same: a painted stripe across its
  left end with its LED, name and treadle, screws and a bevel. Its TAPE | VINYL switch stands
  upright, TAPE over the lever over VINYL, while the deck is under 400 px wide (a container
  query; the desktop's deck is 363–377 px), so VINYL no longer runs off the deck at phone
  width (it did at 390 px). A browser test checks the captions, the ribbon, the treadles and
  the deck at 1600, 1024 and 390 px.
- **The overdrive and stems** (found while testing this, on `main` too): with the overdrive
  on, the stems don't reliably add up to the mix. Its curve turns silence into a small steady
  offset (see "Dropped after PR 30"), and Chrome renders that offset differently from one
  offline render to the next (a steady difference of up to 0.01 in some exports, a tiny click
  where a note ends in most). The tape's stems test leaves the overdrive off for that reason.
  The fix would be the odd-count curve dropped after PR 30.
- **Keep-alive in the export** (PR 91): a silent `ConstantSourceNode` (`keepAlive` in
  `scheduleStepSequencer.ts`) feeds `driveSum` and the parts' buses for the whole render. Chrome
  stops processing a node once every source feeding it has finished, at a moment that depends
  on how busy the browser is, so a delay's echoes, the reverb's tail or the tape's path could be
  cut short in one render and not another. PR 90's tape stems test then failed on the deploy's
  machine (the mix 0.07 off its stems); with one CPU core kept busy it failed in 5 of 10 runs
  before and in none of 10 after. It doesn't reach the overdrive's own nodes (above `driveSum`),
  so the overdrive's offset (below) still varies.
- Unit tests (`tape.test.ts`): the knobs' meanings, whole cycles in a loop, the gain curve,
  parts adding up through the mix's gain, the noise. Browser tests measure exports (duller,
  squeezed, hiss between hits, the pitch swaying about 1 %, the stems adding up for tape and
  vinyl, the one-shot's end) and the live path (hiss while playing, gone after Stop).

### Sample a sound
- PR 95 (picked before the Simple view, the maintainer's call). A sound recorded from the
  microphone, about a second, is a ninth wave, `'sample'`, that the pads play at their pitch
  through the same envelope, filter, FM, unison, LFO, noise and pedals, in both engines
  (`src/audio/sample.ts`; `createVoiceSource()` in `waves.ts` takes the buffer).
- **Pitch**: it plays as recorded on A3 (`SAMPLE_ROOT_HZ`, 220 Hz, the pads' default note), an
  octave up twice as fast and half as long, as a sampler plays a key; no pitch detection.
  `createSampleVoice()` gives the buffer a `frequency` parameter, as an oscillator has: a
  `ConstantSourceNode`'s offset, scaled by 1/220 into the buffer's `playbackRate` (set to 0), so
  the pitch envelope (`applyPitchEnv()`), FM (`startFM()`, whose carrier is now any
  `{ frequency }`), unison detune and the LFO's pitch target work on it unchanged
  (`PitchedSource`). `playbackRate` and `detune` are k-rate on a buffer source, so FM moves it a
  block (128 samples) at a time: grainier than on an oscillator. Unison voices start together
  (a recording has no cycle to shift). A recording that ends before the envelope does simply
  stops. `waveGain('sample')` is 1: the recording is at full scale. Without a recording (a share
  link, a project from before), a pad on `'sample'` plays a sine.
- **Recording** (`useSampleRecorder.ts`): REC asks for the microphone (echo cancelling, noise
  suppression and level control off: they eat a hit's attack), then listens, keeping nothing
  until a sound starts, then about a second from 5 ms before it, and stops by itself; after
  6 s it gives up ("Nothing heard", and the console says how loud the loudest moment and the
  room were). A press while it listens or records stops it. The microphone is read in the app's
  own AudioContext by a tiny AudioWorklet from a Blob URL (as the bit crusher), into a silent
  gain; **every channel of the input is summed** (PR 96: a two-input audio interface such as a
  Focusrite's "Analogue 1 + 2" sends input 2 as the right channel, and PR 95 read only the left,
  so a microphone on input 2 was "Nothing heard"). **The start level follows the room** (PR 96;
  PR 95 waited for a fixed −36 dBFS, which an interface's input at a usual gain didn't reach):
  the first 0.15 s measure its noise (`FLOOR_S`), and a sound starts with a block 12 dB louder
  (`onsetLevel()`, at least about −50 dBFS, `MIN_ONSET`). If no block gets there, it keeps the
  loudest moment of what it heard, if that stood out from the room (3 times its noise, and over
  −66 dBFS, `MIN_LEVEL`). `trimRecording()` (unit-tested) starts it at its first sample within
  20 dB of its own peak (`ONSET_SHARE`), cuts it where it stays 50 dB under its peak, fades its
  last 10 ms and sets its peak to full scale, so how loud it came in doesn't matter. Then (`SAMPLE` section of `DrumSequencer.vue`) it
  goes on every pad and becomes the main wave (as a wave tile's click does), and plays once on
  A3; one undo step with the waves. Analytics `sample_record` (with `seconds`).
- **Saved** as `synth.sample` `{ data, sampleRate }`: 16-bit PCM in base64 (about 128 kB for a
  second at 48 kHz), so it's in IndexedDB, the export file, Save as… and undo like any setting
  (an undo step's JSON is that much bigger; the history keeps 100). `sampleFrom()` checks it on
  load (a damaged one is dropped); a project without one opens with none. File → New clears it
  (`resetToFactoryDefaults()`); a sound preset and the phone's Reset keep it (it isn't in
  `resetSoundToFactoryDefaults()`, `applyPreset()` passes it on, and `soundKey()` leaves it out,
  so recording doesn't unlight a preset). **Share links leave it out** (`buildSharePayload()`:
  too big for a link), so their pads on `'sample'` play a sine. `sampleBuffer()` makes the
  AudioBuffer once per recording; an AudioBuffer plays in any context, so the export's offline
  renders and the screen's hit at rest use the same one.
- **Where it sits** (option B of two mockups; A was a tall tile beside Random, which made the
  wave tiles narrower): a strip under the wave tiles and Random, as wide as them
  (`SampleTile.vue`, `.st-strip`, 40 px): REC (a round cap with a red dot, blinking while busy,
  a level meter under it) at its start, then "SAMPLE" with an LED and a picture of the recording
  (or a microphone while there's none). The strip picks the recording for every pad (with none
  it records), lit with the wave tiles' ring while every pad plays it; while recording its
  caption says "Make a sound", "Recording", or afterwards "Microphone blocked" / "Nothing heard"
  (also a `role="status"` for screen readers). On the desktop and the tablet's Sound tab the
  card is the size it was (it had room); in one column (under 720 px) it's 50 px taller. A
  pad's ⋮ menu offers Sample while there's a recording (or the pad still plays it). The pads'
  icon is a jagged burst (`WaveIcon.vue`). The phone's Sound page has the same strip
  (`SampleTile`, 36 px tall there) under its wave keys since PR 106, with Length and the dice;
  until then SAMPLE and REC were the ninth and tenth buttons of its wave grid.
- **Length** (PR 100; a mini knob at the strip's right end, `sample.length` "Sample length",
  MIDI-learnable, greyed out without a recording): how much of the recording the pads play.
  **Full** (the default) plays all of it at the pad's pitch (on A4, half as long): the note
  lasts as long as the recording does, the Envelope card's Attack still applies, its **Decay
  doesn't** (until then a sample note ended at Attack + Decay like the oscillators', so a
  recording longer than 420 ms was cut by the default Decay). Lower plays that share (5 % at
  least), fading over its last 35 % (`SAMPLE_LENGTH_FADE`), as a gate closing; the picture
  shades the part left out, and the strip's caption reads "40% · 330 ms" (on A3) while it
  turns. `sampleSpan()` / `sampleNoteTimes()` / `applySampleEnvelope()` in `sample.ts` time the
  note for both engines (unit-tested); a ratchet's hit still ends it sooner. With the envelope
  switched off the attack is instant. Saved as `synth.sampleLength` (0.05–1; a project saved
  before gets 1). It goes with the recording: a sound preset keeps it (`soundKey()` leaves it
  out), File → New and a new recording put it back to Full. The screen's hit at rest renders
  as long as the sample note lasts (`hitSeconds(state, wave, hz)`). The Melody Maker's screen
  still draws every note as Attack + Decay long, a sample pad's too.
- **In Random** (PR 100): a dice badge on the strip, left of Length, shown once there's a
  recording, so the Random tile can mix sample pads with the waves. Saved in
  `synth.randomWaves` with the waves, as `'sample'` after the eight (`RANDOM_WAVE_IDS` in
  `waves.ts`); in the pool only while there's a recording. A fresh page, File → New and a
  sound preset light it with the others; a new recording lights it; a project saved before
  PR 100 that has a list keeps it out (an older one without a list gets all). Not in the Sounds
  dice: the waves of a random sound stay the eight (`WAVE_IDS`); `PadWave` is a wave or
  `'sample'`.
- Browser tests record from a fake microphone (`fakeMicrophone()`: a falling tone after 0.4 s):
  the strip lights, the file has the recording on every pad, one-shots on A3 and A4 play it at
  twice the speed, the pad menu, File → New and import, one undo step; a quiet microphone
  (−40 dBFS) on the right channel only (PR 96); a blocked microphone; and Length (a one-shot
  at Full lasts the recording, at a quarter about a quarter of it, saved, one undo step) and
  the dice badge (Random with only it lit puts the recording on every pad).

### LFO visualizer
- While the LFO moves something, its movement is drawn on the control it moves, in amber
  (`--lfo-mod`; the themes' knob arcs are blue to purple or
  pink),
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
    `lfoView`); only while FM is on (with it off, the LFO moves nothing). Since PR 77 the
    Cutoff and Amount knobs are mini knobs, so the Filter and FM screens show it too (see
    "The shape cards").
  - Level (PR 62): a dot and an arc on the transport's Volume knob (the Step Sequencer's Vol
    until PR 92 hid it), from full down to (100 − Depth) % of it. Not on the pads (the
    maintainer agreed): a lit pad's fill height is its velocity, so a level shown there would
    look like the velocities moving. The Volume knob is in DrumSequencer's own template, so it's an `LfoModKnob` (a `Knob` that reads the view
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
  `FilterModule`, `FMModule`, the Pulse tile's `WaveButton`, the Volume knob's `LfoModKnob` and
  `SynthStepGrid`. Only components that read
  its fields redraw every frame; `DrumSequencer` itself must never read them in its template,
  or its whole template would re-render 60 times a second.

### The screen's views
- PR 70: **F1 Scope, F2 Spectrum, F3 Spectrogram, F4 Tuner** (`Screen.vue`'s F-keys, 1–4 on the
  keyboard, `handleFKey()`); the chosen view starts on the **Spectrum** (PR 85, the
  maintainer's call; it was the Scope; at rest the hit shows instead, PR 94); the Envelope view lost F4 and, like the filter view, shows only
  while its knobs are turned. Its canvases keep their order (`.nac-screen__lcd canvas`: scope,
  spectrogram, tuner, envelope, filter, the spectrum, then the hit, each added last so the
  others' places stay).
- **The hit at rest** (PR 94; `src/components/hitView.ts`, pure helpers unit-tested; the
  `SCREEN AT REST` section at the end of `DrumSequencer.vue`'s script): while nothing plays
  (stopped, and no note, MIDI or a preview, for 1.5 s: `REST_AFTER_MS`, polled every 200 ms),
  the screen draws one hit of the current sound instead of the chosen view, which would be
  blank (`shownView`: the hit, or `lcdView`). No F-key is lit meanwhile. It's the one-shot the
  Export dialog would make (`renderHit()` in `exportFiles.ts`, sharing `oneShotState()` with
  the one-shot: full velocity, the key's root in the pads' octave, the main wave, effects
  included), but without the tape pedal's hiss (it never fades), with fixed random numbers (so
  it doesn't flicker when nothing changed), rendered only as long as the sound can ring
  (`hitSeconds()`: Attack + Decay, the echoes to −60 dB, 1.2 × the reverb's decay; 6 s at most)
  and cut where it fades below −80 dBFS. A short hit renders in about 25 ms, the Bell preset's
  4.5 s in about 350 ms, off the main thread. It renders again on any change to `exportState`,
  the main wave or the key while it shows (one render at a time; a change during one renders
  once more after it), and once it shows again after changes made meanwhile; not in phone
  mode. Drawn on the shape cards' square-root time scale, so a click shows beside a reverb
  tail: near the start each column runs into the next, so the wave itself is drawn; further
  on, each takes at least a cycle of the note (`hitColumns()`), so the envelope is drawn
  without moiré. Filled in the note's pad colour, outlined in the screen's ink, scaled so a
  hit louder than −12 dB fills the height, the peak dashed. Top: "Hit · A3 Sine" and
  "420 ms · peak −11.7 dB" (the peak in red at 0 dB or more; shortened on a narrow screen);
  ticks along the bottom. A screen reader gets the same as text (Screen's `caption`).
  A knob that holds a view (the envelope, the filter) still shows it, and the hit comes back
  when it's let go; other knobs redraw the hit as they turn. An F-key or 1–4 pressed at rest
  shows that view until things next come to rest (`pickedAtRest`), so the Tuner can be picked
  for MIDI notes. Play shows the chosen view (the Spectrum on a fresh page).
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
  brighter when louder (`spectrumColour()`; its pale-screen branch, darker when louder,
  is unused since PR 89 removed Light), so a note shows in its pad's colour; above the pads' range, harmonics go on from
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
- Opt-in through an "Enable MIDI" button. `MidiToolbar.vue` (button, then the input list and
  Learn) is in the top bar's **gear** (`SettingsMenu.vue`, PR 92, option A of three mockups:
  B was the gear beside File, C theme swatches and a MIDI cap in the bar; the gear's panel has
  Theme over MIDI). Until PR 92 they were a row above the frame (`App.vue`), hidden at 768 px
  and less; now MIDI is offered at every width but in phone mode (the gear isn't there). An
  LED on the gear shows a controller is chosen. A click outside or Esc closes the panel, and
  Learn closes it so the knobs under it can be armed. The panel stays mounted while closed
  (`v-show`), since `MidiToolbar` ends learn mode when it's unmounted.
- Only note-on and control change (CC) messages are handled. Each note-on plays
  `playSynthNote()` with the global waveform and current synth settings, scaled by velocity
  and the synth channel volume. Note-off, pitch bend and MIDI clock are ignored, and so are
  CC 120–127 (channel mode messages such as All Notes Off).
- The AudioContext starts suspended. Clicking "Enable MIDI" resumes it, and a note that arrives
  while it's suspended resumes it and then plays (or is dropped if resuming takes more than
  250 ms, so it's never played late). MIDI notes also start the LFO, as Play does.

### MIDI learn
- A controller's knobs turn the app's knobs. Learn (in the MIDI toolbar, once an input is
  chosen) starts learn mode: the 34 learnable knobs (31 after PR 77 made Unison's Voices keys, 33 with the tape pedal's two, 32 since PR 92 hid the Step Sequencer's Vol, whose `synth.volume` links are dropped on load, 33 again with the sample's Length, PR 100, 34 with the reverb's PRE, PR 103; the reverb's DECAY knob is SWELL while REV is on, PR 105) get a dashed outline and a badge ("CC 21",
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
- **The card** (PR 76; option E2 after four rounds of mockups, the same size as before and as
  tall in both modes; **no dropdowns**: the maintainer found a card of switches for every
  choice "chaotic", so words went on steppers and only numbers stayed switches):
  - **Generate** (PR 82, option A of three mockups: a bigger header cap and Generate beside
    the switch were the others) is the card's last line, the card's width, a cap in the
    accent's colours (as Play and Save) with the preset boxes' dice, naming what it makes:
    "Generate melody" or "Generate arpeggio" (`.mm-gen-bar`; 34 px tall, 28 under 1200 px,
    as tall as the switch row it replaced). From PR 76 to 81 it was a small dark cap in the
    header, which a newcomer didn't see as the button to press. **Melody | Arpeggio** moved
    up into the header in its place (`MelodyModeSwitch.vue`, a group named "Generate makes",
    setting `melodyUi.mode`, which the card follows through `initialMode`). So the card is
    the size it was. Until Generate is first pressed in this browser
    (`useFirstGenerate.ts`, `localStorage` `mm-generated`, one flag for the desktop's and the
    phone's card), the screen says "Press Generate" with what it would make ("for a melody in
    A Minor", "for an arpeggio: Up · 1/16"), over a backdrop, with an arrow to the button (↓,
    ↙ on a wide card), and the button glows (`.is-fresh`; neither moves with
    `prefers-reduced-motion`). The phone's Key page has the same card and header.
  - The **keyboard** as before, with the scale's notes lit on the keys (`inScale()`).
  - **Scale** is a **stepper** (it starts on Minor since PR 87, on a fresh page and after File →
    New, so the first Generate makes a melody; None gave every pad the key): ◂ and ▸ go to the neighbouring scale (round the ends), and a
    click on the name (a small window with a ▾) opens the whole list with full names, as the
    phone's Sound and Pattern do; Esc or a click elsewhere closes it (`openList`). The
    arpeggio's **Pattern** and **Tones** are steppers too (their lists open upwards). Their
    buttons are named "Scale: Minor", "Arp pattern: Up", "Arp tones: Chord". Notched knobs
    were mocked up and turned down (you can't see the choices, and dragging to a scale moves
    the pattern through the ones between).
  - **Range** is **Narrow | Wide**, beside Scale, a melody's only. Low,
    Mid and High went (the same two octaves an octave apart; Pattern Tools' Octave arrows do
    that): Narrow is saved as `'mid'`, and `applySnapshot()` opens `'low'` and `'high'` as it.
    **Narrow is the default** since PR 97 (a fresh page, File → New; it was Wide). With
    Arpeggio, **Octaves (1 | 2 | 3) takes Range's place** beside Scale (PR 97): an arpeggio
    builds its notes from the pads' whole range, starting on the key's root nearest the
    middle of it, an octave lower at a time while its top wouldn't fit (`bakeArp()`). Until
    then it took Range's octaves, so on Narrow 3 octaves came out as two. **Range and
    Octaves share one box** (`.mm-span`, PR 102), the same share of the row in both modes, so
    the Scale stepper keeps its width when the mode changes (it narrowed with Arpeggio:
    "Octaves" and three caps took more room than Narrow | Wide). Moving Rate (1/8 | 1/16) into
    Range's place was the other idea; it would have put the arpeggio's span away from the
    melody's.
  - **The screen** (`.mm-screen`, `src/lib/melody/roll.ts`, unit-tested): the pattern across
    the bar, each step that's on at its pitch (log in Hz over the pads' 100–2000 Hz) in its
    pad's colour, a dashed line for every octave of the key. It also shows what Generate would
    do: with Melody, a band over the notes a melody can use (random, so the notes themselves
    can't be drawn), which is what Narrow and Wide change; with Arpeggio, the notes it would
    write as dashed outlines where they differ from the pattern (`bakeArp(true)` works them
    out without writing them; the Random pattern is shuffled afresh on every Generate, so it
    has none and the readout says "shuffled on Generate"). Readouts: the key and scale, and
    the pool ("A2–G6 • 30 notes") or the pattern and rate.
  - **While playing** (PR 80): a line crosses the screen where the bar is, and the hit it's in
    glows (a white outline and a glow in its colour).
    `usePlayhead.ts` reads the engine's `barPosition()` every frame into one reactive object,
    `playView`, which `DrumSequencer` passes down and never reads (as `lfoView`); only
    `RollPlayhead.vue` (the line) redraws every frame, and `playingHit` (a computed in
    `MelodyMaker.vue`) changes only from hit to hit. The playhead runs 87.5 ms ahead of the
    audio clock (`PAD_LEAD_S`), which is when the pads light (their step is scheduled up to
    100 ms early), so the line reaches a note as its pad lights. With
    `prefers-reduced-motion` there's no line, only the glow.
  - **Each note is as long as it sounds** (PR 80; `rollSegments()` in `roll.ts`): Attack +
    Decay at the tempo (`noteSteps`, from DrumSequencer; Decay alone with the envelope off),
    cut where the next hit begins (the next bar's first one too), at least 0.35 of a step,
    fading towards where its envelope ends (a gradient per hit, ids from `useId()`: the
    phone's Melody Maker is a second one), so a cut note ends brighter. A note that rings past
    the bar's end carries on from its start (`.mm-tail`, not `.mm-note`). A swung step starts
    late, as it plays. Repeats are 2–4 segments, at the pitches the engine plays (stepping up
    or down for Up / Down: `ratchetPitches()`). The voice itself isn't cut between steps (only
    a repeat's hits are); the screen cuts so notes don't overlap.
  - The **scale's dots** on the white keys are 9 px with a dark ring (PR 80: the LED's pale
    green, 6 px, hardly showed on white), in a deeper shade of the LEDs' colour (the accent from
    PR 80 to 92); the black keys keep the LED dot. **The key the pattern is in** has a ring in
    the LEDs' colour, its own white or black kept (PR 93; it was filled with the pink wash),
    and a key waiting for the bar a ghost of that ring.
  - The chosen maker's panel (Melody | Arpeggio is in the header), both in one grid cell so
    the card never changes height: Melody's note (what Generate does); the arpeggio's
    Pattern and Tones steppers over Rate (1/8 | 1/16) and Skip (Octaves is beside Scale).
    Then Generate.
  - **Captions** only where the control doesn't explain itself: Key, Scale, Octaves (an
    arpeggio's, beside Scale). Range,
    Rate, Pattern and Tones have none (their names are tooltips and accessible names), so the
    tones name themselves: Chord, 7th chord, Whole scale.
  - A wide card (a tablet's Compose tab, from 640 px): the screen beside the keyboard, Scale
    and the makers. Under 1200 px the screen is at least 110 px tall.
  - **Compact** (PR 106, the `compact` prop; phone mode's Key page): the keyboard (60 px white
    keys, 84 px from 370 px tall), Scale and the maker's settings in a column, beside the
    screen with Generate under it (the `.mm-group` is `display: contents` there), a tighter
    Scale row (so the arpeggio's Octaves 1 | 2 | 3 fit) and the Scale list in two columns:
    nothing scrolls at 568 × 320, the list open or not. Until PR 106 the phone's card was the
    wide one at 844 px (14 px too tall) and one column at 568 px (203 px too tall).
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
- One Generate button (the card's last line since PR 82): a Melody / Arpeggio switch (in the
  card's header since PR 82) (`mode`, saved as `random` or `arp`; the
  Melody button read "Random" until PR 57, which clashed with the arpeggio's Random order).
  Melody: random notes from the scale and range on the pads that are on, the first one gets
  the key; with no scale, the key's note in the range's octaves, which the note under the
  switch says. **You set the rhythm, Generate picks the notes** (PR 98): it fills only the
  pads that are on, and with none on it fills all 16 and turns them on (`turnAllOn()` in
  `smartGenerate()`; one undo step). Until PR 98 an **Active Pads Only** toggle (on by
  default) could make it fill every pad, the ones that are off too, where nothing is heard; it
  went, with `melody.activeOnly` (a project that has it keeps the field, and nothing reads it). The arpeggio's Pattern, Rate, Octaves
  and Tones show only for Arpeggio. Melody's note and the arpeggio's settings sit in one grid
  cell, the other hidden (`visibility`), so the card is as tall in both modes and the module
  columns around it never move.
- The arpeggio (PR 57; `bakeArp()` builds the notes, `src/lib/melody/arp.ts` lays them out,
  unit-tested): **Rate places the notes**, as a hardware arpeggiator plays them: a note on
  every step at 1/16, every other step at 1/8 (`arpSlots()`), and the steps
  between go off (it emits `update:steps` with the pitches, one undo step). Before, Rate only
  grouped the pads that were on (1/4: four pads in a row one note), and every pad still played.
  An arpeggio sets its own rhythm. **Fitted to the bar** by
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
  both modes. Melody: **Active Pads Only** (removed in PR 98, see above). Arpeggio: **Skip**
  (every other tone of the ladder, 1-5-3-7), saved (`melody.arpSkip`; older projects get
  off). Tones has a third choice, **7th** (`'seventh'`: the 7th chord, 1-3-5-7; "7th chord"
  wrapped in the narrow box), which replaced the menu's "7th on downbeats" (the 7th on every
  beat sounded repetitive). Dropped: Free cycle (the cycle is always fitted to the bar),
  Occasional octave hops (random, so chaotic) and the menu's Reset.

### Tap tempo and Move
- PR 88. **TAP** (`.tap-btn`, a small cap in the Tempo knob's top-right corner, absolutely
  placed so nothing moves): four taps on the beat set the tempo, the average of their gaps,
  rounded and kept within 20–300; each tap after that updates it from the last eight; a pause
  over 2 s starts again (`addTap()`, `tapBpm()` in `src/lib/tapTempo.ts`, unit-tested). It acts
  on `pointerdown`, so a tap lands when the finger does; its name says how many more taps
  ("Tap tempo: 1 more") and its lettering is in the notch colour between the first tap and the
  fourth. Not on the phone (the tempo's − / + is). Analytics `tap_tempo` (with `bpm`), once per
  run of taps.
- **Move** (Pattern Tools' third section, "Octave" until PR 88): **labelled caps** (PR 102,
  option A of three mockups; B was a caption per row with symbols on the caps, C two captioned
  columns, Octave and Steps): **↓ Oct | Oct ↑**, then **◂ Shift | Shift ▸**, then **⇄ Reverse**
  across the section, three rows level with Step Fills' and Humanize's (the same caps, 8 px
  apart), so the card is the size it was. Shift earlier moves every step one to the left, step
  1 round to the end; Shift later the other way, step 16 round to the start (the tooltips say
  so); Reverse plays the pattern backwards. Until PR 102 they were bare arrows (↑ ↓, then
  ◂ ⇄ ▸) on two rows of 19 px caps, and the shifts were called "Rotate left / right", which
  didn't say what they did. In a narrow card (under 340 px, a phone's width) the five sit on
  one row. Each pad's step, velocity, pitch, wave, repeats and what they play, and its noise
  move together (`MOVED_LANE_FIELDS` and `moveList()` in `src/lib/patterns/move.ts`,
  unit-tested; `movePattern()` in `DrumSequencer.vue`; the code still says left / right);
  one undo step. The octave caps move every pad, as the phone's do (PR 98: their **Active
  Pads Only** toggle moved only the pads that are on, and read as if it applied to the others
  too; it went). The phone's Pads page has ◂ ⇄ ▸ too, between Oct and Humanize, named Shift
  earlier, Reverse and Shift later. Analytics `pattern_move` (with `kind`).
- A browser test taps four times, moves an imported pattern whose every list differs from step
  to step (checking all of them, and one Undo), and moves the phone's pads; another checks
  the caps' labels, their rows level with Step Fills' at 1600 px and on one row at 390 px.

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
  Shift+click. A touch screen (`pointer: coarse`: phones, tablets) has no Shift key, so there
  it says "· D at the next bar" (`.mm-shift-hint` hidden, PR 72); the key still waits. In PR 55 it was an outline ring, which never showed: the keyboard's
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
    reads Random after a roll; the two rows alike since PR 72, which removed Pattern's Clear:
    ☰ → Reset… clears the pads), the tempo (− / +) beside **Swing** (PR 73: − / + by the Swing
    knob's notches, 0, 8, 16, 24, 33, 42, 50 %, `SWING_STOPS` and `nextStop()` in
    `knobDetents.ts`), Octave (↓ / ↑: every pad, as Pattern Tools' arrows) beside **Humanize**
    (PR 73: a list of Pattern Tools' velocity shapes, Peaks … Reset, from
    `src/lib/patterns/velocityShapes.ts`, which Pattern Tools uses too; one undo step), and four
    knobs on one line (small, so they fit under the rest on a 320 px tall screen):
    **Decay** (`ampEnvDecayMs`, 50–2000 ms, log), **Tone** (`filterCutoff`, 100 Hz–10 kHz, log;
    turns the filter on), **Sweep** (the pitch envelope's amount, −48…+48, as the Pitch card's
    knob) and **Space** (`reverbMix`, turning the reverb on above 0 and off at 0, and the delay's
    mix at 0.6 times it while the delay is on). The top bar: a tiny oscilloscope of the output
    (on every page; the analyser's waveform from a rising zero crossing, in each theme's screen
    colours), **tiny pads** beside it (PR 73: the 16 pads in two rows of 8 on the same screen,
    only to look at: the steps that are on in their notes' colours, each beat's first step a
    little brighter, the playing step outlined; on every page), the tabs as one segmented bar
    (Pads, Sound, Mod, FX, Key; the chosen one filled and
    outlined in the accent; a horizontal swipe of 70 px moves between them too, not from a
    knob, slider or the pads), **Play / Stop** (on every page, PR 48), Undo, Redo (PR 72) and
    ☰. It fits on one line from 568 px (the first iPhone SE) up (Play's word hidden under
    600 px; under 720 px the scope is 48 px wide and the tabs tighter: those rules came before
    the ones they change until PR 73, so they never applied).
  - **Sound**, **Mod**, **FX** and **Key** pages are the desktop's own panels again (slots in
    DrumSequencer's `PHONE` section), so they write the same settings. **Brought up to date in
    PR 106** (they had fallen behind the desktop's redesigns), and **nothing scrolls at
    568 × 320** (the first iPhone SE held sideways) or 844 × 390 (a browser test checks every
    page at both, the Key page in both modes and with the Scale list open):
    - **Sound**: Envelope, Pitch and Filter as classic cards (knobs with a title; their
      screens would be three more cards' worth of room); under them the wave keys (five
      across, a Random key two wide in the accent, lit only while every pad plays that wave)
      over the desktop's **Sample strip** (`SampleTile`: REC, the recording, its dice, Length),
      and **FM over Unison**, the desktop's cards `compact` (the ribbon, the ratio or voices
      keys, the mini knobs; no screen). Until PR 106: SAMPLE and REC buttons, and FM and Unison
      as a button and one knob each (no ratio, Detune or Spread).
    - **Mod** (PR 73): the desktop's **LFO card** (ribbon, screen, patch bay, RETRIG) and
      **Noise card** with its ribbon (`noise-tv-bg`), side by side from 700 px, one over the
      other below (at 568 px side by side squeezed the LFO's screen and bay). Until PR 106 the
      classic LFO card (the power tile, its five targets on a line) and Noise with an ON pill.
      Noise was a switch and a knob on Sound until PR 73; the LFO wasn't on the phone at all.
    - **FX**: the four pedals in PR 99's look (`.fx-pair.pedalboard`, see "The tape pedal"):
      the name on a ribbon with its LED (and REV under it on the reverb), screws, jack sockets,
      two knobs by two with their captions under them, a treadle; kept tall (236 px, a 48 px
      treadle), the lo-fi stomp box with its reels or record in a window. At most 150 px wide,
      centred (PR 72: the grid stretched them to 262 px). Until PR 106 the pedals of before
      PR 99, but for the name.
    - **Key**: the Melody Maker, `compact` (see "Melody Maker"): the keyboard, Scale and the
      maker's settings beside the screen and Generate. It scrolled at 568 × 320 before PR 106.
    Their knobs don't take MIDI learn's links: `PhoneLayout` provides
    `noMidiLearn`, which `Knob.vue` checks (a second registration would steal the desktop
    knob's link). MIDI isn't offered in phone mode.
  - ☰ opens a menu (laid out in PR 72: before, its buttons sat about haphazardly and the File
    bar's Undo and Redo landed on the name box): a header ("Menu" and a ✕; no Close button),
    **Project**, the File bar itself (`ProjectControls`, moved there by a `Teleport` whose `to`
    changes with the mode, since a Teleport looks its target up again only when `to` changes;
    File, the name, Save, its Undo and Redo hidden as they're in the top bar), **Theme** (the
    theme buttons), and at the bottom **Desktop View** and **Reset…** side by side, the same
    size. Closing the menu drops a Reset question left open. Reset asks first, then
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
  without scrolling (tighter rows there; Open's list of projects beside the panel).
- A phone held upright shows "Turn your phone" (`App.vue`), with "Use the desktop view
  instead". The app is hidden under it (`v-show`) and the page can't scroll (`html.phone-mode`
  in `_general.scss`, as in phone mode), and it sits above everything (the desktop's pad
  numbers are at z-index 1000) and is `100lvh` tall, so nothing shows through and no gap opens
  at the bottom while a phone's address bar slides away (PR 47).
  A page can't turn itself; Android's installed app could (the manifest's `orientation`, not
  set yet: it would turn tablets too).
- The top bar's gear (themes, MIDI) isn't in phone mode: the ☰ menu has the theme buttons, and
  MIDI isn't offered.
- Browser tests run on an emulated iPhone (844 × 390, touch) in landscape and portrait: the
  layout, tap and hold, steppers, the knobs, swipes, the menu and its File menu, Full layout
  and back, the upright hint, the tiny pads, Swing, Humanize and the Mod page (and the top
  bar and every page but Key fitting at 568 × 320).

### Keyboard shortcuts
- Space: play/stop (`onGlobalKeydown` in `DrumSequencer.vue`, ignored while typing). It does
  this everywhere, even on a focused button, knob or pad, on purpose: that's how music apps
  work. Enter presses a focused button.
- 1–4: screen view (Oscilloscope, Spectrum, Spectrogram, Tuner), same handler; ignored while
  typing or while a dropdown list is open. While Attack/Decay, the Pitch card's Amount/Decay
  or Cutoff/Resonance is turned, the screen shows the envelope view or the filter view (neither
  has an F-key), then goes back (`holdScreen`/`onScreenKnobEnd` in `DrumSequencer.vue`); a view
  picked meanwhile stays. At rest, the screen shows the hit (see "The screen's views"), and a
  view picked shows instead until things next come to rest.
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
- **Files**: the **mix**; **effects stems** (dry, delay, reverb, noise, and the tape pedal's own noise; the engine renders one
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
- **Share links** (PR 84; `src/lib/storage/share.ts`, unit-tested): File → **Share link…**
  packs the project as it is now (unsaved changes included) into the link's fragment,
  `/studio2/#p=<code>`, which is never sent to the server, so it works on static hosting. The
  code is the export file's shape (`{ version, meta: { name }, data }`, without the project id
  and `ui`, so the theme and open panels stay the recipient's, and without the recorded
  sound, `synth.sample`), as JSON, deflated
  (`CompressionStream('deflate-raw')`) and in base64url, its first letter `z` (or `j`, plain
  JSON, where a browser has no CompressionStream): about 1.2 kB for a factory project. A touch
  device gets its share sheet (`navigator.share`); a computer gets the link copied ("Link
  copied" at the bottom), or a box to copy it from if the clipboard is refused.
  Opening one (`SHARE LINK` section of `useProjectSync.ts`): at startup, instead of the last
  project, the link's project opens as an **unsaved copy** (`projectStore.openShared()`: a new
  id, `fromLink`, nothing written to IndexedDB until Save, so it never replaces a saved project
  and isn't in File → Open; `lastProjectId` isn't set to it until it's saved, so a reload
  brings back the project from before), checked by `validateAndMigrate()` as an import is. The
  fragment is taken out of the address bar once read (`history.replaceState`), so a reload
  doesn't open the link again over the work since. `ShareNotice.vue` says "Shared pattern:
  Name. Press Play" (browsers don't play audio before a tap; its Play is that tap) until
  playing starts or ✕. A link pasted into an open page (`hashchange`) asks first when there
  are unsaved changes (`projectStore.hasUnsavedChanges()`, ProjectControls' dot). A damaged or
  cut-short link says so and the last project opens. A browser test covers it. Not built yet:
  a "pattern only" link that keeps the recipient's sound. JSON stays the file format.
  Analytics: `share_link` (`method`: share, copy or prompt) and `share_open`.
- A saved project that fails the project check (damaged, or unreadable by this version) is
  never opened: `loadProject()` throws a `BrokenProjectError` (with the project's name). At
  startup, `useProjectSync.ts` then starts a new project and says so in an alert; from
  File → Open, `ProjectControls` says so and keeps the current project. The broken record is
  left in IndexedDB untouched (it still shows in the Open list).
- While the dot shows unsaved changes, `ProjectControls` asks before the page is closed or
  reloaded (`beforeunload`). A project made with File → New counts as unsaved until it's saved.
- **The first visit plays something** (PR 87): the very first visit in a browser (no share
  link, no `lastProjectId`, and no `visited` flag, which every visit sets) opens a starter beat
  instead of empty pads: a built-in sound and a built-in pattern, picked at random
  (`startFirstVisit()` in `DrumSequencer.vue`, which `useProjectSync.ts` calls before the first
  project is made), their buttons lit as if clicked; analytics `first_visit` with both ids. A
  reload reopens it as any project. File → New stays empty (the maintainer's call). The browser
  tests set `visited` before every page loads, so they start from empty pads; one test opens a
  context of its own for the first visit.
- `localStorage` keys (all prefixed): `lastProjectId` (reopened on load), `visited` (the app
  has been opened in this browser: no starter beat), `reset-ui-next`
  (one-shot flag that ProjectControls sets to reset the UI on New Project), `seqOpen`, `ui-theme`,
  `midi-map` (MIDI learn's links, see "MIDI learn"), `mm-generated` (Generate has been
  pressed: no more hint, see "Melody Maker").
- `instruments[]` still contains the hidden kick, snare and hihat lanes (normally with no
  steps on). Keep them so saved projects stay compatible.
- Melody Maker settings (key, scale, range, what Generate makes (`mode`: `random` or `arp`;
  older projects keep the current one), arp pattern, rate, octaves, tones and Skip) live in
  `melodyUi`. `MelodyMaker.vue` reports each change with an event, and follows `melodyUi`
  through its `initial-*` props when a project loads. Since PR 68 that includes Skip
  (`arpSkip`), which was the ⋯ menu's and wasn't saved.
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
  `liveEngine.ts`, `exportState` and `scheduleStepSequencer.ts` (anything that makes noise or
  takes time must still let the stems add up: see "The tape pedal"). Treat a missing field in an
  older snapshot as "use the default", so existing saved projects still load.

## Conventions
- Vue 3 `<script setup>` SFCs, a mix of `lang="ts"` and plain JS. Composition API with
  `ref`/`reactive`/`computed`. Pinia is only used for the project store.
- Indentation is mostly tabs in `DrumSequencer.vue` and 4 spaces elsewhere. Match the
  surrounding file.
- Large files are split into sections with `// X START` / `// X END` banner comments. Keep them.
- Styling: Bootstrap 5 + custom SCSS in `src/assets/styles/`. There are three themes, selected
  by a `theme-*` class on `<html>` (`useTheme.ts`, `THEMES`), each with a button: **Synthwave**
  (the default), **Dark** and **Analog**, all dark. Keep the current look and feel unless a
  change is requested.
  - **Removed** (each in git history): **Sand** (PR 43–44, a matte warm-grey light theme) in
    PR 85; **Slate** (PR 44, a mid-tone blue-grey with teal accents) and the hidden **Light**
    theme (its button had been commented out) in PR 89, with every `.theme-slate` and
    `.theme-light` rule (8.6 kB of CSS). Every element's computed style in the three kept
    themes was checked against the build before, at 1600, 1024, 390 px and phone mode: the
    same, but for the missing button. A browser that had any of them saved opens in Synthwave
    (`useTheme.ts` keeps only a name in `THEMES`).
  - **Analog** (PR 44): a warm dark panel, charcoal with cream lettering and amber accents,
    an amber-to-orange knob arc (so the LFO's marks are cyan there), an amber monochrome
    screen, a wood-brown page and a copper wash.
  - **Dark** (its own page since PR 79): a near-black page and a cool grey-violet wash; until
    then it shared Synthwave's pink-to-violet ones, so it wasn't really dark.
  - **One accent, one job** (PR 93, option A of two mockups; B removed only the gradients):
    the theme's accent is for what you press to make something: Generate, Save and the Random
    wave tile; the pink-to-cyan gradient is on Play only. What's lit or chosen is in the LEDs'
    colour (`--hw-led`, mint; also the knobs' notches): FM's, Unison's and the LFO's keys, the
    chosen wave tile's ring, the dice badges, the scale's dots and the chosen piano key, the
    Step Sequencer's dot, and the FM and Unison ribbons, which are dark with their LED lit, as
    Noise's has one. Amber stays the LFO's. The shape cards' screens draw in their own ink.
    Card edges are a neutral hairline (`.pt-card`, the accent faintly until then). The
    Waveforms card has the other cards' background (its wash went). Not changed: the knobs'
    arcs, focus rings, the notices' and menus' gradient borders, the Noise ribbon's colour,
    and phone mode's own tabs and buttons. Captions on a part that's switched off (the
    pedals', Noise's, FM's) are dimmed but readable: `--pedal-ink-off` 0.8 (0.5 measured 1.2
    to 1.9 : 1), 0.86 on Analog's delay, the darkest pedal, whose orange is a little lighter
    too (#d6894f / #b8693a; 0.74 there measured 2.7 : 1 on the Checks' machine, whose fonts
    draw thinner than a local run's), and the text colour less 42 % off the pedals (#666
    measured 2.9 : 1); the lowest is now about 3.7 : 1 (Dark's delay); FM's
    screen is no longer dimmed twice (FMModule's rule for Freq reached it). The plan's
    "9–10 px violet captions" were already near-white after the card redesigns. Labels stay
    monospace (a plain sans was mocked up and turned down).
  - **The effect pedals** (PR 79, option A of three mockups: B was the pedals in the theme's
    hues, C dark enclosures with a coloured band): each keeps its own colour (an orange delay,
    a yellow overdrive, a stone reverb; the tape deck, PR 90, green), shaded per theme in `_themes.scss` (Synthwave coral
    and lavender, Analog burnt orange and cream), with its name and
    captions in dark ink (white with a glow was hard to read). The pedals read
    `--pedal-hi` / `--pedal-lo` (body), `--pedal-foot-hi` / `-lo` (the name's half; unset, the
    body's), `--pedal-ink`, `--pedal-ink-off` (captions while off), `--pedal-name`,
    `--pedal-name-shadow` and `--pedal-switch-hi` / `-lo` (the footswitch); the fallbacks are
    the first colours. The screen's F-keys are light keys tinted per theme (`--fkey-hi`,
    `--fkey-lo`, `--fkey-ico` in `Screen.vue`; white in every theme before), and FM's and
    Unison's keys take the caps' colours. Fixed on purpose: the pads' note colours, the LFO's
    amber, the Noise card's Color swatch, the footswitches and sockets.
  - Theme colors are CSS variables set per theme in `_themes.scss` (the `$themes` map, plus
    per-theme blocks; the knobs' and pads' in `_drumSequencer.scss`, the screen's in
    `Screen.vue`); use them rather than a fixed color that only suits the dark themes. For
    example `--pt-inset` is the background of an inset panel inside a card (Pattern Tools'
    sections, the Sounds and Patterns boxes; mixed lighter, the Sound and Compose sections):
    dark. Others: `--pt-wash` (a pink-to-violet
    gradient, now only the page behind the frame in Synthwave: the Waveforms card and the
    Melody Maker's chosen key lost it in PR 93; `--pt-wash-ink` is the text on it),
    `--pt-page` (the page behind the frame, the wash unless a theme sets it),
    `--pt-noise-on` (the NOISE switch when on), `--pt-surface-3` (the NOISE switch when off;
    unset, so the fallback), `--pt-menu-caption` (captions in the ⋯
    menus). A new theme needs a button, its name in `THEMES`, a `$themes` entry, and the
    blocks above. A light theme would need dark text in many places the dark themes take
    for granted (Light had `.theme-light` rules for them before PR 89; see git history).
  - In a scoped `<style>`, write `.theme-analog .x` (Vue scopes the last part only, so the class
    on `<html>` still matches); `:global(.theme-analog) .x` drops the `.x`.
  - Browser tests check that those panels' captions and the pedals' names are readable in every theme, and
    that each button applies and remembers its theme.
- Buttons (PR 63, "soft caps", option A of three mockups): every button is one of three
  hardware kinds, and their look is in one place, `src/assets/styles/_hardware.scss`.
  - A **push button** is a raised cap that sinks while pressed and springs back: every
    `.pt-btn` and `.pt-seg-btn`, and anything with the class `hw-cap` (File, Undo, Redo, Save,
    the tempo's − and +, the preset boxes' dice, Generate, Play). `hw-cap-sm` is a small cap
    (1 px of travel instead of 2). Generate, Save and Play are caps in the accent's colours
    (they set `--cap-hi`, `--cap-lo`, `--cap-edge`, `--cap-ink`); Play stays down while playing.
    Only Play has the pink-to-cyan gradient; Generate and Save are one hue (see "One accent").
  - A **switch** is a row of caps; the chosen one stays down with its LED lit. `hw-led-top`
    puts the LED over the label (Melody | Arpeggio, FM's ratios, the LFO's Wave and Target, the
    pad settings, the Export dialog); `hw-led-mini` is a slim LED bar at the cap's top edge
    where the label leaves no room (the presets, the theme buttons, MIDI Learn).
  - A **toggle** is a cap with an LED beside its label (`hw-led-left`), down and lit while on:
    Filter's VEL switch and RETRIG (`PillSwitch.vue`), Pitch's Random, the Repeats brush, the
    arpeggio's Skip (Pattern Tools' and the Melody Maker's Active Pads Only were toggles until
    PR 98). The
    tiles (the eight waves, and on the phone the LFO's power tile; FM's and Unison's until PR 77) are caps too, with the LED beside
    their caption; they keep their icons, animations, dice and the Pulse Width knob (which
    goes down with its tile), and the chosen one has a thin ring in the LEDs' colour (the accent
    until PR 93). The Random tile stays filled in the accent (the maintainer's call): it makes
    something, as Generate does.
  - A cap counts as down when it has `is-active`, `on`, `active`, `hw-down`,
    `aria-pressed="true"` or `aria-checked="true"`, whichever its component already used.
  - **A cap never changes the layout:** the edge under it is a `box-shadow` and a press is a
    `transform`, so every cap is the size it was before PR 63 (checked against the build
    before, every card and button at 1600, 1280, 1024, 820 and 390 px: only the pills that
    gained an LED are a few px wider). A component gives its cap a size and nothing else: no
    background, border colour, box-shadow or transform of its own. Padding for an LED comes
    out of the cap's own padding.
  - The caps' colours are per theme (`--cap-hi`, `--cap-lo`, `--cap-edge`, `--cap-ink`; the
    LED's `--hw-led`, `--hw-led-off`): dark caps in every theme with a button.
    Clear and Reset have red lettering (`pt-danger`).
  - Not caps, on purpose (the maintainer's call): the pedals' CRUSH and PING PONG switches and
    footswitches. Also left as they were: the screen's F-keys, the piano keys, the NOISE
    ribbon (which got an LED in PR 74), the LFO card's ribbon and sockets (PR 75), FM's and Unison's ribbons and keys and Pitch's Random pill aside the screens (PR 77), the ⋯ menus and their sliding switches, the Sound / Effects / Compose tabs, the
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
  ring in the notch colour (`--knob-detent`, mint:
  apart from the blue-to-pink arcs and the LFO's amber); while the knob sits on a notch
  (`at-detent`), that tick and the pointer light up (`--knob-detent-on`), and the Tempo and
  Swing readouts under their knobs too (`.stepper-value.on-stop`). Notches now: Tempo 60, 90,
  100, 120, 140, 160, 174 (`TEMPO_DETENTS`); Swing 8, 16, 24, 33, 42 % (`SWING_DETENTS`: the
  knob's 0–50 % moves every second step up to half a step, a drum machine's 75 %, so these are
  its usual 54, 58, 62, 66 and 71 %; 33 % is a triplet and reads "33% (triplet)"); every
  bipolar knob's middle; a pad's Fine at 0; Noise Color's Pink, White and Blue. Knobs with
  hard stops (Delay Time, the LFO's Rate) have none.
  A drag follows the mouse on `window` until its `mouseup`; since PR 97 a move with no button
  held ends it too (`ev.buttons === 0`), for a release the page never heard (let go outside
  the window, a touchpad's tap-and-drag): the maintainer saw WOBBLE keep following the mouse
  now and then. It couldn't be reproduced here, and nothing in the page swallows a release.
- Layout (PR 41, "C1", picked from mockups): one piece of hardware that fills its frame, the
  `LAYOUT` sections of `DrumSequencer.vue`'s template and styles (a CSS grid, `.ds-grid`).
  The frame fills the window less a 16 px margin, up to 1320 px (`.app-frame` in `App.vue`),
  instead of Bootstrap's container steps, with 16 px above and below (PR 92: nothing sits
  outside it any more). The logo sits at the top bar's left end (ProjectControls' `brand`
  slot; the link home; hidden under 576 px, where the project name needs the room), the gear
  at its right end, after Save and its dot (the `tools-right` slot). The Step Sequencer has
  no Vol knob while there's one lane (PR 92): the lane's `channelVolume` is still saved and
  played (a project's is kept, File → New's is 0.5), and comes back as each machine's level.
  From 1200 px: the transport and the Step Sequencer on the left two thirds, the screen beside
  them as tall as both; under them two recessed sections, **Sound** (two thirds) and
  **Compose** (Pattern Tools, Melody Maker), which end on one line (Sound's last row and Melody
  Maker take up any difference). Sound is three rows, each filled edge to edge: Waveforms |
  FM over Unison; Envelope | Pitch | Filter (three screens on one line, their mini knobs beside
  them; see "The shape cards"); Noise over LFO | Effects. A card stretched taller than
  its controls keeps them centred. FM and Unison are cards of their own; their ribbon is the
  on/off switch. Under 1200 px: the screen beside the
  transport, the steps across, then tabs (Sound, Effects, Compose; not saved) under the steps,
  showing one at a time (`data-tab` on the grid; the arrow keys move between tabs); under
  720 px one column, the screen on top. Cards that change shape with their width use
  container queries on their own width, not the window's: Pattern Tools (three sections side
  by side, the same height, two buttons across; stacked under 340 px), Noise (mask buttons
  beside the knobs, under them below 320 px), the classic LFO card (Wave / Target captions hidden under
  440 px, so it stays one row; unused since PR 106), and
  Melody Maker (its screen beside the keyboard and controls from 640 px, as in a tablet's Compose tab;
  that left column stops at 400 px and a one-column card's keyboard at 420 px, centred, so the
  keys keep about the desktop's shape: PR 78). The Effects tab's pedals are their desktop size
  (120 px wide), centred, three across with the tape deck under them (PR 78; they were
  stretched); under 720 px still three across, about 110 px each (PR 90; one under another
  before, when each had its tall footswitch).
  A browser test checks the arrangement at 1600 and 1280 px (flush bottoms, one line of knobs,
  rows filled, titles on one line, no sideways scroll) and the tabs at 1024 and 390 px, and
  another that every control can be clicked (none drawn over by another) at 1600, 1280, 1024
  and 390 px, in every tab: a stretched card is a flex item, and a flex item with a `z-index`
  is drawn over earlier positioned siblings, which hid the Noise switch (its ribbon) after
  PR 41. The
  Waveforms panel shows its eight tiles as a 4×2 grid, and **Random** as a tall tile in a
  narrow ninth column beside them (PR 83, option B of two mockups; A was a 3×3 grid, whose
  tiles came out wider than tall; `RandomWaveTile.vue`, 58 px wide, as tall as both rows). It
  replaced a long button under the tiles that stayed down while the pads played a mix, so it
  didn't read as something to press again. Random **never stays down**: each press rolls the
  pads' waves again (from the waves whose dice badge is lit), and its dice tumbles: it hops
  and turns a quarter at a time, showing a new face each turn, and lands on a face other than
  the one it started from (PR 85; before, it spun a whole turn round a point off its centre,
  its face never changing, and shrank mid-roll on the first press; it's 26 px either way
  now). With `prefers-reduced-motion` no tumble, only the new face. **Which waves the dice
  badges pick from is saved with the project** (PR 85; `synth.randomWaves`, the waves in the
  tiles' order; before, the page kept it, so it carried over to File → New and every project
  opened): File → New and a sound preset (`resetSoundToFactoryDefaults()`) light every badge,
  a project saved before it opens with all, and `soundKey()` leaves it out (a badge isn't
  part of the sound, so it doesn't unlight a preset). A badge clicked is an undo step. While the pads play a mix it shows it: a small bar per
  pad in its wave's colour (`padWaves`, `WAVE_PALETTES`' middle colour; two columns of eight),
  over "Mix / roll again" (its accessible name says so too). A wave tile is lit only while
  every pad plays its wave (`litWave` in `DrumSequencer.vue`, PR 64); after Random, or a pad's
  wave changed in its ⋮ menu, the pads play a mix: no tile is lit. The card is the size it was
  wherever it's stretched (1200 px and up, and the tablet's Sound tab); in one column (under
  720 px) it's 40 px shorter, without the long button. The phone's Sound page keeps its own
  wave keys (five across, TRIANGLE as TRI), lit by `litWave` too since PR 106, with a Random
  key two wide in the accent (it rolls the pads' waves, as the tile does). The main wave (`selectedWaveform`, for MIDI notes and the
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
`loadAllSamples` (which downloads `public/audio/*.mp3`, since PR 87 only once a drum lane has a
step on, from an older project; before, on every visit). The maintainer
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
changes it as ideas come up; the list now is the one agreed in PR 86, with the brainstorms
after PR 96 and PR 99 first). The drums come back as
the Drums machine (item 6), not as the old sample lanes.

The maintainer's review after PR 49 (the pad popup, presets, Melody Maker and Unison) was
done in PRs 50, 51 and 52.

PRs 55–63 come from the maintainer's brainstorm after PR 52 (Claude's recommendations, minus
what the maintainer turned down: Converge or Up + octave as arpeggio patterns, Pan as an LFO
target, and for now a second oscillator and a second pad lane, on hold below).

The maintainer's brainstorm after PR 73 is done (its three small fixes were PR 74, the LFO
card PR 75, the Melody Maker PR 76, the plain cards PR 77). The brainstorm after PR 77's
leftovers (dragging notes on the Melody Maker's screen, the octave arrows at the edges) are
Maybes below (its first items were PR 78, the stretched keyboard and pedals, PR 79, the theme
colours, PR 80, the Melody Maker's screen while playing, and PR 84, share links; Generate made obvious and the Random wave tile were PRs 82 and 83). No one else uses the app yet, so older projects need no special care: a removed
setting can simply stop applying.
PR 85 was a list of the maintainer's own after PR 84 (Sand removed, the Spectrum first, the
Random tile's dice, the dice badges saved).

**The review after PR 85** (PR 86 records it; no code). Claude built and used the app, read
around the market, and put 38 ideas with mockups on a page; the maintainer answered each Yes,
Maybe or No. The list below is the Yes answers in the agreed order; the Maybes and Nos follow
it. What the review found, and what the answers settled:
- **The look:** no overhaul. Targeted fixes now (PRs 89, 92 and 93; fitting the window, put off below), and one layout
  change later, with the machines (item 5), so the layout changes once.
- **The first visit** is silent (no step is on) and the glowing Generate gives every pad A
  (Scale starts at None): PR 87, before anything else.
- **One 16-step bar repeats forever:** patterns A–D and a chain (item 3).
- **More sequencers are small machines with hard limits** (items 4–7), not copies of today's
  panel: they share the tempo, the key and scale, the pattern slots and the pedalboard; one is
  on the pads at a time. Today's synth becomes the **Rhythm** machine and stays the DFAM-style
  core (see "Design intent").
- **Money:** nothing is charged for. Launch free and see who comes back (put off below) before any
  paid route; a plugin or a native app (a new sound engine) was turned down.

Redesigns are visual: every control keeps working as it does, and each card keeps its size.
They are for the desktop first; the phone can keep what suits it. Each starts with a few
mockups for the maintainer to pick from (built in the app behind a URL switch, photographed
onto one page, the code kept on the branch without a PR), as the LFO card's, the Melody
Maker's, the plain cards', Generate's and the Random tile's did. What they settled: a ribbon switch, a small screen that shows what the controls
do, sockets, steppers that open a list for a choice of words, switches for numbers, captions
only where a control doesn't explain itself, not too many buttons on show, and the action
button where the eye ends up (Generate, PR 82).

**The maintainer's brainstorm after PR 96** (corrections to what exists, before more
features; Claude's recommendations, which the maintainer agreed to). Its fixes were PR 97 (a
knob drag that ends when the button is up, vinyl crackle that can be heard, Narrow as the
Melody Maker's default, an arpeggio's Octaves not held back by Range), PR 98 (both Active
Pads Only toggles removed), PR 99 (the pedals' look, and the tape pedal named lo-fi) and
PR 100 (the sample's Length, and the sample in Random).

**The maintainer's brainstorm after PR 99** (recorded in PR 100; Claude's review, to be
confirmed by the maintainer, who may reorder it). Fixes and polish first, as before, then the
screens, then the groovebox. Its first items were PR 102 (the Move tools and the Melody Maker's
Scale), PR 103 (the reverb's pre-delay), PR 104 (PRE in note values), PR 105 (REV on the
reverb) and PR 106 (phone mode brought up to date). After PR 103 the maintainer asked about a "pre-reverb" (a reversed reverb swelling
into each hit, the Maybe below); REV is the part of it that needs no look-ahead.

1. **The desktop view on a phone** (Desktop View in ☰, or a tablet; `pointer: coarse` under
   720 px): the pads in **two rows of 8**, as phone mode's (today they wrap into uneven rows
   of 44 px pads); Pattern Tools' caps and the like taller on a touch screen (44 px is the
   usual finger target; at least the 32 px the phone's caps are). **Scrolling over the
   screens:** the shape cards' screens (`ShapePad.vue`) take every touch (`touch-action:
   none`), so a finger that lands on one while scrolling turns a setting instead. On a touch
   screen a screen should only take a touch that starts on a grip (the dots it draws, within
   about 20 px), letting the page scroll from anywhere else (`touch-action: pan-y` on the
   screen, and `preventDefault` only once a grip is held); the mini knobs beside them still
   set everything. Turning the screens off for touch altogether (the maintainer's idea) is
   the fallback if grips prove fiddly; they're the cards' most visible part.
2. **Spread the big screen's views around** (mockups, ideally with the machines' layout, item
   5, since what fills the freed space is their rail): the Spectrum behind the Filter card's
   curve, the Tuner in the Melody Maker, the hit at rest faint behind the Envelope card's
   curve, the scope and spectrogram small (a strip, perhaps in the top bar as phone mode's tiny
   scope). Several small screens are cheap to draw (one shared frame loop; none drawn while
   nothing sounds or off screen). **The Spectrum's left end** (the maintainer's question):
   the sound has no cutoff there (the pads go down to 100 Hz; only the noise layer has a
   40 Hz high-pass), it's the drawing: the analyser's bins are about 23 Hz wide, the bottom
   three (to about 70 Hz) are left out because of the overdrive's DC offset (`SKIP_BINS`),
   and every column of the log axis below that is drawn empty, so the curve starts with a
   wall between C1 and C2. Fix it with the views: a DC blocker (a 10 Hz high-pass) on the
   analyser's own tap instead of skipping bins, a bigger FFT for the Spectrum (8192: about
   6 Hz a bin), and the axis starting where the bins can say something (about 30 Hz).

Grow into a small groovebox:

3. **Patterns A–D and a chain** (about three PRs). Four pattern slots per project: a slot
    holds the steps, notes, velocities and repeats; the sound is shared. A slot clicked while
    playing takes over at the next bar (the bar queue, with its ghost). Copy A to B. Under the
    slots, a chain of up to eight cells plays them in order, and Export audio can render the
    chain. No timeline. Saved so that a pattern is a list of tracks from the start, even with
    one track, and the machines need no second change to saved projects.
4. **Groundwork for the machines** (about three PRs; nothing to see or hear). One function
    that builds a note, used by the live engine and the export engine (today two engines kept
    in step by hand); each track's settings moved out of `DrumSequencer.vue`; a gentle limiter
    on the output (dropped after PR 30 for one voice; four machines summed need it).
5. **The Bass machine**, and the layout for machines: a rail beside the pads (each machine's
    name, mute, level and a tiny row of its steps); the pads show the chosen machine; the Sound
    section becomes the chosen machine's panel; a send to the pedals per machine; a stem per
    machine in the export. Bass: one note at a time, 30–250 Hz, saw or square with a sub, one
    filter with its envelope, Accent per step, about six knobs (Cutoff, Reso, Env, Decay, Sub,
    Drive), following the key. Decide Slide and Tie (a Maybe below) when it starts. Mockups
    first; the phone gets a way to choose the machine.
6. **The Drums machine.** Four slots × 16 steps. A slot holds one hit: the built-in kit (the
    Kick, Snare and Metal presets, frozen) or a sound made on Rhythm and kept with "Keep as
    drum" (the one-shot render); Tune and Decay per slot. A slot plays a recording, which is
    light work for a phone. It replaces the hidden sample lanes: their playback code is reused,
    the rest and the three mp3 files go (see "Dead code").
7. **The Drift machine** (strings, ambience; after the Elta Solar 42F, whose swarm voices,
    touch plates, one slow filter, joystick and short sequencer are worth borrowing; its
    per-voice knobs and microtonal tuning are not). Six plates, one per note of the key's
    chord; a touched plate latches a small swarm of detuned oscillators, fading in over a bar
    or more; an X/Y pad (the filter one way, the swarm's spread the other); Attack and Release
    in bars; no steps: its sequencer counts bars, a chord per bar for 4 or 8 bars, across the
    pattern chain; straight to the reverb.
8. **Major-version upgrades** (Vite 8, Pinia 4; Vite 8 most likely with Vitest 5), whenever
    the maintainer wants some maintenance, each as its own PR.

Put off after PR 93 (the maintainer's call: back to them after some of the items above):
- **Show it** (put off after PR 96, the maintainer's call: wanted, but back to them once the
  features have settled; its signature, the tape pedal, was PR 90; the screen at rest, PR 94;
  Sample a sound, PR 95):
  - **A Simple view on desktop.** Phone mode's layout (big pads, the Sound and Pattern
    steppers, four knobs) on a computer, as Simple | Full in the top bar, remembered; the full
    panel stays as it is.
  - **Lessons.** A Learn item in the menu: about ten short lessons that light one control at a
    time ("drag this point left: the hit gets darker"), built on the hint Generate has.
  - **Launch free and measure; a tip jar.** Mostly the maintainer's: a short video, posts where
    synth people gather and to the sites that cover free browser instruments. Claude's part: a
    Support link in the gear menu, an analytics event for a visitor who comes back within a
    week, and a first free pack of one-shots made with the app. Nothing is charged for.
- **Fit the window without scrolling** (put off after PR 70; moved up in the review; put off
  again after PR 93 until the sequencer stops growing, since the machines will change its
  size): the panel is 1,356 px tall at 1600 px wide, so the pads scroll away on most laptops.
  Centred vertically when it fits: tighten spacing (the screen's margins, the gaps between
  sections; the desktop's pedals got short footswitches in PR 90), then scale the frame down
  to fit short windows (with a floor). Measure at the maintainer's screen and common laptop
  sizes, once the machines' rail is there (item 5).
- **Record a take** (put off after PR 93, for now). A REC cap beside Play records what's heard,
  knob moves included, to a WAV (the output captured without loss, in a worklet), and stops
  with Stop. Export renders the pattern as set; it can't capture a filter sweep that's
  performed.

Maybe (the maintainer's answer in the review, or earlier; ask before starting one):
- **A reverse-reverb swell** ("pre-reverb", from the brainstorm after PR 99): a reversed tail
  that rises into each hit (REV, PR 105, swells after a hit into the next, which needs no
  look-ahead; this would swell before the first hit too, and is best left until after the
  machines' groundwork, item 4, where one function builds a note for both engines). A hit's swell starts before the hit, so it needs the pattern ahead
  of the live engine's 100 ms lookahead: easy in the export (render, reverse, place), harder
  live (schedule each hit's swell from the pattern a bar ahead, so a change takes a bar). The
  PR 34 "reverse swell" variation was dropped as DAW work; this would be a pedal setting.
- **Kit export:** in Export audio, every lit pad as its own one-shot, and sixteen rolls of the
  Sounds dice as sixteen one-shots.
- **Slide and Tie per step** (a pad's ⋮ menu): Slide glides into the next note, Tie holds a
  note through the next step. The Acid preset and the Bass machine want them.
- **Last step:** a pattern length of 1–16 (a marker dragged along the pads); 12 steps is 3/4.
- **Photo → beat:** a photo's sixteen columns become the pads (colour → note, by the pads' own
  colour scale; brightness → velocity; the darkest columns off; snapped to the key), and maybe
  the sound too. All in the browser.
- **Word seed:** a word typed seeds both dice, so the same word always gives the same sound and
  pattern; maybe four sliders that steer the roll (dark–bright, soft–hard, sparse–busy,
  dry–wet).
- **Evolve:** at each bar line one small thing changes (a note to its neighbour in the scale, a
  velocity, a hit a step along); Keep writes what's heard into the pattern, Back returns.
- **A wave that talks** ("Voice"): the saw through three vowel filters, a mini knob sweeping
  A-E-I-O-U, an LFO target.
- **Orbit:** the row of notes repeats every 5, 6 or 7 steps while the rhythm stays at 16.
- **Tilt and shake** on the phone: tilt to sweep Tone, shake to roll the dice.
- **Google Play** (on hold below), once the launch shows phone use.
- **Drag notes on the Melody Maker's screen** (from the brainstorm after PR 77): up or down,
  snapping to the scale, one undo step, a preview while stopped, using the shape cards' drag
  code. It's a second editor for the pads' pitches, and fiddly on a 110 px screen.
- **Octave arrows at the edges** (the maintainer isn't sure). `octaveShiftAllSkip()` moves each
  pad on its own and skips those that would leave 100–2000 Hz, so a pattern near an edge gets
  squashed (its intervals change); it also moves `globalOctaveOffset` when pads were skipped.
  Proposed: all or nothing (if any pad can't move, none does), the arrow greyed out with a
  title saying why; the phone's Octave ↓ / ↑ too; a unit test.

Turned down in the review after PR 85 (the maintainer's No): drawing a wave (a ninth tile whose
cycle is drawn by hand); a slicer (a guitar or other live input chopped by the pattern); Rain
(drops falling on the pads, a way to play Drift); describing a beat to an AI (it would need a
paid server); a paid Pro unlock; a native app or a plugin (see "Not now"). Claude also advised
against, and nobody asked for: a full visual overhaul, an arranger with a timeline, ads, a
subscription, an AI model running in the browser, a webcam controller.

Decided after PR 73 (the maintainer's call, "for now"): the Sound and Pattern presets stay in
the transport card, and Step Fills and Humanize in Pattern Tools; they aren't gathered in one
place. The transport's boxes replace everything (a starting point); Pattern Tools' buttons
edit what's there.

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
browser tests use `__swingOver` to ignore it. Found in PR 90: with the overdrive on, it also
keeps the export's stems from adding up exactly (see "The tape pedal"); an odd-count curve would
fix both.

On hold (ask the maintainer before starting; put on hold after PR 33, "not now"):
- **ESLint** (put off after PR 52, the maintainer's call), once ESLint and typescript-eslint
  move to `minimatch` 11 (see "No linter yet"). Checked after PR 37: ESLint 10.14 and
  typescript-eslint 8.72 still need `minimatch` 10, and `npm audit` reports 10 moderate
  advisories for them.
- **A second oscillator (VCO 2)** (put off after PR 52): as on the DFAM and Edge, its own
  interval (a fifth, an octave, detuned) and level, maybe hard sync or VCO 1 → 2 FM; a card,
  both engines, presets, the dice, saving. It must sound unlike the FM card's modulator, which
  is already a second oscillator.
- (A second 16-pad lane, put off after PR 52, is planned now as the machines, items 4–7.)
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
- (Several patterns chained into a song: planned now, item 3.)
- **32 steps, or per-lane lengths** (the export code's types already allow 32; "Last step", a
  Maybe above, is the smaller version).
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
- The old drum-lane items (lanes through the pedals with pitch, decay and pan; custom samples
  stored in the browser; drum kits; the export rendering only the synth lane; the sample paths
  that depend on the trailing slash) are overtaken by the Drums machine (item 6), a send and a
  stem per machine (item 5) and Sample a sound (PR 95). Still on hold from them: samples
  loaded by drag-and-drop, and drum slots played by MIDI notes.
- **Shared session ("jam"):** several people on one URL, for example one phone playing the
  drum lanes and another the synth. It needs a realtime relay between devices; the site is
  static files on shared hosting, so that means a third-party service (not decided yet).
  Design: one device (a laptop, perhaps plugged into a TV) makes all the sound, and the
  phones are remote controls that each show their own part, so network lag only delays when a
  change takes effect, never the beat. Phones that each made the sound would drift apart and
  flam. Also to decide: who can join (a room code), and what undo means with several people.
  Share links (planned, above) would build part of it (the project packed into a compact
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
| 72 | Phone mode fixes: the ☰ menu laid out (a header with ✕; Project: File, name, Save, without the Undo and Redo that landed on the name; Theme; Desktop View and Reset… side by side at the bottom), Redo beside Undo in the top bar, the Pattern row without Clear (like the Sound row; Reset… clears), the FX page's pedals at most 150 px wide and centred (they were stretched to 262), and on a touch screen the waiting key's caption without "Shift+click". |
| 73 | Phone mode additions: tiny pads in the top bar (two rows of 8 in their colours, the playing step outlined, on every page); a **Mod** page with the LFO card (it wasn't on the phone) and the Noise card with its pad buttons (Noise left the Sound page); **Swing** beside Tempo (− / + by its notches) and **Humanize** beside Octave (the velocity shapes, now `src/lib/patterns/velocityShapes.ts`, shared with Pattern Tools), the four knobs on one line; the small-phone rules (a narrower scope and tabs under 720 px), which never applied, fixed. |
| 74 | Three fixes from the maintainer's brainstorm after PR 73 (whose plan it also adds: the LFO, Melody Maker and plain-card redesigns): the Pitch card's RND toggle reads **Random**; a Noise pad button turns the card on, **Backbeat** and **Offbeats** replace Every 4 and Random, a note says when a button's steps are all off, and the NOISE ribbon has an LED; the **Repeats brush** stays picked but shows it (a dashed frame round the pads with a tag, a cursor carrying ×3), and a click elsewhere puts it down. |
| 75 | The LFO card redesigned (options A + B of four mockups), the same size as before: a ribbon down its left edge is its name and switch, as Noise's; a screen draws the wave across the bar over the pattern's steps (Rate as cycles per bar, Depth as height, RETRIG starting it again at each hit; `src/lib/lfoPlot.ts`); and a patch bay, one cable from LFO out to the target's socket. Under 1200 px the knobs sit beside the screen, so the card is no taller; the phone keeps the card as it was. |
| 76 | The Melody Maker redesigned (option E2 after four rounds of mockups), the same size and as tall in both modes, with no dropdowns: Generate in the card's header (a dark cap with the preset boxes' dice); the scale's notes lit on the keyboard; Scale, Pattern and Tones on steppers whose name opens the list; Range as Narrow | Wide (Low and High open as Narrow); a screen that draws the pattern and what Generate would do (a melody's band of notes, an arpeggio as outlines; `src/lib/melody/roll.ts`); captions only on Key, Scale and Octaves. |
| 77 | The plain cards redesigned (option C of three mockups, "touch the shape"), each the size it was: Envelope, Pitch, Filter, FM and Unison are screens that draw what the card does and can be dragged (the envelope's peak and end, the sweep's start and settle point, the filter's point for Cutoff and Resonance, FM's Amount, Unison's Detune and Spread), with a mini knob for every setting beside them; FM and Unison have a ribbon switch, and their ratio and voices are keys under the screen (`ShapePad.vue`, `src/lib/shapeViews.ts`). The phone keeps the cards as they were. |
| 78 | The Melody Maker's keyboard and the effect pedals no longer stretch in the tabbed layout (under 1200 px): the pedals keep their desktop size (120 px wide; they were 190 on a tablet, 168 on a phone), three across and centred, one under another under 720 px (three across they'd be 105 px and their labels collide); the wide Melody Maker card's left column stops at 400 px, so the white keys stay near the desktop's 51 px (67 before at 1024 px), and a one-column card keeps its keyboard at most 420 px, centred. Plan: the maintainer's brainstorm after PR 77. |
| 79 | Theme colours: **Dark** has a near-black page of its own and a grey-violet wash (it shared Synthwave's pink ones); the **effect pedals** follow the theme (option A of three mockups): each keeps its own colour, shaded per theme, with its name and captions in dark ink, readable now (white with a glow wasn't); the screen's F-keys are tinted per theme (white in every theme before), FM's and Unison's keys take the caps' colours, and the link under the frame has a colour in Dark and Synthwave. A browser test checks the pedals' names in every theme. |
| 80 | The Melody Maker's screen while playing: a playhead line crosses it and the note that sounds glows, in step with the pads (only the glow with reduced motion; `usePlayhead.ts`, `RollPlayhead.vue`); each note is drawn as long as it sounds (Attack + Decay at the tempo, cut at the next hit, its tail fading), repeats as their 2–4 hits, stepping up or down for Up / Down (`rollSegments()` in `roll.ts`); the scale's dots on the white keys are bigger, in the accent with a dark ring. |
| 82 | Melody Maker, part 2 (option A of three mockups): Generate is a full-width accent cap at the card's bottom naming what it makes ("Generate melody" / "Generate arpeggio"), Melody | Arpeggio moved up into the header, the card the same size; until Generate is first pressed in the browser, the screen says "Press Generate" (with what it would make) and the button glows. |
| 84 | Share a project as a link: File → Share link… packs the project (unsaved changes included, without the theme) into the link's `#p=…` fragment, deflated, about 1.2 kB (`src/lib/storage/share.ts`); the phone's share sheet, else copied. Opening one loads it as an unsaved copy, never over a saved project and not in File → Open until saved, and says "Shared pattern: press Play"; a link pasted into an open page asks first if there are unsaved changes; a damaged link says so. |
| 83 | The Waveforms card's Random is a tall tile in a narrow ninth column beside the eight waves (option B of two mockups): it never stays down, its dice tumbles on each press, and while the pads play a mix it shows it (a small bar per pad in its wave's colour, "Mix / roll again"); the LFO card's Sine / Square are two bigger keys with the wave drawn on them, lit in the accent like FM's ratio keys (option 1 of two). Cards keep their size. |
| 86 | The plan after the review following PR 85 (no code): Claude reviewed the app as a whole (look, missing sequencer basics, strange ideas, patterns, more sequencers, money) as 38 ideas with mockups; the maintainer's Yes answers are the new list in order (a first visit that plays, tap tempo and rotate, three themes, chrome inside the frame, one accent, fit the window, record a take, a tape pedal, the hit on the idle screen, a Simple view, sample a sound, lessons, launch; then patterns A–D and a chain, and the Bass, Drums and Drift machines), the Maybes and Nos recorded under it. |
| 87 | A first visit plays something: the very first visit in a browser opens a starter beat (a built-in sound and a built-in pattern, picked at random, their buttons lit) instead of empty pads; File → New stays empty. The Melody Maker's Scale starts on Minor (it was None, so the first Generate gave every pad A). The hidden drum lanes' mp3 files are no longer downloaded on every visit (only once one of those lanes has a step on). |
| 88 | Tap tempo, Rotate and Reverse: a TAP cap in the Tempo knob's corner (four taps set the tempo, `src/lib/tapTempo.ts`); Pattern Tools' Octave section became **Move**, the octave arrows over ◂ ⇄ ▸ (rotate a step either way, round the bar's end, or reverse; each pad's step, velocity, pitch, wave, repeats and noise move together, one undo step; `src/lib/patterns/move.ts`), the card the same size; the phone's Pads page has ◂ ⇄ ▸ too. |
| 89 | Three themes: Synthwave, Dark and Analog stay; **Slate** (its button, its name in `THEMES`, its CSS) and the hidden **Light** theme (every `.theme-light` rule) removed, 8.6 kB of CSS; a browser that had either saved opens in Synthwave, as Sand's did. Every element in the three kept themes has the computed style it had before (checked at four widths), but for the missing button. |
| 85 | The maintainer's list after PR 84: the **Sand** theme removed (a browser that had it opens in Synthwave); the screen opens on the **Spectrum** (F2) instead of the Scope; the Random tile's dice tumbles properly (a hop and quarter turns, a new face each turn, landing on another face, one size); and the wave tiles' dice badges (which waves Random picks from) are saved with the project, so File → New and a sound preset light them all again and an opened project brings its own (they carried over before). |
| 90 | A tape pedal, last in the chain (`src/audio/tape.ts`, both engines; the noise layer goes through it too): AGE (soft saturation, a duller top, the tape's own noise), WOBBLE (wow and flutter from a short delay whose time drifts) and TAPE \| VINYL (hiss, or crackle and pops, and how the pitch sways). The saturation is a gain that follows the whole mix, so the export's stems still add up; the tape's noise is a stem of its own, a loop's wobble fits the bars, and a one-shot ends where the hit fades under the hiss. Saved (older projects: off), reset by presets, rolled by the Sounds dice, AGE and WOBBLE MIDI-learnable. On the desktop it's a deck under the three pedals, whose footswitches became short bars (option C of three mockups); the phone has four pedals. |
| 91 | Fix: PR 90's deploy failed on its tape stems test, which passed on the PR. On a busy machine Chrome stopped processing the export's delay, reverb or tape path at moments that varied from render to render, cutting echoes from one stem or the mix and not the others. A silent source now keeps them running to the end of every export render (`keepAlive` in `scheduleStepSequencer.ts`); with a CPU core kept busy the test failed 5 times in 10 before and never in 10 after. |
| 92 | Theme and MIDI inside the frame (option A of three mockups): a gear at the top bar's right end opens Theme (Synthwave, Analog, Dark: lightest to darkest) and MIDI (`SettingsMenu.vue`), with an LED once a controller is chosen; the row above the frame and the link under it are gone, and the logo is the link back to Ephemeral Wave (in the gear's panel under 576 px, where the logo is hidden). One volume knob: the Step Sequencer's Vol is hidden (its value still plays), no longer MIDI-learnable, and the LFO's Level mark is on the Volume knob. |
| 93 | One accent, one job (option A of two mockups): the accent only on what makes something (Generate and Save, one hue each, and the Random wave tile), the pink-to-cyan gradient on Play only; FM's, Unison's and the LFO's lit keys, the chosen wave tile's ring, the dice badges, the scale's dots, the chosen piano key (a ring instead of the wash), the Step Sequencer's dot and the FM and Unison ribbons' LEDs in the LEDs' mint; the shape screens' curves in their own ink; card edges neutral; the Waveforms card without its wash. Captions on a switched-off part readable (the pedals' 1.2–1.9 : 1 → 3.7 : 1 and up; Analog's delay pedal a little lighter); FM's screen no longer dimmed twice while off. Labels stay monospace. |
| 94 | The screen at rest shows the hit: while nothing plays, the screen draws one hit of the current sound (the one-shot the export would make, rendered offline in a few tens of ms) as a waveform on a square-root time scale, in its pad's colour, with its note, length and peak, redrawn as the sound changes (`src/components/hitView.ts`, `renderHit()`); Play brings back the chosen view, and a view picked at rest shows instead until the next rest. Plan: fitting the window and Record a take put off. |
| 95 | Sample a sound (before the Simple view, the maintainer's call): REC in a strip under the wave tiles (option B of two mockups) records about a second from the microphone, from just before the sound starts, and the pads play it as a ninth wave, Sample, at their pitch (as recorded on A3) through the same envelope, filter and pedals, in both engines (`src/audio/sample.ts`, `useSampleRecorder.ts`, `SampleTile.vue`); saved with the project (16-bit PCM in base64), kept by sound presets, cleared by File → New, left out of share links; offered in a pad's ⋮ menu and on the phone's Sound page. |
| 96 | Fix: REC said "Nothing heard" to the maintainer's Focusrite (a microphone on input 2, at a usual gain): the recorder read only the input's left channel (input 2 is the right) and waited for a fixed −36 dBFS. Every channel is summed now, the start level is 12 dB over the room's own noise (at least −50 dBFS), and if nothing gets there the loudest moment is kept, trimmed against its own peak. Also: the tape pedal's squeeze test (PR 90) measured the mix, whose random hiss moved its result from export to export (it failed this PR's checks by 0.1 %); it measures the dry stem now, the same every time. |
| 97 | Fixes from the maintainer's brainstorm after PR 96 (whose plan it also adds; the Simple view, Lessons and the launch put off): a knob drag ends when the mouse moves with no button held, for a release the page never heard (WOBBLE sometimes kept following the mouse); the vinyl's crackle can be heard (its ticks flipped sign every sample, so their energy sat at about 24 kHz, and their gain was 0.03; now bursts of noise at 0.15, over a quieter surface noise); the Melody Maker's Range starts on Narrow, and is the melody's only: with Arpeggio, Octaves sits in its place and spans the pads' whole range (on Narrow, 3 octaves came out as two). |
| 98 | Both Active Pads Only toggles removed (the plan's first item after PR 96's brainstorm): the Melody Maker's Generate gives new notes to the pads that are on (you set the rhythm, it picks the notes), and with none on fills all 16 and turns them on, one undo step; Pattern Tools' octave arrows move every pad, as the phone's do (the toggle moved only the pads that were on, and read as if it applied to rotate and reverse too). `melody.activeOnly` is no longer saved. Every card keeps its size; Move's two rows are centred in their section. |
| 99 | The effect pedals redesigned (option D1 after four rounds of mockups), the card the size it was: each pedal's name runs down a painted ribbon on its left edge with its LED, its face has corner screws, a bevel and two jack sockets on its top edge, its knobs and switch sit two by two with every caption under its own knob (TONE's caption sat between the top knobs and its knob ran into their captions), and its footswitch is a ribbed rubber treadle; the deck has the same stripe, screws and treadle, and its TAPE \| VINYL switch stands upright when narrow (VINYL ran off it at phone width). The tape pedal is named **lo-fi** (it has a vinyl mode, and "tape" read as a tape delay); `fx.tape` is still the saved name. The phone's tall pedals are unchanged but for the name. |
| 100 | Sample: **Length** and **in Random** (the plan's first item after PR 96's brainstorm): a mini knob at the SAMPLE strip's right end plays the whole recording (Full, the default) or a share of it with a fade; a sample note now lasts as long as the recording at the pad's pitch, the Envelope card's Attack kept and its Decay no longer cutting it (`sampleNoteTimes()` in `sample.ts`, both engines); saved as `synth.sampleLength`, kept by presets, Full again on File → New and a new recording; MIDI-learnable (33 knobs). A dice badge on the strip, lit once there's a recording, lets Random mix sample pads in (`'sample'` in `synth.randomWaves`). Plan: the maintainer's brainstorm after PR 99 reviewed and added (Move tools and the Melody Maker's widths, pre-delay, phone mode brought up to date, the desktop view on a phone, the Spectrum's left end), before the screens and the groovebox. |
| 101 | Fix: PR 100's deploy stopped at its checks: PR 98's Generate test expected pad 6 to get a new random note, which is A again about 1 time in 15 (PR 100's seeding of `Math.random` didn't hold, as the page draws random numbers of its own meanwhile). The test presses Generate until pad 6's note changes, up to 20 times. |
| 102 | Move and the Melody Maker's Scale (the plan's first item after PR 99's brainstorm): Pattern Tools' Move has labelled caps, ↓ Oct \| Oct ↑, ◂ Shift \| Shift ▸ and ⇄ Reverse across, three rows level with Step Fills' (option A of three mockups); "Rotate left / right" are **Shift earlier / later**, on the phone's Pads page too; a narrow card puts the five on one row. Range and Octaves share one box beside Scale, so the Scale stepper keeps its width in both modes. Every card keeps its size on the desktop; at 390 px Pattern Tools is 24 px shorter. |
| 103 | Pre-delay on the reverb (the plan's first item after PR 102): a PRE knob, the reverb pedal's fourth, in the corner beside TONE (the pedal keeps its size), holds the reverb send back 0–250 ms before the convolver, so the hit stays dry before the tail; notches at 1/64 and 1/32 of a bar at the tempo; both engines, inside the reverb's stem (the stems still add up); saved as `fx.reverb.preDelay` (older projects 0), reset by presets and File → New, sometimes rolled by the Sounds dice, MIDI-learnable (34 knobs; `src/audio/reverb/preDelay.ts`). |
| 104 | PRE in note values (the maintainer's call after PR 103, whose plan it also adds: REV, a reversed reverb that ends on the next hit, is next): the reverb's PRE knob steps through Off, 1/64, 1/32, 1/16T, 1/16, 1/16. and 1/8 at the tempo, like the delay's TIME, and its time follows the tempo (`fx.reverb.preDivision`; a project from PR 103 gets the value nearest its ms). Knob notches and position dots on the pedals are in dark ink (the panel's mint ticks all but vanished on the pale pedals, Analog's cream reverb most). |
| 105 | REV on the reverb (the plan's item after PR 104): a switch on the reverb pedal's ribbon, under the LED (option A of three mockups), plays the reverb backwards, so each hit's reverb rises into the next hit and cuts off. While it's on, DECAY reads SWELL: **Next hit** (each swell lasts until the next step that's on, round the bar, swing included; one reversed impulse response per length behind a gate, opened as the hit reaches it) or 1 step, 2 steps, 1 beat, 2 beats; PRE is taken off so the swell still ends on time; a note with no next hit (MIDI, a preview, the one-shot) swells for a beat. Both engines, inside the reverb's stem; about as loud as the plain reverb; saved as `fx.reverb.reverse` and `fx.reverb.swell` (older projects off), reset by presets, rolled by the Sounds dice (`src/audio/reverb/reverse.ts`). |
| 106 | Phone mode brought up to date (the plan's first item after PR 105), every page fitting without scrolling at 568 × 320 and 844 × 390 (a browser test checks both): the FX page's pedals in PR 99's look, kept tall (the name on a ribbon with its LED, REV under it, screws, jacks, knobs two by two, a treadle; the lo-fi pedal's reels in a window); the Key page's Melody Maker `compact` (the keyboard, Scale and the maker's settings beside the screen and Generate; it scrolled 203 px at 568 × 320); the Sound page's wave keys lit only while every pad plays that wave, with a Random key and the desktop's Sample strip (REC, Length, the dice), and FM and Unison as the desktop's cards without their screens (ratio keys, Voices keys, Freq, Detune and Spread, none on the phone before); the Mod page's LFO and Noise as the desktop's cards (ribbon, screen, patch bay). No mockups: every look is one the maintainer already picked for the desktop. |

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

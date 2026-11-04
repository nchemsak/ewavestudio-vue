# Ephemeral Wave Studio

Browser-based 16-step percussion synthesizer and step sequencer. This repo is **version 2**,
served from https://www.ephemeralwave.com/studio2/. The original version stays at
https://www.ephemeralwave.com/studio/ and is never updated or overwritten, so the two can
be compared; never deploy this code to `/studio/`. Everything runs client-side with the Web
Audio API; there is no backend. Features: one 16-step synth lane with per-step pitch, velocity and
waveform; amp envelope, pitch envelope, filter, noise, FM, unison and LFO; delay, overdrive
and reverb; Web MIDI note input; a random melody and arpeggio maker; an oscilloscope,
spectrogram, tuner and envelope display; WAV export; and projects saved in IndexedDB with JSON
import and export. Earlier versions also had sample drum lanes (kick, snare, hihat and
user-loaded samples). Their UI is commented out and they are no longer part of the app, but
some of their code remains (see "Dead code").

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
  WAV encoding, storage names and the playback clock. `vitest.config.js` reuses
  `vite.config.js` and sets `BASE_URL` to the real base, so code sees `/studio2/` as in the app.
- **Browser tests** (Playwright, Chromium), `e2e/app.spec.ts`: build, serve with
  `vite preview`, then drive the app. An init script keeps a handle on the app's AudioContext
  (`__ctx`), records every scheduled note and the per-note LFO taps, measures the output
  level (`__peakOver(ms)`), tracks keydown listeners on `window` (`__keydown`), and can pause
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

The build prints hundreds of Sass deprecation warnings that come from Bootstrap's SCSS.
They are expected, and the build still succeeds.

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
src/lib/storage/         IndexedDB via `idb` (db.ts, projects.ts), JSON import/export,
                         namespace.ts (storage names, one set per site folder)
src/lib/schema/projectSchema.ts  Project file check (hand-written, no library) + v1→v2
                         migration (CURRENT_VERSION = 2)
src/composables/useTheme.ts      synthwave | dark | light theme, stored in localStorage
src/assets/styles/       Bootstrap overrides + all global SCSS (themes are in _themes.scss)
public/audio/            kick.mp3, snare.mp3, hihat.mp3: still fetched at startup, but only
                         used by the hidden drum lanes
public/images/           Background textures/GIFs referenced from SCSS via ../images/
.github/workflows/deploy-studio2.yml  Builds `main` and uploads it to /studio2/ (see Deploy)
.github/workflows/checks.yml  Type check, unit tests and browser tests (every PR, every deploy)
src/**/*.test.ts         Unit tests (Vitest; vitest.config.js)
e2e/app.spec.ts          Browser tests (Playwright; playwright.config.ts)
```

### Audio engine (live), in `DrumSequencer.vue`
- One `AudioContext` is created when the component's script first runs. It is resumed on the
  first Play click.
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
- Web MIDI (`navigator.requestMIDIAccess`), opt-in through an "Enable MIDI" button. The device
  selector is teleported into `#midi-toolbar-slot` in `App.vue`.
- Only note-on messages are handled. Each one plays `playSynthNote()` with the global waveform
  and current synth settings, scaled by velocity and the synth channel volume. Note-off, CC,
  pitch bend and MIDI clock are ignored.
- The AudioContext starts suspended. Clicking "Enable MIDI" resumes it, and a note that arrives
  while it's suspended resumes it and then plays (or is dropped if resuming takes more than
  250 ms, so it's never played late). MIDI notes also start the LFO, as Play does.

### Keyboard shortcuts
- Space: play/stop (`onGlobalKeydown` in `DrumSequencer.vue`, ignored while typing).
- 1–4: screen view (Oscilloscope, Spectrogram, Tuner, Envelope), same handler; ignored while
  typing or while a dropdown list is open.
- Ctrl/Cmd+S: save (`ProjectControls.vue`). Escape closes menus and popovers.

### Saving / projects
- `buildSnapshot()` turns all UI and synth state into a plain object; `applySnapshot()` restores
  it. Shape: `{ meta, ui, transport, synth, fx, instruments[], melody, selectedWaveform }`.
- Storage names come from `src/lib/storage/namespace.ts` and include the site folder, because
  browsers share storage across a whole website: `/studio2/` uses the IndexedDB database
  `ewave-studio2-db` and `localStorage` keys `ewave-studio2:*`. Version 1 on `/studio/` uses
  `ewave-db`, `ewave:*`, `seqOpen` and `ui-theme`, so the two never see each other's projects
  or settings. Always go through `STORAGE_NS` / `storageKey()`; never hard-code a name.
- A deep watcher copies the snapshot into `projectStore.data`. Edits are written to IndexedDB
  (`projects` store) only on an explicit Save in `ProjectControls` (the Save menu item or
  Ctrl/Cmd+S); creating a project also writes an initial record. A status dot shows unsaved
  changes.
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
  the `/studio2/` base.
- Analytics: `trackEvent(name, params)` calls `window.gtag`. Separate copies of this helper
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
- Do one item at a time, as one PR (the `DrumSequencer.vue` split is three PRs).
- Start the next item only when the maintainer says so. They usually start a new chat for
  each item, and "do the next item" means the first one under "Next, in this order".
- The PR that finishes an item also updates this list: move the item to "Done".

Next, in this order:
1. **Split `DrumSequencer.vue`** (about 4,800 lines) into modules, one PR each:
   - the live sound engine;
   - MIDI;
   - saving and loading projects.

   Behavior and sound must not change. This prepares live playback and WAV export to share
   one engine later, and unblocks most of the features below.
2. **Accessibility:**
   - Knobs get a slider role and work from the keyboard.
   - Step pads can be reached with Tab.
   - Space on a focused button presses that button instead of toggling Play.
3. **Trim the CSS** (333 kB):
   - Import only the Bootstrap parts in use.
   - Silence the Sass deprecation warnings.
   - The look must not change: include before/after screenshots of all three themes.
4. **Features**, one PR each, ranked by value for effort (the maintainer may reorder):
   1. Undo/redo (the app already builds full snapshots).
   2. Drum lanes through drive, delay and reverb, with per-lane pitch, decay and pan
      (only if the drum lanes come back).
   3. Store custom samples in the browser, and load them by drag-and-drop (drum lanes).
   4. Built-in preset library of synth patches (and drum kits, if those come back).
   5. Share a project as a link (the project encoded in the URL).
   6. Master limiter/compressor (louder output without clipping).
   7. Step probability, ratchets (quick repeats within a step) and timing humanize.
   8. Several patterns (A/B/C/D) chained into a song.
   9. More MIDI: MIDI learn for knobs, MIDI clock sync, MIDI out, and drum lanes played by
      MIDI notes.
   10. Play the synth from the computer keyboard. `ComputerKeyboard.vue` in git history has a
       key-to-note map.
   11. Export options: N bars or loops, stems, MIDI file.
   12. 32 steps, or per-lane lengths (the export code's types already allow 32).
   13. Per-step parameter locks (for example a different filter cutoff on each step).
   14. Install as an app (PWA) that works offline.
5. **ESLint**, once ESLint and typescript-eslint move to `minimatch` 11 (see "No linter yet").

Not scheduled yet: smaller items from reviews. Ask the maintainer before starting any of them.
- **Change tracking is heavy.** Every change rebuilds the whole snapshot and turns it into
  JSON several times, even each frame of a knob drag. This happens in the UI → store watcher
  in `DrumSequencer.vue` and in `hashOf` in `ProjectControls.vue`. Debounce it.
- **A broken last-opened project fails silently.** If it fails the project check at startup,
  it isn't opened and no message appears. Save then does nothing (`store.loaded` stays false)
  until File → New. Show a message and start a fresh project instead.
- **WAV export renders only the synth lane.** This matters only if the drum lanes come back.
- **`README.md` is still the Vite template.**
- **`npm run dev` sends analytics events.** The gtag snippet in `index.html` always runs.
- **Drum sample paths depend on the trailing slash.** They are relative to the page
  (`audio/kick.mp3`), so they break if `/studio2` is opened without its trailing slash and the
  server doesn't redirect. Only the hidden drum lanes use them.
- **Major-version upgrades were left out on purpose** (Vite 8, Pinia 4). If wanted, do each as
  its own PR.

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

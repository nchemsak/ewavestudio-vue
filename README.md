# Ephemeral Wave Studio 2

A percussion synthesizer and 16-step sequencer that runs in the browser:
**https://www.ephemeralwave.com/studio2/**

It's in the spirit of analog percussion synths such as the Moog DFAM and Behringer Edge: sounds
shaped by short envelopes on pitch, filter and level, played by a step sequencer. Everything
runs on your own device with the Web Audio API. There is no server and no account, and your
projects stay in your browser.

This is version 2, a rewrite in Vue 3 and Vite. The original version stays at
https://www.ephemeralwave.com/studio/ and is never changed.

## Features

- One 16-step synth lane with per-step pitch, velocity and waveform: sine, triangle, saw,
  square, a pulse with adjustable width (and LFO pulse-width modulation), organ, hollow and glass;
  any step can repeat 2–4 times within its time (a ratchet: a roll or stutter)
- Amp envelope, a drum-style pitch envelope, a filter with its own envelope, noise, FM, unison
  and an LFO, whose movement shows on what it moves (the Cutoff knob, the Pulse tile or the
  step pads)
- Velocity routing: a VEL switch on the Envelope, Pitch, Filter and Noise cards lets a step's
  velocity also shape its decay, brightness, pitch sweep and noise, so soft steps sound like
  softer hits
- Delay (synced to the tempo, with a ping-pong switch), overdrive (with a bit-crusher switch) and reverb
- Six built-in sounds (Kick, Snare, Metal, Pluck, Acid, Bell) that set the sound without
  touching your pattern, and six built-in patterns (Pulse, Offbeat, Gallop, Rolls, Bassline,
  Broken) that set the pattern in your key without touching the sound; each with a dice that
  rolls a random one
- A melody maker: random notes or an arpeggio in a key and scale. Click a key to move the
  pattern there (and hear it); pick a scale and the notes follow
- Oscilloscope, spectrogram, tuner and envelope views
- Play it from a MIDI keyboard, and turn its knobs with a MIDI controller's (MIDI learn; Web
  MIDI: Chrome, Edge and other Chromium browsers)
- Projects saved in the browser, with undo/redo and JSON import and export
- Export audio for a DAW: seamless loops of 1–8 bars (or with the tail), effects stems (dry,
  delay, reverb, noise) that add up to the mix, a MIDI file of the pattern, and a one-shot of
  the sound at any note, as one .zip
- Keyboard shortcuts: Space plays and stops, 1–4 switch the screen view, Ctrl/Cmd+S saves,
  Ctrl/Cmd+Shift+S saves as a new project (File → Save as…), Ctrl/Cmd+Z undoes
- Knobs with soft stops at common values, lit up when a knob sits on one: Tempo (60, 90, 100,
  120, 140, 160, 174 BPM; it starts at 120), Swing (including a triplet feel), the middle of
  two-way knobs
- Install it as an app (Chrome or Edge: the install button in the address bar, or File →
  Install app…): its own window and icon, and it works offline

## Running it locally

You need Node 20.19+ or 22.12+.

```bash
npm install
npm run dev        # then open http://localhost:5173/studio2/
```

Other commands:

```bash
npm run build      # production build into dist/
npm run preview    # serve the build at http://localhost:4173/studio2/
npm run typecheck  # type check (vue-tsc)
npm test           # unit tests (Vitest)
npm run test:e2e   # build, then browser tests (Playwright)
```

Before the first `npm run test:e2e`, install the test browser once with
`npx playwright install chromium`.

Only production builds include the Google Analytics tag (`build-plugins/googleAnalytics.js`),
so `npm run dev` sends no analytics.

## Deploying

Every push to `main` runs the checks (type check, unit and browser tests) and, if they pass,
uploads the build to `/studio2/` on the website (`.github/workflows/deploy-studio2.yml`). Pull
requests run the same checks. Open copies of the app (tabs and installed apps) then show "A new
version of the app is ready"; Reload switches to it.

## Working on the code

[CLAUDE.md](CLAUDE.md) is the detailed guide: architecture, the audio engine, how saving and
undo work, conventions, the deploy setup, and the planned work.

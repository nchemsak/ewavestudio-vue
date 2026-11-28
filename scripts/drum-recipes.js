// scripts/drum-recipes.js
// The recipes of the Drums machine's kit sounds that came with PR 135 (the plan's item 17),
// played into an OfflineAudioContext by scripts/render-drum-kit.mjs, which loads this file as a
// plain script in Chromium (so no imports or exports). Each is a few Web Audio nodes, not the
// Rhythm voice: its only filter is a low-pass, which is why the first kit's Hat was just a
// higher, shorter Metal. A recipe gets the context, where to play and seeded random numbers,
// and returns how long it rings (s); `rate` is the sample rate it's kept at (22.05 kHz for the
// kicks, tom and conga, which have nothing above 11 kHz, so the kit's download stays small).
// The maintainer picked these by ear from an audition page of candidates (the hats: filtered
// noise, picked over the 808's six square waves; the slot 3 sound: the Tom).
//
// The 808's clap is a few quick bursts of noise and a tail; its kick a sine whose pitch drops
// fast, ringing long.

/* eslint-disable no-unused-vars */
const DRUM_RECIPES = (() => {
	// White noise from `random`, `seconds` long
	function noise(ctx, seconds, random) {
		const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
		const d = b.getChannelData(0);
		for (let i = 0; i < d.length; i++) d[i] = random() * 2 - 1;
		const s = ctx.createBufferSource();
		s.buffer = b;
		return s;
	}
	// A gain that jumps to `peak` (after `attack` s) and falls exponentially, about −60 dB at `decay`
	function hit(ctx, t, peak, decay, attack = 0.001) {
		const g = ctx.createGain();
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(peak, t + attack);
		g.gain.setTargetAtTime(0, t + attack, decay / 6.9);
		return g;
	}
	function filter(ctx, type, f, q = 0.7) {
		const n = ctx.createBiquadFilter();
		n.type = type;
		n.frequency.value = f;
		n.Q.value = q;
		return n;
	}
	function chain(...nodes) {
		for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
		return nodes[nodes.length - 1];
	}
	// A sine (or other wave) whose pitch falls from `from` to `to` (time constant `fall`)
	function drop(ctx, t, from, to, fall, type = 'sine') {
		const o = ctx.createOscillator();
		o.type = type;
		o.frequency.setValueAtTime(from, t);
		o.frequency.setTargetAtTime(to, t, fall);
		return o;
	}

	return {
		// Hats (the audition's Hat B and Open hat B)
		closed: { name: 'Hat (noise, tight)', rate: 44100, play(ctx, out, r) {
			const t = 0.005, d = 0.05, n = noise(ctx, 0.2, r);
			chain(n, filter(ctx, 'highpass', 8000, 0.8), filter(ctx, 'peaking', 11000, 1), hit(ctx, t, 0.9, d), out);
			n.start(t);
			return d + 0.05;
		} },
		open: { name: 'Open hat (noise)', rate: 44100, play(ctx, out, r) {
			const t = 0.005, d = 0.45, n = noise(ctx, 0.7, r);
			chain(n, filter(ctx, 'highpass', 7000, 0.8), filter(ctx, 'peaking', 10000, 1.2), hit(ctx, t, 0.8, d, 0.004), out);
			n.start(t);
			return d + 0.1;
		} },
		// Kicks
		sub: { name: 'Sub kick (long)', rate: 22050, play(ctx, out, r) {
			const t = 0.002, d = 1.3, o = drop(ctx, t, 160, 48, 0.03);
			const sat = ctx.createWaveShaper();
			sat.curve = Float32Array.from({ length: 1025 }, (_, i) => Math.tanh(2 * (i / 512 - 1)) / Math.tanh(2));
			chain(o, sat, hit(ctx, t, 0.9, d, 0.002), out);
			o.start(t); o.stop(t + d + 0.05);
			return d + 0.05;
		} },
		subclick: { name: 'Sub kick (with a click)', rate: 22050, play(ctx, out, r) {
			const t = 0.002, d = 1.1, o = drop(ctx, t, 220, 44, 0.02), n = noise(ctx, 0.05, r);
			chain(o, hit(ctx, t, 0.9, d, 0.002), out);
			chain(n, filter(ctx, 'bandpass', 3000, 0.8), hit(ctx, t, 0.5, 0.012), out);
			o.start(t); o.stop(t + d + 0.05); n.start(t);
			return d + 0.05;
		} },
		round: { name: 'Round kick (deep, shorter)', rate: 22050, play(ctx, out, r) {
			const t = 0.002, d = 0.55, o = drop(ctx, t, 130, 52, 0.04);
			const h = ctx.createOscillator(); h.frequency.value = 104; // a touch of the octave
			const hg = hit(ctx, t, 0.12, 0.2);
			chain(o, hit(ctx, t, 0.95, d, 0.003), out);
			chain(h, hg, out);
			o.start(t); o.stop(t + d + 0.05); h.start(t); h.stop(t + 0.3);
			return d + 0.05;
		} },
		// Toms and percussion (the Tom is slot 3's: the maintainer's pick, something melodic
		// or percussive rather than another snare or a hat)
		tom: { name: 'Tom (tuned)', rate: 22050, play(ctx, out, r) {
			const t = 0.002, d = 0.45, o = drop(ctx, t, 190, 125, 0.05), n = noise(ctx, 0.05, r);
			chain(o, hit(ctx, t, 0.9, d, 0.002), out);
			chain(n, filter(ctx, 'lowpass', 2500, 0.7), hit(ctx, t, 0.25, 0.02), out);
			o.start(t); o.stop(t + d + 0.05); n.start(t);
			return d + 0.05;
		} },
		conga: { name: 'Conga', rate: 22050, play(ctx, out, r) {
			const t = 0.002, d = 0.28, o = drop(ctx, t, 380, 310, 0.015);
			const o2 = drop(ctx, t, 760, 620, 0.015);
			chain(o, hit(ctx, t, 0.85, d, 0.001), out);
			chain(o2, hit(ctx, t, 0.15, 0.08), out);
			o.start(t); o.stop(t + d + 0.05); o2.start(t); o2.stop(t + 0.15);
			return d + 0.05;
		} },
		wood: { name: 'Wood block', rate: 44100, play(ctx, out, r) {
			const t = 0.002, d = 0.09, n = noise(ctx, 0.05, r);
			const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1180;
			chain(o, hit(ctx, t, 0.6, d, 0.0005), out);
			chain(n, filter(ctx, 'bandpass', 1180, 12), hit(ctx, t, 4, d), out);
			o.start(t); o.stop(t + d + 0.03); n.start(t);
			return d + 0.03;
		} },
		// Snares' kin and a shaker
		rim: { name: 'Rim', rate: 44100, play(ctx, out, r) {
			const t = 0.002, d = 0.04, n = noise(ctx, 0.05, r);
			const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1700;
			chain(o, hit(ctx, t, 0.7, d, 0.0005), out);
			chain(n, filter(ctx, 'bandpass', 3200, 2), hit(ctx, t, 1.5, 0.025), out);
			o.start(t); o.stop(t + d + 0.03); n.start(t);
			return d + 0.03;
		} },
		shaker: { name: 'Shaker', rate: 44100, play(ctx, out, r) {
			const t = 0.002, n = noise(ctx, 0.25, r);
			const g = ctx.createGain();
			g.gain.setValueAtTime(0, t);
			g.gain.linearRampToValueAtTime(0.7, t + 0.03);
			g.gain.setTargetAtTime(0, t + 0.03, 0.025);
			chain(n, filter(ctx, 'bandpass', 6500, 1.5), filter(ctx, 'highpass', 3500, 0.7), g, out);
			n.start(t);
			return 0.2;
		} },
		clap: { name: 'Clap', rate: 44100, play(ctx, out, r) {
			const t = 0.002, n = noise(ctx, 0.5, r), g = ctx.createGain();
			// Three quick bursts, then the tail
			g.gain.setValueAtTime(0, t);
			for (const k of [0, 1, 2]) {
				const s = t + k * 0.011;
				g.gain.setValueAtTime(0, s);
				g.gain.linearRampToValueAtTime(1, s + 0.001);
				g.gain.setTargetAtTime(0.1, s + 0.001, 0.003);
			}
			const s = t + 0.033;
			g.gain.setValueAtTime(0.1, s);
			g.gain.linearRampToValueAtTime(0.8, s + 0.001);
			g.gain.setTargetAtTime(0, s + 0.001, 0.045);
			chain(n, filter(ctx, 'bandpass', 1200, 1.1), filter(ctx, 'highpass', 600, 0.7), g, out);
			n.start(t);
			return 0.35;
		} },
	};
})();

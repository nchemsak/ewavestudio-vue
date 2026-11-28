// src/audio/drums.ts
// The Drums machine's voice (the plan's item 5), for the live engine and the export engine:
// four slots, each a recording of one hit (the frozen kit's, or a sound kept from Rhythm),
// played as a sampler plays it. Per slot: Tune (−12…+12 semitones: faster and higher, or slower
// and lower, as a sampler plays a key), Decay (how much of the hit plays, fading over its last
// part as a gate closing) and Level. A slot plays one hit at a time: a new hit on the same slot
// cuts the one before (5 ms), as a drum machine's voice retriggers.
//
// What a bar plays is worked out here too (`drumHitsForBar()`, pure, unit-tested), so both
// engines read a pattern the same way.

// The slots, and the kit's sounds: their ids (saved in projects as 'kit:<id>', so never renamed)
// in the order a slot's ◂ ▸ steps through them, and their names. Kick, Snare, Metal and Hat were
// the first kit (PR 119); the others came with PR 135 (the plan's item 17), and the factory
// slots moved to the Tom and the new Hat (`closed`), so the old Hat reads "Tin hat" now. Saved
// projects keep whatever their slots name.
export const DRUM_SLOTS = 4;
export const KIT_IDS = [
	'kick', 'sub', 'subclick', 'round',
	'snare', 'clap', 'rim',
	'tom', 'conga', 'wood', 'shaker',
	'closed', 'open',
	'metal', 'hat',
] as const;
export type KitId = (typeof KIT_IDS)[number];
export const KIT_NAMES: Record<KitId, string> = {
	kick: 'Kick', sub: 'Sub', subclick: 'Sub click', round: 'Round',
	snare: 'Snare', clap: 'Clap', rim: 'Rim',
	tom: 'Tom', conga: 'Conga', wood: 'Wood', shaker: 'Shaker',
	closed: 'Hat', open: 'Open hat',
	metal: 'Metal', hat: 'Tin hat',
};
// The kit sound each slot starts with (a fresh page, File → New, the Kit button) and falls back
// to (a kept sound deleted, or left out of a share link)
export const FACTORY_KIT: readonly KitId[] = ['kick', 'snare', 'tom', 'closed'];

export const DRUM_RANGES = { tune: [-12, 12], decay: [0.05, 1], level: [0, 1] } as const;

// The share of a shortened hit that fades out (Decay under 1), and the fade at full length
export const DRUM_DECAY_FADE = 0.35;
const FULL_FADE_S = 0.005;
const CUT_S = 0.005;

/** One slot's pattern: its steps and their velocities */
export type DrumRow = { steps: boolean[]; velocities: number[] };

// The pure parts START

const clamp = (x: number, [lo, hi]: readonly [number, number], d: number) =>
	(typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);

/** How a hit plays: its speed, how long it lasts and how long its fade is (seconds) */
export function drumHitShape(bufferSeconds: number, tune: number, decay: number) {
	const rate = 2 ** (clamp(tune, DRUM_RANGES.tune, 0) / 12);
	const d = clamp(decay, DRUM_RANGES.decay, 1);
	const full = bufferSeconds / rate;
	const seconds = Math.max(0.01, full * d);
	const fade = d >= 1 ? Math.min(FULL_FADE_S, seconds / 2) : Math.max(FULL_FADE_S, seconds * DRUM_DECAY_FADE);
	return { rate, seconds, fade };
}

/** A hit of a bar: which slot, on which step, when, how loud (before the slot's and machine's level) */
export type DrumHit = { slot: number; step: number; time: number; vel: number };

/**
 * Every hit of a bar on the context's clock, in time order: each row's steps that are on, at
 * their velocity, swing delaying every second step (as the other machines). `muted[slot]`
 * leaves a slot out.
 */
export function drumHitsForBar(rows: DrumRow[], muted: boolean[], n: number, barStart: number, stepS: number, swing: number): DrumHit[] {
	const hits: DrumHit[] = [];
	for (let step = 0; step < n; step++) {
		const time = barStart + step * stepS + (step % 2 === 1 ? stepS * swing : 0);
		rows.forEach((r, slot) => {
			if (muted[slot] || !r?.steps[step]) return;
			const vel = Math.max(0, Math.min(1, r.velocities[step] ?? 1));
			if (vel > 0) hits.push({ slot, step, time, vel });
		});
	}
	return hits;
}

// The pure parts END

// Playing START

export type DrumSounding = {
	end: number;
	cut: (at: number) => void;
};

/** Plays one hit of `buffer` at `time`, `amp` loud (its velocity × the slot's and the machine's
 * levels), into `out`; returns when it ends and a way to cut it short */
export function playDrumHit(ctx: BaseAudioContext, buffer: AudioBuffer,
	hit: { time: number; amp: number; tune: number; decay: number }, out: AudioNode[]): DrumSounding {
	const t = hit.time;
	const { rate, seconds, fade } = drumHitShape(buffer.duration, hit.tune, hit.decay);
	const src = ctx.createBufferSource();
	src.buffer = buffer;
	src.playbackRate.value = rate;
	const amp = Math.max(0, hit.amp);
	const env = ctx.createGain();
	env.gain.setValueAtTime(amp, t);
	env.gain.setValueAtTime(amp, t + seconds - fade);
	env.gain.linearRampToValueAtTime(0, t + seconds);
	const cutGain = ctx.createGain();
	src.connect(env).connect(cutGain);
	for (const o of out) cutGain.connect(o);
	src.start(t);
	src.stop(t + seconds + 0.01);
	src.onended = () => { try { cutGain.disconnect(); } catch { /* gone */ } };
	let end = t + seconds;
	return {
		get end() { return end; },
		cut(at: number) {
			if (at >= end) return;
			const from = Math.max(at, t);
			cutGain.gain.setValueAtTime(1, from);
			cutGain.gain.linearRampToValueAtTime(0, from + CUT_S);
			try { src.stop(from + CUT_S + 0.005); } catch { /* stopped */ }
			end = from + CUT_S;
		},
	};
}

// Playing END

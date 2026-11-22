// src/lib/driftView.ts
// What the Drift machine's swarm screen draws (pure, unit-tested): each held note of a bar as
// its voices, one line each, at the note's height (log in Hz), spread apart by Spread and
// wandering by Drift, faded in over Attack and out over Release (an envelope, dashed, and the
// lines' own fade). Time runs across: Attack, a bar held, Release.

import { swarmLayout, type DriftVoice } from '../audio/drift';
import { seededRandom } from './random';

export const VIEW_W = 400;
export const VIEW_H = 150;
// The screen's pitch axis
const LO_HZ = 120, HI_HZ = 700;
// How far apart the voices are drawn at full Spread, and how far they wander at full Drift (px):
// far wider than the cents they are, so they show
const SPREAD_PX = 9;
const DRIFT_PX = 7;

/** The time shown, in bars: Attack, one bar held, Release */
export function viewBars(v: Pick<DriftVoice, 'attack' | 'release'>) {
	const hold = 1;
	return { attack: v.attack, hold, release: v.release, total: v.attack + hold + v.release };
}

/** Where (0..1 across) the fade in ends and the fade out starts */
export function fadeStops(v: Pick<DriftVoice, 'attack' | 'release'>) {
	const b = viewBars(v);
	return { inEnd: b.attack / b.total, outStart: (b.attack + b.hold) / b.total };
}

/** A pitch's height on the screen (y, 0 at the top) */
export function pitchY(hz: number, h = VIEW_H): number {
	const t = Math.log(Math.max(LO_HZ, Math.min(HI_HZ, hz)) / LO_HZ) / Math.log(HI_HZ / LO_HZ);
	return h - 14 - t * (h - 28);
}

/** The level's envelope, dashed on the screen: up over Attack, held, down over Release */
export function envelopePath(v: Pick<DriftVoice, 'attack' | 'release'>, w = VIEW_W, h = VIEW_H): string {
	const { inEnd, outStart } = fadeStops(v);
	const top = 8, bottom = h - 2;
	return `M0 ${bottom} L${(inEnd * w).toFixed(1)} ${top} L${(outStart * w).toFixed(1)} ${top} L${w} ${bottom}`;
}

/** Each voice of each note, a line: `notes` the bar's pitches and their colours */
export function swarmLines(v: DriftVoice, notes: { hz: number; hue: number }[], w = VIEW_W, h = VIEW_H): { d: string; hue: number }[] {
	const n = Math.round(Math.max(3, Math.min(7, v.voices)));
	const lay = swarmLayout(n, v.spread);
	const random = seededRandom(17);
	const out: { d: string; hue: number }[] = [];
	for (const note of notes) {
		const base = pitchY(note.hz, h);
		lay.forEach((l, i) => {
			const phase = random() * Math.PI * 2, cycles = 1 + random() * 2.5;
			const off = (l.pan || 0) * SPREAD_PX;
			const amp = DRIFT_PX * Math.max(0, Math.min(1, v.drift)) * (0.5 + random() * 0.5) * (i % 2 ? -1 : 1);
			let d = '';
			for (let x = 0; x <= w; x += 8) {
				const y = base + off + Math.sin(phase + (x / w) * cycles * Math.PI * 2) * amp;
				d += `${x ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
			}
			out.push({ d, hue: note.hue });
		});
	}
	return out;
}
